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
