import type { ConfidenceLevel, SourceRelationship } from "@/lib/event-labels";
import { isStateOfficialSource, type SourceType } from "@/lib/source-labels";

/**
 * Rule-based confidence suggestion for the approve form (decision #13). No AI call; the
 * reviewer still chooses. Never suggests CONFIRMED.
 */

export type SuggestionSource = {
  source_id: string;
  name: string;
  tier: number | null;
  source_type: SourceType;
  source_country: string | null;
  relationship: SourceRelationship;
};

export type ConfidenceSuggestion = {
  level: ConfidenceLevel;
  reason: string;
  /** "Official source only; no independent confirmation." */
  officialOnlyNote: boolean;
  /** Show the existing "State / official source" label (Russian or Belarusian official source). */
  stateSource: boolean;
  /** Set when a CONTRADICTS source or the contradiction flag capped the suggestion. */
  conflictWarning: boolean;
};

export const OFFICIAL_ONLY_NOTE = "Official source only; no independent confirmation.";
export const CONFLICT_WARNING = "Sources conflict; resolve before raising confidence.";

const RANK: Record<ConfidenceLevel, number> = {
  UNVERIFIED: 0,
  MODERATE: 1,
  HIGH: 2,
  CONFIRMED: 3,
};

function isOfficial(source: Pick<SuggestionSource, "source_type">): boolean {
  return source.source_type === "OFFICIAL_GOVERNMENT" || source.source_type === "OFFICIAL_MILITARY";
}

function isTier1to3(source: Pick<SuggestionSource, "tier">): boolean {
  return source.tier !== null && source.tier >= 1 && source.tier <= 3;
}

export function suggestConfidence(input: {
  sources: ReadonlyArray<SuggestionSource>;
  contradiction_flag: boolean;
}): ConfidenceSuggestion | null {
  // Distinct supporting sources: several URLs from one outlet count once.
  const supporters = [
    ...new Map(
      input.sources.filter((s) => s.relationship === "SUPPORTS").map((s) => [s.source_id, s]),
    ).values(),
  ];
  if (supporters.length === 0) return null;

  const conflict =
    input.contradiction_flag || input.sources.some((s) => s.relationship === "CONTRADICTS");
  const tier13 = supporters.filter(isTier1to3);
  const nonOfficial = tier13.filter((s) => !isOfficial(s));

  let suggestion: ConfidenceSuggestion;
  const base = { officialOnlyNote: false, stateSource: false, conflictWarning: false };
  if (tier13.length === 0) {
    suggestion = { ...base, level: "UNVERIFIED", reason: "Tier 4 sources only" };
  } else if (nonOfficial.length === 0) {
    suggestion = {
      ...base,
      level: "MODERATE",
      reason: `${tier13.length === 1 ? "Official source" : "Official sources"}: ${tier13.map((s) => s.name).join(", ")}`,
      officialOnlyNote: true,
      stateSource: tier13.some(isStateOfficialSource),
    };
  } else if (tier13.length >= 2) {
    suggestion = {
      ...base,
      level: "HIGH",
      reason: `${tier13.length} outlets: ${tier13.map((s) => s.name).join(", ")}`,
    };
  } else {
    suggestion = { ...base, level: "MODERATE", reason: `One outlet: ${tier13[0].name}` };
  }

  if (conflict && RANK[suggestion.level] > RANK.MODERATE) {
    suggestion = { ...suggestion, level: "MODERATE" };
  }
  return { ...suggestion, conflictWarning: conflict };
}
