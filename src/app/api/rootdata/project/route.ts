import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rootdata, isCacheStale } from "@/lib/rootdata";

/**
 * POST /api/rootdata/project
 * Body: { rootdata_id: string }
 *
 * Fetches full project data from RootData (2 credits), upserts into the
 * `projects` table, links the host via `host_projects`, and returns the row.
 *
 * Cache logic: if the project was synced <7 days ago, skip the API call
 * and return the cached row — protecting credits.
 *
 * Auth required (host or super_admin only).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rootdataId = (body as { rootdata_id?: unknown })?.rootdata_id;
  if (typeof rootdataId !== "string" || !rootdataId.trim()) {
    return NextResponse.json({ error: "rootdata_id is required" }, { status: 400 });
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

  // --- Check cache ---
  const { data: existingProject } = await supabase
    .from("projects")
    .select("id, rootdata_synced_at, name, one_liner, logo_url, website, twitter, team_members, investors, ecosystem_tags, funding_history")
    .eq("rootdata_id", rootdataId.trim())
    .single();

  let projectRow = existingProject;

  // Fetch from RootData only if cache is stale
  if (!existingProject || isCacheStale(existingProject.rootdata_synced_at)) {
    let fetched;
    try {
      fetched = await rootdata.getProject(rootdataId.trim());
    } catch (err) {
      console.error("RootData getProject error:", err);
      // If we have stale cached data, return it rather than erroring
      if (existingProject) {
        return NextResponse.json({ project: existingProject });
      }
      return NextResponse.json(
        { error: "Could not fetch project data from RootData. Try again." },
        { status: 502 }
      );
    }

    const syncedAt = new Date().toISOString();
    const selectFields = "id, name, one_liner, logo_url, website, twitter, team_members, investors, ecosystem_tags, funding_history, rootdata_synced_at";

    let dbError;
    if (!existingProject) {
      // New project — INSERT (INSERT policy: auth.uid() is not null)
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert({
          rootdata_id: fetched.rootdata_id,
          name: fetched.name,
          one_liner: fetched.one_liner,
          description: fetched.description,
          logo_url: fetched.logo_url,
          website: fetched.website,
          twitter: fetched.twitter,
          team_members: fetched.team_members,
          investors: fetched.investors,
          ecosystem_tags: fetched.ecosystem_tags,
          funding_history: fetched.funding_history,
          rootdata_synced_at: syncedAt,
          created_by: user.id,
        })
        .select(selectFields)
        .single();
      projectRow = inserted;
      dbError = error;
    } else {
      // Stale cache — UPDATE by ID (UPDATE policy: owner in host_projects)
      const { data: updated, error } = await supabase
        .from("projects")
        .update({
          name: fetched.name,
          one_liner: fetched.one_liner,
          description: fetched.description,
          logo_url: fetched.logo_url,
          website: fetched.website,
          twitter: fetched.twitter,
          team_members: fetched.team_members,
          investors: fetched.investors,
          ecosystem_tags: fetched.ecosystem_tags,
          funding_history: fetched.funding_history,
          rootdata_synced_at: syncedAt,
        })
        .eq("id", existingProject.id)
        .select(selectFields)
        .single();
      projectRow = updated;
      dbError = error;
    }

    if (dbError) {
      console.error("projects save error:", dbError);
      // Return fetched data anyway so auto-fill works even if caching fails
      return NextResponse.json({
        project: {
          id: null,
          name: fetched.name,
          one_liner: fetched.one_liner,
          logo_url: fetched.logo_url,
          website: fetched.website,
          twitter: fetched.twitter,
          gitbook: fetched.gitbook,
          team_members: fetched.team_members,
          investors: fetched.investors,
          ecosystem_tags: fetched.ecosystem_tags,
          funding_history: fetched.funding_history,
          rootdata_synced_at: null,
        },
      });
    }
  }

  if (!projectRow) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Link host to project via host_projects (owner role, idempotent)
  await supabase
    .from("host_projects")
    .upsert(
      { profile_id: user.id, project_id: projectRow.id, role: "owner" },
      { onConflict: "profile_id,project_id" }
    );

  return NextResponse.json({ project: projectRow });
}
