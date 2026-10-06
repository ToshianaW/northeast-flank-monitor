import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { EventForm } from "@/components/admin/event-form";
import { emptyEventFormValues, listExerciseOptions } from "@/lib/events";
import { currentSourceOptions, listSources } from "@/lib/sources";
import { createEventAction } from "../actions";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Add event" };

export default async function NewEventPage() {
  await requireAdminPage();
  await connection();
  const [sources, exercises] = await Promise.all([
    listSources(),
    listExerciseOptions(),
  ]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/events" label="Back to events" />
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
            source_label: "",
            social: "",
            social_account: "",
            relationship: "SUPPORTS",
            excerpt: "",
          },
        ]}
        initialPrimaryIndex={0}
        sourceOptions={currentSourceOptions(sources, [], { allowLiveStatement: true }).map((s) => ({ id: s.id, name: s.name }))}
        exerciseOptions={exercises}
      />
    </section>
  );
}
