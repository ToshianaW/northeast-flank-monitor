/**
 * Northeast Flank Activity Index (spec §23; formula in docs/scoring.md). Pure: no database.
 *
 * Reported activity in the last 4 complete weeks against the same scope's previous 8 complete
 * weeks, from published current events only. Historical data never enters the index. Statements
 * are excluded. Only events supported by a "stable panel" source count: a source already in the
 * registry before the baseline began (sources.created_at), so sources added later cannot raise
 * the count. The result is a band word, never a score, arrow, or colour scale.
 */
import { isStatementType, type EventType } from "@/lib/event-labels";

/** Spec §23, verbatim. Shown wherever the index is. */
export const ACTIVITY_INDEX_DISCLAIMER =
  "The Northeast Flank Activity Index measures observable military activity and force posture. It does not estimate the probability of conflict or predict political intent.";

export const FORMULA_VERSION = "activity-index-v1";

/** Monday of the first complete week of collection (sources were added 1–4 Oct 2026). */
export const INDEX_START = "2026-10-05";
export const BASELINE_WEEKS = 8;
export const WINDOW_WEEKS = 4;
export const TOTAL_WEEKS = BASELINE_WEEKS + WINDOW_WEEKS;
/** Minimum panel activity events in the baseline before a scope shows a band. */
export const MIN_BASELINE_EVENTS = 12;
/** "More than usual" needs at least RATIO × expected AND at least MIN_DIFFERENCE above it. */
export const RATIO = 2;
export const MIN_DIFFERENCE = 4;

/** Spec §23 dimensions, mapped onto event types. Statement types belong to none. */
export const DIMENSIONS = {
  EXERCISE_TEMPO: { label: "Exercise tempo", types: ["EXERCISE", "READINESS_CHECK"] },
  MOBILIZATION: { label: "Mobilization activity", types: ["MOBILIZATION"] },
  EXTERNAL_DEPLOYMENTS: {
    label: "External deployments",
    types: ["RUSSIAN_DEPLOYMENT", "BELARUSIAN_DEPLOYMENT", "TROOP_MOVEMENT"],
  },
  LOGISTICS: {
    label: "Logistics",
    types: ["LOGISTICS", "RAIL_ACTIVITY", "EQUIPMENT_MOVEMENT", "INFRASTRUCTURE", "ENGINEERING"],
  },
  AIR_ACTIVITY: {
    label: "Air activity",
    types: ["AIR_ACTIVITY", "AIRSPACE_VIOLATION", "AIR_DEFENSE", "AIRFIELD_ACTIVITY", "DRONE_ACTIVITY", "MISSILE_ACTIVITY"],
  },
  COMMAND_INTEGRATION: { label: "Command integration", types: ["COMMAND_CONTROL", "ELECTRONIC_WARFARE"] },
  BORDER_INCIDENTS: { label: "Border incidents", types: ["BORDER_INCIDENT"] },
  NATO_POSTURE: { label: "NATO posture", types: ["NATO_REINFORCEMENT", "NAVAL_ACTIVITY"] },
} as const satisfies Record<string, { label: string; types: readonly EventType[] }>;

export type Dimension = keyof typeof DIMENSIONS;

export function dimensionOf(type: EventType): Dimension | null {
  if (isStatementType(type)) return null;
  for (const [key, d] of Object.entries(DIMENSIONS)) {
    if ((d.types as readonly EventType[]).includes(type)) return key as Dimension;
  }
  return null;
}

/** Scope ids: the whole theater, or one on-map area (gazetteer unit id). */
export const THEATER = "THEATER";

/** One published current event, already placed. */
export type IndexEvent = {
  /** YYYY-MM-DD */
  event_date: string;
  event_type: EventType;
  /** An on-map unit id, THEATER for theater-wide items, or null (outside the theater or unplaced). */
  area: string | null;
  /** created_at (YYYY-MM-DD) of each SUPPORTS source. */
  support_source_added: string[];
};

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));

/** Complete weeks since INDEX_START on `today` (YYYY-MM-DD). Negative before it begins. */
export function completedWeeks(today: string): number {
  return Math.floor((toDate(today).getTime() - toDate(INDEX_START).getTime()) / (7 * DAY));
}

export type Windows = { baselineStart: string; baselineEnd: string; windowStart: string; windowEnd: string };

/** The last 12 complete weeks before `today`: 8 baseline weeks then 4 window weeks (inclusive dates). */
export function indexWindows(today: string): Windows {
  const weeks = completedWeeks(today);
  const windowEndExclusive = addDays(INDEX_START, weeks * 7);
  const windowStart = addDays(windowEndExclusive, -WINDOW_WEEKS * 7);
  const baselineStart = addDays(windowStart, -BASELINE_WEEKS * 7);
  return {
    baselineStart,
    baselineEnd: addDays(windowStart, -1),
    windowStart,
    windowEnd: addDays(windowEndExclusive, -1),
  };
}

export type Band = "MORE" | "WITHIN" | "FEWER";

/**
 * expected = baseline events × (4 / 8). "More than usual" when the window has at least 2×
 * expected AND at least 4 more than expected; "fewer than usual" when it has at most half of
 * expected AND at least 4 fewer; otherwise "within the usual range".
 */
export function bandFor(windowEvents: number, baselineEvents: number): { band: Band; expected: number } {
  const expected = (baselineEvents * WINDOW_WEEKS) / BASELINE_WEEKS;
  if (windowEvents >= RATIO * expected && windowEvents - expected >= MIN_DIFFERENCE) return { band: "MORE", expected };
  if (windowEvents * RATIO <= expected && expected - windowEvents >= MIN_DIFFERENCE) return { band: "FEWER", expected };
  return { band: "WITHIN", expected };
}

export const BAND_LABELS: Record<Band, string> = {
  MORE: "more than usual",
  WITHIN: "within the usual range",
  FEWER: "fewer than usual",
};

export type ScopeResult = {
  scope: string;
  band: Band;
  windowEvents: number;
  baselineEvents: number;
  expected: number;
  /** Window events per dimension (statements never appear). */
  dimensions: Partial<Record<Dimension, number>>;
};

export type IndexResult =
  | { status: "collecting"; week: number; startsOn: string | null }
  | { status: "insufficient"; baselineEvents: number; windows: Windows; panelSources: number }
  | { status: "computed"; windows: Windows; panelSources: number; theater: ScopeResult; areas: ScopeResult[] };

/**
 * Theater first; then each on-map area whose own baseline meets MIN_BASELINE_EVENTS. Until 12
 * complete weeks exist the result is "collecting" (never a number).
 */
export function computeIndex(
  events: readonly IndexEvent[],
  options: { today: string; panelSourcesAdded: readonly string[] },
): IndexResult {
  const weeks = completedWeeks(options.today);
  if (weeks < TOTAL_WEEKS) {
    return weeks < 0
      ? { status: "collecting", week: 0, startsOn: INDEX_START }
      : { status: "collecting", week: weeks + 1, startsOn: null };
  }
  const windows = indexWindows(options.today);
  const panelSources = options.panelSourcesAdded.filter((d) => d < windows.baselineStart).length;
  const counted = events.filter(
    (e) =>
      e.area !== null &&
      dimensionOf(e.event_type) !== null &&
      e.support_source_added.some((d) => d < windows.baselineStart),
  );
  const inRange = (e: IndexEvent, from: string, to: string) => e.event_date >= from && e.event_date <= to;

  const scope = (id: string, list: readonly IndexEvent[]): ScopeResult => {
    const base = list.filter((e) => inRange(e, windows.baselineStart, windows.baselineEnd));
    const win = list.filter((e) => inRange(e, windows.windowStart, windows.windowEnd));
    const dimensions: Partial<Record<Dimension, number>> = {};
    for (const e of win) {
      const d = dimensionOf(e.event_type)!;
      dimensions[d] = (dimensions[d] ?? 0) + 1;
    }
    return { scope: id, ...bandFor(win.length, base.length), windowEvents: win.length, baselineEvents: base.length, dimensions };
  };

  const theater = scope(THEATER, counted);
  if (theater.baselineEvents < MIN_BASELINE_EVENTS) {
    return { status: "insufficient", baselineEvents: theater.baselineEvents, windows, panelSources };
  }
  const areaIds = [...new Set(counted.map((e) => e.area!).filter((a) => a !== THEATER))].sort();
  const areas = areaIds
    .map((id) => scope(id, counted.filter((e) => e.area === id)))
    .filter((r) => r.baselineEvents >= MIN_BASELINE_EVENTS);
  return { status: "computed", windows, panelSources, theater, areas };
}

/** "Collecting baseline: week 3 of 12" / "Collecting baseline: begins 5 Oct 2026". */
export function collectingText(result: Extract<IndexResult, { status: "collecting" }>): string {
  if (result.startsOn) {
    const [y, m, d] = result.startsOn.split("-").map(Number);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
    return `Collecting baseline: begins ${d} ${month} ${y}`;
  }
  return `Collecting baseline: week ${result.week} of ${TOTAL_WEEKS}`;
}

export function insufficientText(result: Extract<IndexResult, { status: "insufficient" }>): string {
  return `Not yet calculated: the baseline has ${result.baselineEvents} of the ${MIN_BASELINE_EVENTS} activity events needed.`;
}

/** "Reported activity in the last 4 weeks: within the usual range (9 events; the previous 8 weeks averaged about 7 per 4 weeks)." */
export function scopeText(r: ScopeResult): string {
  const avg = Math.round(r.expected * 10) / 10;
  return `Reported activity in the last ${WINDOW_WEEKS} weeks: ${BAND_LABELS[r.band]} (${r.windowEvents} event${r.windowEvents === 1 ? "" : "s"}; the previous ${BASELINE_WEEKS} weeks averaged about ${avg} per ${WINDOW_WEEKS} weeks).`;
}

/** Labels for the dimension breakdown, in fixed order. */
export function dimensionLines(r: ScopeResult): string[] {
  return (Object.keys(DIMENSIONS) as Dimension[])
    .filter((d) => (r.dimensions[d] ?? 0) > 0)
    .map((d) => `${DIMENSIONS[d].label}: ${r.dimensions[d]}`);
}

