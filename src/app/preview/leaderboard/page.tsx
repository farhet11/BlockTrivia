"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PodiumLayout, RankingRow, PinnedRankSection, type LbEntry } from "@/app/_components/lb-podium";

const MOCK_SPONSORS = [
  { id: "s1", name: "BlockTrivia", logo_url: "/logo-dark.svg", sort_order: 0 },
];

// ── Sample data: 8 players ────────────────────────────────────────────────
const MOCK_LEADERBOARD: LbEntry[] = [
  { player_id: "p1", display_name: "CryptoSage", total_score: 820, rank: 1 },
  { player_id: "p2", display_name: "MaxWeb3", total_score: 710, rank: 2 },
  { player_id: "p3", display_name: "SolanaFan", total_score: 645, rank: 3 },
  { player_id: "p4", display_name: "DegenQueen", total_score: 580, rank: 4 },
  { player_id: "p5", display_name: "EthMaxi_2024", total_score: 520, rank: 5 },
  { player_id: "p6", display_name: "AdamFarouq", total_score: 475, rank: 6 },
  { player_id: "p7", display_name: "JennyDAO", total_score: 310, rank: 7 },
  { player_id: "p8", display_name: "RektCapital", total_score: 180, rank: 8 },
];

const MOCK_DELTAS = new Map<string, number | null>([
  ["p1", 2],   // moved up 2
  ["p2", -1],  // dropped 1
  ["p3", 0],   // no change
  ["p4", 3],   // big climb
  ["p5", -2],  // dropped 2
  ["p6", null], // first round (no prev)
  ["p7", 1],
  ["p8", -1],
]);

// Simulated "you" is rank 12 (outside top 10)
const MY_ENTRY: LbEntry = {
  player_id: "p-me",
  display_name: "You (preview)",
  total_score: 145,
  rank: 12,
};

export default function LeaderboardPreview() {
  const [view, setView] = useState<"player" | "host" | "final" | "2players">("player");
  const [showShareMock, setShowShareMock] = useState(false);

  const podiumEntries = MOCK_LEADERBOARD.slice(0, 3);
  const rankingEntries = MOCK_LEADERBOARD.slice(3);
  const firstScore = MOCK_LEADERBOARD[0]?.total_score ?? 1;

  // 2-player variant
  const TWO_PLAYERS: LbEntry[] = MOCK_LEADERBOARD.slice(0, 2);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
        <Link href="/">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* View toggle */}
      <div className="max-w-lg mx-auto w-full px-5 pt-4">
        <div className="grid grid-cols-4 border border-border divide-x divide-border">
          {(["player", "host", "final", "2players"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {v === "2players" ? "2 Players" : v}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 max-w-lg mx-auto w-full px-5 py-6 space-y-5 pb-8`}>
        {/* Heading + event name */}
        <div className="text-center space-y-0.5" style={{ animation: "lb-fade-up 280ms ease-out both" }}>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
            {view === "final" ? "Game Over" : "Standings · Round 2 of 3"}
          </p>
          <h2 className="font-heading text-2xl font-bold">
            {view === "final" ? "Final Results" : "Leaderboard"}
          </h2>
          <p className="text-sm text-muted-foreground font-medium">Sample Event - 2027</p>
        </div>

        {/* Waiting indicator — player view, pinned to top */}
        {view === "player" && (
          <p className="text-center text-xs text-muted-foreground animate-pulse">
            Waiting for host to continue...
          </p>
        )}

        {/* Stats bar */}
        {view !== "final" && (
          <div
            className={`grid border border-border divide-x divide-border ${
              view === "host" ? "grid-cols-4" : "grid-cols-3"
            }`}
            style={{ animation: "lb-fade-up 280ms ease-out 80ms both" }}
          >
            <div className="px-3 py-2.5 text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Players</p>
              <p className="font-heading text-lg font-bold tabular-nums">
                {view === "2players" ? 2 : 24}
              </p>
            </div>
            <div className="px-3 py-2.5 text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Question</p>
              <p className="font-heading text-lg font-bold tabular-nums">7/11</p>
            </div>
            <div className="px-3 py-2.5 text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Round</p>
              <p className="font-heading text-lg font-bold tabular-nums">2/3</p>
            </div>
            {view === "host" && (
              <button
                onClick={() => setShowShareMock(true)}
                className="px-3 py-2.5 text-center hover:bg-accent transition-colors"
              >
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Join Code</p>
                <p className="font-heading text-lg font-bold text-primary font-mono tracking-wider">ZWXSP</p>
              </button>
            )}
          </div>
        )}

        {/* Share result placeholder — final view */}
        {view === "final" && (
          <div className="border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">Share Your Result</p>
            <p className="text-sm text-muted-foreground">ShareResultButton renders here in the real view</p>
          </div>
        )}

        {/* PODIUM */}
        <div
          key={view}
          style={{ animation: "lb-fade-up 350ms ease-out 160ms both" }}
        >
          {view === "2players" ? (
            <PodiumLayout entries={TWO_PLAYERS} myPlayerId="p2" />
          ) : (
            <PodiumLayout
              entries={podiumEntries}
              myPlayerId={view === "player" || view === "final" ? "p3" : undefined}
            />
          )}
        </div>

        {/* RANKINGS — 4th+ */}
        {view !== "2players" && rankingEntries.length > 0 && (
          <div className="border-t border-border" key={`rank-${view}`}>
            {rankingEntries.map((entry, i) => (
              <RankingRow
                key={entry.player_id}
                entry={entry}
                firstScore={firstScore}
                delta={view === "final" ? null : (MOCK_DELTAS.get(entry.player_id) ?? null)}
                isMe={view === "player" || view === "final" ? false : false}
                animIndex={i + 3}
              />
            ))}
          </div>
        )}

        {/* PINNED YOUR RANK — player view only */}
        {view === "player" && (
          <PinnedRankSection entry={MY_ENTRY} firstScore={firstScore} />
        )}

        {/* Sponsor bar */}
        <SponsorBar sponsors={MOCK_SPONSORS} />

        {/* Next Question — inline for host view, no sticky overlap */}
        {view === "host" && (
          <div className="pt-2 pb-4">
            <button className="w-full h-12 bg-primary text-primary-foreground font-heading font-semibold hover:bg-primary-hover transition-colors">
              Next Question
            </button>
          </div>
        )}
      </div>

      {/* Share drawer mock */}
      {showShareMock && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowShareMock(false)}>
          <div className="bg-background w-full max-w-lg mx-auto p-6 space-y-4 border-t border-border" onClick={(e) => e.stopPropagation()}>
            <p className="font-heading text-lg font-bold text-center">Share Game</p>
            <p className="text-sm text-muted-foreground text-center">ShareDrawer (QR + buttons) renders here in the real view</p>
            <p className="text-center font-mono text-2xl font-bold text-primary tracking-[0.2em]">ZWXSP</p>
            <button onClick={() => setShowShareMock(false)} className="w-full h-11 border border-border font-medium">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
