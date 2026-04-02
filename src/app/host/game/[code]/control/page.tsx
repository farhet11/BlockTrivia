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
    .select("id, title, description, join_code, status, created_by")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event || event.created_by !== user.id) redirect("/host");

  // Load rounds + questions (ordered)
  // Try with interstitial_text first; fall back without it if column doesn't exist yet
  let { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, title, round_type, sort_order, time_limit_seconds, base_points, interstitial_text")
    .eq("event_id", event.id)
    .order("sort_order");

  if (roundsError) {
    const fallback = await supabase
      .from("rounds")
      .select("id, title, round_type, sort_order, time_limit_seconds, base_points")
      .eq("event_id", event.id)
      .order("sort_order");
    rounds = (fallback.data ?? []).map((r) => ({ ...r, interstitial_text: null }));
  }

  const roundIds = (rounds || []).map((r) => r.id);
  const { data: questions } = roundIds.length
    ? await supabase
        .from("questions")
        .select("id, round_id, body, options, correct_answer, sort_order")
        .in("round_id", roundIds)
        .order("sort_order")
    : { data: [] };

  // Get or create game_state — upsert handles race condition
  let { data: gameState } = await supabase
    .from("game_state")
    .select("*")
    .eq("event_id", event.id)
    .single();

  if (!gameState) {
    // Create game_state and return the row in one round-trip
    const { data: created } = await supabase
      .from("game_state")
      .upsert({ event_id: event.id, phase: "lobby" }, { onConflict: "event_id", ignoreDuplicates: true })
      .select()
      .single();

    if (!created) {
      // upsert returned nothing (row already existed due to race) — re-fetch
      const { data: refetched } = await supabase
        .from("game_state")
        .select("*")
        .eq("event_id", event.id)
        .single();
      gameState = refetched;
    } else {
      gameState = created;
    }
  }

  // Ended game → send host straight to summary
  if (gameState?.phase === "ended") {
    redirect(`/host/game/${code}/summary`);
  }

  // Player count
  const { count: playerCount } = await supabase
    .from("event_players")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);

  // Load sponsors (table may not exist if migration 004 wasn't applied)
  let sponsors: { id: string; name: string | null; logo_url: string; sort_order: number }[] = [];
  try {
    const { data: sponsorData } = await supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order");
    sponsors = sponsorData ?? [];
  } catch {
    // event_sponsors table doesn't exist yet — proceed without sponsors
  }

  // Build ordered question list with round info
  const questionList = (rounds || []).flatMap((round) => {
    const roundQuestions = (questions || [])
      .filter((q) => q.round_id === round.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    return roundQuestions.map((q) => ({
      ...q,
      options: (q.options as string[] | null) ?? [],
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

  if (!gameState) {
    // Shouldn't happen — surface the error rather than silently redirecting
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Failed to initialise game state. <a href="/host" className="text-primary underline">Go back</a></p>
      </div>
    );
  }

  return (
    <ControlPanel
      event={{
        id: event.id,
        title: event.title,
        description: event.description ?? null,
        joinCode: event.join_code,
        status: event.status,
      }}
      questions={questionList}
      rounds={roundsList}
      initialGameState={gameState}
      playerCount={playerCount ?? 0}
      sponsors={sponsors}
    />
  );
}
