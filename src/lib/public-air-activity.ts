import "server-only";
import { airCategory, AIR_TYPES, DEPLOYMENT_TYPES, type AirItem } from "@/lib/air-activity";
import { getPool } from "@/lib/db";
import { loadTheaterGeo } from "@/lib/map-data";
import { placeEvent } from "@/lib/placement";
import { PUBLIC_EVENT_COLUMNS, PUBLIC_EVENT_FIELDS, type PublicEvent } from "@/lib/public-events";
import { heldByDecision11 } from "@/lib/public-open-data";

/**
 * Air Activity page data: PUBLISHED current events of the air types, plus aircraft deployments.
 * Same safety rules as the map: decision 11 (recent Tier 4-only reports held for 72 hours) and
 * area-level placement. Coordinates are read only to place an event and are never passed on:
 * each item carries only the site's public fields. Historical tables are never read.
 */

type Row = PublicEvent & {
  _latitude: number | null;
  _longitude: number | null;
  _support_tiers: (number | null)[];
};

/** Only the site's public fields (no coordinates, no query helpers). */
function publicOnly(row: Row): PublicEvent {
  const out = {} as Record<string, unknown>;
  for (const f of PUBLIC_EVENT_FIELDS) out[f] = row[f];
  return out as PublicEvent;
}

export async function loadAirActivity(now: Date = new Date()): Promise<AirItem<PublicEvent>[]> {
  const [{ rows }, geo] = await Promise.all([
    getPool().query<Row>(
      `SELECT ${PUBLIC_EVENT_COLUMNS}, e.latitude AS _latitude, e.longitude AS _longitude,
              coalesce((SELECT array_agg(s.tier) FROM event_sources es JOIN sources s ON s.id = es.source_id
                        WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS'), '{}') AS _support_tiers
       FROM events e
       WHERE e.review_status = 'PUBLISHED' AND e.event_type = ANY($1::event_type[])
       ORDER BY e.event_date DESC, e.event_id DESC`,
      [[...AIR_TYPES, ...DEPLOYMENT_TYPES]],
    ),
    loadTheaterGeo(),
  ]);
  const items: AirItem<PublicEvent>[] = [];
  for (const row of rows) {
    if (heldByDecision11(row, now)) continue;
    const category = airCategory(row);
    if (!category) continue;
    const p = placeEvent({ ...row, latitude: row._latitude, longitude: row._longitude }, geo);
    const area = p.kind === "placed" ? p.unit : p.kind === "theater-wide" ? "THEATER-WIDE" : "UNPLACED";
    items.push({ date: row.event_date.toISOString().slice(0, 10), type: row.event_type, area, category, event: publicOnly(row) });
  }
  return items;
}
