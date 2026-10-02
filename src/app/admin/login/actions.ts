"use server";

import { redirect } from "next/navigation";
import { adminConfigError } from "@/lib/admin-auth";
import { adminPasswordMatches, startAdminSession } from "@/lib/admin-session";

export type LoginState = { error: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Generic on purpose: never reveal which setting is missing to an anonymous visitor.
  if (adminConfigError()) return { error: "Sign-in is unavailable." };

  const password = String(formData.get("password") ?? "");
  if (!adminPasswordMatches(password)) return { error: "Invalid password." };

  await startAdminSession();
  redirect("/admin");
}
