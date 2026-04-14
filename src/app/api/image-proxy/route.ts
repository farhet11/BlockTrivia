import { NextRequest, NextResponse } from "next/server";

/**
 * Image Proxy — serves external images through our domain to avoid
 * cross-origin blocking (ORB/CORB/hotlink protection).
 *
 * Usage: /api/image-proxy?url=https://example.com/logo.png
 *
 * Security:
 *  - Only allows image content types
 *  - 5s timeout to prevent hanging
 *  - Caches successful responses for 1 hour (CDN) / 24 hours (browser)
 *  - Max 5MB response size
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 5000;

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "image/*",
        "User-Agent": "BlockTrivia/1.0",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: `Not an image (${contentType})` },
        { status: 415 }
      );
    }

    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ error: "Upstream timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
