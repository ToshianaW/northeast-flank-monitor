import "server-only";
import { cookies } from "next/headers";

export const REVIEWER_NAME_COOKIE = "nfm_reviewer_name";

export async function getReviewerName(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(REVIEWER_NAME_COOKIE)?.value?.trim();
  return value || null;
}

export function reviewerFromForm(formData: FormData): string {
  return String(formData.get("reviewer") ?? "").trim();
}

export function requireReviewerName(name: string): string | null {
  if (!name) return "Enter your reviewer name.";
  if (name.length > 120) return "Keep the reviewer name under 120 characters.";
  return null;
}

/** Remembers the reviewer name for the next form (same cookie the review queue sets). */
export async function rememberReviewerName(name: string): Promise<void> {
  const store = await cookies();
  store.set(REVIEWER_NAME_COOKIE, name, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}
