/** Cookie name for the Phase-1 admin session stub. Full auth lands with admin features. */
export const ADMIN_SESSION_COOKIE = "nfm_admin_session";

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is not set. Set it in .env.local (see .env.example) before starting the server.",
    );
  }
  return password;
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return token === getAdminPassword();
}
