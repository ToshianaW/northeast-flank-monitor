/**
 * Signed admin session tokens: valid tokens pass; tampered, expired, or wrongly signed ones fail.
 * Run: npm test   (no database or env needed; uses a throwaway secret)
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "./admin-auth";

const secret = randomBytes(48).toString("base64url");
const now = Date.UTC(2026, 0, 1);

test("a freshly signed token is accepted", async () => {
  const token = await createSessionToken(secret, now);
  assert.equal(await verifySessionToken(token, secret, now), true);
  assert.equal(await verifySessionToken(token, secret, now + 60_000), true);
});

test("a token is rejected once it expires after 7 days", async () => {
  const token = await createSessionToken(secret, now);
  const expiry = now + SESSION_MAX_AGE_SECONDS * 1000;
  assert.equal(await verifySessionToken(token, secret, expiry - 1), true);
  assert.equal(await verifySessionToken(token, secret, expiry), false);
});

test("a tampered token is rejected", async () => {
  const token = await createSessionToken(secret, now);
  const [random, expiry, signature] = token.split(".");
  // Extend the expiry without re-signing.
  const extended = `${random}.${Number(expiry) + 365 * 86_400_000}.${signature}`;
  assert.equal(await verifySessionToken(extended, secret, now), false);
  // Swap the random part.
  const other = (await createSessionToken(secret, now)).split(".")[0];
  assert.equal(await verifySessionToken(`${other}.${expiry}.${signature}`, secret, now), false);
  // Flip one character of the signature.
  const flipped = signature.slice(0, -2) + (signature.at(-2) === "A" ? "B" : "A") + signature.at(-1);
  assert.equal(await verifySessionToken(`${random}.${expiry}.${flipped}`, secret, now), false);
});

test("a token signed with another secret, or malformed input, is rejected", async () => {
  const token = await createSessionToken(randomBytes(48).toString("base64url"), now);
  assert.equal(await verifySessionToken(token, secret, now), false);
  for (const bad of [undefined, "", "a.b", "a.b.c.d", "not-a-token", process.env.ADMIN_PASSWORD]) {
    assert.equal(await verifySessionToken(bad, secret, now), false);
  }
});
