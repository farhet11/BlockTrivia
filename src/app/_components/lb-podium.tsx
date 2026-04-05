"use client";

/**
 * Shared leaderboard UI primitives used across all leaderboard views:
 *   - PodiumLayout  (top 1/2/3 players with animated blocks)
 *   - RankingRow    (4th+ with progress bar + rank delta)
 *   - PinnedRankSection  (player's "YOUR RANK" pinned at bottom, player view only)
 */

import { useEffect, useState } from "react";
import { PlayerAvatar } from "./player-avatar";
import { RankBadge } from "./rank-badge";

export type LbEntry = {
  player_id: string;
  display_name: string;
  total_score: number;
  rank: number;
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
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
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

// ── Single podium column ───────────────────────────────────────────────────
function PodiumSlot({
  entry,
  blockHeight,
  slideDelay,
  fadeDelay,
  large,
  myPlayerId,
}: {
  entry: LbEntry;
  blockHeight: number;
  slideDelay: number;
  fadeDelay: number;
  large?: boolean;
  myPlayerId?: string;
}) {
  const isMe = myPlayerId != null && entry.player_id === myPlayerId;
  const avatarSize = large ? 48 : 40;

  // Rank bar color per position
  const rankColors: Record<number, string> = { 1: "#f59e0b", 2: "#a1a1aa", 3: "#d97706" };
  const rankColor = rankColors[entry.rank] ?? "#78756e";

  return (
    <div
      className="flex flex-col items-center gap-0.5 flex-1"
      style={{
        maxWidth: large ? 120 : 100,
        animation: `lb-fade-up 350ms ease-out ${fadeDelay}ms both`,
      }}
    >
      <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={avatarSize} />
      {/* Rank bar (full width) + podium block */}
      <div
        className="w-full"
        style={{ animation: `podium-slide-up 450ms cubic-bezier(0.22,1,0.36,1) ${slideDelay}ms both` }}
      >
        {/* Rank number bar — full width, rank color */}
        <div
          className="w-full flex items-center justify-center"
          style={{ height: large ? 28 : 24, background: rankColor }}
        >
          <span
            className="font-heading font-extrabold text-white tabular-nums"
            style={{ fontSize: large ? 16 : 14 }}
          >
            {entry.rank}
          </span>
        </div>
        {/* Podium block with name + score inside */}
        <div
          className="w-full flex flex-col items-center justify-center gap-0.5 px-1"
          style={{
            height: blockHeight,
            background: "rgba(124,58,237,0.06)",
          }}
        >
          <p
            className="text-[11px] font-medium text-foreground truncate w-full text-center leading-tight"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {entry.display_name}
          </p>
          {isMe && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5"
              style={{ background: "rgba(124,58,237,0.15)", color: "#7c3aed" }}
            >
              you
            </span>
          )}
          <p
            className={`font-bold tabular-nums text-foreground ${large ? "text-lg" : "text-sm"}`}
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            <CountUp target={entry.total_score} delay={fadeDelay + 150} />
          </p>
        </div>
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
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}
      >
        <PlayerAvatar seed={first.player_id} name={first.display_name} size={48} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate" style={{ fontFamily: "Inter, sans-serif" }}>
            {first.display_name}
          </p>
          {first.player_id === myPlayerId && (
            <span className="text-[9px] text-primary font-semibold">(you)</span>
          )}
        </div>
        <RankBadge rank={1} size={28} variant="podium" />
        <span className="font-bold tabular-nums text-xl" style={{ fontFamily: "Outfit, sans-serif" }}>
          {first.total_score}
        </span>
      </div>
    );
  }

  // 2+ players — classic podium: 2nd | 1st | 3rd
  return (
    <div className="flex items-end gap-1.5 justify-center">
      {/* 2nd — left, medium height */}
      <PodiumSlot
        entry={second}
        blockHeight={65}
        slideDelay={200}
        fadeDelay={200}
        myPlayerId={myPlayerId}
      />
      {/* 1st — center, tallest */}
      <PodiumSlot
        entry={first}
        blockHeight={90}
        slideDelay={400}
        fadeDelay={400}
        large
        myPlayerId={myPlayerId}
      />
      {/* 3rd — right, shortest (only if exists) */}
      {third && (
        <PodiumSlot
          entry={third}
          blockHeight={45}
          slideDelay={0}
          fadeDelay={0}
          myPlayerId={myPlayerId}
        />
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
  /** Positive = moved up, negative = moved down, null = no previous data */
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
      {/* Name row */}
      <div className="flex items-center gap-3">
        <span
          className="shrink-0 text-right tabular-nums"
          aria-label={`Rank ${entry.rank}`}
          style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
        >
          {entry.rank}
        </span>
        <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={40} />
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: isMe ? "#7c3aed" : undefined,
          }}
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
        {/* Rank delta */}
        {delta !== null ? (
          <span
            className="shrink-0 tabular-nums text-xs font-medium"
            style={{
              fontFamily: "Inter, sans-serif",
              color: delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#78756e",
            }}
            aria-label={delta > 0 ? `Up ${delta}` : delta < 0 ? `Down ${Math.abs(delta)}` : "No change"}
          >
            {delta > 0 ? `+${delta}▲` : delta < 0 ? `${delta}▼` : "—"}
          </span>
        ) : (
          <span
            className="shrink-0 text-xs"
            style={{ fontFamily: "Inter, sans-serif", color: "#78756e" }}
          >
            —
          </span>
        )}
        <span
          className="shrink-0 tabular-nums font-bold"
          style={{ fontFamily: "Outfit, sans-serif", fontSize: 16, fontWeight: 600 }}
        >
          {entry.total_score}
        </span>
      </div>
      {/* Progress bar — aligned with name column */}
      <div className="mt-1.5 flex gap-3 items-center">
        <div style={{ width: 20, flexShrink: 0 }} />
        <div style={{ width: 40, flexShrink: 0 }} />
        <div
          className="flex-1 h-1"
          role="progressbar"
          aria-label={`${entry.total_score} of ${firstScore} points`}
          aria-valuenow={entry.total_score}
          aria-valuemin={0}
          aria-valuemax={firstScore}
          style={{ background: "var(--color-border, #e8e5e0)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${barPct}%`,
              background: "#7c3aed",
              transition: "width 500ms ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Pinned "YOUR RANK" — player view only, shown when not in visible top ──
export function PinnedRankSection({
  entry,
  firstScore,
  visibleCount = 0,
  topEntries = [],
  allEntries = [],
  deltas = new Map(),
}: {
  entry: LbEntry;
  firstScore: number;
  /** Number of players shown in the rankings list above */
  visibleCount?: number;
  /** Top 3 entries to render as blurred rows above pinned position */
  topEntries?: LbEntry[];
  /** All leaderboard entries for expanded view */
  allEntries?: LbEntry[];
  /** Rank deltas for expanded view */
  deltas?: Map<string, number | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const barPct = firstScore > 0 ? Math.min(100, Math.round((entry.total_score / firstScore) * 100)) : 0;

  // Show blurred top-3 rows for context above pinned position
  // First 2 at normal blur, 3rd at extra blur for depth
  const blurredRows = topEntries.slice(0, 3);

  // Expanded: show all ranking rows (4th+), since podium already shows top 3
  // Ensure the player's own entry is always included
  const baseExpanded = allEntries.filter((e) => e.rank > 3);
  const playerIncluded = baseExpanded.some((e) => e.player_id === entry.player_id);
  const expandedEntries = playerIncluded
    ? baseExpanded
    : [...baseExpanded, entry].sort((a, b) => a.rank - b.rank);

  return (
    <div className="border-t border-border">
      {expanded ? (
        /* ── Expanded full leaderboard ── */
        <>
          <div>
            {expandedEntries.map((e, i) => (
              <RankingRow
                key={e.player_id}
                entry={e}
                firstScore={firstScore}
                delta={deltas.get(e.player_id) ?? null}
                isMe={e.player_id === entry.player_id}
                animIndex={i}
              />
            ))}
          </div>
          {/* Collapse pill */}
          <div className="flex justify-center py-2.5">
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center rounded-full border border-border bg-background cursor-pointer transition-opacity hover:opacity-80"
              style={{
                padding: "8px 20px",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                gap: 6,
              }}
            >
              <span className="text-muted-foreground">Collapse</span>
              <svg className="text-muted-foreground" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
          </div>
        </>
      ) : (
        /* ── Collapsed: blurred rows + "View full" + pinned you ── */
        <>
          {/* Blurred top rows — progressive blur, keeps visual structure */}
          {blurredRows.length > 0 && (
            <div className="relative select-none pointer-events-none" aria-hidden="true">
              {blurredRows.map((e, i) => {
                const pct = firstScore > 0 ? Math.min(100, Math.round((e.total_score / firstScore) * 100)) : 0;
                // Progressive: top rows more blurred/faded, bottom row less
                const blurPx = i === 0 ? 5 : i === 1 ? 3 : 2;
                const opacity = i === 0 ? 0.25 : i === 1 ? 0.35 : 0.45;
                return (
                  <div
                    key={e.player_id}
                    className="px-4 py-2 border-b border-border"
                    style={{ filter: `blur(${blurPx}px)`, opacity }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 text-right tabular-nums" style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: "#78756e", width: 20 }}>
                        {e.rank}
                      </span>
                      <PlayerAvatar seed={e.player_id} name={e.display_name} size={32} />
                      <span className="flex-1 truncate font-medium" style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}>
                        {e.display_name}
                      </span>
                      <span className="shrink-0 tabular-nums font-bold" style={{ fontFamily: "Outfit, sans-serif", fontSize: 14, fontWeight: 600 }}>
                        {e.total_score}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-3 items-center">
                      <div style={{ width: 20, flexShrink: 0 }} />
                      <div style={{ width: 32, flexShrink: 0 }} />
                      <div className="flex-1 h-0.5" style={{ background: "var(--color-border, #e8e5e0)" }}>
                        <div className="h-full" style={{ width: `${pct}%`, background: "#7c3aed" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Fade-out gradient at top */}
              <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none" />
              {/* "Full Leaderboard" pill — floats over bottom of blurred section */}
              {allEntries.length > 3 && (
                <div className="absolute inset-x-0 bottom-0 flex justify-center translate-y-1/2 z-10">
                  <button
                    onClick={() => setExpanded(true)}
                    className="inline-flex items-center rounded-full border border-border bg-background cursor-pointer transition-opacity hover:opacity-80 pointer-events-auto"
                    style={{
                      padding: "5px 14px",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      fontWeight: 500,
                      gap: 5,
                    }}
                  >
                    <span className="text-muted-foreground">Full Leaderboard</span>
                    <svg className="text-muted-foreground" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Your highlighted row */}
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(124,58,237,0.06)",
              border: "1px solid rgba(124,58,237,0.2)",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="shrink-0 text-right tabular-nums"
                style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#78756e", width: 20 }}
              >
                {entry.rank > 0 ? entry.rank : "—"}
              </span>
              <PlayerAvatar seed={entry.player_id} name={entry.display_name} size={40} />
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
        </>
      )}
    </div>
  );
}
