/**
 * Polish stem filter and pay_status handling (rp.pl feeds). Run: npm test
 * Uses the stems from data/sources/collector.json, so edits to that list are checked here too.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { collectFeed, foldDiacritics, makeKeywordMatcher, makePolishMatcher, type FeedConfig } from "./feeds.mjs";
import type { HttpClient } from "./fetch.mjs";

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
