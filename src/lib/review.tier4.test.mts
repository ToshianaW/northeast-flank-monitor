/**
 * Decision #10: an event supported only by Tier 4 sources cannot be published.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local; the DB case creates one
 * throwaway DRAFT event, expects approval to be refused, then deletes it)
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { approveEvent } = await import("./review");
const { isTier4OnlySupport, TIER4_ONLY_MESSAGE } = await import("./source-labels");

after(() => getPool().end());

test("isTier4OnlySupport: Tier 4 only is blocked; any Tier 1-3 allows publishing", () => {
  assert.equal(isTier4OnlySupport([4]), true);
  assert.equal(isTier4OnlySupport([4, 4]), true);
  assert.equal(isTier4OnlySupport([4, 3]), false);
  assert.equal(isTier4OnlySupport([1]), false);
  assert.equal(isTier4OnlySupport([2, 4]), false);
  // No supporting source is a separate rule with its own message.
  assert.equal(isTier4OnlySupport([]), false);
  // A source with no tier is not Tier 1-3, so it cannot carry publication alone.
  assert.equal(isTier4OnlySupport([null]), true);
});

test("approveEvent refuses an event whose only SUPPORTS sources are Tier 4", async () => {
  const pool = getPool();
  const { rows: [tier4] } = await pool.query<{ id: string }>(
    "SELECT id FROM sources WHERE tier = 4 ORDER BY name LIMIT 1",
  );
  assert.ok(tier4, "registry needs at least one Tier 4 source for this test");

  const { rows: [created] } = await pool.query<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, event_type, internal_notes)
     VALUES ('2026-01-01', 'TEST decision #10 (deleted by test)', 'AIR_ACTIVITY', 'review.tier4.test')
     RETURNING event_id`,
  );
  const eventId = created.event_id;
  try {
    await pool.query(
      `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
       VALUES ($1, $2, 'https://example.invalid/tier4-test', 'SUPPORTS', true)`,
      [eventId, tier4.id],
    );

    const result = await approveEvent(eventId, "test-runner");
    assert.deepEqual(result, { ok: false, error: TIER4_ONLY_MESSAGE });

    const { rows: [after] } = await pool.query<{ review_status: string; human_reviewed: boolean; actions: number }>(
      `SELECT review_status, human_reviewed,
              (SELECT count(*)::int FROM review_actions WHERE event_id = $1) AS actions
       FROM events WHERE event_id = $1`,
      [eventId],
    );
    assert.deepEqual(after, { review_status: "DRAFT", human_reviewed: false, actions: 0 });
  } finally {
    // event_sources cascade; no review_actions exist because approval was refused.
    await pool.query("DELETE FROM events WHERE event_id = $1", [eventId]);
  }
});
