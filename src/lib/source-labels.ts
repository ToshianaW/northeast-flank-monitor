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
