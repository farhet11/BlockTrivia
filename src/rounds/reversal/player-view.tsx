"use client";

/**
 * Reversal Round PlayerView
 *
 * MECHANIC:
 *   4 statements are shown. 3 are TRUE. 1 is FALSE.
 *   Players identify the FALSE statement.
 *   `correct_answer` stores the index of the FALSE statement — the host
 *   marks the false option as "correct" in the question builder.
 *
 * SCORING:
 *   Identical to MCQ — correct answer + optional time bonus.
 *   The submit_answer RPC handles this in the standard ELSE branch.
 *   Zero server-side changes needed.
 *
 * UI DIFFERENCES FROM MCQ:
 *   1. "Find the FALSE statement" instruction pill above the grid.
 *   2. On reveal: the false statement (correct_answer) gets a red "FALSE"
 *      badge inside a green border — "green = you were right to pick this,
 *      red badge = this statement is FALSE". All others grey out.
 *   3. Always 4 options (no True/False collapse).
 *
 * See GAME_ARCHITECTURE.md §4 for the full interface contract.
 */

import { X } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";

const OPTION_LABELS = ["A", "B", "C", "D"];

export function ReversalPlayerView({
  question,
  phase,
  timeLeft,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
}: RoundPlayerViewProps) {
  const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;
  const isTimedOut = timeLeft === 0 && !hasAnswered;

  return (
    <div className="flex flex-col gap-3">
      {/* Instruction pill */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[#f5f3ef] dark:bg-[#1f1f23] border border-border px-3 py-1.5">
          <RoundTypeBadge type="reversal" size={16} />
          Find the statement that is <span className="text-wrong font-bold ml-0.5">FALSE</span>
        </span>
      </div>

      {/* 2×2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isFalseStatement = lastResult?.correctAnswer === i; // the option to find

          let cls =
            "flex items-start gap-3 p-4 min-h-14 border text-left transition-colors w-full ";

          if (isRevealing) {
            if (isFalseStatement) {
              // The false statement — green border (correct pick), but "FALSE" badge
              cls +=
                "border-correct bg-[#dcfce7] dark:bg-correct/15 text-foreground";
            } else if (isSelected) {
              // Player picked a true statement — wrong
              cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
            } else {
              cls += "border-border text-muted-foreground opacity-50";
            }
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered || isTimedOut) {
            cls += "border-border text-muted-foreground";
          } else {
            cls +=
              "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
          }

          // Badge rendering
          const renderBadge = () => {
            if (isRevealing && isFalseStatement) {
              // Red "FALSE" tag — marks the false statement as confirmed
              return (
                <span className="w-auto shrink-0 flex items-center gap-0.5 px-1.5 h-6 rounded-[4px] text-[10px] font-bold bg-wrong/15 text-wrong border border-wrong/30">
                  <X size={10} strokeWidth={3} />
                  FALSE
                </span>
              );
            }
            if (isRevealing && isSelected && !isFalseStatement) {
              return (
                <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] bg-wrong/10 text-wrong">
                  <X size={14} strokeWidth={2.5} />
                </span>
              );
            }
            return (
              <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400">
                {OPTION_LABELS[i]}
              </span>
            );
          };

          return (
            <button
              key={i}
              disabled={
                hasAnswered || phase !== "playing" || isSubmitting || isTimedOut
              }
              onClick={() => onSubmit(i)}
              className={cls}
              style={
                isRevealing && isFalseStatement && isSelected
                  ? { animation: "correct-pulse 420ms ease-out" }
                  : isRevealing && isSelected && !isFalseStatement
                  ? { animation: "shake 480ms ease-in-out" }
                  : undefined
              }
              aria-label={`Statement ${OPTION_LABELS[i]}: ${option}`}
            >
              {renderBadge()}
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
