/**
 * Admin edits of an AI-drafted digest keep sections._meta, cost_usd included (the job summary's spend
 * line reads it). Against the database inside a transaction that is rolled back. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { openRollbackDb } from "./historical.testing.mjs";

const db = await openRollbackDb({ installAsAppPool: true });
const { DIGEST_SECTIONS, getDigest, updateDigest } = await import("./digests");

const meta = {
  generator: "ai",
  model: "claude-sonnet-5-5",
  prompt_version: "digest-v5.1",
  generated_at: "2026-10-05T05:00:00.000Z",
  cost_usd: 0.0731,
};
const emptySections = Object.fromEntries(DIGEST_SECTIONS.map(({ key }) => [key, ""]));

test("updateDigest changes the sections and keeps _meta, cost_usd included", async () => {
  const { rows: [{ id }] } = await db.client.query<{ id: string }>(
    `INSERT INTO daily_digests (digest_date, title, sections, review_status)
     VALUES ('1999-02-03', 'Test digest', $1::jsonb, 'DRAFT') RETURNING id`,
    [JSON.stringify({ ...emptySections, belarus: "Before the edit.", _meta: meta })],
  );

  const sections = { ...emptySections, belarus: "After the edit." } as Parameters<typeof updateDigest>[1]["sections"];
  assert.equal(await updateDigest(id, { digest_date: "1999-02-03", title: "Edited", sections, review_status: "PUBLISHED" }), true);

  const { rows: [row] } = await db.client.query<{ sections: Record<string, unknown> }>(
    `SELECT sections FROM daily_digests WHERE id = $1`,
    [id],
  );
  assert.equal(row.sections.belarus, "After the edit.");
  assert.deepEqual(row.sections._meta, meta, "_meta unchanged, cost_usd kept");

  const digest = await getDigest(id);
  assert.equal(digest?.meta?.cost_usd, 0.0731);
  assert.equal(digest?.title, "Edited");
});

test("rollback", async () => {
  const pool = await db.rollback();
  await pool.end();
});
