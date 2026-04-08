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
   * Each entry is a Claude-generated diagnostic question + the host's pick.
   */
  followups?: Array<{
    question: string;
    answer: string;
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
