import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAnthropicClient } from "@/lib/anthropic";
import { checkAndLog } from "@/lib/mindscan/rate-limit";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_OUTPUT_CHARS = 30_000;
const MIN_OUTPUT_CHARS = 50;

/** File types we accept and how to handle them. */
const HANDLERS: Record<string, "claude" | "mammoth" | "text"> = {
  "application/pdf": "claude",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "mammoth",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
};

/** Extensions as fallback when MIME type is generic (e.g. application/octet-stream). */
const EXT_MAP: Record<string, "claude" | "mammoth" | "text"> = {
  ".pdf": "claude",
  ".docx": "mammoth",
  ".md": "text",
  ".txt": "text",
  ".csv": "text",
};

function getHandler(file: File): "claude" | "mammoth" | "text" | null {
  const byMime = HANDLERS[file.type];
  if (byMime) return byMime;
  const ext = file.name.toLowerCase().match(/\.[a-z]+$/)?.[0];
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  return null;
}

export async function POST(request: Request) {
  // --- 1. Reject oversized requests early ------------------------------------
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES * 2) {
    return NextResponse.json(
      { error: "File is too large. Maximum is 10 MB." },
      { status: 413 }
    );
  }

  // --- 2. Auth + role --------------------------------------------------------
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

  // --- 3. Parse form data ----------------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` },
      { status: 413 }
    );
  }

  const handler = getHandler(file);
  if (!handler) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload a PDF, DOCX, Markdown (.md), or text file.",
      },
      { status: 400 }
    );
  }

  // --- 4. Rate limit ---------------------------------------------------------
  const rateLimitError = await checkAndLog(supabase, user.id, "extract");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 5. Extract content ----------------------------------------------------
  try {
    let text: string;

    if (handler === "text") {
      text = await file.text();
    } else if (handler === "mammoth") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      // handler === "claude" — send PDF bytes to Claude for extraction
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");

      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Extract ALL text content from this document. Include headings, body text, bullet points, table contents, and any text visible in images or slides. Output the raw text only — no commentary, no formatting instructions, no markdown fences. Preserve the reading order.",
              },
            ],
          },
        ],
      });

      const first = response.content[0];
      if (!first || first.type !== "text") {
        return NextResponse.json(
          { error: "Could not extract text from this PDF. Try pasting the content directly." },
          { status: 502 }
        );
      }
      text = first.text;
    }

    // --- 6. Validate output --------------------------------------------------
    const trimmed = text.trim();
    if (trimmed.length < MIN_OUTPUT_CHARS) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough text from this file. It may be image-only or nearly empty. Try pasting the content directly.",
        },
        { status: 422 }
      );
    }

    const capped = trimmed.length > MAX_OUTPUT_CHARS
      ? trimmed.slice(0, MAX_OUTPUT_CHARS)
      : trimmed;

    return NextResponse.json({ content: capped });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Document extraction is busy — please wait a moment and try again." },
        { status: 429 }
      );
    }
    console.error("Extract-document error:", err);
    return NextResponse.json(
      { error: "Could not extract text from this file. Try pasting the content directly." },
      { status: 502 }
    );
  }
}
