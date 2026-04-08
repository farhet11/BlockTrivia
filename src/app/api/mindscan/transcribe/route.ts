import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkAndLog } from "@/lib/mindscan/rate-limit";

// AssemblyAI has no hard file size limit, but we cap at 500 MB to avoid
// Vercel request body limits and runaway uploads.
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
  "video/mp4",   // common container for audio-only exports
]);

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min max

function getAssemblyAIKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Add it to .env.local and Vercel env vars."
    );
  }
  return key;
}

export function validateAudioFile(
  file: File | null | undefined
): string | null {
  if (!file) return "No audio file provided";
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Unsupported file type (${file.type || "unknown"}). Upload an MP3, WAV, M4A, or WebM file.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 500 MB.`;
  }
  return null;
}

export async function POST(request: Request) {
  // --- 1. Reject obviously oversized requests before parsing ------------------
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too large. Maximum is 500 MB." },
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

  // --- 5. AssemblyAI: upload → transcribe → poll ------------------------------
  let apiKey: string;
  try {
    apiKey = getAssemblyAIKey();
  } catch (err) {
    console.error("AssemblyAI key missing:", err);
    return NextResponse.json(
      { error: "Transcription is not configured. Contact support." },
      { status: 503 }
    );
  }

  const headers = { Authorization: apiKey, "Content-Type": "application/json" };

  try {
    // Step A: Upload the raw audio file to AssemblyAI's CDN
    const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": file!.type },
      body: file!,
    });
    if (!uploadRes.ok) {
      const detail = await uploadRes.text().catch(() => "");
      console.error("AssemblyAI upload error:", uploadRes.status, detail);
      return NextResponse.json(
        { error: "Could not upload file for transcription. Try again." },
        { status: 502 }
      );
    }
    const { upload_url } = (await uploadRes.json()) as { upload_url: string };

    // Step B: Submit transcription job
    const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio_url: upload_url,
        speaker_labels: false,
      }),
    });
    if (!transcriptRes.ok) {
      const detail = await transcriptRes.text().catch(() => "");
      console.error("AssemblyAI transcript error:", transcriptRes.status, detail);
      if (transcriptRes.status === 429) {
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
    const { id: jobId } = (await transcriptRes.json()) as { id: string };

    // Step C: Poll until complete (status: queued → processing → completed | error)
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${jobId}`, {
        headers,
      });
      if (!pollRes.ok) continue;

      const poll = (await pollRes.json()) as {
        status: string;
        text?: string;
        error?: string;
      };

      if (poll.status === "completed") {
        const transcript = poll.text?.trim() ?? "";
        if (!transcript) {
          return NextResponse.json(
            { error: "No speech detected in the audio file." },
            { status: 422 }
          );
        }
        return NextResponse.json({ content: transcript });
      }

      if (poll.status === "error") {
        console.error("AssemblyAI transcription error:", poll.error);
        return NextResponse.json(
          { error: "Transcription failed. Try again or paste the text directly." },
          { status: 502 }
        );
      }
      // status: "queued" | "processing" — keep polling
    }

    return NextResponse.json(
      { error: "Transcription timed out. Try a shorter file or paste the text directly." },
      { status: 504 }
    );
  } catch (err) {
    console.error("Transcribe route error:", err);
    return NextResponse.json(
      { error: "Transcription failed. Try again or paste the text directly." },
      { status: 502 }
    );
  }
}
