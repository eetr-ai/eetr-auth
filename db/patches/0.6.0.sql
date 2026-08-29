-- eetr-auth schema patch 0.6.0
-- Upgrade path: 0.5.0 -> 0.6.0
--   * Human-readable consent copy for scopes:
--       - scopes.display_name: short label shown on the consent screen ("Your email address").
--       - scopes.description: one-sentence explanation ("See your email address ...").
--     Both optional; the consent UI falls back to scope_name. Discovery is unaffected --
--     `scopes_supported` still publishes scope_name only.
--   * Recorded end-user consent (user_consents): one row per (user, client) holding the
--     accumulated union of consented scope names. Lets the authorize flow skip the consent
--     screen when nothing new is being requested, and lets an admin list and revoke consent.
--   * Custom JWT claims per client (client_claims): static key/value pairs injected into
--     the access tokens that client is issued. value_type preserves the JSON type so a
--     numeric claim is a number in the JWT, not a string.
--   * Test clients and passwordless test users:
--       - users.is_test_user: a passwordless user signed in with one click from a test
--         client's sign-in page. password_hash holds the empty sentinel '' (the idiom
--         clients.client_secret already uses for public clients); verifyPassword() matches
--         it against neither the Argon2 PHC prefix nor the 32-hex MD5 shape, so no password
--         can ever authenticate the row.
--       - clients.is_test: a normal OAuth client whose sign-in page lists only test users,
--         and the only kind of client a test user may authenticate against.
--     Both are set at creation and immutable. Each carries a CHECK that SQLite applies on
--     INSERT and UPDATE alike: a test user can never be an admin (a passwordless dashboard
--     admin would be critical), and a DCR-registered client can never be a test client
--     (it is created by an unauthenticated caller).
--   * Long-lived API keys (api_keys, api_key_scopes): a per-(client, user) credential a
--     machine caller exchanges for a short-lived access token at POST /api/token/api-key,
--     instead of shipping the client_secret and running a client_credentials call before
--     every request. Presented as `eak_<key_id>_<secret>`: `key_id` is the clear-text
--     lookup handle (an Argon2id digest is not searchable) and only `secret` is hashed,
--     via the same argon-hasher service that stores user passwords. user_id is mandatory,
--     so the minted JWT's `sub` always names a real person. api_key_scopes keys on
--     client_scopes(id) like token_scopes, so ungranting a client scope cascades.
--   * Human-readable label for environments:
--       - environments.display_name, admin-UI only.
--     environments.name stays the stable identifier -- it is the `environment` JWT claim, the
--     `environmentName` field on POST /api/token/validate, and the denormalized value in
--     token_activity_log.environment_name -- so it is deliberately NOT renamed here.
--
-- Idempotency: the new table + indexes + triggers use CREATE ... IF NOT EXISTS, and the seed-copy
-- backfill is guarded on `IS NULL`, so both are replay-safe. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so the five ADD COLUMN statements are the non-idempotent
-- ones; they are applied exactly once by the version gate in run-d1-migrate.mjs (patches
-- strictly greater than the DB's current version). On a manual re-run against a DB that
-- already has these columns, remove those lines.

-- Non-idempotent ADD COLUMNs (applied exactly once by the version gate; see header note).
-- All are nullable, so existing rows upgrade cleanly.
ALTER TABLE scopes ADD COLUMN display_name TEXT;
ALTER TABLE scopes ADD COLUMN description TEXT;
ALTER TABLE environments ADD COLUMN display_name TEXT;

-- NOT NULL is safe on ALTER here because the default is a constant: every existing user
-- upgrades to "not a test user" and every existing client to "not a test client". The
-- CHECK clauses are stored with the column and enforced from this point on; SQLite does
-- not re-validate existing rows, which is correct -- they are all 0.
ALTER TABLE users ADD COLUMN is_test_user INTEGER NOT NULL DEFAULT 0
  CHECK (is_test_user = 0 OR is_admin = 0);
ALTER TABLE clients ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0
  CHECK (is_test = 0 OR is_dynamic = 0);

-- The test-user picker reads this on every test-client sign-in page render.
CREATE INDEX IF NOT EXISTS idx_users_is_test_user ON users(is_test_user);

-- The CHECK constraints above reject invalid *combinations*, but they cannot express
-- immutability: nothing in them stops `UPDATE users SET is_test_user = 1` on an ordinary
-- non-admin account, which would leave a real password hash on a row that is now eligible
-- for one-click sign-in. The application never writes either column after creation
-- (neither appears in an update input, and both admin API endpoints reject them), so these
-- triggers exist for the paths the application does not own: a migration, a support
-- script, or a hand-written UPDATE at the D1 console.
--
-- Guarded on OLD <> NEW so an idempotent write of the same value is still allowed; only a
-- real change aborts.
CREATE TRIGGER IF NOT EXISTS users_is_test_user_immutable
BEFORE UPDATE OF is_test_user ON users
FOR EACH ROW WHEN OLD.is_test_user <> NEW.is_test_user
BEGIN
  SELECT RAISE(ABORT, 'users.is_test_user is immutable; delete and recreate the user');
END;

CREATE TRIGGER IF NOT EXISTS clients_is_test_immutable
BEFORE UPDATE OF is_test ON clients
FOR EACH ROW WHEN OLD.is_test <> NEW.is_test
BEGIN
  SELECT RAISE(ABORT, 'clients.is_test is immutable; delete and recreate the client');
END;

-- Backfill consent copy for the three seeded OIDC scopes. Guarded on IS NULL so a
-- re-run never clobbers copy an admin has since edited. Scopes an operator defined
-- themselves are left alone -- they fall back to scope_name until copy is written.
UPDATE scopes
  SET display_name = 'Sign you in',
      description = 'Verify your identity and sign you in.'
  WHERE scope_name = 'openid' AND display_name IS NULL AND description IS NULL;

UPDATE scopes
  SET display_name = 'Your basic profile',
      description = 'See your name and profile picture.'
  WHERE scope_name = 'profile' AND display_name IS NULL AND description IS NULL;

UPDATE scopes
  SET display_name = 'Your email address',
      description = 'See your email address and whether it is verified.'
  WHERE scope_name = 'email' AND display_name IS NULL AND description IS NULL;

-- environments.display_name is deliberately NOT backfilled from `name`: leaving it NULL
-- makes every UI surface fall back to `name`, so the label keeps tracking a rename until
-- an admin sets one explicitly.

-- Recorded end-user consent. `scopes` is the space-delimited, sorted union of the scope
-- NAMES consented to for that client. Text rather than a link table so a consent record
-- survives a scope later being ungranted from the client or deleted outright.
CREATE TABLE IF NOT EXISTS user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- clients.id (the internal row id), not clients.client_id.
  client_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, client_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_client_id ON user_consents(client_id);

-- Static custom JWT claims per client, injected into that client's access tokens.
-- `value_type` says how to decode `claim_value` when minting, so a numeric or boolean
-- claim lands in the JWT with its real type. Reserved claim names are rejected by the
-- service rather than by a constraint here.
CREATE TABLE IF NOT EXISTS client_claims (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  claim_name TEXT NOT NULL,
  claim_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string'
    CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  -- Structured claims are the ones most likely to be hand-written, and a malformed one
  -- would silently vanish from every token (getTokenClaims drops what it cannot decode),
  -- so reject it at the boundary instead. The other types are deliberately NOT constrained
  -- here: 'boolean' is case-insensitive in the service, and a SQL check for 'number' cannot
  -- match what Number() accepts (1e5, .5, -2.5) without rejecting valid input. Type
  -- semantics live in ClientClaimService.
  CHECK (value_type <> 'json' OR json_valid(claim_value)),
  UNIQUE(client_id, claim_name),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_claims_client_id ON client_claims(client_id);

-- Long-lived API keys: a per-(client, user) credential that CI/CD and other machine
-- callers exchange for a short-lived access token at POST /api/token/api-key, instead of
-- shipping the client_secret and running a client_credentials call before every request.
--
-- The presented credential is `eak_<key_id>_<secret>`. Argon2id digests are not
-- searchable, so `key_id` is the lookup handle: it is stored in the clear, indexed, and
-- safe to show in the admin UI, while only `secret` is hashed into `key_hash` (the same
-- argon-hasher service that stores user passwords -- NOT the HMAC scheme clients.client_secret
-- uses, which is reversible-by-key and designed for a value we verify on every token call).
--
-- `user_id` is mandatory: the minted JWT's `sub` is that user, so every machine-issued
-- token is attributable to a person. ON DELETE CASCADE on both FKs means deleting the
-- client or the user destroys its keys rather than orphaning a live credential.
--
-- `revoked_at` is a soft delete: the row stays so the admin audit trail and the
-- token_activity_log rows that reference this key still resolve.
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  -- clients.id (the internal row id), not clients.client_id.
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  -- NULL = never expires.
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_client_id ON api_keys(client_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- The scope subset a key may mint, keyed on client_scopes(id) exactly like token_scopes
-- and refresh_token_scopes. Keying on the grant rather than the scope name means revoking
-- a scope from the client cascades to every key that referenced it, so a key can never
-- outlive its client's grant. No rows for a key = the key mints all of the client's
-- current scopes.
CREATE TABLE IF NOT EXISTS api_key_scopes (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  client_scope_id TEXT NOT NULL,
  UNIQUE(api_key_id, client_scope_id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
  FOREIGN KEY (client_scope_id) REFERENCES client_scopes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_key_scopes_api_key_id ON api_key_scopes(api_key_id);

UPDATE schema_metadata SET value = '0.6.0' WHERE key = 'schema_version';
