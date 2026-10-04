-- 0011_automatic_references
-- Automatic "similar in nature" links (no model): when a current event is published, code links up
-- to 3 published historical entries with the same event type AND the same country. Each link
-- records how it was made (matched_by), and automatic links carry reviewer 'auto-match' and only
-- verifiable attributes. A reviewer approval of an AI suggestion marks ai_suggested.
-- When either event leaves PUBLISHED, its links are logged as UNLINK and removed.
-- Additions only: two columns on each 0010 table, one constraint, one function, two triggers.

BEGIN;

ALTER TABLE event_historical_references
  ADD COLUMN matched_by text NOT NULL DEFAULT 'REVIEWER' CHECK (matched_by IN ('AUTO', 'REVIEWER')),
  ADD COLUMN ai_suggested boolean NOT NULL DEFAULT false;

-- AUTO: reviewer 'auto-match', same type AND same country, never "same kind of activity", never
-- AI. ai_suggested only on a reviewer link that includes "same kind of activity".
ALTER TABLE event_historical_references
  ADD CONSTRAINT event_historical_references_origin_check CHECK (
    CASE matched_by
      WHEN 'AUTO' THEN reviewer = 'auto-match'
        AND NOT ai_suggested
        AND shared_attributes @> '{SAME_EVENT_TYPE,SAME_COUNTRY}'::reference_attribute[]
        AND NOT ('SAME_KIND_OF_ACTIVITY'::reference_attribute = ANY (shared_attributes))
      ELSE reviewer <> 'auto-match'
        AND (NOT ai_suggested OR 'SAME_KIND_OF_ACTIVITY'::reference_attribute = ANY (shared_attributes))
    END
  );

ALTER TABLE event_historical_reference_log
  ADD COLUMN matched_by text NOT NULL DEFAULT 'REVIEWER' CHECK (matched_by IN ('AUTO', 'REVIEWER'));

-- Unpublish cleanup: when a current or historical event leaves PUBLISHED, every link that uses it
-- is logged as UNLINK by 'system: unpublished' and deleted. (The public read already hides them.)
CREATE FUNCTION unlink_references_on_unpublish() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer, matched_by)
    SELECT r.event_id, r.historical_event_id, 'UNLINK', r.shared_attributes, 'system: unpublished', r.matched_by
    FROM event_historical_references r WHERE r.event_id = NEW.event_id;
    DELETE FROM event_historical_references WHERE event_id = NEW.event_id;
  ELSE
    INSERT INTO event_historical_reference_log (event_id, historical_event_id, action, shared_attributes, reviewer, matched_by)
    SELECT r.event_id, r.historical_event_id, 'UNLINK', r.shared_attributes, 'system: unpublished', r.matched_by
    FROM event_historical_references r WHERE r.historical_event_id = NEW.event_id;
    DELETE FROM event_historical_references WHERE historical_event_id = NEW.event_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER events_unlink_references_on_unpublish
  AFTER UPDATE OF review_status ON events
  FOR EACH ROW
  WHEN (OLD.review_status = 'PUBLISHED' AND NEW.review_status <> 'PUBLISHED')
  EXECUTE FUNCTION unlink_references_on_unpublish();

CREATE TRIGGER historical_events_unlink_references_on_unpublish
  AFTER UPDATE OF review_status ON historical_events
  FOR EACH ROW
  WHEN (OLD.review_status = 'PUBLISHED' AND NEW.review_status <> 'PUBLISHED')
  EXECUTE FUNCTION unlink_references_on_unpublish();

COMMIT;
