/** Cookie name for the Phase-1 admin session stub. Full auth lands with admin features. */
export const ADMIN_SESSION_COOKIE = "nfm_admin_session";

/** Must match the value in .env.example, which is public. */
export const ADMIN_PASSWORD_PLACEHOLDER = "replace-with-a-strong-password";

export function adminPasswordError(value: string | undefined): string | null {
  if (!value) {
    return "ADMIN_PASSWORD is not set. Set it in .env.local (see .env.example) before starting the server.";
  }
  if (value === ADMIN_PASSWORD_PLACEHOLDER) {
    return "ADMIN_PASSWORD is still the public placeholder from .env.example. Set a real password in .env.local.";
  }
  return null;
}

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  const error = adminPasswordError(password);
  if (error) throw new Error(error);
  return password as string;
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return token === getAdminPassword();
}
