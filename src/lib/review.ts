import "server-only";
import { getPool } from "@/lib/db";
import type { ConfidenceLevel, EventType, SourceRelationship } from "@/lib/event-labels";
import {
  isTier4OnlySupport,
  TIER4_ONLY_MESSAGE,
  type Reliability,
  type SourceType,
} from "@/lib/source-labels";
import {
  getEvent,
  listEventSources,
  type Event,
  type EventWritePayload,
} from "@/lib/events";

export type ReviewQueueItem = {
  event_id: string;
  headline: string;
  event_date: Date;
  event_type: EventType;
  country: string | null;
  confidence_level: Event["confidence_level"];
  contradiction_flag: boolean;
  review_status: Event["review_status"];
  primary_source_name: string | null;
  primary_source_reliability: Reliability | null;
};

export type ReviewActionRow = {
  id: string;
  event_id: string;
  action: "APPROVE" | "EDIT" | "REJECT" | "MERGE";
  reviewer: string;
  event_type: EventType;
  source_ids: string[];
  merged_into_event_id: string | null;
  previous_values: unknown;
  created_at: Date;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function eventToAuditJson(event: Event): Record<string, unknown> {
  return {
    event_id: event.event_id,
    event_date: serializeDate(event.event_date),
    reported_date: serializeDate(event.reported_date),
    headline: event.headline,
    summary: event.summary,
    actor: event.actor,
    country: event.country,
    region: event.region,
    location_name: event.location_name,
    location_precision: event.location_precision,
    latitude: event.latitude,
    longitude: event.longitude,
    event_type: event.event_type,
    event_subtype: event.event_subtype,
    exercise_id: event.exercise_id,
    exercise_name: event.exercise_name,
    exercise_status: event.exercise_status,
    unit_name: event.unit_name,
    unit_type: event.unit_type,
    unit_home_location: event.unit_home_location,
    personnel_estimate: event.personnel_estimate,
    equipment_type: event.equipment_type,
    equipment_quantity: event.equipment_quantity,
    activity_description: event.activity_description,
    source_name: event.source_name,
    source_url: event.source_url,
    source_type: event.source_type,
    source_country: event.source_country,
    source_language: event.source_language,
    source_reliability: event.source_reliability,
    confidence_level: event.confidence_level,
    first_reported: serializeDate(event.first_reported),
    last_updated: serializeDate(event.last_updated),
    announced_start_date: serializeDate(event.announced_start_date),
    announced_end_date: serializeDate(event.announced_end_date),
    observed_start_date: serializeDate(event.observed_start_date),
    observed_end_date: serializeDate(event.observed_end_date),
    personnel_return_status: event.personnel_return_status,
    equipment_return_status: event.equipment_return_status,
    infrastructure_status: event.infrastructure_status,
    follow_on_activity: event.follow_on_activity,
    overall_reset_status: event.overall_reset_status,
    historical_analogue: event.historical_analogue,
    historical_notes: event.historical_notes,
    ai_generated_summary: event.ai_generated_summary,
    internal_notes: event.internal_notes,
    human_reviewed: event.human_reviewed,
    review_status: event.review_status,
    contradiction_flag: event.contradiction_flag,
    contradiction_notes: event.contradiction_notes,
    created_at: serializeDate(event.created_at),
    updated_at: serializeDate(event.updated_at),
  };
}

export async function listSourceIdsForEvent(eventId: string): Promise<string[]> {
  const rows = await listEventSources(eventId);
  return rows.map((r) => r.source_id);
}

export function payloadHasSupportsSource(payload: EventWritePayload): boolean {
  return payload.sources.some((s) => s.relationship === "SUPPORTS");
}

export async function eventHasSupportsSource(eventId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM event_sources
       WHERE event_id = $1 AND relationship = 'SUPPORTS'
     ) AS ok`,
    [eventId],
  );
  return rows[0]?.ok ?? false;
}

async function insertReviewAction(
  client: import("pg").PoolClient,
  row: {
    event_id: string;
    action: ReviewActionRow["action"];
    reviewer: string;
    event_type: EventType;
    source_ids: string[];
    merged_into_event_id?: string | null;
    previous_values: unknown;
  },
) {
  await client.query(
    `INSERT INTO review_actions
       (event_id, action, reviewer, event_type, source_ids, merged_into_event_id, previous_values)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.event_id,
      row.action,
      row.reviewer,
      row.event_type,
      row.source_ids,
      row.merged_into_event_id ?? null,
      JSON.stringify(row.previous_values),
    ],
  );
}

export async function listReviewQueue(): Promise<ReviewQueueItem[]> {
  const { rows } = await getPool().query<ReviewQueueItem>(
    `SELECT
       e.event_id,
       e.headline,
       e.event_date,
       e.event_type,
       e.country,
       e.confidence_level,
       e.contradiction_flag,
       e.review_status,
       s.name AS primary_source_name,
       s.reliability AS primary_source_reliability
     FROM events e
     LEFT JOIN event_sources es ON es.event_id = e.event_id AND es.is_primary
     LEFT JOIN sources s ON s.id = es.source_id
     WHERE e.review_status IN ('DRAFT', 'PENDING_REVIEW')
     ORDER BY e.event_date ASC, e.created_at ASC`,
  );
  return rows;
}

export type ReviewEventSource = {
  source_id: string;
  name: string;
  tier: number | null;
  reliability: Reliability;
  source_type: SourceType;
  source_country: string | null;
  article_url: string;
  excerpt: string | null;
  relationship: SourceRelationship;
  is_primary: boolean;
};

/** Admin review page: the event's sources joined to the registry, plus the extraction run that proposed it. */
export async function getReviewEventDetail(eventId: string): Promise<{
  extraction_run_id: string | null;
  sources: ReviewEventSource[];
}> {
  if (!UUID_RE.test(eventId)) return { extraction_run_id: null, sources: [] };
  const [run, sources] = await Promise.all([
    getPool().query<{ extraction_run_id: string | null }>(
      `SELECT extraction_run_id FROM events WHERE event_id = $1`,
      [eventId],
    ),
    getPool().query<ReviewEventSource>(
      `SELECT s.id AS source_id, s.name, s.tier, s.reliability, s.source_type, s.source_country,
              es.article_url, es.excerpt, es.relationship, es.is_primary
       FROM event_sources es
       JOIN sources s ON s.id = es.source_id
       WHERE es.event_id = $1
       ORDER BY es.is_primary DESC, es.relationship ASC, s.tier ASC NULLS LAST, lower(s.name) ASC`,
      [eventId],
    ),
  ]);
  return { extraction_run_id: run.rows[0]?.extraction_run_id ?? null, sources: sources.rows };
}

export type DuplicateCandidate = {
  other_event_id: string;
  other_headline: string;
  other_event_date: Date;
  other_review_status: Event["review_status"];
  basis: "SAME_ARTICLE" | "TRIGRAM" | "MODEL";
  headline_similarity: number;
  model_verdict: "SAME" | "UNSURE" | null;
  model_reason: string | null;
  model_skipped: "NO_AI_SOURCE" | "NO_MODEL" | "SPEND_CAP" | null;
};

/**
 * Possible duplicates of an event (step 2.3), excluding pairs the model judged DIFFERENT and
 * events already merged away or rejected. Returns [] if migration 0005 is not applied yet.
 */
export async function listDuplicateCandidates(eventId: string): Promise<DuplicateCandidate[]> {
  if (!UUID_RE.test(eventId)) return [];
  try {
    const { rows } = await getPool().query<DuplicateCandidate>(
      `SELECT o.event_id AS other_event_id, o.headline AS other_headline, o.event_date AS other_event_date,
              o.review_status AS other_review_status, dc.basis, dc.headline_similarity,
              dc.model_verdict, dc.model_reason, dc.model_skipped
       FROM duplicate_candidates dc
       JOIN events o
         ON o.event_id = CASE WHEN dc.event_id = $1 THEN dc.candidate_event_id ELSE dc.event_id END
       WHERE $1 IN (dc.event_id, dc.candidate_event_id)
         AND dc.model_verdict IS DISTINCT FROM 'DIFFERENT'
         AND o.review_status NOT IN ('MERGED', 'REJECTED')
       ORDER BY (dc.basis = 'SAME_ARTICLE') DESC, dc.headline_similarity DESC`,
      [eventId],
    );
    return rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return []; // undefined_table
    throw error;
  }
}

export async function listReviewActions(eventId: string): Promise<ReviewActionRow[]> {
  if (!UUID_RE.test(eventId)) return [];
  const { rows } = await getPool().query<ReviewActionRow>(
    `SELECT id, event_id, action, reviewer, event_type, source_ids,
            merged_into_event_id, previous_values, created_at
     FROM review_actions
     WHERE event_id = $1
     ORDER BY created_at ASC`,
    [eventId],
  );
  return rows;
}

export async function submitForReview(eventId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  if (!UUID_RE.test(eventId)) return { ok: false, error: "Event not found." };
  const event = await getEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.review_status !== "DRAFT") {
    return { ok: false, error: "Only draft events can be submitted for review." };
  }
  const { rowCount } = await getPool().query(
    `UPDATE events SET review_status = 'PENDING_REVIEW' WHERE event_id = $1 AND review_status = 'DRAFT'`,
    [eventId],
  );
  if (rowCount !== 1) return { ok: false, error: "Could not update status." };
  return { ok: true };
}

type ApproveResult = { ok: true } | { ok: false; error: string };

/**
 * Approval checks and writes on a client whose transaction the caller owns (tests roll it back).
 * The reviewer chooses confidence explicitly; it is set in the same update.
 */
export async function approveEventInTransaction(
  client: import("pg").PoolClient,
  eventId: string,
  reviewer: string,
  confidence: ConfidenceLevel,
): Promise<ApproveResult> {
  const { rows } = await client.query<Event>(
    `SELECT * FROM events WHERE event_id = $1 FOR UPDATE`,
    [eventId],
  );
  const event = rows[0];
  if (!event) return { ok: false, error: "Event not found." };
  if (
    event.review_status !== "DRAFT" &&
    event.review_status !== "PENDING_REVIEW"
  ) {
    return { ok: false, error: "Only draft or pending events can be approved." };
  }

  const { rows: sourceRows } = await client.query<{
    source_id: string;
    relationship: SourceRelationship;
    tier: number | null;
  }>(
    `SELECT es.source_id, es.relationship, s.tier
     FROM event_sources es
     JOIN sources s ON s.id = es.source_id
     WHERE es.event_id = $1
     ORDER BY es.is_primary DESC, es.created_at ASC`,
    [eventId],
  );
  const supports = sourceRows.filter((r) => r.relationship === "SUPPORTS");
  if (supports.length === 0) {
    return {
      ok: false,
      error:
        "Cannot publish: this event has no supporting source. Attach at least one source with relationship SUPPORTS.",
    };
  }
  if (isTier4OnlySupport(supports.map((r) => r.tier))) {
    return { ok: false, error: TIER4_ONLY_MESSAGE };
  }

  await client.query(
    `UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true, confidence_level = $2
     WHERE event_id = $1`,
    [eventId, confidence],
  );

  await insertReviewAction(client, {
    event_id: eventId,
    action: "APPROVE",
    reviewer,
    event_type: event.event_type,
    source_ids: sourceRows.map((r) => r.source_id),
    previous_values:
      event.confidence_level === confidence
        ? { review_status: event.review_status }
        : { review_status: event.review_status, confidence_level: event.confidence_level },
  });
  return { ok: true };
}

export async function approveEvent(
  eventId: string,
  reviewer: string,
  confidence: ConfidenceLevel,
): Promise<ApproveResult> {
  if (!UUID_RE.test(eventId)) return { ok: false, error: "Event not found." };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await approveEventInTransaction(client, eventId, reviewer, confidence);
    await client.query(result.ok ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectEvent(
  eventId: string,
  reviewer: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { ok: false, error: "Enter a short rejection reason (at least 3 characters)." };
  }
  if (!UUID_RE.test(eventId)) return { ok: false, error: "Event not found." };

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Event>(
      `SELECT * FROM events WHERE event_id = $1 FOR UPDATE`,
      [eventId],
    );
    const event = rows[0];
    if (!event) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Event not found." };
    }
    if (
      event.review_status !== "DRAFT" &&
      event.review_status !== "PENDING_REVIEW"
    ) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only draft or pending events can be rejected." };
    }

    const sourceIds = await listSourceIdsForEvent(eventId);
    const priorStatus = event.review_status;

    await client.query(
      `UPDATE events SET review_status = 'REJECTED' WHERE event_id = $1`,
      [eventId],
    );

    await insertReviewAction(client, {
      event_id: eventId,
      action: "REJECT",
      reviewer,
      event_type: event.event_type,
      source_ids: sourceIds,
      previous_values: { review_status: priorStatus, reject_reason: trimmed },
    });

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function logEditReviewAction(
  eventBefore: Event,
  reviewer: string,
  db: import("pg").Pool | import("pg").PoolClient = getPool(),
): Promise<void> {
  const sourceIds = await listSourceIdsForEvent(eventBefore.event_id);
  await db.query(
    `INSERT INTO review_actions
       (event_id, action, reviewer, event_type, source_ids, previous_values)
     VALUES ($1, 'EDIT', $2, $3, $4, $5)`,
    [
      eventBefore.event_id,
      reviewer,
      eventBefore.event_type,
      sourceIds,
      JSON.stringify(eventToAuditJson(eventBefore)),
    ],
  );
}

async function refreshPrimarySourceSnapshot(
  client: import("pg").PoolClient,
  eventId: string,
) {
  const { rows } = await client.query<{
    name: string;
    article_url: string;
    source_type: string;
    source_country: string | null;
    source_language: string | null;
    reliability: Reliability;
  }>(
    `SELECT s.name, es.article_url, s.source_type, s.source_country, s.source_language, s.reliability
     FROM event_sources es
     JOIN sources s ON s.id = es.source_id
     WHERE es.event_id = $1 AND es.is_primary
     LIMIT 1`,
    [eventId],
  );
  const primary = rows[0];
  if (!primary) return;
  await client.query(
    `UPDATE events SET
       source_name = $1, source_url = $2, source_type = $3,
       source_country = $4, source_language = $5, source_reliability = $6
     WHERE event_id = $7`,
    [
      primary.name,
      primary.article_url,
      primary.source_type,
      primary.source_country,
      primary.source_language,
      primary.reliability,
      eventId,
    ],
  );
}

export async function mergeEventInto(
  sourceEventId: string,
  targetEventId: string,
  reviewer: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(sourceEventId) || !UUID_RE.test(targetEventId)) {
    return { ok: false, error: "Invalid event id." };
  }
  if (sourceEventId === targetEventId) {
    return { ok: false, error: "Choose a different target event." };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: sourceRows } = await client.query<Event>(
      `SELECT * FROM events WHERE event_id = $1 FOR UPDATE`,
      [sourceEventId],
    );
    const sourceEvent = sourceRows[0];
    if (!sourceEvent) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Source event not found." };
    }
    if (
      sourceEvent.review_status !== "DRAFT" &&
      sourceEvent.review_status !== "PENDING_REVIEW"
    ) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only draft or pending events can be merged away." };
    }

    const { rows: targetRows } = await client.query<Event>(
      `SELECT * FROM events WHERE event_id = $1 FOR UPDATE`,
      [targetEventId],
    );
    const targetEvent = targetRows[0];
    if (!targetEvent) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Target event not found." };
    }
    if (targetEvent.review_status === "MERGED") {
      await client.query("ROLLBACK");
      return { ok: false, error: "Cannot merge into an event that is already merged away." };
    }

    const { rows: moving } = await client.query<{
      source_id: string;
      article_url: string;
      relationship: string;
      is_primary: boolean;
      excerpt: string | null;
    }>(
      `SELECT source_id, article_url, relationship, is_primary, excerpt
       FROM event_sources WHERE event_id = $1`,
      [sourceEventId],
    );

    const { rows: targetPrimaryRow } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM event_sources WHERE event_id = $1 AND is_primary
       ) AS exists`,
      [targetEventId],
    );
    let targetHasPrimary = targetPrimaryRow[0]?.exists ?? false;

    for (const row of moving) {
      const { rows: dupRows } = await client.query(
        `SELECT 1 FROM event_sources
         WHERE event_id = $1 AND source_id = $2 AND article_url = $3
         LIMIT 1`,
        [targetEventId, row.source_id, row.article_url],
      );
      if (dupRows.length > 0) continue;

      let isPrimary = row.is_primary;
      if (isPrimary && targetHasPrimary) isPrimary = false;
      if (isPrimary) targetHasPrimary = true;

      await client.query(
        `INSERT INTO event_sources
           (event_id, source_id, article_url, relationship, is_primary, excerpt)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          targetEventId,
          row.source_id,
          row.article_url,
          row.relationship,
          isPrimary,
          row.excerpt,
        ],
      );
    }

    await client.query(`DELETE FROM event_sources WHERE event_id = $1`, [
      sourceEventId,
    ]);

    const sourceIds = moving.map((r) => r.source_id);
    const auditBefore = eventToAuditJson(sourceEvent);

    await client.query(
      `UPDATE events SET review_status = 'MERGED' WHERE event_id = $1`,
      [sourceEventId],
    );

    await refreshPrimarySourceSnapshot(client, targetEventId);

    await insertReviewAction(client, {
      event_id: sourceEventId,
      action: "MERGE",
      reviewer,
      event_type: sourceEvent.event_type,
      source_ids: sourceIds,
      merged_into_event_id: targetEventId,
      previous_values: auditBefore,
    });

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listMergeTargetOptions(
  excludeEventId: string,
): Promise<{ event_id: string; headline: string; event_date: Date }[]> {
  const { rows } = await getPool().query<{
    event_id: string;
    headline: string;
    event_date: Date;
  }>(
    `SELECT event_id, headline, event_date
     FROM events
     WHERE event_id <> $1 AND review_status <> 'MERGED'
     ORDER BY event_date DESC, headline ASC
     LIMIT 200`,
    [excludeEventId],
  );
  return rows;
}
