"use client";

/**
 * Closest Wins host reveal — the "correct answer" is a numeric target, not
 * an options index. Render it prominently with any unit string from config,
 * plus a distribution chart of all player guesses.
 */

import { Target } from "lucide-react";
import { ClosestWinsDistributionChart } from "./distribution-chart";
import type { HostRevealViewProps } from "@/lib/game/round-registry";

function formatNumeric(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

export function ClosestWinsHostRevealView({
  question,
  roundConfig,
  roundState,
}: HostRevealViewProps) {
  const target = question.correct_answer_numeric;
  const unit =
    typeof roundConfig?.unit === "string"
      ? (roundConfig.unit as string)
      : typeof (question.config as Record<string, unknown>)?.unit === "string"
        ? ((question.config as Record<string, unknown>).unit as string)
        : null;

  const guesses = Array.isArray(roundState?.guesses)
    ? ((roundState.guesses as unknown[]).filter(
        (v) => typeof v === "number" && Number.isFinite(v),
      ) as number[])
    : [];

  return (
    <div className="space-y-3">
      <div className="border border-correct bg-[#dcfce7] dark:bg-correct/15 p-5 flex flex-col items-center justify-center gap-1.5 text-center">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-correct">
          <Target size={12} strokeWidth={2.5} />
          Target answer
        </span>
        <p className="font-mono text-3xl sm:text-4xl font-bold text-correct tabular-nums leading-none">
          {target !== null && target !== undefined ? formatNumeric(target) : "—"}
        </p>
        {unit && (
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {unit}
          </p>
        )}
      </div>

      {target !== null && target !== undefined && guesses.length > 0 && (
        <ClosestWinsDistributionChart
          guesses={guesses}
          target={target}
          showStats
          unit={unit}
        />
      )}
    </div>
  );
}
