/**
 * Posts queued items to X (migration 0009 queues a row when a current event, exercise or daily
 * digest becomes PUBLISHED). Used by the admin actions right after a save (src/lib/x-posting.ts)
 * and by `npm run x:post` (workers/x/post.mts) for dry runs and retries.
 *
 * Events and exercises post their reviewed summary and original source link; digests post their
 * Summary section and a link to the digest page (needs the public site URL). Unpublishing never
 * deletes a post. Never logs credentials.
 */
import type { QueryResult, QueryResultRow } from "pg";
import { oauthHeader, type OAuthCredentials } from "./x-oauth1";
import { buildPostText, digestPostInput, postWeight } from "./x-text";

export type Queryable = {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
};

export const MAX_ATTEMPTS = 3;
const POST_URL = "https://api.x.com/2/tweets";

export type XSettings = {
  /** X_POSTING_ENABLED=true and all four keys are set. */
  enabled: boolean;
  creds: OAuthCredentials | null;
  missing: string[];
  dailyCap: number;
  siteUrl: string | null;
};

export function xSettingsFromEnv(env: Record<string, string | undefined>): XSettings {
  const names = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"] as const;
  const missing = names.filter((n) => !env[n]?.trim());
  const creds = missing.length
    ? null
    : {
        consumerKey: env.X_API_KEY!.trim(),
        consumerSecret: env.X_API_SECRET!.trim(),
        accessToken: env.X_ACCESS_TOKEN!.trim(),
        accessTokenSecret: env.X_ACCESS_TOKEN_SECRET!.trim(),
      };
  const cap = Number(env.X_DAILY_CAP ?? "20");
  return {
    enabled: env.X_POSTING_ENABLED === "true" && creds !== null,
    creds,
    missing,
    dailyCap: Number.isInteger(cap) && cap >= 0 ? cap : 20,
    siteUrl: env.PUBLIC_SITE_URL?.trim() || null,
  };
}

type Queued = {
  id: string;
  item_kind: "event" | "exercise" | "digest";
  item_id: string;
  attempts: number;
  published: boolean;
  headline: string | null;
  summary: string | null;
  digest_date: string | null;
  digest_sections: Record<string, unknown> | null;
  source_url: string | null;
  /** The event's country, or the exercise's countries; null for digests. */
  countries: Array<string | null> | null;
  /** Set by the reviewer at approval (migration 0014). */
  breaking: boolean;
};

export type XQueueOptions = {
  /** false: dry run, reads only and writes nothing. */
  live: boolean;
  creds: OAuthCredentials | null;
  limit: number;
  dailyCap: number;
  siteUrl: string | null;
  log?: (line: string) => void;
};

export type XQueueResult = { queued: number; postedToday: number; posted: number; skipped: number; failed: number; wouldPost: number; held: number; capped: number };

export async function processXQueue(db: Queryable, opts: XQueueOptions): Promise<XQueueResult> {
  const log = opts.log ?? (() => {});
  if (opts.live && !opts.creds) throw new Error("live posting needs credentials");

  /** The item's reviewed summary and its primary supporting source link (never a contradicting one). */
  const { rows: queue } = await db.query<Queued>(
    `SELECT o.id, o.item_kind, o.item_id, o.attempts,
            COALESCE(e.review_status = 'PUBLISHED', x.review_status = 'PUBLISHED', d.review_status = 'PUBLISHED', false) AS published,
            COALESCE(e.headline, x.exercise_name, d.title) AS headline,
            COALESCE(e.summary, x.summary) AS summary,
            d.digest_date::text AS digest_date,
            d.sections AS digest_sections,
            CASE o.item_kind WHEN 'event' THEN ARRAY[e.country] WHEN 'exercise' THEN x.countries END AS countries,
            COALESCE(e.x_breaking, false) AS breaking,
            CASE o.item_kind
              WHEN 'event' THEN COALESCE(
                (SELECT es.article_url FROM event_sources es
                  WHERE es.event_id = e.event_id AND es.relationship = 'SUPPORTS' AND es.article_url IS NOT NULL
                  ORDER BY es.is_primary DESC, es.created_at ASC LIMIT 1),
                e.source_url)
              ELSE (SELECT xs.article_url FROM exercise_sources xs
                     WHERE xs.exercise_id = x.id ORDER BY xs.is_primary DESC, xs.created_at ASC LIMIT 1)
            END AS source_url
     FROM x_post_outbox o
     LEFT JOIN events e ON o.item_kind = 'event' AND e.event_id = o.item_id
     LEFT JOIN exercises x ON o.item_kind = 'exercise' AND x.id = o.item_id
     LEFT JOIN daily_digests d ON o.item_kind = 'digest' AND d.id = o.item_id
     WHERE o.status = 'PENDING' OR (o.status = 'FAILED' AND o.attempts < $1)
     ORDER BY o.created_at ASC
     LIMIT $2`,
    [MAX_ATTEMPTS, opts.limit],
  );

  const { rows: [{ n: postedToday }] } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM x_post_outbox WHERE status = 'POSTED' AND posted_at > now() - interval '24 hours'`,
  );
  let budget = Math.max(0, opts.dailyCap - postedToday);
  const r: XQueueResult = { queued: queue.length, postedToday, posted: 0, skipped: 0, failed: 0, wouldPost: 0, held: 0, capped: 0 };

  for (const item of queue) {
    const label = `${item.item_kind} ${item.item_id}`;
    if (!item.published) {
      if (opts.live) await db.query(`UPDATE x_post_outbox SET status = 'SKIPPED', last_error = 'no longer published' WHERE id = $1`, [item.id]);
      r.skipped += 1;
      log(`skipped ${label}: no longer published`);
      continue;
    }
    if (item.item_kind === "digest" && !opts.siteUrl) {
      // Left queued (not skipped), so it posts once PUBLIC_SITE_URL is set.
      r.held += 1;
      log(`held digest ${item.digest_date}: PUBLIC_SITE_URL is not set, so there is no link to the digest page`);
      continue;
    }
    const built = buildPostText(
      item.item_kind === "digest"
        ? digestPostInput({ digest_date: item.digest_date!, title: item.headline ?? "", sections: item.digest_sections ?? {} }, opts.siteUrl)
        : {
            summary: item.summary,
            headline: item.headline ?? "",
            sourceUrl: item.source_url,
            alert: { countries: item.countries ?? [], breaking: item.breaking },
          },
    );
    if (!built.ok) {
      if (opts.live) await db.query(`UPDATE x_post_outbox SET status = 'SKIPPED', last_error = $2 WHERE id = $1`, [item.id, built.reason]);
      r.skipped += 1;
      log(`skipped ${label}: ${built.reason}`);
      continue;
    }
    if (!opts.live) {
      r.wouldPost += 1;
      log(`would post ${label} (${postWeight(built.text)}/280):\n    ${built.text.replace(/\n/g, "\n    ")}`);
      continue;
    }
    if (budget <= 0) {
      r.capped += 1;
      continue;
    }
    // Claim the row first, so two saves at the same moment cannot post the same item twice.
    const claim = await db.query(
      `UPDATE x_post_outbox SET attempts = attempts + 1
       WHERE id = $1 AND attempts = $2 AND status IN ('PENDING', 'FAILED') RETURNING id`,
      [item.id, item.attempts],
    );
    if (claim.rowCount !== 1) continue;
    try {
      const res = await fetch(POST_URL, {
        method: "POST",
        headers: { Authorization: oauthHeader("POST", POST_URL, opts.creds!), "Content-Type": "application/json" },
        body: JSON.stringify({ text: built.text }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; title?: string; detail?: string };
      if (res.ok && body.data?.id) {
        await db.query(
          `UPDATE x_post_outbox SET status = 'POSTED', post_id = $2, post_text = $3, posted_at = now(), last_error = NULL WHERE id = $1`,
          [item.id, body.data.id, built.text],
        );
        r.posted += 1;
        budget -= 1;
        log(`posted ${label} → post ${body.data.id}`);
      } else {
        const error = `HTTP ${res.status}${body.title ? ` ${body.title}` : ""}${body.detail ? `: ${body.detail}` : ""}`.slice(0, 300);
        await db.query(`UPDATE x_post_outbox SET status = 'FAILED', last_error = $2 WHERE id = $1`, [item.id, error]);
        r.failed += 1;
        log(`failed ${label}: ${error}`);
        if (res.status === 429) break; // rate limited: stop, retry on the next save or x:post run
      }
    } catch (error) {
      const message = (error instanceof Error ? error.name : "Error").slice(0, 100);
      await db.query(`UPDATE x_post_outbox SET status = 'FAILED', last_error = $2 WHERE id = $1`, [item.id, message]);
      r.failed += 1;
      log(`failed ${label}: ${message}`);
    }
  }
  return r;
}
