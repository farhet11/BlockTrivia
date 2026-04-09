import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rootdata } from "@/lib/rootdata";

/**
 * POST /api/rootdata/search
 * Body: { query: string }
 *
 * Searches RootData for projects matching the query. Free — no credits.
 * Returns a list of candidate projects for the host to disambiguate.
 * Auth required (host or super_admin only).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body as { query?: unknown })?.query;
  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

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

  try {
    const results = await rootdata.search(query.trim());
    return NextResponse.json({ results });
  } catch (err) {
    console.error("RootData search error:", err);
    return NextResponse.json(
      { error: "RootData search failed. Try again." },
      { status: 502 }
    );
  }
}
