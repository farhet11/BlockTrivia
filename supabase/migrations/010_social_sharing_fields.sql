-- Social sharing fields on events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS twitter_handle text,
  ADD COLUMN IF NOT EXISTS hashtags text[];

-- Anon RLS policies for the public leaderboard page (/results/{code}).
-- These are additive — existing authenticated policies remain untouched.
-- Supabase RLS evaluates policies with OR, so any matching policy grants access.

CREATE POLICY "Public can read events"
  ON events FOR SELECT TO anon USING (true);

CREATE POLICY "Public can read leaderboard entries"
  ON leaderboard_entries FOR SELECT TO anon USING (true);

CREATE POLICY "Public can read profiles"
  ON profiles FOR SELECT TO anon USING (true);

CREATE POLICY "Public can read event sponsors"
  ON event_sponsors FOR SELECT TO anon USING (true);
