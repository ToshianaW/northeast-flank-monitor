"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  createSource,
  formValuesFrom,
  isUniqueViolation,
  updateSource,
  validateSource,
  type SourceField,
  type SourceFormValues,
} from "@/lib/sources";

export type SourceFormState = {
  values?: SourceFormValues;
  errors?: Partial<Record<SourceField, string>>;
  formError?: string;
};

async function save(
  formData: FormData,
  write: (input: Parameters<typeof createSource>[0]) => Promise<unknown>,
): Promise<SourceFormState> {
  await requireAdmin();

  const values = formValuesFrom(formData);
  const result = validateSource(values);
  if (!result.ok) return { values, errors: result.errors };

  try {
    await write(result.input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        values,
        errors: { name: "A source with this name already exists." },
      };
    }
    console.error("Saving source failed", error);
    return { values, formError: "Could not save the source. Try again." };
  }

  revalidatePath("/sources");
  revalidatePath("/admin/sources");
  redirect("/admin/sources?saved=1");
}

export async function createSourceAction(
  _prev: SourceFormState,
  formData: FormData,
): Promise<SourceFormState> {
  return save(formData, createSource);
}

export async function updateSourceAction(
  id: string,
  _prev: SourceFormState,
  formData: FormData,
): Promise<SourceFormState> {
  return save(formData, async (input) => {
    const updated = await updateSource(id, input);
    if (!updated) throw new Error(`Source ${id} not found`);
  });
}
