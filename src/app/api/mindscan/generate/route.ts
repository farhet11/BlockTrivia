import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAnthropicClient, MINDSCAN_MODEL } from "@/lib/anthropic";
import { buildLayer1aPrompt } from "@/lib/mindscan/prompts";
import { checkAndLog } from "@/lib/mindscan/rate-limit";
import type {
  HostContext,
  MindScanCount,
  MindScanDifficulty,
  MindScanQuestion,
} from "@/lib/mindscan/types";

const MAX_CONTENT_CHARS = 30_000;
const MIN_CONTENT_CHARS = 50;
const ALLOWED_COUNTS: MindScanCount[] = [5, 10, 15];
const ALLOWED_DIFFICULTIES: MindScanDifficulty[] = ["easy", "medium", "hard"];

export async function POST(request: Request) {
  // --- 1. Parse + validate input ---------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, count, difficulty } = (body ?? {}) as {
    content?: unknown;
    count?: unknown;
    difficulty?: unknown;
  };

  if (typeof content !== "string" || content.trim().length < MIN_CONTENT_CHARS) {
    return NextResponse.json(
      {
        error: `Content is required and must be at least ${MIN_CONTENT_CHARS} characters.`,
      },
      { status: 400 }
    );
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      {
        error: `Content is too long (${content.length} chars). Maximum is ${MAX_CONTENT_CHARS}.`,
      },
      { status: 400 }
    );
  }
  if (
    typeof count !== "number" ||
    !ALLOWED_COUNTS.includes(count as MindScanCount)
  ) {
    return NextResponse.json(
      { error: `count must be one of ${ALLOWED_COUNTS.join(", ")}` },
      { status: 400 }
    );
  }
  if (
    typeof difficulty !== "string" ||
    !ALLOWED_DIFFICULTIES.includes(difficulty as MindScanDifficulty)
  ) {
    return NextResponse.json(
      { error: `difficulty must be one of ${ALLOWED_DIFFICULTIES.join(", ")}` },
      { status: 400 }
    );
  }

  // --- 2. Auth check ---------------------------------------------------------
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a host (only hosts can generate questions)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["host", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only hosts can generate questions" },
      { status: 403 }
    );
  }

  // --- 2b. Rate limit --------------------------------------------------------
  const rateLimitError = await checkAndLog(
    supabase,
    user.id,
    "generate",
    count as number
  );
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 3. Load host context (optional — null is fine) ------------------------
  const { data: onboarding } = await supabase
    .from("host_onboarding")
    .select(
      "biggest_misconception, event_goal, ai_followup_questions, ai_followup_answers"
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  const hostContext: HostContext | null = onboarding
    ? {
        biggest_misconception: onboarding.biggest_misconception,
        event_goal: onboarding.event_goal,
        followups: buildFollowups(
          onboarding.ai_followup_questions,
          onboarding.ai_followup_answers
        ),
      }
    : null;

  // --- 4. Build prompt + call Claude -----------------------------------------
  const { system, user: userMsg } = buildLayer1aPrompt({
    content: content.trim(),
    count: count as MindScanCount,
    difficulty: difficulty as MindScanDifficulty,
    hostContext,
  });

  let rawText: string;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MINDSCAN_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const first = response.content[0];
    if (!first || first.type !== "text") {
      return NextResponse.json(
        { error: "MindScan returned an empty response." },
        { status: 502 }
      );
    }
    rawText = first.text;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "MindScan is busy — please wait a moment and try again." },
        { status: 429 }
      );
    }
    console.error("MindScan generate error:", err);
    return NextResponse.json(
      { error: "MindScan call failed. Please try again." },
      { status: 502 }
    );
  }

  // --- 5. Parse + validate output --------------------------------------------
  const parsed = extractJson(rawText);
  if (!parsed) {
    return NextResponse.json(
      { error: "MindScan returned unparseable JSON. Try regenerating." },
      { status: 502 }
    );
  }

  const questions = validateQuestions(parsed);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "MindScan returned no valid questions. Try regenerating." },
      { status: 502 }
    );
  }

  // Cap at the requested count — Claude sometimes returns more than asked.
  return NextResponse.json({ questions: questions.slice(0, count as number) });
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function buildFollowups(
  questions: unknown,
  answers: unknown
): HostContext["followups"] {
  if (!Array.isArray(questions) || !Array.isArray(answers)) return null;
  const out: NonNullable<HostContext["followups"]> = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = answers[i];
    if (
      q &&
      typeof q === "object" &&
      "question" in q &&
      typeof (q as { question: unknown }).question === "string" &&
      typeof a === "string"
    ) {
      out.push({
        question: (q as { question: string }).question,
        answer: a,
      });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Extract a JSON object from raw model output. Claude is instructed to return
 * plain JSON, but we tolerate a stray ```json``` fence just in case.
 */
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

function validateQuestions(parsed: unknown): MindScanQuestion[] {
  if (!parsed || typeof parsed !== "object") return [];
  const rawList = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(rawList)) return [];

  const valid: MindScanQuestion[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    if (typeof q.body !== "string" || q.body.trim().length === 0) continue;
    if (!Array.isArray(q.options) || q.options.length !== 4) continue;
    if (!q.options.every((o) => typeof o === "string" && o.trim().length > 0))
      continue;
    if (
      typeof q.correct_answer !== "number" ||
      !Number.isInteger(q.correct_answer) ||
      q.correct_answer < 0 ||
      q.correct_answer > 3
    )
      continue;

    const explanation =
      typeof q.explanation === "string" ? q.explanation : undefined;

    valid.push({
      body: q.body.trim().slice(0, 120),
      options: (q.options as string[]).map((o) => o.trim().slice(0, 80)),
      correct_answer: q.correct_answer,
      explanation: explanation?.slice(0, 200),
    });
  }
  return valid;
}
