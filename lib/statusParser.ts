import type {
  CacheKeyParam,
  CacheRollup,
  CacheStat,
  EhCacheStat,
  HttpCacheEntry,
  HttpCacheUrlRollup,
  InstanceSeries,
  MemoryArea,
  MemoryPoolStat,
  PendingRequest,
  PendingRequestOccurrence,
  SslErrorHost,
  StaticCacheStat,
  StatusAnalysis,
  StatusPromptPayload,
  StatusSeriesPoint,
  StatusSnapshot,
  TransformStat,
  ValueGroup,
} from "./types";

// ── Thresholds ───────────────────────────────────────────────────────────────
// Deliberately conservative: these drive red badges in the UI and get handed to
// Claude as booleans, so a trigger should mean something is actually wrong.

/** Heap used/max at or above this is called out as pressure. */
const HEAP_PRESSURE_PCT = 85;
/** >5s of GC per wall-clock minute is ~8% of the interval spent collecting. */
const GC_MS_PER_MIN_PRESSURE = 5000;
/** A page/plugin request still running this long is worth a look. */
const STUCK_REQUEST_MS = 2000;
/** Below this a cache is doing more harm (memory) than good (hits). */
const LOW_HIT_RATIO_PCT = 50;
/** Ignore hit ratios for near-empty caches — 0% over 1 entry is noise. */
const LOW_HIT_RATIO_MIN_ENTRIES = 100;
/** Leased/max above this, or any pending, means the client pool is squeezed. */
const CONN_POOL_SATURATION_RATIO = 0.8;

/** Transforms slower than this are surfaced as the slow list. */
const SLOW_TRANSFORM_MS = 50;

const MAX_HTTP_CACHE_URLS = 250;
const MAX_CACHE_KEY_PARAMS = 40;
const MAX_PENDING_REQUESTS = 60;
const MAX_TRANSFORMS = 60;
const MAX_HOT_FRAMES = 15;

// ── Section markers ──────────────────────────────────────────────────────────
// The dump is a flat stream of <b>Label:</b>value<br> with no nesting, so sections
// are delimited purely by these labels appearing in order. Slicing on them keeps
// like-shaped lines apart — "HTTP PAGE CACHE:" and "MAIN SEGMENT CACHE:" parse with
// the same regex but belong to different sections.
const SECTION_MARKERS = [
  "Server Activity:",
  "Total Errors:",
  "Interval Errors:",
  "Pending Page/plugin Requests:",
  "System Stats:",
  "Java Version:",
  "JVM Name:",
  "Initialization Params:",
  "ApacheHttpClientNg2 Connection Pool Stats:",
  "Cache Stats:",
  "EhCache Stats:",
  "HTTP Cache Stats:",
  "Static Cache Stats:",
  "Transformation Stats:",
  "******** ThreadGroup=",
] as const;

// ── Small helpers ────────────────────────────────────────────────────────────

/** Parse a possibly comma-grouped number ("98,311", "3,357"). Null when absent. */
function num(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Same, but for places where a missing value should read as zero. */
function num0(raw: string | undefined | null): number {
  return num(raw) ?? 0;
}

function match1(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1] : null;
}

function incr(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topN<T>(items: T[], n: number, score: (t: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, n);
}

/**
 * Flatten the dump's pseudo-HTML into plain text.
 *
 * The markup is not well-formed (unclosed <font>/<body>, <p> used as a separator
 * rather than a container), so DOMParser gives inconsistent results across the
 * sections we care about. Everything meaningful is `<b>Label:</b>value` separated
 * by <br>/<p>, so a targeted flatten is both simpler and more predictable — and it
 * matches how lib/logParser.ts works on raw text.
 */
function normalize(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p\s*\/?>/gi, "\n")
    .replace(/<\/?b>/gi, "")
    .replace(/<\/?(?:html|body|font|center|hr)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Text between `marker` and whichever later marker comes first. Returns "" when the
 * section is absent — every section is optional, since dumps vary by server version.
 */
function section(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const from = start + marker.length;
  let end = text.length;
  for (const other of SECTION_MARKERS) {
    const i = text.indexOf(other, from);
    if (i >= 0 && i < end) end = i;
  }
  return text.slice(from, end);
}

/** Cut the trailing legal boilerplate so it never lands inside the last thread's stack. */
function stripFooter(text: string): string {
  const i = text.search(/Copyright\W{0,3}\s*\d{4}\s*-\s*\d{4}\s+MotionPoint/i);
  return i >= 0 ? text.slice(0, i) : text;
}

// ── Timestamps ───────────────────────────────────────────────────────────────

/**
 * The dump carries its own `UTC Time`, so files are self-describing and the archive
 * filename is only a fallback. Fractional seconds are microsecond-precision here
 * (…53.945835Z); trim to milliseconds so Date.parse is well-defined everywhere.
 */
function parseSnapshotTime(utcTime: string | null, fileName: string): number {
  if (utcTime) {
    const trimmed = utcTime.replace(/(\.\d{3})\d+/, "$1");
    const t = Date.parse(trimmed);
    if (Number.isFinite(t)) return t;
  }
  // Poller archives are named <runid>.html, e.g. 20260813T124855Z.html
  const m = fileName.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

// ── Section parsers ──────────────────────────────────────────────────────────

const CACHE_RE =
  /^(.+?): HitRatio=([\d.]+)% Entries=([\d,]+) SoftEntries=([\d,]+) DataSize=([\d.,]+)MB SoftDataSize=([\d.,]+)MB LRUSweeps=([\d,]+) LRUEvictions=([\d,]+)(?: Memory\(Available\/Total\)=([\d,]+)MB\/([\d,]+)MB)?/;

function parseCacheLines(text: string): CacheStat[] {
  const out: CacheStat[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(CACHE_RE);
    if (!m) continue;
    out.push({
      name: m[1].trim(),
      hitRatio: num(m[2]),
      entries: num0(m[3]),
      softEntries: num0(m[4]),
      dataSizeMb: num0(m[5]),
      softDataSizeMb: num0(m[6]),
      lruSweeps: num0(m[7]),
      lruEvictions: num0(m[8]),
      memAvailableMb: num(m[9]),
      memTotalMb: num(m[10]),
    });
  }
  return out;
}

/**
 * Each EhCache line is `{"<name>":{…}} **** CacheExpiry{…}` — a JSON object whose
 * single key is the cache name, with the expiry policy appended outside the JSON.
 */
function parseEhCaches(text: string): EhCacheStat[] {
  const out: EhCacheStat[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    const [jsonPart, expiryPart = ""] = trimmed.split(" **** ");
    try {
      const parsed = JSON.parse(jsonPart) as Record<string, Record<string, number>>;
      for (const [name, s] of Object.entries(parsed)) {
        out.push({
          name,
          gets: s.gets ?? 0,
          hits: s.hits ?? 0,
          misses: s.misses ?? 0,
          hitPercentage: s.hitPercentage ?? 0,
          puts: s.puts ?? 0,
          evictions: s.evictions ?? 0,
          expirations: s.expirations ?? 0,
          onHeapBytes: s.onHeapOccupiedByteSize ?? 0,
          offHeapBytes: s.offHeapOccupiedByteSize ?? 0,
          creationExpiry: match1(expiryPart, /creationExpiry='([^']*)'/),
        });
      }
    } catch {
      // A malformed line shouldn't lose the rest of the section.
    }
  }
  return out;
}

const HTTP_CACHE_ENTRY_RE =
  /^(.*?) \[AccessCount=(\d+) LastAccess=(.*?) Expiration=(.*?) ETag=(.*?) LastModified=(.*?)\]$/;

function parseHttpCacheEntries(text: string): HttpCacheEntry[] {
  const out: HttpCacheEntry[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(HTTP_CACHE_ENTRY_RE);
    if (!m) continue;
    const nullable = (v: string) => (v === "null" || v === "" ? null : v);
    out.push({
      url: m[1].trim(),
      accessCount: num0(m[2]),
      lastAccess: nullable(m[3].trim()),
      expiration: nullable(m[4].trim()),
      etag: nullable(m[5].trim()),
      lastModified: nullable(m[6].trim()),
    });
  }
  return out;
}

const TRANSFORM_RE = /^Id=(\d+) matches=(\d+) executions=(\d+) avrg=(\d+)msec max=(\d+)msec/;
const TRANSFORM_DEAD_RE = /^Id=(\d+) condition never matched/;

function parseTransforms(text: string): { transforms: TransformStat[]; neverMatched: string[] } {
  const transforms: TransformStat[] = [];
  const neverMatched: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const m = trimmed.match(TRANSFORM_RE);
    if (m) {
      transforms.push({
        id: m[1],
        matches: num0(m[2]),
        executions: num0(m[3]),
        avgMs: num0(m[4]),
        maxMs: num0(m[5]),
      });
      continue;
    }
    const dead = trimmed.match(TRANSFORM_DEAD_RE);
    if (dead) neverMatched.push(dead[1]);
  }
  return { transforms, neverMatched };
}

const PENDING_RE =
  /^RequestID=(\d+) Thread=(\d+) Thread\[([^\]]*)\] \(elapsed=(\d+)msec\) (\S+) (\S+) TransformID=(\S*)/;

const MEMORY_POOL_RE =
  /^(.*?)\.{2,}\s*type=(\S+) init=(\d+)MB used=(\d+)MB peakUsed=(\d+)MB available=(\d+)MB committed=(\d+)MB peakCommitted=(\d+)MB max=(\d+)MB/;

function parseMemoryArea(text: string, label: string): MemoryArea | null {
  const re = new RegExp(
    `^${label}\\.*\\s+init=(\\d+)MB used=(\\d+)MB available=(\\d+)MB committed=(\\d+)MB max=(\\d+)MB`,
    "m"
  );
  const m = text.match(re);
  if (!m) return null;
  return {
    initMb: num(m[1]),
    usedMb: num(m[2]),
    availableMb: num(m[3]),
    committedMb: num(m[4]),
    maxMb: num(m[5]),
  };
}

interface DumpedThread {
  state: string | null;
  type: string | null;
  stack: string[];
}

// The terminator uses (?![\s\S]) rather than $ for end-of-input: the `m` flag makes $
// match at every line break, which would cut every stack off after its first frame.
const THREAD_RE =
  /^Thread=(\d+) Thread\[([^\]]*)\] Type=(\S+) State=(\w+)\s*\nStack Trace:\s*\n?([\s\S]*?)(?=\nThread=\d+ Thread\[|\n\*{4,} ThreadGroup=|(?![\s\S]))/gm;

/**
 * Index the thread dump by thread number so pending requests can be joined to their
 * stacks. Full stacks are returned for every thread here, but the caller keeps only
 * the pending ones — retaining ~110 stacks × N snapshots would dwarf everything else
 * in the model for no analytical gain.
 */
function parseThreadDump(text: string): {
  threads: Map<string, DumpedThread>;
  byState: Record<string, number>;
  groups: { name: string; count: number }[];
  total: number;
} {
  const threads = new Map<string, DumpedThread>();
  const byState: Record<string, number> = {};

  for (const m of text.matchAll(THREAD_RE)) {
    const [, threadNum, , type, state, rawStack] = m;
    const stack = rawStack
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("****"));
    threads.set(threadNum, { state, type, stack });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  const groups: { name: string; count: number }[] = [];
  for (const g of text.matchAll(/\*{4,} ThreadGroup=(\S+?)\[name=([^,\]]+)[^\]]*\] No\. Threads=(\d+)/g)) {
    groups.push({ name: g[2], count: num0(g[3]) });
  }

  return { threads, byState, groups, total: threads.size };
}

// ── Single-dump parser ───────────────────────────────────────────────────────

/**
 * Parse one status dump. Every section is optional: a dump from a different server
 * version may omit any of them, and a half-parsed snapshot is far more useful than a
 * thrown error that discards the whole upload.
 */
export function parseStatusDump(html: string, fileName: string): StatusSnapshot {
  const text = stripFooter(normalize(html));

  // ── Header block (everything before the first section marker) ──
  const version = match1(text, /^Version:\s*(.+)$/m);
  const instanceId = match1(text, /^Id:\s*(\d+)/m) ?? "unknown";
  // Anchored to the Id line — a bare /Name:/ would also hit "JVM Name:" further down.
  const instanceName = match1(text, /^Id:\s*\d+\s+Name:\s*(\S+)/m);
  const sourceLang = match1(text, /Source Lan:\s*(\S+)/);
  const targetLang = match1(text, /Target Lan:\s*(\S+)/);
  // Properties Hash is a signed Java hashCode — it is routinely negative.
  const propertiesHash = match1(text, /Properties Hash:\s*(-?\d+)/);
  const propertiesVersion = match1(text, /Properties Version:\s*(\d+)/);
  const excludesRaw = match1(text, /Excludes:\s*\[([^\]]*)\]/);
  const excludes = excludesRaw ? excludesRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const fetchedAtUtc = match1(text, /UTC Time:\s*(\S+)/);
  const serverTime = match1(text, /Server Time:\s*(.+)$/m);

  // ── Server Activity ──
  const activity = section(text, "Server Activity:");
  const startTime = match1(activity, /Start time:\s*(.+)$/m);
  const vmRuntimeHrs = num(match1(activity, /VM RunTime:\s*([\d.]+)hrs/));
  const completedRaw = activity.match(
    /Completed Requests: total=(\d+); page=(\d+) file=(\d+) plugin=(\d+); ssl=(\d+) non-ssl=(\d+)/
  );
  const loadRaw = activity.match(
    /Load \(requests\/second\): page=([\d.]+) file=([\d.]+) plugin=([\d.]+) total=([\d.]+)/
  );
  const respRaw = activity.match(
    /Average Response Time \(seconds\): page=([\d.]+) file=([\d.]+) plugin=([\d.]+)/
  );

  // ── Total Errors (cumulative since this instance started) ──
  const totalErrText = section(text, "Total Errors:");
  const pagePluginErr = totalErrText.match(/Page\/plugin=(\d+) file=(\d+); ssl=(\d+) non-ssl=(\d+)/);
  const connErr = totalErrText.match(/Connection: total=(\d+) \(([\d.]+)%\)/);
  const sslErrorHosts: SslErrorHost[] = [];
  for (const m of totalErrText.matchAll(/^(\S+) (\d+) \(([\d.]+)%\)$/gm)) {
    sslErrorHosts.push({ host: m[1], count: num0(m[2]), pct: num(m[3]) });
  }

  // ── Interval Errors (the server's rolling window; length varies per snapshot) ──
  const intervalText = section(text, "Interval Errors:");
  const intervalTotal = intervalText.match(/Total requests: (\d+) in (\d+)min/);
  const intervalErrors = intervalText.trim()
    ? {
        totalRequests: num(intervalTotal?.[1]),
        windowMin: num(intervalTotal?.[2]),
        connection: num(match1(intervalText, /Connection: (\d+)/)),
        connectionPct: num(match1(intervalText, /Connection: \d+ \(([\d.]+)%\)/)),
        database: num(match1(intervalText, /Database: (\d+)/)),
        oom: num(match1(intervalText, /OutofMemory: (\d+)/)),
        other: num(match1(intervalText, /Other: (\d+)/)),
      }
    : null;

  // ── Pending requests ──
  const pendingText = section(text, "Pending Page/plugin Requests:");
  const pendingRaw: Omit<PendingRequest, "state" | "type" | "stack">[] = [];
  for (const line of pendingText.split("\n")) {
    const m = line.trim().match(PENDING_RE);
    if (!m) continue;
    pendingRaw.push({
      requestId: m[1],
      threadNum: m[2],
      threadName: m[3],
      elapsedMs: num0(m[4]),
      method: m[5],
      url: m[6],
      transformId: m[7] || "N/A",
    });
  }

  // ── System stats ──
  const sys = section(text, "System Stats:");
  const heap = parseMemoryArea(sys, "Heap Memory");
  const nonHeap = parseMemoryArea(sys, "Non Heap Memory");
  const memoryPools: MemoryPoolStat[] = [];
  for (const line of sys.split("\n")) {
    const m = line.trim().match(MEMORY_POOL_RE);
    if (!m) continue;
    memoryPools.push({
      name: m[1].replace(/\s+memory$/i, "").trim(),
      type: m[2],
      initMb: num(m[3]),
      usedMb: num(m[4]),
      peakUsedMb: num(m[5]),
      availableMb: num(m[6]),
      committedMb: num(m[7]),
      peakCommittedMb: num(m[8]),
      maxMb: num(m[9]),
    });
  }
  const osPhysical = sys.match(/OS Physical Memory\.*\s*total=(\d+)MB free=(\d+)MB/);
  const osSwap = sys.match(/OS Swap Memory Space\.*\s*total=(\d+)MB free=(\d+)MB/);
  const gcRaw = sys.match(/total GCs=(\d+) totalCollectionTime\(ms\)=(\d+)/);
  const threadsRaw = sys.match(/Threads\.*\s*current=(\d+) peak=(\d+) daemon=(\d+)/);

  // ── JVM identity + startup params ──
  const javaVersion = match1(text, /^Java Version:\s*(.+)$/m);
  const jvmName = match1(text, /^JVM Name:\s*(.+)$/m);
  const initParams = section(text, "Initialization Params:");
  const catalinaBase = match1(initParams, /-Dcatalina\.base=(\S+)/);
  const xmxRaw = initParams.match(/-Xmx(\d+)([mMgG])/);
  const xmxMb = xmxRaw ? num0(xmxRaw[1]) * (/[gG]/.test(xmxRaw[2]) ? 1024 : 1) : null;

  // ── Outbound HTTP client pool ──
  const poolRaw = section(text, "ApacheHttpClientNg2 Connection Pool Stats:").match(
    /\[leased: (\d+); pending: (\d+); available: (\d+); max: (\d+)\]/
  );

  // ── Caches ──
  const cacheText = section(text, "Cache Stats:");
  const lastFullClearCache = match1(cacheText, /Last full clear cache:\s*(.+)$/m);
  const caches = parseCacheLines(cacheText);
  const ehCaches = parseEhCaches(section(text, "EhCache Stats:"));

  const httpCacheText = section(text, "HTTP Cache Stats:");
  const httpCacheSummaries = parseCacheLines(httpCacheText);
  const httpCacheEntries = parseHttpCacheEntries(httpCacheText);

  const staticCaches: StaticCacheStat[] = [];
  for (const m of section(text, "Static Cache Stats:").matchAll(
    /^(.+?): Entries=([\d,]+) DataSize=([\d.,]+)MB/gm
  )) {
    staticCaches.push({ name: m[1].trim(), entries: num0(m[2]), dataSizeMb: num0(m[3]) });
  }

  // ── Transformations ──
  const transformText = section(text, "Transformation Stats:");
  const { transforms, neverMatched } = parseTransforms(transformText);
  const transformRuntimeHrs = num(match1(transformText, /RunTime:\s*([\d.]+)hrs/));

  // ── Thread dump, joined to the pending requests ──
  const dumpStart = text.indexOf("******** ThreadGroup=");
  const dump = parseThreadDump(dumpStart >= 0 ? text.slice(dumpStart) : "");
  const pendingRequests: PendingRequest[] = pendingRaw.map((p) => {
    const t = dump.threads.get(p.threadNum);
    return { ...p, state: t?.state ?? null, type: t?.type ?? null, stack: t?.stack ?? [] };
  });

  return {
    fileName,
    instanceId,
    instanceName,
    version,
    sourceLang,
    targetLang,
    propertiesHash,
    propertiesVersion,
    excludes,
    fetchedAtUtc,
    time: parseSnapshotTime(fetchedAtUtc, fileName),
    serverTime,
    startTime,
    vmRuntimeHrs,
    javaVersion,
    jvmName,
    catalinaBase,
    xmxMb,
    completed: {
      total: num(completedRaw?.[1]),
      page: num(completedRaw?.[2]),
      file: num(completedRaw?.[3]),
      plugin: num(completedRaw?.[4]),
      ssl: num(completedRaw?.[5]),
      nonSsl: num(completedRaw?.[6]),
    },
    load: {
      page: num(loadRaw?.[1]),
      file: num(loadRaw?.[2]),
      plugin: num(loadRaw?.[3]),
      total: num(loadRaw?.[4]),
    },
    avgResponse: {
      page: num(respRaw?.[1]),
      file: num(respRaw?.[2]),
      plugin: num(respRaw?.[3]),
    },
    totalErrors: {
      pagePlugin: num(pagePluginErr?.[1]),
      file: num(pagePluginErr?.[2]),
      ssl: num(pagePluginErr?.[3]),
      nonSsl: num(pagePluginErr?.[4]),
      connectionTotal: num(connErr?.[1]),
      connectionPct: num(connErr?.[2]),
    },
    sslErrorHosts,
    intervalErrors,
    pendingRequests,
    heap,
    nonHeap,
    memoryPools,
    os: osPhysical || osSwap
      ? {
          physicalTotalMb: num(osPhysical?.[1]),
          physicalFreeMb: num(osPhysical?.[2]),
          swapTotalMb: num(osSwap?.[1]),
          swapFreeMb: num(osSwap?.[2]),
        }
      : null,
    gc: gcRaw ? { collections: num0(gcRaw[1]), collectionTimeMs: num0(gcRaw[2]) } : null,
    threads: threadsRaw
      ? { current: num(threadsRaw[1]), peak: num(threadsRaw[2]), daemon: num(threadsRaw[3]) }
      : null,
    httpClientPool: poolRaw
      ? {
          leased: num0(poolRaw[1]),
          pending: num0(poolRaw[2]),
          available: num0(poolRaw[3]),
          max: num0(poolRaw[4]),
        }
      : null,
    lastFullClearCache,
    caches,
    ehCaches,
    httpPageCache: httpCacheSummaries[0] ?? null,
    httpCacheEntries,
    staticCaches,
    transformRuntimeHrs,
    transforms,
    neverMatchedTransformIds: neverMatched,
    threadDump: { total: dump.total, byState: dump.byState, groups: dump.groups },
  };
}

// ── Merge ────────────────────────────────────────────────────────────────────

function findCache(snapshot: StatusSnapshot, name: string): CacheStat | undefined {
  return snapshot.caches.find((c) => c.name === name);
}

function toPoint(s: StatusSnapshot, instanceKey: string): StatusSeriesPoint {
  const heapUsed = s.heap?.usedMb ?? null;
  const heapMax = s.heap?.maxMb ?? null;

  // "Total requests: 35369 in 35min" → requests per second over that window. The
  // window is the server's own rolling counter, not the poll interval, and it is
  // neither fixed nor capped — 1 to 100 minutes has been observed.
  const ivTotal = s.intervalErrors?.totalRequests ?? null;
  const ivWindow = s.intervalErrors?.windowMin ?? null;
  const intervalRps = ivTotal !== null && ivWindow !== null && ivWindow > 0 ? ivTotal / (ivWindow * 60) : null;
  return {
    time: s.time,
    fileName: s.fileName,
    instanceId: s.instanceId,
    instanceKey,
    startTime: s.startTime,
    heapUsedMb: heapUsed,
    heapAvailableMb: s.heap?.availableMb ?? null,
    heapMaxMb: heapMax,
    heapUsedPct: heapUsed !== null && heapMax ? (heapUsed / heapMax) * 100 : null,
    threadCount: s.threads?.current ?? null,
    gcCollections: s.gc?.collections ?? null,
    gcTimeMs: s.gc?.collectionTimeMs ?? null,
    completedTotal: s.completed.total,
    rps: s.load.total,
    intervalRps,
    intervalWindowMin: ivWindow,
    avgRespPage: s.avgResponse.page,
    pendingCount: s.pendingRequests.length,
    connLeased: s.httpClientPool?.leased ?? null,
    connPending: s.httpClientPool?.pending ?? null,
    connAvailable: s.httpClientPool?.available ?? null,
    intervalConnErrors: s.intervalErrors?.connection ?? null,
    intervalDbErrors: s.intervalErrors?.database ?? null,
    intervalOom: s.intervalErrors?.oom ?? null,
    intervalOther: s.intervalErrors?.other ?? null,
    mainSegmentHitRatio: findCache(s, "MAIN SEGMENT CACHE")?.hitRatio ?? null,
    httpPageHitRatio: s.httpPageCache?.hitRatio ?? null,
    httpCacheEntryCount: s.httpPageCache?.entries ?? null,
    deltaMinutes: null,
    requestsDelta: null,
    gcCountDelta: null,
    gcTimeDeltaMs: null,
    gcMsPerMin: null,
    restartedSincePrevious: false,
  };
}

/**
 * Fill in deltas between consecutive points of one instance.
 *
 * This is the payoff of grouping by instance. `Completed Requests` and `total GCs` are
 * cumulative *per JVM since its own start*, so differencing them is only meaningful
 * inside a single run — differencing across the load-balanced pool produces negative
 * request counts and nonsense GC rates.
 *
 * A restart is the same hazard inside one Id: the JVM's counters begin again from zero,
 * so a snapshot taken after a restart would difference to a large negative against the
 * snapshot before it. The series stays whole (the Id is the identity), but the delta
 * across that one boundary is left null and the point is marked instead.
 */
function fillDeltas(points: StatusSeriesPoint[]) {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    if (prev.startTime && cur.startTime && prev.startTime !== cur.startTime) {
      cur.restartedSincePrevious = true;
      continue;
    }

    const deltaMs = cur.time - prev.time;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) continue;
    const minutes = deltaMs / 60000;
    cur.deltaMinutes = minutes;
    if (cur.completedTotal !== null && prev.completedTotal !== null) {
      cur.requestsDelta = cur.completedTotal - prev.completedTotal;
    }
    if (cur.gcCollections !== null && prev.gcCollections !== null) {
      cur.gcCountDelta = cur.gcCollections - prev.gcCollections;
    }
    if (cur.gcTimeMs !== null && prev.gcTimeMs !== null) {
      cur.gcTimeDeltaMs = cur.gcTimeMs - prev.gcTimeMs;
      cur.gcMsPerMin = cur.gcTimeDeltaMs / minutes;
    }
  }
}

function groupValues(
  snapshots: StatusSnapshot[],
  pick: (s: StatusSnapshot) => string | null
): ValueGroup[] {
  const byValue = new Map<string, Set<string>>();
  for (const s of snapshots) {
    const v = pick(s);
    if (v === null) continue;
    if (!byValue.has(v)) byValue.set(v, new Set());
    byValue.get(v)!.add(s.instanceId);
  }
  return [...byValue.entries()]
    .map(([value, ids]) => ({ value, instanceIds: [...ids].sort() }))
    .sort((a, b) => b.instanceIds.length - a.instanceIds.length);
}

/**
 * Query parameters that are ad-network or analytics click IDs in essentially every
 * deployment. Matching one is a hint that the parameter cannot affect the origin
 * response, not a verdict — the operator still confirms before changing a cache key.
 */
const TRACKING_PARAMS = new Set([
  "gclid", "gclsrc", "gad_campaignid", "gad_source", "gbraid", "wbraid", "dclid",
  "fbclid", "msclkid", "ttclid", "twclid", "yclid", "li_fat_id", "igshid", "epik",
  "irclickid", "sscid", "mc_cid", "mc_eid", "ef_id", "s_kwcid", "rb_clickid",
  "cmp", "cmpid", "icid", "icmp", "mkwid", "pcrid",
]);
const TRACKING_PREFIXES = ["utm_", "_branch_", "at_", "pk_", "mtm_"];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Split a cached URL into its path and ordered query pairs.
 *
 * Deliberately hand-rolled rather than using `new URL()`: some entries carry a scheme
 * marker before the address (`u:https://…`), which the URL constructor rejects outright,
 * and everything needed here is a plain string split.
 */
function splitCachedUrl(url: string): { base: string; pairs: [string, string][] } {
  const q = url.indexOf("?");
  if (q < 0) return { base: url, pairs: [] };
  const base = url.slice(0, q);
  const pairs: [string, string][] = [];
  for (const part of url.slice(q + 1).split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq < 0 ? part : part.slice(0, eq);
    const rawVal = eq < 0 ? "" : part.slice(eq + 1);
    let key = rawKey;
    let val = rawVal;
    try {
      key = decodeURIComponent(rawKey);
      val = decodeURIComponent(rawVal);
    } catch {
      // Malformed percent-encoding — keep the raw text rather than dropping the pair.
    }
    pairs.push([key, val]);
  }
  return { base, pairs };
}

/** Cache key for a URL with one parameter removed, order-normalised so it compares. */
function keyWithout(base: string, pairs: [string, string][], omit: string): string {
  return (
    base +
    "?" +
    pairs
      .filter(([k]) => k !== omit)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&")
  );
}

/**
 * Score every query parameter in the cached URLs for cache-key exclusion.
 *
 * `collapsesTo` is the number the decision actually rests on: drop this parameter from
 * the key and that many cache entries merge into ones already present. It is computed
 * per parameter in isolation, so the values are NOT additive — two parameters that
 * co-occur on the same URLs each report the merge that the other would also achieve,
 * and a parameter can report zero purely because a co-occurring one still splits those
 * URLs apart.
 */
function computeCacheKeyParams(urls: HttpCacheUrlRollup[]): CacheKeyParam[] {
  const parsed = urls
    .filter((u) => u.hasQuery)
    .map((u) => ({ ...u, ...splitCachedUrl(u.url) }));

  // Index by parameter so each one only walks the URLs that actually carry it.
  const byParam = new Map<string, number[]>();
  parsed.forEach((p, i) => {
    for (const [k] of p.pairs) {
      const list = byParam.get(k);
      if (list) {
        if (list[list.length - 1] !== i) list.push(i);
      } else {
        byParam.set(k, [i]);
      }
    }
  });

  const out: CacheKeyParam[] = [];
  for (const [name, indices] of byParam.entries()) {
    const values = new Set<string>();
    const collapsed = new Set<string>();
    let accessCount = 0;
    for (const i of indices) {
      const p = parsed[i];
      accessCount += p.accessCount;
      for (const [k, v] of p.pairs) if (k === name) values.add(v);
      collapsed.add(keyWithout(p.base, p.pairs, name));
    }
    out.push({
      name,
      urlCount: indices.length,
      accessCount,
      distinctValues: values.size,
      uniquenessPct: indices.length ? (values.size / indices.length) * 100 : 0,
      collapsesTo: indices.length - collapsed.size,
      likelyTracking: isTrackingParam(name),
    });
  }

  // Sorted by volume — how many cached entries carry the parameter — with the
  // collapse figure breaking ties.
  return out
    .sort((a, b) => b.urlCount - a.urlCount || b.collapsesTo - a.collapsesTo)
    .slice(0, MAX_CACHE_KEY_PARAMS);
}

/** Application frames only — the Tomcat/JDK dispatch frames are the same on every stack. */
function appFrames(stack: string[]): string[] {
  return stack
    .filter((f) => f.includes("com.motionpoint"))
    .map((f) => f.replace(/^(?:app\/\/|java\.base@[\d.]+\/)/, ""));
}

/**
 * Combine one or more snapshots into the model the UI renders.
 *
 * Snapshots are keyed by instanceId alone: the Id is the server's identity, and a
 * restart is a thing that happened *to* that server rather than a different server.
 * Restarts are recorded on the series (startTimes/restartCount) and the delta across
 * the boundary is suppressed in fillDeltas, since the JVM's counters reset there.
 */
export function mergeSnapshots(snapshots: StatusSnapshot[]): StatusAnalysis {
  const ordered = [...snapshots]
    .filter((s) => Number.isFinite(s.time))
    .sort((a, b) => a.time - b.time);
  // Snapshots without a usable timestamp still carry point-in-time detail worth showing.
  const undated = snapshots.filter((s) => !Number.isFinite(s.time));
  const all = [...ordered, ...undated];

  // ── Per-instance series ──
  const seriesByKey = new Map<string, InstanceSeries>();
  for (const s of ordered) {
    const key = s.instanceId;
    let series = seriesByKey.get(key);
    if (!series) {
      series = {
        key,
        instanceId: s.instanceId,
        startTime: s.startTime,
        startTimes: [],
        restartCount: 0,
        version: s.version,
        propertiesHash: s.propertiesHash,
        propertiesVersion: s.propertiesVersion,
        snapshotCount: 0,
        points: [],
      };
      seriesByKey.set(key, series);
    }
    // Ordered by first observation, so startTimes[0] is the run we saw first.
    if (s.startTime && !series.startTimes.includes(s.startTime)) {
      series.startTimes.push(s.startTime);
    }
    series.points.push(toPoint(s, key));
    series.snapshotCount++;
  }
  const instances = [...seriesByKey.values()].sort(
    (a, b) => (a.points[0]?.time ?? 0) - (b.points[0]?.time ?? 0)
  );
  for (const series of instances) {
    fillDeltas(series.points);
    series.restartCount = Math.max(0, series.startTimes.length - 1);
  }

  // The aggregate view intentionally keeps every point on one axis — including the
  // counter discontinuities that come from hopping between backends.
  const aggregate = instances.flatMap((i) => i.points).sort((a, b) => a.time - b.time);

  // ── Restarts: one Id observed reporting more than one JVM start time ──
  const restartedInstanceIds = instances.filter((i) => i.restartCount > 0).map((i) => i.instanceId);
  const restartCount = instances.reduce((sum, i) => sum + i.restartCount, 0);

  // ── Fleet identity, the source of the config-drift finding ──
  const propertiesHashes = groupValues(all, (s) => s.propertiesHash);
  const versions = groupValues(all, (s) => s.version);
  const propertiesVersions = groupValues(all, (s) => s.propertiesVersion);
  const distinctInstanceIds = new Set(all.map((s) => s.instanceId));

  // ── Pending requests + hot frames ──
  const pendingOccurrences: PendingRequestOccurrence[] = [];
  const frameCounts = new Map<string, number>();
  for (const s of all) {
    for (const p of s.pendingRequests) {
      pendingOccurrences.push({ ...p, time: s.time, instanceId: s.instanceId, fileName: s.fileName });
      // Count each distinct frame once per stack so a recursive call can't dominate.
      for (const frame of new Set(appFrames(p.stack))) incr(frameCounts, frame);
    }
  }
  const topPendingRequests = topN(pendingOccurrences, MAX_PENDING_REQUESTS, (p) => p.elapsedMs);
  const hotFrames = topN([...frameCounts.entries()], MAX_HOT_FRAMES, ([, c]) => c).map(
    ([frame, count]) => ({ frame, count })
  );

  // ── Cache rollups. Hit ratios are averaged; entries/size take the latest reading,
  // since they describe current occupancy rather than a rate. ──
  const cacheAcc = new Map<string, { ratios: number[]; latest: CacheStat; evictions: number }>();
  for (const s of all) {
    for (const c of [...s.caches, ...(s.httpPageCache ? [s.httpPageCache] : [])]) {
      const acc = cacheAcc.get(c.name);
      if (!acc) {
        cacheAcc.set(c.name, {
          ratios: c.hitRatio === null ? [] : [c.hitRatio],
          latest: c,
          evictions: c.lruEvictions,
        });
      } else {
        if (c.hitRatio !== null) acc.ratios.push(c.hitRatio);
        acc.latest = c; // `all` is time-ordered, so the last write wins
        acc.evictions = Math.max(acc.evictions, c.lruEvictions);
      }
    }
  }
  const cacheRollup: CacheRollup[] = [...cacheAcc.entries()].map(([name, acc]) => ({
    name,
    avgHitRatio: acc.ratios.length ? acc.ratios.reduce((a, b) => a + b, 0) / acc.ratios.length : null,
    minHitRatio: acc.ratios.length ? Math.min(...acc.ratios) : null,
    maxHitRatio: acc.ratios.length ? Math.max(...acc.ratios) : null,
    latestEntries: acc.latest.entries,
    latestDataSizeMb: acc.latest.dataSizeMb,
    totalEvictions: acc.evictions,
    samples: acc.ratios.length,
  }));

  // EhCache counters are cumulative per instance, so the latest reading is the honest
  // one — summing across snapshots would multiply-count the same gets.
  const ehLatest = new Map<string, EhCacheStat>();
  for (const s of all) for (const e of s.ehCaches) ehLatest.set(e.name, e);
  const ehCacheRollup = [...ehLatest.values()].sort((a, b) => b.gets - a.gets);

  // ── HTTP cache URLs: AccessCount is cumulative per instance, so take the peak. ──
  const urlAcc = new Map<string, { accessCount: number; snapshots: number }>();
  for (const s of all) {
    for (const e of s.httpCacheEntries) {
      const acc = urlAcc.get(e.url);
      if (!acc) urlAcc.set(e.url, { accessCount: e.accessCount, snapshots: 1 });
      else {
        acc.accessCount = Math.max(acc.accessCount, e.accessCount);
        acc.snapshots++;
      }
    }
  }
  const allUrls: HttpCacheUrlRollup[] = [...urlAcc.entries()].map(([url, acc]) => ({
    url,
    accessCount: acc.accessCount,
    snapshots: acc.snapshots,
    hasQuery: url.includes("?"),
  }));
  const httpCacheUrls = topN(allUrls, MAX_HTTP_CACHE_URLS, (u) => u.accessCount);
  // Scored over *every* cached URL, not the displayed top-N — fragmentation is a
  // property of the whole cache, and the long tail is where most of it lives.
  const cacheKeyParams = computeCacheKeyParams(allUrls);
  const collapsedIfNoParams = new Set(
    allUrls.filter((u) => u.hasQuery).map((u) => splitCachedUrl(u.url).base)
  ).size;

  // ── Transforms: peak observed per Id across snapshots. ──
  const transformAcc = new Map<string, TransformStat>();
  for (const s of all) {
    for (const t of s.transforms) {
      const acc = transformAcc.get(t.id);
      if (!acc) transformAcc.set(t.id, { ...t });
      else {
        acc.matches = Math.max(acc.matches, t.matches);
        acc.executions = Math.max(acc.executions, t.executions);
        acc.avgMs = Math.max(acc.avgMs, t.avgMs);
        acc.maxMs = Math.max(acc.maxMs, t.maxMs);
      }
    }
  }
  const transforms = [...transformAcc.values()].sort((a, b) => b.maxMs - a.maxMs);

  // A transform is only "dead" if it never matched in *every* snapshot — an id that
  // matched on one backend is live, it just wasn't exercised on the others.
  let neverMatchedTransformIds: string[] = [];
  const withTransformData = all.filter((s) => s.transforms.length || s.neverMatchedTransformIds.length);
  if (withTransformData.length) {
    neverMatchedTransformIds = withTransformData
      .map((s) => new Set(s.neverMatchedTransformIds))
      .reduce((acc, set) => acc.filter((id) => set.has(id)), [...withTransformData[0].neverMatchedTransformIds]);
  }

  // ── SSL error hosts: peak per host. ──
  const sslAcc = new Map<string, SslErrorHost>();
  for (const s of all) {
    for (const h of s.sslErrorHosts) {
      const prev = sslAcc.get(h.host);
      if (!prev || h.count > prev.count) sslAcc.set(h.host, h);
    }
  }
  const sslErrorHosts = [...sslAcc.values()].sort((a, b) => b.count - a.count);

  // ── Flags ──
  const heapPcts = aggregate.map((p) => p.heapUsedPct).filter((v): v is number => v !== null);
  const heapAvail = aggregate.map((p) => p.heapAvailableMb).filter((v): v is number => v !== null);
  const gcRates = aggregate.map((p) => p.gcMsPerMin).filter((v): v is number => v !== null);
  const threadCounts = aggregate.map((p) => p.threadCount).filter((v): v is number => v !== null);
  const leased = aggregate.map((p) => p.connLeased).filter((v): v is number => v !== null);
  const connPoolMax = all.find((s) => s.httpClientPool)?.httpClientPool?.max ?? null;
  const peakConnLeased = leased.length ? Math.max(...leased) : null;
  const anyConnPending = aggregate.some((p) => (p.connPending ?? 0) > 0);

  const lowHitRatioCaches = cacheRollup
    .filter(
      (c) =>
        c.avgHitRatio !== null &&
        c.avgHitRatio < LOW_HIT_RATIO_PCT &&
        c.latestEntries >= LOW_HIT_RATIO_MIN_ENTRIES
    )
    .map((c) => c.name);

  // Cumulative counters are per instance, so a fleet total is the sum of each
  // instance's own peak — not the sum of every snapshot.
  const sumInstancePeaks = (pick: (s: StatusSnapshot) => number | null): number => {
    const peakById = new Map<string, number>();
    for (const s of all) {
      const v = pick(s);
      if (v === null) continue;
      peakById.set(s.instanceId, Math.max(peakById.get(s.instanceId) ?? 0, v));
    }
    return [...peakById.values()].reduce((a, b) => a + b, 0);
  };

  const longestPendingMs = pendingOccurrences.length
    ? Math.max(...pendingOccurrences.map((p) => p.elapsedMs))
    : 0;
  const peakGcMsPerMin = gcRates.length ? Math.max(...gcRates) : null;
  const peakHeapUsedPct = heapPcts.length ? Math.max(...heapPcts) : null;
  const oomTotal = sumInstancePeaks((s) => s.intervalErrors?.oom ?? null);

  const timespan =
    ordered.length && ordered[0].fetchedAtUtc
      ? {
          start: ordered[0].fetchedAtUtc,
          end: ordered[ordered.length - 1].fetchedAtUtc ?? ordered[0].fetchedAtUtc,
        }
      : null;

  return {
    fileNames: all.map((s) => s.fileName),
    snapshotCount: all.length,
    parseErrors: [],
    timespan,
    snapshots: all,
    instances,
    aggregate,
    fleet: {
      instanceCount: distinctInstanceIds.size,
      propertiesHashes,
      versions,
      propertiesVersions,
    },
    topPendingRequests,
    hotFrames,
    threadStates: all.map((s) => ({
      time: s.time,
      instanceId: s.instanceId,
      byState: s.threadDump.byState,
    })),
    cacheRollup,
    ehCacheRollup,
    httpCacheUrls,
    cacheKeyParams,
    httpCacheTotals: {
      distinctUrls: allUrls.length,
      withQuery: allUrls.filter((u) => u.hasQuery).length,
      totalAccesses: allUrls.reduce((a, u) => a + u.accessCount, 0),
      collapsedIfNoParams,
    },
    staticCaches: all.flatMap((s) => s.staticCaches).filter(
      (c, i, arr) => arr.findIndex((o) => o.name === c.name) === i
    ),
    transforms,
    neverMatchedTransformIds,
    sslErrorHosts,
    flags: {
      singleSnapshot: all.length === 1,
      // Identical configs hash identically — the hash already excludes host-specific
      // keys — so more than one hash across the pool means the backends really differ.
      configDriftDetected: propertiesHashes.length > 1,
      versionDriftDetected: versions.length > 1,
      propertiesVersionDriftDetected: propertiesVersions.length > 1,
      restartDetected: restartedInstanceIds.length > 0,
      restartedInstanceIds,
      restartCount,
      peakHeapUsedPct,
      minHeapAvailableMb: heapAvail.length ? Math.min(...heapAvail) : null,
      heapPressure: peakHeapUsedPct !== null && peakHeapUsedPct >= HEAP_PRESSURE_PCT,
      peakGcMsPerMin,
      gcPressure: peakGcMsPerMin !== null && peakGcMsPerMin >= GC_MS_PER_MIN_PRESSURE,
      peakThreadCount: threadCounts.length ? Math.max(...threadCounts) : 0,
      totalPendingRequests: pendingOccurrences.length,
      longestPendingMs,
      stuckRequests: longestPendingMs >= STUCK_REQUEST_MS,
      connPoolSaturation:
        anyConnPending ||
        (peakConnLeased !== null && !!connPoolMax && peakConnLeased / connPoolMax >= CONN_POOL_SATURATION_RATIO),
      peakConnLeased,
      connPoolMax,
      lowHitRatioCaches,
      oomDetected: oomTotal > 0,
      oomTotal,
      totalConnectionErrors: sumInstancePeaks((s) => s.totalErrors.connectionTotal),
      deadTransformCount: neverMatchedTransformIds.length,
      slowestTransformMs: transforms.length ? transforms[0].maxMs : 0,
    },
  };
}

// ── Prompt payload ───────────────────────────────────────────────────────────

/** Stack frames sent per pending request — matches the cap lib/logParser.ts uses. */
const PROMPT_STACK_FRAMES = 15;
const PROMPT_PENDING_REQUESTS = 12;
const PROMPT_TRANSFORMS = 20;
const PROMPT_CACHE_URLS = 20;
const PROMPT_CACHE_KEY_PARAMS = 25;

function isoOrUnknown(time: number): string {
  return Number.isFinite(time) ? new Date(time).toISOString() : "unknown";
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maxOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Reduce a StatusAnalysis to something safe to POST.
 *
 * A ZIP of eight dumps carries several thousand HTTP-cache rows and ~900 thread
 * entries; sending the whole model would blow up the edge request for no benefit,
 * since the model only needs aggregates plus the top offenders.
 */
export function toPromptPayload(a: StatusAnalysis): StatusPromptPayload {
  return {
    fileNames: a.fileNames,
    snapshotCount: a.snapshotCount,
    timespan: a.timespan,
    instances: a.instances.map((i) => ({
      instanceId: i.instanceId,
      startTime: i.startTime,
      startTimes: i.startTimes,
      restartCount: i.restartCount,
      version: i.version,
      propertiesHash: i.propertiesHash,
      propertiesVersion: i.propertiesVersion,
      snapshotCount: i.snapshotCount,
      peakHeapUsedPct: maxOrNull(i.points.map((p) => p.heapUsedPct)),
      minHeapAvailableMb: (() => {
        const vals = i.points.map((p) => p.heapAvailableMb).filter((v): v is number => v !== null);
        return vals.length ? Math.min(...vals) : null;
      })(),
      peakThreadCount: maxOrNull(i.points.map((p) => p.threadCount)),
      avgRps: avg(i.points.map((p) => p.rps)),
      avgIntervalRps: avg(i.points.map((p) => p.intervalRps)),
      avgRespPage: avg(i.points.map((p) => p.avgRespPage)),
      peakGcMsPerMin: maxOrNull(i.points.map((p) => p.gcMsPerMin)),
      // Sum of intra-instance deltas — real requests served over the observed window.
      requestsObserved: (() => {
        const deltas = i.points.map((p) => p.requestsDelta).filter((v): v is number => v !== null);
        return deltas.length ? deltas.reduce((x, y) => x + y, 0) : null;
      })(),
    })),
    fleet: a.fleet,
    flags: a.flags,
    topPendingRequests: a.topPendingRequests.slice(0, PROMPT_PENDING_REQUESTS).map((p) => ({
      time: isoOrUnknown(p.time),
      instanceId: p.instanceId,
      elapsedMs: p.elapsedMs,
      method: p.method,
      url: p.url,
      transformId: p.transformId,
      state: p.state,
      stack: p.stack.slice(0, PROMPT_STACK_FRAMES),
    })),
    hotFrames: a.hotFrames,
    cacheRollup: a.cacheRollup,
    ehCacheRollup: a.ehCacheRollup,
    httpCache: {
      distinctUrls: a.httpCacheTotals.distinctUrls,
      withQuery: a.httpCacheTotals.withQuery,
      totalAccesses: a.httpCacheTotals.totalAccesses,
      collapsedIfNoParams: a.httpCacheTotals.collapsedIfNoParams,
      topUrls: a.httpCacheUrls.slice(0, PROMPT_CACHE_URLS),
    },
    cacheKeyParams: a.cacheKeyParams.slice(0, PROMPT_CACHE_KEY_PARAMS),
    transforms: a.transforms.filter((t) => t.maxMs >= SLOW_TRANSFORM_MS).slice(0, PROMPT_TRANSFORMS),
    deadTransformCount: a.neverMatchedTransformIds.length,
    sslErrorHosts: a.sslErrorHosts,
    intervalErrorSamples: a.snapshots
      .filter((s) => s.intervalErrors)
      .map((s) => ({
        time: isoOrUnknown(s.time),
        instanceId: s.instanceId,
        totalRequests: s.intervalErrors!.totalRequests,
        windowMin: s.intervalErrors!.windowMin,
        connection: s.intervalErrors!.connection,
        database: s.intervalErrors!.database,
        oom: s.intervalErrors!.oom,
        other: s.intervalErrors!.other,
      })),
  };
}

export const STATUS_THRESHOLDS = {
  HEAP_PRESSURE_PCT,
  GC_MS_PER_MIN_PRESSURE,
  STUCK_REQUEST_MS,
  LOW_HIT_RATIO_PCT,
  SLOW_TRANSFORM_MS,
  MAX_TRANSFORMS,
};
