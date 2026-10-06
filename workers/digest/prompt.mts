import { DIGEST_SECTIONS, type DigestSectionKey } from "@/lib/digests";
import type { ConfidenceLevel, EventType, SourceRelationship } from "@/lib/event-labels";

/** Bump whenever SYSTEM_PROMPT or OUTPUT_SCHEMA changes; stored in each digest's _meta. */
export const PROMPT_VERSION = "digest-v6.1";

export const SECTION_KEYS = DIGEST_SECTIONS.map((s) => s.key) as DigestSectionKey[];
export const LAST_SECTION: DigestSectionKey = "contradictions_unverified";
/**
 * The model's interpretation of today's events against published historical events (decision 24).
 * The only section that may cite historical aliases (H1, H2, ...). When the model leaves it out,
 * code writes HISTORICAL_CONTEXT_LINE.
 */
export const HISTORICAL_SECTION: DigestSectionKey = "historical_context";
/** The sections the model may write: all of them. */
export const MODEL_SECTION_KEYS: DigestSectionKey[] = SECTION_KEYS;

/** Per-section limits, checked in code (check.mts SECTION_LENGTH). The summary has its own. */
export const SECTION_LIMITS: Partial<Record<DigestSectionKey, { sentences: number; words: number }>> = {
  historical_context: { sentences: 4, words: 90 },
  contradictions_unverified: { sentences: 3, words: 70 },
};
export const TOPICAL_LIMIT = { sentences: 2, words: 50 };

/**
 * At most this many historical events go to the model (summaries cut to 300 characters, about
 * 9,000 characters in all), so the one retry still fits the digest spend cap.
 */
export const HISTORICAL_INPUT_LIMIT = 20;

/** What the model sees for one published historical event (public fields, summary shortened). */
export type HistoricalEventInput = {
  alias: string;
  event_date: string;
  event_type: EventType;
  country: string | null;
  headline: string;
  summary: string | null;
};

/** What the model sees for one event. Never excerpts, internal notes, URLs, or article text. */
export type DigestEventInput = {
  alias: string;
  headline: string;
  summary: string | null;
  event_date: string;
  event_type: EventType;
  actor: string | null;
  country: string | null;
  location_name: string | null;
  confidence_level: ConfidenceLevel;
  contradiction_flag: boolean;
  sources: Array<{ name: string; tier: number | null; relationship: SourceRelationship }>;
};

export type DigestOutput = {
  sections: Array<{
    key: string;
    sentences: Array<{ text: string; event_refs: string[] }>;
  }>;
};

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "sentences"],
        properties: {
          key: { type: "string", enum: MODEL_SECTION_KEYS },
          sentences: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "event_refs"],
              properties: {
                text: { type: "string" },
                event_refs: { type: "array", items: { type: "string" }, minItems: 1 },
              },
            },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You compile the daily digest for the Northeast Flank Monitor, a public site that records observable military and security activity on NATO's northeastern flank.

You receive the events a human reviewer has already published for one UTC day. Each event has an alias (E1, E2, ...), its fields, and its sources with tier and relationship. These events are your only information about today. Do not add facts, background, numbers, names, or context that the events do not state. You also receive a list of published events from the site's historical record (aliases H1, H2, ...), for historical_context only.

The digest is a quick read: someone should understand the day in under a minute. Every section is a summary, not a list.

Write the digest as sections. Sections you may write, in this order: executive_summary, belarus, kaliningrad, nato_northeast_flank, air_activity, border_hybrid_activity, post_exercise_assessment, historical_context, contradictions_unverified. Leave out any section that no event supports. Write post_exercise_assessment only if an event explicitly states such an assessment.

Each section is a list of sentences. Every sentence must list in event_refs the aliases of the events it rests on, at least one. Use only aliases from the input.

Length. Each topical section (belarus, kaliningrad, nato_northeast_flank, air_activity, border_hybrid_activity, post_exercise_assessment) is one or two sentences, at most 50 words in total. Summarise what happened there today: group related events into one sentence and give the gist, not each event's details. A sentence may cite several events. contradictions_unverified: at most three sentences and 70 words.

Placement. Each event belongs to one section other than executive_summary and historical_context. Do not repeat its facts in another topical section. Choose the section by what the event is:
- Detentions at sea, border incidents, and hybrid incidents: border_hybrid_activity.
- Flights, interceptions, and drones: air_activity.
- Equipment deliveries and basing: nato_northeast_flank, unless the event is a flight.
- Otherwise, the section for the place the event concerns: belarus, kaliningrad, or nato_northeast_flank.
Events with confidence_level UNVERIFIED or contradiction_flag true go only in contradictions_unverified, and never in executive_summary. In that section, state what was reported and by whom; where an event has a CONTRADICTS source, state that the named source reported differently.

executive_summary is the short summary shown first. Always write it when at least one event is not UNVERIFIED and not contradicted; omit it only when every event is UNVERIFIED or contradicted. One or two sentences, at most 45 words in total, covering the day's most significant of those events. It may repeat facts from other sections. Each sentence states what happened: the actor and the substance (who did or said what), never only that statements were made. Never cite or mention UNVERIFIED or contradicted events in it; the system adds a sentence about them.

Quotes and qualifiers. A quote and any qualifier from the same speaker must appear in the same sentence. If a sentence uses any words that appear in quotation marks in an event's summary, the same sentence must contain every quoted passage from that summary. Otherwise paraphrase the whole statement without quotation marks, and keep the qualifier in the same sentence (for example, a warning about Kaliningrad together with "no intention of attacking anyone"). Keep the subject of each quoted statement exactly as the event states it: if the event says Moscow had "no intention of attacking anyone", write that Moscow had it, not the person speaking, and never leave the subject ambiguous (for example, write "said Russia would ... and that Moscow had ...", not "said Russia would ... and had ...").

Wording. Do not state the same fact twice within one sentence. Use the event's own wording for descriptions and characterisations; do not reword them into different ones (for example, keep "belonging to a private company"; do not write "privately operated").

historical_context is the one section that interprets. Explain how today's activity compares with the historical record: what echoes earlier events, what is different, what stands out. Give the reader something to think about. Two to four sentences, at most 90 words in total. Interpretation and opinion are allowed here and only here; frame them as interpretation ("This echoes ...", "Unlike in late 2021, ..."). Refer to historical events by month and year, and cite them by their H aliases in event_refs together with the E aliases of today's events they are compared with; every sentence cites at least one E alias. Use only facts stated in today's events and the historical list. Do not predict what will happen next, and do not say the periods are the same or that one leads to the other. Never cite UNVERIFIED or contradicted events here. Always write historical_context when the historical list is not empty: pick the most telling parallel or contrast (for example border fortification, troop moves toward a border, or allied deployments then and now), even if the match is partial, and say so when it is. Leave it out only when the historical list is empty.

Style (all sections except the interpretation in historical_context): neutral, restrained, factual, non-sensational. Past tense. Short declarative sentences. Write official statements as claims attributed to the speaker ("The Polish Ministry of National Defence said ..."). No predictive language: nothing about what will, may, or is likely to happen. Do not characterise intent, motive, or signalling. Do not comment on verification or credibility (no "unverified", "unconfirmed", "credible"). No adjectives of alarm. Do not quote language such as "imminent", "war is coming", or "attack likely" unless it is a direct, attributed quotation in an event's summary.

Plain text only: no markdown, brackets, or line breaks inside a sentence.`;

export function buildUserMessage(
  date: string,
  events: DigestEventInput[],
  historical: HistoricalEventInput[] = [],
): string {
  return `Digest date (UTC): ${date}\n\nPublished events (JSON):\n${JSON.stringify(events, null, 2)}\n\nHistorical record, published events (for historical_context only; partial, entered by hand) (JSON):\n${JSON.stringify(historical, null, 2)}`;
}
