import "server-only";
import { createHmac } from "node:crypto";
import { getPool } from "@/lib/db";

export const IP_MAX_FAILURES = 5;
export const IP_WINDOW_MINUTES = 15;
/** More than this many failures from all IPs within an hour locks everyone out. */
export const GLOBAL_MAX_FAILURES = 50;
export const GLOBAL_LOCKOUT_MINUTES = 15;

export const LOCKOUT_MESSAGE = "Too many sign-in attempts. Try again in 15 minutes.";

/**
 * Vercel overwrites x-forwarded-for and x-real-ip so clients can't spoof them, and
 * x-vercel-forwarded-for keeps the client IP even if another proxy sits in front of Vercel.
 * The fallbacks matter only off Vercel (local next start), where nothing here is trusted anyway.
 */
export function clientIp(headers: Headers): string {
  const raw =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for") ??
    "";
  return raw.split(",")[0].trim() || "unknown";
}

/** Keyed with SESSION_SECRET, so the stored value can't be reversed by hashing every IPv4 address. */
export function hashClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/** True when this IP or the whole site is locked out at time `at`. */
export async function isLoginLocked(ipHash: string, at: Date = new Date()): Promise<boolean> {
  const { rows: [row] } = await getPool().query<{ ip_failures: number; global_locked: boolean }>(
    `SELECT
       (SELECT count(*)::int FROM login_attempts
         WHERE ip_hash = $1
           AND attempted_at >  $2::timestamptz - make_interval(mins => $3)
           AND attempted_at <= $2::timestamptz) AS ip_failures,
       -- Locked while any failure in the last 15 minutes ended an hour with more than 50 failures.
       EXISTS (
         SELECT 1 FROM login_attempts a
          WHERE a.attempted_at >  $2::timestamptz - make_interval(mins => $4)
            AND a.attempted_at <= $2::timestamptz
            AND (SELECT count(*) FROM login_attempts b
                  WHERE b.attempted_at >  a.attempted_at - interval '1 hour'
                    AND b.attempted_at <= a.attempted_at) > $5
       ) AS global_locked`,
    [ipHash, at, IP_WINDOW_MINUTES, GLOBAL_LOCKOUT_MINUTES, GLOBAL_MAX_FAILURES],
  );
  return row.ip_failures >= IP_MAX_FAILURES || row.global_locked;
}

export async function recordLoginFailure(ipHash: string, at: Date = new Date()): Promise<void> {
  const pool = getPool();
  await pool.query(`INSERT INTO login_attempts (ip_hash, attempted_at) VALUES ($1, $2)`, [ipHash, at]);
  await pool.query(`DELETE FROM login_attempts WHERE attempted_at < $1::timestamptz - interval '1 day'`, [at]);
}

export async function clearLoginFailures(ipHash: string): Promise<void> {
  await getPool().query(`DELETE FROM login_attempts WHERE ip_hash = $1`, [ipHash]);
}
