-- Add prizes field to events for setting player expectations.
-- Free-text field hosts can fill in to describe rewards.

ALTER TABLE events ADD COLUMN IF NOT EXISTS prizes text;
