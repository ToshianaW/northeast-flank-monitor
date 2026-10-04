import "server-only";
import { getPool } from "@/lib/db";
import type { EventType } from "@/lib/event-labels";
import {
  AUTO_REVIEWER,
  MAX_REFERENCES,
  rankAutoLinks,
  UNPUBLISH_REVIEWER,
  type ApprovedReference,
  type AutoEvent,
  type MatchedBy,
  type ReferenceAttribute,
  type ReferenceFields,
} from "@/lib/historical-references-rules";

/**
 * Reviewer-approved references from a current event to historical events (migration 0010).
 * This link table is the only bridge between current and historical data: one row per
 * approved pair. Reads return nothing until the migration is applied.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres "undefined_table": migration 0010 is not applied yet. */
function notApplied(error: unknown): boolean {
  return (error as { code?: string }).code === "42P01";
}

export async function referencesTableExists(): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: boolean }>(
    "SELECT to_regclass('public.event_historical_references') IS NOT NULL AS ok",
  );
  return rows[0]?.ok ?? false;
}

/**
 * Public read for /events/[id]: approved references whose current event AND historical event
 * are both PUBLISHED now (checked at read time, not only when linked). At most 3.
 */
export async function listApprovedReferences(eventId: string): Promise<ApprovedReference[]> {
  if (!UUID_RE.test(eventId)) return [];
  try {
    const { rows } = await getPool().query<ApprovedReference>(
      `SELECT h.event_id AS historical_event_id, h.event_date, h.headline, h.event_type,
              r.shared_attributes::text[] AS shared_attributes, r.matched_by, r.ai_suggested
       FROM event_historical_references r
       JOIN events e ON e.event_id = r.event_id AND e.review_status = 'PUBLISHED'
       JOIN historical_events h ON h.event_id = r.historical_event_id AND h.review_status = 'PUBLISHED'
       WHERE r.event_id = $1
       ORDER BY h.event_date ASC, r.created_at ASC
       LIMIT $2`,
      [eventId, MAX_REFERENCES],
    );
    return rows;
  } catch (error) {
    if (notApplied(error)) return [];
    throw error;
  }
}

export type AdminReference = {
  historical_event_id: string;
  event_date: Date;
  headline: string;
  historical_status: string;
  shared_attributes: ReferenceAttribute[];
  matched_by: MatchedBy;
  ai_suggested: boolean;
  reviewer: string;
  created_at: Date;
};

/** Admin: every reference on the event, whatever the historical entry's status now. */
export async function listReferencesForAdmin(eventId: string): Promise<AdminReference[]> {
  if (!UUID_RE.test(eventId)) return [];
  try {
    const { rows } = await getPool().query<AdminReference>(
      `SELECT h.event_id AS historical_event_id, h.event_date, h.headline,
              h.review_status::text AS historical_status,
              r.shared_attributes::text[] AS shared_attributes, r.matched_by, r.ai_suggested, r.reviewer, r.created_at
       FROM event_historical_references r
       JOIN historical_events h ON h.event_id = r.historical_event_id
       WHERE r.event_id = $1
       ORDER BY r.created_at ASC`,
      [eventId],
    );
    return rows;
  } catch (error) {
    if (notApplied(error)) return [];
    throw error;
  }
}

/** The public fields the suggestion step may show the model. Nothing else is read. */
export type SuggestionEvent = ReferenceFields & { headline: string; summary: string | null };
export type ShortlistEntry = SuggestionEvent & { event_id: string; event_date: Date };

export const SHORTLIST_LIMIT = 25;

/** The current event's public fields and status, or null when it does not exist. */
export async function getSuggestionEvent(
  eventId: string,
): Promise<(SuggestionEvent & { review_status: string }) | null> {
  if (!UUID_RE.test(eventId)) return null;
  const { rows } = await getPool().query<SuggestionEvent & { review_status: string }>(
    `SELECT headline, summary, event_type, country, actor, review_status::text AS review_status
     FROM events WHERE event_id = $1`,
    [eventId],
  );
  return rows[0] ?? null;
}

/**
 * Code shortlist for the suggestion step: PUBLISHED historical entries with the same event type
 * or the same country, not already referenced, same type first, newest first. Public fields only.
 */
export async function shortlistHistorical(
  eventId: string,
  current: { event_type: EventType; country: string | null },
): Promise<ShortlistEntry[]> {
  const { rows } = await getPool().query<ShortlistEntry>(
    `SELECT h.event_id, h.event_date, h.headline, h.summary, h.event_type, h.country, h.actor
     FROM historical_events h
     WHERE h.review_status = 'PUBLISHED'
       AND (h.event_type = $2::event_type
            OR ($3::text IS NOT NULL AND lower(btrim(h.country)) = lower(btrim($3::text))))
       AND NOT EXISTS (
         SELECT 1 FROM event_historical_references r
         WHERE r.event_id = $1 AND r.historical_event_id = h.event_id)
     ORDER BY (h.event_type = $2::event_type) DESC, h.event_date DESC, h.event_id
     LIMIT $4`,
    [eventId, current.event_type, current.country?.trim() || null, SHORTLIST_LIMIT],
  );
  return rows;
}

/** Headline and date of PUBLISHED historical entries, for the admin suggestion list. */
export async function listPublishedHistoricalHeadlines(
  ids: readonly string[],
): Promise<Map<string, { headline: string; event_date: Date; event_type: EventType }>> {
  const valid = ids.filter((id) => UUID_RE.test(id));
  if (valid.length === 0) return new Map();
  const { rows } = await getPool().query<{ event_id: string; headline: string; event_date: Date; event_type: EventType }>(
    `SELECT event_id, headline, event_date, event_type FROM historical_events
     WHERE event_id = ANY($1::uuid[]) AND review_status = 'PUBLISHED'`,
    [valid],
  );
  return new Map(rows.map((r) => [r.event_id, { headline: r.headline, event_date: r.event_date, event_type: r.event_type }]));
}

/** Fields for code-checking attributes when a reviewer approves a reference. */
export async function getPublishedHistoricalFields(id: string): Promise<ReferenceFields | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<ReferenceFields>(
    `SELECT event_type, country, actor FROM historical_events WHERE event_id = $1 AND review_status = 'PUBLISHED'`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Approve one reference: the row and a LINK log line in one transaction. The database refuses
 * it unless both events are PUBLISHED and the event has fewer than 3 references.
 */
export async function linkReference(input: {
  eventId: string;
  historicalEventId: string;
  attributes: ReferenceAttribute[];
  reviewer: string;
  /** True when the link came from the AI step (only with "same kind of activity"). */
  aiSuggested?: boolean;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO event_historical_references (event_id, historical_event_id, shared_attributes, reviewer, matched_by, ai_suggested)
       VALUES ($1, $2, $3::reference_attribute[], $4, 'REVIEWER', $5)`,
      [input.eventId, input.historicalEventId, input.attributes, input.reviewer, input.aiSuggested ?? false],
    );
    await client.query(
      `INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer, matched_by)
       VALUES ($1, $2, 'LINK', $3::reference_attribute[], $4, 'REVIEWER')`,
      [input.eventId, input.historicalEventId, input.attributes, input.reviewer],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove one reference (automatic or reviewer): the row goes, an UNLINK log line with its
 * attributes and origin stays, and automatic linking never adds the pair again.
 */
export async function unlinkReference(input: { eventId: string; historicalEventId: string; reviewer: string }): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ shared_attributes: string[]; matched_by: MatchedBy }>(
      `DELETE FROM event_historical_references WHERE event_id = $1 AND historical_event_id = $2
       RETURNING shared_attributes::text[] AS shared_attributes, matched_by`,
      [input.eventId, input.historicalEventId],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer, matched_by)
       VALUES ($1, $2, 'UNLINK', $3::reference_attribute[], $4, $5)`,
      [input.eventId, input.historicalEventId, rows[0].shared_attributes, input.reviewer, rows[0].matched_by],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Automatic links (no model): same event type AND same country (migration 0011)
// ---------------------------------------------------------------------------

export type AutoState = {
  existingByEvent: Map<string, string[]>;
  linkCounts: Map<string, number>;
  /** "<event_id>:<historical_event_id>" for pairs a person removed (never re-added). */
  removedPairs: Set<string>;
};

/** Current links, per-entry link counts, and person-removed pairs (unpublish cleanup excluded). */
export async function loadAutoState(): Promise<AutoState> {
  const [links, removed] = await Promise.all([
    getPool().query<{ event_id: string; historical_event_id: string }>(
      `SELECT event_id, historical_event_id FROM event_historical_references`,
    ),
    getPool().query<{ event_id: string; historical_event_id: string }>(
      `SELECT DISTINCT event_id, historical_event_id FROM event_historical_reference_log
       WHERE action = 'UNLINK' AND reviewer <> $1`,
      [UNPUBLISH_REVIEWER],
    ),
  ]);
  const existingByEvent = new Map<string, string[]>();
  const linkCounts = new Map<string, number>();
  for (const l of links.rows) {
    existingByEvent.set(l.event_id, [...(existingByEvent.get(l.event_id) ?? []), l.historical_event_id]);
    linkCounts.set(l.historical_event_id, (linkCounts.get(l.historical_event_id) ?? 0) + 1);
  }
  return {
    existingByEvent,
    linkCounts,
    removedPairs: new Set(removed.rows.map((r) => `${r.event_id}:${r.historical_event_id}`)),
  };
}

export type AutoCandidate = AutoEvent & { headline: string };

/** PUBLISHED current events, oldest first (the backfill order), with public fields. */
export async function listPublishedForAutoLink(): Promise<AutoCandidate[]> {
  const { rows } = await getPool().query<AutoCandidate>(
    `SELECT event_id, headline, event_type, country, actor FROM events
     WHERE review_status = 'PUBLISHED' ORDER BY event_date ASC, created_at ASC, event_id`,
  );
  return rows;
}

/** PUBLISHED historical entries with public fields (the candidates for automatic links). */
export async function listHistoricalForAutoLink(): Promise<AutoCandidate[]> {
  const { rows } = await getPool().query<AutoCandidate>(
    `SELECT event_id, headline, event_type, country, actor FROM historical_events
     WHERE review_status = 'PUBLISHED' ORDER BY event_date ASC, event_id`,
  );
  return rows;
}

/**
 * Links one PUBLISHED event automatically: fills its free slots (of 3) with published historical
 * entries of the same type AND country, ranked by rankAutoLinks. One transaction; the event row
 * is locked first, as the 0010 trigger does, so this and a reviewer approval cannot both pass
 * the count. Returns how many links were made (0 when not published, no country, or full).
 */
export async function autoLinkEvent(eventId: string): Promise<number> {
  if (!UUID_RE.test(eventId)) return 0;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows: [current] } = await client.query<AutoEvent & { review_status: string }>(
      `SELECT event_id, event_type, country, actor, review_status::text AS review_status
       FROM events WHERE event_id = $1 FOR UPDATE`,
      [eventId],
    );
    if (!current || current.review_status !== "PUBLISHED" || !current.country?.trim()) {
      await client.query("ROLLBACK");
      return 0;
    }
    const [existing, candidates, counts, removed] = await Promise.all([
      client.query<{ historical_event_id: string }>(
        `SELECT historical_event_id FROM event_historical_references WHERE event_id = $1`,
        [eventId],
      ),
      client.query<AutoEvent>(
        `SELECT event_id, event_type, country, actor FROM historical_events
         WHERE review_status = 'PUBLISHED' AND event_type = $1::event_type
           AND lower(btrim(country)) = lower(btrim($2::text))`,
        [current.event_type, current.country],
      ),
      client.query<{ historical_event_id: string; n: number }>(
        `SELECT historical_event_id, count(*)::int AS n FROM event_historical_references GROUP BY 1`,
      ),
      client.query<{ historical_event_id: string }>(
        `SELECT DISTINCT historical_event_id FROM event_historical_reference_log
         WHERE event_id = $1 AND action = 'UNLINK' AND reviewer <> $2`,
        [eventId, UNPUBLISH_REVIEWER],
      ),
    ]);
    const links = rankAutoLinks(current, candidates.rows, {
      slots: MAX_REFERENCES - existing.rows.length,
      linkCounts: new Map(counts.rows.map((r) => [r.historical_event_id, r.n])),
      excluded: new Set([...existing.rows, ...removed.rows].map((r) => r.historical_event_id)),
    });
    for (const l of links) {
      await client.query(
        `INSERT INTO event_historical_references (event_id, historical_event_id, shared_attributes, reviewer, matched_by)
         VALUES ($1, $2, $3::reference_attribute[], $4, 'AUTO')`,
        [eventId, l.historical_event_id, l.attributes, AUTO_REVIEWER],
      );
      await client.query(
        `INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer, matched_by)
         VALUES ($1, $2, 'LINK', $3::reference_attribute[], $4, 'AUTO')`,
        [eventId, l.historical_event_id, l.attributes, AUTO_REVIEWER],
      );
    }
    await client.query("COMMIT");
    return links.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
