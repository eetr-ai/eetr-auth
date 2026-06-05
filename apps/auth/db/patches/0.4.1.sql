-- eetr-auth schema patch 0.4.1
-- Upgrade path: 0.4.0 -> 0.4.1
--   * Add per-environment password policies (named complexity + max-age rules) and
--     a policy<->environment assignment table.
--   * Add users.password_updated_at to track when a user last changed their password,
--     used by the login max-age gate. Nullable; NULL = not tracked -> not expired
--     (existing users are grandfathered; the clock starts on their next password change).
--
-- Idempotency: the new tables/index use CREATE ... IF NOT EXISTS so this patch can be
-- replayed safely. SQLite has no `ADD COLUMN IF NOT EXISTS`, so the users column add
-- below is the one non-idempotent statement; it is applied exactly once by the version
-- gate in run-d1-migrate.mjs (patches strictly greater than the DB's current version).
-- On a manual re-run against a DB that already has the column, remove that single line.

-- Named password policies (complexity rules + max password age).
CREATE TABLE IF NOT EXISTS password_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_length INTEGER NOT NULL DEFAULT 8,
  max_length INTEGER,
  require_uppercase INTEGER NOT NULL DEFAULT 0,
  require_lowercase INTEGER NOT NULL DEFAULT 0,
  require_number INTEGER NOT NULL DEFAULT 0,
  require_special INTEGER NOT NULL DEFAULT 0,
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

-- Non-idempotent: applied exactly once by the version gate (see header note).
ALTER TABLE users ADD COLUMN password_updated_at TEXT;

UPDATE schema_metadata SET value = '0.4.1' WHERE key = 'schema_version';
