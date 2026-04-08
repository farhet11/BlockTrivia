-- Stub: organizational/project profiles for hosts.
--
-- A "project" represents a Web3 protocol, company, or community that a host
-- creates events for. One host can be associated with multiple projects
-- (common in crypto where contributors span teams), and one project can have
-- multiple hosts.
--
-- No UI exists yet. This schema is created now so that:
--   1. Event data starts accumulating under named projects from day one.
--   2. Future features (one-click project profile, cross-event analytics,
--      project-scoped question banks) have clean foreign keys to migrate to.
--   3. onboarding data (misconceptions, event goals) can later be linked to
--      a project rather than just a profile.

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  website       text,
  twitter       text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Junction: many hosts ↔ many projects.
create table if not exists public.host_projects (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  role        text not null default 'contributor' check (role in ('owner', 'contributor')),
  joined_at   timestamptz not null default now(),
  primary key (profile_id, project_id)
);

-- Allow events to be tagged to a project (nullable — existing events unaffected).
alter table public.events
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- updated_at trigger for projects.
create trigger projects_updated_at
  before update on public.projects
  for each row execute function update_updated_at();

-- RLS: hosts can read all projects they are members of; owners can update.
alter table public.projects enable row level security;
alter table public.host_projects enable row level security;

create policy "hosts can view their projects"
  on public.projects for select
  using (
    id in (
      select project_id from public.host_projects
      where profile_id = auth.uid()
    )
  );

create policy "project owners can update"
  on public.projects for update
  using (
    id in (
      select project_id from public.host_projects
      where profile_id = auth.uid() and role = 'owner'
    )
  );

create policy "hosts can view their own memberships"
  on public.host_projects for select
  using (profile_id = auth.uid());

comment on table public.projects is
  'Web3 protocol / company / community that hosts create events for. One host can belong to multiple projects.';
comment on table public.host_projects is
  'Many-to-many: hosts ↔ projects. role = owner | contributor.';
comment on column public.events.project_id is
  'Optional link to the project this event was run under. NULL for legacy events.';
