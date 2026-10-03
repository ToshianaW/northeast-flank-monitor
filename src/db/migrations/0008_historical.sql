-- 0008_historical
-- Historical dataset (roadmap Phase 4, spec §5-6): Aug 2020 - Feb 2022, in its own tables so no
-- query over events/event_sources/review_actions can return a historical row.
-- Reused: the sources registry (plus a historical_only flag), the existing enums, set_updated_at().
-- Evidence rules enforced here: a published historical event needs a SUPPORTS source with tier
-- 1-3 (so neither "no source" nor "Tier 4 only" can be published), every source row carries an
-- excerpt of 20 words or fewer, a CONTRADICTS source is never primary, and a later tier edit on
-- a source cannot leave a published historical event with Tier 4-only support.
-- No coordinates: latitude/longitude/geom are not part of the historical model.

BEGIN;

-- ---------------------------------------------------------------------------
-- sources: historical-only flag (never collected, labelled on /sources)
-- ---------------------------------------------------------------------------

ALTER TABLE sources
  ADD COLUMN historical_only boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- historical_events (events columns minus exercise_id, extraction_run_id,
-- ai_generated_summary, historical_analogue, historical_notes, latitude, longitude, geom;
-- plus phase_tag)
-- ---------------------------------------------------------------------------

CREATE TABLE historical_events (
  event_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date               date NOT NULL
                             CHECK (event_date BETWEEN DATE '2020-08-01' AND DATE '2022-02-28'),
  reported_date            date,
  headline                 text NOT NULL,
  summary                  text,
  actor                    text,
  country                  text,
  region                   text,
  location_name            text,
  location_precision       location_precision,
  event_type               event_type NOT NULL,
  event_subtype            text,
  exercise_name            text,
  exercise_status          exercise_status,
  unit_name                text,
  unit_type                text,
  unit_home_location       text,
  personnel_estimate       text,
  equipment_type           text,
  equipment_quantity       text,
  activity_description     text,
  source_name              text,
  source_url               text,
  source_type              source_type,
  source_country           text,
  source_language          text,
  source_reliability       source_reliability,
  confidence_level         confidence_level NOT NULL DEFAULT 'UNVERIFIED',
  first_reported           timestamptz,
  last_updated             timestamptz,
  announced_start_date     date,
  announced_end_date       date,
  observed_start_date      date,
  observed_end_date        date,
  personnel_return_status  dimension_status,
  equipment_return_status  dimension_status,
  infrastructure_status    dimension_status,
  follow_on_activity       text,
  overall_reset_status     reset_status,
  -- Spec §6 phase framework, set by the reviewer only; admin-only, never shown publicly.
  phase_tag                text CHECK (phase_tag IN ('P0', 'P1', 'P2', 'P3', 'P4')),
  human_reviewed           boolean NOT NULL DEFAULT false,
  review_status            review_status NOT NULL DEFAULT 'DRAFT'
                             CHECK (review_status IN ('DRAFT', 'PUBLISHED', 'REJECTED')),
  contradiction_flag       boolean NOT NULL DEFAULT false,
  contradiction_notes      text,
  internal_notes           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'PUBLISHED' OR human_reviewed),
  CHECK (announced_end_date IS NULL OR announced_start_date IS NULL
         OR announced_end_date >= announced_start_date),
  CHECK (observed_end_date IS NULL OR observed_start_date IS NULL
         OR observed_end_date >= observed_start_date)
);

CREATE INDEX historical_events_event_date_idx ON historical_events (event_date DESC);
CREATE INDEX historical_events_review_status_idx ON historical_events (review_status);

CREATE TRIGGER historical_events_set_updated_at
  BEFORE UPDATE ON historical_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- historical_event_sources (shape of event_sources, plus archive link and access time;
-- excerpt required, 20 words or fewer, as in workers/extractor/validate.mts)
-- ---------------------------------------------------------------------------

CREATE TABLE historical_event_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES historical_events (event_id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES sources (id) ON DELETE RESTRICT,
  article_url   text NOT NULL,
  archived_url  text,
  accessed_at   timestamptz NOT NULL,
  relationship  source_relationship NOT NULL DEFAULT 'SUPPORTS',
  is_primary    boolean NOT NULL DEFAULT false,
  excerpt       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, source_id, article_url),
  CONSTRAINT historical_event_sources_primary_must_support
    CHECK (NOT (is_primary AND relationship = 'CONTRADICTS')),
  CONSTRAINT historical_event_sources_excerpt_short
    CHECK (btrim(excerpt, E' \t\r\n') <> ''
           AND cardinality(regexp_split_to_array(btrim(excerpt, E' \t\r\n'), '\s+')) <= 20)
);

CREATE INDEX historical_event_sources_source_id_idx ON historical_event_sources (source_id);
CREATE UNIQUE INDEX historical_event_sources_one_primary_idx
  ON historical_event_sources (event_id) WHERE is_primary;

-- A published historical event keeps at least one SUPPORTS source with tier 1-3
-- (decision 10 applied in the database). Deferred to commit so an event and its sources can
-- be written in one transaction.
CREATE FUNCTION check_published_historical_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'historical_events' THEN
    target := NEW.event_id;
  ELSE
    target := OLD.event_id;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM historical_events h
       WHERE h.event_id = target AND h.review_status = 'PUBLISHED'
     ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM historical_event_sources hs
       WHERE hs.event_id = target AND hs.relationship = 'SUPPORTS'
     ) THEN
    RAISE EXCEPTION 'Published historical event % must have at least one SUPPORTS source', target
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM historical_event_sources hs
       JOIN sources s ON s.id = hs.source_id
       WHERE hs.event_id = target AND hs.relationship = 'SUPPORTS' AND s.tier BETWEEN 1 AND 3
     ) THEN
    RAISE EXCEPTION 'Published historical event % needs a Tier 1-3 SUPPORTS source (Tier 4 only cannot be published)', target
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER historical_events_published_requires_source
  AFTER INSERT OR UPDATE OF review_status ON historical_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_historical_event();

CREATE CONSTRAINT TRIGGER historical_event_sources_keep_published_source
  AFTER DELETE OR UPDATE OF event_id, source_id, relationship ON historical_event_sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_historical_event();

-- A tier edit on a source must not leave a published historical event with Tier 4-only support.
-- Unpublish the named events first, then change the tier.
CREATE FUNCTION check_source_tier_keeps_historical() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected text;
BEGIN
  SELECT string_agg(h.event_id::text, ', ' ORDER BY h.event_id)
    INTO affected
  FROM historical_events h
  WHERE h.review_status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM historical_event_sources hs
      WHERE hs.event_id = h.event_id AND hs.source_id = NEW.id AND hs.relationship = 'SUPPORTS'
    )
    AND NOT EXISTS (
      SELECT 1 FROM historical_event_sources hs
      JOIN sources s ON s.id = hs.source_id
      WHERE hs.event_id = h.event_id AND hs.relationship = 'SUPPORTS' AND s.tier BETWEEN 1 AND 3
    );

  IF affected IS NOT NULL THEN
    RAISE EXCEPTION 'Tier change on source % would leave published historical events with Tier 4-only support: %', NEW.id, affected
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER sources_keep_historical_tier
  AFTER UPDATE OF tier ON sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier)
  EXECUTE FUNCTION check_source_tier_keeps_historical();

-- ---------------------------------------------------------------------------
-- historical_review_actions (append-only audit log, reviewer on every action)
-- ---------------------------------------------------------------------------

CREATE TYPE historical_action AS ENUM ('CREATE', 'EDIT', 'APPROVE', 'REJECT', 'UNPUBLISH');

CREATE TABLE historical_review_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES historical_events (event_id) ON DELETE RESTRICT,
  action           historical_action NOT NULL,
  reviewer         text NOT NULL CHECK (btrim(reviewer) <> ''),
  event_type       event_type NOT NULL,
  source_ids       uuid[] NOT NULL DEFAULT '{}',
  previous_values  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((action = 'CREATE') = (previous_values IS NULL))
);

CREATE INDEX historical_review_actions_event_id_idx
  ON historical_review_actions (event_id, created_at);

CREATE FUNCTION forbid_historical_review_action_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historical_review_actions is append-only';
END;
$$;

CREATE TRIGGER historical_review_actions_append_only
  BEFORE UPDATE OR DELETE ON historical_review_actions
  FOR EACH ROW EXECUTE FUNCTION forbid_historical_review_action_changes();

COMMIT;
