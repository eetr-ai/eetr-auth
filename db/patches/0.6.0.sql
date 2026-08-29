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
--   * Human-readable label for environments:
--       - environments.display_name, admin-UI only.
--     environments.name stays the stable identifier -- it is the `environment` JWT claim, the
--     `environmentName` field on POST /api/token/validate, and the denormalized value in
--     token_activity_log.environment_name -- so it is deliberately NOT renamed here.
--
-- Idempotency: the new table + indexes use CREATE ... IF NOT EXISTS, and the seed-copy
-- backfill is guarded on `IS NULL`, so both are replay-safe. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so the three ADD COLUMN statements are the non-idempotent
-- ones; they are applied exactly once by the version gate in run-d1-migrate.mjs (patches
-- strictly greater than the DB's current version). On a manual re-run against a DB that
-- already has these columns, remove those lines.

-- Non-idempotent ADD COLUMNs (applied exactly once by the version gate; see header note).
-- All are nullable, so existing rows upgrade cleanly.
ALTER TABLE scopes ADD COLUMN display_name TEXT;
ALTER TABLE scopes ADD COLUMN description TEXT;
ALTER TABLE environments ADD COLUMN display_name TEXT;

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

UPDATE schema_metadata SET value = '0.6.0' WHERE key = 'schema_version';
