-- 0014_x_breaking
-- The reviewer marks an event as breaking at approval, for extreme situations only. Its X post then
-- starts "🚨<flag> BREAKING:" instead of "🚨<flag> NEW:". Never shown on the site. Additions only.

BEGIN;

ALTER TABLE events ADD COLUMN x_breaking boolean NOT NULL DEFAULT false;

COMMIT;
