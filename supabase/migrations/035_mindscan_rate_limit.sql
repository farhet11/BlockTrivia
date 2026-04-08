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
