-- 0012_activity_index_snapshots
-- Stored Activity Index results (docs/scoring.md, formula activity-index-v1), one row per scope
-- (THEATER or a map area) per window, so a published value can be reproduced. Rows are written
-- only once the index is computed (never while collecting the baseline). Append-only: a changed
-- formula is a new formula_version, not an edit. Additions only.

BEGIN;

CREATE TABLE activity_index_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  formula_version  text NOT NULL CHECK (btrim(formula_version) <> ''),
  scope            text NOT NULL CHECK (btrim(scope) <> ''),
  baseline_start   date NOT NULL,
  baseline_end     date NOT NULL,
  window_start     date NOT NULL,
  window_end       date NOT NULL,
  panel_sources    integer NOT NULL CHECK (panel_sources >= 0),
  baseline_events  integer NOT NULL CHECK (baseline_events >= 0),
  window_events    integer NOT NULL CHECK (window_events >= 0),
  expected         numeric(10, 2) NOT NULL CHECK (expected >= 0),
  band             text NOT NULL CHECK (band IN ('MORE', 'WITHIN', 'FEWER')),
  dimensions       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
  CHECK (baseline_start < baseline_end AND baseline_end < window_start AND window_start <= window_end),
  UNIQUE (formula_version, scope, window_end)
);

CREATE INDEX activity_index_snapshots_window_idx ON activity_index_snapshots (window_end DESC, scope);

CREATE FUNCTION forbid_activity_index_snapshot_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activity_index_snapshots is append-only';
END;
$$;

CREATE TRIGGER activity_index_snapshots_append_only
  BEFORE UPDATE OR DELETE ON activity_index_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_activity_index_snapshot_changes();

COMMIT;
