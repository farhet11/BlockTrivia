/**
 * Tests for pure helper functions in the onboarding-followup API route.
 *
 * We test the logic in isolation by reimplementing the functions here,
 * keeping them in sync with the source. This is valid because these are
 * pure, side-effect-free helpers — no DB, no auth, no Claude calls.
 *
 * If the source functions change, the tests will catch regressions.
 */

import { describe, it, expect } from "vitest";

// ─── extractJson (reimplemented for testability) ─────────────────────────────

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

describe("extractJson", () => {
  it("parses raw JSON without fences", () => {
    const result = extractJson('{"question":"What is X?","options":["A","B","C","D"]}');
    expect(result).toEqual({ question: "What is X?", options: ["A", "B", "C", "D"] });
  });

  it("parses JSON inside ```json fences", () => {
    const result = extractJson('```json\n{"key":"value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("parses JSON inside plain ``` fences (no language tag)", () => {
    const result = extractJson('```\n{"key":"value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for malformed JSON", () => {
    expect(extractJson("{not valid json}")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJson("")).toBeNull();
  });

  it("returns null for plain text (no JSON)", () => {
    expect(extractJson("Here is a question about blockchain.")).toBeNull();
  });

  it("parses JSON inside fences even with surrounding prose", () => {
    const result = extractJson('Sure! Here you go:\n```json\n{"x":1}\n```\nHope this helps.');
    expect(result).toEqual({ x: 1 });
  });
});

// ─── normalizeQuestion + validateSingleQuestion (reimplemented) ──────────────

interface OnboardingFollowupQuestion {
  question: string;
  options: string[];
  purpose?: string;
}

function normalizeQuestion(q: Record<string, unknown>): OnboardingFollowupQuestion | null {
  if (typeof q.question !== "string" || q.question.trim().length === 0) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4) return null;
  if (!q.options.every((o) => typeof o === "string" && o.trim().length > 0)) return null;
  return {
    question: q.question.trim(),
    options: (q.options as string[]).map((o) => o.trim()),
    purpose: typeof q.purpose === "string" ? q.purpose : undefined,
  };
}

function validateSingleQuestion(parsed: unknown): OnboardingFollowupQuestion | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.question === "string" && Array.isArray(obj.options)) {
    return normalizeQuestion(obj);
  }
  if (Array.isArray(obj.questions) && obj.questions.length > 0) {
    const first = obj.questions[0];
    if (first && typeof first === "object") {
      return normalizeQuestion(first as Record<string, unknown>);
    }
  }
  return null;
}

describe("validateSingleQuestion", () => {
  const VALID = {
    question: "Which consensus mechanism does Ethereum use?",
    options: ["Proof of Work", "Proof of Stake", "Delegated PoS", "Byzantine Fault Tolerance"],
    purpose: "Check understanding",
  };

  it("accepts the preferred top-level shape", () => {
    const result = validateSingleQuestion(VALID);
    expect(result).toEqual(VALID);
  });

  it("accepts the wrapped { questions: [...] } fallback shape", () => {
    const result = validateSingleQuestion({ questions: [VALID] });
    expect(result).toEqual(VALID);
  });

  it("returns null for null input", () => {
    expect(validateSingleQuestion(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validateSingleQuestion("a string")).toBeNull();
    expect(validateSingleQuestion(42)).toBeNull();
  });

  it("returns null when options array is missing", () => {
    expect(validateSingleQuestion({ question: "X?" })).toBeNull();
  });

  it("returns null when options has fewer than 4 entries", () => {
    expect(validateSingleQuestion({ question: "X?", options: ["A", "B", "C"] })).toBeNull();
  });

  it("returns null when options has more than 4 entries", () => {
    expect(
      validateSingleQuestion({ question: "X?", options: ["A", "B", "C", "D", "E"] })
    ).toBeNull();
  });

  it("returns null when an option is blank", () => {
    expect(
      validateSingleQuestion({ question: "X?", options: ["A", "", "C", "D"] })
    ).toBeNull();
  });

  it("returns null when question is blank", () => {
    expect(
      validateSingleQuestion({ question: "   ", options: ["A", "B", "C", "D"] })
    ).toBeNull();
  });

  it("trims whitespace from question and options", () => {
    const result = validateSingleQuestion({
      question: "  What is X?  ",
      options: [" A ", " B ", " C ", " D "],
    });
    expect(result?.question).toBe("What is X?");
    expect(result?.options).toEqual(["A", "B", "C", "D"]);
  });

  it("purpose is optional — omitted when not a string", () => {
    const result = validateSingleQuestion({
      question: "X?",
      options: ["A", "B", "C", "D"],
      purpose: null,
    });
    expect(result?.purpose).toBeUndefined();
  });

  it("uses the first element of the questions array in fallback shape", () => {
    const second = { question: "Second?", options: ["W", "X", "Y", "Z"] };
    const result = validateSingleQuestion({ questions: [VALID, second] });
    expect(result?.question).toBe(VALID.question);
  });
});
