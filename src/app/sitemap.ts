import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { loadSitemapEntries } from "@/lib/public-sitemap";
import { absoluteUrl } from "@/lib/site-url";

// Cached for an hour, and built per request rather than at build time, like every public page.
const cachedEntries = unstable_cache(() => loadSitemapEntries(), ["sitemap-entries"], { revalidate: 3600 });

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const entries = await cachedEntries();
  return entries.map(({ path, lastModified }) => ({
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified } : {}),
  }));
}
