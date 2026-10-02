-- 0003_raw_documents
-- Private working store for collected documents (roadmap step 2.1).
-- Never shown on any public page.

BEGIN;

CREATE TYPE raw_document_status AS ENUM ('NEW', 'PROCESSED', 'SKIPPED');

-- How the row was collected: a publisher feed, an official listing page, or the GDELT API.
CREATE TYPE collection_method AS ENUM ('FEED', 'LISTING', 'GDELT');

-- What raw_text holds: full article text, the publisher's own feed text, or nothing (metadata only).
CREATE TYPE raw_text_kind AS ENUM ('FULL_TEXT', 'FEED_TEXT', 'METADATA_ONLY');

CREATE TABLE raw_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: API results can come from publishers outside the registry.
  source_id         uuid REFERENCES sources (id) ON DELETE SET NULL,
  publisher_name    text,
  publisher_domain  text,
  collected_via     collection_method NOT NULL,
  -- Which configured feed, listing, or query produced the row.
  collector_key     text NOT NULL,
  url               text NOT NULL UNIQUE,
  title             text,
  published_at      timestamptz,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  language          text,
  raw_text          text,
  text_kind         raw_text_kind NOT NULL,
  content_hash      text NOT NULL,
  -- Same content already stored under another URL; such rows are SKIPPED.
  duplicate_of      uuid REFERENCES raw_documents (id) ON DELETE SET NULL,
  -- API fields and skip reasons.
  metadata          jsonb NOT NULL DEFAULT '{}',
  status            raw_document_status NOT NULL DEFAULT 'NEW',
  CHECK (source_id IS NOT NULL OR publisher_domain IS NOT NULL),
  CHECK (duplicate_of IS NULL OR status = 'SKIPPED')
);

CREATE INDEX raw_documents_status_idx       ON raw_documents (status, fetched_at);
CREATE INDEX raw_documents_content_hash_idx ON raw_documents (content_hash);
CREATE INDEX raw_documents_source_id_idx    ON raw_documents (source_id);
CREATE INDEX raw_documents_published_at_idx ON raw_documents (published_at DESC);

COMMIT;
