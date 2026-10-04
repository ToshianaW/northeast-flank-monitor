/**
 * Migration 0011: automatic links (same type AND country), the origin constraint, reviewer
 * removal that is never undone, and unpublish cleanup: an unpublished event never shows links.
 * Skipped until migration 0011 is applied. One REPEATABLE READ transaction, rolled back.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true, repeatableRead: true });
const { rows: [{ ready }] } = await db.client.query<{ ready: boolean }>(
  `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'event_historical_references' AND column_name = 'matched_by') AS ready`,
);
const { rows: picked } = ready
  ? await db.client.query<{ event_id: string; event_type: string; country: string }>(
      `SELECT e.event_id, e.event_type::text AS event_type, e.country FROM events e
       WHERE e.review_status = 'PUBLISHED' AND btrim(coalesce(e.country, '')) <> ''
         AND e.event_type NOT IN ('POLITICAL_SIGNALING', 'OFFICIAL_WARNING')
         AND NOT EXISTS (SELECT 1 FROM event_historical_references r WHERE r.event_id = e.event_id)
       ORDER BY e.created_at LIMIT 1`,
    )
  : { rows: [] };
const skip = !ready ? "migration 0011 not applied" : picked.length === 0 ? "no published event with a country" : false;

const refs = await import("./historical-references");
const EVENT = picked[0];
const marker = `ZZ-AUTO-REFERENCES-${randomUUID()}`;
const matching = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const otherCountry = randomUUID();
const draft = randomUUID();

async function linksOf() {
  const { rows } = await db.client.query<{ historical_event_id: string; matched_by: string; reviewer: string; shared_attributes: string[] }>(
    `SELECT historical_event_id, matched_by, reviewer, shared_attributes::text[] AS shared_attributes
     FROM event_historical_references WHERE event_id = $1 ORDER BY historical_event_id`,
    [EVENT?.event_id],
  );
  return rows;
}

test("seed historical entries: 4 matching, 1 other country, 1 draft", { skip }, async () => {
  const { rows: [source] } = await db.client.query<{ id: string }>(
    `INSERT INTO sources (name, tier, historical_only) VALUES ($1, 1, true) RETURNING id`,
    [`${marker} source`],
  );
  const seeds: Array<[string, string, boolean]> = [
    ...matching.map((id): [string, string, boolean] => [id, EVENT.country, true]),
    [otherCountry, `${EVENT.country}-elsewhere`, true],
    [draft, EVENT.country, false],
  ];
  for (const [id, country, publish] of seeds) {
    await db.client.query(
      `INSERT INTO historical_events (event_id, event_date, headline, event_type, country)
       VALUES ($1, '2021-01-15', $2, $3::event_type, $4)`,
      [id, marker, EVENT.event_type, country],
    );
    await db.client.query(
      `INSERT INTO historical_event_sources (event_id, source_id, article_url, accessed_at, is_primary, excerpt)
       VALUES ($1, $2, $3, now(), true, 'The ministry said units began a readiness check.')`,
      [id, source.id, `https://example.org/${id}`],
    );
    if (publish) {
      await db.client.query(`UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);
    }
  }
});

test("auto-link fills 3 slots with same type AND country, marked AUTO and logged", { skip }, async () => {
  // Other published historical entries of the same type and country may exist in the record;
  // the seeded entries have no links, so they rank first among those with no actor match.
  const made = await db.step(() => refs.autoLinkEvent(EVENT.event_id));
  assert.equal(made, 3);
  const links = await linksOf();
  assert.equal(links.length, 3);
  for (const l of links) {
    assert.equal(l.matched_by, "AUTO");
    assert.equal(l.reviewer, "auto-match");
    assert.ok(l.shared_attributes.includes("SAME_EVENT_TYPE") && l.shared_attributes.includes("SAME_COUNTRY"));
    assert.ok(!l.shared_attributes.includes("SAME_KIND_OF_ACTIVITY"));
    assert.notEqual(l.historical_event_id, otherCountry);
    assert.notEqual(l.historical_event_id, draft);
  }
  const { rows: log } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM event_historical_reference_log WHERE event_id = $1 AND action = 'LINK' AND matched_by = 'AUTO'`,
    [EVENT.event_id],
  );
  assert.equal(log[0].n, 3);
  assert.equal(await db.step(() => refs.autoLinkEvent(EVENT.event_id)), 0, "full: nothing more");
});

test("a reviewer removal is logged and never re-added automatically", { skip }, async () => {
  const [first] = await linksOf();
  assert.equal(await db.step(() => refs.unlinkReference({ eventId: EVENT.event_id, historicalEventId: first.historical_event_id, reviewer: "Test reviewer" })), true);
  const { rows: [logged] } = await db.client.query<{ matched_by: string; reviewer: string }>(
    `SELECT matched_by, reviewer FROM event_historical_reference_log
     WHERE event_id = $1 AND historical_event_id = $2 AND action = 'UNLINK'`,
    [EVENT.event_id, first.historical_event_id],
  );
  assert.deepEqual(logged, { matched_by: "AUTO", reviewer: "Test reviewer" });
  await db.step(() => refs.autoLinkEvent(EVENT.event_id));
  const after = await linksOf();
  assert.equal(after.length, 3, "the free slot is filled again");
  assert.ok(!after.some((l) => l.historical_event_id === first.historical_event_id), "but not with the removed pair");
});

test("the origin constraint refuses malformed rows", { skip }, async () => {
  const [one] = await linksOf();
  await db.step(() => refs.unlinkReference({ eventId: EVENT.event_id, historicalEventId: one.historical_event_id, reviewer: "Test reviewer" }));
  const insert = (attrs: string[], reviewer: string, matchedBy: string, ai = false) =>
    db.client.query(
      `INSERT INTO event_historical_references (event_id, historical_event_id, shared_attributes, reviewer, matched_by, ai_suggested)
       VALUES ($1, $2, $3::reference_attribute[], $4, $5, $6)`,
      [EVENT.event_id, one.historical_event_id, attrs, reviewer, matchedBy, ai],
    );
  for (const [attrs, reviewer, by, ai] of [
    [["SAME_EVENT_TYPE", "SAME_COUNTRY"], "someone", "AUTO", false],
    [["SAME_EVENT_TYPE"], "auto-match", "AUTO", false],
    [["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_KIND_OF_ACTIVITY"], "auto-match", "AUTO", false],
    [["SAME_EVENT_TYPE", "SAME_COUNTRY"], "auto-match", "REVIEWER", false],
    [["SAME_EVENT_TYPE"], "Test reviewer", "REVIEWER", true],
  ] as const) {
    const error = await db.expectError(() => insert([...attrs], reviewer, by, ai));
    assert.match(error.message, /origin_check/, `${by} ${reviewer} ${attrs.join("+")} ai=${ai}`);
  }
});

test("unpublishing either event removes its links (logged); the page never shows them", { skip }, async () => {
  const before = await linksOf();
  assert.ok(before.length >= 1);
  const target = before[0].historical_event_id;
  await db.client.query(`UPDATE historical_events SET review_status = 'DRAFT' WHERE event_id = $1`, [target]);
  assert.ok(!(await linksOf()).some((l) => l.historical_event_id === target));
  const { rows: [sys] } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM event_historical_reference_log
     WHERE historical_event_id = $1 AND action = 'UNLINK' AND reviewer = 'system: unpublished'`,
    [target],
  );
  assert.equal(sys.n, 1);

  await db.client.query(`UPDATE events SET review_status = 'DRAFT' WHERE event_id = $1`, [EVENT.event_id]);
  assert.deepEqual(await linksOf(), []);
  assert.deepEqual(await refs.listApprovedReferences(EVENT.event_id), []);
  assert.equal(await db.step(() => refs.autoLinkEvent(EVENT.event_id)), 0, "an unpublished event is never linked");
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    const { rows: [{ n }] } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM sources WHERE name = $1", [`${marker} source`]);
    assert.equal(n, 0);
  } finally {
    await pool.end();
  }
});
