import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePlayerName } from "@/lib/player-name";
import { SummaryView } from "./_components/summary-view";
import { computeSpotlightStats, type SpotlightCard } from "@/lib/game/spotlight-stats";

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, created_by, twitter_handle, hashtags, description, prizes, organizer_name, created_at")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event || event.created_by !== user.id) redirect("/host");

  // Ensure ranks are authoritative before reading (fixes stale rank from trigger approximation)
  await supabase.rpc("recompute_leaderboard_ranks", { p_event_id: event.id });

  // Load leaderboard + all players (to include 0-score participants)
  // eslint-disable-next-line prefer-const -- entries is reassigned in the fallback path below
  let { data: entries, error: lbError } = await supabase
    .from("leaderboard_entries")
    .select(`
      player_id,
      total_score,
      correct_count,
      total_questions,
      accuracy,
      avg_speed_ms,
      rank,
      is_top_10_pct,
      is_suspicious,
      profiles!leaderboard_entries_player_id_fkey ( display_name, username, full_name, email )
    `)
    .eq("event_id", event.id)
    .order("rank", { ascending: true });

  // Fallback: if join fails (FK name mismatch), load without profiles
  if (lbError) {
    const fallback = await supabase
      .from("leaderboard_entries")
      .select("player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms, rank, is_top_10_pct, is_suspicious")
      .eq("event_id", event.id)
      .order("rank", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries = (fallback.data ?? []).map((r: any) => ({ ...r, profiles: null })) as typeof entries;
  }

  // All joined players (for merging 0-score participants)
  const { data: allPlayers } = await supabase
    .from("event_players")
    .select(`player_id, game_alias, profiles ( display_name, username, full_name, email )`)
    .eq("event_id", event.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leaderboard = (entries ?? []).map((row: any) => ({
    player_id: row.player_id,
    display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
    username: row.profiles?.username ?? "",
    full_name: row.profiles?.full_name ?? "",
    email: row.profiles?.email ?? "",
    total_score: row.total_score,
    correct_count: row.correct_count ?? 0,
    total_questions: row.total_questions ?? 0,
    accuracy: row.accuracy ?? 0,
    avg_speed_ms: row.avg_speed_ms ?? 0,
    rank: row.rank,
    is_top_10_pct: row.is_top_10_pct ?? false,
    is_suspicious: row.is_suspicious ?? false,
  }));

  // Append any players with no leaderboard_entries row (scored 0 / never answered)
  const scoredIds = new Set(leaderboard.map((e) => e.player_id));
  const maxRank = leaderboard.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zeroPlayers = (allPlayers ?? []).filter((p: any) => !scoredIds.has(p.player_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaderboard = leaderboard.concat(zeroPlayers.map((p: any, i: number) => ({
    player_id: p.player_id,
    display_name: resolvePlayerName(p.game_alias, p.profiles?.username, p.profiles?.display_name),
    username: p.profiles?.username ?? "",
    full_name: p.profiles?.full_name ?? "",
    email: p.profiles?.email ?? "",
    total_score: 0,
    correct_count: 0,
    total_questions: 0,
    accuracy: 0,
    avg_speed_ms: 0,
    rank: maxRank + i + 1,
    is_top_10_pct: false,
    is_suspicious: false,
  })));

  // Compute Phase 1 spotlight stats — minPlayers=2 so small games show spotlights
  let spotlights: SpotlightCard[] = [];
  try {
    spotlights = await computeSpotlightStats(
      supabase,
      event.id,
      leaderboard.filter((e) => e.total_questions > 0), // only players who answered
      2,  // minPlayers
      3   // minQuestions
    );
  } catch {
    // Non-fatal — show page without spotlights on error
  }

  // Total player count, host profile, and sponsors in parallel
  const [{ count: playerCount }, { data: profile }, { data: sponsors }] = await Promise.all([
    supabase.from("event_players").select("*", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("profiles").select("display_name, avatar_url, email").eq("id", user.id).single(),
    supabase.from("event_sponsors").select("id, name, logo_url, sort_order").eq("event_id", event.id).order("sort_order"),
  ]);

  return (
    <SummaryView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
        twitter_handle: event.twitter_handle ?? null,
        hashtags: event.hashtags ?? null,
        description: event.description ?? null,
        prizes: event.prizes ?? null,
        organizer_name: event.organizer_name ?? null,
        created_at: event.created_at ?? null,
      }}
      leaderboard={leaderboard}
      playerCount={playerCount ?? 0}
      spotlights={spotlights}
      hostUser={{
        id: user.id,
        displayName: profile?.display_name ?? "Host",
        email: profile?.email ?? user.email ?? "",
        avatarUrl: profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | null) ?? null,
      }}
      sponsors={sponsors ?? []}
    />
  );
}
