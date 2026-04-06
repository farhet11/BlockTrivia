-- Returns the correct answer + explanation for the current question when
-- the game is in "revealing" phase. Security definer to bypass questions RLS.
-- Used by players who didn't answer in time — they still see the reveal.

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

  select correct_answer, explanation
  into v_correct_answer, v_explanation
  from questions
  where id = v_question_id;

  return jsonb_build_object(
    'correct_answer', v_correct_answer,
    'explanation', v_explanation
  );
end;
$$;
