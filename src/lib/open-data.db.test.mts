/**
 * Open-data API against the database (read-only, rolled back): unpublished events never appear,
 * and keyset pages are stable (no repeats, same total as one large page). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true, repeatableRead: true });
const { loadOpenDataPage } = await import("./public-open-data");
const { encodeCursor } = await import("./open-data");
const NOW = new Date();
const base = { area: null, types: [], layer: "all" as const, cursor: null };

test("draft, rejected and merged events never appear", async () => {
  const { rows } = await db.client.query<{ event_id: string; d: string }>(
    `SELECT event_id, event_date::text AS d FROM events WHERE review_status <> 'PUBLISHED'`,
  );
  for (const r of rows) {
    const from = new Date(new Date(`${r.d}T00:00:00Z`).getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(new Date(`${r.d}T00:00:00Z`).getTime() + 40 * 86_400_000).toISOString().slice(0, 10);
    const page = await loadOpenDataPage({ ...base, from, to, limit: 200 }, NOW);
    assert.ok(!page.events.some((e) => e.event_id === r.event_id), `unpublished event ${r.event_id} returned`);
  }
  const { rows: [{ n }] } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE review_status <> 'PUBLISHED'`);
  assert.equal(rows.length, n);
});

test("keyset pages are stable: no repeats, same events as one large page", async () => {
  const to = NOW.toISOString().slice(0, 10);
  const from = new Date(NOW.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);
  const all = await loadOpenDataPage({ ...base, from, to, limit: 200 }, NOW);
  const seen: string[] = [];
  let cursor = null as null | { date: string; id: string };
  for (let i = 0; i < 100; i++) {
    const page = await loadOpenDataPage({ ...base, from, to, limit: 2, cursor }, NOW);
    seen.push(...page.events.map((e) => e.event_id as string));
    if (!page.nextCursor) break;
    const last = page.events.at(-1)!;
    assert.equal(page.nextCursor, encodeCursor({ date: last.event_date as string, id: last.event_id as string }));
    cursor = { date: last.event_date as string, id: last.event_id as string };
  }
  assert.equal(new Set(seen).size, seen.length, "a row repeated across pages");
  assert.deepEqual(seen, all.events.map((e) => e.event_id));
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
