/**
 * Sitemap probe for candidate historical sources (no model calls, nothing saved to the database).
 * Per source: honour the registry's blocked / citation-only / no_ai flags, read the terms pages
 * (legal links only), then read the sitemaps named in robots.txt and list article URLs dated
 * Aug 2020 - Feb 2022. A URL's date comes from its path, else a news:publication_date, else
 * the month in the sitemap's own file name (e.g. articles_2021-12-001.xml), else <lastmod>
 * (reported separately: lastmod can be a later edit). Writes the URL lists to
 * git-ignored files under data/historical/.
 *
 * Usage: npm run historical:probe-sitemaps [-- --only defence24]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { errorMessage, HttpClient } from "../collector/fetch.mjs";
import { decodeEntities, domainOf, htmlToText } from "../collector/store.mjs";
import { dateFromUrl } from "./listing.mjs";
import { loadPolicy } from "./policy.mjs";
import { selectLegalLinks, TermsGate } from "./source-probe.mjs";
import { checkDomain } from "./verify.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (existsSync(`${repoRoot}.env.local`)) process.loadEnvFile(`${repoRoot}.env.local`);

const FROM = "2020-08-01";
const TO = "2022-02-28";
const USD_PER_PAGE = 0.015;
const MAX_CHILD_SITEMAPS = 40;

type Source = { key: string; name: string; home: string; terms: string[]; pathPrefix?: string; paid?: RegExp };
const SOURCES: Source[] = [
  { key: "err", name: "ERR News", home: "https://news.err.ee/", terms: ["https://info.err.ee/982667/kasutustingimused-ja-kommenteerimine"] },
  { key: "nato", name: "NATO", home: "https://www.nato.int/", terms: [] },
  { key: "defence24", name: "Defence24", home: "https://defence24.com/", terms: ["https://defence24.com/term-of-use"], paid: /premium|paywall|subscriber/i },
  { key: "govpl-mod", name: "Polish MoD (gov.pl)", home: "https://www.gov.pl/web/obrona-narodowa", terms: ["https://www.gov.pl/web/gov/prawa-autorskie"], pathPrefix: "/web/obrona-narodowa/" },
  { key: "ee-mod", name: "Estonian MoD", home: "https://kaitseministeerium.ee/en", terms: [] },
  { key: "lv-mod", name: "Latvian MoD", home: "https://www.mod.gov.lv/en", terms: [] },
];

type Entry = { loc: string; lastmod: string | null; published: string | null };

function parseSitemap(xml: string): { index: Entry[]; urls: Entry[] } {
  const block = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]);
  const field = (b: string, tag: string) => b.match(new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag}>`, "i"))?.[1]?.trim() ?? null;
  const entry = (b: string): Entry => ({
    loc: decodeEntities(field(b, "loc") ?? ""),
    lastmod: field(b, "lastmod")?.slice(0, 10) ?? null,
    published: field(b, "news:publication_date")?.slice(0, 10) ?? null,
  });
  return { index: block("sitemap").map(entry).filter((e) => e.loc), urls: block("url").map(entry).filter((e) => e.loc) };
}

/** Child sitemaps whose name carries a year or month outside the period can be skipped. */
function childMayCover(loc: string): boolean {
  const years = [...loc.matchAll(/(?:^|[^\d])(20\d\d)(?:[-_/]?(\d\d))?(?=[^\d]|$)/g)];
  if (years.length === 0) return true;
  return years.some(([, y, m]) => {
    const ym = m && +m >= 1 && +m <= 12 ? `${y}-${m}` : null;
    return ym ? ym >= FROM.slice(0, 7) && ym <= TO.slice(0, 7) : y >= FROM.slice(0, 4) && y <= TO.slice(0, 4);
  });
}

const { values: args } = parseArgs({ options: { only: { type: "string" } } });
const { policy } = await loadPolicy(repoRoot, process.env.DATABASE_URL_POOLED!);
const http = new HttpClient("NortheastFlankMonitor-collector/0.1", 30_000, 3_000);
const gate = new TermsGate();
const rows: string[] = [];
mkdirSync(`${repoRoot}data/historical`, { recursive: true });

for (const s of SOURCES.filter((x) => !args.only || x.key === args.only)) {
  console.log(`\n=== ${s.name}`);
  const flag = checkDomain(s.home, policy);
  if (flag.kind === "barred") {
    console.log(`  SKIP: ${flag.why}; nothing fetched`);
    rows.push(`${s.name} | skipped (${flag.why}) | — | —`);
    continue;
  }
  // Terms first.
  const termsUrls = new Set(s.terms);
  try {
    for (const u of selectLegalLinks((await http.get(s.home)).body, s.home)) termsUrls.add(u);
  } catch (error) {
    console.log(`  home: ${errorMessage(error)}`);
  }
  for (const u of termsUrls) {
    try {
      const r = await http.get(u);
      console.log(`  terms read: ${u} (HTTP ${r.status}, ${htmlToText(r.body).length} chars)`);
    } catch (error) {
      console.log(`  terms ${u}: ${errorMessage(error)}`);
    }
  }
  if (termsUrls.size === 0) console.log("  terms: no terms page found");
  gate.markTermsRead(s.home, termsUrls.size ? "read" : "no terms page found");

  // Sitemaps from robots.txt.
  let sitemaps: string[] = [];
  try {
    const robots = await http.get(`${new URL(s.home).origin}/robots.txt`);
    sitemaps = [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  } catch (error) {
    console.log(`  robots.txt: ${errorMessage(error)}`);
  }
  console.log(`  sitemaps in robots.txt: ${sitemaps.join(" ") || "none"}`);
  const queue = [...sitemaps];
  const seenMaps = new Set<string>();
  const found = new Map<string, { date: string; how: string }>();
  let fetchedMaps = 0;
  let skippedGz = 0;
  let skippedByName = 0;
  let paidSkipped = 0;
  while (queue.length && fetchedMaps < MAX_CHILD_SITEMAPS + sitemaps.length) {
    const map = queue.shift()!;
    if (seenMaps.has(map)) continue;
    seenMaps.add(map);
    if (/\.gz($|\?)/i.test(map)) {
      skippedGz += 1;
      continue;
    }
    try {
      const r = await http.get(map);
      fetchedMaps += 1;
      if (r.status !== 200) continue;
      const { index, urls } = parseSitemap(r.body);
      const nameMonth = map.match(/(20\d\d)-(0[1-9]|1[0-2])(?=[^\d]|$)/);
      for (const child of index) {
        if (childMayCover(child.loc)) queue.push(child.loc);
        else skippedByName += 1;
      }
      for (const u of urls) {
        let url: URL;
        try {
          url = new URL(u.loc);
        } catch {
          continue;
        }
        if (s.pathPrefix && !url.pathname.startsWith(s.pathPrefix)) continue;
        if (s.paid?.test(u.loc)) {
          paidSkipped += 1;
          continue;
        }
        const fromPath = dateFromUrl(u.loc);
        const monthDate = nameMonth ? `${nameMonth[1]}-${nameMonth[2]}-01` : null;
        const date = fromPath ?? u.published ?? monthDate ?? u.lastmod;
        const how = fromPath ? "url" : u.published ? "news:publication_date" : monthDate ? "sitemap month" : "lastmod";
        if (date && date >= FROM && date <= TO && !found.has(u.loc)) found.set(u.loc, { date, how });
      }
    } catch (error) {
      console.log(`  ${map}: ${errorMessage(error)}`);
    }
  }
  const byHow = new Map<string, number>();
  for (const v of found.values()) byHow.set(v.how, (byHow.get(v.how) ?? 0) + 1);
  const how = [...byHow].map(([k, n]) => `${n} by ${k}`).join(", ") || "none";
  console.log(
    `  sitemaps fetched ${fetchedMaps}, skipped by name ${skippedByName}, .gz not read ${skippedGz}, paid skipped ${paidSkipped}; ` +
      `URLs dated in period: ${found.size} (${how})${queue.length ? `; ${queue.length} sitemap(s) left unread (cap)` : ""}`,
  );
  const sorted = [...found.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  writeFileSync(
    `${repoRoot}data/historical/${s.key}-sitemap-2020-08_2022-02.txt`,
    `${[`# ${s.name} sitemap URLs dated ${FROM} to ${TO} (date source: ${how})`, ...sorted.flatMap(([u, v]) => [`# ${v.date} (${v.how})`, u])].join("\n")}\n`,
    "utf8",
  );
  rows.push(
    `${s.name} | ${sitemaps.length ? `yes (${fetchedMaps} read${queue.length ? `, ${queue.length} unread` : ""}${skippedGz ? `, ${skippedGz} .gz` : ""})` : "none in robots.txt"} | ${found.size} (${how}) | $${(found.size * USD_PER_PAGE).toFixed(2)}${paidSkipped ? ` · ${paidSkipped} paid skipped` : ""} | ${domainOf(s.home)}`,
  );
}

console.log("\nsource | sitemap | dated URLs Aug 2020 - Feb 2022 | est. URL-mode cost | domain");
for (const r of rows) console.log(r);
