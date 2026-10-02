/**
 * Login rate limiting: 5 failures per IP in 15 minutes, and a 15-minute global lockout after
 * more than 50 failures in an hour.
 * Run: npm test   (needs DATABASE_URL_POOLED in .env.local and migration 0006. Uses throwaway
 * ip_hash values dated 2001, so live failures can't affect it and it can't lock anyone out;
 * deletes its rows afterwards)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { after, test } from "node:test";

if (!process.env.DATABASE_URL_POOLED && existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getPool } = await import("./db");
const { clearLoginFailures, clientIp, isLoginLocked, recordLoginFailure } = await import(
  "./login-rate-limit"
);

const prefix = `test-rate-limit-${randomUUID()}`;
const base = Date.UTC(2001, 0, 1);
const minutes = (n: number) => new Date(base + n * 60_000);

after(async () => {
  await getPool().query(`DELETE FROM login_attempts WHERE ip_hash LIKE $1`, [`${prefix}%`]);
  await getPool().end();
});

test("clientIp prefers Vercel's header and takes the first address", () => {
  const h = new Headers({
    "x-vercel-forwarded-for": "203.0.113.7",
    "x-forwarded-for": "198.51.100.1, 10.0.0.1",
  });
  assert.equal(clientIp(h), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("one IP is locked after 5 failures in 15 minutes, and unlocked when they age out", async () => {
  const ip = `${prefix}-ip`;
  for (let i = 0; i < 4; i++) await recordLoginFailure(ip, minutes(i));
  assert.equal(await isLoginLocked(ip, minutes(4)), false);
  await recordLoginFailure(ip, minutes(4));
  assert.equal(await isLoginLocked(ip, minutes(5)), true);
  // Another IP is unaffected.
  assert.equal(await isLoginLocked(`${prefix}-other`, minutes(5)), false);
  // The first failure leaves the window at minute 15.
  assert.equal(await isLoginLocked(ip, minutes(15)), false);
  await clearLoginFailures(ip);
  assert.equal(await isLoginLocked(ip, minutes(5)), false);
});

test("more than 50 failures across IPs in an hour locks everyone out for 15 minutes", async () => {
  const start = 120; // two hours after the per-IP case, so the windows don't overlap
  // 51 failures from 51 different IPs, one per minute.
  for (let i = 0; i < 51; i++) await recordLoginFailure(`${prefix}-g${i}`, minutes(start + i * 1));
  const last = start + 50;
  const fresh = `${prefix}-fresh`;
  assert.equal(await isLoginLocked(fresh, minutes(last - 1)), false, "50 failures is not a lockout");
  assert.equal(await isLoginLocked(fresh, minutes(last)), true);
  assert.equal(await isLoginLocked(fresh, minutes(last + 14)), true);
  assert.equal(await isLoginLocked(fresh, minutes(last + 15)), false, "lockout ends after 15 minutes");
});
