-- eetr-auth schema patch 0.1.0
-- Upgrade path: existing pre-versioned schema -> 0.1.0

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO schema_metadata (key, value)
VALUES ('schema_version', '0.1.0')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;