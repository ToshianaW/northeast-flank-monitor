import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { DigestForm } from "@/components/admin/digest-form";
import { DIGEST_SECTIONS, emptyDigestFormValues } from "@/lib/digests";
import { createDigestAction } from "../actions";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Add digest" };

export default async function NewDigestPage() {
  await requireAdminPage();
  // The date defaults to today, so render per request.
  await connection();
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/digests" label="Back to digests" />
      <p className="meta-label mb-2">Admin · digests</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Add digest</h1>
      <DigestForm
        action={createDigestAction}
        submitLabel="Save digest"
        initialValues={emptyDigestFormValues()}
        sections={DIGEST_SECTIONS}
      />
    </section>
  );
}
