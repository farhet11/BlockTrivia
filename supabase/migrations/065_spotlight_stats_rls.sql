-- 065: Allow event participants to view responses (needed for spotlight stats on final page)
create policy "Event participants can view responses"
  on responses for select to authenticated
  using (
    exists (
      select 1 from event_players ep
      where ep.event_id = responses.event_id
        and ep.player_id = auth.uid()
    )
  );
