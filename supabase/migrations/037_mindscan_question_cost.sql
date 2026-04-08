-- Track the number of questions generated per `generate` call so rate
-- limiting can cap hosts on total questions/day rather than total calls/day.
-- Other endpoints leave this column null and keep using call-count limits.
alter table public.mindscan_call_log
  add column if not exists questions_count int;

comment on column public.mindscan_call_log.questions_count is
  'For generate endpoint: number of questions the host requested in that call. NULL for other endpoints.';
