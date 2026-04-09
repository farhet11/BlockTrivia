import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAnthropicClient, MINDSCAN_MODEL } from "@/lib/anthropic";
import {
  buildOnboardingFollowupPrompt,
  type OnboardingFollowupProjectContext,
} from "@/lib/mindscan/prompts";
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

  const bodyObj = (body ?? {}) as Record<string, unknown>;
  const misconception = bodyObj.misconception;
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

  // Parse previous Q&A (optional — only present on 2nd+ fetch in adaptive mode)
  const previous = parsePreviousFollowups(bodyObj.previous);

  // --- 2b. Rate limit (AFTER validation) -----------------------------------
  const rateLimitError = await checkAndLog(supabase, user.id, "onboarding-followup");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 2c. Pull silent project context for the prompt ----------------------
  // Stored on host_onboarding by /api/rootdata/project at link time so we
  // don't need a second RootData fetch (which would cost credits and depend
  // on the projects-cache RLS path).
  const projectContext = await loadProjectContext(supabase, user.id);

  // --- 3. Call Claude --------------------------------------------------------
  const { system, user: userMsg } = buildOnboardingFollowupPrompt(
    misconception.trim(),
    projectContext,
    previous
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
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "MindScan is busy — please wait a moment and try again." },
        { status: 429 }
      );
    }
    console.error("MindScan onboarding-followup error:", err);
    return NextResponse.json(
      { error: "MindScan call failed. Please try again." },
      { status: 502 }
    );
  }

  // --- 4. Parse + validate ---------------------------------------------------
  const parsed = extractJson(rawText);
  const question = validateSingleQuestion(parsed);
  if (!question) {
    return NextResponse.json(
      { error: "No valid follow-up question came back. Try regenerating." },
      { status: 502 }
    );
  }

  return NextResponse.json({ question });
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

/**
 * Load the silent project context the prompt uses, sourced from
 * `host_onboarding.linked_project_context` (written at project-link time
 * by /api/rootdata/project). Returns null if the host hasn't linked a
 * project yet — the prompt will fall back to misconception-only mode.
 */
async function loadProjectContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<OnboardingFollowupProjectContext | null> {
  const { data, error } = await supabase
    .from("host_onboarding")
    .select("linked_project_name, linked_project_context")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const ctx = data.linked_project_context;
  if (!ctx || typeof ctx !== "object") {
    // Host linked a name but no enriched context (legacy row, or RootData
    // returned an empty payload). Still pass the name through if available.
    return data.linked_project_name
      ? { name: data.linked_project_name }
      : null;
  }

  return {
    name: data.linked_project_name ?? null,
    ...(ctx as Omit<OnboardingFollowupProjectContext, "name">),
  };
}

/**
 * Validates that Claude returned a single well-formed follow-up question.
 * Accepts two shapes for resilience:
 *   - { question: string, options: [...], purpose?: string }    (preferred)
 *   - { questions: [{ question, options, purpose }] }            (fallback)
 */
function validateSingleQuestion(parsed: unknown): OnboardingFollowupQuestion | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // Preferred shape — top-level question fields
  if (typeof obj.question === "string" && Array.isArray(obj.options)) {
    return normalizeQuestion(obj);
  }

  // Fallback — Claude may still wrap in { questions: [...] } despite the prompt
  if (Array.isArray(obj.questions) && obj.questions.length > 0) {
    const first = obj.questions[0];
    if (first && typeof first === "object") {
      return normalizeQuestion(first as Record<string, unknown>);
    }
  }

  return null;
}

function normalizeQuestion(
  q: Record<string, unknown>
): OnboardingFollowupQuestion | null {
  if (typeof q.question !== "string" || q.question.trim().length === 0) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4) return null;
  if (!q.options.every((o) => typeof o === "string" && o.trim().length > 0)) return null;
  return {
    question: q.question.trim(),
    options: (q.options as string[]).map((o) => o.trim()),
    purpose: typeof q.purpose === "string" ? q.purpose : undefined,
  };
}

/**
 * Parses and sanitizes the optional `previous` field from the request body.
 * Each entry represents a question the host has already answered in this
 * onboarding session, used by Claude to drill deeper in the next question.
 *
 * Defensive: silently drops entries that don't match the shape.
 */
function parsePreviousFollowups(
  raw: unknown
): Array<{ question: string; answers: string[]; extra?: string }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Array<{ question: string; answers: string[]; extra?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (typeof it.question !== "string" || it.question.trim().length === 0) continue;
    const answers = Array.isArray(it.answers)
      ? it.answers.filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
    const extra =
      typeof it.extra === "string" && it.extra.trim().length > 0
        ? it.extra.trim()
        : undefined;
    // Skip entries with no signal — nothing useful to send Claude.
    if (answers.length === 0 && !extra) continue;
    out.push({ question: it.question.trim(), answers, extra });
  }
  return out.length > 0 ? out : undefined;
}
