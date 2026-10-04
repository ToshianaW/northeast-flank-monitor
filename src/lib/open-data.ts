/**
 * Open data (spec §58, Phase 7): request checks, serialisation and CSV for GET /api/events and
 * GET /api/events.csv. Pure: no database. Every query parameter is checked here BEFORE any
 * database work, so an unknown or invalid parameter costs no query and random query strings
 * cannot fan out past the CDN cache.
 */
import { EVENT_TYPE_VALUES, type EventType } from "@/lib/event-labels";

// ---------------------------------------------------------------------------
// Caps and headers
// ---------------------------------------------------------------------------

export const JSON_DEFAULT_LIMIT = 50;
export const JSON_MAX_LIMIT = 200;
export const CSV_MAX_ROWS = 2_000;
export const MAX_RANGE_DAYS = 90;
export const DEFAULT_RANGE_DAYS = 30;

export const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const LICENCE_LINE =
  "Summaries and metadata: CC BY 4.0, Northeast Flank Monitor. Excerpts and linked articles remain the property of their original sources.";

export const ATTRIBUTION = {
  publisher: "Northeast Flank Monitor",
  licence: LICENCE_LINE,
  licence_url: "https://creativecommons.org/licenses/by/4.0/",
  gdelt: "Some reporting is found through the GDELT Project (https://www.gdeltproject.org/).",
  note: "Published events only, each reviewed by a person. Counts reflect reporting, not intensity of activity.",
} as const;

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export const ALLOWED_PARAMS = ["area", "type", "from", "to", "layer", "limit", "cursor"] as const;

/** Map areas (gazetteer unit ids), theater-wide items, and unplaced items. */
export const AREA_IDS = [
  "PL", "LT", "LV", "EE", "BY", "RU-KGD", "RU-W", "BALTIC-SEA", "GULF-OF-FINLAND",
  "RU-ELSE", "UA", "WEST-EU", "NORTH-AM", "THEATER-WIDE", "UNPLACED",
] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** Friendly names accepted for `area` (spec §58 uses region=kaliningrad). */
const AREA_ALIASES: Record<string, AreaId> = {
  poland: "PL", lithuania: "LT", latvia: "LV", estonia: "EE", belarus: "BY", kaliningrad: "RU-KGD",
  "western-russia": "RU-W", "baltic-sea": "BALTIC-SEA", "gulf-of-finland": "GULF-OF-FINLAND",
  "russia-elsewhere": "RU-ELSE", ukraine: "UA", "western-europe": "WEST-EU", "north-america": "NORTH-AM",
  "theater-wide": "THEATER-WIDE", unplaced: "UNPLACED",
};

export const LAYERS = ["all", "activity", "statements"] as const;
export type Layer = (typeof LAYERS)[number];

export type Query = {
  area: AreaId | null;
  types: EventType[];
  from: string;
  to: string;
  layer: Layer;
  limit: number;
  cursor: Cursor | null;
};

export type Cursor = { date: string; id: string };

export type ParseResult = { ok: true; query: Query } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

function realDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS);

/** Opaque keyset cursor: base64url of "YYYY-MM-DD|uuid" (the last row of the previous page). */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.date}|${c.id}`, "utf8").toString("base64url");
}

export function decodeCursor(value: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) return null;
  const [date, id, extra] = Buffer.from(value, "base64url").toString("utf8").split("|");
  if (extra !== undefined || !date || !id || !realDate(date) || !UUID_RE.test(id)) return null;
  return { date, id: id.toLowerCase() };
}

/**
 * Checks every parameter before any database work. Unknown parameters, repeated parameters and
 * invalid values are refused. `type` takes a comma-separated list. Dates default to the last
 * DEFAULT_RANGE_DAYS days and may span at most MAX_RANGE_DAYS.
 */
export function parseQuery(search: URLSearchParams, options: { format: "json" | "csv"; today: string }): ParseResult {
  const fail = (error: string): ParseResult => ({ ok: false, error });
  const seen = new Set<string>();
  for (const key of search.keys()) {
    if (!(ALLOWED_PARAMS as readonly string[]).includes(key)) return fail(`Unknown parameter "${key.slice(0, 40)}". Allowed: ${ALLOWED_PARAMS.join(", ")}.`);
    if (seen.has(key)) return fail(`Parameter "${key}" may appear only once.`);
    seen.add(key);
  }
  const get = (key: string) => search.get(key);

  let area: AreaId | null = null;
  const areaRaw = get("area");
  if (areaRaw !== null) {
    const upper = areaRaw.trim().toUpperCase();
    area = (AREA_IDS as readonly string[]).includes(upper) ? (upper as AreaId) : (AREA_ALIASES[areaRaw.trim().toLowerCase()] ?? null);
    if (!area) return fail(`Invalid area. Allowed: ${AREA_IDS.join(", ")} (or a name such as kaliningrad).`);
  }

  let types: EventType[] = [];
  const typeRaw = get("type");
  if (typeRaw !== null) {
    types = [...new Set(typeRaw.split(",").map((t) => t.trim().toUpperCase()))] as EventType[];
    if (types.length === 0 || types.some((t) => !(EVENT_TYPE_VALUES as readonly string[]).includes(t))) {
      return fail("Invalid type. Use event type names such as EXERCISE or AIR_ACTIVITY, comma-separated.");
    }
  }

  const layerRaw = get("layer");
  const layer = (layerRaw ?? "all").trim().toLowerCase() as Layer;
  if (!(LAYERS as readonly string[]).includes(layer)) return fail(`Invalid layer. Allowed: ${LAYERS.join(", ")}.`);

  const toRaw = get("to");
  const fromRaw = get("from");
  if (toRaw !== null && !realDate(toRaw)) return fail("Invalid to: use YYYY-MM-DD.");
  if (fromRaw !== null && !realDate(fromRaw)) return fail("Invalid from: use YYYY-MM-DD.");
  const to = toRaw ?? options.today;
  const from = fromRaw ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) return fail("from must be on or before to.");
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return fail(`The date range may span at most ${MAX_RANGE_DAYS} days.`);

  const max = options.format === "json" ? JSON_MAX_LIMIT : CSV_MAX_ROWS;
  const fallback = options.format === "json" ? JSON_DEFAULT_LIMIT : CSV_MAX_ROWS;
  const limitRaw = get("limit");
  let limit = fallback;
  if (limitRaw !== null) {
    if (!/^\d{1,5}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > max) return fail(`Invalid limit: 1 to ${max}.`);
    limit = Number(limitRaw);
  }

  const cursorRaw = get("cursor");
  let cursor: Cursor | null = null;
  if (cursorRaw !== null) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return fail("Invalid cursor: use the next_cursor value from a previous response.");
  }

  return { ok: true, query: { area, types, from, to, layer, limit, cursor } };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Event fields in the output, in order: the site's public fields plus derived ones. */
export const OUTPUT_EVENT_FIELDS = [
  "event_id", "url", "event_date", "reported_date", "headline", "summary", "actor", "country", "region",
  "location_name", "location_precision", "area", "layer", "event_type", "event_subtype", "exercise_name",
  "exercise_status", "unit_name", "unit_type", "unit_home_location", "personnel_estimate", "equipment_type",
  "equipment_quantity", "activity_description", "source_name", "source_url", "source_type", "confidence_level",
  "first_reported", "last_updated", "announced_start_date", "announced_end_date", "observed_start_date",
  "observed_end_date", "personnel_return_status", "equipment_return_status", "infrastructure_status",
  "follow_on_activity", "overall_reset_status", "contradiction_flag", "contradiction_notes", "sources",
] as const;

export const OUTPUT_SOURCE_FIELDS = [
  "name", "home_url", "source_type", "source_country", "tier", "state_or_official", "article_url",
  "relationship", "is_primary", "excerpt",
] as const;

const DATE_ONLY = new Set(["event_date", "reported_date", "announced_start_date", "announced_end_date", "observed_start_date", "observed_end_date"]);

export type OutputSource = Record<(typeof OUTPUT_SOURCE_FIELDS)[number], unknown>;
export type OutputEvent = Record<(typeof OUTPUT_EVENT_FIELDS)[number], unknown>;

function value(key: string, v: unknown): unknown {
  if (v instanceof Date) return DATE_ONLY.has(key) ? v.toISOString().slice(0, 10) : v.toISOString();
  return v ?? null;
}

/**
 * Builds one output event from whatever row it is given, copying ONLY the allowed fields (an
 * allowlist, never a denylist), so a column added to a query can never leak.
 */
export function toOutputEvent(
  row: Record<string, unknown>,
  derived: { url: string; area: AreaId; layer: Exclude<Layer, "all"> },
  sources: ReadonlyArray<Record<string, unknown>>,
): OutputEvent {
  const out = {} as OutputEvent;
  for (const key of OUTPUT_EVENT_FIELDS) {
    if (key === "url") out.url = derived.url;
    else if (key === "area") out.area = derived.area;
    else if (key === "layer") out.layer = derived.layer;
    else if (key === "sources") {
      out.sources = sources.map((s) => {
        const o = {} as OutputSource;
        for (const k of OUTPUT_SOURCE_FIELDS) o[k] = value(k, s[k]);
        return o;
      });
    } else out[key] = value(key, row[key]);
  }
  return out;
}

export function jsonBody(events: OutputEvent[], query: Query, nextCursor: string | null, generatedAt: string) {
  return {
    data: events,
    meta: {
      count: events.length,
      limit: query.limit,
      next_cursor: nextCursor,
      filters: { area: query.area, type: query.types, from: query.from, to: query.to, layer: query.layer },
      generated_at: generatedAt,
    },
    attribution: ATTRIBUTION,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** The value of the final CSV column, on every row (the X-Data-Licence header carries LICENCE_LINE). */
export const CSV_LICENCE = "CC BY 4.0, Northeast Flank Monitor. Excerpts and linked articles remain the property of their original sources.";

/** CSV columns: the event fields (sources flattened) and the licence, never anything else. */
export const CSV_COLUMNS = [
  ...OUTPUT_EVENT_FIELDS.filter((f) => f !== "sources"),
  "source_count", "source_names", "source_article_urls", "source_tiers", "state_or_official_sources",
  "licence",
] as const;

/**
 * One CSV cell (RFC 4180 quoting). A value starting with = + - @, tab or carriage return is
 * prefixed with an apostrophe so a spreadsheet shows it as text instead of running it as a formula.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvBody(events: readonly OutputEvent[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    const sources = (e.sources as OutputSource[]) ?? [];
    const flat: Record<string, unknown> = {
      ...e,
      source_count: sources.length,
      source_names: sources.map((s) => s.name).join("; "),
      source_article_urls: sources.map((s) => s.article_url).join("; "),
      source_tiers: sources.map((s) => s.tier ?? "").join("; "),
      state_or_official_sources: sources.filter((s) => s.state_or_official).map((s) => s.name).join("; "),
      licence: CSV_LICENCE,
    };
    lines.push(CSV_COLUMNS.map((c) => csvCell(flat[c])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
