-- eetr-auth schema patch 0.4.0
-- Upgrade path: 0.3.0 -> 0.4.0
--   * Add OpenID Connect support to the authorization_code flow:
--     - `nonce`: the OIDC `nonce` request parameter, bound into the issued id_token
--       to let relying parties detect replay (OIDC Core 1.0 § 3.1.2.1 / § 3.1.3.7).
--     - `auth_time`: the time the end-user authenticated (approximated at code-creation
--       time), surfaced as the id_token `auth_time` claim (OIDC Core 1.0 § 2).
--     Both are nullable, so a plain ADD COLUMN suffices — no table rebuild needed.

ALTER TABLE authorization_codes ADD COLUMN nonce TEXT;
ALTER TABLE authorization_codes ADD COLUMN auth_time TEXT;

UPDATE schema_metadata SET value = '0.4.0' WHERE key = 'schema_version';
