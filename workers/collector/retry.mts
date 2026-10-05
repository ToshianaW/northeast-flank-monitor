/**
 * One retry of the article-page fetch for recently stored rows whose first attempt failed for a
 * reason that can be temporary (no_article_body, too_short, timeout). Never for robots refusals,
 * paywalled items, skipped rows or any barred / no-AI / lead-only source: the same eligibility
 * rules as the first attempt apply. Each row is retried at most once (metadata.full_text_retried).
 * Pages go through HttpClient (robots.txt, rate limits), follow same-host redirects only, and
 * count against the run's page cap after new items. Pure apart from the injected HttpClient.
 */
import { fetchFullText, fullTextIneligibility, type FullTextLimits, type FullTextScope } from "./article.mjs";
import type { HttpClient } from "./fetch.mjs";
import type { CollectedDoc } from "./store.mjs";

export const RETRYABLE_REASONS = ["no_article_body", "too_short", "timeout"] as const;
export const RETRY_WINDOW_HOURS = 24;

/** A stored raw_documents row, as read for a retry. */
export type StoredRow = {
  id: string;
  url: string;
  collector_key: string;
  title: string | null;
  fetched_at: Date;
  raw_text: string | null;
  status: "NEW" | "PROCESSED" | "SKIPPED";
  metadata: Record<string, unknown>;
};

/** Why a row is not retried, or null when it may be. */
export function retryIneligibility(
  row: StoredRow,
  scope: FullTextScope | undefined,
  now: Date,
): string | null {
  if (!scope) return "no_scope";
  const reason = row.metadata.full_text_error;
  if (typeof reason !== "string" || !(RETRYABLE_REASONS as readonly string[]).includes(reason)) return "not_retryable_reason";
  if (row.metadata.full_text_retried === true) return "already_retried";
  if (now.getTime() - row.fetched_at.getTime() > RETRY_WINDOW_HOURS * 3_600_000) return "too_old";
  if (row.status === "SKIPPED" || typeof row.metadata.skip_reason === "string") return "skipped_row";
  // The first attempt's rules: master switch, opt-in, paywall, barred domains, no-AI, lead-only.
  const asDoc = { url: row.url, metadata: row.metadata } as CollectedDoc;
  return fullTextIneligibility(asDoc, scope);
}

/** What to write back for one retried row. */
export type RetryUpdate =
  | {
      id: string;
      recovered: true;
      rawText: string;
      /** Metadata without full_text_error, with full_text and full_text_retried. */
      metadata: Record<string, unknown>;
    }
  | { id: string; recovered: false; metadata: Record<string, unknown> };

export type RetryCounts = { retried: number; recovered: number; capped: number };

/**
 * Retries eligible rows in order until the page budget runs out. A recovered row gets the article
 * text (longer than what it had and at least the minimum length); any other outcome only marks
 * the row as retried, leaving its text and status alone.
 */
export async function retryFullText(
  http: Pick<HttpClient, "get">,
  rows: readonly StoredRow[],
  scopeFor: (collectorKey: string) => FullTextScope | undefined,
  limits: FullTextLimits,
  budget: { remaining: number },
  now: Date,
): Promise<{ updates: RetryUpdate[]; counts: RetryCounts }> {
  const updates: RetryUpdate[] = [];
  const counts: RetryCounts = { retried: 0, recovered: 0, capped: 0 };
  for (const row of rows) {
    if (retryIneligibility(row, scopeFor(row.collector_key), now) !== null) continue;
    if (budget.remaining <= 0) {
      counts.capped++;
      continue;
    }
    budget.remaining--;
    counts.retried++;
    const result = await fetchFullText(http, row.url, limits, { redirect: "same-host" });
    const before = row.raw_text?.length ?? 0;
    if (result.ok && result.text.length > before) {
      const { full_text_error: _dropped, ...rest } = row.metadata;
      void _dropped;
      updates.push({
        id: row.id,
        recovered: true,
        rawText: result.text,
        metadata: { ...rest, full_text: { chars: result.text.length, feed_chars: before }, full_text_retried: true },
      });
      counts.recovered++;
    } else {
      updates.push({
        id: row.id,
        recovered: false,
        metadata: { ...row.metadata, full_text_retried: true, full_text_retry_error: result.ok ? "not_longer_than_feed_text" : result.reason },
      });
    }
  }
  return { updates, counts };
}
