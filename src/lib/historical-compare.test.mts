/**
 * Side-by-side view and digest Historical Context: windows, threshold, line builder, and the
 * wording rule (no phase, resemblance, outcome, score, percentage or trend wording on the compare
 * page or in the digest section, except the one fixed caveat). No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COMPARISON_CAVEAT, findBannedPhrase, findComparisonWording } from "./banned-phrases";
import type { EventType } from "./event-labels";
import {
  addMonths,
  compareRows,
  currentCoverageNote,
  hasEnoughHistorical,
  HISTORICAL_RECORD_NOTE,
  historicalContextLines,
  isHistoricalContextLine,
  otherTypesText,
  PAGE_NOTES,
  parseCompareWindows,
  tooFewText,
  toCoverage,
  windowLengthNote,
} from "./historical-compare";
import { coverageNote, COUNTS_NOTE, HISTORICAL_LABEL, type TypeMonthCount } from "./historical-rules";

const NOW = new Date("2026-10-04T12:00:00Z");

test("default windows: Jan – Feb 2021 against last month and this month", () => {
  assert.deepEqual(parseCompareWindows({}, NOW), {
    historical: { from: "2021-01", to: "2021-02" },
    current: { from: "2026-09", to: "2026-10" },
  });
});

test("windows: invalid ends fall back, ends are ordered, span is capped at 6 months", () => {
  const w = parseCompareWindows({ hfrom: "2021-05", hto: "2020-09", cfrom: "2027-01", cto: "nope" }, NOW);
  assert.deepEqual(w.historical, { from: "2020-09", to: "2021-02" });
  assert.deepEqual(w.current, { from: "2026-09", to: "2026-10" });
  assert.deepEqual(parseCompareWindows({ hfrom: "2020-08", hto: "2022-02" }, NOW).historical, {
    from: "2020-08",
    to: "2021-01",
  });
  assert.deepEqual(parseCompareWindows({ hfrom: "2019-01", hto: "2022-03" }, NOW).historical, {
    from: "2021-01",
    to: "2021-02",
  });
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("threshold: 4 events and 2 sources", () => {
  assert.equal(hasEnoughHistorical({ events: 9, sources: 5 }), true, "Jan – Feb 2021 at time of writing");
  assert.equal(hasEnoughHistorical({ events: 4, sources: 2 }), true, "Jan 2021 alone (4 events) now passes");
  assert.equal(hasEnoughHistorical({ events: 3, sources: 5 }), false);
  assert.equal(hasEnoughHistorical({ events: 20, sources: 1 }), false);
  assert.equal(
    tooFewText({ events: 3, sources: 1 }, { from: "2021-01", to: "2021-01" }),
    "Too few historical entries in Jan 2021 to set side by side: 3 events from 1 source. At least 4 events from 2 sources are needed. Choose a wider historical window.",
  );
});

test("rows: taxonomy order, Activity and Statements, empty types counted", () => {
  type E = { event_type: EventType; id: string };
  const h: E[] = [{ event_type: "POLITICAL_SIGNALING", id: "h1" }, { event_type: "AIR_ACTIVITY", id: "h2" }];
  const c: E[] = [{ event_type: "AIR_ACTIVITY", id: "c1" }, { event_type: "EXERCISE", id: "c2" }];
  const rows = compareRows(h, c);
  assert.deepEqual(rows.activity.map((r) => r.type), ["EXERCISE", "AIR_ACTIVITY"]);
  assert.deepEqual(rows.statements.map((r) => r.type), ["POLITICAL_SIGNALING"]);
  assert.deepEqual(rows.activity[1].historical.map((e) => e.id), ["h2"]);
  assert.equal(rows.emptyTypeCount, 21);
  assert.equal(otherTypesText(21), "21 other event types have no entries on either side.");
  assert.equal(otherTypesText(1), "1 other event type has no entries on either side.");
});

test("current coverage note names the month in progress", () => {
  const c = toCoverage({ events: 17, sources: 7, months: [{ month: "2026-10", n: 13 }, { month: "2026-09", n: 4 }] }, {
    from: "2026-09",
    to: "2026-10",
  });
  assert.equal(
    currentCoverageNote(c, NOW),
    "17 published events from 7 sources: Sep 2026 (4), Oct 2026 (13). Oct 2026 is in progress (through 4 Oct).",
  );
  assert.equal(windowLengthNote({ historical: { from: "2021-01", to: "2021-02" }, current: { from: "2026-09", to: "2026-10" } }), null);
  assert.match(
    windowLengthNote({ historical: { from: "2021-01", to: "2021-01" }, current: { from: "2026-09", to: "2026-10" } })!,
    /1 month of historical record, 2 months of current reporting/,
  );
});

const COUNTS: TypeMonthCount[] = [
  { event_type: "AIR_ACTIVITY", month: "2021-01", n: 2 },
  { event_type: "AIR_ACTIVITY", month: "2020-11", n: 1 },
  ...["2020-08", "2020-09", "2020-10", "2020-11", "2021-01"].map((month) => ({ event_type: "EXERCISE" as const, month, n: 3 })),
];
const ENOUGH = { events: 139, sources: 40 };

test("digest lines: counts and months by type, zero wording, record note and caveat", () => {
  const lines = historicalContextLines(["MOBILIZATION", "AIR_ACTIVITY", "EXERCISE", "AIR_ACTIVITY"], COUNTS, ENOUGH);
  assert.deepEqual(lines, [
    "Exercise: 15 historical events of this type were recorded across 5 months between Aug 2020 and Jan 2021.",
    "Mobilization: No entries of this type in the historical record so far. The record is partial.",
    "Air Activity: 3 historical events of this type were recorded in Nov 2020, Jan 2021.",
    HISTORICAL_RECORD_NOTE,
    COMPARISON_CAVEAT,
  ]);
  assert.deepEqual(historicalContextLines(["AIR_ACTIVITY"], [{ event_type: "AIR_ACTIVITY", month: "2021-01", n: 1 }], ENOUGH)![0],
    "Air Activity: 1 historical event of this type was recorded in Jan 2021.");
});

test("digest lines: below the threshold there are none (the fixed line stays)", () => {
  assert.equal(historicalContextLines(["EXERCISE"], COUNTS, { events: 3, sources: 5 }), null);
  assert.equal(historicalContextLines(["EXERCISE"], COUNTS, { events: 50, sources: 1 }), null);
  assert.notEqual(historicalContextLines(["EXERCISE"], COUNTS, { events: 4, sources: 2 }), null);
  assert.equal(historicalContextLines([], COUNTS, ENOUGH), null);
});

test("every generated line matches the grammar and passes both wording checks", () => {
  const lines = historicalContextLines(["EXERCISE", "MOBILIZATION", "AIR_ACTIVITY", "COMMAND_CONTROL"], COUNTS, ENOUGH)!;
  for (const line of lines) {
    assert.ok(isHistoricalContextLine(line), line);
    assert.equal(findBannedPhrase(line), null, line);
    assert.equal(findComparisonWording(line), null, line);
  }
  for (const line of [
    "Exercise: 15 historical events of this type were recorded in Jan 2021. Similar to now.",
    "Exercise activity resembles January 2021.",
    "Unknown Type: 2 historical events of this type were recorded in Jan 2021.",
    "Exercise: 2 historical events of this type were recorded in Jan 2021, Feb 2021, Mar 2021, Apr 2021, May 2021.",
  ]) {
    assert.equal(isHistoricalContextLine(line), false, line);
  }
});

test("comparison wording is caught; only the exact caveat is exempt", () => {
  for (const text of [
    "This is Phase 2.",
    "Tagged P3.",
    "The pattern resembles 2021.",
    "Similar activity was also seen in 2021.",
    "A comparable period.",
    "We are here.",
    "73% overlap.",
    "Score: 4.",
    "Trend ↑",
    "The historical analogue is January 2021.",
    "This predicts an escalation.",
  ]) {
    assert.notEqual(findComparisonWording(text), null, text);
  }
  assert.equal(findComparisonWording(COMPARISON_CAVEAT), null);
  assert.notEqual(findComparisonWording(COMPARISON_CAVEAT.replace("resemble", "closely resemble")), null);
});

test("no phase or outcome wording on the compare page: notes and page source", () => {
  const notes = [
    ...PAGE_NOTES,
    COUNTS_NOTE,
    HISTORICAL_LABEL,
    tooFewText({ events: 3, sources: 1 }, { from: "2021-01", to: "2021-01" }),
    otherTypesText(3),
    coverageNote({ events: 9, sources: 5, months: [{ month: "2021-01", events: 4 }, { month: "2021-02", events: 5 }] }),
    currentCoverageNote({ events: 17, sources: 7, months: [{ month: "2026-09", events: 4 }, { month: "2026-10", events: 13 }] }, NOW),
    windowLengthNote({ historical: { from: "2021-01", to: "2021-01" }, current: { from: "2026-09", to: "2026-10" } })!,
  ];
  for (const note of notes) assert.equal(findComparisonWording(note), null, note);

  const path = "src/app/(public)/historical/compare/page.tsx";
  const source = readFileSync(join(process.cwd(), path), "utf8");
  assert.equal(findComparisonWording(source), null, `${path}: "${findComparisonWording(source)}"`);
  assert.equal(findBannedPhrase(source), null, path);
  assert.ok(!/phase_tag|PHASE_TAG/.test(source), `${path} reads the admin-only phase tag`);
});
