/**
 * Date round-trip: a DATE saved from a non-UTC server must read back unchanged.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local; writes nothing — the insert is rolled back)
 */
// Set before any Date work: Node applies TZ changes at runtime.
process.env.TZ = "America/Chicago";

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { insertEvent, toDateParam, validateEventForm } = await import("./events");

after(() => getPool().end());

// Validation requires a supporting source; borrow any registry row (read only).
const { rows: [anySource] } = await getPool().query<{ id: string }>("SELECT id FROM sources WHERE NOT historical_only AND id <> '1100e000-0000-4000-8000-000000000001' LIMIT 1");

function draftForm(date: string): FormData {
  const fd = new FormData();
  fd.set("es_0_source_id", anySource.id);
  fd.set("es_0_article_url", "https://example.org/date-round-trip-test");
  fd.set("es_0_relationship", "SUPPORTS");
  fd.set("es_primary_index", "0");
  fd.set("event_date", date);
  fd.set("announced_start_date", date);
  fd.set("headline", "TEST date round-trip (rolled back)");
  fd.set("event_type", "ENGINEERING");
  fd.set("confidence_level", "UNVERIFIED");
  return fd;
}

test("process time zone is America/Chicago (UTC-5/-6)", () => {
  assert.ok(new Date("2025-08-30T12:00:00Z").getTimezoneOffset() > 0);
});

test("form date 2025-08-30 is sent to Postgres as '2025-08-30'", async () => {
  const result = await validateEventForm(draftForm("2025-08-30"), { humanReviewed: false });
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors));
  assert.equal(toDateParam(result.payload.event.event_date), "2025-08-30");
  assert.equal(toDateParam(result.payload.event.announced_start_date), "2025-08-30");
});

test("insertEvent saves 2025-08-30 and reads back 2025-08-30", async () => {
  const result = await validateEventForm(draftForm("2025-08-30"), { humanReviewed: false });
  assert.ok(result.ok);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const id = await insertEvent(client, result.payload.event);
    const { rows } = await client.query<{ as_text: string; announced: string; parsed: Date }>(
      `SELECT event_date::text AS as_text, announced_start_date::text AS announced, event_date AS parsed
       FROM events WHERE event_id = $1`,
      [id],
    );
    assert.equal(rows[0].as_text, "2025-08-30", "stored DATE value");
    assert.equal(rows[0].announced, "2025-08-30", "stored announced_start_date");
    assert.equal(rows[0].parsed.toISOString().slice(0, 10), "2025-08-30", "value as read by the app");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
