import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { HistoricalForm } from "@/components/historical/historical-form";
import { requireAdminPage } from "@/lib/admin-session";
import {
  getHistoricalEvent,
  historicalFormValuesFromEvent,
  historicalSourceFormRows,
  listHistoricalEventSources,
  listHistoricalSourceOptions,
} from "@/lib/historical";
import { getReviewerName } from "@/lib/reviewer";
import { updateHistoricalAction } from "../../actions";

export const metadata = { title: "Edit historical event" };

export default async function EditHistoricalPage({ params }: PageProps<"/admin/historical/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const [event, sources, sourceOptions, reviewerDefault] = await Promise.all([
    getHistoricalEvent(id),
    listHistoricalEventSources(id),
    listHistoricalSourceOptions(),
    getReviewerName(),
  ]);
  if (!event) notFound();

  const back = `/admin/historical/${id}`;
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href={back} label="Back to review" />
      <p className="meta-label mb-2">Admin · historical</p>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Edit historical event</h1>
      {event.review_status === "PUBLISHED" ? (
        <p className="mb-6 max-w-2xl text-sm text-text-secondary">
          This item is published. Changes go live when saved and are logged as an edit.
        </p>
      ) : null}
      <HistoricalForm
        action={updateHistoricalAction.bind(null, id)}
        initialValues={historicalFormValuesFromEvent(event)}
        initialSources={historicalSourceFormRows(sources)}
        initialPrimaryIndex={Math.max(0, sources.findIndex((s) => s.is_primary))}
        sourceOptions={sourceOptions}
        reviewerDefault={reviewerDefault}
        submitLabel="Save changes"
        cancelHref={back}
      />
    </section>
  );
}
