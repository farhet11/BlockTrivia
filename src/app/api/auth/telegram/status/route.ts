import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data } = await supabaseAdmin
    .from("telegram_auth_tokens")
    .select("*")
    .eq("token", token)
    .eq("completed", true)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!data) {
    return NextResponse.json({ completed: false });
  }

  // Token is complete — generate Supabase auth token
  const email = `tg_${data.telegram_id}@telegram.blocktrivia.app`;
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ");

  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          telegram_id: data.telegram_id,
          full_name: fullName,
          username: data.username ?? null,
        },
      },
    });

  if (linkError || !linkData) {
    return NextResponse.json({ error: "Auth failed" }, { status: 500 });
  }

  // Consume the token so it can't be replayed
  await supabaseAdmin.from("telegram_auth_tokens").delete().eq("token", token);

  return NextResponse.json({
    completed: true,
    token_hash: linkData.properties.hashed_token,
    user: { id: linkData.user.id, name: fullName, telegram_id: data.telegram_id },
  });
}
