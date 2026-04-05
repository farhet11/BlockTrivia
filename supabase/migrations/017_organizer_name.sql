-- Add organizer_name to events.
-- Allows hosts to set a per-event organizer name (e.g. project name)
-- separate from their profile display_name.

ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name text;
