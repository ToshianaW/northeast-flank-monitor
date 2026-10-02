import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_PATH,
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  isValidAdminSession,
  LEGACY_ADMIN_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/admin-auth";

async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminSession(store.get(ADMIN_SESSION_COOKIE)?.value);
}

/** Server Actions are reachable by direct POST, so each one checks the session itself. */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) throw new Error("Unauthorized");
}

/** Pages check too, so a proxy misconfiguration can't expose them. */
export async function requireAdminPage(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}

/** Hashing first gives equal-length buffers, so the comparison time doesn't depend on the input. */
export function adminPasswordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: ADMIN_COOKIE_PATH,
} as const;

export async function startAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(
    ADMIN_SESSION_COOKIE,
    await createSessionToken(process.env.SESSION_SECRET as string),
    { ...cookieOptions, maxAge: SESSION_MAX_AGE_SECONDS },
  );
  // Clear the old raw-password cookie from browsers that still hold it.
  store.set(LEGACY_ADMIN_SESSION_COOKIE, "", { ...cookieOptions, path: "/", maxAge: 0 });
}
