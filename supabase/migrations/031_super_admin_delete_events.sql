-- Allow super_admin to hard-delete events (cascades to all child tables).
-- Regular hosts can only archive (status update), not delete.

create policy "Super admin can delete events"
  on events for delete to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
  );
