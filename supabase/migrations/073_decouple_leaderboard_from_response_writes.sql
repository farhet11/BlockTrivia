-- Migration 073: Decouple leaderboard scoring from per-response writes.
--
-- The trigger responses_update_leaderboard ran an aggregate SELECT + UPSERT
-- to leaderboard_entries on every single INSERT into responses. Under concurrent
-- load (300 players answering simultaneously), this saturated PgBouncer's
-- connection pool and caused ~17% timeout errors — not deadlocks, but
-- connection exhaustion: each write held a connection for ~25ms (INSERT + trigger)
-- vs ~5ms for a bare INSERT.
--
-- Fix: drop the per-response trigger entirely. Leaderboard scoring now happens
-- once per question, when the host transitions to the revealing phase, by calling
-- recompute_leaderboard_ranks(event_id). This function already exists (migration 072)
-- and is the authoritative re-rank used at game-end.
--
-- The submit_answer RPC still computes and returns is_correct + points_awarded
-- inline, so players see their result immediately — no change to player UX.
-- The leaderboard shown between rounds is populated by the reveal-phase recompute,
-- which is the earliest it was ever shown anyway.

DROP TRIGGER IF EXISTS responses_update_leaderboard ON public.responses;
