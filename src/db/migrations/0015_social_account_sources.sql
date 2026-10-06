-- 0015_social_account_sources
-- A registered source's statement seen on its social media account (for example the Latvian
-- National Armed Forces on X) before its website carries it. The row keeps the registry source
-- (and its tier); social_account names the account as the reviewer typed it. Such a row, like a
-- live statement (0013), may omit the URL. Events only. Additions only.

BEGIN;

ALTER TABLE event_sources
  ADD COLUMN social_account text CHECK (social_account IS NULL OR btrim(social_account) <> ''),
  ADD CONSTRAINT event_sources_social_not_live
    CHECK (social_account IS NULL OR source_id <> '1100e000-0000-4000-8000-000000000001'),
  DROP CONSTRAINT event_sources_url_unless_live,
  ADD CONSTRAINT event_sources_url_unless_live_or_social
    CHECK (article_url IS NOT NULL OR source_id = '1100e000-0000-4000-8000-000000000001' OR social_account IS NOT NULL);

COMMIT;
