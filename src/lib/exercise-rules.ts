import type {
  DimensionStatus,
  ExerciseStatus,
  ResetStatus,
  ReviewStatus,
} from "@/lib/event-labels";
import type { ToneClass } from "@/lib/event-tones";

/**
 * Exercise rules shared by the admin form, the public pages and the tests. No database
 * access here; migration 0007 enforces the same rules as deferred triggers.
 */

export const RESET_EVIDENCE_ERROR =
  "Reset statuses other than Unknown need evidence: attach a source with an excerpt, or link a published event dated on or after the exercise's end date (observed end, or announced end if none is observed).";

export const FULL_RESET_ERROR =
  "Full reset requires personnel, equipment and infrastructure each to be Returned or Removed. Otherwise use Partial reset or a lower status.";

export const PUBLISHED_NEEDS_SOURCE_ERROR =
  "A published exercise needs at least one attached source.";

export function lastEvidenceError(exerciseName: string): string {
  return `This event is the last evidence for the reset status of ${exerciseName}. Set those statuses back to Unknown first.`;
}

export const END_PASSED_NOTE = "Announced end date has passed; no end reported.";

export const NO_EVIDENCE_TEXT = "Not enough open-source evidence";

export const RESET_CAVEAT = "Troops returned does not mean the theater reset.";

/** Statuses a reviewer can pick for an exercise (MERGED does not apply). */
export const EXERCISE_REVIEW_STATUS_VALUES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
] as const satisfies readonly ReviewStatus[];

/** Shown on the dashboard's Active exercises panel. */
export const UNDER_WAY_STATUSES = [
  "ACTIVE",
  "EXTENDED",
  "CONCLUDING",
] as const satisfies readonly ExerciseStatus[];

export type ResetFields = {
  post_exercise_reset: ResetStatus;
  personnel_return_status: DimensionStatus;
  equipment_return_status: DimensionStatus;
  infrastructure_status: DimensionStatus;
};

export function hasNonUnknownReset(fields: ResetFields): boolean {
  return (
    fields.post_exercise_reset !== "UNKNOWN" ||
    fields.personnel_return_status !== "UNKNOWN" ||
    fields.equipment_return_status !== "UNKNOWN" ||
    fields.infrastructure_status !== "UNKNOWN"
  );
}

const RESET_DONE: readonly DimensionStatus[] = ["RETURNED", "REMOVED"];

export function fullResetAllowed(fields: ResetFields): boolean {
  if (fields.post_exercise_reset !== "FULL_RESET") return true;
  return (
    RESET_DONE.includes(fields.personnel_return_status) &&
    RESET_DONE.includes(fields.equipment_return_status) &&
    RESET_DONE.includes(fields.infrastructure_status)
  );
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Observed end, else announced end. Linked events count as evidence only from this day. */
export function evidenceCutoff(dates: {
  observed_end_date: Date | null;
  announced_end_date: Date | null;
}): Date | null {
  return dates.observed_end_date ?? dates.announced_end_date;
}

/** Mirrors exercise_has_reset_evidence() in migration 0007. */
export function hasResetEvidence(input: {
  sources: ReadonlyArray<{ excerpt: string | null }>;
  linkedEvents: ReadonlyArray<{ event_date: Date; review_status: ReviewStatus }>;
  observed_end_date: Date | null;
  announced_end_date: Date | null;
}): boolean {
  if (input.sources.some((s) => (s.excerpt ?? "").trim() !== "")) return true;
  const cutoff = evidenceCutoff(input);
  if (!cutoff) return false;
  return input.linkedEvents.some(
    (e) => e.review_status === "PUBLISHED" && isoDay(e.event_date) >= isoDay(cutoff),
  );
}

/** Display only: never used to change a status. */
export function announcedEndHasPassed(
  exercise: {
    exercise_status: ExerciseStatus;
    announced_end_date: Date | null;
    observed_end_date: Date | null;
  },
  now: Date = new Date(),
): boolean {
  return (
    (exercise.exercise_status === "ACTIVE" || exercise.exercise_status === "CONCLUDING") &&
    exercise.announced_end_date !== null &&
    exercise.observed_end_date === null &&
    isoDay(exercise.announced_end_date) < isoDay(now)
  );
}

/** How far along each status is. A suggestion only ever moves an exercise forward. */
const STATUS_RANK: Record<ExerciseStatus, number> = {
  UNCLEAR: 0,
  ANNOUNCED: 1,
  UPCOMING: 2,
  ACTIVE: 3,
  EXTENDED: 4,
  CONCLUDING: 5,
  CONCLUDED: 6,
};

/** A published event linked to the exercise, with the exercise fields it reports. */
export type ExerciseUpdateEvidence = {
  event_id: string;
  headline: string;
  event_date: Date;
  exercise_status: ExerciseStatus | null;
  observed_start_date: Date | null;
  observed_end_date: Date | null;
};

export type SuggestedValue<T> = {
  value: T;
  /** The linked event that reports it. */
  event: Pick<ExerciseUpdateEvidence, "event_id" | "headline" | "event_date">;
};

export type ExerciseUpdateSuggestion = {
  exercise_status?: SuggestedValue<ExerciseStatus>;
  observed_start_date?: SuggestedValue<Date>;
  observed_end_date?: SuggestedValue<Date>;
};

function eventRef(e: ExerciseUpdateEvidence): SuggestedValue<never>["event"] {
  return { event_id: e.event_id, headline: e.headline, event_date: e.event_date };
}

/**
 * What the exercise's published linked events report that the exercise does not have yet: a
 * later status, an observed start or an observed end. Only suggests; a reviewer applies it from
 * the edit form. Dates already on the exercise are never replaced, and a status never moves back.
 * An observed end on or before today also suggests Concluded.
 */
export function suggestExerciseUpdate(
  exercise: {
    exercise_status: ExerciseStatus;
    observed_start_date: Date | null;
    observed_end_date: Date | null;
  },
  events: ReadonlyArray<ExerciseUpdateEvidence>,
  now: Date = new Date(),
): ExerciseUpdateSuggestion | null {
  const byDate = [...events].sort((a, b) => isoDay(a.event_date).localeCompare(isoDay(b.event_date)));
  const suggestion: ExerciseUpdateSuggestion = {};

  if (!exercise.observed_start_date) {
    const first = byDate
      .filter((e) => e.observed_start_date)
      .sort((a, b) => isoDay(a.observed_start_date!).localeCompare(isoDay(b.observed_start_date!)))[0];
    if (first) suggestion.observed_start_date = { value: first.observed_start_date!, event: eventRef(first) };
  }

  const start = exercise.observed_start_date ?? suggestion.observed_start_date?.value ?? null;
  if (!exercise.observed_end_date) {
    const last = byDate
      .filter((e) => e.observed_end_date && (!start || isoDay(e.observed_end_date) >= isoDay(start)))
      .sort((a, b) => isoDay(a.observed_end_date!).localeCompare(isoDay(b.observed_end_date!)))
      .at(-1);
    if (last) suggestion.observed_end_date = { value: last.observed_end_date!, event: eventRef(last) };
  }

  const latestStatus = byDate.filter((e) => e.exercise_status && e.exercise_status !== "UNCLEAR").at(-1);
  if (latestStatus && STATUS_RANK[latestStatus.exercise_status!] > STATUS_RANK[exercise.exercise_status]) {
    suggestion.exercise_status = { value: latestStatus.exercise_status!, event: eventRef(latestStatus) };
  }

  const end = suggestion.observed_end_date;
  if (
    end &&
    isoDay(end.value) <= isoDay(now) &&
    STATUS_RANK[suggestion.exercise_status?.value ?? exercise.exercise_status] < STATUS_RANK.CONCLUDED
  ) {
    suggestion.exercise_status = { value: "CONCLUDED", event: end.event };
  }

  return Object.keys(suggestion).length > 0 ? suggestion : null;
}

/**
 * Identifies a suggestion by what it suggests and which event reports it, so a dismissal hides
 * only that suggestion: if the linked events later report something different, the key changes.
 */
export function suggestionKey(suggestion: ExerciseUpdateSuggestion): string {
  const part = <T>(field: string, s: SuggestedValue<T> | undefined, value: (v: T) => string) =>
    s ? `${field}=${value(s.value)}@${s.event.event_id}` : null;
  return [
    part("exercise_status", suggestion.exercise_status, String),
    part("observed_start_date", suggestion.observed_start_date, isoDay),
    part("observed_end_date", suggestion.observed_end_date, isoDay),
  ]
    .filter(Boolean)
    .join("|");
}

/** suggestExerciseUpdate, minus a suggestion the reviewer has dismissed. */
export function activeExerciseSuggestion(
  exercise: Parameters<typeof suggestExerciseUpdate>[0] & { dismissed_suggestion: string | null },
  events: ReadonlyArray<ExerciseUpdateEvidence>,
  now: Date = new Date(),
): ExerciseUpdateSuggestion | null {
  const suggestion = suggestExerciseUpdate(exercise, events, now);
  if (!suggestion || suggestionKey(suggestion) === exercise.dismissed_suggestion) return null;
  return suggestion;
}

/** Why the admin list flags an exercise for an update; empty when it needs none. */
export function exerciseUpdateReasons(
  exercise: {
    exercise_status: ExerciseStatus;
    review_status: ReviewStatus;
    announced_end_date: Date | null;
    observed_end_date: Date | null;
  },
  suggestion: ExerciseUpdateSuggestion | null,
  now: Date = new Date(),
): string[] {
  if (exercise.review_status === "REJECTED") return [];
  const reasons: string[] = [];
  if (announcedEndHasPassed(exercise, now)) reasons.push(END_PASSED_NOTE);
  if (suggestion) reasons.push("Linked events report newer details.");
  return reasons;
}

export type ResetDisplay = { symbol: string; text: string; tone: ToneClass };

const NO_EVIDENCE: ResetDisplay = { symbol: "?", text: NO_EVIDENCE_TEXT, tone: "tone-neutral" };

/** Reset widget rows. UNKNOWN is never given a stable or "returned" tone. */
export function dimensionDisplay(status: DimensionStatus): ResetDisplay {
  switch (status) {
    case "RETURNED":
      return { symbol: "✓", text: "Returned", tone: "tone-teal-blue" };
    case "REMOVED":
      return { symbol: "✓", text: "Removed", tone: "tone-teal-blue" };
    case "NOT_RETURNED":
      return { symbol: "●", text: "Not returned", tone: "tone-slate" };
    case "PRESENT":
      return { symbol: "●", text: "Still present", tone: "tone-slate" };
    case "NOT_VERIFIED":
      return { symbol: "?", text: "Not independently verified", tone: "tone-neutral" };
    case "UNKNOWN":
      return NO_EVIDENCE;
  }
}

const RESET_TEXT: Record<Exclude<ResetStatus, "UNKNOWN">, string> = {
  FULL_RESET: "Full reset",
  PERSONNEL_RETURNED: "Personnel returned",
  EQUIPMENT_STATUS_UNKNOWN: "Equipment status unknown",
  PARTIAL_RESET: "Partial reset",
  RESIDUAL_ACTIVITY: "Residual activity",
  INCOMPLETE_RESET: "Incomplete reset",
  CONTINUED_DEPLOYMENT: "Continued deployment",
};

export function overallResetDisplay(status: ResetStatus): ResetDisplay {
  if (status === "UNKNOWN") return NO_EVIDENCE;
  return {
    symbol: status === "FULL_RESET" ? "✓" : "●",
    text: RESET_TEXT[status],
    tone: status === "FULL_RESET" ? "tone-teal-blue" : "tone-slate",
  };
}

export function followOnDisplay(text: string | null): ResetDisplay {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return NO_EVIDENCE;
  return { symbol: "●", text: trimmed, tone: "tone-slate" };
}

export const RESET_ALL_UNKNOWN_TEXT =
  "Post-exercise reset: not enough open-source evidence yet.";

export const RESET_OTHERS_UNKNOWN_TEXT = "Other items: not enough open-source evidence.";

export type ResetWidgetContent =
  | { kind: "none" }
  | {
      kind: "partial";
      rows: Array<{ label: string; display: ResetDisplay }>;
      othersUnknown: boolean;
    };

/**
 * Reset widget content: only the rows that have a value. When nothing has a value the
 * widget collapses to one line.
 */
export function resetWidgetContent(
  x: ResetFields & { follow_on_activity: string | null },
): ResetWidgetContent {
  const candidates: Array<{ label: string; known: boolean; display: ResetDisplay }> = [
    {
      label: "Personnel",
      known: x.personnel_return_status !== "UNKNOWN",
      display: dimensionDisplay(x.personnel_return_status),
    },
    {
      label: "Equipment",
      known: x.equipment_return_status !== "UNKNOWN",
      display: dimensionDisplay(x.equipment_return_status),
    },
    {
      label: "Temporary infrastructure",
      known: x.infrastructure_status !== "UNKNOWN",
      display: dimensionDisplay(x.infrastructure_status),
    },
    {
      label: "Follow-on activity",
      known: (x.follow_on_activity ?? "").trim() !== "",
      display: followOnDisplay(x.follow_on_activity),
    },
    {
      label: "Overall reset",
      known: x.post_exercise_reset !== "UNKNOWN",
      display: overallResetDisplay(x.post_exercise_reset),
    },
  ];
  const rows = candidates.filter((c) => c.known).map(({ label, display }) => ({ label, display }));
  if (rows.length === 0) return { kind: "none" };
  return { kind: "partial", rows, othersUnknown: rows.length < candidates.length };
}

/**
 * Maps a database error from the 0007 constraints to the form message, or null if the
 * error is something else.
 */
export function exerciseConstraintMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const { code, message, constraint } = error as {
    code?: string;
    message?: string;
    constraint?: string;
  };
  if (code !== "23514") return null;
  if (constraint === "exercises_full_reset_requires_dimensions") return FULL_RESET_ERROR;
  if (message?.includes("must have at least one source")) return PUBLISHED_NEEDS_SOURCE_ERROR;
  if (message?.includes("without evidence")) return RESET_EVIDENCE_ERROR;
  return null;
}
