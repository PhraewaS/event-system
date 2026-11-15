CREATE TABLE login_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX login_rate_limits_expiry ON login_rate_limits(reset_at);
