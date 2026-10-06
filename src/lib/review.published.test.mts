/**
 * Published events can be removed from the site (REJECTED, logged, never deleted) and merged into
 * another published event, whose page the old link then reaches. Everything is rolled back.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
const { mergeEventInto, rejectEvent, searchMergeTargets } = await import("./review");
const { getMergedIntoPublishedEvent, getPublishedEvent } = await import("./public-events");
const { LIVE_STATEMENT_SOURCE_ID } = await import("./source-labels");

const q = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
  db.client.query<T>(text, values).then((r) => r.rows);

const [source] = await q<{ id: string }>(
  `SELECT id FROM sources WHERE tier BETWEEN 1 AND 3 AND NOT historical_only AND id <> $1 LIMIT 1`,
  [LIVE_STATEMENT_SOURCE_ID],
);

async function plant(status: "PUBLISHED" | "DRAFT", url: string): Promise<string> {
  const [{ event_id }] = await q<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, event_type, internal_notes)
     VALUES ('2025-02-01', 'TEST published actions (rolled back)', 'ENGINEERING', 'review.published.test')
     RETURNING event_id`,
  );
  await q(
    `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
     VALUES ($1, $2, $3, 'SUPPORTS', true)`,
    [event_id, source.id, url],
  );
  if (status === "PUBLISHED") {
    await q(`UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [event_id]);
  }
  return event_id;
}

test("a published event can be removed from the site, with a logged reason", async () => {
  const id = await plant("PUBLISHED", "https://example.invalid/remove");
  assert.deepEqual(await rejectEvent(id, "test-runner", "Duplicate of a better report"), { ok: true });

  assert.equal(await getPublishedEvent(id), null);
  const [row] = await q<{ review_status: string }>("SELECT review_status FROM events WHERE event_id = $1", [id]);
  assert.equal(row.review_status, "REJECTED");
  const actions = await q("SELECT action, previous_values FROM review_actions WHERE event_id = $1", [id]);
  assert.deepEqual(actions, [
    { action: "REJECT", previous_values: { review_status: "PUBLISHED", reject_reason: "Duplicate of a better report" } },
  ]);
  assert.equal(await getMergedIntoPublishedEvent(id), null, "a removed event has no redirect");
});

test("a published event merges into another published event, and its link redirects there", async () => {
  const from = await plant("PUBLISHED", "https://example.invalid/merge-from");
  const into = await plant("PUBLISHED", "https://example.invalid/merge-into");
  assert.deepEqual(await mergeEventInto(from, into, "test-runner"), { ok: true });

  const [row] = await q<{ review_status: string }>("SELECT review_status FROM events WHERE event_id = $1", [from]);
  assert.equal(row.review_status, "MERGED");
  const moved = await q<{ article_url: string }>(
    "SELECT article_url FROM event_sources WHERE event_id = $1 ORDER BY article_url",
    [into],
  );
  assert.deepEqual(moved.map((r) => r.article_url), [
    "https://example.invalid/merge-from",
    "https://example.invalid/merge-into",
  ]);
  assert.equal(await getMergedIntoPublishedEvent(from), into);
});

test("a published event cannot be merged into an unpublished one", async () => {
  const from = await plant("PUBLISHED", "https://example.invalid/merge-refused");
  const draft = await plant("DRAFT", "https://example.invalid/merge-draft");
  const result = await mergeEventInto(from, draft, "test-runner");
  assert.equal(result.ok, false);
  const [row] = await q<{ review_status: string }>("SELECT review_status FROM events WHERE event_id = $1", [from]);
  assert.equal(row.review_status, "PUBLISHED");
});

test("merge target search finds events by a typed phrase or pasted excerpt, including close matches", async () => {
  const self = await plant("DRAFT", "https://example.invalid/search-self");
  const target = await plant("PUBLISHED", "https://example.invalid/search-target");
  await q(
    `UPDATE events SET headline = 'TEST Zorblax brigade arrives in Narva (rolled back)', summary = 'The zorblax brigade completed its move.' WHERE event_id = $1`,
    [target],
  );
  await q(`UPDATE event_sources SET excerpt = 'Quuxvale battalion relocated to the Narva base' WHERE event_id = $1`, [target]);
  const draft = await plant("DRAFT", "https://example.invalid/search-draft");
  await q(`UPDATE events SET headline = 'TEST Zorblax draft twin (rolled back)' WHERE event_id = $1`, [draft]);

  const ids = async (text: string, publishedOnly = false) =>
    (await searchMergeTargets(self, text, { publishedOnly })).map((m) => m.event_id);
  assert.ok((await ids("zorblax brigade")).includes(target), "headline phrase");
  assert.ok((await ids("Quuxvale battalion relocated")).includes(target), "pasted source excerpt");
  assert.ok((await ids("quuxvaal batallion")).includes(target), "close match (typos)");
  assert.ok((await ids("zorblax")).includes(draft), "drafts are offered for a draft");
  assert.ok(!(await ids("zorblax", true)).includes(draft), "published only for a published event");
  assert.ok(!(await ids("zorblax")).includes(self), "never the event itself");
  assert.deepEqual(await ids("zo"), [], "at least 3 characters");
  const [hit] = await searchMergeTargets(self, "Quuxvale battalion", { publishedOnly: false });
  assert.equal(hit.snippet, "Quuxvale battalion relocated to the Narva base", "the snippet shows where it matched");
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
