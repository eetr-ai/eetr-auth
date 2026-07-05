-- eetr-auth schema patch 0.4.3
-- Upgrade path: 0.4.2 -> 0.4.3
--   * Support public (PKCE-only) OAuth clients and Dynamic Client Registration (RFC 7591):
--       - clients.token_endpoint_auth_method: 'client_secret_basic' (default, confidential)
--         or 'none' (public, PKCE-only, no secret). Public clients store client_secret = ''.
--       - clients.is_dynamic: 1 for dynamically registered (RFC 7591) clients, else 0.
--   * Support Resource Indicators (RFC 8707) audience binding by carrying the requested
--     resource through the flow:
--       - authorization_codes.resource, refresh_tokens.resource, tokens.resource.
--     NULL means the legacy default audience (the client's own client_id).
--   * Add the dcr_rate_limit table backing the per-IP daily DCR registration rate limit.
--
-- Idempotency: the new table + index use CREATE ... IF NOT EXISTS so they are replay-safe.
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so the five ADD COLUMN statements are the
-- non-idempotent ones; they are applied exactly once by the version gate in
-- run-d1-migrate.mjs (patches strictly greater than the DB's current version). On a manual
-- re-run against a DB that already has these columns, remove those lines.

-- Non-idempotent ADD COLUMNs (applied exactly once by the version gate; see header note).
-- All have defaults / are nullable, so existing rows upgrade cleanly.
ALTER TABLE clients ADD COLUMN token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic';
ALTER TABLE clients ADD COLUMN is_dynamic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE authorization_codes ADD COLUMN resource TEXT;
ALTER TABLE refresh_tokens ADD COLUMN resource TEXT;
ALTER TABLE tokens ADD COLUMN resource TEXT;

-- Per-IP daily DCR registration rate limit. One row per (ip, day); `count` is the number
-- of registration attempts from that IP on that UTC day. Old rows are pruned by the cron.
CREATE TABLE IF NOT EXISTS dcr_rate_limit (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);

CREATE INDEX IF NOT EXISTS idx_dcr_rate_limit_day ON dcr_rate_limit(day);

UPDATE schema_metadata SET value = '0.4.3' WHERE key = 'schema_version';
