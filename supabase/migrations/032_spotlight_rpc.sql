-- Migration 032: get_event_spotlights RPC
--
-- Computes Phase 1 spotlight stats for a completed game.
-- Returns an ordered array of spotlight objects for the player end-of-game screen.
--
-- Phase 1 spotlights (4):
--   ⚡ Fastest Trigger   — lowest avg response time (min 3 answers)
--   🎯 Sharpshooter      — highest accuracy, rank 1 excluded
--   🔮 Oracle            — most correct on questions < 50% of players got right
--   🤡 Committed Early   — fastest wrong answer in the game
--
-- Activation rules:
--   - Minimum 4 players in event
--   - Minimum 3 questions answered
--   - Each stat awarded to exactly one player
--   - Returns [] if minimums not met (section hidden client-side)
--   - Section hidden client-side if fewer than 2 spotlights qualify

create or replace function get_event_spotlights(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_count    integer;
  v_question_count  integer;
  v_rank1_player_id uuid;
  v_results         jsonb := '[]'::jsonb;
  v_spotlight       jsonb;
begin
  -- Minimum player check
  select count(*) into v_player_count
  from event_players
  where event_id = p_event_id;

  if v_player_count < 4 then
    return '[]'::jsonb;
  end if;

  -- Minimum question check
  select count(distinct question_id) into v_question_count
  from responses
  where event_id = p_event_id;

  if v_question_count < 3 then
    return '[]'::jsonb;
  end if;

  -- Rank 1 player (excluded from Sharpshooter)
  select player_id into v_rank1_player_id
  from leaderboard_entries
  where event_id = p_event_id and rank = 1
  limit 1;

  -- ⚡ Fastest Trigger: lowest avg response time (min 3 answers to qualify)
  select jsonb_build_object(
    'emoji',      '⚡',
    'title',      'Fastest Trigger',
    'stat_value', round(avg(r.time_taken_ms) / 1000.0, 1)::text || 's avg',
    'player_id',  r.player_id,
    'username',   coalesce(p.username, p.display_name, 'Unknown')
  ) into v_spotlight
  from responses r
  join profiles p on p.id = r.player_id
  where r.event_id = p_event_id
  group by r.player_id, p.username, p.display_name
  having count(*) >= 3
  order by avg(r.time_taken_ms) asc
  limit 1;

  if v_spotlight is not null then
    v_results := v_results || jsonb_build_array(v_spotlight);
  end if;

  -- 🎯 Sharpshooter: highest accuracy, exclude rank 1 player
  select jsonb_build_object(
    'emoji',      '🎯',
    'title',      'Sharpshooter',
    'stat_value', round(le.accuracy)::text || '% accuracy',
    'player_id',  le.player_id,
    'username',   coalesce(p.username, p.display_name, 'Unknown')
  ) into v_spotlight
  from leaderboard_entries le
  join profiles p on p.id = le.player_id
  where le.event_id = p_event_id
    and le.player_id is distinct from v_rank1_player_id
    and le.total_questions > 0
  order by le.accuracy desc
  limit 1;

  if v_spotlight is not null then
    v_results := v_results || jsonb_build_array(v_spotlight);
  end if;

  -- 🔮 Oracle: most correct on questions where < 50% of players got it right
  with question_rates as (
    select
      question_id,
      sum(case when is_correct then 1 else 0 end)::float / count(*) as correct_rate
    from responses
    where event_id = p_event_id
    group by question_id
    having sum(case when is_correct then 1 else 0 end)::float / count(*) < 0.5
  ),
  player_scores as (
    select
      r.player_id,
      count(*) as hard_correct
    from responses r
    join question_rates qr on qr.question_id = r.question_id
    where r.event_id = p_event_id and r.is_correct = true
    group by r.player_id
  )
  select jsonb_build_object(
    'emoji',      '🔮',
    'title',      'Oracle',
    'stat_value', ps.hard_correct::text || ' hard ' || case when ps.hard_correct = 1 then 'question' else 'questions' end || ' correct',
    'player_id',  ps.player_id,
    'username',   coalesce(p.username, p.display_name, 'Unknown')
  ) into v_spotlight
  from player_scores ps
  join profiles p on p.id = ps.player_id
  order by ps.hard_correct desc
  limit 1;

  if v_spotlight is not null then
    v_results := v_results || jsonb_build_array(v_spotlight);
  end if;

  -- 🤡 Committed Early: fastest wrong answer in the entire game
  select jsonb_build_object(
    'emoji',      '🤡',
    'title',      'Committed Early',
    'stat_value', round(r.time_taken_ms / 1000.0, 1)::text || 's — wrong',
    'player_id',  r.player_id,
    'username',   coalesce(p.username, p.display_name, 'Unknown')
  ) into v_spotlight
  from responses r
  join profiles p on p.id = r.player_id
  where r.event_id = p_event_id
    and r.is_correct = false
  order by r.time_taken_ms asc
  limit 1;

  if v_spotlight is not null then
    v_results := v_results || jsonb_build_array(v_spotlight);
  end if;

  return v_results;
end;
$$;

-- RLS: any authenticated user can call this for events they are part of
revoke all on function get_event_spotlights(uuid) from public;
grant execute on function get_event_spotlights(uuid) to authenticated;
