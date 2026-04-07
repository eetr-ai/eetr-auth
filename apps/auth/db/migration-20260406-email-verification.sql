-- Add user email verification tracking and rebuild user_challenges so its CHECK constraint
-- allows the new email_verification kind. user_challenges_new is only a temporary table
-- used during the migration because SQLite/D1 cannot alter the CHECK constraint in place.
PRAGMA foreign_keys = OFF;

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

CREATE TABLE user_challenges_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mfa_otp', 'password_reset', 'email_verification')),
  code_hash TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  otp_failed_attempts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO user_challenges_new (
  id,
  user_id,
  kind,
  code_hash,
  expires_at,
  created_at,
  consumed_at,
  otp_failed_attempts
)
SELECT
  id,
  user_id,
  kind,
  code_hash,
  expires_at,
  created_at,
  consumed_at,
  otp_failed_attempts
FROM user_challenges;

DROP TABLE user_challenges;
ALTER TABLE user_challenges_new RENAME TO user_challenges;

CREATE INDEX IF NOT EXISTS idx_user_challenges_expires_at ON user_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id_kind ON user_challenges(user_id, kind);

PRAGMA foreign_keys = ON;