-- Migration 074: Make recompute_leaderboard_ranks() self-sufficient.
--
-- Migration 073 dropped the per-response trigger that populated
-- leaderboard_entries. recompute_leaderboard_ranks() (migration 072)
-- assumed entries already existed and only re-ranked them — so after
-- the trigger removal, calling it at reveal/end-game produced an empty
-- leaderboard because there were no rows to rank.
--
-- Fix: expand recompute_leaderboard_ranks() to first UPSERT a row for
-- every player who has at least one response in the event, then re-rank.
-- This makes it the single authoritative scoring call and removes the
-- dependency on the dropped trigger.

CREATE OR REPLACE FUNCTION public.recompute_leaderboard_ranks(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_player_count integer;
BEGIN
  -- Step 1: UPSERT one leaderboard row per player from their responses.
  -- Aggregates score, accuracy, and speed from scratch — no trigger needed.
  INSERT INTO public.leaderboard_entries (
    event_id, player_id,
    total_score, correct_count, total_questions,
    accuracy, avg_speed_ms,
    fastest_answer_ms, slowest_answer_ms, answer_speed_stddev,
    rank, is_top_10_pct
  )
  SELECT
    r.event_id,
    r.player_id,
    COALESCE(SUM(r.points_awarded), 0),
    COUNT(*) FILTER (WHERE r.is_correct),
    COUNT(*),
    CASE WHEN COUNT(*) > 0
      THEN ROUND(
        (COUNT(*) FILTER (WHERE r.is_correct))::numeric / COUNT(*) * 100, 2
      )
      ELSE 0
    END,
    COALESCE(AVG(r.time_taken_ms)::integer, 0),
    COALESCE(MIN(r.time_taken_ms), 0),
    COALESCE(MAX(r.time_taken_ms), 0),
    COALESCE(STDDEV_POP(r.time_taken_ms)::numeric, 0),
    0,     -- rank placeholder; set in step 2
    false  -- is_top_10_pct placeholder; set in step 3
  FROM public.responses r
  WHERE r.event_id = p_event_id
  GROUP BY r.event_id, r.player_id
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

  -- Step 2: Authoritative rank via ROW_NUMBER (score DESC, speed ASC).
  UPDATE public.leaderboard_entries le
  SET rank = r.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY total_score DESC, avg_speed_ms ASC NULLS LAST
           ) AS new_rank
    FROM public.leaderboard_entries
    WHERE event_id = p_event_id
  ) r
  WHERE le.id = r.id AND le.event_id = p_event_id;

  -- Step 3: Top-10% flag.
  SELECT COUNT(*) INTO v_player_count
  FROM public.leaderboard_entries
  WHERE event_id = p_event_id;

  UPDATE public.leaderboard_entries
  SET is_top_10_pct = (rank <= GREATEST(1, CEIL(v_player_count * 0.1)))
  WHERE event_id = p_event_id;
END;
$$;
