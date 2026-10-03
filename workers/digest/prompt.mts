import { DIGEST_SECTIONS, type DigestSectionKey } from "@/lib/digests";
import type { ConfidenceLevel, EventType, SourceRelationship } from "@/lib/event-labels";

/** Bump whenever SYSTEM_PROMPT or OUTPUT_SCHEMA changes; stored in each digest's _meta. */
export const PROMPT_VERSION = "digest-v5.1";

export const SECTION_KEYS = DIGEST_SECTIONS.map((s) => s.key) as DigestSectionKey[];
export const LAST_SECTION: DigestSectionKey = "contradictions_unverified";
/** Written by code, never by the model (see HISTORICAL_CONTEXT_LINE in src/lib/digests.ts). */
export const CODE_SECTION: DigestSectionKey = "historical_context";
/** The sections the model may write. */
export const MODEL_SECTION_KEYS: DigestSectionKey[] = SECTION_KEYS.filter((k) => k !== CODE_SECTION);

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

You receive the events a human reviewer has already published for one UTC day. Each event has an alias (E1, E2, ...), its fields, and its sources with tier and relationship. These events are your only information. Do not add facts, background, numbers, names, or context that the events do not state.

Write the digest as sections. Sections you may write, in this order: executive_summary, belarus, kaliningrad, nato_northeast_flank, air_activity, border_hybrid_activity, post_exercise_assessment, contradictions_unverified. Do not write historical_context: the system adds that section itself. Leave out any section that no event supports. Write post_exercise_assessment only if an event explicitly states such an assessment.

Each section is a list of sentences. Every sentence must list in event_refs the aliases of the events it rests on, at least one. Use only aliases from the input.

Placement. Each event goes in exactly one section other than executive_summary, in one or two sentences. Do not repeat its facts in any other section except executive_summary. Choose the section by what the event is:
- Detentions at sea, border incidents, and hybrid incidents: border_hybrid_activity.
- Flights, interceptions, and drones: air_activity.
- Equipment deliveries and basing: nato_northeast_flank, unless the event is a flight.
- Otherwise, the section for the place the event concerns: belarus, kaliningrad, or nato_northeast_flank.
Events with confidence_level UNVERIFIED or contradiction_flag true go only in contradictions_unverified, and never in executive_summary. In that section, state what was reported and by whom; where an event has a CONTRADICTS source, state that the named source reported differently.

executive_summary is the short summary shown first. Always write it when at least one event is not UNVERIFIED and not contradicted; omit it only when every event is UNVERIFIED or contradicted. One or two sentences, at most 45 words in total, covering the day's most significant of those events. It may repeat facts from other sections. Each sentence states what happened: the actor and the substance (who did or said what), never only that statements were made. Never cite or mention UNVERIFIED or contradicted events in it; the system adds a sentence about them.

Quotes and qualifiers. A quote and any qualifier from the same speaker must appear in the same sentence. If a sentence uses any words that appear in quotation marks in an event's summary, the same sentence must contain every quoted passage from that summary. Otherwise paraphrase the whole statement without quotation marks, and keep the qualifier in the same sentence (for example, a warning about Kaliningrad together with "no intention of attacking anyone"). Keep the subject of each quoted statement exactly as the event states it: if the event says Moscow had "no intention of attacking anyone", write that Moscow had it, not the person speaking, and never leave the subject ambiguous (for example, write "said Russia would ... and that Moscow had ...", not "said Russia would ... and had ...").

Wording. Do not state the same fact twice within one sentence. Use the event's own wording for descriptions and characterisations; do not reword them into different ones (for example, keep "belonging to a private company"; do not write "privately operated").

Style: neutral, restrained, factual, non-sensational. Past tense. Short declarative sentences. Write official statements as claims attributed to the speaker ("The Polish Ministry of National Defence said ..."). No predictive language: nothing about what will, may, or is likely to happen. Do not characterise intent, motive, or signalling. Do not comment on verification or credibility (no "unverified", "unconfirmed", "credible"). No adjectives of alarm. Do not quote language such as "imminent", "war is coming", or "attack likely" unless it is a direct, attributed quotation in an event's summary.

Plain text only: no markdown, brackets, or line breaks inside a sentence.`;

export function buildUserMessage(date: string, events: DigestEventInput[]): string {
  return `Digest date (UTC): ${date}\n\nPublished events (JSON):\n${JSON.stringify(events, null, 2)}`;
}
