/**
 * Side-by-side view and digest Historical Context: windows, threshold, line builder, and the
 * wording rule (no phase, resemblance, outcome, score, percentage or trend wording on the compare
 * page or in the digest section, except the one fixed caveat). No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  COMPARISON_EXEMPT,
  REFERENCES_HEADING,
  findBannedPhrase,
  findComparisonWording,
  SIMILARITY_CAVEAT,
} from "./banned-phrases";
import type { EventType } from "./event-labels";
import {
  addMonths,
  compareRows,
  coversText,
  CURRENT_FLOOR,
  CURRENT_FLOOR_NOTE,
  currentMonthOptions,
  currentCoverageNote,
  historicalShiftLinks,
  HOW_TO_READ,
  LENGTH_OPTIONS,
  lengthLabel,
  shiftHistoricalWindow,
  showingText,
  hasEnoughHistorical,
  HISTORICAL_RECORD_NOTE,
  historicalContextLines,
  isHistoricalContextLine,
  otherTypesText,
  PAGE_NOTES,
  parseCompareWindows,
  SCALE_NOTE,
  tooFewText,
  toCoverage,
  windowLengthNote,
} from "./historical-compare";
import { coverageNote, HISTORICAL_LABEL, type TypeMonthCount } from "./historical-rules";

const NOW = new Date("2026-10-04T12:00:00Z");

test("default windows: Jan – Feb 2021 against last month and this month", () => {
  assert.deepEqual(parseCompareWindows({}, NOW), {
    historical: { from: "2021-01", to: "2021-02" },
    current: { from: "2026-09", to: "2026-10" },
    notes: { historical: null, current: null },
  });
});

test("From plus Length gives the range", () => {
  const w = parseCompareWindows({ hfrom: "2020-08", hlen: "2", cfrom: "2026-08", clen: "2" }, NOW);
  assert.deepEqual(w.historical, { from: "2020-08", to: "2020-09" });
  assert.deepEqual(w.current, { from: "2026-08", to: "2026-09" });
  assert.deepEqual(w.notes, { historical: null, current: null });
  assert.equal(showingText(w.historical), "Showing Aug 2020 – Sep 2020");
  assert.deepEqual(parseCompareWindows({ hfrom: "2021-03", hlen: "1" }, NOW).historical, { from: "2021-03", to: "2021-03" });
  assert.deepEqual(LENGTH_OPTIONS.map(lengthLabel), ["1 month", "2 months", "3 months", "4 months", "5 months", "6 months"]);
});

test("a Length that would pass the end of the record or the current month is cut, with a note", () => {
  const h = parseCompareWindows({ hfrom: "2021-12", hlen: "6" }, NOW);
  assert.deepEqual(h.historical, { from: "2021-12", to: "2022-02" });
  assert.equal(h.notes.historical, "Window ends at the end of the record; showing Dec 2021 – Feb 2022.");
  const c = parseCompareWindows({ cfrom: "2026-09", clen: "4" }, NOW);
  assert.deepEqual(c.current, { from: "2026-09", to: "2026-10" });
  assert.equal(c.notes.current, "Window ends at the current month; showing Sep 2026 – Oct 2026.");
});

test("hand-edited URLs: hto/cto still work and are clamped to 6 months, with a note", () => {
  const w = parseCompareWindows({ hfrom: "2020-08", hto: "2022-02", cfrom: "2026-09", cto: "2026-10" }, NOW);
  assert.deepEqual(w.historical, { from: "2020-08", to: "2021-01" });
  assert.equal(w.notes.historical, "Windows are limited to 6 months; showing Aug 2020 – Jan 2021.");
  assert.deepEqual(w.current, { from: "2026-09", to: "2026-10" });
  assert.equal(w.notes.current, null);
  const long = parseCompareWindows({ hfrom: "2020-08", hlen: "12" }, NOW);
  assert.deepEqual(long.historical, { from: "2020-08", to: "2021-01" });
  assert.equal(long.notes.historical, "Windows are limited to 6 months; showing Aug 2020 – Jan 2021.");
  assert.deepEqual(parseCompareWindows({ hfrom: "2021-01", hlen: "0", hto: "2021-03" }, NOW).historical, {
    from: "2021-01",
    to: "2021-03",
  }, "an invalid length falls back to hto");
});

test("the page offers From and Length, not a To selector", () => {
  const source = readFileSync(join(process.cwd(), "src/app/(public)/historical/compare/page.tsx"), "utf8");
  assert.ok(!/name="(hto|cto)"/.test(source), "no To selector");
  assert.ok(!/label="To"/.test(source), "no To label");
  for (const name of ["hfrom", "hlen", "cfrom", "clen"]) assert.ok(source.includes(`name="${name}"`), name);
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
    SIMILARITY_CAVEAT,
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

test("Earlier / Later shift the historical window by its own length", () => {
  assert.deepEqual(shiftHistoricalWindow({ from: "2021-01", to: "2021-02" }, "earlier"), { from: "2020-11", to: "2020-12" });
  assert.deepEqual(shiftHistoricalWindow({ from: "2021-01", to: "2021-02" }, "later"), { from: "2021-03", to: "2021-04" });
  assert.deepEqual(shiftHistoricalWindow({ from: "2021-01", to: "2021-01" }, "earlier"), { from: "2020-12", to: "2020-12" });
  assert.deepEqual(shiftHistoricalWindow({ from: "2021-06", to: "2021-11" }, "later"), { from: "2021-09", to: "2022-02" }, "6 months, clamped");
});

test("a shift that would pass an end of the record stops at the end, keeping the length", () => {
  assert.deepEqual(shiftHistoricalWindow({ from: "2020-09", to: "2020-10" }, "earlier"), { from: "2020-08", to: "2020-09" });
  assert.deepEqual(shiftHistoricalWindow({ from: "2021-11", to: "2022-01" }, "later"), { from: "2021-12", to: "2022-02" });
  assert.deepEqual(shiftHistoricalWindow({ from: "2020-08", to: "2020-09" }, "earlier"), null);
  assert.deepEqual(shiftHistoricalWindow({ from: "2022-01", to: "2022-02" }, "later"), null);
  assert.deepEqual(shiftHistoricalWindow({ from: "2022-02", to: "2022-02" }, "earlier"), { from: "2022-01", to: "2022-01" });
});

test("shift links keep the current window; at an end the control is disabled with a label", () => {
  const w = { historical: { from: "2021-01", to: "2021-02" }, current: { from: "2026-09", to: "2026-10" } };
  const [earlier, later] = historicalShiftLinks(w);
  assert.equal(earlier.disabled, false);
  assert.equal(!earlier.disabled && earlier.href, "/historical/compare?hfrom=2020-11&hlen=2&cfrom=2026-09&clen=2");
  assert.equal(earlier.label, "Earlier: show the historical window Nov 2020 – Dec 2020");
  assert.equal(!later.disabled && later.href, "/historical/compare?hfrom=2021-03&hlen=2&cfrom=2026-09&clen=2");

  const atStart = historicalShiftLinks({ ...w, historical: { from: "2020-08", to: "2020-08" } });
  assert.deepEqual(atStart[0], {
    direction: "earlier",
    disabled: true,
    label: "Earlier: unavailable, the historical window already reaches the start of the record (Aug 2020)",
  });
  assert.equal(atStart[1].disabled, false);
  const atEnd = historicalShiftLinks({ ...w, historical: { from: "2021-09", to: "2022-02" } });
  assert.equal(atEnd[1].disabled, true);
  assert.match(atEnd[1].label, /end of the record \(Feb 2022\)/);
  assert.equal(parseCompareWindows({ hfrom: "2020-11", hto: "2020-12", cfrom: "2026-09", cto: "2026-10" }, NOW).historical.from, "2020-11");
  // The links round-trip through the parser to the shifted window and the same current window.
  for (const link of [earlier, later]) {
    if (link.disabled) continue;
    const params = Object.fromEntries(new URL(link.href, "http://x").searchParams);
    assert.ok(!("hto" in params) && !("cto" in params), "From + Length only");
    const parsed = parseCompareWindows(params, NOW);
    assert.deepEqual(parsed.current, w.current);
    assert.deepEqual(parsed.notes, { historical: null, current: null });
  }
  assert.deepEqual(parseCompareWindows(Object.fromEntries(new URL(earlier.disabled ? "" : earlier.href, "http://x").searchParams), NOW).historical, {
    from: "2020-11",
    to: "2020-12",
  });
});

test("covers N months, and no window spans the whole record", () => {
  assert.equal(coversText({ from: "2021-01", to: "2021-01" }), "Covers 1 month.");
  assert.equal(coversText({ from: "2026-09", to: "2026-10" }), "Covers 2 months.");
  const widest = parseCompareWindows({ hfrom: "2020-08", hto: "2022-02" }, NOW).historical;
  assert.equal(coversText(widest), "Covers 6 months.");
});

const REMOVED = [
  "Rows are grouped by event type only. No event is paired with another.",
  "Sharing an event type does not mean the two periods resemble each other",
  "Events in the same row share an event type. Any similarity is in the nature of the activity only, and does not mean the same outcome will follow.",
  "Counts on the two sides are not on the same scale, because the events were collected in different ways",
];

test("current-window floor: From menu starts at Aug 2026, earlier starts move to it with a note", () => {
  assert.equal(CURRENT_FLOOR, "2026-08");
  assert.deepEqual(currentMonthOptions(NOW), ["2026-08", "2026-09", "2026-10"]);
  assert.equal(CURRENT_FLOOR_NOTE, "Current events on this page begin in Aug 2026.");

  const viaLength = parseCompareWindows({ cfrom: "2026-03", clen: "2" }, NOW);
  assert.deepEqual(viaLength.current, { from: "2026-08", to: "2026-09" });
  assert.equal(viaLength.notes.current, "Current events on this page begin in Aug 2026; showing Aug 2026 – Sep 2026.");

  const viaTo = parseCompareWindows({ cfrom: "2025-01", cto: "2025-04" }, NOW);
  assert.deepEqual(viaTo.current, { from: "2026-08", to: "2026-10" }, "length kept, cut at the current month");
  assert.equal(viaTo.notes.current, "Current events on this page begin in Aug 2026; showing Aug 2026 – Oct 2026.");

  assert.deepEqual(parseCompareWindows({}, NOW).current, { from: "2026-09", to: "2026-10" }, "default: last two months");
  const aug = new Date("2026-08-15T00:00:00Z");
  assert.deepEqual(parseCompareWindows({}, aug).current, { from: "2026-08", to: "2026-08" }, "default never starts before the floor");
  assert.equal(parseCompareWindows({}, aug).notes.current, null);
  assert.deepEqual(parseCompareWindows({ hfrom: "2021-01", hlen: "2" }, NOW).notes.historical, null, "historical side unaffected");
});

test("the notes block holds only the trimmed lines; removed sentences appear nowhere", () => {
  assert.equal(
    SCALE_NOTE,
    "The two sides use different collection methods and sets of sources, so their counts are not on the same scale. Counts reflect reporting, not intensity of activity.",
  );
  assert.equal(HOW_TO_READ.length, 3);
  assert.equal(HOW_TO_READ[0], "Choose a start month and a length of 1 to 6 months for each window.");
  assert.deepEqual(COMPARISON_EXEMPT, [SIMILARITY_CAVEAT, REFERENCES_HEADING]);
  const source = ["src/app/(public)/historical/compare/page.tsx", "src/lib/historical-compare.ts", "src/lib/banned-phrases.ts"]
    .map((p) => readFileSync(join(process.cwd(), p), "utf8"))
    .join("\n");
  for (const removed of REMOVED) {
    assert.ok(!source.includes(removed), `still present: ${removed}`);
    assert.ok(!PAGE_NOTES.some((n) => n.includes(removed)), `still a page note: ${removed}`);
  }
  assert.ok(source.includes("{SIMILARITY_CAVEAT}"), "the page shows the fixed caveat");
  assert.ok(!/GROUPING_NOTE|COMPARISON_CAVEAT|SAME_ROW_NOTE|COUNTS_NOTE/.test(source));
});

test("comparison wording: only the fixed caveat is exempt; the removed explainer is now rejected", () => {
  assert.equal(findComparisonWording(SIMILARITY_CAVEAT), null);
  assert.notEqual(findComparisonWording(REMOVED[2]), null, "former exempt string (e)");
  assert.notEqual(findComparisonWording(`${REMOVED[1]}, and this record does not predict what happens next.`), null);
  assert.equal(findComparisonWording(HOW_TO_READ.join(" ")), null);
  for (const text of [
    "Similarity in nature means the same outcome will follow.",
    "This is similar to January 2021.",
    "An early stage of the buildup.",
    "A possible precursor.",
    "The months leading up to the invasion.",
    "Similarity in nature does not mean the same outcome will follow. We are here.",
  ]) {
    assert.notEqual(findComparisonWording(text), null, text);
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
  assert.equal(findComparisonWording(SIMILARITY_CAVEAT), null);
  assert.notEqual(findComparisonWording(SIMILARITY_CAVEAT.replace("does not mean", "may mean")), null);
});

test("no phase or outcome wording on the compare page: notes and page source", () => {
  const notes = [
    ...PAGE_NOTES,
    HISTORICAL_LABEL,
    tooFewText({ events: 3, sources: 1 }, { from: "2021-01", to: "2021-01" }),
    otherTypesText(3),
    coverageNote({ events: 9, sources: 5, months: [{ month: "2021-01", events: 4 }, { month: "2021-02", events: 5 }] }),
    currentCoverageNote({ events: 17, sources: 7, months: [{ month: "2026-09", events: 4 }, { month: "2026-10", events: 13 }] }, NOW),
    windowLengthNote({ historical: { from: "2021-01", to: "2021-01" }, current: { from: "2026-09", to: "2026-10" } })!,
  ];
  for (const note of notes) assert.equal(findComparisonWording(note), null, note);

  const path = "src/app/(public)/historical/compare/page.tsx";
  // The constant's name is code, not page text; its value is checked as an exempt string above.
  const source = readFileSync(join(process.cwd(), path), "utf8").replaceAll("SIMILARITY_CAVEAT", "");
  assert.equal(findComparisonWording(source), null, `${path}: "${findComparisonWording(source)}"`);
  assert.equal(findBannedPhrase(source), null, path);
  assert.ok(!/phase_tag|PHASE_TAG/.test(source), `${path} reads the admin-only phase tag`);
});
