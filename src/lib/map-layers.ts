import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
} from "maplibre-gl";
import {
  COUNTRY_OUTLINE_COLOR,
  HEAT_SCALE,
  DOT_RADIUS,
  LAND_COLOR,
  MAP_BACKGROUND,
  REGION_OUTLINE_COLOR,
  SEA_AREAS,
  SEA_COLOR,
  SELECTED_OUTLINE_COLOR,
} from "@/lib/map-style";

/**
 * MapLibre layers for the region map. Polygons are painted in fixed colours only (land or
 * sea), never by count; counts appear only as dots at fixed anchors (decision 14). The
 * "regions-hit" fill is fully transparent and exists only to receive clicks when zoomed in.
 * map-layers.test.mts fails if any fill starts depending on counts.
 */

export const OUTLINES_SOURCE = "outlines";
export const DOTS_SOURCE = "dots";

const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const color = ["match", ["get", "step"], 1, HEAT_SCALE.colors[1], 2, HEAT_SCALE.colors[2], HEAT_SCALE.colors[3]] as const;

function radius(scale: number): DataDrivenPropertyValueSpecification<number> {
  return ["match", ["get", "step"], 1, DOT_RADIUS[1] * scale, 2, DOT_RADIUS[2] * scale, 3, DOT_RADIUS[3] * scale, 0] as DataDrivenPropertyValueSpecification<number>;
}

/** Dot radii for a scale (1 for area dots, REGION_DOT_SCALE when zoomed into an area). */
export function dotRadii(
  scale: number,
): Record<"dots-glow" | "dots-core" | "dots-hit", DataDrivenPropertyValueSpecification<number>> {
  return {
    "dots-glow": ["*", radius(scale), ["case", hovered, 3, 2.4]] as DataDrivenPropertyValueSpecification<number>,
    "dots-core": radius(scale),
    "dots-hit": ["max", ["+", radius(scale), 12], 18] as DataDrivenPropertyValueSpecification<number>,
  };
}

export function mapLayers(): LayerSpecification[] {
  const r = dotRadii(1);
  return [
    { id: "background", type: "background", paint: { "background-color": MAP_BACKGROUND } },
    {
      id: "areas-fill",
      type: "fill",
      source: OUTLINES_SOURCE,
      filter: ["==", ["get", "level"], "unit"],
      paint: {
        "fill-color": ["match", ["get", "id"], [...SEA_AREAS], SEA_COLOR, LAND_COLOR],
      },
    },
    {
      id: "regions-hit",
      type: "fill",
      source: OUTLINES_SOURCE,
      filter: ["all", ["==", ["get", "level"], "region"], ["==", ["get", "unit"], ""]],
      paint: { "fill-color": LAND_COLOR, "fill-opacity": 0 },
    },
    {
      id: "regions-line",
      type: "line",
      source: OUTLINES_SOURCE,
      filter: ["all", ["==", ["get", "level"], "region"], ["==", ["get", "unit"], ""]],
      paint: { "line-color": REGION_OUTLINE_COLOR, "line-width": 0.6 },
    },
    {
      id: "areas-line",
      type: "line",
      source: OUTLINES_SOURCE,
      filter: ["all", ["==", ["get", "level"], "unit"], ["!", ["in", ["get", "id"], ["literal", [...SEA_AREAS]]]]],
      paint: { "line-color": COUNTRY_OUTLINE_COLOR, "line-width": 0.8 },
    },
    {
      id: "selected-line",
      type: "line",
      source: OUTLINES_SOURCE,
      filter: ["==", ["get", "id"], ""],
      paint: { "line-color": SELECTED_OUTLINE_COLOR, "line-width": 1.6 },
    },
    {
      id: "dots-glow",
      type: "circle",
      source: DOTS_SOURCE,
      paint: {
        "circle-color": color,
        "circle-radius": r["dots-glow"],
        "circle-blur": 1,
        "circle-opacity": ["case", hovered, 0.75, 0.4],
      },
    },
    {
      id: "dots-core",
      type: "circle",
      source: DOTS_SOURCE,
      paint: {
        "circle-color": color,
        "circle-radius": r["dots-core"],
        "circle-opacity": ["case", hovered, 1, 0.9],
        "circle-stroke-color": SELECTED_OUTLINE_COLOR,
        "circle-stroke-width": ["case", hovered, 1.5, 0],
      },
    },
    {
      // Invisible, larger than the dot: the click and hover target.
      id: "dots-hit",
      type: "circle",
      source: DOTS_SOURCE,
      paint: { "circle-color": color, "circle-opacity": 0, "circle-radius": r["dots-hit"] },
    },
  ] as LayerSpecification[];
}
