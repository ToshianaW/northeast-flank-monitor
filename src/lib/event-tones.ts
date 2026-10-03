import type { ConfidenceLevel, EventType } from "@/lib/event-labels";

/** CSS class that sets `--tone` (see globals.css). Colour means category, never alarm. */
export type ToneClass =
  | "tone-teal-blue"
  | "tone-operational"
  | "tone-slate"
  | "tone-forest"
  | "tone-foam"
  | "tone-neutral";

/** The 24 event types in five colour groups, used for the feed's left bar. */
export const EVENT_TYPE_GROUPS: Array<{
  label: string;
  tone: ToneClass;
  types: EventType[];
}> = [
  {
    label: "Ground and mobilization",
    tone: "tone-teal-blue",
    types: [
      "EXERCISE",
      "READINESS_CHECK",
      "MOBILIZATION",
      "TROOP_MOVEMENT",
      "EQUIPMENT_MOVEMENT",
      "NATO_REINFORCEMENT",
      "RUSSIAN_DEPLOYMENT",
      "BELARUSIAN_DEPLOYMENT",
    ],
  },
  {
    label: "Air and air defense",
    tone: "tone-operational",
    types: [
      "AIR_ACTIVITY",
      "AIR_DEFENSE",
      "MISSILE_ACTIVITY",
      "AIRFIELD_ACTIVITY",
      "AIRSPACE_VIOLATION",
      "DRONE_ACTIVITY",
    ],
  },
  {
    label: "Naval",
    tone: "tone-slate",
    types: ["NAVAL_ACTIVITY"],
  },
  {
    label: "Political and official",
    tone: "tone-foam",
    types: ["OFFICIAL_WARNING", "POLITICAL_SIGNALING"],
  },
  {
    label: "Infrastructure and other",
    tone: "tone-forest",
    types: [
      "RAIL_ACTIVITY",
      "LOGISTICS",
      "ENGINEERING",
      "INFRASTRUCTURE",
      "COMMAND_CONTROL",
      "ELECTRONIC_WARFARE",
      "BORDER_INCIDENT",
    ],
  },
];

export function eventTypeTone(type: EventType): ToneClass {
  return EVENT_TYPE_GROUPS.find((g) => g.types.includes(type))?.tone ?? "tone-neutral";
}

export const CONFIDENCE_TONES: Record<ConfidenceLevel, ToneClass> = {
  CONFIRMED: "tone-operational",
  HIGH: "tone-teal-blue",
  MODERATE: "tone-slate",
  UNVERIFIED: "tone-neutral",
};
