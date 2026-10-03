/** Values must match enums in src/db/migrations/0001_initial_schema.sql. */

export const EVENT_TYPE_VALUES = [
  "EXERCISE",
  "READINESS_CHECK",
  "MOBILIZATION",
  "TROOP_MOVEMENT",
  "EQUIPMENT_MOVEMENT",
  "RAIL_ACTIVITY",
  "LOGISTICS",
  "AIR_ACTIVITY",
  "NAVAL_ACTIVITY",
  "AIR_DEFENSE",
  "MISSILE_ACTIVITY",
  "ENGINEERING",
  "AIRFIELD_ACTIVITY",
  "COMMAND_CONTROL",
  "ELECTRONIC_WARFARE",
  "BORDER_INCIDENT",
  "AIRSPACE_VIOLATION",
  "DRONE_ACTIVITY",
  "NATO_REINFORCEMENT",
  "RUSSIAN_DEPLOYMENT",
  "BELARUSIAN_DEPLOYMENT",
  "INFRASTRUCTURE",
  "OFFICIAL_WARNING",
  "POLITICAL_SIGNALING",
] as const;

export type EventType = (typeof EVENT_TYPE_VALUES)[number];

/** Map layers: statements are what someone said; every other type is Activity. */
export const STATEMENT_TYPES = ["POLITICAL_SIGNALING", "OFFICIAL_WARNING"] as const satisfies readonly EventType[];
export const ACTIVITY_TYPES: readonly EventType[] = EVENT_TYPE_VALUES.filter(
  (t) => !(STATEMENT_TYPES as readonly EventType[]).includes(t),
);

export function isStatementType(type: EventType): boolean {
  return (STATEMENT_TYPES as readonly EventType[]).includes(type);
}

export const EXERCISE_STATUS_VALUES = [
  "ANNOUNCED",
  "UPCOMING",
  "ACTIVE",
  "CONCLUDING",
  "CONCLUDED",
  "EXTENDED",
  "UNCLEAR",
] as const;

export type ExerciseStatus = (typeof EXERCISE_STATUS_VALUES)[number];

export const RESET_STATUS_VALUES = [
  "FULL_RESET",
  "PERSONNEL_RETURNED",
  "EQUIPMENT_STATUS_UNKNOWN",
  "PARTIAL_RESET",
  "RESIDUAL_ACTIVITY",
  "INCOMPLETE_RESET",
  "CONTINUED_DEPLOYMENT",
  "UNKNOWN",
] as const;

export type ResetStatus = (typeof RESET_STATUS_VALUES)[number];

export const DIMENSION_STATUS_VALUES = [
  "RETURNED",
  "NOT_RETURNED",
  "REMOVED",
  "PRESENT",
  "NOT_VERIFIED",
  "UNKNOWN",
] as const;

export type DimensionStatus = (typeof DIMENSION_STATUS_VALUES)[number];

export const CONFIDENCE_LEVEL_VALUES = [
  "CONFIRMED",
  "HIGH",
  "MODERATE",
  "UNVERIFIED",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVEL_VALUES)[number];

export const REVIEW_STATUS_VALUES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "MERGED",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

export const LOCATION_PRECISION_VALUES = [
  "EXACT",
  "BASE",
  "DISTRICT",
  "REGION",
] as const;

export type LocationPrecision = (typeof LOCATION_PRECISION_VALUES)[number];

export const SOURCE_RELATIONSHIP_VALUES = ["SUPPORTS", "CONTRADICTS"] as const;

export type SourceRelationship = (typeof SOURCE_RELATIONSHIP_VALUES)[number];

function titleCaseEnum(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/** Display labels that need acronyms or spec wording, not naive title case. */
const EVENT_TYPE_LABEL_OVERRIDES: Partial<Record<EventType, string>> = {
  NATO_REINFORCEMENT: "NATO Reinforcement",
  ELECTRONIC_WARFARE: "Electronic Warfare (EW)",
  COMMAND_CONTROL: "Command & Control (C2)",
};

export const EVENT_TYPE_LABELS = Object.fromEntries(
  EVENT_TYPE_VALUES.map((v) => [
    v,
    EVENT_TYPE_LABEL_OVERRIDES[v] ?? titleCaseEnum(v),
  ]),
) as Record<EventType, string>;

export const EXERCISE_STATUS_LABELS = Object.fromEntries(
  EXERCISE_STATUS_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<ExerciseStatus, string>;

export const RESET_STATUS_LABELS = Object.fromEntries(
  RESET_STATUS_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<ResetStatus, string>;

export const DIMENSION_STATUS_LABELS = Object.fromEntries(
  DIMENSION_STATUS_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<DimensionStatus, string>;

export const CONFIDENCE_LEVEL_LABELS = Object.fromEntries(
  CONFIDENCE_LEVEL_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<ConfidenceLevel, string>;

export const REVIEW_STATUS_LABELS = Object.fromEntries(
  REVIEW_STATUS_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<ReviewStatus, string>;

export const LOCATION_PRECISION_LABELS = Object.fromEntries(
  LOCATION_PRECISION_VALUES.map((v) => [v, titleCaseEnum(v)]),
) as Record<LocationPrecision, string>;

export const SOURCE_RELATIONSHIP_LABELS: Record<SourceRelationship, string> = {
  SUPPORTS: "Supports",
  CONTRADICTS: "Contradicts",
};
