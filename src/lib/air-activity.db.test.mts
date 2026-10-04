/**
 * Air Activity data against the database (read-only, rolled back): only PUBLISHED events, only
 * public fields (no coordinates), and nothing from the historical record. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true, repeatableRead: true });
const { loadAirActivity } = await import("./public-air-activity");
const { PUBLIC_EVENT_FIELDS } = await import("./public-events");

test("unpublished events are never listed; items carry public fields only", async () => {
  const items = await loadAirActivity(new Date());
  const { rows } = await db.client.query<{ event_id: string }>(
    `SELECT event_id FROM events WHERE review_status <> 'PUBLISHED'`,
  );
  const unpublished = new Set(rows.map((r) => r.event_id));
  for (const i of items) {
    assert.ok(!unpublished.has(i.event.event_id), `unpublished ${i.event.event_id}`);
    assert.deepEqual(Object.keys(i.event).sort(), [...PUBLIC_EVENT_FIELDS].sort());
  }
  const { rows: [{ n }] } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE review_status = 'PUBLISHED'
       AND event_type IN ('AIR_ACTIVITY','AIRSPACE_VIOLATION','AIR_DEFENSE','AIRFIELD_ACTIVITY','DRONE_ACTIVITY','MISSILE_ACTIVITY')`,
  );
  assert.ok(items.filter((i) => i.category === "air").length <= n);
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
