/**
 * Registry lookups for the collector. Historical-only sources (migration 0008) are never
 * collected: a feed or listing naming one is refused, and GDELT results from their domains are
 * not attributed to them.
 */
import { domainOf } from "./store.mjs";

export type RegistryRow = { id: string; name: string; home_url: string | null; historical_only: boolean };

export type DomainEntry = { id: string; name: string; noAi: boolean; leadOnly: boolean };

export function buildRegistry(
  rows: RegistryRow[],
  flags: { noAiSources: ReadonlySet<string>; leadOnlySources: ReadonlySet<string> },
): { sourceIdFor: (name: string) => string; byDomain: Map<string, DomainEntry> } {
  const byName = new Map(rows.map((s) => [s.name, s]));
  const byDomain = new Map<string, DomainEntry>();
  // A domain shared by several current sources (gov.pl: the Polish MoD and RCB) is ambiguous, so
  // GDELT results from it are not attributed to either.
  const domainCounts = new Map<string, number>();
  for (const s of rows) {
    if (s.home_url && !s.historical_only) {
      const d = domainOf(s.home_url);
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    }
  }
  for (const s of rows) {
    if (s.home_url && !s.historical_only && domainCounts.get(domainOf(s.home_url)) === 1) {
      byDomain.set(domainOf(s.home_url), {
        id: s.id,
        name: s.name,
        noAi: flags.noAiSources.has(s.name),
        leadOnly: flags.leadOnlySources.has(s.name),
      });
    }
  }
  return {
    sourceIdFor(name) {
      const source = byName.get(name);
      if (!source) throw new Error(`source "${name}" is not in the registry`);
      if (source.historical_only) {
        throw new Error(`source "${name}" is historical-only and is never collected`);
      }
      return source.id;
    },
    byDomain,
  };
}
