/**
 * Archive probe for the historical record (no model calls): walks a source's dated listing pages
 * through the collector's HttpClient (robots.txt, per-host rate limits), buckets article links
 * Aug 2020 – Feb 2022 into five periods, applies the title keyword prefilter, prints counts
 * before and after it with the estimated URL-mode cost, and writes the filtered lists to
 * git-ignored files under data/historical/ (URL-mode format).
 *
 * Usage: npm run historical:probe-archive -- --source osw
 * Only sources whose robots.txt and terms were checked are configured here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { errorMessage, HttpClient } from "../collector/fetch.mjs";
import { matchesMilitaryKeywords, matchesOswContext } from "./keywords.mjs";
import { pageUrl, parseListing, type ListingItem } from "./listing.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const USD_PER_PAGE = 0.015;

export const PERIODS = [
  { id: "2020-08_2020-12", label: "Aug-Dec 2020", from: "2020-08-01", to: "2020-12-31" },
  { id: "2021-01_2021-04", label: "Jan-Apr 2021", from: "2021-01-01", to: "2021-04-30" },
  { id: "2021-05_2021-08", label: "May-Aug 2021", from: "2021-05-01", to: "2021-08-31" },
  { id: "2021-09_2021-12", label: "Sep-Dec 2021", from: "2021-09-01", to: "2021-12-31" },
  { id: "2022-01_2022-02", label: "Jan-Feb 2022", from: "2022-01-01", to: "2022-02-28" },
] as const;

/** Each listing is walked from page 0 (newest first) until a page is entirely older than `stopBefore`. */
type SourceConfig = {
  name: string;
  /** `url` takes ?page=N from 0, unless it contains {n} (path paging, from 1). */
  listings: Array<{ url: string; stopBefore: string }>;
  /** Title prefilter; defaults to the military-keyword filter. */
  filter?: (title: string) => boolean;
};

/** OSW publication-type facets: 481 Analyses, 42 OSW Commentary; plus a publication-year facet. */
const oswListing = (type: number, year: number, stopBefore: string) => ({
  url: `https://www.osw.waw.pl/en/publikacje?f%5B0%5D=publikacje%3A${type}&f%5B1%5D=data_wydania%3A${year}`,
  stopBefore,
});
const SOURCES: Record<string, SourceConfig> = {
  osw: {
    name: "OSW analyses and commentary (English)",
    listings: [
      oswListing(481, 2020, "2020-08-01"),
      oswListing(481, 2021, "2021-01-01"),
      oswListing(481, 2022, "2022-01-01"),
      oswListing(42, 2020, "2020-08-01"),
      oswListing(42, 2021, "2021-01-01"),
      oswListing(42, 2022, "2022-01-01"),
    ],
    filter: matchesOswContext,
  },
  icds: {
    name: "ICDS publications (English)",
    listings: [{ url: "https://icds.ee/en/category/publications/page/{n}/", stopBefore: "2020-08-01" }],
    filter: matchesOswContext,
  },
};

/** The URL of listing page `page` (0-based); {n} templates are 1-based. */
function listingPage(url: string, page: number): string {
  return url.includes("{n}") ? url.replace("{n}", String(page + 1)) : pageUrl(url, page);
}

export function periodOf(date: string): (typeof PERIODS)[number] | null {
  return PERIODS.find((p) => date >= p.from && date <= p.to) ?? null;
}

const { values: args } = parseArgs({ options: { source: { type: "string" }, "max-pages": { type: "string", default: "40" } } });
const config = SOURCES[args.source ?? ""];
if (!config) throw new Error(`--source must be one of: ${Object.keys(SOURCES).join(", ")}`);
const maxPages = Number(args["max-pages"]);

const http = new HttpClient("NortheastFlankMonitor-collector/0.1", 25_000, 3_000);
const items = new Map<string, ListingItem & { date: string }>();
let fetched = 0;
for (const listing of config.listings) {
  for (let page = 0; page < maxPages; page++) {
    let body: string;
    try {
      const res = await http.get(listingPage(listing.url, page));
      fetched += 1;
      if (res.status !== 200) break;
      body = res.body;
    } catch (error) {
      console.log(`  ${listingPage(listing.url, page)}: ${errorMessage(error)}; stopping this listing`);
      break;
    }
    const pageItems = parseListing(body, listingPage(listing.url, page));
    if (pageItems.length === 0) break;
    for (const it of pageItems) {
      const date = it.listingDate ?? it.urlDate!;
      if (periodOf(date) && !items.has(it.url)) items.set(it.url, { ...it, date });
    }
    const oldest = pageItems.map((i) => i.listingDate ?? i.urlDate!).sort()[0];
    if (oldest < listing.stopBefore) break;
  }
}

mkdirSync(`${repoRoot}data/historical`, { recursive: true });
console.log(`${config.name}: ${fetched} listing page(s) fetched, ${items.size} article(s) Aug 2020 – Feb 2022\n`);
console.log("period        all  prefiltered  est. URL-mode cost");
let totalAll = 0;
let totalKept = 0;
for (const p of PERIODS) {
  const inPeriod = [...items.values()].filter((i) => periodOf(i.date)?.id === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const kept = inPeriod.filter((i) => (config.filter ?? matchesMilitaryKeywords)(i.title));
  totalAll += inPeriod.length;
  totalKept += kept.length;
  const file = `data/historical/${args.source}-${p.id}.txt`;
  const lines = [`# ${config.name} · ${p.label} · title prefilter applied (${kept.length} of ${inPeriod.length})`];
  for (const k of kept) lines.push(`# ${k.date} ${k.title}`, k.url);
  writeFileSync(`${repoRoot}${file}`, `${lines.join("\n")}\n`, "utf8");
  console.log(
    `${p.label.padEnd(13)} ${String(inPeriod.length).padStart(4)}  ${String(kept.length).padStart(11)}  $${(kept.length * USD_PER_PAGE).toFixed(3).padStart(6)}  → ${file}`,
  );
}
// Every listed title, unfiltered, for checking the prefilter (git-ignored).
const all = [...items.values()].sort((x, y) => x.date.localeCompare(y.date));
const allLines = all.map((i) => [i.date, i.title, i.url].join("\t"));
writeFileSync(`${repoRoot}data/historical/${args.source}-all-titles.txt`, `${allLines.join("\n")}\n`, "utf8");
console.log(`${"Total".padEnd(13)} ${String(totalAll).padStart(4)}  ${String(totalKept).padStart(11)}  $${(totalKept * USD_PER_PAGE).toFixed(3).padStart(6)}`);
