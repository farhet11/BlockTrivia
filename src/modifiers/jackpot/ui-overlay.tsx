"use client";

/**
 * Jackpot Mode UI Overlay
 *
 * Rendered above the question view when a round has the 'jackpot' modifier active.
 * Shows the pot size pre-answer and the winner/pot-taken outcome post-reveal.
 *
 * Design intent: dramatic but fair. First correct answer wins the multiplier.
 * Everyone else who answers correctly still scores normal base + speed points.
 * (See migration 076 for the RPC-side change away from winner-takes-all.)
 *
 * Layout: renders as a full-width strip (no outer padding wrapper) so it
 * aligns flush with the reveal banner above/below it.
 */

import type { ModifierOverlayProps } from "@/lib/game/modifier-registry";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";

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
        <div className="flex items-center justify-center gap-2 px-5 py-3 bg-amber-400/20 border-b border-amber-400/50 text-sm font-semibold text-amber-300 animate-pulse">
          <RoundTypeBadge type="jackpot" size={20} />
          <span>JACKPOT — you took the pot!</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-3 bg-muted/30 border-b border-border text-sm font-medium text-muted-foreground">
        <RoundTypeBadge type="jackpot" size={20} />
        <span>Jackpot claimed — scores settled normally</span>
      </div>
    );
  }

  // Pre-answer: show the stakes
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-3 bg-amber-400/10 border-b border-amber-400/40">
      <RoundTypeBadge type="jackpot" size={20} />
      <span className="text-sm font-semibold text-amber-300">
        JACKPOT MODE
      </span>
      <span className="text-xs text-amber-400/70 ml-1">
        First correct answer wins {multiplier}× points — everyone else scores normally
      </span>
    </div>
  );
}
