/**
 * Source policy shared by the historical workers: the registry (read only) and the domains no
 * worker fetches or sends to a model (blocked automated access, terms prohibiting it, citation-only, no_ai_processing), from
 * data/sources/collector.json.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { domainOf } from "../collector/store.mjs";
import type { DomainPolicy } from "./verify.mjs";

export type CollectorConfig = {
  user_agent: string;
  request_timeout_ms: number;
  per_host_interval_ms: number;
  no_ai_processing_sources: string[];
  citation_only_sources: string[];
  blocked_automated_access: string[];
  tos_prohibited_domains: string[];
  feeds: Array<{ source: string; no_ai_processing?: boolean }>;
  listings: Array<{ source: string; no_ai_processing?: boolean }>;
};

export async function loadPolicy(
  repoRoot: string,
  connectionString: string,
): Promise<{ config: CollectorConfig; policy: DomainPolicy; blockedDomains: string[] }> {
  const config = JSON.parse(readFileSync(`${repoRoot}data/sources/collector.json`, "utf8")) as CollectorConfig;

  const db = new pg.Client({ connectionString });
  await db.connect();
  const { rows: registry } = await db.query<{ name: string; home_url: string | null; tier: number | null }>(
    "SELECT name, home_url, tier FROM sources",
  );
  await db.end();

  const homeDomain = (name: string) => {
    const s = registry.find((r) => r.name === name);
    return s?.home_url ? domainOf(s.home_url) : null;
  };
  const noAi = new Set([
    ...config.no_ai_processing_sources,
    ...config.feeds.filter((f) => f.no_ai_processing).map((f) => f.source),
    ...config.listings.filter((l) => l.no_ai_processing).map((l) => l.source),
  ]);
  const policy: DomainPolicy = {
    registry,
    barred: [
      ...config.blocked_automated_access.map((domain) => ({ domain, why: "site blocks automated access (terms not read)" })),
      ...config.tos_prohibited_domains.map((domain) => ({ domain, why: "terms prohibit automated access or AI use (decision 9)" })),
      ...config.citation_only_sources.flatMap((n) => (homeDomain(n) ? [{ domain: homeDomain(n)!, why: `citation-only (${n})` }] : [])),
      ...[...noAi].flatMap((n) => (homeDomain(n) ? [{ domain: homeDomain(n)!, why: `no_ai_processing (${n})` }] : [])),
    ],
  };
  return { config, policy, blockedDomains: [...new Set(policy.barred.map((b) => b.domain))].slice(0, 64) };
}
