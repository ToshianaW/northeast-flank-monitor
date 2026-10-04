/**
 * Suggestion step for "similar in nature" references. Code shortlists published historical
 * entries; the model sees only public fields of the current event and the shortlist and returns
 * up to 3 shortlist aliases with attributes from the fixed list, as constrained JSON. It writes no
 * public text. Code then drops unknown aliases and any attribute it can disprove, and a reviewer
 * approves each suggestion. The model call is passed in so tests can stub it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ShortlistEntry, SuggestionEvent } from "@/lib/historical-references";
import {
  MAX_REFERENCES,
  REFERENCE_ATTRIBUTES,
  verifiedAttributes,
  type ReferenceAttribute,
} from "@/lib/historical-references-rules";

export const SUGGEST_MODEL = "claude-haiku-4-5";
/** USD per million tokens (Claude Haiku 4.5). */
export const SUGGEST_PRICE = { input: 1, output: 5 };
export const SUGGEST_MAX_TOKENS = 1_000;
/** Hard cap per click, checked against the worst case before the call. */
export const PER_CLICK_CAP_USD = 0.02;

export const SUGGEST_SYSTEM = `You help a reviewer find entries in a historical record (Aug 2020 - Feb 2022) that are similar in nature to one current event.

You are given the current event and a numbered shortlist of historical entries (H1, H2, ...). Return at most 3 shortlist entries that are clearly similar in nature to the current event, using only their aliases, and for each one the attributes it shares with the current event, chosen only from: SAME_EVENT_TYPE, SAME_COUNTRY, SAME_ACTOR, SAME_KIND_OF_ACTIVITY.

Use SAME_KIND_OF_ACTIVITY only when both describe the same kind of military or official activity (for example both are readiness checks, or both are air-policing intercepts). Return an empty list when nothing is clearly similar. Do not rank by importance, do not explain, and do not write any other text.`;

export type SuggestRequest = { system: string; user: string; schema: Record<string, unknown> };
export type SuggestReply = { text: string | null; stopReason: string | null; inputTokens: number; outputTokens: number };
export type SuggestCall = (request: SuggestRequest) => Promise<SuggestReply>;

export type Suggestion = { historical_event_id: string; attributes: ReferenceAttribute[] };

export type SuggestResult =
  | { ok: true; suggestions: Suggestion[]; costUsd: number; worstCaseUsd: number; shortlistSize: number }
  | { ok: false; status: "NO_SHORTLIST" | "SPEND_CAP" | "MODEL_ERROR"; detail: string; costUsd: number };

const alias = (i: number) => `H${i + 1}`;

function publicFields(e: SuggestionEvent) {
  return {
    headline: e.headline,
    summary: e.summary,
    event_type: e.event_type,
    country: e.country,
    actor: e.actor,
  };
}

export function buildSuggestMessage(current: SuggestionEvent, shortlist: readonly ShortlistEntry[]): string {
  return JSON.stringify({
    current_event: publicFields(current),
    historical_shortlist: shortlist.map((e, i) => ({ alias: alias(i), ...publicFields(e) })),
  });
}

/** Constrained output: aliases from the shortlist and attributes from the fixed list only. */
export function suggestSchema(size: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["alias", "attributes"],
          properties: {
            alias: { type: "string", enum: Array.from({ length: size }, (_, i) => alias(i)) },
            attributes: { type: "array", items: { type: "string", enum: [...REFERENCE_ATTRIBUTES] } },
          },
        },
      },
    },
  };
}

export function worstCaseUsd(request: SuggestRequest): number {
  const chars = request.system.length + request.user.length + JSON.stringify(request.schema).length;
  return ((chars / 3) * SUGGEST_PRICE.input + SUGGEST_MAX_TOKENS * SUGGEST_PRICE.output) / 1_000_000;
}

function costOf(reply: SuggestReply): number {
  return (reply.inputTokens * SUGGEST_PRICE.input + reply.outputTokens * SUGGEST_PRICE.output) / 1_000_000;
}

/**
 * The request for the longest prefix of the shortlist whose worst case fits the cap (entries
 * are dropped from the end, the least relevant), or null when even one entry does not fit.
 */
export function cappedRequest(
  current: SuggestionEvent,
  shortlist: readonly ShortlistEntry[],
): { request: SuggestRequest; used: ShortlistEntry[] } | null {
  for (let n = shortlist.length; n >= 1; n--) {
    const used = shortlist.slice(0, n);
    const request = { system: SUGGEST_SYSTEM, user: buildSuggestMessage(current, used), schema: suggestSchema(n) };
    if (worstCaseUsd(request) <= PER_CLICK_CAP_USD) return { request, used };
  }
  return null;
}

/** Parses and checks the model's reply. Never trusts an alias or attribute it cannot verify. */
export function parseSuggestions(
  text: string,
  current: SuggestionEvent,
  used: readonly ShortlistEntry[],
): Suggestion[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return null;
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const a = (item as { alias?: unknown }).alias;
    const index = typeof a === "string" && /^H\d+$/.test(a) ? Number(a.slice(1)) - 1 : -1;
    const entry = used[index];
    if (!entry || seen.has(entry.event_id)) continue;
    const attributes = verifiedAttributes(current, entry, (item as { attributes?: unknown[] }).attributes ?? []);
    if (attributes.length === 0) continue;
    seen.add(entry.event_id);
    out.push({ historical_event_id: entry.event_id, attributes });
    if (out.length === MAX_REFERENCES) break;
  }
  return out;
}

export async function suggestReferences(options: {
  current: SuggestionEvent;
  shortlist: readonly ShortlistEntry[];
  call: SuggestCall;
}): Promise<SuggestResult> {
  const { current, shortlist, call } = options;
  if (shortlist.length === 0) return { ok: false, status: "NO_SHORTLIST", detail: "no published entry of the same type or country", costUsd: 0 };
  const capped = cappedRequest(current, shortlist);
  if (!capped) return { ok: false, status: "SPEND_CAP", detail: `worst case exceeds $${PER_CLICK_CAP_USD}`, costUsd: 0 };

  let reply: SuggestReply;
  try {
    reply = await call(capped.request);
  } catch (error) {
    // Error class and HTTP status only; messages can echo request content.
    const status = (error as { status?: unknown }).status;
    const name = error instanceof Error ? error.constructor.name : "error";
    return { ok: false, status: "MODEL_ERROR", detail: `${name}${typeof status === "number" ? ` ${status}` : ""}`, costUsd: 0 };
  }
  const costUsd = costOf(reply);
  if (reply.stopReason !== "end_turn" || reply.text === null) {
    return { ok: false, status: "MODEL_ERROR", detail: `stop_reason ${reply.stopReason}`, costUsd };
  }
  const suggestions = parseSuggestions(reply.text, current, capped.used);
  if (!suggestions) return { ok: false, status: "MODEL_ERROR", detail: "invalid JSON", costUsd };
  return { ok: true, suggestions, costUsd, worstCaseUsd: worstCaseUsd(capped.request), shortlistSize: capped.used.length };
}

/** The real call: Claude Haiku 4.5 with structured output. No thinking, no tools. */
export const anthropicSuggestCall: SuggestCall = async (request) => {
  const response = await new Anthropic().messages.create({
    model: SUGGEST_MODEL,
    max_tokens: SUGGEST_MAX_TOKENS,
    system: request.system,
    messages: [{ role: "user", content: request.user }],
    output_config: { format: { type: "json_schema", schema: request.schema } },
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return {
    text: textBlock?.type === "text" ? textBlock.text : null,
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
};
