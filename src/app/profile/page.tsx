import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ProfileView } from "./_components/profile-view";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, email, avatar_url, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch stats + game history in parallel
  const [{ data: games }, { count: gameCount }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      .select(
        `rank, total_score, correct_count, total_questions, accuracy, is_top_10_pct,
         events!leaderboard_entries_event_id_fkey ( title, join_code, created_at )`
      )
      .eq("player_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("leaderboard_entries")
      .select("*", { count: "exact", head: true })
      .eq("player_id", user.id),
  ]);

  // Compute aggregate stats
  const entries = games ?? [];
  const totalGames = gameCount ?? entries.length;
  const avgAccuracy =
    entries.length > 0
      ? Math.round(
          entries.reduce((sum, e) => sum + Number(e.accuracy), 0) /
            entries.length
        )
      : 0;
  const bestRank =
    entries.length > 0
      ? Math.min(...entries.map((e) => e.rank).filter(Boolean))
      : null;

  // Game history for display
  const gameHistory = entries.map((e) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = e.events as any;
    return {
      title: ev?.title ?? "Unknown Event",
      joinCode: ev?.join_code ?? "",
      date: ev?.created_at ?? "",
      rank: e.rank,
      score: e.total_score,
      accuracy: Math.round(Number(e.accuracy)),
      isTop10Pct: e.is_top_10_pct,
    };
  });

  // Linked providers from auth metadata
  const providers: string[] = user.app_metadata?.providers ?? [];

  return (
    <ProfileView
      user={{
        id: user.id,
        displayName: profile.display_name ?? "Player",
        username: profile.username ?? null,
        email: profile.email ?? user.email ?? "",
        role: profile.role as "super_admin" | "host" | "player",
        avatarUrl: profile.avatar_url ?? (user.user_metadata?.avatar_url as string | null) ?? null,
      }}
      stats={{
        totalGames,
        avgAccuracy,
        bestRank,
      }}
      gameHistory={gameHistory}
      providers={providers}
    />
  );
}
