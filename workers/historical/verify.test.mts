/**
 * Historical suggester checks (no network, no database, no model). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistoricalCandidate } from "./prompt.mjs";
import {
  checkDomain,
  headlineNamesSource,
  headlineOverclaim,
  regionReasonInScope,
  parseReply,
  publishedDateFromHtml,
  publishedDateFromText,
  resolveDate,
  sentenceBefore,
  statesDayMonth,
  statesYear,
  verifyCandidate,
  type DomainPolicy,
} from "./verify.mjs";

const policy: DomainPolicy = {
  registry: [
    { name: "Belarus Ministry of Defence", home_url: "https://www.mil.by", tier: 1 },
    { name: "Polish Ministry of National Defence", home_url: "https://www.gov.pl/web/obrona-narodowa", tier: 1 },
  ],
  barred: [
    { domain: "reuters.com", why: "site blocks automated access (terms not read)" },
    { domain: "rferl.org", why: "citation-only (RFE/RL)" },
    { domain: "t.me", why: "terms prohibit automated access or AI use (decision 9)" },
  ],
};

const body =
  "On 13 January the Belarusian Ministry of Defence said a readiness check of the Western Operational Command began. " +
  "Units of the 6th Mechanised Brigade took part, the ministry said in a statement.";
const page = {
  html: `<html><head><meta property="article:published_time" content="2021-01-14T10:00:00Z"></head><body><p>${body}</p></body></html>`,
  text: body,
};
const candidate: HistoricalCandidate = {
  url: "https://www.mil.by/ru/news/1/",
  publisher: "Belarus Ministry of Defence",
  event_date: "2021-01-13",
  date_excerpt: "On 13 January the Belarusian Ministry of Defence said",
  headline: "Belarus defence ministry says readiness check began",
  summary: "Belarus's defence ministry said a readiness check of the Western Operational Command began.",
  actor: "Belarusian Ministry of Defence",
  country: "Belarus",
  location_name: null,
  event_type: "READINESS_CHECK",
  claim_by: "Belarusian Ministry of Defence",
  exercise_name: null,
  supporting_excerpt: "a readiness check of the Western Operational Command began",
  excerpt_supports: "A readiness check of the Western Operational Command began.",
  region_reason: "Belarus: readiness check announced by the Belarusian Ministry of Defence",
};
const reason = (c: Partial<HistoricalCandidate>, p = page) => {
  const r = verifyCandidate({ ...candidate, ...c }, p, "2021-01");
  return r.ok ? "kept" : r.reason;
};

test("domains: barred first (subdomains too), registry by host and path, otherwise unregistered", () => {
  assert.equal(checkDomain("https://www.reuters.com/world/x", policy).kind, "barred");
  assert.equal(checkDomain("https://t.me/somechannel/1", policy).kind, "barred");
  assert.equal(checkDomain("https://www.rferl.org/a/x.html", policy).kind, "barred");
  const mil = checkDomain("https://mil.by/ru/news/1/", policy);
  assert.equal(mil.kind === "registered" && mil.source.name, "Belarus Ministry of Defence");
  assert.equal(checkDomain("https://www.gov.pl/web/obrona-narodowa/x", policy).kind, "registered");
  assert.equal(checkDomain("https://www.gov.pl/web/zdrowie/x", policy).kind, "unregistered", "same host, other ministry");
  assert.equal(checkDomain("https://example.org/a", policy).kind, "unregistered");
});

test("day and month in several languages and numeric forms; year only when written", () => {
  assert.ok(statesDayMonth("January 13, 2021", "2021-01-13") && statesYear("January 13, 2021", "2021-01-13"));
  assert.ok(statesDayMonth("13 января", "2021-01-13") && !statesYear("13 января", "2021-01-13"));
  assert.ok(statesDayMonth("13.01.2021 года", "2021-01-13") && statesYear("13.01.21", "2021-01-13"));
  assert.ok(statesDayMonth("13 stycznia 2021 r.", "2021-01-13"));
  assert.ok(statesDayMonth("2021 m. sausio 13 d.", "2021-01-13"));
  assert.ok(!statesDayMonth("On 14 January", "2021-01-13"), "wrong day");
  assert.ok(!statesDayMonth("On 13 February", "2021-01-13"), "wrong month");
  assert.ok(!statesDayMonth("in January 2021", "2021-01-13"), "no day");
});

test("publication date from metadata or page text", () => {
  assert.equal(publishedDateFromHtml(page.html), "2021-01-14");
  assert.equal(publishedDateFromHtml('<script type="application/ld+json">{"datePublished": "2021-02-01T00:00"}</script>'), "2021-02-01");
  assert.equal(publishedDateFromHtml("<p>no date</p>"), null);
  assert.equal(publishedDateFromText("Belarus Warning Update January 28, 2021 - By George Barros. Text follows."), "2021-01-28");
  assert.equal(publishedDateFromText("Menu Home Published: 3 February 2021 Article"), "2021-02-03");
  assert.equal(publishedDateFromText("no dates here"), null);
});

test("year rules: in the quote; else publication date within 14 days after the event; else dropped", () => {
  const noMeta = (text: string) => ({ html: `<p>${text}</p>`, text });
  const inQuote = resolveDate("on January 25, 2021", "2021-01-25", noMeta("x"));
  assert.ok(inQuote.ok && /year stated in the date quote/.test(inQuote.rule));

  const fromText = resolveDate("on January 25", "2021-01-25", noMeta("January 28, 2021 By Staff. On January 25 ..."));
  assert.ok(fromText.ok && fromText.reportedDate === "2021-01-28" && /page text/.test(fromText.rule));

  const fromMeta = resolveDate("13 January", "2021-01-13", page);
  assert.ok(fromMeta.ok && fromMeta.reportedDate === "2021-01-14" && /page metadata/.test(fromMeta.rule));

  const tooOld = resolveDate("on January 2", "2021-01-02", noMeta("January 28, 2021. On January 2 ..."));
  assert.ok(!tooOld.ok && /not within 14 days/.test(tooOld.detail));
  const after = resolveDate("on January 30", "2021-01-30", noMeta("January 28, 2021. On January 30 ..."));
  assert.ok(!after.ok, "event after the publication date");
  assert.ok(!resolveDate("on January 25", "2021-01-25", noMeta("no date")).ok, "no year anywhere");
});

test("headline may not claim a start or end the excerpt does not state", () => {
  assert.match(headlineOverclaim("Russian forces begin exercises", "exercises have continued through January 28") ?? "", /start/);
  assert.equal(headlineOverclaim("Russian forces begin exercises", "the exercises began on Monday"), null);
  assert.match(headlineOverclaim("Exercise concluded", "troops took part in the exercise") ?? "", /end/);
  assert.equal(headlineOverclaim("Учения начались", "учения начались"), null, "non-English headline without English verbs");
});

test("a grounded candidate is kept, with its date rule and reported_date", () => {
  const r = verifyCandidate(candidate, page, "2021-01");
  assert.ok(r.ok, r.ok ? "" : r.detail);
  assert.equal(r.reportedDate, "2021-01-14");
});

test("drops: excerpt, date, month, wording, overclaim, actor, missing supports line", () => {
  assert.equal(reason({ supporting_excerpt: "troops massed on the border" }), "excerpt not found");
  assert.equal(reason({ supporting_excerpt: body }), "excerpt too long");
  assert.equal(reason({ date_excerpt: "On 12 January" }), "no stated date");
  assert.equal(reason({ date_excerpt: "the Belarusian Ministry of Defence said" }), "no stated date");
  assert.equal(reason({ event_date: "2021-02-13" }), "date outside month");
  assert.equal(reason({ summary: "The ministry said a check began, which signals that an attack is imminent." }), "banned phrase");
  assert.equal(
    reason({ headline: "Belarus readiness check began", supporting_excerpt: "Units of the 6th Mechanised Brigade took part" }),
    "headline claims more than excerpt",
  );
  assert.equal(reason({ actor: "Belarusian MoD / Western Operational Command" }), "actor not on page");
  assert.equal(reason({ excerpt_supports: "" }), "invalid candidate");
});

test("details the page does not state are flagged", () => {
  const r = verifyCandidate({ ...candidate, location_name: "Hrodna Oblast", summary: `${candidate.summary} About 3,000 troops took part.` }, page, "2021-01");
  assert.ok(r.ok);
  assert.ok(r.flags.some((f) => /location "Hrodna Oblast"/.test(f)));
  assert.ok(r.flags.some((f) => /number "3,000"/.test(f)));
});

test("parseReply reads the last json block, the shortfall reason and other text", () => {
  const text =
    'I found two pages.\n```json\n{"candidates": [' + JSON.stringify(candidate) + ', {"url": 1}], "shortfall_reason": "Few dated pages."}\n```';
  const r = parseReply(text);
  assert.equal(r?.candidates.length, 1);
  assert.equal(r?.shortfallReason, "Few dated pages.");
  assert.equal(r?.otherText, "I found two pages.");
  assert.equal(parseReply("no json here"), null);
});

test("region rule: the reason must name an in-scope place; out-of-region candidates are dropped", () => {
  for (const r of [
    "Belarus: readiness check at Belarusian training grounds",
    "Kaliningrad: Baltic Fleet drills",
    "Pskov Oblast: airborne division exercise",
    "St Petersburg: naval parade",
    "Lithuania: state of emergency on the border with Belarus",
    "Baltic Sea: naval exercise",
  ]) assert.ok(regionReasonInScope(r), r);
  for (const r of [
    "United States and Russia: ambassador recalled",
    "Ukraine: sanctions on a TV channel owner",
    "Arms control: START-3 extension ratified",
    "",
  ]) assert.ok(!regionReasonInScope(r), r);
  assert.ok(!regionReasonInScope(undefined));
  assert.equal(reason({ region_reason: "Ukraine: domestic politics" }), "outside region");
  assert.equal(reason({ region_reason: "" }), "outside region");
});

test("headlines may not name the source or attribute it", () => {
  const osw = "OSW (Centre for Eastern Studies)";
  assert.equal(headlineNamesSource("Belarus defence ministry says readiness check began", osw), null);
  for (const h of [
    "Both houses ratify START-3 extension, per OSW",
    "Estonia updates defence plan, according to OSW analysis",
    "Russia's ambassador summoned to Moscow, OSW reports",
    "OSW: Belarus readiness check began",
  ]) assert.ok(headlineNamesSource(h, osw), h);
  assert.ok(headlineNamesSource("Readiness check began, Defence24 reported", "Defence24"));
  assert.ok(headlineNamesSource("Readiness check began, according to Polish officials", "Defence24"), "no 'according to' in headlines");
  assert.equal(reason({ headline: "Belarus readiness check began, per OSW", publisher: osw }), "headline names the source");
});

test("URL mode accepts a month range", () => {
  assert.equal(reason({ event_date: "2021-02-13" }), "date outside month");
  const r = verifyCandidate({ ...candidate }, page, "2020-12:2021-02");
  assert.ok(r.ok);
  const out = verifyCandidate({ ...candidate, event_date: "2021-03-01" }, page, "2021-01:2021-02");
  assert.equal(out.ok ? "kept" : out.reason, "date outside month");
});

test("acronyms and treaty names are not read as verbs; the check is case-sensitive", () => {
  const excerpt = "On 27 January, both houses of the Russian parliament ratified the extension at record speed";
  assert.equal(headlineOverclaim("Both houses of Russian parliament ratify START-3 extension", excerpt), null);
  assert.equal(headlineOverclaim("NATO START talks: OPEN questions", "officials met"), null);
  assert.match(headlineOverclaim("Russia and the US start START-3 talks", "officials met in Geneva") ?? "", /"start"/);
  assert.match(headlineOverclaim("Begins: exercise near Brest", "units took part") ?? "", /"Begins"/);
});

test("the sentence before an excerpt that starts with a pronoun", () => {
  const text = "The 6th National Assembly met in Minsk. Alyaksandr Lukashenka gave the opening speech. He reiterated his statements about the military threat from NATO.";
  assert.equal(sentenceBefore(text, "He reiterated his statements about the military threat"), "Alyaksandr Lukashenka gave the opening speech.");
  assert.equal(sentenceBefore(text, "The 6th National Assembly met in Minsk"), null, "no pronoun");
  assert.equal(sentenceBefore(text, "He said something else"), null, "excerpt not on the page");
});
