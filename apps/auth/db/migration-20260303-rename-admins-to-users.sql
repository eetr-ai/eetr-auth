-- One-time migration: admins -> users and clients FK update
PRAGMA foreign_keys = OFF;

-- Rename admins table and add role flag.
ALTER TABLE admins RENAME TO users;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 1;

-- Rebuild clients table to update created_by foreign key target.
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

PRAGMA foreign_keys = ON;
