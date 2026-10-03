/**
 * Rule-based confidence suggestion (decision #13). No database.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestConfidence, type SuggestionSource } from "./confidence-suggestion";

let next = 0;
function src(overrides: Partial<SuggestionSource> = {}): SuggestionSource {
  next += 1;
  return {
    source_id: `s${next}`,
    name: `Outlet ${next}`,
    tier: 3,
    source_type: "ESTABLISHED_MEDIA",
    source_country: "Estonia",
    relationship: "SUPPORTS",
    ...overrides,
  };
}

const suggest = (sources: SuggestionSource[], contradiction_flag = false) =>
  suggestConfidence({ sources, contradiction_flag });

test("no supporting source gives no suggestion", () => {
  assert.equal(suggest([]), null);
  assert.equal(suggest([src({ relationship: "CONTRADICTS" })]), null);
});

test("Tier 4 or untiered sources only give UNVERIFIED", () => {
  const s = suggest([src({ tier: 4, source_type: "OSINT" }), src({ tier: null })]);
  assert.equal(s?.level, "UNVERIFIED");
  assert.equal(s?.reason, "Tier 4 sources only");
});

test("one non-official Tier 1-3 outlet gives MODERATE, naming it", () => {
  const s = suggest([src({ name: "ERR" }), src({ tier: 4, source_type: "OSINT" })]);
  assert.equal(s?.level, "MODERATE");
  assert.equal(s?.reason, "One outlet: ERR");
  assert.equal(s?.officialOnlyNote, false);
});

test("several URLs from one outlet count once", () => {
  const err = src({ name: "ERR" });
  const s = suggest([err, { ...err }, { ...err }]);
  assert.equal(s?.level, "MODERATE");
  assert.equal(s?.reason, "One outlet: ERR");
});

test("two distinct Tier 1-3 outlets, at least one not official, give HIGH", () => {
  const s = suggest([src({ name: "ERR" }), src({ name: "LRT" })]);
  assert.equal(s?.level, "HIGH");
  assert.equal(s?.reason, "2 outlets: ERR, LRT");

  const mixed = suggest([
    src({ name: "Lithuanian MoD", tier: 1, source_type: "OFFICIAL_MILITARY", source_country: "Lithuania" }),
    src({ name: "LRT" }),
  ]);
  assert.equal(mixed?.level, "HIGH");
});

test("official sources only (any country) give MODERATE with the note", () => {
  const s = suggest([
    src({ name: "Polish MoD", tier: 1, source_type: "OFFICIAL_GOVERNMENT", source_country: "Poland" }),
    src({ name: "Lithuanian MoD", tier: 1, source_type: "OFFICIAL_MILITARY", source_country: "Lithuania" }),
  ]);
  assert.equal(s?.level, "MODERATE");
  assert.equal(s?.officialOnlyNote, true);
  assert.equal(s?.stateSource, false);
});

test("a Russian or Belarusian state source only gives MODERATE with the note and state label", () => {
  const s = suggest([
    src({ name: "Belarus MoD", tier: 1, source_type: "OFFICIAL_MILITARY", source_country: "Belarus" }),
  ]);
  assert.equal(s?.level, "MODERATE");
  assert.equal(s?.officialOnlyNote, true);
  assert.equal(s?.stateSource, true);
});

test("a CONTRADICTS source or the contradiction flag caps at MODERATE with a warning", () => {
  const two = [src({ name: "ERR" }), src({ name: "LRT" })];
  const contradicted = suggest([...two, src({ relationship: "CONTRADICTS" })]);
  assert.equal(contradicted?.level, "MODERATE");
  assert.equal(contradicted?.conflictWarning, true);

  const flagged = suggest(two, true);
  assert.equal(flagged?.level, "MODERATE");
  assert.equal(flagged?.conflictWarning, true);

  // Lower suggestions are not raised, but still warn.
  const tier4 = suggest([src({ tier: 4 })], true);
  assert.equal(tier4?.level, "UNVERIFIED");
  assert.equal(tier4?.conflictWarning, true);
});

test("never suggests CONFIRMED", () => {
  const many = Array.from({ length: 6 }, () => src({ tier: 1 }));
  assert.equal(suggest(many)?.level, "HIGH");
});
