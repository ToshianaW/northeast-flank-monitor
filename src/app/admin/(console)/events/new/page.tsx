import { connection } from "next/server";
import { EventForm } from "@/components/admin/event-form";
import { emptyEventFormValues, listExerciseOptions } from "@/lib/events";
import { listSources } from "@/lib/sources";
import { createEventAction } from "../actions";

export const metadata = { title: "Add event" };

export default async function NewEventPage() {
  await connection();
  const [sources, exercises] = await Promise.all([
    listSources(),
    listExerciseOptions(),
  ]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <p className="meta-label mb-2">Admin · events</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Add event</h1>
      <EventForm
        action={createEventAction}
        submitLabel="Save draft"
        initialValues={emptyEventFormValues()}
        initialSources={[
          {
            source_id: "",
            article_url: "",
            relationship: "SUPPORTS",
            excerpt: "",
          },
        ]}
        initialPrimaryIndex={0}
        sourceOptions={sources.map((s) => ({ id: s.id, name: s.name }))}
        exerciseOptions={exercises}
      />
    </section>
  );
}
