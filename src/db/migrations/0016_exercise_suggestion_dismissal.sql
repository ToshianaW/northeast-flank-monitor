-- 0016_exercise_suggestion_dismissal
-- A reviewer can dismiss an exercise's suggested update (status or observed dates reported by its
-- linked events). The column keeps the dismissed suggestion's key, so the flag returns only when
-- the linked events report something different. Each dismissal is logged in exercise_actions with
-- the suggestion it dismissed. Additions only.

BEGIN;

ALTER TABLE exercises ADD COLUMN dismissed_suggestion text;

ALTER TYPE exercise_action ADD VALUE 'DISMISS_SUGGESTION';

COMMIT;
