-- Store the page the user came from so the bot can send them back.
ALTER TABLE telegram_auth_tokens ADD COLUMN IF NOT EXISTS return_url TEXT;
