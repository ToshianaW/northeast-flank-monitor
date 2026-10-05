/** Values must match the enums in src/db/migrations/0001_initial_schema.sql. */
export const SOURCE_TYPE_VALUES = [
  "OFFICIAL_GOVERNMENT",
  "OFFICIAL_MILITARY",
  "INDEPENDENT_ANALYSIS",
  "ESTABLISHED_MEDIA",
  "OSINT",
  "UNKNOWN",
] as const;

export type SourceType = (typeof SOURCE_TYPE_VALUES)[number];

export const RELIABILITY_VALUES = ["HIGH", "MEDIUM", "LOW", "UNRATED"] as const;

export type Reliability = (typeof RELIABILITY_VALUES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  OFFICIAL_GOVERNMENT: "Official — government",
  OFFICIAL_MILITARY: "Official — military",
  INDEPENDENT_ANALYSIS: "Independent analysis",
  ESTABLISHED_MEDIA: "Established media",
  OSINT: "OSINT",
  UNKNOWN: "Unknown",
};

export const RELIABILITY_LABELS: Record<Reliability, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  UNRATED: "Unrated",
};

/**
 * Reserved registry source (migration 0013) for a statement seen live before any registry source
 * reports it. Each event_sources row on it carries its own source_label; the URL is optional.
 * Events only: exercises and historical events cannot cite it.
 */
export const LIVE_STATEMENT_SOURCE_ID = "1100e000-0000-4000-8000-000000000001";

export function isLiveStatementSource(sourceId: string | null | undefined): boolean {
  return sourceId?.toLowerCase() === LIVE_STATEMENT_SOURCE_ID;
}

/** Shown where a live statement has no link. */
export const LIVE_STATEMENT_NO_LINK = "Live broadcast — no link yet";

/** Spec §§26–29 */
export const TIER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Tier 1 — Official primary sources",
  2: "Tier 2 — Independent analytical sources",
  3: "Tier 3 — Major journalism",
  4: "Tier 4 — OSINT",
};

/** Suggestions only; source_country is free text in the schema. */
export const COUNTRY_SUGGESTIONS = [
  "Lithuania",
  "Poland",
  "Latvia",
  "Estonia",
  "Belarus",
  "Russia",
  "Germany",
  "United States",
  "United Kingdom",
  "International",
];

/**
 * Decision #10: an event needs at least one Tier 1-3 SUPPORTS source to be published.
 * True when there is supporting evidence but none of it is Tier 1-3 (only Tier 4).
 * An empty list is false: "no supporting source" is a separate check.
 */
export function isTier4OnlySupport(supportTiers: ReadonlyArray<number | null>): boolean {
  return (
    supportTiers.length > 0 &&
    !supportTiers.some((tier) => tier !== null && tier >= 1 && tier <= 3)
  );
}

export const TIER4_ONLY_MESSAGE =
  "Cannot publish: this event is supported only by Tier 4 sources. Attach at least one Tier 1-3 supporting source first (decision #10).";

// source_country is free text, so match common spellings and ISO codes.
const STATE_SOURCE_COUNTRIES = new Set([
  "russia",
  "russian federation",
  "ru",
  "rus",
  "belarus",
  "republic of belarus",
  "by",
  "blr",
]);

/** Spec §26 / project rule 4: Russian and Belarusian official sources carry a "State / official source" label. */
export function isStateOfficialSource(source: {
  source_type: SourceType;
  source_country: string | null;
}): boolean {
  if (
    source.source_type !== "OFFICIAL_GOVERNMENT" &&
    source.source_type !== "OFFICIAL_MILITARY"
  ) {
    return false;
  }
  const country = source.source_country?.trim().toLowerCase();
  return country !== undefined && STATE_SOURCE_COUNTRIES.has(country);
}
