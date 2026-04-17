-- Migration 068: Void Question — remove a question from scoring mid-game.
--
-- Host-only action, called from the HostControlBar overflow menu on the
-- reveal screen. Zeroes out every response for that (event, question) pair,
-- appends the question_id to game_state.voided_question_ids (so the UI can
-- render a "VOIDED" pill on subsequent replays), and rebuilds the leaderboard.
--
-- Cannot be un-voided. WipeOut losses AND gains are both nulled because
-- responses.points_awarded already captures the signed delta.

-- ── 1. Add voided_question_ids to game_state ────────────────────────────────
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS voided_question_ids uuid[] NOT NULL DEFAULT '{}';

-- ── 2. RPC: void_question ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION void_question(
  p_event_id    uuid,
  p_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller       uuid;
  v_is_host      boolean;
  v_already      boolean;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Authorization: caller must own the event (created it) or be an event_host.
  SELECT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id
      AND (
        e.created_by = v_caller
        OR EXISTS (
          SELECT 1 FROM event_hosts eh
          WHERE eh.event_id = p_event_id AND eh.user_id = v_caller
        )
      )
  ) INTO v_is_host;

  IF NOT v_is_host THEN
    RETURN jsonb_build_object('error', 'Not authorized to void questions on this event');
  END IF;

  -- Idempotency: if already voided, return early.
  SELECT p_question_id = ANY(voided_question_ids) INTO v_already
  FROM game_state WHERE event_id = p_event_id;

  IF COALESCE(v_already, false) THEN
    RETURN jsonb_build_object('ok', true, 'already_voided', true);
  END IF;

  -- Zero out every response for this question in this event.
  UPDATE responses
  SET points_awarded = 0,
      is_correct     = false
  WHERE event_id = p_event_id
    AND question_id = p_question_id;

  -- Track the void on game_state.
  UPDATE game_state
  SET voided_question_ids = array_append(voided_question_ids, p_question_id)
  WHERE event_id = p_event_id;

  -- Rebuild leaderboard_entries from the truth (all responses) for this event.
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

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION void_question(uuid, uuid) TO authenticated;
