/**
 * Event references inside digest section text (no schema change: sections stay plain strings).
 * An AI-drafted section holds one sentence per line, each ending with a marker:
 *   The Polish Ministry of National Defence said ... [ref 402aff7d-...-..., a07251ae-...-...]
 * Reviewers edit the text before the marker; the marker keeps the sentence tied to its events.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MARKER_RE = new RegExp(`\\s*\\[ref (${UUID}(?:,\\s*${UUID})*)\\]\\s*$`, "i");

export type DigestLine = { text: string; eventIds: string[] };

export function formatDigestLine(text: string, eventIds: readonly string[]): string {
  return `${text.trim()} [ref ${eventIds.join(", ")}]`;
}

/** Splits a line into its text and referenced event ids (empty when it has no marker). */
export function parseDigestLine(line: string): DigestLine {
  const match = line.match(MARKER_RE);
  if (!match) return { text: line.trim(), eventIds: [] };
  return {
    text: line.slice(0, match.index).trim(),
    eventIds: match[1].split(",").map((id) => id.trim().toLowerCase()),
  };
}

/** True when a line mentions a marker that doesn't parse (e.g. a damaged id or a moved bracket). */
export function hasMalformedMarker(line: string): boolean {
  return /\[ref\b/i.test(line) && (!MARKER_RE.test(line) || /\[ref\b/i.test(parseDigestLine(line).text));
}

export function hasMarker(line: string): boolean {
  return MARKER_RE.test(line);
}

/** Paragraph text without markers, e.g. for the homepage excerpt. Referenced sentences run on. */
export function stripDigestRefs(text: string): string {
  const lines = text.split("\n");
  const separator = lines.some(hasMarker) ? " " : "\n";
  return lines.map((line) => parseDigestLine(line).text).join(separator);
}

/** Every event id referenced anywhere in the given section texts, in order of first appearance. */
export function collectDigestRefs(texts: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    for (const line of text.split("\n")) {
      for (const id of parseDigestLine(line).eventIds) seen.add(id);
    }
  }
  return [...seen];
}
