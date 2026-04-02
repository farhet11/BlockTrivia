-- Any authenticated user can create events (role gate moved to Start Game).
-- The host role is still the gate for going live — users can build their
-- full event as a draft and only hit the wall when they try to launch.

drop policy if exists "Admins and hosts can create events" on events;

create policy "Authenticated users can create events"
  on events for insert to authenticated
  with check (created_by = auth.uid());
