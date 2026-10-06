"use server";

import { revalidatePath } from "next/cache";
import { autoLinkEvent } from "@/lib/historical-references";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { CONFIDENCE_LEVEL_VALUES, type ConfidenceLevel } from "@/lib/event-labels";
import { getEvent } from "@/lib/events";
import {
  approveEvent,
  mergeEventInto,
  rejectEvent,
  searchMergeTargets,
  submitForReview,
  type MergeTargetMatch,
} from "@/lib/review";
import {
  requireReviewerName,
  reviewerFromForm,
  REVIEWER_NAME_COOKIE,
} from "@/lib/reviewer";
import { cookies } from "next/headers";

async function persistReviewer(name: string) {
  const store = await cookies();
  store.set(REVIEWER_NAME_COOKIE, name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

function reviewerOrError(formData: FormData): { name: string } | { error: string } {
  const name = reviewerFromForm(formData);
  const err = requireReviewerName(name);
  if (err) return { error: err };
  return { name };
}

export type ReviewActionState = { error?: string; ok?: boolean };

export async function submitForReviewAction(
  eventId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const reviewer = reviewerOrError(formData);
  if ("error" in reviewer) return { error: reviewer.error };

  const result = await submitForReview(eventId);
  if (!result.ok) return { error: result.error };

  await persistReviewer(reviewer.name);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${eventId}`);
  redirect("/admin/review?submitted=1");
}

export async function approveEventAction(
  eventId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const reviewer = reviewerOrError(formData);
  if ("error" in reviewer) return { error: reviewer.error };

  const confidence = String(formData.get("confidence_level") ?? "");
  if (!CONFIDENCE_LEVEL_VALUES.includes(confidence as ConfidenceLevel)) {
    return { error: "Choose a confidence level." };
  }

  const breaking = formData.get("x_breaking") === "on";
  const result = await approveEvent(eventId, reviewer.name, confidence as ConfidenceLevel, breaking);
  if (!result.ok) return { error: result.error };

  // Automatic "similar in nature" links (same type AND country; no model). A failure here never
  // undoes the approval; the backfill script can fill the links later. Counts only.
  try {
    const linked = await autoLinkEvent(eventId);
    console.log(`historical references: ${linked} linked automatically`);
  } catch (error) {
    console.error(`historical references: automatic linking failed (${(error as { code?: string }).code ?? "error"})`);
  }

  await persistReviewer(reviewer.name);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${eventId}`);
  redirect("/admin/review?approved=1");
}

export async function rejectEventAction(
  eventId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const reviewer = reviewerOrError(formData);
  if ("error" in reviewer) return { error: reviewer.error };

  const reason = String(formData.get("reject_reason") ?? "");
  const result = await rejectEvent(eventId, reviewer.name, reason);
  if (!result.ok) return { error: result.error };

  await persistReviewer(reviewer.name);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${eventId}`);
  redirect("/admin/review?rejected=1");
}

export async function mergeEventAction(
  eventId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  await requireAdmin();
  const reviewer = reviewerOrError(formData);
  if ("error" in reviewer) return { error: reviewer.error };

  const targetEventId = String(formData.get("target_event_id") ?? "").trim();
  const result = await mergeEventInto(eventId, targetEventId, reviewer.name);
  if (!result.ok) return { error: result.error };

  await persistReviewer(reviewer.name);
  revalidatePath("/admin/review");
  revalidatePath(`/admin/review/${eventId}`);
  redirect("/admin/review?merged=1");
}

/**
 * Merge target search for the review page (headline, summary and source excerpts). A published
 * event can only be merged into another published one, so only those are offered for it.
 */
export async function searchMergeTargetsAction(eventId: string, query: string): Promise<MergeTargetMatch[]> {
  await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return [];
  return searchMergeTargets(eventId, query, { publishedOnly: event.review_status === "PUBLISHED" });
}
