-- Add 'archived' to event_status enum.
-- Archived events are hidden from the host dashboard but their
-- leaderboard data (and public /results/{code} page) remain intact.

ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'archived';
