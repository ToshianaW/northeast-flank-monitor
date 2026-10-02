import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { DigestForm } from "@/components/admin/digest-form";
import {
  DIGEST_SECTIONS,
  digestFormValuesFromDigest,
  getDigest,
} from "@/lib/digests";
import { updateDigestAction } from "../../actions";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Edit digest" };

export default async function EditDigestPage({
  params,
}: PageProps<"/admin/digests/[id]/edit">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const digest = await getDigest(id);
  if (!digest) notFound();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/digests" label="Back to digests" />
      <p className="meta-label mb-2">Admin · digests</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit digest</h1>
      <DigestForm
        action={updateDigestAction.bind(null, digest.id)}
        submitLabel="Save changes"
        initialValues={digestFormValuesFromDigest(digest)}
        sections={DIGEST_SECTIONS}
      />
    </section>
  );
}
