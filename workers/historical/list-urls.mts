/**
 * Archive listing helper for the historical URL mode (no model calls).
 *
 * Usage: npm run historical:list-urls -- --listing <url> --pages <first>-<last>
 *                                        --from 2021-01-01 --to 2021-02-28 [--match <regex>] [--out data/historical/urls-2021-01.txt]
 *
 * Fetches each listing page (?page=N) through the collector's HttpClient (robots.txt, per-host
 * rate limits), extracts article links, and keeps those whose URL date or listing date falls in
 * the range. Barred and no_ai_processing sources are skipped. Prints date, title, URL, and flags
 * links whose URL date and listing date disagree. Writes nothing unless --out is given, and --out
 * must be under data/historical/ (git-ignored). Reads the source registry only.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { errorMessage, HttpClient, RobotsDisallowedError } from "../collector/fetch.mjs";
import { domainOf } from "../collector/store.mjs";
import { pageUrl, parseListing, type ListingItem } from "./listing.mjs";
import { loadPolicy } from "./policy.mjs";
import { checkDomain } from "./verify.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (existsSync(`${repoRoot}.env.local`)) process.loadEnvFile(`${repoRoot}.env.local`);
if (!process.env.DATABASE_URL_POOLED) {
  console.error("DATABASE_URL_POOLED is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    listing: { type: "string" },
    pages: { type: "string", default: "0-0" },
    from: { type: "string" },
    to: { type: "string" },
    out: { type: "string" },
    match: { type: "string" },
  },
});
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const listing = args.listing?.trim() ?? "";
const pagesMatch = args.pages!.match(/^(\d+)(?:-(\d+))?$/);
if (!/^https?:\/\//.test(listing)) throw new Error("--listing must be an http(s) URL");
if (!pagesMatch) throw new Error("--pages must be N or N-M");
const firstPage = Number(pagesMatch[1]);
const lastPage = Number(pagesMatch[2] ?? pagesMatch[1]);
if (lastPage < firstPage || lastPage - firstPage > 100) throw new Error("--pages: last must be >= first, at most 101 pages");
const from = args.from ?? "";
const to = args.to ?? "";
if (!ISO.test(from) || !ISO.test(to) || to < from) throw new Error("--from and --to must be YYYY-MM-DD, from <= to");

let outPath: string | null = null;
if (args.out) {
  outPath = resolve(args.out);
  const rel = relative(resolve(repoRoot, "data/historical"), outPath);
  if (rel.startsWith("..") || rel === "" || resolve(rel) === rel) {
    throw new Error("--out must be a file under data/historical/ (git-ignored)");
  }
}

const { config, policy } = await loadPolicy(repoRoot, process.env.DATABASE_URL_POOLED);
const listingCheck = checkDomain(listing, policy);
if (listingCheck.kind === "barred") {
  console.error(`The listing's site is barred (${listingCheck.why}); not fetching.`);
  process.exit(1);
}

const http = new HttpClient(config.user_agent, config.request_timeout_ms, config.per_host_interval_ms);
const inRange = (d: string | null) => d !== null && d >= from && d <= to;
/** Optional: keep only URLs matching this pattern (case-insensitive), e.g. to pick articles by slug. */
const match = args.match ? new RegExp(args.match, "i") : null;

const kept = new Map<string, ListingItem>();
let fetched = 0;
let skippedBarred = 0;
console.log(`Listing ${listing} · pages ${firstPage}-${lastPage} · range ${from} to ${to} · no model calls`);
for (let page = firstPage; page <= lastPage; page++) {
  const url = pageUrl(listing, page);
  let body: string;
  try {
    const res = await http.get(url);
    fetched += 1;
    if (res.status < 200 || res.status >= 300) {
      console.log(`  page ${page}: HTTP ${res.status}; stopping`);
      break;
    }
    body = res.body;
  } catch (error) {
    console.log(`  page ${page}: ${error instanceof RobotsDisallowedError ? "robots.txt disallows" : errorMessage(error)}; stopping`);
    break;
  }
  const items = parseListing(body, url);
  const dates = items.map((i) => i.listingDate ?? i.urlDate!).sort();
  let pageKept = 0;
  for (const item of items) {
    if (!inRange(item.urlDate) && !inRange(item.listingDate)) continue;
    if (match && !match.test(item.url)) continue;
    if (checkDomain(item.url, policy).kind === "barred") {
      skippedBarred += 1;
      continue;
    }
    if (!kept.has(item.url)) {
      kept.set(item.url, item);
      pageKept += 1;
    }
  }
  console.log(
    `  page ${page}: ${items.length} links, dates ${dates[0] ?? "—"} to ${dates.at(-1) ?? "—"}, ${pageKept} in range`,
  );
  if (items.length === 0) break;
}

const rows = [...kept.values()].sort((a, b) =>
  (a.listingDate ?? a.urlDate!).localeCompare(b.listingDate ?? b.urlDate!),
);
console.log(`\n${rows.length} article(s) in range from ${fetched} page(s) fetched${skippedBarred ? ` · ${skippedBarred} barred skipped` : ""}:\n`);
const mismatches: ListingItem[] = [];
for (const r of rows) {
  const date = r.listingDate ?? r.urlDate!;
  const mismatch = r.urlDate && r.listingDate && r.urlDate !== r.listingDate;
  if (mismatch) mismatches.push(r);
  console.log(`${date}  ${r.title}`);
  console.log(`            ${r.url}${mismatch ? `   ⚠ URL date ${r.urlDate} ≠ listing date ${r.listingDate}` : ""}`);
}
console.log(`\nURL/listing date disagreements: ${mismatches.length}`);

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const lines = [`# ${listing} · pages ${firstPage}-${lastPage} · ${from} to ${to} · ${domainOf(listing)}`];
  for (const r of rows) lines.push(`# ${r.listingDate ?? r.urlDate} ${r.title}`, r.url);
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${rows.length} URL(s) to ${relative(repoRoot, outPath)} (git-ignored).`);
} else {
  console.log("Nothing written (no --out).");
}
