"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfigError } from "@/lib/admin-auth";
import { adminPasswordMatches, startAdminSession } from "@/lib/admin-session";
import {
  clearLoginFailures,
  clientIp,
  hashClientIp,
  isLoginLocked,
  LOCKOUT_MESSAGE,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

export type LoginState = { error: string } | null;

const UNAVAILABLE = "Sign-in is unavailable.";

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Generic on purpose: never reveal which setting is missing to an anonymous visitor.
  if (adminConfigError()) return { error: UNAVAILABLE };

  // Nothing here logs the password or the IP; only the keyed hash reaches the database.
  const ipHash = hashClientIp(clientIp(await headers()), process.env.SESSION_SECRET as string);
  try {
    // Checked before the password, so a locked-out client learns nothing about it.
    if (await isLoginLocked(ipHash)) return { error: LOCKOUT_MESSAGE };

    const password = String(formData.get("password") ?? "");
    if (!adminPasswordMatches(password)) {
      await recordLoginFailure(ipHash);
      return { error: "Invalid password." };
    }
    await clearLoginFailures(ipHash);
  } catch {
    // Fail closed if the rate-limit store is unreachable.
    return { error: UNAVAILABLE };
  }

  await startAdminSession();
  redirect("/admin");
}
