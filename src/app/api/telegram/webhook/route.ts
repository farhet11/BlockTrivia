import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Verify Telegram webhook secret
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json();
  const message = update.message;

  // Only handle /start <token> messages
  if (!message?.text?.startsWith("/start ")) {
    return NextResponse.json({ ok: true });
  }

  const token = message.text.replace("/start ", "").trim();
  const from = message.from;

  if (!token || !from?.id) {
    return NextResponse.json({ ok: true });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Mark the token as completed and fetch return_url in one round-trip
  const { data, error } = await supabaseAdmin
    .from("telegram_auth_tokens")
    .update({
      telegram_id: String(from.id),
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      username: from.username ?? null,
      completed: true,
    })
    .eq("token", token)
    .eq("completed", false)
    .gt("expires_at", new Date().toISOString())
    .select("return_url")
    .single();

  if (!error) {
    const returnUrl = data?.return_url;
    const linkLine = returnUrl
      ? `\n\n<a href="${returnUrl}">← Back to BlockTrivia</a>`
      : "";

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: from.id,
          parse_mode: "HTML",
          text: `✅ You're logged in to BlockTrivia!${linkLine}`,
        }),
      }
    );
  }

  return NextResponse.json({ ok: true });
}
