/**
 * One model call, the code checks, and at most one retry with the failure code. The model call is
 * passed in so tests can stub it. Both calls count against the same spend cap.
 */
import type { CheckCode, CheckFailure, CheckResult } from "./check.mjs";
import type { DigestOutput } from "./prompt.mjs";

export type ModelTurn = { role: "user" | "assistant"; content: string };

export type ModelReply = { text: string | null; stopReason: string | null; costUsd: number };

export type ModelCall = (messages: ModelTurn[]) => Promise<ModelReply>;

/** Per-run spend cap for the digest (docs/running-costs.md): room for the one retry. */
export const DIGEST_MAX_USD = 0.15;
export const DIGEST_MAX_TOKENS = 8_000;

/** Worst-case cost of one call: input estimated at 3 characters per token, plus max output. */
export function digestWorstCaseUsd(
  system: string,
  messages: readonly ModelTurn[],
  price: { input: number; output: number },
  maxTokens: number = DIGEST_MAX_TOKENS,
): number {
  const chars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
  return ((chars / 3) * price.input + maxTokens * price.output) / 1_000_000;
}

type Checked = Extract<CheckResult, { ok: true }>;

export type DraftResult =
  | { ok: true; checked: Checked; attempts: number; costUsd: number; failures: CheckFailure[] }
  | {
      ok: false;
      status: "CHECK_FAILED" | "MODEL_ERROR" | "SPEND_CAP";
      detail: string;
      attempts: number;
      costUsd: number;
      /** Every failed check, in order, for local printing. */
      failures: CheckFailure[];
    };

const FIX_HINTS: Record<CheckCode, string> = {
  BAD_SECTION:
    "A section key is not allowed or is used twice. Use only the allowed keys, each once.",
  FORMAT: "A sentence is empty or contains a bracket or a line break.",
  NO_REF:
    "A sentence has no event_refs, or cites only historical aliases. Every sentence must cite at least one current event alias (E1, E2, ...); H aliases are allowed only in historical_context.",
  UNKNOWN_REF: "A sentence cites an alias that is not in the input. Use only the given aliases.",
  BANNED_PHRASE: "A sentence uses predictive or intent-reading language. State only what was reported.",
  PLACEMENT:
    "An event with confidence_level UNVERIFIED or contradiction_flag true is cited outside contradictions_unverified.",
  DUPLICATE_SENTENCE:
    "A sentence repeats another sentence word for word, in the same section or in another topical section.",
  SUMMARY_MISSING:
    "executive_summary is missing. Write it whenever at least one event is not UNVERIFIED and not contradicted.",
  SUMMARY_LENGTH: "executive_summary is too long. Use one or two sentences and at most 45 words in total.",
  SECTION_LENGTH:
    "A section is too long. Topical sections: one or two sentences, at most 50 words in total; contradictions_unverified: three sentences and 70 words; historical_context: four sentences and 90 words. Summarise; do not list events one by one.",
  QUALIFIER:
    "A sentence quotes part of an event summary's quoted passages without the others. Put every quoted passage from that summary in the same sentence, or paraphrase the whole statement without quotation marks and keep the qualifier.",
};

export function retryMessage(failure: CheckFailure): string {
  return `Your digest failed an automatic check: ${failure.code} at ${failure.where}. ${FIX_HINTS[failure.code]} Return the complete corrected digest in the same JSON format, following all the original instructions.`;
}

export async function draftDigest(options: {
  userMessage: string;
  call: ModelCall;
  check: (output: DigestOutput) => CheckResult;
  maxUsd: number;
  /** Worst-case cost of a call with these messages (input estimate plus max output). */
  worstCaseUsd: (messages: ModelTurn[]) => number;
}): Promise<DraftResult> {
  const { call, check, maxUsd, worstCaseUsd } = options;
  const failures: CheckFailure[] = [];
  let costUsd = 0;
  let messages: ModelTurn[] = [{ role: "user", content: options.userMessage }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const worstCase = worstCaseUsd(messages);
    if (costUsd + worstCase > maxUsd) {
      const detail =
        attempt === 1
          ? `worst case $${worstCase.toFixed(4)}`
          : `${failures[0].code} at ${failures[0].where}; retry would exceed cap`;
      return { ok: false, status: attempt === 1 ? "SPEND_CAP" : "CHECK_FAILED", detail, attempts: attempt - 1, costUsd, failures };
    }

    let reply: ModelReply;
    try {
      reply = await call(messages);
    } catch (error) {
      // Error class and HTTP status only; messages can echo request content.
      const status = (error as { status?: unknown }).status;
      const name = error instanceof Error ? error.constructor.name : "error";
      return { ok: false, status: "MODEL_ERROR", detail: `${name}${typeof status === "number" ? ` ${status}` : ""}`, attempts: attempt, costUsd, failures };
    }
    costUsd += reply.costUsd;
    if (reply.stopReason !== "end_turn" || reply.text === null) {
      return { ok: false, status: "MODEL_ERROR", detail: `stop_reason ${reply.stopReason}`, attempts: attempt, costUsd, failures };
    }
    let output: DigestOutput;
    try {
      output = JSON.parse(reply.text) as DigestOutput;
    } catch {
      return { ok: false, status: "MODEL_ERROR", detail: "invalid JSON", attempts: attempt, costUsd, failures };
    }

    const result = check(output);
    if (result.ok) return { ok: true, checked: result, attempts: attempt, costUsd, failures };
    failures.push(result);
    messages = [
      ...messages,
      { role: "assistant", content: reply.text },
      { role: "user", content: retryMessage(result) },
    ];
  }

  const last = failures[failures.length - 1];
  return { ok: false, status: "CHECK_FAILED", detail: `${last.code} at ${last.where}`, attempts: 2, costUsd, failures };
}
