/**
 * Article links from an archive listing page (no network). Each link gets the date in its URL
 * (/2021-01-15/ or /2021/01/15/) and the date the listing shows next to it (a <time datetime>
 * or a YYYY-MM-DD / DD.MM.YYYY date in the text just before the link).
 */
import { decodeEntities } from "../collector/store.mjs";

export type ListingItem = {
  url: string;
  title: string;
  urlDate: string | null;
  listingDate: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validIso(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return ISO.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

export function dateFromUrl(url: string): string | null {
  const path = new URL(url).pathname;
  const m = path.match(/(?:^|\/)(\d{4})-(\d{2})-(\d{2})(?:\/|$)/) ?? path.match(/\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  return m ? validIso(m[1], m[2], m[3]) : null;
}

/** The last date in `html` (the text between the previous link and this one). */
function lastDate(html: string): string | null {
  const found: string[] = [];
  for (const m of html.matchAll(/datetime="(\d{4})-(\d{2})-(\d{2})/g)) found.push(validIso(m[1], m[2], m[3]) ?? "");
  if (found.filter(Boolean).length) return found.filter(Boolean).at(-1)!;
  const text = html.replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) {
    found.push((m[1] ? validIso(m[1], m[2], m[3]) : validIso(m[6], m[5], m[4])) ?? "");
  }
  return found.filter(Boolean).at(-1) ?? null;
}

/**
 * Same-host links with a title of at least 15 characters and a date (URL or listing). Query-string
 * links (filters, pagers) are left out. Duplicates keep their first occurrence.
 */
export function parseListing(html: string, listingUrl: string): ListingItem[] {
  const base = new URL(listingUrl);
  const items: ListingItem[] = [];
  const seen = new Set<string>();
  let previousEnd = 0;
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const start = m.index!;
    const before = html.slice(previousEnd, start);
    previousEnd = start + m[0].length;
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]), base);
    } catch {
      continue;
    }
    if (url.host !== base.host || url.search || url.pathname === base.pathname) continue;
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (title.length < 15) continue;
    const href = url.href;
    const urlDate = dateFromUrl(href);
    const listingDate = lastDate(before);
    if (!urlDate && !listingDate) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({ url: href, title, urlDate, listingDate });
  }
  return items;
}

/** Sets ?page=N (or replaces it) on a listing URL. */
export function pageUrl(listingUrl: string, page: number): string {
  const url = new URL(listingUrl);
  url.searchParams.set("page", String(page));
  return url.href;
}
