import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SummaryView } from "./_components/summary-view";

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
    .select("id, title, join_code, status, created_by")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event || event.created_by !== user.id) redirect("/host");

  // Load full leaderboard — try with profile join, fall back without
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
      profiles!leaderboard_entries_player_id_fkey ( display_name, email )
    `)
    .eq("event_id", event.id)
    .order("rank", { ascending: true });

  // Fallback: if join fails (FK name mismatch), load without profiles
  if (lbError) {
    const fallback = await supabase
      .from("leaderboard_entries")
      .select("player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms, rank, is_top_10_pct")
      .eq("event_id", event.id)
      .order("rank", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries = (fallback.data ?? []).map((r: any) => ({ ...r, profiles: [] })) as typeof entries;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaderboard = (entries ?? []).map((row: any) => ({
    player_id: row.player_id,
    display_name: row.profiles?.display_name ?? "Player",
    email: row.profiles?.email ?? "",
    total_score: row.total_score,
    correct_count: row.correct_count,
    total_questions: row.total_questions,
    accuracy: row.accuracy,
    avg_speed_ms: row.avg_speed_ms,
    rank: row.rank,
    is_top_10_pct: row.is_top_10_pct,
  }));

  // Total player count
  const { count: playerCount } = await supabase
    .from("event_players")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);

  return (
    <SummaryView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
      }}
      leaderboard={leaderboard}
      playerCount={playerCount ?? 0}
    />
  );
}
