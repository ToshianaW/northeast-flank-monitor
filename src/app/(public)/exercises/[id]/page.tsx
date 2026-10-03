import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { EventLogEntry, formatEventDate } from "@/components/event-log-entry";
import { EndPassedNote } from "@/components/exercise-log-entry";
import { PageShell } from "@/components/page-shell";
import { ResetWidget } from "@/components/reset-widget";
import { Badge } from "@/components/ui/badge";
import { EXERCISE_STATUS_LABELS } from "@/lib/event-labels";
import {
  getPublishedExercise,
  listPublicExerciseSources,
  listPublishedExerciseEvents,
  type PublicExerciseSource,
} from "@/lib/public-exercises";
import { isStateOfficialSource, SOURCE_TYPE_LABELS } from "@/lib/source-labels";

export const metadata = { title: "Exercise" };

const NOT_REPORTED = "Not reported";

function day(d: Date | null): string {
  return d ? formatEventDate(d) : NOT_REPORTED;
}

function SourceItem({ source }: { source: PublicExerciseSource }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {source.home_url ? (
          <a
            href={source.home_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium transition-colors hover:text-link hover:underline"
          >
            {source.name}
          </a>
        ) : (
          <span className="font-medium">{source.name}</span>
        )}
        <Badge variant="outline" className="text-text-secondary">
          {SOURCE_TYPE_LABELS[source.source_type]}
        </Badge>
        {isStateOfficialSource(source) ? (
          <Badge className="bg-slate-indigo text-foreground">State / official source</Badge>
        ) : null}
        {source.is_primary ? (
          <span className="font-mono text-xs text-text-muted">PRIMARY</span>
        ) : null}
      </div>
      <a
        href={source.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block break-all font-mono text-xs link"
      >
        {source.article_url}
      </a>
      {source.excerpt ? (
        <blockquote className="mt-2 max-w-3xl border-l-2 border-border pl-3 text-base text-text-secondary">
          {source.excerpt}
        </blockquote>
      ) : null}
    </li>
  );
}

function DateBlock({
  title,
  start,
  end,
}: {
  title: string;
  start: Date | null;
  end: Date | null;
}) {
  return (
    <div>
      <h3 className="text-xs text-text-muted">{title}</h3>
      <dl className="mt-1 grid grid-cols-[3rem_1fr] gap-y-1 text-sm">
        <dt className="text-xs text-text-muted">Start</dt>
        <dd className="font-mono">{day(start)}</dd>
        <dt className="text-xs text-text-muted">End</dt>
        <dd className="font-mono">{day(end)}</dd>
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-base whitespace-pre-line">{value}</dd>
    </div>
  );
}

export default async function ExercisePage({ params }: PageProps<"/exercises/[id]">) {
  await connection();
  const { id } = await params;
  const [exercise, sources, events] = await Promise.all([
    getPublishedExercise(id),
    listPublicExerciseSources(id),
    listPublishedExerciseEvents(id),
  ]);
  if (!exercise) notFound();
  const hasObserved = Boolean(exercise.observed_start_date || exercise.observed_end_date);

  return (
    <PageShell aside={<ResetWidget exercise={exercise} />} asideLabel="Post-exercise reset">
      <article className="max-w-4xl">
        <Link href="/exercises" className="mb-6 inline-flex items-center gap-1.5 text-sm link">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to exercises
        </Link>

        <p className="text-xs font-semibold uppercase tracking-wide text-link">
          Exercise · {EXERCISE_STATUS_LABELS[exercise.exercise_status]}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {exercise.exercise_name}
        </h1>
        <EndPassedNote exercise={exercise} />

        {exercise.summary ? (
          <p className="mt-6 max-w-3xl leading-relaxed text-text-secondary whitespace-pre-line">
            {exercise.summary}
          </p>
        ) : null}

        <div className="mt-8 grid gap-8">
          <section className="border-t border-border pt-5">
            <h2 className="meta-label mb-3">Dates</h2>
            <div className="grid max-w-xl gap-6 sm:grid-cols-2">
              <DateBlock
                title="Announced"
                start={exercise.announced_start_date}
                end={exercise.announced_end_date}
              />
              {hasObserved ? (
                <DateBlock
                  title="Observed"
                  start={exercise.observed_start_date}
                  end={exercise.observed_end_date}
                />
              ) : null}
            </div>
            {hasObserved ? null : (
              <p className="mt-2 text-xs text-text-muted">No observed dates reported.</p>
            )}
          </section>

          <section className="border-t border-border pt-5">
            <h2 className="meta-label mb-3">Details</h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Actor" value={exercise.actor} />
              <Detail label="Countries" value={exercise.countries.join(", ") || null} />
              <Detail label="Location" value={exercise.location} />
              <Detail label="Participating units" value={exercise.participating_units} />
              <Detail label="Estimated personnel" value={exercise.estimated_personnel} />
              <Detail label="Equipment" value={exercise.equipment} />
              <Detail label="Objectives" value={exercise.exercise_objectives} />
            </dl>
          </section>

          <section className="border-t border-border pt-5">
            <h2 className="meta-label mb-3">
              Linked events
              <span className="ml-2 font-mono font-normal text-text-muted">{events.length}</span>
            </h2>
            {events.length === 0 ? (
              <p className="text-base text-text-secondary">No published events are linked yet.</p>
            ) : (
              <div className="grid gap-4">
                {events.map((event) => (
                  <EventLogEntry key={event.event_id} event={event} />
                ))}
              </div>
            )}
          </section>

          <section className="border-t border-border pt-5">
            <h2 className="meta-label">
              Sources
              <span className="ml-2 font-mono font-normal text-text-muted">{sources.length}</span>
            </h2>
            <ul className="divide-y divide-border">
              {sources.map((source) => (
                <SourceItem key={`${source.name}-${source.article_url}`} source={source} />
              ))}
            </ul>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
