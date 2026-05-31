-- eetr-auth schema patch 0.3.0
-- Upgrade path: 0.2.0 -> 0.3.0
--   * Add identifying metadata to `user_passkeys` so users can manage multiple
--     passkeys (one per device): a user-editable `name` and `last_used_at`.
--     Both are nullable, so a plain ADD COLUMN suffices — no table rebuild needed.

ALTER TABLE user_passkeys ADD COLUMN name TEXT;
ALTER TABLE user_passkeys ADD COLUMN last_used_at TEXT;

UPDATE schema_metadata SET value = '0.3.0' WHERE key = 'schema_version';
