import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPool } from "@/lib/db";
import { UNDER_WAY_STATUSES } from "@/lib/exercise-rules";
import {
  isStatementType,
  type ConfidenceLevel,
  type EventType,
  type ExerciseStatus,
} from "@/lib/event-labels";
import {
  placeEvent,
  placeExercise,
  REGIONS,
  UNITS,
  type Placement,
  type RegionFeatureCollection,
} from "@/lib/placement";
import { THEATER_WIDE_ID } from "@/lib/map-style";
import { isTier4OnlySupport } from "@/lib/source-labels";

/**
 * Region heat map data (spec §13, §60, decisions 10-11). Counts PUBLISHED events and
 * exercises per region for a window. Output carries no coordinates and no article text:
 * only ids, dates, types, headlines, confidence and the region an item is placed in.
 */

export const MAP_WINDOWS = [7, 30, 90] as const;
export type MapWindow = (typeof MAP_WINDOWS)[number];
export const DEFAULT_MAP_WINDOW: MapWindow = 30;

export const MAP_LAYERS = ["activity", "statements", "all"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
/** /map opens on All; the dashboard thumbnail shows Activity. */
export const DEFAULT_MAP_LAYER: MapLayer = "all";
export const DASHBOARD_MAP_LAYER: MapLayer = "activity";

/** Tier 4-only items this recent are left off the map entirely (decision 11). */
export const TIER4_HOLD_HOURS = 72;

export type ItemLayer = "activity" | "statements";

export function layerOfEventType(type: EventType): ItemLayer {
  return isStatementType(type) ? "statements" : "activity";
}

export function parseMapParams(params: { days?: string | string[]; layer?: string | string[] }): {
  days: MapWindow;
  layer: MapLayer;
} {
  const days = Number(Array.isArray(params.days) ? params.days[0] : params.days);
  const layer = Array.isArray(params.layer) ? params.layer[0] : params.layer;
  return {
    days: (MAP_WINDOWS as readonly number[]).includes(days) ? (days as MapWindow) : DEFAULT_MAP_WINDOW,
    layer: (MAP_LAYERS as readonly string[]).includes(layer ?? "") ? (layer as MapLayer) : DEFAULT_MAP_LAYER,
  };
}

/** Steps: none, 1, 2-3, 4+. */
export function shadeStep(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

// Rows as read from the database. Coordinates and text are used for placement only.
export type MapEventRow = {
  event_id: string;
  event_date: Date;
  first_reported: Date | null;
  headline: string;
  summary: string | null;
  activity_description: string | null;
  event_type: EventType;
  confidence_level: ConfidenceLevel;
  country: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  exercise_id: string | null;
  support_tiers: (number | null)[];
};

export type MapExerciseRow = {
  id: string;
  exercise_name: string;
  countries: string[];
  location: string | null;
  exercise_status: ExerciseStatus;
  announced_start_date: Date | null;
  announced_end_date: Date | null;
  observed_start_date: Date | null;
  observed_end_date: Date | null;
  source_tiers: (number | null)[];
};

export type MapItem = {
  kind: "event" | "exercise";
  id: string;
  href: string;
  /** YYYY-MM-DD: event date, or exercise start. */
  date: string;
  type: EventType;
  headline: string;
  confidence: ConfidenceLevel | null;
  layer: ItemLayer;
  placement: Placement;
  /** False when it is listed but not counted (linked event of a counted exercise). */
  counted: boolean;
};

export type AreaCount = { id: string; name: string; count: number; step: 0 | 1 | 2 | 3 };

export type MapData = {
  days: MapWindow;
  layer: MapLayer;
  windowStart: string;
  /**
   * Every unit, in gazetteer order, counted for the selected layer: the nine map areas
   * (onMap) and the four "Outside the theater" cards (onMap false, no regions).
   */
  units: (AreaCount & { onMap: boolean; regions: AreaCount[] })[];
  /** Items about the whole flank: listed and counted, never drawn. */
  theaterWide: AreaCount;
  /** Window items, both layers, newest first. Unplaced ones are shown as "Location unclear". */
  items: MapItem[];
};

export { THEATER_WIDE_ID };

const DAY_MS = 86_400_000;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inLayer(layer: MapLayer, item: ItemLayer): boolean {
  return layer === "all" || layer === item;
}

export function buildMapData(
  rows: { events: MapEventRow[]; exercises: MapExerciseRow[] },
  options: { days: MapWindow; layer: MapLayer; now: Date; geo?: RegionFeatureCollection },
): MapData {
  const today = utcDay(options.now);
  // Same convention as the /latest window: dated on or after the UTC day the window starts.
  const windowStart = utcDay(new Date(options.now.getTime() - options.days * DAY_MS));
  const holdStart = new Date(options.now.getTime() - TIER4_HOLD_HOURS * 3_600_000);
  const holdDay = utcDay(holdStart);

  const exercises: MapItem[] = [];
  for (const x of rows.exercises) {
    const start = x.observed_start_date ?? x.announced_start_date;
    if (!start) continue;
    const startDay = utcDay(start);
    const endDate = x.observed_end_date ?? x.announced_end_date;
    // No end date: still running if under way, otherwise only its start day.
    const underWay = (UNDER_WAY_STATUSES as readonly ExerciseStatus[]).includes(x.exercise_status);
    const endDay = endDate ? utcDay(endDate) : underWay ? today : startDay;
    if (startDay > today || endDay < windowStart) continue;
    if (endDay >= holdDay && isTier4OnlySupport(x.source_tiers)) continue;
    exercises.push({
      kind: "exercise",
      id: x.id,
      href: `/exercises/${x.id}`,
      date: startDay,
      type: "EXERCISE",
      headline: x.exercise_name,
      confidence: null,
      layer: "activity",
      placement: placeExercise(x),
      counted: true,
    });
  }
  const countedExercises = new Set(
    inLayer(options.layer, "activity") ? exercises.map((x) => x.id) : [],
  );

  const events: MapItem[] = [];
  for (const e of rows.events) {
    const day = utcDay(e.event_date);
    if (day < windowStart || day > today) continue;
    const recent = day >= holdDay || (e.first_reported !== null && e.first_reported >= holdStart);
    if (recent && isTier4OnlySupport(e.support_tiers)) continue;
    events.push({
      kind: "event",
      id: e.event_id,
      href: `/events/${e.event_id}`,
      date: day,
      type: e.event_type,
      headline: e.headline,
      confidence: e.confidence_level,
      layer: layerOfEventType(e.event_type),
      placement: placeEvent(e, options.geo),
      counted: !(e.exercise_id && countedExercises.has(e.exercise_id)),
    });
  }

  const items = [...events, ...exercises].sort((a, b) => b.date.localeCompare(a.date));
  const unitCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  let theaterWide = 0;
  for (const item of items) {
    if (!item.counted || !inLayer(options.layer, item.layer)) continue;
    if (item.placement.kind === "theater-wide") theaterWide++;
    if (item.placement.kind !== "placed") continue;
    const { unit, region } = item.placement;
    unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);
    if (region) regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }

  const area = (id: string, name: string, count: number): AreaCount => ({ id, name, count, step: shadeStep(count) });
  return {
    days: options.days,
    layer: options.layer,
    windowStart,
    units: UNITS.map((u) => ({
      ...area(u.id, u.name, unitCounts.get(u.id) ?? 0),
      onMap: u.onMap !== false,
      regions: REGIONS.filter((r) => r.unit === u.id).map((r) => area(r.id, r.name, regionCounts.get(r.id) ?? 0)),
    })),
    theaterWide: area(THEATER_WIDE_ID, "Theater-wide", theaterWide),
    items,
  };
}

let geoCache: Promise<RegionFeatureCollection> | undefined;

/** Region outlines, read server-side for coordinate placement and the dashboard thumbnail. */
export function loadTheaterGeo(): Promise<RegionFeatureCollection> {
  geoCache ??= readFile(join(process.cwd(), "public/geo/theater.geojson"), "utf8").then(
    (text) => JSON.parse(text) as RegionFeatureCollection,
  );
  return geoCache;
}

export async function loadMapData(options: {
  days: MapWindow;
  layer: MapLayer;
  now?: Date;
}): Promise<MapData> {
  const pool = getPool();
  const maxDays = Math.max(...MAP_WINDOWS);
  const [events, exercises, geo] = await Promise.all([
    pool.query<MapEventRow>(
      `SELECT e.event_id, e.event_date, e.first_reported, e.headline, e.summary,
              e.activity_description, e.event_type, e.confidence_level, e.country,
              e.location_name, e.latitude, e.longitude, e.exercise_id,
              coalesce((SELECT array_agg(s.tier) FROM event_sources es
                        JOIN sources s ON s.id = es.source_id
                        WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS'),
                       '{}') AS support_tiers
       FROM events e
       WHERE e.review_status = 'PUBLISHED'
         AND e.event_date >= ((now() AT TIME ZONE 'UTC') - make_interval(days => $1))::date`,
      [maxDays],
    ),
    pool.query<MapExerciseRow>(
      `SELECT x.id, x.exercise_name, x.countries, x.location, x.exercise_status, x.announced_start_date,
              x.announced_end_date, x.observed_start_date, x.observed_end_date,
              coalesce((SELECT array_agg(s.tier) FROM exercise_sources es
                        JOIN sources s ON s.id = es.source_id
                        WHERE es.exercise_id = x.id), '{}') AS source_tiers
       FROM exercises x
       WHERE x.review_status = 'PUBLISHED'`,
    ),
    loadTheaterGeo(),
  ]);
  return buildMapData(
    { events: events.rows, exercises: exercises.rows },
    { days: options.days, layer: options.layer, now: options.now ?? new Date(), geo },
  );
}
