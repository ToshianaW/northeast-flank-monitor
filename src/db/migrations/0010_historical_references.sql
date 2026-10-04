-- 0010_historical_references
-- Reviewer-approved "similar in nature" references from a current event to historical events.
-- The only bridge between current and historical data: one row per approved pair, with the
-- shared attributes from a fixed list. The model may only suggest pairs; a person approves each.
-- At most 3 references per event. Both events must be PUBLISHED when a reference is made, and
-- the public read checks both again at read time. Every link and unlink is logged (append-only).

BEGIN;

CREATE TYPE reference_attribute AS ENUM (
  'SAME_EVENT_TYPE',
  'SAME_COUNTRY',
  'SAME_ACTOR',
  'SAME_KIND_OF_ACTIVITY'
);

CREATE TABLE event_historical_references (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES events (event_id) ON DELETE RESTRICT,
  historical_event_id  uuid NOT NULL REFERENCES historical_events (event_id) ON DELETE RESTRICT,
  shared_attributes    reference_attribute[] NOT NULL CHECK (cardinality(shared_attributes) BETWEEN 1 AND 4),
  reviewer             text NOT NULL CHECK (btrim(reviewer) <> ''),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, historical_event_id)
);

CREATE INDEX event_historical_references_historical_idx
  ON event_historical_references (historical_event_id);

-- Insert only: both PUBLISHED, attributes not repeated, and at most 3 per event. The event row
-- is locked first so two concurrent approvals cannot both pass the count.
CREATE FUNCTION check_event_historical_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status    review_status;
  historical_status text;
  existing          integer;
BEGIN
  SELECT review_status INTO current_status FROM events WHERE event_id = NEW.event_id FOR UPDATE;
  IF current_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'Event % must be PUBLISHED to reference the historical record', NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT review_status::text INTO historical_status FROM historical_events WHERE event_id = NEW.historical_event_id;
  IF historical_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'Historical event % must be PUBLISHED to be referenced', NEW.historical_event_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF cardinality(NEW.shared_attributes) <> (SELECT count(DISTINCT a) FROM unnest(NEW.shared_attributes) AS a) THEN
    RAISE EXCEPTION 'Shared attributes may not repeat' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO existing FROM event_historical_references WHERE event_id = NEW.event_id;
  IF existing >= 3 THEN
    RAISE EXCEPTION 'Event % already has 3 historical references (the maximum)', NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_historical_references_check
  BEFORE INSERT ON event_historical_references
  FOR EACH ROW EXECUTE FUNCTION check_event_historical_reference();

-- No edits: change a reference by unlinking and linking again, so the log shows both.
CREATE FUNCTION forbid_event_historical_reference_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event_historical_references rows cannot be edited; unlink and link again';
END;
$$;

CREATE TRIGGER event_historical_references_no_update
  BEFORE UPDATE ON event_historical_references
  FOR EACH ROW EXECUTE FUNCTION forbid_event_historical_reference_update();

-- Append-only log of every link and unlink, with the reviewer.
CREATE TABLE event_historical_reference_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             uuid NOT NULL REFERENCES events (event_id) ON DELETE RESTRICT,
  historical_event_id  uuid NOT NULL REFERENCES historical_events (event_id) ON DELETE RESTRICT,
  action               text NOT NULL CHECK (action IN ('LINK', 'UNLINK')),
  shared_attributes    reference_attribute[] NOT NULL,
  reviewer             text NOT NULL CHECK (btrim(reviewer) <> ''),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_historical_reference_log_event_idx
  ON event_historical_reference_log (event_id, created_at);

CREATE FUNCTION forbid_event_historical_reference_log_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event_historical_reference_log is append-only';
END;
$$;

CREATE TRIGGER event_historical_reference_log_append_only
  BEFORE UPDATE OR DELETE ON event_historical_reference_log
  FOR EACH ROW EXECUTE FUNCTION forbid_event_historical_reference_log_changes();

COMMIT;
