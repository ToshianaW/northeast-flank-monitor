/**
 * Historical admin write path (src/lib/historical.ts) and the source rules that go with it:
 * every save, approve, reject and unpublish writes its audit row with the reviewer's name;
 * publishing follows the evidence rules; a refused tier change and a blocked delete come back
 * as clear results, not database errors.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local). Skipped until migration 0008 is applied.
 * Everything runs in one transaction that is rolled back (the app's own BEGIN/COMMIT become
 * savepoints; deferred triggers are immediate): no test row is ever committed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
const skip = db.applied ? false : "migration 0008 not applied";

const historical = await import("./historical");
const sources = await import("./sources");

const tag = `ZZ-HISTORICAL-WRITES-${randomUUID()}`;
const ids = { t1: "", t4: "" };
let eventId = "";

const values = (overrides: Record<string, string> = {}) => ({
  ...historical.emptyHistoricalFormValues(),
  headline: tag,
  event_date: "2021-02-10",
  event_type: "READINESS_CHECK",
  phase_tag: "P1",
  internal_notes: "admin only",
  ...overrides,
});
const row = (source_id: string, excerpt = "The ministry said a readiness check began.") => ({
  source_id,
  article_url: `https://example.org/${randomUUID()}`,
  archived_url: "",
  accessed_at: "2026-10-01",
  relationship: "SUPPORTS" as const,
  excerpt,
});

async function actions(id: string) {
  return (await historical.listHistoricalActions(id)).map((a) => `${a.action}:${a.reviewer}`);
}

test("setup: Tier 1 and Tier 4 historical-only sources", { skip }, async () => {
  for (const [key, tier] of [["t1", 1], ["t4", 4]] as const) {
    const { rows } = await db.client.query<{ id: string }>(
      `INSERT INTO sources (name, tier, historical_only) VALUES ($1, $2, true) RETURNING id`,
      [`${tag} ${key}`, tier],
    );
    ids[key] = rows[0].id;
  }
});

test("validation: date range, excerpt length, predictive language, registry source", { skip }, async () => {
  const bad = await historical.validateHistoricalForm(
    values({ event_date: "2023-01-01", summary: "An invasion is imminent." }),
    [row(ids.t1, Array.from({ length: 21 }, (_, i) => `w${i}`).join(" ")), row(randomUUID())],
    0,
  );
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.match(bad.errors.event_date ?? "", /1 Aug 2020/);
  assert.match(bad.errors.summary ?? "", /predictive/);
  assert.match(bad.errors.hs_0_excerpt ?? "", /20 words/);
  assert.match(bad.errors.hs_1_source_id ?? "", /registry source/);
});

test("create logs CREATE with the reviewer; edit logs EDIT with previous values", { skip }, async () => {
  const v = await historical.validateHistoricalForm(values(), [row(ids.t4)], 0);
  assert.ok(v.ok);
  const created = await historical.createHistoricalEvent(v.payload, "Reviewer A");
  assert.ok(created.ok);
  eventId = created.id;
  const event = await historical.getHistoricalEvent(eventId);
  assert.equal(event?.review_status, "DRAFT");
  assert.equal(event?.phase_tag, "P1");
  assert.equal(event?.source_name, `${tag} t4`, "primary-source snapshot");

  const edit = await historical.validateHistoricalForm(values({ summary: "Edited." }), [row(ids.t4)], 0);
  assert.ok(edit.ok);
  assert.ok((await historical.updateHistoricalEvent(eventId, edit.payload, "Reviewer B")).ok);
  assert.deepEqual(await actions(eventId), ["CREATE:Reviewer A", "EDIT:Reviewer B"]);
  const [, editRow] = await historical.listHistoricalActions(eventId);
  assert.equal(editRow.previous_values?.summary, null, "EDIT keeps the row as it was");
});

test("approve refuses Tier 4-only support and logs nothing", { skip }, async () => {
  const result = await historical.approveHistoricalEvent(eventId, "Reviewer C", "HIGH");
  assert.deepEqual(result, { ok: false, error: "Needs a supporting Tier 1–3 source; Tier 4 alone cannot be published." });
  assert.equal((await actions(eventId)).length, 2);
});

test("approve with a Tier 1 source publishes and logs APPROVE; unpublish logs UNPUBLISH", { skip }, async () => {
  const v = await historical.validateHistoricalForm(values(), [row(ids.t1), row(ids.t4)], 0);
  assert.ok(v.ok);
  assert.ok((await historical.updateHistoricalEvent(eventId, v.payload, "Reviewer B")).ok);
  assert.ok((await historical.approveHistoricalEvent(eventId, "Reviewer C", "HIGH")).ok);
  const event = await historical.getHistoricalEvent(eventId);
  assert.equal(event?.review_status, "PUBLISHED");
  assert.equal(event?.human_reviewed, true);
  assert.equal(event?.confidence_level, "HIGH");

  assert.ok((await historical.unpublishHistoricalEvent(eventId, "Reviewer D", "recheck date")).ok);
  assert.equal((await historical.getHistoricalEvent(eventId))?.review_status, "DRAFT");
  const log = await historical.listHistoricalActions(eventId);
  assert.deepEqual(log.map((a) => a.action), ["CREATE", "EDIT", "EDIT", "APPROVE", "UNPUBLISH"]);
  assert.equal(log[4].previous_values?.unpublish_reason, "recheck date");
  assert.ok(log[3].source_ids.includes(ids.t1), "audit row records the attached sources");
});

test("reject logs REJECT with its reason; only drafts can be rejected", { skip }, async () => {
  assert.ok((await historical.rejectHistoricalEvent(eventId, "Reviewer E", "duplicate")).ok);
  assert.equal((await historical.getHistoricalEvent(eventId))?.review_status, "REJECTED");
  const again = await historical.rejectHistoricalEvent(eventId, "Reviewer E", "");
  assert.equal(again.ok, false);
  assert.deepEqual((await actions(eventId)).at(-1), "REJECT:Reviewer E");
});

test("a refused tier change is reported with the affected event ids", { skip }, async () => {
  // Publish a fresh event that depends only on the Tier 1 source.
  const v = await historical.validateHistoricalForm(values(), [row(ids.t1)], 0);
  assert.ok(v.ok);
  const created = await historical.createHistoricalEvent(v.payload, "Reviewer A");
  assert.ok(created.ok);
  assert.ok((await historical.approveHistoricalEvent(created.id, "Reviewer C", "MODERATE")).ok);

  const source = (await sources.getSource(ids.t1))!;
  const error = await db.expectError(() => sources.updateSource(ids.t1, { ...source, tier: 4 }));
  assert.deepEqual(sources.refusedTierChangeEvents(error), [created.id]);
});

test("deleteSource refuses a source the historical record cites", { skip }, async () => {
  const result = await sources.deleteSource(ids.t1);
  assert.equal(!result.ok && result.reason, "historical");
});

test("current pickers leave out historical-only sources, keeping ones already attached", { skip }, async () => {
  const all = await sources.listSources();
  const current = sources.currentSourceOptions(all);
  assert.ok(!current.some((s) => s.id === ids.t1 || s.id === ids.t4));
  assert.ok(sources.currentSourceOptions(all, [ids.t1]).some((s) => s.id === ids.t1));
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows } = await pool.query<{ s: number }>(`SELECT count(*)::int AS s FROM sources WHERE name LIKE $1`, [
      `${tag}%`,
    ]);
    assert.equal(rows[0].s, 0);
    if (db.applied) {
      const { rows: h } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM historical_events WHERE headline = $1`,
        [tag],
      );
      assert.equal(h[0].n, 0);
    }
  } finally {
    await pool.end();
  }
});
