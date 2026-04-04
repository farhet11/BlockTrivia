-- Add per-game alias to event_players
ALTER TABLE public.event_players
  ADD COLUMN IF NOT EXISTS game_alias TEXT;

-- Allow players to update their own event_player row (e.g. set alias)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_players' AND policyname = 'Players can update own event_player'
  ) THEN
    CREATE POLICY "Players can update own event_player"
      ON public.event_players FOR UPDATE TO authenticated
      USING (player_id = auth.uid())
      WITH CHECK (player_id = auth.uid());
  END IF;
END$$;
