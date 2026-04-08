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
