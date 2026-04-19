"use client";

/**
 * DefaultHostRevealView — renders the options grid with the correct answer
 * highlighted green, styled to match the player's MCQ view (same badge sizing,
 * same colors, same letter labels). Used by any round whose correct answer is
 * an index into options[]: mcq, true_false, reversal, wipeout, pressure_cooker,
 * oracles_dilemma, the_narrative.
 *
 * Incorrect options are dimmed (not hidden) so the host screen reads as a
 * recap of what players saw.
 */

import { Check } from "lucide-react";
import type { HostRevealViewProps } from "@/lib/game/round-registry";

export function DefaultHostRevealView({ question }: HostRevealViewProps) {
  const options = (question.options ?? []) as string[];
  const correctIdx = question.correct_answer;
  const isTrueFalse = options.length <= 2;
  const optionLabels = isTrueFalse ? ["A", "B"] : ["A", "B", "C", "D"];
  const gridCols = isTrueFalse ? "grid-cols-1" : "grid-cols-2";

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {options.map((opt, i) => {
        const isCorrect = i === correctIdx;
        const letter = optionLabels[i] ?? String.fromCharCode(65 + i);
        const isLong = opt.length >= 40;

        const cls = `${isLong ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} ${
          isTrueFalse ? "min-h-16" : "min-h-14"
        } border text-left ${
          isCorrect
            ? "border-correct bg-[var(--bt-correct-tint)] text-foreground"
            : "border-border text-foreground opacity-60"
        }`;

        const badgeCls = `${isLong ? "absolute top-[6px] left-[8px]" : "shrink-0"} w-5 h-5 flex items-center justify-center text-[11px] font-medium ${
          isCorrect
            ? "bg-[var(--bt-correct)] text-white"
            : "bg-[var(--bt-hover)] text-[var(--bt-stone)]"
        }`;

        return (
          <div key={i} className={cls}>
            <span className={badgeCls}>
              {isCorrect ? <Check size={14} strokeWidth={2.5} /> : letter}
            </span>
            <span className={isCorrect ? "font-medium" : ""}>
              {opt}
            </span>
          </div>
        );
      })}
    </div>
  );
}
