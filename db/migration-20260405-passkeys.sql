-- Passkey (WebAuthn) support: challenges, credentials, and sign-in exchange tokens

-- WebAuthn challenges (registration + authentication)
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT,                    -- NULL for authentication challenges (discoverable credentials)
  challenge TEXT NOT NULL,         -- base64url-encoded WebAuthn challenge bytes
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON passkey_challenges(expires_at);

-- Registered passkey credentials per user
CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,  -- base64url-encoded WebAuthn credentialId
  public_key TEXT NOT NULL,            -- base64url-encoded COSE public key
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                     -- JSON array string, e.g. '["internal","hybrid"]'
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

-- Single-use exchange tokens: passkey verify → NextAuth credentials handoff
CREATE TABLE IF NOT EXISTS passkey_exchange_tokens (
  id TEXT NOT NULL PRIMARY KEY,        -- UUID, used as the token value
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_exchange_tokens_expires_at ON passkey_exchange_tokens(expires_at);
