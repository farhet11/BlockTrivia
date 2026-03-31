-- ============================================================
-- 1. EVENT SPONSORS (up to 4 per event)
-- ============================================================

create table event_sponsors (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text,
  logo_url    text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_event_sponsors_event on event_sponsors(event_id);

alter table event_sponsors enable row level security;

create policy "Hosts can manage their event sponsors"
  on event_sponsors for all to authenticated
  using (
    exists (
      select 1 from events
      where events.id = event_sponsors.event_id
        and events.created_by = auth.uid()
    )
  );

create policy "Authenticated users can view sponsors"
  on event_sponsors for select to authenticated
  using (true);

-- ============================================================
-- 2. ROUND INTERSTITIAL TEXT
-- ============================================================

alter table rounds add column if not exists interstitial_text text;

-- ============================================================
-- 3. INTERSTITIAL GAME PHASE
-- ============================================================

alter type game_phase add value if not exists 'interstitial';

-- ============================================================
-- 4. FEEDBACK TABLE
-- ============================================================

create type feedback_category as enum ('bug', 'feature', 'general', 'question');

create table feedback (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid references profiles(id) on delete set null,
  feedback_category   feedback_category not null default 'general',
  message             text not null,
  page_url            text,
  screenshot_url      text,
  created_at          timestamptz not null default now()
);

alter table feedback enable row level security;

create policy "Anyone authenticated can submit feedback"
  on feedback for insert to authenticated
  with check (true);

create policy "Anyone can submit feedback anonymously"
  on feedback for insert to anon
  with check (true);

create policy "Hosts can view all feedback"
  on feedback for select to authenticated
  using (
    exists (
      select 1 from events where events.created_by = auth.uid()
    )
  );

-- ============================================================
-- STORAGE POLICIES (run after creating the sponsor-logos bucket)
-- These assume the bucket 'sponsor-logos' already exists.
-- ============================================================

-- Allow authenticated users to upload sponsor logos
insert into storage.buckets (id, name, public)
values ('sponsor-logos', 'sponsor-logos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload sponsor logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos');

create policy "Anyone can view sponsor logos"
  on storage.objects for select
  using (bucket_id = 'sponsor-logos');

create policy "Hosts can delete their sponsor logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos');

-- ============================================================
-- FEEDBACK SCREENSHOTS BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', true)
on conflict (id) do nothing;

create policy "Anyone can upload feedback screenshots"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-screenshots');

create policy "Anyone can view feedback screenshots"
  on storage.objects for select
  using (bucket_id = 'feedback-screenshots');
