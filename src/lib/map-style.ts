import type { MapLayer, MapWindow } from "@/lib/map-data";

/**
 * One hue (operational teal) in four fixed steps: none, 1, 2-3, 4+. Never red: colour on
 * the map means "reported", not danger. Literal colours because MapLibre paints on a canvas
 * and cannot read CSS variables.
 */
export const SHADE_COLORS = ["#1a2138", "#0d4d48", "#0b7468", "#1fae98"] as const;
export const SHADE_LABELS = ["None", "1", "2–3", "4+"] as const;

export const OUTLINE_COLOR = "#3b4868";
export const SELECTED_OUTLINE_COLOR = "#e9e4d4"; // foam
export const MAP_BACKGROUND = "#0b1020"; // background-dark

export const LAYER_LABELS: Record<MapLayer, string> = {
  activity: "Activity",
  statements: "Statements",
  all: "All",
};

export function legendTitle(days: MapWindow): string {
  return `Published events in the last ${days} days`;
}

export const REPORTING_NOTE = "Counts reflect reporting, not intensity of activity.";
