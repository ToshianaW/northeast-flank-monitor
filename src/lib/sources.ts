import "server-only";
import { getPool } from "@/lib/db";
import { countHistoricalSourceReferences } from "@/lib/historical";
import {
  RELIABILITY_VALUES,
  SOURCE_TYPE_VALUES,
  type Reliability,
  type SourceType,
} from "@/lib/source-labels";

export type Source = {
  id: string;
  name: string;
  home_url: string | null;
  source_type: SourceType;
  source_country: string | null;
  source_language: string | null;
  reliability: Reliability;
  tier: number | null;
  notes: string | null;
  /** Historical-only (migration 0008): never collected, not offered for current events or exercises. */
  historical_only: boolean;
  created_at: Date;
  updated_at: Date;
};

export type SourceInput = Omit<Source, "id" | "created_at" | "updated_at">;

export type SourceField = keyof SourceInput;

export type SourceFormValues = Record<SourceField, string>;

export type ValidationResult =
  | { ok: true; input: SourceInput }
  | { ok: false; errors: Partial<Record<SourceField, string>> };

const COLUMNS =
  "id, name, home_url, source_type, source_country, source_language, reliability, tier, notes, historical_only, created_at, updated_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function formValuesFrom(formData: FormData): SourceFormValues {
  const get = (key: SourceField) => String(formData.get(key) ?? "");
  return {
    name: get("name"),
    home_url: get("home_url"),
    source_type: get("source_type"),
    source_country: get("source_country"),
    source_language: get("source_language"),
    reliability: get("reliability"),
    tier: get("tier"),
    notes: get("notes"),
    historical_only: formData.get("historical_only") === "on" ? "on" : "",
  };
}

export function formValuesFromSource(source: Source): SourceFormValues {
  return {
    name: source.name,
    home_url: source.home_url ?? "",
    source_type: source.source_type,
    source_country: source.source_country ?? "",
    source_language: source.source_language ?? "",
    reliability: source.reliability,
    tier: source.tier === null ? "" : String(source.tier),
    notes: source.notes ?? "",
    historical_only: source.historical_only ? "on" : "",
  };
}

export function validateSource(values: SourceFormValues): ValidationResult {
  const errors: Partial<Record<SourceField, string>> = {};

  const name = values.name.trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";

  const homeUrl = optionalText(values.home_url);
  if (homeUrl) {
    try {
      const url = new URL(homeUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.home_url = "Use an http:// or https:// URL.";
      }
    } catch {
      errors.home_url = "Enter a full URL, including https://.";
    }
  }

  if (!SOURCE_TYPE_VALUES.includes(values.source_type as SourceType)) {
    errors.source_type = "Choose a source type.";
  }
  if (!RELIABILITY_VALUES.includes(values.reliability as Reliability)) {
    errors.reliability = "Choose a reliability rating.";
  }

  let tier: number | null = null;
  if (values.tier.trim() !== "") {
    tier = Number(values.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) {
      errors.tier = "Tier must be 1, 2, 3, or 4.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    input: {
      name,
      home_url: homeUrl,
      source_type: values.source_type as SourceType,
      source_country: optionalText(values.source_country),
      source_language: optionalText(values.source_language),
      reliability: values.reliability as Reliability,
      tier,
      notes: optionalText(values.notes),
      historical_only: values.historical_only === "on",
    },
  };
}

export async function listSources(): Promise<Source[]> {
  const { rows } = await getPool().query<Source>(
    `SELECT ${COLUMNS} FROM sources ORDER BY tier ASC NULLS LAST, lower(name) ASC`,
  );
  return rows;
}

export async function getSource(id: string): Promise<Source | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<Source>(
    `SELECT ${COLUMNS} FROM sources WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function params(input: SourceInput) {
  return [
    input.name,
    input.home_url,
    input.source_type,
    input.source_country,
    input.source_language,
    input.reliability,
    input.tier,
    input.notes,
    input.historical_only,
  ];
}

export async function createSource(input: SourceInput): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO sources
       (name, home_url, source_type, source_country, source_language, reliability, tier, notes, historical_only)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    params(input),
  );
  return rows[0].id;
}

export async function updateSource(
  id: string,
  input: SourceInput,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const { rowCount } = await getPool().query(
    `UPDATE sources SET
       name = $1, home_url = $2, source_type = $3, source_country = $4,
       source_language = $5, reliability = $6, tier = $7, notes = $8, historical_only = $9
     WHERE id = $10`,
    [...params(input), id],
  );
  return rowCount === 1;
}

/**
 * The published historical events named in a refused tier change (0008 trigger
 * sources_keep_historical_tier), or null when the error is something else.
 */
export function refusedTierChangeEvents(error: unknown): string[] | null {
  const message = error instanceof Error ? error.message : "";
  if (!message.includes("would leave published historical events with Tier 4-only support")) return null;
  return message.split(":").pop()!.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s));
}

/** Current events and exercises may not cite historical-only sources. */
export function currentSourceOptions(sources: Source[], keepIds: Iterable<string> = []): Source[] {
  const keep = new Set(keepIds);
  return sources.filter((s) => !s.historical_only || keep.has(s.id));
}

export type SourceReferenceCounts = {
  event_sources: number;
  exercise_sources: number;
  review_actions: number;
  historical_sources: number;
  historical_actions: number;
};

export async function getSourceReferenceCounts(
  id: string,
): Promise<SourceReferenceCounts | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<SourceReferenceCounts>(
    `SELECT
       (SELECT count(*)::int FROM event_sources WHERE source_id = $1) AS event_sources,
       (SELECT count(*)::int FROM exercise_sources WHERE source_id = $1) AS exercise_sources,
       (SELECT count(*)::int FROM review_actions WHERE $1 = ANY (source_ids)) AS review_actions`,
    [id],
  );
  if (!rows[0]) return null;
  return { ...rows[0], ...(await countHistoricalSourceReferences(id)) };
}

export type DeleteSourceResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "in_use" | "historical"; counts?: SourceReferenceCounts };

export async function deleteSource(id: string): Promise<DeleteSourceResult> {
  if (!UUID_RE.test(id)) return { ok: false, reason: "not_found" };

  const counts = await getSourceReferenceCounts(id);
  if (!counts) return { ok: false, reason: "not_found" };

  // Checked first so the message names the historical record (the FK would otherwise
  // surface as a raw database error).
  if (counts.historical_sources > 0 || counts.historical_actions > 0) {
    return { ok: false, reason: "historical", counts };
  }

  const inUse =
    counts.event_sources > 0 ||
    counts.exercise_sources > 0 ||
    counts.review_actions > 0;
  if (inUse) return { ok: false, reason: "in_use", counts };

  const { rowCount } = await getPool().query(`DELETE FROM sources WHERE id = $1`, [
    id,
  ]);
  return rowCount === 1 ? { ok: true } : { ok: false, reason: "not_found" };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
