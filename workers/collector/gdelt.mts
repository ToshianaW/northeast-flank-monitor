import type { HttpClient } from "./fetch.mjs";
import { domainOf, type CollectedDoc } from "./store.mjs";

export type GdeltConfig = {
  endpoint: string;
  min_interval_ms: number;
  retry_after_429_ms: number;
  max_records: number;
  queries: Array<{ key: string; query: string }>;
};

type GdeltArticle = {
  url: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

/** "20261002T080000Z" → Date */
function parseSeenDate(value: string | undefined): Date | null {
  const m = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/**
 * One DOC 2.0 artlist query over the last lookback window. Results are leads:
 * metadata only, no article pages fetched. Retries once after HTTP 429.
 */
export async function collectGdelt(
  http: HttpClient,
  config: GdeltConfig,
  query: { key: string; query: string },
  lookbackHours: number,
  registryByDomain: Map<string, { id: string; name: string; noAi: boolean; leadOnly: boolean }>,
): Promise<CollectedDoc[]> {
  const params = new URLSearchParams({
    query: query.query,
    mode: "artlist",
    format: "json",
    maxrecords: String(config.max_records),
    timespan: `${lookbackHours}h`,
    sort: "datedesc",
  });
  const url = `${config.endpoint}?${params}`;

  let res = await http.get(url, { minIntervalMs: config.min_interval_ms });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, config.retry_after_429_ms));
    res = await http.get(url, { minIntervalMs: config.min_interval_ms });
  }
  if (res.status < 200 || res.status >= 300) throw new Error(`GDELT returned HTTP ${res.status}`);

  let parsed: { articles?: GdeltArticle[] };
  try {
    parsed = JSON.parse(res.body);
  } catch {
    // GDELT answers query-syntax problems with a short plain-text message.
    throw new Error(`GDELT did not return JSON: ${res.body.slice(0, 120).replace(/\s+/g, " ")}`);
  }

  return (parsed.articles ?? [])
    .filter((a) => typeof a.url === "string" && /^https?:\/\//.test(a.url))
    .map((a) => {
      const registry = registryByDomain.get(domainOf(a.url));
      return {
        sourceId: registry?.id ?? null,
        publisherName: registry?.name ?? null,
        collectedVia: "GDELT" as const,
        collectorKey: query.key,
        url: a.url,
        title: a.title?.trim() || null,
        publishedAt: parseSeenDate(a.seendate),
        language: a.language ?? null,
        rawText: null,
        textKind: "METADATA_ONLY" as const,
        metadata: {
          gdelt_query: query.query,
          seendate: a.seendate ?? null,
          domain: a.domain ?? null,
          sourcecountry: a.sourcecountry ?? null,
          // Publisher not in the registry, or a lead-only source: skipped by later steps by default.
          ...(!registry || registry.leadOnly ? { lead_only: true } : {}),
          ...(registry?.noAi ? { no_ai_processing: true } : {}),
          url_mobile: a.url_mobile ?? null,
          socialimage: a.socialimage ?? null,
        },
      };
    });
}
