import { formatDateRange } from "@/components/exercise-log-entry";
import {
  RESET_ALL_UNKNOWN_TEXT,
  RESET_CAVEAT,
  RESET_OTHERS_UNKNOWN_TEXT,
  resetWidgetContent,
  type ResetDisplay,
} from "@/lib/exercise-rules";
import type { PublicExercise } from "@/lib/public-exercises";

function Row({ label, display }: { label: string; display: ResetDisplay }) {
  return (
    <div className={`py-3 ${display.tone}`}>
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 flex items-start gap-2 text-base">
        <span aria-hidden className="font-mono" style={{ color: "var(--tone)" }}>
          {display.symbol}
        </span>
        <span className={display.tone === "tone-neutral" ? "text-text-secondary" : ""}>
          {display.text}
        </span>
      </dd>
    </div>
  );
}

function Caveat() {
  return (
    <p className="mt-3 border-l-2 border-teal-blue pl-3 text-sm text-foreground">
      {RESET_CAVEAT}
    </p>
  );
}

/**
 * Spec §18. Shows only the rows that have a value; when none do, one compact line.
 * UNKNOWN stays in a neutral tone.
 */
export function ResetWidget({ exercise }: { exercise: PublicExercise }) {
  const content = resetWidgetContent(exercise);

  if (content.kind === "none") {
    return (
      <section aria-label="Post-exercise reset" className="panel">
        <p className="text-sm text-text-secondary">{RESET_ALL_UNKNOWN_TEXT}</p>
        <Caveat />
      </section>
    );
  }

  const observed = formatDateRange(exercise.observed_start_date, exercise.observed_end_date);
  const announced = formatDateRange(exercise.announced_start_date, exercise.announced_end_date);

  return (
    <section aria-labelledby="reset-widget-heading" className="panel">
      <h2 id="reset-widget-heading" className="meta-label">
        Post-exercise reset
      </h2>
      <p className="mt-2 text-base font-medium">{exercise.exercise_name}</p>
      {exercise.actor ? (
        <p className="text-sm text-text-secondary">{exercise.actor}</p>
      ) : null}
      <p className="mt-1 font-mono text-xs text-text-secondary">
        {observed ? `Observed ${observed}` : announced ? `Announced ${announced}` : "Dates not reported"}
      </p>

      <dl className="mt-3 divide-y divide-border border-t border-border">
        {content.rows.map((row) => (
          <Row key={row.label} label={row.label} display={row.display} />
        ))}
      </dl>
      {content.othersUnknown ? (
        <p className="mt-2 text-xs text-text-muted">{RESET_OTHERS_UNKNOWN_TEXT}</p>
      ) : null}

      <Caveat />
    </section>
  );
}
