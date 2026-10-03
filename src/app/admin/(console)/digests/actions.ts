"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { collectDigestRefs } from "@/lib/digest-refs";
import {
  checkAiDigestSections,
  createDigest,
  digestFormValuesFrom,
  findUnpublishedEventIds,
  getDigest,
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
  options: { aiDrafted: boolean } = { aiDrafted: false },
): Promise<DigestFormState> {
  await requireAdmin();

  const values = digestFormValuesFrom(formData);
  const result = validateDigest(values);
  if (!result.ok) return { values, errors: result.errors };

  if (options.aiDrafted) {
    const errors = checkAiDigestSections(result.input.sections);
    if (Object.keys(errors).length > 0) return { values, errors };
  }
  const unpublished = await findUnpublishedEventIds(
    collectDigestRefs(Object.values(result.input.sections)),
  );
  if (unpublished.length > 0) {
    return {
      values,
      formError: `${unpublished.length} [ref …] marker id(s) are not published events: ${unpublished.join(", ")}. Remove those sentences or fix the ids.`,
    };
  }

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
  await requireAdmin();
  const existing = await getDigest(id);
  return save(
    formData,
    async (input) => {
      const updated = await updateDigest(id, input);
      if (!updated) throw new Error(`Digest ${id} not found`);
    },
    { aiDrafted: existing?.meta?.generator === "ai" },
  );
}
