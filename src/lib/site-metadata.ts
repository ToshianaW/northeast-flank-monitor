import type { Metadata } from "next";

export const SITE_NAME = "Northeast Flank Monitor";

export const SITE_DESCRIPTION =
  "Open-source monitor of observable military activity on NATO's northeastern flank";

/**
 * Title, description, canonical URL and Open Graph for a public page. Paths are resolved against
 * metadataBase (PUBLIC_SITE_URL, set in the root layout). Open Graph is repeated in full because
 * a page's openGraph replaces the layout's rather than merging with it.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: path, title, description },
  };
}
