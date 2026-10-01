-- 0001_initial_schema
-- Northeast Flank Monitor: initial schema (roadmap step 1.2).
-- Requires PostgreSQL 13+ (gen_random_uuid) with the PostGIS extension available.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Spec §25 (24 types; decisions.md #7)
CREATE TYPE event_type AS ENUM (
  'EXERCISE',
  'READINESS_CHECK',
  'MOBILIZATION',
  'TROOP_MOVEMENT',
  'EQUIPMENT_MOVEMENT',
  'RAIL_ACTIVITY',
  'LOGISTICS',
  'AIR_ACTIVITY',
  'NAVAL_ACTIVITY',
  'AIR_DEFENSE',
  'MISSILE_ACTIVITY',
  'ENGINEERING',
  'AIRFIELD_ACTIVITY',
  'COMMAND_CONTROL',
  'ELECTRONIC_WARFARE',
  'BORDER_INCIDENT',
  'AIRSPACE_VIOLATION',
  'DRONE_ACTIVITY',
  'NATO_REINFORCEMENT',
  'RUSSIAN_DEPLOYMENT',
  'BELARUSIAN_DEPLOYMENT',
  'INFRASTRUCTURE',
  'OFFICIAL_WARNING',
  'POLITICAL_SIGNALING'
);

-- Spec §17
CREATE TYPE exercise_status AS ENUM (
  'ANNOUNCED',
  'UPCOMING',
  'ACTIVE',
  'CONCLUDING',
  'CONCLUDED',
  'EXTENDED',
  'UNCLEAR'
);

-- Spec §4 (all 8; decisions.md #4)
CREATE TYPE reset_status AS ENUM (
  'FULL_RESET',
  'PERSONNEL_RETURNED',
  'EQUIPMENT_STATUS_UNKNOWN',
  'PARTIAL_RESET',
  'RESIDUAL_ACTIVITY',
  'INCOMPLETE_RESET',
  'CONTINUED_DEPLOYMENT',
  'UNKNOWN'
);

-- Spec §18 reset-widget dimensions (personnel / equipment / infrastructure)
CREATE TYPE dimension_status AS ENUM (
  'RETURNED',
  'NOT_RETURNED',
  'REMOVED',
  'PRESENT',
  'NOT_VERIFIED',
  'UNKNOWN'
);

-- Spec §36
CREATE TYPE confidence_level AS ENUM (
  'CONFIRMED',
  'HIGH',
  'MODERATE',
  'UNVERIFIED'
);

-- Spec §35
CREATE TYPE source_type AS ENUM (
  'OFFICIAL_GOVERNMENT',
  'OFFICIAL_MILITARY',
  'INDEPENDENT_ANALYSIS',
  'ESTABLISHED_MEDIA',
  'OSINT',
  'UNKNOWN'
);

CREATE TYPE source_reliability AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNRATED'
);

CREATE TYPE review_status AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'MERGED'
);

CREATE TYPE source_relationship AS ENUM (
  'SUPPORTS',
  'CONTRADICTS'
);

CREATE TYPE location_precision AS ENUM (
  'EXACT',
  'BASE',
  'DISTRICT',
  'REGION'
);

CREATE TYPE review_action AS ENUM (
  'APPROVE',
  'EDIT',
  'REJECT',
  'MERGE'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

CREATE TABLE sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  home_url         text,
  source_type      source_type NOT NULL DEFAULT 'UNKNOWN',
  source_country   text,
  source_language  text,
  reliability      source_reliability NOT NULL DEFAULT 'UNRATED',
  tier             smallint CHECK (tier BETWEEN 1 AND 4),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sources_set_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- exercises (spec §17, reset fields §4 / §18)
-- ---------------------------------------------------------------------------

CREATE TABLE exercises (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_name            text NOT NULL,
  actor                    text,
  countries                text[] NOT NULL DEFAULT '{}',
  location                 text,
  participating_units      text,
  estimated_personnel      text,
  equipment                text,
  announced_start_date     date,
  announced_end_date       date,
  observed_start_date      date,
  observed_end_date        date,
  exercise_status          exercise_status NOT NULL DEFAULT 'UNCLEAR',
  exercise_objectives      text,
  post_exercise_reset      reset_status NOT NULL DEFAULT 'UNKNOWN',
  personnel_return_status  dimension_status NOT NULL DEFAULT 'UNKNOWN',
  equipment_return_status  dimension_status NOT NULL DEFAULT 'UNKNOWN',
  infrastructure_status    dimension_status NOT NULL DEFAULT 'UNKNOWN',
  follow_on_activity       text,
  summary                  text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (announced_end_date IS NULL OR announced_start_date IS NULL
         OR announced_end_date >= announced_start_date),
  CHECK (observed_end_date IS NULL OR observed_start_date IS NULL
         OR observed_end_date >= observed_start_date)
);

CREATE INDEX exercises_status_idx ON exercises (exercise_status);
CREATE INDEX exercises_observed_start_idx ON exercises (observed_start_date DESC);

CREATE TRIGGER exercises_set_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Spec §17 "source" field, as a many-to-many like event_sources.
CREATE TABLE exercise_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id  uuid NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  source_id    uuid NOT NULL REFERENCES sources (id) ON DELETE RESTRICT,
  article_url  text NOT NULL,
  is_primary   boolean NOT NULL DEFAULT false,
  excerpt      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, source_id, article_url)
);

CREATE UNIQUE INDEX exercise_sources_one_primary_idx
  ON exercise_sources (exercise_id) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- events (spec §24, all fields)
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  event_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date               date NOT NULL,
  reported_date            date,
  headline                 text NOT NULL,
  summary                  text,
  actor                    text,
  country                  text,
  region                   text,
  location_name            text,
  location_precision       location_precision,
  latitude                 double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude                double precision CHECK (longitude BETWEEN -180 AND 180),
  geom                     geography (Point, 4326) GENERATED ALWAYS AS (
                             CASE
                               WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                               THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                             END
                           ) STORED,
  event_type               event_type NOT NULL,
  event_subtype            text,
  exercise_id              uuid REFERENCES exercises (id) ON DELETE SET NULL,
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
  historical_analogue      text,
  historical_notes         text,
  ai_generated_summary     text,
  human_reviewed           boolean NOT NULL DEFAULT false,
  review_status            review_status NOT NULL DEFAULT 'DRAFT',
  contradiction_flag       boolean NOT NULL DEFAULT false,
  contradiction_notes      text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (review_status <> 'PUBLISHED' OR human_reviewed),
  CHECK (announced_end_date IS NULL OR announced_start_date IS NULL
         OR announced_end_date >= announced_start_date),
  CHECK (observed_end_date IS NULL OR observed_start_date IS NULL
         OR observed_end_date >= observed_start_date)
);

CREATE INDEX events_event_date_idx ON events (event_date DESC);
CREATE INDEX events_review_status_idx ON events (review_status);
CREATE INDEX events_event_type_idx ON events (event_type);
CREATE INDEX events_country_idx ON events (country);
CREATE INDEX events_exercise_id_idx ON events (exercise_id);
CREATE INDEX events_geom_idx ON events USING gist (geom);

CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- event_sources (M2M)
-- ---------------------------------------------------------------------------

CREATE TABLE event_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES sources (id) ON DELETE RESTRICT,
  article_url   text NOT NULL,
  relationship  source_relationship NOT NULL DEFAULT 'SUPPORTS',
  is_primary    boolean NOT NULL DEFAULT false,
  excerpt      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, source_id, article_url),
  CONSTRAINT event_sources_primary_must_support
    CHECK (NOT (is_primary AND relationship = 'CONTRADICTS'))
);

CREATE INDEX event_sources_source_id_idx ON event_sources (source_id);
CREATE UNIQUE INDEX event_sources_one_primary_idx
  ON event_sources (event_id) WHERE is_primary;

-- Project rule 2: every published event keeps at least one SUPPORTS source;
-- contradicting sources alone do not count.
-- Deferred to commit so an event and its sources can be written in one transaction.
CREATE FUNCTION check_published_event_has_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    target := NEW.event_id;
  ELSE
    target := OLD.event_id;
  END IF;

  IF EXISTS (
       SELECT 1 FROM events e
       WHERE e.event_id = target AND e.review_status = 'PUBLISHED'
     )
     AND NOT EXISTS (
       SELECT 1 FROM event_sources es
       WHERE es.event_id = target AND es.relationship = 'SUPPORTS'
     )
  THEN
    RAISE EXCEPTION 'Published event % must have at least one SUPPORTS source', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER events_published_requires_source
  AFTER INSERT OR UPDATE OF review_status ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_event_has_source();

CREATE CONSTRAINT TRIGGER event_sources_keep_published_source
  AFTER DELETE OR UPDATE OF event_id, relationship ON event_sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_event_has_source();

-- ---------------------------------------------------------------------------
-- review_actions (decisions.md #6: log every review action)
-- ---------------------------------------------------------------------------

-- event_type and source_ids are captured at action time so accuracy can be
-- measured even after the event is later edited.
CREATE TABLE review_actions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid NOT NULL REFERENCES events (event_id) ON DELETE RESTRICT,
  action                review_action NOT NULL,
  reviewer              text NOT NULL,
  event_type            event_type NOT NULL,
  source_ids            uuid[] NOT NULL DEFAULT '{}',
  merged_into_event_id  uuid REFERENCES events (event_id) ON DELETE RESTRICT,
  previous_values       jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((action = 'MERGE') = (merged_into_event_id IS NOT NULL)),
  CHECK (merged_into_event_id IS DISTINCT FROM event_id)
);

CREATE INDEX review_actions_event_id_idx ON review_actions (event_id, created_at);
CREATE INDEX review_actions_created_at_idx ON review_actions (created_at);
CREATE INDEX review_actions_merged_into_idx ON review_actions (merged_into_event_id)
  WHERE merged_into_event_id IS NOT NULL;

-- Audit log is append-only.
CREATE FUNCTION forbid_review_action_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_actions is append-only';
END;
$$;

CREATE TRIGGER review_actions_append_only
  BEFORE UPDATE OR DELETE ON review_actions
  FOR EACH ROW EXECUTE FUNCTION forbid_review_action_changes();

-- ---------------------------------------------------------------------------
-- daily_digests (spec §16; generation arrives in step 2.7)
-- ---------------------------------------------------------------------------

CREATE TABLE daily_digests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date    date NOT NULL UNIQUE,
  title          text NOT NULL,
  sections       jsonb NOT NULL DEFAULT '{}',
  body           text,
  review_status  review_status NOT NULL DEFAULT 'DRAFT',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER daily_digests_set_updated_at
  BEFORE UPDATE ON daily_digests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
