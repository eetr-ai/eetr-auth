-- Token activity log: request type, success, environment, duration, IP. Retention 1 week (cleanup via cron).
CREATE TABLE IF NOT EXISTS token_activity_log (
  id TEXT PRIMARY KEY,
  ip_address TEXT,
  request_type TEXT NOT NULL,
  succeeded INTEGER NOT NULL,
  environment_name TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_activity_log_created_at ON token_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_token_activity_log_request_type_env ON token_activity_log(request_type, environment_name, created_at);
