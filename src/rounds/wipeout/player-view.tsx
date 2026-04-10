"use client";

/**
 * WipeOut PlayerView — MCQ answer grid + wager slider.
 *
 * Scoring model (Option A — % of banked score, migration 030):
 *   wagerAmt = floor(max(50, bankedScore) × wagerPct)
 *   Correct:  +wagerAmt
 *   Wrong:    −min(wagerAmt, bankedScore)   ← floor at 0
 *
 * The wager slider (leverage) is a float 0.0–1.0 (10%–100%).
 * Bounds come from question.config.minWagerPct / maxWagerPct
 * (rounds.config JSONB, seeded by migration 047).
 *
 * Extracted from play-view.tsx as part of Phase 1 modularisation.
 */

import { Check, X } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

export function WipeOutPlayerView({
  question,
  phase,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  bankedScore,
  leverage = 0.5,
  onLeverageChange,
  onSubmit,
}: RoundPlayerViewProps) {
  const optionLabels = ["A", "B", "C", "D"];
  const isTimedOut = false; // timeLeft managed by PlayView
  const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;

  // Read wager bounds from config JSONB (migration 047 — default 10%/100%)
  const minWagerPct = (question.config?.minWagerPct as number) ?? 0.10;
  const maxWagerPct = (question.config?.maxWagerPct as number) ?? 1.00;

  // Wager amount preview shown on the slider
  const wagerAmt = Math.floor(Math.max(50, bankedScore) * leverage);
  const lossCap = Math.min(wagerAmt, bankedScore);

  return (
    <div className="flex flex-col gap-4">
      {/* Wager slider — hidden once answered */}
      {!hasAnswered && phase === "playing" && (
        <div className="space-y-2 border border-border p-4 bg-surface">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Wager</span>
            <span className="font-bold text-primary">
              {Math.round(leverage * 100)}% of your score
            </span>
          </div>
          <input
            type="range"
            min={minWagerPct}
            max={maxWagerPct}
            step={0.05}
            value={leverage}
            onChange={(e) => onLeverageChange?.(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(minWagerPct * 100)}% safe</span>
            <span>100% all-in</span>
          </div>
          <p className="text-xs text-muted-foreground pt-0.5">
            <span className="text-correct font-medium">+{wagerAmt} pts</span>
            {" if correct · "}
            <span className="text-wrong font-medium">−{lossCap} pts</span>
            {" if wrong"}
          </p>
        </div>
      )}

      {/* Answer grid — same 2×2 layout as MCQ */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isCorrectOption = lastResult?.correctAnswer === i;

          let cls =
            "flex items-center gap-3 p-4 min-h-14 border text-left transition-colors w-full ";

          if (isRevealing) {
            if (isCorrectOption)
              cls += "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct";
            else if (isSelected)
              cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
            else cls += "border-border text-muted-foreground opacity-50";
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered || isTimedOut) {
            cls += "border-border text-muted-foreground";
          } else {
            cls +=
              "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
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
              onClick={() => onSubmit(i, { wager: leverage })}
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
              <span className="text-sm font-medium leading-snug break-words">
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
