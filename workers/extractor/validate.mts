import type { ExtractedEvent } from "./prompt.mjs";

export const MAX_EXCERPT_WORDS = 20;
const OLD_EVENT_DAYS = 30;

/** Folds the differences a faithful quote may still show: Unicode form, quotes, dashes, spacing, case. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Dropped outright: predictive or intent-reading phrases (project rule: no predictive language).
const PREDICTIVE = [
  /\bimminent\b/i,
  /\bwill likely\b/i,
  /\blikely to (attack|invade|escalate|strike)\b/i,
  /\b(could|may|might) lead to\b/i,
  /\bprepar(e|es|ing) (to|for an?) (attack|invasion|invade|war)\b/i,
  /\bin preparation for (an? )?(attack|invasion|war)\b/i,
  /\bwar is coming\b/i,
  /\binvasion is (likely|imminent|coming)\b/i,
  /\bsignal(s|ed|led|ing|ling)? that\b/i,
  /\bsignal(s|ed|led|ing|ling)? (an? |its |their )?intent(ion)?s?\b/i,
];
// Any other use of "signal" is kept but flagged for the reviewer.
const SIGNAL_WORD = /\bsignal(s|ed|led|ing|ling)?\b/i;
// Decimal coordinate pairs, degree marks, or MGRS-style grid references.
const COORDINATES = /\d{1,3}[.,]\d{2,}\s*°?\s*[NSEW]?\s*[,;/ ]\s*\d{1,3}[.,]\d{2,}|\d+\s*°|\b\d{1,2}[C-X]\s?[A-Z]{2}\s?\d{4,10}\b/;

// Summaries attribute claims and nothing more; sentences commenting on verification are removed.
const VERIFICATION_COMMENTARY = /\b(not (independently )?verified|unverified|official claim)\b/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Drops summary sentences that comment on verification; returns the cleaned text and how many were removed. */
function stripVerificationCommentary(summary: string): { text: string; removed: number } {
  const sentences = summary.match(/[^.!?]+(?:[.!?]+["'”]?|$)/g) ?? [summary];
  const kept = sentences.filter((s) => !VERIFICATION_COMMENTARY.test(s));
  return { text: kept.join("").trim(), removed: sentences.length - kept.length };
}

function parseIsoDate(value: string | null): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export type ValidatedEvent = {
  event: ExtractedEvent;
  eventDate: Date;
  announcedStart: Date | null;
  announcedEnd: Date | null;
  /** Reviewer notes from validation (kept events only). */
  flags: string[];
};

export type ValidationOutcome =
  | { ok: true; value: ValidatedEvent }
  | { ok: false; reason: string };

export function validateEvent(
  extracted: ExtractedEvent,
  doc: { title: string | null; text: string; publishedAt: Date },
): ValidationOutcome {
  const flags: string[] = [];
  const cleaned = stripVerificationCommentary(extracted.summary);
  if (cleaned.removed > 0) flags.push(`Removed ${cleaned.removed} verification-commentary sentence(s) from the summary.`);
  if (!cleaned.text) return { ok: false, reason: "summary was only verification commentary" };
  const event: ExtractedEvent = { ...extracted, summary: cleaned.text };

  const excerpt = event.supporting_excerpt.trim();
  if (!excerpt) return { ok: false, reason: "empty excerpt" };
  const words = excerpt.split(/\s+/).length;
  if (words > MAX_EXCERPT_WORDS) return { ok: false, reason: `excerpt has ${words} words (max ${MAX_EXCERPT_WORDS})` };
  if (!normalize(`${doc.title ?? ""}\n${doc.text}`).includes(normalize(excerpt))) {
    return { ok: false, reason: "excerpt not found verbatim in source text" };
  }

  const eventDate = parseIsoDate(event.event_date);
  if (!eventDate) return { ok: false, reason: `invalid event_date "${event.event_date}"` };
  const publishedDay = new Date(`${doc.publishedAt.toISOString().slice(0, 10)}T00:00:00Z`);
  if (eventDate > publishedDay) {
    return { ok: false, reason: `event_date ${event.event_date} is after the published date` };
  }

  const wording = `${event.headline}\n${event.summary}`;
  const predictive = PREDICTIVE.find((re) => re.test(wording));
  if (predictive) return { ok: false, reason: `predictive wording: "${wording.match(predictive)![0]}"` };

  if (event.location_name && COORDINATES.test(event.location_name)) {
    return { ok: false, reason: "location_name contains coordinates" };
  }

  if (SIGNAL_WORD.test(wording)) flags.push(`Wording uses "${wording.match(SIGNAL_WORD)![0]}"; check it does not read intent.`);
  const ageDays = (publishedDay.getTime() - eventDate.getTime()) / 86_400_000;
  if (ageDays > OLD_EVENT_DAYS) flags.push(`Event date is ${Math.round(ageDays)} days before publication.`);

  let announcedStart = parseIsoDate(event.announced_start_date);
  let announcedEnd = parseIsoDate(event.announced_end_date);
  if (event.announced_start_date && !announcedStart) flags.push(`Dropped invalid announced_start_date "${event.announced_start_date}".`);
  if (event.announced_end_date && !announcedEnd) flags.push(`Dropped invalid announced_end_date "${event.announced_end_date}".`);
  if (announcedStart && announcedEnd && announcedEnd < announcedStart) {
    flags.push(`Dropped announced dates: end ${event.announced_end_date} is before start ${event.announced_start_date}.`);
    announcedStart = null;
    announcedEnd = null;
  }

  return { ok: true, value: { event, eventDate, announcedStart, announcedEnd, flags } };
}
