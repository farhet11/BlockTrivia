/**
 * Site logo extractor — server-side only.
 *
 * Given a project's marketing website URL, fetches the homepage and
 * returns the site's FULL brand logo (the wide horizontal mark used
 * in the header / nav), not a favicon. This drives the
 * "Organizer / Host Logo" upload preview on Create Event — RootData
 * already supplies a small round favicon for the inline organizer
 * field, and we explicitly don't want to reuse that here.
 *
 * Lookup order, full-logo only:
 *   1. JSON-LD `Organization.logo` (schema.org — canonical full logo)
 *   2. <img> inside <header> / <nav> with `logo` in class or alt
 *   3. Inline <svg> wrapped in a homepage link (modern Next.js sites
 *      embed their wordmark this way for crispness — Solana, etc).
 *      Returned as a data URI so the existing upload pipeline can use
 *      it directly without an extra round trip.
 *   4. <meta property="og:logo"> (rare but high quality when present)
 *
 * Strategies that return SQUARE FAVICON ASSETS are deliberately
 * excluded:
 *   - <link rel="icon">         → favicon
 *   - <link rel="apple-touch-icon"> → square 180×180 app icon
 *   - /favicon.ico              → favicon
 *
 * If none of the full-logo strategies hit, we return null and the
 * caller leaves the upload field empty for manual upload.
 */

import "server-only";
import { validateUrl } from "./ssrf-guard";

const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 384 * 1024; // header logos sometimes live a bit further into the body than meta tags

export type SiteLogoResult = {
  /** Resolved absolute URL to the full brand logo, or null if nothing found. */
  logoUrl: string | null;
  /** Which strategy matched, for debugging. */
  source: "json-ld" | "header-img" | "inline-svg" | "og-logo" | null;
};

/**
 * Fetches `siteUrl` and extracts the best available FULL brand logo.
 * Throws on network failure / non-HTML response.
 */
export async function fetchSiteLogo(siteUrl: string): Promise<SiteLogoResult> {
  const err = validateUrl(siteUrl);
  if (err) throw new Error(err);

  const parsed = new URL(siteUrl);
  // Always pull from the site root — project blogs / docs / app pages
  // often have stripped-down headers without the brand logo.
  const homepage = `${parsed.protocol}//${parsed.host}/`;

  const html = await fetchHtml(homepage);

  // 1. JSON-LD Organization.logo (canonical full logo per schema.org)
  const jsonLd = pickJsonLdLogo(html);
  if (jsonLd) return { logoUrl: resolveUrl(jsonLd, homepage), source: "json-ld" };

  // 2. Scrape <img> from <header> or <nav> blocks looking for a logo
  const headerImg = pickHeaderLogoImg(html);
  if (headerImg) return { logoUrl: resolveUrl(headerImg, homepage), source: "header-img" };

  // 3. Inline <svg> wrapped in a homepage link
  const inlineSvg = pickHomepageInlineSvg(html);
  if (inlineSvg) return { logoUrl: inlineSvg, source: "inline-svg" };

  // 4. og:logo meta tag (rare — most sites only set og:image)
  const ogLogo = pickMeta(html, "og:logo");
  if (ogLogo) return { logoUrl: resolveUrl(ogLogo, homepage), source: "og-logo" };

  // No full logo found. Caller falls back to manual upload.
  return { logoUrl: null, source: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Parsers — same regex strategy as luma.ts (deliberately no DOM library)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extracts the `logo` field from a schema.org Organization JSON-LD blob.
 * Handles both `"logo": "https://..."` (string) and
 * `"logo": { "url": "..." }` (ImageObject), and recurses through @graph
 * containers used by sites that emit multi-entity JSON-LD.
 */
function pickJsonLdLogo(html: string): string | null {
  const scripts = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!scripts) return null;
  for (const block of scripts) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(inner.trim());
      const logo = findLogoInJsonLd(data);
      if (logo) return logo;
    } catch {
      // Some sites emit invalid JSON-LD — skip and try the next block.
      continue;
    }
  }
  return null;
}

function findLogoInJsonLd(node: unknown): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLogoInJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.logo) {
    if (typeof obj.logo === "string") return obj.logo;
    if (typeof obj.logo === "object" && obj.logo !== null) {
      const inner = obj.logo as Record<string, unknown>;
      if (typeof inner.url === "string") return inner.url;
    }
  }
  for (const key of Object.keys(obj)) {
    const found = findLogoInJsonLd(obj[key]);
    if (found) return found;
  }
  return null;
}

/**
 * Scrapes the first <header> or <nav> block on the page for an <img>
 * whose class or alt attribute mentions "logo". This is the standard
 * way modern sites mark up their wordmark / horizontal logo.
 *
 * Skips img tags whose src points at obvious favicon paths so we don't
 * accidentally pick up a duplicate favicon embedded in the header.
 */
function pickHeaderLogoImg(html: string): string | null {
  // Pull <header>...</header> and <nav>...</nav> sections — limit each
  // body to 16KB so a giant single-page-app HTML blob doesn't blow up
  // the regex backtracker.
  const containers = html.match(/<(header|nav)\b[^>]*>[\s\S]{0,16000}?<\/\1>/gi) ?? [];
  for (const container of containers) {
    const imgs = container.match(/<img\s+[^>]*>/gi) ?? [];
    for (const img of imgs) {
      const isLogo =
        /class\s*=\s*["'][^"']*\blogo\b/i.test(img) ||
        /alt\s*=\s*["'][^"']*logo/i.test(img) ||
        /id\s*=\s*["'][^"']*\blogo\b/i.test(img);
      if (!isLogo) continue;
      const srcMatch = img.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      // Reject obvious favicon paths.
      if (/favicon|apple-touch|\/icon\.(png|svg|ico)/i.test(src)) continue;
      return src;
    }
  }
  return null;
}

/**
 * Finds an inline `<svg>` wrapped in an anchor that links to the
 * homepage ("/" or the bare origin) — the canonical pattern for modern
 * Next.js sites that ship their wordmark as inline SVG (Solana, etc).
 *
 * Returns the SVG markup as a `data:image/svg+xml;utf8,...` URI so the
 * existing upload preview / submission pipeline can use it directly.
 *
 * Skips SVGs whose path data is suspiciously small (< 200 chars in the
 * total tag) — those are usually icons (chevrons, hamburger menus),
 * not the brand mark.
 */
function pickHomepageInlineSvg(html: string): string | null {
  // Look for <a href="/" ... ><svg ...>...</svg></a> with the SVG as the
  // direct (or near-direct) child. The {0,2000} bound on inner content
  // is intentional — real inline SVG logos are typically 500-1500 chars.
  const anchorRegex =
    /<a\b[^>]*\bhref\s*=\s*["']\/(?:["']|#["']|\?[^"']*["'])[^>]*>([\s\S]{0,4000}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    const inner = match[1];
    const svgMatch = inner.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/i);
    if (!svgMatch) continue;
    const svg = svgMatch[0];
    // Skip tiny utility SVGs.
    if (svg.length < 300) continue;
    // Make sure it has fill paths or shapes — empty <svg></svg> wrappers
    // are sometimes used as decorative containers.
    if (!/<(path|rect|circle|polygon|use|g)\b/i.test(svg)) continue;
    return svgToDataUri(svg);
  }
  return null;
}

function svgToDataUri(svg: string): string {
  // Ensure xmlns is present — some sites strip it from inline SVG since
  // it's optional in HTML, but it's required when rendered via <img src>.
  const withNs = /\bxmlns\s*=/.test(svg)
    ? svg
    : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const encoded = encodeURIComponent(withNs)
    // Save bytes — these chars are safe inline in a data URI without
    // percent-encoding and most browsers handle them.
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;utf8,${encoded}`;
}

function pickMeta(html: string, propertyOrName: string): string | null {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta\\s+[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*>`,
    "i"
  );
  const tag = html.match(regex)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*["']([^"']+)["']/i);
  return content?.[1] ?? null;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BlockTriviaBot/1.0; +https://blocktrivia.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`Site returned ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
    throw new Error("Site did not return HTML");
  }
  return readCapped(res, MAX_HTML_BYTES);
}

async function readCapped(res: Response, limit: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      reader.cancel();
      // Don't error — we already have <head> + the start of <body>,
      // which is where the header logo lives.
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}
