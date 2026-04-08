import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/host";

  // Whether the user checked the ToS checkbox before OAuth redirect
  const termsAccepted = searchParams.get("terms") === "1";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Cancel any pending account deletion on login
        await supabase
          .from("profiles")
          .update({ deletion_requested_at: null })
          .eq("id", user.id)
          .not("deletion_requested_at", "is", null);

        // Stamp consent timestamp for OAuth flows (Google / Telegram)
        if (termsAccepted) {
          await supabase
            .from("profiles")
            .update({ terms_accepted_at: new Date().toISOString() })
            .eq("id", user.id)
            .is("terms_accepted_at", null); // only stamp once
        }
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
