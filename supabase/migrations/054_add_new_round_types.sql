-- ============================================================
-- Migration 054: Add 4 new round types
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Adds pixel_reveal, closest_wins, the_narrative, oracles_dilemma
--      to the round_type constraint.
--   2. Adds questions.image_url (for Pixel Reveal image-based questions).
--   3. Adds questions.correct_answer_numeric (for Closest Wins distance scoring).
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT add new tables — config JSONB is universal.
--   • Does NOT modify scoring — that's in migration 055.
-- ============================================================

-- 1. Update round type constraint
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_valid;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN (
    'mcq', 'true_false', 'wipeout', 'reversal', 'pressure_cooker',
    'pixel_reveal', 'closest_wins', 'the_narrative', 'oracles_dilemma'
  ));

-- 2. Pixel Reveal: image URL for question
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Closest Wins: numeric correct answer for distance scoring
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer_numeric numeric;
