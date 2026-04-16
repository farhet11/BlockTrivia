-- Migration 064: Closest Wins — pot-based scoring
--
-- Changes:
--   1. Add numeric_answer column to responses (stores the raw guess for Closest Wins).
--   2. Update submit_answer to persist p_numeric_answer there (still returns
--      provisional individual-closeness points so the UI shows something instantly).
--   3. Create rescore_closest_wins(p_question_id, p_event_id):
--        • Pools all players' base_points into a shared pot.
--        • Distributes by relative closeness: closer = bigger slice.
--        • Adds individual time bonus on top.
--        • Recalculates leaderboard_entries for every player in the event.
--   The host's revealAnswer() calls rescore_closest_wins, then PlayView
--   re-fetches the updated result so the final pot-based score is displayed.

-- ── 1. Add numeric_answer column ─────────────────────────────────────────────
ALTER TABLE responses ADD COLUMN IF NOT EXISTS numeric_answer numeric;

-- ── 2. Update submit_answer to store numeric_answer ──────────────────────────
CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id          uuid,
  p_question_id       uuid,
  p_selected_answer   integer,
  p_time_taken_ms     integer,
  p_wipeout_leverage  numeric  DEFAULT 0.5,
  p_numeric_answer    numeric  DEFAULT NULL,
  p_oracle_choice     text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_id          uuid;
  v_correct_answer     integer;
  v_correct_numeric    numeric;
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
  v_leverage           numeric;
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
  -- Modifier state
  v_modifier_type      text;
  v_modifier_config    jsonb;
  v_jackpot_multiplier numeric;
  v_jackpot_winner     boolean := false;
  -- Live modifier override
  v_live_modifier_state jsonb;
  -- Closest Wins
  v_distance           numeric;
  v_max_distance       numeric;
  v_tolerance          numeric;
  v_closeness          numeric;
  -- The Narrative
  v_round_state        jsonb;
  v_majority_option    integer;
  -- Oracle's Dilemma
  v_oracle_player_id   uuid;
  v_oracle_choice      text;
BEGIN
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM event_players
    WHERE event_id = p_event_id AND player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant in this event');
  END IF;

  -- Idempotency
  SELECT id INTO v_existing_response
  FROM responses
  WHERE question_id = p_question_id AND player_id = v_player_id;

  IF v_existing_response IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
        'already_answered', true
      )
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      WHERE r.id = v_existing_response
    );
  END IF;

  SELECT correct_answer, correct_answer_numeric, explanation, round_id
  INTO v_correct_answer, v_correct_numeric, v_explanation, v_round_id
  FROM questions WHERE id = p_question_id;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Question not found');
  END IF;

  SELECT round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  INTO v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  FROM rounds WHERE id = v_round_id;

  IF v_base_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;

  -- Modifier resolution
  SELECT modifier_state INTO v_live_modifier_state
  FROM game_state WHERE event_id = p_event_id;

  IF v_live_modifier_state IS NOT NULL
     AND v_live_modifier_state->>'type' IS NOT NULL
     AND v_live_modifier_state->>'type' <> '' THEN
    v_modifier_type   := v_live_modifier_state->>'type';
    v_modifier_config := COALESCE(v_live_modifier_state->'config', '{}');
  ELSE
    SELECT modifier_type, config
    INTO v_modifier_type, v_modifier_config
    FROM round_modifiers WHERE round_id = v_round_id;
  END IF;

  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Closest Wins: provisional individual-closeness scoring ──────────────
  -- Final pot-based rescoring happens in rescore_closest_wins() at reveal.
  IF v_round_type = 'closest_wins' THEN
    v_leverage := 1.0;

    IF p_numeric_answer IS NULL OR v_correct_numeric IS NULL THEN
      v_is_correct := false;
      v_points := 0;
    ELSE
      v_distance    := abs(p_numeric_answer - v_correct_numeric);
      v_tolerance   := COALESCE((v_round_config->>'toleranceMultiplier')::numeric, 2.0);
      v_max_distance := v_tolerance * GREATEST(abs(v_correct_numeric), 1);
      v_closeness   := GREATEST(0, 1.0 - (v_distance / v_max_distance));

      v_is_correct := (v_closeness > 0);
      -- Provisional: individual closeness (will be replaced at reveal)
      v_points := FLOOR(v_base_points * v_closeness);

      IF v_time_bonus_enabled AND v_closeness > 0 THEN
        v_ratio  := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_closeness * v_ratio * 0.5);
      END IF;
    END IF;

    INSERT INTO responses (
      event_id, question_id, player_id, selected_answer,
      is_correct, time_taken_ms, points_awarded, wipeout_leverage, numeric_answer
    ) VALUES (
      p_event_id, p_question_id, v_player_id, COALESCE(p_selected_answer, -1),
      v_is_correct, v_clamped_time, v_points, v_leverage, p_numeric_answer
    );

    RETURN jsonb_build_object(
      'is_correct',     v_is_correct,
      'points_awarded', v_points,
      'correct_answer', v_correct_numeric,
      'explanation',    v_explanation,
      'wager_amt',      0,
      'closeness',      v_closeness,
      'pending_rescore', true
    );
  END IF;

  -- ── Standard correctness ─────────────────────────────────────────────────
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- ── Jackpot ──────────────────────────────────────────────────────────────
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);
    IF v_is_correct THEN
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id AND is_correct = true AND player_id <> v_player_id
      ) THEN
        v_jackpot_winner := true;
        v_points := FLOOR(v_base_points * v_jackpot_multiplier);
      ELSE
        v_points := 0;
      END IF;
    ELSE
      v_points := 0;
    END IF;
    v_leverage := 1.0;
    v_wager_amt := 0;

  -- ── WipeOut ──────────────────────────────────────────────────────────────
  ELSIF v_round_type = 'wipeout' THEN
    v_wipeout_min := COALESCE((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := COALESCE((v_round_config->>'maxWagerPct')::numeric, 1.00);
    v_leverage := LEAST(GREATEST(COALESCE(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    SELECT COALESCE(total_score, 0) INTO v_current_score
    FROM leaderboard_entries WHERE event_id = p_event_id AND player_id = v_player_id;

    v_current_score := COALESCE(v_current_score, 0);
    v_wager_amt     := FLOOR(GREATEST(50, v_current_score) * v_leverage);

    IF v_is_correct THEN
      v_points := v_wager_amt;
    ELSE
      v_points := -LEAST(v_wager_amt, v_current_score);
    END IF;

  -- ── Pixel Reveal ─────────────────────────────────────────────────────────
  ELSIF v_round_type = 'pixel_reveal' THEN
    v_leverage := 1.0;
    IF v_is_correct THEN
      v_ratio  := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
      v_points := v_base_points + FLOOR(v_base_points * v_ratio * v_ratio);
    END IF;

  -- ── The Narrative ────────────────────────────────────────────────────────
  ELSIF v_round_type = 'the_narrative' THEN
    v_leverage := 1.0;
    SELECT round_state INTO v_round_state FROM game_state WHERE event_id = p_event_id;
    v_majority_option := (v_round_state->>'majority_option')::integer;
    IF v_majority_option IS NOT NULL THEN
      v_is_correct := (p_selected_answer = v_majority_option);
    END IF;
    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio  := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;

  -- ── Oracle's Dilemma ─────────────────────────────────────────────────────
  ELSIF v_round_type = 'oracles_dilemma' THEN
    v_leverage := 1.0;
    SELECT round_state INTO v_round_state FROM game_state WHERE event_id = p_event_id;
    v_oracle_player_id := (v_round_state->>'oracle_player_id')::uuid;
    v_oracle_choice    := v_round_state->>'oracle_choice';

    IF v_player_id = v_oracle_player_id THEN
      IF p_oracle_choice IS NOT NULL AND v_oracle_choice IS NULL THEN
        v_oracle_choice := p_oracle_choice;
        UPDATE game_state
        SET round_state = v_round_state
          || jsonb_build_object(
               'oracle_choice', p_oracle_choice,
               'oracle_suggested_answer', p_selected_answer
             )
        WHERE event_id = p_event_id;
      END IF;
      IF v_oracle_choice = 'truth' THEN
        v_points     := FLOOR(v_base_points * 0.5);
        v_is_correct := true;
      ELSE
        v_points     := 0;
        v_is_correct := false;
      END IF;
    ELSE
      IF v_is_correct THEN
        v_points := v_base_points;
        IF v_time_bonus_enabled THEN
          v_ratio  := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
          v_points := v_points + FLOOR(v_base_points * v_ratio);
        END IF;
      END IF;
    END IF;

  -- ── MCQ / True-False / Reversal / Pressure Cooker ────────────────────────
  ELSE
    v_leverage := 1.0;
    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio  := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;
  END IF;

  INSERT INTO responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) VALUES (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  RETURN jsonb_build_object(
    'is_correct',     v_is_correct,
    'points_awarded', v_points,
    'correct_answer', v_correct_answer,
    'explanation',    v_explanation,
    'wager_amt',      v_wager_amt,
    'jackpot_winner', v_jackpot_winner
  );
END;
$$;

-- ── 3. rescore_closest_wins ───────────────────────────────────────────────────
-- Called by the host's revealAnswer() for closest_wins questions.
-- Replaces provisional individual scores with pot-based distribution.
CREATE OR REPLACE FUNCTION rescore_closest_wins(
  p_question_id uuid,
  p_event_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_correct_numeric    numeric;
  v_base_points        integer;
  v_time_limit_ms      bigint;
  v_tolerance          numeric;
  v_time_bonus_enabled boolean;
  v_total_closeness    numeric := 0;
  v_responder_count    integer := 0;
  v_pot                integer;
  r                    RECORD;
  v_distance           numeric;
  v_max_distance       numeric;
  v_closeness          numeric;
  v_time_ratio         numeric;
  v_time_bonus         integer;
  v_new_points         integer;
BEGIN
  -- Fetch question & round config
  SELECT
    q.correct_answer_numeric,
    ro.base_points,
    ro.time_limit_seconds * 1000,
    COALESCE((ro.config->>'toleranceMultiplier')::numeric, 2.0),
    ro.time_bonus_enabled
  INTO v_correct_numeric, v_base_points, v_time_limit_ms, v_tolerance, v_time_bonus_enabled
  FROM questions q
  JOIN rounds ro ON ro.id = q.round_id
  WHERE q.id = p_question_id;

  -- Nothing to do without a target
  IF v_correct_numeric IS NULL THEN RETURN; END IF;

  v_max_distance := v_tolerance * GREATEST(ABS(v_correct_numeric), 1);

  -- First pass: sum closeness scores and count valid responders
  FOR r IN
    SELECT numeric_answer, time_taken_ms
    FROM responses
    WHERE question_id = p_question_id AND event_id = p_event_id
      AND numeric_answer IS NOT NULL
  LOOP
    v_distance  := ABS(r.numeric_answer - v_correct_numeric);
    v_closeness := GREATEST(0, 1.0 - v_distance / NULLIF(v_max_distance, 0));
    v_total_closeness  := v_total_closeness + v_closeness;
    v_responder_count  := v_responder_count + 1;
  END LOOP;

  IF v_responder_count = 0 THEN RETURN; END IF;

  v_pot := v_responder_count * v_base_points;

  -- Second pass: assign pot shares
  FOR r IN
    SELECT id, numeric_answer, time_taken_ms
    FROM responses
    WHERE question_id = p_question_id AND event_id = p_event_id
  LOOP
    IF r.numeric_answer IS NULL THEN
      -- Timed out — no share of pot
      UPDATE responses SET is_correct = false, points_awarded = 0 WHERE id = r.id;
      CONTINUE;
    END IF;

    v_distance  := ABS(r.numeric_answer - v_correct_numeric);
    v_closeness := GREATEST(0, 1.0 - v_distance / NULLIF(v_max_distance, 0));

    IF v_total_closeness > 0 AND v_closeness > 0 THEN
      -- Pot share proportional to relative closeness
      v_new_points := FLOOR(v_closeness / v_total_closeness * v_pot);

      -- Individual time bonus
      IF v_time_bonus_enabled AND v_time_limit_ms > 0 THEN
        v_time_ratio := GREATEST(0, 1.0 - (r.time_taken_ms::numeric / v_time_limit_ms));
        v_time_bonus := FLOOR(v_base_points * 0.5 * v_time_ratio);
        v_new_points := v_new_points + v_time_bonus;
      END IF;
    ELSE
      v_new_points := 0;
    END IF;

    UPDATE responses
    SET is_correct    = (v_closeness > 0),
        points_awarded = v_new_points
    WHERE id = r.id;
  END LOOP;

  -- Recalculate leaderboard for all players in this event
  INSERT INTO leaderboard_entries (event_id, player_id, total_score, correct_count, updated_at)
  SELECT
    p_event_id,
    player_id,
    COALESCE(SUM(points_awarded), 0),
    COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0),
    NOW()
  FROM responses
  WHERE event_id = p_event_id
  GROUP BY player_id
  ON CONFLICT (event_id, player_id) DO UPDATE SET
    total_score   = EXCLUDED.total_score,
    correct_count = EXCLUDED.correct_count,
    updated_at    = EXCLUDED.updated_at;
END;
$$;
