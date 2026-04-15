"use client";

/**
 * HostRevealShell — the universal chrome for the host's "revealing" phase.
 *
 * Every round type reuses this shell. Round modules only supply the
 * round-specific answer presentation via HostRevealView (see round-registry).
 *
 * Layout (top to bottom):
 *   1. Progress bar: round X/Y · Q X/Y  (always visible)
 *   2. Question body (big, readable on a public monitor)
 *   3. Stats strip: Answered · Accuracy · Avg Time
 *   4. Answer presentation  <-- slotted per round type
 *   5. WHY card (question.explanation) — big + bold, NOT muted
 *   6. Action buttons: Pause + Next Question / End Game
 *
 * Design notes:
 * - The stats strip and WHY card are NOT in the player view. This screen
 *   often doubles as a public monitor/projector, so it needs to carry more
 *   information density than the player's phone.
 * - Keep the "Why" prominent (not grey muted text) — it's the pedagogical
 *   payoff of the whole game.
 */

import type { ReactNode } from "react";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";

interface HostRevealShellProps {
  /** Round header info */
  roundType: string;
  roundTitle: string;
  roundIndex: number;       // 0-based
  roundCount: number;
  questionIndexInRound: number;  // 0-based
  questionCountInRound: number;

  /** The question body — rendered prominently. */
  questionBody: string;

  /** Live stats for this question. */
  answered: number;
  playerCount: number;
  correctCount: number;      // -1 means "unknown" — hide accuracy
  avgTimeSeconds: number | null;  // null means "unknown" — hide avg time

  /** The round-specific answer presentation. */
  answerNode: ReactNode;

  /** The pedagogical "Why" — rendered big + bold when present. */
  explanation?: string | null;

  /** Controls */
  loading: boolean;
  onPause: () => void;
  onNext: () => void;
  nextLabel: string;
}

export function HostRevealShell({
  roundType,
  roundTitle,
  roundIndex,
  roundCount,
  questionIndexInRound,
  questionCountInRound,
  questionBody,
  answered,
  playerCount,
  correctCount,
  avgTimeSeconds,
  answerNode,
  explanation,
  loading,
  onPause,
  onNext,
  nextLabel,
}: HostRevealShellProps) {
  // When the fetcher has returned (correctCount >= 0), render real values.
  // Accuracy on 0 answers is 0% by convention — dashes read as "broken."
  // When the fetcher is still mid-flight (correctCount === -1), show "—".
  const fetchReady = correctCount >= 0;
  const accuracy = fetchReady
    ? answered > 0
      ? Math.round((correctCount / answered) * 100)
      : 0
    : null;
  const avgTimeDisplay = fetchReady
    ? avgTimeSeconds !== null
      ? `${avgTimeSeconds.toFixed(1)}s`
      : "0.0s"
    : "—";

  return (
    <div className="py-6 space-y-5">
      {/* 1. Progress header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <RoundTypeBadge type={roundType} size={20} />
          {roundTitle}
          {roundCount > 1 && (
            <span className="ml-1.5 text-muted-foreground/60">
              · Round {roundIndex + 1}/{roundCount}
            </span>
          )}
        </span>
        <span>
          Q{questionIndexInRound + 1}/{questionCountInRound}
        </span>
      </div>

      {/* 2. Question body — matches player view (Inter, weight 500, 16/20px by length) */}
      <h1
        className={`font-medium leading-snug break-words ${
          questionBody.length > 120 ? "text-base" : "text-xl"
        }`}
      >
        {questionBody}
      </h1>

      {/* 3. Stats strip — host-only intelligence the player doesn't see */}
      <div className="grid grid-cols-3 border border-border divide-x divide-border">
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Answered
          </p>
          <p className="font-heading text-lg font-bold tabular-nums">
            {answered}/{playerCount}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Accuracy
          </p>
          <p className="font-heading text-lg font-bold tabular-nums">
            {accuracy !== null ? `${accuracy}%` : "—"}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Avg Time
          </p>
          <p className="font-heading text-lg font-bold tabular-nums">
            {avgTimeDisplay}
          </p>
        </div>
      </div>

      {/* 4. Answer presentation — slotted per round type */}
      <div>{answerNode}</div>

      {/* 5. WHY card — Inter body copy, prominent but not shouty. The violet
          left-rail + tinted bg carry the visual weight, not the font size. */}
      {explanation && (
        <div className="border-l-4 border-primary bg-primary/5 dark:bg-primary/10 p-4 space-y-1.5">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
            Why
          </p>
          <p className="text-sm sm:text-base font-normal leading-relaxed">
            {explanation}
          </p>
        </div>
      )}

      {/* 6. Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onPause}
          disabled={loading}
          className="h-12 px-6 bg-surface border border-border font-medium hover:bg-background transition-colors disabled:opacity-50"
        >
          Pause
        </button>
        <button
          onClick={onNext}
          disabled={loading}
          className="flex-1 h-12 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
