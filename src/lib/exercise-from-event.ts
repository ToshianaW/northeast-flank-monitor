import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { EXERCISE_STATUS_VALUES, type ExerciseStatus } from "@/lib/event-labels";
import type { Event } from "@/lib/events";
import { insertExerciseInTransaction, type ExerciseWritePayload } from "@/lib/exercises";
import { logEditReviewAction } from "@/lib/review";

/**
 * An Exercise-type event describes the exercise itself (decision 26), so a published one is tied
 * to an exercise record: the exercise with the same name if there is one, otherwise a new one
 * built from the event's fields and its linked supporting sources. Events of other types are
 * never touched.
 */
export type ExerciseSync =
  | { status: "NOT_EXERCISE" | "NOT_PUBLISHED" | "NOT_FOUND" }
  | { status: "ALREADY_LINKED" | "LINKED"; exerciseId: string }
  | { status: "CREATED"; exerciseId: string; published: boolean };

/** Statuses that mean the exercise has started, so the event's date is its observed start. */
const STARTED: readonly ExerciseStatus[] = ["ACTIVE", "EXTENDED", "CONCLUDING", "CONCLUDED"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exercise's name: the event's exercise name, or its headline when that is empty. */
export function exerciseNameFor(event: Pick<Event, "exercise_name" | "headline">): string {
  return (event.exercise_name?.trim() || event.headline.trim()).slice(0, 200);
}

/** The new exercise's fields, from the event. Reset fields start as Unknown. */
export function exerciseFromEventFields(
  event: Event,
  sources: ExerciseWritePayload["sources"],
): ExerciseWritePayload["exercise"] {
  const status: ExerciseStatus =
    event.exercise_status && (EXERCISE_STATUS_VALUES as readonly string[]).includes(event.exercise_status)
      ? event.exercise_status
      : "UNCLEAR";
  return {
    exercise_name: exerciseNameFor(event),
    actor: event.actor,
    countries: event.country ? [event.country] : [],
    location: event.location_name,
    participating_units: event.unit_name,
    estimated_personnel: event.personnel_estimate,
    equipment: event.equipment_type,
    announced_start_date: event.announced_start_date,
    announced_end_date: event.announced_end_date,
    observed_start_date: event.observed_start_date ?? (STARTED.includes(status) ? event.event_date : null),
    observed_end_date: event.observed_end_date,
    exercise_status: status,
    exercise_objectives: null,
    post_exercise_reset: "UNKNOWN",
    personnel_return_status: "UNKNOWN",
    equipment_return_status: "UNKNOWN",
    infrastructure_status: "UNKNOWN",
    follow_on_activity: null,
    summary: event.summary,
    // A published exercise needs a source; with none to copy it stays a draft for the reviewer.
    review_status: sources.length > 0 ? "PUBLISHED" : "DRAFT",
  };
}

async function syncInTransaction(client: PoolClient, eventId: string, reviewer: string): Promise<ExerciseSync> {
  const { rows } = await client.query<Event>(`SELECT * FROM events WHERE event_id = $1 FOR UPDATE`, [eventId]);
  const event = rows[0];
  if (!event) return { status: "NOT_FOUND" };
  if (event.event_type !== "EXERCISE") return { status: "NOT_EXERCISE" };
  if (event.review_status !== "PUBLISHED") return { status: "NOT_PUBLISHED" };
  if (event.exercise_id) return { status: "ALREADY_LINKED", exerciseId: event.exercise_id };

  const name = exerciseNameFor(event);
  const { rows: [existing] } = await client.query<{ id: string }>(
    `SELECT id FROM exercises WHERE lower(btrim(exercise_name)) = lower($1)
     ORDER BY (review_status = 'PUBLISHED') DESC, created_at ASC LIMIT 1`,
    [name],
  );

  let result: ExerciseSync;
  if (existing) {
    result = { status: "LINKED", exerciseId: existing.id };
  } else {
    // Supporting sources with a link, from registry sources an exercise may cite (exercise_sources
    // needs a URL; live statements and historical-only sources are left out).
    const { rows: sourceRows } = await client.query<{ source_id: string; article_url: string; excerpt: string | null }>(
      `SELECT es.source_id, es.article_url, es.excerpt
       FROM event_sources es JOIN sources s ON s.id = es.source_id
       WHERE es.event_id = $1 AND es.relationship = 'SUPPORTS' AND es.article_url IS NOT NULL
         AND es.source_label IS NULL AND NOT s.historical_only
       ORDER BY es.is_primary DESC, es.created_at ASC`,
      [eventId],
    );
    const seen = new Set<string>();
    const sources = sourceRows
      .filter((r) => !seen.has(`${r.source_id} ${r.article_url}`) && seen.add(`${r.source_id} ${r.article_url}`))
      .map((r, i) => ({ source_id: r.source_id, article_url: r.article_url, excerpt: r.excerpt ?? "", is_primary: i === 0 }));
    const exercise = exerciseFromEventFields(event, sources);
    const id = await insertExerciseInTransaction(client, { exercise, sources }, reviewer);
    result = { status: "CREATED", exerciseId: id, published: exercise.review_status === "PUBLISHED" };
  }

  // Link the event, logged as an edit like any other link change.
  await logEditReviewAction(event, reviewer, client);
  await client.query(`UPDATE events SET exercise_id = $1, exercise_name = coalesce(exercise_name, $2) WHERE event_id = $3`, [
    result.exerciseId,
    name,
    eventId,
  ]);
  return result;
}

/** Links or creates the exercise for a published Exercise-type event (see ExerciseSync). */
export async function syncExerciseFromEvent(eventId: string, reviewer: string): Promise<ExerciseSync> {
  if (!UUID_RE.test(eventId)) return { status: "NOT_FOUND" };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await syncInTransaction(client, eventId, reviewer);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
