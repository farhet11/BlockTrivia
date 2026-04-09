/**
 * POST /api/projects/site-logo
 *
 * Background-fetches a project's marketing website and extracts the
 * highest-quality brand logo from its <head> metadata. Used to upgrade
 * the small round RootData favicons on the Create Event form.
 *
 * Body:  { url: string }
 * Reply: { logoUrl: string | null, source: string | null } | { error }
 *
 * Auth: host or super_admin only. Rate-limited via the shared
 * fetch-url budget (cheap server-side scrape, but per-host gated).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchSiteLogo } from "@/lib/site-logo";
import { validateUrl } from "@/lib/ssrf-guard";
import { checkAndLog } from "@/lib/mindscan/rate-limit";

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const validationError = validateUrl(url.trim());
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Reuse the fetch-url budget — site-logo is the same shape of work
  // (one-shot HTML scrape) and we don't want a new endpoint to expand
  // total per-host fetch volume.
  const rateLimitError = await checkAndLog(supabase, user.id, "fetch-url");
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError }, { status: 429 });
  }

  try {
    const result = await fetchSiteLogo(url.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Logo fetch failed";
    // 502 — upstream issue, not ours. Client falls back to RootData logo.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
