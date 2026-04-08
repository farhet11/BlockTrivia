import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkAndLog } from "@/lib/mindscan/rate-limit";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — Whisper API hard limit
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
]);

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local for local dev, and to Vercel env vars for production."
    );
  }
  return key;
}

export function validateAudioFile(
  file: File | null | undefined
): string | null {
  if (!file) return "No audio file provided";
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Unsupported file type (${file.type || "unknown"}). Upload an MP3, WAV, or M4A file.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`;
  }
  return null; // valid
}

export async function POST(request: Request) {
  // --- 1. Reject oversized requests before parsing ----------------------------
  // Content-Length is a hint (not guaranteed), but catches the obvious case
  // without buffering the whole body for unauthenticated callers.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Maximum is 25 MB.` },
      { status: 413 }
    );
  }

  // --- 2. Auth + role — before touching the body ------------------------------
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["host", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only hosts can use MindScan" },
      { status: 403 }
    );
  }

  // --- 3. Parse multipart form data ------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("audio") as File | null;
  const fileError = validateAudioFile(file);
  if (fileError) {
    return NextResponse.json(
      { error: fileError },
      { status: file && file.size > MAX_FILE_BYTES ? 413 : 400 }
    );
  }

  // --- 4. Rate limit ----------------------------------------------------------
  const rateLimitError = await checkAndLog(supabase, user.id, "transcribe");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 5. Send to Whisper API -------------------------------------------------
  let apiKey: string;
  try {
    apiKey = getOpenAIKey();
  } catch (err) {
    console.error("OpenAI key missing:", err);
    return NextResponse.json(
      { error: "Transcription is not configured. Contact support." },
      { status: 503 }
    );
  }

  try {
    const whisperForm = new FormData();
    whisperForm.append("file", file!, file!.name);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "text");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min max

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!whisperRes.ok) {
      const detail = await whisperRes.text().catch(() => "");
      console.error("Whisper API error:", whisperRes.status, detail);

      if (whisperRes.status === 429) {
        return NextResponse.json(
          { error: "Transcription is busy — please wait a moment and try again." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Transcription failed. Try again or paste the text directly." },
        { status: 502 }
      );
    }

    // response_format=text returns plain string, not JSON
    const transcript = await whisperRes.text();
    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "No speech detected in the audio file." },
        { status: 422 }
      );
    }

    return NextResponse.json({ content: transcript.trim() });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Transcription timed out. Try a shorter file or paste the text directly." },
        { status: 504 }
      );
    }
    console.error("Transcribe route error:", err);
    return NextResponse.json(
      { error: "Transcription failed. Try again or paste the text directly." },
      { status: 502 }
    );
  }
}
