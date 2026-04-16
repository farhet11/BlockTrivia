-- ============================================================
-- Migration 066: rescore_the_narrative RPC
-- ============================================================
--
-- The Narrative round type scores by majority vote: players who
-- picked the most-voted option are "correct". The problem is that
-- submit_answer reads majority_option from round_state AT SUBMIT TIME,
-- but round_state is only populated when the host clicks Reveal — AFTER
-- all submissions are in. So every submission scores against the fallback
-- (correct_answer comparison) rather than the real majority.
--
-- This RPC is called by revealAnswer() in control-panel.tsx after
-- tallyNarrativeVotes() writes the majority to game_state.round_state.
-- It retroactively corrects is_correct + points_awarded in responses,
-- then re-aggregates leaderboard_entries for each affected player.
-- ============================================================

CREATE OR REPLACE FUNCTION rescore_the_narrative(
  p_question_id uuid,
  p_event_id    uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_majority_option      int;
  v_max_votes            int := 0;
  v_opt                  int;
  v_count                int;
  v_base_points          int;
  v_time_bonus_enabled   boolean;
  v_time_limit_seconds   int;
  v_player               uuid;

  -- For leaderboard recompute per player
  v_total_score     int;
  v_correct_count   int;
  v_total_q         int;
  v_accuracy        numeric(5,2);
  v_avg_speed       int;
  v_fastest         int;
  v_slowest         int;
  v_speed_stddev    numeric;
  v_player_count    int;
BEGIN
  -- ── Fetch question details ─────────────────────────────────────────────────
  SELECT q.base_points, q.time_bonus_enabled, r.time_limit_seconds
    INTO v_base_points, v_time_bonus_enabled, v_time_limit_seconds
    FROM questions q
    JOIN rounds r ON r.id = q.round_id
   WHERE q.id = p_question_id;

  IF v_base_points IS NULL THEN
    RETURN; -- Question not found, bail silently
  END IF;

  -- ── Determine majority option ──────────────────────────────────────────────
  v_majority_option := 0;
  v_max_votes := 0;
  FOR v_opt IN 0..3 LOOP
    SELECT COUNT(*) INTO v_count
      FROM responses
     WHERE question_id = p_question_id
       AND event_id    = p_event_id
       AND selected_answer = v_opt;
    IF v_count > v_max_votes THEN
      v_max_votes       := v_count;
      v_majority_option := v_opt;
    END IF;
  END LOOP;

  -- ── Rescore all responses for this question ────────────────────────────────
  -- Scoring matches submit_answer The Narrative branch:
  --   correct (voted majority): base_points + floor(base_points * time_ratio)   if time_bonus_enabled
  --                              base_points                                     otherwise
  --   wrong (voted minority):   0
  UPDATE responses
     SET is_correct     = (selected_answer = v_majority_option),
         points_awarded = CASE
           WHEN selected_answer = v_majority_option THEN
             v_base_points
             + CASE WHEN v_time_bonus_enabled THEN
                 FLOOR(
                   v_base_points
                   * GREATEST(
                       0.0,
                       1.0 - (time_taken_ms::numeric / (v_time_limit_seconds * 1000)::numeric)
                     )
                 )::int
               ELSE 0 END
           ELSE 0
         END
   WHERE question_id = p_question_id
     AND event_id    = p_event_id;

  -- ── Refresh leaderboard_entries for every player who answered ─────────────
  -- The trigger fires only on INSERT, so we must re-aggregate manually.
  FOR v_player IN
    SELECT DISTINCT player_id FROM responses
     WHERE question_id = p_question_id AND event_id = p_event_id
  LOOP
    SELECT
      COALESCE(SUM(points_awarded), 0),
      COUNT(*) FILTER (WHERE is_correct),
      COUNT(*),
      CASE WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE is_correct))::numeric / COUNT(*) * 100, 2)
        ELSE 0
      END,
      COALESCE(AVG(time_taken_ms)::int, 0),
      COALESCE(MIN(time_taken_ms), 0),
      COALESCE(MAX(time_taken_ms), 0),
      COALESCE(STDDEV_POP(time_taken_ms)::numeric, 0)
    INTO v_total_score, v_correct_count, v_total_q, v_accuracy,
         v_avg_speed, v_fastest, v_slowest, v_speed_stddev
    FROM responses
    WHERE event_id = p_event_id AND player_id = v_player;

    INSERT INTO leaderboard_entries
      (event_id, player_id, total_score, correct_count, total_questions,
       accuracy, avg_speed_ms, fastest_answer_ms, slowest_answer_ms, answer_speed_stddev)
    VALUES
      (p_event_id, v_player, v_total_score, v_correct_count, v_total_q,
       v_accuracy, v_avg_speed, v_fastest, v_slowest, v_speed_stddev)
    ON CONFLICT (event_id, player_id) DO UPDATE SET
      total_score         = EXCLUDED.total_score,
      correct_count       = EXCLUDED.correct_count,
      total_questions     = EXCLUDED.total_questions,
      accuracy            = EXCLUDED.accuracy,
      avg_speed_ms        = EXCLUDED.avg_speed_ms,
      fastest_answer_ms   = EXCLUDED.fastest_answer_ms,
      slowest_answer_ms   = EXCLUDED.slowest_answer_ms,
      answer_speed_stddev = EXCLUDED.answer_speed_stddev,
      updated_at          = NOW();
  END LOOP;

  -- ── Re-rank all players in this event ─────────────────────────────────────
  UPDATE leaderboard_entries le
     SET rank = r.new_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY total_score DESC, avg_speed_ms ASC) AS new_rank
        FROM leaderboard_entries
       WHERE event_id = p_event_id
    ) r
   WHERE le.id = r.id AND le.event_id = p_event_id;

  -- ── Re-mark top 10% ───────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_player_count
    FROM leaderboard_entries WHERE event_id = p_event_id;

  UPDATE leaderboard_entries
     SET is_top_10_pct = (rank <= GREATEST(1, CEIL(v_player_count * 0.1)))
   WHERE event_id = p_event_id;
END;
$$;
