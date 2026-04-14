/**
 * Modifier Registry — the dispatch system for BlockTrivia's scoring modifiers.
 *
 * RULES:
 * - The engine imports from here. Never import from individual modifier modules directly.
 * - Adding a new modifier = add one entry to `modifierRegistry` below.
 * - Removing a modifier = delete its entry + its src/modifiers/{type}/ directory.
 *   Nothing else breaks.
 *
 * MODIFIER CONTRACT:
 * - Modifiers wrap scorer output — they never touch question logic or rendering.
 * - Scoring happens server-side in the submit_answer RPC. The client-side module
 *   is UI-only: banner, overlay, pot display.
 * - Max 1 active modifier per round (enforced at DB level via UNIQUE constraint).
 * - Max 2 modifier activations per game (soft warning in builder).
 *
 * See GAME_ARCHITECTURE.md §6 for the full interface spec.
 */

import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Stored in round_modifiers.config JSONB. Shape varies per modifier type. */
export interface ModifierConfig {
  /** Matches the modifier_type text value in round_modifiers. */
  type: string;
  [key: string]: unknown;
}

/** Props every ModifierUIOverlay component receives. */
export interface ModifierOverlayProps {
  config: Record<string, unknown>;
  /** True during the revealing phase — overlay may adjust to show outcome. */
  isRevealing: boolean;
  /** Whether this player won the jackpot (only meaningful for Jackpot Mode). */
  jackpotWinner?: boolean;
}

/**
 * A complete modifier module definition.
 * The PlayerView components in src/modifiers/{type}/ui-overlay.tsx implement this.
 */
export interface ModifierModule {
  /** Unique identifier — matches the modifier_type text value in round_modifiers. */
  type: string;
  displayName: string;
  /** Short description shown in the question builder modifier picker. */
  description: string;
  /** Round types this modifier can be applied to. Empty = compatible with all. */
  compatibleRounds: string[];
  /**
   * Optional React component overlaid on the player screen while the modifier
   * is active (e.g. JACKPOT banner with violet RoundTypeBadge). Rendered above
   * the question view.
   */
  UIOverlay?: ComponentType<ModifierOverlayProps>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { JackpotUIOverlay } from "@/modifiers/jackpot/ui-overlay";

const modules: ModifierModule[] = [
  {
    type: "jackpot",
    displayName: "Jackpot Mode",
    description:
      "First correct answer takes the pot (base_points × 5×). All others score 0. " +
      "No second chances — fastest conviction wins.",
    compatibleRounds: [], // empty = all round types
    UIOverlay: JackpotUIOverlay,
  },
  // ─── Add new modifiers here ────────────────────────────────────────────────
  // {
  //   type: "liquidation",
  //   displayName: "Liquidation Mode",
  //   description: "Bottom 25% by speed are frozen for the next question. 3-round duration.",
  //   compatibleRounds: ["wipeout", "mcq", "true_false"],
  //   UIOverlay: LiquidationUIOverlay,
  // },
];

/** The registry — the engine's single source of truth for modifiers. */
export const modifierRegistry = new Map<string, ModifierModule>(
  modules.map((m) => [m.type, m])
);

/**
 * All registered modifiers — used to populate the modifier picker
 * in the question builder.
 */
export function getRegisteredModifiers(): ModifierModule[] {
  return Array.from(modifierRegistry.values());
}

/**
 * Resolve the UIOverlay component for a given modifier type.
 * Returns null if the type is unknown or has no overlay.
 */
export function resolveModifierOverlay(
  modifierType: string
): ComponentType<ModifierOverlayProps> | null {
  return modifierRegistry.get(modifierType)?.UIOverlay ?? null;
}

/**
 * Check whether a modifier is compatible with a given round type.
 * Empty compatibleRounds = compatible with everything.
 */
export function isModifierCompatible(
  modifierType: string,
  roundType: string
): boolean {
  const mod = modifierRegistry.get(modifierType);
  if (!mod) return false;
  if (mod.compatibleRounds.length === 0) return true;
  return mod.compatibleRounds.includes(roundType);
}
