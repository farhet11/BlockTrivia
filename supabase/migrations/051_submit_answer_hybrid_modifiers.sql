-- ============================================================
-- Migration 051: submit_answer — Hybrid modifier support
-- ============================================================
--
-- WHAT THIS DOES:
--   Rewrites submit_answer to check game_state.modifier_state FIRST
--   (live host activation), then falls back to round_modifiers
--   (pre-configured default from question builder).
--
--   This enables the hybrid modifier model:
--   • Host can activate a modifier live during a game from the
--     control panel → writes to game_state.modifier_state.
--   • If the host doesn't touch anything, the pre-configured
--     default from round_modifiers fires automatically.
--   • Live activation overrides the default.
--
-- modifier_state shape:
--   { "type": "jackpot", "config": { "multiplier": 5 }, "activated_at": "..." }
--   Empty/inactive: {} (existing default from migration 049)
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT change the RPC signature.
--   • Does NOT add new tables — uses existing game_state.modifier_state JSONB.
--   • Does NOT affect scoring when no modifier is active.
--
-- ROLLBACK:
--   Re-run migration 050 to restore the round_modifiers-only RPC.
-- ============================================================


CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  -- Fetch question
  SELECT correct_answer, explanation, round_id
  INTO v_correct_answer, v_explanation, v_round_id
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
  -- Check game_state.modifier_state first (live host activation)
  SELECT modifier_state INTO v_live_modifier_state
  FROM game_state WHERE event_id = p_event_id;

  IF v_live_modifier_state IS NOT NULL
     AND v_live_modifier_state->>'type' IS NOT NULL
     AND v_live_modifier_state->>'type' <> '' THEN
    -- Live modifier active — use it
    v_modifier_type   := v_live_modifier_state->>'type';
    v_modifier_config := COALESCE(v_live_modifier_state->'config', '{}');
  ELSE
    -- Fallback: pre-configured round modifier from question builder
    SELECT modifier_type, config
    INTO v_modifier_type, v_modifier_config
    FROM round_modifiers
    WHERE round_id = v_round_id;
  END IF;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Jackpot Mode modifier ─────────────────────────────────────────────────
  --
  -- If jackpot is active: first correct answer wins base_points × multiplier.
  -- All other answers (wrong OR arrived after the first correct) score 0.
  -- Overrides both MCQ time-bonus scoring and WipeOut wager scoring.
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);

    IF v_is_correct THEN
      -- Check if another player already got this right (they'd win the jackpot)
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id
          AND is_correct = true
          AND player_id <> v_player_id
      ) THEN
        -- First correct answer: jackpot winner
        v_jackpot_winner := true;
        v_points := FLOOR(v_base_points * v_jackpot_multiplier);
      ELSE
        -- Another player already won the jackpot
        v_points := 0;
      END IF;
    ELSE
      -- Wrong answer: 0
      v_points := 0;
    END IF;

    -- For jackpot, leverage = 1.0 (no wager mechanic; wager_amt = 0)
    v_leverage := 1.0;
    v_wager_amt := 0;

  -- ── WipeOut (no modifier) ─────────────────────────────────────────────────
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

  -- ── MCQ / True-False (no modifier): time-bonus scoring ───────────────────
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


-- ── Done ─────────────────────────────────────────────────────────────────────
-- submit_answer now checks game_state.modifier_state first (live host activation),
-- then falls back to round_modifiers (pre-configured default).
-- Hybrid model: live activation overrides default. No activation = default fires.
