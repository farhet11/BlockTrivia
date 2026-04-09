-- Migration 045: add INSERT policy for projects + auto-link host on insert
--
-- Bug: /api/rootdata/project was failing with 42501 RLS violation on every
-- project save because migration 039 enabled RLS and added SELECT/UPDATE
-- policies but never wrote an INSERT policy. The route's projects.insert()
-- call would always be rejected, the catch path returned `project.id: null`,
-- and host_projects never got linked — so the form auto-fill kept working
-- but no analytics tagging or cross-event aggregation could happen.
--
-- Fix: any authenticated user can insert into projects (the API route
-- already gates on host/super_admin role at the application layer). The
-- inserter is recorded via created_by so we can audit.
--
-- Also: trigger that auto-links the inserter as `owner` in host_projects
-- so the projects.update RLS policy (which checks host_projects ownership)
-- starts working immediately for the same row.

drop policy if exists "authenticated users can insert projects" on public.projects;
create policy "authenticated users can insert projects"
  on public.projects for insert
  with check (auth.uid() is not null);

-- Auto-link inserter as owner in host_projects so subsequent updates pass
-- the existing UPDATE policy without an extra round trip from the API.
create or replace function public.link_project_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.host_projects (profile_id, project_id, role)
    values (new.created_by, new.id, 'owner')
    on conflict (profile_id, project_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_link_creator on public.projects;
create trigger projects_link_creator
  after insert on public.projects
  for each row
  execute function public.link_project_creator_as_owner();

-- Also need INSERT policy on host_projects so the API route's manual
-- upsert (kept for safety) doesn't fail either.
drop policy if exists "users can insert their own host_projects" on public.host_projects;
create policy "users can insert their own host_projects"
  on public.host_projects for insert
  with check (profile_id = auth.uid());

notify pgrst, 'reload schema';
