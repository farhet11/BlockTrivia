-- Migration 072: Fix rank tie-break and add recompute_leaderboard_ranks().
--
-- Codex review found two issues in migration 071:
--
-- [P1] Displaced players: only the submitting player's rank is updated.
--   When Player A overtakes Player B, B still holds its old rank until B
--   submits again. On the final leaderboard this means duplicate rank-1s.
--
-- [P2] Speed tie-break dropped: migration 071 only counted rows with
--   strictly higher total_score. Players tied on points get the same stored
--   rank, breaking get_event_spotlights() which special-cases rank = 1.
--
-- Fix strategy:
--   a) Restore the avg_speed_ms ASC tie-break in the COUNT formula inside
--      update_leaderboard_on_response (approximate, live, non-locking).
--   b) Add recompute_leaderboard_ranks(event_id) which runs an authoritative
--      ROW_NUMBER() re-rank + is_top_10_pct refresh in one pass. Call it:
--      - from rescore_closest_wins (was missing rank refresh entirely)
--      - from any end-of-game hook
--      - from final/results server pages before rendering
--   c) Fix rescore_closest_wins to also call recompute_leaderboard_ranks.

-- ── 1. update_leaderboard_on_response: add speed tie-break ───────────────────
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

  -- Rank = count of players who are strictly ahead (higher score, or equal
  -- score but faster) + 1. Read-only COUNT — no exclusive row locks.
  SELECT COUNT(*) + 1 INTO v_rank
  FROM public.leaderboard_entries
  WHERE event_id = NEW.event_id
    AND player_id != NEW.player_id
    AND (
      total_score > v_total_score
      OR (total_score = v_total_score AND avg_speed_ms < v_avg_speed)
    );

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

-- ── 2. recompute_leaderboard_ranks: authoritative end-of-question re-rank ────
-- Safely re-ranks ALL players for an event using ROW_NUMBER() in one pass.
-- Uses the same score-desc / speed-asc ordering the app relies on.
-- Safe to call concurrently: only runs one UPDATE per call, no cross-row deps.
CREATE OR REPLACE FUNCTION recompute_leaderboard_ranks(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_count integer;
BEGIN
  -- Recompute rank
  UPDATE leaderboard_entries le
  SET rank = r.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY total_score DESC, avg_speed_ms ASC NULLS LAST
           ) AS new_rank
    FROM leaderboard_entries
    WHERE event_id = p_event_id
  ) r
  WHERE le.id = r.id AND le.event_id = p_event_id;

  -- Recompute is_top_10_pct
  SELECT COUNT(*) INTO v_player_count
  FROM leaderboard_entries WHERE event_id = p_event_id;

  UPDATE leaderboard_entries
  SET is_top_10_pct = (rank <= GREATEST(1, CEIL(v_player_count * 0.1)))
  WHERE event_id = p_event_id;
END;
$$;

-- Grant EXECUTE to authenticated users so server components can call it
GRANT EXECUTE ON FUNCTION recompute_leaderboard_ranks(uuid) TO authenticated;

-- ── 3. rescore_closest_wins: add rank refresh at the end ──────────────────────
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

  IF v_correct_numeric IS NULL THEN RETURN; END IF;

  v_max_distance := v_tolerance * GREATEST(ABS(v_correct_numeric), 1);

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

  FOR r IN
    SELECT id, numeric_answer, time_taken_ms
    FROM responses
    WHERE question_id = p_question_id AND event_id = p_event_id
  LOOP
    IF r.numeric_answer IS NULL THEN
      UPDATE responses SET is_correct = false, points_awarded = 0 WHERE id = r.id;
      CONTINUE;
    END IF;

    v_distance  := ABS(r.numeric_answer - v_correct_numeric);
    v_closeness := GREATEST(0, 1.0 - v_distance / NULLIF(v_max_distance, 0));

    IF v_total_closeness > 0 AND v_closeness > 0 THEN
      v_new_points := FLOOR(v_closeness / v_total_closeness * v_pot);

      IF v_time_bonus_enabled AND v_time_limit_ms > 0 THEN
        v_time_ratio := GREATEST(0, 1.0 - (r.time_taken_ms::numeric / v_time_limit_ms));
        v_time_bonus := FLOOR(v_base_points * 0.5 * v_time_ratio);
        v_new_points := v_new_points + v_time_bonus;
      END IF;
    ELSE
      v_new_points := 0;
    END IF;

    UPDATE responses
    SET is_correct     = (v_distance = 0),
        points_awarded = v_new_points
    WHERE id = r.id;
  END LOOP;

  -- Rebuild leaderboard totals from responses
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

  -- Authoritative rank refresh (was missing from previous version)
  PERFORM recompute_leaderboard_ranks(p_event_id);
END;
$$;
