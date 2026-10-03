import "server-only";
import { getPool } from "@/lib/db";
import { UNDER_WAY_STATUSES } from "@/lib/exercise-rules";
import type { Exercise } from "@/lib/exercises";
import { PUBLIC_EVENT_COLUMNS, type PublicEvent } from "@/lib/public-events";
import type { SourceType } from "@/lib/source-labels";

/**
 * Public read path for exercises. Every query is restricted to PUBLISHED exercises, and
 * linked events to PUBLISHED events.
 */

const PUBLIC_EXERCISE_FIELDS = [
  "id",
  "exercise_name",
  "actor",
  "countries",
  "location",
  "participating_units",
  "estimated_personnel",
  "equipment",
  "announced_start_date",
  "announced_end_date",
  "observed_start_date",
  "observed_end_date",
  "exercise_status",
  "exercise_objectives",
  "post_exercise_reset",
  "personnel_return_status",
  "equipment_return_status",
  "infrastructure_status",
  "follow_on_activity",
  "summary",
  "updated_at",
] as const satisfies readonly (keyof Exercise)[];

export type PublicExercise = Pick<Exercise, (typeof PUBLIC_EXERCISE_FIELDS)[number]>;

export type PublicExerciseSource = {
  name: string;
  home_url: string | null;
  source_type: SourceType;
  source_country: string | null;
  tier: number | null;
  article_url: string;
  is_primary: boolean;
  excerpt: string | null;
};

const COLUMNS = PUBLIC_EXERCISE_FIELDS.join(", ");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER = `ORDER BY coalesce(observed_start_date, announced_start_date) DESC NULLS LAST,
                        updated_at DESC`;

export async function listPublishedExercises(): Promise<PublicExercise[]> {
  const { rows } = await getPool().query<PublicExercise>(
    `SELECT ${COLUMNS} FROM exercises WHERE review_status = 'PUBLISHED' ${ORDER}`,
  );
  return rows;
}

/** Dashboard panel: ACTIVE, EXTENDED or CONCLUDING. */
export async function listUnderWayExercises(): Promise<PublicExercise[]> {
  const { rows } = await getPool().query<PublicExercise>(
    `SELECT ${COLUMNS} FROM exercises
     WHERE review_status = 'PUBLISHED' AND exercise_status = ANY ($1::exercise_status[])
     ${ORDER}`,
    [UNDER_WAY_STATUSES],
  );
  return rows;
}

export async function getPublishedExercise(id: string): Promise<PublicExercise | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<PublicExercise>(
    `SELECT ${COLUMNS} FROM exercises WHERE id = $1 AND review_status = 'PUBLISHED'`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPublicExerciseSources(
  exerciseId: string,
): Promise<PublicExerciseSource[]> {
  if (!UUID_RE.test(exerciseId)) return [];
  const { rows } = await getPool().query<PublicExerciseSource>(
    `SELECT s.name, s.home_url, s.source_type, s.source_country, s.tier,
            xs.article_url, xs.is_primary, xs.excerpt
     FROM exercise_sources xs
     JOIN exercises x ON x.id = xs.exercise_id
     JOIN sources s ON s.id = xs.source_id
     WHERE xs.exercise_id = $1 AND x.review_status = 'PUBLISHED'
     ORDER BY xs.is_primary DESC, xs.created_at ASC`,
    [exerciseId],
  );
  return rows;
}

/** Linked published events, oldest first. */
export async function listPublishedExerciseEvents(exerciseId: string): Promise<PublicEvent[]> {
  if (!UUID_RE.test(exerciseId)) return [];
  const { rows } = await getPool().query<PublicEvent>(
    `SELECT ${PUBLIC_EVENT_COLUMNS}
     FROM events
     WHERE exercise_id = $1 AND review_status = 'PUBLISHED'
     ORDER BY event_date ASC, first_reported ASC NULLS LAST, created_at ASC`,
    [exerciseId],
  );
  return rows;
}
