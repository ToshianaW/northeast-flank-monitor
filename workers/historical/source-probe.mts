/**
 * Rules for probing a new source before using it (no network here):
 * - only terms / legal / copyright pages (and robots.txt) are followed when looking for terms;
 * - no article page may be fetched from a site until its terms have been read (TermsGate).
 */

/**
 * Path segments that name a terms, legal, privacy or copyright page (EN, PL, ET, LV, LT). Only the
 * URL path decides: a link whose anchor text says "rules" or "правила" but points at an article is
 * never followed (an earlier ad-hoc probe followed two aif.ru articles that way).
 */
const LEGAL_SEGMENT =
  /^(terms|term-of-use|terms-of-use|terms-and-conditions|terms-of-service|tos|legal|legal-notice|copyright|copyrights|conditions|disclaimer|reuse|licen[cs]e|privacy|privacy-policy|privacy-notice|regulamin|prawa-autorskie|polityka-prywatnosci|kasutustingimused|lietosanas-noteikumi|noteikumi|autortiesibas|privatuma-politika|naudojimosi-taisykles|autoriu-teises|privatumo-politika)([-_.]|$)/i;

export function isLegalPageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.pathname === "/robots.txt") return true;
  return parsed.pathname.split("/").some((segment) => LEGAL_SEGMENT.test(segment));
}

/** Same-site legal links from a page's HTML; article links never qualify, whatever their anchor text. */
export function selectLegalLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const site = base.hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"/gi)) {
    let url: URL;
    try {
      url = new URL(m[1].replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.replace(/^www\./, "").endsWith(site)) continue;
    if (url.search && /wp-admin|action=edit/.test(url.href)) continue;
    if (isLegalPageUrl(url.href)) out.add(url.href);
  }
  return [...out];
}

/** Records which sites' terms were read; refuses article fetches before that. */
export class TermsGate {
  private readonly read = new Map<string, string>();

  /** `summary` says what was found ("CC BY-SA 4.0", "no terms page found", …). */
  markTermsRead(siteUrl: string, summary: string): void {
    this.read.set(new URL(siteUrl).origin, summary);
  }

  termsSummary(url: string): string | null {
    return this.read.get(new URL(url).origin) ?? null;
  }

  /** Throws unless this site's terms were read first. Listing, home, legal and robots pages are exempt. */
  assertArticleAllowed(url: string): void {
    if (!this.read.has(new URL(url).origin)) {
      throw new Error(`terms for ${new URL(url).origin} have not been read; refusing to fetch ${url}`);
    }
  }
}
