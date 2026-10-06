/**
 * Polish stem filter and pay_status handling (rp.pl feeds). Run: npm test
 * Uses the stems from data/sources/collector.json, so edits to that list are checked here too.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyFullText } from "./article.mjs";
import {
  collectFeed,
  foldDiacritics,
  linkPathAllowed,
  makeKeywordMatcher,
  makePolishMatcher,
  makeRegionMatcher,
  type FeedConfig,
} from "./feeds.mjs";
import type { HttpClient } from "./fetch.mjs";
import { collectListing } from "./listing.mjs";

const config = JSON.parse(readFileSync("data/sources/collector.json", "utf8")) as {
  keywords: string[];
  keyword_stems_pl: string[];
  keyword_whole_words_pl: string[];
};
const polish = makePolishMatcher(config.keyword_stems_pl, config.keyword_whole_words_pl);

test("foldDiacritics: Polish letters, including ł", () => {
  assert.equal(foldDiacritics("Białoruś, Łukaszenka, żołnierz, ćwiczeń"), "bialorus, lukaszenka, zolnierz, cwiczen");
});

test("Polish filter: case endings match", () => {
  assert.ok(polish("Wojska rosyjskie przy granicy z Białorusi"));
  assert.ok(polish("Ambasador na Litwie o sytuacji"));
  assert.ok(polish("Seria ćwiczeń na poligonie"));
  assert.ok(polish("Obwód Królewiecki: nowe dane"));
  assert.ok(polish("Incydent w Zatoce Gdańskiej"));
  assert.ok(polish("Szczyt NATO w Wilnie"));
  assert.ok(polish("Manewry Zapad-2025"));
});

test("Polish filter: common words are not false positives", () => {
  assert.ok(!polish("Rząd natomiast nie skomentował decyzji"));
  assert.ok(!polish("Decyzja zapadła w piątek"));
  assert.ok(!polish("Wyjazd zagraniczny na wakacje"), "stems match at word starts only");
  assert.ok(!polish("Nato") && !polish("zapad"), "whole words are case-sensitive");
  assert.ok(!polish("Kurs złotego i giełda w Warszawie"));
});

test("English filter is unchanged and does not see Polish case endings", () => {
  const english = makeKeywordMatcher(config.keywords);
  assert.ok(english("Troops near the Belarus border"));
  assert.ok(!english("Ambasador na Litwie o sytuacji"));
});

function feedXml(items: Array<{ title: string; description: string; pay?: string }>): string {
  const body = items
    .map(
      (it, i) =>
        `<item><title>${it.title}</title><link>https://example.test/a${i}</link>` +
        `<description>${it.description}</description><pubDate>${new Date().toUTCString()}</pubDate>` +
        (it.pay ? `<pay_status>${it.pay}</pay_status>` : "") +
        `</item>`,
    )
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${body}</channel></rss>`;
}

test("pay_status: Paid items keep title and link only; Free and Preview keep the lead", async () => {
  const xml = feedXml([
    { title: "Wojsko A", description: "Lead A", pay: "Free" },
    { title: "Wojsko B", description: "Lead B", pay: "Preview" },
    { title: "Wojsko C", description: "Lead C", pay: "Paid" },
  ]);
  const http = { get: async () => ({ status: 200, body: xml }) } as unknown as HttpClient;
  const feed: FeedConfig = {
    key: "test",
    source: "Test",
    url: "https://example.test/rss",
    language: "Polish",
    keyword_filter: false,
    polish_filter: true,
    no_ai_processing: false,
  };
  const matchers = { keyword: () => true, polish, region: () => true, credits: () => [] };
  const docs = await collectFeed(http, feed, "source-id", new Date(0), matchers);

  assert.deepEqual(
    docs.map((d) => [d.metadata.pay_status, d.textKind, d.rawText]),
    [
      ["Free", "FEED_TEXT", "Lead A"],
      ["Preview", "FEED_TEXT", "Lead B"],
      ["Paid", "METADATA_ONLY", null],
    ],
  );
  assert.ok(docs.every((d) => d.skipReason === undefined), "titles alone pass the filter (wojsk)");
});

const regionConfig = JSON.parse(readFileSync("data/sources/collector.json", "utf8")) as {
  region_terms: string[];
  region_terms_pl: string[];
  feeds: FeedConfig[];
  listings: Array<{ key: string; region_filter?: boolean }>;
};
const region = makeRegionMatcher(regionConfig.region_terms, regionConfig.region_terms_pl);

test("Polish region terms: case endings and diacritics fold; English terms still work", () => {
  for (const t of [
    "Polska wzmacnia granicę",
    "Polscy żołnierze na ćwiczeniach",
    "Białoruś przerzuca wojska",
    "Ambasador na Litwie",
    "Manewry na Łotwie",
    "Estońska armia",
    "Okręt na Bałtyku",
    "Obwód Królewiecki",
    "Na wschodniej flance NATO",
    "Incydent w Zatoce Gdańskiej",
    "Troops near the Belarus border",
  ]) assert.ok(region(t), t);
  for (const t of ["Połączenie kolejowe do Berlina", "Wybory we Francji", "Ukraine strikes on Kyiv", "Polar ice research"]) {
    assert.ok(!region(t), t);
  }
});

test("region filters on rp.pl, mezha.net, 15min and AiF-Kaliningrad; none on Defence24 or the Polish MoD listing", () => {
  const byKey = new Map(regionConfig.feeds.map((f) => [f.key, f]));
  for (const key of [
    "rp-wojsko", "rp-radar-zbrojeniowy", "rp-konflikty", "rp-swiat", "mezha-en", "15min-lt", "aif-klg",
    "wargov-news", "kremlin-en", "rmf24-fakty", "radio-lublin", "kyivindependent-news", "theinsider-ru",
    "estonianworld", "portalmorski", "zerkalo", "defence-industry-eu", "kaliningrad-news",
  ]) {
    assert.equal(byKey.get(key)?.region_filter, true, key);
  }
  assert.ok(!byKey.get("defence24")?.region_filter, "Defence24 keeps every row it kept before");
  assert.equal(byKey.get("defence24")?.keyword_filter, true);
  assert.ok(!regionConfig.listings.find((l) => l.key === "govpl-mon")?.region_filter);
  for (const key of ["mezha-en", "wargov-news", "kremlin-en", "kyivindependent-news", "defence-industry-eu"]) {
    const feed = byKey.get(key)!;
    assert.equal(feed.keyword_filter, true, key);
    assert.equal(feed.match_chars, 500, `${key}: region term must be in the title or first 500 characters`);
  }
});

const localConfig = JSON.parse(readFileSync("data/sources/collector.json", "utf8")) as Record<string, string[]>;
const lt = makePolishMatcher(localConfig.keyword_stems_lt, localConfig.keyword_whole_words_pl);
const lv = makePolishMatcher(localConfig.keyword_stems_lv, localConfig.keyword_whole_words_pl);
const regionLt = makeRegionMatcher(localConfig.region_terms, localConfig.region_terms_pl, localConfig.region_terms_lt);
const regionLv = makeRegionMatcher(localConfig.region_terms, localConfig.region_terms_pl, localConfig.region_terms_lv);
const regionRu = makeRegionMatcher(localConfig.region_terms, localConfig.region_terms_pl, localConfig.region_terms_ru);

test("Lithuanian keyword stems: the owner's terms, with case endings and diacritics", () => {
  for (const t of [
    "Paskelbtas oro pavojus Vilniuje",
    "Pažeista Lietuvos oro erdvė",
    "Virš Lietuvos skrido dronas",
    "Rusija išbandė raketą",
    "Kariuomenė pradeda pratybas",
    "Pastebėti kariniai orlaiviai",
    "Prasidėjo pratybos prie sienos",
    "NATO sąjungininkai",
  ]) assert.ok(lt(t), t);
  for (const t of ["Krepšinio rungtynės Kaune", "Orų prognozė savaitgaliui", "Nato"]) assert.ok(!lt(t), t);
});

test("Latvian keyword stems: the owner's terms", () => {
  for (const t of [
    "Izsludināta gaisa trauksme",
    "Pārkāpta Latvijas gaisa telpa",
    "Virs Latgales lidoja drons",
    "Krievija palaida raķeti",
    "Armija sāk mācības",
    "NATO mācības Ādažos",
  ]) assert.ok(lv(t), t);
  for (const t of ["Jaunais mācību gads skolās", "Laikapstākļu prognoze"]) assert.ok(!lv(t), t);
});

test("region stems by language: Lithuanian, Latvian and Russian (Cyrillic folding)", () => {
  for (const t of ["Baltarusija telkia pajėgas", "Kaliningrado sritis", "Karaliaučiaus kraštas", "Lietuvos kariuomenė", "Baltijos jūroje"]) assert.ok(regionLt(t), t);
  for (const t of ["Baltkrievija un Krievija", "Kaļiņingradas apgabals", "Igaunijas armija", "Latvijas robeža"]) assert.ok(regionLv(t), t);
  for (const t of ["Учения в Калининградской области", "Балтийский флот", "Граница с Литвой", "Белоруссия и Польша"]) assert.ok(regionRu(t), t);
  assert.ok(!regionRu("Футбольный матч в Москве"));
  assert.ok(!regionLt("Krepšinis Kaune"));
  assert.ok(!regionLv("Laikapstākļi Rīgā"));
  assert.ok(!region("Учения в Калининградской области"), "Russian stems apply only to Russian feeds");
});

test("configured stems are folded, lowercase and free of regex syntax (escape guard)", () => {
  for (const key of ["keyword_stems_pl", "region_terms_pl", "keyword_stems_lt", "keyword_stems_lv", "keyword_stems_ru", "region_terms_lt", "region_terms_lv", "region_terms_ru"]) {
    for (const stem of localConfig[key]) {
      assert.equal(foldDiacritics(stem), stem, `${key}: "${stem}" is not folded`);
      assert.ok(!/[.*+?^${}()|[\]\\\u0000-\u001f]/.test(stem), `${key}: "${stem}" has regex syntax or a control character`);
    }
  }
  for (const word of [...localConfig.keyword_whole_words_pl, ...localConfig.keyword_whole_words_ru]) {
    assert.ok(!/[.*+?^${}()|[\]\\\u0000-\u001f]/.test(word), `whole word "${word}" has regex syntax or a control character`);
  }
});

test("Russian keyword stems and abbreviations", () => {
  const ru = makePolishMatcher(localConfig.keyword_stems_ru, localConfig.keyword_whole_words_ru);
  for (const t of [
    "Минобороны сообщило о начале учений",
    "Учения Балтийского флота в Калининградской области",
    "ПВО сбила беспилотник",
    "Военные учения у границы с Литвой",
    "НАТО усиливает восточный фланг",
    "Пограничники задержали нарушителя",
  ]) assert.ok(ru(t), t);
  for (const t of ["Ученик школы выиграл олимпиаду", "Запад ввел новые санкции", "Погода в Петербурге", "нато"]) assert.ok(!ru(t), t);
});

test("stem_filter: a Lithuanian feed needs a Lithuanian keyword stem and a region term", async () => {
  const xml = feedXml([
    { title: "Virš Lietuvos skrido dronas", description: "Pranešė kariuomenė." },
    { title: "Krepšinio rungtynės", description: "Lietuvos rinktinė laimėjo." },
    { title: "Dronas virš Paryžiaus", description: "Prancūzijos policija." },
  ]);
  const http = { get: async () => ({ status: 200, body: xml }) } as unknown as HttpClient;
  const feed: FeedConfig = {
    key: "lt-test",
    source: "Test",
    url: "https://example.test/rss",
    language: "Lithuanian",
    keyword_filter: false,
    stem_filter: "lt",
    region_filter: true,
    no_ai_processing: false,
  };
  const matchers = { keyword: () => false, polish, stems: { lt }, region, regionByLanguage: { Lithuanian: regionLt }, credits: () => [] };
  const docs = await collectFeed(http, feed, "source-id", new Date(0), matchers);
  assert.deepEqual(docs.map((d) => d.skipReason ?? "kept"), ["kept", "no_keyword_match", "no_region_match"]);
});

test("linkPathAllowed: whole path sections, exclusions win, include list limits", () => {
  const include = ["/society", "/official", "/incident"];
  const exclude = ["/tg", "/smi"];
  for (const p of ["/society/123", "/official/a.html", "/incident/x"]) assert.ok(linkPathAllowed(`https://kaliningrad-news.ru${p}`, include, exclude), p);
  for (const p of ["/tg/123", "/smi/456", "/other/789", "/", "/societyx/1"]) assert.ok(!linkPathAllowed(`https://kaliningrad-news.ru${p}`, include, exclude), p);
  assert.ok(linkPathAllowed("https://example.org/tgx/1", undefined, exclude), "/tg does not cover /tgx");
  assert.ok(linkPathAllowed("https://example.org/smile", undefined, exclude), "/smi does not cover /smile");
  assert.ok(!linkPathAllowed("https://example.org/tg", undefined, exclude));
  assert.ok(!linkPathAllowed("not a url", undefined, undefined));
});

test("kaliningrad-news: /tg and /smi items are dropped before storage, and none of its pages is ever fetched", async () => {
  const kn = regionConfig.feeds.find((f) => f.key === "kaliningrad-news")!;
  assert.deepEqual(kn.exclude_paths, ["/tg", "/smi"]);
  assert.equal(kn.metadata_only, true, "titles only");
  assert.ok(!kn.full_text, "no article pages");
  for (const p of [...(kn.include_paths ?? []), ...(kn.exclude_paths ?? [])]) {
    assert.ok(/^\/[a-z0-9-]+$/.test(p), `path "${p}" must be a plain "/section" (no pattern syntax)`);
  }
  const base = "https://kaliningrad-news.ru";
  const items = ["/incident/1", "/tg/2", "/smi/3", "/society/4", "/other/5"]
    .map((p, i) => `<item><title>Учения ПВО в Калининградской области ${i}</title><link>${base}${p}</link><pubDate>${new Date().toUTCString()}</pubDate></item>`)
    .join("");
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
  const calls: string[] = [];
  const http = { get: async (url: string) => { calls.push(url); return { status: 200, body: url === kn.url ? xml : "<article>x</article>" }; } } as unknown as HttpClient;
  const ruMatchers = {
    keyword: () => false, polish,
    stems: { ru: makePolishMatcher(localConfig.keyword_stems_ru, localConfig.keyword_whole_words_ru) },
    region, regionByLanguage: { Russian: regionRu }, credits: () => [],
  };
  const docs = await collectFeed(http, kn, "source-id", new Date(0), ruMatchers);
  assert.deepEqual(docs.map((d) => new URL(d.url).pathname), ["/incident/1", "/society/4"]);
  assert.ok(docs.every((d) => d.textKind === "METADATA_ONLY" && !d.skipReason));
  // Even if full text were wrongly enabled for it, metadata-only rows are never fetched.
  await applyFullText(
    http, docs,
    { masterOn: true, optedIn: true, homeDomain: "kaliningrad-news.ru", barredDomains: [] },
    { maxChars: 20_000, minChars: 200 }, { remaining: 30 }, async () => false,
  );
  assert.deepEqual(calls, [kn.url], "only the feed itself is requested");
});

test("match_chars: keyword and region must appear in the title or the first 500 characters", async () => {
  const filler = "Kyiv city services and weather. ".repeat(20); // > 500 characters, no keyword or region
  const xml = feedXml([
    { title: "Russian drones strike Kyiv", description: `${filler} Poland closed its airspace.` },
    { title: "Polish army deploys air defence", description: "Lead text." },
    { title: "Sanctions update", description: "Troops moved near the Lithuania border overnight." },
  ]);
  const http = { get: async () => ({ status: 200, body: xml }) } as unknown as HttpClient;
  const feed: FeedConfig = {
    key: "mezha-test",
    source: "Test",
    url: "https://example.test/rss",
    language: "English",
    keyword_filter: true,
    region_filter: true,
    match_chars: 500,
    no_ai_processing: false,
  };
  const matchers = { keyword: makeKeywordMatcher(config.keywords), polish, region, credits: () => [] };
  const docs = await collectFeed(http, feed, "source-id", new Date(0), matchers);
  assert.deepEqual(docs.map((d) => d.skipReason ?? "kept"), ["no_region_match", "kept", "kept"]);
  assert.ok(docs[0].rawText!.length > 500, "the stored text is not shortened");
});

test("listing region filter: titles without a region term are stored as SKIPPED", async () => {
  const card = (path: string, title: string) =>
    `<li><span class="date">04.10.2026</span><div class="title"><a href="${path}">${title}</a></div></li>`;
  const html = `<section id="Aktualnosci"><ul>${card("/web/obrona-narodowa/a", "Wizyta ministra na Litwie")}${card("/web/obrona-narodowa/b", "Nowe umundurowanie")}</ul></section>`;
  const http = { get: async () => ({ status: 200, body: html }) } as unknown as HttpClient;
  const listing = {
    key: "govpl-test",
    source: "Test",
    url: "https://www.gov.pl/web/obrona-narodowa",
    parser: "govpl" as const,
    section_id: "Aktualnosci",
    link_prefix: "/web/obrona-narodowa/",
    language: "Polish",
    time_zone: "Europe/Warsaw",
    no_ai_processing: false,
    region_filter: true,
  };
  const docs = await collectListing(http, listing, "source-id", new Date("2026-10-01T00:00:00Z"), region);
  assert.deepEqual(docs.map((d) => d.skipReason ?? "kept"), ["kept", "no_region_match"]);
  const unfiltered = await collectListing(http, { ...listing, region_filter: false }, "source-id", new Date("2026-10-01T00:00:00Z"), region);
  assert.ok(unfiltered.every((d) => d.skipReason === undefined));
});

test("mil.lv news cards (drupal-news): title, link and DD.MM.YYYY date; older cards dropped", async () => {
  const card = (slug: string, title: string, date: string) =>
    `<div class="views-row"><article class="node node--type-news node--view-mode-search"> <h2> <a href="/lv/zinas/${slug}" rel="bookmark">${title}</a> </h2> <div class="node__content"> <div class="date">${date}</div> </div> </article></div>`;
  const html = `<p>Found 5699 results</p>${card("zemessargi-macibas", "1. Rīgas brigādes zemessargi aizvadīs mācības", "06.10.2026")}${card("morana-ligums", "Latvija paraksta līgumu par Morana iegādi", "02.10.2026")}${card("vecs", "Old item", "20.09.2026")}`;
  const http = { get: async () => ({ status: 200, body: html }) } as unknown as HttpClient;
  const listing = {
    key: "mil-lv-test",
    source: "Latvian National Armed Forces",
    url: "https://www.mil.lv/lv/zinas",
    parser: "drupal-news" as const,
    link_prefix: "/lv/zinas/",
    language: "Latvian",
    time_zone: "Europe/Riga",
    no_ai_processing: false,
  };
  const docs = await collectListing(http, listing, "source-id", new Date("2026-10-01T00:00:00Z"));
  assert.deepEqual(
    docs.map((d) => [d.url, d.title, d.metadata.listing_date]),
    [
      ["https://www.mil.lv/lv/zinas/zemessargi-macibas", "1. Rīgas brigādes zemessargi aizvadīs mācības", "2026-10-06"],
      ["https://www.mil.lv/lv/zinas/morana-ligums", "Latvija paraksta līgumu par Morana iegādi", "2026-10-02"],
    ],
  );
});

test("sargs.lv (dated-path): news sections only, date from the path, Latvian region filter", async () => {
  const link = (path: string, title: string) =>
    `<h2><a href="${path}" rel="bookmark"><span class="field field--name-title">${title}</span></a></h2><a href="${path}" rel="bookmark"></a>`;
  const html = [
    link("/lv/latvija/2026-10-06/brunoti-migrantu-pavadoni", "Bruņoti migrantu pavadoņi draud NBS karavīriem uz Latvijas–Baltkrievijas robežas"),
    link("/lv/pasaule/2026-10-06/tramps-baze-lietuva", "Tramps apsvērs pastāvīgas ASV militārās bāzes izveidi Lietuvā"),
    link("/lv/pasaule/2026-10-06/tuvie-austrumi", "Situācija Tuvajos Austrumos"),
    link("/lv/podkasti/2026-10-06/drosi-ir-zinat", "Droši ir zināt: podkāsts"),
    link("/lv/kategorija/podkasti", "Podkāsti"),
  ].join("");
  const http = { get: async () => ({ status: 200, body: html }) } as unknown as HttpClient;
  const listing = {
    key: "sargs-test",
    source: "Sargs.lv (Latvian Ministry of Defence portal)",
    url: "https://www.sargs.lv/lv",
    parser: "dated-path" as const,
    link_prefix: "/lv/",
    sections: ["latvija", "nato", "arvalstis", "pasaule"],
    language: "Latvian",
    time_zone: "Europe/Riga",
    no_ai_processing: false,
    region_filter: true,
  };
  const lvConfig = JSON.parse(readFileSync("data/sources/collector.json", "utf8")) as {
    region_terms: string[];
    region_terms_pl: string[];
    region_terms_lv: string[];
  };
  const latvianRegion = makeRegionMatcher(lvConfig.region_terms, lvConfig.region_terms_pl, lvConfig.region_terms_lv);
  const docs = await collectListing(http, listing, "source-id", new Date("2026-10-01T00:00:00Z"), latvianRegion);
  assert.deepEqual(
    docs.map((d) => [d.url.replace("https://www.sargs.lv", ""), d.skipReason ?? "kept"]),
    [
      ["/lv/latvija/2026-10-06/brunoti-migrantu-pavadoni", "kept"],
      ["/lv/pasaule/2026-10-06/tramps-baze-lietuva", "kept"],
      ["/lv/pasaule/2026-10-06/tuvie-austrumi", "no_region_match"],
    ],
    "podcasts and category pages are dropped; each article once",
  );
  assert.equal(docs[0].metadata.listing_date, "2026-10-06");
});
