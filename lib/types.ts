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

  // Rolling window, capped at 60 min — windowMin says how much history it actually covers.
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
  rps: number | null;
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
  httpCacheTotals: { distinctUrls: number; withQuery: number; totalAccesses: number };
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
  httpCache: {
    distinctUrls: number;
    withQuery: number;
    totalAccesses: number;
    topUrls: HttpCacheUrlRollup[];
  };
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
