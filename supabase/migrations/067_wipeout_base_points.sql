-- Migration 067: WipeOut Option A — add base points to correct answers
--
-- Previous model (030): correct = wagerAmt only
-- New model:            correct = base_points + wagerAmt
--
-- Wrong answer and 50pt floor are unchanged.
-- v_base_points is already fetched from rounds in the existing RPC.

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
  v_leverage         numeric;
  v_clamped_time     integer;
  v_points           integer := 0;
  v_ratio            numeric;
  v_existing_response uuid;
  v_current_score    integer := 0;
  v_wager_amt        integer := 0;
begin
  v_player_id := auth.uid();
  if v_player_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  if not exists (
    select 1 from event_players
    where event_id = p_event_id and player_id = v_player_id
  ) then
    return jsonb_build_object('error', 'Not a participant in this event');
  end if;

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

  select correct_answer, explanation, round_id
  into v_correct_answer, v_explanation, v_round_id
  from questions
  where id = p_question_id;

  if v_round_id is null then
    return jsonb_build_object('error', 'Question not found');
  end if;

  select round_type::text, base_points, time_bonus_enabled, time_limit_seconds,
         coalesce(wipeout_min_leverage, 0.10), coalesce(wipeout_max_leverage, 1.00)
  into v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds,
       v_wipeout_min, v_wipeout_max
  from rounds
  where id = v_round_id;

  if v_base_points is null then
    return jsonb_build_object('error', 'Round not found');
  end if;

  v_is_correct := (p_selected_answer = v_correct_answer);
  v_clamped_time := least(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── WipeOut: base_points + wager bonus for correct; lose wager if wrong ──────
  if v_round_type = 'wipeout' then
    v_leverage := least(greatest(coalesce(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    select coalesce(total_score, 0) into v_current_score
    from leaderboard_entries
    where event_id = p_event_id and player_id = v_player_id;

    v_current_score := coalesce(v_current_score, 0);
    v_wager_amt := floor(greatest(50, v_current_score) * v_leverage);

    if v_is_correct then
      v_points := v_base_points + v_wager_amt;
    else
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
