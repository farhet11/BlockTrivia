/**
 * POST /api/luma/import
 *
 * Fetches a public Luma event page and returns normalized metadata that
 * the Create Event form uses to pre-fill title / description / cover
 * image. OG-tag based — see src/lib/luma.ts for the parsing logic.
 *
 * Body:  { url: string }
 * Reply: { title, description, imageUrl, canonicalUrl } | { error }
 *
 * Auth: host or super_admin only. Rate-limited at 30 imports / hour per
 * host (see rate-limit.ts "luma-import" endpoint).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchLumaEvent, validateLumaUrl } from "@/lib/luma";
import { checkAndLog } from "@/lib/mindscan/rate-limit";

export async function POST(request: Request) {
  // --- 1. Auth -------------------------------------------------------------
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
    return NextResponse.json({ error: "Hosts only" }, { status: 403 });
  }

  // --- 2. Validate input ---------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const validationError = validateLumaUrl(url.trim());
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // --- 3. Rate limit (after validation so bad URLs don't burn the budget) --
  const rateLimitError = await checkAndLog(supabase, user.id, "luma-import");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  // --- 4. Fetch + parse ----------------------------------------------------
  try {
    const imported = await fetchLumaEvent(url.trim());

    // If we got nothing useful, tell the host — no point returning an empty
    // object and letting the client think the import "succeeded".
    if (!imported.title && !imported.description) {
      return NextResponse.json(
        {
          error:
            "Couldn't read event details from that Luma page. It may be private or draft.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(imported);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Luma import failed";
    // 502 keeps the client from retrying aggressively on transient failures
    // while making it clear the error is upstream, not on our side.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
