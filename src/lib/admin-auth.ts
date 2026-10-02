// Shared by proxy.ts, next.config.ts, and server code, so it uses Web Crypto and no Next.js APIs.

/** Signed session token. Renamed from nfm_admin_session, which held the raw password at path "/". */
export const ADMIN_SESSION_COOKIE = "nfm_admin_token";
export const LEGACY_ADMIN_SESSION_COOKIE = "nfm_admin_session";

export const ADMIN_COOKIE_PATH = "/admin";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Must match the values in .env.example, which is public. */
export const ADMIN_PASSWORD_PLACEHOLDER = "replace-with-a-strong-password";
export const SESSION_SECRET_PLACEHOLDER = "replace-with-at-least-32-random-characters";
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const SESSION_SECRET_MIN_LENGTH = 32;

export function adminPasswordError(value: string | undefined): string | null {
  if (!value) {
    return "ADMIN_PASSWORD is not set. Set it in .env.local (see .env.example) before starting the server.";
  }
  if (value === ADMIN_PASSWORD_PLACEHOLDER) {
    return "ADMIN_PASSWORD is still the public placeholder from .env.example. Set a real password in .env.local.";
  }
  if (value.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function sessionSecretError(value: string | undefined): string | null {
  if (!value) {
    return "SESSION_SECRET is not set. Set it in .env.local (see .env.example) before starting the server.";
  }
  if (value === SESSION_SECRET_PLACEHOLDER) {
    return "SESSION_SECRET is still the public placeholder from .env.example. Generate a random one.";
  }
  if (value.length < SESSION_SECRET_MIN_LENGTH) {
    return `SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} random characters.`;
  }
  return null;
}

/** First configuration problem, or null. The startup check in next.config.ts doesn't run on Vercel, so callers check again. */
export function adminConfigError(): string | null {
  return (
    adminPasswordError(process.env.ADMIN_PASSWORD) ??
    sessionSecretError(process.env.SESSION_SECRET)
  );
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Token is `<random>.<expiry ms>.<HMAC-SHA256 of the first two parts>`, all base64url or digits. */
export async function createSessionToken(
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload = `${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [random, expiry, signature] = parts;
  if (!/^[A-Za-z0-9_-]{43}$/.test(random) || !/^\d{1,15}$/.test(expiry)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  if (Number(expiry) <= now) return false;
  // subtle.verify compares in constant time.
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${random}.${expiry}`),
  );
}

/** Fails closed: a missing or weak ADMIN_PASSWORD or SESSION_SECRET means no session is valid. */
export async function isValidAdminSession(token: string | undefined): Promise<boolean> {
  if (adminConfigError()) return false;
  return verifySessionToken(token, process.env.SESSION_SECRET as string);
}
