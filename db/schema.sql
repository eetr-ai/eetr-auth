-- progression-ai-auth D1 schema (SQLite)
-- Apply with: npm run db:migrate (local) or npm run db:migrate:remote

-- Enable foreign keys (D1 supports them)
PRAGMA foreign_keys = ON;

-- Environments (e.g. development, staging, production)
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Admins (can create clients)
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

-- Clients (OAuth clients per environment, created by an admin)
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (environment_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
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
CREATE TABLE IF NOT EXISTS scopes (
  id TEXT PRIMARY KEY,
  scope_name TEXT NOT NULL UNIQUE
);

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

-- Tokens (issued for a client)
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
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
