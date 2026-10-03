/**
 * The map never shades polygons by count: fills are fixed land/sea colours (or fully
 * transparent click targets), and counts reach the map only as dots (decision 14).
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOTS_SOURCE, mapLayers, OUTLINES_SOURCE } from "./map-layers";
import { HEAT_SCALE } from "./map-style";

type Layer = ReturnType<typeof mapLayers>[number] & {
  source?: string;
  paint?: Record<string, unknown>;
};

/** True if an expression reads a count: feature-state, or the step/count properties. */
function readsCounts(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value[0] === "feature-state") return true;
  if (value[0] === "get" && (value[1] === "step" || value[1] === "count")) return true;
  return value.some(readsCounts);
}

const layers = mapLayers() as Layer[];

test("no polygon fill depends on counts, in the overview or zoomed in", () => {
  const fills = layers.filter((l) => l.type === "fill");
  assert.ok(fills.length > 0);
  for (const l of fills) {
    assert.equal(l.source, OUTLINES_SOURCE, l.id);
    for (const [key, value] of Object.entries(l.paint ?? {})) {
      assert.ok(!readsCounts(value), `${l.id} ${key} reads counts`);
    }
  }
});

test("the only visible region-level fill is none: region fills are transparent click targets", () => {
  for (const l of layers.filter((x) => x.type === "fill" && JSON.stringify(x.filter).includes('"region"'))) {
    assert.equal(l.paint?.["fill-opacity"], 0, l.id);
  }
});

test("counts appear only as circles on the dots source", () => {
  for (const l of layers) {
    const uses = Object.values(l.paint ?? {}).some(readsCounts);
    if (uses) assert.ok(l.type === "circle" && l.source === DOTS_SOURCE, `${l.id} uses counts`);
  }
  assert.ok(layers.some((l) => l.id === "dots-hit"), "dots have a hit layer");
});

test("dots use the one named heat scale, amber to deep orange, never red", () => {
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const colors = HEAT_SCALE.colors.slice(1);
  assert.equal(colors.length, 3);
  for (const c of colors) {
    const h = hue(c);
    assert.ok(h >= 20 && h <= 50, `${c} hue ${h.toFixed(0)} is outside amber-orange`);
  }
  for (const id of ["dots-glow", "dots-core"]) {
    const paint = JSON.stringify(layers.find((l) => l.id === id)?.paint?.["circle-color"]);
    for (const c of colors) assert.ok(paint.includes(c), `${id} uses ${c}`);
  }
});
