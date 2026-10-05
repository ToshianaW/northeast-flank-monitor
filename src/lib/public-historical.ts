import "server-only";
import { getPool } from "@/lib/db";
import type { ConfidenceLevel, EventType, SourceRelationship } from "@/lib/event-labels";
import {
  lastDayOf,
  monthsBetween,
  type HistoricalCoverage,
  type TypeMonthCount,
  type HistoricalPeriod,
} from "@/lib/historical-rules";
import type { SourceType } from "@/lib/source-labels";

/**
 * Public read path for the historical dataset. PUBLISHED rows only, and only public columns:
 * never phase_tag or internal_notes (and the historical tables hold no coordinates).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_COLUMNS = `event_id, event_date, reported_date, headline, summary, actor, country, region,
  location_name, location_precision, event_type, event_subtype, exercise_name, exercise_status,
  unit_name, unit_type, unit_home_location, personnel_estimate, equipment_type, equipment_quantity,
  activity_description, source_name, confidence_level, announced_start_date, announced_end_date,
  observed_start_date, observed_end_date, personnel_return_status, equipment_return_status,
  infrastructure_status, overall_reset_status, follow_on_activity, contradiction_flag, contradiction_notes`;

export type PublicHistoricalEvent = {
  event_id: string;
  event_date: Date;
  reported_date: Date | null;
  headline: string;
  summary: string | null;
  actor: string | null;
  country: string | null;
  region: string | null;
  location_name: string | null;
  location_precision: string | null;
  event_type: EventType;
  event_subtype: string | null;
  exercise_name: string | null;
  exercise_status: string | null;
  unit_name: string | null;
  unit_type: string | null;
  unit_home_location: string | null;
  personnel_estimate: string | null;
  equipment_type: string | null;
  equipment_quantity: string | null;
  activity_description: string | null;
  source_name: string | null;
  confidence_level: ConfidenceLevel;
  announced_start_date: Date | null;
  announced_end_date: Date | null;
  observed_start_date: Date | null;
  observed_end_date: Date | null;
  personnel_return_status: string | null;
  equipment_return_status: string | null;
  infrastructure_status: string | null;
  overall_reset_status: string | null;
  follow_on_activity: string | null;
  contradiction_flag: boolean;
  contradiction_notes: string | null;
};

export type PublicHistoricalSource = {
  name: string;
  home_url: string | null;
  source_type: SourceType;
  source_country: string | null;
  tier: number | null;
  article_url: string;
  archived_url: string | null;
  accessed_at: Date;
  relationship: SourceRelationship;
  is_primary: boolean;
  excerpt: string;
};

export async function listPublishedHistorical(period: HistoricalPeriod): Promise<PublicHistoricalEvent[]> {
  const { rows } = await getPool().query<PublicHistoricalEvent>(
    `SELECT ${PUBLIC_COLUMNS} FROM historical_events
     WHERE review_status = 'PUBLISHED' AND event_date BETWEEN $1::date AND $2::date
     ORDER BY event_date ASC, created_at ASC`,
    [`${period.from}-01`, lastDayOf(period.to)],
  );
  return rows;
}

export async function getPublishedHistorical(id: string): Promise<PublicHistoricalEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<PublicHistoricalEvent>(
    `SELECT ${PUBLIC_COLUMNS} FROM historical_events WHERE event_id = $1 AND review_status = 'PUBLISHED'`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPublicHistoricalSources(id: string): Promise<PublicHistoricalSource[]> {
  if (!UUID_RE.test(id)) return [];
  const { rows } = await getPool().query<PublicHistoricalSource>(
    `SELECT s.name, s.home_url, s.source_type, s.source_country, s.tier,
            hs.article_url, hs.archived_url, hs.accessed_at, hs.relationship, hs.is_primary, hs.excerpt
     FROM historical_event_sources hs
     JOIN sources s ON s.id = hs.source_id
     JOIN historical_events h ON h.event_id = hs.event_id
     WHERE hs.event_id = $1 AND h.review_status = 'PUBLISHED'
     ORDER BY hs.is_primary DESC, hs.relationship ASC, s.tier ASC NULLS LAST, lower(s.name)`,
    [id],
  );
  return rows;
}

/** Published events and distinct sources in the period, with a count for every month. */
export async function getHistoricalCoverage(period: HistoricalPeriod): Promise<HistoricalCoverage> {
  const from = `${period.from}-01`;
  const to = lastDayOf(period.to);
  const [months, totals] = await Promise.all([
    getPool().query<{ month: string; n: number }>(
      `SELECT to_char(event_date, 'YYYY-MM') AS month, count(*)::int AS n
       FROM historical_events
       WHERE review_status = 'PUBLISHED' AND event_date BETWEEN $1::date AND $2::date
       GROUP BY 1`,
      [from, to],
    ),
    getPool().query<{ events: number; sources: number }>(
      `SELECT count(DISTINCT h.event_id)::int AS events, count(DISTINCT hs.source_id)::int AS sources
       FROM historical_events h
       LEFT JOIN historical_event_sources hs ON hs.event_id = h.event_id
       WHERE h.review_status = 'PUBLISHED' AND h.event_date BETWEEN $1::date AND $2::date`,
      [from, to],
    ),
  ]);
  const byMonth = new Map(months.rows.map((r) => [r.month, r.n]));
  return {
    events: totals.rows[0]?.events ?? 0,
    sources: totals.rows[0]?.sources ?? 0,
    months: monthsBetween(period.from, period.to).map((month) => ({ month, events: byMonth.get(month) ?? 0 })),
  };
}

/** Published counts per event type and month (YYYY-MM). */
export async function getTypeMonthCounts(): Promise<TypeMonthCount[]> {
  const { rows } = await getPool().query<TypeMonthCount>(
    `SELECT event_type, to_char(event_date, 'YYYY-MM') AS month, count(*)::int AS n
     FROM historical_events
     WHERE review_status = 'PUBLISHED'
     GROUP BY 1, 2`,
  );
  return rows;
}

/** Published events of one type in one month (YYYY-MM), oldest first. */
export async function listPublishedByTypeMonth(type: EventType, month: string): Promise<PublicHistoricalEvent[]> {
  const { rows } = await getPool().query<PublicHistoricalEvent>(
    `SELECT ${PUBLIC_COLUMNS} FROM historical_events
     WHERE review_status = 'PUBLISHED' AND event_type = $1 AND event_date BETWEEN $2::date AND $3::date
     ORDER BY event_date ASC, created_at ASC`,
    [type, `${month}-01`, lastDayOf(month)],
  );
  return rows;
}

/** Sitemap: id and last change of every PUBLISHED historical event, newest change first. */
export async function listPublishedHistoricalForSitemap(
  limit: number,
): Promise<Array<{ event_id: string; updated_at: Date }>> {
  const { rows } = await getPool().query<{ event_id: string; updated_at: Date }>(
    `SELECT event_id, updated_at FROM historical_events
     WHERE review_status = 'PUBLISHED'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
