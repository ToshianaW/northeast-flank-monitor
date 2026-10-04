/**
 * Migration 0010 rules and the public read: both events PUBLISHED to link, at most 3 per event,
 * no edits, an append-only log, and only approved links with both events PUBLISHED at read time
 * reach /events/[id]. Skipped until migration 0010 is applied. One transaction, rolled back.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true, repeatableRead: true });
const { rows: [{ ready }] } = await db.client.query<{ ready: boolean }>(
  "SELECT to_regclass('public.event_historical_references') IS NOT NULL AS ready",
);
const { rows: published } = await db.client.query<{ event_id: string }>(
  "SELECT event_id FROM events WHERE review_status = 'PUBLISHED' ORDER BY created_at LIMIT 1",
);
const skip = !ready ? "migration 0010 not applied" : published.length === 0 ? "no published event to link" : false;

const refs = await import("./historical-references");
const EVENT = published[0]?.event_id ?? randomUUID();
const historicalIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const draftId = randomUUID();
const marker = `ZZ-REFERENCES-${randomUUID()}`;
const REVIEWER = "Test reviewer";

const link = (historicalEventId: string, attributes = ["SAME_EVENT_TYPE"]) =>
  db.client.query(
    `INSERT INTO event_historical_references (event_id, historical_event_id, shared_attributes, reviewer)
     VALUES ($1, $2, $3::reference_attribute[], $4)`,
    [EVENT, historicalEventId, attributes, REVIEWER],
  );

test("seed published and draft historical entries", { skip }, async () => {
  const { rows: [source] } = await db.client.query<{ id: string }>(
    `INSERT INTO sources (name, tier, historical_only) VALUES ($1, 1, true) RETURNING id`,
    [`${marker} source`],
  );
  for (const [id, publish] of [...historicalIds.map((id) => [id, true] as const), [draftId, false] as const]) {
    await db.client.query(
      `INSERT INTO historical_events (event_id, event_date, headline, event_type, country, actor)
       VALUES ($1, '2021-01-15', $2, 'EXERCISE', 'Belarus', 'Belarusian Armed Forces')`,
      [id, marker],
    );
    await db.client.query(
      `INSERT INTO historical_event_sources (event_id, source_id, article_url, accessed_at, is_primary, excerpt)
       VALUES ($1, $2, $3, now(), true, 'The ministry said units began a readiness check.')`,
      [id, source.id, `https://example.org/${id}`],
    );
    if (publish) {
      await db.client.query(
        `UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`,
        [id],
      );
    }
  }
});

test("a draft historical entry cannot be linked", { skip }, async () => {
  const error = await db.expectError(() => link(draftId));
  assert.match(error.message, /must be PUBLISHED/);
});

test("repeated attributes are refused", { skip }, async () => {
  const error = await db.expectError(() => link(historicalIds[0], ["SAME_COUNTRY", "SAME_COUNTRY"]));
  assert.match(error.message, /may not repeat/);
});

test("at most 3 references per event (database trigger)", { skip }, async () => {
  const { rows: [{ n }] } = await db.client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM event_historical_references WHERE event_id = $1",
    [EVENT],
  );
  assert.equal(n, 0, "the chosen event has no references yet");
  for (const id of historicalIds.slice(0, 3)) {
    await db.step(() => refs.linkReference({ eventId: EVENT, historicalEventId: id, attributes: ["SAME_EVENT_TYPE"], reviewer: REVIEWER }));
  }
  const error = await db.expectError(() => link(historicalIds[3]));
  assert.match(error.message, /already has 3/);
});

test("references cannot be edited and the log is append-only", { skip }, async () => {
  assert.match((await db.expectError(() => db.client.query(
    "UPDATE event_historical_references SET reviewer = 'x' WHERE event_id = $1", [EVENT]))).message, /cannot be edited/);
  assert.match((await db.expectError(() => db.client.query(
    "UPDATE event_historical_reference_log SET reviewer = 'x' WHERE event_id = $1", [EVENT]))).message, /append-only/);
  assert.match((await db.expectError(() => db.client.query(
    "DELETE FROM event_historical_reference_log WHERE event_id = $1", [EVENT]))).message, /append-only/);
  const { rows } = await db.client.query<{ action: string }>(
    "SELECT action FROM event_historical_reference_log WHERE event_id = $1 ORDER BY created_at", [EVENT]);
  assert.deepEqual(rows.map((r) => r.action), ["LINK", "LINK", "LINK"]);
});

test("only approved links with both events PUBLISHED at read time reach /events/[id]", { skip }, async () => {
  // A log line without a reference row (as if unlinked) must not show.
  await db.client.query(
    `INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer)
     VALUES ($1, $2, 'LINK', '{SAME_COUNTRY}', $3)`,
    [EVENT, historicalIds[3], REVIEWER],
  );
  let shown = await refs.listApprovedReferences(EVENT);
  assert.deepEqual(shown.map((r) => r.historical_event_id).sort(), historicalIds.slice(0, 3).sort());
  assert.deepEqual(shown[0].shared_attributes, ["SAME_EVENT_TYPE"]);

  // The historical entry is unpublished after linking: hidden, though the row stays.
  await db.client.query("UPDATE historical_events SET review_status = 'DRAFT' WHERE event_id = $1", [historicalIds[0]]);
  shown = await refs.listApprovedReferences(EVENT);
  assert.equal(shown.length, 2);
  assert.ok(!shown.some((r) => r.historical_event_id === historicalIds[0]));

  // Unlinking removes it and logs UNLINK.
  assert.equal(await db.step(() => refs.unlinkReference({ eventId: EVENT, historicalEventId: historicalIds[1], reviewer: REVIEWER })), true);
  shown = await refs.listApprovedReferences(EVENT);
  assert.deepEqual(shown.map((r) => r.historical_event_id), [historicalIds[2]]);

  // The current event is unpublished: nothing shows.
  await db.client.query("UPDATE events SET review_status = 'DRAFT' WHERE event_id = $1", [EVENT]);
  assert.deepEqual(await refs.listApprovedReferences(EVENT), []);
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows: [{ n }] } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sources WHERE name = $1",
      [`${marker} source`],
    );
    assert.equal(n, 0);
  } finally {
    await pool.end();
  }
});
