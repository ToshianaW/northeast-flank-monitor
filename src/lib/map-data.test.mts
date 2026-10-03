/**
 * Map counts: windows, layers, steps, Tier 4 hold, exercise/event fold (no database).
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ACTIVITY_TYPES, EVENT_TYPE_VALUES, STATEMENT_TYPES } from "./event-labels";
import {
  buildMapData,
  parseMapParams,
  shadeStep,
  type MapEventRow,
  type MapExerciseRow,
} from "./map-data";

const NOW = new Date("2026-10-03T12:00:00Z");

function event(overrides: Partial<MapEventRow>): MapEventRow {
  return {
    event_id: crypto.randomUUID(),
    event_date: new Date("2026-10-01T00:00:00Z"),
    first_reported: null,
    headline: "x",
    summary: null,
    activity_description: null,
    event_type: "AIR_ACTIVITY",
    confidence_level: "MODERATE",
    country: "Lithuania",
    location_name: "Vilnius",
    latitude: null,
    longitude: null,
    exercise_id: null,
    support_tiers: [3],
    ...overrides,
  };
}

function exercise(overrides: Partial<MapExerciseRow>): MapExerciseRow {
  return {
    id: crypto.randomUUID(),
    exercise_name: "x",
    countries: ["Belarus"],
    location: null,
    exercise_status: "ACTIVE",
    announced_start_date: new Date("2026-09-29T00:00:00Z"),
    announced_end_date: new Date("2026-10-02T00:00:00Z"),
    observed_start_date: null,
    observed_end_date: null,
    source_tiers: [3],
    ...overrides,
  };
}

function count(data: ReturnType<typeof buildMapData>, unit: string, region?: string): number {
  const u = data.units.find((x) => x.id === unit)!;
  return region ? u.regions.find((r) => r.id === region)!.count : u.count;
}

test("all 24 event types are in exactly one layer", () => {
  const all = [...ACTIVITY_TYPES, ...STATEMENT_TYPES].sort();
  assert.deepEqual(all, [...EVENT_TYPE_VALUES].sort());
  assert.equal(new Set(all).size, 24);
  // The database enum is the full list: no OTHER, nothing outside the two layers.
  const sql = readFileSync("src/db/migrations/0001_initial_schema.sql", "utf8");
  const body = sql.match(/CREATE TYPE event_type AS ENUM \(([^)]*)\)/)![1];
  const dbTypes = [...body.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  assert.ok(!dbTypes.includes("OTHER"));
  assert.deepEqual(dbTypes, all);
});

test("steps: none, 1, 2-3, 4+", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(shadeStep), [0, 1, 2, 2, 3, 3]);
});

test("params default to 30 days and Activity; unknown values fall back", () => {
  assert.deepEqual(parseMapParams({}), { days: 30, layer: "activity" });
  assert.deepEqual(parseMapParams({ days: "7", layer: "statements" }), { days: 7, layer: "statements" });
  assert.deepEqual(parseMapParams({ days: "365", layer: "<x>" }), { days: 30, layer: "activity" });
});

test("window: by event date; region count adds into its unit", () => {
  const rows = {
    events: [
      event({ event_date: new Date("2026-10-01T00:00:00Z") }),
      event({ event_date: new Date("2026-09-20T00:00:00Z") }),
      event({ event_date: new Date("2026-06-28T00:00:00Z") }),
      event({ location_name: "Lithuania" }),
    ],
    exercises: [],
  };
  const d7 = buildMapData(rows, { days: 7, layer: "activity", now: NOW });
  assert.equal(count(d7, "LT", "LT-VL"), 1);
  assert.equal(count(d7, "LT"), 2);
  const d30 = buildMapData(rows, { days: 30, layer: "activity", now: NOW });
  assert.equal(count(d30, "LT", "LT-VL"), 2);
  assert.equal(count(d30, "LT"), 3);
  assert.equal(buildMapData(rows, { days: 90, layer: "activity", now: NOW }).items.length, 3);
});

test("layers: statements counted only under Statements and All, always listed", () => {
  const rows = { events: [event({ event_type: "POLITICAL_SIGNALING" }), event({})], exercises: [] };
  assert.equal(count(buildMapData(rows, { days: 30, layer: "activity", now: NOW }), "LT"), 1);
  assert.equal(count(buildMapData(rows, { days: 30, layer: "statements", now: NOW }), "LT"), 1);
  const all = buildMapData(rows, { days: 30, layer: "all", now: NOW });
  assert.equal(count(all, "LT"), 2);
  assert.equal(all.items.length, 2);
});

test("Tier 4-only items from the last 72 hours are left off; older ones count", () => {
  const rows = {
    events: [
      event({ support_tiers: [4], event_date: new Date("2026-10-02T00:00:00Z") }),
      event({ support_tiers: [4], event_date: new Date("2026-09-20T00:00:00Z"), first_reported: new Date("2026-10-02T08:00:00Z") }),
      event({ support_tiers: [4], event_date: new Date("2026-09-20T00:00:00Z"), first_reported: new Date("2026-09-20T08:00:00Z") }),
      event({ support_tiers: [4, 2], event_date: new Date("2026-10-02T00:00:00Z") }),
    ],
    exercises: [exercise({ source_tiers: [4] })],
  };
  const data = buildMapData(rows, { days: 30, layer: "all", now: NOW });
  assert.equal(count(data, "LT"), 2);
  assert.equal(count(data, "BY"), 0);
  assert.equal(data.items.length, 2);
});

test("an event linked to a counted exercise is listed but counted once", () => {
  const x = exercise({});
  const rows = {
    events: [event({ country: "Belarus", location_name: "Belarus", event_type: "MOBILIZATION", exercise_id: x.id })],
    exercises: [x],
  };
  const data = buildMapData(rows, { days: 30, layer: "activity", now: NOW });
  assert.equal(count(data, "BY"), 1);
  assert.equal(data.items.length, 2);
  assert.equal(data.items.filter((i) => i.counted).length, 1);
});

test("exercises: overlap with the window; no end date means start day unless under way", () => {
  const rows = {
    events: [],
    exercises: [
      exercise({ announced_start_date: new Date("2026-08-01T00:00:00Z"), announced_end_date: new Date("2026-09-30T00:00:00Z") }),
      exercise({ announced_start_date: new Date("2026-08-01T00:00:00Z"), announced_end_date: null, exercise_status: "CONCLUDED" }),
      exercise({ announced_start_date: new Date("2026-08-01T00:00:00Z"), announced_end_date: null, exercise_status: "ACTIVE" }),
      exercise({ announced_start_date: new Date("2026-11-01T00:00:00Z"), announced_end_date: null, exercise_status: "UPCOMING" }),
      exercise({ announced_start_date: null }),
    ],
  };
  assert.equal(count(buildMapData(rows, { days: 7, layer: "activity", now: NOW }), "BY"), 2);
});

test("output carries no coordinates or article text", () => {
  const rows = {
    events: [event({ summary: "SECRET-SUMMARY", activity_description: "SECRET-ACTIVITY", latitude: 54.5, longitude: 25.5 })],
    exercises: [],
  };
  const json = JSON.stringify(buildMapData(rows, { days: 30, layer: "all", now: NOW }));
  assert.ok(!json.includes("SECRET") && !json.includes("54.5") && !json.includes("latitude"));
});
