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
  BOX_STRINGS,
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
