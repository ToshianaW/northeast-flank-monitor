/**
 * Import page writes (src/lib/historical-import.ts): ticked candidates become DRAFT historical
 * events through the admin form's validation and audit code; unregistered sources and repeat
 * imports are refused; the model's support line and date rule go to internal_notes only.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local). Skipped until migration 0008 is applied.
 * Everything runs in one transaction that is rolled back: no test row is ever committed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";
import type { CandidateFile, ImportCandidate } from "./historical-import-rules";

const db = await openRollbackDb({ installAsAppPool: true });
const skip = db.applied ? false : "migration 0008 not applied";
const { importCandidates } = await import("./historical-import");
const historical = await import("./historical");

const tag = `zz-import-${randomUUID().slice(0, 8)}`;
const host = `${tag}.example.org`;
const base: ImportCandidate = {
  id: "c1",
  url: `https://${host}/2021/04/28/troops`,
  publisher: "Test outlet",
  event_date: "2021-04-22",
  reported_date: "2021-04-28",
  date_rule: "year from the publication date 2021-04-28 (page metadata), 6 day(s) after the event",
  date_quote: "On 22 April, the readiness test ended",
  event_type: "TROOP_MOVEMENT",
  headline: `${tag} Shoigu announces end of readiness test near Ukraine`,
  summary: "Russia's defence minister said units would return to their bases.",
  actor: null,
  country: "Russia",
  location_name: null,
  exercise_name: null,
  excerpt: "Shoigu stated that the subunits involved in the test would begin withdrawing",
  excerpt_supports: "Shoigu said units would begin withdrawing.",
  flags: [],
  accessed_at: "2026-10-03",
};
const file: CandidateFile = {
  version: 1,
  generated_at: "2026-10-03T10:00:00Z",
  prompt_version: "test",
  model: "test",
  period: "2021-01:2021-04",
  mode: "urls",
  candidates: [base, { ...base, id: "c2", url: `https://unregistered-${tag}.example.net/x`, headline: `${tag} Belarus drills` }],
};

test("setup: a registered Tier 2 source for the test outlet", { skip }, async () => {
  await db.client.query(`INSERT INTO sources (name, home_url, tier, historical_only) VALUES ($1, $2, 2, true)`, [
    `${tag} source`,
    `https://${host}`,
  ]);
});

test("a ticked candidate becomes a DRAFT with audit, excerpt, URL, accessed_at, notes and no phase tag", { skip }, async () => {
  const [result] = await importCandidates(file, "test.json", ["c1"], "Reviewer Import");
  assert.equal(result.ok, true, result.message);
  const event = await historical.getHistoricalEvent(result.eventId!);
  assert.equal(event?.review_status, "DRAFT");
  assert.equal(event?.phase_tag, null);
  assert.equal(event?.confidence_level, "UNVERIFIED");
  assert.match(String(event?.internal_notes), /What the excerpt supports \(model\): Shoigu said units would begin withdrawing\./);
  assert.match(String(event?.internal_notes), /Date rule: year from the publication date 2021-04-28/);
  assert.equal(event?.reported_date?.toISOString().slice(0, 10), "2021-04-28");
  const [source] = await historical.listHistoricalEventSources(result.eventId!);
  assert.equal(source.article_url, base.url);
  assert.equal(source.excerpt, base.excerpt);
  assert.equal(source.accessed_at.toISOString().slice(0, 10), "2026-10-03");
  const actions = await historical.listHistoricalActions(result.eventId!);
  assert.deepEqual(actions.map((a) => `${a.action}:${a.reviewer}`), ["CREATE:Reviewer Import"]);
});

test("unregistered sources and repeat imports are refused; nothing is published", { skip }, async () => {
  const results = await importCandidates(file, "test.json", ["c2", "c1", "missing"], "Reviewer Import");
  assert.deepEqual(results.map((r) => [r.id, r.ok, r.message]), [
    ["c2", false, "Source not registered."],
    ["c1", false, "Already imported."],
    ["missing", false, "Not in this file."],
  ]);
  const { rows } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM historical_events WHERE headline LIKE $1 AND review_status <> 'DRAFT'`,
    [`${tag}%`],
  );
  assert.equal(rows[0].n, 0);
});

test("internal notes never reach the public read path", () => {
  const publicRead = readFileSync("src/lib/public-historical.ts", "utf8");
  const columns = publicRead.slice(publicRead.indexOf("const PUBLIC_COLUMNS"), publicRead.indexOf("export type PublicHistoricalEvent"));
  assert.ok(!/internal_notes|phase_tag/.test(columns));
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM sources WHERE name LIKE $1`, [`${tag}%`]);
    assert.equal(rows[0].n, 0);
    if (db.applied) {
      const { rows: h } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM historical_events WHERE headline LIKE $1`, [`${tag}%`]);
      assert.equal(h[0].n, 0);
    }
  } finally {
    await pool.end();
  }
});
