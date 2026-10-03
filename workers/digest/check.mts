/**
 * Code-side checks on the model's digest. Any failure means no digest is written. In CI the run
 * reports the code and a position (section number, sentence number), never the text; local runs
 * also print the rejected sentences (failureLines).
 */
import { findBannedPhrase } from "@/lib/banned-phrases";
import { HISTORICAL_CONTEXT_LINE, type DigestSectionKey } from "@/lib/digests";
import { CODE_SECTION, LAST_SECTION, MODEL_SECTION_KEYS, SECTION_KEYS, type DigestOutput } from "./prompt.mjs";

export type CheckCode =
  | "BAD_SECTION"
  | "FORMAT"
  | "NO_REF"
  | "UNKNOWN_REF"
  | "BANNED_PHRASE"
  | "PLACEMENT"
  | "DUPLICATE_SENTENCE"
  | "QUALIFIER";

const SUMMARY: DigestSectionKey = "executive_summary";

/** Straight and curly quotes, case and spacing folded so quoted passages compare reliably. */
function foldQuotes(text: string): string {
  return text.replace(/[“”„‟″«»]/g, '"').replace(/[‘’‚‛′]/g, "'").replace(/\s+/g, " ").toLowerCase();
}

/** Passages in double quotation marks in an event summary. */
export function quotedPassages(summary: string | null): string[] {
  if (!summary) return [];
  return [...foldQuotes(summary).matchAll(/"([^"]{3,})"/g)].map((m) => m[1].trim().replace(/[.,;:!?]+$/, ""));
}

/** Case, spacing, and final punctuation don't make a repeated sentence different. */
function sentenceKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[.!?"'”’\s]+$/, "").trim();
}

// Attribution doesn't make two sentences different: "According to Euronews, ...", "ERR reported that ...".
const ATTRIBUTION = [
  /\b(according to|as reported by|reported by|citing)\s+[^,.;]+[,;]?/gi,
  /^[^,.;]{1,60}?\b(reported|said|stated|announced)\s+(that\s+)?/i,
];

function contentWords(text: string): Set<string> {
  let t = foldQuotes(text);
  for (const re of ATTRIBUTION) t = t.replace(re, " ");
  return new Set(t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
}

/** Share of the shorter sentence's content words that also appear in the other one. */
export const NEAR_DUPLICATE_OVERLAP = 0.8;

export function isNearDuplicate(a: string, b: string): boolean {
  if (sentenceKey(a) === sentenceKey(b)) return true;
  const wa = contentWords(a);
  const wb = contentWords(b);
  const smaller = Math.min(wa.size, wb.size);
  if (smaller < 4) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / smaller >= NEAR_DUPLICATE_OVERLAP;
}

export type AliasedEvent = {
  alias: string;
  eventId: string;
  /** UNVERIFIED or contradiction_flag: may be cited only in the last section. */
  restricted: boolean;
  /**
   * quotedPassages() of the summary. A sentence using any of them must contain all of them, so a
   * quoted claim never travels without the same summary's quoted qualifier. Paraphrases without
   * quotation marks are not checked here; the prompt covers them.
   */
  quotes: string[];
};

/** eventIds is empty only for the code-written Historical Context line. */
export type CheckedSentence = { text: string; eventIds: string[]; aliases: string[] };

export type CheckFailure = {
  ok: false;
  code: CheckCode;
  where: string;
  /** The offending sentence text(s). Local output only: never log these in CI. */
  rejected: string[];
};

export type CheckResult =
  | {
      ok: true;
      /**
       * In DIGEST_SECTIONS order; model sections without sentences are absent. Always includes
       * historical_context with the fixed HISTORICAL_CONTEXT_LINE.
       */
      sections: Array<{ key: DigestSectionKey; sentences: CheckedSentence[] }>;
      /** Model-written sentences kept. */
      sentenceCount: number;
      citedEvents: number;
      /** Executive Summary sentences dropped as copies or near-copies of a topical sentence. */
      droppedSummarySentences: number;
      /** Their text. Local output only: CI logs only the count. */
      droppedSummaryTexts: string[];
    }
  | CheckFailure;

export function checkDigestOutput(output: DigestOutput, events: readonly AliasedEvent[]): CheckResult {
  const byAlias = new Map(events.map((e) => [e.alias, e]));
  const seenKeys = new Set<string>();
  const checked = new Map<DigestSectionKey, CheckedSentence[]>();
  const positions = new Map<CheckedSentence, string>();
  const fail = (code: CheckCode, where: string, ...rejected: string[]): CheckFailure => ({
    ok: false,
    code,
    where,
    rejected,
  });

  if (!output || !Array.isArray(output.sections)) return fail("BAD_SECTION", "output");

  // 1. Per-sentence checks.
  for (const [si, section] of output.sections.entries()) {
    const where = (n?: number) => `section ${si + 1}${n === undefined ? "" : ` sentence ${n + 1}`}`;
    // historical_context is written by code, so the model may not supply it.
    if (!MODEL_SECTION_KEYS.includes(section.key as DigestSectionKey) || seenKeys.has(section.key)) {
      return fail("BAD_SECTION", where());
    }
    seenKeys.add(section.key);
    const key = section.key as DigestSectionKey;

    const sentences: CheckedSentence[] = [];
    for (const [ni, sentence] of section.sentences.entries()) {
      const text = sentence.text.trim();
      if (text === "" || /[[\]\r\n]/.test(sentence.text)) return fail("FORMAT", where(ni), sentence.text);
      if (sentence.event_refs.length === 0) return fail("NO_REF", where(ni), text);
      const aliases = [...new Set(sentence.event_refs)];
      const refs = aliases.map((a) => byAlias.get(a));
      if (refs.some((r) => !r)) return fail("UNKNOWN_REF", where(ni), text);
      if (findBannedPhrase(text)) return fail("BANNED_PHRASE", where(ni), text);
      if (key !== LAST_SECTION && refs.some((r) => r!.restricted)) return fail("PLACEMENT", where(ni), text);
      const folded = foldQuotes(text);
      for (const r of refs) {
        const used = r!.quotes.filter((q) => folded.includes(q));
        if (used.length > 0 && used.length < r!.quotes.length) return fail("QUALIFIER", where(ni), text);
      }
      const checkedSentence = { text, eventIds: refs.map((r) => r!.eventId), aliases };
      positions.set(checkedSentence, where(ni));
      sentences.push(checkedSentence);
    }
    if (sentences.length > 0) checked.set(key, sentences);
  }

  // 2. Exact repeats within a section, or between two topical sections, fail.
  const topicalSeen = new Map<string, CheckedSentence>();
  for (const [key, sentences] of checked) {
    const inSection = new Map<string, CheckedSentence>();
    for (const s of sentences) {
      const k = sentenceKey(s.text);
      const earlier = inSection.get(k) ?? (key === SUMMARY ? undefined : topicalSeen.get(k));
      if (earlier) return fail("DUPLICATE_SENTENCE", positions.get(s)!, earlier.text, s.text);
      inSection.set(k, s);
      if (key !== SUMMARY) topicalSeen.set(k, s);
    }
  }

  // 3. An Executive Summary sentence that copies or nearly copies a topical sentence is dropped.
  let droppedSummarySentences = 0;
  let droppedSummaryTexts: string[] = [];
  const summary = checked.get(SUMMARY);
  if (summary) {
    const topical = [...checked].filter(([k]) => k !== SUMMARY).flatMap(([, s]) => s);
    const kept = summary.filter((s) => !topical.some((t) => isNearDuplicate(s.text, t.text)));
    droppedSummarySentences = summary.length - kept.length;
    droppedSummaryTexts = summary.filter((s) => !kept.includes(s)).map((s) => s.text);
    if (kept.length > 0) checked.set(SUMMARY, kept);
    else checked.delete(SUMMARY);
  }

  const cited = new Set([...checked.values()].flat().flatMap((s) => s.eventIds));
  const sentenceCount = [...checked.values()].reduce((n, s) => n + s.length, 0);
  checked.set(CODE_SECTION, [{ text: HISTORICAL_CONTEXT_LINE, eventIds: [], aliases: [] }]);
  const sections = SECTION_KEYS.filter((k) => checked.has(k)).map((key) => ({ key, sentences: checked.get(key)! }));
  return { ok: true, sections, sentenceCount, citedEvents: cited.size, droppedSummarySentences, droppedSummaryTexts };
}

/** What may be printed about a failed check. CI gets the code and position only, never text. */
export function failureLines(failure: CheckFailure, options: { ci: boolean; attempt: number }): string[] {
  const lines = [`attempt ${options.attempt}: check ${failure.code} at ${failure.where}`];
  if (!options.ci) for (const text of failure.rejected) lines.push(`  rejected: ${text}`);
  return lines;
}

export type ExistingDigest = { review_status: string; edited: boolean; aiDrafted: boolean } | null;

export type WriteDecision =
  | { action: "INSERT" }
  | { action: "REPLACE" }
  | { action: "SKIP"; status: "EXISTS" | "PUBLISHED_EXISTS" | "EDITED_DRAFT" | "MANUAL_DRAFT" };

/**
 * Never replaces a PUBLISHED digest. Replaces a DRAFT only with --replace-draft, and only if it is
 * an unedited AI draft, unless --force is also given.
 */
export function decideDigestWrite(
  existing: ExistingDigest,
  flags: { replaceDraft: boolean; force: boolean },
): WriteDecision {
  if (!existing) return { action: "INSERT" };
  if (existing.review_status !== "DRAFT") return { action: "SKIP", status: "PUBLISHED_EXISTS" };
  if (!flags.replaceDraft) return { action: "SKIP", status: "EXISTS" };
  if (flags.force) return { action: "REPLACE" };
  if (!existing.aiDrafted) return { action: "SKIP", status: "MANUAL_DRAFT" };
  if (existing.edited) return { action: "SKIP", status: "EDITED_DRAFT" };
  return { action: "REPLACE" };
}
