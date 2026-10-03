/**
 * Builds public/geo/theater.geojson: the map's admin-1 regions and sea regions (level
 * "region"), plus each area merged from its regions (level "unit": a country, Kaliningrad,
 * western Russia, a sea), which the overview outlines.
 * Source: Natural Earth 10m (public domain), pinned to a release tag. Simplified with
 * mapshaper via npx (not a project dependency). Region ids and names come from
 * data/gazetteer.json, so the map and placement share one list.
 * Usage: npx tsx scripts/build-theater-geo.mts
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson";
const MAPSHAPER = "mapshaper@0.7.72";
const OUT = resolve("public/geo/theater.geojson");
const SIZE_BUDGET = 200 * 1024;
// Share of vertices kept; tuned to stay well under the budget.
const SIMPLIFY = "20%";
// Sea polygons only: the Baltic Sea polygon reaches the Danish straits and Bothnia.
const SEA_CLIP_BBOX = "9,53,33,61";
// Small regions that a coarse simplification could otherwise drop.
const MUST_SURVIVE = ["RU-SPE", "BY-HM", "LV-RIGA", "RU-KGD"];

type Geometry = { type: string; coordinates: unknown };
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: Geometry | null };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

const gazetteer = JSON.parse(readFileSync("data/gazetteer.json", "utf8")) as {
  units: { id: string; name: string; onMap?: boolean }[];
  regions: { id: string; unit: string; name: string }[];
};
const regionById = new Map(gazetteer.regions.map((r) => [r.id, r]));

const ADM0 = new Set(["POL", "LTU", "LVA", "EST", "BLR", "RUS"]);
const RUSSIA_KEPT = new Set(["RU-KGD", "RU-LEN", "RU-SPE", "RU-PSK", "RU-NGR", "RU-SMO"]);
const LATVIA_REGION: Record<string, string> = {
  Riga: "LV-RIGA",
  Kurzeme: "LV-KURZEME",
  Zemgale: "LV-ZEMGALE",
  Vidzeme: "LV-VIDZEME",
  Latgale: "LV-LATGALE",
};
const SEA_REGION: Record<string, string> = {
  "Baltic Sea": "BALTIC-SEA",
  "Gulf of Riga": "BALTIC-SEA",
  "Gulf of Finland": "GULF-OF-FINLAND",
};

async function download(file: string): Promise<FeatureCollection> {
  const res = await fetch(`${NE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

function tag(feature: Feature, id: string): Feature {
  const region = regionById.get(id);
  if (!region) throw new Error(`No gazetteer region for ${id}`);
  return {
    type: "Feature",
    properties: { id, unit: region.unit, name: region.name },
    geometry: feature.geometry,
  };
}

function landRegionId(p: Record<string, unknown>): string | null {
  if (!ADM0.has(p.adm0_a3 as string)) return null;
  if (p.adm0_a3 === "LVA") {
    const id = LATVIA_REGION[p.region as string];
    if (!id) throw new Error(`Unknown Latvian region field: ${String(p.region)}`);
    return id;
  }
  const iso = p.iso_3166_2 as string;
  if (p.adm0_a3 === "RUS") return RUSSIA_KEPT.has(iso) ? iso : null;
  return iso;
}

function mapshaper(dir: string, input: string, output: string, extra: string[]): void {
  const args = [
    "-i", join(dir, input),
    ...extra,
    "-o", join(dir, output), "format=geojson", "precision=0.001",
  ];
  // Every argument is a constant or a temp path, quoted here.
  execSync(`npx --yes ${MAPSHAPER} ${args.map((a) => JSON.stringify(a)).join(" ")}`, { stdio: "inherit" });
}

function isEmpty(geometry: Geometry | null): boolean {
  return !geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0;
}

const dir = mkdtempSync(join(tmpdir(), "theater-geo-"));
try {
  const [admin1, marine] = await Promise.all([
    download("ne_10m_admin_1_states_provinces.geojson"),
    download("ne_10m_geography_marine_polys.geojson"),
  ]);

  const land: Feature[] = [];
  const latviaCounts: Record<string, number> = {};
  const adm0Counts: Record<string, number> = {};
  for (const f of admin1.features) {
    const id = landRegionId(f.properties);
    if (!id) continue;
    land.push(tag(f, id));
    const a3 = f.properties.adm0_a3 as string;
    adm0Counts[a3] = (adm0Counts[a3] ?? 0) + 1;
    if (a3 === "LVA") latviaCounts[f.properties.region as string] = (latviaCounts[f.properties.region as string] ?? 0) + 1;
  }
  const sea = marine.features
    .filter((f) => SEA_REGION[f.properties.name as string])
    .map((f) => tag(f, SEA_REGION[f.properties.name as string]));

  writeFileSync(join(dir, "land.json"), JSON.stringify({ type: "FeatureCollection", features: land }));
  writeFileSync(join(dir, "sea.json"), JSON.stringify({ type: "FeatureCollection", features: sea }));
  const byId = ["-dissolve", "id", "copy-fields=unit,name", "-simplify", SIMPLIFY, "keep-shapes"];
  mapshaper(dir, "land.json", "land-out.json", byId);
  mapshaper(dir, "sea.json", "sea-out.json", ["-clip", `bbox=${SEA_CLIP_BBOX}`, ...byId]);
  // Areas are merged from the already simplified regions, so their edges line up exactly.
  mapshaper(dir, "land-out.json", "units-out.json", ["-dissolve", "unit"]);

  const read = (file: string) =>
    (JSON.parse(readFileSync(join(dir, file), "utf8")) as FeatureCollection).features;
  const unitName = new Map(gazetteer.units.map((u) => [u.id, u.name]));
  const asLevel = (f: Feature, level: "region" | "unit", id = f.properties.id as string): Feature => ({
    ...f,
    properties: { id, unit: level === "unit" ? id : f.properties.unit, name: level === "unit" ? unitName.get(id) ?? id : f.properties.name, level },
  });
  const byIdOrder = (a: Feature, b: Feature) => String(a.properties.id).localeCompare(String(b.properties.id));
  const features = [...read("land-out.json"), ...read("sea-out.json")].map((f) => asLevel(f, "region")).sort(byIdOrder);
  const unitFeatures = [
    ...read("units-out.json").map((f) => asLevel(f, "unit", f.properties.unit as string)),
    ...read("sea-out.json").map((f) => asLevel(f, "unit", f.properties.unit as string)),
  ].sort(byIdOrder);
  const onMapUnits = gazetteer.units.filter((u) => u.onMap !== false).map((u) => u.id);
  const missingUnits = onMapUnits.filter((id) => !unitFeatures.some((f) => f.properties.id === id));
  if (missingUnits.length || unitFeatures.length !== onMapUnits.length) {
    throw new Error(`area features wrong: missing ${missingUnits.join(",")}, got ${unitFeatures.length}`);
  }

  const ids = features.map((f) => f.properties.id as string);
  const missing = gazetteer.regions.map((r) => r.id).filter((id) => !ids.includes(id));
  const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
  const lost = MUST_SURVIVE.filter((id) => isEmpty(features.find((f) => f.properties.id === id)?.geometry ?? null));
  if (missing.length || duplicated.length || lost.length) {
    throw new Error(`missing: ${missing.join(",")} duplicated: ${duplicated.join(",")} empty: ${lost.join(",")}`);
  }

  writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features: [...features, ...unitFeatures] }) + "\n");
  const bytes = statSync(OUT).size;
  console.log("Natural Earth admin-1 features kept per country:", adm0Counts);
  console.log("Latvian municipalities per region field:", latviaCounts);
  console.log(`Wrote ${OUT}: ${features.length} regions + ${unitFeatures.length} areas, ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`Kept non-empty after simplification: ${MUST_SURVIVE.join(", ")}`);
  if (bytes > SIZE_BUDGET) throw new Error(`Over the ${SIZE_BUDGET / 1024} KB budget`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
