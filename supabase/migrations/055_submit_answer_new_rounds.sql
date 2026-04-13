-- ============================================================
-- Migration 055: submit_answer — scoring for 4 new round types
-- ============================================================
--
-- Adds scoring branches for:
--   • pixel_reveal   — quadratic time bonus (rewards early answers)
--   • closest_wins   — distance-based scoring from numeric answer
--   • the_narrative   — majority-vote scoring (majority = correct)
--   • oracles_dilemma — role-based scoring (oracle vs non-oracle)
--
-- The RPC signature adds p_numeric_answer for Closest Wins.
-- All other round types are unaffected.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric DEFAULT 0.5,
  p_numeric_answer   numeric DEFAULT NULL,
  p_oracle_choice    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_deceived_count     integer;
  v_non_oracle_count   integer;
BEGIN
  -- Authenticated user
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Must be an event participant
  IF NOT EXISTS (
    SELECT 1 FROM event_players
    WHERE event_id = p_event_id AND player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant in this event');
  END IF;

  -- Idempotency — return existing result if already answered
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

  -- Fetch question (including new columns)
  SELECT correct_answer, correct_answer_numeric, explanation, round_id
  INTO v_correct_answer, v_correct_numeric, v_explanation, v_round_id
  FROM questions
  WHERE id = p_question_id;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Question not found');
  END IF;

  -- Fetch round
  SELECT round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  INTO v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  FROM rounds
  WHERE id = v_round_id;

  IF v_base_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;

  -- ── Modifier resolution: live override takes priority ─────────────────────
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
    FROM round_modifiers
    WHERE round_id = v_round_id;
  END IF;

  -- Clamp time to round limit
  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Closest Wins: distance-based scoring (before correctness check) ───────
  IF v_round_type = 'closest_wins' THEN
    v_leverage := 1.0;

    IF p_numeric_answer IS NULL OR v_correct_numeric IS NULL THEN
      -- No numeric answer provided or no correct numeric set — score 0
      v_is_correct := false;
      v_points := 0;
    ELSE
      v_distance := abs(p_numeric_answer - v_correct_numeric);
      v_tolerance := COALESCE((v_round_config->>'toleranceMultiplier')::numeric, 2.0);
      v_max_distance := v_tolerance * GREATEST(abs(v_correct_numeric), 1);
      v_closeness := GREATEST(0, 1.0 - (v_distance / v_max_distance));

      -- "Correct" if within tolerance (any closeness > 0)
      v_is_correct := (v_closeness > 0);
      v_points := FLOOR(v_base_points * v_closeness);

      -- Time bonus on top of distance score
      IF v_time_bonus_enabled AND v_closeness > 0 THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_closeness * v_ratio * 0.5);
      END IF;
    END IF;

    -- Store the numeric answer in selected_answer as a sentinel (-1)
    -- The actual numeric value is tracked via p_numeric_answer but we don't
    -- have a column for it yet — the points_awarded captures the result.
    INSERT INTO responses (
      event_id, question_id, player_id, selected_answer,
      is_correct, time_taken_ms, points_awarded, wipeout_leverage
    ) VALUES (
      p_event_id, p_question_id, v_player_id, COALESCE(p_selected_answer, -1),
      v_is_correct, v_clamped_time, v_points, v_leverage
    );

    RETURN jsonb_build_object(
      'is_correct',       v_is_correct,
      'points_awarded',   v_points,
      'correct_answer',   v_correct_numeric,
      'explanation',      v_explanation,
      'wager_amt',        0,
      'closeness',        v_closeness
    );
  END IF;

  -- ── Standard correctness check (MCQ-style rounds) ─────────────────────────
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- ── Jackpot Mode modifier ─────────────────────────────────────────────────
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);

    IF v_is_correct THEN
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id
          AND is_correct = true
          AND player_id <> v_player_id
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

  -- ── WipeOut ───────────────────────────────────────────────────────────────
  ELSIF v_round_type = 'wipeout' THEN
    v_wipeout_min := COALESCE((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := COALESCE((v_round_config->>'maxWagerPct')::numeric, 1.00);

    v_leverage := LEAST(GREATEST(COALESCE(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    SELECT COALESCE(total_score, 0) INTO v_current_score
    FROM leaderboard_entries
    WHERE event_id = p_event_id AND player_id = v_player_id;

    v_current_score := COALESCE(v_current_score, 0);
    v_wager_amt := FLOOR(GREATEST(50, v_current_score) * v_leverage);

    IF v_is_correct THEN
      v_points := v_wager_amt;
    ELSE
      v_points := -LEAST(v_wager_amt, v_current_score);
    END IF;

  -- ── Pixel Reveal: quadratic time bonus ────────────────────────────────────
  ELSIF v_round_type = 'pixel_reveal' THEN
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
      -- Quadratic: answering at 50% time remaining = 25% bonus (not 50%)
      -- This heavily rewards early answers when the image is still blurred
      v_points := v_base_points + FLOOR(v_base_points * v_ratio * v_ratio);
    END IF;

  -- ── The Narrative: majority-vote scoring ──────────────────────────────────
  ELSIF v_round_type = 'the_narrative' THEN
    v_leverage := 1.0;

    -- Read majority option from round_state (set by host when revealing)
    SELECT round_state INTO v_round_state
    FROM game_state WHERE event_id = p_event_id;

    v_majority_option := (v_round_state->>'majority_option')::integer;

    IF v_majority_option IS NOT NULL THEN
      v_is_correct := (p_selected_answer = v_majority_option);
    END IF;
    -- If majority not yet determined, v_is_correct stays as comparison with correct_answer

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;

  -- ── Oracle's Dilemma: role-based scoring ──────────────────────────────────
  ELSIF v_round_type = 'oracles_dilemma' THEN
    v_leverage := 1.0;

    -- Read oracle state from round_state
    SELECT round_state INTO v_round_state
    FROM game_state WHERE event_id = p_event_id;

    v_oracle_player_id := (v_round_state->>'oracle_player_id')::uuid;
    v_oracle_choice := v_round_state->>'oracle_choice';

    IF v_player_id = v_oracle_player_id THEN
      -- Oracle is submitting their choice
      -- If p_oracle_choice is provided, update round_state with the Oracle's decision
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

      -- Oracle scoring
      IF v_oracle_choice = 'truth' THEN
        -- Truth path: guaranteed half points
        v_points := FLOOR(v_base_points * 0.5);
        v_is_correct := true;
      ELSE
        -- Deception path: scored after reveal based on how many were fooled
        -- For now, award 0 — the host triggers a re-score after reveal
        v_points := 0;
        v_is_correct := false;
      END IF;
    ELSE
      -- Non-oracle: standard MCQ scoring
      IF v_is_correct THEN
        v_points := v_base_points;
        IF v_time_bonus_enabled THEN
          v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
          v_points := v_points + FLOOR(v_base_points * v_ratio);
        END IF;
      END IF;
    END IF;

  -- ── MCQ / True-False / Reversal / Pressure Cooker: time-bonus scoring ─────
  ELSE
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;
  END IF;

  -- Insert response
  INSERT INTO responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) VALUES (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  RETURN jsonb_build_object(
    'is_correct',       v_is_correct,
    'points_awarded',   v_points,
    'correct_answer',   v_correct_answer,
    'explanation',      v_explanation,
    'wager_amt',        v_wager_amt,
    'jackpot_winner',   v_jackpot_winner
  );
END;
$$;
