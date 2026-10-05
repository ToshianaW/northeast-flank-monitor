/**
 * Full text for collected items. An item's article page is fetched only when all of these hold:
 * - the master switch `fetch_full_text` is on and its feed or listing opts in with `full_text: true`;
 * - the item passed the keyword and region filters (no skip reason) and its URL is not stored yet;
 * - it is not no-AI, lead-only, metadata-only by terms, or Paid/Preview (rp.pl), and, where the feed
 *   sets full_text_free_only, the feed marks it Free;
 * - its link is on the source's own domain and that domain is not barred (blocked automated
 *   access, terms-prohibited, citation-only or no-AI sources);
 * - the run's page cap is not used up.
 * Pages go through HttpClient (robots.txt, per-host rate limit, Crawl-delay). On any failure the
 * item keeps its feed text. Logs and metadata carry counts and fixed reason labels only: never a
 * URL, title or text.
 */
import { RobotsDisallowedError, type HttpClient } from "./fetch.mjs";
import { domainOf, htmlToText, type CollectedDoc } from "./store.mjs";

export type FullTextLimits = {
  /** Text longer than this is cut (characters). */
  maxChars: number;
  /** Extracted text shorter than this is not used (characters). */
  minChars: number;
};

export type FullTextFailure = "robots" | "http_status" | "no_article_body" | "too_short" | "timeout" | "fetch_error";

export type Ineligible =
  | "master_off"
  | "not_opted_in"
  | "filtered"
  | "no_ai_processing"
  | "lead_only"
  | "metadata_only"
  | "paywalled"
  | "other_domain"
  | "barred_domain";

export type FullTextScope = {
  /** collector.json fetch_full_text. */
  masterOn: boolean;
  /** The feed's or listing's full_text opt-in. */
  optedIn: boolean;
  /** Domain of the source's home_url in the registry (links elsewhere are not fetched). */
  homeDomain: string | null;
  /** Domains never fetched; subdomains included. */
  barredDomains: readonly string[];
  /** Only items whose feed marks them pay_status Free (rp.pl). */
  freeOnly?: boolean;
};

/**
 * Domains whose pages are never fetched: blocked automated access, terms-prohibited, and the home
 * domains of citation-only and no-AI sources.
 */
export function fullTextBarredDomains(
  lists: { blocked: string[]; prohibited: string[]; citationOnly: Iterable<string>; noAi: Iterable<string> },
  homeDomainOf: (sourceName: string) => string | null,
): string[] {
  const named = [...lists.citationOnly, ...lists.noAi].flatMap((name) => homeDomainOf(name) ?? []);
  return [...new Set([...lists.blocked, ...lists.prohibited, ...named])];
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Why an item may not have its article page fetched, or null when it may. */
export function fullTextIneligibility(doc: CollectedDoc, scope: FullTextScope): Ineligible | null {
  if (!scope.masterOn) return "master_off";
  if (!scope.optedIn) return "not_opted_in";
  if (doc.skipReason) return "filtered";
  const m = doc.metadata;
  if (m.no_ai_processing === true) return "no_ai_processing";
  if (m.lead_only === true) return "lead_only";
  if (m.metadata_only_by_terms === true) return "metadata_only";
  if (m.pay_status === "Paid" || m.pay_status === "Preview") return "paywalled";
  if (scope.freeOnly && m.pay_status !== "Free") return "paywalled";
  let host: string;
  try {
    host = domainOf(doc.url);
  } catch {
    return "other_domain";
  }
  if (scope.barredDomains.some((d) => hostMatches(host, d))) return "barred_domain";
  if (!scope.homeDomain || !hostMatches(host, scope.homeDomain)) return "other_domain";
  return null;
}

/** Content containers used when a page has neither JSON-LD articleBody nor an <article> element. */
const CONTAINER_CLASSES = ["post__body", "editor-content", "entry-content", "article-body", "article__body", "article-content"];

/** Blocks removed from an <article> before its text is taken. */
const NON_TEXT_BLOCKS = /<(nav|aside|footer|form|button|figure|script|style)\b[\s\S]*?<\/\1>/gi;

/** The first string `articleBody` in parsed JSON-LD (objects, arrays, @graph), or null. */
function findArticleBody(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findArticleBody(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.articleBody === "string" && record.articleBody.trim()) return record.articleBody;
  for (const v of Object.values(record)) {
    const found = findArticleBody(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Inner HTML of the first div/section whose class list contains `className`, nesting-aware. */
export function elementByClass(html: string, className: string): string | null {
  for (const open of html.matchAll(/<(div|section)\b[^>]*\bclass="([^"]*)"[^>]*>/gi)) {
    if (!open[2].split(/\s+/).includes(className)) continue;
    const tag = open[1].toLowerCase();
    const start = open.index! + open[0].length;
    const scanner = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, "gi");
    scanner.lastIndex = start;
    let depth = 1;
    for (let m = scanner.exec(html); m; m = scanner.exec(html)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) return html.slice(start, m.index);
    }
    return html.slice(start);
  }
  return null;
}

/** Article text from a page: JSON-LD articleBody, else the longest <article>, else a known content container. */
export function extractArticleText(html: string): string | null {
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const body = findArticleBody(JSON.parse(m[1]));
      if (body) {
        const text = htmlToText(body);
        if (text) return text;
      }
    } catch {
      // Malformed JSON-LD: try the next block.
    }
  }
  let best = "";
  for (const m of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const text = htmlToText(m[1].replace(NON_TEXT_BLOCKS, " "));
    if (text.length > best.length) best = text;
  }
  if (best) return best;
  for (const className of CONTAINER_CLASSES) {
    const inner = elementByClass(html, className);
    const text = inner ? htmlToText(inner.replace(NON_TEXT_BLOCKS, " ")) : "";
    if (text) return text;
  }
  return null;
}

export async function fetchFullText(
  http: Pick<HttpClient, "get">,
  url: string,
  limits: FullTextLimits,
  options: { redirect?: "follow" | "same-host" } = {},
): Promise<{ ok: true; text: string } | { ok: false; reason: FullTextFailure }> {
  let res: { status: number; body: string };
  try {
    res = await http.get(url, options.redirect ? { redirect: options.redirect } : {});
  } catch (error) {
    if (error instanceof RobotsDisallowedError) return { ok: false, reason: "robots" };
    // HttpClient aborts with AbortSignal.timeout, which rejects with a TimeoutError.
    return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "fetch_error" };
  }
  if (res.status < 200 || res.status >= 300) return { ok: false, reason: "http_status" };
  const text = extractArticleText(res.body);
  if (!text) return { ok: false, reason: "no_article_body" };
  if (text.length < limits.minChars) return { ok: false, reason: "too_short" };
  return { ok: true, text: text.slice(0, limits.maxChars) };
}

/**
 * attempted: pages requested. fetched: replaced the feed text. failed: kept the feed text, with
 * `reasons` counting why (labels only). capped: not requested because of the page cap.
 * paywalled: not requested because the item is Paid/Preview (or not Free on a free-only feed).
 */
export type FullTextCounts = {
  attempted: number;
  fetched: number;
  failed: number;
  capped: number;
  paywalled: number;
  reasons: Record<string, number>;
};

export function emptyFullTextCounts(): FullTextCounts {
  return { attempted: 0, fetched: 0, failed: 0, capped: 0, paywalled: 0, reasons: {} };
}

export function addFullTextCounts(a: FullTextCounts, b: FullTextCounts): FullTextCounts {
  const reasons = { ...a.reasons };
  for (const [k, n] of Object.entries(b.reasons)) reasons[k] = (reasons[k] ?? 0) + n;
  return {
    attempted: a.attempted + b.attempted,
    fetched: a.fetched + b.fetched,
    failed: a.failed + b.failed,
    capped: a.capped + b.capped,
    paywalled: a.paywalled + b.paywalled,
    reasons,
  };
}

/** "no_article_body 1, timeout 2", sorted by label; "none" when empty. Labels and counts only. */
export function formatFullTextReasons(reasons: Record<string, number>): string {
  const parts = Object.entries(reasons).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(", ") : "none";
}

/**
 * Replaces feed text with article text for eligible items, in place. `budget.remaining` is the
 * run-wide page cap, shared across feeds. `isStored` skips URLs already in raw_documents, so a
 * page is never fetched twice.
 */
export async function applyFullText(
  http: HttpClient,
  docs: CollectedDoc[],
  scope: FullTextScope,
  limits: FullTextLimits,
  budget: { remaining: number },
  isStored: (url: string) => Promise<boolean>,
): Promise<FullTextCounts> {
  const counts = emptyFullTextCounts();
  for (const doc of docs) {
    const ineligible = fullTextIneligibility(doc, scope);
    if (ineligible && ineligible !== "paywalled") continue;
    if (await isStored(doc.url)) continue;
    if (ineligible === "paywalled") {
      counts.paywalled++;
      continue;
    }
    if (budget.remaining <= 0) {
      counts.capped++;
      continue;
    }
    budget.remaining--;
    counts.attempted++;
    const result = await fetchFullText(http, doc.url, limits);
    const feedChars = doc.rawText?.length ?? 0;
    if (result.ok && result.text.length > feedChars) {
      doc.rawText = result.text;
      doc.textKind = "FULL_TEXT";
      doc.metadata = { ...doc.metadata, full_text: { chars: result.text.length, feed_chars: feedChars } };
      counts.fetched++;
    } else {
      const reason = result.ok ? "not_longer_than_feed_text" : result.reason;
      doc.metadata = { ...doc.metadata, full_text_error: reason };
      counts.failed++;
      counts.reasons[reason] = (counts.reasons[reason] ?? 0) + 1;
    }
  }
  return counts;
}
