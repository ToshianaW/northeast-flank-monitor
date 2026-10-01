import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EventForm } from "@/components/admin/event-form";
import {
  eventFormValuesFromEvent,
  getEvent,
  listEventSources,
  listExerciseOptions,
} from "@/lib/events";
import { listSources } from "@/lib/sources";
import { updateEventAction } from "../../actions";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: PageProps<"/admin/events/[id]/edit">) {
  await connection();
  const { id } = await params;

  const [event, eventSources, sources, exercises] = await Promise.all([
    getEvent(id),
    listEventSources(id),
    listSources(),
    listExerciseOptions(),
  ]);

  if (!event) notFound();

  const primaryIndex = Math.max(
    0,
    eventSources.findIndex((row) => row.is_primary),
  );

  const boundUpdate = updateEventAction.bind(null, id);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <p className="meta-label mb-2">Admin · events</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit event</h1>
      <EventForm
        action={boundUpdate}
        submitLabel="Save changes"
        isEdit
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
        sourceOptions={sources.map((s) => ({ id: s.id, name: s.name }))}
        exerciseOptions={exercises}
      />
    </section>
  );
}
