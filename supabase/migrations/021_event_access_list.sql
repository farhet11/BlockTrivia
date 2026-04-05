-- Event access control: whitelist mode restricts join to approved emails only.
-- Default is 'open' (anyone can join).

-- Access mode on events
ALTER TABLE events ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'open'
  CHECK (access_mode IN ('open', 'whitelist'));

-- Approved email list per event
CREATE TABLE IF NOT EXISTS event_access_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One entry per email per event
CREATE UNIQUE INDEX IF NOT EXISTS event_access_list_unique
  ON event_access_list (event_id, lower(email));

-- Index for fast lookup at join time
CREATE INDEX IF NOT EXISTS event_access_list_event_idx
  ON event_access_list (event_id);

-- RLS
ALTER TABLE event_access_list ENABLE ROW LEVEL SECURITY;

-- Hosts can manage their own event's access list
CREATE POLICY "Hosts can manage access list"
  ON event_access_list FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_access_list.event_id
        AND events.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_access_list.event_id
        AND events.created_by = auth.uid()
    )
  );

-- Players can read the access list (needed to check if they're allowed)
CREATE POLICY "Players can check access list"
  ON event_access_list FOR SELECT TO authenticated
  USING (true);
