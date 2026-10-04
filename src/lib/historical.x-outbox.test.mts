/**
 * X post queue triggers (migration 0009): publishing a current event or exercise queues one
 * post; publishing again does not queue another; unpublishing removes nothing; historical
 * events are never queued. Posting (src/lib/x-queue.ts) is tested with a fake fetch: X is never called.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local). Skipped until migration 0009 is applied.
 * Everything runs in one transaction that is rolled back: no test row is ever committed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";
import { MAX_ATTEMPTS, processXQueue, xSettingsFromEnv } from "./x-queue";

const db = await openRollbackDb();
const { rows: [{ applied }] } = await db.client.query<{ applied: boolean }>(
  "SELECT to_regclass('public.x_post_outbox') IS NOT NULL AS applied",
);
const skip = applied ? false : "migration 0009 not applied";
const q = (text: string, values?: unknown[]) => db.client.query(text, values);
const tag = `zz-x-${randomUUID().slice(0, 8)}`;
const queued = async (kind: string, id: string) =>
  (await q(`SELECT count(*)::int AS n FROM x_post_outbox WHERE item_kind = $1 AND item_id = $2`, [kind, id])).rows[0].n as number;

let sourceId = "";

test("setup: a Tier 1 source", { skip }, async () => {
  const { rows } = await q(`INSERT INTO sources (name, tier) VALUES ($1, 1) RETURNING id`, [`${tag} source`]);
  sourceId = rows[0].id;
});

test("publishing an event queues one post; republishing does not queue another; unpublishing deletes nothing", { skip }, async () => {
  const { rows } = await q(
    `INSERT INTO events (event_date, headline, event_type) VALUES ('2026-10-01', $1, 'AIR_ACTIVITY') RETURNING event_id`,
    [tag],
  );
  const id = rows[0].event_id;
  await q(`INSERT INTO event_sources (event_id, source_id, article_url, is_primary) VALUES ($1, $2, 'https://example.org/a', true)`, [id, sourceId]);
  assert.equal(await queued("event", id), 0, "drafts are not queued");
  await q(`UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);
  assert.equal(await queued("event", id), 1);
  await q(`UPDATE events SET review_status = 'DRAFT' WHERE event_id = $1`, [id]);
  assert.equal(await queued("event", id), 1, "unpublishing keeps the queued/posted row");
  await q(`UPDATE events SET review_status = 'PUBLISHED' WHERE event_id = $1`, [id]);
  assert.equal(await queued("event", id), 1, "publishing again does not post again");
  await q(`UPDATE events SET headline = $2 WHERE event_id = $1`, [id, `${tag} edited`]);
  assert.equal(await queued("event", id), 1, "edits to a published event do not queue a post");
});

test("publishing an exercise queues one post", { skip }, async () => {
  const { rows } = await q(`INSERT INTO exercises (exercise_name) VALUES ($1) RETURNING id`, [tag]);
  const id = rows[0].id;
  await q(`INSERT INTO exercise_sources (exercise_id, source_id, article_url, is_primary) VALUES ($1, $2, 'https://example.org/x', true)`, [id, sourceId]);
  await q(`UPDATE exercises SET review_status = 'PUBLISHED' WHERE id = $1`, [id]);
  assert.equal(await queued("exercise", id), 1);
});

test("publishing a daily digest queues one post", { skip }, async () => {
  const { rows } = await q(
    `INSERT INTO daily_digests (digest_date, title, sections) VALUES ('1999-01-01', $1, '{}') RETURNING id`,
    [tag],
  );
  const id = rows[0].id;
  assert.equal(await queued("digest", id), 0, "drafts are not queued");
  await q(`UPDATE daily_digests SET review_status = 'PUBLISHED' WHERE id = $1`, [id]);
  assert.equal(await queued("digest", id), 1);
});

test("historical events are never queued", { skip }, async () => {
  const { rows } = await q(
    `INSERT INTO historical_events (event_date, headline, event_type) VALUES ('2021-02-11', $1, 'POLITICAL_SIGNALING') RETURNING event_id`,
    [tag],
  );
  const id = rows[0].event_id;
  await q(
    `INSERT INTO historical_event_sources (event_id, source_id, article_url, accessed_at, is_primary, excerpt) VALUES ($1, $2, 'https://example.org/h', now(), true, 'Short excerpt here.')`,
    [id, sourceId],
  );
  await q(`UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);
  const { rows: [{ n }] } = await q(`SELECT count(*)::int AS n FROM x_post_outbox WHERE item_id = $1`, [id]);
  assert.equal(n, 0);
});

/** Replaces fetch for one test; X is never called. Counts posts that carry this run's tag. */
async function withFakeX<T>(respond: () => Response, run: (calls: string[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const text = JSON.parse(String(init?.body ?? "{}")).text as string;
    if (text.includes(tag)) calls.push(text);
    return respond();
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const fakeCreds = { consumerKey: "k", consumerSecret: "s", accessToken: "t", accessTokenSecret: "ts" };
const ok = () => new Response(JSON.stringify({ data: { id: "1234567890" } }), { status: 201 });
const runQueue = (live: boolean) =>
  processXQueue(db.client, { live, creds: live ? fakeCreds : null, limit: 50, dailyCap: 1000, siteUrl: "https://example.org" });
const status = async (id: string) =>
  (await q(`SELECT status, post_id, attempts FROM x_post_outbox WHERE item_id = $1`, [id])).rows[0] as { status: string; post_id: string | null; attempts: number };

async function publishedEvent(summary: string): Promise<string> {
  const { rows } = await q(
    `INSERT INTO events (event_date, headline, summary, event_type) VALUES ('2026-10-01', $1, $2, 'AIR_ACTIVITY') RETURNING event_id`,
    [`${tag} headline`, summary],
  );
  const id = rows[0].event_id;
  await q(`INSERT INTO event_sources (event_id, source_id, article_url, is_primary) VALUES ($1, $2, 'https://example.org/src', true)`, [id, sourceId]);
  await q(`UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);
  return id;
}

test("posting: a dry run writes nothing and calls nothing", { skip }, async () => {
  const id = await publishedEvent(`${tag} dry run summary.`);
  await withFakeX(ok, async (calls) => {
    await runQueue(false);
    assert.equal(calls.length, 0);
  });
  assert.deepEqual(await status(id), { status: "PENDING", post_id: null, attempts: 0 });
});

test("posting: posts summary + source link once, records the post id, never posts it again", { skip }, async () => {
  const id = await publishedEvent(`${tag} live summary.`);
  await withFakeX(ok, async (calls) => {
    await Promise.all([runQueue(true), runQueue(true)]); // two saves at the same moment
    await runQueue(true);
    assert.deepEqual(calls.filter((t) => t.includes("live summary")), [`${tag} live summary.\nhttps://example.org/src`]);
  });
  assert.deepEqual(await status(id), { status: "POSTED", post_id: "1234567890", attempts: 1 });
});

test("posting: an X error is recorded as FAILED and retried, up to the attempt limit", { skip }, async () => {
  const id = await publishedEvent(`${tag} failing summary.`);
  await withFakeX(() => new Response(JSON.stringify({ title: "Forbidden" }), { status: 403 }), async () => {
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await runQueue(true);
  });
  const s = await status(id);
  assert.equal(s.status, "FAILED");
  assert.equal(s.attempts, MAX_ATTEMPTS, "stops retrying after the limit");
});

test("posting: an item unpublished before it posts is skipped, not posted", { skip }, async () => {
  const id = await publishedEvent(`${tag} unpublished summary.`);
  await q(`UPDATE events SET review_status = 'DRAFT' WHERE event_id = $1`, [id]);
  await withFakeX(ok, async (calls) => {
    await runQueue(true);
    assert.equal(calls.filter((t) => t.includes("unpublished summary")).length, 0);
  });
  assert.equal((await status(id)).status, "SKIPPED");
});

test("settings: posting is off unless X_POSTING_ENABLED=true and all four keys are set", () => {
  const keys = { X_API_KEY: "a", X_API_SECRET: "b", X_ACCESS_TOKEN: "c", X_ACCESS_TOKEN_SECRET: "d" };
  assert.equal(xSettingsFromEnv({ ...keys }).enabled, false);
  assert.equal(xSettingsFromEnv({ ...keys, X_POSTING_ENABLED: "false" }).enabled, false);
  assert.deepEqual(xSettingsFromEnv({ ...keys, X_API_SECRET: " ", X_POSTING_ENABLED: "true" }).missing, ["X_API_SECRET"]);
  assert.equal(xSettingsFromEnv({ ...keys, X_POSTING_ENABLED: "true" }).enabled, true);
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM sources WHERE name LIKE $1`, [`${tag}%`]);
    assert.equal(rows[0].n, 0);
  } finally {
    await pool.end();
  }
});
