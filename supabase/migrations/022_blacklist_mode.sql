-- Add blacklist mode to access control.
-- Blacklist = everyone can join EXCEPT listed emails (block bots, cheaters, duplicates).

-- Drop and recreate the check constraint to include 'blacklist'
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_access_mode_check;
ALTER TABLE events ADD CONSTRAINT events_access_mode_check
  CHECK (access_mode IN ('open', 'whitelist', 'blacklist'));
