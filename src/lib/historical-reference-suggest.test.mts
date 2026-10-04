/**
 * Suggestion step with a stubbed model: public fields only, constrained output, the per-click
 * cap, and code checks on what comes back. No database or API calls. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import type { ShortlistEntry, SuggestionEvent } from "./historical-references";
import { FAILURE_REASONS, referenceMessage } from "./historical-references-rules";
import {
  PER_CLICK_CAP_USD,
  reasonForError,
  SUGGEST_MAX_TOKENS,
  SUGGEST_MODEL,
  suggestReferences,
  worstCaseUsd,
  type SuggestCall,
  type SuggestRequest,
} from "./historical-reference-suggest";

const CURRENT: SuggestionEvent = {
  headline: "Belarus begins snap readiness check in Grodno region",
  summary: "The Belarusian defence ministry said units in the Grodno region began a readiness check.",
  event_type: "READINESS_CHECK",
  country: "Belarus",
  actor: "Belarusian Armed Forces",
};

const entry = (n: number, over: Partial<ShortlistEntry> = {}): ShortlistEntry => ({
  event_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  event_date: new Date("2021-01-15T00:00:00Z"),
  headline: `Historical entry ${n}`,
  summary: "Units were placed on alert.",
  event_type: "READINESS_CHECK",
  country: "Belarus",
  actor: "Belarusian Armed Forces",
  ...over,
});

function stub(text: string, calls: SuggestRequest[] = []): SuggestCall {
  return async (request) => {
    calls.push(request);
    return { text, stopReason: "end_turn", inputTokens: 2_000, outputTokens: 100 };
  };
}

test("model choice and limits", () => {
  assert.equal(SUGGEST_MODEL, "claude-haiku-4-5");
  assert.equal(PER_CLICK_CAP_USD, 0.02);
  assert.equal(SUGGEST_MAX_TOKENS, 1_000);
});

test("the model sees public fields and aliases only, and the output is constrained to both lists", async () => {
  const calls: SuggestRequest[] = [];
  await suggestReferences({ current: CURRENT, shortlist: [entry(1), entry(2)], call: stub('{"suggestions":[]}', calls) });
  const sent = JSON.parse(calls[0].user);
  assert.deepEqual(Object.keys(sent.current_event).sort(), ["actor", "country", "event_type", "headline", "summary"]);
  assert.deepEqual(Object.keys(sent.historical_shortlist[0]).sort(), ["actor", "alias", "country", "event_type", "headline", "summary"]);
  assert.ok(!calls[0].user.includes("00000000-0000"), "no database ids are sent");
  const items = (calls[0].schema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).suggestions.items;
  assert.deepEqual((items.properties.alias as { enum: string[] }).enum, ["H1", "H2"]);
  assert.deepEqual((items.properties.attributes as { items: { enum: string[] } }).items.enum, [
    "SAME_EVENT_TYPE",
    "SAME_COUNTRY",
    "SAME_ACTOR",
    "SAME_KIND_OF_ACTIVITY",
  ]);
});

test("unknown aliases, repeats and disproved attributes are dropped; at most 3 are kept", async () => {
  const shortlist = [entry(1), entry(2, { country: "Russia", actor: "Russian Armed Forces" }), entry(3), entry(4), entry(5)];
  const reply = JSON.stringify({
    suggestions: [
      { alias: "H9", attributes: ["SAME_EVENT_TYPE"] },
      { alias: "H2", attributes: ["SAME_COUNTRY", "SAME_ACTOR"] }, // both false: dropped
      { alias: "H1", attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY"] },
      { alias: "H1", attributes: ["SAME_ACTOR"] },
      { alias: "H3", attributes: ["SAME_KIND_OF_ACTIVITY"] },
      { alias: "H4", attributes: ["SAME_ACTOR"] },
      { alias: "H5", attributes: ["SAME_EVENT_TYPE"] },
    ],
  });
  const r = await suggestReferences({ current: CURRENT, shortlist, call: stub(reply) });
  assert.ok(r.ok);
  assert.deepEqual(r.suggestions, [
    { historical_event_id: shortlist[0].event_id, attributes: ["SAME_EVENT_TYPE", "SAME_COUNTRY"] },
    { historical_event_id: shortlist[2].event_id, attributes: ["SAME_KIND_OF_ACTIVITY"] },
    { historical_event_id: shortlist[3].event_id, attributes: ["SAME_ACTOR"] },
  ]);
  assert.equal(r.costUsd, (2_000 * 1 + 100 * 5) / 1_000_000);
});

test("the cap is checked against the worst case before the call", async () => {
  let called = 0;
  const counting: SuggestCall = async () => {
    called++;
    return { text: '{"suggestions":[]}', stopReason: "end_turn", inputTokens: 0, outputTokens: 0 };
  };
  // One entry too large for the cap: no call at all.
  const huge = entry(1, { summary: "x".repeat(60_000) });
  const r = await suggestReferences({ current: CURRENT, shortlist: [huge], call: counting });
  assert.deepEqual(r, { ok: false, status: "SPEND_CAP", reason: "over cost cap", detail: "worst case exceeds $0.02", costUsd: 0 });
  assert.equal(called, 0);

  // Many long entries: the shortlist is cut from the end until the worst case fits.
  const many = Array.from({ length: 25 }, (_, i) => entry(i + 1, { summary: "y".repeat(2_000) }));
  const calls: SuggestRequest[] = [];
  const ok = await suggestReferences({ current: CURRENT, shortlist: many, call: stub('{"suggestions":[]}', calls) });
  assert.ok(ok.ok);
  assert.ok(ok.shortlistSize < 25 && ok.shortlistSize > 0);
  assert.ok(worstCaseUsd(calls[0]) <= PER_CLICK_CAP_USD);
});

test("an empty shortlist makes no call; a bad reply changes nothing", async () => {
  const empty = await suggestReferences({ current: CURRENT, shortlist: [], call: stub("") });
  assert.equal(empty.ok ? null : empty.reason, "no candidates");
  const notJson = await suggestReferences({ current: CURRENT, shortlist: [entry(1)], call: stub("not json") });
  assert.deepEqual(notJson.ok ? null : [notJson.status, notJson.reason], ["MODEL_ERROR", "invalid reply"]);
  const cut: SuggestCall = async () => ({ text: null, stopReason: "max_tokens", inputTokens: 10, outputTokens: 1_000 });
  const r = await suggestReferences({ current: CURRENT, shortlist: [entry(1)], call: cut });
  assert.equal(r.ok ? null : r.detail, "stop_reason max_tokens");
  assert.equal(r.ok ? null : r.reason, "model stopped early");
  const thrown: SuggestCall = async () => {
    throw Object.assign(new Error("secret request text"), { status: 529 });
  };
  const e = await suggestReferences({ current: CURRENT, shortlist: [entry(1)], call: thrown });
  assert.equal(e.ok ? null : e.detail, "Error 529", "error class and status only, never the message");
});

test("a failed call names a short reason: missing key, rejected key, rate limit, other API error", async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  try {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    // What the SDK does with no credential: a plain Error before any request is sent.
    assert.equal(reasonForError(new Error("Could not resolve authentication method")), "no API key");
    const noKeyCall: SuggestCall = async () => {
      throw new Error("Could not resolve authentication method");
    };
    const noKey = await suggestReferences({ current: CURRENT, shortlist: [entry(1)], call: noKeyCall });
    assert.equal(noKey.ok ? null : noKey.reason, "no API key");

    process.env.ANTHROPIC_API_KEY = "placeholder-not-a-key";
    assert.equal(reasonForError(new Error("socket hang up")), "API error");
    // SDK API errors carry the HTTP status (this test file may load the SDK's other build, so
    // the classes here can differ from the module's; the status covers both).
    const apiError = (status: number) => Object.assign(Object.create(Anthropic.APIError.prototype), { status });
    assert.equal(reasonForError(apiError(401)), "API key rejected");
    assert.equal(reasonForError(apiError(403)), "API key rejected");
    assert.equal(reasonForError(apiError(429)), "rate limited");
    assert.equal(reasonForError(apiError(500)), "API error");
    assert.equal(reasonForError(apiError(400)), "API error");
  } finally {
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  }
});

test("the admin message shows a known reason label only", () => {
  assert.equal(
    referenceMessage("MODEL_ERROR", "no API key"),
    "The suggestion request failed. Nothing was changed. Reason: no API key.",
  );
  assert.equal(referenceMessage("MODEL_ERROR", "sk-ant-something"), "The suggestion request failed. Nothing was changed.");
  assert.deepEqual([...FAILURE_REASONS].filter((r) => r.length > 20), [], "labels stay short");
});
