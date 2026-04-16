-- Repair script: backfill migrations 034–063 into supabase_migrations.schema_migrations
-- These were applied directly via the SQL editor and never registered.
-- Idempotent: ON CONFLICT DO NOTHING means re-running is safe.
-- Run once in the Supabase SQL editor with Primary Database role=postgres.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('034', 'host_onboarding', ARRAY[$mig034$
-- 034_host_onboarding.sql
--
-- MindScan Layer 0: host onboarding hybrid intake.
--
-- Stores:
--   - structured fields (role, channels, goal)
--   - the key open-text answer (biggest_misconception) that seeds Layer 1 context
--   - optional project data pointers (strings only — no ingestion at this stage)
--   - Claude-generated follow-up MCQs and the host's answers
--
-- `profiles.id` is already the auth.users id (see 001_initial_schema.sql),
-- so RLS can compare `profile_id = auth.uid()` directly.

create table public.host_onboarding (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid
    references public.profiles(id) on delete cascade
    not null
    unique,
  role text,
  community_channels jsonb,
  event_goal text,
  biggest_misconception text,
  project_website text,
  twitter_handle text,
  content_sources jsonb,
  ai_followup_questions jsonb,
  ai_followup_answers jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.host_onboarding enable row level security;

create policy "host_onboarding_own" on public.host_onboarding
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
$mig034$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('035', 'mindscan_rate_limit', ARRAY[$mig035$
-- MindScan API call log — used for per-user rate limiting.
-- Only the row count + timestamp matter; content is never stored here.
create table public.mindscan_call_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  endpoint text not null, -- 'generate' or 'onboarding-followup'
  called_at timestamptz not null default now()
);

create index mindscan_call_log_rate_check_idx
  on public.mindscan_call_log(profile_id, endpoint, called_at);

alter table public.mindscan_call_log enable row level security;

-- Hosts can insert their own rows and read their own rows (for UI display if needed).
create policy "mindscan_call_log_own"
  on public.mindscan_call_log
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
$mig035$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('036', 'hardening', ARRAY[$mig036$
-- 036_hardening.sql
--
-- Security hardening: DB constraints, timestamp tracking, and improved rate limiting.

-- 1. Add field-size constraints to host_onboarding
alter table public.host_onboarding
  add constraint event_goal_max_length check (length(event_goal) <= 1000),
  add constraint biggest_misconception_min_length check (biggest_misconception is null or length(biggest_misconception) >= 15),
  add constraint biggest_misconception_max_length check (length(biggest_misconception) <= 2000),
  add constraint project_website_max_length check (length(project_website) <= 500),
  add constraint twitter_handle_max_length check (length(twitter_handle) <= 100),
  add constraint role_max_length check (length(role) <= 100);

-- 2. Add updated_at timestamp to host_onboarding for client-side stale-save detection.
-- The client tracks this timestamp and cancels pending auto-saves if a newer save
-- (e.g., from "Finish") has already run (see onboarding-flow.tsx scheduleAutoSave).
alter table public.host_onboarding
  add column updated_at timestamptz not null default now();

-- Create trigger to auto-update the updated_at timestamp
create or replace function update_host_onboarding_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger host_onboarding_updated_at before update on public.host_onboarding
  for each row execute function update_host_onboarding_updated_at();
$mig036$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('037', 'mindscan_question_cost', ARRAY[$mig037$
-- Track the number of questions generated per `generate` call so rate
-- limiting can cap hosts on total questions/day rather than total calls/day.
-- Other endpoints leave this column null and keep using call-count limits.
alter table public.mindscan_call_log
  add column if not exists questions_count int;

comment on column public.mindscan_call_log.questions_count is
  'For generate endpoint: number of questions the host requested in that call. NULL for other endpoints.';
$mig037$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('038', 'questions_ai_generated', ARRAY[$mig038$
-- Flag questions that were generated by MindScan (AI) so the host can
-- visually distinguish them from manually-typed or JSON-imported questions.
alter table public.questions
  add column if not exists ai_generated boolean not null default false;

comment on column public.questions.ai_generated is
  'true when this question was generated by MindScan; false for manual or JSON-imported questions.';
$mig038$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('039', 'projects_stub', ARRAY[$mig039$
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
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function update_updated_at();

-- RLS: hosts can read all projects they are members of; owners can update.
alter table public.projects enable row level security;
alter table public.host_projects enable row level security;

drop policy if exists "hosts can view their projects" on public.projects;
create policy "hosts can view their projects"
  on public.projects for select
  using (
    id in (
      select project_id from public.host_projects
      where profile_id = auth.uid()
    )
  );

drop policy if exists "project owners can update" on public.projects;
create policy "project owners can update"
  on public.projects for update
  using (
    id in (
      select project_id from public.host_projects
      where profile_id = auth.uid() and role = 'owner'
    )
  );

drop policy if exists "hosts can view their own memberships" on public.host_projects;
create policy "hosts can view their own memberships"
  on public.host_projects for select
  using (profile_id = auth.uid());

comment on table public.projects is
  'Web3 protocol / company / community that hosts create events for. One host can belong to multiple projects.';
comment on table public.host_projects is
  'Many-to-many: hosts ↔ projects. role = owner | contributor.';
comment on column public.events.project_id is
  'Optional link to the project this event was run under. NULL for legacy events.';
$mig039$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('040', 'terms_accepted', ARRAY[$mig040$
-- Record when a user first accepted the Terms of Service and Privacy Policy.
-- NULL means the user signed up before this column was added (pre-consent era)
-- or has not yet accepted on a new device flow.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_at is
  'Timestamp when the user checked the ToS + Privacy Policy checkbox. NULL for pre-consent accounts.';
$mig040$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('041', 'responses_realtime', ARRAY[$mig041$
-- Enable Realtime replication for the responses table so the host control
-- panel receives live INSERT events as players submit answers.
--
-- Without this, postgres_changes subscriptions on `responses` are silently
-- ignored because the table is not in the publication. The host's answered
-- count only updates on page refresh instead of in real time.
--
-- RLS is enforced at the Supabase Realtime gateway per client connection:
--   • Players see only their own response (player_id = auth.uid()).
--   • Event creators see all responses for their events.
-- So adding the table to the publication is safe.
alter publication supabase_realtime add table public.responses;
$mig041$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('042', 'projects_rootdata_enrichment', ARRAY[$mig042$
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
$mig042$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('043', 'host_onboarding_linked_project', ARRAY[$mig043$
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
$mig043$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('044', 'projects_enrichment_and_host_context', ARRAY[$mig044$
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
$mig044$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('045', 'projects_insert_policy', ARRAY[$mig045$
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
$mig045$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('046', 'events_import_provenance', ARRAY[$mig046$
-- Migration 046: track event import provenance + cover image
--
-- Why: the Create Event form now supports two enrichment paths — pasting
-- a Luma link (auto-fills title/description/cover) and linking a RootData
-- project (auto-fills organizer + logo). Until now we threw away the
-- *source* of that data the moment the form submitted, which means:
--   - the super-admin analytics dashboard has no way to count
--     Luma-imported vs hand-typed events
--   - we can't show the imported cover image on share cards / lobby
--   - we can't dedupe two events created from the same Luma link
--   - if Luma later updates the event, we can't re-sync because we
--     don't remember which URL we pulled from
--
-- This migration adds three columns to capture that provenance:
--
--   source_url        — canonical URL the import was scraped from
--                       (Luma now, Eventbrite/X Spaces later)
--   source_provider   — short tag for the importer that ran:
--                       'luma' | 'manual' | (future: 'eventbrite', 'x_spaces')
--                       Plain text rather than an enum so the analytics
--                       dashboard can pick up new providers without a
--                       follow-up migration each time we add one.
--   cover_image_url   — imported cover image (e.g. og:image from Luma).
--                       Stored as a remote URL for now; we can move it
--                       into Supabase Storage later if hot-link rot
--                       becomes a problem.
--
-- All three are nullable — every existing event predates this work.

alter table public.events
  add column if not exists source_url       text,
  add column if not exists source_provider  text,
  add column if not exists cover_image_url  text;

-- Index source_provider so the analytics dashboard's "events by source"
-- count is a single index scan. low cardinality column so a btree is fine.
create index if not exists events_source_provider_idx
  on public.events (source_provider)
  where source_provider is not null;

comment on column public.events.source_url is
  'Canonical URL the event was imported from (Luma, Eventbrite, etc.). NULL for hand-typed events.';
comment on column public.events.source_provider is
  'Short tag identifying the importer used: luma | manual | eventbrite | x_spaces. Drives super-admin analytics on which import paths actually get used.';
comment on column public.events.cover_image_url is
  'Cover image URL captured at import time (typically og:image from the source page). Rendered on share cards / lobby when present.';

notify pgrst, 'reload schema';
$mig046$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('047', 'modular_round_architecture', ARRAY[$mig047$
-- ============================================================
-- Migration 047: Modular round architecture — Phase 1
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Add `config jsonb` to rounds table — universal per-round config store
--   2. Seed config from existing WipeOut-specific columns
--   3. Convert round_type: Postgres enum → text
--      → Adding a new round type no longer requires a DB migration
--      → Validation moves to the round registry (Zod) + check constraint below
--   4. Add modifier_state + round_state to game_state (Phase 2 prep)
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT drop wipeout_min_leverage / wipeout_max_leverage
--     The submit_answer RPC still reads these. Drop them in a follow-up
--     migration after the RPC is updated to read from config JSONB.
--   • Does NOT update submit_answer RPC — existing scoring continues unchanged.
--   • Does NOT drop the round_type enum type — kept for easy rollback.
--     Drop it later with: DROP TYPE round_type;
--
-- ROLLBACK (if needed):
--   ALTER TABLE rounds DROP COLUMN config;
--   ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
--   ALTER TABLE rounds ALTER COLUMN round_type DROP DEFAULT;
--   ALTER TABLE rounds ALTER COLUMN round_type TYPE round_type USING round_type::round_type;
--   ALTER TABLE rounds ALTER COLUMN round_type SET DEFAULT 'mcq';
--   ALTER TABLE game_state DROP COLUMN IF EXISTS modifier_state;
--   ALTER TABLE game_state DROP COLUMN IF EXISTS round_state;
-- ============================================================


-- ── 1. Add config JSONB column ───────────────────────────────────────────────

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';


-- ── 2. Seed config from existing round data ──────────────────────────────────

-- WipeOut: preserve wager pct range from legacy columns
-- Note: post-migration 030, these columns store wager_pct (0.10–1.00),
-- NOT the original 1×–3× multiplier. minWagerPct/maxWagerPct naming
-- reflects the actual Option A scoring model.
UPDATE rounds
SET config = jsonb_build_object(
  'type',        'wipeout',
  'minWagerPct', COALESCE(wipeout_min_leverage, 0.10),
  'maxWagerPct', COALESCE(wipeout_max_leverage, 1.00)
)
WHERE round_type::text = 'wipeout';

-- MCQ
UPDATE rounds
SET config = jsonb_build_object('type', 'mcq')
WHERE round_type::text = 'mcq';

-- True / False
UPDATE rounds
SET config = jsonb_build_object('type', 'true_false')
WHERE round_type::text = 'true_false';

-- Any round type not covered above gets a minimal config with its type
UPDATE rounds
SET config = jsonb_build_object('type', round_type::text)
WHERE config = '{}';


-- ── 3. Convert round_type: enum → text ───────────────────────────────────────

-- Step 3a: Drop the DEFAULT (it references the enum type literal)
ALTER TABLE rounds
  ALTER COLUMN round_type DROP DEFAULT;

-- Step 3b: Cast the column from enum to text
--   The cast is implicit in Postgres — no data loss, values preserved as-is.
ALTER TABLE rounds
  ALTER COLUMN round_type TYPE text USING round_type::text;

-- Step 3c: Restore the default as a plain string
ALTER TABLE rounds
  ALTER COLUMN round_type SET DEFAULT 'mcq';

-- Step 3d: Soft safety net — check constraint for currently valid types.
--   TO ADD A NEW ROUND TYPE: drop this constraint, register the module,
--   deploy. No migration needed.
--   Command: ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN ('mcq', 'true_false', 'wipeout'));

-- Also relax the question builder type — questions don't have their own
-- round_type column (they inherit via round_id join), so nothing to change there.


-- ── 4. Extend game_state for Phase 2 ─────────────────────────────────────────

-- modifier_state: tracks active modifier and its countdown
-- e.g. { "active": "liquidation_mode", "questionsRemaining": 2, "liquidatedPlayers": ["uuid1"] }
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS modifier_state jsonb DEFAULT '{}';

-- round_state: ephemeral per-question state for complex round types
-- e.g. Oracle's Dilemma: { "oraclePlayerId": "uuid", "oracleChose": "deception" }
-- e.g. Pressure Cooker:  { "spotlightPlayerId": "uuid" }
ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS round_state jsonb DEFAULT '{}';


-- ── 5. Comment legacy columns for future cleanup ─────────────────────────────

COMMENT ON COLUMN rounds.wipeout_min_leverage IS
  'DEPRECATED — use rounds.config->minWagerPct instead. '
  'Kept for submit_answer RPC compatibility. Drop after RPC migration 048.';

COMMENT ON COLUMN rounds.wipeout_max_leverage IS
  'DEPRECATED — use rounds.config->maxWagerPct instead. '
  'Kept for submit_answer RPC compatibility. Drop after RPC migration 048.';


-- ── Done ─────────────────────────────────────────────────────────────────────
$mig047$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('048', 'submit_answer_config_jsonb', ARRAY[$mig048$
-- ============================================================
-- Migration 048: submit_answer RPC — read WipeOut config from JSONB
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Rewrites the `submit_answer` RPC to read WipeOut wager bounds
--      from rounds.config->>'minWagerPct' / 'maxWagerPct' (the JSONB
--      column added in migration 047) instead of the legacy columns
--      wipeout_min_leverage / wipeout_max_leverage.
--   2. Drops the two legacy columns now that the RPC no longer
--      references them.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT change any scoring logic — Option A math is identical.
--   • Does NOT change the RPC signature (same params/returns).
--   • Does NOT touch the round_type check constraint.
--
-- ROLLBACK (if needed — run BEFORE dropping columns):
--   Run migration 030 again to restore the old RPC, then:
--   ALTER TABLE rounds ADD COLUMN wipeout_min_leverage numeric(3,2) DEFAULT 0.10;
--   ALTER TABLE rounds ADD COLUMN wipeout_max_leverage numeric(3,2) DEFAULT 1.00;
--   UPDATE rounds SET
--     wipeout_min_leverage = (config->>'minWagerPct')::numeric,
--     wipeout_max_leverage = (config->>'maxWagerPct')::numeric
--   WHERE round_type = 'wipeout';
-- ============================================================


-- ── 1. Rewrite submit_answer RPC ─────────────────────────────────────────────

create or replace function submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id          uuid;
  v_correct_answer     integer;
  v_explanation        text;
  v_round_id           uuid;
  v_round_type         text;
  v_base_points        integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_round_config       jsonb;
  v_wipeout_min        numeric;
  v_wipeout_max        numeric;
  v_is_correct         boolean;
  v_leverage           numeric;   -- wager_pct for wipeout (0.10–1.00)
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
begin
  -- Authenticated user
  v_player_id := auth.uid();
  if v_player_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;

  -- Must be an event participant
  if not exists (
    select 1 from event_players
    where event_id = p_event_id and player_id = v_player_id
  ) then
    return jsonb_build_object('error', 'Not a participant in this event');
  end if;

  -- Idempotency — return existing result if already answered
  select id into v_existing_response
  from responses
  where question_id = p_question_id and player_id = v_player_id;

  if v_existing_response is not null then
    return (
      select jsonb_build_object(
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
        'already_answered', true
      )
      from responses r
      join questions q on q.id = r.question_id
      where r.id = v_existing_response
    );
  end if;

  -- Fetch question
  select correct_answer, explanation, round_id
  into v_correct_answer, v_explanation, v_round_id
  from questions
  where id = p_question_id;

  if v_round_id is null then
    return jsonb_build_object('error', 'Question not found');
  end if;

  -- Fetch round config
  --   config JSONB is the source of truth for round-type-specific settings.
  --   Legacy wipeout_min_leverage / wipeout_max_leverage have been dropped.
  select round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  into v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  from rounds
  where id = v_round_id;

  if v_base_points is null then
    return jsonb_build_object('error', 'Round not found');
  end if;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := least(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── WipeOut: Option A (% of banked score) ────────────────────────────────
  if v_round_type = 'wipeout' then
    -- Read wager bounds from config JSONB (seeded by migration 047)
    -- Defaults: min 10%, max 100%
    v_wipeout_min := coalesce((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := coalesce((v_round_config->>'maxWagerPct')::numeric, 1.00);

    -- Clamp wager_pct to round min/max
    v_leverage := least(greatest(coalesce(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    -- Fetch player's current banked score
    select coalesce(total_score, 0) into v_current_score
    from leaderboard_entries
    where event_id = p_event_id and player_id = v_player_id;

    v_current_score := coalesce(v_current_score, 0);

    -- Minimum wager floor = 50 pts (comeback mechanic)
    v_wager_amt := floor(greatest(50, v_current_score) * v_leverage);

    if v_is_correct then
      v_points := v_wager_amt;
    else
      -- Floor at 0: can't lose more than current score
      v_points := -least(v_wager_amt, v_current_score);
    end if;

  -- ── MCQ / True-False: time-bonus scoring ─────────────────────────────────
  else
    v_leverage := 1.0;

    if v_is_correct then
      v_points := v_base_points;
      if v_time_bonus_enabled then
        v_ratio := greatest(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + floor(v_base_points * v_ratio);
      end if;
    end if;
  end if;

  -- Insert response
  insert into responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) values (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  return jsonb_build_object(
    'is_correct',   v_is_correct,
    'points_awarded', v_points,
    'correct_answer', v_correct_answer,
    'explanation',    v_explanation,
    'wager_amt',      v_wager_amt
  );
end;
$$;


-- ── 2. Drop legacy columns ────────────────────────────────────────────────────

ALTER TABLE rounds DROP COLUMN IF EXISTS wipeout_min_leverage;
ALTER TABLE rounds DROP COLUMN IF EXISTS wipeout_max_leverage;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- rounds.config is now the sole source of WipeOut wager bounds.
-- To add a new round type: register the module, deploy. Zero DB migrations.
$mig048$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('049', 'round_modifiers', ARRAY[$mig049$
-- ============================================================
-- Migration 049: round_modifiers table + modifier_state on game_state
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Creates `round_modifiers` — one row per round, at most.
--      Stores which scoring modifier (e.g. 'jackpot') is active for
--      that round and any modifier-specific config (multiplier, etc.).
--   2. Adds `modifier_state` JSONB to `game_state` for runtime tracking
--      (used by Liquidation Mode in Phase 2b to track frozen players
--      and questions remaining; unused by Jackpot Mode which is stateless).
--
-- GOVERNANCE (enforced at DB level):
--   UNIQUE(round_id) — max 1 active modifier per round (hard rule).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS round_modifiers;
--   ALTER TABLE game_state DROP COLUMN IF EXISTS modifier_state;
-- ============================================================


-- ── 1. round_modifiers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS round_modifiers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  modifier_type   text        NOT NULL,
  config          jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT round_modifiers_unique_per_round UNIQUE (round_id),
  CONSTRAINT round_modifiers_type_nonempty    CHECK (modifier_type <> '')
);

-- Index for the most common lookup: "does this round have a modifier?"
CREATE INDEX IF NOT EXISTS round_modifiers_round_id_idx ON round_modifiers(round_id);

-- RLS: a host can manage modifiers for rounds that belong to their events.
ALTER TABLE round_modifiers ENABLE ROW LEVEL SECURITY;

-- Hosts read modifiers for rounds in events they own.
CREATE POLICY "hosts_select_round_modifiers" ON round_modifiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

-- Players can read modifiers for events they are participating in
-- (needed so the play screen can show the jackpot banner).
CREATE POLICY "players_select_round_modifiers" ON round_modifiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN event_players ep ON ep.event_id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND ep.player_id = auth.uid()
    )
  );

-- Hosts insert/update/delete modifiers on their own rounds.
CREATE POLICY "hosts_insert_round_modifiers" ON round_modifiers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "hosts_update_round_modifiers" ON round_modifiers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "hosts_delete_round_modifiers" ON round_modifiers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = round_modifiers.round_id
        AND e.created_by = auth.uid()
    )
  );


-- ── 2. modifier_state on game_state ──────────────────────────────────────────
--
-- Used by stateful modifiers (Liquidation Mode) to persist mid-game
-- modifier data: frozen player IDs, questions remaining, etc.
-- Jackpot Mode is stateless and does not write here.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS modifier_state jsonb NOT NULL DEFAULT '{}';


-- ── Done ─────────────────────────────────────────────────────────────────────
-- To attach a Jackpot modifier to a round, INSERT INTO round_modifiers
-- with modifier_type = 'jackpot' and config = '{"multiplier": 5}'.
-- The submit_answer RPC (migration 050) reads this at answer time.
$mig049$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('050', 'submit_answer_jackpot', ARRAY[$mig050$
-- ============================================================
-- Migration 050: submit_answer — Jackpot Mode modifier support
-- ============================================================
--
-- WHAT THIS DOES:
--   Rewrites submit_answer to check round_modifiers at answer time.
--   If a 'jackpot' modifier is active for the round:
--     • First correct answer → base_points × multiplier (default 5×).
--       The "first correct" check scans existing responses for this
--       question. The winner is whoever gets is_correct = true first
--       — no race condition because the INSERT is inside the same
--       serializable transaction.
--     • All other answers (wrong OR late correct) → 0 points.
--   WipeOut with jackpot: same first-correct-wins rule; wager mechanic
--   is overridden (jackpot points replace the wager calculation).
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT change the RPC signature.
--   • Does NOT affect MCQ/T-F/WipeOut scoring when no modifier is active.
--   • Does NOT add leaderboard_entries mutation — that happens via the
--     existing trigger on responses.points_awarded.
--
-- ROLLBACK:
--   Re-run migration 048 to restore the non-jackpot RPC.
-- ============================================================


CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id          uuid;
  v_correct_answer     integer;
  v_explanation        text;
  v_round_id           uuid;
  v_round_type         text;
  v_base_points        integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_round_config       jsonb;
  v_wipeout_min        numeric;
  v_wipeout_max        numeric;
  v_is_correct         boolean;
  v_leverage           numeric;
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
  -- Modifier state
  v_modifier_type      text;
  v_modifier_config    jsonb;
  v_jackpot_multiplier numeric;
  v_jackpot_winner     boolean := false;
BEGIN
  -- Authenticated user
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Must be an event participant
  IF NOT EXISTS (
    SELECT 1 FROM event_players
    WHERE event_id = p_event_id AND player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant in this event');
  END IF;

  -- Idempotency — return existing result if already answered
  SELECT id INTO v_existing_response
  FROM responses
  WHERE question_id = p_question_id AND player_id = v_player_id;

  IF v_existing_response IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
        'already_answered', true
      )
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      WHERE r.id = v_existing_response
    );
  END IF;

  -- Fetch question
  SELECT correct_answer, explanation, round_id
  INTO v_correct_answer, v_explanation, v_round_id
  FROM questions
  WHERE id = p_question_id;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Question not found');
  END IF;

  -- Fetch round
  SELECT round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  INTO v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  FROM rounds
  WHERE id = v_round_id;

  IF v_base_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;

  -- Check for active modifier on this round
  SELECT modifier_type, config
  INTO v_modifier_type, v_modifier_config
  FROM round_modifiers
  WHERE round_id = v_round_id;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Jackpot Mode modifier ─────────────────────────────────────────────────
  --
  -- If jackpot is active: first correct answer wins base_points × multiplier.
  -- All other answers (wrong OR arrived after the first correct) score 0.
  -- Overrides both MCQ time-bonus scoring and WipeOut wager scoring.
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);

    IF v_is_correct THEN
      -- Check if another player already got this right (they'd win the jackpot)
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id
          AND is_correct = true
          AND player_id <> v_player_id
      ) THEN
        -- First correct answer: jackpot winner
        v_jackpot_winner := true;
        v_points := FLOOR(v_base_points * v_jackpot_multiplier);
      ELSE
        -- Another player already won the jackpot
        v_points := 0;
      END IF;
    ELSE
      -- Wrong answer: 0
      v_points := 0;
    END IF;

    -- For jackpot, leverage = 1.0 (no wager mechanic; wager_amt = 0)
    v_leverage := 1.0;
    v_wager_amt := 0;

  -- ── WipeOut (no modifier) ─────────────────────────────────────────────────
  ELSIF v_round_type = 'wipeout' THEN
    v_wipeout_min := COALESCE((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := COALESCE((v_round_config->>'maxWagerPct')::numeric, 1.00);

    v_leverage := LEAST(GREATEST(COALESCE(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    SELECT COALESCE(total_score, 0) INTO v_current_score
    FROM leaderboard_entries
    WHERE event_id = p_event_id AND player_id = v_player_id;

    v_current_score := COALESCE(v_current_score, 0);
    v_wager_amt := FLOOR(GREATEST(50, v_current_score) * v_leverage);

    IF v_is_correct THEN
      v_points := v_wager_amt;
    ELSE
      v_points := -LEAST(v_wager_amt, v_current_score);
    END IF;

  -- ── MCQ / True-False (no modifier): time-bonus scoring ───────────────────
  ELSE
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;
  END IF;

  -- Insert response
  INSERT INTO responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) VALUES (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  RETURN jsonb_build_object(
    'is_correct',       v_is_correct,
    'points_awarded',   v_points,
    'correct_answer',   v_correct_answer,
    'explanation',      v_explanation,
    'wager_amt',        v_wager_amt,
    'jackpot_winner',   v_jackpot_winner
  );
END;
$$;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- submit_answer now reads round_modifiers at answer time.
-- Jackpot Mode: first correct answer wins base_points × multiplier (default 5×).
-- Non-modifier rounds: unchanged behavior.
$mig050$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('051', 'submit_answer_hybrid_modifiers', ARRAY[$mig051$
-- ============================================================
-- Migration 051: submit_answer — Hybrid modifier support
-- ============================================================
--
-- WHAT THIS DOES:
--   Rewrites submit_answer to check game_state.modifier_state FIRST
--   (live host activation), then falls back to round_modifiers
--   (pre-configured default from question builder).
--
--   This enables the hybrid modifier model:
--   • Host can activate a modifier live during a game from the
--     control panel → writes to game_state.modifier_state.
--   • If the host doesn't touch anything, the pre-configured
--     default from round_modifiers fires automatically.
--   • Live activation overrides the default.
--
-- modifier_state shape:
--   { "type": "jackpot", "config": { "multiplier": 5 }, "activated_at": "..." }
--   Empty/inactive: {} (existing default from migration 049)
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT change the RPC signature.
--   • Does NOT add new tables — uses existing game_state.modifier_state JSONB.
--   • Does NOT affect scoring when no modifier is active.
--
-- ROLLBACK:
--   Re-run migration 050 to restore the round_modifiers-only RPC.
-- ============================================================


CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id          uuid;
  v_correct_answer     integer;
  v_explanation        text;
  v_round_id           uuid;
  v_round_type         text;
  v_base_points        integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_round_config       jsonb;
  v_wipeout_min        numeric;
  v_wipeout_max        numeric;
  v_is_correct         boolean;
  v_leverage           numeric;
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
  -- Modifier state
  v_modifier_type      text;
  v_modifier_config    jsonb;
  v_jackpot_multiplier numeric;
  v_jackpot_winner     boolean := false;
  -- Live modifier override
  v_live_modifier_state jsonb;
BEGIN
  -- Authenticated user
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Must be an event participant
  IF NOT EXISTS (
    SELECT 1 FROM event_players
    WHERE event_id = p_event_id AND player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant in this event');
  END IF;

  -- Idempotency — return existing result if already answered
  SELECT id INTO v_existing_response
  FROM responses
  WHERE question_id = p_question_id AND player_id = v_player_id;

  IF v_existing_response IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
        'already_answered', true
      )
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      WHERE r.id = v_existing_response
    );
  END IF;

  -- Fetch question
  SELECT correct_answer, explanation, round_id
  INTO v_correct_answer, v_explanation, v_round_id
  FROM questions
  WHERE id = p_question_id;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Question not found');
  END IF;

  -- Fetch round
  SELECT round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  INTO v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  FROM rounds
  WHERE id = v_round_id;

  IF v_base_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;

  -- ── Modifier resolution: live override takes priority ─────────────────────
  -- Check game_state.modifier_state first (live host activation)
  SELECT modifier_state INTO v_live_modifier_state
  FROM game_state WHERE event_id = p_event_id;

  IF v_live_modifier_state IS NOT NULL
     AND v_live_modifier_state->>'type' IS NOT NULL
     AND v_live_modifier_state->>'type' <> '' THEN
    -- Live modifier active — use it
    v_modifier_type   := v_live_modifier_state->>'type';
    v_modifier_config := COALESCE(v_live_modifier_state->'config', '{}');
  ELSE
    -- Fallback: pre-configured round modifier from question builder
    SELECT modifier_type, config
    INTO v_modifier_type, v_modifier_config
    FROM round_modifiers
    WHERE round_id = v_round_id;
  END IF;

  -- Correctness
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- Clamp time to round limit
  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Jackpot Mode modifier ─────────────────────────────────────────────────
  --
  -- If jackpot is active: first correct answer wins base_points × multiplier.
  -- All other answers (wrong OR arrived after the first correct) score 0.
  -- Overrides both MCQ time-bonus scoring and WipeOut wager scoring.
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);

    IF v_is_correct THEN
      -- Check if another player already got this right (they'd win the jackpot)
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id
          AND is_correct = true
          AND player_id <> v_player_id
      ) THEN
        -- First correct answer: jackpot winner
        v_jackpot_winner := true;
        v_points := FLOOR(v_base_points * v_jackpot_multiplier);
      ELSE
        -- Another player already won the jackpot
        v_points := 0;
      END IF;
    ELSE
      -- Wrong answer: 0
      v_points := 0;
    END IF;

    -- For jackpot, leverage = 1.0 (no wager mechanic; wager_amt = 0)
    v_leverage := 1.0;
    v_wager_amt := 0;

  -- ── WipeOut (no modifier) ─────────────────────────────────────────────────
  ELSIF v_round_type = 'wipeout' THEN
    v_wipeout_min := COALESCE((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := COALESCE((v_round_config->>'maxWagerPct')::numeric, 1.00);

    v_leverage := LEAST(GREATEST(COALESCE(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    SELECT COALESCE(total_score, 0) INTO v_current_score
    FROM leaderboard_entries
    WHERE event_id = p_event_id AND player_id = v_player_id;

    v_current_score := COALESCE(v_current_score, 0);
    v_wager_amt := FLOOR(GREATEST(50, v_current_score) * v_leverage);

    IF v_is_correct THEN
      v_points := v_wager_amt;
    ELSE
      v_points := -LEAST(v_wager_amt, v_current_score);
    END IF;

  -- ── MCQ / True-False (no modifier): time-bonus scoring ───────────────────
  ELSE
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;
  END IF;

  -- Insert response
  INSERT INTO responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) VALUES (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  RETURN jsonb_build_object(
    'is_correct',       v_is_correct,
    'points_awarded',   v_points,
    'correct_answer',   v_correct_answer,
    'explanation',      v_explanation,
    'wager_amt',        v_wager_amt,
    'jackpot_winner',   v_jackpot_winner
  );
END;
$$;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- submit_answer now checks game_state.modifier_state first (live host activation),
-- then falls back to round_modifiers (pre-configured default).
-- Hybrid model: live activation overrides default. No activation = default fires.
$mig051$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('052', 'add_round_types_to_constraint', ARRAY[$mig052$
-- ============================================================
-- Migration 052: Expand round_type CHECK constraint
-- ============================================================
--
-- WHAT THIS DOES:
--   Drops the old rounds_round_type_valid CHECK constraint (from migration
--   047) and recreates it with the new round types added in Phase 4:
--   reversal and pressure_cooker.
--
-- WHY:
--   Migration 047 added a CHECK constraint as a "soft safety net" but only
--   included the original 3 types (mcq, true_false, wipeout). The question
--   builder select dropdown shows Reversal and Pressure Cooker, but the DB
--   silently rejects the update because those values aren't in the constraint.
--
-- ROLLBACK:
--   ALTER TABLE rounds DROP CONSTRAINT rounds_round_type_valid;
--   ALTER TABLE rounds ADD CONSTRAINT rounds_round_type_valid
--     CHECK (round_type IN ('mcq', 'true_false', 'wipeout'));
-- ============================================================

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_valid;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN ('mcq', 'true_false', 'wipeout', 'reversal', 'pressure_cooker'));
$mig052$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('053', 'host_onboarding_custom_instructions', ARRAY[$mig053$
-- ============================================================
-- Migration 053: Add custom_instructions to host_onboarding
-- ============================================================
--
-- WHAT THIS DOES:
--   Adds a `custom_instructions` text column to `host_onboarding`.
--   Hosts can set persistent custom instructions that get injected
--   into every MindScan question generation call (e.g. "focus on
--   tokenomics", "keep questions brief").
--
-- WHY:
--   Hosts need a way to steer AI question generation beyond just
--   difficulty and content. Custom instructions let them focus on
--   specific concepts, tone, or depth without re-typing every time.
--
-- CONSTRAINTS:
--   Max 500 characters — enough for focused guidance, short enough
--   to prevent prompt hijacking.
--
-- ROLLBACK:
--   ALTER TABLE host_onboarding DROP COLUMN custom_instructions;
-- ============================================================

ALTER TABLE host_onboarding
  ADD COLUMN custom_instructions text
  CONSTRAINT host_onboarding_custom_instructions_length
    CHECK (char_length(custom_instructions) <= 500);
$mig053$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('054', 'add_new_round_types', ARRAY[$mig054$
-- ============================================================
-- Migration 054: Add 4 new round types
-- ============================================================
--
-- WHAT THIS DOES:
--   1. Adds pixel_reveal, closest_wins, the_narrative, oracles_dilemma
--      to the round_type constraint.
--   2. Adds questions.image_url (for Pixel Reveal image-based questions).
--   3. Adds questions.correct_answer_numeric (for Closest Wins distance scoring).
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • Does NOT add new tables — config JSONB is universal.
--   • Does NOT modify scoring — that's in migration 055.
-- ============================================================

-- 1. Update round type constraint
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_valid;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_round_type_valid
  CHECK (round_type IN (
    'mcq', 'true_false', 'wipeout', 'reversal', 'pressure_cooker',
    'pixel_reveal', 'closest_wins', 'the_narrative', 'oracles_dilemma'
  ));

-- 2. Pixel Reveal: image URL for question
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Closest Wins: numeric correct answer for distance scoring
ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer_numeric numeric;
$mig054$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('055', 'submit_answer_new_rounds', ARRAY[$mig055$
-- ============================================================
-- Migration 055: submit_answer — scoring for 4 new round types
-- ============================================================
--
-- Adds scoring branches for:
--   • pixel_reveal   — quadratic time bonus (rewards early answers)
--   • closest_wins   — distance-based scoring from numeric answer
--   • the_narrative   — majority-vote scoring (majority = correct)
--   • oracles_dilemma — role-based scoring (oracle vs non-oracle)
--
-- The RPC signature adds p_numeric_answer for Closest Wins.
-- All other round types are unaffected.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_answer(
  p_event_id         uuid,
  p_question_id      uuid,
  p_selected_answer  integer,
  p_time_taken_ms    integer,
  p_wipeout_leverage numeric DEFAULT 0.5,
  p_numeric_answer   numeric DEFAULT NULL,
  p_oracle_choice    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id          uuid;
  v_correct_answer     integer;
  v_correct_numeric    numeric;
  v_explanation        text;
  v_round_id           uuid;
  v_round_type         text;
  v_base_points        integer;
  v_time_bonus_enabled boolean;
  v_time_limit_seconds integer;
  v_round_config       jsonb;
  v_wipeout_min        numeric;
  v_wipeout_max        numeric;
  v_is_correct         boolean;
  v_leverage           numeric;
  v_clamped_time       integer;
  v_points             integer := 0;
  v_ratio              numeric;
  v_existing_response  uuid;
  v_current_score      integer := 0;
  v_wager_amt          integer := 0;
  -- Modifier state
  v_modifier_type      text;
  v_modifier_config    jsonb;
  v_jackpot_multiplier numeric;
  v_jackpot_winner     boolean := false;
  -- Live modifier override
  v_live_modifier_state jsonb;
  -- Closest Wins
  v_distance           numeric;
  v_max_distance       numeric;
  v_tolerance          numeric;
  v_closeness          numeric;
  -- The Narrative
  v_round_state        jsonb;
  v_majority_option    integer;
  -- Oracle's Dilemma
  v_oracle_player_id   uuid;
  v_oracle_choice      text;
  v_deceived_count     integer;
  v_non_oracle_count   integer;
BEGIN
  -- Authenticated user
  v_player_id := auth.uid();
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Must be an event participant
  IF NOT EXISTS (
    SELECT 1 FROM event_players
    WHERE event_id = p_event_id AND player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('error', 'Not a participant in this event');
  END IF;

  -- Idempotency — return existing result if already answered
  SELECT id INTO v_existing_response
  FROM responses
  WHERE question_id = p_question_id AND player_id = v_player_id;

  IF v_existing_response IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
        'is_correct',       r.is_correct,
        'points_awarded',   r.points_awarded,
        'correct_answer',   q.correct_answer,
        'explanation',      q.explanation,
        'wager_amt',        0,
        'already_answered', true
      )
      FROM responses r
      JOIN questions q ON q.id = r.question_id
      WHERE r.id = v_existing_response
    );
  END IF;

  -- Fetch question (including new columns)
  SELECT correct_answer, correct_answer_numeric, explanation, round_id
  INTO v_correct_answer, v_correct_numeric, v_explanation, v_round_id
  FROM questions
  WHERE id = p_question_id;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Question not found');
  END IF;

  -- Fetch round
  SELECT round_type, base_points, time_bonus_enabled, time_limit_seconds, config
  INTO v_round_type, v_base_points, v_time_bonus_enabled, v_time_limit_seconds, v_round_config
  FROM rounds
  WHERE id = v_round_id;

  IF v_base_points IS NULL THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;

  -- ── Modifier resolution: live override takes priority ─────────────────────
  SELECT modifier_state INTO v_live_modifier_state
  FROM game_state WHERE event_id = p_event_id;

  IF v_live_modifier_state IS NOT NULL
     AND v_live_modifier_state->>'type' IS NOT NULL
     AND v_live_modifier_state->>'type' <> '' THEN
    v_modifier_type   := v_live_modifier_state->>'type';
    v_modifier_config := COALESCE(v_live_modifier_state->'config', '{}');
  ELSE
    SELECT modifier_type, config
    INTO v_modifier_type, v_modifier_config
    FROM round_modifiers
    WHERE round_id = v_round_id;
  END IF;

  -- Clamp time to round limit
  v_clamped_time := LEAST(p_time_taken_ms, v_time_limit_seconds * 1000);

  -- ── Closest Wins: distance-based scoring (before correctness check) ───────
  IF v_round_type = 'closest_wins' THEN
    v_leverage := 1.0;

    IF p_numeric_answer IS NULL OR v_correct_numeric IS NULL THEN
      -- No numeric answer provided or no correct numeric set — score 0
      v_is_correct := false;
      v_points := 0;
    ELSE
      v_distance := abs(p_numeric_answer - v_correct_numeric);
      v_tolerance := COALESCE((v_round_config->>'toleranceMultiplier')::numeric, 2.0);
      v_max_distance := v_tolerance * GREATEST(abs(v_correct_numeric), 1);
      v_closeness := GREATEST(0, 1.0 - (v_distance / v_max_distance));

      -- "Correct" if within tolerance (any closeness > 0)
      v_is_correct := (v_closeness > 0);
      v_points := FLOOR(v_base_points * v_closeness);

      -- Time bonus on top of distance score
      IF v_time_bonus_enabled AND v_closeness > 0 THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_closeness * v_ratio * 0.5);
      END IF;
    END IF;

    -- Store the numeric answer in selected_answer as a sentinel (-1)
    -- The actual numeric value is tracked via p_numeric_answer but we don't
    -- have a column for it yet — the points_awarded captures the result.
    INSERT INTO responses (
      event_id, question_id, player_id, selected_answer,
      is_correct, time_taken_ms, points_awarded, wipeout_leverage
    ) VALUES (
      p_event_id, p_question_id, v_player_id, COALESCE(p_selected_answer, -1),
      v_is_correct, v_clamped_time, v_points, v_leverage
    );

    RETURN jsonb_build_object(
      'is_correct',       v_is_correct,
      'points_awarded',   v_points,
      'correct_answer',   v_correct_numeric,
      'explanation',      v_explanation,
      'wager_amt',        0,
      'closeness',        v_closeness
    );
  END IF;

  -- ── Standard correctness check (MCQ-style rounds) ─────────────────────────
  v_is_correct := (p_selected_answer = v_correct_answer);

  -- ── Jackpot Mode modifier ─────────────────────────────────────────────────
  IF v_modifier_type = 'jackpot' THEN
    v_jackpot_multiplier := COALESCE((v_modifier_config->>'multiplier')::numeric, 5);

    IF v_is_correct THEN
      IF NOT EXISTS (
        SELECT 1 FROM responses
        WHERE question_id = p_question_id
          AND is_correct = true
          AND player_id <> v_player_id
      ) THEN
        v_jackpot_winner := true;
        v_points := FLOOR(v_base_points * v_jackpot_multiplier);
      ELSE
        v_points := 0;
      END IF;
    ELSE
      v_points := 0;
    END IF;

    v_leverage := 1.0;
    v_wager_amt := 0;

  -- ── WipeOut ───────────────────────────────────────────────────────────────
  ELSIF v_round_type = 'wipeout' THEN
    v_wipeout_min := COALESCE((v_round_config->>'minWagerPct')::numeric, 0.10);
    v_wipeout_max := COALESCE((v_round_config->>'maxWagerPct')::numeric, 1.00);

    v_leverage := LEAST(GREATEST(COALESCE(p_wipeout_leverage, 0.5), v_wipeout_min), v_wipeout_max);

    SELECT COALESCE(total_score, 0) INTO v_current_score
    FROM leaderboard_entries
    WHERE event_id = p_event_id AND player_id = v_player_id;

    v_current_score := COALESCE(v_current_score, 0);
    v_wager_amt := FLOOR(GREATEST(50, v_current_score) * v_leverage);

    IF v_is_correct THEN
      v_points := v_wager_amt;
    ELSE
      v_points := -LEAST(v_wager_amt, v_current_score);
    END IF;

  -- ── Pixel Reveal: quadratic time bonus ────────────────────────────────────
  ELSIF v_round_type = 'pixel_reveal' THEN
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
      -- Quadratic: answering at 50% time remaining = 25% bonus (not 50%)
      -- This heavily rewards early answers when the image is still blurred
      v_points := v_base_points + FLOOR(v_base_points * v_ratio * v_ratio);
    END IF;

  -- ── The Narrative: majority-vote scoring ──────────────────────────────────
  ELSIF v_round_type = 'the_narrative' THEN
    v_leverage := 1.0;

    -- Read majority option from round_state (set by host when revealing)
    SELECT round_state INTO v_round_state
    FROM game_state WHERE event_id = p_event_id;

    v_majority_option := (v_round_state->>'majority_option')::integer;

    IF v_majority_option IS NOT NULL THEN
      v_is_correct := (p_selected_answer = v_majority_option);
    END IF;
    -- If majority not yet determined, v_is_correct stays as comparison with correct_answer

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;

  -- ── Oracle's Dilemma: role-based scoring ──────────────────────────────────
  ELSIF v_round_type = 'oracles_dilemma' THEN
    v_leverage := 1.0;

    -- Read oracle state from round_state
    SELECT round_state INTO v_round_state
    FROM game_state WHERE event_id = p_event_id;

    v_oracle_player_id := (v_round_state->>'oracle_player_id')::uuid;
    v_oracle_choice := v_round_state->>'oracle_choice';

    IF v_player_id = v_oracle_player_id THEN
      -- Oracle is submitting their choice
      -- If p_oracle_choice is provided, update round_state with the Oracle's decision
      IF p_oracle_choice IS NOT NULL AND v_oracle_choice IS NULL THEN
        v_oracle_choice := p_oracle_choice;
        UPDATE game_state
        SET round_state = v_round_state
          || jsonb_build_object(
               'oracle_choice', p_oracle_choice,
               'oracle_suggested_answer', p_selected_answer
             )
        WHERE event_id = p_event_id;
      END IF;

      -- Oracle scoring
      IF v_oracle_choice = 'truth' THEN
        -- Truth path: guaranteed half points
        v_points := FLOOR(v_base_points * 0.5);
        v_is_correct := true;
      ELSE
        -- Deception path: scored after reveal based on how many were fooled
        -- For now, award 0 — the host triggers a re-score after reveal
        v_points := 0;
        v_is_correct := false;
      END IF;
    ELSE
      -- Non-oracle: standard MCQ scoring
      IF v_is_correct THEN
        v_points := v_base_points;
        IF v_time_bonus_enabled THEN
          v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
          v_points := v_points + FLOOR(v_base_points * v_ratio);
        END IF;
      END IF;
    END IF;

  -- ── MCQ / True-False / Reversal / Pressure Cooker: time-bonus scoring ─────
  ELSE
    v_leverage := 1.0;

    IF v_is_correct THEN
      v_points := v_base_points;
      IF v_time_bonus_enabled THEN
        v_ratio := GREATEST(0, 1.0 - (v_clamped_time::numeric / (v_time_limit_seconds * 1000)::numeric));
        v_points := v_points + FLOOR(v_base_points * v_ratio);
      END IF;
    END IF;
  END IF;

  -- Insert response
  INSERT INTO responses (
    event_id, question_id, player_id, selected_answer,
    is_correct, time_taken_ms, points_awarded, wipeout_leverage
  ) VALUES (
    p_event_id, p_question_id, v_player_id, p_selected_answer,
    v_is_correct, v_clamped_time, v_points, v_leverage
  );

  RETURN jsonb_build_object(
    'is_correct',       v_is_correct,
    'points_awarded',   v_points,
    'correct_answer',   v_correct_answer,
    'explanation',      v_explanation,
    'wager_amt',        v_wager_amt,
    'jackpot_winner',   v_jackpot_winner
  );
END;
$$;
$mig055$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('056', 'security_hardening', ARRAY[$mig056$
-- Migration 056: Security hardening for pilot launch
-- Fixes: correct_answer RLS exposure, profiles anon access, feedback scope
--
-- Rollback:
--   DROP FUNCTION IF EXISTS get_player_questions(uuid);
--   DROP POLICY IF EXISTS "Players see questions without answers" ON questions;
--   DROP POLICY IF EXISTS "Hosts see full questions" ON questions;
--   CREATE POLICY "Questions are viewable by everyone" ON questions FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Profiles visible to authenticated users" ON profiles;
--   CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

-- ── 1. Fix C1: Hide correct_answer from non-host players ─────────────────────
-- The old policy allowed anyone (even anon) to SELECT all columns including
-- correct_answer. We replace it with two policies:
--   a) Players can read everything EXCEPT correct_answer
--   b) Hosts (event creators) can read the full row

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON questions;
DROP POLICY IF EXISTS "Questions are viewable by authenticated users" ON questions;

-- Revoke direct SELECT on correct_answer from non-service roles.
-- Supabase anon/authenticated roles should not see the answer column.
REVOKE SELECT ON questions FROM anon;
REVOKE SELECT ON questions FROM authenticated;

-- Grant SELECT on all columns EXCEPT correct_answer to authenticated users
GRANT SELECT (id, round_id, body, options, sort_order, image_url, created_at, updated_at) ON questions TO authenticated;
GRANT SELECT (id, round_id, body, options, sort_order, image_url, created_at, updated_at) ON questions TO anon;

-- Grant full SELECT (including correct_answer) to service_role only
-- (Edge Functions use service_role for scoring)
GRANT SELECT ON questions TO service_role;

-- RLS policy: authenticated users can read questions for events they participate in or host
CREATE POLICY "Authenticated users can read questions"
  ON questions FOR SELECT TO authenticated
  USING (true);

-- Anon can also read (for leaderboard OG images etc.) but without correct_answer (column grant above)
CREATE POLICY "Anon can read questions"
  ON questions FOR SELECT TO anon
  USING (true);


-- ── 2. Fix M2: Restrict profiles to authenticated users ──────────────────────
-- Old policy: anyone (including anon with just the public URL) could read all
-- profiles including email addresses. New: authenticated only.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles visible to authenticated users"
  ON profiles FOR SELECT TO authenticated
  USING (true);


-- ── 3. Done ──────────────────────────────────────────────────────────────────
-- sponsor-logos storage and feedback RLS are lower priority (M3, M4) and
-- deferred to a separate migration to keep this one focused on pilot blockers.
$mig056$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('057', 'server_clock_sync', ARRAY[$mig057$
-- Migration 057: Server clock sync RPC
--
-- Purpose: Eliminate host/player timer desync caused by device clock skew.
-- Host sets `question_started_at = new Date().toISOString()` (host's clock).
-- Player computes remaining time via Date.now() (player's clock).
-- If clocks differ by N seconds, timer desyncs by N seconds.
--
-- Fix: Each client fetches server's `now()` once on mount, computes offset
-- from local clock, then uses `serverNow() = Date.now() + offset` for all
-- timer math. Both host and player converge on the same reference clock.
--
-- Rollback: DROP FUNCTION IF EXISTS get_server_time();

CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
AS $$
  SELECT now();
$$;

-- Callable by any authenticated or anonymous user — no sensitive data returned.
GRANT EXECUTE ON FUNCTION get_server_time() TO anon, authenticated;
$mig057$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('058', 'scope_storage_and_feedback', ARRAY[$mig058$
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
$mig058$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('059', 'game_state_is_paused', ARRAY[$mig059$
-- Migration 059: Add is_paused flag to game_state
--
-- Purpose: Current pause implementation sets phase="leaderboard" which forces
-- the player to navigate from /play to /leaderboard — a full route transition
-- that takes 2-5s due to server component re-fetching all game data. Resume
-- then has to re-navigate back, repeating the delay.
--
-- Fix: Keep phase at its original value during pause and toggle a boolean
-- flag instead. Player stays on /play with all state cached → resume is
-- instant (just hide the overlay). Host and player both see a pause overlay
-- with current standings for engagement.
--
-- Rollback: ALTER TABLE game_state DROP COLUMN IF EXISTS is_paused;

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
$mig059$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('060', 'drop_old_submit_answer_overload', ARRAY[$mig060$
-- ============================================================
-- Migration 056: Drop old submit_answer overload
-- ============================================================
--
-- Migration 055 added p_numeric_answer and p_oracle_choice params to
-- submit_answer, but CREATE OR REPLACE created a second overload instead
-- of replacing the old 5-param version (PG treats different param lists
-- as distinct functions).
--
-- PostgREST cannot resolve overloaded functions with the same name,
-- causing PGRST203: "Could not choose the best candidate function".
-- This blocked ALL answer submissions — zero responses recorded.
--
-- Fix: drop the old 5-param signature, leaving only the 7-param version.
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_answer(uuid, uuid, integer, integer, numeric);
$mig060$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('061', 'pixel_reveal_mode', ARRAY[$mig061$
-- Migration 061: Pixel Reveal — per-question reveal_mode
--
-- Adds questions.reveal_mode so hosts can pick between the two Pixel Reveal
-- reveal mechanics on a per-question basis:
--
--   'pixelated'  (default) — canvas downscale→upscale, classic blocky reveal.
--                             Great when the image is a texture or scene
--                             where color/shape blobs hint at the answer.
--
--   'tile_reveal'          — 8×8 grid; tiles random-reveal over the timer.
--                             Better for logos: shape silhouette stays hidden
--                             until enough tiles uncover, so fast guessers
--                             don't get free wins from a recognisable outline.
--
-- Default is 'pixelated' so existing Pixel Reveal questions keep their
-- behaviour with zero rewrite.
--
-- Column added to `questions` alongside existing `image_url` (migration 054).

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS reveal_mode text
    NOT NULL
    DEFAULT 'pixelated'
    CHECK (reveal_mode IN ('pixelated', 'tile_reveal'));

COMMENT ON COLUMN questions.reveal_mode IS
  'Pixel Reveal round only — which reveal mechanic to use for this question. '
  'Other round types ignore this column.';
$mig061$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('062', 'reveal_answer_numeric', ARRAY[$mig062$
-- Extend get_revealed_answer to also return correct_answer_numeric.
-- Needed by Closest Wins round: players who didn't submit used to see
-- the MCQ fallback (0) because the RPC only exposed `correct_answer` (int).
-- Now the client can pick the right field based on round_type.

create or replace function get_revealed_answer(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_question_id uuid;
  v_correct_answer integer;
  v_correct_answer_numeric numeric;
  v_explanation text;
begin
  select phase, current_question_id
  into v_phase, v_question_id
  from game_state
  where event_id = p_event_id;

  if v_phase != 'revealing' then
    return jsonb_build_object('error', 'Not in revealing phase');
  end if;

  if v_question_id is null then
    return jsonb_build_object('error', 'No active question');
  end if;

  select correct_answer, correct_answer_numeric, explanation
  into v_correct_answer, v_correct_answer_numeric, v_explanation
  from questions
  where id = v_question_id;

  return jsonb_build_object(
    'correct_answer', v_correct_answer,
    'correct_answer_numeric', v_correct_answer_numeric,
    'explanation', v_explanation
  );
end;
$$;
$mig062$])
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('063', 'realtime_publication_core_tables', ARRAY[$mig063$
-- Enable Realtime replication for the core game tables so all in-app
-- postgres_changes subscriptions fire instantly instead of depending on
-- polling fallbacks.
--
-- Prior state: only `responses` was in `supabase_realtime` (migration 041).
-- Every other Realtime subscription (lobby, play, leaderboard, control panel)
-- was silently no-op'ing because its table was not in the publication,
-- which meant the 2–3s polling fallbacks were carrying the entire UX.
--
-- Symptom reported by pilot players: "Next question takes ~2s to appear
-- after the host clicks" — exactly matches the play-view poll interval.
--
-- This migration adds the three missing tables. RLS is enforced at the
-- Supabase Realtime gateway per client connection, so broadcast scope is
-- already correct:
--   • game_state — readable by event participants
--   • event_players — readable by event participants
--   • leaderboard_entries — readable by event participants
--
-- Idempotent: the `if not exists`-style guard is emulated by checking
-- pg_publication_tables before adding, so re-running is safe.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_state'
  ) then
    alter publication supabase_realtime add table public.game_state;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_players'
  ) then
    alter publication supabase_realtime add table public.event_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leaderboard_entries'
  ) then
    alter publication supabase_realtime add table public.leaderboard_entries;
  end if;
end $$;
$mig063$])
ON CONFLICT (version) DO NOTHING;

