"use client";

/**
 * Oracle's Dilemma PlayerView
 *
 * MECHANIC:
 *   One random player is the "Oracle" per question. Oracle sees the correct
 *   answer and chooses: tell the truth or deceive. Other players see Oracle's
 *   suggestion and decide whether to trust it.
 *
 * SCORING (mirrors SQL in migration 055):
 *   Oracle (truth):     base_points x 0.5 (guaranteed, reduced)
 *   Oracle (deception): base_points x (deceived / total_non_oracle) — scored on reveal
 *   Non-oracle:         standard MCQ scoring (oracle hint is just info)
 *
 * PHASES:
 *   1. Oracle sees correct answer + chooses truth/deception + picks suggestion
 *   2. Non-oracle players see Oracle's suggestion badge + standard MCQ grid
 *
 * DB: Uses game_state.round_state for:
 *   { oracle_player_id, oracle_display_name, oracle_choice, oracle_suggested_answer }
 */

import { useState } from "react";
import { Check, X, Eye, EyeOff, Sparkles } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";

const OPTION_LABELS = ["A", "B", "C", "D"];

export function OraclesDilemmaPlayerView({
  question,
  phase,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
  roundState,
  currentPlayerId,
}: RoundPlayerViewProps) {
  const isRevealing = phase === "revealing" && lastResult !== null;

  // Oracle state from round_state
  const oraclePlayerId = roundState?.oracle_player_id as string | undefined;
  const oracleDisplayName = (roundState?.oracle_display_name as string | undefined) ?? "The Oracle";
  const oracleChoice = roundState?.oracle_choice as "truth" | "deception" | undefined;
  const oracleSuggestedAnswer = roundState?.oracle_suggested_answer as number | undefined;

  const isOracle = !!oraclePlayerId && currentPlayerId === oraclePlayerId;
  const oracleHasChosen = !!oracleChoice;

  // Oracle's choice phase state
  const [selectedPath, setSelectedPath] = useState<"truth" | "deception" | null>(null);
  const [suggestedOption, setSuggestedOption] = useState<number | null>(null);

  // Oracle submits their choice (truth/deception + which answer to suggest)
  const handleOracleSubmit = () => {
    if (!selectedPath || suggestedOption === null) return;
    onSubmit(suggestedOption, {
      oracle_choice: selectedPath,
      oracle_suggested_answer: suggestedOption,
    });
  };

  // ── Oracle's choice phase (before they've chosen) ────────────────────────
  if (isOracle && !oracleHasChosen && !hasAnswered && phase === "playing") {
    return (
      <div className="flex flex-col gap-4">
        {/* Oracle identity banner */}
        <div
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-violet-400/40 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400"
          style={{ animation: "hot-seat-pulse 2s ease-in-out infinite" }}
        >
          <Sparkles size={16} strokeWidth={2} className="shrink-0" />
          <span className="text-sm font-bold tracking-wide uppercase">
            You are the Oracle
          </span>
          <Sparkles size={16} strokeWidth={2} className="shrink-0" />
        </div>

        {/* Path selection */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground text-center">
            Choose your path
          </span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedPath("truth")}
              className={`flex flex-col items-center gap-2 p-4 border transition-colors ${
                selectedPath === "truth"
                  ? "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct"
                  : "border-border text-foreground hover:border-correct/50"
              }`}
            >
              <Eye size={20} strokeWidth={2} />
              <span className="text-sm font-bold">Truth</span>
              <span className="text-[10px] text-muted-foreground">
                Guaranteed 50% points
              </span>
            </button>
            <button
              onClick={() => setSelectedPath("deception")}
              className={`flex flex-col items-center gap-2 p-4 border transition-colors ${
                selectedPath === "deception"
                  ? "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong"
                  : "border-border text-foreground hover:border-wrong/50"
              }`}
            >
              <EyeOff size={20} strokeWidth={2} />
              <span className="text-sm font-bold">Deception</span>
              <span className="text-[10px] text-muted-foreground">
                More fooled = more points
              </span>
            </button>
          </div>
        </div>

        {/* Suggest an answer */}
        {selectedPath && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground text-center">
              {selectedPath === "truth"
                ? "Suggest the correct answer to help others"
                : "Suggest a wrong answer to mislead others"}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {question.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSuggestedOption(i)}
                  className={`flex items-center gap-2 p-3 border text-sm transition-colors ${
                    suggestedOption === i
                      ? "border-primary bg-accent-light text-primary"
                      : "border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-[4px] text-[10px] font-semibold bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400">
                    {OPTION_LABELS[i]}
                  </span>
                  <span className="leading-snug break-words font-medium">{option}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm button */}
        {selectedPath && suggestedOption !== null && (
          <button
            onClick={handleOracleSubmit}
            disabled={isSubmitting}
            className="px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm border border-primary hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <BlockSpinner variant="wave" size={16} />
                Submitting...
              </span>
            ) : (
              `Confirm ${selectedPath === "truth" ? "Truth" : "Deception"}`
            )}
          </button>
        )}
      </div>
    );
  }

  // ── Oracle waiting state (after choosing) ─────────────────────────────────
  if (isOracle && (oracleHasChosen || hasAnswered)) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex items-center gap-2 px-4 py-2.5 border border-violet-400/40 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400">
          <Sparkles size={16} strokeWidth={2} />
          <span className="text-sm font-bold">Oracle — {oracleChoice ?? selectedPath}</span>
        </div>
        <span className="text-sm text-muted-foreground text-center">
          Your suggestion has been sent. Waiting for others to answer...
        </span>
        {isRevealing && lastResult && (
          <div className={`px-5 py-3 border ${
            lastResult.isCorrect
              ? "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct"
              : "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong"
          }`}>
            <span className="text-sm font-semibold">
              +{lastResult.pointsAwarded} points
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Non-oracle player view — standard MCQ with oracle suggestion badge ────
  return (
    <div className="flex flex-col gap-3">
      {/* Oracle suggestion banner */}
      {oracleHasChosen && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border border-violet-300/40 bg-violet-50 dark:bg-violet-900/10 text-violet-700 dark:text-violet-400">
          <Sparkles size={14} strokeWidth={2} />
          <span className="text-sm font-medium">
            <span className="font-bold">{oracleDisplayName}</span> suggests option{" "}
            <span className="font-bold">
              {oracleSuggestedAnswer !== undefined ? OPTION_LABELS[oracleSuggestedAnswer] : "?"}
            </span>
            {" "}— trust or ignore?
          </span>
        </div>
      )}

      {!oracleHasChosen && phase === "playing" && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border border-amber-300/40 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400">
          <Sparkles size={14} strokeWidth={2} />
          <span className="text-sm font-medium">
            Waiting for the Oracle to make their choice...
          </span>
        </div>
      )}

      {/* 2x2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isCorrectOption = lastResult?.correctAnswer === i;
          const isOracleSuggested = oracleSuggestedAnswer === i;

          let cls = "flex items-center gap-3 p-4 min-h-14 border text-left transition-colors w-full relative ";

          if (isRevealing) {
            if (isCorrectOption) cls += "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct";
            else if (isSelected) cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
            else cls += "border-border text-muted-foreground opacity-50";
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered) {
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
              disabled={hasAnswered || phase !== "playing" || isSubmitting || !oracleHasChosen}
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
              <span className="leading-snug break-words text-sm font-medium flex-1">
                {isSubmitting && isSelected ? (
                  <span className="inline-flex items-center gap-1.5">
                    <BlockSpinner variant="wave" size={16} />
                    {option}
                  </span>
                ) : (
                  option
                )}
              </span>
              {/* Oracle suggestion badge */}
              {isOracleSuggested && oracleHasChosen && !isRevealing && (
                <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-500/30">
                  <Sparkles size={10} />
                  Oracle
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
