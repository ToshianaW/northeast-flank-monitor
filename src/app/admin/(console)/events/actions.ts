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
): Promise<EventFormState> {
  await requireAdmin();

  const result = await validateEventForm(formData, validateOptions);
  if (!result.ok) {
    return { ...stateFromForm(formData), errors: result.errors };
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
  redirect("/admin/events?saved=1");
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

  return saveEvent(
    formData,
    async (payload) => {
      const updated = await updateEvent(id, payload, existing.review_status);
      if (!updated) throw new Error(`Event ${id} not found`);
    },
    {
      preserveReviewStatus: existing.review_status,
      humanReviewed: existing.human_reviewed,
    },
  );
}
