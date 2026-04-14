-- Migration 059: Add is_paused flag to game_state
--
-- Purpose: Current pause implementation sets phase="leaderboard" which forces
-- the player to navigate from /play to /leaderboard — a full route transition
-- that takes 2-5s due to server component re-fetching all game data. Resume
-- then has to re-navigate back, repeating the delay.
--
-- Fix: Keep phase at its original value during pause and toggle a boolean
-- flag instead. Player stays on /play with all state cached → resume is
-- instant (just hide the overlay). Host and player both see a pause overlay
-- with current standings for engagement.
--
-- Rollback: ALTER TABLE game_state DROP COLUMN IF EXISTS is_paused;

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
