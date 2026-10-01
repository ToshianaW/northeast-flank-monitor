"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  createEvent,
  eventFormValuesFrom,
  eventSourceRowsFromFormData,
  getEvent,
  updateEvent,
  validateEventForm,
  type EventFormErrors,
  type EventFormValues,
  type EventSourceFormRow,
  type EventWritePayload,
} from "@/lib/events";
import { logEditReviewAction, payloadHasSupportsSource } from "@/lib/review";
import {
  requireReviewerName,
  reviewerFromForm,
} from "@/lib/reviewer";

export type EventFormState = {
  values?: EventFormValues;
  sources?: EventSourceFormRow[];
  primaryIndex?: number;
  errors?: EventFormErrors;
  formError?: string;
};

function stateFromForm(formData: FormData): Pick<
  EventFormState,
  "values" | "sources" | "primaryIndex"
> {
  const primaryRaw = String(formData.get("es_primary_index") ?? "");
  const primaryIndex =
    primaryRaw === "" ? 0 : Number.parseInt(primaryRaw, 10);
  return {
    values: eventFormValuesFrom(formData),
    sources: eventSourceRowsFromFormData(formData),
    primaryIndex: Number.isNaN(primaryIndex) ? 0 : primaryIndex,
  };
}

async function saveEvent(
  formData: FormData,
  write: (payload: EventWritePayload) => Promise<void>,
  validateOptions: Parameters<typeof validateEventForm>[1] & {
    humanReviewed: boolean;
  },
  redirectTo?: string,
): Promise<EventFormState> {
  await requireAdmin();

  const result = await validateEventForm(formData, validateOptions);
  if (!result.ok) {
    return { ...stateFromForm(formData), errors: result.errors };
  }

  if (
    validateOptions.preserveReviewStatus === "PUBLISHED" &&
    !payloadHasSupportsSource(result.payload)
  ) {
    return {
      ...stateFromForm(formData),
      formError:
        "Cannot save: published events must keep at least one supporting source (relationship SUPPORTS).",
    };
  }

  try {
    await write(result.payload);
  } catch (error) {
    console.error("Saving event failed", error);
    return {
      ...stateFromForm(formData),
      formError: "Could not save the event. Try again.",
    };
  }

  revalidatePath("/admin/events");
  revalidatePath("/admin/review");
  redirect(redirectTo ?? "/admin/events?saved=1");
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  return saveEvent(
    formData,
    async (payload) => {
      await createEvent(payload);
    },
    { humanReviewed: false },
  );
}

export async function updateEventAction(
  id: string,
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdmin();
  const existing = await getEvent(id);
  if (!existing) {
    return { formError: "Event not found." };
  }

  const fromReview = formData.get("fromReview") === "1";
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  let reviewerForEdit: string | null = null;
  if (fromReview) {
    reviewerForEdit = reviewerFromForm(formData);
    const reviewerError = requireReviewerName(reviewerForEdit);
    if (reviewerError) {
      return { ...stateFromForm(formData), formError: reviewerError };
    }
  }

  return saveEvent(
    formData,
    async (payload) => {
      if (fromReview && reviewerForEdit) {
        await logEditReviewAction(existing, reviewerForEdit);
      }
      const updated = await updateEvent(id, payload, existing.review_status);
      if (!updated) throw new Error(`Event ${id} not found`);
    },
    {
      preserveReviewStatus: existing.review_status,
      humanReviewed: existing.human_reviewed,
    },
    fromReview && returnTo.startsWith("/admin/") ? returnTo : undefined,
  );
}
