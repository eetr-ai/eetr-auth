-- Site MFA flag + user_challenges for MFA OTP and password reset.
PRAGMA foreign_keys = ON;

ALTER TABLE site_settings ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mfa_otp', 'password_reset')),
  code_hash TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_challenges_expires_at ON user_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id_kind ON user_challenges(user_id, kind);
