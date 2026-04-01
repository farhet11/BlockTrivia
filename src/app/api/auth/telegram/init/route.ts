import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST() {
  const token = crypto.randomBytes(20).toString("hex");

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin
    .from("telegram_auth_tokens")
    .insert({ token });

  if (error) {
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
  const deepLink = `https://t.me/${botName}?start=${token}`;

  return NextResponse.json({ token, deep_link: deepLink });
}
