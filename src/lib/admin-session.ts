import "server-only";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";

/** Server Actions are reachable by direct POST, so each one checks the session itself. */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  if (!isValidAdminSession(store.get(ADMIN_SESSION_COOKIE)?.value)) {
    throw new Error("Unauthorized");
  }
}
