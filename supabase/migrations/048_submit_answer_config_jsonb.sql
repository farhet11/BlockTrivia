-- ============================================================
-- Migration 048: submit_answer RPC — read WipeOut config from JSONB
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Rewrites the `submit_answer` RPC to read WipeOut wager bounds
--      from rounds.config->>'minWagerPct' / 'maxWagerPct' (the JSONB
--      column added in migration 047) instead of the legacy columns
--      wipeout_min_leverage / wipeout_max_leverage.
--   2. Drops the two legacy columns now that the RPC no longer
--      references them.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT change any scoring logic — Option A math is identical.
--   • Does NOT change the RPC signature (same params/returns).
--   • Does NOT touch the round_type check constraint.
--
-- ROLLBACK (if needed — run BEFORE dropping columns):
--   Run migration 030 again to restore the old RPC, then:
--   ALTER TABLE rounds ADD COLUMN wipeout_min_leverage numeric(3,2) DEFAULT 0.10;
--   ALTER TABLE rounds ADD COLUMN wipeout_max_leverage numeric(3,2) DEFAULT 1.00;
--   UPDATE rounds SET
--     wipeout_min_leverage = (config->>'minWagerPct')::numeric,
--     wipeout_max_leverage = (config->>'maxWagerPct')::numeric
--   WHERE round_type = 'wipeout';
-- ============================================================


-- ── 1. Rewrite submit_answer RPC ─────────────────────────────────────────────

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
  v_player_id          uuid;
  v_correct_answer     integer;
  v_explanation        text;
  v_round_id           uuid;
  v_round_type         text;
  v_base_points        integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_round_config       jsonb;
  v_wipeout_min        numeric;
  v_wipeout_max        numeric;
  v_is_correct         boolean;
  v_leverage           numeric;   -- wager_pct for wipeout (0.10–1.00)
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
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
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
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
  --   config JSONB is the source of truth for round-type-specific settings.
  --   Legacy wipeout_min_leverage / wipeout_max_leverage have been dropped.
  select round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  into v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  from rounds
  where id = v_round_id;

  if v_base_points is null then
    return jsonb_build_object('error', 'Round not found');
  end if;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := least(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── WipeOut: Option A (% of banked score) ────────────────────────────────
  if v_round_type = 'wipeout' then
    -- Read wager bounds from config JSONB (seeded by migration 047)
    -- Defaults: min 10%, max 100%
    v_wipeout_min := coalesce((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := coalesce((v_round_config->>'maxWagerPct')::numeric, 1.00);

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

  -- ── MCQ / True-False: time-bonus scoring ─────────────────────────────────
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
    'is_correct',   v_is_correct,
    'points_awarded', v_points,
    'correct_answer', v_correct_answer,
    'explanation',    v_explanation,
    'wager_amt',      v_wager_amt
  );
end;
$$;


-- ── 2. Drop legacy columns ────────────────────────────────────────────────────

ALTER TABLE rounds DROP COLUMN IF EXISTS wipeout_min_leverage;
ALTER TABLE rounds DROP COLUMN IF EXISTS wipeout_max_leverage;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- rounds.config is now the sole source of WipeOut wager bounds.
-- To add a new round type: register the module, deploy. Zero DB migrations.
