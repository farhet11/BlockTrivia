"use client";

import { useState } from "react";
import { AppHeader } from "@/app/_components/app-header";
import { ShareRow } from "./announce-results-button";

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
  is_suspicious?: boolean;
};

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

export function SummaryView({
  event,
  leaderboard,
  playerCount,
  hostUser,
  sponsors,
}: {
  event: {
    id: string;
    title: string;
    joinCode: string;
    status: string;
    twitter_handle?: string | null;
    hashtags?: string[] | null;
    description?: string | null;
    prizes?: string | null;
    organizer_name?: string | null;
    created_at?: string | null;
  };
  leaderboard: Entry[];
  playerCount: number;
  hostUser?: { id: string; displayName: string; email: string; avatarUrl: string | null };
  sponsors: Sponsor[];
}) {
  const [descExpanded, setDescExpanded] = useState(false);

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

  const avgScore =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, e) => s + e.total_score, 0) / leaderboard.length)
      : 0;
  const avgAccuracy =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, e) => s + Number(e.accuracy), 0) / leaderboard.length)
      : 0;

  // Format date
  const formattedDate = event.created_at
    ? new Date(event.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Organizer display
  const organizerDisplay = event.organizer_name ?? hostUser?.displayName ?? null;

  // Tier 2 conditions
  const hasDescription = !!(event.description?.trim());
  const hasPrizes = !!(event.prizes?.trim());
  const hasSponsors = sponsors.length > 0;
  const hasTier2 = hasDescription || hasPrizes || hasSponsors;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const resultsUrl = `${siteUrl}/results/${event.joinCode}`;

  const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppHeader
        logoHref="/host"
        user={hostUser ?? null}
        avatarUrl={hostUser?.avatarUrl}
        isHost
      />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5 py-8 space-y-8">

        {/* 1.1 Header */}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#22c55e]">Game Ended</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{event.title}</h1>
          {(formattedDate || organizerDisplay) && (
            <p className="text-[14px] text-muted-foreground">
              {[formattedDate, organizerDisplay ? `Hosted by ${organizerDisplay}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="font-mono text-[13px] text-muted-foreground/60">{event.joinCode}</p>
        </div>

        {/* 1.2 Stats Bar */}
        <div className="grid grid-cols-3 border border-border">
          {[
            { label: "Players", value: playerCount },
            { label: "Avg Score", value: avgScore },
            { label: "Accuracy", value: `${avgAccuracy}%` },
          ].map(({ label, value }) => (
            <div key={label} className="border-r border-border last:border-r-0 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* 1.3 Standings Table */}
        <div className="space-y-3">
          <p className={SECTION_LABEL}>
            Full Standings — {leaderboard.length} Players{" "}
            <a
              href={resultsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              ↗
            </a>
          </p>

          <div className="border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground w-10">#</th>
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Name</th>
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Score</th>
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">Correct</th>
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">Accuracy</th>
                  <th className="text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">Avg Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.player_id}
                    className={entry.rank <= 3 ? "bg-primary/5 dark:bg-primary/[0.06]" : ""}
                  >
                    <td className="py-3 px-3">
                      <span className={`font-bold tabular-nums ${entry.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{entry.display_name}</p>
                      {entry.email && !entry.email.startsWith("tg_") && (
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
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {(entry.avg_speed_ms / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leaderboard.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No players participated.</p>
            )}
          </div>
        </div>

        {/* 1.4 Share Row */}
        <ShareRow event={{ title: event.title, joinCode: event.joinCode }} playerCount={playerCount} />

        {/* 1.5 Action Buttons — host only */}
        <div className="flex gap-3">
          <a
            href="/host"
            className="flex-[3] h-12 border border-border bg-surface text-sm font-medium flex items-center justify-center hover:bg-background transition-colors"
          >
            ← Dashboard
          </a>
          <button
            onClick={downloadCSV}
            className="flex-[2] h-12 text-sm font-medium text-primary hover:bg-muted transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Tier 2 — conditional sections */}
        {hasTier2 && (
          <>
            <div className="border-t border-border my-8" />

            <div className="space-y-8">
              {/* 2.1 Event Details */}
              {hasDescription && (
                <div>
                  <p className={SECTION_LABEL}>Event Details</p>
                  <p className={`text-[15px] leading-relaxed text-foreground ${descExpanded ? "" : "line-clamp-3"}`}>
                    {event.description}
                  </p>
                  {!descExpanded && (event.description?.length ?? 0) > 200 && (
                    <button
                      onClick={() => setDescExpanded(true)}
                      className="text-primary text-sm font-medium mt-1"
                    >
                      Read more
                    </button>
                  )}
                </div>
              )}

              {/* 2.2 Prizes */}
              {hasPrizes && (
                <div>
                  <p className={SECTION_LABEL}>Prizes</p>
                  <div className="border border-border p-4">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{event.prizes}</p>
                  </div>
                </div>
              )}

              {/* 2.3 Sponsors */}
              {hasSponsors && (
                <div>
                  <p className={SECTION_LABEL}>Sponsors</p>
                  <div className="flex flex-wrap items-center gap-6">
                    {sponsors.map((s) => (
                      <img
                        key={s.id}
                        src={s.logo_url}
                        alt={s.name ?? "Sponsor"}
                        className="max-h-8 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
