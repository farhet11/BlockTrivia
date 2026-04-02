-- Add logo_url to events for host/project branding.
-- Reuses the existing sponsor-logos storage bucket (different path prefix).

ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_url text;
