/**
 * Full-text fetching (article.mts): text extraction, eligibility, the page cap, fallbacks, and the
 * collector.json opt-ins. No network: HttpClient is a fake that records every URL asked for.
 * Also checks that the regex escapes are intact (fails if "\b" or "\s" is mangled). Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  addFullTextCounts,
  applyFullText,
  elementByClass,
  emptyFullTextCounts,
  formatFullTextReasons,
  extractArticleText,
  fetchFullText,
  fullTextBarredDomains,
  fullTextIneligibility,
  type FullTextScope,
} from "./article.mjs";
import { RobotsDisallowedError, type HttpClient } from "./fetch.mjs";
import { domainOf, type CollectedDoc } from "./store.mjs";

const LONG = "Lithuanian troops began a readiness exercise near the border on Monday. ".repeat(10);
const limits = { maxChars: 20_000, minChars: 200 };

function doc(url: string, extra: Partial<CollectedDoc> = {}, metadata: Record<string, unknown> = {}): CollectedDoc {
  return {
    sourceId: "s",
    publisherName: "Test",
    collectedVia: "FEED",
    collectorKey: "test",
    url,
    title: "Title",
    publishedAt: null,
    language: "English",
    rawText: "Short feed lead.",
    textKind: "FEED_TEXT",
    metadata,
    ...extra,
  };
}

/** Fake HttpClient: answers from a map; records every URL; throws RobotsDisallowedError where told. */
function fakeHttp(pages: Record<string, string | number | "robots">) {
  const calls: string[] = [];
  const http = {
    get: async (url: string) => {
      calls.push(url);
      const page = pages[url];
      if (page === "robots") throw new RobotsDisallowedError("disallowed by robots.txt");
      if (typeof page === "number") return { status: page, body: "" };
      return { status: 200, body: page ?? "" };
    },
  } as unknown as HttpClient;
  return { http, calls };
}

const scope = (over: Partial<FullTextScope> = {}): FullTextScope => ({
  masterOn: true,
  optedIn: true,
  homeDomain: "example.org",
  barredDomains: [],
  ...over,
});
const notStored = async () => false;

test("extraction: JSON-LD articleBody first, including inside @graph", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","articleBody":"<p>Body from JSON-LD.</p>"}]}</script><article>Other text</article>`;
  assert.equal(extractArticleText(html), "Body from JSON-LD.");
  assert.equal(extractArticleText(`<script type="application/ld+json">{not json</script><article><p>Fallback</p></article>`), "Fallback");
});

test("extraction: the longest <article>, without nav, aside, footer, figure or form", () => {
  const html = `<article>Teaser</article><article><nav>Menu</nav><p>Main text here.</p><figure>Photo caption</figure><aside>Related</aside><footer>Share</footer></article>`;
  assert.equal(extractArticleText(html), "Main text here.");
});

test("extraction: a known content container (CERT.LV's post__body, gov.pl's editor-content), nesting-aware", () => {
  const html = `<div class="post-wrapper"><div class="post__body x"><div class="inner"><p>Alert text.</p></div><p>More.</p></div><div class="sidebar">Not this</div></div>`;
  assert.equal(extractArticleText(html), "Alert text. More.");
  assert.equal(elementByClass(`<div class="post__bodyx">no</div>`, "post__body"), null, "class tokens match whole");
  assert.equal(extractArticleText("<html><body><p>No article markup</p></body></html>"), null);
});

test("fetchFullText: text is cut at maxChars; short text, missing body, non-2xx and robots are failures", async () => {
  const { http } = fakeHttp({
    "https://example.org/long": `<article>${"a ".repeat(15_000)}</article>`,
    "https://example.org/stub": "<article>Subscribe to read.</article>",
    "https://example.org/none": "<p>no markup</p>",
    "https://example.org/404": 404,
    "https://example.org/robots": "robots",
  });
  const long = await fetchFullText(http, "https://example.org/long", limits);
  assert.ok(long.ok && long.text.length === 20_000);
  assert.deepEqual(await fetchFullText(http, "https://example.org/stub", limits), { ok: false, reason: "too_short" });
  assert.deepEqual(await fetchFullText(http, "https://example.org/none", limits), { ok: false, reason: "no_article_body" });
  assert.deepEqual(await fetchFullText(http, "https://example.org/404", limits), { ok: false, reason: "http_status" });
  assert.deepEqual(await fetchFullText(http, "https://example.org/robots", limits), { ok: false, reason: "robots" });
});

test("eligibility: every flag, the opt-in, the master switch, other domains and barred domains", () => {
  const url = "https://www.example.org/a";
  assert.equal(fullTextIneligibility(doc(url), scope()), null);
  assert.equal(fullTextIneligibility(doc(url), scope({ masterOn: false })), "master_off");
  assert.equal(fullTextIneligibility(doc(url), scope({ optedIn: false })), "not_opted_in");
  assert.equal(fullTextIneligibility(doc(url, { skipReason: "no_region_match" }), scope()), "filtered");
  assert.equal(fullTextIneligibility(doc(url, {}, { no_ai_processing: true }), scope()), "no_ai_processing");
  assert.equal(fullTextIneligibility(doc(url, {}, { lead_only: true }), scope()), "lead_only");
  assert.equal(fullTextIneligibility(doc(url, {}, { metadata_only_by_terms: true }), scope()), "metadata_only");
  assert.equal(fullTextIneligibility(doc(url, {}, { pay_status: "Paid" }), scope()), "paywalled");
  assert.equal(fullTextIneligibility(doc(url, {}, { pay_status: "Preview" }), scope()), "paywalled");
  assert.equal(fullTextIneligibility(doc(url, {}, { pay_status: "Free" }), scope()), null);
  assert.equal(fullTextIneligibility(doc("https://elsewhere.net/a"), scope()), "other_domain");
  assert.equal(fullTextIneligibility(doc("https://news.example.org/a"), scope({ barredDomains: ["example.org"] })), "barred_domain");
  assert.equal(fullTextIneligibility(doc(url), scope({ homeDomain: null })), "other_domain");
});

test("free-only feeds (rp.pl): only items marked Free are fetched", () => {
  const url = "https://www.example.org/a";
  assert.equal(fullTextIneligibility(doc(url, {}, { pay_status: "Free" }), scope({ freeOnly: true })), null);
  assert.equal(fullTextIneligibility(doc(url), scope({ freeOnly: true })), "paywalled", "no pay_status: not fetched");
  assert.equal(fullTextIneligibility(doc(url, {}, { pay_status: "Preview" }), scope({ freeOnly: true })), "paywalled");
});

test("collector.json: exactly the approved sources opt in; the refused ones stay off", () => {
  const config = JSON.parse(readFileSync("data/sources/collector.json", "utf8"));
  const all = [...config.feeds, ...config.listings];
  const optedIn = all.filter((f: { full_text?: boolean }) => f.full_text).map((f: { key: string }) => f.key).sort();
  assert.deepEqual(optedIn, [
    "15min-lt", "certlv-en", "defence24", "err-news", "estonianworld", "euronews", "govpl-mon", "govpl-rcb",
    "kyivindependent-news", "portalmorski", "rmf24-fakty", "rp-konflikty", "rp-radar-zbrojeniowy", "rp-swiat", "rp-wojsko",
    "wargov-news",
  ]);
  for (const f of all.filter((x: { key: string }) => x.key.startsWith("rp-"))) assert.equal(f.full_text_free_only, true, f.key);
  const refused = all.filter((f: { url: string; source: string }) =>
    /jauns\.lv|ve\.lt|lsm\.lv|lrvk\.lrv\.lt|aif\.ru|mil\.by|kremlin\.ru|theins\.ru|radio\.lublin\.pl|zerkalo\.io/.test(f.url) ||
    ["LRT", "NPR", "Stars and Stripes", "OSINT613"].includes(f.source));
  for (const f of refused) assert.ok(!f.full_text, `${f.key} must not opt in`);
  // Skipped or undecided in round 3: never collected at all.
  assert.ok(!all.some((f: { url: string }) => /pagd\.lrv\.lt|pap\.pl|postimees\.ee|bundeswehr\.de|fontanka\.ru|spiegel\.de/.test(f.url)));
  for (const d of ["jauns.lv", "ve.lt", "lrvk.lrv.lt", "pagd.lrv.lt", "pap.pl", "news.postimees.ee", "bundeswehr.de", "fontanka.ru", "spiegel.de"]) {
    assert.ok([...config.blocked_automated_access, ...config.tos_prohibited_domains].includes(d), `${d} is on a skip list`);
  }
});

test("a feed without the opt-in is never fetched, and neither is anything while the master switch is off", async () => {
  const { http, calls } = fakeHttp({});
  const docs = [doc("https://example.org/a"), doc("https://example.org/b")];
  await applyFullText(http, docs, scope({ optedIn: false }), limits, { remaining: 30 }, notStored);
  await applyFullText(http, docs, scope({ masterOn: false }), limits, { remaining: 30 }, notStored);
  assert.deepEqual(calls, []);
  assert.ok(docs.every((d) => d.textKind === "FEED_TEXT"));
});

test("no-AI, citation-only, blocked and prohibited sources are never fetched", async () => {
  const homes: Record<string, string> = { "RFE/RL": "https://www.rferl.org", NPR: "https://www.npr.org" };
  const barred = fullTextBarredDomains(
    { blocked: ["reuters.com"], prohibited: ["t.me"], citationOnly: ["RFE/RL"], noAi: new Set(["NPR"]) },
    (name) => (homes[name] ? domainOf(homes[name]) : null),
  );
  assert.deepEqual(barred.sort(), ["npr.org", "reuters.com", "rferl.org", "t.me"]);
  const { http, calls } = fakeHttp({});
  for (const [home, url] of [
    ["reuters.com", "https://www.reuters.com/world/a"],
    ["t.me", "https://t.me/channel/1"],
    ["rferl.org", "https://www.rferl.org/a/1.html"],
    ["npr.org", "https://www.npr.org/2026/10/04/a"],
  ]) {
    // Even a feed that opted in, on its own domain, is refused when the domain is barred.
    await applyFullText(http, [doc(url)], scope({ homeDomain: home, barredDomains: barred }), limits, { remaining: 30 }, notStored);
  }
  await applyFullText(http, [doc("https://example.org/x", {}, { no_ai_processing: true })], scope(), limits, { remaining: 30 }, notStored);
  assert.deepEqual(calls, []);
});

test("every domain on collector.json's skip lists is refused, even for an opted-in feed on that domain", async () => {
  const config = JSON.parse(readFileSync("data/sources/collector.json", "utf8"));
  const barred = fullTextBarredDomains(
    { blocked: config.blocked_automated_access, prohibited: config.tos_prohibited_domains, citationOnly: [], noAi: [] },
    () => null,
  );
  const { http, calls } = fakeHttp({});
  for (const domain of barred) {
    await applyFullText(http, [doc(`https://www.${domain}/news/1`)], scope({ homeDomain: domain, barredDomains: barred }), limits, { remaining: 30 }, notStored);
  }
  assert.ok(barred.includes("spiegel.de") && barred.includes("pap.pl") && barred.includes("fontanka.ru"));
  assert.deepEqual(calls, []);
});

test("page cap: at most `remaining` pages per run, shared across calls; stored URLs are not fetched", async () => {
  const pages = Object.fromEntries(["a", "b", "c", "d"].map((p) => [`https://example.org/${p}`, `<article>${LONG}</article>`]));
  const { http, calls } = fakeHttp(pages);
  const budget = { remaining: 3 };
  const first = [doc("https://example.org/a"), doc("https://example.org/b")];
  const second = [doc("https://example.org/c"), doc("https://example.org/d"), doc("https://example.org/stored")];
  const isStored = async (url: string) => url.endsWith("/stored");
  const c1 = await applyFullText(http, first, scope(), limits, budget, isStored);
  const c2 = await applyFullText(http, second, scope(), limits, budget, isStored);
  assert.deepEqual(
    [c1, c2],
    [
      { attempted: 2, fetched: 2, failed: 0, capped: 0, paywalled: 0, reasons: {} },
      { attempted: 1, fetched: 1, failed: 0, capped: 1, paywalled: 0, reasons: {} },
    ],
  );
  assert.equal(calls.length, 3);
  assert.equal(budget.remaining, 0);
  assert.equal(first[0].textKind, "FULL_TEXT");
  assert.deepEqual(first[0].metadata.full_text, { chars: LONG.trim().length, feed_chars: "Short feed lead.".length });
  assert.equal(second[1].textKind, "FEED_TEXT", "over the cap: feed text kept");
});

test("robots.txt refusal and HTTP errors keep the feed text and record a reason label (no URL)", async () => {
  const { http } = fakeHttp({ "https://example.org/r": "robots", "https://example.org/e": 500 });
  const docs = [doc("https://example.org/r"), doc("https://example.org/e")];
  const counts = await applyFullText(http, docs, scope(), limits, { remaining: 30 }, notStored);
  assert.deepEqual(counts, { attempted: 2, fetched: 0, failed: 2, capped: 0, paywalled: 0, reasons: { robots: 1, http_status: 1 } });
  assert.deepEqual(docs.map((d) => [d.textKind, d.rawText, d.metadata.full_text_error]), [
    ["FEED_TEXT", "Short feed lead.", "robots"],
    ["FEED_TEXT", "Short feed lead.", "http_status"],
  ]);
});

test("summary counts: attempted, succeeded, fell back by reason (timeout included), paywalled not fetched", async () => {
  const timeoutHttp = {
    get: async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    },
  } as unknown as HttpClient;
  assert.deepEqual(await fetchFullText(timeoutHttp, "https://example.org/slow", limits), { ok: false, reason: "timeout" });

  const { http, calls } = fakeHttp({
    "https://example.org/ok": `<article>${LONG}</article>`,
    "https://example.org/robots": "robots",
    "https://example.org/404": 404,
    "https://example.org/short": "<article>Too short.</article>",
  });
  const docs = [
    doc("https://example.org/ok", {}, { pay_status: "Free" }),
    doc("https://example.org/robots", {}, { pay_status: "Free" }),
    doc("https://example.org/404", {}, { pay_status: "Free" }),
    doc("https://example.org/short", {}, { pay_status: "Free" }),
    doc("https://example.org/preview", {}, { pay_status: "Preview" }),
    doc("https://example.org/unmarked"),
  ];
  const counts = await applyFullText(http, docs, scope({ freeOnly: true }), limits, { remaining: 30 }, notStored);
  assert.deepEqual(counts, {
    attempted: 4,
    fetched: 1,
    failed: 3,
    capped: 0,
    paywalled: 2,
    reasons: { robots: 1, http_status: 1, too_short: 1 },
  });
  assert.ok(!calls.some((u) => u.endsWith("/preview") || u.endsWith("/unmarked")), "paywalled items are never requested");

  const total = addFullTextCounts(counts, { ...emptyFullTextCounts(), attempted: 1, failed: 1, reasons: { timeout: 1, robots: 1 } });
  assert.equal(formatFullTextReasons(total.reasons), "http_status 1, robots 2, timeout 1, too_short 1");
  assert.equal(formatFullTextReasons({}), "none");
});

test("listing rows (no feed text) become FULL_TEXT when the page has text", async () => {
  const { http } = fakeHttp({ "https://www.gov.pl/web/rcb/alert": `<article><p>${LONG}</p></article>` });
  const d = doc("https://www.gov.pl/web/rcb/alert", { rawText: null, textKind: "METADATA_ONLY", collectedVia: "LISTING" });
  await applyFullText(http, [d], scope({ homeDomain: "gov.pl" }), limits, { remaining: 30 }, notStored);
  assert.equal(d.textKind, "FULL_TEXT");
});

test("collector.json: full_text only on feeds and listings with no no-AI, lead-only or metadata-only flag, and never on a barred domain", () => {
  const config = JSON.parse(readFileSync("data/sources/collector.json", "utf8"));
  const optedIn = [...config.feeds, ...config.listings].filter((f: { full_text?: boolean }) => f.full_text);
  assert.ok(optedIn.length > 0);
  assert.equal(typeof config.fetch_full_text, "boolean");
  assert.equal(config.full_text_max_pages, 30);
  assert.equal(config.full_text_max_chars, 20_000);
  const barredLists = [...config.blocked_automated_access, ...config.tos_prohibited_domains];
  const namedOff = new Set([...config.no_ai_processing_sources, ...config.citation_only_sources, ...config.lead_only_sources]);
  for (const f of optedIn) {
    assert.ok(!f.no_ai_processing && !f.lead_only && !f.metadata_only, `${f.key}: flagged source opted in`);
    assert.ok(!namedOff.has(f.source), `${f.key}: source is on a no-AI, citation-only or lead-only list`);
    const host = domainOf(f.url);
    assert.ok(!barredLists.some((d: string) => host === d || host.endsWith(`.${d}`)), `${f.key}: barred domain`);
  }
});

test("regex escapes are intact in article.mts", () => {
  const source = readFileSync("workers/collector/article.mts", "utf8");
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source), "control character in article.mts (an escape was mangled)");
  for (const fragment of ["<(div|section)\\b[^>]*\\bclass=", "<article\\b[^>]*>([\\s\\S]*?)<\\/article>", "split(/\\s+/)", "`<(\\\\/?)${tag}\\\\b[^>]*>`"]) {
    assert.ok(source.includes(fragment), `missing pattern fragment: ${fragment}`);
  }
});
