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
  timeLeft,
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
  const isTimedOut = timeLeft === 0 && !hasAnswered;
  const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;

  // Read wager bounds from config JSONB (migration 047 — default 10%/100%)
  const minWagerPct = (question.config?.minWagerPct as number) ?? 0.10;
  const maxWagerPct = (question.config?.maxWagerPct as number) ?? 1.00;

  // Wager amount preview shown on the slider
  const wagerAmt = Math.floor(Math.max(50, bankedScore) * leverage);
  const correctAmt = question.base_points + wagerAmt;
  const lossCap = Math.min(wagerAmt, bankedScore);

  return (
    <div className="flex flex-col gap-4">
      {/* Wager slider — hidden once answered or timed out */}
      {!hasAnswered && !isTimedOut && phase === "playing" && (
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
            <span className="text-correct font-medium">+{correctAmt} pts</span>
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
          const isLong = option.length >= 40;

          let cls =
            `${isLong ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} min-h-14 border text-left transition-colors w-full `;

          if (isRevealing) {
            if (isCorrectOption)
              cls += "border-correct bg-[var(--bt-correct-tint)] text-foreground";
            else if (isSelected)
              cls += "border-wrong bg-[var(--bt-wrong-tint)] text-foreground opacity-60";
            else cls += "border-border text-foreground opacity-60";
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered || isTimedOut) {
            cls += "border-border text-muted-foreground";
          } else {
            cls +=
              "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
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
