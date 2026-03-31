"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { ShareDrawer } from "./share-drawer";

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
}: {
  event: EventInfo;
  player: { id: string; displayName: string };
}) {
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showShare, setShowShare] = useState(false);

  // Fetch initial players + subscribe to realtime changes
  useEffect(() => {
    // Load existing players
    async function loadPlayers() {
      const { data } = await supabase
        .from("event_players")
        .select(`
          id,
          player_id,
          joined_at,
          profiles!event_players_player_id_fkey ( display_name )
        `)
        .eq("event_id", event.id)
        .order("joined_at", { ascending: true });

      if (data) {
        setPlayers(
          data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            player_id: row.player_id as string,
            display_name:
              (row.profiles as Record<string, unknown>)?.display_name as string || "Player",
            joined_at: row.joined_at as string,
          }))
        );
      }
    }

    loadPlayers();

    // Subscribe to new players joining
    const channel = supabase
      .channel(`lobby:${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_players",
          filter: `event_id=eq.${event.id}`,
        },
        async (payload) => {
          // Fetch the new player's display name from profiles
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
            // Avoid duplicates
            if (prev.some((p) => p.id === newPlayer.id)) return prev;
            return [...prev, newPlayer];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, event.id]);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-lg mx-auto">
          <img
            src="/logo-light.svg"
            alt="BlockTrivia"
            className="h-6 dark:hidden"
          />
          <img
            src="/logo-dark.svg"
            alt="BlockTrivia"
            className="h-6 hidden dark:block"
          />
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors"
          >
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
              />
            </svg>
            Invite
          </button>
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
              {/* Avatar placeholder — initials */}
              <div className="w-9 h-9 bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">
                  {(p.display_name || "P").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {p.display_name}
                  {p.player_id === player.id && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                #{i + 1}
              </span>
            </li>
          ))}
        </ul>

        {/* Empty state */}
        {players.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No players yet. Share the code to invite others!
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-background">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Game Code
            </p>
            <p className="font-heading text-2xl font-bold tracking-[0.2em] text-foreground">
              {event.joinCode}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="h-10 px-5 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            Share
          </button>
        </div>
      </div>

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
