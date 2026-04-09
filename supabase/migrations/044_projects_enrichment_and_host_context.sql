-- 044_projects_enrichment_and_host_context.sql
--
-- Phase 1 of MindScan onboarding context enrichment.
--
-- 1) Drops team_members from projects (Pro-only field on RootData; we are
--    on the free tier so it always comes back null and is dead weight).
-- 2) Adds the rest of the free-tier RootData fields as typed columns plus
--    a rootdata_raw jsonb for future-proofing (any field we forget to type
--    is still recoverable from raw payload — zero cost insurance).
-- 3) Adds host_onboarding.linked_project_context — denormalized snapshot
--    of the silent project context the followup prompt needs. Stored on
--    the host_onboarding row so the followup endpoint can read everything
--    in a single query and does not depend on the projects-cache RLS path
--    (which can fail silently for new hosts who are not yet linked via
--    host_projects).

-- ── projects table ────────────────────────────────────────────────────────

alter table public.projects
  drop column if exists team_members;

alter table public.projects
  add column if not exists similar_project    jsonb not null default '[]'::jsonb,
  add column if not exists token_symbol       text,
  add column if not exists establishment_date text,
  add column if not exists total_funding      numeric,
  add column if not exists ecosystem          jsonb not null default '[]'::jsonb,
  add column if not exists on_main_net        boolean,
  add column if not exists plan_to_launch     boolean,
  add column if not exists on_test_net        boolean,
  add column if not exists rootdata_raw       jsonb;

comment on column public.projects.similar_project is
  'RootData "similar_project" array — used by MindScan to contrast with adjacent projects.';
comment on column public.projects.token_symbol is
  'Token ticker if the project has launched a token. NULL = pre-token.';
comment on column public.projects.establishment_date is
  'Project founding/launch date as returned by RootData (free-text from API).';
comment on column public.projects.total_funding is
  'Total disclosed funding in USD. Used as silent context only — never surfaced in UI.';
comment on column public.projects.ecosystem is
  'Chains/ecosystems the project lives on (e.g. ["Ethereum", "Base"]).';
comment on column public.projects.on_main_net is
  'RootData boolean — has the project shipped to mainnet?';
comment on column public.projects.plan_to_launch is
  'RootData boolean — does the project plan to launch a token?';
comment on column public.projects.on_test_net is
  'RootData boolean — is the project currently on testnet?';
comment on column public.projects.rootdata_raw is
  'Full RootData get_item payload. Future-proofs against fields we have not yet typed.';

-- ── host_onboarding table ─────────────────────────────────────────────────

alter table public.host_onboarding
  add column if not exists linked_project_context jsonb;

comment on column public.host_onboarding.linked_project_context is
  'Silent RootData fields used as Claude prompt context for the diagnostic check (Step 4). Snapshot taken at project-link time. Never surfaced in the UI.';
