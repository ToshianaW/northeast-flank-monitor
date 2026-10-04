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
  UNLINKED: "Reference removed. Automatic linking will not add this pair again.",
  AI_OFF: "AI suggestions are switched off on this server.",
} as const;

export type ReferenceMessage = keyof typeof REFERENCE_MESSAGES;

/** Short reason labels for a failed suggestion: fixed strings, never error text or secrets. */
export const FAILURE_REASONS = [
  "no candidates",
  "over cost cap",
  "no API key",
  "API key rejected",
  "rate limited",
  "API error",
  "model stopped early",
  "invalid reply",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/** The message for an outcome code, with "Reason: …" when a known reason label came with it. */
export function referenceMessage(
  value: string | string[] | undefined,
  reasonValue?: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || !(key in REFERENCE_MESSAGES)) return null;
  const message: string = REFERENCE_MESSAGES[key as ReferenceMessage];
  const reason = Array.isArray(reasonValue) ? reasonValue[0] : reasonValue;
  return reason && (FAILURE_REASONS as readonly string[]).includes(reason) ? `${message} Reason: ${reason}.` : message;
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

/** How a link was made (migration 0011). */
export type MatchedBy = "AUTO" | "REVIEWER";

/** Reviewer name stored on automatic links (the 0011 constraint requires it). */
export const AUTO_REVIEWER = "auto-match";
/** Reviewer name the unpublish-cleanup trigger writes; such removals do not block auto-linking. */
export const UNPUBLISH_REVIEWER = "system: unpublished";

/** Shown under every automatic link. */
export const AUTO_LINK_NOTE = "Linked automatically by event type and country.";
/** Added to "same kind of activity" on a reviewer link that came from an AI suggestion. */
export const AI_SUGGESTED_LABEL = "AI-suggested, reviewer-approved";

/**
 * "same event type (Exercise)", "same country (Belarus)", "same actor (…)", "same kind of
 * activity" (with "(AI-suggested, reviewer-approved)" when it came from the AI step). A data value
 * is shown only if it passes isSafeBoxText; otherwise the phrase stands alone.
 */
export function attributePhrase(attribute: ReferenceAttribute, current: ReferenceFields, aiSuggested = false): string {
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
      return aiSuggested ? `same kind of activity (${AI_SUGGESTED_LABEL})` : "same kind of activity";
  }
}

export type ApprovedReference = {
  historical_event_id: string;
  event_date: Date;
  headline: string;
  event_type: EventType;
  shared_attributes: ReferenceAttribute[];
  matched_by: MatchedBy;
  ai_suggested: boolean;
};

export type ReferenceLine = {
  href: string;
  /** The historical headline, or null when it fails isSafeBoxText (show date, type and link). */
  headline: string | null;
  date: string;
  typeLabel: string;
  /** "Shared: same event type (Exercise), same country (Belarus)." */
  shared: string;
  /** AUTO_LINK_NOTE for automatic links, otherwise null. */
  note: string | null;
};

/** One line of the public box, composed by code from the fixed list. */
export function referenceLine(ref: ApprovedReference, current: ReferenceFields): ReferenceLine {
  const attributes = REFERENCE_ATTRIBUTES.filter((a) => ref.shared_attributes.includes(a));
  return {
    href: `/historical/${ref.historical_event_id}`,
    headline: isSafeBoxText(ref.headline) ? ref.headline : null,
    date: referenceDate(ref.event_date),
    typeLabel: EVENT_TYPE_LABELS[ref.event_type],
    shared: `Shared: ${attributes.map((a) => attributePhrase(a, current, ref.ai_suggested)).join(", ")}.`,
    note: ref.matched_by === "AUTO" ? AUTO_LINK_NOTE : null,
  };
}

export const VIEW_ENTRY = "View entry";

/** "Historical record, not current reporting." */
export const HISTORICAL_LABEL_TEXT = HISTORICAL_LABEL;

/** Fixed strings in the box, for the wording test. */
export const BOX_STRINGS = [REFERENCES_HEADING, HISTORICAL_LABEL_TEXT, SIMILARITY_CAVEAT, VIEW_ENTRY, AUTO_LINK_NOTE, AI_SUGGESTED_LABEL];

/** Every text node a box with these lines shows, joined: what the wording test checks. */
export function boxText(lines: readonly ReferenceLine[]): string {
  return [
    REFERENCES_HEADING,
    HISTORICAL_LABEL_TEXT,
    ...lines.map((l) =>
      [l.headline ?? `${l.date} · ${l.typeLabel} · ${VIEW_ENTRY}`, l.date, l.shared, l.note ?? ""].join(" "),
    ),
    SIMILARITY_CAVEAT,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Automatic links (no model): same event type AND same country
// ---------------------------------------------------------------------------

export type AutoEvent = ReferenceFields & { event_id: string };

/** 32-bit FNV-1a: a fixed, portable hash so the same pair always ranks the same way. */
export function pairHash(eventId: string, historicalEventId: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${eventId}:${historicalEventId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Up to `slots` automatic links for one event. Candidates must share the event type AND a
 * non-empty country (compared case- and space-insensitively); already linked or reviewer-removed
 * pairs are excluded. Order: same actor first; then fewest existing links (spreads links across
 * the record); then a fixed per-pair hash (deterministic, but different for each event).
 */
export function rankAutoLinks(
  current: AutoEvent,
  candidates: readonly AutoEvent[],
  options: { slots: number; linkCounts: ReadonlyMap<string, number>; excluded: ReadonlySet<string> },
): Array<{ historical_event_id: string; attributes: ReferenceAttribute[] }> {
  if (options.slots <= 0 || norm(current.country) === "") return [];
  const ranked = candidates
    .filter(
      (h) =>
        h.event_type === current.event_type &&
        norm(h.country) === norm(current.country) &&
        !options.excluded.has(h.event_id),
    )
    .map((h) => ({
      h,
      sameActor: norm(current.actor) !== "" && norm(h.actor) === norm(current.actor),
      links: options.linkCounts.get(h.event_id) ?? 0,
      hash: pairHash(current.event_id, h.event_id),
    }))
    .sort((a, b) => Number(b.sameActor) - Number(a.sameActor) || a.links - b.links || a.hash - b.hash || (a.h.event_id < b.h.event_id ? -1 : 1));
  return ranked.slice(0, options.slots).map(({ h, sameActor }) => ({
    historical_event_id: h.event_id,
    attributes: sameActor ? ["SAME_EVENT_TYPE", "SAME_COUNTRY", "SAME_ACTOR"] : ["SAME_EVENT_TYPE", "SAME_COUNTRY"],
  }));
}

/**
 * The backfill plan: events in the given order (oldest first), each filling its free slots, with
 * link counts updated as it goes so later events spread to less-used entries.
 */
export function planAutoLinks(
  events: readonly AutoEvent[],
  historical: readonly AutoEvent[],
  state: {
    existingByEvent: ReadonlyMap<string, readonly string[]>;
    linkCounts: ReadonlyMap<string, number>;
    removedPairs: ReadonlySet<string>;
  },
): Map<string, Array<{ historical_event_id: string; attributes: ReferenceAttribute[] }>> {
  const counts = new Map(state.linkCounts);
  const plan = new Map<string, Array<{ historical_event_id: string; attributes: ReferenceAttribute[] }>>();
  for (const e of events) {
    const existing = state.existingByEvent.get(e.event_id) ?? [];
    const excluded = new Set(existing);
    for (const h of historical) if (state.removedPairs.has(`${e.event_id}:${h.event_id}`)) excluded.add(h.event_id);
    const links = rankAutoLinks(e, historical, { slots: MAX_REFERENCES - existing.length, linkCounts: counts, excluded });
    for (const l of links) counts.set(l.historical_event_id, (counts.get(l.historical_event_id) ?? 0) + 1);
    plan.set(e.event_id, links);
  }
  return plan;
}

