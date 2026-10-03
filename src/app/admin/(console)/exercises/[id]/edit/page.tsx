import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { ExerciseForm } from "@/components/admin/exercise-form";
import { ExerciseLinksForm } from "@/components/admin/exercise-links-form";
import { requireAdminPage } from "@/lib/admin-session";
import {
  exerciseFormValuesFromExercise,
  getExercise,
  listExerciseSources,
  listLinkableEvents,
  listLinkedEvents,
  type LinkedEvent,
} from "@/lib/exercises";
import { getReviewerName } from "@/lib/reviewer";
import { listSources } from "@/lib/sources";
import { updateExerciseAction, updateExerciseLinksAction } from "../../actions";

export const metadata = { title: "Edit exercise" };

function eventOption(event: LinkedEvent) {
  return { ...event, event_date: event.event_date.toISOString().slice(0, 10) };
}

export default async function EditExercisePage({
  params,
  searchParams,
}: PageProps<"/admin/exercises/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const { saved, linked: linkedSaved } = await searchParams;

  const [exercise, exerciseSources, sources, linked, linkable, reviewerDefault] =
    await Promise.all([
      getExercise(id),
      listExerciseSources(id),
      listSources(),
      listLinkedEvents(id),
      listLinkableEvents(),
      getReviewerName(),
    ]);
  if (!exercise) notFound();

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

      {saved || linkedSaved ? (
        <p
          role="status"
          className="mb-6 max-w-4xl border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          {saved ? "Exercise saved." : "Linked events updated."}
        </p>
      ) : null}

      <div className="grid gap-8">
        <ExerciseForm
          action={updateExerciseAction.bind(null, id)}
          submitLabel="Save changes"
          initialValues={exerciseFormValuesFromExercise(exercise)}
          initialSources={exerciseSources.map((row) => ({
            source_id: row.source_id,
            article_url: row.article_url,
            excerpt: row.excerpt ?? "",
          }))}
          initialPrimaryIndex={primaryIndex}
          sourceOptions={sources.map((s) => ({ id: s.id, name: s.name }))}
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
