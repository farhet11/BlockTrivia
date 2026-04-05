-- Allow anonymous/public read access to leaderboard data
-- This enables the public leaderboard page to work for unauthenticated users

-- ROUNDS: public read (already writable by event creator only)
create policy "Rounds are viewable by everyone"
  on rounds for select using (true);

-- EVENT_PLAYERS: public read (already writable by authenticated players only)
create policy "Event players are viewable by everyone"
  on event_players for select using (true);

-- GAME_STATE: public read (already writable by event creator only)
create policy "Game state is viewable by everyone"
  on game_state for select using (true);

-- LEADERBOARD_ENTRIES: already has public access (policy created in 001_initial_schema.sql)
-- No additional policy needed
