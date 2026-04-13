"use client";

/**
 * The Narrative PlayerView
 *
 * MECHANIC:
 *   4 options shown. All players vote. The majority vote becomes "correct."
 *   Rewards reading the room, not knowing facts.
 *
 * SCORING (mirrors SQL in migration 055):
 *   If player voted with majority -> base_points + speed_bonus
 *   Otherwise -> 0
 *   Majority is determined after all answers are in (host triggers tally).
 *
 * UI:
 *   - "Read the room" instruction pill
 *   - Standard 2x2 grid (same as MCQ visually)
 *   - On reveal: vote distribution bar per option, majority highlighted
 *
 * DB: Uses game_state.round_state.majority_option for the winning choice.
 *     No new columns needed.
 */

import { Check, X, Users } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

const OPTION_LABELS = ["A", "B", "C", "D"];

export function TheNarrativePlayerView({
  question,
  phase,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
  roundState,
}: RoundPlayerViewProps) {
  const isRevealing = phase === "revealing" && lastResult !== null;

  // Vote distribution from round_state (set by host on tally)
  const voteCounts = (roundState?.vote_counts as number[] | undefined) ?? [];
  const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
  const majorityOption = roundState?.majority_option as number | undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Instruction pill */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[#f5f3ef] dark:bg-[#1f1f23] border border-border px-3 py-1.5">
          <Users size={14} strokeWidth={2} />
          Read the room — the majority vote wins
        </span>
      </div>

      {/* 2x2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isMajority = majorityOption === i;
          const voteCount = voteCounts[i] ?? 0;
          const votePct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

          let cls = "flex flex-col gap-2 p-4 min-h-14 border text-left transition-colors w-full ";

          if (isRevealing) {
            if (isMajority && isSelected) {
              cls += "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct";
            } else if (isMajority) {
              cls += "border-correct/50 bg-[#dcfce7]/50 dark:bg-correct/8 text-correct/70";
            } else if (isSelected) {
              cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
            } else {
              cls += "border-border text-muted-foreground opacity-50";
            }
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered) {
            cls += "border-border text-muted-foreground";
          } else {
            cls += "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
          }

          return (
            <button
              key={i}
              disabled={hasAnswered || phase !== "playing" || isSubmitting}
              onClick={() => onSubmit(i)}
              className={cls}
              style={
                isRevealing && isMajority && isSelected
                  ? { animation: "correct-pulse 420ms ease-out" }
                  : isRevealing && isSelected && !isMajority
                  ? { animation: "shake 480ms ease-in-out" }
                  : undefined
              }
              aria-label={`Vote ${OPTION_LABELS[i]}: ${option}`}
            >
              {/* Option row */}
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold ${
                  isRevealing && isMajority
                    ? "bg-correct/10 text-correct"
                    : isRevealing && isSelected && !isMajority
                    ? "bg-wrong/10 text-wrong"
                    : "bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400"
                }`}>
                  {isRevealing && isMajority ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : isRevealing && isSelected && !isMajority ? (
                    <X size={14} strokeWidth={2.5} />
                  ) : (
                    OPTION_LABELS[i]
                  )}
                </span>
                <span className="leading-snug break-words text-sm font-medium">
                  {isSubmitting && isSelected ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BlockSpinner variant="wave" size={16} />
                      {option}
                    </span>
                  ) : (
                    option
                  )}
                </span>
              </div>

              {/* Vote distribution bar (reveal only) */}
              {isRevealing && totalVotes > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-[width] duration-500 ${
                        isMajority ? "bg-correct" : "bg-muted-foreground/30"
                      }`}
                      style={{ width: `${votePct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums w-8 text-right">
                    {votePct}%
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
