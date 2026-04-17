-- Migration 071: Restore rank + is_top_10_pct without cross-row locking.
--
-- Migration 070 fixed the deadlock by removing the two bulk UPDATE statements
-- from the trigger. Side-effect: rank and is_top_10_pct are no longer written,
-- so leaderboard queries that ORDER BY rank now get NULLs.
--
-- Fix: compute rank inline via a correlated COUNT subquery during the UPSERT.
-- A COUNT(*) only acquires shared (read) locks — no exclusive row locks on
-- other players' rows, so deadlocks are impossible even under heavy concurrency.
--
-- Trade-off: rank is approximate during simultaneous bursts (two concurrent
-- submitters may compute the same COUNT before either UPSERT completes), but
-- is self-correcting on the next submit and is always exact after the reveal
-- re-score. Acceptable for live leaderboard display.

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
  v_rank              integer;
  v_player_count      integer;
  v_is_top10          boolean;
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

  -- Compute rank as "number of other players with a strictly higher score + 1".
  -- Uses only a shared/read lock — no exclusive locks on sibling rows.
  SELECT COUNT(*) + 1 INTO v_rank
  FROM public.leaderboard_entries
  WHERE event_id = NEW.event_id
    AND player_id != NEW.player_id
    AND total_score > v_total_score;

  -- Compute total players (including this one) for top-10% threshold.
  SELECT COUNT(*) + 1 INTO v_player_count
  FROM public.leaderboard_entries
  WHERE event_id = NEW.event_id
    AND player_id != NEW.player_id;

  v_is_top10 := v_rank <= GREATEST(1, CEIL(v_player_count * 0.1));

  INSERT INTO public.leaderboard_entries
    (event_id, player_id, total_score, correct_count, total_questions,
     accuracy, avg_speed_ms, fastest_answer_ms, slowest_answer_ms,
     answer_speed_stddev, rank, is_top_10_pct)
  VALUES
    (NEW.event_id, NEW.player_id, v_total_score, v_correct_count, v_total_q,
     v_accuracy, v_avg_speed, v_fastest_answer, v_slowest_answer,
     v_speed_stddev, v_rank, v_is_top10)
  ON CONFLICT (event_id, player_id) DO UPDATE SET
    total_score         = EXCLUDED.total_score,
    correct_count       = EXCLUDED.correct_count,
    total_questions     = EXCLUDED.total_questions,
    accuracy            = EXCLUDED.accuracy,
    avg_speed_ms        = EXCLUDED.avg_speed_ms,
    fastest_answer_ms   = EXCLUDED.fastest_answer_ms,
    slowest_answer_ms   = EXCLUDED.slowest_answer_ms,
    answer_speed_stddev = EXCLUDED.answer_speed_stddev,
    rank                = EXCLUDED.rank,
    is_top_10_pct       = EXCLUDED.is_top_10_pct,
    updated_at          = NOW();

  RETURN NEW;
END;
$$;
