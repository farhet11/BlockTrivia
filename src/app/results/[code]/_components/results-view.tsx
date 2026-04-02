"use client";

import { PlayerAvatar } from "@/app/_components/player-avatar";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { ThemeToggle } from "@/app/_components/theme-toggle";

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
  rank: number;
  is_top_10_pct: boolean;
};

export function ResultsView({
  event,
  leaderboard,
  sponsors,
}: {
  event: {
    id: string;
    title: string;
    joinCode: string;
    twitter_handle: string | null;
    hashtags: string[] | null;
  };
  leaderboard: Entry[];
  sponsors: Sponsor[];
}) {
  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

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
          <p className="font-brand text-sm font-semibold text-primary italic tracking-wide">Final Results</p>
          <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
          <p className="text-xs text-muted-foreground font-mono tracking-wider">{event.joinCode}</p>
        </div>

        {/* Podium */}
        {podium.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top Players</p>
            <div className="flex items-end gap-2 sm:gap-3 justify-center pt-4">
              {/* 2nd */}
              {podium[1] && (
                <div className="flex-1 max-w-[120px] flex flex-col items-center gap-1">
                  <PlayerAvatar seed={podium[1].player_id} name={podium[1].display_name} size={36} />
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
                  <PlayerAvatar seed={podium[0].player_id} name={podium[0].display_name} size={44} />
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
                  <PlayerAvatar seed={podium[2].player_id} name={podium[2].display_name} size={36} />
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
            {rest.map((entry) => (
              <li
                key={entry.player_id}
                className="flex items-center gap-3 px-3 py-2.5 border border-border text-sm"
              >
                <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
                <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={28} />
                <span className="flex-1 font-medium text-foreground">{entry.display_name}</span>
                <span className="text-muted-foreground tabular-nums text-xs">{Math.round(Number(entry.accuracy))}%</span>
                <span className="font-bold tabular-nums">{entry.total_score}</span>
              </li>
            ))}
          </ul>
        )}

        {leaderboard.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No results yet.
          </p>
        )}

        {/* CTA */}
        <div className="border border-primary/20 bg-primary/5 p-6 text-center space-y-3">
          <p className="font-heading text-lg font-bold">Think you can beat them?</p>
          <p className="text-sm text-muted-foreground">
            Join the next <span className="font-semibold text-foreground">{event.title}</span> trivia and prove it.
          </p>
          <a
            href="/join"
            className="inline-flex items-center h-11 px-8 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-hover transition-colors"
          >
            Join a Game →
          </a>
        </div>
      </div>

      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
