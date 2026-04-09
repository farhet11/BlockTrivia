-- 043_host_onboarding_linked_project.sql
--
-- Store the RootData-linked project name and ID so Step 3 can rehydrate
-- the search field on page refresh instead of showing an empty input.

alter table public.host_onboarding
  add column if not exists linked_project_name text,
  add column if not exists linked_rootdata_id   text,
  add column if not exists linked_project_logo  text;

comment on column public.host_onboarding.linked_project_name is
  'Display name of the RootData project the host linked during onboarding.';
comment on column public.host_onboarding.linked_rootdata_id is
  'RootData internal project ID linked during onboarding.';
comment on column public.host_onboarding.linked_project_logo is
  'Logo URL of the RootData project linked during onboarding.';
