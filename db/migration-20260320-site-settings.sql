-- Site settings singleton + admin API OAuth client designation.
-- For existing DBs; fresh installs get this from db/schema.sql.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  site_title TEXT,
  site_url TEXT,
  cdn_url TEXT,
  logo_key TEXT
);

INSERT OR IGNORE INTO site_settings (id, site_title, site_url, cdn_url, logo_key)
VALUES ('default', 'Eetr Auth', NULL, NULL, NULL);

CREATE TABLE IF NOT EXISTS site_admin_api_clients (
  client_row_id TEXT NOT NULL PRIMARY KEY,
  FOREIGN KEY (client_row_id) REFERENCES clients(id) ON DELETE CASCADE
);
