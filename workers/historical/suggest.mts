/**
 * Historical candidate suggester (roadmap Phase 4, Stage 3a): DRY RUN ONLY.
 *
 * Search mode:  npm run historical:suggest -- --period 2021-01 [--limit 10] [--spend-cap 0.50]
 *                                             [--max-searches 2] [--model ID]
 *   Claude (with web search) proposes candidates; this worker fetches each page itself.
 * URL mode:     npm run historical:suggest -- --urls data/historical/urls-2021-01.txt [--period 2021-01]
 *   Reads article URLs (one per line; # comments allowed), fetches each, and asks Claude to extract
 *   candidates from that page only. No web search. --period defaults to the YYYY-MM in the file name.
 *
 * Both modes fetch through the collector's HttpClient (robots.txt, per-host rate limits), skip
 * barred sources, and keep a candidate only if its excerpt is on the page verbatim (20 words or
 * fewer) and the page states its date (verify.mts). Output goes to the terminal only: no database
 * writes, no files. Reads the source registry only. Default model claude-sonnet-5-5.
 * Manual only: refuses to run in CI. Prints secret names, never values.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { isHistoricalMonth } from "@/lib/historical-rules";
import { errorMessage, HttpClient, RobotsDisallowedError } from "../collector/fetch.mjs";
import { domainOf, htmlToText } from "../collector/store.mjs";
import {
  buildPageMessage,
  buildUserMessage,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  type HistoricalCandidate,
} from "./prompt.mjs";
import {
  checkDate,
  checkDomain,
  parseReply,
  sentenceBefore,
  verifyCandidate,
  type DropReason,
  type ParsedReply,
} from "./verify.mjs";
import { loadPolicy } from "./policy.mjs";
import { CANDIDATE_FILE_VERSION, type CandidateFile, type ImportCandidate } from "@/lib/historical-import-rules";

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.error("historical:suggest is manual only and does not run in CI.");
  process.exit(1);
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (existsSync(`${repoRoot}.env.local`)) process.loadEnvFile(`${repoRoot}.env.local`);
for (const name of ["DATABASE_URL_POOLED", "ANTHROPIC_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
}

const { values: args } = parseArgs({
  options: {
    period: { type: "string" },
    urls: { type: "string" },
    limit: { type: "string", default: "10" },
    "spend-cap": { type: "string", default: "0.50" },
    "max-searches": { type: "string", default: "2" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    out: { type: "string" },
    /** URL mode: fetch the pages and print the worst case, then stop before any model call. */
    "estimate-only": { type: "boolean", default: false },
  },
});
const urlsFile = args.urls?.trim() || null;
/** --out: verified candidates as JSON for the admin import page; only under data/historical/candidates/ (git-ignored). */
let outPath: string | null = null;
if (args.out) {
  const scriptRoot = fileURLToPath(new URL("../../", import.meta.url));
  outPath = resolve(args.out);
  const rel = relative(resolve(scriptRoot, "data/historical/candidates"), outPath);
  if (!rel || rel.startsWith("..") || resolve(rel) === rel || !rel.endsWith(".json") || rel.includes("/") || rel.includes("\\")) {
    throw new Error("--out must be a .json file directly under data/historical/candidates/");
  }
}
const period = args.period?.trim() || (urlsFile ? (basename(urlsFile).match(/\d{4}-\d{2}/)?.[0] ?? "") : "");
const limit = Number(args.limit);
const spendCap = Number(args["spend-cap"]);
const maxSearches = Number(args["max-searches"]);
const model = args.model!;
const [periodFrom, periodTo = periodFrom] = period.split(":");
if (!isHistoricalMonth(periodFrom) || !isHistoricalMonth(periodTo) || periodTo < periodFrom || (!urlsFile && periodTo !== periodFrom)) {
  throw new Error(
    "--period must be a month from 2020-08 to 2022-02 (YYYY-MM; in URL mode also YYYY-MM:YYYY-MM), or come from the --urls file name",
  );
}
if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("--limit must be 1-25");
if (!(spendCap > 0)) throw new Error("--spend-cap must be positive");
if (!Number.isInteger(maxSearches) || maxSearches < 1 || maxSearches > 3) throw new Error("--max-searches must be 1-3");

// ---------------------------------------------------------------------------
// Prices and worst-case assumptions
// ---------------------------------------------------------------------------

const PRICE_SOURCE =
  "claude-api skill bundled with Claude Code 2.1.287: model table \"Current Models (cached: 2026-09-25)\" " +
  "(input/output, and cache reads $0.20/MTok for both models); web search \"$10 per 1,000\" from " +
  "shared/managed-agents-core.md (list cost); dynamic-filtering code execution is free with web search " +
  "(shared/tool-use-concepts.md).";
/** USD per million tokens. Only models that support web_search_20260209. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};
const WEB_SEARCH_USD = 10 / 1000;
const MAX_TOKENS = 6_000;
/** Assumption, not a bound: input tokens one search adds. Search results are billed as input and can't be capped. */
const ASSUMED_TOKENS_PER_SEARCH = 35_000;
/** Assumption: output past max_tokens per search (the first run produced 6,175 output tokens with max_tokens 6,000). */
const OUTPUT_OVERRUN_PER_SEARCH = 500;
/** URL mode: pages longer than this are skipped (and reported), never truncated. */
const MAX_PAGE_CHARS = 120_000;
/** URL mode: conservative characters per token for the page-size estimate. */
const CHARS_PER_TOKEN = 2.5;

const price = PRICES[model];
if (!price) throw new Error(`no price entry for model "${model}" (known: ${Object.keys(PRICES).join(", ")})`);
const usd = (input: number, output: number) => (input * price.input + output * price.output) / 1e6;
const searchWorstCase = (inputSoFar: number, searchCount: number) =>
  searchCount * WEB_SEARCH_USD +
  usd(inputSoFar + searchCount * ASSUMED_TOKENS_PER_SEARCH, MAX_TOKENS + searchCount * OUTPUT_OVERRUN_PER_SEARCH);

// ---------------------------------------------------------------------------
// Registry and barred domains (read only)
// ---------------------------------------------------------------------------

const { config, policy, blockedDomains } = await loadPolicy(repoRoot, process.env.DATABASE_URL_POOLED!);

// ---------------------------------------------------------------------------
// Shared state, model calls and page fetches
// ---------------------------------------------------------------------------

const client = new Anthropic();
const http = new HttpClient(config.user_agent, config.request_timeout_ms, config.per_host_interval_ms);
let spent = 0;
let searches = 0;
let inputTokens = 0;
let outputTokens = 0;
const stopNotes: string[] = [];
const pagesFound = new Map<string, string>(); // url -> title (search results, citations, supplied pages)

function record(response: Anthropic.Message): void {
  const u = response.usage;
  const callSearches = u.server_tool_use?.web_search_requests ?? 0;
  searches += callSearches;
  inputTokens += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  outputTokens += u.output_tokens;
  spent +=
    callSearches * WEB_SEARCH_USD +
    usd(u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0), u.output_tokens) +
    ((u.cache_read_input_tokens ?? 0) * price.cacheRead) / 1e6;
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) pagesFound.set(r.url, r.title);
    }
    if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && !pagesFound.has(c.url)) pagesFound.set(c.url, c.title ?? "");
      }
    }
  }
}

const textOf = (response: Anthropic.Message) =>
  response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

type Page = { url: string; html: string; text: string; status: number };
type FetchResult = { ok: true; page: Page } | { ok: false; reason: DropReason; detail: string };
const pageCache = new Map<string, FetchResult>();

async function fetchPage(url: string): Promise<FetchResult> {
  const cached = pageCache.get(url);
  if (cached) return cached;
  let result: FetchResult;
  const domain = checkDomain(url, policy);
  if (domain.kind === "barred") {
    result = { ok: false, reason: "barred source", detail: domain.why };
  } else {
    try {
      const res = await http.get(url);
      result =
        res.status >= 200 && res.status < 300
          ? { ok: true, page: { url, html: res.body, text: htmlToText(res.body), status: res.status } }
          : { ok: false, reason: "fetch failed", detail: `HTTP ${res.status}` };
    } catch (error) {
      result =
        error instanceof RobotsDisallowedError
          ? { ok: false, reason: "robots.txt disallows", detail: error.message }
          : { ok: false, reason: "fetch failed", detail: errorMessage(error) };
    }
  }
  pageCache.set(url, result);
  return result;
}

function printPrices(): void {
  console.log(`historical:suggest ${period} · DRY RUN (nothing is saved) · ${model} · ${PROMPT_VERSION}`);
  console.log(
    `Prices: input $${price.input.toFixed(2)} / output $${price.output.toFixed(2)} per million tokens; ` +
      `web search $${(WEB_SEARCH_USD * 1000).toFixed(2)} per 1,000 searches ($${WEB_SEARCH_USD.toFixed(2)} each).`,
  );
  console.log(`Source: ${PRICE_SOURCE}`);
}

// ---------------------------------------------------------------------------
// Mode 1: search
// ---------------------------------------------------------------------------

async function runSearch(): Promise<ParsedReply[]> {
  const tools: Anthropic.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: maxSearches, blocked_domains: blockedDomains },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserMessage(period, limit, blockedDomains) }];
  let promptTokens: number;
  try {
    promptTokens = (await client.messages.countTokens({ model, system: SYSTEM_PROMPT, messages, tools })).input_tokens;
  } catch {
    promptTokens = Math.ceil((SYSTEM_PROMPT.length + JSON.stringify(messages).length) / CHARS_PER_TOKEN);
  }
  const worst = searchWorstCase(promptTokens, maxSearches);
  printPrices();
  console.log(
    `Worst case per call: ${maxSearches} searches × $${WEB_SEARCH_USD.toFixed(2)} + input (${promptTokens} prompt + ` +
      `${maxSearches} × ${ASSUMED_TOKENS_PER_SEARCH} assumed per search) + output (${MAX_TOKENS} max + ` +
      `${maxSearches} × ${OUTPUT_OVERRUN_PER_SEARCH} assumed overrun) = $${worst.toFixed(4)} (cap $${spendCap.toFixed(2)}).`,
  );
  console.log(
    "A call in progress can't be stopped: the cap is checked before each call starts, using the assumptions above, " +
      "not the actual search results, which are billed as input and can't be capped.",
  );

  let nextInput = promptTokens;
  let reply = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const remaining = Math.max(0, maxSearches - searches);
    const thisWorst = searchWorstCase(nextInput, remaining);
    if (spent + thisWorst > spendCap) {
      stopNotes.push(`call ${attempt} not started: spent $${spent.toFixed(4)} + worst case $${thisWorst.toFixed(4)} > cap $${spendCap.toFixed(2)}`);
      break;
    }
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      output_config: { effort: "medium" },
    });
    record(response);
    if (response.stop_reason === "refusal") {
      stopNotes.push(`model declined (${response.stop_details?.category ?? "no category"})`);
      break;
    }
    reply = textOf(response);
    if (response.stop_reason !== "pause_turn") {
      stopNotes.push(`stop_reason ${response.stop_reason}`);
      break;
    }
    nextInput = response.usage.input_tokens + response.usage.output_tokens;
    messages.push({ role: "assistant", content: response.content });
  }
  const parsed = parseReply(reply);
  return parsed ? [parsed] : [{ candidates: [], shortfallReason: null, otherText: reply.trim() }];
}

// ---------------------------------------------------------------------------
// Mode 2: URL-seeded (no web search)
// ---------------------------------------------------------------------------

async function runUrls(file: string): Promise<ParsedReply[]> {
  const urls = [
    ...new Set(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    ),
  ];
  printPrices();
  console.log(`URL mode: ${urls.length} URL(s) from ${file}; no web search.`);

  // Fetch first, so the worst case uses each page's real size.
  const pages: Page[] = [];
  for (const raw of urls) {
    let url: string;
    try {
      url = new URL(raw).href;
    } catch {
      console.log(`  skipped (not a URL): ${raw}`);
      continue;
    }
    const fetched = await fetchPage(url);
    if (!fetched.ok) {
      console.log(`  skipped (${fetched.reason}: ${fetched.detail}): ${url}`);
      continue;
    }
    if (fetched.page.text.length > MAX_PAGE_CHARS) {
      console.log(`  skipped (page text ${fetched.page.text.length} chars > ${MAX_PAGE_CHARS}; not truncated): ${url}`);
      continue;
    }
    pages.push(fetched.page);
  }
  const promptChars = SYSTEM_PROMPT.length + 600;
  const pageWorst = (p: Page) => usd(Math.ceil((promptChars + p.text.length) / CHARS_PER_TOKEN), MAX_TOKENS);
  const total = pages.reduce((s, p) => s + pageWorst(p), 0);
  console.log(
    `Worst case: ${pages.length} page(s), input at ${CHARS_PER_TOKEN} characters per token + output ${MAX_TOKENS} max per page = ` +
      `$${total.toFixed(4)} (cap $${spendCap.toFixed(2)}). Pages are processed in order while spent + the next page's worst case fits.`,
  );
  console.log("A call in progress can't be stopped: the cap is checked before each call starts.");
  if (args["estimate-only"]) {
    console.log(`Estimate only: ${pages.length} page(s) fetched, worst case $${total.toFixed(4)}; no model calls made.`);
    process.exit(0);
  }

  const replies: ParsedReply[] = [];
  for (const page of pages) {
    const worst = pageWorst(page);
    if (spent + worst > spendCap) {
      stopNotes.push(`stopped before ${page.url}: spent $${spent.toFixed(4)} + worst case $${worst.toFixed(4)} > cap`);
      break;
    }
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPageMessage(period, limit, page) }],
      output_config: { effort: "medium" },
    });
    record(response);
    pagesFound.set(page.url, "(supplied)");
    if (response.stop_reason === "refusal") {
      stopNotes.push(`model declined ${page.url} (${response.stop_details?.category ?? "no category"})`);
      continue;
    }
    const text = textOf(response);
    const parsed = parseReply(text) ?? { candidates: [], shortfallReason: null, otherText: text.trim() };
    // The page is the only source in this mode.
    parsed.candidates = parsed.candidates.map((c) => ({ ...c, url: page.url }));
    replies.push({ ...parsed, source: page.url });
  }
  return replies;
}

// ---------------------------------------------------------------------------
// Verify, print, summarize
// ---------------------------------------------------------------------------

const replies = urlsFile ? await runUrls(urlsFile) : await runSearch();

console.log("\nModel notes:");
for (const r of replies) {
  const where = r.source ? ` (${r.source})` : "";
  if (r.source && r.candidates.length === 0) {
    console.log(`  no candidate${where}: ${r.shortfallReason ?? "the model gave no reason"}`);
  } else if (r.shortfallReason) {
    console.log(`  shortfall reason${where}: ${r.shortfallReason}`);
  }
  if (r.otherText) {
    const shown = r.otherText.length > 2000 ? `${r.otherText.slice(0, 2000)} … (first 2,000 of ${r.otherText.length} chars)` : r.otherText;
    console.log(`  other text${where}: ${shown.replace(/\n+/g, " ")}`);
  }
}
if (replies.every((r) => !r.shortfallReason && !r.otherText && r.candidates.length > 0)) console.log("  (none)");

console.log(`\nPages found (${pagesFound.size}):`);
for (const [url, title] of pagesFound) console.log(`  ${url}${title ? ` · ${title}` : ""}`);

const candidates = replies.flatMap((r) => r.candidates).slice(0, limit);
type Drop = { reason: DropReason; detail: string; candidate: HistoricalCandidate };
const drops: Drop[] = [];
const fetchedPages = new Map<string, { status: string; date: string[] }>();
let kept = 0;
const saved: ImportCandidate[] = [];
let unregistered = 0;
/** Search mode: at most this many candidates from one site. */
const MAX_PER_DOMAIN = 3;
const perDomain = new Map<string, number>();

console.log(`\nModel returned ${candidates.length} candidate(s); checking each page.\n`);
for (const c of candidates) {
  const drop = (reason: DropReason, detail: string) => drops.push({ reason, detail, candidate: c });
  let url: string;
  try {
    const parsedUrl = new URL(c.url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error("not http(s)");
    url = parsedUrl.href;
  } catch {
    drop("invalid candidate", "URL is not a valid http(s) URL");
    continue;
  }
  const host = domainOf(url);
  const seen = (perDomain.get(host) ?? 0) + 1;
  perDomain.set(host, seen);
  // Search mode only: in URL mode the editor chose every page.
  if (!urlsFile && seen > MAX_PER_DOMAIN) {
    drop("domain limit", `more than ${MAX_PER_DOMAIN} candidates from ${host}`);
    continue;
  }
  const fetched = await fetchPage(url);
  const entry = fetchedPages.get(url) ?? { status: "", date: [] };
  fetchedPages.set(url, entry);
  if (!fetched.ok) {
    entry.status = `${fetched.reason}: ${fetched.detail}`;
    drop(fetched.reason, fetched.detail);
    continue;
  }
  entry.status = `HTTP ${fetched.page.status}`;
  const date = checkDate(c, fetched.page);
  entry.date.push(`${c.event_date}: ${date.ok ? `PASS (${date.rule})` : `FAIL (${date.detail})`}`);

  const result = verifyCandidate(c, fetched.page, period);
  if (!result.ok) {
    drop(result.reason, result.detail);
    continue;
  }
  kept += 1;
  const today = new Date().toISOString().slice(0, 10);
  const domain = checkDomain(url, policy);
  const v = result.candidate;
  saved.push({
    id: createHash("sha1").update(`${url}|${v.event_date}|${v.headline}`).digest("hex").slice(0, 12),
    url,
    publisher: v.publisher,
    event_date: v.event_date,
    reported_date: result.reportedDate,
    date_rule: result.dateRule,
    date_quote: v.date_excerpt,
    event_type: v.event_type,
    headline: v.headline,
    summary: v.summary,
    actor: v.actor,
    country: v.country,
    location_name: v.location_name,
    exercise_name: v.exercise_name,
    excerpt: v.supporting_excerpt,
    excerpt_supports: `${v.excerpt_supports} Region: ${v.region_reason}`,
    flags: result.flags,
    accessed_at: today,
  });
  const sourceLine =
    domain.kind === "registered"
      ? `${domain.source.name} (${host}) · registered, Tier ${domain.source.tier ?? "—"}`
      : `${c.publisher} (${host}) · NOT REGISTERED (cannot be saved until the source is added)`;
  if (domain.kind === "unregistered") unregistered += 1;
  console.log(`[${kept}] ${v.headline}`);
  console.log(`    event date: ${v.event_date} · reported_date: ${result.reportedDate ?? "unknown"} · date rule: ${result.dateRule}`);
  console.log(`    source: ${sourceLine}`);
  console.log(`    excerpt: "${v.supporting_excerpt}"  |  supports: ${v.excerpt_supports} Region: ${v.region_reason}`);
  const before = sentenceBefore(fetched.page.text, v.supporting_excerpt);
  if (before) console.log(`    sentence before (the excerpt starts with a pronoun): "${before}"`);
  console.log(`    date quote: "${v.date_excerpt}"`);
  console.log(`    actor: ${v.actor ?? "—"} · url: ${url}`);
  for (const flag of result.flags) console.log(`    flag: ${flag}`);
  console.log("");
}

console.log(`Pages fetched (${fetchedPages.size}):`);
for (const [url, p] of fetchedPages) {
  console.log(`  ${url} · ${p.status}`);
  for (const d of p.date) console.log(`      date rule ${d}`);
}

const byReason = new Map<string, number>();
for (const d of drops) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
console.log(
  `\nKept ${kept} (${kept - unregistered} registered, ${unregistered} unregistered) · dropped ${drops.length}` +
    (drops.length ? `: ${[...byReason].map(([r, n]) => `${r} ${n}`).join(", ")}` : ""),
);
for (const d of drops) {
  const c = d.candidate;
  console.log(`  dropped (${d.reason}): ${c.headline}`);
  console.log(`      why: ${d.detail}`);
  console.log(`      date the model gave: ${c.event_date} · date quote: "${c.date_excerpt}"`);
  console.log(`      excerpt: "${c.supporting_excerpt}"  |  supports: ${c.excerpt_supports ?? "—"}`);
  console.log(`      url: ${c.url}`);
}
console.log(
  `Spend: $${spent.toFixed(4)} (cap $${spendCap.toFixed(2)}) · ${searches} searches · ${inputTokens} input tokens · ` +
    `${outputTokens} output tokens${stopNotes.length ? ` · ${stopNotes.join("; ")}` : ""}`,
);
console.log(
  kept > 0 ? `Cost per surviving candidate: $${(spent / kept).toFixed(4)} (${kept} kept)` : "Cost per surviving candidate: n/a (none kept)",
);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const file: CandidateFile = {
    version: CANDIDATE_FILE_VERSION,
    generated_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model,
    period,
    mode: urlsFile ? "urls" : "search",
    candidates: saved,
  };
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}
`, "utf8");
  console.log(`Wrote ${saved.length} verified candidate(s) to ${relative(process.cwd(), outPath)} (git-ignored). Nothing was saved to the database.`);
} else {
  console.log("Nothing was saved (dry run).");
}
