"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { SponsorBar } from "@/app/_components/sponsor-bar";

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
  joined_at: string;
};

type EventInfo = {
  id: string;
  title: string;
  joinCode: string;
  status: string;
};

export function LobbyView({
  event,
  player,
  sponsors,
}: {
  event: EventInfo;
  player: { id: string; displayName: string };
  sponsors: Sponsor[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);

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
        .select(`id, player_id, joined_at, profiles!event_players_player_id_fkey ( display_name )`)
        .eq("event_id", event.id)
        .order("joined_at", { ascending: true });

      if (data) {
        setPlayers(
          data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            player_id: row.player_id as string,
            display_name: (row.profiles as Record<string, unknown>)?.display_name as string || "Player",
            joined_at: row.joined_at as string,
          }))
        );
      }
    }

    loadPlayers();

    const channel = supabase
      .channel(`lobby:${event.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_players", filter: `event_id=eq.${event.id}` },
        async (payload) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", payload.new.player_id)
            .single();

          const newPlayer: Player = {
            id: payload.new.id,
            player_id: payload.new.player_id,
            display_name: profile?.display_name || "Player",
            joined_at: payload.new.joined_at,
          };

          setPlayers((prev) => {
            if (prev.some((p) => p.id === newPlayer.id)) return prev;
            return [...prev, newPlayer];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, event.id]);

  function copyCode() {
    navigator.clipboard.writeText(event.joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareLink() {
    const url = `${window.location.origin}/join/${event.joinCode}`;
    if (navigator.share) {
      navigator.share({ title: event.title, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-lg mx-auto">
          <a href="/join">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/join"); }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Sign out"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-5">

        {/* Event info */}
        <section className="pt-10 pb-6 text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-accent-light px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-correct animate-pulse" />
            <span className="text-xs font-bold text-accent-text uppercase tracking-wider">
              Lobby Open
            </span>
          </div>
          <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-foreground">
            {event.title}
          </h1>
          <p className="text-muted-foreground text-[15px]">
            Waiting for the host to start the game...
          </p>
        </section>

        {/* Join card */}
        <div className="border border-border bg-surface p-5 mb-6 space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Join This Game
          </p>
          <button
            onClick={copyCode}
            className="w-full text-left group space-y-1"
            aria-label="Copy join code"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-3xl font-bold tracking-[0.2em] text-primary">
                {event.joinCode}
              </span>
              {copied ? (
                <svg className="size-5 text-correct shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
              )}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {copied ? "✓ Copied!" : "tap anywhere to copy"}
            </p>
          </button>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowShare(true)}
              className="flex-1 h-10 border border-border text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75V16.5ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
              </svg>
              Show QR
            </button>
            <button
              onClick={shareLink}
              className="flex-1 h-10 border border-border text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              Share
            </button>
          </div>
        </div>

        {/* Player count */}
        <div className="flex items-center justify-between py-4 border-b border-border">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Players
          </span>
          <span className="text-sm font-bold text-foreground tabular-nums">
            {players.length}
          </span>
        </div>

        {/* Player list */}
        <ul className="divide-y divide-border">
          {players.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-3.5">
              <div className="w-9 h-9 bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">
                  {(p.display_name || "P").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {p.display_name}
                  {p.player_id === player.id && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
            </li>
          ))}
        </ul>

        {/* Empty / solo state */}
        {players.length <= 1 && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {players.length === 0
                ? "No players yet — share the code above to invite others."
                : "Just you so far — share the code above to bring in more players."}
            </p>
          </div>
        )}

        <div className="pb-8" />
      </div>

      {/* Sponsor bar */}
      <SponsorBar sponsors={sponsors} />

      {/* Share drawer */}
      {showShare && (
        <ShareDrawer
          joinCode={event.joinCode}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
