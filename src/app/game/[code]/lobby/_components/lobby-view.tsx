"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { PlayerHeader } from "@/app/_components/player-header";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { Users, Layers, HelpCircle, Clock, Trophy, Copy, Check, QrCode, Share2 } from "lucide-react";

const ICON_CLASS = "text-stone-500 dark:text-zinc-400";
const ICON_PROPS = { size: 20, strokeWidth: 2.5 } as const;

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

type Player = {
  id: string;
  player_id: string;
  username: string | null;
  display_name: string;
  game_alias: string | null;
  joined_at: string;
};

type EventInfo = {
  id: string;
  title: string;
  joinCode: string;
  status: string;
  logoUrl?: string | null;
  prizes?: string | null;
  roundCount?: number;
  questionCount?: number;
  estimatedMinutes?: number | null;
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
        .select(`id, player_id, joined_at, game_alias, profiles!event_players_player_id_fkey ( display_name, username )`)
        .eq("event_id", event.id)
        .order("joined_at", { ascending: true });

      if (data) {
        setPlayers(
          data.map((row: Record<string, unknown>) => {
            const prof = row.profiles as Record<string, unknown>;
            return {
              id: row.id as string,
              player_id: row.player_id as string,
              username: (prof?.username as string) || null,
              display_name: prof?.display_name as string || "Player",
              game_alias: (row.game_alias as string) || null,
              joined_at: row.joined_at as string,
            };
          })
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
            .select("display_name, username")
            .eq("id", payload.new.player_id)
            .single();

          const newPlayer: Player = {
            id: payload.new.id,
            player_id: payload.new.player_id,
            username: profile?.username || null,
            display_name: profile?.display_name || "Player",
            game_alias: payload.new.game_alias || null,
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
      <PlayerHeader user={player} />

      {/* Main content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-5">

        {/* Context label + event title */}
        <section className="pt-10 pb-6 text-center space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">
            Lobby Open
          </p>
          <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-foreground">
            {event.title}
          </h1>
          <p className="text-muted-foreground text-[15px]">
            Waiting for the host to start the game...
          </p>
        </section>

        {/* Stat cards with icons */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="border border-border bg-surface p-3 space-y-1.5 text-center">
            <Users size={18} strokeWidth={2.5} className={`${ICON_CLASS} mx-auto`} />
            <p className="font-heading text-lg font-bold tabular-nums">{players.length}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">players</p>
          </div>
          <div className="border border-border bg-surface p-3 space-y-1.5 text-center">
            <Layers size={18} strokeWidth={2.5} className={`${ICON_CLASS} mx-auto`} />
            <p className="font-heading text-lg font-bold tabular-nums">{event.roundCount ?? "—"}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">rounds</p>
          </div>
          <div className="border border-border bg-surface p-3 space-y-1.5 text-center">
            <HelpCircle size={18} strokeWidth={2.5} className={`${ICON_CLASS} mx-auto`} />
            <p className="font-heading text-lg font-bold tabular-nums">{event.questionCount ?? "—"}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">questions</p>
          </div>
          <div className="border border-border bg-surface p-3 space-y-1.5 text-center">
            <Clock size={18} strokeWidth={2.5} className={`${ICON_CLASS} mx-auto`} />
            <p className="font-heading text-lg font-bold tabular-nums">{event.estimatedMinutes ? `~${event.estimatedMinutes}` : "—"}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">min</p>
          </div>
        </div>

        {/* Prizes banner */}
        {event.prizes && (
          <div className="border border-primary/20 bg-primary/5 p-4 mb-6 flex items-start gap-3">
            <Trophy size={20} strokeWidth={2} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">Prizes</p>
              <p className="text-sm text-foreground">{event.prizes}</p>
            </div>
          </div>
        )}

        {/* Join card */}
        <div className="border border-border bg-surface p-5 mb-6 space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">
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
                <Check {...ICON_PROPS} className="text-correct shrink-0" />
              ) : (
                <Copy {...ICON_PROPS} className="text-muted-foreground group-hover:text-foreground transition-colors duration-150 shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {copied ? "Copied!" : "tap anywhere to copy"}
            </p>
          </button>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowShare(true)}
              className="flex-1 h-10 border border-border text-sm font-heading font-medium hover:bg-accent transition-colors duration-150 flex items-center justify-center gap-1.5"
            >
              <QrCode size={16} strokeWidth={2.5} className={ICON_CLASS} />
              Show QR
            </button>
            <button
              onClick={shareLink}
              className="flex-1 h-10 border border-border text-sm font-heading font-medium hover:bg-accent transition-colors duration-150 flex items-center justify-center gap-1.5"
            >
              <Share2 size={16} strokeWidth={2.5} className={ICON_CLASS} />
              Share
            </button>
          </div>
        </div>

        {/* Player count label */}
        <div className="flex items-center justify-between py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={16} strokeWidth={2.5} className={ICON_CLASS} />
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Players
            </span>
          </div>
          <span className="text-sm font-bold text-foreground tabular-nums">
            {players.length}
          </span>
        </div>

        {/* Player list — NO rank numbers (lobby ≠ leaderboard) */}
        <ul className="divide-y divide-border">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3.5">
              <PlayerAvatar seed={p.player_id} name={p.display_name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {p.game_alias || (p.username ? `@${p.username}` : p.display_name)}
                  {p.player_id === player.id && (
                    <span className="ml-1.5 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 font-medium">you</span>
                  )}
                </p>
              </div>
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
