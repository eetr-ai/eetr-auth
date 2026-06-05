-- eetr-auth schema patch 0.4.1
-- Upgrade path: 0.4.0 -> 0.4.1
--   * Add per-environment password policies (named complexity + max-age rules) and
--     a policy<->environment assignment table.
--   * Add users.password_updated_at to track when a user last changed their password,
--     used by the login max-age gate. Nullable; NULL = not tracked -> not expired
--     (existing users are grandfathered; the clock starts on their next password change).
--
-- Idempotency: the new tables/index use CREATE ... IF NOT EXISTS so this patch can be
-- replayed safely. SQLite has no `ADD COLUMN IF NOT EXISTS`, so the two ADD COLUMN
-- statements (users.password_updated_at and site_settings.admin_password_policy_id) are
-- the non-idempotent ones; they are applied exactly once by the version gate in
-- run-d1-migrate.mjs (patches strictly greater than the DB's current version).
-- On a manual re-run against a DB that already has those columns, remove those lines.

-- Named password policies (complexity rules + max password age).
CREATE TABLE IF NOT EXISTS password_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_length INTEGER NOT NULL DEFAULT 8,
  max_length INTEGER,
  min_uppercase INTEGER NOT NULL DEFAULT 0,
  min_lowercase INTEGER NOT NULL DEFAULT 0,
  min_number INTEGER NOT NULL DEFAULT 0,
  min_special INTEGER NOT NULL DEFAULT 0,
  reject_contains_identifier INTEGER NOT NULL DEFAULT 0,
  max_password_age_days INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Policy<->environment assignments. One policy -> many environments, but each
-- environment maps to at most one policy (UNIQUE on environment_id).
CREATE TABLE IF NOT EXISTS password_policy_environments (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  environment_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (policy_id) REFERENCES password_policies(id) ON DELETE CASCADE,
  FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_policy_environments_policy_id
  ON password_policy_environments(policy_id);

-- User<->environment access grants (many-to-many). UNIQUE(user_id, environment_id)
-- makes the backfill below idempotent/replay-safe via INSERT OR IGNORE.
CREATE TABLE IF NOT EXISTS users_environments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  UNIQUE(user_id, environment_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_environments_user_id ON users_environments(user_id);
CREATE INDEX IF NOT EXISTS idx_users_environments_environment_id ON users_environments(environment_id);

-- Backwards compatibility: grant every existing user access to every environment.
-- INSERT OR IGNORE + the UNIQUE constraint keep this safe to replay.
INSERT OR IGNORE INTO users_environments (id, user_id, environment_id)
SELECT lower(hex(randomblob(16))), u.id, e.id
FROM users u CROSS JOIN environments e;

-- Non-idempotent: applied exactly once by the version gate (see header note).
ALTER TABLE users ADD COLUMN password_updated_at TEXT;

-- Admin sign-in password policy. Admins don't belong to an environment, so the policy
-- that applies to them is a global selection on the site_settings singleton (NULL = none).
-- Non-idempotent ADD COLUMN, applied exactly once by the version gate (see header note).
-- REFERENCES is valid here because password_policies is created earlier in this patch.
ALTER TABLE site_settings ADD COLUMN admin_password_policy_id TEXT REFERENCES password_policies(id) ON DELETE SET NULL;

UPDATE schema_metadata SET value = '0.4.1' WHERE key = 'schema_version';
