/**
 * Source collector (roadmap step 2.1).
 * Fetches the last lookback window from configured feeds, listings, and GDELT into raw_documents.
 * Usage: npm run collect
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { collectFeed, makeKeywordMatcher, type FeedConfig } from "./feeds.mjs";
import { errorMessage, HttpClient, RobotsDisallowedError } from "./fetch.mjs";
import { collectGdelt, type GdeltConfig } from "./gdelt.mjs";
import { collectListing, type ListingConfig } from "./listing.mjs";
import { domainOf, storeDocument, type CollectedDoc, type StoreOutcome } from "./store.mjs";

type CollectorConfig = {
  user_agent: string;
  lookback_hours: number;
  request_timeout_ms: number;
  per_host_interval_ms: number;
  fetch_full_text: boolean;
  keywords: string[];
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
  error?: string;
};

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

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

if (config.fetch_full_text) {
  console.warn("fetch_full_text is true, but full-text fetching is not implemented; storing feed text and metadata only.");
}

const http = new HttpClient(config.user_agent, config.request_timeout_ms, config.per_host_interval_ms);
const matchesKeyword = makeKeywordMatcher(config.keywords);
const since = new Date(Date.now() - config.lookback_hours * 3600_000);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: registry } = await client.query<{ id: string; name: string; home_url: string | null }>(
  "SELECT id, name, home_url FROM sources",
);
const registryByName = new Map(registry.map((s) => [s.name, s.id]));
const registryByDomain = new Map<string, { id: string; name: string }>();
for (const s of registry) {
  if (s.home_url) registryByDomain.set(domainOf(s.home_url), { id: s.id, name: s.name });
}

function sourceIdFor(name: string): string {
  const id = registryByName.get(name);
  if (!id) throw new Error(`source "${name}" is not in the registry`);
  return id;
}

async function run(key: string, method: string, collect: () => Promise<CollectedDoc[]>): Promise<Summary> {
  const summary: Summary = {
    key,
    method,
    fetched: 0,
    outcomes: { new: 0, filtered: 0, duplicate: 0, existing: 0 },
    failedItems: 0,
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
  summaries.push(
    await run(feed.key, "FEED", () =>
      collectFeed(http, feed, sourceIdFor(feed.source), since, matchesKeyword),
    ),
  );
}
for (const listing of config.listings) {
  summaries.push(
    await run(listing.key, "LISTING", () =>
      collectListing(http, listing, sourceIdFor(listing.source), since),
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
    s.outcomes.filtered ? `${s.outcomes.filtered} no keyword match` : "",
    s.error ?? "",
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

if (summaries.some((s) => s.error)) process.exitCode = 1;
