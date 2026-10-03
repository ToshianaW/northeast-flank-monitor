import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { HistoricalForm } from "@/components/historical/historical-form";
import { requireAdminPage } from "@/lib/admin-session";
import { emptyHistoricalFormValues, listHistoricalSourceOptions } from "@/lib/historical";
import { getReviewerName } from "@/lib/reviewer";
import { createHistoricalAction } from "../actions";

export const metadata = { title: "Add historical event" };

export default async function NewHistoricalPage() {
  await requireAdminPage();
  await connection();
  const [sourceOptions, reviewerDefault] = await Promise.all([listHistoricalSourceOptions(), getReviewerName()]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/historical" label="Back to historical" />
      <p className="meta-label mb-2">Admin · historical</p>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Add historical event</h1>
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Saved as a draft in the historical review queue. Dates must come from the sources you attach.
      </p>
      <HistoricalForm
        action={createHistoricalAction}
        initialValues={emptyHistoricalFormValues()}
        initialSources={[]}
        initialPrimaryIndex={0}
        sourceOptions={sourceOptions}
        reviewerDefault={reviewerDefault}
        submitLabel="Save draft"
        cancelHref="/admin/historical"
      />
    </section>
  );
}
