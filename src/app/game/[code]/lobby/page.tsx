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
    .select("id, title, join_code, status")
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

  // Get current player's display name + sponsors
  const [{ data: profile }, { data: sponsors }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("event_sponsors").select("id, name, logo_url, sort_order").eq("event_id", event.id).order("sort_order"),
  ]);

  return (
    <LobbyView
      event={{
        id: event.id,
        title: event.title,
        joinCode: event.join_code,
        status: event.status,
      }}
      player={{
        id: user.id,
        displayName: profile?.display_name || "Player",
      }}
      sponsors={sponsors ?? []}
    />
  );
}
