import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { DismissSuggestionForm } from "@/components/admin/dismiss-suggestion-form";
import { buttonVariants } from "@/components/ui/button";
import { ExerciseForm } from "@/components/admin/exercise-form";
import { ExerciseLinksForm } from "@/components/admin/exercise-links-form";
import { requireAdminPage } from "@/lib/admin-session";
import { EXERCISE_STATUS_LABELS } from "@/lib/event-labels";
import {
  activeExerciseSuggestion,
  announcedEndHasPassed,
  END_PASSED_NOTE,
  suggestionKey,
  type ExerciseUpdateSuggestion,
  type SuggestedValue,
} from "@/lib/exercise-rules";
import {
  exerciseFormValuesFromExercise,
  getExercise,
  listExerciseSources,
  listExerciseUpdateEvidence,
  listLinkableEvents,
  listLinkedEvents,
  withSuggestion,
  type Exercise,
  type LinkedEvent,
} from "@/lib/exercises";
import { getReviewerName } from "@/lib/reviewer";
import { currentSourceOptions, listSources } from "@/lib/sources";
import {
  dismissExerciseSuggestionAction,
  updateExerciseAction,
  updateExerciseLinksAction,
} from "../../actions";

export const metadata = { title: "Edit exercise" };

function eventOption(event: LinkedEvent) {
  return { ...event, event_date: event.event_date.toISOString().slice(0, 10) };
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/**
 * What the published linked events report that the exercise does not have yet. Nothing changes
 * until the reviewer fills the form with it and saves.
 */
function SuggestionPanel({
  id,
  exercise,
  suggestion,
  applied,
  reviewerDefault,
}: {
  id: string;
  exercise: Exercise;
  suggestion: ExerciseUpdateSuggestion;
  applied: boolean;
  reviewerDefault: string | null;
}) {
  const rows: Array<{ label: string; current: string; suggested: SuggestedValue<string> }> = [];
  if (suggestion.exercise_status) {
    rows.push({
      label: "Status",
      current: EXERCISE_STATUS_LABELS[exercise.exercise_status],
      suggested: { ...suggestion.exercise_status, value: EXERCISE_STATUS_LABELS[suggestion.exercise_status.value] },
    });
  }
  if (suggestion.observed_start_date) {
    rows.push({
      label: "Observed start",
      current: day(exercise.observed_start_date),
      suggested: { ...suggestion.observed_start_date, value: day(suggestion.observed_start_date.value) },
    });
  }
  if (suggestion.observed_end_date) {
    rows.push({
      label: "Observed end",
      current: day(exercise.observed_end_date),
      suggested: { ...suggestion.observed_end_date, value: day(suggestion.observed_end_date.value) },
    });
  }

  return (
    <section
      id="suggested"
      className="max-w-4xl border border-teal-blue/50 bg-teal-blue/5 px-4 py-4"
      aria-labelledby="suggested-heading"
    >
      <h2 id="suggested-heading" className="meta-label mb-2">
        Suggested update from linked events
      </h2>
      <ul className="grid gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.label}>
            <span className="font-medium">{row.label}:</span> {row.current} →{" "}
            <span className="font-medium">{row.suggested.value}</span>
            <span className="block text-xs text-text-muted">
              Reported by{" "}
              <Link href={`/admin/review/${row.suggested.event.event_id}`} className="text-teal-blue hover:underline">
                {row.suggested.event.headline}
              </Link>{" "}
              ({day(row.suggested.event.event_date)})
            </span>
          </li>
        ))}
      </ul>
      {applied ? (
        <p role="status" className="mt-3 text-sm text-foreground">
          These values are filled in below. Check them and save; nothing has changed yet.{" "}
          <Link href={`/admin/exercises/${id}/edit`} className="text-teal-blue hover:underline">
            Undo
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/exercises/${id}/edit?apply=suggested#exercise_status`}
            className={buttonVariants({ size: "sm" })}
          >
            Fill the form with these
          </Link>
          <span className="text-xs text-text-muted">Nothing changes until you save the form.</span>
        </div>
      )}
      <DismissSuggestionForm
        action={dismissExerciseSuggestionAction.bind(null, id, suggestionKey(suggestion))}
        reviewerDefault={reviewerDefault}
      />
    </section>
  );
}

export default async function EditExercisePage({
  params,
  searchParams,
}: PageProps<"/admin/exercises/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const { saved, linked: linkedSaved, fromEvent, apply, dismissed } = await searchParams;

  const [exercise, exerciseSources, sources, linked, linkable, reviewerDefault, evidence] =
    await Promise.all([
      getExercise(id),
      listExerciseSources(id),
      listSources(),
      listLinkedEvents(id),
      listLinkableEvents(),
      getReviewerName(),
      listExerciseUpdateEvidence([id]),
    ]);
  if (!exercise) notFound();

  const suggestion = activeExerciseSuggestion(exercise, evidence.get(id) ?? []);
  const applied = apply === "suggested" && suggestion !== null;
  const formValues = exerciseFormValuesFromExercise(exercise);

  const primaryIndex = Math.max(0, exerciseSources.findIndex((row) => row.is_primary));

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/exercises" label="Back to exercises" />
      <p className="meta-label mb-2">Admin · exercises</p>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit exercise</h1>
        {exercise.review_status === "PUBLISHED" ? (
          <Link href={`/exercises/${id}`} className="text-xs text-teal-blue hover:underline">
            View public page
          </Link>
        ) : null}
      </div>

      {fromEvent === "created" || fromEvent === "linked" ? (
        <p
          role="status"
          className="mb-6 max-w-4xl border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          {fromEvent === "created"
            ? `Exercise created from the event and linked to it${exercise.review_status === "PUBLISHED" ? " and published" : ". It is a draft because the event had no linked source to copy: add one and publish"}. Check the details below.`
            : "The event is now linked to this exercise, which already had the same name."}
        </p>
      ) : null}

      {saved || linkedSaved || dismissed ? (
        <p
          role="status"
          className="mb-6 max-w-4xl border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          {saved ? "Exercise saved." : linkedSaved ? "Linked events updated." : "Suggestion dismissed."}
        </p>
      ) : null}

      <div className="grid gap-8">
        {announcedEndHasPassed(exercise) && !suggestion?.observed_end_date ? (
          <p className="max-w-4xl border border-border px-3 py-2 text-sm text-text-secondary">
            {END_PASSED_NOTE} If it has ended, set the status and observed end date below.
          </p>
        ) : null}
        {suggestion ? (
          <SuggestionPanel
            id={id}
            exercise={exercise}
            suggestion={suggestion}
            applied={applied}
            reviewerDefault={reviewerDefault}
          />
        ) : null}
        <ExerciseForm
          key={applied ? "suggested" : "saved"}
          action={updateExerciseAction.bind(null, id)}
          submitLabel="Save changes"
          initialValues={applied && suggestion ? withSuggestion(formValues, suggestion) : formValues}
          initialSources={exerciseSources.map((row) => ({
            source_id: row.source_id,
            article_url: row.article_url,
            excerpt: row.excerpt ?? "",
          }))}
          initialPrimaryIndex={primaryIndex}
          sourceOptions={currentSourceOptions(sources, exerciseSources.map((r) => r.source_id)).map((s) => ({ id: s.id, name: s.name }))}
          reviewerDefault={reviewerDefault}
        />
        <ExerciseLinksForm
          action={updateExerciseLinksAction.bind(null, id)}
          linked={linked.map(eventOption)}
          linkable={linkable.map(eventOption)}
          reviewerDefault={reviewerDefault}
        />
      </div>
    </section>
  );
}
