-- ============================================================
-- Migration 052: Expand round_type CHECK constraint
-- ============================================================
--
-- WHAT THIS DOES:
--   Drops the old rounds_round_type_valid CHECK constraint (from migration
--   047) and recreates it with the new round types added in Phase 4:
--   reversal and pressure_cooker.
--
-- WHY:
--   Migration 047 added a CHECK constraint as a "soft safety net" but only
--   included the original 3 types (mcq, true_false, wipeout). The question
--   builder select dropdown shows Reversal and Pressure Cooker, but the DB
--   silently rejects the update because those values aren't in the constraint.
--
-- ROLLBACK:
--   ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
--   ALTER TABLE rounds ADD CONSTRAINT rounds_round_type_valid
--     CHECK (round_type IN ('mcq', 'true_false', 'wipeout'));
-- ============================================================

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_valid;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN ('mcq', 'true_false', 'wipeout', 'reversal', 'pressure_cooker'));
