import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkAndLog } from "@/lib/mindscan/rate-limit";
import { validateUrl } from "@/lib/ssrf-guard";

// Re-export so existing tests and callers that imported from this path still work.
export { validateUrl } from "@/lib/ssrf-guard";

const MAX_BYTES = 500 * 1024; // 500 KB
const MAX_CONTENT_CHARS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

export function stripHtml(html: string): string {
  // Remove <script>, <style>, and their contents first
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // Strip remaining tags
  text = text.replace(/<[^>]*>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, MAX_CONTENT_CHARS);
}

export async function POST(request: Request) {
  // --- 1. Parse body ----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const urlError = validateUrl(url.trim());
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // --- 2. Auth + role ---------------------------------------------------------
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

  // --- 3. Rate limit ----------------------------------------------------------
  const rateLimitError = await checkAndLog(supabase, user.id, "fetch-url");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 4. Fetch URL -----------------------------------------------------------
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url.trim(), {
      signal: controller.signal,
      redirect: "error", // never follow redirects — prevents SSRF via open redirects
      headers: {
        "User-Agent": "BlockTrivia-MindScan/1.0 (content analysis bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Page returned ${response.status}. Check the URL and try again.` },
        { status: 422 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return NextResponse.json(
        { error: "That URL doesn't serve HTML content. Try pasting the text directly." },
        { status: 422 }
      );
    }

    // Read up to MAX_BYTES — abort the stream after that
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Could not read the page." }, { status: 422 });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
      if (totalBytes >= MAX_BYTES) {
        reader.cancel();
        break;
      }
    }

    html = new TextDecoder().decode(
      new Uint8Array(chunks.flatMap((c) => [...c]))
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "The page took too long to load. Try again or paste the text directly." },
        { status: 422 }
      );
    }
    if (err instanceof TypeError && err.message.includes("redirect")) {
      return NextResponse.json(
        { error: "That URL redirects to another address. Paste the final URL directly." },
        { status: 422 }
      );
    }
    console.error("fetch-url error:", err);
    return NextResponse.json(
      { error: "Could not fetch that URL. Try pasting the text directly." },
      { status: 422 }
    );
  }

  // --- 5. Strip HTML ----------------------------------------------------------
  const content = stripHtml(html);

  if (content.length < 50) {
    return NextResponse.json(
      { error: "Not enough readable text on that page. Try pasting the content directly." },
      { status: 422 }
    );
  }

  return NextResponse.json({ content });
}
