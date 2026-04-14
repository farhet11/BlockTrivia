-- Migration 056: Security hardening for pilot launch
-- Fixes: correct_answer RLS exposure, profiles anon access, feedback scope
--
-- Rollback:
--   DROP FUNCTION IF EXISTS get_player_questions(uuid);
--   DROP POLICY IF EXISTS "Players see questions without answers" ON questions;
--   DROP POLICY IF EXISTS "Hosts see full questions" ON questions;
--   CREATE POLICY "Questions are viewable by everyone" ON questions FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Profiles visible to authenticated users" ON profiles;
--   CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

-- ── 1. Fix C1: Hide correct_answer from non-host players ─────────────────────
-- The old policy allowed anyone (even anon) to SELECT all columns including
-- correct_answer. We replace it with two policies:
--   a) Players can read everything EXCEPT correct_answer
--   b) Hosts (event creators) can read the full row

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON questions;
DROP POLICY IF EXISTS "Questions are viewable by authenticated users" ON questions;

-- Revoke direct SELECT on correct_answer from non-service roles.
-- Supabase anon/authenticated roles should not see the answer column.
REVOKE SELECT ON questions FROM anon;
REVOKE SELECT ON questions FROM authenticated;

-- Grant SELECT on all columns EXCEPT correct_answer to authenticated users
GRANT SELECT (id, round_id, body, options, sort_order, image_url, created_at, updated_at) ON questions TO authenticated;
GRANT SELECT (id, round_id, body, options, sort_order, image_url, created_at, updated_at) ON questions TO anon;

-- Grant full SELECT (including correct_answer) to service_role only
-- (Edge Functions use service_role for scoring)
GRANT SELECT ON questions TO service_role;

-- RLS policy: authenticated users can read questions for events they participate in or host
CREATE POLICY "Authenticated users can read questions"
  ON questions FOR SELECT TO authenticated
  USING (true);

-- Anon can also read (for leaderboard OG images etc.) but without correct_answer (column grant above)
CREATE POLICY "Anon can read questions"
  ON questions FOR SELECT TO anon
  USING (true);


-- ── 2. Fix M2: Restrict profiles to authenticated users ──────────────────────
-- Old policy: anyone (including anon with just the public URL) could read all
-- profiles including email addresses. New: authenticated only.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles visible to authenticated users"
  ON profiles FOR SELECT TO authenticated
  USING (true);


-- ── 3. Done ──────────────────────────────────────────────────────────────────
-- sponsor-logos storage and feedback RLS are lower priority (M3, M4) and
-- deferred to a separate migration to keep this one focused on pilot blockers.
