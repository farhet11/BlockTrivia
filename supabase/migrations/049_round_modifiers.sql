-- ============================================================
-- Migration 049: round_modifiers table + modifier_state on game_state
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Creates `round_modifiers` — one row per round, at most.
--      Stores which scoring modifier (e.g. 'jackpot') is active for
--      that round and any modifier-specific config (multiplier, etc.).
--   2. Adds `modifier_state` JSONB to `game_state` for runtime tracking
--      (used by Liquidation Mode in Phase 2b to track frozen players
--      and questions remaining; unused by Jackpot Mode which is stateless).
--
-- GOVERNANCE (enforced at DB level):
--   UNIQUE(round_id) — max 1 active modifier per round (hard rule).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS round_modifiers;
--   ALTER TABLE game_state DROP COLUMN IF EXISTS modifier_state;
-- ============================================================


-- ── 1. round_modifiers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS round_modifiers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  modifier_type   text        NOT NULL,
  config          jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT round_modifiers_unique_per_round UNIQUE (round_id),
  CONSTRAINT round_modifiers_type_nonempty    CHECK (modifier_type <> '')
);

-- Index for the most common lookup: "does this round have a modifier?"
CREATE INDEX IF NOT EXISTS round_modifiers_round_id_idx ON round_modifiers(round_id);

-- RLS: a host can manage modifiers for rounds that belong to their events.
ALTER TABLE round_modifiers ENABLE ROW LEVEL SECURITY;

-- Hosts read modifiers for rounds in events they own.
CREATE POLICY "hosts_select_round_modifiers" ON round_modifiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

-- Players can read modifiers for events they are participating in
-- (needed so the play screen can show the jackpot banner).
CREATE POLICY "players_select_round_modifiers" ON round_modifiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN event_players ep ON ep.event_id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND ep.player_id = auth.uid()
    )
  );

-- Hosts insert/update/delete modifiers on their own rounds.
CREATE POLICY "hosts_insert_round_modifiers" ON round_modifiers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "hosts_update_round_modifiers" ON round_modifiers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "hosts_delete_round_modifiers" ON round_modifiers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );


-- ── 2. modifier_state on game_state ──────────────────────────────────────────
--
-- Used by stateful modifiers (Liquidation Mode) to persist mid-game
-- modifier data: frozen player IDs, questions remaining, etc.
-- Jackpot Mode is stateless and does not write here.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS modifier_state jsonb NOT NULL DEFAULT '{}';


-- ── Done ─────────────────────────────────────────────────────────────────────
-- To attach a Jackpot modifier to a round, INSERT INTO round_modifiers
-- with modifier_type = 'jackpot' and config = '{"multiplier": 5}'.
-- The submit_answer RPC (migration 050) reads this at answer time.
