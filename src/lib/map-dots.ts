import anchors from "../../data/map-anchors.json";

/**
 * Map dots (decision 14): one dot per area, or per admin-1 region of the selected area, at
 * the fixed anchor in data/map-anchors.json. Only the count step comes from events; the
 * position never does, and no other event data is attached to a dot.
 */

export type Step = 0 | 1 | 2 | 3;
export type DotCounts = {
  id: string;
  step: Step;
  onMap: boolean;
  regions: { id: string; step: Step }[];
};
export type DotFeature = {
  type: "Feature";
  properties: { id: string; step: Step };
  geometry: { type: "Point"; coordinates: [number, number] };
};

const AREA_ANCHORS = anchors.areas as unknown as Record<string, [number, number]>;
const REGION_ANCHORS = anchors.regions as unknown as Record<string, [number, number]>;
const NO_DOT = new Set<string>(anchors.noDot);

export function areaAnchor(id: string): [number, number] | undefined {
  return AREA_ANCHORS[id];
}

export function regionAnchor(id: string): [number, number] | undefined {
  return NO_DOT.has(id) ? undefined : REGION_ANCHORS[id];
}

function dot(id: string, step: Step, at: [number, number] | undefined): DotFeature[] {
  if (step === 0 || !at) return [];
  return [{ type: "Feature", properties: { id, step }, geometry: { type: "Point", coordinates: [at[0], at[1]] } }];
}

/** Overview: one dot per on-map area. Zoomed into an area: one dot per region with activity. */
export function dotFeatures(
  units: DotCounts[],
  zoomedUnit: string | null,
): { type: "FeatureCollection"; features: DotFeature[] } {
  const features = zoomedUnit
    ? (units.find((u) => u.id === zoomedUnit)?.regions ?? []).flatMap((r) => dot(r.id, r.step, regionAnchor(r.id)))
    : units.filter((u) => u.onMap).flatMap((u) => dot(u.id, u.step, areaAnchor(u.id)));
  return { type: "FeatureCollection", features };
}
