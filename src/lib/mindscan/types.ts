/**
 * MindScan shared types.
 *
 * The question shape must stay in sync with `ImportQuestion` in
 * `src/app/host/(dashboard)/events/[id]/questions/_components/json-import-modal.tsx`
 * — questions flow straight from MindScan into the existing import path without
 * transformation, so the shapes must match exactly.
 */

export type MindScanQuestion = {
  body: string;
  options: string[]; // always length 4 for MCQ
  correct_answer: number; // 0-based index into `options`
  explanation?: string;
};

export type MindScanDifficulty = "easy" | "medium" | "hard";
export type MindScanCount = 5 | 10 | 15;

/**
 * Host context pulled from `host_onboarding`. Passed to the Layer 1a prompt
 * to target questions at known weak areas.
 */
export type HostContext = {
  biggest_misconception?: string | null;
  event_goal?: string | null;
  /**
   * Structured follow-up Q&A from Layer 0.
   * Each entry is a Claude-generated diagnostic question + the host's
   * multi-select answer + optional free-text addition.
   */
  followups?: Array<{
    question: string;
    /** Options the host checked. May be empty if they only wrote free text. */
    answers: string[];
    /** Optional free-text addition the host wrote below the checkboxes. */
    extra?: string | null;
  }> | null;
};

/**
 * A single Claude-generated follow-up MCQ from Layer 0.
 */
export type OnboardingFollowupQuestion = {
  question: string;
  options: string[];
  purpose?: string;
};

/**
 * Host's answer to a single follow-up question. Multi-select + free-text —
 * diagnostic questions in the wild rarely fit a single option cleanly.
 *
 * Persisted in `host_onboarding.ai_followup_answers` as an array of these,
 * one per question (indexed by position).
 */
export type FollowupAnswer = {
  choices: string[];
  extra?: string;
};

/**
 * Coerce raw `ai_followup_answers` from the DB into a normalized
 * FollowupAnswer[] of length `questionCount`. Handles:
 *
 *   - Legacy string[] rows (pre-multi-select): "foo" → { choices: ["foo"] }
 *   - Null / undefined rows: empty answers padded to questionCount
 *   - Short arrays: padded with empty answers
 *   - New object rows: passed through with defensive defaults
 *
 * This is the single source of truth for answer shape — everything else
 * (UI, prompt builder, onboarding-reminder) should call this first.
 */
export function coerceFollowupAnswers(
  raw: unknown,
  questionCount: number
): FollowupAnswer[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: FollowupAnswer[] = [];
  for (let i = 0; i < questionCount; i++) {
    const item = list[i];
    if (typeof item === "string") {
      // Legacy single-select row — wrap in choices if non-empty.
      out.push({
        choices: item.trim().length > 0 ? [item] : [],
        extra: "",
      });
      continue;
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const choices = Array.isArray(obj.choices)
        ? obj.choices.filter((c): c is string => typeof c === "string")
        : [];
      const extra = typeof obj.extra === "string" ? obj.extra : "";
      out.push({ choices, extra });
      continue;
    }
    out.push({ choices: [], extra: "" });
  }
  return out;
}

/**
 * True if the host has meaningfully answered a follow-up question —
 * either picked at least one checkbox OR written free-text content.
 */
export function isFollowupAnswered(answer: FollowupAnswer): boolean {
  if (answer.choices.length > 0) return true;
  if (answer.extra && answer.extra.trim().length > 0) return true;
  return false;
}
