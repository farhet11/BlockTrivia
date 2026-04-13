/**
 * Round Registry — the module dispatch system for BlockTrivia's game engine.
 *
 * RULES:
 * - The engine imports from here. It never imports from individual round modules directly.
 * - Adding a new round type = add one entry to `roundRegistry` below.
 * - Removing a round type = delete its entry + its src/rounds/{type}/ directory.
 *   Nothing else breaks.
 *
 * See GAME_ARCHITECTURE.md for the full interface spec.
 * See MODULE_ARCHITECTURE (Notion) for the system topology.
 */

import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type GamePhase =
  | "lobby"
  | "interstitial"
  | "playing"
  | "revealing"
  | "leaderboard"
  | "ended";

/** The shape of every question as it flows from the DB to the player screen. */
export interface QuestionData {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  sort_order: number;
  round_title: string;
  round_type: string;            // text, not enum — validated by round registry
  time_limit_seconds: number;
  base_points: number;
  time_bonus_enabled: boolean;
  /** Round-specific config from rounds.config JSONB (seeded by migration 047). */
  config: Record<string, unknown>;
  /** Pixel Reveal: image URL for the question. */
  image_url?: string | null;
}

/** Round-specific config stored in the JSONB `config` column on the rounds table. */
export interface RoundConfig {
  type: string;
  [key: string]: unknown;
}

/** Result returned to the player after submitting an answer. */
export interface AnswerResult {
  isCorrect: boolean;
  pointsAwarded: number;
  selectedAnswer: number;
  correctAnswer: number | undefined;
  explanation: string | null;
  didNotAnswer?: boolean;
  wagerAmt?: number;
}

/** Props every RoundPlayerView component receives. */
export interface RoundPlayerViewProps {
  question: QuestionData;
  phase: GamePhase;
  timeLeft: number | null;
  hasAnswered: boolean;
  isSubmitting: boolean;
  selectedAnswer: number | null;
  lastResult: AnswerResult | null;
  bankedScore: number;           // player's current total score (for WipeOut wager calc)
  onSubmit: (answer: number, metadata?: Record<string, unknown>) => void;
  // WipeOut wager state — only used by WipeOut PlayerView
  leverage?: number;
  onLeverageChange?: (value: number) => void;
  /**
   * Ephemeral per-question engine state (from game_state.round_state JSONB).
   * Used by rounds that need server-side coordination — e.g. Pressure Cooker
   * writes spotlight_player_id / spotlight_display_name here.
   */
  roundState?: Record<string, unknown>;
  /** The current player's profile ID — used by rounds that personalise per-player (e.g. spotlight). */
  currentPlayerId?: string;
}

// ---------------------------------------------------------------------------
// Governance constraints
// ---------------------------------------------------------------------------

/** Rules declared by each round module. The governance engine reads these. */
export interface ModuleConstraints {
  minPlayers?: number;
  maxPerGame?: number;           // max occurrences per game (soft warning if exceeded)
  mustNotBeFirst?: boolean;      // cannot be the opening round
  eventTypes?: ("irl" | "virtual" | "hybrid")[];
  incompatibleWith?: string[];   // round types that conflict with this one
}

// ---------------------------------------------------------------------------
// Round module definition
// ---------------------------------------------------------------------------

export interface RoundModule {
  /** Unique identifier — matches the round_type text value in the DB. */
  type: string;
  displayName: string;
  /** Short description shown in the question builder. */
  description: string;
  /** React component rendered on the player's play screen. */
  PlayerView: ComponentType<RoundPlayerViewProps>;
  /** Governance rules for this round type. */
  constraints: ModuleConstraints;
  /**
   * Whether MindScan can auto-generate questions for this round type.
   * If true, the round must also define a MindScanTemplate (future).
   */
  mindScanAutoGen: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

import { MCQPlayerView } from "@/rounds/mcq/player-view";
import { WipeOutPlayerView } from "@/rounds/wipeout/player-view";
import { ReversalPlayerView } from "@/rounds/reversal/player-view";
import { PressureCookerPlayerView } from "@/rounds/pressure-cooker/player-view";
import { PixelRevealPlayerView } from "@/rounds/pixel-reveal/player-view";
import { ClosestWinsPlayerView } from "@/rounds/closest-wins/player-view";
import { TheNarrativePlayerView } from "@/rounds/the-narrative/player-view";
import { OraclesDilemmaPlayerView } from "@/rounds/oracles-dilemma/player-view";

const modules: RoundModule[] = [
  {
    type: "mcq",
    displayName: "Multiple Choice",
    description: "4 answer options, one correct. Speed bonus rewards fast conviction.",
    PlayerView: MCQPlayerView,
    mindScanAutoGen: true,
    constraints: {
      minPlayers: 1,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "true_false",
    displayName: "True / False",
    description: "Binary conviction test. No hedging. Use only when the wrong answer is tempting.",
    PlayerView: MCQPlayerView,  // reuses MCQ view — options capped to 2 by question data
    mindScanAutoGen: true,
    constraints: {
      minPlayers: 1,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "wipeout",
    displayName: "WipeOut",
    description: "MCQ + wager slider. Bet 10%–100% of your banked score. Right = gain. Wrong = lose.",
    PlayerView: WipeOutPlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 2,
      maxPerGame: 2,             // soft warning after 2 WipeOut rounds in one game
      mustNotBeFirst: true,      // players need a banked score before wagering
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "reversal",
    displayName: "Reversal",
    description:
      "4 statements shown — 3 are true, 1 is false. Players identify the false one. " +
      "Mark the false statement as the correct answer in the builder.",
    PlayerView: ReversalPlayerView,
    mindScanAutoGen: true,
    constraints: {
      minPlayers: 1,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "pressure_cooker",
    displayName: "Pressure Cooker",
    description:
      "One player is randomly spotlighted per question — they answer while everyone watches. " +
      "Everyone scores normally. The hot seat rotates each question.",
    PlayerView: PressureCookerPlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 2,             // spotlight is meaningless with only one player
      mustNotBeFirst: false,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  // ─── New round types (Phase 5) ────────────────────────────────────────────
  {
    type: "pixel_reveal",
    displayName: "Pixel Reveal",
    description:
      "Image starts blurred, progressively clears. Early correct answers earn a quadratic time bonus.",
    PlayerView: PixelRevealPlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 1,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "closest_wins",
    displayName: "Closest Wins",
    description:
      "Players type a numeric answer. Scoring based on distance from the correct value — closer = more points.",
    PlayerView: ClosestWinsPlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 1,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "the_narrative",
    displayName: "The Narrative",
    description:
      "All players vote. The majority vote becomes 'correct.' Rewards reading the room, not knowing facts.",
    PlayerView: TheNarrativePlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 3,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
  {
    type: "oracles_dilemma",
    displayName: "Oracle's Dilemma",
    description:
      "One random Oracle sees the answer and chooses: truth or deception. Others decide whether to trust them.",
    PlayerView: OraclesDilemmaPlayerView,
    mindScanAutoGen: false,
    constraints: {
      minPlayers: 3,
      mustNotBeFirst: true,
      eventTypes: ["irl", "virtual", "hybrid"],
    },
  },
];

/** The registry — the engine's single source of truth for round modules. */
export const roundRegistry = new Map<string, RoundModule>(
  modules.map((m) => [m.type, m])
);

/**
 * Resolve the PlayerView component for a given round type.
 * Falls back to MCQ if the type is unknown (defensive — should never happen in prod).
 */
export function resolvePlayerView(roundType: string): ComponentType<RoundPlayerViewProps> {
  const module = roundRegistry.get(roundType);
  if (!module) {
    console.warn(
      `[round-registry] Unknown round type "${roundType}" — falling back to MCQ view. ` +
      "Register the module in src/lib/game/round-registry.ts."
    );
    return MCQPlayerView;
  }
  return module.PlayerView;
}

/**
 * Get constraints for a round type.
 * Used by the governance engine at build time and game start.
 */
export function getRoundConstraints(roundType: string): ModuleConstraints {
  return roundRegistry.get(roundType)?.constraints ?? {};
}

/**
 * All registered round types — used to populate the round type selector
 * in the question builder.
 */
export function getRegisteredRoundTypes(): RoundModule[] {
  return Array.from(roundRegistry.values());
}
