import "server-only";
import { getPool } from "@/lib/db";
import {
  CONFIDENCE_LEVEL_VALUES,
  DIMENSION_STATUS_VALUES,
  EVENT_TYPE_VALUES,
  EXERCISE_STATUS_VALUES,
  LOCATION_PRECISION_VALUES,
  RESET_STATUS_VALUES,
  SOURCE_RELATIONSHIP_VALUES,
  type ConfidenceLevel,
  type DimensionStatus,
  type EventType,
  type ExerciseStatus,
  type LocationPrecision,
  type ResetStatus,
  type ReviewStatus,
  type SourceRelationship,
} from "@/lib/event-labels";
import type { Reliability, SourceType } from "@/lib/source-labels";
import { getSource, type Source } from "@/lib/sources";

export type Event = {
  event_id: string;
  event_date: Date;
  reported_date: Date | null;
  headline: string;
  summary: string | null;
  actor: string | null;
  country: string | null;
  region: string | null;
  location_name: string | null;
  location_precision: LocationPrecision | null;
  latitude: number | null;
  longitude: number | null;
  event_type: EventType;
  event_subtype: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
  exercise_status: ExerciseStatus | null;
  unit_name: string | null;
  unit_type: string | null;
  unit_home_location: string | null;
  personnel_estimate: string | null;
  equipment_type: string | null;
  equipment_quantity: string | null;
  activity_description: string | null;
  source_name: string | null;
  source_url: string | null;
  source_type: SourceType | null;
  source_country: string | null;
  source_language: string | null;
  source_reliability: Reliability | null;
  confidence_level: ConfidenceLevel;
  first_reported: Date | null;
  last_updated: Date | null;
  announced_start_date: Date | null;
  announced_end_date: Date | null;
  observed_start_date: Date | null;
  observed_end_date: Date | null;
  personnel_return_status: DimensionStatus | null;
  equipment_return_status: DimensionStatus | null;
  infrastructure_status: DimensionStatus | null;
  follow_on_activity: string | null;
  overall_reset_status: ResetStatus | null;
  historical_analogue: string | null;
  historical_notes: string | null;
  ai_generated_summary: string | null;
  human_reviewed: boolean;
  review_status: ReviewStatus;
  contradiction_flag: boolean;
  contradiction_notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export type EventListItem = Pick<
  Event,
  "event_id" | "headline" | "event_date" | "event_type" | "review_status" | "updated_at"
>;

export type EventSourceRow = {
  id: string;
  source_id: string;
  article_url: string;
  relationship: SourceRelationship;
  is_primary: boolean;
  excerpt: string | null;
};

export type EventSourceFormRow = {
  source_id: string;
  article_url: string;
  relationship: SourceRelationship;
  excerpt: string;
};

/** Editable event columns (excludes denormalized source_* and generated fields). */
export const EVENT_FORM_FIELDS = [
  "event_date",
  "reported_date",
  "headline",
  "summary",
  "actor",
  "country",
  "region",
  "location_name",
  "location_precision",
  "latitude",
  "longitude",
  "event_type",
  "event_subtype",
  "exercise_id",
  "exercise_name",
  "exercise_status",
  "unit_name",
  "unit_type",
  "unit_home_location",
  "personnel_estimate",
  "equipment_type",
  "equipment_quantity",
  "activity_description",
  "confidence_level",
  "first_reported",
  "last_updated",
  "announced_start_date",
  "announced_end_date",
  "observed_start_date",
  "observed_end_date",
  "personnel_return_status",
  "equipment_return_status",
  "infrastructure_status",
  "follow_on_activity",
  "overall_reset_status",
  "historical_analogue",
  "historical_notes",
  "ai_generated_summary",
  "human_reviewed",
  "contradiction_flag",
  "contradiction_notes",
  "review_status",
] as const;

export type EventField = (typeof EVENT_FORM_FIELDS)[number];

export type EventFormValues = Record<EventField, string>;

export type EventFormErrors = Partial<Record<EventField | `es_${number}_${string}`, string>>;

export type EventWritePayload = {
  event: Omit<
    Event,
    "event_id" | "created_at" | "updated_at" | "review_status"
  > & { review_status?: ReviewStatus };
  sources: Array<EventSourceFormRow & { is_primary: boolean }>;
};

export type EventValidationResult =
  | { ok: true; payload: EventWritePayload }
  | { ok: false; errors: EventFormErrors };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_COLUMNS = `
  event_id, event_date, reported_date, headline, summary, actor, country, region,
  location_name, location_precision, latitude, longitude, event_type, event_subtype,
  exercise_id, exercise_name, exercise_status, unit_name, unit_type, unit_home_location,
  personnel_estimate, equipment_type, equipment_quantity, activity_description,
  source_name, source_url, source_type, source_country, source_language, source_reliability,
  confidence_level, first_reported, last_updated, announced_start_date, announced_end_date,
  observed_start_date, observed_end_date, personnel_return_status, equipment_return_status,
  infrastructure_status, follow_on_activity, overall_reset_status, historical_analogue,
  historical_notes, ai_generated_summary, human_reviewed, review_status, contradiction_flag,
  contradiction_notes, created_at, updated_at
`;

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseDateField(value: string, field: string, errors: EventFormErrors): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    errors[field as EventField] = "Use YYYY-MM-DD.";
    return null;
  }
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    errors[field as EventField] = "Invalid date.";
    return null;
  }
  return d;
}

function parseDateTimeField(
  value: string,
  field: string,
  errors: EventFormErrors,
): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    errors[field as EventField] = "Invalid date and time.";
    return null;
  }
  return d;
}

function parseOptionalEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: EventField,
  errors: EventFormErrors,
): T | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!allowed.includes(trimmed as T)) {
    errors[field] = "Choose a valid option.";
    return null;
  }
  return trimmed as T;
}

function sourceRowIndices(formData: FormData): number[] {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^es_(\d+)_source_id$/);
    if (match) indices.add(Number(match[1]));
  }
  return [...indices].sort((a, b) => a - b);
}

export function emptyEventFormValues(): EventFormValues {
  return {
    event_date: "",
    reported_date: "",
    headline: "",
    summary: "",
    actor: "",
    country: "",
    region: "",
    location_name: "",
    location_precision: "",
    latitude: "",
    longitude: "",
    event_type: "TROOP_MOVEMENT",
    event_subtype: "",
    exercise_id: "",
    exercise_name: "",
    exercise_status: "",
    unit_name: "",
    unit_type: "",
    unit_home_location: "",
    personnel_estimate: "",
    equipment_type: "",
    equipment_quantity: "",
    activity_description: "",
    confidence_level: "UNVERIFIED",
    first_reported: "",
    last_updated: "",
    announced_start_date: "",
    announced_end_date: "",
    observed_start_date: "",
    observed_end_date: "",
    personnel_return_status: "",
    equipment_return_status: "",
    infrastructure_status: "",
    follow_on_activity: "",
    overall_reset_status: "",
    historical_analogue: "",
    historical_notes: "",
    ai_generated_summary: "",
    human_reviewed: "",
    contradiction_flag: "",
    contradiction_notes: "",
    review_status: "DRAFT",
  };
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateTimeLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function eventFormValuesFromEvent(event: Event): EventFormValues {
  return {
    event_date: formatDate(event.event_date),
    reported_date: formatDate(event.reported_date),
    headline: event.headline,
    summary: event.summary ?? "",
    actor: event.actor ?? "",
    country: event.country ?? "",
    region: event.region ?? "",
    location_name: event.location_name ?? "",
    location_precision: event.location_precision ?? "",
    latitude: event.latitude === null ? "" : String(event.latitude),
    longitude: event.longitude === null ? "" : String(event.longitude),
    event_type: event.event_type,
    event_subtype: event.event_subtype ?? "",
    exercise_id: event.exercise_id ?? "",
    exercise_name: event.exercise_name ?? "",
    exercise_status: event.exercise_status ?? "",
    unit_name: event.unit_name ?? "",
    unit_type: event.unit_type ?? "",
    unit_home_location: event.unit_home_location ?? "",
    personnel_estimate: event.personnel_estimate ?? "",
    equipment_type: event.equipment_type ?? "",
    equipment_quantity: event.equipment_quantity ?? "",
    activity_description: event.activity_description ?? "",
    confidence_level: event.confidence_level,
    first_reported: formatDateTimeLocal(event.first_reported),
    last_updated: formatDateTimeLocal(event.last_updated),
    announced_start_date: formatDate(event.announced_start_date),
    announced_end_date: formatDate(event.announced_end_date),
    observed_start_date: formatDate(event.observed_start_date),
    observed_end_date: formatDate(event.observed_end_date),
    personnel_return_status: event.personnel_return_status ?? "",
    equipment_return_status: event.equipment_return_status ?? "",
    infrastructure_status: event.infrastructure_status ?? "",
    follow_on_activity: event.follow_on_activity ?? "",
    overall_reset_status: event.overall_reset_status ?? "",
    historical_analogue: event.historical_analogue ?? "",
    historical_notes: event.historical_notes ?? "",
    ai_generated_summary: event.ai_generated_summary ?? "",
    human_reviewed: event.human_reviewed ? "true" : "",
    contradiction_flag: event.contradiction_flag ? "true" : "",
    contradiction_notes: event.contradiction_notes ?? "",
    review_status: event.review_status,
  };
}

export function eventSourceRowsFromFormData(formData: FormData): EventSourceFormRow[] {
  return sourceRowIndices(formData).map((index) => ({
    source_id: String(formData.get(`es_${index}_source_id`) ?? ""),
    article_url: String(formData.get(`es_${index}_article_url`) ?? ""),
    relationship: String(
      formData.get(`es_${index}_relationship`) ?? "SUPPORTS",
    ) as SourceRelationship,
    excerpt: String(formData.get(`es_${index}_excerpt`) ?? ""),
  }));
}

export function eventFormValuesFrom(formData: FormData): EventFormValues {
  const values = emptyEventFormValues();
  for (const field of EVENT_FORM_FIELDS) {
    if (field === "human_reviewed") {
      values[field] = String(formData.get(field) ?? "") === "true" ? "true" : "";
    } else if (field === "contradiction_flag") {
      values[field] = formData.get(field) === "on" ? "true" : "";
    } else {
      values[field] = String(formData.get(field) ?? "");
    }
  }
  return values;
}

export async function validateEventForm(
  formData: FormData,
  options: { preserveReviewStatus?: ReviewStatus; humanReviewed: boolean },
): Promise<EventValidationResult> {
  const errors: EventFormErrors = {};
  const values = eventFormValuesFrom(formData);
  const sourceRows = eventSourceRowsFromFormData(formData);
  const primaryIndexRaw = String(formData.get("es_primary_index") ?? "");
  const primaryIndex =
    primaryIndexRaw === "" ? -1 : Number.parseInt(primaryIndexRaw, 10);

  const event_date = parseDateField(values.event_date, "event_date", errors);
  if (!values.event_date.trim()) errors.event_date = "Event date is required.";

  const reported_date = parseDateField(values.reported_date, "reported_date", errors);

  const headline = values.headline.trim();
  if (!headline) errors.headline = "Headline is required.";
  else if (headline.length > 500) errors.headline = "Keep the headline under 500 characters.";

  if (!EVENT_TYPE_VALUES.includes(values.event_type as EventType)) {
    errors.event_type = "Choose an event type.";
  }

  if (!CONFIDENCE_LEVEL_VALUES.includes(values.confidence_level as ConfidenceLevel)) {
    errors.confidence_level = "Choose a confidence level.";
  }

  const location_precision = parseOptionalEnum(
    values.location_precision,
    LOCATION_PRECISION_VALUES,
    "location_precision",
    errors,
  );
  const exercise_status = parseOptionalEnum(
    values.exercise_status,
    EXERCISE_STATUS_VALUES,
    "exercise_status",
    errors,
  );
  const personnel_return_status = parseOptionalEnum(
    values.personnel_return_status,
    DIMENSION_STATUS_VALUES,
    "personnel_return_status",
    errors,
  );
  const equipment_return_status = parseOptionalEnum(
    values.equipment_return_status,
    DIMENSION_STATUS_VALUES,
    "equipment_return_status",
    errors,
  );
  const infrastructure_status = parseOptionalEnum(
    values.infrastructure_status,
    DIMENSION_STATUS_VALUES,
    "infrastructure_status",
    errors,
  );
  const overall_reset_status = parseOptionalEnum(
    values.overall_reset_status,
    RESET_STATUS_VALUES,
    "overall_reset_status",
    errors,
  );

  let latitude: number | null = null;
  let longitude: number | null = null;
  const latRaw = values.latitude.trim();
  const lonRaw = values.longitude.trim();
  if (latRaw || lonRaw) {
    if (!latRaw || !lonRaw) {
      errors.latitude = "Enter both latitude and longitude, or leave both empty.";
      errors.longitude = errors.latitude;
    } else {
      latitude = Number(latRaw);
      longitude = Number(lonRaw);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        errors.latitude = "Latitude must be between -90 and 90.";
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        errors.longitude = "Longitude must be between -180 and 180.";
      }
    }
  }

  let exercise_id: string | null = optionalText(values.exercise_id);
  if (exercise_id && !UUID_RE.test(exercise_id)) {
    errors.exercise_id = "Choose a valid exercise.";
    exercise_id = null;
  }

  const announced_start_date = parseDateField(
    values.announced_start_date,
    "announced_start_date",
    errors,
  );
  const announced_end_date = parseDateField(
    values.announced_end_date,
    "announced_end_date",
    errors,
  );
  const observed_start_date = parseDateField(
    values.observed_start_date,
    "observed_start_date",
    errors,
  );
  const observed_end_date = parseDateField(
    values.observed_end_date,
    "observed_end_date",
    errors,
  );

  if (
    announced_start_date &&
    announced_end_date &&
    announced_end_date < announced_start_date
  ) {
    errors.announced_end_date = "End date must be on or after start date.";
  }
  if (
    observed_start_date &&
    observed_end_date &&
    observed_end_date < observed_start_date
  ) {
    errors.observed_end_date = "End date must be on or after start date.";
  }

  const first_reported = parseDateTimeField(
    values.first_reported,
    "first_reported",
    errors,
  );
  const last_updated = parseDateTimeField(values.last_updated, "last_updated", errors);

  if (sourceRows.length === 0) {
    errors.es_0_source_id = "Attach at least one source.";
  }

  if (sourceRows.length > 0 && (Number.isNaN(primaryIndex) || primaryIndex < 0)) {
    errors.es_0_source_id = "Mark one source as primary.";
  }

  const resolvedSources: Array<EventSourceFormRow & { is_primary: boolean }> = [];
  const sourceCache = new Map<string, Source | null>();

  for (let i = 0; i < sourceRows.length; i++) {
    const row = sourceRows[i];
    const prefix = `es_${i}` as const;
    const source_id = row.source_id.trim();
    const article_url = row.article_url.trim();

    if (!source_id) {
      errors[`${prefix}_source_id`] = "Choose a source.";
      continue;
    }
    if (!UUID_RE.test(source_id)) {
      errors[`${prefix}_source_id`] = "Choose a valid source.";
      continue;
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

    if (!SOURCE_RELATIONSHIP_VALUES.includes(row.relationship)) {
      errors[`${prefix}_relationship`] = "Choose SUPPORTS or CONTRADICTS.";
    }

    const is_primary = i === primaryIndex;
    if (is_primary && row.relationship === "CONTRADICTS") {
      errors[`${prefix}_relationship`] = "A contradicting source cannot be primary.";
    }

    let source = sourceCache.get(source_id);
    if (source === undefined) {
      source = await getSource(source_id);
      sourceCache.set(source_id, source);
    }
    if (!source) {
      errors[`${prefix}_source_id`] = "Source not found.";
    }

    resolvedSources.push({
      ...row,
      source_id,
      article_url,
      excerpt: row.excerpt,
      is_primary,
    });
  }

  const primaryCount = resolvedSources.filter((r) => r.is_primary).length;
  if (sourceRows.length > 0 && primaryCount !== 1) {
    errors.es_0_source_id = "Exactly one source must be marked primary.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const primaryRow = resolvedSources.find((r) => r.is_primary)!;
  const primarySource = (await getSource(primaryRow.source_id))!;

  const review_status = options.preserveReviewStatus ?? "DRAFT";

  const payload: EventWritePayload = {
    event: {
      event_date: event_date!,
      reported_date,
      headline,
      summary: optionalText(values.summary),
      actor: optionalText(values.actor),
      country: optionalText(values.country),
      region: optionalText(values.region),
      location_name: optionalText(values.location_name),
      location_precision,
      latitude,
      longitude,
      event_type: values.event_type as EventType,
      event_subtype: optionalText(values.event_subtype),
      exercise_id,
      exercise_name: optionalText(values.exercise_name),
      exercise_status,
      unit_name: optionalText(values.unit_name),
      unit_type: optionalText(values.unit_type),
      unit_home_location: optionalText(values.unit_home_location),
      personnel_estimate: optionalText(values.personnel_estimate),
      equipment_type: optionalText(values.equipment_type),
      equipment_quantity: optionalText(values.equipment_quantity),
      activity_description: optionalText(values.activity_description),
      source_name: primarySource.name,
      source_url: primaryRow.article_url,
      source_type: primarySource.source_type,
      source_country: primarySource.source_country,
      source_language: primarySource.source_language,
      source_reliability: primarySource.reliability,
      confidence_level: values.confidence_level as ConfidenceLevel,
      first_reported,
      last_updated,
      announced_start_date,
      announced_end_date,
      observed_start_date,
      observed_end_date,
      personnel_return_status,
      equipment_return_status,
      infrastructure_status,
      follow_on_activity: optionalText(values.follow_on_activity),
      overall_reset_status,
      historical_analogue: optionalText(values.historical_analogue),
      historical_notes: optionalText(values.historical_notes),
      ai_generated_summary: optionalText(values.ai_generated_summary),
      human_reviewed: options.humanReviewed,
      review_status,
      contradiction_flag: values.contradiction_flag === "true",
      contradiction_notes: optionalText(values.contradiction_notes),
    },
    sources: resolvedSources,
  };

  return { ok: true, payload };
}

function eventInsertParams(
  event: EventWritePayload["event"],
  review_status: ReviewStatus,
) {
  return [
    event.event_date,
    event.reported_date,
    event.headline,
    event.summary,
    event.actor,
    event.country,
    event.region,
    event.location_name,
    event.location_precision,
    event.latitude,
    event.longitude,
    event.event_type,
    event.event_subtype,
    event.exercise_id,
    event.exercise_name,
    event.exercise_status,
    event.unit_name,
    event.unit_type,
    event.unit_home_location,
    event.personnel_estimate,
    event.equipment_type,
    event.equipment_quantity,
    event.activity_description,
    event.source_name,
    event.source_url,
    event.source_type,
    event.source_country,
    event.source_language,
    event.source_reliability,
    event.confidence_level,
    event.first_reported,
    event.last_updated,
    event.announced_start_date,
    event.announced_end_date,
    event.observed_start_date,
    event.observed_end_date,
    event.personnel_return_status,
    event.equipment_return_status,
    event.infrastructure_status,
    event.follow_on_activity,
    event.overall_reset_status,
    event.historical_analogue,
    event.historical_notes,
    event.ai_generated_summary,
    event.human_reviewed,
    review_status,
    event.contradiction_flag,
    event.contradiction_notes,
  ];
}

async function replaceEventSources(
  client: import("pg").PoolClient,
  eventId: string,
  sources: EventWritePayload["sources"],
) {
  await client.query(`DELETE FROM event_sources WHERE event_id = $1`, [eventId]);
  for (const row of sources) {
    await client.query(
      `INSERT INTO event_sources
         (event_id, source_id, article_url, relationship, is_primary, excerpt)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        eventId,
        row.source_id,
        row.article_url,
        row.relationship,
        row.is_primary,
        optionalText(row.excerpt),
      ],
    );
  }
}

export async function listEvents(): Promise<EventListItem[]> {
  const { rows } = await getPool().query<EventListItem>(
    `SELECT event_id, headline, event_date, event_type, review_status, updated_at
     FROM events
     ORDER BY event_date DESC, updated_at DESC`,
  );
  return rows;
}

export async function listExerciseOptions(): Promise<
  { id: string; exercise_name: string }[]
> {
  const { rows } = await getPool().query<{ id: string; exercise_name: string }>(
    `SELECT id, exercise_name FROM exercises ORDER BY lower(exercise_name) ASC`,
  );
  return rows;
}

export async function getEvent(id: string): Promise<Event | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<Event>(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE event_id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listEventSources(eventId: string): Promise<EventSourceRow[]> {
  if (!UUID_RE.test(eventId)) return [];
  const { rows } = await getPool().query<EventSourceRow>(
    `SELECT id, source_id, article_url, relationship, is_primary, excerpt
     FROM event_sources
     WHERE event_id = $1
     ORDER BY is_primary DESC, created_at ASC`,
    [eventId],
  );
  return rows;
}

export async function createEvent(payload: EventWritePayload): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ event_id: string }>(
      `INSERT INTO events (
         event_date, reported_date, headline, summary, actor, country, region,
         location_name, location_precision, latitude, longitude, event_type, event_subtype,
         exercise_id, exercise_name, exercise_status, unit_name, unit_type, unit_home_location,
         personnel_estimate, equipment_type, equipment_quantity, activity_description,
         source_name, source_url, source_type, source_country, source_language, source_reliability,
         confidence_level, first_reported, last_updated, announced_start_date, announced_end_date,
         observed_start_date, observed_end_date, personnel_return_status, equipment_return_status,
         infrastructure_status, follow_on_activity, overall_reset_status, historical_analogue,
         historical_notes, ai_generated_summary, human_reviewed, review_status, contradiction_flag,
         contradiction_notes
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
         $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48
       )
       RETURNING event_id`,
      eventInsertParams(payload.event, "DRAFT"),
    );
    const eventId = rows[0].event_id;
    await replaceEventSources(client, eventId, payload.sources);
    await client.query("COMMIT");
    return eventId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateEvent(
  id: string,
  payload: EventWritePayload,
  reviewStatus: ReviewStatus,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE events SET
         event_date = $1, reported_date = $2, headline = $3, summary = $4, actor = $5,
         country = $6, region = $7, location_name = $8, location_precision = $9,
         latitude = $10, longitude = $11, event_type = $12, event_subtype = $13,
         exercise_id = $14, exercise_name = $15, exercise_status = $16, unit_name = $17,
         unit_type = $18, unit_home_location = $19, personnel_estimate = $20,
         equipment_type = $21, equipment_quantity = $22, activity_description = $23,
         source_name = $24, source_url = $25, source_type = $26, source_country = $27,
         source_language = $28, source_reliability = $29, confidence_level = $30,
         first_reported = $31, last_updated = $32, announced_start_date = $33,
         announced_end_date = $34, observed_start_date = $35, observed_end_date = $36,
         personnel_return_status = $37, equipment_return_status = $38, infrastructure_status = $39,
         follow_on_activity = $40, overall_reset_status = $41, historical_analogue = $42,
         historical_notes = $43, ai_generated_summary = $44, human_reviewed = $45,
         review_status = $46, contradiction_flag = $47, contradiction_notes = $48
       WHERE event_id = $49`,
      [...eventInsertParams(payload.event, reviewStatus), id],
    );
    if (rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    await replaceEventSources(client, id, payload.sources);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
