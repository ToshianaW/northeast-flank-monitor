/**
 * X post text (no network, no database). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPostText,
  countryFlag,
  digestPostInput,
  fitWholeSentences,
  MAX_WEIGHT,
  postWeight,
  splitSentences,
  truncateToWeight,
  weightedLength,
} from "./x-text";

test("daily digest: dated label, Summary without reference markers, link to the digest page", () => {
  const digest = {
    digest_date: "2026-10-01",
    title: "Northeast Flank Daily Digest",
    sections: {
      executive_summary:
        "Belarus's defence ministry said a readiness check began. [ref 402aff7d-1111-4111-8111-111111111111]\nLithuania reported an airspace violation. [ref a07251ae-2222-4222-8222-222222222222]",
      belarus: "Not posted.",
    },
  };
  const input = digestPostInput(digest, "https://example.org/");
  assert.equal(input.sourceUrl, "https://example.org/digest/2026-10-01");
  const r = buildPostText(input);
  assert.ok(r.ok);
  assert.equal(
    r.text,
    "Daily digest, 1 Oct 2026: Belarus's defence ministry said a readiness check began. Lithuania reported an airspace violation.\nhttps://example.org/digest/2026-10-01",
  );
  assert.ok(!/\[ref/.test(r.text));
  assert.equal(digestPostInput(digest, null).sourceUrl, null, "no site URL, no link");
  const empty = buildPostText(digestPostInput({ ...digest, sections: {} }, "https://example.org"));
  assert.ok(empty.ok && empty.text.startsWith("Daily digest, 1 Oct 2026: Northeast Flank Daily Digest\n"));
});

const url = "https://www.mil.by/ru/news/123456/a-very-long-path-segment-that-x-still-counts-as-twenty-three";

test("summary and source link, separated by a line break", () => {
  const r = buildPostText({ summary: "Belarus's defence ministry said a readiness check began.", headline: "H", sourceUrl: url });
  assert.ok(r.ok);
  assert.equal(r.text, `Belarus's defence ministry said a readiness check began.\n${url}`);
});

test("headline is used when there is no summary", () => {
  const r = buildPostText({ summary: "  ", headline: "Lithuania reports airspace violation", sourceUrl: url });
  assert.ok(r.ok && r.text.startsWith("Lithuania reports airspace violation\n"));
});

test("long summaries are cut at a word boundary and the post stays within 280", () => {
  const summary = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const r = buildPostText({ summary, headline: "H", sourceUrl: url });
  assert.ok(r.ok);
  assert.ok(postWeight(r.text) <= MAX_WEIGHT, String(postWeight(r.text)));
  const body = r.text.split("\n")[0];
  assert.ok(body.endsWith("…"));
  assert.match(body, /word\d+…$/, "ends on a whole word");
  assert.ok(r.text.endsWith(url), "the link is kept whole");
});

test("a long summary posts its whole leading sentences (the hook), never a cut-off sentence", () => {
  const hook = "Russia moved Iskander launchers to Kaliningrad Oblast, Lithuania's defence ministry said.";
  const second = "The ministry said the U.S. Army and Gen. Smith's staff were briefed on 3 October.";
  const filler = `It added that ${"further routine details ".repeat(12).trim()}.`;
  const r = buildPostText({ summary: `${hook} ${second} ${filler}`, headline: "H", sourceUrl: url });
  assert.ok(r.ok);
  assert.equal(r.text, `${hook} ${second}\n${url}`, "abbreviations do not end a sentence");
  assert.ok(postWeight(r.text) <= MAX_WEIGHT);
  assert.deepEqual(splitSentences("Talks with the U.S. ended. No. 5 Brigade moved."), [
    "Talks with the U.S. ended.",
    "No. 5 Brigade moved.",
  ]);
  assert.equal(fitWholeSentences(`${"x".repeat(300)}. Short.`, 100), null, "first sentence too long: caller cuts it");
});

test("events open with 🚨, the country's flag and NEW, or BREAKING when the reviewer chose it", () => {
  const summary = "Sweden's armed forces said two Russian aircraft were intercepted over the Baltic Sea.";
  const post = (countries: Array<string | null>, breaking: boolean) =>
    buildPostText({ summary, headline: "H", sourceUrl: url, alert: { countries, breaking } });
  const n = post(["Sweden"], false);
  assert.ok(n.ok);
  assert.equal(n.text, `🚨🇸🇪 NEW: ${summary}\n${url}`);
  const b = post(["SE"], true);
  assert.ok(b.ok && b.text.startsWith("🚨🇸🇪 BREAKING: "));
  const none = post(["International"], false);
  assert.ok(none.ok && none.text.startsWith("🚨 NEW: "), "no flag when no single known country");
  const two = post(["Lithuania", "Poland", "Latvia"], false);
  assert.ok(two.ok && two.text.startsWith("🚨🇱🇹🇵🇱 NEW: "), "exercises show at most two flags");
  assert.equal(countryFlag("russian federation"), "🇷🇺");
  assert.equal(countryFlag(null), "");
  // The prefix comes out of the same 280 budget.
  const long = buildPostText({ summary: "word ".repeat(120), headline: "H", sourceUrl: url, alert: { countries: ["Poland"], breaking: true } });
  assert.ok(long.ok && postWeight(long.text) <= MAX_WEIGHT && long.text.startsWith("🚨🇵🇱 BREAKING: "));
});

test("weights: Latin and Cyrillic count 1, emoji and CJK count 2", () => {
  assert.equal(weightedLength("Минск"), 5);
  assert.equal(weightedLength("ab"), 2);
  assert.equal(weightedLength("🙂"), 2);
  assert.equal(weightedLength("北约"), 4);
  // "…" itself weighs 2 (outside X's light ranges); the cut text never exceeds the budget.
  assert.equal(weightedLength("…"), 2);
  assert.ok(weightedLength(truncateToWeight("北约".repeat(200), 100)) <= 100);
});

test("refusals: no source link, predictive wording, coordinates", () => {
  assert.deepEqual(buildPostText({ summary: "x", headline: "H", sourceUrl: null }), { ok: false, reason: "no source link" });
  assert.deepEqual(buildPostText({ summary: "x", headline: "H", sourceUrl: "javascript:alert(1)" }), { ok: false, reason: "no source link" });
  const p = buildPostText({ summary: "Officials said an attack is imminent.", headline: "H", sourceUrl: url });
  assert.ok(!p.ok && /predictive/.test(p.reason));
  const c = buildPostText({ summary: "Units were seen at 53.91, 27.56 near Minsk.", headline: "H", sourceUrl: url });
  assert.ok(!c.ok && /coordinates/.test(c.reason));
});
