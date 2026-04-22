-- eetr-auth schema patch 0.2.0
-- Upgrade path: 0.1.0 -> 0.2.0
--   * Rebuild `clients` so `created_by` is nullable and FK uses ON DELETE SET NULL.
--     Without this, deleting a user that ever created an OAuth client fails with a
--     FOREIGN KEY constraint error. Cascading the delete would also wipe the client
--     and its tokens, so SET NULL is the correct behavior: the client stays, but
--     loses its creator reference.
--   * Add admin_audit_log for an audit trail of privileged actions.

PRAGMA foreign_keys = OFF;

-- Defensive cleanup in case a prior run of this patch failed between CREATE and RENAME.
DROP TABLE IF EXISTS clients__new;

CREATE TABLE clients__new (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  created_by TEXT,
  expires_at TEXT,
  name TEXT,
  FOREIGN KEY (environment_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO clients__new (id, client_id, client_secret, environment_id, created_by, expires_at, name)
SELECT id, client_id, client_secret, environment_id, created_by, expires_at, name FROM clients;

DROP TABLE clients;
ALTER TABLE clients__new RENAME TO clients;

CREATE INDEX IF NOT EXISTS idx_clients_environment_id ON clients(environment_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);

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

UPDATE schema_metadata SET value = '0.2.0' WHERE key = 'schema_version';

PRAGMA foreign_keys = ON;
