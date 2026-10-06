/**
 * Duplicate-pair finding and classification (roadmap step 2.3).
 * Suggestions only: nothing here merges events.
 */
import type { QueryResult, QueryResultRow } from "pg";

/** Headline trigram similarity at or above this is a likely duplicate without a model call. */
export const LIKELY_SIMILARITY = 0.55;
/** Below this a pair is ignored; between the two it is borderline. */
export const BORDERLINE_SIMILARITY = 0.25;
/** Maximum distance between the two events' dates. */
export const DATE_WINDOW_DAYS = 2;
/** PUBLISHED events are compared only if dated within this many days. */
export const PUBLISHED_LOOKBACK_DAYS = 30;

export type Queryable = {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
};

export type PairRow = {
  a_id: string;
  b_id: string;
  a_headline: string;
  b_headline: string;
  a_status: string;
  b_status: string;
  a_date: string;
  b_date: string;
  event_type: string;
  country: string | null;
  similarity: number;
  same_article: boolean;
  a_support: string[] | null;
  b_support: string[] | null;
};

/**
 * Pairs of events with the same type and country, dated within DATE_WINDOW_DAYS, where at
 * least one is a subject (DRAFT or PENDING_REVIEW; any status with subjects = "all").
 * Each pair appears once, lower event_id first (matches duplicate_candidates).
 */
export async function findPairs(
  db: Queryable,
  opts: { subjects: "pending" | "all"; skipExisting: boolean },
): Promise<PairRow[]> {
  const { rows } = await db.query<PairRow>(
    `WITH pool AS (
       SELECT e.event_id, e.headline, e.event_type, e.country, e.event_date, e.review_status,
              (e.review_status IN ('DRAFT', 'PENDING_REVIEW') OR $1::boolean) AS is_subject,
              (SELECT array_agg(s.name ORDER BY s.name)
                 FROM event_sources es JOIN sources s ON s.id = es.source_id
                WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS') AS support_names
       FROM events e
       WHERE e.review_status IN ('DRAFT', 'PENDING_REVIEW')
          OR (e.review_status = 'PUBLISHED'
              AND e.event_date >= (now() AT TIME ZONE 'UTC')::date - $2::int)
     )
     SELECT a.event_id AS a_id, b.event_id AS b_id, a.headline AS a_headline, b.headline AS b_headline,
            a.review_status AS a_status, b.review_status AS b_status,
            a.event_date::text AS a_date, b.event_date::text AS b_date,
            a.event_type::text AS event_type, a.country,
            similarity(a.headline, b.headline)::float8 AS similarity,
            EXISTS (SELECT 1 FROM event_sources x JOIN event_sources y ON y.article_url = x.article_url
                     WHERE x.event_id = a.event_id AND y.event_id = b.event_id) AS same_article,
            a.support_names AS a_support, b.support_names AS b_support
     FROM pool a
     JOIN pool b
       ON a.event_id < b.event_id
      AND a.event_type = b.event_type
      AND a.country IS NOT DISTINCT FROM b.country
      AND abs(a.event_date - b.event_date) <= $3::int
     WHERE (a.is_subject OR b.is_subject)
       AND (NOT $4::boolean OR NOT EXISTS (
             SELECT 1 FROM duplicate_candidates dc
              WHERE dc.event_id = a.event_id AND dc.candidate_event_id = b.event_id))
     ORDER BY similarity DESC, a.event_id, b.event_id`,
    [opts.subjects === "all", PUBLISHED_LOOKBACK_DAYS, DATE_WINDOW_DAYS, opts.skipExisting],
  );
  return rows;
}

/** True when an event has supporting sources and every one is flagged no_ai_processing. */
export function isNoAiOnly(supportNames: string[] | null, noAiSources: ReadonlySet<string>): boolean {
  return !!supportNames && supportNames.length > 0 && supportNames.every((n) => noAiSources.has(n));
}

export type ModelSkip = "NO_AI_SOURCE" | "NO_MODEL" | "SPEND_CAP";

/** Per-run spend cap for the judge (docs/running-costs.md); past it, pairs fall back to trigram only. */
export const DEDUP_MAX_USD = 0.005;

/** True when another judge call could take the run past its call or spend cap. */
export function judgeCapReached(
  totals: { calls: number; costUsd: number },
  limits: { maxCalls: number; maxUsd: number; estimatedCallUsd: number },
): boolean {
  return totals.calls >= limits.maxCalls || totals.costUsd + limits.estimatedCallUsd > limits.maxUsd;
}

export type Classification =
  | { kind: "LIKELY"; basis: "SAME_ARTICLE" | "TRIGRAM" }
  | { kind: "ASK_MODEL" }
  /** Borderline, judged on similarity alone; shown to the reviewer with the reason. */
  | { kind: "BORDERLINE"; skipped: ModelSkip }
  | { kind: "IGNORE" };

export function classifyPair(input: {
  similarity: number;
  sameArticle: boolean;
  /** Either event is supported only by no_ai_processing sources. */
  noAiOnly: boolean;
  /** null when the model may be called; otherwise why it may not. */
  modelUnavailable: "NO_MODEL" | "SPEND_CAP" | null;
}): Classification {
  if (input.sameArticle) return { kind: "LIKELY", basis: "SAME_ARTICLE" };
  if (input.similarity >= LIKELY_SIMILARITY) return { kind: "LIKELY", basis: "TRIGRAM" };
  if (input.similarity < BORDERLINE_SIMILARITY) return { kind: "IGNORE" };
  if (input.noAiOnly) return { kind: "BORDERLINE", skipped: "NO_AI_SOURCE" };
  if (input.modelUnavailable) return { kind: "BORDERLINE", skipped: input.modelUnavailable };
  return { kind: "ASK_MODEL" };
}
