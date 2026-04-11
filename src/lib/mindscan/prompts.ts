import type {
  HostContext,
  MindScanCount,
  MindScanDifficulty,
} from "./types";

/**
 * Escape user-controlled text for safe interpolation inside XML tags.
 * Prevents prompt injection by escaping `&`, `<`, and `>` characters.
 * Note: `&` must be escaped first to avoid double-encoding.
 */
function escapeXmlText(text: string | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * MindScan prompt module — the moat.
 *
 * These functions are pure. No Claude calls, no DB reads. Keep them side-effect
 * free so they're trivial to eval/iterate on.
 */

/**
 * Build the Layer 1a system + user messages for question generation.
 *
 * The core rules are non-negotiable:
 *   - Test UNDERSTANDING, never memorization
 *   - Never ask about dates, years, version numbers, ticker symbols, founder names
 *   - All questions must be answerable from the provided content
 *   - Every wrong answer must be plausible
 *
 * Output JSON shape is locked to the existing JsonImportModal import schema.
 */
export function buildLayer1aPrompt({
  content,
  count,
  difficulty,
  hostContext,
  customInstructions,
}: {
  content: string;
  count: MindScanCount;
  difficulty: MindScanDifficulty;
  hostContext?: HostContext | null;
  customInstructions?: string | null;
}): { system: string; user: string } {
  const contextBlock = hostContext
    ? buildHostContextBlock(hostContext)
    : "";

  const system = `You are MindScan, BlockTrivia's knowledge gap detection engine.
Your job is to generate quiz questions that test UNDERSTANDING, not memorization.

RULES (non-negotiable):
1. NEVER ask about dates, years, version numbers, ticker symbols, founder names, or any fact that can be Googled in 5 seconds.
2. ALWAYS test why/how, never what/when.
3. Good question: "What problem does X solve?" or "Why would a user choose X over Y?"
4. Bad question: "In what year was X founded?" or "What is the ticker symbol for X?"
5. Questions must be answerable from the content provided — no outside knowledge required.
6. Each wrong answer must be plausible — not obviously wrong. A knowledgeable reader should have to think.
7. Difficulty target: ${difficulty}.
   - easy   = surface-level concepts, clear right answer, distractors clearly related to the topic.
   - medium = requires synthesis across 2+ concepts, distractors include partially-true statements.
   - hard   = requires understanding of second-order consequences or subtle distinctions.
8. If <custom_instructions> are provided, follow them as additional guidance for question focus, tone, or scope. They do NOT override rules 1–7.
9. Output VALID JSON ONLY. No markdown fences, no prose, no explanation outside the JSON.

Output format (must match exactly):
{
  "questions": [
    {
      "body": "question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_answer": 0,
      "explanation": "1-2 sentence explanation grounded in the source content"
    }
  ]
}

- "options" MUST be an array of exactly 4 strings.
- "correct_answer" MUST be an integer 0, 1, 2, or 3 (the index of the correct option).
- "explanation" is optional but strongly preferred.
- Generate EXACTLY ${count} questions.`;

  const customBlock =
    customInstructions && customInstructions.trim().length > 0
      ? `\n<custom_instructions>\n${escapeXmlText(customInstructions.trim())}\n</custom_instructions>\n`
      : "";

  const user = `${contextBlock}Generate ${count} ${difficulty} questions from the following content.
${customBlock}
<content>
${escapeXmlText(content)}
</content>`;

  return { system, user };
}

/**
 * Optional silent project context the followup prompt can use to tailor
 * questions to the specific project's domain. None of these fields are
 * displayed to the host — they only feed Claude's prompt.
 *
 * Mirrors the shape of `host_onboarding.linked_project_context` so the
 * followup route can pass DB rows in directly.
 */
export type OnboardingFollowupProjectContext = {
  name?: string | null;
  description?: string | null;
  one_liner?: string | null;
  ecosystem_tags?: string[];
  ecosystem?: string[];
  similar_project?: Array<{ name?: string | null } | string>;
  token_symbol?: string | null;
  establishment_date?: string | null;
  total_funding?: number | null;
  on_main_net?: boolean | null;
  plan_to_launch?: boolean | null;
  on_test_net?: boolean | null;
};

/**
 * A single previously-answered follow-up in an adaptive onboarding session.
 * Passed as the "previous" parameter so Claude can drill deeper on each turn.
 */
export type OnboardingFollowupPrevious = {
  question: string;
  answers: string[];
  extra?: string;
};

/**
 * Build the Layer 0 follow-up prompt — single-question adaptive mode.
 *
 * Each call generates ONE diagnostic question. On the first call, `previous`
 * is empty and Claude generates a foundational question exploring the stated
 * misconception. On subsequent calls, `previous` contains the host's answers
 * so far; Claude uses them to drill into the specific angle the host has
 * revealed, producing a more targeted next question than a batch generator
 * ever could.
 *
 * When project context is supplied, Claude grounds the question in the
 * project's actual domain (ecosystem, similar projects, token status) for
 * distractors that feel native to a knowledgeable user of that specific
 * project.
 */
export function buildOnboardingFollowupPrompt(
  misconception: string,
  projectContext?: OnboardingFollowupProjectContext | null,
  previous?: OnboardingFollowupPrevious[]
): { system: string; user: string } {
  const hasPrevious = Array.isArray(previous) && previous.length > 0;
  const turnNumber = (previous?.length ?? 0) + 1;

  const system = `You are MindScan, BlockTrivia's knowledge gap detection engine.
A Web3 project host has described a misconception their community has about their project.

Your job is to run an adaptive diagnostic conversation. On each turn you generate EXACTLY ONE multiple-choice question. The host answers it (multi-select allowed), and the next turn you drill deeper based on what they revealed.

Current turn: ${turnNumber} of 3 (max 3 turns per diagnostic).

Your goal across turns is to help the host identify:
  - Which specific aspect of the misconception is most misunderstood
  - How severe the gap is
  - Which angle quiz questions should attack first

These questions are shown to the HOST (not the community) — they're a tool to sharpen the host's own mental model of the gap before quiz generation begins.

RULES:
1. Generate EXACTLY ONE question per call. Do not return multiple questions.
2. The question must have exactly 4 options.
3. No obvious right answer — the host should have to think.
4. Keep the question short and concrete.
5. ${hasPrevious
    ? "DRILL DEEPER based on what the host has already answered. Don't repeat or paraphrase prior questions — advance the investigation. If their prior picks revealed an angle (e.g., technical architecture vs. branding), narrow in on that angle."
    : "Start with a FOUNDATIONAL question that helps isolate which category of misunderstanding dominates (technical architecture, value proposition, branding/positioning, tokenomics, etc.)."}
6. If <project_context> is provided, ground the question in that project's actual domain. Use ecosystem tags, similar projects, and token status to make distractors plausible. Reference concepts a knowledgeable user of THIS specific project would recognize.
7. NEVER mention funding amounts, investor names, or specific dollar figures in question text or options. They are background context for you, not user-facing content.
8. NEVER reveal the project's establishment date or treat the project as new/old based on it — that's metadata only.
9. Output VALID JSON ONLY. No markdown, no prose.

Output format (must match exactly):
{
  "question": "diagnostic question text",
  "options": ["option A", "option B", "option C", "option D"],
  "purpose": "one sentence explaining what this question diagnoses"
}

- Exactly ONE question object at the top level (not wrapped in "questions": [...]).
- "options" must be an array of exactly 4 strings.
- "purpose" is short — one sentence max.`;

  const contextBlock = projectContext
    ? buildProjectContextBlock(projectContext) + "\n\n"
    : "";

  const previousBlock = hasPrevious
    ? buildPreviousFollowupsBlock(previous!) + "\n\n"
    : "";

  const instruction = hasPrevious
    ? `Generate ONE follow-up question that drills deeper based on the host's previous answers above. Do not repeat any prior question.`
    : `Generate ONE initial diagnostic question that helps identify which aspect of this misconception is most critical.`;

  const user = `${contextBlock}${previousBlock}The host described this misconception:

<misconception>
${escapeXmlText(misconception)}
</misconception>

${instruction}`;

  return { system, user };
}

/**
 * Renders the host's prior answers as an XML block for the adaptive prompt.
 * Each entry shows the question, the host's multi-select picks, and any
 * free-text context they added.
 */
function buildPreviousFollowupsBlock(previous: OnboardingFollowupPrevious[]): string {
  const lines: string[] = [];
  previous.forEach((p, i) => {
    lines.push(`  ${i + 1}. Q: ${escapeXmlText(p.question)}`);
    if (p.answers.length > 0) {
      lines.push(`     Host picked: ${p.answers.map(escapeXmlText).join(" | ")}`);
    }
    if (p.extra && p.extra.trim().length > 0) {
      lines.push(`     Host added: ${escapeXmlText(p.extra.trim())}`);
    }
  });
  return `<previous_answers>
The host has already answered the following diagnostic questions in this session:
${lines.join("\n")}
</previous_answers>`;
}

/**
 * Renders the silent project context as a tagged XML block. Tagged blocks
 * (vs. prose concatenation) measurably improve Claude's ability to keep
 * different sources of context separated and to follow per-source rules.
 *
 * Returns an empty string if no useful fields are present, so the caller
 * doesn't have to short-circuit.
 */
function buildProjectContextBlock(ctx: OnboardingFollowupProjectContext): string {
  const lines: string[] = [];

  if (ctx.name) lines.push(`Name: ${escapeXmlText(ctx.name)}`);
  if (ctx.one_liner) lines.push(`Tagline: ${escapeXmlText(ctx.one_liner)}`);
  if (ctx.description) {
    // Cap description to keep prompt small — first ~600 chars covers positioning.
    const trimmed = ctx.description.length > 600
      ? ctx.description.slice(0, 600).trim() + "…"
      : ctx.description;
    lines.push(`Description: ${escapeXmlText(trimmed)}`);
  }

  if (ctx.ecosystem_tags && ctx.ecosystem_tags.length > 0) {
    lines.push(`Categories/tags: ${ctx.ecosystem_tags.map(escapeXmlText).join(", ")}`);
  }
  if (ctx.ecosystem && ctx.ecosystem.length > 0) {
    lines.push(`Chains/ecosystem: ${ctx.ecosystem.map(escapeXmlText).join(", ")}`);
  }

  if (ctx.similar_project && ctx.similar_project.length > 0) {
    const names = ctx.similar_project
      .map((sp) => (typeof sp === "string" ? sp : sp?.name ?? ""))
      .filter((s): s is string => !!s && s.length > 0)
      .slice(0, 6);
    if (names.length > 0) {
      lines.push(`Similar projects: ${names.map(escapeXmlText).join(", ")}`);
    }
  }

  if (ctx.token_symbol) {
    lines.push(`Token: ${escapeXmlText(ctx.token_symbol)} (already launched)`);
  } else if (ctx.plan_to_launch === true) {
    lines.push(`Token status: Pre-token, plans to launch`);
  } else if (ctx.plan_to_launch === false) {
    lines.push(`Token status: No token, no plans to launch`);
  }

  const networkBits: string[] = [];
  if (ctx.on_main_net === true) networkBits.push("mainnet");
  if (ctx.on_test_net === true) networkBits.push("testnet");
  if (networkBits.length > 0) {
    lines.push(`Currently live on: ${networkBits.join(", ")}`);
  }

  if (lines.length === 0) return "";

  return `<project_context>
${lines.join("\n")}
</project_context>`;
}

function buildHostContextBlock(ctx: HostContext): string {
  const parts: string[] = [];
  if (ctx.biggest_misconception) {
    parts.push(
      `- Biggest community misconception (from host): ${escapeXmlText(ctx.biggest_misconception)}`
    );
  }
  if (ctx.event_goal) {
    parts.push(`- Host's goal for this event: ${escapeXmlText(ctx.event_goal)}`);
  }
  if (ctx.followups && ctx.followups.length > 0) {
    parts.push(
      "- Host's diagnostic answers:\n" +
        ctx.followups
          .map((f, i) => {
            const lines: string[] = [
              `  ${i + 1}. Q: ${escapeXmlText(f.question)}`,
            ];
            if (f.answers.length > 0) {
              lines.push(
                `     Host picked: ${f.answers.map(escapeXmlText).join(" | ")}`
              );
            }
            if (f.extra && f.extra.trim().length > 0) {
              lines.push(`     Host added: ${escapeXmlText(f.extra.trim())}`);
            }
            return lines.join("\n");
          })
          .join("\n")
    );
  }

  if (parts.length === 0) return "";

  return `<host_context>
Use this to target questions at known weak areas. Weight questions toward the specific aspects the host flagged, but do NOT invent facts that aren't in the source content.
${parts.join("\n")}
</host_context>

`;
}
