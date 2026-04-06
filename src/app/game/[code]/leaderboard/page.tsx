import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LeaderboardView } from "./_components/leaderboard-view";
import type { Metadata } from "next";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title")
    .eq("join_code", code.toUpperCase())
    .single();
  if (!event) return { title: "Leaderboard | BlockTrivia" };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const ogUrl = `${siteUrl}/api/og/result?event_id=${event.id}`;
  return {
    title: `${event.title} - Leaderboard | BlockTrivia`,
    description: `Live leaderboard for ${event.title} on BlockTrivia.`,
    openGraph: {
      title: `${event.title} - Leaderboard`,
      description: `Live leaderboard for ${event.title} on BlockTrivia.`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.title} - Leaderboard`,
      description: `Live leaderboard for ${event.title} on BlockTrivia.`,
      images: [ogUrl],
    },
  };
}

export default async function LeaderboardPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, logo_url, twitter_handle, hashtags")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
    : { data: null };

  const [
    { data: gameStateData },
    { data: entries },
    { data: allPlayers },
    { count: totalPlayers },
    { data: sponsors },
    { data: hostCheck },
    { data: playerCheck },
    { data: rounds },
  ] = await Promise.all([
    supabase
      .from("game_state")
      .select("phase, current_round_id, current_question_id")
      .eq("event_id", event.id)
      .maybeSingle(),
    supabase
      .from("leaderboard_entries")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(`player_id, total_score, rank, correct_count, total_questions, accuracy, avg_speed_ms, is_top_10_pct, profiles!leaderboard_entries_player_id_fkey ( username, display_name, avatar_url )`)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })
      .limit(50),
    supabase
      .from("event_players")
      .select(`player_id, game_alias, profiles ( username, display_name, avatar_url )`)
      .eq("event_id", event.id),
    supabase
      .from("event_players")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id),
    supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
    user
      ? supabase.from("event_hosts").select("user_id").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("event_players").select("player_id").eq("event_id", event.id).eq("player_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("rounds")
      .select("id, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
  ]);

  // Fetch questions for current question position (sequential, needs round IDs)
  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: questions } = roundIds.length > 0
    ? await supabase
        .from("questions")
        .select("id, sort_order, round_id")
        .in("round_id", roundIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  // Sort questions by round order then question order
  const sortedQuestions = (questions ?? []).sort((a, b) => {
    const ri = (rounds ?? []).findIndex((r) => r.id === a.round_id);
    const rj = (rounds ?? []).findIndex((r) => r.id === b.round_id);
    if (ri !== rj) return ri - rj;
    return a.sort_order - b.sort_order;
  });
  const currentQIdx = gameStateData?.current_question_id
    ? sortedQuestions.findIndex((q) => q.id === gameStateData.current_question_id)
    : -1;
  const questionPosition = sortedQuestions.length > 0
    ? { current: currentQIdx >= 0 ? currentQIdx + 1 : null, total: sortedQuestions.length }
    : null;

  // Build leaderboard — real scores or 0-pt fallback from joined players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leaderboard: any[] = [];
  if (entries && entries.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaderboard = entries.map((row: any) => ({
      player_id: row.player_id,
      display_name: row.profiles?.username || row.profiles?.display_name || "Player",
      avatar_url: row.profiles?.avatar_url ?? null,
      total_score: row.total_score,
      rank: row.rank,
      correct_count: row.correct_count ?? 0,
      total_questions: row.total_questions ?? 0,
      accuracy: row.accuracy ?? 0,
      avg_speed_ms: row.avg_speed_ms ?? 0,
      is_top_10_pct: row.is_top_10_pct ?? false,
    }));
  } else if (allPlayers && allPlayers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaderboard = allPlayers.map((p: any, i: number) => ({
      player_id: p.player_id,
      display_name: p.game_alias || p.profiles?.username || p.profiles?.display_name || "Player",
      avatar_url: p.profiles?.avatar_url ?? null,
      total_score: 0,
      rank: i + 1,
    }));
  }

  const myEntry = user ? (leaderboard.find((e) => e.player_id === user.id) ?? null) : null;
  const isHost = !!hostCheck;
  const isPlayer = !!playerCheck && !isHost;
  const viewerType: "host" | "player" | "public" = isHost ? "host" : isPlayer ? "player" : "public";

  // Round position for stats bar
  const currentRoundIdx =
    gameStateData?.current_round_id && rounds
      ? rounds.findIndex((r) => r.id === gameStateData.current_round_id)
      : -1;
  const roundPosition =
    rounds && rounds.length > 0
      ? { current: currentRoundIdx >= 0 ? currentRoundIdx + 1 : null, total: rounds.length }
      : null;

  const gamePhase = gameStateData?.phase ?? event.status;

  return (
    <LeaderboardView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
        logoUrl: event.logo_url ?? null,
        twitter_handle: event.twitter_handle ?? null,
        hashtags: event.hashtags ?? null,
      }}
      gamePhase={gamePhase}
      leaderboard={leaderboard}
      myEntry={myEntry}
      totalPlayers={totalPlayers ?? leaderboard.length}
      questionPosition={questionPosition}
      roundPosition={roundPosition}
      sponsors={sponsors ?? []}
      viewerType={viewerType}
      playerId={user?.id ?? null}
      playerAvatarUrl={profile?.avatar_url ?? (user?.user_metadata?.avatar_url as string | null) ?? null}
      playerEmail={user?.email ?? null}
    />
  );
}
