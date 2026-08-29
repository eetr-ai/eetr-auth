-- eetr-auth D1 schema (SQLite)
-- Current schema version: 0.6.0
-- Apply with: npm run db:schema (fresh local), npm run db:schema:remote (fresh remote),
-- or the db:migrate variants when upgrading an existing environment

-- Enable foreign keys (D1 supports them)
PRAGMA foreign_keys = ON;

-- Schema metadata (singleton key/value store)
CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO schema_metadata (key, value)
VALUES ('schema_version', '0.6.0')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- Environments (e.g. development, staging, production)
--
-- `name` is the stable IDENTIFIER, not a label: it is emitted as the `environment` JWT
-- claim, it is the `environmentName` callers send to POST /api/token/validate, and it is
-- denormalized into token_activity_log.environment_name. Renaming it breaks live token
-- validation and orphans historical log rows.
--
-- `display_name` is the human-facing label used by the admin UI only. NULL means "no
-- label set" and every surface falls back to `name`, so the label tracks a rename until
-- an admin sets one explicitly.
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT
);

-- Users (only is_admin users can access dashboard)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  email_verified_at TEXT,
  avatar_key TEXT,
  password_hash TEXT NOT NULL,
  -- Set whenever the user changes their password (create/update/reset). Used by the
  -- login max-age gate. NULL = not tracked -> treated as not expired.
  password_updated_at TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0
);

-- User<->environment access grants (many-to-many). Controls which environments a
-- user may access. On upgrade (patch 0.4.1) every existing user is granted every
-- environment for backwards compatibility.
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

-- Clients (OAuth clients per environment, created by a user/admin)
-- created_by is nullable + SET NULL on user delete so removing an admin does not
-- cascade into their OAuth clients. Dynamically registered (RFC 7591) clients have
-- created_by = NULL and is_dynamic = 1.
--
-- token_endpoint_auth_method mirrors RFC 7591: 'client_secret_basic'/'client_secret_post'
-- for confidential clients (client_secret is a real HMAC-stored secret) or 'none' for
-- public (PKCE-only) clients, which authenticate with PKCE and no secret. Public clients
-- store client_secret = '' (empty sentinel) so the column can stay NOT NULL without a
-- table rebuild; authenticateClient branches on token_endpoint_auth_method and never
-- verifies the sentinel.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  created_by TEXT,
  expires_at TEXT,
  name TEXT,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic',
  is_dynamic INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (environment_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_environment_id ON clients(environment_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);

-- Redirect URIs allowed per client
CREATE TABLE IF NOT EXISTS redirect_uris (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redirect_uris_client_id ON redirect_uris(client_id);

-- Scopes (global scope definitions)
--
-- `scope_name` is the protocol token (what the client puts in the `scope` parameter).
-- `display_name` and `description` are the human-readable copy shown on the consent
-- screen; both are optional and the consent UI falls back to `scope_name` when they are
-- NULL. Neither affects protocol behaviour or discovery (`scopes_supported` publishes
-- `scope_name` only).
CREATE TABLE IF NOT EXISTS scopes (
  id TEXT PRIMARY KEY,
  scope_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT
);

-- Default OIDC scopes. Seeded so a fresh install can perform OpenID Connect out of the box:
-- `openid` is required to mint an id_token and to call /userinfo; `profile` and `email` gate
-- their respective claims (mirroring buildIdToken / buildUserInfoClaims). Seeding only DEFINES
-- the scopes -- an admin still grants them to specific clients, and the client must request
-- them (or request no scope, which defaults to all of its grants). INSERT OR IGNORE against
-- the UNIQUE(scope_name) constraint keeps this replay-safe.
INSERT OR IGNORE INTO scopes (id, scope_name, display_name, description) VALUES
  (lower(hex(randomblob(16))), 'openid', 'Sign you in', 'Verify your identity and sign you in.'),
  (lower(hex(randomblob(16))), 'profile', 'Your basic profile', 'See your name and profile picture.'),
  (lower(hex(randomblob(16))), 'email', 'Your email address', 'See your email address and whether it is verified.');

-- Client-scope assignments (which scopes a client can request)
CREATE TABLE IF NOT EXISTS client_scopes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  UNIQUE(client_id, scope_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (scope_id) REFERENCES scopes(id)
);

CREATE INDEX IF NOT EXISTS idx_client_scopes_client_id ON client_scopes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_scopes_scope_id ON client_scopes(scope_id);

-- Custom JWT claims a client injects into the access tokens it is issued.
--
-- Values are static per client: whatever an admin configured is what every access token
-- for that client carries. `value_type` says how to decode `claim_value` when minting, so
-- a numeric or boolean claim lands in the JWT as a number or boolean rather than a string.
-- 'json' holds a serialized object/array for structured claims.
--
-- Claim names that would collide with a registered or protocol claim (iss, sub, aud, exp,
-- iat, nbf, jti, scope, client_id, environment, ...) are rejected by the service, not by a
-- constraint here -- the reserved set is application knowledge and changes with the code.
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

-- Recorded end-user consent. One row per (user, client) holding the accumulated union of
-- the scope NAMES that user has consented to for that client, space-delimited and sorted.
--
-- Stored as text rather than a link table on purpose: a consent record must survive a scope
-- later being ungranted from the client (or deleted outright), and it parses with the same
-- whitespace splitting used everywhere else for the `scope` parameter.
--
-- The authorize flow skips the consent screen when this set already covers every requested
-- scope. Deleting a row withdraws consent, so the next authorize prompts again.
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

-- Named password policies (complexity rules + max password age). Assigned to
-- environments via password_policy_environments.
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

-- Tokens (issued for a client). `resource` (RFC 8707) is the audience the token was
-- minted for; NULL means the legacy default (the client's own client_id). Stored so the
-- opaque-token introspection path can report the correct audience.
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  resource TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tokens_token_id ON tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_tokens_client_id ON tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);

-- Token-scope links (which granted client_scopes are included in a token)
CREATE TABLE IF NOT EXISTS token_scopes (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  client_scope_id TEXT NOT NULL,
  FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE,
  FOREIGN KEY (client_scope_id) REFERENCES client_scopes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_scopes_token_id ON token_scopes(token_id);
CREATE INDEX IF NOT EXISTS idx_token_scopes_client_scope_id ON token_scopes(client_scope_id);

-- Authorization codes (for authorization_code + PKCE flow). `resource` (RFC 8707) is the
-- audience requested at /authorize; it is bound to the code and must be consistent at
-- /token. NULL = no resource requested.
CREATE TABLE IF NOT EXISTS authorization_codes (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  subject TEXT NOT NULL,
  nonce TEXT,
  auth_time TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  resource TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_authorization_codes_code_id ON authorization_codes(code_id);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_client_id ON authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_expires_at ON authorization_codes(expires_at);

-- Authorization-code scope links
CREATE TABLE IF NOT EXISTS authorization_code_scopes (
  id TEXT PRIMARY KEY,
  authorization_code_id TEXT NOT NULL,
  client_scope_id TEXT NOT NULL,
  FOREIGN KEY (authorization_code_id) REFERENCES authorization_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (client_scope_id) REFERENCES client_scopes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_authorization_code_scopes_authorization_code_id ON authorization_code_scopes(authorization_code_id);
CREATE INDEX IF NOT EXISTS idx_authorization_code_scopes_client_scope_id ON authorization_code_scopes(client_scope_id);

-- Refresh tokens (issued for authorization_code and client_credentials grants).
-- `resource` (RFC 8707) carries the bound audience through refresh so rotated access
-- tokens keep the same `aud`. NULL = legacy default.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  refresh_token_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  subject TEXT,
  access_token_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_from_id TEXT,
  created_at TEXT NOT NULL,
  resource TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (access_token_id) REFERENCES tokens(id) ON DELETE SET NULL,
  FOREIGN KEY (rotated_from_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_refresh_token_id ON refresh_tokens(refresh_token_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id ON refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- Refresh-token scope links
CREATE TABLE IF NOT EXISTS refresh_token_scopes (
  id TEXT PRIMARY KEY,
  refresh_token_id TEXT NOT NULL,
  client_scope_id TEXT NOT NULL,
  FOREIGN KEY (refresh_token_id) REFERENCES refresh_tokens(id) ON DELETE CASCADE,
  FOREIGN KEY (client_scope_id) REFERENCES client_scopes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_scopes_refresh_token_id ON refresh_token_scopes(refresh_token_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_scopes_client_scope_id ON refresh_token_scopes(client_scope_id);

-- Token activity log (1-week retention; cleanup via cron)
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

-- Dynamic Client Registration (RFC 7591) per-IP daily rate limit. One row per (ip, day);
-- `count` is the number of registration attempts that IP made on that UTC day. `day` is a
-- 'YYYY-MM-DD' string. Old rows are pruned by the daily cleanup cron.
CREATE TABLE IF NOT EXISTS dcr_rate_limit (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

CREATE INDEX IF NOT EXISTS idx_dcr_rate_limit_day ON dcr_rate_limit(day);

-- Site identity (singleton row id = 'default')
CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  site_title TEXT,
  site_url TEXT,
  cdn_url TEXT,
  logo_key TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  -- Password policy applied to admin sign-in. Admins don't belong to an environment
  -- (regular users derive theirs from the client id), so the admin policy is a global
  -- selection here. NULL = no policy enforced for admins.
  admin_password_policy_id TEXT REFERENCES password_policies(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO site_settings (id, site_title, site_url, cdn_url, logo_key, mfa_enabled)
VALUES ('default', 'Eetr Auth', NULL, NULL, NULL, 0);

-- MFA OTP and password-reset challenges (reset uses JWT jti = id)
CREATE TABLE IF NOT EXISTS user_challenges (
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

CREATE INDEX IF NOT EXISTS idx_user_challenges_expires_at ON user_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id_kind ON user_challenges(user_id, kind);

-- Per-user authenticator-app (TOTP) MFA enrollment. `secret_enc` is the base32 TOTP
-- secret encrypted at rest (AES-GCM, key derived from AUTH_SECRET). `confirmed_at` is
-- NULL while pending and set once the user verifies their first code; only confirmed
-- rows count as an active enrollment. One enrollment per user.
CREATE TABLE IF NOT EXISTS user_totp (
  user_id TEXT PRIMARY KEY,
  secret_enc TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Passkey (WebAuthn) support: challenges, credentials, and sign-in exchange tokens
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON passkey_challenges(expires_at);

CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

CREATE TABLE IF NOT EXISTS passkey_exchange_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_exchange_tokens_expires_at ON passkey_exchange_tokens(expires_at);

-- OAuth clients allowed for future admin API (internal clients.id)
CREATE TABLE IF NOT EXISTS site_admin_api_clients (
  client_row_id TEXT NOT NULL PRIMARY KEY,
  FOREIGN KEY (client_row_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Admin audit log (admin actions taken via dashboard or admin API).
-- actor_user_id has no FK so entries survive after the acting user is deleted.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_resource ON admin_audit_log(resource_type, resource_id);
