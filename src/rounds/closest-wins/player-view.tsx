"use client";

/**
 * Closest Wins PlayerView
 *
 * MECHANIC:
 *   Question asks for a numeric answer. Players type a number.
 *   Scoring is based on distance from the correct answer — closer = more points.
 *   No MCQ grid. Instead: a large numeric input field.
 *
 * SCORING (mirrors SQL in migration 055):
 *   distance = abs(answer - correct)
 *   maxDistance = toleranceMultiplier x max(abs(correct), 1)
 *   closeness = max(0, 1 - distance/maxDistance)
 *   points = floor(base_points x closeness) + time_bonus
 *
 * UI:
 *   - "How close can you get?" instruction pill
 *   - Large numeric input with submit button
 *   - On reveal: show correct answer, player's answer, and closeness %
 *
 * DB: Uses questions.correct_answer_numeric for the target value.
 *     submit_answer reads p_numeric_answer parameter.
 */

import { useState } from "react";
import { Check, Ruler, Target, User } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import { ClosestWinsDistributionChart } from "./distribution-chart";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

/**
 * Format a raw digit string with thousands separators while preserving a
 * trailing decimal point (so the user can keep typing "1234." → "1,234.").
 * Returns an empty string for inputs that can't form a number.
 */
function formatWithSeparators(raw: string): string {
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return raw;
  // Split optional sign + integer + optional decimal
  const match = /^(-?)(\d*)(\.\d*)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, intPart, decPart = ""] = match;
  const intFormatted = intPart ? Number(intPart).toLocaleString("en-US") : "";
  return `${sign}${intFormatted}${decPart}`;
}

/** Pick a font-size class based on the formatted string length so big numbers fit. */
function adaptiveNumClass(val: number | null): string {
  if (val === null) return "text-3xl sm:text-4xl";
  const len = val.toLocaleString().length;
  if (len <= 6)  return "text-3xl sm:text-4xl";
  if (len <= 9)  return "text-xl sm:text-2xl";
  if (len <= 13) return "text-base sm:text-lg";
  return "text-sm sm:text-base";
}

/** Strip non-numeric formatting so the raw value can be parsed / kept in state. */
function sanitizeNumericInput(input: string): string {
  // Remove everything except digits, dot and leading minus
  let cleaned = input.replace(/[^0-9.-]/g, "");
  // Only one leading minus
  const hasLeadingMinus = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");
  if (hasLeadingMinus) cleaned = "-" + cleaned;
  // Only one decimal
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  return cleaned;
}

export function ClosestWinsPlayerView({
  question,
  phase,
  timeLeft,
  hasAnswered,
  isSubmitting,
  lastResult,
  roundState,
  onSubmit,
}: RoundPlayerViewProps) {
  const unit =
    typeof (question.config as Record<string, unknown>)?.unit === "string"
      ? ((question.config as Record<string, unknown>).unit as string)
      : null;
  const [numericValue, setNumericValue] = useState("");
  const isRevealing = phase === "revealing" && lastResult !== null;
  const isTimedOut = timeLeft === 0 && !hasAnswered;

  const handleSubmit = () => {
    const parsed = parseFloat(numericValue);
    if (isNaN(parsed)) return;
    // Pass -1 as selected_answer (sentinel), numeric value in metadata
    onSubmit(-1, { numeric_answer: parsed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && numericValue.trim() && !isNaN(parseFloat(numericValue))) {
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Instruction pill */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[var(--bt-hover)] border border-border px-3 py-1.5">
          <Ruler size={14} strokeWidth={2.5} />
          Type your best guess — closest answer wins
        </span>
      </div>

      {/* Numeric input */}
      {!isRevealing ? (
        <div className="flex flex-col items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={formatWithSeparators(numericValue)}
            onChange={(e) => setNumericValue(sanitizeNumericInput(e.target.value))}
            onKeyDown={handleKeyDown}
            disabled={hasAnswered || isTimedOut || phase !== "playing" || isSubmitting}
            placeholder="Enter a number..."
            className="w-full max-w-xs text-center text-2xl font-semibold p-4 border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors disabled:opacity-50"
            autoFocus
          />

          {hasAnswered ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Check size={16} />
              Answer submitted — waiting for reveal
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={
                !numericValue.trim() ||
                isNaN(parseFloat(numericValue)) ||
                phase !== "playing" ||
                isTimedOut ||
                isSubmitting
              }
              className="px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm border border-primary hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <BlockSpinner variant="wave" size={16} />
                  Submitting...
                </span>
              ) : (
                "Lock In Answer"
              )}
            </button>
          )}
        </div>
      ) : (
        /* Reveal state */
        <div className="flex flex-col items-center gap-4">
          {/* Target + You — side-by-side cards */}
          {(() => {
            const parsedYour = numericValue ? parseFloat(numericValue) : NaN;
            const yourGuess =
              typeof lastResult.numericAnswer === "number" &&
              Number.isFinite(lastResult.numericAnswer)
                ? lastResult.numericAnswer
                : Number.isFinite(parsedYour)
                  ? parsedYour
                  : null;
            const target =
              typeof lastResult.correctAnswer === "number"
                ? lastResult.correctAnswer
                : null;
            const distance =
              yourGuess !== null && target !== null
                ? Math.abs(yourGuess - target)
                : null;
            const distanceLabel =
              distance === null
                ? null
                : distance === 0
                  ? "Spot on"
                  : `Off by ${distance.toLocaleString()}`;

            return (
              <div className="w-full grid grid-cols-2 gap-3">
                {/* Target */}
                <div className="border border-correct bg-[var(--bt-correct-tint)] p-5 flex flex-col items-center justify-start gap-1.5 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-correct">
                    <Target size={12} strokeWidth={2.5} />
                    Target
                  </span>
                  <p className={`font-mono font-bold text-correct tabular-nums leading-none ${adaptiveNumClass(target)}`}>
                    {target !== null ? target.toLocaleString() : "—"}
                  </p>
                  {unit && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {unit}
                    </p>
                  )}
                </div>

                {/* You — color tier:
                 *   is_correct (spot on)   → green (correct)
                 *   pts > 0 (partial)      → violet (primary)
                 *   zero / no answer       → red (wrong) */}
                {(() => {
                  const tier = lastResult.didNotAnswer
                    ? "wrong"
                    : lastResult.isCorrect
                      ? "correct"
                      : lastResult.pointsAwarded > 0
                        ? "partial"
                        : "wrong";
                  const cls = {
                    correct:
                      "border-correct bg-[var(--bt-correct-tint)] text-correct",
                    partial: "border-primary bg-primary/10 text-primary",
                    wrong:
                      "border-wrong bg-[var(--bt-wrong-tint)] text-wrong",
                  }[tier];
                  return (
                    <div
                      className={`border p-5 flex flex-col items-center justify-start gap-1.5 text-center ${cls}`}
                    >
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                        <User size={12} strokeWidth={2.5} />
                        You
                      </span>
                      <p className={`font-mono font-bold tabular-nums leading-none ${adaptiveNumClass(yourGuess)}`}>
                        {lastResult.didNotAnswer
                          ? "—"
                          : yourGuess !== null
                            ? yourGuess.toLocaleString()
                            : "—"}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-wider opacity-80">
                        {lastResult.didNotAnswer
                          ? "No answer"
                          : (distanceLabel ?? (unit ?? ""))}
                      </p>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Answer distribution chart — aggregated from roundState */}
          {(() => {
            const guesses = Array.isArray(roundState?.guesses)
              ? ((roundState.guesses as unknown[]).filter(
                  (v) => typeof v === "number" && Number.isFinite(v),
                ) as number[])
              : [];
            const target =
              typeof lastResult.correctAnswer === "number"
                ? lastResult.correctAnswer
                : null;
            const parsedYourGuess = numericValue
              ? parseFloat(numericValue)
              : NaN;
            const yourGuess =
              typeof lastResult.numericAnswer === "number" &&
              Number.isFinite(lastResult.numericAnswer)
                ? lastResult.numericAnswer
                : Number.isFinite(parsedYourGuess)
                  ? parsedYourGuess
                  : null;
            if (guesses.length === 0 || target === null) return null;

            // Rank: how many guesses were strictly closer than yours?
            let yourRank: number | null = null;
            if (yourGuess !== null) {
              const yourDist = Math.abs(yourGuess - target);
              const closerCount = guesses.filter(
                (g) => Math.abs(g - target) < yourDist,
              ).length;
              yourRank = closerCount + 1;
            }

            return (
              <div className="w-full">
                <ClosestWinsDistributionChart
                  guesses={guesses}
                  target={target}
                  yourGuess={yourGuess}
                  yourRank={yourRank}
                  unit={unit}
                />
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
