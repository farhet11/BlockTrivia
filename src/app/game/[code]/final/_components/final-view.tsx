"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { ShareResultButton } from "./share-result-button";
import { PodiumLayout, RankingRow } from "@/app/_components/lb-podium";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

type Entry = {
  player_id: string;
  display_name: string;
  total_score: number;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  avg_speed_ms: number;
  rank: number;
  is_top_10_pct: boolean;
};

export function FinalView({
  event,
  player,
  leaderboard,
  myEntry,
  totalPlayers,
  sponsors,
}: {
  event: { id?: string; title: string; joinCode: string; twitter_handle?: string | null; hashtags?: string[] | null; logoUrl?: string | null };
  player: { id: string };
  leaderboard: Entry[];
  myEntry: Entry | null;
  totalPlayers?: number;
  sponsors: Sponsor[];
}) {
  const podiumEntries = leaderboard.slice(0, 3);
  const rankingEntries = leaderboard.slice(3);
  const firstScore = leaderboard[0]?.total_score ?? 1;

  useEffect(() => {
    // Burst from both sides
    const left = confetti({
      particleCount: 80,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"],
    });
    const right = confetti({
      particleCount: 80,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"],
    });
    // Second wave after short delay
    const timer = setTimeout(() => {
      confetti({
        particleCount: 60,
        angle: 90,
        spread: 120,
        origin: { x: 0.5, y: 0.5 },
        colors: ["#7c3aed", "#a78bfa", "#fbbf24", "#f9fafb"],
        scalar: 0.9,
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      left?.then?.(() => {});
      right?.then?.(() => {});
    };
  }, []);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
        <a href="/join">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
        </a>
        <ThemeToggle />
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-8">
        {/* Title */}
        <div className="text-center space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">Game Over</p>
          <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
        </div>

        {/* Personal result */}
        {myEntry && (
          <div className={`border p-4 space-y-3 ${myEntry.is_top_10_pct ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Your result</p>
                <p className="font-heading text-xl font-bold">#{myEntry.rank}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Score</p>
                <p className="font-heading text-xl font-bold tabular-nums">{myEntry.total_score}</p>
              </div>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground border-t border-border pt-3">
              <span>
                <span className="font-semibold text-foreground">{myEntry.correct_count}/{myEntry.total_questions}</span> correct
              </span>
              <span>
                <span className="font-semibold text-foreground">{Math.round(Number(myEntry.accuracy))}%</span> accuracy
              </span>
              <span>
                <span className="font-semibold text-foreground">{(myEntry.avg_speed_ms / 1000).toFixed(1)}s</span> avg speed
              </span>
            </div>
            {myEntry.is_top_10_pct && (
              <p className="text-xs font-bold text-primary uppercase tracking-wider">
                ★ Top 10% of players
              </p>
            )}
          </div>
        )}

        {/* Share result */}
        {myEntry && event.id && (
          <ShareResultButton
            event={{ id: event.id, title: event.title, joinCode: event.joinCode, twitter_handle: event.twitter_handle ?? null, hashtags: event.hashtags ?? null }}
            myEntry={myEntry}
            totalPlayers={totalPlayers ?? leaderboard.length}
          />
        )}

        {/* Podium — top 3 */}
        {podiumEntries.length > 0 && (
          <div className="space-y-2">
            <p
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              style={{ animation: "lb-fade-up 280ms ease-out both" }}
            >
              Top Players
            </p>
            <div style={{ animation: "lb-fade-up 350ms ease-out 100ms both" }}>
              <PodiumLayout entries={podiumEntries} myPlayerId={player.id} />
            </div>
          </div>
        )}

        {/* Full standings — 4th+ with progress bars */}
        {rankingEntries.length > 0 && (
          <div className="border-t border-border">
            {rankingEntries.map((entry, i) => (
              <RankingRow
                key={entry.player_id}
                entry={entry}
                firstScore={firstScore}
                delta={null}
                isMe={entry.player_id === player.id}
                animIndex={i}
              />
            ))}
          </div>
        )}

      </div>
      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
