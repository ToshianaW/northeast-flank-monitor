/**
 * Reviewer-approved "similar in nature" historical references on current event pages
 * (migration 0010). Pure: the fixed attribute list, the code-composed box wording, and the
 * checks on what the model suggests. No database access here.
 */
import {
  findBannedPhrase,
  findComparisonWording,
  REFERENCES_HEADING,
  SIMILARITY_CAVEAT,
} from "@/lib/banned-phrases";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/event-labels";
import { HISTORICAL_LABEL } from "@/lib/historical-rules";

export { REFERENCES_HEADING, SIMILARITY_CAVEAT };

/** Values must match the reference_attribute enum in 0010_historical_references.sql. */
export const REFERENCE_ATTRIBUTES = ["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_ACTOR", "SAME_KIND_OF_ACTIVITY"] as const;
export type ReferenceAttribute = (typeof REFERENCE_ATTRIBUTES)[number];

/** Same limit as the database trigger. */
export const MAX_REFERENCES = 3;

export function isReferenceAttribute(value: unknown): value is ReferenceAttribute {
  return typeof value === "string" && (REFERENCE_ATTRIBUTES as readonly string[]).includes(value);
}

/** Admin labels for the attribute checkboxes. */
export const ATTRIBUTE_LABELS: Record<ReferenceAttribute, string> = {
  SAME_EVENT_TYPE: "Same event type",
  SAME_COUNTRY: "Same country",
  SAME_ACTOR: "Same actor",
  SAME_KIND_OF_ACTIVITY: "Same kind of activity",
};

/**
 * Suggestions travel back to the admin page in the URL (no state kept server-side):
 * "<uuid>:SAME_EVENT_TYPE+SAME_COUNTRY,<uuid>:…". Anything malformed is dropped.
 */
export function encodeSuggestions(list: ReadonlyArray<{ historical_event_id: string; attributes: readonly ReferenceAttribute[] }>): string {
  return list.map((s) => `${s.historical_event_id}:${s.attributes.join("+")}`).join(",");
}

export function decodeSuggestions(value: string | string[] | undefined): Array<{ historical_event_id: string; attributes: ReferenceAttribute[] }> {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  const out: Array<{ historical_event_id: string; attributes: ReferenceAttribute[] }> = [];
  for (const part of raw.split(",").slice(0, MAX_REFERENCES)) {
    const [id, attrs = ""] = part.split(":");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "")) continue;
    const attributes = REFERENCE_ATTRIBUTES.filter((a) => attrs.split("+").includes(a));
    if (attributes.length > 0) out.push({ historical_event_id: id, attributes });
  }
  return out;
}

/** Outcome codes the admin actions return in the URL, with the message shown for each. */
export const REFERENCE_MESSAGES = {
  NOT_APPLIED: "Historical references are not available yet: migration 0010 has not been applied.",
  NOT_PUBLISHED: "Only a published event can reference the historical record.",
  NO_SHORTLIST: "No published historical entry has the same event type or country.",
  SPEND_CAP: "The suggestion request would exceed the per-click cap, so it was not sent.",
  MODEL_ERROR: "The suggestion request failed. Nothing was changed.",
  NONE_SUGGESTED: "No historical entry was suggested.",
  SUGGESTED: "Suggestions below. Nothing is linked until you approve it.",
  REVIEWER: "Enter your reviewer name.",
  NONE_SELECTED: "No reference was approved.",
  LIMIT: "This event already has 3 historical references (the maximum), or one of the events is no longer published.",
  PARTIAL_LIMIT: "Some references were saved; the rest would exceed the maximum of 3 or are no longer published.",
  LINKED: "References saved.",
  UNLINKED: "Reference removed.",
} as const;

export type ReferenceMessage = keyof typeof REFERENCE_MESSAGES;

export function referenceMessage(value: string | string[] | undefined): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && key in REFERENCE_MESSAGES ? REFERENCE_MESSAGES[key as ReferenceMessage] : null;
}

/** The public fields both sides are compared on. */
export type ReferenceFields = { event_type: EventType; country: string | null; actor: string | null };

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

/**
 * Keeps only attributes that hold: type, country and actor are checked by equality here;
 * "same kind of activity" is a judgement left to the reviewer. Unknown values and repeats are
 * dropped; the result is in the fixed list order.
 */
export function verifiedAttributes(
  current: ReferenceFields,
  historical: ReferenceFields,
  proposed: readonly unknown[],
): ReferenceAttribute[] {
  const wanted = new Set(proposed.filter(isReferenceAttribute));
  return REFERENCE_ATTRIBUTES.filter((a) => {
    if (!wanted.has(a)) return false;
    if (a === "SAME_EVENT_TYPE") return current.event_type === historical.event_type;
    if (a === "SAME_COUNTRY") return norm(current.country) !== "" && norm(current.country) === norm(historical.country);
    if (a === "SAME_ACTOR") return norm(current.actor) !== "" && norm(current.actor) === norm(historical.actor);
    return true;
  });
}

/** Text that may appear in the box: no predictive phrase and no comparison wording. */
export function isSafeBoxText(text: string): boolean {
  return findBannedPhrase(text) === null && findComparisonWording(text) === null;
}

const DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "15 Jan 2021" */
export function referenceDate(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split("-");
  return `${Number(day)} ${DATE_MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * "same event type (Exercise)", "same country (Belarus)", "same actor (…)", "same kind of
 * activity". A data value is shown only if it passes isSafeBoxText; otherwise the phrase stands
 * alone.
 */
export function attributePhrase(attribute: ReferenceAttribute, current: ReferenceFields): string {
  const withValue = (phrase: string, value: string | null) =>
    value && value.trim() && isSafeBoxText(value) ? `${phrase} (${value.trim()})` : phrase;
  switch (attribute) {
    case "SAME_EVENT_TYPE":
      return `same event type (${EVENT_TYPE_LABELS[current.event_type]})`;
    case "SAME_COUNTRY":
      return withValue("same country", current.country);
    case "SAME_ACTOR":
      return withValue("same actor", current.actor);
    case "SAME_KIND_OF_ACTIVITY":
      return "same kind of activity";
  }
}

export type ApprovedReference = {
  historical_event_id: string;
  event_date: Date;
  headline: string;
  event_type: EventType;
  shared_attributes: ReferenceAttribute[];
};

export type ReferenceLine = {
  href: string;
  /** The historical headline, or null when it fails isSafeBoxText (show date, type and link). */
  headline: string | null;
  date: string;
  typeLabel: string;
  /** "Shared: same event type (Exercise), same country (Belarus)." */
  shared: string;
};

/** One line of the public box, composed by code from the fixed list. */
export function referenceLine(ref: ApprovedReference, current: ReferenceFields): ReferenceLine {
  const attributes = REFERENCE_ATTRIBUTES.filter((a) => ref.shared_attributes.includes(a));
  return {
    href: `/historical/${ref.historical_event_id}`,
    headline: isSafeBoxText(ref.headline) ? ref.headline : null,
    date: referenceDate(ref.event_date),
    typeLabel: EVENT_TYPE_LABELS[ref.event_type],
    shared: `Shared: ${attributes.map((a) => attributePhrase(a, current)).join(", ")}.`,
  };
}

export const VIEW_ENTRY = "View entry";

/** "Historical record, not current reporting." */
export const HISTORICAL_LABEL_TEXT = HISTORICAL_LABEL;

/** Fixed strings in the box, for the wording test. */
export const BOX_STRINGS = [REFERENCES_HEADING, HISTORICAL_LABEL_TEXT, SIMILARITY_CAVEAT, VIEW_ENTRY];

/** Every text node a box with these lines shows, joined: what the wording test checks. */
export function boxText(lines: readonly ReferenceLine[]): string {
  return [
    REFERENCES_HEADING,
    HISTORICAL_LABEL_TEXT,
    ...lines.map((l) => [l.headline ?? `${l.date} · ${l.typeLabel} · ${VIEW_ENTRY}`, l.date, l.shared].join(" ")),
    SIMILARITY_CAVEAT,
  ].join("\n");
}

