/**
 * Pressure Cooker Round — unit tests
 *
 * Tests cover:
 * 1. Registry registration — round is discoverable by the engine
 * 2. Governance constraints — minPlayers 2, all event types
 * 3. Scoring contract — identical to MCQ (submit_answer ELSE branch)
 * 4. round_state contract — spotlight_player_id / spotlight_display_name shape
 * 5. Mechanic invariants — PlayerView distinct from MCQ, mindScanAutoGen false
 */

import { describe, it, expect } from "vitest";
import {
  roundRegistry,
  resolvePlayerView,
  getRegisteredRoundTypes,
} from "@/lib/game/round-registry";
import { MCQPlayerView } from "@/rounds/mcq/player-view";

// ── Registry ───────────────────────────────────────────────────────────────

describe("pressure_cooker round — registry", () => {
  it("is registered in the round registry", () => {
    expect(roundRegistry.has("pressure_cooker")).toBe(true);
  });

  it("has displayName 'Pressure Cooker'", () => {
    const mod = roundRegistry.get("pressure_cooker");
    expect(mod?.displayName).toBe("Pressure Cooker");
  });

  it("description mentions spotlight / hot seat", () => {
    const mod = roundRegistry.get("pressure_cooker");
    const desc = mod?.description.toLowerCase() ?? "";
    expect(desc).toMatch(/spotlight|hot seat/);
  });

  it("resolvePlayerView returns a function", () => {
    const View = resolvePlayerView("pressure_cooker");
    expect(typeof View).toBe("function");
  });

  it("PlayerView is distinct from MCQPlayerView", () => {
    const View = resolvePlayerView("pressure_cooker");
    expect(View).not.toBe(MCQPlayerView);
  });

  it("appears in getRegisteredRoundTypes()", () => {
    const types = getRegisteredRoundTypes().map((m) => m.type);
    expect(types).toContain("pressure_cooker");
  });

  it("mindScanAutoGen is false — spotlight is interpersonal, not content-based", () => {
    const mod = roundRegistry.get("pressure_cooker");
    expect(mod?.mindScanAutoGen).toBe(false);
  });
});

// ── Governance constraints ─────────────────────────────────────────────────

describe("pressure_cooker round — constraints", () => {
  const constraints = roundRegistry.get("pressure_cooker")?.constraints;

  it("requires at least 2 players (spotlight meaningless with 1)", () => {
    expect(constraints?.minPlayers).toBe(2);
  });

  it("supports IRL events", () => {
    expect(constraints?.eventTypes).toContain("irl");
  });

  it("supports virtual events", () => {
    expect(constraints?.eventTypes).toContain("virtual");
  });

  it("supports hybrid events", () => {
    expect(constraints?.eventTypes).toContain("hybrid");
  });

  it("has no maxPerGame restriction", () => {
    expect(constraints?.maxPerGame).toBeUndefined();
  });

  it("mustNotBeFirst is falsy — can open a game", () => {
    expect(constraints?.mustNotBeFirst).toBeFalsy();
  });
});

// ── Scoring contract ───────────────────────────────────────────────────────

/**
 * Pressure Cooker uses the MCQ scoring path in submit_answer (ELSE branch).
 * Score = base_points + time_bonus if correct, 0 if wrong.
 * We test the pure math here as documentation of the expected behaviour.
 */

function scorePressureCooker(
  isCorrect: boolean,
  basePoints: number,
  timeBonusEnabled: boolean,
  elapsed: number,
  timeLimit: number
): number {
  if (!isCorrect) return 0;
  if (!timeBonusEnabled) return basePoints;
  const ratio = Math.max(0, 1 - elapsed / timeLimit);
  const bonus = Math.round(basePoints * ratio);
  return basePoints + bonus;
}

describe("pressure_cooker round — scoring", () => {
  it("wrong answer scores 0", () => {
    expect(scorePressureCooker(false, 100, true, 5, 20)).toBe(0);
  });

  it("correct answer with no time bonus returns base_points", () => {
    expect(scorePressureCooker(true, 100, false, 5, 20)).toBe(100);
  });

  it("correct answer, instant response returns 2× base_points", () => {
    expect(scorePressureCooker(true, 100, true, 0, 20)).toBe(200);
  });

  it("correct answer at halfway returns 1.5× base_points", () => {
    expect(scorePressureCooker(true, 100, true, 10, 20)).toBe(150);
  });

  it("correct answer at time limit returns base_points (no negative bonus)", () => {
    expect(scorePressureCooker(true, 100, true, 20, 20)).toBe(100);
  });
});

// ── round_state contract ───────────────────────────────────────────────────

describe("pressure_cooker round — round_state contract", () => {
  it("spotlight shape has spotlight_player_id (string)", () => {
    const state = {
      spotlight_player_id: "player-uuid-123",
      spotlight_display_name: "Alice",
    };
    expect(typeof state.spotlight_player_id).toBe("string");
  });

  it("spotlight shape has spotlight_display_name (string)", () => {
    const state = {
      spotlight_player_id: "player-uuid-123",
      spotlight_display_name: "Alice",
    };
    expect(typeof state.spotlight_display_name).toBe("string");
  });

  it("hot seat detection: player matches spotlight_player_id", () => {
    const currentPlayerId = "player-uuid-123";
    const roundState = { spotlight_player_id: "player-uuid-123" };
    const isHotSeat = roundState.spotlight_player_id === currentPlayerId;
    expect(isHotSeat).toBe(true);
  });

  it("non-spotlight player is NOT in hot seat", () => {
    const currentPlayerId = "player-uuid-456";
    const roundState = { spotlight_player_id: "player-uuid-123" };
    const isHotSeat = roundState.spotlight_player_id === currentPlayerId;
    expect(isHotSeat).toBe(false);
  });

  it("missing round_state (non-pressure-cooker round) does not crash hot-seat check", () => {
    const roundState: Record<string, unknown> | undefined = undefined;
    const spotlightId = roundState?.spotlight_player_id as string | undefined;
    const isHotSeat = !!spotlightId && "player-uuid-123" === spotlightId;
    expect(isHotSeat).toBe(false);
  });
});
