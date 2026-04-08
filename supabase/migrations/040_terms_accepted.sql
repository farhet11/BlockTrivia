-- Record when a user first accepted the Terms of Service and Privacy Policy.
-- NULL means the user signed up before this column was added (pre-consent era)
-- or has not yet accepted on a new device flow.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_at is
  'Timestamp when the user checked the ToS + Privacy Policy checkbox. NULL for pre-consent accounts.';
