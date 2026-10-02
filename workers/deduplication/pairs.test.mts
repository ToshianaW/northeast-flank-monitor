/**
 * Step 2.3 duplicate classification. Run: npm test
 * The DB case needs migration 0005 (pg_trgm, duplicate_candidates) and is skipped until it is applied.
 * It creates three throwaway DRAFT events, checks how they pair, and deletes them. No model calls.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";
import pg from "pg";
import {
  BORDERLINE_SIMILARITY,
  classifyPair,
  findPairs,
  isNoAiOnly,
  LIKELY_SIMILARITY,
} from "./pairs.mjs";

if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

const base = { sameArticle: false, noAiOnly: false, modelUnavailable: null } as const;

test("classifyPair: thresholds and bases", () => {
  assert.deepEqual(classifyPair({ ...base, similarity: 0.1, sameArticle: true }), { kind: "LIKELY", basis: "SAME_ARTICLE" });
  assert.deepEqual(classifyPair({ ...base, similarity: LIKELY_SIMILARITY }), { kind: "LIKELY", basis: "TRIGRAM" });
  assert.deepEqual(classifyPair({ ...base, similarity: 0.4 }), { kind: "ASK_MODEL" });
  assert.deepEqual(classifyPair({ ...base, similarity: BORDERLINE_SIMILARITY - 0.01 }), { kind: "IGNORE" });
});

test("classifyPair: no-AI sources are never sent to the model", () => {
  assert.deepEqual(classifyPair({ ...base, similarity: 0.4, noAiOnly: true }), { kind: "BORDERLINE", skipped: "NO_AI_SOURCE" });
  // Similarity alone still decides likely and ignored pairs.
  assert.deepEqual(classifyPair({ ...base, similarity: 0.9, noAiOnly: true }), { kind: "LIKELY", basis: "TRIGRAM" });
  assert.deepEqual(classifyPair({ ...base, similarity: 0.1, noAiOnly: true }), { kind: "IGNORE" });
});

test("classifyPair: --no-model and the spend cap keep borderline pairs visible", () => {
  assert.deepEqual(classifyPair({ ...base, similarity: 0.4, modelUnavailable: "NO_MODEL" }), { kind: "BORDERLINE", skipped: "NO_MODEL" });
  assert.deepEqual(classifyPair({ ...base, similarity: 0.4, modelUnavailable: "SPEND_CAP" }), { kind: "BORDERLINE", skipped: "SPEND_CAP" });
});

test("isNoAiOnly: every supporting source must be flagged", () => {
  const flagged = new Set(["NPR", "LRT"]);
  assert.equal(isNoAiOnly(["NPR"], flagged), true);
  assert.equal(isNoAiOnly(["LRT", "NPR"], flagged), true);
  assert.equal(isNoAiOnly(["LRT", "ERR"], flagged), false);
  assert.equal(isNoAiOnly([], flagged), false);
  assert.equal(isNoAiOnly(null, flagged), false);
});

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
after(() => client.end());
const { rows: [ready] } = await client.query<{ ok: boolean }>(
  `SELECT to_regclass('duplicate_candidates') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok`,
);

test("findPairs: planted drafts pair as expected", { skip: !ready.ok && "migration 0005 not applied" }, async () => {
  // Base: the newest published event that has a primary source.
  const { rows: [b] } = await client.query<{
    event_id: string; headline: string; event_type: string; country: string | null; event_date: string;
    source_id: string; article_url: string;
  }>(
    `SELECT e.event_id, e.headline, e.event_type::text, e.country, e.event_date::text, es.source_id, es.article_url
     FROM events e JOIN event_sources es ON es.event_id = e.event_id AND es.is_primary
     WHERE e.review_status = 'PUBLISHED' ORDER BY e.event_date DESC, e.created_at DESC LIMIT 1`,
  );
  assert.ok(b, "needs one published event with a primary source");

  const planted: string[] = [];
  async function plant(headline: string, articleUrl: string): Promise<string> {
    const { rows: [e] } = await client.query<{ event_id: string }>(
      `INSERT INTO events (event_date, headline, event_type, country, internal_notes)
       VALUES ($1, $2, $3, $4, 'pairs.test (deleted by test)') RETURNING event_id`,
      [b.event_date, headline, b.event_type, b.country],
    );
    planted.push(e.event_id);
    await client.query(
      `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary)
       VALUES ($1, $2, $3, 'SUPPORTS', true)`,
      [e.event_id, b.source_id, articleUrl],
    );
    return e.event_id;
  }

  try {
    const reworded = await plant(`Report: ${b.headline}`, "https://example.invalid/pairs-test-a");
    const sameArticle = await plant("TEST zebra quartz unrelated headline", b.article_url);
    const unrelated = await plant("TEST walrus obsidian different headline", "https://example.invalid/pairs-test-c");

    const pairs = await findPairs(client, { subjects: "pending", skipExisting: false });
    const pairOf = (x: string, y: string) =>
      pairs.find((p) => (p.a_id === x && p.b_id === y) || (p.a_id === y && p.b_id === x));
    const kind = (x: string, y: string) => {
      const p = pairOf(x, y);
      return p
        ? classifyPair({ similarity: p.similarity, sameArticle: p.same_article, noAiOnly: false, modelUnavailable: "NO_MODEL" }).kind
        : "NOT_PAIRED";
    };

    assert.equal(kind(reworded, b.event_id), "LIKELY", "reworded copy should be a likely duplicate");
    const sa = pairOf(sameArticle, b.event_id);
    assert.ok(sa?.same_article, "draft citing the same article should be flagged SAME_ARTICLE");
    assert.equal(kind(unrelated, b.event_id), "IGNORE", "unrelated headline should be ignored");
  } finally {
    await client.query("DELETE FROM events WHERE event_id = ANY($1::uuid[])", [planted]);
  }
});
