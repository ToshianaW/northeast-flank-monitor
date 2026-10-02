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

export async function collectFeed(
  http: HttpClient,
  feed: FeedConfig,
  sourceId: string,
  since: Date,
  matchesKeyword: (text: string) => boolean,
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
    const textSource = item["content:encoded"] ?? item.contentSnippet ?? item.summary ?? "";
    const rawText = htmlToText(textSource) || null;
    const noMatch = feed.keyword_filter && !matchesKeyword(`${title ?? ""} ${rawText ?? ""}`);

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
      },
      skipReason: noMatch ? "no_keyword_match" : undefined,
    });
  }
  return docs;
}
