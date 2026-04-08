import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAnthropicClient, MINDSCAN_MODEL } from "@/lib/anthropic";
import { buildOnboardingFollowupPrompt } from "@/lib/mindscan/prompts";
import { checkAndLog } from "@/lib/mindscan/rate-limit";
import type { OnboardingFollowupQuestion } from "@/lib/mindscan/types";

const MIN_CHARS = 15;
const MAX_CHARS = 2000;

export async function POST(request: Request) {
  // --- 1. Auth ---------------------------------------------------------------
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a host (only hosts can use onboarding)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["host", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only hosts can access onboarding features" },
      { status: 403 }
    );
  }

  // --- 2. Validate input (BEFORE rate limit) ---------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const misconception = (body as { misconception?: unknown } | null)
    ?.misconception;
  if (
    typeof misconception !== "string" ||
    misconception.trim().length < MIN_CHARS
  ) {
    return NextResponse.json(
      {
        error: `Describe the misconception in at least ${MIN_CHARS} characters.`,
      },
      { status: 400 }
    );
  }
  if (misconception.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_CHARS} characters.` },
      { status: 400 }
    );
  }

  // --- 2b. Rate limit (AFTER validation) -----------------------------------
  const rateLimitError = await checkAndLog(supabase, user.id, "onboarding-followup");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 3. Call Claude --------------------------------------------------------
  const { system, user: userMsg } = buildOnboardingFollowupPrompt(
    misconception.trim()
  );

  let rawText: string;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MINDSCAN_MODEL,
      max_tokens: 1024,
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `MindScan call failed: ${message}` },
      { status: 502 }
    );
  }

  // --- 4. Parse + validate ---------------------------------------------------
  const parsed = extractJson(rawText);
  const questions = validateQuestions(parsed);
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "No valid follow-up questions came back. Try regenerating." },
      { status: 502 }
    );
  }

  return NextResponse.json({ questions });
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

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

function validateQuestions(parsed: unknown): OnboardingFollowupQuestion[] {
  if (!parsed || typeof parsed !== "object") return [];
  const rawList = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(rawList)) return [];

  const valid: OnboardingFollowupQuestion[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    if (typeof q.question !== "string" || q.question.trim().length === 0)
      continue;
    if (!Array.isArray(q.options) || q.options.length !== 4) continue;
    if (!q.options.every((o) => typeof o === "string" && o.trim().length > 0))
      continue;
    valid.push({
      question: q.question.trim(),
      options: (q.options as string[]).map((o) => o.trim()),
      purpose: typeof q.purpose === "string" ? q.purpose : undefined,
    });
  }
  // Plan says 2–3 follow-ups; cap at 3 if Claude overshoots.
  return valid.slice(0, 3);
}
