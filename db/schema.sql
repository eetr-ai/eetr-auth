-- progression-ai-auth D1 schema (SQLite)
-- Apply with: npm run db:migrate (local) or npm run db:migrate:remote

-- Enable foreign keys (D1 supports them)
PRAGMA foreign_keys = ON;

-- Environments (e.g. development, staging, production)
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Users (only is_admin users can access dashboard)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0
);

-- Clients (OAuth clients per environment, created by a user/admin)
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (environment_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
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

-- Authorization codes (for authorization_code + PKCE flow)
CREATE TABLE IF NOT EXISTS authorization_codes (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  subject TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
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

-- Refresh tokens (issued for authorization_code and client_credentials grants)
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
