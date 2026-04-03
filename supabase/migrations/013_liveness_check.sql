-- Migration: Add liveness check tracking and suspicious flag

-- Add reaction time and liveness tracking to event_players
ALTER TABLE event_players
ADD COLUMN reaction_time_ms INTEGER,
ADD COLUMN liveness_check_passed BOOLEAN DEFAULT true,
ADD COLUMN challenged_at TIMESTAMPTZ;

-- Create index for efficient flagging queries
CREATE INDEX idx_event_players_reaction_time ON event_players(reaction_time_ms);

-- Add is_suspicious flag to leaderboard_entries for easy host visibility
ALTER TABLE leaderboard_entries
ADD COLUMN is_suspicious BOOLEAN NOT NULL DEFAULT false;

-- Create index for CSV export and filtering
CREATE INDEX idx_leaderboard_suspicious ON leaderboard_entries(event_id, is_suspicious DESC);
