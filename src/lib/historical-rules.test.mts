/**
 * Historical period, coverage note and excerpt rules (no database). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverageNote,
  emptyStateText,
  emptyGroupText,
  groupTypeSummaries,
  monthSpan,
  monthStrip,
  selectMonth,
  typeFromSlug,
  typeSlug,
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

test("coverage note can leave out the empty-month roll-call", () => {
  const c = { events: 1, sources: 1, months: [{ month: "2021-01", events: 1 }, { month: "2021-02", events: 0 }] };
  assert.match(coverageNote(c), /No entries yet: Feb 2021\./);
  const short = coverageNote(c, { listEmptyMonths: false });
  assert.equal(short, "1 historical event from 1 source across these months: Jan 2021 (1). This is a partial record, not a complete one.");
});

test("type slugs round-trip; unknown slugs are rejected", () => {
  assert.equal(typeSlug("READINESS_CHECK"), "readiness-check");
  assert.equal(typeFromSlug("readiness-check"), "READINESS_CHECK");
  assert.equal(typeFromSlug("political-signaling"), "POLITICAL_SIGNALING");
  assert.equal(typeFromSlug("READINESS_CHECK"), null, "only the slug form");
  assert.equal(typeFromSlug("not-a-type"), null);
});

test("grouping: Activity and Statements as on the map, most entries first, empty types collapsed", () => {
  const g = groupTypeSummaries([
    { event_type: "EXERCISE", month: "2021-02", n: 2 },
    { event_type: "EXERCISE", month: "2020-11", n: 1 },
    { event_type: "READINESS_CHECK", month: "2021-01", n: 4 },
    { event_type: "POLITICAL_SIGNALING", month: "2021-02", n: 1 },
  ]);
  assert.deepEqual(g.activity.map((s) => [s.type, s.count, s.firstMonth, s.lastMonth]), [
    ["READINESS_CHECK", 4, "2021-01", "2021-01"],
    ["EXERCISE", 3, "2020-11", "2021-02"],
  ]);
  assert.deepEqual(g.statements.map((s) => s.type), ["POLITICAL_SIGNALING"]);
  assert.equal(g.emptyTypes.length, 24 - 3);
  assert.ok(!g.emptyTypes.includes("Exercise"));
  assert.equal(monthSpan("2020-11", "2021-02"), "Nov 2020 – Feb 2021");
  assert.equal(monthSpan("2021-01", "2021-01"), "Jan 2021");
});

test("month strip and month filter: 19 months, default to the latest with entries, bad months rejected", () => {
  const strip = monthStrip([{ month: "2020-11", n: 1 }, { month: "2021-02", n: 2 }]);
  assert.equal(strip.length, 19);
  assert.equal(strip[0].month, "2020-08");
  assert.equal(strip.at(-1)!.month, "2022-02");
  assert.equal(strip.find((m) => m.month === "2021-02")!.count, 2);
  assert.equal(strip.find((m) => m.month === "2021-03")!.count, 0);

  assert.deepEqual(selectMonth(strip, undefined), { month: "2021-02", invalid: false });
  assert.deepEqual(selectMonth(strip, "2020-11"), { month: "2020-11", invalid: false });
  assert.deepEqual(selectMonth(strip, "2021-05"), { month: "2021-05", invalid: false }, "valid but empty month");
  assert.deepEqual(selectMonth(strip, "2023-01"), { month: null, invalid: true });
  assert.deepEqual(selectMonth(strip, "Jan 2021"), { month: null, invalid: true });
  assert.deepEqual(selectMonth(strip, ["2021-01", "2021-02"]), { month: null, invalid: true });
  assert.deepEqual(selectMonth(monthStrip([]), undefined), { month: null, invalid: false }, "no entries at all");
});

test("empty-state wording", () => {
  assert.equal(emptyGroupText("activity"), "No activity events recorded yet");
  assert.equal(emptyGroupText("statements"), "No statements recorded yet");
  assert.equal(emptyStateText("Readiness check", "2021-05"), "No published readiness check entries for May 2021.");
  assert.equal(emptyStateText("Exercise", null), "No published exercise entries in the historical record yet.");
});

test("approval needs an explicit confidence choice", async () => {
  const { parseConfidenceChoice } = await import("./historical-rules");
  assert.equal(parseConfidenceChoice("HIGH"), "HIGH");
  assert.equal(parseConfidenceChoice(""), null, "the empty placeholder is refused");
  assert.equal(parseConfidenceChoice(null), null);
  assert.equal(parseConfidenceChoice("VERY_HIGH"), null);
});
