import "server-only";
import type { PoolClient } from "pg";
import { findBannedPhrase } from "@/lib/banned-phrases";
import { getPool } from "@/lib/db";
import {
  SOURCE_RELATIONSHIP_VALUES,
  type ConfidenceLevel,
  type EventType,
  type SourceRelationship,
} from "@/lib/event-labels";
import {
  excerptWordCount,
  HISTORICAL_FIELD_NAMES,
  HISTORICAL_FIELDS,
  HISTORICAL_FIRST_DAY,
  HISTORICAL_LAST_DAY,
  MAX_EXCERPT_WORDS,
  type HistoricalField,
  type HistoricalStatus,
} from "@/lib/historical-rules";
import { isLiveStatementSource, isTier4OnlySupport, LIVE_STATEMENT_SOURCE_ID } from "@/lib/source-labels";
import type { Reliability, SourceType } from "@/lib/source-labels";

/**
 * Admin read and write path for the historical dataset (migration 0008). Separate tables from
 * current events; every write logs a historical_review_actions row in the same transaction.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Text checked for predictive language (banned-phrases.ts), as for current events. */
const BANNED_PHRASE_FIELDS: HistoricalField[] = [
  "headline",
  "summary",
  "activity_description",
  "follow_on_activity",
  "contradiction_notes",
];

export type HistoricalFormValues = Record<HistoricalField, string> & { contradiction_flag: string };

export type HistoricalSourceFormRow = {
  source_id: string;
  article_url: string;
  archived_url: string;
  accessed_at: string;
  relationship: SourceRelationship;
  excerpt: string;
};

export type HistoricalFormErrors = Partial<Record<string, string>>;

export type HistoricalEvent = {
  event_id: string;
  event_date: Date;
  reported_date: Date | null;
  headline: string;
  summary: string | null;
  event_type: EventType;
  confidence_level: ConfidenceLevel;
  review_status: HistoricalStatus;
  human_reviewed: boolean;
  contradiction_flag: boolean;
  phase_tag: string | null;
  source_name: string | null;
  created_at: Date;
  updated_at: Date;
} & Record<HistoricalField, unknown>;

export type HistoricalSourceRow = {
  source_id: string;
  name: string;
  tier: number | null;
  reliability: Reliability;
  source_type: SourceType;
  source_country: string | null;
  historical_only: boolean;
  article_url: string;
  archived_url: string | null;
  accessed_at: Date;
  relationship: SourceRelationship;
  is_primary: boolean;
  excerpt: string;
};

export type HistoricalActionRow = {
  id: string;
  action: "CREATE" | "EDIT" | "APPROVE" | "REJECT" | "UNPUBLISH";
  reviewer: string;
  event_type: EventType;
  source_ids: string[];
  previous_values: Record<string, unknown> | null;
  created_at: Date;
};

export type HistoricalListItem = {
  event_id: string;
  event_date: Date;
  headline: string;
  event_type: EventType;
  review_status: HistoricalStatus;
  phase_tag: string | null;
  source_count: number;
};

// ---------------------------------------------------------------------------
// Form parsing and validation
// ---------------------------------------------------------------------------

function dayString(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? "" : String(value);
}

export function emptyHistoricalFormValues(): HistoricalFormValues {
  const values = Object.fromEntries(HISTORICAL_FIELD_NAMES.map((f) => [f, ""])) as HistoricalFormValues;
  values.event_type = "EXERCISE";
  values.confidence_level = "UNVERIFIED";
  values.contradiction_flag = "";
  return values;
}

export function historicalFormValuesFrom(formData: FormData): HistoricalFormValues {
  const values = Object.fromEntries(
    HISTORICAL_FIELD_NAMES.map((f) => [f, String(formData.get(f) ?? "")]),
  ) as HistoricalFormValues;
  values.contradiction_flag = formData.get("contradiction_flag") === "on" ? "on" : "";
  return values;
}

export function historicalFormValuesFromEvent(event: HistoricalEvent): HistoricalFormValues {
  const values = Object.fromEntries(
    HISTORICAL_FIELD_NAMES.map((f) => [
      f,
      HISTORICAL_FIELDS[f].kind === "date" ? dayString(event[f]) : event[f] == null ? "" : String(event[f]),
    ]),
  ) as HistoricalFormValues;
  values.contradiction_flag = event.contradiction_flag ? "on" : "";
  return values;
}

export function historicalSourceRowsFrom(formData: FormData): HistoricalSourceFormRow[] {
  const indexes = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^hs_(\d+)_source_id$/);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((i) => ({
      source_id: String(formData.get(`hs_${i}_source_id`) ?? ""),
      article_url: String(formData.get(`hs_${i}_article_url`) ?? ""),
      archived_url: String(formData.get(`hs_${i}_archived_url`) ?? ""),
      accessed_at: String(formData.get(`hs_${i}_accessed_at`) ?? ""),
      relationship: (String(formData.get(`hs_${i}_relationship`) ?? "SUPPORTS") as SourceRelationship),
      excerpt: String(formData.get(`hs_${i}_excerpt`) ?? ""),
    }));
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type HistoricalWritePayload = {
  event: Record<HistoricalField, string | null> & { contradiction_flag: boolean };
  sources: Array<
    Omit<HistoricalSourceFormRow, "archived_url"> & { archived_url: string | null; is_primary: boolean }
  >;
};

export type HistoricalValidation =
  | { ok: true; payload: HistoricalWritePayload }
  | { ok: false; errors: HistoricalFormErrors };

/** Checks the form; source rows must name registry sources that exist. */
export async function validateHistoricalForm(
  values: HistoricalFormValues,
  rows: HistoricalSourceFormRow[],
  primaryIndex: number,
): Promise<HistoricalValidation> {
  const errors: HistoricalFormErrors = {};
  const event = {} as HistoricalWritePayload["event"];

  for (const name of HISTORICAL_FIELD_NAMES) {
    const spec: { kind: string; values?: readonly string[]; required?: boolean } = HISTORICAL_FIELDS[name];
    const value = values[name].trim();
    if (!value) {
      if (spec.required) errors[name] = "Required.";
      event[name] = null;
      continue;
    }
    if (spec.kind === "date" && !isRealDate(value)) errors[name] = "Use a real date (YYYY-MM-DD).";
    if (spec.kind === "enum" && !spec.values!.includes(value)) errors[name] = "Choose a listed value.";
    event[name] = value;
  }
  event.contradiction_flag = values.contradiction_flag === "on";

  const date = event.event_date;
  if (date && !errors.event_date && (date < HISTORICAL_FIRST_DAY || date > HISTORICAL_LAST_DAY)) {
    errors.event_date = "Historical events are dated 1 Aug 2020 – 28 Feb 2022.";
  }
  if (event.headline && event.headline.length > 500) errors.headline = "Keep the headline under 500 characters.";
  for (const [start, end] of [
    ["announced_start_date", "announced_end_date"],
    ["observed_start_date", "observed_end_date"],
  ] as const) {
    if (event[start] && event[end] && event[end]! < event[start]!) errors[end] = "End is before start.";
  }
  for (const name of BANNED_PHRASE_FIELDS) {
    const phrase = event[name] ? findBannedPhrase(event[name]!) : null;
    if (phrase) errors[name] = `Remove predictive language ("${phrase}").`;
  }

  const filled = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.source_id.trim() || row.article_url.trim() || row.excerpt.trim());
  if (filled.length === 0) errors.hs_0_source_id = "Attach at least one source with an excerpt.";

  const sources: HistoricalWritePayload["sources"] = [];
  const known = new Set(
    filled.length
      ? (
          await getPool().query<{ id: string }>(`SELECT id FROM sources WHERE id = ANY($1::uuid[])`, [
            filled.map(({ row }) => row.source_id.trim()).filter((id) => UUID_RE.test(id)),
          ])
        ).rows.map((r) => r.id)
      : [],
  );

  for (const { row, index } of filled) {
    const p = `hs_${index}`;
    const source_id = row.source_id.trim();
    const article_url = row.article_url.trim();
    const archived_url = row.archived_url.trim();
    const accessed_at = row.accessed_at.trim();
    const excerpt = row.excerpt.trim();
    const is_primary = index === primaryIndex;

    if (!UUID_RE.test(source_id) || !known.has(source_id)) errors[`${p}_source_id`] = "Choose a registry source.";
    else if (isLiveStatementSource(source_id)) errors[`${p}_source_id`] = "Live statements can be attached to current events only.";
    if (!isHttpUrl(article_url)) errors[`${p}_article_url`] = "Enter the full article URL.";
    if (archived_url && !isHttpUrl(archived_url)) errors[`${p}_archived_url`] = "Enter a full archive URL.";
    if (!isRealDate(accessed_at)) errors[`${p}_accessed_at`] = "Enter the date you read the source.";
    if (!SOURCE_RELATIONSHIP_VALUES.includes(row.relationship)) errors[`${p}_relationship`] = "Choose a relationship.";
    if (is_primary && row.relationship === "CONTRADICTS") {
      errors[`${p}_relationship`] = "A contradicting source cannot be primary.";
    }
    const words = excerptWordCount(excerpt);
    if (words === 0) errors[`${p}_excerpt`] = "Quote a short excerpt from the source.";
    else if (words > MAX_EXCERPT_WORDS) {
      errors[`${p}_excerpt`] = `Keep the excerpt to ${MAX_EXCERPT_WORDS} words or fewer (now ${words}).`;
    }

    sources.push({ source_id, article_url, archived_url: archived_url || null, accessed_at, relationship: row.relationship, excerpt, is_primary });
  }
  if (filled.length > 0 && sources.filter((s) => s.is_primary).length !== 1) {
    errors.hs_0_source_id = "Mark one filled-in source as primary.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, payload: { event, sources } };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listHistoricalEvents(status: HistoricalStatus | null): Promise<HistoricalListItem[]> {
  const { rows } = await getPool().query<HistoricalListItem>(
    `SELECT h.event_id, h.event_date, h.headline, h.event_type, h.review_status, h.phase_tag,
            (SELECT count(*)::int FROM historical_event_sources hs WHERE hs.event_id = h.event_id) AS source_count
     FROM historical_events h
     WHERE $1::text IS NULL OR h.review_status::text = $1
     ORDER BY h.event_date ASC, h.created_at ASC`,
    [status],
  );
  return rows;
}

export async function countHistoricalByStatus(): Promise<Record<HistoricalStatus, number>> {
  const { rows } = await getPool().query<{ review_status: HistoricalStatus; n: number }>(
    `SELECT review_status, count(*)::int AS n FROM historical_events GROUP BY review_status`,
  );
  const counts = { DRAFT: 0, PUBLISHED: 0, REJECTED: 0 };
  for (const r of rows) counts[r.review_status] = r.n;
  return counts;
}

export async function getHistoricalEvent(id: string): Promise<HistoricalEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<HistoricalEvent>(`SELECT * FROM historical_events WHERE event_id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listHistoricalEventSources(id: string): Promise<HistoricalSourceRow[]> {
  if (!UUID_RE.test(id)) return [];
  const { rows } = await getPool().query<HistoricalSourceRow>(
    `SELECT s.id AS source_id, s.name, s.tier, s.reliability, s.source_type, s.source_country, s.historical_only,
            hs.article_url, hs.archived_url, hs.accessed_at, hs.relationship, hs.is_primary, hs.excerpt
     FROM historical_event_sources hs JOIN sources s ON s.id = hs.source_id
     WHERE hs.event_id = $1
     ORDER BY hs.is_primary DESC, hs.relationship ASC, s.tier ASC NULLS LAST, lower(s.name)`,
    [id],
  );
  return rows;
}

export async function listHistoricalActions(id: string): Promise<HistoricalActionRow[]> {
  if (!UUID_RE.test(id)) return [];
  const { rows } = await getPool().query<HistoricalActionRow>(
    `SELECT id, action, reviewer, event_type, source_ids, previous_values, created_at
     FROM historical_review_actions WHERE event_id = $1 ORDER BY created_at ASC, id`,
    [id],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Writes (each in one transaction with its audit row)
// ---------------------------------------------------------------------------

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

/** Messages for the 0008 trigger and constraint errors, so the form never shows a raw DB error. */
export function historicalDbErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (/must have at least one SUPPORTS source/.test(message)) {
    return "A published historical event must keep at least one supporting source.";
  }
  if (/needs a Tier 1-3 SUPPORTS source/.test(message)) {
    return "A published historical event needs a supporting Tier 1–3 source; Tier 4 alone cannot be published.";
  }
  if (/excerpt_short/.test(message)) return `Each excerpt must be 1–${MAX_EXCERPT_WORDS} words.`;
  if (/primary_must_support/.test(message)) return "A contradicting source cannot be primary.";
  return null;
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function logAction(
  client: PoolClient,
  eventId: string,
  action: HistoricalActionRow["action"],
  reviewer: string,
  previous: Record<string, unknown> | null,
): Promise<void> {
  await client.query(
    `INSERT INTO historical_review_actions (event_id, action, reviewer, event_type, source_ids, previous_values, created_at)
     SELECT h.event_id, $2::historical_action, $3::text, h.event_type,
            coalesce((SELECT array_agg(hs.source_id ORDER BY hs.source_id) FROM historical_event_sources hs
                      WHERE hs.event_id = h.event_id), '{}'),
            $4::jsonb, clock_timestamp()
     FROM historical_events h WHERE h.event_id = $1`,
    [eventId, action, reviewer, previous],
  );
}

async function writeSources(client: PoolClient, eventId: string, payload: HistoricalWritePayload): Promise<void> {
  await client.query(`DELETE FROM historical_event_sources WHERE event_id = $1`, [eventId]);
  for (const s of payload.sources) {
    await client.query(
      `INSERT INTO historical_event_sources
         (event_id, source_id, article_url, archived_url, accessed_at, relationship, is_primary, excerpt)
       VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)`,
      [eventId, s.source_id, s.article_url, s.archived_url, s.accessed_at, s.relationship, s.is_primary, s.excerpt],
    );
  }
  // Primary-source snapshot on the event row, as for current events.
  await client.query(
    `UPDATE historical_events h SET
       source_name = s.name, source_url = hs.article_url, source_type = s.source_type,
       source_country = s.source_country, source_language = s.source_language, source_reliability = s.reliability
     FROM historical_event_sources hs JOIN sources s ON s.id = hs.source_id
     WHERE h.event_id = $1 AND hs.event_id = h.event_id AND hs.is_primary`,
    [eventId],
  );
}

const COLUMN_LIST = [...HISTORICAL_FIELD_NAMES, "contradiction_flag"];
const columnValues = (payload: HistoricalWritePayload) =>
  COLUMN_LIST.map((c) => payload.event[c as keyof HistoricalWritePayload["event"]]);

export async function createHistoricalEvent(payload: HistoricalWritePayload, reviewer: string): Promise<WriteResult> {
  try {
    const id = await inTransaction(async (client) => {
      const { rows } = await client.query<{ event_id: string }>(
        `INSERT INTO historical_events (${COLUMN_LIST.join(", ")})
         VALUES (${COLUMN_LIST.map((_, i) => `$${i + 1}`).join(", ")})
         RETURNING event_id`,
        columnValues(payload),
      );
      const eventId = rows[0].event_id;
      await writeSources(client, eventId, payload);
      await logAction(client, eventId, "CREATE", reviewer, null);
      return eventId;
    });
    return { ok: true, id };
  } catch (error) {
    const message = historicalDbErrorMessage(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
}

export async function updateHistoricalEvent(
  id: string,
  payload: HistoricalWritePayload,
  reviewer: string,
): Promise<WriteResult> {
  try {
    return await inTransaction(async (client) => {
      const { rows } = await client.query<HistoricalEvent>(
        `SELECT * FROM historical_events WHERE event_id = $1 FOR UPDATE`,
        [id],
      );
      const existing = rows[0];
      if (!existing) return { ok: false, error: "Historical event not found." } as const;
      await logAction(client, id, "EDIT", reviewer, { ...existing });
      await client.query(
        `UPDATE historical_events SET ${COLUMN_LIST.map((c, i) => `${c} = $${i + 2}`).join(", ")}
         WHERE event_id = $1`,
        [id, ...columnValues(payload)],
      );
      await writeSources(client, id, payload);
      return { ok: true, id } as const;
    });
  } catch (error) {
    const message = historicalDbErrorMessage(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
}

async function changeStatus(
  id: string,
  reviewer: string,
  action: "APPROVE" | "REJECT" | "UNPUBLISH",
  from: HistoricalStatus,
  check: (event: HistoricalEvent, client: PoolClient) => Promise<string | null>,
  update: { sql: string; values: unknown[] },
  extra: Record<string, unknown> = {},
): Promise<WriteResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Historical event not found." };
  try {
    return await inTransaction(async (client) => {
      const { rows } = await client.query<HistoricalEvent>(
        `SELECT * FROM historical_events WHERE event_id = $1 FOR UPDATE`,
        [id],
      );
      const event = rows[0];
      if (!event) return { ok: false, error: "Historical event not found." } as const;
      if (event.review_status !== from) {
        return { ok: false, error: `Only ${from.toLowerCase()} items can be changed this way.` } as const;
      }
      const problem = await check(event, client);
      if (problem) return { ok: false, error: problem } as const;
      await client.query(update.sql, [id, ...update.values]);
      await logAction(client, id, action, reviewer, { review_status: event.review_status, ...extra });
      return { ok: true, id } as const;
    });
  } catch (error) {
    const message = historicalDbErrorMessage(error);
    if (message) return { ok: false, error: message };
    throw error;
  }
}

/** DRAFT → PUBLISHED. Same evidence rules as current events, checked here and by the 0008 triggers. */
export function approveHistoricalEvent(id: string, reviewer: string, confidence: ConfidenceLevel) {
  return changeStatus(
    id,
    reviewer,
    "APPROVE",
    "DRAFT",
    async (event, client) => {
      const { rows } = await client.query<{ tier: number | null }>(
        `SELECT s.tier FROM historical_event_sources hs JOIN sources s ON s.id = hs.source_id
         WHERE hs.event_id = $1 AND hs.relationship = 'SUPPORTS'`,
        [event.event_id],
      );
      if (rows.length === 0) return "Attach at least one supporting source before publishing.";
      if (isTier4OnlySupport(rows.map((r) => r.tier))) {
        return "Needs a supporting Tier 1–3 source; Tier 4 alone cannot be published.";
      }
      for (const field of BANNED_PHRASE_FIELDS) {
        const value = event[field];
        const phrase = typeof value === "string" ? findBannedPhrase(value) : null;
        if (phrase) return `Remove predictive language from ${field.replace(/_/g, " ")} ("${phrase}") before publishing.`;
      }
      return null;
    },
    {
      sql: `UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true, confidence_level = $2
            WHERE event_id = $1`,
      values: [confidence],
    },
  );
}

export function rejectHistoricalEvent(id: string, reviewer: string, reason: string) {
  return changeStatus(
    id,
    reviewer,
    "REJECT",
    "DRAFT",
    async () => null,
    { sql: `UPDATE historical_events SET review_status = 'REJECTED' WHERE event_id = $1`, values: [] },
    reason.trim() ? { reject_reason: reason.trim().slice(0, 500) } : {},
  );
}

/** PUBLISHED → DRAFT, back into the queue for another review. */
export function unpublishHistoricalEvent(id: string, reviewer: string, reason: string) {
  return changeStatus(
    id,
    reviewer,
    "UNPUBLISH",
    "PUBLISHED",
    async () => null,
    {
      sql: `UPDATE historical_events SET review_status = 'DRAFT', human_reviewed = false WHERE event_id = $1`,
      values: [],
    },
    reason.trim() ? { unpublish_reason: reason.trim().slice(0, 500) } : {},
  );
}

/** Every registry source except the live-statement one, labelled with its tier, for the historical source picker. */
export async function listHistoricalSourceOptions(): Promise<Array<{ id: string; label: string }>> {
  const { rows } = await getPool().query<{ id: string; name: string; tier: number | null; historical_only: boolean }>(
    `SELECT id, name, tier, historical_only FROM sources WHERE id <> $1 ORDER BY tier ASC NULLS LAST, lower(name) ASC`,
    [LIVE_STATEMENT_SOURCE_ID],
  );
  return rows.map((s) => ({
    id: s.id,
    label: `${s.name} · ${s.tier === null ? "no tier" : `Tier ${s.tier}`}${s.historical_only ? " · historical only" : ""}`,
  }));
}

export function historicalSourceFormRows(rows: HistoricalSourceRow[]): HistoricalSourceFormRow[] {
  return rows.map((r) => ({
    source_id: r.source_id,
    article_url: r.article_url,
    archived_url: r.archived_url ?? "",
    accessed_at: r.accessed_at.toISOString().slice(0, 10),
    relationship: r.relationship,
    excerpt: r.excerpt,
  }));
}

/** How often the historical record cites a source (rows and audit entries); used before deleting it. */
export async function countHistoricalSourceReferences(
  sourceId: string,
): Promise<{ historical_sources: number; historical_actions: number }> {
  const { rows } = await getPool().query<{ historical_sources: number; historical_actions: number }>(
    `SELECT
       (SELECT count(*)::int FROM historical_event_sources WHERE source_id = $1) AS historical_sources,
       (SELECT count(*)::int FROM historical_review_actions WHERE $1 = ANY (source_ids)) AS historical_actions`,
    [sourceId],
  );
  return rows[0];
}
