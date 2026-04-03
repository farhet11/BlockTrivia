-- Add event_format enum and column to events
-- Hosts choose IRL / Virtual / Hybrid when creating an event.
-- This drives context-aware UX (e.g. liveness check copy) and leaderboard flags.

create type event_format as enum ('irl', 'virtual', 'hybrid');

alter table events
  add column format event_format not null default 'hybrid';

comment on column events.format is 'Physical presence type: irl | virtual | hybrid';
