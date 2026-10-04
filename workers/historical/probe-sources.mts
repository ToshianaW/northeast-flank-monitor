/**
 * Archive-depth probe for candidate historical sources (no model calls, nothing saved).
 * Per source: honour the registry's barred / citation-only / no_ai flags, read robots.txt, read the
 * terms pages (only legal links are followed, see source-probe.mts), then sample listing pages to
 * see whether the archive is paginated, dated and reaches Aug 2020 - Feb 2022, and only then fetch
 * at most one article from that period to check that it is online in full text.
 *
 * Usage: npm run historical:probe-sources
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { errorMessage, HttpClient } from "../collector/fetch.mjs";
import { domainOf, htmlToText } from "../collector/store.mjs";
import { parseListing, type ListingItem } from "./listing.mjs";
import { loadPolicy } from "./policy.mjs";
import { selectLegalLinks, TermsGate } from "./source-probe.mjs";
import { checkDomain } from "./verify.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (existsSync(`${repoRoot}.env.local`)) process.loadEnvFile(`${repoRoot}.env.local`);

type Probe = { name: string; home: string; terms: string[]; listing: string; pages: number[] };
/** `listing` uses {n} for the page number. */
const PROBES: Probe[] = [
  { name: "Polish MoD (gov.pl)", home: "https://www.gov.pl/web/obrona-narodowa", terms: ["https://www.gov.pl/web/gov/prawa-autorskie"], listing: "https://www.gov.pl/web/obrona-narodowa/wiadomosci?page={n}", pages: [1, 50, 150, 250, 350, 450] },
  { name: "ERR News", home: "https://news.err.ee/", terms: ["https://info.err.ee/982667/kasutustingimused-ja-kommenteerimine"], listing: "https://news.err.ee/k/defense?page={n}", pages: [1, 20] },
  { name: "NATO", home: "https://www.nato.int/cps/en/natohq/index.htm", terms: [], listing: "https://www.nato.int/cps/en/natohq/news.htm?page={n}", pages: [1, 50, 150] },
  { name: "ICDS", home: "https://icds.ee/en/", terms: [], listing: "https://icds.ee/en/category/publications/page/{n}/", pages: [1, 10, 25, 40] },
  { name: "Defence24", home: "https://defence24.com/", terms: ["https://defence24.com/term-of-use"], listing: "https://defence24.com/news?page={n}", pages: [1, 100, 300] },
  { name: "Estonian MoD", home: "https://kaitseministeerium.ee/en", terms: [], listing: "https://kaitseministeerium.ee/en/news?page={n}", pages: [1, 20, 50, 80] },
  { name: "Latvian MoD", home: "https://www.mod.gov.lv/en", terms: [], listing: "https://www.mod.gov.lv/en/news?page={n}", pages: [1, 30, 80, 150] },
];
const FROM = "2020-08-01";
const TO = "2022-02-28";
const TERMS_KEY = /(automat|scrap|crawl|robot|data mining|text and data|artificial intelligence|\bAI\b|machine learning|sztuczn|eksploracj|tehisintellekt|mākslīg|reproduc|republish|cop(y|ying)|creative commons|licencj|licen[cs]e|non-commercial|niekomercyj|permission|zgod|refereer|viide|link)/i;

const { policy } = await loadPolicy(repoRoot, process.env.DATABASE_URL_POOLED!);
const http = new HttpClient("NortheastFlankMonitor-collector/0.1", 25_000, 3_000);
const gate = new TermsGate();

for (const p of PROBES) {
  console.log(`\n=== ${p.name}`);
  const flag = checkDomain(p.home, policy);
  if (flag.kind === "barred") {
    console.log(`  SKIP: ${flag.why}; nothing fetched`);
    continue;
  }
  // 1. robots.txt and terms, before anything else.
  try {
    await http.assertAllowed(p.listing.replace("{n}", "1"));
    console.log("  robots.txt: listing allowed for our user agent");
  } catch (error) {
    console.log(`  robots.txt: listing NOT allowed (${errorMessage(error)}); stopping`);
    continue;
  }
  const termsUrls = new Set(p.terms);
  try {
    const home = await http.get(p.home);
    for (const u of selectLegalLinks(home.body, p.home)) termsUrls.add(u);
  } catch (error) {
    console.log(`  home: ${errorMessage(error)}`);
  }
  const findings: string[] = [];
  for (const u of termsUrls) {
    try {
      const r = await http.get(u);
      const hits = (htmlToText(r.body).match(/[^.!?]{0,220}[.!?]/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 30 && TERMS_KEY.test(s));
      findings.push(`${u} (HTTP ${r.status}): ${hits.slice(0, 3).map((h) => `"${h.slice(0, 180)}"`).join(" | ") || "no relevant wording"}`);
    } catch (error) {
      findings.push(`${u}: ${errorMessage(error)}`);
    }
  }
  console.log(`  terms read: ${findings.length ? "" : "no terms page found"}`);
  for (const f of findings) console.log(`    - ${f}`);
  gate.markTermsRead(p.home, findings.length ? "read" : "no terms page found");

  // 2. Listing depth.
  const inRange: ListingItem[] = [];
  let paginated = false;
  let dated = false;
  let previousFirst = "";
  let oldest = "";
  for (const n of p.pages) {
    const url = p.listing.replace("{n}", String(n));
    try {
      const r = await http.get(url);
      const items = parseListing(r.body, url);
      const dates = items.map((i) => i.listingDate ?? i.urlDate!).sort();
      if (items.length && items[0].url !== previousFirst) paginated = paginated || previousFirst !== "";
      previousFirst = items[0]?.url ?? previousFirst;
      if (items.some((i) => i.listingDate || i.urlDate)) dated = true;
      if (dates[0]) oldest = dates[0];
      inRange.push(...items.filter((i) => {
        const d = i.listingDate ?? i.urlDate!;
        return d >= FROM && d <= TO;
      }));
      console.log(`  page ${n}: HTTP ${r.status}, ${items.length} dated links${dates.length ? `, ${dates[0]} to ${dates.at(-1)}` : ""}`);
      if (r.status !== 200 || items.length === 0) break;
      if (dates[0] && dates[0] < FROM) break;
    } catch (error) {
      console.log(`  page ${n}: ${errorMessage(error)}`);
      break;
    }
  }

  // 3. One article from the period, only after the terms gate is open.
  let fullText = "not checked (no article from the period found in the sampled pages)";
  const sample = inRange[0];
  if (sample) {
    gate.assertArticleAllowed(sample.url);
    try {
      const r = await http.get(sample.url);
      const length = htmlToText(r.body).length;
      fullText = `${sample.url} (${sample.listingDate ?? sample.urlDate}): HTTP ${r.status}, ${length} characters of text`;
    } catch (error) {
      fullText = `${sample.url}: ${errorMessage(error)}`;
    }
  }
  console.log(`  summary: paginated ${paginated ? "yes" : "unclear"} · dated ${dated ? "yes" : "no"} · oldest date reached ${oldest || "none"} · in-range links seen ${inRange.length} · domain ${domainOf(p.home)}`);
  console.log(`  full text: ${fullText}`);
}
