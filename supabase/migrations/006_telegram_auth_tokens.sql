-- Temporary tokens for Telegram deep-link auth flow.
-- Created server-side, completed by the bot webhook, polled by the client.
CREATE TABLE telegram_auth_tokens (
  token       TEXT PRIMARY KEY,
  telegram_id TEXT,
  first_name  TEXT,
  last_name   TEXT,
  username    TEXT,
  completed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

-- Only accessed via service role — no RLS needed.
ALTER TABLE telegram_auth_tokens DISABLE ROW LEVEL SECURITY;

CREATE INDEX telegram_auth_tokens_expires_at_idx ON telegram_auth_tokens (expires_at);
