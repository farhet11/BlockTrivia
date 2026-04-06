-- Migration 033: Extended leaderboard stats
--
-- Adds computed performance stats to leaderboard_entries:
--   - fastest_answer_ms    — quickest response time across all answers
--   - slowest_answer_ms    — longest response time across all answers
--   - answer_speed_stddev  — standard deviation of response times (consistency metric)
--
-- These are computed by the scoring trigger when leaderboard entry is created.

alter table leaderboard_entries
add column if not exists fastest_answer_ms integer,
add column if not exists slowest_answer_ms integer,
add column if not exists answer_speed_stddev numeric;

comment on column leaderboard_entries.fastest_answer_ms is 'Minimum response time (ms) across all player answers in the game';
comment on column leaderboard_entries.slowest_answer_ms is 'Maximum response time (ms) across all player answers in the game';
comment on column leaderboard_entries.answer_speed_stddev is 'Standard deviation of response times — measure of consistency (lower = more consistent)';
