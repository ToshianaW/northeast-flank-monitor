import "server-only";
import { computeIndex, THEATER, type IndexEvent, type IndexResult } from "@/lib/activity-index";
import { getPool } from "@/lib/db";
import type { EventType } from "@/lib/event-labels";
import { loadTheaterGeo } from "@/lib/map-data";
import { isOnMapUnit, placeEvent } from "@/lib/placement";

/**
 * Inputs for the Activity Index from current tables only (published events, their SUPPORTS
 * sources, the source registry). Historical tables are never read here. Events are placed by the
 * map's own placement, so an area means the same thing on the map and in the index.
 */

type Row = {
  event_date: string;
  event_type: EventType;
  headline: string;
  summary: string | null;
  activity_description: string | null;
  country: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  support_source_added: string[];
};

export async function loadIndexInputs(): Promise<{ events: IndexEvent[]; panelSourcesAdded: string[] }> {
  const pool = getPool();
  const [events, sources, geo] = await Promise.all([
    pool.query<Row>(
      `SELECT e.event_date::text AS event_date, e.event_type, e.headline, e.summary, e.activity_description,
              e.country, e.location_name, e.latitude, e.longitude,
              coalesce((SELECT array_agg(to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
                        FROM event_sources es JOIN sources s ON s.id = es.source_id
                        WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS'), '{}') AS support_source_added
       FROM events e
       WHERE e.review_status = 'PUBLISHED'`,
    ),
    pool.query<{ added: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS added FROM sources WHERE NOT historical_only`,
    ),
    loadTheaterGeo(),
  ]);
  return {
    events: events.rows.map((e) => {
      const p = placeEvent(e, geo);
      const area = p.kind === "theater-wide" ? THEATER : p.kind === "placed" && isOnMapUnit(p.unit) ? p.unit : null;
      return { event_date: e.event_date, event_type: e.event_type, area, support_source_added: e.support_source_added };
    }),
    panelSourcesAdded: sources.rows.map((r) => r.added),
  };
}

/** The index as of `today` (YYYY-MM-DD, UTC). */
export async function getActivityIndex(today = new Date().toISOString().slice(0, 10)): Promise<IndexResult> {
  const inputs = await loadIndexInputs();
  return computeIndex(inputs.events, { today, panelSourcesAdded: inputs.panelSourcesAdded });
}
