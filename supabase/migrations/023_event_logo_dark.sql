-- Separate dark-mode logo for events.
-- When set, players see this logo in dark theme instead of the default logo_url.

ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_dark_url text;
