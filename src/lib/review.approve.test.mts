/**
 * Approval sets the confidence the reviewer chose and logs the previous value.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local. Everything happens inside one
 * transaction that is rolled back, so no event or review_actions row is left behind)
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { approveEventInTransaction } = await import("./review");

after(() => getPool().end());

test("approval stores the chosen confidence and records the old one", async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows: [source] } = await client.query<{ id: string }>(
      "SELECT id FROM sources WHERE tier BETWEEN 1 AND 3 AND id <> '1100e000-0000-4000-8000-000000000001' ORDER BY name LIMIT 1",
    );
    assert.ok(source, "registry needs at least one Tier 1-3 source for this test");

    const { rows: [created] } = await client.query<{ event_id: string }>(
      `INSERT INTO events (event_date, headline, event_type, confidence_level, internal_notes)
       VALUES ('2026-01-01', 'TEST approve confidence (rolled back)', 'AIR_ACTIVITY', 'UNVERIFIED', 'review.approve.test')
       RETURNING event_id`,
    );
    await client.query(
      `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
       VALUES ($1, $2, 'https://example.invalid/approve-test', 'SUPPORTS', true)`,
      [created.event_id, source.id],
    );

    const result = await approveEventInTransaction(client, created.event_id, "test-runner", "MODERATE");
    assert.deepEqual(result, { ok: true });

    const { rows: [event] } = await client.query(
      "SELECT review_status, confidence_level, human_reviewed FROM events WHERE event_id = $1",
      [created.event_id],
    );
    assert.deepEqual(event, { review_status: "PUBLISHED", confidence_level: "MODERATE", human_reviewed: true });

    const { rows: actions } = await client.query(
      "SELECT action, previous_values FROM review_actions WHERE event_id = $1",
      [created.event_id],
    );
    assert.deepEqual(actions, [
      { action: "APPROVE", previous_values: { review_status: "DRAFT", confidence_level: "UNVERIFIED" } },
    ]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
