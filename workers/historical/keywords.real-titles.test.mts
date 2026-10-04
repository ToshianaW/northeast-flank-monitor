/**
 * The OSW title filter on real titles from the 261-item OSW listing (analyses and commentary,
 * Aug 2020 - Feb 2022, fetched 2026-10-03), plus checks that the regex escapes are intact:
 * this test fails if "\b" or "\p{L}" is mangled (for example by a shell heredoc). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { KEYWORD_PATTERNS, matchesMilitaryKeywords, matchesNatoSlug, matchesOswContext } from "./keywords.mjs";

test("NATO slug keywords match whole hyphen-separated words", () => {
  for (const s of [
    "nato-allies-air-policing-in-the-baltic-region",
    "enhanced-forward-presence-battlegroup-in-latvia-exercises",
    "secretary-general-statement-on-russia",
    "readiness-initiative-update",
    "nato-secretary-general-and-the-lithuanian-foreign-minister-shared-views-on-natos-future",
  ]) assert.ok(matchesNatoSlug(s), s);
  for (const s of ["nato-secretary-general-visits-canada", "covid-19-support", "prussian-history"]) {
    assert.ok(!matchesNatoSlug(s), s);
  }
});

/** Real titles from the listing, as the listing shows them (punctuation stripped by OSW). */
const KEPT = [
  "Russia demonstrates its power in Belarus and on the oceans worldwide",
  "Troops withdrawing Russian forces still on Ukraines borders",
  "Reinforcing the frontier the Baltic states Armed Forces in border protection tasks",
  "US Army in Lithuania a new outpost on the eastern flank",
  "Finland back to the NATO debate",
];
const DROPPED = [
  "Navalny arrested upon his return to Russia",
  "Russia mass protests in defence of Navalny",
  "Alexei Navalny sentenced to prison",
  "Germany the case of Navalny and Nord Stream 2",
  "An attempt at a new start in energy cooperation between Belarus and Russia",
];

test("real OSW titles: military-context titles are kept, Navalny and energy titles dropped", () => {
  for (const t of KEPT) assert.ok(matchesOswContext(t), `should keep: ${t}`);
  for (const t of DROPPED) assert.ok(!matchesOswContext(t), `should drop: ${t}`);
});

test('"naval" matches and "Navalny" does not (no real naval title is in the 261-item list)', () => {
  assert.ok(matchesOswContext("Naval exercises in the Gulf of Finland"));
  assert.ok(matchesMilitaryKeywords("Naval exercises in the Gulf of Finland"));
  assert.ok(matchesMilitaryKeywords("The Russian navy in the Baltic"));
  assert.ok(!matchesMilitaryKeywords("Navalny arrested upon his return to Russia"));
});

test("regex escapes are intact (word boundaries and the Unicode letter class)", () => {
  for (const [name, re] of Object.entries(KEYWORD_PATTERNS)) {
    assert.ok(!/[\u0000-\u001f]/.test(re.source), `${name}: control character in the pattern (an escape was mangled)`);
    assert.ok(re.source.includes("(^|[^\\p{L}])"), `${name}: the Unicode letter class is missing`);
    assert.ok(re.flags.includes("u"), `${name}: needs the u flag`);
  }
  for (const word of ["naval\\b", "navy\\b"]) {
    assert.ok(KEYWORD_PATTERNS.military.source.includes(word), `military: ${word}`);
    assert.ok(KEYWORD_PATTERNS.oswInclude.source.includes(word), `oswInclude: ${word}`);
  }
  assert.ok(KEYWORD_PATTERNS.oswExclude.source.includes("gas\\b"));
});
