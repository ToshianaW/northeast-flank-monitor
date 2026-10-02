import { createHash } from "node:crypto";
import type pg from "pg";

export type CollectionMethod = "FEED" | "LISTING" | "GDELT";
export type TextKind = "FULL_TEXT" | "FEED_TEXT" | "METADATA_ONLY";

export type CollectedDoc = {
  sourceId: string | null;
  publisherName: string | null;
  collectedVia: CollectionMethod;
  collectorKey: string;
  url: string;
  title: string | null;
  publishedAt: Date | null;
  language: string | null;
  rawText: string | null;
  textKind: TextKind;
  metadata: Record<string, unknown>;
  /** Set when the item is stored but should not be processed (e.g. no keyword match). */
  skipReason?: string;
};

/** new: stored as NEW. filtered: stored as SKIPPED with a reason. duplicate: same content as an earlier row. existing: URL already stored. */
export type StoreOutcome = "new" | "filtered" | "duplicate" | "existing";

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ocid|cmpid)$/i;

/** Lowercase host, no fragment, no tracking parameters. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Plain text from feed HTML: tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** SHA-256 of the lowercased, whitespace-collapsed title and text. */
export function contentHash(title: string | null, text: string | null): string {
  const normalized = `${title ?? ""}\n${text ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export async function storeDocument(client: pg.Client, doc: CollectedDoc): Promise<StoreOutcome> {
  const url = normalizeUrl(doc.url);

  const existing = await client.query("SELECT 1 FROM raw_documents WHERE url = $1", [url]);
  if (existing.rowCount) return "existing";

  const hash = contentHash(doc.title, doc.rawText);
  const dup = await client.query<{ id: string }>(
    `SELECT id FROM raw_documents
     WHERE content_hash = $1 AND duplicate_of IS NULL
     ORDER BY fetched_at, id
     LIMIT 1`,
    [hash],
  );
  const duplicateOf = dup.rows[0]?.id ?? null;
  const status = duplicateOf || doc.skipReason ? "SKIPPED" : "NEW";
  const metadata = doc.skipReason ? { ...doc.metadata, skip_reason: doc.skipReason } : doc.metadata;

  const inserted = await client.query(
    `INSERT INTO raw_documents
       (source_id, publisher_name, publisher_domain, collected_via, collector_key, url, title,
        published_at, language, raw_text, text_kind, content_hash, duplicate_of, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (url) DO NOTHING
     RETURNING id`,
    [
      doc.sourceId,
      doc.publisherName,
      domainOf(url),
      doc.collectedVia,
      doc.collectorKey,
      url,
      doc.title,
      doc.publishedAt,
      doc.language,
      doc.rawText,
      doc.textKind,
      hash,
      duplicateOf,
      JSON.stringify(metadata),
      status,
    ],
  );
  if (!inserted.rowCount) return "existing";
  if (duplicateOf) return "duplicate";
  return doc.skipReason ? "filtered" : "new";
}
