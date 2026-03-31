import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ControlPanel } from "./_components/control-panel";

export default async function HostControlPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load event + verify ownership
  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, created_by")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event || event.created_by !== user.id) redirect("/host");

  // Load rounds + questions (ordered)
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, title, round_type, sort_order, time_limit_seconds, base_points, interstitial_text")
    .eq("event_id", event.id)
    .order("sort_order");

  const roundIds = (rounds || []).map((r) => r.id);
  const { data: questions } = roundIds.length
    ? await supabase
        .from("questions")
        .select("id, round_id, body, options, correct_answer, sort_order")
        .in("round_id", roundIds)
        .order("sort_order")
    : { data: [] };

  // Get or create game_state
  let { data: gameState } = await supabase
    .from("game_state")
    .select("*")
    .eq("event_id", event.id)
    .single();

  if (!gameState) {
    const { data: created } = await supabase
      .from("game_state")
      .insert({ event_id: event.id, phase: "lobby" })
      .select()
      .single();
    gameState = created;
  }

  // Player count
  const { count: playerCount } = await supabase
    .from("event_players")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);

  // Load sponsors
  const { data: sponsors } = await supabase
    .from("event_sponsors")
    .select("id, name, logo_url, sort_order")
    .eq("event_id", event.id)
    .order("sort_order");

  // Build ordered question list with round info
  const questionList = (rounds || []).flatMap((round) => {
    const roundQuestions = (questions || [])
      .filter((q) => q.round_id === round.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    return roundQuestions.map((q) => ({
      ...q,
      round_title: round.title || `Round ${round.sort_order + 1}`,
      round_type: round.round_type,
      time_limit: round.time_limit_seconds,
      base_points: round.base_points,
      round_interstitial_text: round.interstitial_text ?? null,
    }));
  });

  // Build rounds list for interstitial lookups
  const roundsList = (rounds || []).map((r) => ({
    id: r.id,
    title: r.title || `Round ${r.sort_order + 1}`,
    round_type: r.round_type,
    sort_order: r.sort_order,
    interstitial_text: r.interstitial_text ?? null,
  }));

  return (
    <ControlPanel
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
      }}
      questions={questionList}
      rounds={roundsList}
      initialGameState={gameState!}
      playerCount={playerCount ?? 0}
      sponsors={sponsors ?? []}
    />
  );
}
