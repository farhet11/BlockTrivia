import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Schedule deletion: 30-day grace period.
  // If the user logs in again within 30 days, the request is cancelled.
  // After 30 days, a cleanup job will hard-delete the account.
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to schedule account deletion" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
