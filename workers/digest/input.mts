/**
 * The digest's event input (step 2 of generate.mts), in its own module so tests can run it
 * against a transaction without starting the generator.
 */
import type { QueryResult, QueryResultRow } from "pg";
import type { ConfidenceLevel, EventType } from "@/lib/event-labels";

export type Queryable = {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
};

export type DigestEventRow = {
  event_id: string;
  headline: string;
  summary: string | null;
  event_date: string;
  event_type: EventType;
  actor: string | null;
  country: string | null;
  location_name: string | null;
  confidence_level: ConfidenceLevel;
  contradiction_flag: boolean;
};

/** PUBLISHED events for the day, with only the approved fields. */
export async function loadDigestEvents(db: Queryable, date: string): Promise<DigestEventRow[]> {
  const { rows } = await db.query<DigestEventRow>(
    `SELECT event_id, headline, summary, event_date::text AS event_date, event_type, actor, country,
            location_name, confidence_level, contradiction_flag
     FROM events
     WHERE review_status = 'PUBLISHED' AND event_date = $1::date
     ORDER BY created_at, event_id`,
    [date],
  );
  return rows;
}
