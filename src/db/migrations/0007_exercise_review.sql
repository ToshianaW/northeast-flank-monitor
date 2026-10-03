-- 0007_exercise_review
-- Exercises get a review status (only PUBLISHED is public), an append-only audit log,
-- and the reset evidence rule: any reset status other than UNKNOWN needs either a source
-- with an excerpt, or a linked published event dated on or after the exercise's end
-- (observed end, else announced end). FULL_RESET also needs all three dimensions
-- RETURNED or REMOVED. A published exercise needs at least one attached source.

BEGIN;

-- ---------------------------------------------------------------------------
-- Review status
-- ---------------------------------------------------------------------------

ALTER TABLE exercises
  ADD COLUMN review_status review_status NOT NULL DEFAULT 'DRAFT',
  ADD CONSTRAINT exercises_review_status_not_merged
    CHECK (review_status <> 'MERGED'),
  ADD CONSTRAINT exercises_full_reset_requires_dimensions
    CHECK (
      post_exercise_reset <> 'FULL_RESET'
      OR (personnel_return_status IN ('RETURNED', 'REMOVED')
          AND equipment_return_status IN ('RETURNED', 'REMOVED')
          AND infrastructure_status IN ('RETURNED', 'REMOVED'))
    );

CREATE INDEX exercises_review_status_idx ON exercises (review_status);

-- ---------------------------------------------------------------------------
-- exercise_actions (audit log; same idea as review_actions)
-- ---------------------------------------------------------------------------

CREATE TYPE exercise_action AS ENUM ('CREATE', 'EDIT');

CREATE TABLE exercise_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id      uuid NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  action           exercise_action NOT NULL,
  reviewer         text NOT NULL,
  source_ids       uuid[] NOT NULL DEFAULT '{}',
  previous_values  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((action = 'CREATE') = (previous_values IS NULL))
);

CREATE INDEX exercise_actions_exercise_id_idx ON exercise_actions (exercise_id, created_at);

CREATE FUNCTION forbid_exercise_action_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exercise_actions is append-only';
END;
$$;

CREATE TRIGGER exercise_actions_append_only
  BEFORE UPDATE OR DELETE ON exercise_actions
  FOR EACH ROW EXECUTE FUNCTION forbid_exercise_action_changes();

-- ---------------------------------------------------------------------------
-- Published exercises keep at least one source (mirrors events)
-- ---------------------------------------------------------------------------

CREATE FUNCTION check_published_exercise_has_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'exercises' THEN
    target := NEW.id;
  ELSE
    target := OLD.exercise_id;
  END IF;

  IF EXISTS (
       SELECT 1 FROM exercises x
       WHERE x.id = target AND x.review_status = 'PUBLISHED'
     )
     AND NOT EXISTS (
       SELECT 1 FROM exercise_sources es WHERE es.exercise_id = target
     )
  THEN
    RAISE EXCEPTION 'Published exercise % must have at least one source', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER exercises_published_requires_source
  AFTER INSERT OR UPDATE OF review_status ON exercises
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_exercise_has_source();

CREATE CONSTRAINT TRIGGER exercise_sources_keep_published_source
  AFTER DELETE OR UPDATE OF exercise_id ON exercise_sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_published_exercise_has_source();

-- ---------------------------------------------------------------------------
-- Reset evidence rule
-- ---------------------------------------------------------------------------

CREATE FUNCTION exercise_has_reset_evidence(target uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
           SELECT 1 FROM exercise_sources es
           WHERE es.exercise_id = target
             AND btrim(coalesce(es.excerpt, '')) <> ''
         )
      OR EXISTS (
           SELECT 1
           FROM exercises x
           JOIN events e ON e.exercise_id = x.id
           WHERE x.id = target
             AND e.review_status = 'PUBLISHED'
             AND coalesce(x.observed_end_date, x.announced_end_date) IS NOT NULL
             AND e.event_date >= coalesce(x.observed_end_date, x.announced_end_date)
         );
$$;

-- Deferred to commit so an exercise, its sources and its event links can be written
-- in one transaction.
CREATE FUNCTION check_exercise_reset_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
BEGIN
  IF TG_TABLE_NAME = 'exercises' THEN
    target := NEW.id;
  ELSE
    target := OLD.exercise_id;
  END IF;

  IF target IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
       SELECT 1 FROM exercises x
       WHERE x.id = target
         AND (x.post_exercise_reset <> 'UNKNOWN'
              OR x.personnel_return_status <> 'UNKNOWN'
              OR x.equipment_return_status <> 'UNKNOWN'
              OR x.infrastructure_status <> 'UNKNOWN')
     )
     AND NOT exercise_has_reset_evidence(target)
  THEN
    RAISE EXCEPTION 'Exercise % has a reset status other than UNKNOWN without evidence', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER exercises_reset_requires_evidence
  AFTER INSERT OR UPDATE OF post_exercise_reset, personnel_return_status,
    equipment_return_status, infrastructure_status,
    observed_end_date, announced_end_date
  ON exercises
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_exercise_reset_evidence();

CREATE CONSTRAINT TRIGGER exercise_sources_keep_reset_evidence
  AFTER DELETE OR UPDATE OF exercise_id, excerpt ON exercise_sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_exercise_reset_evidence();

-- Unlinking, unpublishing, re-dating or deleting a linked event must not remove the
-- last evidence.
CREATE CONSTRAINT TRIGGER events_keep_exercise_reset_evidence
  AFTER DELETE OR UPDATE OF exercise_id, review_status, event_date ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_exercise_reset_evidence();

COMMIT;
