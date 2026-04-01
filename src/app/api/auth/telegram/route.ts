import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data = await req.json();
  const { hash, ...rest } = data as Record<string, string>;

  // Verify Telegram HMAC-SHA256
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  if (expectedHash !== hash) {
    return NextResponse.json({ error: "Invalid Telegram data" }, { status: 401 });
  }

  // Ensure auth_date is within 24 hours
  if (Date.now() / 1000 - Number(rest.auth_date) > 86400) {
    return NextResponse.json({ error: "Auth data expired" }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const telegramId = rest.id;
  const email = `tg_${telegramId}@telegram.blocktrivia.app`;
  const fullName = [rest.first_name, rest.last_name].filter(Boolean).join(" ");

  // Try to create user — will fail if they already exist
  let userId: string;

  const { data: newUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        telegram_id: telegramId,
        full_name: fullName,
        avatar_url: rest.photo_url ?? null,
      },
    });

  if (!createError && newUser.user) {
    userId = newUser.user.id;
  } else {
    // User already exists — find them by the synthetic email
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existing = listData?.users.find((u) => u.email === email);
    if (!existing) {
      return NextResponse.json({ error: "User lookup failed" }, { status: 500 });
    }
    userId = existing.id;
  }

  // Create a session for this user
  const { data: sessionData, error: sessionError } =
    await supabaseAdmin.auth.admin.createSession({ user_id: userId });

  if (sessionError || !sessionData?.session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  return NextResponse.json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user: { id: userId, name: fullName, telegram_id: telegramId },
  });
}
