import type { ChartPoint, ParsedLogSummary, QueryParamStat, TopError, TopIp, TopUrlPattern, TopUserAgent } from "./types";

// Base TServer line shape: "2026.07.16 13:35:23.996 Thread[main] <message>"
const EVENT_RE = /^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) Thread\[([^\]]*)\]\s?(.*)$/;

const DB_POOL_RE = /for server (.+?)\. Current pool size=(\d+)\. Free databases in pool=(\d+)/;
const MEMORY_RE = /freeMemory=\[(\d+)K\] totalMemory=\[(\d+)K\] maxMemory=\[(\d+)K\]/;
const THROWN_FROM_RE = /Thrown from ([^\n]+)/;
// Count every occurrence of the Java heap OOM signature (global flag).
const OOM_RE = /java\.lang\.OutOfMemoryError: Java heap space/g;
const ADMIN_PING_RE = /IP\[([^\]]+)\]\s*USERAGENT\[([^\]]+)\]/;
const NO_TRANS_INFO_RE =
  /clientIP=\[([^\]]*)\]\s*userAgent=\[([^\]]*)\]\s*hostHeader=\[([^\]]*)\]\s*referrer=\[([^\]]*)\]\s*Request Url=\[([^\]]*)\]/;
// Two high-volume proxied-request URL formats. Anchored to their method
// contexts so they don't collide with the lowercase `url=` inside the
// requestInfo=[...] block (handled below) or `Using driver=...url=jdbc:...`.
const COMPRESS_URL_RE = /Unable to compress content for url=(https?:\/\/.+?), so content was sent uncompressed/;
const RETRY_URL_RE = /getFromURL\(\): RETRY#\d+ (?:getting from|successful for) url=(https?:\/\/\S+)/;
const URL_DOMAIN_RE = /,urlDomain=([^,]*)/;
const URL_PATH_RE = /,urlPath=([^,]*)/;
const CLIENT_IP_RE = /,clientIP=([^,\]]*)/;
// Non-greedy: real User-Agent strings contain semicolons inside parentheses
// (e.g. "Mozilla/5.0 (iPhone; CPU..."), so stop only at the next "; key:="
// header pair or the closing "]" of the requestHeaders block — not the first ";".
const USER_AGENT_HEADER_RE = /user-agent:=([\s\S]*?)(?:; [\w-]+:=|\])/;

interface LogEvent {
  timestamp: string;
  time: number;
  thread: string;
  text: string;
}

function parseTimestamp(ts: string): number {
  const m = ts.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s, ms] = m.map(Number) as unknown as number[];
  return new Date(y, mo - 1, d, h, mi, s, ms).getTime();
}

function buildEvents(text: string): LogEvent[] {
  const events: LogEvent[] = [];
  let current: LogEvent | null = null;

  for (const line of text.split(/\r?\n/)) {
    const m = EVENT_RE.exec(line);
    if (m) {
      if (current) events.push(current);
      current = { timestamp: m[1], time: parseTimestamp(m[1]), thread: m[2], text: m[3] };
    } else if (current) {
      current.text += "\n" + line;
    }
  }
  if (current) events.push(current);
  return events.filter((e) => !Number.isNaN(e.time));
}

function stripQueryToHostPath(url: string): string | null {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    const withoutQuery = url.split(/[?#]/)[0];
    const withoutProtocol = withoutQuery.replace(/^https?:\/\//, "");
    return withoutProtocol || null;
  }
}

function topN<K extends string>(counts: Map<K, number>, n: number): { key: K; count: number }[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function incr<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function parseLog(text: string, fileName: string): ParsedLogSummary {
  // Sort chronologically — real TServer logs are append-only in order, but
  // don't assume it (e.g. merged/concatenated files): bucketing and timespan
  // below both rely on events[0]/events[last] being the true min/max time.
  const events = buildEvents(text).sort((a, b) => a.time - b.time);

  const dbPoolByServer = new Map<string, { time: number; poolSize: number; free: number }[]>();
  const memoryPoints: { time: number; usedPct: number }[] = [];

  const errorCounts = new Map<string, { count: number; firstSeen: string; lastSeen: string; sample: string }>();
  const ipCounts = new Map<string, number>();
  const uaCounts = new Map<string, number>();
  const urlCounts = new Map<string, number>();
  const paramOccurrences = new Map<string, number>();
  const paramValues = new Map<string, Set<string>>();
  const oomPoints: { time: number; count: number }[] = [];
  let oomTotal = 0;

  // Record a full proxied-request URL: count its host+path pattern, and tally
  // each query param's occurrences and distinct values (cache-key cardinality).
  const recordUrl = (fullUrl: string) => {
    const pattern = stripQueryToHostPath(fullUrl);
    if (pattern) incr(urlCounts, pattern);

    const q = fullUrl.split("?").slice(1).join("?");
    if (!q) return;
    for (const pair of q.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? "" : pair.slice(eq + 1);
      if (!name) continue;
      incr(paramOccurrences, name);
      let set = paramValues.get(name);
      if (!set) {
        set = new Set<string>();
        paramValues.set(name, set);
      }
      set.add(value);
    }
  };

  for (const e of events) {
    // Count OOM occurrences in this event (including any continuation/stack-trace
    // lines buffered into e.text). Attributed to the event's time bucket.
    const oomInEvent = (e.text.match(OOM_RE) || []).length;
    if (oomInEvent > 0) {
      oomTotal += oomInEvent;
      oomPoints.push({ time: e.time, count: oomInEvent });
    }

    const dbPoolMatch = DB_POOL_RE.exec(e.text);
    if (dbPoolMatch) {
      const server = dbPoolMatch[1];
      const list = dbPoolByServer.get(server) ?? [];
      list.push({ time: e.time, poolSize: Number(dbPoolMatch[2]), free: Number(dbPoolMatch[3]) });
      dbPoolByServer.set(server, list);
    }

    const memMatch = MEMORY_RE.exec(e.text);
    if (memMatch) {
      const freeK = Number(memMatch[1]);
      const totalK = Number(memMatch[2]);
      const maxK = Number(memMatch[3]);
      const usedPct = maxK > 0 ? ((totalK - freeK) / maxK) * 100 : null;
      if (usedPct !== null) memoryPoints.push({ time: e.time, usedPct });
    }

    const thrownMatch = THROWN_FROM_RE.exec(e.text);
    if (thrownMatch) {
      const type = thrownMatch[1].trim().replace(/\.$/, "");
      const continuationLines = e.text.slice(thrownMatch[0].length).split("\n").map((l) => l.trim()).filter(Boolean);
      const sample = continuationLines[0] || thrownMatch[0];
      const existing = errorCounts.get(type);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = e.timestamp;
      } else {
        errorCounts.set(type, { count: 1, firstSeen: e.timestamp, lastSeen: e.timestamp, sample });
      }
    }

    // Proxied-request URLs — the high-volume traffic signal (translation
    // fetches, retries) that carries full query strings for cache analysis.
    const compressMatch = COMPRESS_URL_RE.exec(e.text);
    if (compressMatch) recordUrl(compressMatch[1]);
    const retryMatch = RETRY_URL_RE.exec(e.text);
    if (retryMatch) recordUrl(retryMatch[1]);

    // Admin config-reload ping: IP + User-Agent only, no URL.
    const adminMatch = ADMIN_PING_RE.exec(e.text);
    if (adminMatch) {
      incr(ipCounts, adminMatch[1]);
      incr(uaCounts, adminMatch[2]);
    }

    // NoTranslationInfoException: bracket-wrapped clientIP/userAgent/hostHeader/Request Url.
    const noTransMatch = NO_TRANS_INFO_RE.exec(e.text);
    if (noTransMatch) {
      const [, ip, ua, , , requestUrl] = noTransMatch;
      if (ip && ip !== "null") incr(ipCounts, ip);
      if (ua && ua !== "null") incr(uaCounts, ua);
      if (requestUrl && requestUrl !== "null") {
        const pattern = stripQueryToHostPath(requestUrl);
        if (pattern) incr(urlCounts, pattern);
      }
    }

    // InvalidTranslationInfoException: requestInfo=[...urlDomain=...,urlPath=...,clientIP=...] + requestHeaders=[...;user-agent:=...;...]
    const urlDomainMatch = URL_DOMAIN_RE.exec(e.text);
    const urlPathMatch = URL_PATH_RE.exec(e.text);
    if (urlDomainMatch && urlPathMatch) {
      const pattern = `${urlDomainMatch[1]}${urlPathMatch[1]}`;
      incr(urlCounts, pattern);
    }
    const clientIpMatch = CLIENT_IP_RE.exec(e.text);
    if (clientIpMatch && clientIpMatch[1] && clientIpMatch[1] !== "null") {
      incr(ipCounts, clientIpMatch[1]);
    }
    const uaHeaderMatch = USER_AGENT_HEADER_RE.exec(e.text);
    if (uaHeaderMatch && uaHeaderMatch[1] && uaHeaderMatch[1] !== "null") {
      incr(uaCounts, uaHeaderMatch[1].trim());
    }
  }

  // Pick the dominant DB pool server (most events) as the canonical series.
  let dbPoolServerName: string | null = null;
  let dbPoolSeries: { time: number; poolSize: number; free: number }[] = [];
  for (const [server, series] of dbPoolByServer) {
    if (series.length > dbPoolSeries.length) {
      dbPoolServerName = server;
      dbPoolSeries = series;
    }
  }

  const chartPoints = computeChartPoints(events, dbPoolSeries, memoryPoints, oomPoints);

  const dbPoolLeakSuspected =
    dbPoolSeries.length > 1 &&
    dbPoolSeries.every((p, i) => i === 0 || p.poolSize >= dbPoolSeries[i - 1].poolSize) &&
    dbPoolSeries[dbPoolSeries.length - 1].free === 0;

  const topErrors: TopError[] = [...errorCounts.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const topIps: TopIp[] = topN(ipCounts, 10).map(({ key, count }) => ({ ip: key, count }));
  const topUserAgents: TopUserAgent[] = topN(uaCounts, 10).map(({ key, count }) => ({ userAgent: key, count }));
  const topUrlPatterns: TopUrlPattern[] = topN(urlCounts, 15).map(({ key, count }) => ({ pattern: key, count }));

  // Query params ranked by distinct-value count — the cache-key cardinality
  // signal. A param with many distinct values fragments the cache (each unique
  // value is a separate cache entry), so those are the cache-optimization targets.
  const queryParams: QueryParamStat[] = [...paramOccurrences.entries()]
    .map(([name, occurrences]) => ({ name, occurrences, distinctValues: paramValues.get(name)?.size ?? 0 }))
    .sort((a, b) => b.distinctValues - a.distinctValues || b.occurrences - a.occurrences)
    .slice(0, 15);
  const cacheFragmentationSuspected = queryParams.some((p) => p.distinctValues >= 10);

  const peakDbPoolSize = dbPoolSeries.reduce((max, p) => Math.max(max, p.poolSize), 0);
  const peakThreadCount = chartPoints.reduce((max, p) => Math.max(max, p.threadCount), 0);
  const minFreeMemoryPct =
    memoryPoints.length > 0 ? 100 - Math.max(...memoryPoints.map((p) => p.usedPct)) : null;

  return {
    fileName,
    lineCount: text.split(/\r?\n/).length,
    timespan:
      events.length > 0
        ? { start: events[0].timestamp, end: events[events.length - 1].timestamp }
        : null,
    chartPoints,
    dbPoolServerName,
    topErrors,
    topIps,
    topUserAgents,
    topUrlPatterns,
    queryParams,
    flags: {
      dbPoolLeakSuspected,
      oomDetected: oomTotal > 0,
      oomTotal,
      cacheFragmentationSuspected,
      peakDbPoolSize,
      peakThreadCount,
      minFreeMemoryPct,
      totalExceptions: [...errorCounts.values()].reduce((sum, e) => sum + e.count, 0),
      distinctErrorTypes: errorCounts.size,
    },
  };
}

function computeChartPoints(
  events: LogEvent[],
  dbPoolSeries: { time: number; poolSize: number }[],
  memorySeries: { time: number; usedPct: number }[],
  oomSeries: { time: number; count: number }[]
): ChartPoint[] {
  if (events.length === 0) return [];

  const minTime = events[0].time;
  const maxTime = events[events.length - 1].time;
  const span = Math.max(maxTime - minTime, 1);
  const targetBuckets = 40;
  const bucketMs = Math.max(span / targetBuckets, 1000);
  const bucketCount = Math.min(Math.ceil(span / bucketMs) + 1, 200);

  const bucketThreadSets: Set<string>[] = Array.from({ length: bucketCount }, () => new Set());
  for (const e of events) {
    const idx = Math.min(Math.floor((e.time - minTime) / bucketMs), bucketCount - 1);
    bucketThreadSets[idx].add(e.thread);
  }

  // Sum OOM occurrences into their time bucket (spike-in-window, not cumulative).
  const bucketOomCounts: number[] = new Array(bucketCount).fill(0);
  for (const o of oomSeries) {
    const idx = Math.min(Math.floor((o.time - minTime) / bucketMs), bucketCount - 1);
    bucketOomCounts[idx] += o.count;
  }

  const sortedDbPool = [...dbPoolSeries].sort((a, b) => a.time - b.time);
  const sortedMemory = [...memorySeries].sort((a, b) => a.time - b.time);

  const points: ChartPoint[] = [];
  let dbIdx = 0;
  let memIdx = 0;
  let lastDbPool = 0;
  let lastMemPct: number | null = null;

  for (let i = 0; i < bucketCount; i++) {
    const bucketEnd = minTime + (i + 1) * bucketMs;
    while (dbIdx < sortedDbPool.length && sortedDbPool[dbIdx].time < bucketEnd) {
      lastDbPool = sortedDbPool[dbIdx].poolSize;
      dbIdx++;
    }
    while (memIdx < sortedMemory.length && sortedMemory[memIdx].time < bucketEnd) {
      lastMemPct = sortedMemory[memIdx].usedPct;
      memIdx++;
    }
    points.push({
      time: minTime + i * bucketMs,
      threadCount: bucketThreadSets[i].size,
      dbPoolSize: lastDbPool,
      memoryUsedPct: lastMemPct,
      oomCount: bucketOomCounts[i],
    });
  }

  return points;
}
