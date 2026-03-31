-- Auto-update leaderboard_entries when a response is submitted.
-- Runs as security definer (elevated) so it can bypass RLS on leaderboard_entries.

create or replace function update_leaderboard_on_response()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_total_score   integer;
  v_correct_count integer;
  v_total_q       integer;
  v_accuracy      numeric(5,2);
  v_avg_speed     integer;
  v_player_count  integer;
begin
  -- Aggregate all responses for this player in this event
  select
    coalesce(sum(points_awarded), 0),
    count(*) filter (where is_correct),
    count(*),
    case when count(*) > 0
      then round((count(*) filter (where is_correct))::numeric / count(*) * 100, 2)
      else 0
    end,
    coalesce(avg(time_taken_ms)::integer, 0)
  into v_total_score, v_correct_count, v_total_q, v_accuracy, v_avg_speed
  from public.responses
  where event_id = new.event_id and player_id = new.player_id;

  -- Upsert leaderboard entry
  insert into public.leaderboard_entries
    (event_id, player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms)
  values
    (new.event_id, new.player_id, v_total_score, v_correct_count, v_total_q, v_accuracy, v_avg_speed)
  on conflict (event_id, player_id) do update set
    total_score     = excluded.total_score,
    correct_count   = excluded.correct_count,
    total_questions = excluded.total_questions,
    accuracy        = excluded.accuracy,
    avg_speed_ms    = excluded.avg_speed_ms,
    updated_at      = now();

  -- Re-rank all players in this event by score desc, speed asc
  update public.leaderboard_entries le
  set rank = r.new_rank
  from (
    select id,
      row_number() over (order by total_score desc, avg_speed_ms asc) as new_rank
    from public.leaderboard_entries
    where event_id = new.event_id
  ) r
  where le.id = r.id and le.event_id = new.event_id;

  -- Mark top 10%
  select count(*) into v_player_count
  from public.leaderboard_entries where event_id = new.event_id;

  update public.leaderboard_entries
  set is_top_10_pct = (rank <= greatest(1, ceil(v_player_count * 0.1)))
  where event_id = new.event_id;

  return new;
end;
$$;

create trigger responses_update_leaderboard
  after insert on public.responses
  for each row execute function update_leaderboard_on_response();

-- Allow event participants to read all responses in their event (needed for leaderboard display)
create policy "Players can view responses for events they joined"
  on public.responses for select to authenticated
  using (
    exists (
      select 1 from public.event_players
      where event_players.event_id = responses.event_id
        and event_players.player_id = auth.uid()
    )
    or exists (
      select 1 from public.events
      where events.id = responses.event_id
        and events.created_by = auth.uid()
    )
  );
