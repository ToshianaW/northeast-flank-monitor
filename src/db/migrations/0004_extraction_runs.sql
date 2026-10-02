-- 0004_extraction_runs
-- One row per extractor run (roadmap step 2.2): model, usage, cost, outcomes.

BEGIN;

CREATE TABLE extraction_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  model               text NOT NULL,
  prompt_version      text NOT NULL,
  dry_run             boolean NOT NULL DEFAULT false,
  row_limit           integer NOT NULL CHECK (row_limit > 0),
  spend_cap_usd       numeric(8,4) NOT NULL CHECK (spend_cap_usd > 0),
  rows_seen           integer NOT NULL DEFAULT 0,
  rows_processed      integer NOT NULL DEFAULT 0,
  rows_failed         integer NOT NULL DEFAULT 0,
  -- Returned by the model / passed validation and written / dropped by validation.
  events_proposed     integer NOT NULL DEFAULT 0,
  events_created      integer NOT NULL DEFAULT 0,
  events_rejected     integer NOT NULL DEFAULT 0,
  input_tokens        bigint NOT NULL DEFAULT 0,
  output_tokens       bigint NOT NULL DEFAULT 0,
  cache_read_tokens   bigint NOT NULL DEFAULT 0,
  cache_write_tokens  bigint NOT NULL DEFAULT 0,
  cost_usd            numeric(10,4) NOT NULL DEFAULT 0,
  stop_reason         text CHECK (stop_reason IN ('COMPLETED', 'ROW_LIMIT', 'SPEND_CAP', 'ERROR')),
  errors              jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX extraction_runs_started_at_idx ON extraction_runs (started_at DESC);

-- Which run proposed an AI-extracted event (null for manually created events),
-- so approve/reject rates can be measured per model and prompt version.
ALTER TABLE events
  ADD COLUMN extraction_run_id uuid REFERENCES extraction_runs (id) ON DELETE SET NULL;

COMMIT;
