/**
 * Migration 0012: activity_index_snapshots rules (one row per formula, scope and window; valid
 * bands and windows; append-only). Skipped until migration 0012 is applied. Rolled back.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ repeatableRead: true });
const { rows: [{ ready }] } = await db.client.query<{ ready: boolean }>(
  "SELECT to_regclass('public.activity_index_snapshots') IS NOT NULL AS ready",
);
const skip = ready ? false : "migration 0012 not applied";
const VERSION = "test-formula-zz";

const insert = (over: Record<string, unknown> = {}) => {
  const row = {
    scope: "THEATER", baseline_start: "2026-10-05", baseline_end: "2026-11-29", window_start: "2026-11-30",
    window_end: "2026-12-27", band: "WITHIN", expected: 6, ...over,
  };
  return db.client.query(
    `INSERT INTO activity_index_snapshots (formula_version, scope, baseline_start, baseline_end, window_start, window_end,
       panel_sources, baseline_events, window_events, expected, band, dimensions)
     VALUES ($1, $2, $3, $4, $5, $6, 44, 12, 9, $7, $8, '{"AIR_ACTIVITY": 4}')`,
    [VERSION, row.scope, row.baseline_start, row.baseline_end, row.window_start, row.window_end, row.expected, row.band],
  );
};

test("a snapshot is stored once per formula, scope and window", { skip }, async () => {
  await db.step(() => insert());
  assert.match((await db.expectError(() => insert())).message, /duplicate key/);
  await db.step(() => insert({ scope: "BY" }));
});

test("bands and windows are checked", { skip }, async () => {
  assert.match((await db.expectError(() => insert({ scope: "LT", band: "HIGH" }))).message, /check/);
  assert.match((await db.expectError(() => insert({ scope: "LV", window_start: "2026-11-01" }))).message, /check/);
});

test("snapshots are append-only", { skip }, async () => {
  assert.match((await db.expectError(() => db.client.query(
    "UPDATE activity_index_snapshots SET band = 'MORE' WHERE formula_version = $1", [VERSION]))).message, /append-only/);
  assert.match((await db.expectError(() => db.client.query(
    "DELETE FROM activity_index_snapshots WHERE formula_version = $1", [VERSION]))).message, /append-only/);
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    if (ready) {
      const { rows: [{ n }] } = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM activity_index_snapshots WHERE formula_version = $1", [VERSION]);
      assert.equal(n, 0);
    }
  } finally {
    await pool.end();
  }
});
