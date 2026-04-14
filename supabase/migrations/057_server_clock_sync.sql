-- Migration 057: Server clock sync RPC
--
-- Purpose: Eliminate host/player timer desync caused by device clock skew.
-- Host sets `question_started_at = new Date().toISOString()` (host's clock).
-- Player computes remaining time via Date.now() (player's clock).
-- If clocks differ by N seconds, timer desyncs by N seconds.
--
-- Fix: Each client fetches server's `now()` once on mount, computes offset
-- from local clock, then uses `serverNow() = Date.now() + offset` for all
-- timer math. Both host and player converge on the same reference clock.
--
-- Rollback: DROP FUNCTION IF EXISTS get_server_time();

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
AS $$
  SELECT now();
$$;

-- Callable by any authenticated or anonymous user — no sensitive data returned.
GRANT EXECUTE ON FUNCTION get_server_time() TO anon, authenticated;
