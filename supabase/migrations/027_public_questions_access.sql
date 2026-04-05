-- Allow anonymous/public read access to questions for leaderboard position tracking

create policy "Questions are viewable by everyone"
  on questions for select using (true);
