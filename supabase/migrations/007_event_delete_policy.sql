-- Allow event creators to delete their own events.
-- All FK references use ON DELETE CASCADE, so child rows
-- (rounds, questions, game_state, event_players, responses, leaderboard_entries)
-- are automatically removed.

create policy "Event creator can delete their events"
  on events for delete to authenticated
  using (created_by = auth.uid());
