import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePlayerName } from "@/lib/player-name";
import { ResultsView } from "./_components/results-view";
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

  if (!event) return { title: "Results | BlockTrivia" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const ogUrl = `${siteUrl}/api/og/result?event_id=${event.id}`;

  return {
    title: `${event.title} - Results | BlockTrivia`,
    description: `See the final leaderboard for ${event.title} on BlockTrivia.`,
    openGraph: {
      title: `${event.title} - Final Results`,
      description: `See the final leaderboard for ${event.title} on BlockTrivia.`,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.title} - Final Results`,
      description: `See the final leaderboard for ${event.title} on BlockTrivia.`,
      images: [ogUrl],
    },
  };
}

export default async function ResultsPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, twitter_handle, hashtags, logo_url, description, prizes, organizer_name, created_at")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) notFound();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: entries }, { data: sponsors }] = await Promise.all([
    supabase
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
        profiles!leaderboard_entries_player_id_fkey ( display_name, username )
      `)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })
      .limit(200),
    supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaderboard = (entries ?? []).map((row: any) => ({
    player_id: row.player_id,
    display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
    total_score: row.total_score,
    correct_count: row.correct_count,
    total_questions: row.total_questions,
    accuracy: row.accuracy,
    avg_speed_ms: row.avg_speed_ms ?? 0,
    rank: row.rank,
    is_top_10_pct: row.is_top_10_pct,
  }));

  return (
    <ResultsView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        twitter_handle: event.twitter_handle ?? null,
        hashtags: event.hashtags ?? null,
        logoUrl: event.logo_url ?? null,
        description: event.description ?? null,
        prizes: event.prizes ?? null,
        organizer_name: event.organizer_name ?? null,
        created_at: event.created_at ?? null,
      }}
      leaderboard={leaderboard}
      sponsors={sponsors ?? []}
      myPlayerId={user?.id ?? null}
    />
  );
}
