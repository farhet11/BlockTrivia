"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { resolvePlayerName } from "@/lib/player-name";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { AppHeader } from "@/app/_components/app-header";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PlayerAvatar } from "@/app/_components/player-avatar";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

type Player = {
  id: string;
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
};

type EventInfo = {
  id: string;
  title: string;
  joinCode: string;
  status: string;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  organizerName?: string | null;
  questionCount?: number;
  estimatedMinutes?: number | null;
};

export function LobbyView({
  event,
  player,
  sponsors,
}: {
  event: EventInfo;
  player: { id: string; displayName: string; email?: string; avatarUrl?: string | null };
  sponsors: Sponsor[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showShare, setShowShare] = useState(false);

  // Redirect helper — shared by Realtime + polling
  function handlePhaseChange(phase: string) {
    if (phase === "ended") {
      router.push(`/game/${event.joinCode}/final`);
    } else if (phase !== "lobby") {
      router.push(`/game/${event.joinCode}/play`);
    }
  }

  // Check game state on mount + subscribe to changes — redirect when game starts
  useEffect(() => {
    async function checkAndSubscribeGameState() {
      const { data: gs } = await supabase
        .from("game_state")
        .select("phase")
        .eq("event_id", event.id)
        .single();

      if (gs) handlePhaseChange(gs.phase);

      supabase
        .channel(`game-state:${event.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` },
          (payload) => handlePhaseChange(payload.new.phase as string)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` },
          (payload) => handlePhaseChange(payload.new.phase as string)
        )
        .subscribe();
    }

    checkAndSubscribeGameState();
  }, [supabase, event.id, event.joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback — checks every 2s in case Realtime misses the game start
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("game_state")
        .select("phase")
        .eq("event_id", event.id)
        .single();
      if (data) handlePhaseChange(data.phase);
    }, 2000);
    return () => clearInterval(interval);
  }, [supabase, event.id, event.joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch initial players + subscribe to realtime changes
  useEffect(() => {
    async function loadPlayers() {
      const { data } = await supabase
        .from("event_players")
        .select(`id, player_id, game_alias, joined_at, profiles!event_players_player_id_fkey ( username, display_name, avatar_url )`)
        .eq("event_id", event.id)
        .order("joined_at", { ascending: true });

      if (data) {
        setPlayers(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.map((row: any) => ({
            id: row.id,
            player_id: row.player_id,
            display_name: resolvePlayerName(row.game_alias, row.profiles?.username, row.profiles?.display_name),
            avatar_url: row.profiles?.avatar_url ?? null,
            joined_at: row.joined_at,
          }))
        );
      }
    }

    loadPlayers();

    // Polling fallback — re-fetches full list every 3s in case Realtime misses a join
    const pollInterval = setInterval(loadPlayers, 3000);

    const channel = supabase
      .channel(`lobby:${event.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_players", filter: `event_id=eq.${event.id}` },
        async (payload) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, display_name, avatar_url")
            .eq("id", payload.new.player_id)
            .single();

          const newPlayer: Player = {
            id: payload.new.id,
            player_id: payload.new.player_id,
            display_name: resolvePlayerName(payload.new.game_alias, profile?.username, profile?.display_name),
            avatar_url: profile?.avatar_url ?? null,
            joined_at: payload.new.joined_at,
          };

          setPlayers((prev) => {
            if (prev.some((p) => p.id === newPlayer.id)) return prev;
            return [...prev, newPlayer];
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [supabase, event.id]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppHeader user={{ id: player.id, displayName: player.displayName, email: player.email }} avatarUrl={player.avatarUrl} />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full flex flex-col">

        {/* Event title + hosted by + status */}
        <div className="text-center px-5 pt-5 pb-2 space-y-2">
          <h1 className="font-heading text-2xl font-bold leading-tight">{event.title}</h1>

          <div className="flex flex-col items-center gap-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
              Hosted by
            </p>
            {event.logoUrl ? (
              <img src={event.logoUrl} alt={event.organizerName ?? "Organizer"} className="h-7 max-w-[120px] object-contain" />
            ) : (
              <>
                <img src="/logo-light.svg" alt="BlockTrivia" className="h-7 max-w-[120px] object-contain dark:hidden" />
                <img src="/logo-dark.svg" alt="BlockTrivia" className="h-7 max-w-[120px] object-contain hidden dark:block" />
              </>
            )}
          </div>

          {/* Status badge */}
          <div className="flex justify-center pt-1">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "#22c55e", background: "#22c55e18", fontFamily: "Inter, sans-serif", letterSpacing: "0.06em" }}
            >
              <span className="size-1.5 rounded-full shrink-0 animate-pulse" style={{ background: "#22c55e" }} />
              Lobby Open
            </span>
          </div>
        </div>

        {/* 4-col stats bar */}
        <div className="mx-5 mt-3 mb-4 grid grid-cols-4 border border-border divide-x divide-border">
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Players</p>
            <p className="font-heading text-lg font-bold tabular-nums">{players.length}</p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Questions</p>
            <p className="font-heading text-lg font-bold tabular-nums">{event.questionCount ?? "—"}</p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Est. Time</p>
            <p className="font-heading text-lg font-bold tabular-nums">{event.estimatedMinutes ? `${event.estimatedMinutes}m` : "—"}</p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="py-3 text-center hover:bg-border/40 transition-colors"
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Join Code</p>
            <p className="font-heading text-lg font-bold text-primary tabular-nums tracking-widest">{event.joinCode}</p>
          </button>
        </div>

        {/* Players section */}
        <div className="flex-1 mx-5">
          {players.map((p, i) => {
            const isMe = p.player_id === player.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3"
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--color-border, #e8e5e0)",
                  ...(isMe ? { background: "rgba(124,58,237,0.05)", borderLeft: "2px solid rgba(124,58,237,0.3)" } : {}),
                }}
              >
                <span
                  className="shrink-0 text-right tabular-nums"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
                >
                  {i + 1}
                </span>
                <PlayerAvatar seed={p.player_id} name={p.display_name} size={40} url={p.avatar_url} />
                <span
                  className="flex-1 truncate"
                  style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: isMe ? "#7c3aed" : undefined }}
                >
                  {p.display_name}
                </span>
              </div>
            );
          })}

          {/* Ghost placeholder rows — blurred, fills up to 4 total rows */}
          {players.length < 4 && (
            <div className="blur-[2px] opacity-40 pointer-events-none select-none">
              {Array.from({ length: 4 - players.length }).map((_, i) => (
                <div
                  key={`ghost-${i}`}
                  className="flex items-center gap-3"
                  style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border, #e8e5e0)" }}
                >
                  <span
                    className="shrink-0 text-right tabular-nums"
                    style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
                  >
                    {players.length + i + 1}
                  </span>
                  <PlayerAvatar seed={`ghost-slot-${i}`} name="?" size={40} />
                  <span className="flex-1" style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500 }}>
                    Waiting...
                  </span>
                </div>
              ))}
            </div>
          )}

          {players.length <= 1 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {players.length === 0
                ? "No one here yet - share the join code!"
                : "Invite others - tap the join code above."}
            </p>
          )}

          <div className="pb-8" />
        </div>
      </div>

      <SponsorBar sponsors={sponsors} />

      {showShare && (
        <ShareDrawer joinCode={event.joinCode} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
