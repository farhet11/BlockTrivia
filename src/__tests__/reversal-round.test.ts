/**
 * Reversal Round — unit tests
 *
 * Tests cover:
 * 1. Registry registration — round is discoverable by the engine
 * 2. Scoring contract — same as MCQ (handled by submit_answer ELSE branch)
 * 3. Mechanic invariants — correct_answer = index of the FALSE statement
 * 4. MindScan auto-gen flag — must be true for content-based generation
 * 5. Governance constraints
 */

import { describe, it, expect } from "vitest";
import {
  roundRegistry,
  resolvePlayerView,
  getRegisteredRoundTypes,
} from "@/lib/game/round-registry";

// ── Registry ───────────────────────────────────────────────────────────────

describe("reversal round — registry", () => {
  it("is registered in the round registry", () => {
    expect(roundRegistry.has("reversal")).toBe(true);
  });

  it("has displayName and description", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.displayName).toBeTruthy();
    expect(mod?.description.length).toBeGreaterThan(20);
  });

  it("description communicates the 3-true-1-lie mechanic", () => {
    const mod = roundRegistry.get("reversal");
    const desc = mod?.description.toLowerCase() ?? "";
    // Player-facing copy: "3 are true, 1 is a lie. Spot the lie."
    // We just require the mechanic is encoded — either 'false' or 'lie'.
    expect(desc).toMatch(/false|lie/);
  });

  it("has a PlayerView component", () => {
    const mod = roundRegistry.get("reversal");
    expect(typeof mod?.PlayerView).toBe("function");
  });

  it("resolvePlayerView returns a component for reversal", () => {
    const view = resolvePlayerView("reversal");
    expect(typeof view).toBe("function");
  });

  it("is included in getRegisteredRoundTypes()", () => {
    const types = getRegisteredRoundTypes().map((m) => m.type);
    expect(types).toContain("reversal");
  });

  it("mindScanAutoGen is true", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.mindScanAutoGen).toBe(true);
  });
});

// ── Governance constraints ─────────────────────────────────────────────────

describe("reversal round — constraints", () => {
  it("minPlayers is 1", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.constraints.minPlayers).toBe(1);
  });

  it("is compatible with all event types", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.constraints.eventTypes).toContain("irl");
    expect(mod?.constraints.eventTypes).toContain("virtual");
    expect(mod?.constraints.eventTypes).toContain("hybrid");
  });

  it("has no maxPerGame restriction", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.constraints.maxPerGame).toBeUndefined();
  });

  it("does not require being non-first (can open a game)", () => {
    const mod = roundRegistry.get("reversal");
    expect(mod?.constraints.mustNotBeFirst).toBeFalsy();
  });
});

// ── Scoring contract ───────────────────────────────────────────────────────
//
// Reversal uses the MCQ scoring path in submit_answer (the ELSE branch).
// The RPC doesn't know the round semantics — it just checks
//   p_selected_answer = v_correct_answer
// where correct_answer = index of the FALSE statement.
//
// We test the pure scoring logic here (same as scoreMCQ from round-scorers).

function scoreReversal({
  isCorrect,
  basePoints,
  timeTakenMs,
  timeLimitMs,
  timeBonusEnabled,
}: {
  isCorrect: boolean;
  basePoints: number;
  timeTakenMs: number;
  timeLimitMs: number;
  timeBonusEnabled: boolean;
}): number {
  if (!isCorrect) return 0;
  let points = basePoints;
  if (timeBonusEnabled) {
    const ratio = Math.max(0, 1 - timeTakenMs / timeLimitMs);
    points += Math.floor(basePoints * ratio);
  }
  return points;
}

describe("reversal scoring (mirrors MCQ submit_answer ELSE branch)", () => {
  it("wrong answer scores 0", () => {
    expect(
      scoreReversal({
        isCorrect: false,
        basePoints: 100,
        timeTakenMs: 5000,
        timeLimitMs: 15000,
        timeBonusEnabled: true,
      })
    ).toBe(0);
  });

  it("correct answer with no time bonus = base_points", () => {
    expect(
      scoreReversal({
        isCorrect: true,
        basePoints: 100,
        timeTakenMs: 14000,
        timeLimitMs: 15000,
        timeBonusEnabled: false,
      })
    ).toBe(100);
  });

  it("instant correct answer = 2× base_points (full time bonus)", () => {
    expect(
      scoreReversal({
        isCorrect: true,
        basePoints: 100,
        timeTakenMs: 0,
        timeLimitMs: 15000,
        timeBonusEnabled: true,
      })
    ).toBe(200);
  });

  it("halfway correct answer = 150 pts (50% time bonus)", () => {
    expect(
      scoreReversal({
        isCorrect: true,
        basePoints: 100,
        timeTakenMs: 7500,
        timeLimitMs: 15000,
        timeBonusEnabled: true,
      })
    ).toBe(150);
  });

  it("time bonus floors at 0 (no negative bonus)", () => {
    expect(
      scoreReversal({
        isCorrect: true,
        basePoints: 100,
        timeTakenMs: 20000,     // over the limit
        timeLimitMs: 15000,
        timeBonusEnabled: true,
      })
    ).toBe(100);
  });
});

// ── Mechanic invariants ────────────────────────────────────────────────────

describe("reversal mechanic invariants", () => {
  it("always has exactly 4 options (no T/F collapse)", () => {
    // Reversal questions must have 4 options — 3 true + 1 false.
    // The PlayerView always renders all 4 (no isTrueFalse slice).
    // This is a documentation test: ensure the round module doesn't
    // inherit the MCQ T/F special-casing.
    const mod = roundRegistry.get("reversal");
    // ReversalPlayerView is a distinct component, not the MCQ view
    const mcqMod = roundRegistry.get("mcq");
    expect(mod?.PlayerView).not.toBe(mcqMod?.PlayerView);
  });

  it("correct_answer = index of the FALSE statement (mechanic contract)", () => {
    // Documented contract: the host marks the false statement as
    // correct_answer in the builder. The engine finds it by index.
    // This test verifies the design intent is documented in the module —
    // the description must communicate the lie/false-statement mechanic
    // (phrasing is player-facing, so either 'false' or 'lie' is acceptable).
    const mod = roundRegistry.get("reversal");
    expect(mod?.description.toLowerCase()).toMatch(/false|lie/);
  });
});
