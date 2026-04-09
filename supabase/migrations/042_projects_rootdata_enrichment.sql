-- Extend the projects stub (039) with RootData API cache columns.
--
-- RootData is a credit-based blockchain project intelligence API.
-- We fetch once, cache permanently in these columns, and refresh weekly via
-- rootdata_synced_at. Never hit the API twice for the same project.

alter table public.projects
  add column if not exists rootdata_id        text unique,
  add column if not exists one_liner          text,
  add column if not exists logo_url           text,
  add column if not exists team_members       jsonb not null default '[]'::jsonb,
  add column if not exists investors          jsonb not null default '[]'::jsonb,
  add column if not exists ecosystem_tags     jsonb not null default '[]'::jsonb,
  add column if not exists funding_history    jsonb not null default '[]'::jsonb,
  add column if not exists rootdata_synced_at timestamptz;

comment on column public.projects.rootdata_id is
  'RootData internal project ID. NULL = not yet linked to RootData.';
comment on column public.projects.one_liner is
  'Short tagline pulled from RootData project profile.';
comment on column public.projects.logo_url is
  'Project logo URL from RootData (or manually uploaded).';
comment on column public.projects.team_members is
  'Cached RootData team array: [{name, role, twitter, ...}]';
comment on column public.projects.investors is
  'Cached RootData investor array: [{name, logo, ...}]';
comment on column public.projects.ecosystem_tags is
  'Cached RootData ecosystem/category tags: ["DeFi", "L2", ...]';
comment on column public.projects.funding_history is
  'Cached RootData funding rounds: [{round, amount, date, investors}]';
comment on column public.projects.rootdata_synced_at is
  'When RootData data was last fetched. NULL = never synced. Refresh if >7 days old.';

-- Allow hosts to insert new projects (previously missing — needed for onboarding)
drop policy if exists "hosts can insert projects" on public.projects;
create policy "hosts can insert projects"
  on public.projects for insert
  with check (auth.uid() is not null);

-- Allow hosts to insert their own host_projects memberships
drop policy if exists "hosts can insert their memberships" on public.host_projects;
create policy "hosts can insert their memberships"
  on public.host_projects for insert
  with check (profile_id = auth.uid());
