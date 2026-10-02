import "server-only";
import { getPool } from "@/lib/db";
import {
  CONFIDENCE_LEVEL_VALUES,
  EVENT_TYPE_VALUES,
  type ConfidenceLevel,
  type EventType,
  type SourceRelationship,
} from "@/lib/event-labels";
import type { Event } from "@/lib/events";
import { SOURCE_TYPE_VALUES, type SourceType } from "@/lib/source-labels";

/**
 * Public read path for events. Every query here is restricted to PUBLISHED
 * rows, and the column list leaves out admin-only fields (internal notes,
 * review state, AI summary) and raw coordinates (spec §60).
 */

const PUBLIC_EVENT_FIELDS = [
  "event_id",
  "event_date",
  "reported_date",
  "headline",
  "summary",
  "actor",
  "country",
  "region",
  "location_name",
  "location_precision",
  "event_type",
  "event_subtype",
  "exercise_name",
  "exercise_status",
  "unit_name",
  "unit_type",
  "unit_home_location",
  "personnel_estimate",
  "equipment_type",
  "equipment_quantity",
  "activity_description",
  "source_name",
  "source_url",
  "source_type",
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
  "contradiction_flag",
  "contradiction_notes",
] as const satisfies readonly (keyof Event)[];

export type PublicEvent = Pick<Event, (typeof PUBLIC_EVENT_FIELDS)[number]>;

export type PublicEventSource = {
  name: string;
  home_url: string | null;
  source_type: SourceType;
  source_country: string | null;
  tier: number | null;
  article_url: string;
  relationship: SourceRelationship;
  is_primary: boolean;
  excerpt: string | null;
};

const PUBLIC_EVENT_COLUMNS = PUBLIC_EVENT_FIELDS.join(", ");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FEED_LIMIT = 100;

export async function listPublishedEvents(
  limit: number = FEED_LIMIT,
): Promise<PublicEvent[]> {
  const { rows } = await getPool().query<PublicEvent>(
    `SELECT ${PUBLIC_EVENT_COLUMNS}
     FROM events
     WHERE review_status = 'PUBLISHED'
     ORDER BY event_date DESC, first_reported DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export const LATEST_WINDOW_HOURS = 48;

/**
 * /latest feed: published events from the last LATEST_WINDOW_HOURS. event_date has no
 * time, so this means dated on or after the UTC day the window starts (as in getSnapshotCounts).
 * Older events are browsed in the archive.
 */
export async function listRecentPublishedEvents(
  hours: number = LATEST_WINDOW_HOURS,
): Promise<PublicEvent[]> {
  const { rows } = await getPool().query<PublicEvent>(
    `SELECT ${PUBLIC_EVENT_COLUMNS}
     FROM events
     WHERE review_status = 'PUBLISHED'
       AND event_date >= ((now() AT TIME ZONE 'UTC') - make_interval(hours => $1))::date
     ORDER BY event_date DESC, first_reported DESC NULLS LAST, created_at DESC
     LIMIT $2`,
    [hours, FEED_LIMIT],
  );
  return rows;
}

/** Header "LAST UPDATE": newest updated_at among PUBLISHED events. */
export async function getLastPublishedUpdate(): Promise<Date | null> {
  const { rows } = await getPool().query<{ last: Date | null }>(
    `SELECT max(updated_at) AS last FROM events WHERE review_status = 'PUBLISHED'`,
  );
  return rows[0]?.last ?? null;
}

export type SnapshotCounts = {
  verifiedEvents: number;
  activeExercises: number;
  externalDeployments: number;
  borderIncidents: number;
};

/**
 * Homepage 24-hour snapshot (spec §12). event_date is a date with no time,
 * so "last 24 hours" means dated today or yesterday in UTC.
 */
export async function getSnapshotCounts(): Promise<SnapshotCounts> {
  const { rows } = await getPool().query<{
    verified: number;
    deployments: number;
    border: number;
    exercises: number;
  }>(
    `SELECT
       count(*)::int AS verified,
       count(*) FILTER (
         WHERE event_type IN ('RUSSIAN_DEPLOYMENT', 'BELARUSIAN_DEPLOYMENT')
       )::int AS deployments,
       count(*) FILTER (WHERE event_type = 'BORDER_INCIDENT')::int AS border,
       (SELECT count(*)::int FROM exercises WHERE exercise_status = 'ACTIVE') AS exercises
     FROM events
     WHERE review_status = 'PUBLISHED'
       AND event_date >= ((now() AT TIME ZONE 'UTC') - interval '24 hours')::date`,
  );
  const row = rows[0];
  return {
    verifiedEvents: row.verified,
    activeExercises: row.exercises,
    externalDeployments: row.deployments,
    borderIncidents: row.border,
  };
}

export async function getPublishedEvent(id: string): Promise<PublicEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<PublicEvent>(
    `SELECT ${PUBLIC_EVENT_COLUMNS}
     FROM events
     WHERE event_id = $1 AND review_status = 'PUBLISHED'`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPublicEventSources(
  eventId: string,
): Promise<PublicEventSource[]> {
  if (!UUID_RE.test(eventId)) return [];
  const { rows } = await getPool().query<PublicEventSource>(
    `SELECT s.name, s.home_url, s.source_type, s.source_country, s.tier,
            es.article_url, es.relationship, es.is_primary, es.excerpt
     FROM event_sources es
     JOIN events e ON e.event_id = es.event_id
     JOIN sources s ON s.id = es.source_id
     WHERE es.event_id = $1 AND e.review_status = 'PUBLISHED'
     ORDER BY es.is_primary DESC, es.relationship ASC, es.created_at ASC`,
    [eventId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Archive (step 1.9)
// ---------------------------------------------------------------------------

export const ARCHIVE_PAGE_SIZE = 25;

export type ArchiveFilters = {
  from?: string;
  to?: string;
  country?: string;
  actor?: string;
  type?: EventType;
  confidence?: ConfidenceLevel;
  source_type?: SourceType;
};

type SearchParams = Record<string, string | string[] | undefined>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function firstParam(params: SearchParams, key: string): string {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Reads archive filters from the query string; unknown or malformed values are ignored. */
export function parseArchiveFilters(params: SearchParams): {
  filters: ArchiveFilters;
  page: number;
} {
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const country = firstParam(params, "country");
  const actor = firstParam(params, "actor");
  const pageRaw = Number.parseInt(firstParam(params, "page"), 10);

  return {
    filters: {
      from: isRealDate(from) ? from : undefined,
      to: isRealDate(to) ? to : undefined,
      country: country || undefined,
      actor: actor || undefined,
      type: oneOf(firstParam(params, "type"), EVENT_TYPE_VALUES),
      confidence: oneOf(firstParam(params, "confidence"), CONFIDENCE_LEVEL_VALUES),
      source_type: oneOf(firstParam(params, "source_type"), SOURCE_TYPE_VALUES),
    },
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
  };
}

/** Query string for the given filters (and page, when past the first). */
export function archiveQueryString(filters: ArchiveFilters, page = 1): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) qs.set(key, value);
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function archiveWhere(filters: ArchiveFilters): { sql: string; values: unknown[] } {
  const clauses = ["review_status = 'PUBLISHED'"];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };

  if (filters.from) add("event_date >= ?::date", filters.from);
  if (filters.to) add("event_date <= ?::date", filters.to);
  if (filters.country) add("country = ?", filters.country);
  if (filters.actor) add("actor = ?", filters.actor);
  if (filters.type) add("event_type = ?", filters.type);
  if (filters.confidence) add("confidence_level = ?", filters.confidence);
  if (filters.source_type) add("source_type = ?", filters.source_type);

  return { sql: clauses.join(" AND "), values };
}

export async function listArchiveEvents(
  filters: ArchiveFilters,
  page: number,
): Promise<{ events: PublicEvent[]; total: number }> {
  const where = archiveWhere(filters);
  const pool = getPool();
  const offset = (page - 1) * ARCHIVE_PAGE_SIZE;

  const [list, count] = await Promise.all([
    pool.query<PublicEvent>(
      `SELECT ${PUBLIC_EVENT_COLUMNS}
       FROM events
       WHERE ${where.sql}
       ORDER BY event_date DESC, first_reported DESC NULLS LAST, created_at DESC
       LIMIT ${ARCHIVE_PAGE_SIZE} OFFSET $${where.values.length + 1}`,
      [...where.values, offset],
    ),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM events WHERE ${where.sql}`,
      where.values,
    ),
  ]);

  return { events: list.rows, total: count.rows[0].total };
}

/** Distinct country and actor values among published events, for the filter dropdowns. */
export async function listArchiveFilterOptions(): Promise<{
  countries: string[];
  actors: string[];
}> {
  const pool = getPool();
  const distinct = (column: "country" | "actor") =>
    pool.query<{ value: string }>(
      `SELECT DISTINCT ${column} AS value
       FROM events
       WHERE review_status = 'PUBLISHED' AND ${column} IS NOT NULL AND ${column} <> ''
       ORDER BY value`,
    );
  const [countries, actors] = await Promise.all([distinct("country"), distinct("actor")]);
  return {
    countries: countries.rows.map((r) => r.value),
    actors: actors.rows.map((r) => r.value),
  };
}
