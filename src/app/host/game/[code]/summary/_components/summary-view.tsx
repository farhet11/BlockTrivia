"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink, Send, Link2, Check, Download } from "lucide-react";
import { ThemeToggle } from "@/app/_components/theme-toggle";

const ICON_CLASS = "text-stone-500 dark:text-zinc-400";
const ICON_PROPS = { size: 20, strokeWidth: 2.5 } as const;

type Entry = {
  player_id: string;
  display_name: string;
  username: string;
  full_name: string;
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
  event: { id: string; title: string; joinCode: string; status: string; twitter_handle?: string | null; hashtags?: string[] | null };
  leaderboard: Entry[];
  playerCount: number;
}) {
  // ── CSV Export ───────────────────────────────────────────────────────────────
  function downloadCSV() {
    const headers = ["Rank", "Username", "Name", "Full Name", "Email", "Score", "Correct", "Total", "Accuracy %", "Avg Speed (s)", "Top 10%"];
    const rows = leaderboard.map((e) => [
      e.rank,
      `"${(e.username || "").replace(/"/g, '""')}"`,
      `"${e.display_name.replace(/"/g, '""')}"`,
      `"${(e.full_name || "").replace(/"/g, '""')}"`,
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

  // ── Share helpers ───────────────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const resultUrl = `${siteUrl}/results/${event.joinCode}`;
  const btTwitter = process.env.NEXT_PUBLIC_BLOCKTRIVIA_TWITTER;
  const hashtagStr = ["BlockTrivia", ...(event.hashtags ?? [])].map((h) => `#${h}`).join(" ");
  const handleStr = event.twitter_handle ? ` @${event.twitter_handle}` : "";
  const btStr = btTwitter ? ` @${btTwitter}` : "";
  const shareText = `Results from ${event.title}! ${playerCount} players competed. See the leaderboard:${handleStr}${btStr} ${hashtagStr}`;

  function openTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(resultUrl)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openTelegram() {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(resultUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  const [copied, setCopied] = useState(false);
  async function copyLink() {
    await navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const avgScore = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((s, e) => s + e.total_score, 0) / leaderboard.length)
    : 0;
  const avgAccuracy = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((s, e) => s + Number(e.accuracy), 0) / leaderboard.length)
    : 0;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* ── Header: logo left, utility right (sacred — nothing else) ──────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-3xl mx-auto">
          <a href="/host">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <a
              href="/api/auth/signout"
              aria-label="Sign out"
              className="p-2 hover:text-violet-600 transition-colors duration-150"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={ICON_CLASS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-5 pt-14 py-8 space-y-8">
        {/* ── Context label + title + metadata ────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">
            Post-Event Summary
          </p>
          <h1 className="font-heading text-[28px] font-bold leading-tight">{event.title}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-primary tracking-wider font-bold">{event.joinCode}</span>
            <span className="mx-1.5">&middot;</span>
            <span className="uppercase">Game Ended</span>
          </p>
        </div>

        {/* ── Stat cards (3 max) ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Joined", value: playerCount },
            { label: "Avg Score", value: avgScore },
            { label: "Accuracy", value: `${avgAccuracy}%` },
          ].map(({ label, value }) => (
            <div key={label} className="border border-border bg-surface p-4 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">{label}</p>
              <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Standings table ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">
            Final Standings — {leaderboard.length} players
          </p>
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
                  <tr key={entry.player_id} className={entry.is_top_10_pct ? "bg-primary/5" : ""}>
                    <td className="py-3 px-3">
                      <span className={`font-bold tabular-nums ${
                        entry.rank === 1 ? "text-yellow-500" :
                        entry.rank === 2 ? "text-zinc-400" :
                        entry.rank === 3 ? "text-amber-700" :
                        "text-muted-foreground"
                      }`}>{entry.rank}</span>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">
                        {entry.username ? `@${entry.username}` : entry.display_name}
                      </p>
                      {entry.full_name && (
                        <p className="text-xs text-muted-foreground">{entry.full_name}</p>
                      )}
                      {entry.email && !entry.email.startsWith("tg_") && (
                        <p className="text-xs text-muted-foreground">{entry.email}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums">{entry.total_score}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{entry.correct_count}/{entry.total_questions}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{Math.round(Number(entry.accuracy))}%</td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">{(entry.avg_speed_ms / 1000).toFixed(1)}s</td>
                    <td className="py-3 px-3 text-center hidden sm:table-cell">
                      {entry.is_top_10_pct && <span className="text-xs font-bold text-primary">★</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leaderboard.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No players completed this game yet.</p>
          )}
        </div>

        {/* ── Row 1: Navigation + data (most important) ─────────────────── */}
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <a
              href="/host"
              className="h-14 bg-primary text-primary-foreground text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors duration-150"
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
              Dashboard
            </a>
            <a
              href={`/results/${event.joinCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-14 border border-border text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors duration-150"
            >
              <ExternalLink {...ICON_PROPS} className={ICON_CLASS} />
              Public Leaderboard
            </a>
            <button
              onClick={downloadCSV}
              className="h-14 bg-primary text-primary-foreground text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors duration-150"
            >
              <Download size={20} strokeWidth={2.5} />
              Export CSV
            </button>
          </div>

          {/* ── Row 2: Share results ──────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400 text-center mb-2">
              Share Results
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={openTwitter}
                className="h-12 border border-border text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors duration-150"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={ICON_CLASS} aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
                X Post
              </button>
              <button
                onClick={openTelegram}
                className="h-12 border border-border text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors duration-150"
              >
                <Send size={16} strokeWidth={2.5} className={ICON_CLASS} />
                Telegram
              </button>
              <button
                onClick={copyLink}
                className="h-12 border border-border text-sm font-heading font-medium text-primary flex items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary transition-colors duration-150"
              >
                {copied ? <Check size={16} strokeWidth={2.5} className="text-green-500" /> : <Link2 size={16} strokeWidth={2.5} className="text-primary" />}
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
