import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { FinalView } from "./_components/final-view";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const [{ data: entries }, { count: totalPlayers }, { data: sponsors }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms, rank, is_top_10_pct, profiles!leaderboard_entries_player_id_fkey ( display_name )`)
      .eq("event_id", event.id)
      .order("total_score", { ascending: false })
      .limit(20),
    supabase.from("leaderboard_entries").select("*", { count: "exact", head: true }).eq("event_id", event.id),
    supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
  ]);

  const leaderboard = (entries ?? []).map((row) => ({
    player_id: row.player_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    display_name: (row.profiles as any)?.display_name ?? "Player",
    total_score: row.total_score,
    correct_count: row.correct_count,
    total_questions: row.total_questions,
    accuracy: row.accuracy,
    avg_speed_ms: row.avg_speed_ms,
    rank: row.rank,
    is_top_10_pct: row.is_top_10_pct,
  }));

  const myEntry = leaderboard.find((e) => e.player_id === user.id) ?? null;

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
      player={{ id: user.id, displayName: profile?.display_name ?? "Player" }}
      leaderboard={leaderboard}
      myEntry={myEntry}
      totalPlayers={totalPlayers ?? leaderboard.length}
      sponsors={sponsors ?? []}
    />
  );
}
