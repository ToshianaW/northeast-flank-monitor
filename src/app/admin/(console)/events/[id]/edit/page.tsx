import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { EventForm } from "@/components/admin/event-form";
import {
  eventFormValuesFromEvent,
  getEvent,
  listEventSources,
  listExerciseOptions,
} from "@/lib/events";
import { currentSourceOptions, listSources } from "@/lib/sources";
import { getReviewerName } from "@/lib/reviewer";
import { updateEventAction } from "../../actions";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const { fromReview } = await searchParams;
  const fromReviewQueue = fromReview === "1";
  const returnTo = `/admin/review/${id}`;

  const [event, eventSources, sources, exercises, reviewerDefault] =
    await Promise.all([
      getEvent(id),
      listEventSources(id),
      listSources(),
      listExerciseOptions(),
      fromReviewQueue ? getReviewerName() : Promise.resolve(null),
    ]);

  if (!event) notFound();

  const primaryIndex = Math.max(
    0,
    eventSources.findIndex((row) => row.is_primary),
  );

  const boundUpdate = updateEventAction.bind(null, id);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {fromReviewQueue ? (
        <BackLink href={returnTo} label="Back to review" />
      ) : (
        <BackLink href="/admin/events" label="Back to events" />
      )}
      <p className="meta-label mb-2">
        Admin · {fromReviewQueue ? "review" : "events"}
      </p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit event</h1>
      <EventForm
        action={boundUpdate}
        submitLabel="Save changes"
        isEdit
        fromReview={fromReviewQueue}
        returnTo={fromReviewQueue ? returnTo : undefined}
        reviewerDefault={reviewerDefault}
        initialValues={eventFormValuesFromEvent(event)}
        initialSources={
          eventSources.length > 0
            ? eventSources.map((row) => ({
                source_id: row.source_id,
                article_url: row.article_url,
                relationship: row.relationship,
                excerpt: row.excerpt ?? "",
              }))
            : [
                {
                  source_id: "",
                  article_url: "",
                  relationship: "SUPPORTS" as const,
                  excerpt: "",
                },
              ]
        }
        initialPrimaryIndex={primaryIndex >= 0 ? primaryIndex : 0}
        sourceOptions={currentSourceOptions(sources, eventSources.map((r) => r.source_id)).map((s) => ({ id: s.id, name: s.name }))}
        exerciseOptions={exercises}
      />
    </section>
  );
}
