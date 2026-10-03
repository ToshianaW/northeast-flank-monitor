import type { MapLayer, MapWindow } from "@/lib/map-data";

/**
 * Map colours. The land is calm and uniform; activity is shown only by dots at fixed anchors
 * (decision 14), in three sizes coloured by HEAT_SCALE. Never red. Literal colours because
 * MapLibre paints on a canvas and cannot read CSS variables.
 */

/**
 * The dot heat scale, amber to deep orange, by count step (index 0 unused: no dot for zero).
 * It shows reporting volume, not intensity. Change the map's colours here only: the map
 * layers, legend, dashboard thumbnail and card chips all read this scale.
 */
export const HEAT_SCALE = {
  name: "amber-orange",
  colors: ["", "#f6c453", "#f39a2e", "#e8701a"],
} as const;

export function heatColor(step: number): string {
  return HEAT_SCALE.colors[step] || HEAT_SCALE.colors[1];
}
export const MAP_BACKGROUND = "#0b1020"; // background-dark
export const LAND_COLOR = "#161c30";
export const SEA_COLOR = "#0f1a30";
export const COUNTRY_OUTLINE_COLOR = "#46557a";
export const REGION_OUTLINE_COLOR = "#2c3756";
export const SELECTED_OUTLINE_COLOR = "#e9e4d4"; // foam

export const SEA_AREAS = ["BALTIC-SEA", "GULF-OF-FINLAND"] as const;

/** Dot radius in px for steps 1, 2-3, 4+ (index 0 is unused: no dot for zero). */
export const DOT_RADIUS = [0, 5, 8, 11] as const;
/** Region dots inside a zoomed area are drawn smaller than the overview's area dots. */
export const REGION_DOT_SCALE = 0.7;
export const STEP_LABELS = ["None", "1", "2–3", "4+"] as const;

export const LAYER_LABELS: Record<MapLayer, string> = {
  activity: "Activity",
  statements: "Statements",
  all: "All",
};

export function legendTitle(days: MapWindow): string {
  return `Published events in the last ${days} days`;
}

export const DOT_NOTE = "Each dot marks an area, not a location.";
export const REPORTING_NOTE = "Counts reflect reporting, not intensity of activity.";

/** Selection id for items about the whole flank (listed and counted, never drawn). */
export const THEATER_WIDE_ID = "THEATER-WIDE";
