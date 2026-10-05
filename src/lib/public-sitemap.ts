import "server-only";
import { getPool } from "@/lib/db";
import { UNDER_WAY_STATUSES } from "@/lib/exercise-rules";
import type { ExerciseStatus } from "@/lib/event-labels";
import { TIER4_HOLD_HOURS } from "@/lib/map-data";
import { listPublishedHistoricalForSitemap } from "@/lib/public-historical";
import { heldByDecision11 } from "@/lib/public-open-data";
import { isTier4OnlySupport } from "@/lib/source-labels";

/**
 * Sitemap reads for current items: PUBLISHED rows only, ids and dates only (no content columns).
 * Recent items supported only by Tier 4 sources are left out, as on the map and in open data
 * (decision 11). Historical events come through public-historical.ts, the allowlisted module.
 */

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export async function listSitemapEvents(
  limit: number,
  now: Date = new Date(),
): Promise<Array<{ event_id: string; updated_at: Date }>> {
  const { rows } = await getPool().query<{
    event_id: string;
    event_date: Date;
    first_reported: Date | null;
    updated_at: Date;
    _support_tiers: Array<number | null>;
  }>(
    `SELECT e.event_id, e.event_date, e.first_reported, e.updated_at,
            coalesce((SELECT array_agg(s.tier) FROM event_sources es JOIN sources s ON s.id = es.source_id
                      WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS'), '{}') AS _support_tiers
     FROM events e
     WHERE e.review_status = 'PUBLISHED'
     ORDER BY e.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows
    .filter((row) => !heldByDecision11(row, now))
    .map(({ event_id, updated_at }) => ({ event_id, updated_at }));
}

export async function listSitemapExercises(
  limit: number,
  now: Date = new Date(),
): Promise<Array<{ id: string; updated_at: Date }>> {
  const { rows } = await getPool().query<{
    id: string;
    updated_at: Date;
    exercise_status: ExerciseStatus;
    start_date: Date | null;
    end_date: Date | null;
    source_tiers: Array<number | null>;
  }>(
    `SELECT x.id, x.updated_at, x.exercise_status,
            coalesce(x.observed_start_date, x.announced_start_date) AS start_date,
            coalesce(x.observed_end_date, x.announced_end_date) AS end_date,
            coalesce((SELECT array_agg(s.tier) FROM exercise_sources xs JOIN sources s ON s.id = xs.source_id
                      WHERE xs.exercise_id = x.id), '{}') AS source_tiers
     FROM exercises x
     WHERE x.review_status = 'PUBLISHED'
     ORDER BY x.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  // Same hold as the map: an exercise still running within the last 72 hours, with Tier 4-only sources.
  const today = utcDay(now);
  const holdDay = utcDay(new Date(now.getTime() - TIER4_HOLD_HOURS * 3_600_000));
  return rows
    .filter((x) => {
      if (!x.start_date || !isTier4OnlySupport(x.source_tiers)) return true;
      const underWay = (UNDER_WAY_STATUSES as readonly ExerciseStatus[]).includes(x.exercise_status);
      const endDay = x.end_date ? utcDay(x.end_date) : underWay ? today : utcDay(x.start_date);
      return endDay < holdDay;
    })
    .map(({ id, updated_at }) => ({ id, updated_at }));
}

export async function listSitemapDigests(
  limit: number,
): Promise<Array<{ digest_date: string; updated_at: Date }>> {
  const { rows } = await getPool().query<{ digest_date: string; updated_at: Date }>(
    `SELECT digest_date::text AS digest_date, updated_at
     FROM daily_digests
     WHERE review_status = 'PUBLISHED'
     ORDER BY digest_date DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Sitemap protocol limit per file. */
export const MAX_SITEMAP_URLS = 50_000;

/** Public pages that need no database row. Never an /admin URL. */
export const STATIC_PATHS = [
  "/",
  "/latest",
  "/archive",
  "/map",
  "/exercises",
  "/digest",
  "/historical",
  "/historical/compare",
  "/air-activity",
  "/methodology",
  "/about",
  "/sources",
  "/data",
] as const;

export type SitemapEntry = { path: string; lastModified?: string };

/** Static pages, then published items, newest change first; at most MAX_SITEMAP_URLS. */
export async function loadSitemapEntries(now: Date = new Date()): Promise<SitemapEntry[]> {
  const room = MAX_SITEMAP_URLS - STATIC_PATHS.length;
  const [events, exercises, digests, historical] = await Promise.all([
    listSitemapEvents(room, now),
    listSitemapExercises(room, now),
    listSitemapDigests(room),
    listPublishedHistoricalForSitemap(room),
  ]);
  const entries: SitemapEntry[] = [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...events.map((e) => ({ path: `/events/${e.event_id}`, lastModified: e.updated_at.toISOString() })),
    ...exercises.map((x) => ({ path: `/exercises/${x.id}`, lastModified: x.updated_at.toISOString() })),
    ...digests.map((d) => ({ path: `/digest/${d.digest_date}`, lastModified: d.updated_at.toISOString() })),
    ...historical.map((h) => ({ path: `/historical/${h.event_id}`, lastModified: h.updated_at.toISOString() })),
  ];
  return entries.slice(0, MAX_SITEMAP_URLS);
}
