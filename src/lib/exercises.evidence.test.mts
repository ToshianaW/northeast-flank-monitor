/**
 * Migration 0007 triggers and the exercise audit log, against the real database.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local. Each test runs in one
 * transaction that is rolled back, so nothing is left behind)
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";
import type { PoolClient } from "pg";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { insertExerciseInTransaction, updateExerciseInTransaction } = await import("./exercises");

after(() => getPool().end());

async function inRolledBackTransaction(work: (client: PoolClient) => Promise<void>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** Runs `work`, then forces the deferred triggers to fire; returns the error, if any. */
async function checkDeferred(client: PoolClient, work: () => Promise<unknown>) {
  await client.query("SAVEPOINT check_deferred");
  try {
    await work();
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("RELEASE SAVEPOINT check_deferred");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    return null;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT check_deferred");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    return error as { code?: string; message?: string };
  }
}

async function anySourceId(client: PoolClient): Promise<string> {
  const { rows: [source] } = await client.query<{ id: string }>(
    "SELECT id FROM sources WHERE tier BETWEEN 1 AND 3 ORDER BY name LIMIT 1",
  );
  assert.ok(source, "registry needs at least one Tier 1-3 source for this test");
  return source.id;
}

async function insertExercise(client: PoolClient, extra = "") {
  const { rows: [x] } = await client.query<{ id: string }>(
    `INSERT INTO exercises (exercise_name, announced_start_date, announced_end_date)
     VALUES ('TEST exercise (rolled back)', '2026-01-10', '2026-01-15') RETURNING id`,
  );
  if (extra) await client.query(`UPDATE exercises SET ${extra} WHERE id = $1`, [x.id]);
  return x.id;
}

async function insertPublishedEvent(client: PoolClient, sourceId: string, date: string, exerciseId: string) {
  const { rows: [e] } = await client.query<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, event_type, review_status, human_reviewed,
                         exercise_id, internal_notes)
     VALUES ($1, 'TEST linked event (rolled back)', 'EXERCISE', 'PUBLISHED', true, $2,
             'exercises.evidence.test')
     RETURNING event_id`,
    [date, exerciseId],
  );
  await client.query(
    `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
     VALUES ($1, $2, 'https://example.invalid/exercise-test', 'SUPPORTS', true)`,
    [e.event_id, sourceId],
  );
  return e.event_id;
}

test("a non-UNKNOWN reset status without evidence is refused", async () => {
  await inRolledBackTransaction(async (client) => {
    const error = await checkDeferred(client, () =>
      insertExercise(client, "personnel_return_status = 'RETURNED'"),
    );
    assert.equal(error?.code, "23514");
    assert.match(error?.message ?? "", /without evidence/);
  });
});

test("a source counts as evidence only with an excerpt", async () => {
  await inRolledBackTransaction(async (client) => {
    const sourceId = await anySourceId(client);
    const noExcerpt = await checkDeferred(client, async () => {
      const id = await insertExercise(client, "post_exercise_reset = 'PARTIAL_RESET'");
      await client.query(
        `INSERT INTO exercise_sources (exercise_id, source_id, article_url, is_primary)
         VALUES ($1, $2, 'https://example.invalid/a', true)`,
        [id, sourceId],
      );
    });
    assert.equal(noExcerpt?.code, "23514");

    const withExcerpt = await checkDeferred(client, async () => {
      const id = await insertExercise(client, "post_exercise_reset = 'PARTIAL_RESET'");
      await client.query(
        `INSERT INTO exercise_sources (exercise_id, source_id, article_url, is_primary, excerpt)
         VALUES ($1, $2, 'https://example.invalid/a', true, 'Units returned to garrison.')`,
        [id, sourceId],
      );
    });
    assert.equal(withExcerpt, null);
  });
});

test("linked events: only on/after the end date count; unlinking or unpublishing the last one is refused", async () => {
  await inRolledBackTransaction(async (client) => {
    const sourceId = await anySourceId(client);
    const id = await insertExercise(client);

    const early = await insertPublishedEvent(client, sourceId, "2026-01-12", id);
    const tooEarly = await checkDeferred(client, () =>
      client.query(`UPDATE exercises SET personnel_return_status = 'RETURNED' WHERE id = $1`, [id]),
    );
    assert.equal(tooEarly?.code, "23514", "an event before the announced end is not evidence");

    const late = await insertPublishedEvent(client, sourceId, "2026-01-15", id);
    assert.equal(
      await checkDeferred(client, () =>
        client.query(`UPDATE exercises SET personnel_return_status = 'RETURNED' WHERE id = $1`, [id]),
      ),
      null,
    );

    const unlink = await checkDeferred(client, () =>
      client.query(`UPDATE events SET exercise_id = NULL WHERE event_id = $1`, [late]),
    );
    assert.equal(unlink?.code, "23514");

    const unpublish = await checkDeferred(client, () =>
      client.query(`UPDATE events SET review_status = 'PENDING_REVIEW' WHERE event_id = $1`, [late]),
    );
    assert.equal(unpublish?.code, "23514");

    const redate = await checkDeferred(client, () =>
      client.query(`UPDATE events SET event_date = '2026-01-11' WHERE event_id = $1`, [late]),
    );
    assert.equal(redate?.code, "23514");

    // Unlinking an event that was never evidence is fine.
    assert.equal(
      await checkDeferred(client, () =>
        client.query(`UPDATE events SET exercise_id = NULL WHERE event_id = $1`, [early]),
      ),
      null,
    );
  });
});

test("a published exercise needs a source, and cannot lose its last one", async () => {
  await inRolledBackTransaction(async (client) => {
    const sourceId = await anySourceId(client);
    const bare = await checkDeferred(client, () => insertExercise(client, "review_status = 'PUBLISHED'"));
    assert.equal(bare?.code, "23514");
    assert.match(bare?.message ?? "", /must have at least one source/);

    const id = await insertExercise(client);
    await client.query(
      `INSERT INTO exercise_sources (exercise_id, source_id, article_url, is_primary)
       VALUES ($1, $2, 'https://example.invalid/b', true)`,
      [id, sourceId],
    );
    assert.equal(
      await checkDeferred(client, () =>
        client.query(`UPDATE exercises SET review_status = 'PUBLISHED' WHERE id = $1`, [id]),
      ),
      null,
    );
    const removed = await checkDeferred(client, () =>
      client.query(`DELETE FROM exercise_sources WHERE exercise_id = $1`, [id]),
    );
    assert.equal(removed?.code, "23514");
  });
});

test("FULL_RESET is refused unless all three dimensions are Returned or Removed", async () => {
  await inRolledBackTransaction(async (client) => {
    const error = await checkDeferred(client, () =>
      insertExercise(
        client,
        "post_exercise_reset = 'FULL_RESET', personnel_return_status = 'RETURNED', equipment_return_status = 'RETURNED'",
      ),
    );
    assert.equal(error?.code, "23514");
    assert.equal((error as { constraint?: string }).constraint, "exercises_full_reset_requires_dimensions");
  });
});

test("create and edit write CREATE and EDIT audit rows, which cannot be changed", async () => {
  await inRolledBackTransaction(async (client) => {
    const sourceId = await anySourceId(client);
    const payload = {
      exercise: {
        exercise_name: "TEST audit exercise (rolled back)",
        actor: null,
        countries: ["Belarus"],
        location: null,
        participating_units: null,
        estimated_personnel: null,
        equipment: null,
        announced_start_date: new Date("2026-01-10T00:00:00Z"),
        announced_end_date: new Date("2026-01-15T00:00:00Z"),
        observed_start_date: null,
        observed_end_date: null,
        exercise_status: "ACTIVE" as const,
        exercise_objectives: null,
        post_exercise_reset: "UNKNOWN" as const,
        personnel_return_status: "UNKNOWN" as const,
        equipment_return_status: "UNKNOWN" as const,
        infrastructure_status: "UNKNOWN" as const,
        follow_on_activity: null,
        summary: null,
        review_status: "DRAFT" as const,
      },
      sources: [
        { source_id: sourceId, article_url: "https://example.invalid/c", excerpt: "x", is_primary: true },
      ],
    };
    const id = await insertExerciseInTransaction(client, payload, "test-runner");
    const updated = await updateExerciseInTransaction(
      client,
      id,
      { ...payload, exercise: { ...payload.exercise, exercise_status: "CONCLUDING" } },
      "test-runner",
    );
    assert.equal(updated, true);

    const { rows } = await client.query(
      `SELECT action, reviewer, source_ids, previous_values->>'exercise_status' AS prev_status,
              previous_values->'sources'->0->>'excerpt' AS prev_excerpt
       FROM exercise_actions WHERE exercise_id = $1 ORDER BY created_at, action`,
      [id],
    );
    assert.deepEqual(rows, [
      { action: "CREATE", reviewer: "test-runner", source_ids: [sourceId], prev_status: null, prev_excerpt: null },
      { action: "EDIT", reviewer: "test-runner", source_ids: [sourceId], prev_status: "ACTIVE", prev_excerpt: "x" },
    ]);

    await client.query("SAVEPOINT append_only");
    await assert.rejects(
      client.query(`DELETE FROM exercise_actions WHERE exercise_id = $1`, [id]),
      /append-only/,
    );
    await client.query("ROLLBACK TO SAVEPOINT append_only");
  });
});
