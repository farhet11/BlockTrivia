"use client";

import { PlayerHeader } from "@/app/_components/player-header";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PodiumLayout, PinnedRankSection, type LbEntry } from "@/app/_components/lb-podium";

// ── 12 players, "you" are rank 14 (outside top 10) ──────────────────────────
const MOCK_LEADERBOARD: LbEntry[] = [
  { player_id: "p1",  display_name: "CryptoSage",    total_score: 1420, rank: 1 },
  { player_id: "p2",  display_name: "MaxWeb3",       total_score: 1280, rank: 2 },
  { player_id: "p3",  display_name: "SolanaFan",     total_score: 1145, rank: 3 },
  { player_id: "p4",  display_name: "DegenQueen",    total_score: 980,  rank: 4 },
  { player_id: "p5",  display_name: "EthMaxi_2024",  total_score: 920,  rank: 5 },
  { player_id: "p6",  display_name: "ChainRunner",   total_score: 855,  rank: 6 },
  { player_id: "p7",  display_name: "JennyDAO",      total_score: 710,  rank: 7 },
  { player_id: "p8",  display_name: "RektCapital",   total_score: 640,  rank: 8 },
  { player_id: "p9",  display_name: "DeFiDegen",     total_score: 580,  rank: 9 },
  { player_id: "p10", display_name: "TokenWhale",    total_score: 520,  rank: 10 },
];

// Deltas kept for reference but not used in pinned preview
// const MOCK_DELTAS = new Map([...]);

const MY_PLAYER = { id: "p-me", displayName: "Adam" };
const MY_ENTRY: LbEntry = {
  player_id: "p-me",
  display_name: "Adam",
  total_score: 285,
  rank: 14,
};

const MOCK_SPONSORS = [
  { id: "s1", name: "ARO Network", logo_url: "/logo-dark.svg", sort_order: 0 },
  { id: "s2", name: "BlockTrivia", logo_url: "/logo-dark.svg", sort_order: 1 },
];

export default function LeaderboardPinnedPreview() {
  const podiumEntries = MOCK_LEADERBOARD.slice(0, 3);

  const firstScore = MOCK_LEADERBOARD[0]?.total_score ?? 1;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <PlayerHeader user={MY_PLAYER} />

      <div className="flex-1 max-w-lg mx-auto w-full px-5 pt-16 pb-8 space-y-3">
        {/* Event info */}
        <div
          className="text-center space-y-1.5"
          style={{ animation: "lb-fade-up 280ms ease-out both" }}
        >
          <h2 className="font-heading text-xl font-semibold text-foreground">Real Assets</h2>
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Hosted by</p>
          <div className="flex justify-center">
            <img src="/logo-light.svg" alt="" className="h-5 object-contain dark:hidden" />
            <img src="/logo-dark.svg" alt="" className="h-5 object-contain hidden dark:block" />
          </div>
        </div>

        {/* Waiting indicator */}
        <div
          className="flex justify-center"
          style={{ animation: "lb-fade-up 280ms ease-out 40ms both" }}
        >
          <div className="inline-flex items-center gap-1.5 bg-timer-warn/10 px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-timer-warn animate-pulse" />
            <span className="text-[10px] font-medium text-timer-warn uppercase tracking-wider">Waiting for host</span>
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="grid grid-cols-3 border border-border divide-x divide-border"
          style={{ animation: "lb-fade-up 280ms ease-out 80ms both" }}
        >
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Players</p>
            <p className="font-heading text-lg font-bold tabular-nums">18</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Question</p>
            <p className="font-heading text-lg font-bold tabular-nums">7/11</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Round</p>
            <p className="font-heading text-lg font-bold tabular-nums">2/3</p>
          </div>
        </div>

        {/* PODIUM */}
        <div style={{ animation: "lb-fade-up 350ms ease-out 160ms both" }}>
          <PodiumLayout entries={podiumEntries} myPlayerId={MY_PLAYER.id} />
        </div>

        {/* YOUR RANK — blurred top 3 context + highlighted you at #14 */}
        <PinnedRankSection
          entry={MY_ENTRY}
          firstScore={firstScore}
          visibleCount={MOCK_LEADERBOARD.length}
          topEntries={MOCK_LEADERBOARD.slice(0, 3)}
          allEntries={MOCK_LEADERBOARD}
        />
      </div>

      <SponsorBar sponsors={MOCK_SPONSORS} />
    </div>
  );
}
