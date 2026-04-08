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
