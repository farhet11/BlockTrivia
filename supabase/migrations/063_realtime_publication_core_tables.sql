-- Enable Realtime replication for the core game tables so all in-app
-- postgres_changes subscriptions fire instantly instead of depending on
-- polling fallbacks.
--
-- Prior state: only `responses` was in `supabase_realtime` (migration 041).
-- Every other Realtime subscription (lobby, play, leaderboard, control panel)
-- was silently no-op'ing because its table was not in the publication,
-- which meant the 2–3s polling fallbacks were carrying the entire UX.
--
-- Symptom reported by pilot players: "Next question takes ~2s to appear
-- after the host clicks" — exactly matches the play-view poll interval.
--
-- This migration adds the three missing tables. RLS is enforced at the
-- Supabase Realtime gateway per client connection, so broadcast scope is
-- already correct:
--   • game_state — readable by event participants
--   • event_players — readable by event participants
--   • leaderboard_entries — readable by event participants
--
-- Idempotent: the `if not exists`-style guard is emulated by checking
-- pg_publication_tables before adding, so re-running is safe.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_state'
  ) then
    alter publication supabase_realtime add table public.game_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_players'
  ) then
    alter publication supabase_realtime add table public.event_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leaderboard_entries'
  ) then
    alter publication supabase_realtime add table public.leaderboard_entries;
  end if;
end $$;
