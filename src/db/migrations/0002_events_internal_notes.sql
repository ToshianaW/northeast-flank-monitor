-- 0002_events_internal_notes
-- Reviewer-only working notes on events; not shown on the public site.

BEGIN;

ALTER TABLE events
  ADD COLUMN internal_notes text;

COMMIT;
