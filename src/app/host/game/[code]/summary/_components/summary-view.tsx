"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { AnnounceResultsButton } from "./announce-results-button";

type Entry = {
  player_id: string;
  display_name: string;
  email: string;
  total_score: number;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  avg_speed_ms: number;
  rank: number;
  is_top_10_pct: boolean;
};

export function SummaryView({
  event,
  leaderboard,
  playerCount,
}: {
  event: { id: string; title: string; joinCode: string; status: string; twitter_handle: string | null; hashtags: string[] | null };
  leaderboard: Entry[];
  playerCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);

  function downloadCSV() {
    const headers = ["Rank", "Name", "Email", "Score", "Correct", "Total", "Accuracy %", "Avg Speed (s)", "Top 10%"];
    const rows = leaderboard.map((e) => [
      e.rank,
      `"${e.display_name.replace(/"/g, '""')}"`,
      `"${e.email.replace(/"/g, '""')}"`,
      e.total_score,
      e.correct_count,
      e.total_questions,
      Math.round(Number(e.accuracy)),
      (e.avg_speed_ms / 1000).toFixed(2),
      e.is_top_10_pct ? "Yes" : "No",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/[^a-z0-9]/gi, "_")}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const top10Count = leaderboard.filter((e) => e.is_top_10_pct).length;
  const avgScore =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, e) => s + e.total_score, 0) / leaderboard.length)
      : 0;
  const avgAccuracy =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, e) => s + Number(e.accuracy), 0) / leaderboard.length)
      : 0;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-3xl mx-auto">
          <a href="/host">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              Export CSV
            </button>
            <ThemeToggle />
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
              aria-label="Sign out"
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-5 py-8 space-y-8">
        {/* Event title */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Game Ended</p>
          <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
          <p className="text-sm text-muted-foreground font-mono tracking-wider">{event.joinCode}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Players", value: playerCount },
            { label: "Avg Score", value: avgScore },
            { label: "Avg Accuracy", value: `${avgAccuracy}%` },
            { label: "Top 10%", value: top10Count },
          ].map(({ label, value }) => (
            <div key={label} className="border border-border bg-surface p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Leaderboard table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Full Standings — {leaderboard.length} players
            </p>
            <button
              onClick={downloadCSV}
              className="text-xs text-primary hover:underline"
            >
              Download CSV
            </button>
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-12">#</th>
                  <th className="text-left py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-right py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Score</th>
                  <th className="text-right py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Correct</th>
                  <th className="text-right py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Accuracy</th>
                  <th className="text-right py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Avg Speed</th>
                  <th className="text-center py-2.5 px-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-16">Top 10%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.player_id}
                    className={`${entry.is_top_10_pct ? "bg-primary/5" : ""}`}
                  >
                    <td className="py-3 px-3">
                      <span className={`font-bold tabular-nums ${
                        entry.rank === 1 ? "text-yellow-500" :
                        entry.rank === 2 ? "text-zinc-400" :
                        entry.rank === 3 ? "text-amber-700" :
                        "text-muted-foreground"
                      }`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{entry.display_name}</p>
                      {entry.email && (
                        <p className="text-xs text-muted-foreground">{entry.email}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums">{entry.total_score}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {entry.correct_count}/{entry.total_questions}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {Math.round(Number(entry.accuracy))}%
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      {(entry.avg_speed_ms / 1000).toFixed(1)}s
                    </td>
                    <td className="py-3 px-3 text-center hidden sm:table-cell">
                      {entry.is_top_10_pct && (
                        <span className="text-xs font-bold text-primary">★</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {leaderboard.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No players completed this game yet.
            </p>
          )}
        </div>

        {/* Announce results */}
        <AnnounceResultsButton
          event={event}
          playerCount={playerCount}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <a
            href="/host"
            className="h-11 px-6 bg-surface border border-border text-sm font-medium flex items-center hover:bg-background transition-colors"
          >
            ← Dashboard
          </a>
          <button
            onClick={downloadCSV}
            className="h-11 px-6 bg-primary text-primary-foreground text-sm font-medium flex items-center hover:bg-primary-hover transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
