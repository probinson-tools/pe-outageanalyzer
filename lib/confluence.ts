const CONFLUENCE_TIMEOUT_MS = 5_000;
const MAX_PAGES = 5;
const MAX_CHARS_PER_PAGE = 3_000;
const MAX_TOTAL_CHARS = 10_000;
const MAX_QUERY_CHARS = 300;
const MAX_KEYWORDS = 8;

// Same stopword approach as pe-knowledgebot's confluence.ts — CQL text~ returns
// nothing for full natural-language questions (punctuation breaks the match),
// so search on extracted keywords instead. Tokens as short as 2 chars are kept
// so domain acronyms like "ip", "js", "id" survive — the stopword set filters
// out the common 2-char function words instead.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or',
  'in', 'on', 'for', 'with', 'this', 'that', 'it', 'as', 'at', 'by', 'from',
  'how', 'what', 'why', 'when', 'does', 'do', 'i', 'we', 'you', 'can', 'our',
  'your', 'whats', 'if', 'so', 'no', 'up', 'us', 'me', 'my', 'ok', 're', 'am',
]);

function extractKeywords(query: string): string {
  const tokens = (query.toLowerCase().match(/[a-z0-9_.]{2,}/g) || []).filter((t) => !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, MAX_KEYWORDS).join(' ');
}

interface ConfluenceSearchResult {
  id?: string;
  title?: string;
  body?: { view?: { value?: string } };
  _links?: { webui?: string; base?: string };
}

function escapeCql(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

// Scope clause for these three Confluence folders (TServer Release Notes,
// Master Properties, Site Down — all under Platform Engineering HQ > KB App
// Files > Reference & Runbooks), OR'd together as a single tier. CONFLUENCE_LABEL
// and CONFLUENCE_SPACE_KEYS are ported for parity with pe-knowledgebot's
// confluence.ts even though this app only populates CONFLUENCE_ANCESTOR_IDS.
function buildScopeClauses(): string[] {
  const clauses: string[] = [];

  const label = process.env.CONFLUENCE_LABEL?.trim();
  if (label) clauses.push(`label="${label.replace(/"/g, '\\"')}"`);

  const ancestorIds = (process.env.CONFLUENCE_ANCESTOR_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => /^\d+$/.test(id));
  if (ancestorIds.length === 1) clauses.push(`ancestor=${ancestorIds[0]}`);
  else if (ancestorIds.length > 1) clauses.push(`(${ancestorIds.map((id) => `ancestor=${id}`).join(' OR ')})`);

  const spaceKeys = (process.env.CONFLUENCE_SPACE_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (spaceKeys.length) clauses.push(`(${spaceKeys.map((k) => `space="${k}"`).join(' OR ')})`);

  return clauses;
}

function buildCql(keywords: string, scopeClause: string): string {
  const escaped = escapeCql(keywords);
  const prefix = scopeClause ? `${scopeClause} AND ` : '';
  return `${prefix}type=page AND text~"${escaped}"`;
}

// A page whose title matches the query terms is the strongest relevance signal,
// so it gets a dedicated pass (prefix-wildcarded per keyword so "ip" matches a
// page titled "…IPs"). Returns null when there are no usable tokens.
function buildTitleCql(keywords: string, scopeClause: string): string | null {
  const tokens = keywords
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_.]/gi, ''))
    .filter((t) => t.length >= 2)
    .slice(0, MAX_KEYWORDS);
  if (tokens.length === 0) return null;
  const titleOr = tokens.map((t) => `title~"${t}*"`).join(' OR ');
  const prefix = scopeClause ? `${scopeClause} AND ` : '';
  return `${prefix}type=page AND (${titleOr})`;
}

// Untargeted pass used only when the keyword search comes back completely
// empty — a server log's stack traces/timestamps rarely share literal words
// with human-written config docs, so relying on keyword overlap alone risks
// silently contributing nothing on most requests. This guarantees the target
// folders are represented by *something* (whatever Confluence's default
// ordering returns) rather than defeating the point of "standing reference
// context" on a total keyword miss.
function buildFallbackCql(scopeClause: string): string {
  const prefix = scopeClause ? `${scopeClause} AND ` : '';
  return `${prefix}type=page`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  const withoutTags = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutTags)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// undefined = not yet resolved, null = resolution failed (don't retry this instance)
let cachedCloudId: string | null | undefined;

async function getCloudId(siteBase: string): Promise<string | null> {
  if (cachedCloudId !== undefined) return cachedCloudId;
  try {
    const res = await fetch(`${siteBase}/_edge/tenant_info`, { signal: AbortSignal.timeout(3_000) });
    const data = res.ok ? await res.json() : null;
    cachedCloudId = typeof data?.cloudId === 'string' ? data.cloudId : null;
  } catch {
    cachedCloudId = null;
  }
  return cachedCloudId ?? null;
}

// Runs one CQL search and returns its raw results (empty array on any failure).
async function runSearch(
  apiBase: string,
  authorization: string,
  cql: string
): Promise<ConfluenceSearchResult[]> {
  const url =
    `${apiBase}/wiki/rest/api/content/search` +
    `?cql=${encodeURIComponent(cql)}` +
    `&expand=body.view&limit=${MAX_PAGES}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFLUENCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    console.error('[confluence] search failed:', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function dedupeById(results: ConfluenceSearchResult[]): ConfluenceSearchResult[] {
  const seen = new Set<string>();
  const merged: ConfluenceSearchResult[] = [];
  for (const page of results) {
    const key = page.id ?? `${page.title ?? ''}|${page._links?.webui ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(page);
  }
  return merged;
}

function formatResults(results: ConfluenceSearchResult[], siteBase: string): string {
  let budget = MAX_TOTAL_CHARS;
  const parts: string[] = [];
  for (const page of results) {
    if (budget <= 0) break;
    const title = page.title ?? 'Untitled';
    const webUrl = `${page._links?.base ?? `${siteBase}/wiki`}${page._links?.webui ?? ''}`;
    const text = stripHtml(page.body?.view?.value ?? '').slice(0, Math.min(MAX_CHARS_PER_PAGE, budget));
    if (!text) continue;
    parts.push(`### ${title}\n${webUrl}\n\n${text}`);
    budget -= text.length;
  }
  if (parts.length === 0) return '';
  return `## Related Confluence articles\n\n${parts.join('\n\n---\n\n')}`;
}

export async function searchConfluence(
  query: string,
  opts?: { keywords?: string }
): Promise<string> {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const apiToken = process.env.CONFLUENCE_API_TOKEN;
  if (!baseUrl || !apiToken || !query.trim()) return '';

  const keywords = (opts?.keywords ?? extractKeywords(query)).trim();
  if (!keywords) return '';

  // Scoped API tokens only authenticate through the api.atlassian.com gateway
  // (the site URL 401s them); classic unscoped tokens work either way. Route
  // through the gateway when the site's cloudId can be resolved, otherwise fall
  // back to the site URL so classic tokens keep working.
  const siteBase = baseUrl.replace(/\/$/, '');
  const cloudId = await getCloudId(siteBase);
  const apiBase = cloudId ? `https://api.atlassian.com/ex/confluence/${cloudId}` : siteBase;

  // Atlassian API tokens (ATATT...) only authenticate via Basic email:token —
  // sent as Bearer they're treated as anonymous, which 403s. Bearer remains the
  // fallback for a genuine OAuth access token supplied without an email.
  // btoa (not Buffer) — this route runs on the Edge Runtime, where Buffer is
  // unreliable; email:token is always ASCII so btoa is safe.
  const email = process.env.CONFLUENCE_EMAIL;
  const authorization = email
    ? `Basic ${btoa(`${email}:${apiToken}`)}`
    : `Bearer ${apiToken}`;

  const scopeClauses = buildScopeClauses();
  const tiers = scopeClauses.length > 0 ? scopeClauses : [''];

  // Title-pass and body-pass run concurrently (not sequential awaits like the
  // reference implementation) — this route streams under a 60s total budget,
  // so minimizing added latency matters more here than in a blocking chat call.
  const [titlePasses, bodyPasses] = await Promise.all([
    Promise.all(
      tiers.map((scope) => {
        const cql = buildTitleCql(keywords, scope);
        return cql ? runSearch(apiBase, authorization, cql) : Promise.resolve([]);
      })
    ),
    Promise.all(tiers.map((scope) => runSearch(apiBase, authorization, buildCql(keywords, scope)))),
  ]);

  const merged = dedupeById([...titlePasses, ...bodyPasses].flat());
  const formatted = formatResults(merged, siteBase);
  if (formatted) return formatted;

  // Keyword search found nothing — fall back to an untargeted pass over the
  // same scope so the target folders are still represented by something,
  // rather than silently contributing no context (see buildFallbackCql above).
  const fallbackResults = await Promise.all(
    tiers.map((scope) => runSearch(apiBase, authorization, buildFallbackCql(scope)))
  );
  return formatResults(dedupeById(fallbackResults.flat()), siteBase);
}
