-- Migration 070: Fix deadlock in leaderboard trigger.
--
-- The trigger update_leaderboard_on_response() was doing two bulk UPDATEs
-- across ALL leaderboard_entries for the event on every single response INSERT.
-- Under concurrent load (44+ simultaneous answer submissions for the same question),
-- all transactions tried to lock all leaderboard rows in an arbitrary order
-- → deadlock storm → HTTP 500s on submit_answer.
--
-- Fix: remove the bulk re-rank and top-10% UPDATE from the trigger.
-- Keep only the per-player UPSERT (O(1) lock on one row, no deadlock possible).
-- Rank and is_top_10_pct are now computed at read time by the spotlight/leaderboard
-- queries rather than being materialised on every write.

CREATE OR REPLACE FUNCTION update_leaderboard_on_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_total_score       integer;
  v_correct_count     integer;
  v_total_q           integer;
  v_accuracy          numeric(5,2);
  v_avg_speed         integer;
  v_fastest_answer    integer;
  v_slowest_answer    integer;
  v_speed_stddev      numeric;
BEGIN
  SELECT
    COALESCE(SUM(points_awarded), 0),
    COUNT(*) FILTER (WHERE is_correct),
    COUNT(*),
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE is_correct))::numeric / COUNT(*) * 100, 2)
      ELSE 0
    END,
    COALESCE(AVG(time_taken_ms)::integer, 0),
    COALESCE(MIN(time_taken_ms), 0),
    COALESCE(MAX(time_taken_ms), 0),
    COALESCE(STDDEV_POP(time_taken_ms)::numeric, 0)
  INTO v_total_score, v_correct_count, v_total_q, v_accuracy,
       v_avg_speed, v_fastest_answer, v_slowest_answer, v_speed_stddev
  FROM public.responses
  WHERE event_id = NEW.event_id AND player_id = NEW.player_id;

  INSERT INTO public.leaderboard_entries
    (event_id, player_id, total_score, correct_count, total_questions,
     accuracy, avg_speed_ms, fastest_answer_ms, slowest_answer_ms, answer_speed_stddev)
  VALUES
    (NEW.event_id, NEW.player_id, v_total_score, v_correct_count, v_total_q,
     v_accuracy, v_avg_speed, v_fastest_answer, v_slowest_answer, v_speed_stddev)
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

  RETURN NEW;
END;
$$;
