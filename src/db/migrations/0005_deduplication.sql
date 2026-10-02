-- 0005_deduplication
-- Duplicate suggestions for review (roadmap step 2.3). Suggestions only: nothing is
-- ever merged automatically; a reviewer uses the existing merge action.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE dedup_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  -- Null for runs with --no-model.
  model              text,
  dry_run            boolean NOT NULL DEFAULT false,
  spend_cap_usd      numeric(8,4) NOT NULL CHECK (spend_cap_usd >= 0),
  events_considered  integer NOT NULL DEFAULT 0,
  pairs_considered   integer NOT NULL DEFAULT 0,
  pairs_likely       integer NOT NULL DEFAULT 0,
  pairs_borderline   integer NOT NULL DEFAULT 0,
  model_calls        integer NOT NULL DEFAULT 0,
  input_tokens       bigint NOT NULL DEFAULT 0,
  output_tokens      bigint NOT NULL DEFAULT 0,
  cost_usd           numeric(10,4) NOT NULL DEFAULT 0,
  stop_reason        text CHECK (stop_reason IN ('COMPLETED', 'SPEND_CAP', 'ERROR')),
  errors             jsonb NOT NULL DEFAULT '[]'
);

-- SAME_ARTICLE: both events cite the same article URL. TRIGRAM: headline similarity alone.
-- MODEL: a borderline pair judged by the model.
CREATE TYPE duplicate_basis AS ENUM ('SAME_ARTICLE', 'TRIGRAM', 'MODEL');

CREATE TABLE duplicate_candidates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored once per pair, lower id first.
  event_id             uuid NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
  candidate_event_id   uuid NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
  dedup_run_id         uuid REFERENCES dedup_runs (id) ON DELETE SET NULL,
  basis                duplicate_basis NOT NULL,
  headline_similarity  real NOT NULL,
  model_verdict        text CHECK (model_verdict IN ('SAME', 'DIFFERENT', 'UNSURE')),
  model_reason         text,
  -- Why a borderline pair was judged on similarity alone.
  model_skipped        text CHECK (model_skipped IN ('NO_AI_SOURCE', 'NO_MODEL', 'SPEND_CAP')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (event_id < candidate_event_id),
  UNIQUE (event_id, candidate_event_id),
  CHECK ((basis = 'MODEL') = (model_verdict IS NOT NULL)),
  CHECK (model_skipped IS NULL OR basis = 'TRIGRAM')
);

CREATE INDEX duplicate_candidates_candidate_idx ON duplicate_candidates (candidate_event_id);

COMMIT;
