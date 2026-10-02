import Parser from "rss-parser";
import type { HttpClient } from "./fetch.mjs";
import { htmlToText, type CollectedDoc } from "./store.mjs";

export type FeedConfig = {
  key: string;
  source: string;
  url: string;
  language: string;
  keyword_filter: boolean;
  /** Stored as usual, but marked so later steps never send the text to an AI model. */
  no_ai_processing: boolean;
  /** Store title and link only (no feed text); keyword matching then uses the title alone. */
  metadata_only?: boolean;
  /** Also require a region term; items missing one are stored as SKIPPED. */
  region_filter?: boolean;
  /** Rows are leads only; later steps skip them by default. */
  lead_only?: boolean;
  /** Record which outlets the item credits (metadata.credited_publishers / credit_found). */
  extract_credits?: boolean;
  /** Skip the feed when it was read less than this many hours ago (checked in collect.mts). */
  min_hours_between_reads?: number;
};

export type FeedMatchers = {
  keyword: (text: string) => boolean;
  region: (text: string) => boolean;
  credits: (text: string) => string[];
};

type FeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  summary?: string;
  "content:encoded"?: string;
};

const parser = new Parser<Record<string, unknown>, FeedItem>({
  customFields: { item: ["content:encoded", "summary"] },
});

/** Case-insensitive match at a word start, so "mobili" would match "mobilization". */
export function makeKeywordMatcher(keywords: string[]): (text: string) => boolean {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join("|")})`, "iu");
  return (text) => re.test(text);
}

const CREDIT_VERBS = "according to|reported by|reporting by|citing|cited by|per|via|told|said to|reports from";

/**
 * Outlets an item credits, from a fixed list: "according to Reuters", "citing the WSJ",
 * or "Reuters reported". Names not on the list are not guessed.
 */
export function makeCreditExtractor(outlets: string[]): (text: string) => string[] {
  const patterns = outlets.map((name) => {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      name,
      re: new RegExp(
        `(?:(?:${CREDIT_VERBS})\\s+(?:the\\s+)?${n}|${n}\\s+(?:reported|reports|said|says|cited))(?![\\p{L}\\p{N}])`,
        "iu",
      ),
    };
  });
  return (text) => patterns.filter((p) => p.re.test(text)).map((p) => p.name);
}

export async function collectFeed(
  http: HttpClient,
  feed: FeedConfig,
  sourceId: string,
  since: Date,
  match: FeedMatchers,
): Promise<CollectedDoc[]> {
  const res = await http.get(feed.url);
  if (res.status < 200 || res.status >= 300) throw new Error(`feed returned HTTP ${res.status}`);
  const parsed = await parser.parseString(res.body);

  const docs: CollectedDoc[] = [];
  for (const item of parsed.items) {
    if (!item.link) continue;
    const dateRaw = item.isoDate ?? item.pubDate;
    const publishedAt = dateRaw ? new Date(dateRaw) : null;
    const validDate = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;
    // Undated items are kept; dated items must fall inside the lookback window.
    if (validDate && validDate < since) continue;

    const title = item.title ? htmlToText(item.title) : null;
    const textSource = feed.metadata_only
      ? ""
      : (item["content:encoded"] ?? item.contentSnippet ?? item.summary ?? "");
    const rawText = htmlToText(textSource) || null;
    const matchText = `${title ?? ""} ${rawText ?? ""}`;

    let skipReason: string | undefined;
    if (feed.keyword_filter && !match.keyword(matchText)) skipReason = "no_keyword_match";
    else if (feed.region_filter && !match.region(matchText)) skipReason = "no_region_match";

    const credited = feed.extract_credits ? match.credits(matchText) : [];

    docs.push({
      sourceId,
      publisherName: feed.source,
      collectedVia: "FEED",
      collectorKey: feed.key,
      url: item.link,
      title,
      publishedAt: validDate,
      language: feed.language,
      rawText,
      textKind: rawText ? "FEED_TEXT" : "METADATA_ONLY",
      metadata: {
        feed_url: feed.url,
        ...(validDate ? {} : { date_missing: true }),
        ...(feed.no_ai_processing ? { no_ai_processing: true } : {}),
        ...(feed.lead_only ? { lead_only: true } : {}),
        ...(feed.metadata_only ? { metadata_only_by_terms: true } : {}),
        ...(feed.extract_credits
          ? { credited_publishers: credited, credit_found: credited.length > 0 }
          : {}),
      },
      skipReason,
    });
  }
  return docs;
}
