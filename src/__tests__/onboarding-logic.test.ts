import { describe, it, expect } from "vitest";

/**
 * Tests for pure logic extracted from onboarding components.
 *
 * deriveStartingStep — determines which step to resume from based on saved data.
 * reminderCompletion — calculates the % shown in the dashboard reminder banner.
 */

// ── deriveStartingStep ─────────────────────────────────────────────────────

/** Mirrors the function in onboarding-flow.tsx — keep in sync. */
function deriveStartingStep(d: {
  role: string;
  community_channels: string[];
  event_goal: string;
  biggest_misconception: string;
  ai_followup_questions: unknown[];
}): 1 | 2 | 3 | 4 {
  if (d.ai_followup_questions.length > 0) return 4;
  if (d.biggest_misconception.trim().length >= 15) return 3;
  if (d.role || d.community_channels.length > 0 || d.event_goal) return 2;
  return 1;
}

const EMPTY = {
  role: "",
  community_channels: [] as string[],
  event_goal: "",
  biggest_misconception: "",
  ai_followup_questions: [] as unknown[],
};

describe("deriveStartingStep", () => {
  it("returns 1 for completely empty data (brand-new host)", () => {
    expect(deriveStartingStep(EMPTY)).toBe(1);
  });

  it("returns 2 when only step-1 fields are filled", () => {
    expect(deriveStartingStep({ ...EMPTY, role: "Founder" })).toBe(2);
    expect(
      deriveStartingStep({ ...EMPTY, community_channels: ["Discord"] })
    ).toBe(2);
    expect(deriveStartingStep({ ...EMPTY, event_goal: "Educate community" })).toBe(2);
  });

  it("returns 3 when biggest_misconception has >= 15 chars", () => {
    expect(
      deriveStartingStep({
        ...EMPTY,
        biggest_misconception: "exactly fifteen",
      })
    ).toBe(3);
  });

  it("returns 2 (not 3) when biggest_misconception is < 15 chars", () => {
    // 14 chars — below the threshold
    expect(
      deriveStartingStep({
        ...EMPTY,
        role: "Founder",
        biggest_misconception: "too short here",
      })
    ).toBe(2);
  });

  it("returns 4 when followup questions are present", () => {
    expect(
      deriveStartingStep({
        ...EMPTY,
        biggest_misconception: "a very long misconception text",
        ai_followup_questions: [{ question: "Q?", options: ["A", "B", "C", "D"] }],
      })
    ).toBe(4);
  });

  it("ignores other fields when followup questions exist", () => {
    // Even with nothing else filled, followup questions → step 4
    expect(
      deriveStartingStep({
        ...EMPTY,
        ai_followup_questions: [{}],
      })
    ).toBe(4);
  });
});

// ── reminderCompletion ─────────────────────────────────────────────────────

/** Mirrors the signal computation in onboarding-reminder.tsx — keep in sync. */
function reminderCompletion({
  role,
  communityChannels,
  eventGoal,
  biggestMisconception,
  aiFollowupAnswers,
}: {
  role: string | null;
  communityChannels: string[] | null;
  eventGoal: string | null;
  biggestMisconception: string | null;
  aiFollowupAnswers: string[] | null;
}): number {
  const signals = [
    Boolean(role),
    Array.isArray(communityChannels) && communityChannels.length > 0,
    Boolean(eventGoal),
    typeof biggestMisconception === "string" &&
      biggestMisconception.trim().length >= 15,
    Array.isArray(aiFollowupAnswers) &&
      aiFollowupAnswers.length > 0 &&
      aiFollowupAnswers.every((a) => a && a.trim().length > 0),
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}

describe("reminderCompletion", () => {
  it("returns 0% when nothing is filled", () => {
    expect(
      reminderCompletion({
        role: null,
        communityChannels: null,
        eventGoal: null,
        biggestMisconception: null,
        aiFollowupAnswers: null,
      })
    ).toBe(0);
  });

  it("returns 100% when all 5 signals are satisfied", () => {
    expect(
      reminderCompletion({
        role: "Founder",
        communityChannels: ["Discord"],
        eventGoal: "Educate community",
        biggestMisconception: "a long enough misconception",
        aiFollowupAnswers: ["answer A", "answer B"],
      })
    ).toBe(100);
  });

  it("returns 20% for each satisfied signal (role only)", () => {
    expect(
      reminderCompletion({
        role: "Founder",
        communityChannels: null,
        eventGoal: null,
        biggestMisconception: null,
        aiFollowupAnswers: null,
      })
    ).toBe(20);
  });

  it("returns 40% for two signals (role + channels)", () => {
    expect(
      reminderCompletion({
        role: "Founder",
        communityChannels: ["Telegram"],
        eventGoal: null,
        biggestMisconception: null,
        aiFollowupAnswers: null,
      })
    ).toBe(40);
  });

  it("does not count misconception shorter than 15 chars", () => {
    expect(
      reminderCompletion({
        role: null,
        communityChannels: null,
        eventGoal: null,
        biggestMisconception: "too short",
        aiFollowupAnswers: null,
      })
    ).toBe(0);
  });

  it("does not count followup answers if any are blank", () => {
    expect(
      reminderCompletion({
        role: null,
        communityChannels: null,
        eventGoal: null,
        biggestMisconception: null,
        aiFollowupAnswers: ["answer A", ""],
      })
    ).toBe(0);
  });

  it("does not count empty communityChannels array", () => {
    expect(
      reminderCompletion({
        role: null,
        communityChannels: [],
        eventGoal: null,
        biggestMisconception: null,
        aiFollowupAnswers: null,
      })
    ).toBe(0);
  });
});

// ── checkAndLog rate-limit logic ───────────────────────────────────────────

/**
 * Pure unit tests for the rate-limit window calculation logic.
 * We can't test the Supabase calls directly, but we can verify the
 * window start calculation and limit enforcement logic.
 */

const WINDOW_HOURS = 1;
const LIMITS = { generate: 20, "onboarding-followup": 10 };

function computeWindowStart(now: number = Date.now()): Date {
  return new Date(now - WINDOW_HOURS * 60 * 60 * 1000);
}

function isOverLimit(
  count: number,
  endpoint: "generate" | "onboarding-followup"
): boolean {
  return count >= (LIMITS[endpoint] ?? 20);
}

describe("rate-limit window calculation", () => {
  it("window start is exactly 1 hour before now", () => {
    const now = 1_000_000_000;
    const windowStart = computeWindowStart(now);
    expect(windowStart.getTime()).toBe(now - 3_600_000);
  });

  it("is NOT over limit at count = 19 for generate", () => {
    expect(isOverLimit(19, "generate")).toBe(false);
  });

  it("IS over limit at count = 20 for generate", () => {
    expect(isOverLimit(20, "generate")).toBe(true);
  });

  it("IS over limit at count = 21 for generate (burst protection)", () => {
    expect(isOverLimit(21, "generate")).toBe(true);
  });

  it("is NOT over limit at count = 9 for onboarding-followup", () => {
    expect(isOverLimit(9, "onboarding-followup")).toBe(false);
  });

  it("IS over limit at count = 10 for onboarding-followup", () => {
    expect(isOverLimit(10, "onboarding-followup")).toBe(true);
  });
});

// ── T/F import validation logic ────────────────────────────────────────────

/**
 * Pure logic extracted from json-import-modal.tsx validation.
 * Tests the MCQ-into-TF detection logic.
 */

function hasMcqOptions(
  questions: Array<{ options?: string[] }>
): { hasMcq: boolean; count: number } {
  const mcq = questions.filter(
    (q) => Array.isArray(q.options) && q.options.length > 2
  );
  return { hasMcq: mcq.length > 0, count: mcq.length };
}

describe("T/F import validation", () => {
  it("passes for questions with no options (pure T/F format)", () => {
    const qs = [{ body: "Statement A" }, { body: "Statement B" }];
    expect(hasMcqOptions(qs).hasMcq).toBe(false);
  });

  it("passes for questions with exactly 2 options", () => {
    const qs = [{ options: ["True", "False"] }];
    expect(hasMcqOptions(qs).hasMcq).toBe(false);
  });

  it("rejects questions with 4 options (MCQ format)", () => {
    const qs = [{ options: ["A", "B", "C", "D"] }];
    const result = hasMcqOptions(qs);
    expect(result.hasMcq).toBe(true);
    expect(result.count).toBe(1);
  });

  it("rejects mixed batch: 1 T/F + 1 MCQ", () => {
    const qs = [
      { options: ["True", "False"] },
      { options: ["A", "B", "C", "D"] },
    ];
    const result = hasMcqOptions(qs);
    expect(result.hasMcq).toBe(true);
    expect(result.count).toBe(1);
  });

  it("counts all MCQ questions in a batch", () => {
    const qs = [
      { options: ["A", "B", "C", "D"] },
      { options: ["A", "B", "C", "D"] },
      { options: ["True", "False"] },
    ];
    const result = hasMcqOptions(qs);
    expect(result.count).toBe(2);
  });

  it("passes for empty questions array", () => {
    expect(hasMcqOptions([]).hasMcq).toBe(false);
  });

  it("passes for questions with 3 options (edge: T/F/Maybe format)", () => {
    const qs = [{ options: ["True", "False", "Maybe"] }];
    // 3 > 2, so this IS considered MCQ (correct — 3-option Qs don't belong in T/F rounds)
    expect(hasMcqOptions(qs).hasMcq).toBe(true);
  });
});

// ── auto-save stale timestamp guard ─────────────────────────────────────────

/**
 * Tests the stale-save detection logic from onboarding-flow.tsx.
 * Verifies the condition: skip if scheduledAt !== lastUpdatedAt AND lastUpdatedAt !== null.
 */

function shouldSkipStaleSave(
  scheduledAt: string | null,
  lastUpdatedAt: string | null
): boolean {
  return scheduledAt !== lastUpdatedAt && lastUpdatedAt !== null;
}

describe("auto-save stale timestamp guard", () => {
  it("does NOT skip when timestamps match (no concurrent save)", () => {
    expect(shouldSkipStaleSave("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("SKIPS when lastUpdatedAt changed (another save happened)", () => {
    expect(
      shouldSkipStaleSave("2026-01-01T00:00:00Z", "2026-01-01T00:00:01Z")
    ).toBe(true);
  });

  it("does NOT skip when lastUpdatedAt is null (first save, no server timestamp yet)", () => {
    expect(shouldSkipStaleSave("2026-01-01T00:00:00Z", null)).toBe(false);
  });

  it("does NOT skip when both are null (brand new user, no saves yet)", () => {
    expect(shouldSkipStaleSave(null, null)).toBe(false);
  });

  it("SKIPS when scheduledAt is null but lastUpdatedAt has a value", () => {
    // scheduledAt=null means scheduled before any save; if a save happened since, skip
    expect(shouldSkipStaleSave(null, "2026-01-01T00:00:01Z")).toBe(true);
  });
});
