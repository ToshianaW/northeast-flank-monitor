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
import { approveReferencesAction, suggestReferencesAction, unlinkReferenceAction } from "../../reference-actions";
import { requireAdminPage } from "@/lib/admin-session";
import { ReferencePanel } from "@/components/historical/reference-panel";
import { aiSuggestEnabled } from "@/lib/historical-reference-suggest";
import {
  listPublishedHistoricalHeadlines,
  listReferencesForAdmin,
  referencesTableExists,
} from "@/lib/historical-references";
import { decodeSuggestions, referenceMessage } from "@/lib/historical-references-rules";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const { fromReview, refs, refsMessage, refsReason } = await searchParams;
  const fromReviewQueue = fromReview === "1";
  const returnTo = `/admin/review/${id}`;

  const [event, eventSources, sources, exercises, reviewerDefault, referencesApplied, references, savedReviewer] =
    await Promise.all([
      getEvent(id),
      listEventSources(id),
      listSources(),
      listExerciseOptions(),
      fromReviewQueue ? getReviewerName() : Promise.resolve(null),
      referencesTableExists(),
      listReferencesForAdmin(id),
      getReviewerName(),
    ]);

  if (!event) notFound();

  const suggested = decodeSuggestions(refs).filter(
    (s) => !references.some((r) => r.historical_event_id === s.historical_event_id),
  );
  const headlines = await listPublishedHistoricalHeadlines(suggested.map((s) => s.historical_event_id));
  const suggestions = suggested.flatMap((s) => {
    const h = headlines.get(s.historical_event_id);
    return h ? [{ ...s, headline: h.headline, event_date: h.event_date }] : [];
  });

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
      <ReferencePanel
        applied={referencesApplied}
        aiEnabled={aiSuggestEnabled()}
        published={event.review_status === "PUBLISHED"}
        references={references}
        suggestions={suggestions}
        message={referenceMessage(refsMessage, refsReason)}
        reviewerDefault={savedReviewer}
        suggestAction={suggestReferencesAction.bind(null, id)}
        approveAction={approveReferencesAction.bind(null, id)}
        unlinkAction={unlinkReferenceAction.bind(null, id)}
      />
    </section>
  );
}
