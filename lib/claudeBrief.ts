// Building blocks shared by the "Export for Claude" briefs: the log analyzer's
// (lib/claudeExport.ts) and the VM state page's (lib/statusClaudeExport.ts).

export interface KbPage {
  id: string;
  title: string;
}

/**
 * Where the MotionPoint knowledge base lives in Confluence. Page IDs in the Operations space,
 * all confirmed to resolve; they will need updating if the pages are moved or rebuilt.
 */
export const KB_SITE = "motionpoint.atlassian.net";
export const KB_ROOT: KbPage = { id: "838238213", title: "Platform Engineering HQ (Operations space)" };

export const KB_BASE_PAGES: KbPage[] = [
  { id: "1885011969", title: "Pager Duty Incident Patterns & Known Fixes — resolved incidents classified by alert signal and fix" },
  { id: "997294108", title: "Log Error Messages" },
  { id: "997523473", title: "Using the Read Timeout Properties" },
  { id: "1789558789", title: "Master Properties Cheat Sheet" },
  { id: "1789952026", title: "Master Properties - Full" },
  { id: "1789984781", title: "TServer Bug Patterns — Additional Cases" },
  { id: "1789689862", title: "Client Troubleshooting Cases" },
  { id: "1788444701", title: "CDN Issues & Bug Fixes / Workarounds" },
  { id: "888274973", title: "PE KnowledgeBase (folder) — condensed reference pages: character sets, NGINX/IIS/Tomcat configs, scripts, and more" },
];

/** Pages specific to reading VM state dumps. */
export const KB_VM_STATE_PAGES: KbPage[] = [
  { id: "997163079", title: "MP Action IDs — the status page is mpactionid 1073741829" },
  { id: "997720071", title: "Data Replication" },
];

export const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** CQL can't contain an unescaped double quote inside a text ~ "…" term. */
export function cqlTerm(term: string): string {
  return term.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

const EXCEPTION_RE = /\b[A-Z][A-Za-z0-9]*(?:Exception|Error)\b/g;
const CLASS_RE = /\b([A-Z][A-Za-z0-9]+)\.[a-z]\w*\(/g;
/**
 * Short simple class names (Manager, Util, Handler) are too generic to search on —
 * "Manager" matched GSM and machine-translation pages unrelated to the error it came from.
 * The distinctive ones (ApacheHttpClientNg2, BOConManager, HTMLTranslatorTS) are longer.
 */
const MIN_CLASS_TERM_LENGTH = 10;

/**
 * Pull searchable names out of log messages and stack frames.
 *
 * Searching Confluence on a whole log line finds nothing — no wiki page contains that host,
 * IP or retry count — and long phrases fail the same way. The exception and class names
 * inside them do match: "ApacheHttpClientNg2" finds the connection-client and Master
 * Properties pages, where the message it came from finds nothing.
 */
export function codeTerms(texts: string[]): { exceptions: string[]; classes: string[] } {
  const exceptions: string[] = [];
  const classes: string[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(EXCEPTION_RE)) exceptions.push(m[0]);
    for (const m of t.matchAll(CLASS_RE)) if (m[1].length >= MIN_CLASS_TERM_LENGTH) classes.push(m[1]);
  }
  return { exceptions, classes };
}

/** The "## Knowledge to use" section, ending with ready-to-run CQL for the given searches. */
export function knowledgeSection(extraPages: KbPage[], searches: string[], source: string): string[] {
  const out = [
    "## Knowledge to use",
    "",
    "- **Your memory and project knowledge** of MotionPoint, TServer, and this customer, if you have any.",
    `- **MotionPoint Confluence**, through the Atlassian connector (\`${KB_SITE}\`). Start with:`,
    `  - ${KB_ROOT.title} — page ${KB_ROOT.id}`,
    ...[...KB_BASE_PAGES, ...extraPages].map((p) => `  - ${p.title} — page ${p.id}`),
    "- Search beyond those pages wherever the findings lead. Search on short keywords — an exception or class name, a property name, a two-word phrase — not whole log lines, which match nothing. Read the pages you rely on rather than working from search snippets, and **cite the page title and ID behind each recommendation**.",
    "",
  ];
  const terms = [...new Set(searches.map(cqlTerm).filter(Boolean))];
  if (terms.length) {
    out.push(`Suggested starting searches, generated from what ${source} shows:`, "", "```");
    for (const t of terms) out.push(`ancestor = ${KB_ROOT.id} AND text ~ "${t}"`);
    out.push("```", "");
  }
  return out;
}

/** <prefix>-<name-stem>-<YYYYMMDD-HHmm>.md */
export function briefFileName(prefix: string, name: string, fallback: string, now = new Date()): string {
  const stem =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${stem}-${stamp}.md`;
}
