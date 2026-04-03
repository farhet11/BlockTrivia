import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function GameRouter({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  // Step 1: Find event by join code
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) {
    redirect("/join");
  }

  // Step 2: Query game state for this event
  const { data: gameState } = await supabase
    .from("game_state")
    .select("phase")
    .eq("event_id", event.id)
    .single();

  // Step 3: Route based on phase
  const phase = gameState?.phase ?? "lobby";

  switch (phase) {
    case "lobby":
      redirect(`/game/${code}/lobby`);
    case "playing":
    case "revealing":
    case "leaderboard":
    case "interstitial":
      redirect(`/game/${code}/play`);
    case "ended":
      redirect(`/game/${code}/final`);
    default:
      redirect(`/game/${code}/lobby`);
  }
}
