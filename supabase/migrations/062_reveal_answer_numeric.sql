-- Extend get_revealed_answer to also return correct_answer_numeric.
-- Needed by Closest Wins round: players who didn't submit used to see
-- the MCQ fallback (0) because the RPC only exposed `correct_answer` (int).
-- Now the client can pick the right field based on round_type.

create or replace function get_revealed_answer(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_question_id uuid;
  v_correct_answer integer;
  v_correct_answer_numeric numeric;
  v_explanation text;
begin
  select phase, current_question_id
  into v_phase, v_question_id
  from game_state
  where event_id = p_event_id;

  if v_phase != 'revealing' then
    return jsonb_build_object('error', 'Not in revealing phase');
  end if;

  if v_question_id is null then
    return jsonb_build_object('error', 'No active question');
  end if;

  select correct_answer, correct_answer_numeric, explanation
  into v_correct_answer, v_correct_answer_numeric, v_explanation
  from questions
  where id = v_question_id;

  return jsonb_build_object(
    'correct_answer', v_correct_answer,
    'correct_answer_numeric', v_correct_answer_numeric,
    'explanation', v_explanation
  );
end;
$$;
