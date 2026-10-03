import "server-only";
import { getPool } from "@/lib/db";
import {
  DIMENSION_STATUS_VALUES,
  EXERCISE_STATUS_VALUES,
  RESET_STATUS_VALUES,
  type DimensionStatus,
  type ExerciseStatus,
  type ResetStatus,
  type ReviewStatus,
} from "@/lib/event-labels";
import {
  EXERCISE_REVIEW_STATUS_VALUES,
  FULL_RESET_ERROR,
  fullResetAllowed,
  hasNonUnknownReset,
  hasResetEvidence,
  lastEvidenceError,
  PUBLISHED_NEEDS_SOURCE_ERROR,
  RESET_EVIDENCE_ERROR,
} from "@/lib/exercise-rules";
import { getEvent, toDateParam } from "@/lib/events";
import { logEditReviewAction } from "@/lib/review";
import { getSource } from "@/lib/sources";

export type Exercise = {
  id: string;
  exercise_name: string;
  actor: string | null;
  countries: string[];
  location: string | null;
  participating_units: string | null;
  estimated_personnel: string | null;
  equipment: string | null;
  announced_start_date: Date | null;
  announced_end_date: Date | null;
  observed_start_date: Date | null;
  observed_end_date: Date | null;
  exercise_status: ExerciseStatus;
  exercise_objectives: string | null;
  post_exercise_reset: ResetStatus;
  personnel_return_status: DimensionStatus;
  equipment_return_status: DimensionStatus;
  infrastructure_status: DimensionStatus;
  follow_on_activity: string | null;
  summary: string | null;
  review_status: ReviewStatus;
  created_at: Date;
  updated_at: Date;
};

export type ExerciseListItem = Pick<
  Exercise,
  | "id"
  | "exercise_name"
  | "actor"
  | "exercise_status"
  | "review_status"
  | "announced_start_date"
  | "announced_end_date"
  | "observed_start_date"
  | "observed_end_date"
  | "post_exercise_reset"
  | "updated_at"
>;

export type ExerciseSourceRow = {
  id: string;
  source_id: string;
  article_url: string;
  is_primary: boolean;
  excerpt: string | null;
};

export type ExerciseSourceFormRow = {
  source_id: string;
  article_url: string;
  excerpt: string;
};

export type LinkedEvent = {
  event_id: string;
  headline: string;
  event_date: Date;
  review_status: ReviewStatus;
};

export const EXERCISE_FORM_FIELDS = [
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
  "review_status",
] as const;

export type ExerciseField = (typeof EXERCISE_FORM_FIELDS)[number];

export type ExerciseFormValues = Record<ExerciseField, string>;

export type ExerciseFormErrors = Partial<Record<ExerciseField | `xs_${number}_${string}`, string>>;

export type ExerciseWritePayload = {
  exercise: Omit<Exercise, "id" | "created_at" | "updated_at">;
  sources: Array<ExerciseSourceFormRow & { is_primary: boolean }>;
};

export type ExerciseValidationResult =
  | { ok: true; payload: ExerciseWritePayload }
  | { ok: false; errors: ExerciseFormErrors; formError?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXERCISE_COLUMNS = `
  id, exercise_name, actor, countries, location, participating_units, estimated_personnel,
  equipment, announced_start_date, announced_end_date, observed_start_date, observed_end_date,
  exercise_status, exercise_objectives, post_exercise_reset, personnel_return_status,
  equipment_return_status, infrastructure_status, follow_on_activity, summary, review_status,
  created_at, updated_at
`;

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseDateField(
  value: string,
  field: ExerciseField,
  errors: ExerciseFormErrors,
): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    errors[field] = "Use YYYY-MM-DD.";
    return null;
  }
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    errors[field] = "Invalid date.";
    return null;
  }
  return d;
}

function parseEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: ExerciseField,
  errors: ExerciseFormErrors,
  fallback: T,
): T {
  if (!allowed.includes(value as T)) {
    errors[field] = "Choose a valid option.";
    return fallback;
  }
  return value as T;
}

/** "Belarus, Russia" → ["Belarus", "Russia"] */
export function parseCountries(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function emptyExerciseFormValues(): ExerciseFormValues {
  return {
    exercise_name: "",
    actor: "",
    countries: "",
    location: "",
    participating_units: "",
    estimated_personnel: "",
    equipment: "",
    announced_start_date: "",
    announced_end_date: "",
    observed_start_date: "",
    observed_end_date: "",
    exercise_status: "UNCLEAR",
    exercise_objectives: "",
    post_exercise_reset: "UNKNOWN",
    personnel_return_status: "UNKNOWN",
    equipment_return_status: "UNKNOWN",
    infrastructure_status: "UNKNOWN",
    follow_on_activity: "",
    summary: "",
    review_status: "DRAFT",
  };
}

export function exerciseFormValuesFromExercise(x: Exercise): ExerciseFormValues {
  return {
    exercise_name: x.exercise_name,
    actor: x.actor ?? "",
    countries: x.countries.join(", "),
    location: x.location ?? "",
    participating_units: x.participating_units ?? "",
    estimated_personnel: x.estimated_personnel ?? "",
    equipment: x.equipment ?? "",
    announced_start_date: formatDate(x.announced_start_date),
    announced_end_date: formatDate(x.announced_end_date),
    observed_start_date: formatDate(x.observed_start_date),
    observed_end_date: formatDate(x.observed_end_date),
    exercise_status: x.exercise_status,
    exercise_objectives: x.exercise_objectives ?? "",
    post_exercise_reset: x.post_exercise_reset,
    personnel_return_status: x.personnel_return_status,
    equipment_return_status: x.equipment_return_status,
    infrastructure_status: x.infrastructure_status,
    follow_on_activity: x.follow_on_activity ?? "",
    summary: x.summary ?? "",
    review_status: x.review_status,
  };
}

export function exerciseFormValuesFrom(formData: FormData): ExerciseFormValues {
  const values = emptyExerciseFormValues();
  for (const field of EXERCISE_FORM_FIELDS) {
    values[field] = String(formData.get(field) ?? "");
  }
  return values;
}

function sourceRowIndices(formData: FormData): number[] {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^xs_(\d+)_source_id$/);
    if (match) indices.add(Number(match[1]));
  }
  return [...indices].sort((a, b) => a - b);
}

export function exerciseSourceRowsFromFormData(formData: FormData): ExerciseSourceFormRow[] {
  return sourceRowIndices(formData).map((index) => ({
    source_id: String(formData.get(`xs_${index}_source_id`) ?? ""),
    article_url: String(formData.get(`xs_${index}_article_url`) ?? ""),
    excerpt: String(formData.get(`xs_${index}_excerpt`) ?? ""),
  }));
}

/**
 * Validates the exercise form. `exerciseId` is set when editing so linked events can count
 * as reset evidence; a new exercise has none.
 */
export async function validateExerciseForm(
  formData: FormData,
  exerciseId?: string,
): Promise<ExerciseValidationResult> {
  const errors: ExerciseFormErrors = {};
  const values = exerciseFormValuesFrom(formData);

  const exercise_name = values.exercise_name.trim();
  if (!exercise_name) errors.exercise_name = "Exercise name is required.";
  else if (exercise_name.length > 300) errors.exercise_name = "Keep the name under 300 characters.";

  const exercise_status = parseEnum(
    values.exercise_status,
    EXERCISE_STATUS_VALUES,
    "exercise_status",
    errors,
    "UNCLEAR",
  );
  const review_status = parseEnum(
    values.review_status,
    EXERCISE_REVIEW_STATUS_VALUES,
    "review_status",
    errors,
    "DRAFT",
  );
  const post_exercise_reset = parseEnum(
    values.post_exercise_reset,
    RESET_STATUS_VALUES,
    "post_exercise_reset",
    errors,
    "UNKNOWN",
  );
  const personnel_return_status = parseEnum(
    values.personnel_return_status,
    DIMENSION_STATUS_VALUES,
    "personnel_return_status",
    errors,
    "UNKNOWN",
  );
  const equipment_return_status = parseEnum(
    values.equipment_return_status,
    DIMENSION_STATUS_VALUES,
    "equipment_return_status",
    errors,
    "UNKNOWN",
  );
  const infrastructure_status = parseEnum(
    values.infrastructure_status,
    DIMENSION_STATUS_VALUES,
    "infrastructure_status",
    errors,
    "UNKNOWN",
  );

  const announced_start_date = parseDateField(values.announced_start_date, "announced_start_date", errors);
  const announced_end_date = parseDateField(values.announced_end_date, "announced_end_date", errors);
  const observed_start_date = parseDateField(values.observed_start_date, "observed_start_date", errors);
  const observed_end_date = parseDateField(values.observed_end_date, "observed_end_date", errors);
  if (announced_start_date && announced_end_date && announced_end_date < announced_start_date) {
    errors.announced_end_date = "End date must be on or after start date.";
  }
  if (observed_start_date && observed_end_date && observed_end_date < observed_start_date) {
    errors.observed_end_date = "End date must be on or after start date.";
  }

  // Rows left completely blank are ignored (the form always shows one row).
  const sourceRows = exerciseSourceRowsFromFormData(formData)
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.source_id.trim() || row.article_url.trim() || row.excerpt.trim());
  const primaryRaw = String(formData.get("xs_primary_index") ?? "");
  const primaryIndex = primaryRaw === "" ? -1 : Number.parseInt(primaryRaw, 10);

  const resolvedSources: ExerciseWritePayload["sources"] = [];
  for (const { row, index } of sourceRows) {
    const prefix = `xs_${index}` as const;
    const source_id = row.source_id.trim();
    const article_url = row.article_url.trim();

    if (!source_id || !UUID_RE.test(source_id)) {
      errors[`${prefix}_source_id`] = "Choose a source.";
    } else {
      const source = await getSource(source_id);
      if (!source) errors[`${prefix}_source_id`] = "Source not found.";
      else if (source.historical_only) {
        errors[`${prefix}_source_id`] = "This source is historical-only and cannot support current exercises.";
      }
    }

    if (!article_url) {
      errors[`${prefix}_article_url`] = "Article URL is required.";
    } else {
      try {
        const url = new URL(article_url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          errors[`${prefix}_article_url`] = "Use http:// or https://.";
        }
      } catch {
        errors[`${prefix}_article_url`] = "Enter a full URL, including https://.";
      }
    }

    resolvedSources.push({
      source_id,
      article_url,
      excerpt: row.excerpt.trim(),
      is_primary: index === primaryIndex,
    });
  }

  if (resolvedSources.length > 0 && resolvedSources.filter((s) => s.is_primary).length !== 1) {
    errors.xs_0_source_id = "Mark one source as primary.";
  }

  const seen = new Set<string>();
  for (const { row, index } of sourceRows) {
    const key = `${row.source_id.trim()} ${row.article_url.trim()}`;
    if (seen.has(key)) errors[`xs_${index}_article_url`] = "This source and URL are already attached.";
    seen.add(key);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const resetFields = {
    post_exercise_reset,
    personnel_return_status,
    equipment_return_status,
    infrastructure_status,
  };

  let formError: string | undefined;
  if (review_status === "PUBLISHED" && resolvedSources.length === 0) {
    formError = PUBLISHED_NEEDS_SOURCE_ERROR;
  } else if (!fullResetAllowed(resetFields)) {
    errors.post_exercise_reset = FULL_RESET_ERROR;
    formError = FULL_RESET_ERROR;
  } else if (hasNonUnknownReset(resetFields)) {
    const linkedEvents = exerciseId ? await listLinkedEvents(exerciseId) : [];
    if (
      !hasResetEvidence({
        sources: resolvedSources,
        linkedEvents,
        observed_end_date,
        announced_end_date,
      })
    ) {
      formError = RESET_EVIDENCE_ERROR;
    }
  }
  if (formError) return { ok: false, errors, formError };

  return {
    ok: true,
    payload: {
      exercise: {
        exercise_name,
        actor: optionalText(values.actor),
        countries: parseCountries(values.countries),
        location: optionalText(values.location),
        participating_units: optionalText(values.participating_units),
        estimated_personnel: optionalText(values.estimated_personnel),
        equipment: optionalText(values.equipment),
        announced_start_date,
        announced_end_date,
        observed_start_date,
        observed_end_date,
        exercise_status,
        exercise_objectives: optionalText(values.exercise_objectives),
        ...resetFields,
        follow_on_activity: optionalText(values.follow_on_activity),
        summary: optionalText(values.summary),
        review_status,
      },
      sources: resolvedSources,
    },
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listExercises(): Promise<ExerciseListItem[]> {
  const { rows } = await getPool().query<ExerciseListItem>(
    `SELECT id, exercise_name, actor, exercise_status, review_status, announced_start_date,
            announced_end_date, observed_start_date, observed_end_date, post_exercise_reset,
            updated_at
     FROM exercises
     ORDER BY coalesce(observed_start_date, announced_start_date) DESC NULLS LAST,
              updated_at DESC`,
  );
  return rows;
}

export async function getExercise(id: string): Promise<Exercise | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<Exercise>(
    `SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listExerciseSources(exerciseId: string): Promise<ExerciseSourceRow[]> {
  if (!UUID_RE.test(exerciseId)) return [];
  const { rows } = await getPool().query<ExerciseSourceRow>(
    `SELECT id, source_id, article_url, is_primary, excerpt
     FROM exercise_sources
     WHERE exercise_id = $1
     ORDER BY is_primary DESC, created_at ASC`,
    [exerciseId],
  );
  return rows;
}

export async function listLinkedEvents(exerciseId: string): Promise<LinkedEvent[]> {
  if (!UUID_RE.test(exerciseId)) return [];
  const { rows } = await getPool().query<LinkedEvent>(
    `SELECT event_id, headline, event_date, review_status
     FROM events
     WHERE exercise_id = $1
     ORDER BY event_date ASC, created_at ASC`,
    [exerciseId],
  );
  return rows;
}

/** Published events not linked to any exercise, for the link picker. */
export async function listLinkableEvents(): Promise<LinkedEvent[]> {
  const { rows } = await getPool().query<LinkedEvent>(
    `SELECT event_id, headline, event_date, review_status
     FROM events
     WHERE review_status = 'PUBLISHED' AND exercise_id IS NULL
     ORDER BY event_date DESC, created_at DESC`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type Client = import("pg").PoolClient;

function exerciseParams(x: ExerciseWritePayload["exercise"]) {
  return [
    x.exercise_name,
    x.actor,
    x.countries,
    x.location,
    x.participating_units,
    x.estimated_personnel,
    x.equipment,
    toDateParam(x.announced_start_date),
    toDateParam(x.announced_end_date),
    toDateParam(x.observed_start_date),
    toDateParam(x.observed_end_date),
    x.exercise_status,
    x.exercise_objectives,
    x.post_exercise_reset,
    x.personnel_return_status,
    x.equipment_return_status,
    x.infrastructure_status,
    x.follow_on_activity,
    x.summary,
    x.review_status,
  ];
}

async function replaceExerciseSources(
  client: Client,
  exerciseId: string,
  sources: ExerciseWritePayload["sources"],
) {
  await client.query(`DELETE FROM exercise_sources WHERE exercise_id = $1`, [exerciseId]);
  for (const row of sources) {
    await client.query(
      `INSERT INTO exercise_sources (exercise_id, source_id, article_url, is_primary, excerpt)
       VALUES ($1, $2, $3, $4, $5)`,
      [exerciseId, row.source_id, row.article_url, row.is_primary, optionalText(row.excerpt)],
    );
  }
}

/** Snapshot stored in exercise_actions.previous_values. */
function exerciseToAuditJson(x: Exercise, sources: ExerciseSourceRow[]) {
  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    exercise_name: x.exercise_name,
    actor: x.actor,
    countries: x.countries,
    location: x.location,
    participating_units: x.participating_units,
    estimated_personnel: x.estimated_personnel,
    equipment: x.equipment,
    announced_start_date: date(x.announced_start_date),
    announced_end_date: date(x.announced_end_date),
    observed_start_date: date(x.observed_start_date),
    observed_end_date: date(x.observed_end_date),
    exercise_status: x.exercise_status,
    exercise_objectives: x.exercise_objectives,
    post_exercise_reset: x.post_exercise_reset,
    personnel_return_status: x.personnel_return_status,
    equipment_return_status: x.equipment_return_status,
    infrastructure_status: x.infrastructure_status,
    follow_on_activity: x.follow_on_activity,
    summary: x.summary,
    review_status: x.review_status,
    sources: sources.map((s) => ({
      source_id: s.source_id,
      article_url: s.article_url,
      is_primary: s.is_primary,
      excerpt: s.excerpt,
    })),
  };
}

/** Inserts the exercise, its sources and the CREATE audit row; the caller owns the transaction. */
export async function insertExerciseInTransaction(
  client: Client,
  payload: ExerciseWritePayload,
  reviewer: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO exercises (
       exercise_name, actor, countries, location, participating_units, estimated_personnel,
       equipment, announced_start_date, announced_end_date, observed_start_date,
       observed_end_date, exercise_status, exercise_objectives, post_exercise_reset,
       personnel_return_status, equipment_return_status, infrastructure_status,
       follow_on_activity, summary, review_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING id`,
    exerciseParams(payload.exercise),
  );
  const id = rows[0].id;
  await replaceExerciseSources(client, id, payload.sources);
  await client.query(
    `INSERT INTO exercise_actions (exercise_id, action, reviewer, source_ids)
     VALUES ($1, 'CREATE', $2, $3)`,
    [id, reviewer, [...new Set(payload.sources.map((s) => s.source_id))]],
  );
  return id;
}

/** Updates the exercise and its sources and logs EDIT with the prior values. */
export async function updateExerciseInTransaction(
  client: Client,
  id: string,
  payload: ExerciseWritePayload,
  reviewer: string,
): Promise<boolean> {
  const { rows } = await client.query<Exercise>(
    `SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const before = rows[0];
  if (!before) return false;
  const { rows: beforeSources } = await client.query<ExerciseSourceRow>(
    `SELECT id, source_id, article_url, is_primary, excerpt
     FROM exercise_sources WHERE exercise_id = $1 ORDER BY is_primary DESC, created_at ASC`,
    [id],
  );

  await client.query(
    `UPDATE exercises SET
       exercise_name = $1, actor = $2, countries = $3, location = $4,
       participating_units = $5, estimated_personnel = $6, equipment = $7,
       announced_start_date = $8, announced_end_date = $9, observed_start_date = $10,
       observed_end_date = $11, exercise_status = $12, exercise_objectives = $13,
       post_exercise_reset = $14, personnel_return_status = $15,
       equipment_return_status = $16, infrastructure_status = $17,
       follow_on_activity = $18, summary = $19, review_status = $20
     WHERE id = $21`,
    [...exerciseParams(payload.exercise), id],
  );
  await replaceExerciseSources(client, id, payload.sources);
  await client.query(
    `INSERT INTO exercise_actions (exercise_id, action, reviewer, source_ids, previous_values)
     VALUES ($1, 'EDIT', $2, $3, $4)`,
    [
      id,
      reviewer,
      [...new Set(beforeSources.map((s) => s.source_id))],
      JSON.stringify(exerciseToAuditJson(before, beforeSources)),
    ],
  );
  return true;
}

async function inTransaction<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createExercise(payload: ExerciseWritePayload, reviewer: string): Promise<string> {
  return inTransaction((client) => insertExerciseInTransaction(client, payload, reviewer));
}

export function updateExercise(
  id: string,
  payload: ExerciseWritePayload,
  reviewer: string,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return Promise.resolve(false);
  return inTransaction((client) => updateExerciseInTransaction(client, id, payload, reviewer));
}

/**
 * Links and unlinks events. Each changed event gets an EDIT row in review_actions, as an
 * event edit would. Unlinking the last reset evidence is refused here and by the
 * 0007 trigger.
 */
export async function updateExerciseLinks(
  exerciseId: string,
  linkIds: string[],
  unlinkIds: string[],
  reviewer: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const exercise = await getExercise(exerciseId);
  if (!exercise) return { ok: false, error: "Exercise not found." };
  if ([...linkIds, ...unlinkIds].some((id) => !UUID_RE.test(id))) {
    return { ok: false, error: "Invalid event id." };
  }

  const [linked, sources] = await Promise.all([
    listLinkedEvents(exerciseId),
    listExerciseSources(exerciseId),
  ]);
  if (hasNonUnknownReset(exercise)) {
    const remaining = linked.filter((e) => !unlinkIds.includes(e.event_id));
    const evidenceAfter = hasResetEvidence({
      sources,
      linkedEvents: remaining,
      observed_end_date: exercise.observed_end_date,
      announced_end_date: exercise.announced_end_date,
    });
    // Linking more events never removes evidence, so only unlinks can fail.
    if (!evidenceAfter && unlinkIds.length > 0) {
      return { ok: false, error: lastEvidenceError(exercise.exercise_name) };
    }
  }

  for (const eventId of linkIds) {
    const event = await getEvent(eventId);
    if (!event) return { ok: false, error: "Event not found." };
    if (event.review_status !== "PUBLISHED") {
      return { ok: false, error: "Only published events can be linked." };
    }
    if (event.exercise_id && event.exercise_id !== exerciseId) {
      return { ok: false, error: `"${event.headline}" is already linked to another exercise.` };
    }
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [eventId, target] of [
      ...linkIds.map((id) => [id, exerciseId] as const),
      ...unlinkIds.map((id) => [id, null] as const),
    ]) {
      const before = await getEvent(eventId);
      if (!before || before.exercise_id === target) continue;
      if (target === null && before.exercise_id !== exerciseId) continue;
      await logEditReviewAction(before, reviewer, client);
      await client.query(`UPDATE events SET exercise_id = $1 WHERE event_id = $2`, [
        target,
        eventId,
      ]);
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
