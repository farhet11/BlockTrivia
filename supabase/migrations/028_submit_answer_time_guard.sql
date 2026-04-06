-- Add server-side time expiry guard to submit_answer RPC.
-- Rejects answers submitted after the question's time limit has elapsed.
-- A 2-second grace period accounts for network latency.

create or replace function submit_answer(
  p_event_id uuid,
  p_question_id uuid,
  p_selected_answer integer,
  p_time_taken_ms integer,
  p_wipeout_leverage numeric default 1.0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_correct_answer integer;
  v_explanation text;
  v_round_id uuid;
  v_round_type text;
  v_base_points integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_wipeout_min numeric;
  v_wipeout_max numeric;
  v_is_correct boolean;
  v_leverage numeric;
  v_clamped_time integer;
  v_points integer := 0;
  v_ratio numeric;
  v_existing_response uuid;
  v_question_started_at timestamptz;
  v_elapsed_ms numeric;
begin
  -- Get the authenticated user
  v_player_id := auth.uid();
  if v_player_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  -- Verify player is a member of this event
  if not exists (
    select 1 from event_players
    where event_id = p_event_id and player_id = v_player_id
  ) then
    return jsonb_build_object('error', 'Not a participant in this event');
  end if;

  -- Check if already answered (idempotent)
  select id into v_existing_response
  from responses
  where question_id = p_question_id and player_id = v_player_id;

  if v_existing_response is not null then
    -- Already answered — return the existing result
    return (
      select jsonb_build_object(
        'is_correct', r.is_correct,
        'points_awarded', r.points_awarded,
        'correct_answer', q.correct_answer,
        'explanation', q.explanation,
        'already_answered', true
      )
      from responses r
      join questions q on q.id = r.question_id
      where r.id = v_existing_response
    );
  end if;

  -- Fetch question
  select correct_answer, explanation, round_id
  into v_correct_answer, v_explanation, v_round_id
  from questions
  where id = p_question_id;

  if v_correct_answer is null and v_round_id is null then
    return jsonb_build_object('error', 'Question not found');
  end if;

  -- Fetch round config
  select round_type::text, base_points, time_bonus_enabled, time_limit_seconds,
         coalesce(wipeout_min_leverage, 1.0), coalesce(wipeout_max_leverage, 3.0)
  into v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds,
       v_wipeout_min, v_wipeout_max
  from rounds
  where id = v_round_id;

  if v_base_points is null then
    return jsonb_build_object('error', 'Round not found');
  end if;

  -- Server-side time expiry guard (2s grace period for network latency)
  select question_started_at into v_question_started_at
  from game_state
  where event_id = p_event_id;

  if v_question_started_at is not null then
    v_elapsed_ms := extract(epoch from (now() - v_question_started_at)) * 1000;
    if v_elapsed_ms > (v_time_limit_seconds * 1000 + 2000) then
      return jsonb_build_object('error', 'Time expired');
    end if;
  end if;

  -- Calculate correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time
  v_clamped_time := least(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- Clamp leverage
  if v_round_type = 'wipeout' then
    v_leverage := least(greatest(coalesce(p_wipeout_leverage, 1.0), v_wipeout_min), v_wipeout_max);
  else
    v_leverage := 1.0;
  end if;

  -- Calculate points
  if v_is_correct then
    v_points := v_base_points;
    if v_time_bonus_enabled then
      v_ratio := greatest(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
      v_points := v_points + floor(v_base_points * v_ratio);
    end if;
    if v_round_type = 'wipeout' then
      v_points := floor(v_points * v_leverage);
    end if;
  elsif v_round_type = 'wipeout' and v_leverage > 1 then
    v_points := -floor(v_base_points * 0.5 * (v_leverage - 1));
  end if;

  -- Insert response
  insert into responses (event_id, question_id, player_id, selected_answer,
                         is_correct, time_taken_ms, points_awarded, wipeout_leverage)
  values (p_event_id, p_question_id, v_player_id, p_selected_answer,
          v_is_correct, v_clamped_time, v_points, v_leverage);

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'points_awarded', v_points,
    'correct_answer', v_correct_answer,
    'explanation', v_explanation
  );
end;
$$;
