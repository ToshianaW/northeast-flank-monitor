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

/**
 * Wording that would turn the side-by-side view or the digest's Historical Context section into
 * a comparison claim: phase labels, resemblance, outcomes, scores, percentages, trend arrows.
 * Stricter than PREDICTIVE and applied only to text that sets the two periods next to each other.
 */
export const COMPARISON_WORDING = [
  /\bphases?\b/i,
  /\bP[0-4]\b/,
  /\bresembl\w*/i,
  /\bsimilar\w*/i,
  /\banalog(ue|ous|y)?\b/i,
  /\bcomparable\b/i,
  /\balso seen\b/i,
  /\bmirror\w*/i,
  /\bpredict\w*/i,
  /\bforecast\w*/i,
  /\bwe are here\b/i,
  /\d\s?%/,
  /\bpercent\w*/i,
  /\bscor(e|es|ed|ing)\b/i,
  /\btrend\w*/i,
  /\bmatch(es|ed|ing)?\b/i,
  /\blikel(y|ihood)\b/i,
  /[↑↓↗↘▲▼]/,
];

/**
 * The one fixed caveat that names what the view does not claim. It necessarily uses words from
 * COMPARISON_WORDING, so findComparisonWording skips this exact sentence.
 */
export const COMPARISON_CAVEAT =
  "Sharing an event type does not mean the two periods resemble each other, and this record does not predict what happens next.";

/** The first comparison wording found in the text (the fixed caveat excluded), or null. */
export function findComparisonWording(text: string): string | null {
  const rest = text.replaceAll(COMPARISON_CAVEAT, " ");
  for (const re of COMPARISON_WORDING) {
    const match = rest.match(re);
    if (match) return match[0];
  }
  return null;
}
