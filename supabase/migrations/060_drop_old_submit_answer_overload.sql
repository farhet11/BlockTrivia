-- ============================================================
-- Migration 056: Drop old submit_answer overload
-- ============================================================
--
-- Migration 055 added p_numeric_answer and p_oracle_choice params to
-- submit_answer, but CREATE OR REPLACE created a second overload instead
-- of replacing the old 5-param version (PG treats different param lists
-- as distinct functions).
--
-- PostgREST cannot resolve overloaded functions with the same name,
-- causing PGRST203: "Could not choose the best candidate function".
-- This blocked ALL answer submissions — zero responses recorded.
--
-- Fix: drop the old 5-param signature, leaving only the 7-param version.
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_answer(uuid, uuid, integer, integer, numeric);
