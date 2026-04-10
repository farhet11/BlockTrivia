/**
 * Tests for MCQ/WipeOut scorer pure functions + round registry dispatch.
 *
 * These functions run client-side for optimistic score preview.
 * The server (submit_answer RPC) is always authoritative — these tests verify
 * that the client-side preview mirrors the server formula exactly.
 */

import { describe, it, expect } from "vitest";
import { scoreMCQ } from "@/rounds/mcq/scorer";
import { scoreWipeOut } from "@/rounds/wipeout/scorer";

// ---------------------------------------------------------------------------
// scoreMCQ
// ---------------------------------------------------------------------------

describe("scoreMCQ", () => {
  const BASE = 100;
  const TIME_LIMIT_S = 15;

  it("returns 0 for wrong answer regardless of timing", () => {
    expect(
      scoreMCQ({ isCorrect: false, basePoints: BASE, timeTakenMs: 1000, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true })
    ).toBe(0);
    expect(
      scoreMCQ({ isCorrect: false, basePoints: BASE, timeTakenMs: 0, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true })
    ).toBe(0);
  });

  it("returns basePoints for correct answer at time limit (zero bonus)", () => {
    // At the exact limit, ratio = 0, so bonus = 0
    expect(
      scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: TIME_LIMIT_S * 1000, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true })
    ).toBe(BASE);
  });

  it("returns 2× basePoints for instant correct answer with time bonus", () => {
    // At t=0, ratio = 1.0, so score = base + base = 2×base
    expect(
      scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: 0, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true })
    ).toBe(200);
  });

  it("returns only basePoints when time bonus is disabled, regardless of speed", () => {
    expect(
      scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: 0, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: false })
    ).toBe(BASE);
    expect(
      scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: 1000, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: false })
    ).toBe(BASE);
  });

  it("clamps time above the limit to the limit (no negative bonus)", () => {
    // Time over limit should behave identically to time at limit
    const atLimit = scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: TIME_LIMIT_S * 1000, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true });
    const overLimit = scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: TIME_LIMIT_S * 1000 + 5000, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true });
    expect(overLimit).toBe(atLimit);
    expect(overLimit).toBeGreaterThanOrEqual(0);
  });

  it("scores correctly at halfway point (time bonus = 50%)", () => {
    // At 7500ms of 15000ms limit: ratio = 0.5, bonus = floor(100 × 0.5) = 50
    expect(
      scoreMCQ({ isCorrect: true, basePoints: BASE, timeTakenMs: 7500, timeLimitSeconds: TIME_LIMIT_S, timeBonusEnabled: true })
    ).toBe(150);
  });

  it("floors the time bonus (no fractional points)", () => {
    // basePoints = 100, timeTakenMs = 100, timeLimitSeconds = 3
    // ratio = 1 - 100/3000 = 0.96666...  bonus = floor(100 * 0.9666) = floor(96.66) = 96
    expect(
      scoreMCQ({ isCorrect: true, basePoints: 100, timeTakenMs: 100, timeLimitSeconds: 3, timeBonusEnabled: true })
    ).toBe(196);
  });
});

// ---------------------------------------------------------------------------
// scoreWipeOut
// ---------------------------------------------------------------------------

describe("scoreWipeOut", () => {
  it("adds wager amount for correct answer", () => {
    // banked=500, wagerPct=0.5 → wagerAmt=floor(500×0.5)=250
    expect(scoreWipeOut({ isCorrect: true, wagerPct: 0.5, bankedScore: 500 })).toBe(250);
  });

  it("subtracts wager amount for wrong answer (capped at banked score)", () => {
    // banked=500, wagerPct=0.5 → wagerAmt=250, loss=min(250,500)=250
    expect(scoreWipeOut({ isCorrect: false, wagerPct: 0.5, bankedScore: 500 })).toBe(-250);
  });

  it("uses 50pt floor when banked score is 0 (comeback mechanic)", () => {
    // banked=0, wagerPct=1.0 → wagerAmt=floor(max(50,0)×1.0)=50
    expect(scoreWipeOut({ isCorrect: true, wagerPct: 1.0, bankedScore: 0 })).toBe(50);
  });

  it("uses 50pt floor when banked score is below 50", () => {
    // banked=20, wagerPct=1.0 → wagerAmt=floor(max(50,20)×1.0)=50
    expect(scoreWipeOut({ isCorrect: true, wagerPct: 1.0, bankedScore: 20 })).toBe(50);
  });

  it("cannot lose more than current banked score (floor at 0 net)", () => {
    // banked=30, wagerPct=1.0 → wagerAmt=floor(max(50,30)×1.0)=50
    // loss = min(50, 30) = 30 (not 50 — can't go below zero)
    expect(scoreWipeOut({ isCorrect: false, wagerPct: 1.0, bankedScore: 30 })).toBe(-30);
  });

  it("floors the wager amount (no fractional points)", () => {
    // banked=100, wagerPct=0.33 → wagerAmt=floor(100×0.33)=33
    expect(scoreWipeOut({ isCorrect: true, wagerPct: 0.33, bankedScore: 100 })).toBe(33);
  });

  it("max loss for a player all-in at 100%", () => {
    // banked=1000, wagerPct=1.0 → wagerAmt=1000, loss=min(1000,1000)=1000
    expect(scoreWipeOut({ isCorrect: false, wagerPct: 1.0, bankedScore: 1000 })).toBe(-1000);
  });

  it("minimum wager at 10%", () => {
    // banked=200, wagerPct=0.10 → wagerAmt=floor(200×0.10)=20
    expect(scoreWipeOut({ isCorrect: true, wagerPct: 0.10, bankedScore: 200 })).toBe(20);
  });
});
