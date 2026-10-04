"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { exerciseConstraintMessage, lastEvidenceError } from "@/lib/exercise-rules";
import {
  createExercise,
  exerciseFormValuesFrom,
  exerciseSourceRowsFromFormData,
  getExercise,
  updateExercise,
  updateExerciseLinks,
  validateExerciseForm,
  type ExerciseFormErrors,
  type ExerciseFormValues,
  type ExerciseSourceFormRow,
} from "@/lib/exercises";
import {
  rememberReviewerName,
  requireReviewerName,
  reviewerFromForm,
} from "@/lib/reviewer";

export type ExerciseFormState = {
  values?: ExerciseFormValues;
  sources?: ExerciseSourceFormRow[];
  primaryIndex?: number;
  reviewer?: string;
  errors?: ExerciseFormErrors;
  formError?: string;
};

function stateFromForm(formData: FormData): ExerciseFormState {
  const primaryIndex = Number.parseInt(String(formData.get("xs_primary_index") ?? "0"), 10);
  return {
    values: exerciseFormValuesFrom(formData),
    sources: exerciseSourceRowsFromFormData(formData),
    primaryIndex: Number.isNaN(primaryIndex) ? 0 : primaryIndex,
    reviewer: reviewerFromForm(formData),
  };
}

function revalidateExercisePaths(id?: string) {
  revalidatePath("/admin/exercises");
  revalidatePath("/exercises");
  revalidatePath("/");
  if (id) revalidatePath(`/exercises/${id}`);
}

async function saveExercise(
  formData: FormData,
  exerciseId: string | undefined,
): Promise<ExerciseFormState> {
  await requireAdmin();

  const reviewer = reviewerFromForm(formData);
  const reviewerError = requireReviewerName(reviewer);
  if (reviewerError) return { ...stateFromForm(formData), formError: reviewerError };

  const result = await validateExerciseForm(formData, exerciseId);
  if (!result.ok) {
    return { ...stateFromForm(formData), errors: result.errors, formError: result.formError };
  }

  let savedId: string;
  try {
    if (exerciseId) {
      const updated = await updateExercise(exerciseId, result.payload, reviewer);
      if (!updated) return { formError: "Exercise not found." };
      savedId = exerciseId;
    } else {
      savedId = await createExercise(result.payload, reviewer);
    }
  } catch (error) {
    const message = exerciseConstraintMessage(error);
    if (!message) console.error("Saving exercise failed", error);
    return {
      ...stateFromForm(formData),
      formError: message ?? "Could not save the exercise. Try again.",
    };
  }

  await rememberReviewerName(reviewer);
  revalidateExercisePaths(savedId);
  redirect(`/admin/exercises/${savedId}/edit?saved=1`);
}

export async function createExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  return saveExercise(formData, undefined);
}

export async function updateExerciseAction(
  id: string,
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  return saveExercise(formData, id);
}

export type ExerciseLinksState = { error?: string };

export async function updateExerciseLinksAction(
  exerciseId: string,
  _prev: ExerciseLinksState,
  formData: FormData,
): Promise<ExerciseLinksState> {
  await requireAdmin();
  const reviewer = reviewerFromForm(formData);
  const reviewerError = requireReviewerName(reviewer);
  if (reviewerError) return { error: reviewerError };

  const unlinkIds = formData.getAll("unlink").map(String);
  const linkId = String(formData.get("link") ?? "").trim();
  const linkIds = linkId ? [linkId] : [];
  if (linkIds.length === 0 && unlinkIds.length === 0) {
    return { error: "Choose an event to link, or tick one to unlink." };
  }

  try {
    const result = await updateExerciseLinks(exerciseId, linkIds, unlinkIds, reviewer);
    if (!result.ok) return { error: result.error };
  } catch (error) {
    if (exerciseConstraintMessage(error)) {
      const exercise = await getExercise(exerciseId);
      return { error: lastEvidenceError(exercise?.exercise_name ?? "this exercise") };
    }
    console.error("Updating exercise links failed", error);
    return { error: "Could not update the linked events. Try again." };
  }

  await rememberReviewerName(reviewer);
  revalidateExercisePaths(exerciseId);
  revalidatePath("/admin/events");
  redirect(`/admin/exercises/${exerciseId}/edit?linked=1`);
}
