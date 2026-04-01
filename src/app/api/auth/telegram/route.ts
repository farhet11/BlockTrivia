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

  // generateLink upserts the user and returns a token_hash the client can
  // exchange for a session via supabase.auth.verifyOtp() — no email is sent.
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          telegram_id: telegramId,
          full_name: fullName,
          avatar_url: rest.photo_url ?? null,
        },
      },
    });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate auth token" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    token_hash: linkData.properties.hashed_token,
    user: {
      id: linkData.user.id,
      name: fullName,
      telegram_id: telegramId,
    },
  });
}
