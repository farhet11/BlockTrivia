-- ============================================================
-- Migration 047: Modular round architecture — Phase 1
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Add `config jsonb` to rounds table — universal per-round config store
--   2. Seed config from existing WipeOut-specific columns
--   3. Convert round_type: Postgres enum → text
--      → Adding a new round type no longer requires a DB migration
--      → Validation moves to the round registry (Zod) + check constraint below
--   4. Add modifier_state + round_state to game_state (Phase 2 prep)
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT drop wipeout_min_leverage / wipeout_max_leverage
--     The submit_answer RPC still reads these. Drop them in a follow-up
--     migration after the RPC is updated to read from config JSONB.
--   • Does NOT update submit_answer RPC — existing scoring continues unchanged.
--   • Does NOT drop the round_type enum type — kept for easy rollback.
--     Drop it later with: DROP TYPE round_type;
--
-- ROLLBACK (if needed):
--   ALTER TABLE rounds DROP COLUMN config;
--   ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
--   ALTER TABLE rounds ALTER COLUMN round_type DROP DEFAULT;
--   ALTER TABLE rounds ALTER COLUMN round_type TYPE round_type USING round_type::round_type;
--   ALTER TABLE rounds ALTER COLUMN round_type SET DEFAULT 'mcq';
--   ALTER TABLE game_state DROP COLUMN IF EXISTS modifier_state;
--   ALTER TABLE game_state DROP COLUMN IF EXISTS round_state;
-- ============================================================


-- ── 1. Add config JSONB column ───────────────────────────────────────────────

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';


-- ── 2. Seed config from existing round data ──────────────────────────────────

-- WipeOut: preserve wager pct range from legacy columns
-- Note: post-migration 030, these columns store wager_pct (0.10–1.00),
-- NOT the original 1×–3× multiplier. minWagerPct/maxWagerPct naming
-- reflects the actual Option A scoring model.
UPDATE rounds
SET config = jsonb_build_object(
  'type',        'wipeout',
  'minWagerPct', COALESCE(wipeout_min_leverage, 0.10),
  'maxWagerPct', COALESCE(wipeout_max_leverage, 1.00)
)
WHERE round_type::text = 'wipeout';

-- MCQ
UPDATE rounds
SET config = jsonb_build_object('type', 'mcq')
WHERE round_type::text = 'mcq';

-- True / False
UPDATE rounds
SET config = jsonb_build_object('type', 'true_false')
WHERE round_type::text = 'true_false';

-- Any round type not covered above gets a minimal config with its type
UPDATE rounds
SET config = jsonb_build_object('type', round_type::text)
WHERE config = '{}';


-- ── 3. Convert round_type: enum → text ───────────────────────────────────────

-- Step 3a: Drop the DEFAULT (it references the enum type literal)
ALTER TABLE rounds
  ALTER COLUMN round_type DROP DEFAULT;

-- Step 3b: Cast the column from enum to text
--   The cast is implicit in Postgres — no data loss, values preserved as-is.
ALTER TABLE rounds
  ALTER COLUMN round_type TYPE text USING round_type::text;

-- Step 3c: Restore the default as a plain string
ALTER TABLE rounds
  ALTER COLUMN round_type SET DEFAULT 'mcq';

-- Step 3d: Soft safety net — check constraint for currently valid types.
--   TO ADD A NEW ROUND TYPE: drop this constraint, register the module,
--   deploy. No migration needed.
--   Command: ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN ('mcq', 'true_false', 'wipeout'));

-- Also relax the question builder type — questions don't have their own
-- round_type column (they inherit via round_id join), so nothing to change there.


-- ── 4. Extend game_state for Phase 2 ─────────────────────────────────────────

-- modifier_state: tracks active modifier and its countdown
-- e.g. { "active": "liquidation_mode", "questionsRemaining": 2, "liquidatedPlayers": ["uuid1"] }
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS modifier_state jsonb DEFAULT '{}';

-- round_state: ephemeral per-question state for complex round types
-- e.g. Oracle's Dilemma: { "oraclePlayerId": "uuid", "oracleChose": "deception" }
-- e.g. Pressure Cooker:  { "spotlightPlayerId": "uuid" }
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS round_state jsonb DEFAULT '{}';


-- ── 5. Comment legacy columns for future cleanup ─────────────────────────────

COMMENT ON COLUMN rounds.wipeout_min_leverage IS
  'DEPRECATED — use rounds.config->minWagerPct instead. '
  'Kept for submit_answer RPC compatibility. Drop after RPC migration 048.';

COMMENT ON COLUMN rounds.wipeout_max_leverage IS
  'DEPRECATED — use rounds.config->maxWagerPct instead. '
  'Kept for submit_answer RPC compatibility. Drop after RPC migration 048.';


-- ── Done ─────────────────────────────────────────────────────────────────────
