-- Migration 058: Scope sponsor-logos storage + feedback RLS properly
--
-- Fixes:
--   M3: Any authenticated user could upload/delete sponsor logos to any path.
--       Scope to event owners via the {eventId}/... path convention.
--   M4: The "Hosts can view all feedback" policy allowed any user who had
--       EVER created an event to read ALL feedback globally. We add an
--       event_id column (nullable for backwards compat) and scope reads to
--       the owning host. Anonymous/global feedback (no event_id) remains
--       visible only to super-admins via service_role.
--
-- Rollback:
--   -- Storage
--   DROP POLICY IF EXISTS "Event owners upload sponsor logos" ON storage.objects;
--   DROP POLICY IF EXISTS "Event owners delete sponsor logos" ON storage.objects;
--   CREATE POLICY "Authenticated users can upload sponsor logos"
--     ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sponsor-logos');
--   CREATE POLICY "Hosts can delete their sponsor logos"
--     ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sponsor-logos');
--   -- Feedback
--   DROP POLICY IF EXISTS "Hosts view their event feedback" ON feedback;
--   ALTER TABLE feedback DROP COLUMN IF EXISTS event_id;
--   CREATE POLICY "Hosts can view all feedback" ON feedback FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM events WHERE events.created_by = auth.uid()));

-- ── 1. Scope sponsor-logos storage to event owners ──────────────────────────

DROP POLICY IF EXISTS "Authenticated users can upload sponsor logos" ON storage.objects;
DROP POLICY IF EXISTS "Hosts can delete their sponsor logos" ON storage.objects;

-- Uploads must target a path beginning with an event the user owns.
-- Path convention: {event_id}/{timestamp}.{ext}
CREATE POLICY "Event owners upload sponsor logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sponsor-logos'
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id::text = (storage.foldername(name))[1]
        AND events.created_by = auth.uid()
    )
  );

CREATE POLICY "Event owners delete sponsor logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sponsor-logos'
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id::text = (storage.foldername(name))[1]
        AND events.created_by = auth.uid()
    )
  );

-- Public SELECT policy remains (anyone can view sponsor logos — they're brand imagery)


-- ── 2. Scope feedback reads to owning host ──────────────────────────────────

-- Add event_id column (nullable so existing global feedback isn't broken)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_feedback_event_id ON feedback(event_id);

-- Replace the over-broad policy with a scoped one
DROP POLICY IF EXISTS "Hosts can view all feedback" ON feedback;

-- Hosts see feedback scoped to events they own.
-- Global feedback (event_id IS NULL) is only visible via service_role.
CREATE POLICY "Hosts view their event feedback"
  ON feedback FOR SELECT TO authenticated
  USING (
    event_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id = feedback.event_id
        AND events.created_by = auth.uid()
    )
  );

-- Users can always read their own feedback (useful for confirmation UI)
CREATE POLICY "Users view own feedback"
  ON feedback FOR SELECT TO authenticated
  USING (player_id = auth.uid());
