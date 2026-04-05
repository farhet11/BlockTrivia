"use client";

/**
 * Shared leaderboard UI primitives used across all leaderboard views:
 *   - PodiumLayout       (top 1/2/3 players — avatar above block, rank bar inside)
 *   - RankingRow         (4th+ with progress bar + rank delta)
 *   - PinnedRankSection  (player's "YOUR RANK" pinned at bottom, with blur context)
 */

import { useEffect, useState } from "react";
import { PlayerAvatar } from "./player-avatar";

export type LbEntry = {
  player_id: string;
  display_name: string;
  total_score: number;
  rank: number;
  avatar_url?: string | null;
};

// ── Animated score count-up ────────────────────────────────────────────────
function CountUp({ target, delay = 0 }: { target: number; delay?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    let raf: number;
    const timer = setTimeout(() => {
      const start = performance.now();
      const dur = 600;
      const tick = (now: number) => {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(eased * target));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, delay]);
  return <>{val}</>;
}

// Rank bar colors: gold / silver / bronze
const RANK_BAR: Record<number, string> = {
  1: "#f59e0b",
  2: "#9ca3af",
  3: "#d97706",
};

// ── Single podium column ───────────────────────────────────────────────────
function PodiumSlot({
  entry,
  extraBottom,
  slideDelay,
  fadeDelay,
  large,
  myPlayerId,
}: {
  entry: LbEntry;
  extraBottom: number;
  slideDelay: number;
  fadeDelay: number;
  large?: boolean;
  myPlayerId?: string;
}) {
  const isMe = myPlayerId != null && entry.player_id === myPlayerId;
  const barColor = RANK_BAR[entry.rank] ?? "#9ca3af";
  const avatarSize = large ? 56 : 48;

  return (
    <div
      className="flex flex-col items-center flex-1"
      style={{
        maxWidth: large ? 160 : 130,
        animation: `lb-fade-up 350ms ease-out ${fadeDelay}ms both`,
      }}
    >
      {/* Avatar floats above the block */}
      <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={avatarSize} url={entry.avatar_url} />

      {/* Block — slides up on mount */}
      <div
        className="w-full border border-border bg-surface overflow-hidden"
        style={{ animation: `podium-slide-up 450ms cubic-bezier(0.22,1,0.36,1) ${slideDelay}ms both` }}
      >
        {/* Colored rank bar */}
        <div
          className="w-full py-1.5 flex items-center justify-center"
          style={{ background: barColor }}
        >
          <span className="text-white font-bold text-sm tabular-nums">{entry.rank}</span>
        </div>

        {/* Name + score inside block */}
        <div className="py-2.5 px-2 text-center space-y-0.5">
          <p
            className="text-xs font-medium text-foreground truncate"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {entry.display_name}
            {isMe && (
              <span className="ml-1 text-[9px] font-semibold" style={{ color: "#7c3aed" }}>
                {" "}(you)
              </span>
            )}
          </p>
          <p
            className={`font-bold tabular-nums ${large ? "text-xl" : "text-base"}`}
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            <CountUp target={entry.total_score} delay={fadeDelay + 150} />
          </p>
        </div>
        {/* Staircase spacer — creates height difference between ranks */}
        {extraBottom > 0 && <div style={{ height: extraBottom }} />}
      </div>
    </div>
  );
}

// ── Podium layout: handles 1/2/3 player edge cases ────────────────────────
export function PodiumLayout({
  entries,
  myPlayerId,
}: {
  entries: LbEntry[];
  myPlayerId?: string;
}) {
  const [first, second, third] = entries;
  if (!first) return null;

  // 1 player only — skip podium, single highlighted row
  if (!second) {
    return (
      <div className="flex items-center gap-3 px-4 py-4 bg-surface border border-border">
        <PlayerAvatar seed={first.player_id} name={first.display_name} size={48} url={first.avatar_url} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate" style={{ fontFamily: "Inter, sans-serif" }}>
            {first.display_name}
          </p>
          {first.player_id === myPlayerId && (
            <span className="text-[9px] text-primary font-semibold">(you)</span>
          )}
        </div>
        <div
          className="size-6 flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: RANK_BAR[1] }}
        >
          1
        </div>
        <span className="font-bold tabular-nums text-xl shrink-0" style={{ fontFamily: "Outfit, sans-serif" }}>
          {first.total_score}
        </span>
      </div>
    );
  }

  // 2+ players — classic podium: 2nd | 1st | 3rd, bottom-aligned
  return (
    <div className="flex items-end gap-2 justify-center">
      {/* 2nd — left */}
      <PodiumSlot entry={second} extraBottom={24} slideDelay={200} fadeDelay={200} myPlayerId={myPlayerId} />
      {/* 1st — center, tallest */}
      <PodiumSlot entry={first} extraBottom={48} slideDelay={400} fadeDelay={400} large myPlayerId={myPlayerId} />
      {/* 3rd — right, shortest */}
      {third && (
        <PodiumSlot entry={third} extraBottom={0} slideDelay={0} fadeDelay={0} myPlayerId={myPlayerId} />
      )}
    </div>
  );
}

// ── Rankings row (4th+ position) ───────────────────────────────────────────
export function RankingRow({
  entry,
  firstScore,
  delta,
  isMe,
  animIndex,
}: {
  entry: LbEntry;
  firstScore: number;
  delta: number | null;
  isMe: boolean;
  animIndex: number;
}) {
  const barPct = firstScore > 0 ? Math.min(100, Math.round((entry.total_score / firstScore) * 100)) : 0;

  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border, #e8e5e0)",
        animation: `lb-slide-in 320ms cubic-bezier(0.22,1,0.36,1) ${animIndex * 50}ms both`,
        ...(isMe
          ? { background: "rgba(124,58,237,0.05)", borderLeft: "2px solid rgba(124,58,237,0.3)" }
          : {}),
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="shrink-0 text-right tabular-nums"
          style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
        >
          {entry.rank}
        </span>
        <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={40} url={entry.avatar_url} />
        <span
          className="flex-1 truncate"
          style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: isMe ? "#7c3aed" : undefined }}
        >
          {entry.display_name}
          {isMe && (
            <span
              className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5"
              style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}
            >
              you
            </span>
          )}
        </span>
        {delta !== null ? (
          <span
            className="shrink-0 tabular-nums text-xs font-medium"
            style={{ fontFamily: "Inter, sans-serif", color: delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#78756e" }}
          >
            {delta > 0 ? `+${delta}▲` : delta < 0 ? `${delta}▼` : "—"}
          </span>
        ) : (
          <span className="shrink-0 text-xs" style={{ fontFamily: "Inter, sans-serif", color: "#78756e" }}>—</span>
        )}
        <span className="shrink-0 tabular-nums font-bold" style={{ fontFamily: "Outfit, sans-serif", fontSize: 16, fontWeight: 600 }}>
          {entry.total_score}
        </span>
      </div>
      <div className="mt-1.5 flex gap-3 items-center">
        <div style={{ width: 20, flexShrink: 0 }} />
        <div style={{ width: 40, flexShrink: 0 }} />
        <div
          className="flex-1 h-1"
          style={{ background: "var(--color-border, #e8e5e0)" }}
        >
          <div
            className="h-full"
            style={{ width: `${barPct}%`, background: "#7c3aed", transition: "width 500ms ease-out" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Pinned "YOUR RANK" — with optional blur context + full leaderboard toggle
export function PinnedRankSection({
  entry,
  firstScore,
  topEntries,
  allEntries,
}: {
  entry: LbEntry;
  firstScore: number;
  visibleCount?: number;
  topEntries?: LbEntry[];
  allEntries?: LbEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  // Simple mode (no blur context) — backward compat for play-view etc.
  if (!topEntries || topEntries.length === 0) {
    return <PinnedRow entry={entry} firstScore={firstScore} />;
  }

  return (
    <div>
      {/* Blurred context rows — compact, no progress bar */}
      <div className="relative">
        <div className="blur-[2px] opacity-40 pointer-events-none select-none">
          {topEntries.map((e) => (
            <div
              key={e.player_id}
              className="flex items-center gap-3 px-4 py-2"
              style={{ borderBottom: "1px solid var(--color-border, #e8e5e0)" }}
            >
              <span
                className="shrink-0 tabular-nums"
                style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: "#78756e", width: 16 }}
              >
                {e.rank}
              </span>
              <PlayerAvatar seed={e.player_id} name={e.display_name} size={28} />
              <span
                className="flex-1 truncate text-sm"
                style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
              >
                {e.display_name}
              </span>
              <span
                className="shrink-0 tabular-nums font-bold text-sm"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {e.total_score}
              </span>
            </div>
          ))}
        </div>
        {/* Full Leaderboard pill — overlays bottom of blurred rows */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 border border-border bg-background px-4 py-1.5 text-xs font-medium text-foreground hover:bg-surface transition-colors rounded-full"
          >
            Full Leaderboard
            <svg
              className={`size-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Full leaderboard (expanded) */}
      {expanded && allEntries && (
        <div className="border border-border">
          {allEntries.map((e, i) => (
            <RankingRow
              key={e.player_id}
              entry={e}
              firstScore={firstScore}
              delta={null}
              isMe={e.player_id === entry.player_id}
              animIndex={i}
            />
          ))}
        </div>
      )}

      {/* Pinned player row */}
      <PinnedRow entry={entry} firstScore={firstScore} />
    </div>
  );
}

// ── Shared pinned highlight row ────────────────────────────────────────────
function PinnedRow({ entry, firstScore }: { entry: LbEntry; firstScore: number }) {
  const barPct = firstScore > 0 ? Math.min(100, Math.round((entry.total_score / firstScore) * 100)) : 0;
  return (
    <div style={{ padding: "12px 16px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}>
      <div className="flex items-center gap-3">
        <span
          className="shrink-0 text-right tabular-nums"
          style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
        >
          {entry.rank}
        </span>
        <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={40} url={entry.avatar_url} />
        <span
          className="flex-1 truncate font-medium"
          style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#7c3aed" }}
        >
          {entry.display_name}
          <span
            className="ml-1.5 text-[9px] font-semibold px-1.5 py-0.5"
            style={{ background: "rgba(124,58,237,0.1)", color: "#7c3aed" }}
          >
            you
          </span>
        </span>
        <span
          className="shrink-0 tabular-nums font-bold"
          style={{ fontFamily: "Outfit, sans-serif", fontSize: 16, fontWeight: 600 }}
        >
          {entry.total_score}
        </span>
      </div>
      <div className="mt-1.5 flex gap-3 items-center">
        <div style={{ width: 20, flexShrink: 0 }} />
        <div style={{ width: 40, flexShrink: 0 }} />
        <div className="flex-1 h-1" style={{ background: "var(--color-border, #e8e5e0)" }}>
          <div
            className="h-full"
            style={{ width: `${barPct}%`, background: "#7c3aed", transition: "width 500ms ease-out" }}
          />
        </div>
      </div>
    </div>
  );
}
