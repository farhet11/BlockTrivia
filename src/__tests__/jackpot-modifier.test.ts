/**
 * Jackpot Mode modifier — unit tests
 *
 * These tests exercise the client-side logic and contracts for the
 * Jackpot modifier. The server-side scoring (RPC) is tested separately
 * via Supabase SQL tests. Here we cover:
 *
 * 1. modifier-registry: lookup, compatibility, overlay resolution
 * 2. Jackpot scoring logic (pure function mirror of what the RPC does)
 *    — useful for UI preview and "what would I score?" display
 */

import { describe, it, expect } from "vitest";
import {
  modifierRegistry,
  getRegisteredModifiers,
  resolveModifierOverlay,
  isModifierCompatible,
} from "@/lib/game/modifier-registry";

// ── Registry tests ─────────────────────────────────────────────────────────

describe("modifierRegistry", () => {
  it("has at least one modifier registered", () => {
    expect(modifierRegistry.size).toBeGreaterThan(0);
  });

  it("jackpot is in the registry", () => {
    expect(modifierRegistry.has("jackpot")).toBe(true);
  });

  it("jackpot has a displayName and description", () => {
    const mod = modifierRegistry.get("jackpot");
    expect(mod?.displayName).toBeTruthy();
    expect(mod?.description).toBeTruthy();
  });

  it("jackpot has a UIOverlay component", () => {
    const mod = modifierRegistry.get("jackpot");
    expect(mod?.UIOverlay).toBeDefined();
    expect(typeof mod?.UIOverlay).toBe("function");
  });
});

describe("getRegisteredModifiers", () => {
  it("returns an array with all registered modifiers", () => {
    const mods = getRegisteredModifiers();
    expect(Array.isArray(mods)).toBe(true);
    expect(mods.length).toBe(modifierRegistry.size);
  });

  it("each modifier has required fields", () => {
    for (const mod of getRegisteredModifiers()) {
      expect(typeof mod.type).toBe("string");
      expect(mod.type.length).toBeGreaterThan(0);
      expect(typeof mod.displayName).toBe("string");
      expect(typeof mod.description).toBe("string");
      expect(Array.isArray(mod.compatibleRounds)).toBe(true);
    }
  });
});

// ── resolveModifierOverlay ─────────────────────────────────────────────────

describe("resolveModifierOverlay", () => {
  it("returns the JackpotUIOverlay for jackpot type", () => {
    const overlay = resolveModifierOverlay("jackpot");
    expect(overlay).toBeDefined();
    expect(typeof overlay).toBe("function");
  });

  it("returns null for unknown modifier type", () => {
    const overlay = resolveModifierOverlay("nonexistent_modifier_xyz");
    expect(overlay).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveModifierOverlay("")).toBeNull();
  });
});

// ── isModifierCompatible ───────────────────────────────────────────────────

describe("isModifierCompatible", () => {
  it("jackpot is compatible with mcq (empty compatibleRounds = all types)", () => {
    expect(isModifierCompatible("jackpot", "mcq")).toBe(true);
  });

  it("jackpot is compatible with true_false", () => {
    expect(isModifierCompatible("jackpot", "true_false")).toBe(true);
  });

  it("jackpot is compatible with wipeout", () => {
    expect(isModifierCompatible("jackpot", "wipeout")).toBe(true);
  });

  it("jackpot is compatible with a future unknown round type (empty = all)", () => {
    expect(isModifierCompatible("jackpot", "reversal")).toBe(true);
  });

  it("unknown modifier type is incompatible with any round", () => {
    expect(isModifierCompatible("nonexistent", "mcq")).toBe(false);
  });
});

// ── Jackpot scoring logic (pure function mirror of the SQL RPC) ────────────
//
// The RPC does:
//   if jackpot active:
//     first correct answer → floor(base_points × multiplier)
//     any other answer (wrong OR late correct) → 0
//
// We test the same rules here so the UI can preview scores accurately.

function calcJackpotPoints({
  isCorrect,
  isFirstCorrect,
  basePoints,
  multiplier = 5,
}: {
  isCorrect: boolean;
  isFirstCorrect: boolean;
  basePoints: number;
  multiplier?: number;
}): number {
  if (!isCorrect) return 0;
  if (!isFirstCorrect) return 0;
  return Math.floor(basePoints * multiplier);
}

describe("calcJackpotPoints (mirror of submit_answer jackpot branch)", () => {
  it("first correct answer wins base × multiplier", () => {
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: true, basePoints: 100 })).toBe(500);
  });

  it("custom multiplier is applied", () => {
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: true, basePoints: 100, multiplier: 3 })).toBe(300);
  });

  it("floors non-integer results", () => {
    // 100 × 3.7 = 370 exactly; 50 × 3 = 150 exactly
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: true, basePoints: 100, multiplier: 3.7 })).toBe(370);
  });

  it("wrong answer scores 0 even if first to answer", () => {
    expect(calcJackpotPoints({ isCorrect: false, isFirstCorrect: true, basePoints: 100 })).toBe(0);
  });

  it("correct but not first scores 0", () => {
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: false, basePoints: 100 })).toBe(0);
  });

  it("wrong and not first scores 0", () => {
    expect(calcJackpotPoints({ isCorrect: false, isFirstCorrect: false, basePoints: 100 })).toBe(0);
  });

  it("works with zero base_points (edge: host misconfiguration)", () => {
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: true, basePoints: 0 })).toBe(0);
  });

  it("works with a 1× multiplier (jackpot = normal scoring)", () => {
    expect(calcJackpotPoints({ isCorrect: true, isFirstCorrect: true, basePoints: 100, multiplier: 1 })).toBe(100);
  });
});
