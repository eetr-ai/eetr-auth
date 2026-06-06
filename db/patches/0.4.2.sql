-- eetr-auth schema patch 0.4.2
-- Upgrade path: 0.4.1 -> 0.4.2
--   * Seed the default OIDC scopes (openid, profile, email) so existing installs can keep
--     performing OpenID Connect. As of this release /userinfo requires the `openid` scope
--     and id_token/userinfo claims are gated by `profile`/`email`, so these standard scopes
--     must exist in order to be grantable to clients.
--
-- Seeding only DEFINES the scopes; it does NOT grant them to any client. An admin still
-- assigns scopes per client, and the client must request them at /authorize (or request no
-- scope, which defaults to all of that client's grants).
--
-- Idempotency: INSERT OR IGNORE against the UNIQUE(scope_name) constraint makes this patch
-- fully replay-safe -- scopes already present (e.g. an admin who hand-created `openid`) are
-- left untouched, keeping their existing id and client grants.

INSERT OR IGNORE INTO scopes (id, scope_name) VALUES
  (lower(hex(randomblob(16))), 'openid'),
  (lower(hex(randomblob(16))), 'profile'),
  (lower(hex(randomblob(16))), 'email');

UPDATE schema_metadata SET value = '0.4.2' WHERE key = 'schema_version';
