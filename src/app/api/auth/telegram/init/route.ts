import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.xyz";

function isSafeReturnUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const token = crypto.randomBytes(20).toString("hex");
  const { returnUrl } = await req.json().catch(() => ({}));
  const safeReturnUrl = isSafeReturnUrl(returnUrl) ? returnUrl : null;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabaseAdmin
    .from("telegram_auth_tokens")
    .insert({ token, return_url: returnUrl ?? null });

  if (error) {
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
  const deepLink = `https://t.me/${botName}?start=${token}`;

  return NextResponse.json({ token, deep_link: deepLink });
}
