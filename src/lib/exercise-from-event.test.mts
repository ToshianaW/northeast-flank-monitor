/**
 * Decision 26: a published Exercise-type event is linked to the exercise of the same name, or a
 * new exercise is created from it. Everything is rolled back. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
// As in production, where the source checks run at commit, after the sources are written.
await db.client.query("SET CONSTRAINTS ALL DEFERRED");
const { syncExerciseFromEvent } = await import("./exercise-from-event");
const { LIVE_STATEMENT_SOURCE_ID } = await import("./source-labels");

const q = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
  db.client.query<T>(text, values).then((r) => r.rows);

const [source] = await q<{ id: string }>(
  `SELECT id FROM sources WHERE tier BETWEEN 1 AND 3 AND NOT historical_only AND id <> $1 LIMIT 1`,
  [LIVE_STATEMENT_SOURCE_ID],
);
const NAME = "TEST Steadfast Zorblax 26 (rolled back)";

async function plant(fields: { type?: string; status?: string; name?: string | null; live?: boolean }): Promise<string> {
  const [{ event_id }] = await q<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, summary, event_type, country, exercise_name, exercise_status, internal_notes)
     VALUES ('2026-10-06', 'TEST exercise begins (rolled back)', 'The command-post exercise began.', $1, 'Estonia', $2, 'ACTIVE', 'exercise-from-event.test')
     RETURNING event_id`,
    [fields.type ?? "EXERCISE", fields.name === undefined ? NAME : fields.name],
  );
  if (fields.live) {
    await q(
      `INSERT INTO event_sources (event_id, source_id, source_label, relationship, is_primary)
       VALUES ($1, $2, 'Speaker on TV', 'SUPPORTS', true)`,
      [event_id, LIVE_STATEMENT_SOURCE_ID],
    );
  } else {
    await q(
      `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary, excerpt)
       VALUES ($1, $2, 'https://example.invalid/steadfast', 'SUPPORTS', true, 'Steadfast exercise began')`,
      [event_id, source.id],
    );
  }
  if ((fields.status ?? "PUBLISHED") === "PUBLISHED") {
    await q(`UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [event_id]);
  }
  return event_id;
}

test("a published Exercise-type event creates a published exercise from its fields and is linked to it", async () => {
  const id = await plant({});
  const result = await syncExerciseFromEvent(id, "test-runner");
  assert.equal(result.status, "CREATED");
  assert.ok(result.status === "CREATED" && result.published);
  const exerciseId = (result as { exerciseId: string }).exerciseId;

  const [x] = await q(
    `SELECT exercise_name, exercise_status, countries, observed_start_date::text AS start, summary, review_status,
            (SELECT count(*)::int FROM exercise_sources WHERE exercise_id = $1) AS sources,
            (SELECT count(*)::int FROM exercise_actions WHERE exercise_id = $1 AND action = 'CREATE') AS created
     FROM exercises WHERE id = $1`,
    [exerciseId],
  );
  assert.deepEqual(x, {
    exercise_name: NAME,
    exercise_status: "ACTIVE",
    countries: ["Estonia"],
    start: "2026-10-06",
    summary: "The command-post exercise began.",
    review_status: "PUBLISHED",
    sources: 1,
    created: 1,
  });
  const [e] = await q<{ exercise_id: string }>("SELECT exercise_id FROM events WHERE event_id = $1", [id]);
  assert.equal(e.exercise_id, exerciseId);
  assert.deepEqual(await syncExerciseFromEvent(id, "test-runner"), { status: "ALREADY_LINKED", exerciseId });

  // A second report on the same exercise links to it rather than creating another.
  const second = await plant({ name: NAME.toUpperCase() });
  assert.deepEqual(await syncExerciseFromEvent(second, "test-runner"), { status: "LINKED", exerciseId });
});

test("other types and unpublished events are left alone; no linked source means a draft exercise", async () => {
  assert.equal((await syncExerciseFromEvent(await plant({ type: "TROOP_MOVEMENT" }), "t")).status, "NOT_EXERCISE");
  assert.equal((await syncExerciseFromEvent(await plant({ status: "DRAFT" }), "t")).status, "NOT_PUBLISHED");
  const live = await syncExerciseFromEvent(await plant({ name: "TEST Live-only exercise (rolled back)", live: true }), "t");
  assert.ok(live.status === "CREATED" && !live.published, "a live statement has no URL to copy, so the exercise stays a draft");
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
