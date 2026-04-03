"use client";

import { SponsorBar } from "@/app/_components/sponsor-bar";
import { ThemeToggle } from "@/app/_components/theme-toggle";
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
  rank: number;
  is_top_10_pct: boolean;
};

export function ResultsView({
  event,
  leaderboard,
  sponsors,
  myPlayerId = null,
}: {
  event: {
    id: string;
    title: string;
    joinCode: string;
    twitter_handle: string | null;
    hashtags: string[] | null;
    logoUrl: string | null;
  };
  leaderboard: Entry[];
  sponsors: Sponsor[];
  myPlayerId?: string | null;
}) {
  const podiumEntries = leaderboard.slice(0, 3);
  const rankingEntries = leaderboard.slice(3);
  const firstScore = leaderboard[0]?.total_score ?? 1;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
        <a href="/join">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
        </a>
        {event.logoUrl && (
          <img src={event.logoUrl} alt="Event logo" className="h-7 max-w-[110px] object-contain" />
        )}
        <ThemeToggle />
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-8">
        {/* Title */}
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Final Results</p>
          <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
          <p className="text-xs text-muted-foreground font-mono tracking-wider">{event.joinCode}</p>
        </div>

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
              <PodiumLayout entries={podiumEntries} myPlayerId={myPlayerId ?? undefined} />
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
                isMe={entry.player_id === myPlayerId}
                animIndex={i}
              />
            ))}
          </div>
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
            className="inline-flex items-center h-11 px-8 bg-primary text-primary-foreground font-heading font-medium text-sm hover:bg-primary-hover transition-colors"
          >
            Join a Game →
          </a>
        </div>
      </div>

      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
