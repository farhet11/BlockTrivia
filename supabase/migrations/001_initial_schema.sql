-- ============================================================
-- BlockTrivia MVP Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type user_role as enum ('super_admin', 'host', 'player');
create type event_status as enum ('draft', 'lobby', 'active', 'paused', 'ended');
create type round_type as enum ('mcq', 'true_false', 'wipeout');
create type game_phase as enum ('lobby', 'playing', 'revealing', 'leaderboard', 'ended');

-- ============================================================
-- 1. PROFILES
-- Extends Supabase auth.users with app-specific data.
-- Created automatically via trigger on signup.
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role user_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. EVENTS
-- A trivia event created by an admin/host.
-- ============================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  scheduled_at timestamptz,
  status event_status not null default 'draft',
  join_code char(5) not null unique,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast join code lookups
create unique index idx_events_join_code on events(join_code);

-- ============================================================
-- 3. EVENT_HOSTS
-- Delegation table: who can host a specific event.
-- Schema only for MVP — no UI, assign via Supabase dashboard.
-- ============================================================

create table event_hosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid not null references profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique(event_id, user_id)
);

-- ============================================================
-- 4. ROUNDS
-- Rounds within an event. Each round has a type and config.
-- ============================================================

create table rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  round_type round_type not null default 'mcq',
  title text,
  sort_order integer not null default 0,
  time_limit_seconds integer not null default 15,
  base_points integer not null default 100,
  time_bonus_enabled boolean not null default true,
  -- WipeOut-specific: min/max leverage multiplier
  wipeout_min_leverage numeric(3,1) default 1.0,
  wipeout_max_leverage numeric(3,1) default 3.0,
  created_at timestamptz not null default now()
);

create index idx_rounds_event on rounds(event_id, sort_order);

-- ============================================================
-- 5. QUESTIONS
-- Questions within a round.
-- options is a JSONB array: ["Option A", "Option B", "Option C", "Option D"]
-- correct_answer is the index (0-based) into the options array.
-- ============================================================

create table questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  body text not null,
  options jsonb not null,  -- ["A", "B", "C", "D"]
  correct_answer integer not null,  -- 0-based index
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_questions_round on questions(round_id, sort_order);

-- ============================================================
-- 6. GAME_STATE
-- Live game state for an event. One row per event.
-- Updated by host actions, broadcast via Supabase Realtime.
-- ============================================================

create table game_state (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade unique,
  phase game_phase not null default 'lobby',
  current_round_id uuid references rounds(id),
  current_question_id uuid references questions(id),
  question_started_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index idx_game_state_event on game_state(event_id);

-- ============================================================
-- 7. EVENT_PLAYERS
-- Tracks who joined an event (lobby registration).
-- ============================================================

create table event_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(event_id, player_id)
);

create index idx_event_players_event on event_players(event_id);

-- ============================================================
-- 8. RESPONSES
-- Player answers. One per player per question.
-- Server-authoritative: points_awarded calculated by Edge Function.
-- ============================================================

create table responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  selected_answer integer not null,  -- 0-based index
  is_correct boolean not null,
  time_taken_ms integer not null,
  points_awarded integer not null default 0,
  -- WipeOut leverage if applicable
  wipeout_leverage numeric(3,1) default 1.0,
  submitted_at timestamptz not null default now(),
  unique(question_id, player_id)  -- one answer per question per player
);

create index idx_responses_event_player on responses(event_id, player_id);
create index idx_responses_question on responses(question_id);

-- ============================================================
-- 9. LEADERBOARD_ENTRIES
-- Aggregated scores per player per event.
-- Updated after each question (by Edge Function).
-- ============================================================

create table leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  total_score integer not null default 0,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  accuracy numeric(5,2) not null default 0.00,  -- percentage
  avg_speed_ms integer not null default 0,
  rank integer,
  is_top_10_pct boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(event_id, player_id)
);

create index idx_leaderboard_event_score on leaderboard_entries(event_id, total_score desc);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-update updated_at timestamps
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

create trigger events_updated_at before update on events
  for each row execute function update_updated_at();

create trigger game_state_updated_at before update on game_state
  for each row execute function update_updated_at();

create trigger leaderboard_entries_updated_at before update on leaderboard_entries
  for each row execute function update_updated_at();

-- Generate unique 5-char join code for events
create or replace function generate_join_code()
returns trigger
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I to avoid confusion
  code text;
  exists_already boolean;
begin
  if new.join_code is null or new.join_code = '' then
    loop
      code := '';
      for i in 1..5 loop
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      end loop;
      select exists(select 1 from events where join_code = code) into exists_already;
      exit when not exists_already;
    end loop;
    new.join_code := code;
  end if;
  return new;
end;
$$;

create trigger events_generate_join_code
  before insert on events
  for each row execute function generate_join_code();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles enable row level security;
alter table events enable row level security;
alter table event_hosts enable row level security;
alter table rounds enable row level security;
alter table questions enable row level security;
alter table game_state enable row level security;
alter table event_players enable row level security;
alter table responses enable row level security;
alter table leaderboard_entries enable row level security;

-- PROFILES: users can read any profile, update only their own
create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- EVENTS: anyone authed can read, only creator/admin can insert/update
create policy "Events are viewable by authenticated users"
  on events for select to authenticated using (true);

create policy "Admins and hosts can create events"
  on events for insert to authenticated
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('super_admin', 'host'))
  );

create policy "Event creator can update their events"
  on events for update to authenticated
  using (created_by = auth.uid());

-- EVENT_HOSTS: viewable by event participants, managed by admin
create policy "Event hosts are viewable by authenticated users"
  on event_hosts for select to authenticated using (true);

create policy "Admins can manage event hosts"
  on event_hosts for all to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
  );

-- ROUNDS: readable by anyone authed, writable by event creator
create policy "Rounds are viewable by authenticated users"
  on rounds for select to authenticated using (true);

create policy "Event creator can manage rounds"
  on rounds for all to authenticated
  using (
    exists (select 1 from events where events.id = rounds.event_id and events.created_by = auth.uid())
  );

-- QUESTIONS: readable during game (we'll tighten this later), writable by event creator
-- NOTE: In MVP, questions are visible to players during game.
-- The correct_answer is NOT hidden here — Edge Function handles scoring server-side.
-- For v1.1, consider a view that strips correct_answer for player-facing queries.
create policy "Questions are viewable by authenticated users"
  on questions for select to authenticated using (true);

create policy "Event creator can manage questions"
  on questions for all to authenticated
  using (
    exists (
      select 1 from rounds
      join events on events.id = rounds.event_id
      where rounds.id = questions.round_id and events.created_by = auth.uid()
    )
  );

-- GAME_STATE: readable by anyone (players need this), writable by event creator/host
create policy "Game state is viewable by authenticated users"
  on game_state for select to authenticated using (true);

create policy "Event creator can manage game state"
  on game_state for all to authenticated
  using (
    exists (select 1 from events where events.id = game_state.event_id and events.created_by = auth.uid())
  );

-- EVENT_PLAYERS: readable by anyone authed, players can join
create policy "Event players are viewable by authenticated users"
  on event_players for select to authenticated using (true);

create policy "Players can join events"
  on event_players for insert to authenticated
  with check (player_id = auth.uid());

-- RESPONSES: players can insert their own, readable by event creator
create policy "Players can submit responses"
  on responses for insert to authenticated
  with check (player_id = auth.uid());

create policy "Event creator can view responses"
  on responses for select to authenticated
  using (
    player_id = auth.uid()
    or exists (select 1 from events where events.id = responses.event_id and events.created_by = auth.uid())
  );

-- LEADERBOARD: readable by anyone authed (it's the whole point)
create policy "Leaderboard is viewable by authenticated users"
  on leaderboard_entries for select to authenticated using (true);

-- Leaderboard is written by Edge Functions (service role), not by players directly
-- No insert/update policy for authenticated users — only service_role can write

-- ============================================================
-- DONE. Schema ready for BlockTrivia MVP.
-- ============================================================
