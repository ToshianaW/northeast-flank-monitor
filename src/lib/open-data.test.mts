/**
 * Open-data API: parameter checks (before any query), caps, cursor, field allowlist (leak test),
 * CSV escaping, headers, query shape, and decision 11. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  CACHE_CONTROL,
  CSV_COLUMNS,
  CSV_LICENCE,
  csvBody,
  csvCell,
  decodeCursor,
  encodeCursor,
  LICENCE_LINE,
  OUTPUT_EVENT_FIELDS,
  OUTPUT_SOURCE_FIELDS,
  parseQuery,
  toOutputEvent,
  type Query,
} from "./open-data";
import { handleOpenData, optionsResponse, type Loader } from "./open-data-handler";
import { PUBLIC_EVENT_FIELDS } from "./public-events";
import { heldByDecision11 } from "./public-open-data";

const TODAY = "2026-10-04";
const NOW = new Date(`${TODAY}T12:00:00Z`);
const parse = (qs: string, format: "json" | "csv" = "json") => parseQuery(new URLSearchParams(qs), { format, today: TODAY });

function countingLoader(): { load: Loader; calls: Query[] } {
  const calls: Query[] = [];
  return { calls, load: async (q) => { calls.push(q); return { events: [], nextCursor: null }; } };
}

test("an unknown, repeated or invalid parameter returns 400 and makes no query", async () => {
  for (const qs of ["foo=bar", "limit=9999", "limit=0", "limit=abc", "type=EXERCISE&type=AIR_ACTIVITY", "area=mars",
    "type=PHASE_ONE", "layer=threat", "from=2026-02-30", "from=2026-06-01&to=2026-10-01", "from=2026-10-04&to=2026-10-01",
    "cursor=not-valid!!", "utm_source=x"]) {
    const { load, calls } = countingLoader();
    const res = await handleOpenData(new Request(`https://x.test/api/events?${qs}`), "json", load, NOW);
    assert.equal(res.status, 400, qs);
    assert.equal(calls.length, 0, `${qs} reached the database`);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(res.headers.get("Cache-Control"), CACHE_CONTROL);
    assert.ok(typeof (await res.json()).error === "string");
  }
  const csv = countingLoader();
  assert.equal((await handleOpenData(new Request("https://x.test/api/events.csv?limit=2001"), "csv", csv.load, NOW)).status, 400);
  assert.equal(csv.calls.length, 0);
});

test("defaults and caps: JSON 50 (max 200), CSV 2,000, last 30 days, at most 90 days", () => {
  const def = parse("");
  assert.ok(def.ok);
  if (!def.ok) return;
  assert.deepEqual(
    { limit: def.query.limit, from: def.query.from, to: def.query.to, layer: def.query.layer, area: def.query.area },
    { limit: 50, from: "2026-09-05", to: "2026-10-04", layer: "all", area: null },
  );
  assert.equal(parse("limit=200").ok, true);
  assert.equal(parse("limit=201").ok, false);
  const csv = parse("", "csv");
  assert.equal(csv.ok && csv.query.limit, 2000);
  assert.equal(parse("limit=2000", "csv").ok, true);
  assert.equal(parse("from=2026-07-07&to=2026-10-04").ok, true, "90 days inclusive");
  assert.equal(parse("from=2026-07-06&to=2026-10-04").ok, false, "91 days");
  const alias = parse("area=kaliningrad&type=exercise,AIR_ACTIVITY&layer=activity");
  assert.ok(alias.ok);
  if (alias.ok) {
    assert.equal(alias.query.area, "RU-KGD");
    assert.deepEqual(alias.query.types, ["EXERCISE", "AIR_ACTIVITY"]);
  }
});

test("the keyset cursor round-trips and rejects tampering", () => {
  const c = { date: "2026-10-01", id: "11111111-1111-4111-8111-111111111111" };
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
  assert.equal(decodeCursor(Buffer.from("2026-10-01|x").toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from(`2026-10-01|${c.id}|extra`).toString("base64url")), null);
  const parsed = parse(`cursor=${encodeCursor(c)}`);
  assert.ok(parsed.ok && parsed.query.cursor?.id === c.id);
});

const SENTINEL = "ZZ-NOT-PUBLIC";
/** A row with every public field, every internal events column, and query helpers, all filled. */
function fullRow(): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of PUBLIC_EVENT_FIELDS) row[f] = f === "contradiction_flag" ? false : `${f}-value`;
  row.event_date = new Date("2026-10-01T00:00:00Z");
  for (const internal of ["internal_notes", "ai_generated_summary", "historical_analogue", "historical_notes", "review_status",
    "human_reviewed", "extraction_run_id", "created_at", "updated_at", "reviewer", "raw_text", "_support_tiers", "exercise_id",
    "source_language", "source_country", "source_reliability"]) row[internal] = SENTINEL;
  row.latitude = 54.123456;
  row.longitude = 25.654321;
  row._latitude = 54.123456;
  row._longitude = 25.654321;
  return row;
}
const fullSource = () => ({
  event_id: SENTINEL, name: "Source", home_url: "https://example.org", source_type: "OFFICIAL_MILITARY", source_country: "Russia",
  tier: 1, state_or_official: true, article_url: "https://example.org/a", relationship: "SUPPORTS", is_primary: true,
  excerpt: "Units began a readiness check.", reliability: SENTINEL, internal_notes: SENTINEL, created_at: SENTINEL,
});

test("field leak: output carries only the allowed fields; internal notes, reviewers and coordinates never appear", () => {
  const out = toOutputEvent(fullRow(), { url: "https://site/events/x", area: "BY", layer: "activity" }, [fullSource()]);
  assert.deepEqual(Object.keys(out), [...OUTPUT_EVENT_FIELDS]);
  const sources = out.sources as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(sources[0]), [...OUTPUT_SOURCE_FIELDS]);
  const derived = new Set(["url", "area", "layer", "sources"]);
  for (const f of OUTPUT_EVENT_FIELDS) {
    if (!derived.has(f)) assert.ok((PUBLIC_EVENT_FIELDS as readonly string[]).includes(f), `${f} is not a public field`);
  }
  for (const required of ["confidence_level", "contradiction_flag"]) assert.ok((OUTPUT_EVENT_FIELDS as readonly string[]).includes(required));
  for (const required of ["tier", "state_or_official"]) assert.ok((OUTPUT_SOURCE_FIELDS as readonly string[]).includes(required));
  for (const text of [JSON.stringify(out), csvBody([out])]) {
    assert.ok(!text.includes(SENTINEL), "an internal value leaked");
    assert.ok(!/54\.123456|25\.654321/.test(text), "coordinates leaked");
    assert.ok(!/internal_notes|reviewer|latitude|longitude|raw_text|ai_generated_summary/.test(text), "an internal field name leaked");
  }
  assert.equal(out.event_date, "2026-10-01", "dates are YYYY-MM-DD");
});

test("CSV: RFC 4180 quoting and formula escaping", () => {
  assert.equal(csvCell('He said "go", then left'), '"He said ""go"", then left"');
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
  for (const f of ["=HYPERLINK(1)", "+1", "-2+3", "@SUM(A1)", "\tx"]) assert.ok(csvCell(f).replace(/^"/, "").startsWith("'"), f);
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(3), "3");
  const out = toOutputEvent(fullRow(), { url: "u", area: "BY", layer: "activity" }, [fullSource(), { ...fullSource(), name: "Other", tier: 4, state_or_official: false }]);
  const [header, line] = csvBody([out]).split("\r\n");
  assert.equal(header, CSV_COLUMNS.join(","));
  assert.match(line, /Source; Other/);
  assert.match(line, /1; 4/);
  assert.equal(CSV_COLUMNS.at(-1), "licence", "licence is the final column");
  assert.ok(line.endsWith(`,"${CSV_LICENCE}"`), "every row ends with the licence (quoted: it contains commas)");
  assert.equal(CSV_LICENCE, "CC BY 4.0, Northeast Flank Monitor. Excerpts and linked articles remain the property of their original sources.");
  // Field leak: CSV columns are the allowed event fields, the flattened source fields and the licence only.
  const allowedCsv = new Set<string>([...OUTPUT_EVENT_FIELDS.filter((f) => f !== "sources"), "source_count", "source_names", "source_article_urls", "source_tiers", "state_or_official_sources", "licence"]);
  assert.deepEqual(header.split(",").filter((c) => !allowedCsv.has(c)), []);
});

test("headers: CORS, caching, licence; OPTIONS is GET-only with no credentials", async () => {
  const stub: Loader = async () => ({ events: [], nextCursor: "abc" });
  const json = await handleOpenData(new Request("https://x.test/api/events?limit=2"), "json", stub, NOW);
  assert.equal(json.status, 200);
  assert.equal(json.headers.get("Cache-Control"), "public, s-maxage=3600, stale-while-revalidate=86400");
  assert.equal(json.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await json.json();
  assert.deepEqual(Object.keys(body), ["data", "meta", "attribution"]);
  assert.equal(body.attribution.licence, LICENCE_LINE);
  assert.equal(body.meta.next_cursor, "abc");
  const csv = await handleOpenData(new Request("https://x.test/api/events.csv?limit=2"), "csv", stub, NOW);
  assert.equal(csv.headers.get("X-Truncated"), "true");
  assert.equal(csv.headers.get("X-Data-Licence"), LICENCE_LINE);
  assert.match(csv.headers.get("Content-Type") ?? "", /text\/csv/);
  const options = optionsResponse();
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  assert.equal(options.headers.get("Access-Control-Allow-Credentials"), null);
  const failing: Loader = async () => { throw new Error("db down"); };
  const err = await handleOpenData(new Request("https://x.test/api/events"), "json", failing, NOW);
  assert.equal(err.status, 503);
  assert.equal(err.headers.get("Cache-Control"), "no-store");
});

test("query shape: public columns only, never SELECT *, coordinates only for placement", () => {
  // Code only: comments may name what the code avoids.
  const source = readFileSync(join(process.cwd(), "src/lib/public-open-data.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/SELECT\s+\*|\.\*\s*(,|FROM)/i.test(source), "SELECT *");
  assert.match(source, /SELECT \$\{PUBLIC_EVENT_COLUMNS\}, e\.latitude AS _latitude, e\.longitude AS _longitude/);
  assert.match(source, /e\.review_status = 'PUBLISHED'/);
  assert.ok(!/internal_notes|ai_generated_summary|reviewer|raw_documents|raw_text|historical_/.test(source));
  for (const route of ["src/app/api/events/route.ts", "src/app/api/events.csv/route.ts"]) {
    const r = readFileSync(join(process.cwd(), route), "utf8");
    assert.ok(!/export (async )?function (POST|PUT|PATCH|DELETE)/.test(r), `${route} must be read-only`);
  }
});

test("decision 11: recent events supported only by Tier 4 are held back, as on the map", () => {
  const recent = new Date("2026-10-03T00:00:00Z");
  const old = new Date("2026-09-20T00:00:00Z");
  assert.equal(heldByDecision11({ event_date: recent, first_reported: null, _support_tiers: [4] }, NOW), true);
  assert.equal(heldByDecision11({ event_date: recent, first_reported: null, _support_tiers: [4, 2] }, NOW), false);
  assert.equal(heldByDecision11({ event_date: old, first_reported: null, _support_tiers: [4] }, NOW), false, "after 72 hours");
  assert.equal(heldByDecision11({ event_date: old, first_reported: new Date("2026-10-03T08:00:00Z"), _support_tiers: [4] }, NOW), true, "reported recently");
  assert.equal(heldByDecision11({ event_date: recent, first_reported: null, _support_tiers: [] }, NOW), false, "no SUPPORTS rows: not Tier 4-only");
});
