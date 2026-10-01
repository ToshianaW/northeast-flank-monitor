"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import {
  createDigest,
  digestFormValuesFrom,
  updateDigest,
  validateDigest,
  type DigestFormErrors,
  type DigestFormValues,
  type DigestInput,
} from "@/lib/digests";
import { isUniqueViolation } from "@/lib/sources";

export type DigestFormState = {
  values?: DigestFormValues;
  errors?: DigestFormErrors;
  formError?: string;
};

async function save(
  formData: FormData,
  write: (input: DigestInput) => Promise<unknown>,
): Promise<DigestFormState> {
  await requireAdmin();

  const values = digestFormValuesFrom(formData);
  const result = validateDigest(values);
  if (!result.ok) return { values, errors: result.errors };

  try {
    await write(result.input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        values,
        errors: { digest_date: "A digest for this date already exists." },
      };
    }
    console.error("Saving digest failed", error);
    return { values, formError: "Could not save the digest. Try again." };
  }

  revalidatePath("/digest", "layout");
  revalidatePath("/admin/digests");
  redirect("/admin/digests?saved=1");
}

export async function createDigestAction(
  _prev: DigestFormState,
  formData: FormData,
): Promise<DigestFormState> {
  return save(formData, createDigest);
}

export async function updateDigestAction(
  id: string,
  _prev: DigestFormState,
  formData: FormData,
): Promise<DigestFormState> {
  return save(formData, async (input) => {
    const updated = await updateDigest(id, input);
    if (!updated) throw new Error(`Digest ${id} not found`);
  });
}
