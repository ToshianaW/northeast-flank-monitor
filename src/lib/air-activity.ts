/**
 * Air Activity page (spec §19, roadmap 3.4): a view over published events, like Latest and the map.
 * Pure: selection, grouping, counts and the minimum-data rule. No database, no historical data.
 */
import { DIMENSIONS } from "@/lib/activity-index";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/event-labels";
import { UNITS, unitName } from "@/lib/placement";

/** The air types: the Activity Index "Air activity" dimension, so both use one list. */
export const AIR_TYPES: readonly EventType[] = DIMENSIONS.AIR_ACTIVITY.types;

/** Deployment types that count here only when they concern aircraft. */
export const DEPLOYMENT_TYPES: readonly EventType[] = ["NATO_REINFORCEMENT", "RUSSIAN_DEPLOYMENT"];

/** Fixed aircraft terms (headline or summary) for deployment events. Tested in air-activity.test.mts. */
export const AIRCRAFT_TERMS: readonly RegExp[] = [
  /\baircraft\b/i,
  /\b(fighter|combat)[- ]?jets?\b/i,
  /\bjets?\b/i,
  /\bfighter (aircraft|planes?|squadrons?)\b/i,
  /\bbombers?\b/i,
  /\bhelicopters?\b/i,
  /\b(euro)?fighters?\b(?! (groups?|units?|battalions?))/i,
  /\btyphoons?\b/i,
  /\bgripens?\b/i,
  /\brafales?\b/i,
  /\bAWACS\b/,
  /\bair[- ]policing\b/i,
  /\bF-?(15|16|18|22|35)[A-Z]*\b/,
  /\b(Su|MiG|Tu|Il|Yak)-\d+/,
  /\b(A400M|C-130|C-17|KC-135|KC-46|MQ-9|Reaper)\b/i,
];

export function mentionsAircraft(text: string): boolean {
  return AIRCRAFT_TERMS.some((re) => re.test(text));
}

export type AirCategory = "air" | "aircraft-deployment";

/** "air" for the air types; "aircraft-deployment" for a deployment that names aircraft; else null. */
export function airCategory(event: { event_type: EventType; headline: string; summary: string | null }): AirCategory | null {
  if (AIR_TYPES.includes(event.event_type)) return "air";
  if (DEPLOYMENT_TYPES.includes(event.event_type) && mentionsAircraft(`${event.headline} ${event.summary ?? ""}`)) {
    return "aircraft-deployment";
  }
  return null;
}

/** Map area of an item: a gazetteer unit id, THEATER-WIDE, or UNPLACED (as on the map). */
export type AirArea = string;

export function areaLabel(area: AirArea): string {
  if (area === "THEATER-WIDE") return "Theater-wide";
  if (area === "UNPLACED") return "Location unclear";
  return unitName(area);
}

/** Areas in map (gazetteer) order, then theater-wide, then unplaced. */
function areaOrder(area: AirArea): number {
  const i = UNITS.findIndex((u) => u.id === area);
  if (i >= 0) return i;
  return area === "THEATER-WIDE" ? UNITS.length : UNITS.length + 1;
}

export type AirItem<E> = { date: string; type: EventType; area: AirArea; category: AirCategory; event: E };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Months newest first; inside each month, areas in map order; items newest first. */
export function groupByMonthAndArea<E>(items: readonly AirItem<E>[]) {
  const months = [...new Set(items.map((i) => i.date.slice(0, 7)))].sort().reverse();
  return months.map((month) => {
    const inMonth = items.filter((i) => i.date.startsWith(month));
    const areas = [...new Set(inMonth.map((i) => i.area))].sort((a, b) => areaOrder(a) - areaOrder(b));
    return {
      month,
      label: monthLabel(month),
      areas: areas.map((area) => ({
        area,
        label: areaLabel(area),
        items: inMonth.filter((i) => i.area === area).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      })),
    };
  });
}

const addDays = (date: string, n: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Counts per type (air types, then deployment types): last 30 days and all time. */
export function countsByType<E>(items: readonly AirItem<E>[], today: string) {
  const since = addDays(today, -29);
  return [...AIR_TYPES, ...DEPLOYMENT_TYPES].map((type) => {
    const all = items.filter((i) => i.type === type);
    return {
      type,
      label: DEPLOYMENT_TYPES.includes(type) ? `${EVENT_TYPE_LABELS[type]} (aircraft)` : EVENT_TYPE_LABELS[type],
      last30: all.filter((i) => i.date >= since && i.date <= today).length,
      all: all.length,
    };
  });
}

/** Counts per area, in map order (areas with no items left out). */
export function countsByArea<E>(items: readonly AirItem<E>[]) {
  const areas = [...new Set(items.map((i) => i.area))].sort((a, b) => areaOrder(a) - areaOrder(b));
  return areas.map((area) => ({ area, label: areaLabel(area), count: items.filter((i) => i.area === area).length }));
}

/** Weekly counts (spec §19 charts) need at least this many events over this many complete weeks. */
export const MIN_WEEKLY_EVENTS = 20;
export const MIN_WEEKLY_WEEKS = 8;

const mondayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
};

/** Complete Monday–Sunday weeks from the week of the first item to the last complete week before today. */
export function weeklyCounts<E>(items: readonly AirItem<E>[], today: string): Array<{ week: string; count: number }> | null {
  if (items.length < MIN_WEEKLY_EVENTS) return null;
  const first = mondayOf([...items].map((i) => i.date).sort()[0]);
  const thisWeek = mondayOf(today);
  const weeks: string[] = [];
  for (let w = first; w < thisWeek; w = addDays(w, 7)) weeks.push(w);
  if (weeks.length < MIN_WEEKLY_WEEKS) return null;
  return weeks.map((week) => ({
    week,
    count: items.filter((i) => i.date >= week && i.date <= addDays(week, 6)).length,
  }));
}

export function minimumDataText(count: number, firstDate: string | null): string {
  const since = firstDate ? ` since ${Number(firstDate.slice(8))} ${monthLabel(firstDate.slice(0, 7))}` : "";
  return `Too few published air events for weekly counts yet (${count}${since}). Weekly counts appear once there are at least ${MIN_WEEKLY_EVENTS} events over ${MIN_WEEKLY_WEEKS} complete weeks.`;
}

export const COUNTS_NOTE = "Counts reflect reporting, not intensity of activity.";
export const SAFETY_NOTE =
  "Published events only, each reviewed by a person. Recent reports supported only by Tier 4 sources are held back for 72 hours. Events are placed by area, as on the map; no positions are shown.";
