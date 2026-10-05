import "server-only";
import { getPool } from "@/lib/db";
import { isStatementType, type EventType } from "@/lib/event-labels";
import { loadTheaterGeo, TIER4_HOLD_HOURS } from "@/lib/map-data";
import {
  encodeCursor,
  toOutputEvent,
  type AreaId,
  type OutputEvent,
  type Query,
} from "@/lib/open-data";
import { placeEvent, type RegionFeatureCollection } from "@/lib/placement";
import { PUBLIC_EVENT_COLUMNS } from "@/lib/public-events";
import { isStateOfficialSource, isTier4OnlySupport, type SourceType } from "@/lib/source-labels";

/**
 * Database reads for the open-data API: PUBLISHED events only, the site's public columns only
 * (PUBLIC_EVENT_COLUMNS, never SELECT *). Coordinates are read only to place an event in a map
 * area, exactly as the map does, and are never copied to the output (toOutputEvent is an
 * allowlist). Current tables only; the historical record is not part of this API.
 */

export const SITE_URL = (process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

type EventRow = Record<string, unknown> & {
  event_id: string;
  event_date: Date;
  event_type: EventType;
  first_reported: Date | null;
  headline: string;
  summary: string | null;
  activity_description: string | null;
  country: string | null;
  location_name: string | null;
  _latitude: number | null;
  _longitude: number | null;
  _support_tiers: (number | null)[];
};

type SourceRow = {
  event_id: string;
  name: string;
  home_url: string | null;
  source_type: SourceType;
  source_country: string | null;
  tier: number | null;
  article_url: string | null;
  relationship: string;
  is_primary: boolean;
  excerpt: string | null;
};

export type OpenDataPage = { events: OutputEvent[]; nextCursor: string | null };

function areaOf(row: EventRow, geo: RegionFeatureCollection): AreaId {
  const p = placeEvent(
    {
      headline: row.headline,
      event_type: row.event_type,
      summary: row.summary,
      activity_description: row.activity_description,
      country: row.country,
      location_name: row.location_name,
      latitude: row._latitude,
      longitude: row._longitude,
    },
    geo,
  );
  if (p.kind === "placed") return p.unit as AreaId;
  return p.kind === "theater-wide" ? "THEATER-WIDE" : "UNPLACED";
}

/** Decision 11, as on the map: a recent event whose SUPPORTS sources are all Tier 4 is held back. */
export function heldByDecision11(row: Pick<EventRow, "event_date" | "first_reported" | "_support_tiers">, now: Date): boolean {
  const holdStart = new Date(now.getTime() - TIER4_HOLD_HOURS * 3_600_000);
  const holdDay = holdStart.toISOString().slice(0, 10);
  const day = row.event_date.toISOString().slice(0, 10);
  const recent = day >= holdDay || (row.first_reported !== null && row.first_reported >= holdStart);
  return recent && isTier4OnlySupport(row._support_tiers);
}

export async function loadOpenDataPage(query: Query, now: Date): Promise<OpenDataPage> {
  const values: unknown[] = [query.from, query.to];
  const where = ["e.review_status = 'PUBLISHED'", "e.event_date BETWEEN $1::date AND $2::date"];
  if (query.types.length > 0) {
    values.push(query.types);
    where.push(`e.event_type = ANY($${values.length}::event_type[])`);
  }
  if (query.cursor) {
    values.push(query.cursor.date, query.cursor.id);
    where.push(`(e.event_date, e.event_id) < ($${values.length - 1}::date, $${values.length}::uuid)`);
  }
  const pool = getPool();
  const [{ rows }, geo] = await Promise.all([
    pool.query<EventRow>(
      `SELECT ${PUBLIC_EVENT_COLUMNS}, e.latitude AS _latitude, e.longitude AS _longitude,
              coalesce((SELECT array_agg(s.tier) FROM event_sources es JOIN sources s ON s.id = es.source_id
                        WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS'), '{}') AS _support_tiers
       FROM events e
       WHERE ${where.join(" AND ")}
       ORDER BY e.event_date DESC, e.event_id DESC`,
      values,
    ),
    loadTheaterGeo(),
  ]);

  const kept: Array<{ row: EventRow; area: AreaId; layer: "activity" | "statements" }> = [];
  for (const row of rows) {
    if (heldByDecision11(row, now)) continue;
    const layer = isStatementType(row.event_type) ? "statements" : "activity";
    if (query.layer !== "all" && layer !== query.layer) continue;
    const area = areaOf(row, geo);
    if (query.area && area !== query.area) continue;
    kept.push({ row, area, layer });
    if (kept.length > query.limit) break;
  }
  const page = kept.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor =
    kept.length > query.limit && last
      ? encodeCursor({ date: last.row.event_date.toISOString().slice(0, 10), id: last.row.event_id })
      : null;

  const ids = page.map((k) => k.row.event_id);
  const { rows: sources } = ids.length
    ? await pool.query<SourceRow>(
        `SELECT es.event_id, coalesce(es.source_label, s.name) AS name, s.home_url, s.source_type, s.source_country, s.tier,
                es.article_url, es.relationship, es.is_primary, es.excerpt
         FROM event_sources es JOIN sources s ON s.id = es.source_id
         WHERE es.event_id = ANY($1::uuid[])
         ORDER BY es.is_primary DESC, es.relationship ASC, es.created_at ASC`,
        [ids],
      )
    : { rows: [] as SourceRow[] };

  return {
    events: page.map(({ row, area, layer }) =>
      toOutputEvent(
        row,
        { url: `${SITE_URL}/events/${row.event_id}`, area, layer },
        sources
          .filter((s) => s.event_id === row.event_id)
          .map((s) => ({ ...s, state_or_official: isStateOfficialSource(s) })),
      ),
    ),
    nextCursor,
  };
}
