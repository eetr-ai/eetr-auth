-- eetr-auth schema patch 0.3.0
-- Upgrade path: 0.2.0 -> 0.3.0
--   * Add identifying metadata to `user_passkeys` so users can manage multiple
--     passkeys (one per device): a user-editable `name` and `last_used_at`.
--     Both are nullable, so a plain ADD COLUMN suffices — no table rebuild needed.
--   * Add `user_totp` for per-user authenticator-app (TOTP) MFA enrollment, a second
--     MFA method alongside the site-wide email OTP. The base32 secret is stored
--     encrypted at rest (AES-GCM, key derived from AUTH_SECRET); `confirmed_at` is NULL
--     while enrollment is pending and set once the user verifies their first code.
--     One enrollment per user (PK = user_id).

ALTER TABLE user_passkeys ADD COLUMN name TEXT;
ALTER TABLE user_passkeys ADD COLUMN last_used_at TEXT;

CREATE TABLE IF NOT EXISTS user_totp (
  user_id TEXT PRIMARY KEY,
  secret_enc TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

UPDATE schema_metadata SET value = '0.3.0' WHERE key = 'schema_version';
