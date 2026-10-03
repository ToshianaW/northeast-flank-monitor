/**
 * public/geo/theater.geojson matches data/gazetteer.json (no database).
 * Regenerate with: npx tsx scripts/build-theater-geo.mts
 * Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import gazetteer from "../../data/gazetteer.json";
import { regionAtPoint, REGIONS, UNITS, type RegionFeatureCollection } from "./placement";

const PATH = "public/geo/theater.geojson";
const geo = JSON.parse(readFileSync(PATH, "utf8")) as RegionFeatureCollection;

test("file is within the 200 KB budget", () => {
  assert.ok(statSync(PATH).size <= 200 * 1024);
});

test("every gazetteer region has exactly one feature, with its unit and name", () => {
  const ids = geo.features.map((f) => f.properties.id).sort();
  assert.deepEqual(ids, REGIONS.map((r) => r.id).sort());
  for (const r of REGIONS) {
    const f = geo.features.find((x) => x.properties.id === r.id)!;
    assert.equal(f.properties.unit, r.unit);
    assert.equal(f.properties.name, r.name);
    assert.ok(f.geometry.coordinates.length > 0, `${r.id} has geometry`);
  }
});

test("every region and place points at a known unit or region", () => {
  const units = new Set(UNITS.map((u) => u.id));
  const regions = new Set(REGIONS.map((r) => r.id));
  for (const r of REGIONS) assert.ok(units.has(r.unit), r.id);
  for (const p of gazetteer.places) assert.ok(regions.has(p.region), p.name);
  for (const u of UNITS) assert.ok(REGIONS.some((r) => r.unit === u.id), `${u.id} has regions`);
});

test("known points fall in the expected region; outside the theater is null", () => {
  const cases: [string, number, number, string | null][] = [
    ["Vilnius", 25.28, 54.69, "LT-VL"],
    ["Kaliningrad", 20.51, 54.71, "RU-KGD"],
    ["Minsk", 27.56, 53.9, "BY-HM"],
    ["St Petersburg", 30.31, 59.94, "RU-SPE"],
    ["Riga", 24.11, 56.95, "LV-RIGA"],
    ["Tallinn", 24.75, 59.44, "EE-37"],
    ["Białystok", 23.16, 53.13, "PL-PD"],
    ["central Baltic", 19.0, 55.5, "BALTIC-SEA"],
    ["Gulf of Finland", 26.5, 59.85, "GULF-OF-FINLAND"],
    ["Berlin", 13.4, 52.52, null],
    ["Moscow", 37.62, 55.75, null],
  ];
  for (const [name, lon, lat, expected] of cases) {
    assert.equal(regionAtPoint(geo, lon, lat), expected, name);
  }
});
