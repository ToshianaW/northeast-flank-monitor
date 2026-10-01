import { SourceForm } from "@/components/admin/source-form";
import { createSourceAction } from "../actions";

export const metadata = { title: "Add source" };

export default function NewSourcePage() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <p className="meta-label mb-2">Admin · source registry</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Add source</h1>
      <SourceForm
        action={createSourceAction}
        submitLabel="Add source"
        initialValues={{
          name: "",
          home_url: "",
          source_type: "UNKNOWN",
          source_country: "",
          source_language: "",
          reliability: "UNRATED",
          tier: "",
          notes: "",
        }}
      />
    </section>
  );
}
