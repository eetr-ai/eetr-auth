-- Repair migration for mixed state where both admins and users tables exist.
-- Scenario:
-- - users exists (often from applying updated schema.sql)
-- - admins still exists with real data
-- - clients.created_by still references admins(id)

PRAGMA foreign_keys = OFF;

-- Backfill users from admins without duplicating existing users.
INSERT INTO users (id, username, password_hash, is_admin)
SELECT a.id, a.username, a.password_hash, 1
FROM admins a
LEFT JOIN users u ON u.id = a.id
WHERE u.id IS NULL;

-- Rebuild clients so created_by references users(id).
CREATE TABLE clients_new (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (environment_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO clients_new (id, client_id, client_secret, environment_id, created_by, expires_at)
SELECT id, client_id, client_secret, environment_id, created_by, expires_at
FROM clients;

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

CREATE INDEX IF NOT EXISTS idx_clients_environment_id ON clients(environment_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);

-- admins is no longer needed after backfill and FK migration.
DROP TABLE IF EXISTS admins;

PRAGMA foreign_keys = ON;
