/**
 * The public address of the site (PUBLIC_SITE_URL, no trailing slash), for absolute URLs in the
 * sitemap, robots.txt and metadata. Falls back to the local dev server when unset.
 */
export const SITE_URL = (process.env.PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:43127").replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}
