-- 0006_login_attempts
-- Failed admin sign-ins, for rate limiting on serverless (no shared memory between instances).
-- Stores only an HMAC of the client IP keyed with SESSION_SECRET: never the IP or the password.
-- Rows older than a day are pruned by the login action itself.

BEGIN;

CREATE TABLE login_attempts (
  ip_hash       text NOT NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-IP window: failures from one ip_hash in the last 15 minutes.
CREATE INDEX login_attempts_ip_time_idx ON login_attempts (ip_hash, attempted_at DESC);
-- Global window and pruning: all failures by time.
CREATE INDEX login_attempts_time_idx ON login_attempts (attempted_at);

COMMIT;
