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
        const isLong = option.length >= 40;

        let cls = `${isLong ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} ${
          isTrueFalse ? "min-h-16" : "min-h-14"
        } border text-left transition-colors w-full `;

        if (isRevealing) {
          if (isCorrectOption) cls += "border-correct bg-[var(--bt-correct-tint)] text-foreground";
          else if (isSelected) cls += "border-wrong bg-[var(--bt-wrong-tint)] text-foreground opacity-60";
          else cls += "border-border text-foreground opacity-60";
        } else if (isSelected) {
          cls += "border-primary bg-accent-light text-primary";
        } else if (hasAnswered || isTimedOut) {
          cls += "border-border text-muted-foreground";
        } else {
          cls += "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
        }

        const badgeCls = `${isLong ? "absolute top-[6px] left-[8px]" : "shrink-0"} w-5 h-5 flex items-center justify-center text-[11px] font-medium ${
          isRevealing && isCorrectOption
            ? "bg-[var(--bt-correct)] text-white"
            : isRevealing && isSelected && !isCorrectOption
            ? "bg-[var(--bt-wrong)] text-white"
            : "bg-[var(--bt-hover)] text-[var(--bt-stone)]"
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
