/**
 * Phase 4 database rules (migration 0008): publishing needs a Tier 1-3 SUPPORTS source,
 * excerpts are required and at most 20 words, a CONTRADICTS source is never primary, a tier
 * edit cannot leave a published historical event Tier 4-only, and the audit log is append-only.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local). Skipped until migration 0008 is applied.
 * Everything runs in one transaction that is rolled back, with deferred triggers made
 * immediate (SET CONSTRAINTS ALL IMMEDIATE): no test row is ever committed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb();
const skip = db.applied ? false : "migration 0008 not applied";
const q = (text: string, values?: unknown[]) => db.client.query(text, values);

const tag = `ZZ-HISTORICAL-TRIGGERS-${randomUUID()}`;
const created: string[] = [];
const sourceIds: Record<"t1" | "t2" | "t4" | "none" | "edit", string> = { t1: "", t2: "", t4: "", none: "", edit: "" };
const WORDS_20 = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
const WORDS_21 = `${WORDS_20} w20`;

async function newEvent(fields: { date?: string; status?: string; reviewed?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO historical_events (event_id, event_date, headline, event_type, review_status, human_reviewed)
     VALUES ($1, $2::date, $3, 'READINESS_CHECK', $4, $5)`,
    [id, fields.date ?? "2021-01-20", tag, fields.status ?? "DRAFT", fields.reviewed ?? false],
  );
  created.push(id);
  return id;
}

async function attach(
  eventId: string,
  source: keyof typeof sourceIds,
  opts: { relationship?: "SUPPORTS" | "CONTRADICTS"; primary?: boolean; excerpt?: string | null } = {},
): Promise<void> {
  await q(
    `INSERT INTO historical_event_sources
       (event_id, source_id, article_url, accessed_at, relationship, is_primary, excerpt)
     VALUES ($1, $2, $3, now(), $4, $5, $6)`,
    [
      eventId,
      sourceIds[source],
      `https://example.org/${randomUUID()}`,
      opts.relationship ?? "SUPPORTS",
      opts.primary ?? false,
      opts.excerpt === undefined ? "Officials said the check began on Monday." : opts.excerpt,
    ],
  );
}

const publish = (id: string) =>
  q(`UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);

test("setup: test sources with tiers 1, 2, 4 and none, plus a tier-1 source for the tier-edit test", { skip }, async () => {
  for (const [key, tier] of [["t1", 1], ["t2", 2], ["t4", 4], ["none", null], ["edit", 1]] as const) {
    const { rows: [row] } = await q(
      `INSERT INTO sources (name, tier, historical_only) VALUES ($1, $2, true) RETURNING id`,
      [`${tag} ${key}`, tier],
    );
    sourceIds[key] = row.id;
  }
});

test("publish is rejected with no source", { skip }, async () => {
  const id = await newEvent();
  const error = await db.expectError(() => publish(id));
  assert.match(error.message, /must have at least one SUPPORTS source/);
});

test("publish is rejected with Tier 4-only support, and with an untiered source only", { skip }, async () => {
  const t4 = await newEvent();
  await attach(t4, "t4", { primary: true });
  assert.match((await db.expectError(() => publish(t4))).message, /Tier 1-3/);

  const none = await newEvent();
  await attach(none, "none", { primary: true });
  assert.match((await db.expectError(() => publish(none))).message, /Tier 1-3/);
});

test("publish is rejected when the only Tier 1-3 source contradicts", { skip }, async () => {
  const id = await newEvent();
  await attach(id, "t1", { relationship: "CONTRADICTS" });
  assert.match((await db.expectError(() => publish(id))).message, /SUPPORTS source/);
});

test("publish succeeds with a Tier 1-3 SUPPORTS source", { skip }, async () => {
  const id = await newEvent();
  await attach(id, "t4");
  await attach(id, "t2", { primary: true });
  await db.step(() => publish(id));
});

test("inserting an event already PUBLISHED with no source is rejected", { skip }, async () => {
  const error = await db.expectError(() => newEvent({ status: "PUBLISHED", reviewed: true }));
  assert.match(error.message, /must have at least one SUPPORTS source/);
});

test("a CONTRADICTS source cannot be primary", { skip }, async () => {
  const id = await newEvent();
  const error = await db.expectError(() => attach(id, "t1", { relationship: "CONTRADICTS", primary: true }));
  assert.match(error.message, /historical_event_sources_primary_must_support/);
});

test("excerpt is required and at most 20 words", { skip }, async () => {
  const id = await newEvent();
  await db.step(() => attach(id, "t1", { excerpt: WORDS_20 }));
  assert.match((await db.expectError(() => attach(id, "t2", { excerpt: WORDS_21 }))).message, /excerpt_short/);
  assert.match((await db.expectError(() => attach(id, "t2", { excerpt: "  \n " }))).message, /excerpt_short/);
  assert.match((await db.expectError(() => attach(id, "t2", { excerpt: null }))).message, /null value/);
});

test("removing or flipping the last Tier 1-3 support of a published event is rejected", { skip }, async () => {
  const id = await newEvent();
  await attach(id, "t1", { primary: true });
  await attach(id, "t4");
  await db.step(() => publish(id));

  const del = await db.expectError(() =>
    q(`DELETE FROM historical_event_sources WHERE event_id = $1 AND source_id = $2`, [id, sourceIds.t1]),
  );
  assert.match(del.message, /Tier 1-3/);

  const flip = await db.expectError(() =>
    q(
      `UPDATE historical_event_sources SET relationship = 'CONTRADICTS', is_primary = false
       WHERE event_id = $1 AND source_id = $2`,
      [id, sourceIds.t1],
    ),
  );
  assert.match(flip.message, /Tier 1-3/);
});

test("a source tier edit cannot leave a published historical event Tier 4-only", { skip }, async () => {
  const id = await newEvent();
  await attach(id, "edit", { primary: true });
  await db.step(() => publish(id));

  for (const tier of [4, null]) {
    const error = await db.expectError(() => q(`UPDATE sources SET tier = $2 WHERE id = $1`, [sourceIds.edit, tier]));
    assert.match(error.message, /Tier 4-only support/);
    assert.ok(error.message.includes(id), "the error names the affected event");
  }

  // Allowed once another Tier 1-3 source supports the event.
  await attach(id, "t2");
  await db.step(() => q(`UPDATE sources SET tier = 4 WHERE id = $1`, [sourceIds.edit]));
  await db.step(() => q(`UPDATE sources SET tier = 1 WHERE id = $1`, [sourceIds.edit]));
});

test("events outside Aug 2020 - Feb 2022, unreviewed publishes and other statuses are rejected", { skip }, async () => {
  assert.match((await db.expectError(() => newEvent({ date: "2020-07-31" }))).message, /check constraint/);
  assert.match((await db.expectError(() => newEvent({ date: "2022-03-01" }))).message, /check constraint/);

  const id = await newEvent();
  await attach(id, "t1", { primary: true });
  const unreviewed = await db.expectError(() =>
    q(`UPDATE historical_events SET review_status = 'PUBLISHED' WHERE event_id = $1`, [id]),
  );
  assert.match(unreviewed.message, /check constraint/);
  for (const status of ["PENDING_REVIEW", "MERGED"]) {
    const error = await db.expectError(() =>
      q(`UPDATE historical_events SET review_status = $2 WHERE event_id = $1`, [id, status]),
    );
    assert.match(error.message, /check constraint/);
  }
});

test("audit log: reviewer required, CREATE has no previous values, append-only", { skip }, async () => {
  const id = await newEvent();
  const insert = (action: string, reviewer: string, previous: object | null) =>
    q(
      `INSERT INTO historical_review_actions (event_id, action, reviewer, event_type, previous_values)
       VALUES ($1, $2, $3, 'READINESS_CHECK', $4) RETURNING id`,
      [id, action, reviewer, previous],
    );

  const { rows: [row] } = await db.step(() => insert("CREATE", "Reviewer", null));
  await db.step(() => insert("EDIT", "Reviewer", { headline: "old" }));
  assert.match((await db.expectError(() => insert("EDIT", "  ", { headline: "old" }))).message, /check constraint/);
  assert.match((await db.expectError(() => insert("CREATE", "Reviewer", { headline: "old" }))).message, /check constraint/);

  const update = await db.expectError(() =>
    q(`UPDATE historical_review_actions SET reviewer = 'Someone else' WHERE id = $1`, [row.id]),
  );
  assert.match(update.message, /append-only/);
  const del = await db.expectError(() => q(`DELETE FROM historical_review_actions WHERE id = $1`, [row.id]));
  assert.match(del.message, /append-only/);
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows: [{ s }] } = await pool.query<{ s: number }>(
      `SELECT count(*)::int AS s FROM sources WHERE name LIKE $1`,
      [`${tag}%`],
    );
    assert.equal(s, 0);
    if (db.applied && created.length > 0) {
      const { rows: [{ n }] } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM historical_events WHERE event_id = ANY($1::uuid[])`,
        [created],
      );
      assert.equal(n, 0);
    }
  } finally {
    await pool.end();
  }
});
