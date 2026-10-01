/** Cookie name for the Phase-1 admin session stub. Full auth lands with admin features. */
export const ADMIN_SESSION_COOKIE = "nfm_admin_session";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "changeme";
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return token === getAdminPassword();
}
