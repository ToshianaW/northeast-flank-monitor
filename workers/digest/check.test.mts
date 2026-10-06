/**
 * Digest checks, replace rules, and [ref …] markers. No database or API calls.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDigestLine, hasMalformedMarker, parseDigestLine, stripDigestRefs } from "@/lib/digest-refs";
import {
  checkAiDigestSections,
  DIGEST_SECTIONS,
  HISTORICAL_CONTEXT_LINE,
  type DigestSections,
} from "@/lib/digests";
import { SIMILARITY_CAVEAT } from "@/lib/banned-phrases";
import { HISTORICAL_RECORD_NOTE } from "@/lib/historical-compare";
import {
  checkDigestOutput,
  decideDigestWrite,
  failureLines,
  quotedPassages,
  unverifiedNote,
  type AliasedEvent,
} from "./check.mjs";
import type { DigestOutput } from "./prompt.mjs";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";
const PUTIN_SUMMARY =
  'Russian President Vladimir Putin said Russia would consider using "all types of weapons" if Kaliningrad were attacked, according to Euronews. He also said Moscow had "no intention of attacking anyone."';
const E1: AliasedEvent = { alias: "E1", eventId: ID1, restricted: false, quotes: [] };
const E2: AliasedEvent = { alias: "E2", eventId: ID2, restricted: false, quotes: [] };
const E3: AliasedEvent = { alias: "E3", eventId: ID3, restricted: true, quotes: [] };
const E4: AliasedEvent = { alias: "E4", eventId: ID4, restricted: false, quotes: quotedPassages(PUTIN_SUMMARY) };
const events = [E1, E2, E3, E4];

const SUMMARY_TEXT = "Poland received an aircraft and Russia detained a ship.";
const good = (): DigestOutput => ({
  sections: [
    { key: "contradictions_unverified", sentences: [{ text: "A ministry said X.", event_refs: ["E3"] }] },
    { key: "executive_summary", sentences: [{ text: SUMMARY_TEXT, event_refs: ["E1", "E2"] }] },
    { key: "belarus", sentences: [] },
  ],
});

test("a valid digest passes, in display order, with empty sections dropped", () => {
  const r = checkDigestOutput(good(), events);
  assert.ok(r.ok);
  assert.deepEqual(r.sections.map((s) => s.key), [
    "executive_summary",
    "historical_context",
    "contradictions_unverified",
  ]);
  assert.deepEqual(r.sections[0].sentences[0].eventIds, [ID1, ID2]);
  assert.equal(r.sentenceCount, 2, "model sentences only");
  assert.equal(r.citedEvents, 3);
});

test("code appends the unverified note to the summary, with a marker for those events", () => {
  const r = checkDigestOutput(good(), events);
  assert.ok(r.ok);
  const summary = r.sections.find((s) => s.key === "executive_summary")!.sentences;
  assert.equal(summary.length, 2);
  assert.deepEqual(summary[1], {
    text: "1 other reported item is listed in the full digest under Contradictions & Unverified Reporting.",
    eventIds: [ID3],
    aliases: ["E3"],
    byCode: true,
  });
  assert.equal(
    unverifiedNote(3),
    "3 other reported items are listed in the full digest under Contradictions & Unverified Reporting.",
  );
});

test("when every event is unverified or contradicted, the summary is only the note", () => {
  const E5: AliasedEvent = { alias: "E5", eventId: ID2, restricted: true, quotes: [] };
  const r = checkDigestOutput(
    { sections: [{ key: "contradictions_unverified", sentences: [{ text: "A ministry said X.", event_refs: ["E3", "E5"] }] }] },
    [E3, E5],
  );
  assert.ok(r.ok);
  const summary = r.sections.find((s) => s.key === "executive_summary")!.sentences;
  assert.deepEqual(summary.map((s) => s.text), [unverifiedNote(2)]);
  assert.deepEqual(summary[0].eventIds, [ID3, ID2]);
});

test("when the model leaves Historical Context out, code writes the fixed line", () => {
  const r = checkDigestOutput(good(), events);
  assert.ok(r.ok);
  const historical = r.sections.find((s) => s.key === "historical_context");
  assert.deepEqual(historical?.sentences, [{ text: HISTORICAL_CONTEXT_LINE, eventIds: [], aliases: [], byCode: true }]);
});

/** Code-written lines from digests drafted before decision 24 (still accepted when a reviewer saves one). */
const LEGACY_LINES = [
  "Exercise: 15 historical events of this type were recorded across 5 months between Aug 2020 and Jan 2021.",
  "Mobilization: No entries of this type in the historical record so far. The record is partial.",
  HISTORICAL_RECORD_NOTE,
  SIMILARITY_CAVEAT,
];

const INTERPRETATION =
  "Poland's new aircraft echoes the basing announcements of late 2021, but unlike then, Russia answered at sea.";
const withHistorical = (sentences: DigestOutput["sections"][number]["sentences"]): DigestOutput => {
  const o = good();
  o.sections.push({ key: "historical_context", sentences });
  return o;
};

test("the model writes Historical Context, citing today's events and historical ones (decision 24)", () => {
  const r = checkDigestOutput(withHistorical([{ text: INTERPRETATION, event_refs: ["E1", "E2", "H1"] }]), events, ["H1", "H2"]);
  assert.ok(r.ok);
  const historical = r.sections.find((s) => s.key === "historical_context")!.sentences;
  assert.deepEqual(historical, [{ text: INTERPRETATION, eventIds: [ID1, ID2], aliases: ["E1", "E2"] }], "H aliases are not linked");
  assert.deepEqual(r.sections.map((s) => s.key), ["executive_summary", "historical_context", "contradictions_unverified"]);
});

test("Historical Context rules: H aliases only there, always with a current event, at most 4 sentences and 90 words", () => {
  const code = (o: DigestOutput) => {
    const r = checkDigestOutput(o, events, ["H1"]);
    return r.ok ? "OK" : r.code;
  };
  assert.equal(code(withHistorical([{ text: INTERPRETATION, event_refs: ["H1"] }])), "NO_REF", "needs a current event");
  assert.equal(code(withHistorical([{ text: INTERPRETATION, event_refs: ["E1", "H7"] }])), "UNKNOWN_REF");
  const o = good();
  o.sections.push({ key: "kaliningrad", sentences: [{ text: "Russia held a drill.", event_refs: ["E1", "H1"] }] });
  assert.equal(code(o), "UNKNOWN_REF", "historical aliases only in historical_context");
  assert.equal(code(withHistorical([{ text: "This echoes 2021; war is coming.", event_refs: ["E1"] }])), "BANNED_PHRASE", "no predictions");
  assert.equal(
    code(withHistorical(Array.from({ length: 5 }, (_, i) => ({ text: `Point ${i}.`, event_refs: ["E1"] })))),
    "SECTION_LENGTH",
  );
  assert.equal(code(withHistorical([{ text: `${"word ".repeat(91).trim()}.`, event_refs: ["E1"] }])), "SECTION_LENGTH");
});

test("topical sections are summaries: at most two sentences and 50 words", () => {
  const section = (sentences: string[]): DigestOutput => {
    const o = good();
    o.sections.push({ key: "nato_northeast_flank", sentences: sentences.map((text) => ({ text, event_refs: ["E1"] })) });
    return o;
  };
  assert.ok(checkDigestOutput(section(["Poland received aircraft.", "Lithuania hosted a drill."]), events).ok);
  const three = checkDigestOutput(section(["One.", "Two.", "Three."]), events);
  assert.ok(!three.ok && three.code === "SECTION_LENGTH");
  const long = checkDigestOutput(section([`${"word ".repeat(51).trim()}.`]), events);
  assert.ok(!long.ok && long.code === "SECTION_LENGTH");
  const unverified = good();
  unverified.sections[0].sentences.push({ text: "B said Y.", event_refs: ["E3"] }, { text: "C said Z.", event_refs: ["E3"] });
  assert.ok(checkDigestOutput(unverified, events).ok, "contradictions_unverified allows three sentences");
});

test("the summary may repeat a topical sentence exactly", () => {
  const o = good();
  o.sections.push({ key: "nato_northeast_flank", sentences: [{ text: SUMMARY_TEXT, event_refs: ["E1", "E2"] }] });
  assert.ok(checkDigestOutput(o, events).ok);
});

function failsWith(mutate: (o: DigestOutput) => void, code: string) {
  const o = good();
  mutate(o);
  const r = checkDigestOutput(o, events);
  assert.equal(r.ok, false, code);
  if (!r.ok) assert.equal(r.code, code);
}

test("each failure code", () => {
  failsWith((o) => (o.sections[1].sentences[0].event_refs = ["E9"]), "UNKNOWN_REF");
  failsWith((o) => (o.sections[1].sentences[0].event_refs = []), "NO_REF");
  failsWith((o) => (o.sections[1].sentences[0].text = "An attack is imminent."), "BANNED_PHRASE");
  failsWith((o) => (o.sections[1].sentences[0].text = "Officials signalled that talks ended."), "BANNED_PHRASE");
  failsWith((o) => (o.sections[1].key = "outlook"), "BAD_SECTION");
  failsWith((o) => (o.sections[2].key = "executive_summary"), "BAD_SECTION");
  failsWith((o) => (o.sections[1].sentences[0].event_refs = ["E1", "E3"]), "PLACEMENT");
  failsWith((o) => (o.sections[1].sentences[0].text = "Line one.\nLine two."), "FORMAT");
  failsWith((o) => (o.sections[1].sentences[0].text = "See [ref E1]."), "FORMAT");
  // Summary required whenever an allowed event exists; at most two sentences and 45 words.
  failsWith((o) => o.sections.splice(1, 1), "SUMMARY_MISSING");
  failsWith(
    (o) => o.sections[1].sentences.push({ text: "Second.", event_refs: ["E1"] }, { text: "Third.", event_refs: ["E2"] }),
    "SUMMARY_LENGTH",
  );
  failsWith((o) => (o.sections[1].sentences[0].text = `${"word ".repeat(46).trim()}.`), "SUMMARY_LENGTH");
  // A verbatim repeat between two topical sections, even with different case or final punctuation.
  failsWith(
    (o) =>
      o.sections.push(
        { key: "nato_northeast_flank", sentences: [{ text: "Poland received an aircraft at Łask.", event_refs: ["E1"] }] },
        { key: "air_activity", sentences: [{ text: "poland received an aircraft at łask", event_refs: ["E1"] }] },
      ),
    "DUPLICATE_SENTENCE",
  );
  // A repeat within one section, including the summary.
  failsWith((o) => o.sections[0].sentences.push({ text: "A ministry said X", event_refs: ["E3"] }), "DUPLICATE_SENTENCE");
  failsWith((o) => o.sections[1].sentences.push({ text: SUMMARY_TEXT, event_refs: ["E1"] }), "DUPLICATE_SENTENCE");
});

test("QUALIFIER: a quoted claim must travel with the summary's other quoted passages", () => {
  assert.deepEqual(quotedPassages(PUTIN_SUMMARY), ["all types of weapons", "no intention of attacking anyone"]);
  const withKaliningrad = (text: string): DigestOutput => ({
    sections: [
      { key: "executive_summary", sentences: [{ text: "Putin spoke about Kaliningrad.", event_refs: ["E4"] }] },
      { key: "kaliningrad", sentences: [{ text, event_refs: ["E4"] }] },
    ],
  });
  // Claim quoted alone: fails.
  const alone = checkDigestOutput(withKaliningrad('Putin said Russia would consider using "all types of weapons" if Kaliningrad were attacked.'), events);
  assert.equal(alone.ok, false);
  if (!alone.ok) assert.equal(alone.code, "QUALIFIER");
  // Claim and qualifier in one sentence, curly quotes: passes.
  assert.ok(
    checkDigestOutput(
      withKaliningrad("Putin said Russia would consider using “all types of weapons” if Kaliningrad were attacked and that Moscow had “no intention of attacking anyone.”"),
      events,
    ).ok,
  );
  // Paraphrase without quotation marks is not checked by code (the prompt covers it).
  assert.ok(checkDigestOutput(withKaliningrad("Putin made a statement about Kaliningrad."), events).ok);
});

test("CI failure output has the code and position only, never sentence text", () => {
  const r = checkDigestOutput(
    { sections: [{ key: "belarus", sentences: [{ text: "Secret wording that is imminent.", event_refs: ["E1"] }] }] },
    events,
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  const ci = failureLines(r, { ci: true, attempt: 1 }).join("\n");
  assert.equal(ci, "attempt 1: check BANNED_PHRASE at section 1 sentence 1");
  assert.doesNotMatch(ci, /Secret wording/);
  const local = failureLines(r, { ci: false, attempt: 1 }).join("\n");
  assert.match(local, /rejected: Secret wording that is imminent\./);
});

test("replace rules: PUBLISHED never; edited or manual DRAFT only with --force", () => {
  const draft = { review_status: "DRAFT", edited: false, aiDrafted: true };
  const no = { replaceDraft: false, force: false };
  const replace = { replaceDraft: true, force: false };
  const force = { replaceDraft: true, force: true };
  assert.deepEqual(decideDigestWrite(null, no), { action: "INSERT" });
  assert.deepEqual(decideDigestWrite(draft, no), { action: "SKIP", status: "EXISTS" });
  assert.deepEqual(decideDigestWrite(draft, replace), { action: "REPLACE" });
  assert.deepEqual(decideDigestWrite({ ...draft, edited: true }, replace), { action: "SKIP", status: "EDITED_DRAFT" });
  assert.deepEqual(decideDigestWrite({ ...draft, edited: true }, force), { action: "REPLACE" });
  assert.deepEqual(decideDigestWrite({ ...draft, aiDrafted: false }, replace), { action: "SKIP", status: "MANUAL_DRAFT" });
  for (const flags of [no, replace, force]) {
    assert.deepEqual(decideDigestWrite({ ...draft, review_status: "PUBLISHED" }, flags), {
      action: "SKIP",
      status: "PUBLISHED_EXISTS",
    });
  }
});

test("[ref …] markers round-trip, survive text edits, and damage is detected", () => {
  const line = formatDigestLine("ERR reported a detention.", [ID1, ID2]);
  assert.deepEqual(parseDigestLine(line), { text: "ERR reported a detention.", eventIds: [ID1, ID2] });
  const edited = line.replace("a detention", "the detention of a cargo ship");
  assert.deepEqual(parseDigestLine(edited).eventIds, [ID1, ID2]);
  assert.equal(hasMalformedMarker(line), false);
  assert.equal(hasMalformedMarker(line.slice(0, -1)), true);
  assert.equal(hasMalformedMarker(line.replace(ID1, "1111")), true);
  assert.equal(hasMalformedMarker("Plain manual text."), false);
  assert.equal(stripDigestRefs(`${line}\n${formatDigestLine("Second.", [ID3])}`), "ERR reported a detention. Second.");
});

test("saving an AI digest requires a marker on every sentence and no banned phrase", () => {
  const sections = Object.fromEntries(DIGEST_SECTIONS.map(({ key }) => [key, ""])) as DigestSections;
  sections.executive_summary = [
    formatDigestLine("Poland received an aircraft.", [ID1]),
    formatDigestLine(unverifiedNote(1), [ID3]),
  ].join("\n");
  assert.deepEqual(checkAiDigestSections(sections), {});
  sections.belarus = "A sentence the reviewer added without a marker.";
  assert.match(checkAiDigestSections(sections).belarus ?? "", /no \[ref/);
  sections.belarus = formatDigestLine("An attack is imminent.", [ID2]);
  assert.match(checkAiDigestSections(sections).belarus ?? "", /predictive phrase/);
  sections.belarus = "";
  sections.historical_context = HISTORICAL_CONTEXT_LINE;
  assert.deepEqual(checkAiDigestSections(sections), {}, "the fixed Historical Context line needs no marker");
  sections.historical_context = LEGACY_LINES.join("\n");
  assert.deepEqual(checkAiDigestSections(sections), {}, "code-written lines in older digests need no marker");
  sections.historical_context = formatDigestLine("The current period resembles January 2021.", [ID1]);
  assert.deepEqual(checkAiDigestSections(sections), {}, "interpretation is allowed in Historical Context (decision 24)");
  sections.historical_context = "The current period resembles January 2021.";
  assert.match(checkAiDigestSections(sections).historical_context ?? "", /Line 1 has no \[ref/);
  sections.historical_context = formatDigestLine("An attack is imminent, as in 2021.", [ID1]);
  assert.match(checkAiDigestSections(sections).historical_context ?? "", /predictive phrase/);
  sections.historical_context = "";
  sections.belarus = LEGACY_LINES[0];
  assert.match(checkAiDigestSections(sections).belarus ?? "", /no \[ref/, "the code-written form is exempt only in Historical Context");
});
