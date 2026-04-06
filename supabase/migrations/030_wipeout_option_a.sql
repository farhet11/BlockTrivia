-- Migration 030: WipeOut Option A scoring
--
-- Replaces the flat 1×–3× leverage multiplier with a % of banked score wager.
-- wipeout_leverage column is repurposed: now stores wager_pct (0.10–1.00).
--
-- New scoring rules:
--   wager_amt = floor(max(50, current_total_score) × wager_pct)
--   Correct:  +wager_amt
--   Wrong:    −least(wager_amt, current_total_score)   ← floor at 0
--   Timeout:  0 (wager void — handled client-side by not calling submit_answer)
--
-- MCQ / True-False scoring is UNCHANGED.
--
-- RPC also now returns wager_amt so the client can display "You wagered X pts".

create or replace function submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id        uuid;
  v_correct_answer   integer;
  v_explanation      text;
  v_round_id         uuid;
  v_round_type       text;
  v_base_points      integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_wipeout_min      numeric;
  v_wipeout_max      numeric;
  v_is_correct       boolean;
  v_leverage         numeric;   -- wager_pct for wipeout (0.10–1.00)
  v_clamped_time     integer;
  v_points           integer := 0;
  v_ratio            numeric;
  v_existing_response uuid;
  v_current_score    integer := 0;
  v_wager_amt        integer := 0;
begin
  -- Authenticated user
  v_player_id := auth.uid();
  if v_player_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  -- Must be an event participant
  if not exists (
    select 1 from event_players
    where event_id = p_event_id and player_id = v_player_id
  ) then
    return jsonb_build_object('error', 'Not a participant in this event');
  end if;

  -- Idempotency — return existing result if already answered
  select id into v_existing_response
  from responses
  where question_id = p_question_id and player_id = v_player_id;

  if v_existing_response is not null then
    return (
      select jsonb_build_object(
        'is_correct',     r.is_correct,
        'points_awarded', r.points_awarded,
        'correct_answer', q.correct_answer,
        'explanation',    q.explanation,
        'wager_amt',      0,
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

  if v_round_id is null then
    return jsonb_build_object('error', 'Question not found');
  end if;

  -- Fetch round config
  select round_type::text, base_points, time_bonus_enabled, time_limit_seconds,
         coalesce(wipeout_min_leverage, 0.10), coalesce(wipeout_max_leverage, 1.00)
  into v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds,
       v_wipeout_min, v_wipeout_max
  from rounds
  where id = v_round_id;

  if v_base_points is null then
    return jsonb_build_object('error', 'Round not found');
  end if;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := least(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── WipeOut: Option A (% of banked score) ─────────────────────────────────
  if v_round_type = 'wipeout' then
    -- Clamp wager_pct to round min/max
    v_leverage := least(greatest(coalesce(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    -- Fetch player's current banked score
    select coalesce(total_score, 0) into v_current_score
    from leaderboard_entries
    where event_id = p_event_id and player_id = v_player_id;

    v_current_score := coalesce(v_current_score, 0);

    -- Minimum wager floor = 50 pts (comeback mechanic)
    v_wager_amt := floor(greatest(50, v_current_score) * v_leverage);

    if v_is_correct then
      v_points := v_wager_amt;
    else
      -- Floor at 0: can't lose more than current score
      v_points := -least(v_wager_amt, v_current_score);
    end if;

  -- ── MCQ / True-False: unchanged ───────────────────────────────────────────
  else
    v_leverage := 1.0;

    if v_is_correct then
      v_points := v_base_points;
      if v_time_bonus_enabled then
        v_ratio := greatest(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + floor(v_base_points * v_ratio);
      end if;
    end if;
  end if;

  -- Insert response
  insert into responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) values (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  return jsonb_build_object(
    'is_correct',     v_is_correct,
    'points_awarded', v_points,
    'correct_answer', v_correct_answer,
    'explanation',    v_explanation,
    'wager_amt',      v_wager_amt
  );
end;
$$;

-- Update round defaults: wipeout range is now 0.10–1.00 (wager_pct)
alter table rounds
  alter column wipeout_min_leverage set default 0.10,
  alter column wipeout_max_leverage set default 1.00;
