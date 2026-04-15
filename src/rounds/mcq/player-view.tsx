"use client";

/**
 * MCQ (Multiple Choice) PlayerView — also used by True/False.
 *
 * True/False reuses this component: questions have 2 options instead of 4,
 * so the option labels automatically collapse to ["A", "B"].
 *
 * Extracted from play-view.tsx as part of Phase 1 modularisation.
 * See GAME_ARCHITECTURE.md § 4 for the full interface contract.
 */

import { Check, X } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

export function MCQPlayerView({
  question,
  phase,
  timeLeft,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
}: RoundPlayerViewProps) {
  const isTrueFalse = question.round_type === "true_false";
  const optionLabels = isTrueFalse ? ["A", "B"] : ["A", "B", "C", "D"];
  const options = isTrueFalse ? question.options.slice(0, 2) : question.options;
  const isTimedOut = timeLeft === 0 && !hasAnswered;

  return (
    <div className={`grid gap-3 ${isTrueFalse ? "grid-cols-1" : "grid-cols-2"}`}>
      {options.map((option, i) => {
        const isSelected = selectedAnswer !== null && selectedAnswer === i;
        const isCorrectOption = lastResult?.correctAnswer === i;
        const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;

        let cls = `flex items-center gap-3 p-4 ${
          isTrueFalse ? "min-h-16" : "min-h-14"
        } border text-left transition-colors w-full `;

        if (isRevealing) {
          if (isCorrectOption) cls += "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct";
          else if (isSelected) cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
          else cls += "border-border text-muted-foreground opacity-50";
        } else if (isSelected) {
          cls += "border-primary bg-accent-light text-primary";
        } else if (hasAnswered || isTimedOut) {
          cls += "border-border text-muted-foreground";
        } else {
          cls += "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
        }

        const badgeCls = `w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold ${
          isRevealing && isCorrectOption
            ? "bg-correct/10 text-correct"
            : isRevealing && isSelected && !isCorrectOption
            ? "bg-wrong/10 text-wrong"
            : "bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400"
        }`;

        return (
          <button
            key={i}
            disabled={hasAnswered || phase !== "playing" || isSubmitting || isTimedOut}
            onClick={() => onSubmit(i)}
            className={cls}
            style={
              isRevealing && isCorrectOption
                ? { animation: "correct-pulse 420ms ease-out" }
                : isRevealing && isSelected && !isCorrectOption
                ? { animation: "shake 480ms ease-in-out" }
                : undefined
            }
            aria-label={`Answer ${option}`}
          >
            <span className={badgeCls}>
              {isRevealing && isCorrectOption ? (
                <Check size={14} strokeWidth={2.5} />
              ) : isRevealing && isSelected && !isCorrectOption ? (
                <X size={14} strokeWidth={2.5} />
              ) : (
                optionLabels[i]
              )}
            </span>
            <span
              className={`leading-snug break-words ${
                isTrueFalse ? "text-[18px] font-semibold" : "text-sm font-medium"
              }`}
            >
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
  );
}
