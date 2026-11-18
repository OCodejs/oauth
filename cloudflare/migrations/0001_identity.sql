CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','locked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS account_action_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification','password_reset')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_action_tokens_user_purpose_idx ON account_action_tokens(user_id,purpose,created_at DESC);
CREATE INDEX IF NOT EXISTS account_action_tokens_expiry_idx ON account_action_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
