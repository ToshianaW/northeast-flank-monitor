import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { ExerciseForm } from "@/components/admin/exercise-form";
import { requireAdminPage } from "@/lib/admin-session";
import { emptyExerciseFormValues } from "@/lib/exercises";
import { getReviewerName } from "@/lib/reviewer";
import { listSources } from "@/lib/sources";
import { createExerciseAction } from "../actions";

export const metadata = { title: "Add exercise" };

export default async function NewExercisePage() {
  await requireAdminPage();
  await connection();
  const [sources, reviewerDefault] = await Promise.all([listSources(), getReviewerName()]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/exercises" label="Back to exercises" />
      <p className="meta-label mb-2">Admin · exercises</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Add exercise</h1>
      <ExerciseForm
        action={createExerciseAction}
        submitLabel="Add exercise"
        initialValues={emptyExerciseFormValues()}
        initialSources={[]}
        initialPrimaryIndex={0}
        sourceOptions={sources.map((s) => ({ id: s.id, name: s.name }))}
        reviewerDefault={reviewerDefault}
      />
    </section>
  );
}
