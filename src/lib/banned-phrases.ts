/**
 * Predictive or intent-reading phrases (project rule: no predictive language).
 * Shared by the extractor (drops events), the digest generator (fails the digest),
 * and the admin digest form (refuses to save an AI digest that contains one).
 */
export const PREDICTIVE = [
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

/** The first banned phrase found in the text, or null. */
export function findBannedPhrase(text: string): string | null {
  for (const re of PREDICTIVE) {
    const match = text.match(re);
    if (match) return match[0];
  }
  return null;
}
