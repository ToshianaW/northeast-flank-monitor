/**
 * Historical dataset rules shared by the admin section, the public pages and tests
 * (roadmap Phase 4; migration 0008). No database access here.
 */
import {
  CONFIDENCE_LEVEL_VALUES,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES as ALL_EVENT_TYPES,
  isStatementType,
  type EventType,
  DIMENSION_STATUS_VALUES,
  EVENT_TYPE_VALUES,
  EXERCISE_STATUS_VALUES,
  LOCATION_PRECISION_VALUES,
  RESET_STATUS_VALUES,
} from "@/lib/event-labels";

/** Spec §5: the historical dataset covers August 2020 – February 2022. */
export const HISTORICAL_FIRST_MONTH = "2020-08";
export const HISTORICAL_LAST_MONTH = "2022-02";
export const HISTORICAL_FIRST_DAY = "2020-08-01";
export const HISTORICAL_LAST_DAY = "2022-02-28";

export const HISTORICAL_LABEL = "Historical record, not current reporting.";

/** Spec §6 phase framework; reviewer-set metadata, admin-only. */
export const PHASE_TAG_VALUES = ["P0", "P1", "P2", "P3", "P4"] as const;
export type PhaseTag = (typeof PHASE_TAG_VALUES)[number];
export const PHASE_TAG_LABELS: Record<PhaseTag, string> = {
  P0: "Phase 0 — Baseline",
  P1: "Phase 1 — Elevated readiness / theater conditioning",
  P2: "Phase 2 — Observable abnormal force generation",
  P3: "Phase 3 — Forward positioning / incomplete reset",
  P4: "Phase 4 — Operational buildup",
};

export const HISTORICAL_STATUS_VALUES = ["DRAFT", "PUBLISHED", "REJECTED"] as const;
export type HistoricalStatus = (typeof HISTORICAL_STATUS_VALUES)[number];

/** Same limit as workers/extractor/validate.mts and the 0008 CHECK. */
export const MAX_EXCERPT_WORDS = 20;

export function excerptWordCount(excerpt: string): number {
  const trimmed = excerpt.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isHistoricalMonth(value: string): boolean {
  return MONTH_RE.test(value) && value >= HISTORICAL_FIRST_MONTH && value <= HISTORICAL_LAST_MONTH;
}

/** "2021-01" → "Jan 2021" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** Inclusive list of YYYY-MM months from `from` to `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export type HistoricalPeriod = { from: string; to: string };

export const FULL_PERIOD: HistoricalPeriod = { from: HISTORICAL_FIRST_MONTH, to: HISTORICAL_LAST_MONTH };

/** Reads ?from=YYYY-MM&to=YYYY-MM; anything invalid falls back to the full period. */
export function parsePeriod(params: Record<string, string | string[] | undefined>): HistoricalPeriod {
  const first = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const from = isHistoricalMonth(first("from")) ? first("from") : HISTORICAL_FIRST_MONTH;
  const to = isHistoricalMonth(first("to")) ? first("to") : HISTORICAL_LAST_MONTH;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function lastDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type HistoricalCoverage = {
  events: number;
  sources: number;
  /** Published events per month, every month of the period included (zero allowed). */
  months: Array<{ month: string; events: number }>;
};

/**
 * "N historical events from M sources across these months: Jan 2021 (3), Feb 2021 (1).
 *  No entries yet: Aug 2020, Sep 2020." Shown with every historical page and any baseline,
 * so a thin record is not mistaken for a complete one.
 */
export function coverageNote(c: HistoricalCoverage, options: { listEmptyMonths?: boolean } = {}): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const covered = c.months.filter((m) => m.events > 0);
  const empty = c.months.filter((m) => m.events === 0);
  const head = `${plural(c.events, "historical event", "historical events")} from ${plural(c.sources, "source", "sources")}`;
  const across = covered.length
    ? ` across these months: ${covered.map((m) => `${monthLabel(m.month)} (${m.events})`).join(", ")}.`
    : " in this period.";
  const gaps =
    empty.length && options.listEmptyMonths !== false ? ` No entries yet: ${empty.map((m) => monthLabel(m.month)).join(", ")}.` : "";
  return `${head}${across}${gaps} This is a partial record, not a complete one.`;
}

// ---------------------------------------------------------------------------
// Form fields (client-safe; used by the admin form and src/lib/historical.ts)
// ---------------------------------------------------------------------------

/** Editable columns, in form order. Enum columns carry their allowed values. */
export const HISTORICAL_FIELDS = {
  headline: { kind: "text", required: true },
  summary: { kind: "textarea" },
  event_date: { kind: "date", required: true },
  reported_date: { kind: "date" },
  event_type: { kind: "enum", values: EVENT_TYPE_VALUES, required: true },
  event_subtype: { kind: "text" },
  actor: { kind: "text" },
  country: { kind: "text" },
  region: { kind: "text" },
  location_name: { kind: "text" },
  location_precision: { kind: "enum", values: LOCATION_PRECISION_VALUES },
  exercise_name: { kind: "text" },
  exercise_status: { kind: "enum", values: EXERCISE_STATUS_VALUES },
  unit_name: { kind: "text" },
  unit_type: { kind: "text" },
  unit_home_location: { kind: "text" },
  personnel_estimate: { kind: "text" },
  equipment_type: { kind: "text" },
  equipment_quantity: { kind: "text" },
  activity_description: { kind: "textarea" },
  announced_start_date: { kind: "date" },
  announced_end_date: { kind: "date" },
  observed_start_date: { kind: "date" },
  observed_end_date: { kind: "date" },
  personnel_return_status: { kind: "enum", values: DIMENSION_STATUS_VALUES },
  equipment_return_status: { kind: "enum", values: DIMENSION_STATUS_VALUES },
  infrastructure_status: { kind: "enum", values: DIMENSION_STATUS_VALUES },
  overall_reset_status: { kind: "enum", values: RESET_STATUS_VALUES },
  follow_on_activity: { kind: "textarea" },
  confidence_level: { kind: "enum", values: CONFIDENCE_LEVEL_VALUES, required: true },
  contradiction_notes: { kind: "textarea" },
  phase_tag: { kind: "enum", values: PHASE_TAG_VALUES },
  internal_notes: { kind: "textarea" },
} as const satisfies Record<
  string,
  { kind: "text" | "textarea" | "date" | "enum"; values?: readonly string[]; required?: boolean }
>;

export type HistoricalField = keyof typeof HISTORICAL_FIELDS;
export const HISTORICAL_FIELD_NAMES = Object.keys(HISTORICAL_FIELDS) as HistoricalField[];

// ---------------------------------------------------------------------------
// Public browsing by event type (pure; the public pages and tests use these)
// ---------------------------------------------------------------------------

/** URL slug for an event type: READINESS_CHECK → readiness-check. */
export function typeSlug(type: EventType): string {
  return type.toLowerCase().replace(/_/g, "-");
}

/** The event type for a slug, or null when it is not one. */
export function typeFromSlug(slug: string): EventType | null {
  const type = slug.toUpperCase().replace(/-/g, "_");
  return (ALL_EVENT_TYPES as readonly string[]).includes(type) && typeSlug(type as EventType) === slug
    ? (type as EventType)
    : null;
}

export type TypeMonthCount = { event_type: EventType; month: string; n: number };
export type TypeSummary = { type: EventType; label: string; count: number; firstMonth: string; lastMonth: string };

/**
 * Published counts per type, under the map's two layers (Activity, Statements), most entries
 * first. Types with no published entries are listed separately so the page can collapse them.
 */
export function groupTypeSummaries(rows: TypeMonthCount[]): {
  activity: TypeSummary[];
  statements: TypeSummary[];
  emptyTypes: string[];
} {
  const byType = new Map<EventType, TypeSummary>();
  for (const r of rows) {
    if (r.n <= 0) continue;
    const s = byType.get(r.event_type) ?? {
      type: r.event_type,
      label: EVENT_TYPE_LABELS[r.event_type],
      count: 0,
      firstMonth: r.month,
      lastMonth: r.month,
    };
    s.count += r.n;
    if (r.month < s.firstMonth) s.firstMonth = r.month;
    if (r.month > s.lastMonth) s.lastMonth = r.month;
    byType.set(r.event_type, s);
  }
  const sorted = [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    activity: sorted.filter((s) => !isStatementType(s.type)),
    statements: sorted.filter((s) => isStatementType(s.type)),
    emptyTypes: ALL_EVENT_TYPES.filter((t) => !byType.has(t))
      .map((t) => EVENT_TYPE_LABELS[t])
      .sort((a, b) => a.localeCompare(b)),
  };
}

/** "Jan 2021" or "Jan 2021 – Feb 2021". */
export function monthSpan(first: string, last: string): string {
  return first === last ? monthLabel(first) : `${monthLabel(first)} – ${monthLabel(last)}`;
}

/** All 19 months Aug 2020 – Feb 2022 with this type's published count (zero allowed). */
export function monthStrip(rows: Array<{ month: string; n: number }>): Array<{ month: string; count: number }> {
  const counts = new Map(rows.map((r) => [r.month, r.n]));
  return monthsBetween(HISTORICAL_FIRST_MONTH, HISTORICAL_LAST_MONTH).map((month) => ({ month, count: counts.get(month) ?? 0 }));
}

/**
 * The month to show: the ?month= value when it is a month of the period, otherwise (no value)
 * the most recent month with entries. `invalid` means the page should return not-found.
 */
export function selectMonth(
  strip: Array<{ month: string; count: number }>,
  param: string | string[] | undefined,
): { month: string | null; invalid: boolean } {
  if (Array.isArray(param)) return { month: null, invalid: true };
  if (param !== undefined) return isHistoricalMonth(param) ? { month: param, invalid: false } : { month: null, invalid: true };
  const latest = [...strip].reverse().find((m) => m.count > 0);
  return { month: latest?.month ?? null, invalid: false };
}

export const COUNTS_NOTE = "Counts reflect reporting, not intensity of activity.";

/** Empty-state wording for the type page. */
export function emptyStateText(typeLabel: string, month: string | null): string {
  return month
    ? `No published ${typeLabel.toLowerCase()} entries for ${monthLabel(month)}.`
    : `No published ${typeLabel.toLowerCase()} entries in the historical record yet.`;
}

/** The muted line on /historical when a group has no published entries. */
export function emptyGroupText(group: "activity" | "statements"): string {
  return group === "activity" ? "No activity events recorded yet" : "No statements recorded yet";
}

/** Approving a historical event needs an explicit confidence choice; an empty or unknown value is refused. */
export function parseConfidenceChoice(value: FormDataEntryValue | null): (typeof CONFIDENCE_LEVEL_VALUES)[number] | null {
  const v = typeof value === "string" ? value.trim() : "";
  return (CONFIDENCE_LEVEL_VALUES as readonly string[]).includes(v) ? (v as (typeof CONFIDENCE_LEVEL_VALUES)[number]) : null;
}
