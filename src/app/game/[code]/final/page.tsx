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
    .select("id, title, join_code")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) redirect("/join");

  const { data: entries } = await supabase
    .from("leaderboard_entries")
    .select(`player_id, total_score, correct_count, total_questions, accuracy, avg_speed_ms, rank, is_top_10_pct, profiles!leaderboard_entries_player_id_fkey ( display_name )`)
    .eq("event_id", event.id)
    .order("total_score", { ascending: false })
    .limit(20);

  const { data: sponsors } = await supabase
    .from("event_sponsors")
    .select("id, name, logo_url, sort_order")
    .eq("event_id", event.id)
    .order("sort_order");

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
      event={{ title: event.title, joinCode: event.join_code }}
      player={{ id: user.id }}
      leaderboard={leaderboard}
      myEntry={myEntry}
      sponsors={sponsors ?? []}
    />
  );
}
