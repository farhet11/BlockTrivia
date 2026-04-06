"use client";

import { useState } from "react";
import { Link } from "lucide-react";
import { AppHeader } from "@/app/_components/app-header";

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

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

function ShareRow({
  event,
  playerCount,
}: {
  event: { title: string; joinCode: string };
  playerCount: number;
}) {
  const [copied, setCopied] = useState(false);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const resultUrl = `${siteUrl}/results/${event.joinCode}`;
  const shareText = `🏆 Results from ${event.title}! ${playerCount} players competed. See the leaderboard: ${resultUrl}`;

  function openTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openTelegram() {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(resultUrl)}&text=${encodeURIComponent(`🏆 Results from ${event.title}! ${playerCount} players competed. See the leaderboard:`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-muted-foreground">Share results</span>
      <div className="flex items-center gap-1">
        <button
          onClick={openTwitter}
          aria-label="Share on X"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <svg className="size-4 dark:fill-white fill-[#09090b]" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </button>
        <button
          onClick={openTelegram}
          aria-label="Share on Telegram"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <svg className="size-4 fill-[#229ED9]" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 13.17l-2.95-.924c-.64-.203-.654-.64.136-.953l11.57-4.461c.537-.194 1.006.131.658.389z" />
          </svg>
        </button>
        <button
          onClick={copyLink}
          aria-label="Copy link"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <Link className="size-4 text-muted-foreground" />
        </button>
        {copied && (
          <span className="text-xs text-primary font-medium ml-1">Copied!</span>
        )}
      </div>
    </div>
  );
}

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
    description?: string | null;
    prizes?: string | null;
    organizer_name?: string | null;
    created_at?: string | null;
  };
  leaderboard: Entry[];
  sponsors: Sponsor[];
  myPlayerId?: string | null;
}) {
  const [descExpanded, setDescExpanded] = useState(false);

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

  const organizerDisplay = event.organizer_name ?? null;

  // Tier 2 conditions
  const hasDescription = !!(event.description?.trim());
  const hasPrizes = !!(event.prizes?.trim());
  const hasSponsors = sponsors.length > 0;
  const hasTier2 = hasDescription || hasPrizes || hasSponsors;

  const SECTION_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppHeader
        right={event.logoUrl ? (
          <img src={event.logoUrl} alt="Event logo" className="h-7 max-w-[110px] object-contain" />
        ) : null}
      />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5 py-8 space-y-8">

        {/* 1.1 Header */}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Game Ended</p>
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
            { label: "Players", value: leaderboard.length },
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
            Full Standings — {leaderboard.length} Players
          </p>

          <div className="border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-9" />
                <col />{/* Name — takes remaining space */}
                <col className="w-16" />
                <col className="w-20 hidden sm:table-column" />
                <col className="w-20 hidden sm:table-column" />
                <col className="w-20 hidden sm:table-column" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">#</th>
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
                    className={[
                      entry.rank <= 3 ? "bg-primary/5 dark:bg-primary/[0.06]" : "",
                      entry.player_id === myPlayerId ? "ring-1 ring-inset ring-primary/30" : "",
                    ].join(" ")}
                  >
                    <td className="py-3 px-3">
                      <span className={`font-bold tabular-nums ${entry.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-0">
                      <p className="font-medium text-foreground truncate">
                        {entry.display_name}
                      </p>
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
        <ShareRow event={{ title: event.title, joinCode: event.joinCode }} playerCount={leaderboard.length} />

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
