import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { FinalView } from "./_components/final-view";
import { resolvePlayerName } from "@/lib/player-name";
import { computeSpotlightStats, type SpotlightCard } from "@/lib/game/spotlight-stats";

export default async function FinalPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/join/${code}`);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, twitter_handle, hashtags, logo_url")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) redirect("/join");

  // If game is still running, route to the correct phase
  if (event.status !== "ended") redirect(`/game/${code}`);

  const [{ data: entries }, { count: totalPlayers }, { data: sponsors }, { data: allPlayers }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms, rank, is_top_10_pct, profiles!leaderboard_entries_player_id_fkey ( username, display_name )`)
      .eq("event_id", event.id)
      .order("total_score", { ascending: false })
      .limit(20),
    supabase.from("event_players").select("*", { count: "exact", head: true }).eq("event_id", event.id),
    supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
    supabase
      .from("event_players")
      .select(`player_id, game_alias, profiles ( username, display_name )`)
      .eq("event_id", event.id),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leaderboard = (entries ?? []).map((row: any) => ({
    player_id: row.player_id,
    display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
    total_score: row.total_score,
    correct_count: row.correct_count ?? 0,
    total_questions: row.total_questions ?? 0,
    accuracy: row.accuracy ?? 0,
    avg_speed_ms: row.avg_speed_ms ?? 0,
    rank: row.rank,
    is_top_10_pct: row.is_top_10_pct ?? false,
  }));

  // Append players with 0 score who have no leaderboard_entries row
  const scoredIds = new Set(leaderboard.map((e) => e.player_id));
  const maxRank = leaderboard.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zeroPlayers = (allPlayers ?? []).filter((p: any) => !scoredIds.has(p.player_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaderboard = leaderboard.concat(zeroPlayers.map((p: any, i: number) => ({
    player_id: p.player_id,
    display_name: resolvePlayerName(p.game_alias, p.profiles?.username, p.profiles?.display_name),
    total_score: 0,
    correct_count: 0,
    total_questions: 0,
    accuracy: 0,
    avg_speed_ms: 0,
    rank: maxRank + i + 1,
    is_top_10_pct: false,
  })));

  const myEntry = leaderboard.find((e) => e.player_id === user.id) ?? null;

  // Compute Phase 1 spotlight stats (needs responses access — granted by policy 065)
  // minPlayers=2 so small games and testing still show spotlights
  let spotlights: SpotlightCard[] = [];
  try {
    spotlights = await computeSpotlightStats(
      supabase,
      event.id,
      leaderboard.filter((e) => e.total_questions > 0), // only pass players who answered
      2,  // minPlayers
      3   // minQuestions
    );
  } catch {
    // Non-fatal — show page without spotlights if responses aren't accessible yet
  }

  return (
    <FinalView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        twitter_handle: event.twitter_handle ?? null,
        hashtags: event.hashtags ?? null,
        logoUrl: event.logo_url ?? null,
      }}
      player={{ id: user.id }}
      leaderboard={leaderboard}
      myEntry={myEntry}
      totalPlayers={totalPlayers ?? leaderboard.length}
      sponsors={sponsors ?? []}
      spotlights={spotlights}
    />
  );
}
