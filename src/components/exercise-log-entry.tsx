import Link from "next/link";
import { formatEventDate } from "@/components/event-log-entry";
import { EXERCISE_STATUS_LABELS } from "@/lib/event-labels";
import { announcedEndHasPassed, END_PASSED_NOTE, overallResetDisplay } from "@/lib/exercise-rules";
import type { PublicExercise } from "@/lib/public-exercises";

/** "29 SEP 2026 – 02 OCT 2026", one side "?" when unknown; null when both are missing. */
export function formatDateRange(start: Date | null, end: Date | null): string | null {
  if (!start && !end) return null;
  return `${start ? formatEventDate(start) : "?"} – ${end ? formatEventDate(end) : "?"}`;
}

export function EndPassedNote({ exercise }: { exercise: PublicExercise }) {
  if (!announcedEndHasPassed(exercise)) return null;
  return <p className="mt-1 text-xs text-text-muted">{END_PASSED_NOTE}</p>;
}

/**
 * One published exercise, in the same card / row styles as EventLogEntry.
 */
export function ExerciseLogEntry({
  exercise,
  variant = "card",
}: {
  exercise: PublicExercise;
  variant?: "card" | "row";
}) {
  const href = `/exercises/${exercise.id}`;
  const Heading = variant === "row" ? "h3" : "h2";
  const reset = overallResetDisplay(exercise.post_exercise_reset);
  const announced = formatDateRange(exercise.announced_start_date, exercise.announced_end_date);
  const observed = formatDateRange(exercise.observed_start_date, exercise.observed_end_date);

  return (
    <article className={variant === "row" ? "feed-item tone-teal-blue" : "panel panel-link"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill tint tone-teal-blue">
          {EXERCISE_STATUS_LABELS[exercise.exercise_status]}
        </span>
        <span className={`pill tint ${reset.tone}`}>Reset: {reset.text}</span>
      </div>

      <Heading className="mt-3 text-base font-medium leading-snug">
        <Link href={href} className="panel-target transition-colors hover:text-link hover:underline">
          {exercise.exercise_name}
        </Link>
      </Heading>
      <p className="mt-1 font-mono text-xs text-text-secondary">
        Announced {announced ?? "not reported"} · Observed {observed ?? "not reported"}
      </p>
      <EndPassedNote exercise={exercise} />
      {exercise.actor || exercise.countries.length > 0 ? (
        <p className="mt-1 text-sm text-text-secondary">
          {[exercise.actor, exercise.countries.join(", ")].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {variant === "card" && exercise.summary ? (
        <p className="mt-2 line-clamp-2 max-w-3xl text-base text-text-secondary">
          {exercise.summary}
        </p>
      ) : null}

      {variant === "card" ? (
        <div className="mt-4 flex justify-end">
          <Link href={href} className="btn-pill relative">
            View exercise →
          </Link>
        </div>
      ) : null}
    </article>
  );
}
