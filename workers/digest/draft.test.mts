/**
 * The retry path, with a stubbed model: one retry on a failed check, the spend cap covering both
 * calls, and safe error details. No database or API calls.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDigestOutput, type AliasedEvent } from "./check.mjs";
import { draftDigest, type ModelCall, type ModelReply, type ModelTurn } from "./draft.mjs";
import type { DigestOutput } from "./prompt.mjs";

const events: AliasedEvent[] = [
  { alias: "E1", eventId: "11111111-1111-4111-8111-111111111111", restricted: false, quotes: [] },
];
const check = (o: DigestOutput) => checkDigestOutput(o, events);

const reply = (output: DigestOutput, costUsd = 0.01): ModelReply => ({
  text: JSON.stringify(output),
  stopReason: "end_turn",
  costUsd,
});
const failing: DigestOutput = {
  sections: [{ key: "belarus", sentences: [{ text: "An attack is imminent.", event_refs: ["E1"] }] }],
};
const unknownRef: DigestOutput = {
  sections: [{ key: "belarus", sentences: [{ text: "Belarus held an exercise.", event_refs: ["E9"] }] }],
};
const passing: DigestOutput = {
  sections: [{ key: "belarus", sentences: [{ text: "Belarus held an exercise.", event_refs: ["E1"] }] }],
};

/** Returns the scripted replies in order and records the messages of each call. */
function stub(...replies: Array<ModelReply | Error>): { call: ModelCall; calls: ModelTurn[][] } {
  const calls: ModelTurn[][] = [];
  return {
    calls,
    call: async (messages) => {
      calls.push(messages);
      const next = replies[calls.length - 1];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const base = { userMessage: "events", check, maxUsd: 0.25, worstCaseUsd: () => 0.09 };

test("a failed check is retried once with the code, and the second answer is used", async () => {
  const { call, calls } = stub(reply(failing), reply(passing));
  const r = await draftDigest({ ...base, call });
  assert.ok(r.ok);
  assert.equal(r.attempts, 2);
  assert.equal(r.costUsd, 0.02);
  assert.deepEqual(r.failures.map((f) => f.code), ["BANNED_PHRASE"]);
  // The retry carries the first answer and a message naming the code and position.
  assert.equal(calls[1].length, 3);
  assert.equal(calls[1][1].role, "assistant");
  assert.match(calls[1][2].content, /BANNED_PHRASE at section 1 sentence 1/);
});

test("a second failure writes nothing and reports the second code", async () => {
  const { call, calls } = stub(reply(failing), reply(unknownRef));
  const r = await draftDigest({ ...base, call });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, "CHECK_FAILED");
  assert.equal(r.detail, "UNKNOWN_REF at section 1 sentence 1");
  assert.equal(r.attempts, 2);
  assert.equal(calls.length, 2, "never a third call");
});

test("the retry is skipped when it could exceed the shared cap", async () => {
  const { call, calls } = stub(reply(failing, 0.2), reply(passing));
  const r = await draftDigest({ ...base, call });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, "CHECK_FAILED");
  assert.match(r.detail, /BANNED_PHRASE .* retry would exceed cap/);
  assert.equal(calls.length, 1);
});

test("no call at all when the first worst case exceeds the cap", async () => {
  const { call, calls } = stub(reply(passing));
  const r = await draftDigest({ ...base, call, worstCaseUsd: () => 0.3 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, "SPEND_CAP");
  assert.equal(calls.length, 0);
});

test("API errors report the class and status only, never the message", async () => {
  const error = Object.assign(new Error("request echoed: secret event text"), { status: 529 });
  const { call } = stub(error);
  const r = await draftDigest({ ...base, call });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.status, "MODEL_ERROR");
  assert.equal(r.detail, "Error 529");
});
