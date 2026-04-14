"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolvePlayerName } from "@/lib/player-name";
import confetti from "canvas-confetti";
import { createClient } from "@/lib/supabase";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { AppHeader } from "@/app/_components/app-header";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { PodiumLayout, RankingRow, PinnedRankSection, type LbEntry } from "@/app/_components/lb-podium";
import { SpotlightCard, type SpotlightEntry } from "@/app/_components/spotlight-card";

type Sponsor = { id: string; name: string | null; logo_url: string; sort_order: number };

type ExtendedEntry = LbEntry & {
  correct_count?: number;
  total_questions?: number;
  accuracy?: number;
  avg_speed_ms?: number;
  is_top_10_pct?: boolean;
  fastest_answer_ms?: number;
  slowest_answer_ms?: number;
  answer_speed_stddev?: number;
};

// Phase → status badge config
// lobby        → Starting Soon   (gray)   — players joined, game not started
// playing      → Live            (green)  — question is active
// paused       → Paused          (amber)  — host froze the game
// leaderboard  → Waiting for Host(amber)  — between rounds, showing standings
// interstitial → Round Complete  (violet) — round ended, transitioning
// ended        → Final Results   (violet) — game over
const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  lobby:        { label: "Starting Soon", color: "#78756e" },
  playing:      { label: "Live",          color: "#22c55e" },
  paused:       { label: "Paused",        color: "#f59e0b" },
  leaderboard:  { label: "Paused",        color: "#f59e0b" },
  interstitial: { label: "Paused",        color: "#f59e0b" },
  ended:        { label: "Final Results", color: "#7c3aed" },
};

export function LeaderboardView({
  event,
  gamePhase: initialPhase,
  leaderboard: initialLeaderboard,
  myEntry: initialMyEntry,
  totalPlayers: initialTotalPlayers,
  questionPosition,
  roundPosition,
  sponsors,
  viewerType,
  playerId,
  playerAvatarUrl,
  playerEmail,
}: {
  event: { id: string; title: string; joinCode: string; status: string; logoUrl: string | null; twitter_handle?: string | null; hashtags?: string[] | null };
  gamePhase: string;
  leaderboard: ExtendedEntry[];
  myEntry: ExtendedEntry | null;
  totalPlayers: number;
  questionPosition: { current: number | null; total: number } | null;
  roundPosition: { current: number | null; total: number } | null;
  sponsors: Sponsor[];
  viewerType: "host" | "player" | "public";
  playerId: string | null;
  playerAvatarUrl?: string | null;
  playerEmail?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [gamePhase, setGamePhase] = useState(initialPhase);
  const [leaderboard, setLeaderboard] = useState<ExtendedEntry[]>(initialLeaderboard);
  const [myEntry, setMyEntry] = useState<ExtendedEntry | null>(initialMyEntry);
  const [totalPlayers, setTotalPlayers] = useState(initialTotalPlayers);
  const [showShare, setShowShare] = useState(false);
  const [spotlights, setSpotlights] = useState<SpotlightEntry[]>([]);
  const [spotlightsExpanded, setSpotlightsExpanded] = useState(false);
  const gamePhaseRef = useRef(initialPhase);

  // Fetch spotlights when game ends (player view only)
  useEffect(() => {
    if (gamePhase !== "ended" || viewerType !== "player") return;
    supabase.rpc("get_event_spotlights", { p_event_id: event.id })
      .then(({ data }) => { if (data) setSpotlights(data as SpotlightEntry[]); });
  }, [gamePhase, viewerType, supabase, event.id]);

  // Confetti on final results
  useEffect(() => {
    if (gamePhase !== "ended") return;
    const left = confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"] });
    const right = confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"] });
    const t = setTimeout(() => confetti({ particleCount: 60, angle: 90, spread: 120, origin: { x: 0.5, y: 0.5 }, colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"], scalar: 0.9 }), 400);
    return () => { clearTimeout(t); left?.then?.(() => {}); right?.then?.(() => {}); };
  }, [gamePhase]);

  // Refetch leaderboard from DB
  const refreshLeaderboard = useMemo(() => async () => {
    const { data } = await supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, rank, correct_count, total_questions, accuracy, avg_speed_ms, is_top_10_pct, profiles!leaderboard_entries_player_id_fkey ( username, display_name, avatar_url )`)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })
      .limit(50);
    if (data && data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries: ExtendedEntry[] = data.map((row: any) => ({
        player_id: row.player_id,
        display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
        avatar_url: row.profiles?.avatar_url ?? null,
        total_score: row.total_score,
        rank: row.rank,
        correct_count: row.correct_count ?? 0,
        total_questions: row.total_questions ?? 0,
        accuracy: row.accuracy ?? 0,
        avg_speed_ms: row.avg_speed_ms ?? 0,
        is_top_10_pct: row.is_top_10_pct ?? false,
      }));
      setLeaderboard(entries);
      if (playerId) {
        const my = entries.find((e) => e.player_id === playerId);
        if (my) setMyEntry(my);
      }
    }
  }, [supabase, event.id, playerId]);

  // Keep phase ref in sync for use in polling closure
  useEffect(() => { gamePhaseRef.current = gamePhase; }, [gamePhase]);

  // Prefetch /play while player waits — makes the resume transition instant
  useEffect(() => {
    if (viewerType !== "player") return;
    router.prefetch(`/game/${event.joinCode}/play`);
  }, [viewerType, router, event.joinCode]);


  const applyPhase = useCallback(
    (newPhase: string) => {
      setGamePhase(newPhase);
      gamePhaseRef.current = newPhase;
      if (viewerType === "player" && newPhase === "playing") {
        router.replace(`/game/${event.joinCode}/play`);
      }
      if (newPhase === "ended") {
        router.replace(`/game/${event.joinCode}/leaderboard`);
      }
    },
    [viewerType, router, event.joinCode]
  );

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`leaderboard-view:${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_entries", filter: `event_id=eq.${event.id}` }, () => {
        refreshLeaderboard();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` }, (payload) => {
        const newPhase = payload.new?.phase as string | undefined;
        if (newPhase) applyPhase(newPhase);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_players", filter: `event_id=eq.${event.id}` }, () => {
        setTotalPlayers((c) => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, event.id, refreshLeaderboard, applyPhase]);

  // Polling fallback — catches Realtime misses, same pattern as play-view
  useEffect(() => {
    if (viewerType !== "player") return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("game_state")
        .select("phase")
        .eq("event_id", event.id)
        .single();
      if (!data) return;
      if (data.phase !== gamePhaseRef.current) {
        applyPhase(data.phase);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [supabase, event.id, viewerType, applyPhase]);

  const phaseConfig = PHASE_CONFIG[gamePhase] ?? PHASE_CONFIG.playing;
  const podiumEntries = leaderboard.slice(0, 3);
  const rankingEntries = leaderboard.slice(3);
  const firstScore = leaderboard[0]?.total_score ?? 1;
  const inTop3 = myEntry ? podiumEntries.some((e) => e.player_id === myEntry.player_id) : false;

  // Player name for avatar
  const myDisplayName = myEntry?.display_name ?? "";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* ── Header ── */}
      <AppHeader
        user={viewerType === "player" && playerId ? { id: playerId, displayName: myDisplayName, email: playerEmail ?? undefined } : null}
        avatarUrl={playerAvatarUrl}
      />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full flex flex-col">
        {/* ── Event info + branding ── */}
        <div className="text-center px-5 pt-5 pb-2 space-y-2">
          <h1 className="font-heading text-2xl font-bold leading-tight">{event.title}</h1>

          {/* Hosted by */}
          <div className="flex flex-col items-center gap-1">
            <p
              className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Hosted by
            </p>
            {event.logoUrl ? (
              <Image src={event.logoUrl} alt="Organizer" width={120} height={28} unoptimized className="h-7 w-auto max-w-[120px] object-contain" />
            ) : (
              <>
                <Image src="/logo-light.svg" alt="BlockTrivia" width={120} height={28} className="h-7 w-auto max-w-[120px] object-contain dark:hidden" />
                <Image src="/logo-dark.svg" alt="BlockTrivia" width={120} height={28} className="h-7 w-auto max-w-[120px] object-contain hidden dark:block" />
              </>
            )}
          </div>

          {/* Status badge — no border, just dot + label */}
          <div className="flex justify-center pt-1">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
              style={{
                color: phaseConfig.color,
                background: `${phaseConfig.color}18`,
                fontFamily: "Inter, sans-serif",
                letterSpacing: "0.06em",
              }}
            >
              <span className="size-1.5 rounded-full shrink-0" style={{ background: phaseConfig.color }} />
              {phaseConfig.label}
            </span>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div
          className="mx-5 mt-3 mb-4 grid border border-border divide-x divide-border"
          style={{ gridTemplateColumns: `repeat(4, 1fr)` }}
        >
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Players</p>
            <p className="font-heading text-lg font-bold tabular-nums">{totalPlayers}</p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Question</p>
            <p className="font-heading text-lg font-bold tabular-nums">
              {questionPosition ? `${questionPosition.current ?? "—"}/${questionPosition.total}` : "—"}
            </p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Round</p>
            <p className="font-heading text-lg font-bold tabular-nums">
              {roundPosition ? `${roundPosition.current ?? "—"}/${roundPosition.total}` : "—"}
            </p>
          </div>
          <button
            onClick={() => setShowShare(true)}
            className="py-3 text-center hover:bg-border/40 transition-colors"
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>Join Code</p>
            <p className="font-heading text-lg font-bold text-primary tabular-nums tracking-widest">{event.joinCode}</p>
          </button>
        </div>

        {showShare && (
          <ShareDrawer joinCode={event.joinCode} onClose={() => setShowShare(false)} />
        )}


        {/* ── Spotlight Cards (player, ended, min 2 qualify) ── */}
        {gamePhase === "ended" && viewerType === "player" && spotlights.length >= 2 && (() => {
          const VISIBLE = 3;
          const visible = spotlightsExpanded ? spotlights : spotlights.slice(0, VISIBLE);
          const hiddenCount = spotlights.length - VISIBLE;
          return (
            <div className="mx-5 mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
                Spotlights
              </p>
              <div className="relative">
                <div className="space-y-2">
                  {visible.map((s, i) => (
                    <SpotlightCard
                      key={s.title}
                      spotlight={s}
                      isMe={s.player_id === playerId}
                      animIndex={i}
                    />
                  ))}
                </div>
                {!spotlightsExpanded && hiddenCount > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-b from-transparent to-background pointer-events-none" />
                )}
              </div>
              {!spotlightsExpanded && hiddenCount > 0 && (
                <button
                  onClick={() => setSpotlightsExpanded(true)}
                  className="mt-2 w-full text-center text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  + {hiddenCount} more {hiddenCount === 1 ? "spotlight" : "spotlights"}
                </button>
              )}
            </div>
          );
        })()}

        {/* ── Podium — always visible ── */}
        <div className="px-5 mb-2">
          {podiumEntries.length > 0 ? (
            <div style={{ animation: "lb-fade-up 350ms ease-out 100ms both" }}>
              <PodiumLayout
                entries={podiumEntries}
                myPlayerId={playerId ?? undefined}
                extendedData={myEntry ? { [myEntry.player_id]: myEntry } : undefined}
                playerSpotlights={spotlights.filter((s) => s.player_id === playerId)}
              />
            </div>
          ) : (
            // Skeleton when nobody joined yet
            <div className="flex items-end gap-2 justify-center">
              {[2, 1, 3].map((rank) => (
                <div key={rank} className="flex-1 flex flex-col items-center" style={{ maxWidth: rank === 1 ? 160 : 130 }}>
                  <div className="size-10 rounded-full bg-surface border border-border mb-2 animate-pulse" />
                  <div className="w-full border border-border bg-surface animate-pulse" style={{ height: rank === 1 ? 96 : rank === 2 ? 72 : 48 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rankings ── */}
        <div className="flex-1">
          {viewerType === "player" && !inTop3 && myEntry ? (
            <PinnedRankSection
              entry={myEntry}
              firstScore={firstScore}
              topEntries={podiumEntries}
              allEntries={leaderboard}
            />
          ) : rankingEntries.length > 0 ? (
            <div className="border-t border-border">
              {rankingEntries.map((entry, i) => (
                <RankingRow
                  key={entry.player_id}
                  entry={entry}
                  firstScore={firstScore}
                  delta={null}
                  isMe={entry.player_id === playerId}
                  animIndex={i}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* ── CTA for public on ended games ── */}
        {gamePhase === "ended" && viewerType === "public" && (
          <div className="mx-5 my-6 border border-primary/20 bg-primary/5 p-6 text-center space-y-3">
            <p className="font-heading text-lg font-bold">Think you can beat them?</p>
            <p className="text-sm text-muted-foreground">
              Join the next <span className="font-semibold text-foreground">{event.title}</span> trivia and prove it.
            </p>
            <Link href="/join" className="inline-flex items-center h-11 px-8 bg-primary text-primary-foreground font-heading font-medium text-sm hover:bg-primary-hover transition-colors">
              Join a Game →
            </Link>
          </div>
        )}
      </div>

      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
