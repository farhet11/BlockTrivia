import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LobbyView } from "./_components/lobby-view";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  // Verify the event exists
  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, logo_url")
    .eq("join_code", code.toUpperCase())
    .single();

  if (!event) redirect("/join");

  // Verify the user is authenticated and joined this event
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/join/${code}`);

  const { data: membership } = await supabase
    .from("event_players")
    .select("id")
    .eq("event_id", event.id)
    .eq("player_id", user.id)
    .single();

  if (!membership) redirect(`/join/${code}`);

  // If the game is already active/ended, skip the lobby
  const { data: gameState } = await supabase
    .from("game_state")
    .select("phase")
    .eq("event_id", event.id)
    .single();

  if (gameState?.phase === "ended") redirect(`/game/${code}/final`);
  if (gameState && gameState.phase !== "lobby") redirect(`/game/${code}/play`);

  // Get current player's display name, sponsors, and game stats
  const [{ data: profile }, { data: sponsors }, { data: rounds }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("event_sponsors").select("id, name, logo_url, sort_order").eq("event_id", event.id).order("sort_order"),
    supabase.from("rounds").select("id, questions(id)").eq("event_id", event.id),
  ]);

  const roundCount = rounds?.length ?? 0;
  const questionCount = rounds?.reduce((sum, r) => sum + ((r.questions as unknown[])?.length ?? 0), 0) ?? 0;

  return (
    <LobbyView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
        logoUrl: event.logo_url ?? null,
        roundCount,
        questionCount,
      }}
      player={{
        id: user.id,
        displayName: profile?.display_name || "Player",
      }}
      sponsors={sponsors ?? []}
    />
  );
}
