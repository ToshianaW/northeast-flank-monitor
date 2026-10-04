-- 0009_x_post_outbox
-- Posts to X: when a current event, exercise or daily digest becomes PUBLISHED, a row is queued
-- here in the same transaction (triggers below), and workers/x/post.mts posts it: events and
-- exercises as summary + original source link, digests as summary + link to the digest page.
-- Historical events are never queued (no trigger on historical_events).
-- One row per item: unpublishing does not delete the post, and publishing the same item again
-- does not post it again. Items already published before this migration are not queued.

BEGIN;

CREATE TYPE x_post_status AS ENUM ('PENDING', 'POSTED', 'SKIPPED', 'FAILED');

CREATE TABLE x_post_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind   text NOT NULL CHECK (item_kind IN ('event', 'exercise', 'digest')),
  item_id     uuid NOT NULL,
  status      x_post_status NOT NULL DEFAULT 'PENDING',
  attempts    integer NOT NULL DEFAULT 0,
  post_text   text,
  post_id     text,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  posted_at   timestamptz,
  UNIQUE (item_kind, item_id),
  CHECK ((status = 'POSTED') = (post_id IS NOT NULL AND posted_at IS NOT NULL))
);

CREATE INDEX x_post_outbox_status_idx ON x_post_outbox (status, created_at);

CREATE FUNCTION enqueue_x_post_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'PUBLISHED'
     AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'PUBLISHED') THEN
    INSERT INTO x_post_outbox (item_kind, item_id) VALUES ('event', NEW.event_id)
    ON CONFLICT (item_kind, item_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION enqueue_x_post_exercise() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'PUBLISHED'
     AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'PUBLISHED') THEN
    INSERT INTO x_post_outbox (item_kind, item_id) VALUES ('exercise', NEW.id)
    ON CONFLICT (item_kind, item_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION enqueue_x_post_digest() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'PUBLISHED'
     AND (TG_OP = 'INSERT' OR OLD.review_status IS DISTINCT FROM 'PUBLISHED') THEN
    INSERT INTO x_post_outbox (item_kind, item_id) VALUES ('digest', NEW.id)
    ON CONFLICT (item_kind, item_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER daily_digests_enqueue_x_post
  AFTER INSERT OR UPDATE OF review_status ON daily_digests
  FOR EACH ROW EXECUTE FUNCTION enqueue_x_post_digest();

CREATE TRIGGER events_enqueue_x_post
  AFTER INSERT OR UPDATE OF review_status ON events
  FOR EACH ROW EXECUTE FUNCTION enqueue_x_post_event();

CREATE TRIGGER exercises_enqueue_x_post
  AFTER INSERT OR UPDATE OF review_status ON exercises
  FOR EACH ROW EXECUTE FUNCTION enqueue_x_post_exercise();

COMMIT;
