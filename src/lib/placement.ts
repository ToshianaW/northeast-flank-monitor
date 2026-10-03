import gazetteer from "../../data/gazetteer.json";
import { isStatementType, type EventType } from "./event-labels";

/**
 * Display-time placement of events and exercises on the map's regions (data/gazetteer.json).
 * Nothing is written back to events. An item goes where the place it concerns is, never where
 * a statement was made or published. Order: stored source coordinates, location_name, the
 * event's own text, then the country field (Activity only: for a statement the country field
 * is usually the speaker's, so a statement with no place of its own is Unplaced). The finest result is an admin-1 region; a
 * district or town rolls up to its region (spec §60).
 */

export type Unit = { id: string; name: string; country: string | null; names: string[] };
export type Region = { id: string; unit: string; name: string; names: string[] };

export type Placement =
  | { kind: "placed"; unit: string; region: string | null; reason: string }
  | { kind: "theater-wide"; reason: string }
  | { kind: "unplaced"; reason: string };

export const UNITS: readonly Unit[] = gazetteer.units;
export const REGIONS: readonly Region[] = gazetteer.regions;

const unitById = new Map(UNITS.map((u) => [u.id, u]));
const regionById = new Map(REGIONS.map((r) => [r.id, r]));

export function regionsOfUnit(unitId: string): Region[] {
  return REGIONS.filter((r) => r.unit === unitId);
}

export function unitName(id: string): string {
  return unitById.get(id)?.name ?? id;
}

export function regionName(id: string): string {
  return regionById.get(id)?.name ?? id;
}

/** Lowercase, strip diacritics (ł has no decomposition), punctuation to single spaces. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type Target =
  | { kind: "unit"; unit: string }
  | { kind: "region"; region: string; ambiguous: boolean }
  | { kind: "theater" }
  | { kind: "outside" };

type Entry = { key: string; label: string; target: Target; fromUnit: boolean };

const ENTRIES: Entry[] = [
  ...UNITS.flatMap((u) =>
    u.names.map((n) => ({ key: fold(n), label: n, target: { kind: "unit", unit: u.id } as Target, fromUnit: true })),
  ),
  ...REGIONS.flatMap((r) =>
    r.names.map((n) => ({
      key: fold(n),
      label: n,
      target: { kind: "region", region: r.id, ambiguous: false } as Target,
      fromUnit: false,
    })),
  ),
  ...gazetteer.places.map((p) => ({
    key: fold(p.name),
    label: p.name,
    target: { kind: "region", region: p.region, ambiguous: p.ambiguous === true } as Target,
    fromUnit: false,
  })),
  ...gazetteer.theaterWide.map((n) => ({ key: fold(n), label: n, target: { kind: "theater" } as Target, fromUnit: false })),
  ...gazetteer.outside.map((n) => ({ key: fold(n), label: n, target: { kind: "outside" } as Target, fromUnit: false })),
];

type Match = { entry: Entry; start: number; end: number };

/** Whole-word matches; where two overlap, the longer one wins ("Gulf of Riga" over "Riga"). */
function findMatches(text: string, includeUnits: boolean): Match[] {
  const padded = ` ${fold(text)} `;
  const found: Match[] = [];
  for (const entry of ENTRIES) {
    if (!includeUnits && entry.fromUnit) continue;
    const needle = ` ${entry.key} `;
    for (let i = padded.indexOf(needle); i !== -1; i = padded.indexOf(needle, i + 1)) {
      found.push({ entry, start: i + 1, end: i + needle.length - 1 });
    }
  }
  found.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept: Match[] = [];
  for (const m of found) {
    if (!kept.some((k) => m.start < k.end && k.start < m.end)) kept.push(m);
  }
  return kept;
}

function unitOf(target: Target): string | null {
  if (target.kind === "unit") return target.unit;
  if (target.kind === "region") return regionById.get(target.region)?.unit ?? null;
  return null;
}

/** A region-level result when the unit has only one region (Kaliningrad, the seas). */
function placed(unit: string, region: string | null, reason: string): Placement {
  const only = regionsOfUnit(unit);
  return { kind: "placed", unit, region: region ?? (only.length === 1 ? only[0].id : null), reason };
}

/** Theater units for a country field value; Russia has two, so it never maps on its own. */
function unitForCountry(country: string | null | undefined): Unit | null {
  if (!country) return null;
  const units = UNITS.filter((u) => u.country !== null && fold(u.country) === fold(country));
  return units.length === 1 ? units[0] : null;
}

const THEATER_COUNTRIES = new Set(["poland", "lithuania", "latvia", "estonia", "belarus", "russia"]);

type Context = { country: string | null | undefined; text: string };

/** An ambiguous name counts only if the country field or the text points to its country. */
function corroborated(region: string, ctx: Context): boolean {
  const unit = unitById.get(regionById.get(region)?.unit ?? "");
  if (!unit?.country) return false;
  if (ctx.country && fold(ctx.country) === fold(unit.country)) return true;
  const text = ` ${fold(ctx.text)} `;
  const names = [unit.country, ...unit.names].map(fold);
  return names.some((n) => text.includes(` ${n} `));
}

function resolve(field: string, label: string, matches: Match[], ctx: Context): Placement | null {
  if (matches.length === 0) return null;
  const theater = matches.find((m) => m.entry.target.kind === "theater");
  if (theater) return { kind: "theater-wide", reason: `${label} "${theater.entry.label}"` };

  const inside = matches.filter((m) => m.entry.target.kind !== "outside");
  if (inside.length === 0) {
    return { kind: "unplaced", reason: `${label} "${matches[0].entry.label}" is outside the theater` };
  }

  const usable = inside.filter((m) => {
    const t = m.entry.target;
    return t.kind !== "region" || !t.ambiguous || corroborated(t.region, ctx);
  });
  if (usable.length === 0) {
    return { kind: "unplaced", reason: `${label} "${inside[0].entry.label}" is ambiguous without its country` };
  }

  const units = [...new Set(usable.map((m) => unitOf(m.entry.target)).filter((u): u is string => u !== null))];
  const names = usable.map((m) => `"${m.entry.label}"`).join(", ");
  if (units.length > 1) {
    const side = unitForCountry(ctx.country);
    if (/\bborder\b/.test(fold(field)) && side && units.includes(side.id)) {
      return placed(side.id, null, `${label} border ${names}, on the ${side.name} side (country field)`);
    }
    if (units.length >= 3) return { kind: "theater-wide", reason: `${label} names ${units.length} theater areas` };
    return { kind: "unplaced", reason: `${label} names several places: ${names}` };
  }

  const regions = [
    ...new Set(
      usable.flatMap((m) => (m.entry.target.kind === "region" ? [m.entry.target.region] : [])),
    ),
  ];
  return placed(units[0], regions.length === 1 ? regions[0] : null, `${label} ${names}`);
}

// ---------------------------------------------------------------------------
// Coordinates (server-side only; never sent to the client)
// ---------------------------------------------------------------------------

type Ring = [number, number][];
export type RegionGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
export type RegionFeatureCollection = {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { id: string; unit: string; name: string }; geometry: RegionGeometry }[];
};

function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd over all rings, so holes are excluded. */
function inPolygon(point: [number, number], rings: Ring[]): boolean {
  return rings.reduce((inside, ring) => (inRing(point, ring) ? !inside : inside), false);
}

export function regionAtPoint(geo: RegionFeatureCollection, lon: number, lat: number): string | null {
  for (const f of geo.features) {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (polygons.some((rings) => inPolygon([lon, lat], rings))) return f.properties.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Events and exercises
// ---------------------------------------------------------------------------

export type PlaceableEvent = {
  headline: string;
  event_type: EventType;
  summary?: string | null;
  activity_description?: string | null;
  country: string | null;
  location_name: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function placeEvent(event: PlaceableEvent, geo?: RegionFeatureCollection): Placement {
  const text = [event.headline, event.summary, event.activity_description].filter(Boolean).join(" \n ");
  const ctx: Context = { country: event.country, text: `${event.location_name ?? ""} ${text}` };
  const location = event.location_name
    ? resolve(event.location_name, "location", findMatches(event.location_name, true), ctx)
    : null;

  if (geo && event.latitude != null && event.longitude != null) {
    const region = regionAtPoint(geo, event.longitude, event.latitude);
    if (!region) return { kind: "unplaced", reason: "source coordinates are outside the theater" };
    const fromCoords = placed(regionById.get(region)!.unit, region, "source coordinates");
    if (!location) return fromCoords;
    if (
      location.kind === "placed" &&
      fromCoords.kind === "placed" &&
      location.unit === fromCoords.unit &&
      (location.region === null || location.region === fromCoords.region)
    ) {
      return fromCoords;
    }
    if (location.kind === "theater-wide") return fromCoords;
    return { kind: "unplaced", reason: "location fields disagree (coordinates vs location)" };
  }
  if (location) return location;

  // Text: regions and places only (country adjectives in prose are too loose), one area only.
  const fromText = resolve(text, "text names", findMatches(text, false), ctx);
  if (fromText && fromText.kind !== "unplaced") return fromText;

  const unit = isStatementType(event.event_type) ? null : unitForCountry(event.country);
  if (unit) return placed(unit.id, null, `country field "${event.country}"`);
  return { kind: "unplaced", reason: fromText?.reason ?? "no gazetteer match" };
}

export type PlaceableExercise = {
  exercise_name: string;
  countries: string[];
  location: string | null;
};

export function placeExercise(exercise: PlaceableExercise): Placement {
  const ctx: Context = { country: null, text: `${exercise.location ?? ""} ${exercise.countries.join(" ")}` };
  if (exercise.location) {
    const location = resolve(exercise.location, "location", findMatches(exercise.location, true), ctx);
    if (location) return location;
  }
  const theater = [...new Set(exercise.countries.map(fold).filter((c) => THEATER_COUNTRIES.has(c)))];
  if (theater.length >= 2) return { kind: "theater-wide", reason: `countries: ${exercise.countries.join(", ")}` };
  const unit = theater.length === 1 ? unitForCountry(theater[0]) : null;
  if (unit) return placed(unit.id, null, `countries: ${exercise.countries.join(", ")}`);
  return { kind: "unplaced", reason: "no gazetteer match" };
}
