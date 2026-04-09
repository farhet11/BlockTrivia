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
  const SELECT_FIELDS =
    "id, name, one_liner, description, logo_url, website, twitter, investors, ecosystem_tags, similar_project, token_symbol, establishment_date, total_funding, ecosystem, on_main_net, plan_to_launch, on_test_net, rootdata_synced_at";

  const { data: existingProject } = await supabase
    .from("projects")
    .select(`id, rootdata_synced_at, ${SELECT_FIELDS}`)
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
    const insertOrUpdatePayload = {
      name: fetched.name,
      one_liner: fetched.one_liner,
      description: fetched.description,
      logo_url: fetched.logo_url,
      website: fetched.website,
      twitter: fetched.twitter,
      investors: fetched.investors,
      ecosystem_tags: fetched.ecosystem_tags,
      similar_project: fetched.similar_project,
      token_symbol: fetched.token_symbol,
      establishment_date: fetched.establishment_date,
      total_funding: fetched.total_funding,
      ecosystem: fetched.ecosystem,
      on_main_net: fetched.on_main_net,
      plan_to_launch: fetched.plan_to_launch,
      on_test_net: fetched.on_test_net,
      rootdata_raw: fetched.raw,
      rootdata_synced_at: syncedAt,
    };

    let dbError;
    if (!existingProject) {
      // New project — INSERT (INSERT policy: auth.uid() is not null)
      const { data: inserted, error } = await supabase
        .from("projects")
        .insert({
          rootdata_id: fetched.rootdata_id,
          created_by: user.id,
          ...insertOrUpdatePayload,
        })
        .select(SELECT_FIELDS)
        .single();
      projectRow = inserted;
      dbError = error;
    } else {
      // Stale cache — UPDATE by ID (UPDATE policy: owner in host_projects)
      const { data: updated, error } = await supabase
        .from("projects")
        .update(insertOrUpdatePayload)
        .eq("id", existingProject.id)
        .select(SELECT_FIELDS)
        .single();
      projectRow = updated;
      dbError = error;
    }

    if (dbError) {
      console.error("projects save error:", dbError);
      // Still persist the link + silent context in host_onboarding even if
      // projects caching fails — the followup endpoint reads from here.
      await writeOnboardingLink(
        supabase,
        user.id,
        rootdataId.trim(),
        fetched.name,
        fetched.logo_url,
        buildLinkedProjectContext(fetched)
      );
      // Return fetched data anyway so the client form auto-fills.
      return NextResponse.json({
        project: {
          id: null,
          name: fetched.name,
          one_liner: fetched.one_liner,
          description: fetched.description,
          logo_url: fetched.logo_url,
          website: fetched.website,
          twitter: fetched.twitter,
          gitbook: fetched.gitbook,
          investors: fetched.investors,
          ecosystem_tags: fetched.ecosystem_tags,
          rootdata_synced_at: null,
        },
      });
    }
  }

  if (!projectRow) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Link host to project via host_projects (owner role, idempotent)
  if (projectRow.id) {
    await supabase
      .from("host_projects")
      .upsert(
        { profile_id: user.id, project_id: projectRow.id, role: "owner" },
        { onConflict: "profile_id,project_id" }
      );
  }

  // Persist the linked project identity AND silent prompt context into
  // host_onboarding. Done server-side so it commits before the API response
  // returns — avoids client-side race conditions on refresh.
  const projectName = projectRow.name ?? null;
  if (projectName) {
    await writeOnboardingLink(
      supabase,
      user.id,
      rootdataId.trim(),
      projectName,
      projectRow.logo_url ?? null,
      buildLinkedProjectContext(projectRow)
    );
  }

  return NextResponse.json({ project: projectRow });
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Snapshot of the silent RootData fields the MindScan followup prompt needs.
 * Mirrored into host_onboarding.linked_project_context so the followup endpoint
 * can read everything in a single query without depending on the projects
 * cache (which can fail silently for hosts not yet linked via host_projects).
 *
 * Accepts either a freshly-fetched RootData payload or a cached projects row,
 * since both expose the same shape after migration 044.
 */
type LinkedProjectContext = {
  description: string | null;
  one_liner: string | null;
  ecosystem_tags: string[];
  ecosystem: string[];
  similar_project: unknown[];
  token_symbol: string | null;
  establishment_date: string | null;
  total_funding: number | null;
  on_main_net: boolean | null;
  plan_to_launch: boolean | null;
  on_test_net: boolean | null;
};

function buildLinkedProjectContext(src: unknown): LinkedProjectContext {
  const obj = (src ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    description: typeof obj.description === "string" ? obj.description : null,
    one_liner: typeof obj.one_liner === "string" ? obj.one_liner : null,
    ecosystem_tags: arr(obj.ecosystem_tags).filter((x): x is string => typeof x === "string"),
    ecosystem: arr(obj.ecosystem).filter((x): x is string => typeof x === "string"),
    similar_project: arr(obj.similar_project),
    token_symbol: typeof obj.token_symbol === "string" ? obj.token_symbol : null,
    establishment_date:
      typeof obj.establishment_date === "string" ? obj.establishment_date : null,
    total_funding: typeof obj.total_funding === "number" ? obj.total_funding : null,
    on_main_net: typeof obj.on_main_net === "boolean" ? obj.on_main_net : null,
    plan_to_launch: typeof obj.plan_to_launch === "boolean" ? obj.plan_to_launch : null,
    on_test_net: typeof obj.on_test_net === "boolean" ? obj.on_test_net : null,
  };
}

async function writeOnboardingLink(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  rootdataId: string,
  projectName: string | null,
  projectLogo: string | null,
  context: LinkedProjectContext
) {
  if (!projectName) return;
  await supabase
    .from("host_onboarding")
    .update({
      linked_project_name: projectName,
      linked_rootdata_id: rootdataId,
      linked_project_logo: projectLogo,
      linked_project_context: context,
    })
    .eq("profile_id", userId);
}
