/**
 * Phase 4 isolation: no current-facing read can return a historical row.
 * Seeds one PUBLISHED and one DRAFT historical event, then runs every current read (Latest,
 * dashboard and header, stat cards, event pages, Archive, map, exercises, digest input and refs,
 * dedup, review queue, admin lists) before and after seeding. Each result must be unchanged
 * and must not contain the historical ids or headline marker.
 * Run: npm test (needs DATABASE_URL_POOLED in .env.local). Skipped until migration 0008 is applied.
 * Everything runs in one transaction that is rolled back: no test row is ever committed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
const skip = db.applied ? false : "migration 0008 not applied";

const publicEvents = await import("./public-events");
const publicExercises = await import("./public-exercises");
const { loadMapData } = await import("./map-data");
const digests = await import("./digests");
const review = await import("./review");
const events = await import("./events");
const exercises = await import("./exercises");
const { loadDigestEvents } = await import("../../workers/digest/input.mjs");
const { findPairs } = await import("../../workers/deduplication/pairs.mjs");

const marker = `ZZ-HISTORICAL-ISOLATION-${randomUUID()}`;
const publishedId = randomUUID();
const draftId = randomUUID();
const sourceName = `${marker} source`;
const DAY = "2021-01-15";
const NOW = new Date();

/** Every current-facing read, keyed by what it serves. Maps become entry lists for comparison. */
const reads: Record<string, () => Promise<unknown>> = {
  "Latest: listPublishedEvents": () => publicEvents.listPublishedEvents(),
  "Latest: listRecentPublishedEvents": () => publicEvents.listRecentPublishedEvents(),
  "Header: getLastPublishedUpdate": () => publicEvents.getLastPublishedUpdate(),
  "Stat cards: getSnapshotCounts": () => publicEvents.getSnapshotCounts(),
  "Event page: getPublishedEvent (published id)": () => publicEvents.getPublishedEvent(publishedId),
  "Event page: getPublishedEvent (draft id)": () => publicEvents.getPublishedEvent(draftId),
  "Event page: listPublicEventSources": () => publicEvents.listPublicEventSources(publishedId),
  "Archive: listArchiveEvents (all)": () => publicEvents.listArchiveEvents({}, 1),
  "Archive: listArchiveEvents (2020-2022)": () =>
    publicEvents.listArchiveEvents({ from: "2020-08-01", to: "2022-02-28" }, 1),
  "Archive: listArchiveFilterOptions": () => publicEvents.listArchiveFilterOptions(),
  "Map: loadMapData": () => loadMapData({ days: 90, layer: "all", now: NOW }),
  "Exercises: listPublishedExercises": () => publicExercises.listPublishedExercises(),
  "Exercises: listUnderWayExercises": () => publicExercises.listUnderWayExercises(),
  "Exercises: getPublishedExercise": () => publicExercises.getPublishedExercise(publishedId),
  "Exercises: listPublicExerciseSources": () => publicExercises.listPublicExerciseSources(publishedId),
  "Exercises: listPublishedExerciseEvents": () => publicExercises.listPublishedExerciseEvents(publishedId),
  "Digest: listPublishedEventHeadlines": async () =>
    [...(await digests.listPublishedEventHeadlines([publishedId, draftId])).entries()],
  "Digest: listPublishedDigests": () => digests.listPublishedDigests(),
  "Digest: getLatestPublishedDigest": () => digests.getLatestPublishedDigest(),
  "Digest input: loadDigestEvents": () => loadDigestEvents(db.client, DAY),
  "Dedup: findPairs": () => findPairs(db.client, { subjects: "all", skipExisting: false }),
  "Review: listReviewQueue": () => review.listReviewQueue(),
  "Review: getReviewEventDetail": () => review.getReviewEventDetail(publishedId),
  "Review: listDuplicateCandidates": () => review.listDuplicateCandidates(publishedId),
  "Review: listReviewActions": () => review.listReviewActions(publishedId),
  "Review: listMergeTargetOptions": () => review.listMergeTargetOptions(randomUUID()),
  "Admin: listEvents": () => events.listEvents(),
  "Admin: getEvent": () => events.getEvent(publishedId),
  "Admin: listEventSources": () => events.listEventSources(publishedId),
  "Admin: listLinkableEvents": () => exercises.listLinkableEvents(),
  "Admin: listLinkedEvents": () => exercises.listLinkedEvents(publishedId),
};

async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, read] of Object.entries(reads)) out[name] = JSON.stringify(await read());
  return out;
}

let before: Record<string, string> = {};
let after: Record<string, string> = {};

test("seed historical rows inside the transaction", { skip }, async () => {
  // The source is seeded before the first snapshot, so only historical rows differ between them.
  const { rows: [source] } = await db.client.query<{ id: string }>(
    `INSERT INTO sources (name, tier, historical_only) VALUES ($1, 1, true) RETURNING id`,
    [sourceName],
  );
  before = await snapshot();

  for (const [id, status] of [[publishedId, "PUBLISHED"], [draftId, "DRAFT"]] as const) {
    await db.client.query(
      `INSERT INTO historical_events (event_id, event_date, headline, event_type, country, actor)
       VALUES ($1, $2::date, $3, 'EXERCISE', 'Belarus', $3)`,
      [id, DAY, marker],
    );
    await db.client.query(
      `INSERT INTO historical_event_sources (event_id, source_id, article_url, accessed_at, is_primary, excerpt)
       VALUES ($1, $2, $3, now(), true, 'The ministry said units began a readiness check.')`,
      [id, source.id, `https://example.org/${id}`],
    );
    if (status === "PUBLISHED") {
      await db.client.query(
        `UPDATE historical_events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`,
        [id],
      );
    }
  }
  const { rows: [{ n }] } = await db.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM historical_events WHERE event_id = ANY($1::uuid[])`,
    [[publishedId, draftId]],
  );
  assert.equal(n, 2);
  after = await snapshot();
});

for (const name of Object.keys(reads)) {
  test(`no historical row in ${name}`, { skip }, () => {
    const result = after[name];
    assert.ok(result !== undefined, "snapshot missing (seeding failed)");
    for (const needle of [marker, publishedId, draftId]) {
      assert.ok(!result.includes(needle), `${name} returned historical data (${needle})`);
    }
    assert.equal(result, before[name], `${name} changed after seeding historical rows`);
  });
}

test("digest refs treat historical ids as unpublished", { skip }, async () => {
  assert.deepEqual(await digests.findUnpublishedEventIds([publishedId, draftId]), [publishedId, draftId]);
});

test("rollback leaves no test row behind", async () => {
  const pool = await db.rollback();
  try {
    if (db.applied) {
      const { rows: [{ n }] } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM historical_events WHERE event_id = ANY($1::uuid[])`,
        [[publishedId, draftId]],
      );
      assert.equal(n, 0);
    }
    const { rows: [{ s }] } = await pool.query<{ s: number }>(
      `SELECT count(*)::int AS s FROM sources WHERE name = $1`,
      [sourceName],
    );
    assert.equal(s, 0);
  } finally {
    await pool.end();
  }
});
