import "server-only";
import { getPool } from "@/lib/db";
import type { SourceRelationship } from "@/lib/event-labels";
import type { Event } from "@/lib/events";
import type { SourceType } from "@/lib/source-labels";

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
