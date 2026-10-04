import type { HttpClient } from "./fetch.mjs";
import { decodeEntities, type CollectedDoc } from "./store.mjs";

export type ListingConfig = {
  key: string;
  source: string;
  url: string;
  parser: "govpl";
  section_id: string;
  link_prefix: string;
  language: string;
  time_zone: string;
  /** Stored as usual, but marked so later steps never send the text to an AI model. */
  no_ai_processing: boolean;
  /** Require a region term in the card title; others are stored as SKIPPED. */
  region_filter?: boolean;
  /** Fetch the article page for cards that pass the filters (article.mts; needs fetch_full_text). */
  full_text?: boolean;
};

/** YYYY-MM-DD of an instant in the given time zone. */
function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Midnight of a calendar day in the given time zone, as an instant. */
function midnightIn(timeZone: string, day: string): Date {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(noonUtc)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return new Date(`${day}T00:00:00${offset}`);
}

/**
 * gov.pl ministry page: cards inside <section id="…"> with
 * <span class="date">DD.MM.YYYY</span> followed by <div class="title"><a href="…">Title</a>.
 */
function parseGovPl(html: string, sectionId: string, linkPrefix: string) {
  const start = html.indexOf(`id="${sectionId}"`);
  if (start === -1) throw new Error(`section "${sectionId}" not found on listing page`);
  const end = html.indexOf("<section", start + 1);
  const section = html.slice(start, end === -1 ? undefined : end);

  const cards: Array<{ path: string; title: string; day: string | null }> = [];
  for (const li of section.split(/<li[\s>]/).slice(1)) {
    const link = li.match(/<div class="title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!link || !link[1].startsWith(linkPrefix)) continue;
    const date = li.match(/class="date">\s*(\d{2})\.(\d{2})\.(\d{4})\s*</);
    cards.push({
      path: link[1],
      title: decodeEntities(link[2]).replace(/\s+/g, " ").trim(),
      day: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    });
  }
  return cards;
}

export async function collectListing(
  http: HttpClient,
  listing: ListingConfig,
  sourceId: string,
  since: Date,
  region?: (text: string) => boolean,
): Promise<CollectedDoc[]> {
  const res = await http.get(listing.url);
  if (res.status < 200 || res.status >= 300) throw new Error(`listing returned HTTP ${res.status}`);

  const cards = parseGovPl(res.body, listing.section_id, listing.link_prefix);
  if (cards.length === 0) throw new Error("no news cards found; the page layout may have changed");

  const sinceDay = dayIn(listing.time_zone, since);
  const docs: CollectedDoc[] = [];
  for (const card of cards) {
    // Undated cards are kept; dated cards must fall on or after the first day of the window.
    if (card.day && card.day < sinceDay) continue;
    docs.push({
      sourceId,
      publisherName: listing.source,
      collectedVia: "LISTING",
      collectorKey: listing.key,
      url: new URL(card.path, listing.url).toString(),
      title: card.title || null,
      publishedAt: card.day ? midnightIn(listing.time_zone, card.day) : null,
      language: listing.language,
      rawText: null,
      textKind: "METADATA_ONLY",
      metadata: {
        listing_url: listing.url,
        ...(card.day ? { listing_date: card.day, date_precision: "day" } : { date_missing: true }),
        ...(listing.no_ai_processing ? { no_ai_processing: true } : {}),
      },
      // Listings carry titles only, so the region filter sees the title alone.
      skipReason: listing.region_filter && region && !region(card.title) ? "no_region_match" : undefined,
    });
  }
  return docs;
}
