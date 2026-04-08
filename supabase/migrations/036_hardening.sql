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
