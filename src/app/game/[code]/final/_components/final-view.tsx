"use client";

import { useEffect, useMemo } from "react";
import confetti from "canvas-confetti";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { createClient } from "@/lib/supabase";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { ShareResultButton } from "./share-result-button";

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
  event: { id: string; title: string; joinCode: string; twitter_handle: string | null; hashtags: string[] | null };
  player: { id: string };
  leaderboard: Entry[];
  myEntry: Entry | null;
  totalPlayers: number;
  sponsors: Sponsor[];
}) {
  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const supabase = useMemo(() => createClient(), []);

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
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/join"; }}
            aria-label="Sign out"
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-8">
        {/* Title */}
        <div className="text-center space-y-1">
          <p className="font-brand text-sm font-semibold text-primary italic tracking-wide">Game Over</p>
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
        {myEntry && (
          <ShareResultButton
            event={event}
            myEntry={myEntry}
            totalPlayers={totalPlayers}
          />
        )}

        {/* Podium */}
        {podium.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top Players</p>
            <div className="flex items-end gap-2 sm:gap-3 justify-center pt-4">
              {/* 2nd */}
              {podium[1] && (
                <div className="flex-1 max-w-[120px] flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-foreground truncate w-full text-center">{podium[1].display_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{podium[1].total_score} pts</span>
                  <div className="w-full h-16 bg-zinc-400/20 border border-zinc-400/40 flex items-center justify-center">
                    <span className="text-2xl">2nd</span>
                  </div>
                </div>
              )}
              {/* 1st */}
              {podium[0] && (
                <div className="flex-1 max-w-[140px] flex flex-col items-center gap-1">
                  <span className="text-sm font-semibold text-foreground truncate w-full text-center">{podium[0].display_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{podium[0].total_score} pts</span>
                  <div className="w-full h-24 bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center">
                    <span className="text-3xl">1st</span>
                  </div>
                </div>
              )}
              {/* 3rd */}
              {podium[2] && (
                <div className="flex-1 max-w-[120px] flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-foreground truncate w-full text-center">{podium[2].display_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{podium[2].total_score} pts</span>
                  <div className="w-full h-12 bg-amber-700/20 border border-amber-700/40 flex items-center justify-center">
                    <span className="text-xl">3rd</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full standings */}
        {rest.length > 0 && (
          <ul className="space-y-1.5">
            {rest.map((entry) => {
              const isMe = entry.player_id === player.id;
              return (
                <li
                  key={entry.player_id}
                  className={`flex items-center gap-3 px-3 py-2.5 border text-sm ${
                    isMe ? "border-primary/50 bg-primary/5" : "border-border"
                  }`}
                >
                  <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">
                    {entry.rank}
                  </span>
                  <span className={`flex-1 font-medium ${isMe ? "text-primary" : "text-foreground"}`}>
                    {entry.display_name}
                    {isMe && <span className="ml-1 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">you</span>}
                  </span>
                  <span className="font-bold tabular-nums">{entry.total_score}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pt-2">
          <a
            href="/join"
            className="block w-full h-11 bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center hover:bg-primary-hover transition-colors"
          >
            Play Again
          </a>
        </div>
      </div>
      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
