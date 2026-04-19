-- 076: Allow anon role to call get_event_spotlights
--
-- The public /results/[code] share page renders spotlight cards. Without this,
-- unauthenticated visitors (the majority of share-link traffic from Twitter /
-- Telegram) get an empty response.
--
-- Safety: the RPC returns only aggregate stats (emoji, title, stat_value,
-- player_id, username) — the same shape of public data already exposed by the
-- public leaderboard on /results/[code]. No raw responses are leaked.

grant execute on function get_event_spotlights(uuid) to anon;
