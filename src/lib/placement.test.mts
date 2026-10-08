/**
 * Map placement rules (no database). Fixtures are the 18 published events and 1 exercise as
 * of 2026-10-03: headline, type, location and country only.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventType } from "./event-labels";
import { fold, placeEvent, placeExercise, type PlaceableEvent, type Placement } from "./placement";

type EventInput = Omit<PlaceableEvent, "event_type"> & { event_type?: EventType };
const place = (e: EventInput, geo?: Parameters<typeof placeEvent>[1]) =>
  placeEvent({ event_type: "AIR_ACTIVITY", ...e }, geo);

function where(p: Placement): string {
  if (p.kind === "placed") return p.region ? `${p.unit}/${p.region}` : `${p.unit}/*`;
  return p.kind;
}

const S: EventType = "POLITICAL_SIGNALING";

const PUBLISHED_EVENTS: [headline: string, type: EventType, location: string, country: string, expected: string][] = [
  ["Russia begins autumn conscription, plans to induct 120,000 conscripts, Defence24 reports", "MOBILIZATION", "Russia", "Russia", "RU-ELSE/*"],
  ["Polish defence minister says FA-50GF aircraft have entered combat duty", "AIR_DEFENSE", "Poland", "Poland", "PL/*"],
  ["Putin decree raises Russian army size to 1.56 million, Rzeczpospolita reports", "MOBILIZATION", "Russia", "Russia", "RU-ELSE/*"],
  ["Polish general tells European Parliament Russia cannot invade NATO states, describes 'shadow war'", S, "European Parliament", "Poland", "unplaced"],
  ["Trump comments on possible permanent US military base in Poland", S, "Poland", "Poland", "PL/*"],
  ["Estonian Defense Forces say Russia repeated war aims at UN", S, "Estonia", "Estonia", "EE/*"],
  ["US Marines redirected to Baltic Sea region for NATO's Baltic Sentry", "NATO_REINFORCEMENT", "Baltic Sea region", "United States", "theater-wide"],
  ["Ukrainian military intelligence warns of Russian hybrid operations in EU and NATO countries", S, "European Union and NATO countries", "Ukraine", "WEST-EU/*"],
  ["Ninth F-35A arrives at Łask base in Poland", "AIRFIELD_ACTIVITY", "Łask", "Poland", "PL/PL-LD"],
  ["Estonian PM says Estonia not invited to U.S.-led meeting on NATO's future", S, "Poland", "Estonia", "PL/*"],
  ["Russian border guard detains Estonia-bound cargo ship in Gulf of Finland", "NAVAL_ACTIVITY", "Gulf of Finland", "Russia", "GULF-OF-FINLAND/GULF-OF-FINLAND"],
  ["Putin says all weapons options considered if Kaliningrad attacked", S, "Kaliningrad", "Russia", "RU-KGD/RU-KGD"],
  ["Luxembourg-registered Saab 340B+ ISR aircraft flies reconnaissance mission along Poland's Kaliningrad border", "AIR_ACTIVITY", "Polish border with Kaliningrad Oblast", "Poland", "PL/*"],
  ["Belarus begins annual mobilization readiness exercises", "MOBILIZATION", "Belarus (nationwide)", "Belarus", "BY/*"],
  ["Russian Embassy in Belgium issues statement on NATO and Kaliningrad", S, "Kaliningrad", "Russia", "RU-KGD/RU-KGD"],
  ["NATO jets shoot down drone that entered Lithuanian airspace from Belarus", "DRONE_ACTIVITY", "Pratkūnai, Kaišiadorys district", "Lithuania", "LT/LT-KU"],
  ["Latvian security services detain two citizens over alleged information collection for Russian GRU", S, "Latvia", "Latvia", "LV/*"],
  ["Lithuania completes concrete anti-tank barriers on Kaliningrad border", "ENGINEERING", "Lithuania-Kaliningrad border", "Lithuania", "LT/*"],
];

for (const [headline, event_type, location_name, country, expected] of PUBLISHED_EVENTS) {
  test(`published: ${headline}`, () => {
    assert.equal(where(place({ headline, event_type, location_name, country })), expected);
  });
}

test("published exercise: Belarus annual mobilization readiness exercises 2026", () => {
  const p = placeExercise({
    exercise_name: "Belarus annual mobilization readiness exercises 2026",
    countries: ["Belarus"],
    location: "Belarus (nationwide)",
  });
  assert.equal(where(p), "BY/*");
});

test("a statement about Kaliningrad made in Moscow or Brussels is placed on Kaliningrad", () => {
  for (const location_name of ["Moscow", "Brussels", null]) {
    const p = place({ headline: "Kremlin comments on Kaliningrad transit", event_type: S, location_name, country: "Russia" });
    assert.equal(where(p), "RU-KGD/RU-KGD", String(location_name));
  }
});

test("statements skip the country field; Activity keeps it", () => {
  const e = { headline: "Minister comments on NATO", location_name: "Brussels", country: "Poland" };
  assert.equal(where(place({ ...e, event_type: "POLITICAL_SIGNALING" })), "unplaced");
  assert.equal(where(place({ ...e, event_type: "OFFICIAL_WARNING" })), "unplaced");
  assert.equal(where(place({ ...e, event_type: "AIR_ACTIVITY" })), "PL/*");
  assert.equal(where(place({ ...e, location_name: "Warsaw", event_type: "OFFICIAL_WARNING" })), "PL/PL-MZ");
  assert.equal(where(place({ ...e, headline: "Minister comments on Suwałki", event_type: "OFFICIAL_WARNING" })), "PL/PL-PD");
});

test("Brest needs Belarus from the country field or the text", () => {
  assert.equal(where(place({ headline: "Naval review", location_name: "Brest", country: "France" })), "unplaced");
  assert.equal(where(place({ headline: "Naval review", location_name: "Brest", country: null })), "unplaced");
  assert.equal(where(place({ headline: "Exercise", location_name: "Brest", country: "Belarus" })), "BY/BY-BR");
  assert.equal(
    where(place({ headline: "Belarusian troops drill near Brest", location_name: "Brest", country: null })),
    "BY/BY-BR",
  );
  assert.equal(where(place({ headline: "x", location_name: "Brest Oblast", country: null })), "BY/BY-BR");
});

test("longest match wins: Gulf of Riga, Nizhny Novgorod, Mińsk Mazowiecki, Minsk Oblast", () => {
  assert.equal(where(place({ headline: "x", location_name: "Gulf of Riga", country: null })), "BALTIC-SEA/BALTIC-SEA");
  assert.equal(where(place({ headline: "x", location_name: "Gulf of Gdańsk", country: "Poland" })), "BALTIC-SEA/BALTIC-SEA");
  assert.equal(where(place({ headline: "x", location_name: "Nizhny Novgorod", country: "Russia" })), "RU-ELSE/*");
  assert.equal(where(place({ headline: "x", location_name: "Mińsk Mazowiecki", country: "Poland" })), "PL/PL-MZ");
  assert.equal(where(place({ headline: "x", location_name: "Minsk Oblast", country: "Belarus" })), "BY/BY-MI");
  assert.equal(where(place({ headline: "x", location_name: "Minsk", country: "Belarus" })), "BY/BY-HM");
  assert.equal(where(place({ headline: "x", location_name: "Riga", country: "Latvia" })), "LV/LV-RIGA");
});

test("location_name beats a disagreeing country field; district rolls up to its region", () => {
  assert.equal(where(place({ headline: "x", location_name: "Suwałki", country: "United States" })), "PL/PL-PD");
  assert.equal(where(place({ headline: "x", location_name: "Vilnius, Lithuania", country: "Lithuania" })), "LT/LT-VL");
  assert.equal(where(place({ headline: "x", location_name: "Hrodna and Lida", country: "Belarus" })), "BY/BY-HR");
  assert.equal(where(place({ headline: "x", location_name: "Hrodna and Vitebsk", country: "Belarus" })), "BY/*");
});

test("several areas: two without a border are Unplaced, three or more are Theater-wide", () => {
  assert.equal(where(place({ headline: "x", location_name: "Narva and Daugavpils", country: null })), "unplaced");
  assert.equal(where(place({ headline: "x", location_name: "Poland, Lithuania and Latvia", country: null })), "theater-wide");
  assert.equal(where(place({ headline: "x", location_name: "Baltic states", country: "Estonia" })), "theater-wide");
});

test("text step: no country adjectives; Activity falls back to the country field", () => {
  assert.equal(where(place({ headline: "Polish and Lithuanian ministers meet", location_name: null, country: "Lithuania" })), "LT/*");
  assert.equal(where(place({ headline: "Drills near Tapa and Narva", location_name: null, country: null })), "EE/*");
  assert.equal(where(place({ headline: "Statement on NATO", location_name: null, country: "Russia" })), "RU-ELSE/*");
  assert.equal(where(place({ headline: "Statement on NATO", event_type: S, location_name: null, country: "Russia" })), "unplaced");
});

test("Activity: a country field on a multi-country card goes to that card; statements still skip it", () => {
  const molesworth = {
    headline: "Two Latvian nationals arrested after security breach at RAF Molesworth",
    summary: "British police arrested two Latvian nationals inside the perimeter of RAF Molesworth in Cambridgeshire.",
    event_type: "INFRASTRUCTURE" as const,
    location_name: null,
    country: "United Kingdom",
  };
  assert.equal(where(place(molesworth)), "WEST-EU/*");
  assert.equal(where(place({ ...molesworth, country: "UK" })), "WEST-EU/*");
  assert.equal(where(place({ headline: "Air base drill", location_name: null, country: "Germany" })), "WEST-EU/*");
  assert.equal(where(place({ headline: "Air base drill", location_name: null, country: "Canada" })), "NORTH-AM/*");
  assert.equal(where(place({ headline: "Air base drill", location_name: null, country: "Ukraine" })), "UA/*");
  assert.equal(where(place({ ...molesworth, event_type: S })), "unplaced");
  assert.equal(where(place({ headline: "Air base drill", location_name: null, country: "Atlantis" })), "unplaced");
  // An on-map area named in the text still wins over the card.
  assert.equal(where(place({ ...molesworth, summary: "British troops arrive in Tapa, Estonia." })), "EE/EE-59");
});

test("stored coordinates: used when consistent, Unplaced when they contradict the location", () => {
  const square = (id: string, unit: string, x: number, y: number) => ({
    type: "Feature" as const,
    properties: { id, unit, name: id },
    geometry: { type: "Polygon" as const, coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]] as [number, number][]] },
  });
  const geo = {
    type: "FeatureCollection" as const,
    features: [square("LT-VL", "LT", 25, 54), square("LT-KU", "LT", 23, 54)],
  };
  const base = { headline: "x", country: "Lithuania", latitude: 54.5, longitude: 25.5 };
  assert.equal(where(place({ ...base, location_name: "Lithuania" }, geo)), "LT/LT-VL");
  assert.equal(where(place({ ...base, location_name: null }, geo)), "LT/LT-VL");
  assert.equal(where(place({ ...base, location_name: null, event_type: S }, geo)), "LT/LT-VL");
  assert.equal(where(place({ ...base, location_name: "Kaunas" }, geo)), "unplaced");
  assert.equal(where(place({ ...base, latitude: 10, location_name: "Vilnius" }, geo)), "unplaced");
});

test("exercises: location first, else countries", () => {
  assert.equal(where(placeExercise({ exercise_name: "x", countries: ["Russia", "Belarus"], location: null })), "theater-wide");
  assert.equal(where(placeExercise({ exercise_name: "x", countries: ["Poland", "United States"], location: null })), "PL/*");
  assert.equal(where(placeExercise({ exercise_name: "x", countries: ["Russia"], location: null })), "RU-ELSE/*");
  assert.equal(where(placeExercise({ exercise_name: "x", countries: ["Russia", "Belarus"], location: "Hrodna" })), "BY/BY-HR");
});

test("outside cards: venues ignored, on-map beats a card, US/Canada only themselves", () => {
  // The speaker and the venue never count.
  assert.equal(where(place({ headline: "Minister urges EU sanctions", event_type: S, location_name: "Kyiv", country: "Ukraine" })), "unplaced");
  assert.equal(where(place({ headline: "General speaks", event_type: S, location_name: "European Parliament", country: "Poland" })), "unplaced");
  assert.equal(where(place({ headline: "US says it will send troops to Poland", event_type: S, location_name: "Washington", country: "United States" })), "PL/*");
  assert.equal(where(place({ headline: "x", event_type: S, location_name: "US military base in Poland", country: "United States" })), "PL/*");
  assert.equal(where(place({ headline: "x", event_type: S, location_name: "United States", country: "United States" })), "NORTH-AM/*");
  assert.equal(where(place({ headline: "x", event_type: S, location_name: "Canada", country: null })), "NORTH-AM/*");
  // EU and NATO institutions, and Western European countries.
  assert.equal(where(place({ headline: "x", event_type: S, location_name: "NATO", country: "Ukraine" })), "WEST-EU/*");
  assert.equal(where(place({ headline: "x", location_name: "Germany", country: "Germany" })), "WEST-EU/*");
  assert.equal(where(place({ headline: "x", location_name: "NATO's eastern flank", country: null })), "theater-wide");
  // Russia elsewhere; a card in location_name gives way to one on-map area in the text.
  assert.equal(where(place({ headline: "x", location_name: "Murmansk", country: "Russia" })), "RU-ELSE/*");
  assert.equal(where(place({ headline: "Kremlin on Kaliningrad transit", event_type: S, location_name: "Russia", country: "Russia" })), "RU-KGD/RU-KGD");
  assert.equal(where(place({ headline: "Russian officials comment", event_type: S, location_name: "Moscow", country: "Russia" })), "unplaced");
  assert.equal(where(place({ headline: "Drone strike", location_name: "Moscow", country: "Russia" })), "RU-ELSE/*");
  assert.equal(where(place({ headline: "x", location_name: "Kharkiv", country: "Ukraine" })), "UA/*");
  assert.equal(where(place({ headline: "x", location_name: "Latvian-Russian border", country: "Latvia" })), "LV/*");
});

test("prose never places by nationality adjective (usually the speaker)", () => {
  assert.equal(where(place({ headline: "Polish general says Russia cannot invade NATO", event_type: S, location_name: null, country: "Poland" })), "unplaced");
  assert.equal(where(place({ headline: "Polish general warns about Belarus", event_type: S, location_name: null, country: "Poland" })), "BY/*");
});

test("fold strips diacritics including ł", () => {
  assert.equal(fold("Łask, Białystok – Šiauliai"), "lask bialystok siauliai");
});
