import { notFound } from "next/navigation";
import { BackLink } from "@/components/admin/back-link";
import { SourceForm } from "@/components/admin/source-form";
import { formValuesFromSource, getSource } from "@/lib/sources";
import { updateSourceAction } from "../../actions";

export const metadata = { title: "Edit source" };

export default async function EditSourcePage({
  params,
}: PageProps<"/admin/sources/[id]/edit">) {
  const { id } = await params;
  const source = await getSource(id);
  if (!source) notFound();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/sources" label="Back to sources" />
      <p className="meta-label mb-2">Admin · source registry</p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Edit source</h1>
      <p className="mb-6 font-mono text-xs text-text-muted">ID {source.id}</p>
      <SourceForm
        action={updateSourceAction.bind(null, source.id)}
        submitLabel="Save changes"
        initialValues={formValuesFromSource(source)}
      />
    </section>
  );
}
