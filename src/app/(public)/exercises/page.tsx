import { pageMetadata } from "@/lib/site-metadata";
import { connection } from "next/server";
import { ExerciseLogEntry } from "@/components/exercise-log-entry";
import { ListFilterForm } from "@/components/list-filter-form";
import { PageShell } from "@/components/page-shell";
import { ShowMoreList } from "@/components/show-more-list";
import type { ExerciseStatus } from "@/lib/event-labels";
import { filterOptions, matchesFilters, parseListFilters, SHOW_STEP } from "@/lib/list-filters";
import { listPublishedExercises } from "@/lib/public-exercises";

export const metadata = pageMetadata("/exercises", "Exercises", "Military exercises on NATO's northeastern flank: announced and observed dates, status and post-exercise reset.");

const GROUPS: Array<{ id: string; label: string; statuses: ExerciseStatus[] }> = [
  { id: "under-way", label: "Under way", statuses: ["ACTIVE", "EXTENDED", "CONCLUDING"] },
  { id: "announced", label: "Announced and upcoming", statuses: ["ANNOUNCED", "UPCOMING"] },
  { id: "concluded", label: "Concluded", statuses: ["CONCLUDED"] },
  { id: "unclear", label: "Unclear", statuses: ["UNCLEAR"] },
];

/** Start month (observed, else announced) as YYYY-MM, for the month filter. */
function startMonth(x: { observed_start_date: Date | null; announced_start_date: Date | null }): string | null {
  const d = x.observed_start_date ?? x.announced_start_date;
  return d ? d.toISOString().slice(0, 7) : null;
}

export default async function ExercisesPage({ searchParams }: PageProps<"/exercises">) {
  await connection();
  const [exercises, params] = await Promise.all([listPublishedExercises(), searchParams]);

  const keyed = exercises.map((x) => ({ exercise: x, countries: x.countries ?? [], month: startMonth(x) }));
  const options = filterOptions(keyed);
  const filters = parseListFilters(params, options);
  const shown = keyed.filter((k) => matchesFilters(k, filters)).map((k) => k.exercise);
  const filterKey = `${filters.country ?? ""}|${filters.month ?? ""}`;

  return (
    <PageShell
      eyebrow="Activity"
      title="Exercise tracker"
      intro={
        <p>
          Announced and observed exercises, with post-exercise reset status. Statuses are
          set by a reviewer and never change on their own when a date passes.
        </p>
      }
    >
      {exercises.length === 0 ? (
        <p className="text-base text-text-secondary">No exercises are published yet.</p>
      ) : (
        <div className="grid gap-10">
          <ListFilterForm action="/exercises" filters={filters} countries={options.countries} months={options.months} />
          {shown.length === 0 ? <p className="text-sm text-text-muted">No published exercises for this search.</p> : null}
          {GROUPS.map((group) => {
            const items = shown.filter((x) => group.statuses.includes(x.exercise_status));
            if (items.length === 0) return null;
            return (
              <section key={group.id} aria-labelledby={`group-${group.id}`}>
                <h2
                  id={`group-${group.id}`}
                  className="mb-4 text-base font-semibold text-foreground"
                >
                  {group.label}
                  <span className="ml-2 font-mono text-xs font-normal text-text-muted">
                    {items.length}
                  </span>
                </h2>
                <ShowMoreList
                  key={`${group.id}|${filterKey}`}
                  step={SHOW_STEP}
                  label={`${group.label.toLowerCase()} exercises`}
                  items={items.map((exercise) => (
                    <ExerciseLogEntry key={exercise.id} exercise={exercise} />
                  ))}
                />
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
