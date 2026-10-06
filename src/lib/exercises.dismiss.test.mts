/**
 * Dismissing an exercise's suggested update (migration 0016). Everything is rolled back.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
// As in production, where the source checks run at commit, after the sources are written.
await db.client.query("SET CONSTRAINTS ALL DEFERRED");
const { dismissExerciseSuggestion, getExercise, listExerciseUpdateEvidence } = await import("./exercises");
const { activeExerciseSuggestion, suggestionKey } = await import("./exercise-rules");

const q = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
  db.client.query<T>(text, values).then((r) => r.rows);

const [{ id: exerciseId }] = await q<{ id: string }>(
  `INSERT INTO exercises (exercise_name, exercise_status, observed_start_date)
   VALUES ('TEST Dismissal exercise (rolled back)', 'ACTIVE', '2026-09-20') RETURNING id`,
);

async function linkEndEvent(observedEnd: string): Promise<string> {
  const [{ event_id }] = await q<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, summary, event_type, country, exercise_id, observed_end_date,
                         review_status, human_reviewed, internal_notes)
     VALUES ($1, 'TEST exercise ends (rolled back)', 'The exercise ended.', 'EXERCISE', 'Estonia', $2, $1,
             'PUBLISHED', true, 'exercises.dismiss.test')
     RETURNING event_id`,
    [observedEnd, exerciseId],
  );
  return event_id;
}

async function current() {
  const exercise = (await getExercise(exerciseId))!;
  const evidence = await listExerciseUpdateEvidence([exerciseId]);
  return { exercise, suggestion: activeExerciseSuggestion(exercise, evidence.get(exerciseId) ?? []) };
}

test("a dismissal hides that suggestion, is logged, and a stale key is refused", async () => {
  await linkEndEvent("2026-10-01");
  const { suggestion } = await current();
  assert.ok(suggestion, "the linked event's observed end suggests an update");
  const key = suggestionKey(suggestion);

  const stale = await dismissExerciseSuggestion(exerciseId, "exercise_status=CONCLUDED@someone-else", "test-runner");
  assert.equal(stale.ok, false);

  assert.deepEqual(await dismissExerciseSuggestion(exerciseId, key, "test-runner"), { ok: true });
  const after = await current();
  assert.equal(after.exercise.dismissed_suggestion, key);
  assert.equal(after.suggestion, null);
  assert.equal(after.exercise.exercise_status, "ACTIVE", "dismissing never changes the exercise");

  const [log] = await q<{ reviewer: string; previous_values: { dismissed: string } }>(
    `SELECT reviewer, previous_values FROM exercise_actions
     WHERE exercise_id = $1 AND action = 'DISMISS_SUGGESTION'`,
    [exerciseId],
  );
  assert.equal(log.reviewer, "test-runner");
  assert.equal(log.previous_values.dismissed, key);
});

test("a later event reporting something different brings the suggestion back", async () => {
  const laterId = await linkEndEvent("2026-10-03");
  const { suggestion } = await current();
  assert.equal(suggestion?.observed_end_date?.event.event_id, laterId);
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
