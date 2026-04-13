"use client";

/**
 * Pixel Reveal PlayerView
 *
 * MECHANIC:
 *   An image starts heavily blurred and progressively clears as the timer
 *   counts down. Players answer an MCQ about the image. Early correct
 *   answers earn a quadratic time bonus — rewarding conviction under
 *   uncertainty.
 *
 * SCORING (mirrors SQL in migration 055):
 *   base_points + floor(base_points x ratio^2)
 *   where ratio = timeRemaining / totalTime
 *   Answering at 50% remaining = 25% bonus (not 50%). Heavy early reward.
 *
 * UI:
 *   - Image container with CSS blur filter, interpolated from timer
 *   - "Identify the image" instruction pill
 *   - Standard 2x2 MCQ option grid below
 *
 * DB: Uses questions.image_url for the source image.
 *     correct_answer is MCQ-style (option index).
 */

import { Check, X } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

const OPTION_LABELS = ["A", "B", "C", "D"];

/** Max blur in px at the start of the timer */
const MAX_BLUR = 40;

export function PixelRevealPlayerView({
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

  // Image URL from question data (set by question builder, stored in questions.image_url)
  const imageUrl = question.image_url ?? null;

  // Blur interpolation: full blur at timeLeft = timeLimit, 0 at timeLeft = 0
  const timeLimitMs = question.time_limit_seconds * 1000;
  const remaining = timeLeft ?? 0;
  const progress = timeLimitMs > 0 ? 1 - remaining / timeLimitMs : 1;
  // progress goes 0 -> 1 as timer counts down
  // blur goes MAX_BLUR -> 0
  const blurPx = isRevealing || hasAnswered
    ? 0 // Clear image on answer or reveal
    : Math.max(0, MAX_BLUR * (1 - progress));

  return (
    <div className="flex flex-col gap-3">
      {/* Instruction pill */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[#f5f3ef] dark:bg-[#1f1f23] border border-border px-3 py-1.5">
          <span className="text-sm">🖼️</span>
          Identify the image — early answers earn more points
        </span>
      </div>

      {/* Image container */}
      {imageUrl ? (
        <div className="relative w-full aspect-video border border-border overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt="Pixel reveal question"
            className="w-full h-full object-cover transition-[filter] duration-300"
            style={{ filter: `blur(${blurPx}px)` }}
            draggable={false}
          />
          {/* Progress overlay — shows how revealed the image is */}
          {!isRevealing && !hasAnswered && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-border">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-video border border-border flex items-center justify-center bg-muted text-muted-foreground text-sm">
          No image available
        </div>
      )}

      {/* 2x2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isCorrectOption = lastResult?.correctAnswer === i;

          let cls = "flex items-center gap-3 p-4 min-h-14 border text-left transition-colors w-full ";

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
              aria-label={`Answer ${OPTION_LABELS[i]}: ${option}`}
            >
              <span className={badgeCls}>
                {isRevealing && isCorrectOption ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : isRevealing && isSelected && !isCorrectOption ? (
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
