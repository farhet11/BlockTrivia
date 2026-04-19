"use client";

/**
 * The Narrative host reveal — shows Room Answer (majority vote) vs. Textbook
 * Answer (host's marked correct_answer). When they match, the room is aligned.
 * When they diverge, the room herd-wrong'd — and that gap is the product's
 * killer MindScan signal.
 *
 * Scoring is unchanged (majority-wins, server-side in submit_answer RPC). This
 * view only adds the reveal comparison so hosts can narrate the gap.
 *
 * roundState shape (written by tallyNarrativeVotes in control-panel.tsx):
 *   - majority_option: number     // index of the plurality winner
 *   - vote_counts: number[]       // votes per option
 *   - total_votes: number
 *
 * Design notes:
 * - Follows default-host-reveal-view styling: 2×2 grid, Inter text, min-h-14
 *   cards, green for "match," amber for herd-wrong, muted for uninvolved.
 * - Summary banner above the grid reads the alignment at a glance so a public
 *   monitor can be understood in 2 seconds.
 */

import { ScrollText, Vote, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { HostRevealViewProps } from "@/lib/game/round-registry";

export function TheNarrativeHostRevealView({
  question,
  roundState,
}: HostRevealViewProps) {
  const options = (question.options ?? []) as string[];
  const textbookIdx = question.correct_answer;
  const majorityIdx =
    typeof roundState?.majority_option === "number"
      ? (roundState.majority_option as number)
      : -1;
  const voteCounts = Array.isArray(roundState?.vote_counts)
    ? (roundState.vote_counts as number[])
    : [];
  const totalVotes =
    typeof roundState?.total_votes === "number"
      ? (roundState.total_votes as number)
      : voteCounts.reduce((a, b) => a + b, 0);

  const isAligned = majorityIdx === textbookIdx;
  const optionLabels = ["A", "B", "C", "D"];

  return (
    <div className="space-y-3">
      {/* Summary banner — aligned vs herd-wrong */}
      {majorityIdx >= 0 && (
        <div
          className={`flex items-center gap-2 p-3 border ${
            isAligned
              ? "border-correct bg-[var(--bt-correct-tint)] text-correct"
              : "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {isAligned ? (
            <CheckCircle2 size={18} strokeWidth={2.5} />
          ) : (
            <AlertTriangle size={18} strokeWidth={2.5} />
          )}
          <p className="text-sm font-medium">
            {isAligned
              ? "Room aligned with the textbook — no herd effect on this question."
              : "Room diverged from the textbook — herd wrong."}
          </p>
        </div>
      )}

      {/* Options grid */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const isMajority = i === majorityIdx;
          const isTextbook = i === textbookIdx;
          const votes = voteCounts[i] ?? 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

          // Card styling — prioritize the "aligned / herd-wrong" signal
          let cardCls: string;
          if (isMajority && isTextbook) {
            cardCls = "border-correct bg-[var(--bt-correct-tint)]";
          } else if (isMajority) {
            cardCls =
              "border-amber-500 bg-amber-50 dark:bg-amber-500/10";
          } else if (isTextbook) {
            cardCls = "border-correct bg-[var(--bt-correct-tint)]/60";
          } else {
            cardCls = "border-border opacity-60";
          }

          // Fill bar for vote percentage — subtle, matches the semantic color.
          let fillCls: string;
          if (isMajority && isTextbook) {
            fillCls = "bg-correct/20";
          } else if (isMajority) {
            fillCls = "bg-amber-500/20";
          } else if (isTextbook) {
            fillCls = "bg-correct/10";
          } else {
            fillCls = "bg-muted-foreground/10";
          }

          // Letter badge — absolute top-left
          const badgeCls = `absolute top-[6px] left-[8px] z-10 w-5 h-5 flex items-center justify-center text-[11px] font-medium ${
            isMajority && isTextbook
              ? "bg-[var(--bt-correct)] text-white"
              : isMajority
                ? "bg-amber-500 text-white"
                : isTextbook
                  ? "bg-[var(--bt-correct)] text-white"
                  : "bg-[var(--bt-hover)] text-[var(--bt-stone)]"
          }`;

          return (
            <div
              key={i}
              className={`relative overflow-hidden flex flex-col gap-2 p-4 pt-7 min-h-14 border ${cardCls}`}
            >
              {/* Letter badge */}
              <span className={badgeCls}>{optionLabels[i] ?? String.fromCharCode(65 + i)}</span>

              {/* Vote percentage fill — behind content */}
              <div
                className={`absolute inset-y-0 left-0 ${fillCls} transition-all`}
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />

              {/* Content */}
              <div className="relative flex items-center gap-3">
                <span className="flex-1 text-sm font-medium">{opt}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {votes} · {pct}%
                </span>
              </div>

              {/* Badges row — Room Answer + Textbook (may both appear) */}
              {(isMajority || isTextbook) && (
                <div className="relative flex flex-wrap gap-1.5">
                  {isMajority && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-background/80 border border-current">
                      <Vote size={10} strokeWidth={2.5} />
                      Room Answer
                    </span>
                  )}
                  {isTextbook && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-background/80 border border-current">
                      <ScrollText size={10} strokeWidth={2.5} />
                      Textbook
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
