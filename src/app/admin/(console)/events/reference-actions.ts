"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { anthropicSuggestCall, suggestReferences } from "@/lib/historical-reference-suggest";
import {
  getPublishedHistoricalFields,
  getSuggestionEvent,
  linkReference,
  referencesTableExists,
  shortlistHistorical,
  unlinkReference,
} from "@/lib/historical-references";
import {
  encodeSuggestions,
  isReferenceAttribute,
  verifiedAttributes,
  type ReferenceMessage,
} from "@/lib/historical-references-rules";
import { rememberReviewerName, requireReviewerName, reviewerFromForm } from "@/lib/reviewer";

function back(eventId: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/admin/events/${eventId}/edit?${qs}#historical-references`);
}

function done(eventId: string, message: ReferenceMessage, extra: Record<string, string> = {}): never {
  back(eventId, { refsMessage: message, ...extra });
}

/** One model call (Haiku 4.5, capped per click); suggestions come back in the URL for review. */
export async function suggestReferencesAction(eventId: string): Promise<void> {
  await requireAdmin();
  if (!(await referencesTableExists())) done(eventId, "NOT_APPLIED");
  const current = await getSuggestionEvent(eventId);
  if (!current || current.review_status !== "PUBLISHED") done(eventId, "NOT_PUBLISHED");
  const shortlist = await shortlistHistorical(eventId, current!);
  const result = await suggestReferences({ current: current!, shortlist, call: anthropicSuggestCall });
  // Counts and codes only.
  console.log(
    `historical references: ${result.ok ? `${result.suggestions.length} suggested from ${result.shortlistSize}` : result.status} · cost $${result.costUsd.toFixed(4)}`,
  );
  if (!result.ok) done(eventId, result.status);
  if (result.suggestions.length === 0) done(eventId, "NONE_SUGGESTED");
  done(eventId, "SUGGESTED", { refs: encodeSuggestions(result.suggestions) });
}

/** A person approves each reference; attributes are checked again by code before saving. */
export async function approveReferencesAction(eventId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const reviewer = reviewerFromForm(formData);
  if (requireReviewerName(reviewer)) done(eventId, "REVIEWER");
  const current = await getSuggestionEvent(eventId);
  if (!current || current.review_status !== "PUBLISHED") done(eventId, "NOT_PUBLISHED");

  const ids = formData.getAll("ref").map(String);
  if (ids.length === 0) done(eventId, "NONE_SELECTED");
  let linked = 0;
  for (const id of ids) {
    const historical = await getPublishedHistoricalFields(id);
    if (!historical) continue;
    const attributes = verifiedAttributes(current!, historical, formData.getAll(`attr_${id}`).map(String).filter(isReferenceAttribute));
    if (attributes.length === 0) continue;
    try {
      await linkReference({ eventId, historicalEventId: id, attributes, reviewer });
      linked++;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23514") done(eventId, linked > 0 ? "PARTIAL_LIMIT" : "LIMIT"); // check_violation: the trigger
      if (code === "23505") continue; // already referenced
      throw error;
    }
  }
  await rememberReviewerName(reviewer);
  revalidatePath(`/events/${eventId}`);
  done(eventId, linked > 0 ? "LINKED" : "NONE_SELECTED");
}

export async function unlinkReferenceAction(eventId: string, historicalEventId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const reviewer = reviewerFromForm(formData);
  if (requireReviewerName(reviewer)) done(eventId, "REVIEWER");
  await unlinkReference({ eventId, historicalEventId, reviewer });
  await rememberReviewerName(reviewer);
  revalidatePath(`/events/${eventId}`);
  done(eventId, "UNLINKED");
}
