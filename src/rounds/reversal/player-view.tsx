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
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[var(--bt-hover)] border border-border px-3 py-1.5">
          <RoundTypeBadge type="reversal" size={16} />
          Find the statement that is <span className="text-wrong font-bold ml-0.5">FALSE</span>
        </span>
      </div>

      {/* 2×2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isFalseStatement = lastResult?.correctAnswer === i; // the option to find

          const isLong = option.length >= 40;
          // FALSE pill is wider than a letter badge — use absolute top-left when
          // revealed to keep it out of the text flow.
          const useAbsolute = isLong || (isRevealing && isFalseStatement);
          let cls =
            `${useAbsolute ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} min-h-14 border text-left transition-colors w-full `;

          if (isRevealing) {
            if (isFalseStatement) {
              // The false statement — green border (correct pick), but "FALSE" badge
              cls +=
                "border-correct bg-[var(--bt-correct-tint)] text-foreground";
            } else if (isSelected) {
              // Player picked a true statement — wrong
              cls += "border-wrong bg-[var(--bt-wrong-tint)] text-foreground opacity-60";
            } else {
              cls += "border-border text-foreground opacity-60";
            }
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered || isTimedOut) {
            cls += "border-border text-muted-foreground";
          } else {
            cls +=
              "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
          }

          const posCls = useAbsolute ? "absolute top-[6px] left-[8px]" : "shrink-0";
          const renderBadge = () => {
            if (isRevealing && isFalseStatement) {
              return (
                <span className={`${posCls} flex items-center gap-0.5 px-1.5 h-5 text-[10px] font-bold bg-[var(--bt-wrong)] text-white`}>
                  <X size={10} strokeWidth={3} />
                  FALSE
                </span>
              );
            }
            if (isRevealing && isSelected && !isFalseStatement) {
              return (
                <span className={`${posCls} w-5 h-5 flex items-center justify-center bg-[var(--bt-wrong)] text-white`}>
                  <X size={14} strokeWidth={2.5} />
                </span>
              );
            }
            return (
              <span className={`${posCls} w-5 h-5 flex items-center justify-center text-[11px] font-medium bg-[var(--bt-hover)] text-[var(--bt-stone)]`}>
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
