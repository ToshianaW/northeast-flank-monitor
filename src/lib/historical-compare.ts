/**
 * Side-by-side view (/historical/compare) and the digest's Historical Context lines (roadmap
 * Phase 5). Descriptive only: counts and lists per event type, with coverage notes. No database
 * access here; every user-visible string is defined in this file so tests can check its wording.
 */
import { SIMILARITY_CAVEAT } from "@/lib/banned-phrases";
import { EVENT_TYPE_LABELS, EVENT_TYPE_VALUES, isStatementType, type EventType } from "@/lib/event-labels";
import {
  HISTORICAL_FIRST_MONTH,
  HISTORICAL_LAST_MONTH,
  isHistoricalMonth,
  monthLabel,
  monthSpan,
  monthsBetween,
  type HistoricalCoverage,
  type HistoricalPeriod,
  type TypeMonthCount,
} from "@/lib/historical-rules";

export { SIMILARITY_CAVEAT };

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

/**
 * Below this the historical side is too thin to set beside current reporting. 4 events is the
 * thinnest month in the record when this was set (Jan 2021), so every single month can be shown;
 * 2 sources keeps one outlet from standing in for the record.
 */
export const MIN_HISTORICAL_EVENTS = 4;
export const MIN_HISTORICAL_SOURCES = 2;

export function hasEnoughHistorical(c: { events: number; sources: number }): boolean {
  return c.events >= MIN_HISTORICAL_EVENTS && c.sources >= MIN_HISTORICAL_SOURCES;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export const MAX_WINDOW_MONTHS = 6;
/**
 * Current events on this page begin here. The current From menu starts at this month, and an
 * earlier start (from a hand-edited URL) is moved to it with a note.
 */
export const CURRENT_FLOOR = "2026-08";
export const DEFAULT_HISTORICAL_WINDOW: HistoricalPeriod = { from: "2021-01", to: "2021-02" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The UTC month of `now`, as YYYY-MM. */
export function currentMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** A well-formed month up to this month. Months before the floor are valid here and moved later. */
function isCurrentMonth(value: string, now: Date): boolean {
  return MONTH_RE.test(value) && value <= currentMonth(now);
}

/** The floor, or this month if the floor is still ahead. */
function currentFloor(now: Date): string {
  const thisMonth = currentMonth(now);
  return CURRENT_FLOOR < thisMonth ? CURRENT_FLOOR : thisMonth;
}

/** "Current events on this page begin in Aug 2026." (static, under the Current window heading) */
export const CURRENT_FLOOR_NOTE = `Current events on this page begin in ${monthLabel(CURRENT_FLOOR)}.`;

export function floorNote(p: HistoricalPeriod): string {
  return `Current events on this page begin in ${monthLabel(CURRENT_FLOOR)}; showing ${windowLabel(p)}.`;
}

export type CompareWindows = { historical: HistoricalPeriod; current: HistoricalPeriod };

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export const LENGTH_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/** "1 month", "2 months" (the Length dropdown). */
export function lengthLabel(n: number): string {
  return n === 1 ? "1 month" : `${n} months`;
}

/** "Showing Aug 2020 – Sep 2020" */
export function showingText(p: HistoricalPeriod): string {
  return `Showing ${windowLabel(p)}`;
}

/** Why the shown window differs from what was asked for, as one line, or null. */
export function limitedNote(p: HistoricalPeriod): string {
  return `Windows are limited to ${MAX_WINDOW_MONTHS} months; showing ${windowLabel(p)}.`;
}

export function endNote(p: HistoricalPeriod, end: "record" | "current"): string {
  return `Window ends at ${end === "record" ? "the end of the record" : "the current month"}; showing ${windowLabel(p)}.`;
}

type Side = {
  prefix: "h" | "c";
  valid: (m: string) => boolean;
  fallback: HistoricalPeriod;
  last: string;
  end: "record" | "current";
  /** Current side only: a window starting earlier is moved to start here, keeping its length. */
  floor?: string;
};

/** A window from parseRange, moved to start at the floor when it starts earlier. */
function parseWindow(params: Params, side: Side): { period: HistoricalPeriod; note: string | null } {
  const parsed = parseRange(params, side);
  const { floor, last } = side;
  if (!floor || parsed.period.from >= floor) return parsed;
  const length = windowMonths(parsed.period);
  let to = addMonths(floor, length - 1);
  if (to > last) to = last;
  const period = { from: floor, to };
  return { period, note: floorNote(period) };
}

/**
 * One window as requested. The form sends {prefix}from + {prefix}len (1-6); the range is from
 * that month for that many months, cut at the last month available. Older links send
 * {prefix}from + {prefix}to: ends are put in order and the span capped at 6 months. Invalid
 * values fall back.
 */
function parseRange(params: Params, side: Side): { period: HistoricalPeriod; note: string | null } {
  const { prefix, valid, fallback, last, end } = side;
  const fromParam = first(params, `${prefix}from`);
  const lenParam = first(params, `${prefix}len`);
  let a = valid(fromParam) ? fromParam : fallback.from;

  if (/^\d+$/.test(lenParam) && Number(lenParam) >= 1) {
    const asked = Number(lenParam);
    let b = addMonths(a, Math.min(asked, MAX_WINDOW_MONTHS) - 1);
    if (b > last) {
      b = last;
      return { period: { from: a, to: b }, note: endNote({ from: a, to: b }, end) };
    }
    return { period: { from: a, to: b }, note: asked > MAX_WINDOW_MONTHS ? limitedNote({ from: a, to: b }) : null };
  }

  const toParam = first(params, `${prefix}to`);
  let b = valid(toParam) ? toParam : fallback.to;
  if (a > b) [a, b] = [b, a];
  if (monthsBetween(a, b).length > MAX_WINDOW_MONTHS) {
    b = addMonths(a, MAX_WINDOW_MONTHS - 1);
    return { period: { from: a, to: b }, note: limitedNote({ from: a, to: b }) };
  }
  return { period: { from: a, to: b }, note: null };
}

export type ParsedWindows = CompareWindows & { notes: { historical: string | null; current: string | null } };

/**
 * ?hfrom&hlen (historical, Aug 2020 – Feb 2022) and ?cfrom&clen (current, up to this month);
 * ?hto and ?cto are still read from older links. Defaults: Jan – Feb 2021 against last month
 * and this month (Sep – Oct 2026 in October 2026), never starting before CURRENT_FLOOR.
 */
export function parseCompareWindows(params: Params, now: Date): ParsedWindows {
  const thisMonth = currentMonth(now);
  const floor = currentFloor(now);
  const lastMonth = addMonths(thisMonth, -1);
  const historical = parseWindow(params, {
    prefix: "h",
    valid: isHistoricalMonth,
    fallback: DEFAULT_HISTORICAL_WINDOW,
    last: HISTORICAL_LAST_MONTH,
    end: "record",
  });
  const current = parseWindow(params, {
    prefix: "c",
    valid: (m) => isCurrentMonth(m, now),
    fallback: { from: lastMonth < floor ? floor : lastMonth, to: thisMonth },
    last: thisMonth,
    end: "current",
    floor,
  });
  return {
    historical: historical.period,
    current: current.period,
    notes: { historical: historical.note, current: current.note },
  };
}

/** Number of months in a window. */
export function windowMonths(p: HistoricalPeriod): number {
  return monthsBetween(p.from, p.to).length;
}

/**
 * The historical window moved one window-length earlier or later, keeping its length. A shift
 * that would pass an end of the record (Aug 2020, Feb 2022) stops at that end. Null when the
 * window already touches that end (the button is shown disabled).
 */
export function shiftHistoricalWindow(p: HistoricalPeriod, direction: "earlier" | "later"): HistoricalPeriod | null {
  const length = windowMonths(p);
  if (direction === "earlier") {
    if (p.from <= HISTORICAL_FIRST_MONTH) return null;
    let from = addMonths(p.from, -length);
    if (from < HISTORICAL_FIRST_MONTH) from = HISTORICAL_FIRST_MONTH;
    return { from, to: addMonths(from, length - 1) };
  }
  if (p.to >= HISTORICAL_LAST_MONTH) return null;
  let to = addMonths(p.to, length);
  if (to > HISTORICAL_LAST_MONTH) to = HISTORICAL_LAST_MONTH;
  return { from: addMonths(to, -(length - 1)), to };
}

/** Link for a pair of windows, in the form's From + Length parameters (hto/cto are still read). */
export function compareHref(w: CompareWindows): string {
  const qs = new URLSearchParams({
    hfrom: w.historical.from,
    hlen: String(windowMonths(w.historical)),
    cfrom: w.current.from,
    clen: String(windowMonths(w.current)),
  });
  return `/historical/compare?${qs.toString()}`;
}

export type ShiftLink =
  | { direction: "earlier" | "later"; disabled: false; href: string; label: string }
  | { direction: "earlier" | "later"; disabled: true; label: string };

/** The Earlier / Later controls for the historical side, with their accessible labels. */
export function historicalShiftLinks(w: CompareWindows): ShiftLink[] {
  return (["earlier", "later"] as const).map((direction) => {
    const shifted = shiftHistoricalWindow(w.historical, direction);
    const name = direction === "earlier" ? "Earlier" : "Later";
    if (!shifted) {
      const end = direction === "earlier" ? HISTORICAL_FIRST_MONTH : HISTORICAL_LAST_MONTH;
      return {
        direction,
        disabled: true,
        label: `${name}: unavailable, the historical window already reaches the ${direction === "earlier" ? "start" : "end"} of the record (${monthLabel(end)})`,
      };
    }
    return {
      direction,
      disabled: false,
      href: compareHref({ ...w, historical: shifted }),
      label: `${name}: show the historical window ${windowLabel(shifted)}`,
    };
  });
}

export function historicalMonthOptions(): string[] {
  return monthsBetween(HISTORICAL_FIRST_MONTH, HISTORICAL_LAST_MONTH);
}

export function currentMonthOptions(now: Date): string[] {
  return monthsBetween(currentFloor(now), currentMonth(now));
}

export function windowLabel(p: HistoricalPeriod): string {
  return monthSpan(p.from, p.to);
}

/** A count query's rows for a window, filled out to every month of it (zero allowed). */
export function toCoverage(
  raw: { events: number; sources: number; months: Array<{ month: string; n: number }> },
  period: HistoricalPeriod,
): HistoricalCoverage {
  const byMonth = new Map(raw.months.map((r) => [r.month, r.n]));
  return {
    events: raw.events,
    sources: raw.sources,
    months: monthsBetween(period.from, period.to).map((month) => ({ month, events: byMonth.get(month) ?? 0 })),
  };
}

// ---------------------------------------------------------------------------
// Page wording
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const HISTORICAL_METHOD_NOTE =
  "Historical entries are entered by hand from archived reporting and reviewed by a person before publication.";

export const CURRENT_METHOD_NOTE =
  "Current events are collected automatically from monitored sources (editors can also add events) and are published only after a person reviews them.";

export const SCALE_NOTE =
  "The two sides use different collection methods and sets of sources, so their counts are not on the same scale. Counts reflect reporting, not intensity of activity.";

export const NONE_IN_WINDOW = "None published in this window.";

/** "How to read this page", in order. */
export const HOW_TO_READ = [
  "Choose a start month and a length of 1 to 6 months for each window.",
  "The left column shows what the historical record holds for the past window. The right column shows what is published now for the current window. Both are grouped by event type.",
  "The page counts and lists events. It does not pair them up, rate them or rank them.",
];

/** "Covers 2 months." */
export function coversText(p: HistoricalPeriod): string {
  return `Covers ${plural(windowMonths(p), "month", "months")}.`;
}

/** "17 published events from 7 sources: Sep 2026 (4), Oct 2026 (13). Oct 2026 is in progress (through 4 Oct)." */
export function currentCoverageNote(c: HistoricalCoverage, now: Date): string {
  const head = `${plural(c.events, "published event", "published events")} from ${plural(c.sources, "source", "sources")}`;
  const months = `: ${c.months.map((m) => `${monthLabel(m.month)} (${m.events})`).join(", ")}.`;
  const last = c.months.at(-1)?.month;
  const inProgress =
    last === currentMonth(now)
      ? ` ${monthLabel(last)} is in progress (through ${now.getUTCDate()} ${monthLabel(last).slice(0, 3)}).`
      : "";
  return `${head}${months}${inProgress}`;
}

/** Shown when the windows differ in length, or null. */
export function windowLengthNote(w: CompareWindows): string | null {
  const h = monthsBetween(w.historical.from, w.historical.to).length;
  const c = monthsBetween(w.current.from, w.current.to).length;
  if (h === c) return null;
  return `The windows differ in length: ${plural(h, "month", "months")} of historical record, ${plural(c, "month", "months")} of current reporting.`;
}

/** Shown instead of the rows when hasEnoughHistorical() is false. */
export function tooFewText(c: { events: number; sources: number }, period: HistoricalPeriod): string {
  return `Too few historical entries in ${windowLabel(period)} to set side by side: ${plural(c.events, "event", "events")} from ${plural(c.sources, "source", "sources")}. At least ${MIN_HISTORICAL_EVENTS} events from ${MIN_HISTORICAL_SOURCES} sources are needed. Choose a wider historical window.`;
}

export function otherTypesText(n: number): string {
  return n === 1
    ? "1 other event type has no entries on either side."
    : `${n} other event types have no entries on either side.`;
}

/** Every fixed string the page shows, for the wording test. */
export const PAGE_NOTES = [
  HISTORICAL_METHOD_NOTE,
  CURRENT_METHOD_NOTE,
  SCALE_NOTE,
  NONE_IN_WINDOW,
  CURRENT_FLOOR_NOTE,
  SIMILARITY_CAVEAT,
  ...HOW_TO_READ,
];

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type CompareRow<H, C> = { type: EventType; label: string; historical: H[]; current: C[] };

/**
 * One row per event type with entries on either side, in the fixed taxonomy order (never by
 * count), split into Activity and Statements as on /historical.
 */
export function compareRows<H extends { event_type: EventType }, C extends { event_type: EventType }>(
  historical: readonly H[],
  current: readonly C[],
): { activity: CompareRow<H, C>[]; statements: CompareRow<H, C>[]; emptyTypeCount: number } {
  const rows: CompareRow<H, C>[] = [];
  for (const type of EVENT_TYPE_VALUES) {
    const h = historical.filter((e) => e.event_type === type);
    const c = current.filter((e) => e.event_type === type);
    if (h.length + c.length > 0) rows.push({ type, label: EVENT_TYPE_LABELS[type], historical: h, current: c });
  }
  return {
    activity: rows.filter((r) => !isStatementType(r.type)),
    statements: rows.filter((r) => isStatementType(r.type)),
    emptyTypeCount: EVENT_TYPE_VALUES.length - rows.length,
  };
}

// ---------------------------------------------------------------------------
// Digest Historical Context (written by code, never by the model)
// ---------------------------------------------------------------------------

export const HISTORICAL_RECORD_NOTE =
  "The historical record covers Aug 2020 – Feb 2022, is entered by hand and is partial. Counts reflect reporting, not intensity of activity.";

function zeroLine(label: string): string {
  return `${label}: No entries of this type in the historical record so far. The record is partial.`;
}

function countLine(label: string, months: Array<{ month: string; n: number }>): string {
  const n = months.reduce((sum, m) => sum + m.n, 0);
  const sorted = months.map((m) => m.month).sort();
  const when =
    sorted.length <= 4
      ? `in ${sorted.map(monthLabel).join(", ")}`
      : `across ${sorted.length} months between ${monthLabel(sorted[0])} and ${monthLabel(sorted.at(-1)!)}`;
  return `${label}: ${n} historical ${n === 1 ? "event" : "events"} of this type ${n === 1 ? "was" : "were"} recorded ${when}.`;
}

/**
 * For each event type in the day's digest: how many PUBLISHED historical events of that type were
 * recorded, and in which months. Then the record note and the fixed caveat. Null when the whole
 * record is below the threshold (the digest keeps its fixed line).
 */
export function historicalContextLines(
  dayTypes: readonly EventType[],
  counts: readonly TypeMonthCount[],
  coverage: { events: number; sources: number },
): string[] | null {
  if (!hasEnoughHistorical(coverage) || dayTypes.length === 0) return null;
  const types = EVENT_TYPE_VALUES.filter((t) => dayTypes.includes(t));
  const lines = types.map((type) => {
    const months = counts.filter((c) => c.event_type === type && c.n > 0);
    return months.length === 0 ? zeroLine(EVENT_TYPE_LABELS[type]) : countLine(EVENT_TYPE_LABELS[type], months);
  });
  return [...lines, HISTORICAL_RECORD_NOTE, SIMILARITY_CAVEAT];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LABEL = `(?:${Object.values(EVENT_TYPE_LABELS).map(escape).join("|")})`;
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4}";
const COUNT_LINE = new RegExp(
  `^${LABEL}: \\d+ historical events? of this type (?:was|were) recorded (?:in ${MONTH}(?:, ${MONTH}){0,3}|across \\d+ months between ${MONTH} and ${MONTH})\\.$`,
);
const ZERO_LINE = new RegExp(`^${LABEL}: No entries of this type in the historical record so far\\. The record is partial\\.$`);

/** True only for a line historicalContextLines() can produce. */
export function isHistoricalContextLine(line: string): boolean {
  return line === HISTORICAL_RECORD_NOTE || line === SIMILARITY_CAVEAT || COUNT_LINE.test(line) || ZERO_LINE.test(line);
}
