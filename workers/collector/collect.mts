/**
 * Source collector (roadmap step 2.1).
 * Fetches the last lookback window from configured feeds, listings, and GDELT into raw_documents.
 * Usage: npm run collect -- [--ci]
 * --ci writes GitHub Actions step outputs (counts only).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { setOutput } from "../lib/ci.mjs";
import {
  addFullTextCounts,
  applyFullText,
  emptyFullTextCounts,
  formatFullTextReasons,
  fullTextBarredDomains,
  type FullTextCounts, type FullTextLimits, type FullTextScope } from "./article.mjs";
import {
  collectFeed,
  makeCreditExtractor,
  makeKeywordMatcher,
  makePolishMatcher,
  makeRegionMatcher,
  type FeedConfig,
  type FeedMatchers,
} from "./feeds.mjs";
import { errorMessage, HttpClient, RobotsDisallowedError } from "./fetch.mjs";
import { collectGdelt, type GdeltConfig } from "./gdelt.mjs";
import { collectListing, type ListingConfig } from "./listing.mjs";
import { buildRegistry, type RegistryRow } from "./registry.mjs";
import { domainOf, storeDocument, urlExists, type CollectedDoc, type StoreOutcome } from "./store.mjs";

type CollectorConfig = {
  user_agent: string;
  lookback_hours: number;
  request_timeout_ms: number;
  per_host_interval_ms: number;
  /** Master switch for article-page fetching; feeds and listings also opt in with full_text. */
  fetch_full_text: boolean;
  full_text_max_pages: number;
  full_text_max_chars: number;
  full_text_min_chars: number;
  no_ai_processing_sources: string[];
  lead_only_sources: string[];
  citation_only_sources: string[];
  blocked_automated_access: string[];
  tos_prohibited_domains: string[];
  keywords: string[];
  region_terms: string[];
  region_terms_pl: string[];
  region_terms_lt: string[];
  region_terms_lv: string[];
  region_terms_ru: string[];
  keyword_stems_lt: string[];
  keyword_stems_lv: string[];
  keyword_stems_ru: string[];
  keyword_whole_words_ru: string[];
  keyword_stems_pl: string[];
  keyword_whole_words_pl: string[];
  known_outlets: string[];
  feeds: FeedConfig[];
  listings: ListingConfig[];
  gdelt: GdeltConfig;
};

type Summary = {
  key: string;
  method: string;
  fetched: number;
  outcomes: Record<StoreOutcome, number>;
  failedItems: number;
  /** Items the feed marks Paid: stored as title and link only. */
  paid: number;
  /** Article pages fetched for full text, failed (kept feed text), or not fetched because of the page cap. */
  fullText: FullTextCounts;
  error?: string;
  /** Not an error: e.g. the feed was not read because of its read limit. */
  note?: string;
};

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const { values: args } = parseArgs({
  options: { ci: { type: "boolean", default: false } },
});

// DATABASE_URL may already be set (CI); otherwise read .env.local. Values are never printed.
const envFile = `${repoRoot}.env.local`;
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const config = JSON.parse(
  readFileSync(`${repoRoot}data/sources/collector.json`, "utf8"),
) as CollectorConfig;

// The Polish filter is only for feeds tagged Polish; anything else is a config error.
for (const feed of config.feeds) {
  if (feed.polish_filter && feed.language !== "Polish") {
    throw new Error(`feed "${feed.key}": polish_filter needs language "Polish" (got "${feed.language}")`);
  }
  const stemLanguage = { lt: "Lithuanian", lv: "Latvian", ru: "Russian" } as const;
  if (feed.stem_filter && feed.language !== stemLanguage[feed.stem_filter]) {
    throw new Error(`feed "${feed.key}": stem_filter "${feed.stem_filter}" needs language "${stemLanguage[feed.stem_filter]}" (got "${feed.language}")`);
  }
}

const http = new HttpClient(config.user_agent, config.request_timeout_ms, config.per_host_interval_ms);
const since = new Date(Date.now() - config.lookback_hours * 3600_000);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: registry } = await client.query<RegistryRow>(
  "SELECT id, name, home_url, historical_only FROM sources",
);
// Sources whose rows must never be sent to an AI model, however they were collected.
const noAiSources = new Set([
  ...config.no_ai_processing_sources,
  ...config.feeds.filter((f) => f.no_ai_processing).map((f) => f.source),
  ...config.listings.filter((l) => l.no_ai_processing).map((l) => l.source),
]);
// Sources whose rows are leads only, however they were collected.
const leadOnlySources = new Set([
  ...config.lead_only_sources,
  ...config.feeds.filter((f) => f.lead_only).map((f) => f.source),
]);
// Historical-only sources are refused by sourceIdFor and left out of the domain map.
const { sourceIdFor, byDomain: registryByDomain } = buildRegistry(registry, { noAiSources, leadOnlySources });

const matchers: FeedMatchers = {
  keyword: makeKeywordMatcher(config.keywords),
  polish: makePolishMatcher(config.keyword_stems_pl, config.keyword_whole_words_pl),
  // NATO and Zapad (keyword_whole_words_pl) are language-neutral, so the Lithuanian and Latvian filters use them too.
  stems: {
    lt: makePolishMatcher(config.keyword_stems_lt, config.keyword_whole_words_pl),
    lv: makePolishMatcher(config.keyword_stems_lv, config.keyword_whole_words_pl),
    ru: makePolishMatcher(config.keyword_stems_ru, config.keyword_whole_words_ru),
  },
  region: makeRegionMatcher(config.region_terms, config.region_terms_pl),
  regionByLanguage: {
    Lithuanian: makeRegionMatcher(config.region_terms, config.region_terms_pl, config.region_terms_lt),
    Latvian: makeRegionMatcher(config.region_terms, config.region_terms_pl, config.region_terms_lv),
    Russian: makeRegionMatcher(config.region_terms, config.region_terms_pl, config.region_terms_ru),
  },
  credits: makeCreditExtractor([...new Set([...config.known_outlets, ...registry.filter((s) => !s.historical_only).map((s) => s.name)])]),
};

// Full text (article.mts): domains never fetched, each source's own domain, and the run's page cap.
const homeDomainOf = (name: string): string | null => {
  const home = registry.find((s) => s.name === name)?.home_url;
  return home ? domainOf(home) : null;
};
const barredDomains = fullTextBarredDomains(
  {
    blocked: config.blocked_automated_access,
    prohibited: config.tos_prohibited_domains,
    citationOnly: config.citation_only_sources,
    noAi: noAiSources,
  },
  homeDomainOf,
);
const fullTextLimits: FullTextLimits = { maxChars: config.full_text_max_chars, minChars: config.full_text_min_chars };
const pageBudget = { remaining: config.full_text_max_pages };
const fullTextScope = (source: string, optedIn: boolean | undefined, freeOnly?: boolean): FullTextScope => ({
  masterOn: config.fetch_full_text,
  optedIn: optedIn === true,
  homeDomain: homeDomainOf(source),
  barredDomains,
  freeOnly: freeOnly === true,
});

/** Hours since this collector key last stored a row, or null if it never has. */
async function hoursSinceLastRead(key: string): Promise<number | null> {
  const { rows } = await client.query<{ last: Date | null }>(
    "SELECT max(fetched_at) AS last FROM raw_documents WHERE collector_key = $1",
    [key],
  );
  return rows[0].last ? (Date.now() - rows[0].last.getTime()) / 3600_000 : null;
}

async function run(
  key: string,
  method: string,
  collect: () => Promise<CollectedDoc[]>,
  fullText?: FullTextScope,
): Promise<Summary> {
  const summary: Summary = {
    key,
    method,
    fetched: 0,
    outcomes: { new: 0, filtered: 0, duplicate: 0, existing: 0 },
    failedItems: 0,
    paid: 0,
    fullText: emptyFullTextCounts(),
  };
  let docs: CollectedDoc[];
  try {
    docs = await collect();
  } catch (error) {
    summary.error =
      error instanceof RobotsDisallowedError ? `blocked: ${error.message}` : errorMessage(error);
    return summary;
  }
  summary.fetched = docs.length;
  summary.paid = docs.filter((d) => d.metadata.pay_status === "Paid").length;
  if (fullText) {
    summary.fullText = await applyFullText(http, docs, fullText, fullTextLimits, pageBudget, (url) => urlExists(client, url));
  }
  for (const doc of docs) {
    try {
      summary.outcomes[await storeDocument(client, doc)]++;
    } catch (error) {
      summary.failedItems++;
      summary.error ??= `store failed: ${errorMessage(error)}`;
    }
  }
  return summary;
}

const summaries: Summary[] = [];
for (const feed of config.feeds) {
  if (feed.min_hours_between_reads) {
    const hours = await hoursSinceLastRead(feed.key);
    if (hours !== null && hours < feed.min_hours_between_reads) {
      summaries.push({
        key: feed.key,
        method: "FEED",
        fetched: 0,
        outcomes: { new: 0, filtered: 0, duplicate: 0, existing: 0 },
        failedItems: 0,
        paid: 0,
        fullText: emptyFullTextCounts(),
        note: `not read: last read ${hours.toFixed(1)}h ago (limit: once per ${feed.min_hours_between_reads}h)`,
      });
      continue;
    }
  }
  summaries.push(
    await run(
      feed.key,
      "FEED",
      () => collectFeed(http, feed, sourceIdFor(feed.source), since, matchers),
      fullTextScope(feed.source, feed.full_text, feed.full_text_free_only),
    ),
  );
}
for (const listing of config.listings) {
  summaries.push(
    await run(
      listing.key,
      "LISTING",
      () => collectListing(http, listing, sourceIdFor(listing.source), since, matchers.region),
      fullTextScope(listing.source, listing.full_text),
    ),
  );
}
for (const query of config.gdelt.queries) {
  summaries.push(
    await run(query.key, "GDELT", () =>
      collectGdelt(http, config.gdelt, query, config.lookback_hours, registryByDomain),
    ),
  );
}
await client.end();

// Summary: counts only, never row text.
console.log(`\nCollector run · window: last ${config.lookback_hours}h · ${new Date().toISOString()}\n`);
const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(
  `${pad("SOURCE", 26)}${pad("VIA", 9)}${pad("FETCHED", 9)}${pad("NEW", 6)}${pad("SKIPPED", 9)}${pad("FAILED", 8)}DETAIL`,
);
const total = { fetched: 0, new: 0, skipped: 0, failed: 0 };
for (const s of summaries) {
  const skipped = s.outcomes.existing + s.outcomes.duplicate + s.outcomes.filtered;
  const failed = s.error && s.fetched === 0 ? 1 : s.failedItems;
  const detail = [
    s.outcomes.existing ? `${s.outcomes.existing} already stored` : "",
    s.outcomes.duplicate ? `${s.outcomes.duplicate} duplicate content` : "",
    s.outcomes.filtered ? `${s.outcomes.filtered} filtered out (keyword/region)` : "",
    s.paid ? `${s.paid} paid (title and link only)` : "",
    s.fullText.fetched ? `${s.fullText.fetched} full text` : "",
    s.fullText.failed ? `${s.fullText.failed} full-text failed (feed text kept)` : "",
    s.fullText.capped ? `${s.fullText.capped} over the page cap` : "",
    s.note ?? "",
    s.error ? (args.ci ? shortReason(s.error) : s.error) : "",
  ]
    .filter(Boolean)
    .join("; ");
  console.log(
    `${pad(s.key, 26)}${pad(s.method, 9)}${pad(s.fetched, 9)}${pad(s.outcomes.new, 6)}${pad(skipped, 9)}${pad(failed, 8)}${detail}`,
  );
  total.fetched += s.fetched;
  total.new += s.outcomes.new;
  total.skipped += skipped;
  total.failed += failed;
}
console.log(
  `${pad("TOTAL", 35)}${pad(total.fetched, 9)}${pad(total.new, 6)}${pad(total.skipped, 9)}${total.failed}`,
);
const fullTextTotal = summaries.reduce((t, s) => addFullTextCounts(t, s.fullText), emptyFullTextCounts());
const fullTextReasons = formatFullTextReasons(fullTextTotal.reasons);
console.log(
  `Full text: ${config.fetch_full_text ? "on" : "off"} · ${fullTextTotal.attempted} attempted · ${fullTextTotal.fetched} succeeded · ${fullTextTotal.failed} fell back (${fullTextReasons}) · ${fullTextTotal.paywalled} paywalled, not fetched · ${fullTextTotal.capped} over the cap of ${config.full_text_max_pages} pages`,
);

// A few failing sources are warnings; the run fails only when more than half fail.
// (A database or config failure throws earlier and exits non-zero.)
const failedSources = summaries.filter((s) => s.error);
const tooManyFailed = failedSources.length > summaries.length / 2;
if (failedSources.length > 0) {
  console.log(
    `\n${failedSources.length} of ${summaries.length} sources failed${tooManyFailed ? ": more than half, failing the run" : " (warning only)"}`,
  );
}

// Reached only when every source was tried, so a partial failure still lets the extractor run.
if (args.ci) {
  if (!tooManyFailed) {
    for (const s of failedSources) console.log(`::warning title=Collector source failed::${s.key}: ${shortReason(s.error!)}`);
  }
  setOutput("completed", "true");
  setOutput("new_rows", total.new);
  setOutput("failed_sources", failedSources.length);
  setOutput("total_sources", summaries.length);
  setOutput("warned_sources", failedSources.map((s) => `${s.key} (${shortReason(s.error!)})`).join(", "));
  setOutput("full_text_attempted", fullTextTotal.attempted);
  setOutput("full_text_fetched", fullTextTotal.fetched);
  setOutput("full_text_failed", fullTextTotal.failed);
  setOutput("full_text_capped", fullTextTotal.capped);
  setOutput("full_text_paywalled", fullTextTotal.paywalled);
  // Reason labels and counts only (never URLs or titles).
  setOutput("full_text_reasons", fullTextReasons);
}
if (tooManyFailed) process.exitCode = 1;

/**
 * A short, log-safe reason for public CI output: fixed labels where an error message can carry
 * response text, URLs removed, one line, at most 80 characters.
 */
function shortReason(error: string): string {
  if (error.startsWith("GDELT did not return JSON")) return "GDELT did not return JSON";
  return error
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[\r\n%,]+/g, " ")
    .slice(0, 80);
}
