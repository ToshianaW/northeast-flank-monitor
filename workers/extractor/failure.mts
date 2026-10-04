/**
 * Short reason labels for row errors, for the Actions job summary. Labels only: never row text,
 * URLs, or API error messages (which can echo request content).
 */
export type RowErrorKind =
  | "text_too_long"
  | "model_stop"
  | "no_text_block"
  | "invalid_json"
  | "api_auth"
  | "api_error"
  | "write_failed";

/** "text_too_long (1), api_error (2)": kinds in first-seen order with counts; "" when none. */
export function failureReason(errors: ReadonlyArray<{ kind: RowErrorKind }>): string {
  const counts = new Map<RowErrorKind, number>();
  for (const e of errors) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${kind} (${n})`).join(", ");
}
