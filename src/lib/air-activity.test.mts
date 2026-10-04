/**
 * Air Activity page: selection, aircraft-term rule, grouping, counts, minimum-data rule, wording
 * and safety. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  AIR_TYPES,
  airCategory,
  countsByArea,
  countsByType,
  groupByMonthAndArea,
  MIN_WEEKLY_EVENTS,
  minimumDataText,
  SAFETY_NOTE,
  COUNTS_NOTE,
  weeklyCounts,
  type AirItem,
} from "./air-activity";
import { DIMENSIONS } from "./activity-index";
import { findBannedPhrase, findComparisonWording } from "./banned-phrases";
import type { EventType } from "./event-labels";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("air types are the Activity Index air dimension", () => {
  assert.deepEqual([...AIR_TYPES], [...DIMENSIONS.AIR_ACTIVITY.types]);
  for (const t of AIR_TYPES) assert.equal(airCategory({ event_type: t, headline: "x", summary: null }), "air");
  assert.equal(airCategory({ event_type: "EXERCISE", headline: "Fighter jets over Lida", summary: null }), null, "other types never");
});

test("deployments count only when they name aircraft (today's two NATO events)", () => {
  const dep = (headline: string, summary: string | null = null, event_type: EventType = "NATO_REINFORCEMENT") =>
    airCategory({ event_type, headline, summary });
  assert.equal(dep("Germany deploys four Eurofighters and 40 personnel to Latvia for parliamentary elections"), "aircraft-deployment");
  assert.equal(dep("US Marines redirected to Baltic Sea region for NATO's Baltic Sentry"), null);
  for (const h of ["F-35A jets arrive in Poland", "Two Su-34 relocated to Kaliningrad", "RAF Typhoons begin air policing rotation",
    "Swedish Gripens deploy to Lithuania", "Apache helicopters arrive", "B-52 bombers land in Romania"]) {
    assert.equal(dep(h, null, h.startsWith("Two Su") ? "RUSSIAN_DEPLOYMENT" : "NATO_REINFORCEMENT"), "aircraft-deployment", h);
  }
  for (const h of ["Air defence battalion arrives in Lithuania", "Engineer company deploys to Suwałki", "Patriot battery deployed",
    "Fighter battalion moves to Grodno"]) {
    assert.equal(dep(h), null, h);
  }
});

const item = (date: string, area: string, type: EventType = "AIR_ACTIVITY"): AirItem<{ id: string }> => ({
  date, type, area, category: "air", event: { id: `${date}-${area}-${type}` },
});

test("grouped by month (newest first), then area in map order, newest first inside", () => {
  const groups = groupByMonthAndArea([
    item("2026-09-15", "LT"), item("2026-10-03", "LV"), item("2026-10-01", "PL"), item("2026-10-02", "PL"),
    item("2026-10-02", "THEATER-WIDE"), item("2026-10-01", "UNPLACED"),
  ]);
  assert.deepEqual(groups.map((g) => g.label), ["October 2026", "September 2026"]);
  assert.deepEqual(groups[0].areas.map((a) => a.label), ["Poland", "Latvia", "Theater-wide", "Location unclear"]);
  assert.deepEqual(groups[0].areas[0].items.map((i) => i.date), ["2026-10-02", "2026-10-01"]);
});

test("counts by type (30 days and all) and by area", () => {
  const items = [item("2026-10-01", "PL"), item("2026-08-01", "PL"), item("2026-10-02", "LT", "AIR_DEFENSE"),
    { ...item("2026-10-03", "LV", "NATO_REINFORCEMENT"), category: "aircraft-deployment" as const }];
  const byType = countsByType(items, "2026-10-04");
  assert.deepEqual(byType.find((r) => r.type === "AIR_ACTIVITY"), { type: "AIR_ACTIVITY", label: "Air Activity", last30: 1, all: 2 });
  assert.equal(byType.find((r) => r.type === "NATO_REINFORCEMENT")!.label, "NATO Reinforcement (aircraft)");
  assert.deepEqual(countsByArea(items).map((a) => [a.label, a.count]), [["Poland", 2], ["Lithuania", 1], ["Latvia", 1]]);
});

test("minimum data: weekly counts only with 20 events over 8 complete weeks", () => {
  const few = Array.from({ length: 7 }, (_, i) => item(`2026-09-${String(10 + i).padStart(2, "0")}`, "PL"));
  assert.equal(weeklyCounts(few, "2026-10-04"), null);
  assert.equal(minimumDataText(7, "2026-09-15"),
    "Too few published air events for weekly counts yet (7 since 15 September 2026). Weekly counts appear once there are at least 20 events over 8 complete weeks.");
  const many = Array.from({ length: MIN_WEEKLY_EVENTS }, (_, i) => item(`2026-${i < 10 ? "08" : "09"}-${String(1 + (i % 10) * 2).padStart(2, "0")}`, "PL"));
  // Events start in the week of 27 Jul; by 14 Sep only 7 complete weeks have passed.
  assert.equal(weeklyCounts(many, "2026-09-14"), null, "enough events but under 8 complete weeks");
  const weeks = weeklyCounts(many, "2026-10-26");
  assert.ok(weeks && weeks.length >= 8);
  assert.equal(weeks!.reduce((n, w) => n + w.count, 0), MIN_WEEKLY_EVENTS);
});

test("wording and display: no comparison or predictive wording, no arrows, no red, no coordinates", () => {
  const page = read("src/app/(public)/air-activity/page.tsx");
  for (const text of [COUNTS_NOTE, SAFETY_NOTE, minimumDataText(3, "2026-10-01"), page]) {
    assert.equal(findBannedPhrase(text), null);
    assert.equal(findComparisonWording(text), null);
  }
  assert.ok(!/[↑↓↗↘▲▼]/.test(page), "no arrows");
  assert.ok(!/\b(red|destructive|alert|danger)\b/i.test(page), "no red");
  assert.ok(!/latitude|longitude/.test(page), "the page never touches coordinates");
  const loader = read("src/lib/public-air-activity.ts");
  assert.match(loader, /heldByDecision11\(row, now\)/, "decision 11 as on the map");
  assert.match(loader, /e\.review_status = 'PUBLISHED'/);
  assert.match(loader, /for \(const f of PUBLIC_EVENT_FIELDS\) out\[f\] = row\[f\]/, "items carry public fields only");
  assert.ok(!/historical_|public-historical/.test(loader + read("src/lib/air-activity.ts") + page), "no historical data");
});
