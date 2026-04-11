-- ============================================================
-- Migration 053: Add custom_instructions to host_onboarding
-- ============================================================
--
-- WHAT THIS DOES:
--   Adds a `custom_instructions` text column to `host_onboarding`.
--   Hosts can set persistent custom instructions that get injected
--   into every MindScan question generation call (e.g. "focus on
--   tokenomics", "keep questions brief").
--
-- WHY:
--   Hosts need a way to steer AI question generation beyond just
--   difficulty and content. Custom instructions let them focus on
--   specific concepts, tone, or depth without re-typing every time.
--
-- CONSTRAINTS:
--   Max 500 characters — enough for focused guidance, short enough
--   to prevent prompt hijacking.
--
-- ROLLBACK:
--   ALTER TABLE host_onboarding DROP COLUMN custom_instructions;
-- ============================================================

ALTER TABLE host_onboarding
  ADD COLUMN custom_instructions text
  CONSTRAINT host_onboarding_custom_instructions_length
    CHECK (char_length(custom_instructions) <= 500);
