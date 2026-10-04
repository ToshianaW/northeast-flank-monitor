/**
 * Side-by-side view (/historical/compare) and the digest's Historical Context lines (roadmap
 * Phase 5). Descriptive only: counts and lists per event type, with coverage notes. No database
 * access here; every user-visible string is defined in this file so tests can check its wording.
 */
import { COMPARISON_CAVEAT } from "@/lib/banned-phrases";
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

export { COMPARISON_CAVEAT };

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
/** Earliest month offered on the current side. */
export const CURRENT_FIRST_MONTH = "2025-01";
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

function isCurrentMonth(value: string, now: Date): boolean {
  return MONTH_RE.test(value) && value >= CURRENT_FIRST_MONTH && value <= currentMonth(now);
}

export type CompareWindows = { historical: HistoricalPeriod; current: HistoricalPeriod };

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Valid ends are kept, invalid ones fall back; ends are put in order and the span capped. */
function parseWindow(from: string, to: string, valid: (m: string) => boolean, fallback: HistoricalPeriod): HistoricalPeriod {
  let a = valid(from) ? from : fallback.from;
  let b = valid(to) ? to : fallback.to;
  if (a > b) [a, b] = [b, a];
  if (monthsBetween(a, b).length > MAX_WINDOW_MONTHS) b = addMonths(a, MAX_WINDOW_MONTHS - 1);
  return { from: a, to: b };
}

/**
 * ?hfrom&hto (historical, Aug 2020 – Feb 2022) and ?cfrom&cto (current, up to this month).
 * Defaults: Jan – Feb 2021 against last month and this month (Sep – Oct 2026 in October 2026).
 */
export function parseCompareWindows(params: Params, now: Date): CompareWindows {
  const thisMonth = currentMonth(now);
  return {
    historical: parseWindow(first(params, "hfrom"), first(params, "hto"), isHistoricalMonth, DEFAULT_HISTORICAL_WINDOW),
    current: parseWindow(first(params, "cfrom"), first(params, "cto"), (m) => isCurrentMonth(m, now), {
      from: addMonths(thisMonth, -1),
      to: thisMonth,
    }),
  };
}

export function historicalMonthOptions(): string[] {
  return monthsBetween(HISTORICAL_FIRST_MONTH, HISTORICAL_LAST_MONTH);
}

export function currentMonthOptions(now: Date): string[] {
  return monthsBetween(CURRENT_FIRST_MONTH, currentMonth(now));
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
  "The two sides come from different collection methods and different sets of sources, so their counts are not on the same scale.";

export const GROUPING_NOTE = "Rows are grouped by event type only. No event is paired with another.";

export const NONE_IN_WINDOW = "None published in this window.";

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
  GROUPING_NOTE,
  NONE_IN_WINDOW,
  COMPARISON_CAVEAT,
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
  return [...lines, HISTORICAL_RECORD_NOTE, COMPARISON_CAVEAT];
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
  return line === HISTORICAL_RECORD_NOTE || line === COMPARISON_CAVEAT || COUNT_LINE.test(line) || ZERO_LINE.test(line);
}
