"use client";

/**
 * Pressure Cooker PlayerView
 *
 * One player is spotlighted per question. The host control panel writes
 * { spotlight_player_id, spotlight_display_name } into game_state.round_state
 * when advancing to a new question. All clients receive the update via Realtime.
 *
 * Mechanics:
 * - Everyone answers normally — scoring is identical to MCQ.
 * - The spotlight player sees a pulsing "🔥 YOU'RE IN THE HOT SEAT" banner.
 * - All other players see "[Name] is in the hot seat 👀".
 * - On reveal, the grid behaves identically to MCQ (green correct, red wrong).
 *
 * correct_answer contract: index of the correct option — identical to MCQ.
 * No DB migrations needed — round_type is TEXT since migration 047.
 * round_state.spotlight_player_id is written by the host control panel.
 *
 * See GAME_ARCHITECTURE.md §4 for the full PlayerView interface contract.
 */

import { Check, X, Flame } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

export function PressureCookerPlayerView({
  question,
  phase,
  timeLeft,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
  roundState,
  currentPlayerId,
}: RoundPlayerViewProps) {
  const optionLabels = ["A", "B", "C", "D"];
  const isTimedOut = timeLeft === 0 && !hasAnswered;

  // Spotlight resolution
  const spotlightId = roundState?.spotlight_player_id as string | undefined;
  const spotlightName = (roundState?.spotlight_display_name as string | undefined) ?? "A player";
  const isHotSeat = !!spotlightId && currentPlayerId === spotlightId;

  return (
    <div className="flex flex-col gap-4">
      {/* Spotlight banner */}
      {spotlightId && (
        isHotSeat ? (
          <div
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-[var(--bt-timer-amber)]/40 bg-[#fef3c7] dark:bg-[var(--bt-timer-amber)]/15 text-[#92400e] dark:text-[#fcd34d]"
            style={{ animation: "hot-seat-pulse 2s ease-in-out infinite" }}
          >
            <Flame size={16} strokeWidth={2.5} className="shrink-0" />
            <span className="text-sm font-bold tracking-wide uppercase">
              You&apos;re in the hot seat
            </span>
            <Flame size={16} strokeWidth={2.5} className="shrink-0" />
            <style>{`
              @keyframes hot-seat-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.65; }
              }
              @media (prefers-reduced-motion: reduce) {
                [style*="hot-seat-pulse"] { animation: none !important; }
              }
            `}</style>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 px-4 py-2 border border-amber-300/40 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400">
            <span className="text-xs font-semibold">👀</span>
            <span className="text-sm font-medium">
              <span className="font-bold">{spotlightName}</span> is in the hot seat
            </span>
          </div>
        )
      )}

      {/* Option grid — 2×2, identical layout to MCQ */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isCorrectOption = lastResult?.correctAnswer === i;
          const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;

          const isLong = option.length >= 40;
          let cls = `${isLong ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} min-h-14 border text-left transition-colors w-full `;

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
