/**
 * Activity Index formula (docs/scoring.md): windows, stable panel, statements excluded, band
 * rule, minimum data, wording and display rules. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ACTIVITY_INDEX_DISCLAIMER,
  bandFor,
  collectingText,
  computeIndex,
  dimensionOf,
  indexWindows,
  insufficientText,
  scopeText,
  THEATER,
  type IndexEvent,
} from "./activity-index";
import { findBannedPhrase, findComparisonWording } from "./banned-phrases";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FIRST_RESULT_DAY = "2026-12-28"; // 12 complete weeks after Monday 5 Oct 2026

test("the disclaimer is spec §23 verbatim and defined once", () => {
  assert.ok(read("docs/spec.md").includes(ACTIVITY_INDEX_DISCLAIMER));
  assert.ok(read("docs/scoring.md").includes(ACTIVITY_INDEX_DISCLAIMER));
  for (const page of ["src/app/(public)/page.tsx", "src/app/(public)/methodology/page.tsx"]) {
    assert.ok(!read(page).includes("does not estimate the probability"), `${page} keeps its own copy`);
  }
});

test("collecting: before 12 complete weeks the result is a week count, never a number", () => {
  const empty = { today: "", panelSourcesAdded: [] as string[] };
  const before = computeIndex([], { ...empty, today: "2026-10-04" });
  assert.deepEqual(before, { status: "collecting", week: 0, startsOn: "2026-10-05" });
  assert.equal(collectingText(before as never), "Collecting baseline: begins 5 Oct 2026");
  const first = computeIndex([], { ...empty, today: "2026-10-05" });
  assert.equal(collectingText(first as never), "Collecting baseline: week 1 of 12");
  const last = computeIndex([], { ...empty, today: "2026-12-27" });
  assert.equal(collectingText(last as never), "Collecting baseline: week 12 of 12");
  assert.notEqual(computeIndex([], { ...empty, today: FIRST_RESULT_DAY }).status, "collecting");
});

test("windows: 8 baseline weeks then the last 4 complete weeks", () => {
  assert.deepEqual(indexWindows(FIRST_RESULT_DAY), {
    baselineStart: "2026-10-05",
    baselineEnd: "2026-11-29",
    windowStart: "2026-11-30",
    windowEnd: "2026-12-27",
  });
  assert.deepEqual(indexWindows("2027-01-06").windowEnd, "2027-01-03", "a week in progress is not counted");
});

test("band rule: 2x and at least 4 events away from the baseline average", () => {
  // Baseline 12 events over 8 weeks: about 6 per 4 weeks.
  assert.deepEqual(bandFor(12, 12), { band: "MORE", expected: 6 });
  assert.equal(bandFor(11, 12).band, "WITHIN");
  assert.equal(bandFor(3, 12).band, "WITHIN", "half, but only 3 fewer");
  assert.equal(bandFor(2, 12).band, "FEWER");
  // Small numbers: double is not enough without the 4-event difference.
  assert.equal(bandFor(4, 2).band, "WITHIN");
  assert.equal(bandFor(5, 2).band, "MORE");
  assert.equal(bandFor(0, 0).band, "WITHIN");
});

const ev = (date: string, over: Partial<IndexEvent> = {}): IndexEvent => ({
  event_date: date,
  event_type: "EXERCISE",
  area: "BY",
  support_source_added: ["2026-10-01"],
  ...over,
});
const repeat = (n: number, make: (i: number) => IndexEvent) => Array.from({ length: n }, (_, i) => make(i));
const baselineDay = (i: number) => `2026-10-${String(5 + (i % 20)).padStart(2, "0")}`;
const windowDay = (i: number) => `2026-12-${String(1 + (i % 26)).padStart(2, "0")}`;
const PANEL = { today: FIRST_RESULT_DAY, panelSourcesAdded: ["2026-10-01", "2026-10-02", "2026-12-01"] };

test("statements, outside-the-theater items and non-panel sources are not counted", () => {
  const events = [
    ...repeat(12, (i) => ev(baselineDay(i))),
    ...repeat(30, (i) => ev(windowDay(i), { event_type: "POLITICAL_SIGNALING" })),
    ...repeat(30, (i) => ev(windowDay(i), { event_type: "OFFICIAL_WARNING" })),
    ...repeat(30, (i) => ev(windowDay(i), { area: null })),
    ...repeat(30, (i) => ev(windowDay(i), { support_source_added: ["2026-11-01"] })),
  ];
  const r = computeIndex(events, PANEL);
  assert.equal(r.status, "computed");
  if (r.status !== "computed") return;
  assert.equal(r.theater.windowEvents, 0);
  assert.equal(r.theater.band, "FEWER");
  assert.equal(r.panelSources, 2, "only sources registered before the baseline began");
  assert.equal(dimensionOf("POLITICAL_SIGNALING"), null);
  assert.equal(dimensionOf("OFFICIAL_WARNING"), null);
  assert.equal(dimensionOf("DRONE_ACTIVITY"), "AIR_ACTIVITY");
});

test("theater first; areas only when their own baseline meets the minimum", () => {
  const events = [
    ...repeat(12, (i) => ev(baselineDay(i), { area: "BY" })),
    ...repeat(5, (i) => ev(baselineDay(i), { area: "LT" })),
    ...repeat(3, (i) => ev(baselineDay(i), { area: THEATER })),
    ...repeat(14, (i) => ev(windowDay(i), { area: "BY", event_type: "AIR_ACTIVITY" })),
  ];
  const r = computeIndex(events, PANEL);
  assert.equal(r.status, "computed");
  if (r.status !== "computed") return;
  assert.equal(r.theater.baselineEvents, 20, "theater includes every map area and theater-wide items");
  assert.deepEqual(r.areas.map((a) => a.scope), ["BY"], "Lithuania (5) and theater-wide are not shown as areas");
  assert.equal(r.areas[0].band, "MORE");
  assert.deepEqual(r.areas[0].dimensions, { AIR_ACTIVITY: 14 });

  const thin = computeIndex(repeat(11, (i) => ev(baselineDay(i))), PANEL);
  assert.equal(thin.status, "insufficient");
  if (thin.status === "insufficient") {
    assert.equal(insufficientText(thin), "Not yet calculated: the baseline has 11 of the 12 activity events needed.");
  }
});

test("display wording: no comparison or predictive language, no arrows, no red", () => {
  const r = computeIndex([...repeat(12, (i) => ev(baselineDay(i))), ...repeat(14, (i) => ev(windowDay(i)))], PANEL);
  assert.equal(r.status, "computed");
  if (r.status !== "computed") return;
  const text = [scopeText(r.theater), "Collecting baseline: week 3 of 12", ACTIVITY_INDEX_DISCLAIMER].join(" ");
  assert.equal(
    scopeText(r.theater),
    "Reported activity in the last 4 weeks: more than usual (14 events; the previous 8 weeks averaged about 6 per 4 weeks).",
  );
  assert.equal(findBannedPhrase(text), null);
  assert.equal(findComparisonWording(text.replace(ACTIVITY_INDEX_DISCLAIMER, "")), null);
  const panel = read("src/components/activity-index-panel.tsx");
  assert.ok(!/[↑↓↗↘▲▼]/.test(panel), "no arrows");
  assert.ok(!/\b(red|destructive|orange|amber|heat|tone-)/i.test(panel.replace(/^\s*\*.*$/gm, "")), "no red or heat colours");
  assert.match(panel, /\{ACTIVITY_INDEX_DISCLAIMER\}/);
});

test("the index never reads historical data", () => {
  for (const p of ["src/lib/activity-index.ts", "src/lib/activity-index-data.ts", "workers/index/snapshot.mts"]) {
    const source = read(p);
    assert.ok(!/historical_(events|event_sources|review_actions)|event_historical_reference/.test(source), p);
    assert.ok(!/from "@\/lib\/(public-)?historical/.test(source), `${p} imports a historical module`);
  }
});
