/**
 * Live statements (migration 0013): a statement seen live, named in free text, with no link,
 * can be saved and can support publishing on its own (reserved Tier 1 source). Other sources
 * still need a URL.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local and migration 0013 applied; every write
 * happens inside a transaction that is rolled back)
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { insertEvent, replaceEventSources, validateEventForm } = await import("./events");
const { approveEventInTransaction } = await import("./review");
const { LIVE_STATEMENT_SOURCE_ID } = await import("./source-labels");

after(() => getPool().end());

const { rows: [live] } = await getPool().query<{ id: string }>(
  "SELECT id FROM sources WHERE id = $1",
  [LIVE_STATEMENT_SOURCE_ID],
);
const skip = live ? false : "migration 0013 not applied";

const LABEL = "TEST speaker — live remarks (seen on TV)";

function liveForm(label: string): FormData {
  const fd = new FormData();
  fd.set("es_0_source_id", LIVE_STATEMENT_SOURCE_ID);
  fd.set("es_0_article_url", "");
  fd.set("es_0_source_label", label);
  fd.set("es_0_relationship", "SUPPORTS");
  fd.set("es_0_excerpt", "We will look at establishing a base.");
  fd.set("es_primary_index", "0");
  fd.set("event_date", "2026-01-01");
  fd.set("headline", "TEST live statement (rolled back)");
  fd.set("event_type", "ENGINEERING");
  fd.set("confidence_level", "UNVERIFIED");
  return fd;
}

test("a live statement needs a name but no URL", { skip }, async () => {
  const missing = await validateEventForm(liveForm("  "), { humanReviewed: false });
  assert.ok(!missing.ok);
  assert.ok(missing.errors.es_0_source_label);
  assert.equal(missing.errors.es_0_article_url, undefined);

  const result = await validateEventForm(liveForm(LABEL), { humanReviewed: false });
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors));
  assert.equal(result.payload.event.source_name, LABEL);
  assert.equal(result.payload.event.source_url, null);
});

test("an event supported only by a live statement saves and publishes", { skip }, async () => {
  const result = await validateEventForm(liveForm(LABEL), { humanReviewed: false });
  assert.ok(result.ok);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const id = await insertEvent(client, result.payload.event);
    await replaceEventSources(client, id, result.payload.sources);

    const { rows: [row] } = await client.query(
      "SELECT article_url, source_label FROM event_sources WHERE event_id = $1",
      [id],
    );
    assert.deepEqual(row, { article_url: null, source_label: LABEL });

    assert.deepEqual(await approveEventInTransaction(client, id, "test-runner", "MODERATE"), { ok: true });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("a registry source without a URL, or a live row without a name, is refused", { skip }, async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows: [other] } = await client.query<{ id: string }>(
      "SELECT id FROM sources WHERE id <> $1 LIMIT 1",
      [LIVE_STATEMENT_SOURCE_ID],
    );
    const { rows: [e] } = await client.query<{ event_id: string }>(
      `INSERT INTO events (event_date, headline, event_type, internal_notes)
       VALUES ('2026-01-01', 'TEST live checks (rolled back)', 'ENGINEERING', 'events.live-statement.test')
       RETURNING event_id`,
    );

    const attempt = async (sql: string, params: unknown[]) => {
      await client.query("SAVEPOINT s");
      try {
        await client.query(sql, params);
        return null;
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT s");
      }
    };

    assert.equal(
      await attempt(
        "INSERT INTO event_sources (event_id, source_id, article_url) VALUES ($1, $2, NULL)",
        [e.event_id, other.id],
      ),
      "23514",
    );
    assert.equal(
      await attempt(
        "INSERT INTO event_sources (event_id, source_id, article_url) VALUES ($1, $2, NULL)",
        [e.event_id, LIVE_STATEMENT_SOURCE_ID],
      ),
      "23514",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

// Migration 0015: a registered source's post on its social media account.
const { rows: [socialColumn] } = await getPool().query(
  "SELECT 1 FROM information_schema.columns WHERE table_name = 'event_sources' AND column_name = 'social_account'",
);
const skipSocial = socialColumn ? false : "migration 0015 not applied";

function socialForm(account: string, sourceId: string): FormData {
  const fd = liveForm("");
  fd.set("es_0_source_id", sourceId);
  fd.set("es_0_social", "on");
  fd.set("es_0_social_account", account);
  return fd;
}

test("a registered source's social media post keeps the source, names the account, and needs no URL", { skip: skipSocial }, async () => {
  const { rows: [registered] } = await getPool().query<{ id: string; name: string }>(
    "SELECT id, name FROM sources WHERE id <> $1 AND NOT historical_only LIMIT 1",
    [LIVE_STATEMENT_SOURCE_ID],
  );
  const missing = await validateEventForm(socialForm(" ", registered.id), { humanReviewed: false });
  assert.ok(!missing.ok && missing.errors.es_0_social_account);
  assert.equal(!missing.ok && missing.errors.es_0_article_url, undefined);

  const result = await validateEventForm(socialForm("X: @Latvijas_armija", registered.id), { humanReviewed: false });
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors));
  assert.equal(result.payload.event.source_name, registered.name, "the registered source is still named");

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const id = await insertEvent(client, result.payload.event);
    await replaceEventSources(client, id, result.payload.sources);
    const { rows: [row] } = await client.query(
      "SELECT source_id, article_url, social_account FROM event_sources WHERE event_id = $1",
      [id],
    );
    assert.deepEqual(row, { source_id: registered.id, article_url: null, social_account: "X: @Latvijas_armija" });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
