"use client";

/**
 * Jackpot Mode UI Overlay
 *
 * Rendered above the question view when a round has the 'jackpot' modifier active.
 * Shows the pot size pre-answer and the winner/loser outcome post-reveal.
 *
 * Design intent: dramatic and unmistakable. The player knows the stakes the
 * moment the question loads. Correct and fast = jackpot. Everyone else = zero.
 */

import type { ModifierOverlayProps } from "@/lib/game/modifier-registry";

/** Default multiplier if config doesn't specify one — matches the RPC default. */
const DEFAULT_MULTIPLIER = 5;

export function JackpotUIOverlay({
  config,
  isRevealing,
  jackpotWinner,
}: ModifierOverlayProps) {
  const multiplier = (config?.multiplier as number) ?? DEFAULT_MULTIPLIER;

  if (isRevealing) {
    // Post-answer: show winner/loser outcome
    if (jackpotWinner) {
      return (
        <div className="w-full px-4 pt-2 pb-1">
          <div className="flex items-center justify-center gap-2 bg-amber-400/20 border border-amber-400/50 px-4 py-2 text-sm font-semibold text-amber-300 animate-pulse">
            <span className="text-base">🎰</span>
            <span>JACKPOT — you took the pot!</span>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full px-4 pt-2 pb-1">
        <div className="flex items-center justify-center gap-2 bg-zinc-800/60 border border-zinc-700/50 px-4 py-2 text-sm font-medium text-zinc-400">
          <span className="text-base">🎰</span>
          <span>Jackpot taken — 0 pts</span>
        </div>
      </div>
    );
  }

  // Pre-answer: show the stakes
  return (
    <div className="w-full px-4 pt-2 pb-1">
      <div className="flex items-center justify-center gap-2 bg-amber-400/10 border border-amber-400/40 px-4 py-2">
        <span className="text-base">🎰</span>
        <span className="text-sm font-semibold text-amber-300">
          JACKPOT MODE
        </span>
        <span className="text-xs text-amber-400/70 ml-1">
          First correct answer wins {multiplier}× points — all others score 0
        </span>
      </div>
    </div>
  );
}
