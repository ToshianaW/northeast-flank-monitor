/**
 * Sitemap entries against the database (rolled back): static public pages, PUBLISHED items only,
 * no /admin URL, recent Tier 4-only events held back (decision 11), and no historical row that
 * is not PUBLISHED. Named historical.* because it plants a historical row. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true, repeatableRead: true });
const { loadSitemapEntries, MAX_SITEMAP_URLS, STATIC_PATHS } = await import("./public-sitemap");
const { LIVE_STATEMENT_SOURCE_ID } = await import("./source-labels");

const q = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
  db.client.query<T>(text, values).then((r) => r.rows);

async function plantEvent(status: string, date = "2025-01-15"): Promise<string> {
  const [{ event_id }] = await q<{ event_id: string }>(
    `INSERT INTO events (event_date, headline, event_type, review_status, internal_notes)
     VALUES ($1::date, 'TEST sitemap (rolled back)', 'ENGINEERING', $2, 'historical.sitemap.test')
     RETURNING event_id`,
    [date, status],
  );
  return event_id;
}

async function plantPublished(sourceId: string, date: string): Promise<string> {
  const id = await plantEvent("DRAFT", date);
  await q(
    `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
     VALUES ($1, $2, 'https://example.invalid/sitemap-test', 'SUPPORTS', true)`,
    [id, sourceId],
  );
  await q(`UPDATE events SET review_status = 'PUBLISHED', human_reviewed = true WHERE event_id = $1`, [id]);
  return id;
}

test("sitemap lists public pages and published items only", async () => {
  const [tier1] = await q<{ id: string }>(
    `SELECT id FROM sources WHERE tier BETWEEN 1 AND 3 AND NOT historical_only AND id <> $1 LIMIT 1`,
    [LIVE_STATEMENT_SOURCE_ID],
  );
  const [tier4] = await q<{ id: string }>(`SELECT id FROM sources WHERE tier = 4 AND NOT historical_only LIMIT 1`);
  assert.ok(tier1 && tier4, "registry needs a Tier 1-3 and a Tier 4 source");

  const hidden = [await plantEvent("DRAFT"), await plantEvent("REJECTED"), await plantEvent("MERGED")];
  const published = await plantPublished(tier1.id, "2025-01-15");
  const today = new Date().toISOString().slice(0, 10);
  const heldTier4 = await plantPublished(tier4.id, today);

  let historicalDraft: string | null = null;
  if (db.applied) {
    [{ event_id: historicalDraft }] = await q<{ event_id: string }>(
      `INSERT INTO historical_events (event_date, headline, event_type, review_status, human_reviewed)
       VALUES ('2021-01-20', 'TEST sitemap historical draft (rolled back)', 'READINESS_CHECK', 'DRAFT', false)
       RETURNING event_id`,
    );
  }

  const entries = await loadSitemapEntries(new Date());
  const paths = entries.map((e) => e.path);

  assert.ok(entries.length <= MAX_SITEMAP_URLS);
  assert.ok(!paths.some((p) => p.includes("/admin")), "sitemap names an /admin URL");
  for (const p of STATIC_PATHS) assert.ok(paths.includes(p), `missing static page ${p}`);

  assert.ok(paths.includes(`/events/${published}`), "published event missing");
  for (const id of hidden) assert.ok(!paths.includes(`/events/${id}`), `unpublished event ${id} listed`);
  assert.ok(!paths.includes(`/events/${heldTier4}`), "recent Tier 4-only event listed");
  if (historicalDraft) assert.ok(!paths.includes(`/historical/${historicalDraft}`), "draft historical event listed");

  // Every listed item is PUBLISHED right now.
  const staticPaths = new Set<string>(STATIC_PATHS);
  const ids = (prefix: string) =>
    paths.filter((p) => p.startsWith(prefix) && !staticPaths.has(p)).map((p) => p.slice(prefix.length));
  const [{ n: badEvents }] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE event_id = ANY($1::uuid[]) AND review_status <> 'PUBLISHED'`,
    [ids("/events/")],
  );
  assert.equal(badEvents, 0);
  const [{ n: badExercises }] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM exercises WHERE id = ANY($1::uuid[]) AND review_status <> 'PUBLISHED'`,
    [ids("/exercises/")],
  );
  assert.equal(badExercises, 0);
  if (db.applied) {
    const [{ n: badHistorical }] = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM historical_events h
       WHERE h.event_id = ANY($1::uuid[]) AND h.review_status <> 'PUBLISHED'`,
      [ids("/historical/")],
    );
    assert.equal(badHistorical, 0);
  }
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
