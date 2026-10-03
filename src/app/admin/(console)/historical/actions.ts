"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { CONFIDENCE_LEVEL_VALUES, type ConfidenceLevel } from "@/lib/event-labels";
import {
  approveHistoricalEvent,
  createHistoricalEvent,
  historicalFormValuesFrom,
  historicalSourceRowsFrom,
  rejectHistoricalEvent,
  unpublishHistoricalEvent,
  updateHistoricalEvent,
  validateHistoricalForm,
  type HistoricalFormErrors,
  type HistoricalFormValues,
  type HistoricalSourceFormRow,
  type WriteResult,
} from "@/lib/historical";
import { rememberReviewerName, requireReviewerName, reviewerFromForm } from "@/lib/reviewer";

export type HistoricalFormState = {
  values?: HistoricalFormValues;
  sources?: HistoricalSourceFormRow[];
  primaryIndex?: number;
  reviewer?: string;
  errors?: HistoricalFormErrors;
  formError?: string;
};

export type HistoricalActionState = { error?: string };

function revalidateAll(id?: string) {
  revalidatePath("/admin/historical");
  revalidatePath("/historical");
  if (id) {
    revalidatePath(`/admin/historical/${id}`);
    revalidatePath(`/historical/${id}`);
  }
}

async function save(
  formData: FormData,
  write: (payload: Parameters<typeof createHistoricalEvent>[0], reviewer: string) => Promise<WriteResult>,
): Promise<HistoricalFormState> {
  await requireAdmin();
  const values = historicalFormValuesFrom(formData);
  const sources = historicalSourceRowsFrom(formData);
  const primaryIndex = Number.parseInt(String(formData.get("hs_primary_index") ?? "0"), 10) || 0;
  const reviewer = reviewerFromForm(formData);
  const state = { values, sources, primaryIndex, reviewer };

  const reviewerError = requireReviewerName(reviewer);
  const result = await validateHistoricalForm(values, sources, primaryIndex);
  if (reviewerError || !result.ok) {
    return { ...state, errors: { ...(result.ok ? {} : result.errors), ...(reviewerError ? { reviewer: reviewerError } : {}) } };
  }

  let written: WriteResult;
  try {
    written = await write(result.payload, reviewer);
  } catch (error) {
    console.error("Saving historical event failed", error);
    return { ...state, formError: "Could not save the historical event. Try again." };
  }
  if (!written.ok) return { ...state, formError: written.error };

  await rememberReviewerName(reviewer);
  revalidateAll(written.id);
  redirect(`/admin/historical/${written.id}?saved=1`);
}

export async function createHistoricalAction(
  _prev: HistoricalFormState,
  formData: FormData,
): Promise<HistoricalFormState> {
  return save(formData, createHistoricalEvent);
}

export async function updateHistoricalAction(
  id: string,
  _prev: HistoricalFormState,
  formData: FormData,
): Promise<HistoricalFormState> {
  return save(formData, (payload, reviewer) => updateHistoricalEvent(id, payload, reviewer));
}

async function statusAction(
  id: string,
  formData: FormData,
  run: (reviewer: string) => Promise<WriteResult>,
  done: string,
): Promise<HistoricalActionState> {
  await requireAdmin();
  const reviewer = reviewerFromForm(formData);
  const reviewerError = requireReviewerName(reviewer);
  if (reviewerError) return { error: reviewerError };

  const result = await run(reviewer);
  if (!result.ok) return { error: result.error };

  await rememberReviewerName(reviewer);
  revalidateAll(id);
  redirect(`/admin/historical/${id}?${done}=1`);
}

export async function approveHistoricalAction(
  id: string,
  _prev: HistoricalActionState,
  formData: FormData,
): Promise<HistoricalActionState> {
  const confidence = String(formData.get("confidence_level") ?? "");
  if (!CONFIDENCE_LEVEL_VALUES.includes(confidence as ConfidenceLevel)) {
    return { error: "Choose a confidence level." };
  }
  return statusAction(
    id,
    formData,
    (reviewer) => approveHistoricalEvent(id, reviewer, confidence as ConfidenceLevel),
    "approved",
  );
}

export async function rejectHistoricalAction(
  id: string,
  _prev: HistoricalActionState,
  formData: FormData,
): Promise<HistoricalActionState> {
  const reason = String(formData.get("reason") ?? "");
  return statusAction(id, formData, (reviewer) => rejectHistoricalEvent(id, reviewer, reason), "rejected");
}

export async function unpublishHistoricalAction(
  id: string,
  _prev: HistoricalActionState,
  formData: FormData,
): Promise<HistoricalActionState> {
  const reason = String(formData.get("reason") ?? "");
  return statusAction(id, formData, (reviewer) => unpublishHistoricalEvent(id, reviewer, reason), "unpublished");
}
