/**
 * Code-side checks on the model's digest. Any failure means no digest is written. In CI the run
 * reports the code and a position (section number, sentence number), never the text; local runs
 * also print the rejected sentences (failureLines).
 */
import { findBannedPhrase } from "@/lib/banned-phrases";
import { HISTORICAL_CONTEXT_LINE, type DigestSectionKey } from "@/lib/digests";
import {
  HISTORICAL_SECTION,
  LAST_SECTION,
  MODEL_SECTION_KEYS,
  SECTION_KEYS,
  SECTION_LIMITS,
  TOPICAL_LIMIT,
  type DigestOutput,
} from "./prompt.mjs";

export type CheckCode =
  | "BAD_SECTION"
  | "FORMAT"
  | "NO_REF"
  | "UNKNOWN_REF"
  | "BANNED_PHRASE"
  | "PLACEMENT"
  | "DUPLICATE_SENTENCE"
  | "QUALIFIER"
  | "SUMMARY_MISSING"
  | "SUMMARY_LENGTH"
  | "SECTION_LENGTH";

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

/** The summary's length limits (prompt v5). */
export const SUMMARY_MAX_SENTENCES = 2;
export const SUMMARY_MAX_WORDS = 45;

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Appended by code (never the model) when the day has UNVERIFIED or contradicted events, which
 * stay out of the model-written summary. Its marker lists those events so the links work.
 */
export function unverifiedNote(count: number): string {
  return count === 1
    ? "1 other reported item is listed in the full digest under Contradictions & Unverified Reporting."
    : `${count} other reported items are listed in the full digest under Contradictions & Unverified Reporting.`;
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

/** byCode marks text written by code, not the model (Historical Context, the unverified note). */
export type CheckedSentence = { text: string; eventIds: string[]; aliases: string[]; byCode?: true };

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
       * historical_context (the fixed line when the model left it out), and the summary ends with
       * the unverified note when the day has restricted events.
       */
      sections: Array<{ key: DigestSectionKey; sentences: CheckedSentence[] }>;
      /** Model-written sentences. */
      sentenceCount: number;
      citedEvents: number;
    }
  | CheckFailure;

function limitFor(key: DigestSectionKey): { sentences: number; words: number } | null {
  if (key === SUMMARY) return null; // checked separately (SUMMARY_LENGTH)
  return SECTION_LIMITS[key] ?? TOPICAL_LIMIT;
}

/**
 * `historicalAliases` are the H aliases the model was given; only historical_context may cite
 * them, and each of its sentences must also cite a current event. When the model leaves the
 * section out, code writes HISTORICAL_CONTEXT_LINE.
 */
export function checkDigestOutput(
  output: DigestOutput,
  events: readonly AliasedEvent[],
  historicalAliases: readonly string[] = [],
): CheckResult {
  const historical = new Set(historicalAliases);
  const byAlias = new Map(events.map((e) => [e.alias, e]));
  const seenKeys = new Set<string>();
  const checked = new Map<DigestSectionKey, CheckedSentence[]>();
  const positions = new Map<CheckedSentence, string>();
  let summaryPosition = "output";
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
    if (!MODEL_SECTION_KEYS.includes(section.key as DigestSectionKey) || seenKeys.has(section.key)) {
      return fail("BAD_SECTION", where());
    }
    seenKeys.add(section.key);
    const key = section.key as DigestSectionKey;
    if (key === SUMMARY) summaryPosition = where();

    const sentences: CheckedSentence[] = [];
    for (const [ni, sentence] of section.sentences.entries()) {
      const text = sentence.text.trim();
      if (text === "" || /[[\]\r\n]/.test(sentence.text)) return fail("FORMAT", where(ni), sentence.text);
      if (sentence.event_refs.length === 0) return fail("NO_REF", where(ni), text);
      // Historical aliases are allowed only in historical_context, and are not linked (they are
      // not current events); a sentence there still needs a current event.
      const cited = [...new Set(sentence.event_refs)];
      const historicalRefs = key === HISTORICAL_SECTION ? cited.filter((a) => historical.has(a)) : [];
      const aliases = cited.filter((a) => !historicalRefs.includes(a));
      if (aliases.length === 0) return fail("NO_REF", where(ni), text);
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
    const limit = limitFor(key);
    if (limit) {
      const words = sentences.reduce((n, s) => n + wordCount(s.text), 0);
      if (sentences.length > limit.sentences || words > limit.words) {
        return fail("SECTION_LENGTH", where(), ...sentences.map((s) => s.text));
      }
    }
    if (sentences.length > 0) checked.set(key, sentences);
  }

  // 2. The summary: required whenever an allowed event exists; one or two sentences, 45 words.
  // It may overlap topical sentences.
  const summary = checked.get(SUMMARY) ?? [];
  if (events.some((e) => !e.restricted) && summary.length === 0) return fail("SUMMARY_MISSING", summaryPosition);
  const words = summary.reduce((n, s) => n + wordCount(s.text), 0);
  if (summary.length > SUMMARY_MAX_SENTENCES || words > SUMMARY_MAX_WORDS) {
    return fail("SUMMARY_LENGTH", summaryPosition, ...summary.map((s) => s.text));
  }

  // 3. Exact repeats within a section, or between two topical sections, fail. The summary is
  // exempt across sections.
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

  const cited = new Set([...checked.values()].flat().flatMap((s) => s.eventIds));
  const sentenceCount = [...checked.values()].reduce((n, s) => n + s.length, 0);

  // 4. Code-written text.
  const restricted = events.filter((e) => e.restricted);
  if (restricted.length > 0) {
    checked.set(SUMMARY, [
      ...summary,
      {
        text: unverifiedNote(restricted.length),
        eventIds: restricted.map((e) => e.eventId),
        aliases: restricted.map((e) => e.alias),
        byCode: true,
      },
    ]);
  }
  if (!checked.has(HISTORICAL_SECTION)) {
    checked.set(HISTORICAL_SECTION, [{ text: HISTORICAL_CONTEXT_LINE, eventIds: [], aliases: [], byCode: true }]);
  }
  const sections = SECTION_KEYS.filter((k) => checked.has(k)).map((key) => ({ key, sentences: checked.get(key)! }));
  return { ok: true, sections, sentenceCount, citedEvents: cited.size };
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
