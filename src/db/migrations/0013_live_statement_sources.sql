-- 0013_live_statement_sources
-- A statement seen live (for example a head of state speaking on television) before any registry
-- source has written it up. One reserved registry source, "Live statement (broadcast)", Tier 1
-- official, carries these rows so tier and publish checks work unchanged; each event_sources row
-- names who said it and where it was seen in source_label. Only that source may omit the URL.
-- Events only: exercise_sources and historical_event_sources are unchanged. Additions only.

BEGIN;

INSERT INTO sources (id, name, source_type, reliability, tier, notes)
VALUES (
  '1100e000-0000-4000-8000-000000000001',
  'Live statement (broadcast)',
  'OFFICIAL_GOVERNMENT',
  'UNRATED',
  1,
  'Reserved. A statement seen live from the person who made it (for example on television), before any registry source reports it. Each use names the speaker and where it was seen. Use only when the event reports the speaker''s own words; attach the registry source once outlets publish the story.'
)
ON CONFLICT DO NOTHING;

ALTER TABLE event_sources
  ADD COLUMN source_label text CHECK (source_label IS NULL OR btrim(source_label) <> ''),
  ALTER COLUMN article_url DROP NOT NULL,
  ADD CONSTRAINT event_sources_live_label
    CHECK ((source_id = '1100e000-0000-4000-8000-000000000001') = (source_label IS NOT NULL)),
  ADD CONSTRAINT event_sources_url_unless_live
    CHECK (article_url IS NOT NULL OR source_id = '1100e000-0000-4000-8000-000000000001');

COMMIT;
