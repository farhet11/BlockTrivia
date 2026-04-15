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
import { Check, X, Ruler } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
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
  question: _question,
  phase,
  hasAnswered,
  isSubmitting,
  lastResult,
  onSubmit,
}: RoundPlayerViewProps) {
  const [numericValue, setNumericValue] = useState("");
  const isRevealing = phase === "revealing" && lastResult !== null;

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
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[#f5f3ef] dark:bg-[#1f1f23] border border-border px-3 py-1.5">
          <Ruler size={14} strokeWidth={2} />
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
            disabled={hasAnswered || phase !== "playing" || isSubmitting}
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
          {/* Correct answer */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Correct Answer
            </span>
            <span className="text-3xl font-bold text-correct">
              {lastResult.correctAnswer !== undefined
                ? Number(lastResult.correctAnswer).toLocaleString()
                : "—"}
            </span>
          </div>

          {/* Player's result */}
          <div
            className={`flex items-center gap-3 px-5 py-3 border ${
              lastResult.isCorrect
                ? "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct"
                : "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong"
            }`}
            style={
              lastResult.isCorrect
                ? { animation: "correct-pulse 420ms ease-out" }
                : { animation: "shake 480ms ease-in-out" }
            }
          >
            <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold bg-current/10">
              {lastResult.isCorrect ? (
                <Check size={14} strokeWidth={2.5} />
              ) : (
                <X size={14} strokeWidth={2.5} />
              )}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {lastResult.didNotAnswer
                  ? "No answer submitted"
                  : `Your answer: ${
                      numericValue ? formatWithSeparators(numericValue) : "—"
                    }`}
              </span>
              <span className="text-xs opacity-80">
                {lastResult.pointsAwarded > 0
                  ? `+${lastResult.pointsAwarded} points`
                  : lastResult.didNotAnswer
                    ? "Time ran out — 0 points"
                    : "0 points — too far off"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
