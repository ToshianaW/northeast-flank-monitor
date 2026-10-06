/**
 * The text of an X post for a published event or exercise: its reviewed summary (or headline)
 * and the original source link. No network or database here.
 *
 * X counts a post at most 280 "weighted" characters: most Latin, Greek and Cyrillic text counts
 * 1 per character, other scripts and emoji count 2, and every link counts 23 whatever its length.
 */
import { findBannedPhrase } from "@/lib/banned-phrases";
import { stripDigestRefs } from "@/lib/digest-refs";

export const MAX_WEIGHT = 280;
export const LINK_WEIGHT = 23;

/** Code points that X weighs as 1 (twitter-text v3 ranges); everything else weighs 2. */
const LIGHT_RANGES: Array<[number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

export function weightedLength(text: string): number {
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    total += LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return total;
}

/** Decimal coordinate pairs, degree marks, or grid references: never posted (spec section 60). */
const COORDINATES = /\d{1,3}[.,]\d{2,}\s*°?\s*[NSEW]?\s*[,;/ ]\s*\d{1,3}[.,]\d{2,}|\d+\s*°|\b\d{1,2}[C-X]\s?[A-Z]{2}\s?\d{4,10}\b/;

export type PostInput = { summary: string | null; headline: string; sourceUrl: string | null };
export type PostText = { ok: true; text: string } | { ok: false; reason: string };

/** Shortens `text` to at most `budget` weighted characters, at a word boundary, ending in "…". */
export function truncateToWeight(text: string, budget: number): string {
  if (weightedLength(text) <= budget) return text;
  const words = text.split(" ");
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (weightedLength(`${next}…`) > budget) break;
    out = next;
  }
  if (!out) {
    // One very long word: cut by characters.
    for (const ch of text) {
      if (weightedLength(`${out}${ch}…`) > budget) break;
      out += ch;
    }
  }
  return `${out.replace(/[\s,;:.–-]+$/u, "")}…`;
}

/** Abbreviations whose period does not end a sentence ("U.S.", "Gen.", "No."). */
const NOT_SENTENCE_END = /(?:\b[A-Z]\.|\b(?:Mr|Mrs|Ms|Dr|Gen|Lt|Col|Maj|Capt|Sgt|Adm|Brig|St|No|vs|approx|e\.g|i\.e)\.)["'”)]?$/;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/(?<=[.!?]["'”)]?)\s+(?=["'“(]?[A-Z0-9])/u)) {
    if (out.length > 0 && NOT_SENTENCE_END.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
}

/**
 * The longest run of whole sentences from the start of `text` within `budget` weighted
 * characters, or null when even the first sentence is too long. The summary leads with its hook,
 * so a long summary still posts as a complete sentence instead of stopping mid-thought.
 */
export function fitWholeSentences(text: string, budget: number): string | null {
  let out = "";
  for (const sentence of splitSentences(text)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (weightedLength(next) > budget) break;
    out = next;
  }
  return out || null;
}

/**
 * Summary (or headline when there is no summary), a line break, and the source link.
 * A summary too long for the post keeps its whole leading sentences; only a single overlong
 * sentence is cut at a word boundary with "…".
 * Refused when there is no http(s) source link, or the text has predictive wording or coordinates.
 */
export function buildPostText(input: PostInput): PostText {
  const body = (input.summary?.trim() || input.headline.trim()).replace(/\s+/g, " ");
  if (!body) return { ok: false, reason: "no summary or headline" };
  let url: URL;
  try {
    url = new URL(input.sourceUrl ?? "");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("not http(s)");
  } catch {
    return { ok: false, reason: "no source link" };
  }
  const phrase = findBannedPhrase(body);
  if (phrase) return { ok: false, reason: `predictive wording ("${phrase}")` };
  if (COORDINATES.test(body)) return { ok: false, reason: "coordinates in the text" };
  // Budget: 280 minus the link (23) and the line break (1).
  const budget = MAX_WEIGHT - LINK_WEIGHT - 1;
  const fitted = weightedLength(body) <= budget ? body : (fitWholeSentences(body, budget) ?? truncateToWeight(body, budget));
  const text = `${fitted}\n${url.href}`;
  return { ok: true, text };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A published daily digest as post input: "Daily digest, 3 Oct 2026:" followed by its Summary
 * section (event reference markers removed), linking to the digest page on the public site.
 * Without a public site URL there is no link, so buildPostText refuses it ("no source link").
 */
export function digestPostInput(
  digest: { digest_date: string; title: string; sections: Record<string, unknown> },
  siteUrl: string | null,
): PostInput {
  const [y, m, d] = digest.digest_date.split("-").map(Number);
  const raw = typeof digest.sections.executive_summary === "string" ? digest.sections.executive_summary : "";
  const summaryText = stripDigestRefs(raw).replace(/\s+/g, " ").trim();
  const label = `Daily digest, ${d} ${MONTHS[m - 1]} ${y}`;
  const base = siteUrl?.trim().replace(/\/+$/, "");
  return {
    summary: summaryText ? `${label}: ${summaryText}` : null,
    headline: `${label}: ${digest.title}`,
    sourceUrl: base ? `${base}/digest/${digest.digest_date}` : null,
  };
}

/** The weight X will count for a built post (its link counted as 23). */
export function postWeight(text: string): number {
  const [body, link] = [text.slice(0, text.lastIndexOf("\n")), text.slice(text.lastIndexOf("\n") + 1)];
  return weightedLength(body) + 1 + (link ? LINK_WEIGHT : 0);
}
