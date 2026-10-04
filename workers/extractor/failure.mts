/**
 * Row outcomes that are not successes, as short labels for the Actions job summary. Labels only:
 * never row text, URLs, or API error messages (which can echo request content).
 *
 * Errors fail the step (exit 1). Skips are expected, recorded on the row, and do not.
 */
export type RowErrorKind =
  | "model_stop"
  | "no_text_block"
  | "invalid_json"
  | "api_auth"
  | "api_error"
  | "write_failed";

export type RowSkipKind = "text_too_long";

/** Rows with more text than this are not sent to the model: marked SKIPPED (text_too_long). */
export const MAX_TEXT_CHARS = 60_000;

/** Why a row is skipped before any model call, or null to extract it. */
export function skipKindFor(text: string): RowSkipKind | null {
  return text.length > MAX_TEXT_CHARS ? "text_too_long" : null;
}

/** "text_too_long (1), api_error (2)": kinds in first-seen order with counts; "" when none. */
export function kindCounts(items: ReadonlyArray<{ kind: string }>): string {
  const counts = new Map<string, number>();
  for (const e of items) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${kind} (${n})`).join(", ");
}

export function failureReason(errors: ReadonlyArray<{ kind: RowErrorKind }>): string {
  return kindCounts(errors);
}

export function skippedSummary(skips: ReadonlyArray<{ kind: RowSkipKind }>): string {
  return kindCounts(skips);
}

/** Only real errors fail the step; skips never do. */
export function exitCodeFor(errors: ReadonlyArray<unknown>): 0 | 1 {
  return errors.length > 0 ? 1 : 0;
}
