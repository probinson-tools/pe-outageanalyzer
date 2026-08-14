// ── AI response (Claude fills this in, grounded in ParsedLogSummary + Confluence) ──

export interface Recommendation {
  title: string;
  description: string;
  priority: "immediate" | "short-term" | "long-term";
  category: "memory" | "database" | "caching" | "passthrough" | "blocking" | "monitoring" | "configuration";
  configReference?: string;
}

export interface AnalysisResult {
  synopsis: string;
  recommendations: Recommendation[];
}

// ── Parsed log data (deterministic, computed client-side by lib/logParser.ts) ──

export interface ChartPoint {
  time: number;
  threadCount: number;
  dbPoolSize: number;
  connPoolSize: number;
  memoryUsedPct: number | null;
  oomCount: number;
}

export interface TopError {
  type: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sample: string;
}

export interface TopIp {
  ip: string;
  count: number;
}

export interface TopUserAgent {
  userAgent: string;
  count: number;
}

export interface TopUrlPattern {
  pattern: string;
  count: number;
}

export interface QueryParamStat {
  name: string;
  occurrences: number;
  distinctValues: number;
}

export interface OomStackTrace {
  count: number;
  firstSeen: string;
  trace: string;
}

export interface ParsedLogSummary {
  fileName: string;
  lineCount: number;
  timespan: { start: string; end: string } | null;
  chartPoints: ChartPoint[];
  dbPoolServerName: string | null;
  connPoolServerName: string | null;
  topErrors: TopError[];
  topIps: TopIp[];
  topUserAgents: TopUserAgent[];
  topUrlPatterns: TopUrlPattern[];
  queryParams: QueryParamStat[];
  oomStackTraces: OomStackTrace[];
  flags: {
    dbPoolLeakSuspected: boolean;
    connPoolLeakSuspected: boolean;
    oomDetected: boolean;
    oomTotal: number;
    cacheFragmentationSuspected: boolean;
    peakDbPoolSize: number;
    peakConnPoolSize: number;
    peakThreadCount: number;
    minFreeMemoryPct: number | null;
    assignedMemoryMb: number | null;
    totalExceptions: number;
    distinctErrorTypes: number;
  };
}

// ── Server status dumps (deterministic, computed client-side by lib/statusParser.ts) ──
//
// One dump = the HTML page TransMotion serves at /?mpactionid=…, a point-in-time
// snapshot of a single JVM. A poller archives these on an interval, so a ZIP of
// dumps is a *time series of snapshots*, not a stream of lines — which is the whole
// reason this needs a parser separate from lib/logParser.ts.

export interface CacheStat {
  name: string;
  hitRatio: number | null;
  entries: number;
  softEntries: number;
  dataSizeMb: number;
  softDataSizeMb: number;
  lruSweeps: number;
  lruEvictions: number;
  memAvailableMb: number | null;
  memTotalMb: number | null;
}

export interface EhCacheStat {
  name: string;
  gets: number;
  hits: number;
  misses: number;
  hitPercentage: number;
  puts: number;
  evictions: number;
  expirations: number;
  onHeapBytes: number;
  offHeapBytes: number;
  creationExpiry: string | null;
}

export interface HttpCacheEntry {
  url: string;
  accessCount: number;
  lastAccess: string | null;
  expiration: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface StaticCacheStat {
  name: string;
  entries: number;
  dataSizeMb: number;
}

export interface TransformStat {
  id: string;
  matches: number;
  executions: number;
  avgMs: number;
  maxMs: number;
}

/**
 * A request the server was still working on when the dump was taken, joined to its
 * entry in the thread dump. The join (pending `Thread=N` → dumped `Thread=N`) is what
 * turns "this has been running 3.5s" into the actual stack it is stuck in.
 */
export interface PendingRequest {
  requestId: string;
  threadNum: string;
  threadName: string;
  elapsedMs: number;
  method: string;
  url: string;
  transformId: string;
  state: string | null;
  type: string | null;
  stack: string[];
}

export interface MemoryPoolStat {
  name: string;
  type: string;
  initMb: number | null;
  usedMb: number | null;
  peakUsedMb: number | null;
  availableMb: number | null;
  committedMb: number | null;
  peakCommittedMb: number | null;
  maxMb: number | null;
}

export interface SslErrorHost {
  host: string;
  count: number;
  pct: number | null;
}

export interface MemoryArea {
  initMb: number | null;
  usedMb: number | null;
  availableMb: number | null;
  committedMb: number | null;
  maxMb: number | null;
}

export interface StatusSnapshot {
  fileName: string;

  // Identity — instanceId is the grouping key. The polled URL is load-balanced, so
  // consecutive snapshots routinely come from different backends.
  instanceId: string;
  instanceName: string | null;
  version: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  propertiesHash: string | null;
  propertiesVersion: string | null;
  excludes: string[];

  fetchedAtUtc: string | null;
  time: number; // epoch ms — sort key
  serverTime: string | null;

  startTime: string | null;
  vmRuntimeHrs: number | null;
  javaVersion: string | null;
  jvmName: string | null;
  catalinaBase: string | null;
  xmxMb: number | null;

  // Cumulative since this instance's own start time — never comparable across instances.
  completed: {
    total: number | null;
    page: number | null;
    file: number | null;
    plugin: number | null;
    ssl: number | null;
    nonSsl: number | null;
  };
  load: { page: number | null; file: number | null; plugin: number | null; total: number | null };
  avgResponse: { page: number | null; file: number | null; plugin: number | null };

  totalErrors: {
    pagePlugin: number | null;
    file: number | null;
    ssl: number | null;
    nonSsl: number | null;
    connectionTotal: number | null;
    connectionPct: number | null;
  };
  sslErrorHosts: SslErrorHost[];

  // The server's own rolling window. Its length is not fixed and not capped — 1 to 100
  // minutes has been observed — so windowMin must be read alongside the counts to know
  // how much history they cover.
  intervalErrors: {
    totalRequests: number | null;
    windowMin: number | null;
    connection: number | null;
    connectionPct: number | null;
    database: number | null;
    oom: number | null;
    other: number | null;
  } | null;

  pendingRequests: PendingRequest[];

  heap: MemoryArea | null;
  nonHeap: MemoryArea | null;
  memoryPools: MemoryPoolStat[];
  os: {
    physicalTotalMb: number | null;
    physicalFreeMb: number | null;
    swapTotalMb: number | null;
    swapFreeMb: number | null;
  } | null;
  gc: { collections: number; collectionTimeMs: number } | null;
  threads: { current: number | null; peak: number | null; daemon: number | null } | null;

  httpClientPool: { leased: number; pending: number; available: number; max: number } | null;

  lastFullClearCache: string | null;
  caches: CacheStat[];
  ehCaches: EhCacheStat[];
  httpPageCache: CacheStat | null;
  httpCacheEntries: HttpCacheEntry[];
  staticCaches: StaticCacheStat[];

  transformRuntimeHrs: number | null;
  transforms: TransformStat[];
  neverMatchedTransformIds: string[];

  // Full stacks are kept only for pending-request threads (see PendingRequest.stack).
  // Everything else is reduced to a histogram so a ZIP of dumps stays manageable.
  threadDump: {
    total: number;
    byState: Record<string, number>;
    groups: { name: string; count: number }[];
  };
}

/** One snapshot reduced to chartable scalars, plus intra-instance deltas. */
export interface StatusSeriesPoint {
  time: number;
  fileName: string;
  instanceId: string;
  instanceKey: string;
  /** The JVM start time this snapshot reported — a change means the instance restarted. */
  startTime: string | null;

  heapUsedMb: number | null;
  heapAvailableMb: number | null;
  heapMaxMb: number | null;
  heapUsedPct: number | null;
  threadCount: number | null;
  gcCollections: number | null;
  gcTimeMs: number | null;
  completedTotal: number | null;
  /** Lifetime average req/s the server reports, over the whole run since start. */
  rps: number | null;
  /**
   * Requests per second over the server's own rolling interval window, derived from
   * "Total requests: N in Mmin". Far more responsive than the lifetime average, but the
   * window length varies (1–100 min observed), so short windows give a noisier rate —
   * `intervalWindowMin` says how much history each point actually covers.
   */
  intervalRps: number | null;
  intervalWindowMin: number | null;
  avgRespPage: number | null;
  pendingCount: number;
  connLeased: number | null;
  connPending: number | null;
  connAvailable: number | null;
  intervalConnErrors: number | null;
  intervalDbErrors: number | null;
  intervalOom: number | null;
  intervalOther: number | null;
  mainSegmentHitRatio: number | null;
  httpPageHitRatio: number | null;
  httpCacheEntryCount: number | null;

  // Deltas vs the previous snapshot *of the same instance*. Null at a series start —
  // computing these across instances is what produces the bogus negative counters.
  deltaMinutes: number | null;
  requestsDelta: number | null;
  gcCountDelta: number | null;
  gcTimeDeltaMs: number | null;
  gcMsPerMin: number | null;
  /** True when the previous snapshot of this instance came from a different JVM run. */
  restartedSincePrevious: boolean;
}

/**
 * Every snapshot from one instance Id, in time order.
 *
 * A restart does NOT split the series — the Id is the identity. It is recorded in
 * `startTimes`/`restartCount` instead, and deltas are suppressed across the boundary
 * because the JVM's cumulative counters begin again from zero.
 */
export interface InstanceSeries {
  key: string;
  instanceId: string;
  /** First JVM start time observed for this Id. */
  startTime: string | null;
  /** Every distinct start time seen, in order of first observation. */
  startTimes: string[];
  /** startTimes.length - 1, i.e. how many restarts the snapshots caught. */
  restartCount: number;
  version: string | null;
  propertiesHash: string | null;
  propertiesVersion: string | null;
  snapshotCount: number;
  points: StatusSeriesPoint[];
}

export interface ValueGroup {
  value: string;
  instanceIds: string[];
}

export interface CacheRollup {
  name: string;
  avgHitRatio: number | null;
  minHitRatio: number | null;
  maxHitRatio: number | null;
  latestEntries: number;
  latestDataSizeMb: number;
  totalEvictions: number;
  samples: number;
}

export interface HttpCacheUrlRollup {
  url: string;
  accessCount: number;
  snapshots: number;
  hasQuery: boolean;
}

/**
 * Cached URLs grouped to host + the first two path directories, scored for whether the
 * pattern is earning its place in the cache.
 *
 * An entry accessed exactly once was fetched from the origin, stored, and then never
 * reused before it expired or was evicted — it cost heap and a round trip and paid
 * nothing back. A pattern made almost entirely of those is a candidate for a no-cache
 * rule.
 *
 * `reuseRatio` is the guard against reading that backwards: a pattern can be mostly
 * single-access and still be the hardest-working thing in the cache if a few of its URLs
 * carry enormous traffic.
 */
export interface CacheUrlPattern {
  /** host + up to two path segments, suffixed "/*" when the real path went deeper. */
  pattern: string;
  urlCount: number;
  singleAccessCount: number;
  singleAccessPct: number;
  totalAccesses: number;
  /** totalAccesses / urlCount. At 1.0 nothing in the pattern was ever served twice. */
  reuseRatio: number;
  /** Meets all three thresholds: enough volume, mostly single-access, and no reuse. */
  flagged: boolean;
}

/**
 * One query parameter seen across the cached URLs, scored for whether it is worth
 * excluding from the cache key.
 *
 * Volume alone does not make a parameter a good candidate — a parameter on 500 URLs
 * that always carries the same value fragments nothing. What matters is `collapsesTo`:
 * how many cache entries would merge away if this parameter stopped being part of the key.
 */
export interface CacheKeyParam {
  name: string;
  /** Distinct cached URLs carrying this parameter. */
  urlCount: number;
  /** Summed peak access count of those URLs. */
  accessCount: number;
  distinctValues: number;
  /** distinctValues / urlCount as a percentage; 100% means every use is unique. */
  uniquenessPct: number;
  /** Cache entries that would disappear if this parameter were dropped from the key. */
  collapsesTo: number;
  /** Matches a well-known ad/analytics click-ID pattern. A hint, not a verdict. */
  likelyTracking: boolean;
}

export interface PendingRequestOccurrence extends PendingRequest {
  time: number;
  instanceId: string;
  fileName: string;
}

export interface StatusAnalysis {
  fileNames: string[];
  snapshotCount: number;
  parseErrors: { fileName: string; message: string }[];
  timespan: { start: string; end: string } | null;

  snapshots: StatusSnapshot[];
  instances: InstanceSeries[];
  aggregate: StatusSeriesPoint[];

  fleet: {
    instanceCount: number;
    propertiesHashes: ValueGroup[];
    versions: ValueGroup[];
    propertiesVersions: ValueGroup[];
  };

  topPendingRequests: PendingRequestOccurrence[];
  hotFrames: { frame: string; count: number }[];
  threadStates: { time: number; instanceId: string; byState: Record<string, number> }[];

  cacheRollup: CacheRollup[];
  ehCacheRollup: EhCacheStat[];
  httpCacheUrls: HttpCacheUrlRollup[];
  cacheKeyParams: CacheKeyParam[];
  cacheUrlPatterns: CacheUrlPattern[];
  httpCacheTotals: {
    distinctUrls: number;
    withQuery: number;
    totalAccesses: number;
    /** Entries the query-string URLs would collapse to if no parameter were in the key. */
    collapsedIfNoParams: number;
    /** Cached URLs served exactly once — cached but never reused. */
    singleAccessUrls: number;
    /** Distinct host + two-directory patterns, before the display cap. */
    patternCount: number;
    /** Patterns where every single cached URL was accessed exactly once. */
    whollySingleAccessPatterns: number;
    /** Single-access URLs sitting inside flagged patterns. */
    flaggedSingleAccessUrls: number;
    flaggedPatternCount: number;
  };
  staticCaches: StaticCacheStat[];

  transforms: TransformStat[];
  neverMatchedTransformIds: string[];
  sslErrorHosts: SslErrorHost[];

  flags: {
    singleSnapshot: boolean;
    configDriftDetected: boolean;
    versionDriftDetected: boolean;
    propertiesVersionDriftDetected: boolean;
    restartDetected: boolean;
    restartedInstanceIds: string[];
    /** Total restarts observed across the fleet, summed over instances. */
    restartCount: number;
    peakHeapUsedPct: number | null;
    minHeapAvailableMb: number | null;
    heapPressure: boolean;
    peakGcMsPerMin: number | null;
    gcPressure: boolean;
    peakThreadCount: number;
    totalPendingRequests: number;
    longestPendingMs: number;
    stuckRequests: boolean;
    connPoolSaturation: boolean;
    peakConnLeased: number | null;
    connPoolMax: number | null;
    lowHitRatioCaches: string[];
    oomDetected: boolean;
    oomTotal: number;
    totalConnectionErrors: number;
    deadTransformCount: number;
    slowestTransformMs: number;
  };
}

/**
 * The trimmed shape actually POSTed to /api/analyze-status. A full StatusAnalysis holds
 * thousands of HTTP-cache rows across a ZIP; sending it would balloon the edge request,
 * so lib/statusParser.ts#toPromptPayload reduces it to aggregates and top-N.
 */
export interface StatusPromptPayload {
  fileNames: string[];
  snapshotCount: number;
  timespan: { start: string; end: string } | null;
  instances: {
    instanceId: string;
    startTime: string | null;
    startTimes: string[];
    restartCount: number;
    version: string | null;
    propertiesHash: string | null;
    propertiesVersion: string | null;
    snapshotCount: number;
    peakHeapUsedPct: number | null;
    minHeapAvailableMb: number | null;
    peakThreadCount: number | null;
    avgRps: number | null;
    avgIntervalRps: number | null;
    avgRespPage: number | null;
    peakGcMsPerMin: number | null;
    requestsObserved: number | null;
  }[];
  fleet: StatusAnalysis["fleet"];
  flags: StatusAnalysis["flags"];
  topPendingRequests: {
    time: string;
    instanceId: string;
    elapsedMs: number;
    method: string;
    url: string;
    transformId: string;
    state: string | null;
    stack: string[];
  }[];
  hotFrames: { frame: string; count: number }[];
  cacheRollup: CacheRollup[];
  ehCacheRollup: EhCacheStat[];
  httpCache: StatusAnalysis["httpCacheTotals"] & { topUrls: HttpCacheUrlRollup[] };
  cacheKeyParams: CacheKeyParam[];
  cacheUrlPatterns: CacheUrlPattern[];
  transforms: TransformStat[];
  deadTransformCount: number;
  sslErrorHosts: SslErrorHost[];
  intervalErrorSamples: {
    time: string;
    instanceId: string;
    totalRequests: number | null;
    windowMin: number | null;
    connection: number | null;
    database: number | null;
    oom: number | null;
    other: number | null;
  }[];
}
