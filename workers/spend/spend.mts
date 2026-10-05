/**
 * The job summary's spend line, from recorded costs only. Pure, so it is tested without a database.
 */

export type SpendTotals = {
  /** USD in the last 24 hours and the last 30 days: extractor + dedup + digest. */
  last24h: number;
  last30d: number;
  /** AI-drafted digests in the last 30 days saved before their cost was recorded in _meta. */
  digestsWithoutCost: number;
};

export const SPEND_UNAVAILABLE = "API spend: unavailable";

const usd = (n: number) => `$${n.toFixed(2)}`;

export function formatSpendLine(t: SpendTotals): string {
  const line = `API spend: last 24 h ${usd(t.last24h)} · last 30 days ${usd(t.last30d)}`;
  if (t.digestsWithoutCost === 0) return line;
  const n = t.digestsWithoutCost;
  return `${line} (${n} digest${n === 1 ? "" : "s"} drafted before costs were recorded not included)`;
}
