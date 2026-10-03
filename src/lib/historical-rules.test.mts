/**
 * Historical period, coverage note and excerpt rules (no database). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverageNote,
  excerptWordCount,
  HISTORICAL_LABEL,
  lastDayOf,
  monthsBetween,
  parsePeriod,
} from "./historical-rules";

test("monthsBetween covers the full period and crosses years", () => {
  const all = monthsBetween("2020-08", "2022-02");
  assert.equal(all.length, 19);
  assert.equal(all[0], "2020-08");
  assert.equal(all[5], "2021-01");
  assert.equal(all.at(-1), "2022-02");
});

test("parsePeriod keeps valid months, swaps reversed ones, and ignores anything outside the period", () => {
  assert.deepEqual(parsePeriod({ from: "2021-01", to: "2021-02" }), { from: "2021-01", to: "2021-02" });
  assert.deepEqual(parsePeriod({ from: "2021-04", to: "2021-01" }), { from: "2021-01", to: "2021-04" });
  assert.deepEqual(parsePeriod({ from: "2019-01", to: "2026-10" }), { from: "2020-08", to: "2022-02" });
  assert.deepEqual(parsePeriod({ from: "nonsense" }), { from: "2020-08", to: "2022-02" });
  assert.equal(lastDayOf("2021-02"), "2021-02-28");
  assert.equal(lastDayOf("2020-12"), "2020-12-31");
});

test("coverage note names covered months with counts and every empty month", () => {
  const note = coverageNote({
    events: 4,
    sources: 3,
    months: [
      { month: "2021-01", events: 3 },
      { month: "2021-02", events: 1 },
      { month: "2021-03", events: 0 },
    ],
  });
  assert.equal(
    note,
    "4 historical events from 3 sources across these months: Jan 2021 (3), Feb 2021 (1). No entries yet: Mar 2021. This is a partial record, not a complete one.",
  );
  assert.match(
    coverageNote({ events: 0, sources: 0, months: [{ month: "2020-08", events: 0 }] }),
    /^0 historical events from 0 sources in this period\. No entries yet: Aug 2020\./,
  );
  assert.match(coverageNote({ events: 1, sources: 1, months: [{ month: "2021-01", events: 1 }] }), /^1 historical event from 1 source /);
  assert.equal(HISTORICAL_LABEL, "Historical record, not current reporting.");
});

test("excerpt word count matches the 0008 CHECK (whitespace runs, trimmed)", () => {
  assert.equal(excerptWordCount("  one   two\nthree\t"), 3);
  assert.equal(excerptWordCount("   "), 0);
});
