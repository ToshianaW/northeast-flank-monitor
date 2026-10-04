/**
 * "Similar in nature" references: fixed attributes, code-composed box wording, and the wording
 * check on the box. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COMPARISON_EXEMPT, findBannedPhrase, findComparisonWording } from "./banned-phrases";
import {
  AI_SUGGESTED_LABEL,
  AUTO_LINK_NOTE,
  BOX_STRINGS,
  pairHash,
  planAutoLinks,
  rankAutoLinks,
  type AutoEvent,
  boxText,
  decodeSuggestions,
  encodeSuggestions,
  REFERENCE_ATTRIBUTES,
  REFERENCE_MESSAGES,
  REFERENCES_HEADING,
  referenceLine,
  SIMILARITY_CAVEAT,
  verifiedAttributes,
  type ApprovedReference,
  type ReferenceFields,
} from "./historical-references-rules";

const CURRENT: ReferenceFields = { event_type: "EXERCISE", country: "Belarus", actor: "Belarusian Armed Forces" };
const ID = "11111111-1111-4111-8111-111111111111";
const REF: ApprovedReference = {
  historical_event_id: ID,
  event_date: new Date("2021-01-15T00:00:00Z"),
  headline: "Belarus begins a snap readiness check",
  event_type: "EXERCISE",
  shared_attributes: ["SAME_COUNTRY", "SAME_EVENT_TYPE"],
  matched_by: "REVIEWER",
  ai_suggested: false,
};

test("the attribute list is fixed and matches migration 0010", () => {
  assert.deepEqual([...REFERENCE_ATTRIBUTES], ["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_ACTOR", "SAME_KIND_OF_ACTIVITY"]);
  const sql = readFileSync(join(process.cwd(), "src/db/migrations/0010_historical_references.sql"), "utf8");
  for (const a of REFERENCE_ATTRIBUTES) assert.ok(sql.includes(`'${a}'`), a);
});

test("type, country and actor are verified by code; unknown and repeated attributes are dropped", () => {
  const historical: ReferenceFields = { event_type: "EXERCISE", country: " belarus ", actor: "Russian Armed Forces" };
  assert.deepEqual(
    verifiedAttributes(CURRENT, historical, ["SAME_ACTOR", "SAME_COUNTRY", "SAME_EVENT_TYPE", "SAME_KIND_OF_ACTIVITY", "SAME_COUNTRY", "PHASE_1"]),
    ["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_KIND_OF_ACTIVITY"],
  );
  assert.deepEqual(verifiedAttributes({ ...CURRENT, country: null }, { ...historical, country: null }, ["SAME_COUNTRY"]), []);
});

test("exact public wording of a box line", () => {
  assert.deepEqual(referenceLine(REF, CURRENT), {
    href: `/historical/${ID}`,
    headline: "Belarus begins a snap readiness check",
    date: "15 Jan 2021",
    typeLabel: "Exercise",
    shared: "Shared: same event type (Exercise), same country (Belarus).",
    note: null,
  });
  assert.equal(
    referenceLine({ ...REF, shared_attributes: ["SAME_KIND_OF_ACTIVITY", "SAME_ACTOR"] }, CURRENT).shared,
    "Shared: same actor (Belarusian Armed Forces), same kind of activity.",
  );
  assert.equal(REFERENCES_HEADING, "Historical record: similar in nature");
  assert.equal(SIMILARITY_CAVEAT, "Similarity in nature does not mean the same outcome will follow.");
});

test("a headline that fails the wording check is replaced by date, type and a View entry link", () => {
  for (const headline of ["Drills resemble the early stage of 2021", "A precursor exercise", "Invasion is imminent"]) {
    const line = referenceLine({ ...REF, headline }, CURRENT);
    assert.equal(line.headline, null, headline);
    assert.match(boxText([line]), /15 Jan 2021 · Exercise · View entry/);
  }
  const unsafeActor = referenceLine({ ...REF, shared_attributes: ["SAME_ACTOR"] }, { ...CURRENT, actor: "Phase 2 forces" });
  assert.equal(unsafeActor.shared, "Shared: same actor.", "an unsafe data value is left out");
});

test("box wording: only the heading and the fixed caveat are exempt; no phase, stage, outcome or score language", () => {
  assert.deepEqual(COMPARISON_EXEMPT, [SIMILARITY_CAVEAT, REFERENCES_HEADING]);
  const text = boxText([referenceLine(REF, CURRENT), referenceLine({ ...REF, headline: "Phase 1 begins" }, CURRENT)]);
  assert.equal(findComparisonWording(text), null);
  assert.equal(findBannedPhrase(text), null);
  for (const s of BOX_STRINGS) assert.equal(findComparisonWording(s), null, s);
  for (const forbidden of [/\bphase/i, /early stage/i, /\boutcome will\b(?! follow\.)/i, /\bscore/i, /%/]) {
    assert.ok(!forbidden.test(text.replace(SIMILARITY_CAVEAT, "")), String(forbidden));
  }
  assert.notEqual(findComparisonWording(`${REFERENCES_HEADING} and matching 2021`), null, "only the exact heading is exempt");
  for (const message of Object.values(REFERENCE_MESSAGES)) assert.equal(findComparisonWording(message), null, message);
});

test("the public component shows only code-composed strings", () => {
  const source = readFileSync(join(process.cwd(), "src/components/historical/similar-in-nature.tsx"), "utf8");
  const jsxText = [...source.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter((t) => /[A-Za-z]/.test(t));
  assert.deepEqual(jsxText, [], `literal text in the component: ${jsxText.join(" | ")}`);
});

test("suggestions round-trip through the URL; malformed parts are dropped", () => {
  const list = [{ historical_event_id: ID, attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY"] as const }];
  assert.deepEqual(decodeSuggestions(encodeSuggestions(list.map((s) => ({ ...s, attributes: [...s.attributes] })))), [
    { historical_event_id: ID, attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY"] },
  ]);
  assert.deepEqual(decodeSuggestions(`not-a-uuid:SAME_COUNTRY,${ID}:PHASE_2`), []);
  assert.deepEqual(decodeSuggestions(undefined), []);
});

test("automatic links: wording, AI label, and no new exempt string", () => {
  const auto = referenceLine({ ...REF, matched_by: "AUTO" }, CURRENT);
  assert.equal(auto.note, "Linked automatically by event type and country.");
  assert.equal(AUTO_LINK_NOTE, "Linked automatically by event type and country.");
  const ai = referenceLine({ ...REF, shared_attributes: ["SAME_KIND_OF_ACTIVITY"], ai_suggested: true }, CURRENT);
  assert.equal(ai.shared, "Shared: same kind of activity (AI-suggested, reviewer-approved).");
  assert.equal(ai.note, null);
  assert.deepEqual(COMPARISON_EXEMPT, [SIMILARITY_CAVEAT, REFERENCES_HEADING], "no new exempt string");
  for (const s of [AUTO_LINK_NOTE, AI_SUGGESTED_LABEL]) {
    assert.equal(findComparisonWording(s), null, s);
    assert.equal(findBannedPhrase(s), null, s);
  }
  assert.equal(findComparisonWording(boxText([auto, ai])), null);
});

const ev = (id: string, over: Partial<AutoEvent> = {}): AutoEvent => ({
  event_id: id,
  event_type: "EXERCISE",
  country: "Belarus",
  actor: "Belarusian Armed Forces",
  ...over,
});
const H = (n: number, over: Partial<AutoEvent> = {}) => ev(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, over);

test("automatic candidates need the same type AND country; same actor ranks first and adds SAME_ACTOR", () => {
  const current = ev("cur-1");
  const candidates = [
    H(1, { actor: "Russian Armed Forces" }),
    H(2, { country: "Poland" }),
    H(3, { event_type: "AIR_ACTIVITY" }),
    H(4, { country: " BELARUS " }),
    H(5, { country: null }),
  ];
  const links = rankAutoLinks(current, candidates, { slots: 3, linkCounts: new Map(), excluded: new Set() });
  assert.deepEqual(links, [
    { historical_event_id: H(4).event_id, attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_ACTOR"] },
    { historical_event_id: H(1).event_id, attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY"] },
  ]);
  assert.deepEqual(rankAutoLinks(ev("cur-2", { country: null }), candidates, { slots: 3, linkCounts: new Map(), excluded: new Set() }), []);
  assert.deepEqual(rankAutoLinks(current, candidates, { slots: 0, linkCounts: new Map(), excluded: new Set() }), []);
  assert.deepEqual(
    rankAutoLinks(current, candidates, { slots: 3, linkCounts: new Map(), excluded: new Set([H(4).event_id]) }).map((l) => l.historical_event_id),
    [H(1).event_id],
    "removed or existing pairs are excluded",
  );
});

test("spreading: fewest links first, then a fixed per-pair hash; the plan is deterministic", () => {
  const historical = Array.from({ length: 6 }, (_, i) => H(i + 1));
  const events = Array.from({ length: 4 }, (_, i) => ev(`event-${i + 1}`));
  const state = { existingByEvent: new Map(), linkCounts: new Map(), removedPairs: new Set<string>() };
  const plan = planAutoLinks(events, historical, state);
  assert.deepEqual(planAutoLinks(events, historical, state), plan, "same input, same plan");
  const counts = new Map<string, number>();
  for (const links of plan.values()) {
    assert.equal(links.length, 3);
    for (const l of links) counts.set(l.historical_event_id, (counts.get(l.historical_event_id) ?? 0) + 1);
  }
  // 12 links over 6 entries: every entry used exactly twice.
  assert.deepEqual([...counts.values()].sort(), [2, 2, 2, 2, 2, 2]);
  // Different events tie-break differently (not always the same first entry).
  const firsts = new Set([...plan.values()].map((l) => l[0].historical_event_id));
  assert.ok(firsts.size > 1);
  assert.equal(pairHash("a", "b"), pairHash("a", "b"));
  assert.notEqual(pairHash("a", "b"), pairHash("b", "a"));
});

test("the plan keeps existing links, fills only free slots, and never re-adds a removed pair", () => {
  const historical = [H(1), H(2), H(3), H(4)];
  const e = ev("event-x");
  const plan = planAutoLinks([e], historical, {
    existingByEvent: new Map([[e.event_id, [H(1).event_id]]]),
    linkCounts: new Map([[H(1).event_id, 1]]),
    removedPairs: new Set([`${e.event_id}:${H(2).event_id}`]),
  });
  const ids = plan.get(e.event_id)!.map((l) => l.historical_event_id).sort();
  assert.deepEqual(ids, [H(3).event_id, H(4).event_id].sort());
});
