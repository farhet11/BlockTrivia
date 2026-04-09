/**
 * Luma event link importer — server-side only.
 *
 * Fetches a public Luma event page and extracts the Open Graph metadata
 * so the host can pre-fill Create Event with the event's title,
 * description, and cover image in one click.
 *
 * Luma has no official public API. We use OG tags (the most stable
 * surface area Luma exposes) rather than their private JSON endpoints
 * which can break without notice.
 *
 * Accepted URL hosts: `lu.ma`, `luma.com`, `www.luma.com`. Other hosts
 * are rejected both as a correctness guard and as defense-in-depth
 * against SSRF (combined with the shared ssrf-guard.ts).
 */

import "server-only";
import { validateUrl } from "./ssrf-guard";

/** Hostnames we allow in imported URLs. Anything else is rejected. */
const ALLOWED_HOSTS = new Set(["lu.ma", "luma.com", "www.luma.com"]);

/** Max HTML bytes we'll pull from Luma — prevents memory blowup on pathological pages. */
const MAX_HTML_BYTES = 512 * 1024; // 512KB covers any realistic event page

/** Fetch timeout for the Luma page load. */
const FETCH_TIMEOUT_MS = 8_000;

/** Max description length to return. Matches the events.description column cap in the form. */
const DESCRIPTION_MAX = 500;

/**
 * Normalized event metadata returned from a successful import.
 * All fields are nullable — OG tags on Luma are not guaranteed to be
 * present for every event (private events, draft pages, etc.).
 */
export type LumaImport = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Canonical URL from `og:url` if different from the input, else the input. */
  canonicalUrl: string;
};

/**
 * Validates that `raw` is a well-formed Luma URL we're willing to fetch.
 * Applies the SSRF guard first, then the Luma host allowlist.
 *
 * Returns an error string if rejected, or null if safe.
 */
export function validateLumaUrl(raw: string): string | null {
  const ssrfErr = validateUrl(raw);
  if (ssrfErr) return ssrfErr;

  // validateUrl already confirmed it parses, so this won't throw.
  const parsed = new URL(raw);

  // Only HTTPS for Luma (their pages don't serve plain HTTP anyway,
  // and this gives us one extra layer of defense).
  if (parsed.protocol !== "https:") {
    return "Luma links must use https://";
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return "That doesn't look like a Luma event link";
  }

  // Luma events have a path (e.g. /abc123). A bare host with no path
  // is the marketing site, not an event.
  if (parsed.pathname === "/" || parsed.pathname === "") {
    return "Paste the full Luma event URL, not just the homepage";
  }

  return null;
}

/**
 * Extracts Open Graph / Twitter / title tags from a raw HTML document.
 *
 * Pure helper — no network calls, easy to unit test. Handles the minor
 * markup variations Luma has historically used (single vs. double quotes,
 * self-closing meta tags, attribute order).
 *
 * This deliberately does NOT use a full HTML parser: the OG tag pattern
 * is stable and a targeted regex is a fraction of the dependency weight
 * while being just as correct for this narrow use case. Extending to
 * other providers later would justify pulling in `linkedom` or similar.
 */
export function parseOgTags(html: string): LumaImport {
  const pickMeta = (propertyOrName: string): string | null => {
    // Match both <meta property="..."> and <meta name="..."> in either
    // attribute order. Capture the content attribute's value.
    const attrRegex = new RegExp(
      `<meta\\s+[^>]*(?:property|name)\\s*=\\s*["']${escapeRegex(
        propertyOrName
      )}["'][^>]*>`,
      "i"
    );
    const match = html.match(attrRegex);
    if (!match) return null;
    const contentMatch = match[0].match(/content\s*=\s*["']([^"']*)["']/i);
    return contentMatch ? decodeHtmlEntities(contentMatch[1]).trim() : null;
  };

  const pickTitleTag = (): string | null => {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? decodeHtmlEntities(match[1]).trim() : null;
  };

  // Title: og:title → twitter:title → <title>
  const rawTitle =
    pickMeta("og:title") ?? pickMeta("twitter:title") ?? pickTitleTag();
  const title = rawTitle ? stripLumaSuffix(rawTitle) : null;

  // Description: og:description → twitter:description → meta description
  const descriptionRaw =
    pickMeta("og:description") ??
    pickMeta("twitter:description") ??
    pickMeta("description");

  // Trim to our cap. Prefer a sentence break if we're close to the limit
  // so we don't cut mid-word.
  const description = descriptionRaw ? truncate(descriptionRaw, DESCRIPTION_MAX) : null;

  // Image: og:image → twitter:image
  const imageUrl = pickMeta("og:image") ?? pickMeta("twitter:image") ?? null;

  // Canonical URL: og:url → whatever the caller passed in. The caller
  // overwrites this when it knows the input URL.
  const canonicalUrl = pickMeta("og:url") ?? "";

  return {
    title: title && title.length > 0 ? title : null,
    description: description && description.length > 0 ? description : null,
    imageUrl,
    canonicalUrl,
  };
}

/**
 * Fetches a Luma event page and returns normalized OG metadata.
 *
 * Throws on network failure, non-200 response, or oversized body — let
 * the caller surface those as user-visible errors.
 */
export async function fetchLumaEvent(url: string): Promise<LumaImport> {
  // Re-run validation defensively even if the caller already did —
  // cheap, catches any bugs where we forget to validate upstream.
  const err = validateLumaUrl(url);
  if (err) throw new Error(err);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Luma sometimes serves a minimal shell to generic user agents —
        // pretend to be a real browser so we get the OG-rich HTML.
        "User-Agent":
          "Mozilla/5.0 (compatible; BlockTriviaBot/1.0; +https://blocktrivia.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Luma event not found (the link may be private or deleted)"
        : `Luma returned ${res.status} — try again`
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error("That Luma URL didn't return an HTML page");
  }

  // Cap body size to MAX_HTML_BYTES so a malicious or broken page can't
  // exhaust our memory.
  const text = await readCapped(res, MAX_HTML_BYTES);

  const parsed = parseOgTags(text);

  // Overwrite canonicalUrl with the resolved request URL if the OG tag
  // was missing — the resolved URL is always accurate, og:url is just
  // a hint.
  const canonicalUrl = parsed.canonicalUrl || res.url || url;

  return { ...parsed, canonicalUrl };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips Luma's trailing branding from an og:title. Luma appends
 * " · Luma" (or occasionally " | Luma") to every event title in their
 * metadata, which feels out of place once the event is imported into
 * BlockTrivia. We drop the suffix at the parser level so every consumer
 * gets a clean name without needing its own sanitization.
 *
 * Only strips the suffix when it appears as the FINAL segment with a
 * separator — we don't want to remove a legitimate "Luma" from the
 * middle of an event name like "Build on Luma: Partner Workshop".
 */
function stripLumaSuffix(title: string): string {
  return title
    .replace(/\s*[·|\-–—]\s*Luma\s*$/i, "")
    .trim();
}

/**
 * Minimal HTML entity decoder for the set of entities Luma actually
 * emits in OG tags. A full decoder is overkill — titles and
 * descriptions use ampersand-escaped punctuation and not much else.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Try to cut at the last sentence boundary within the budget, otherwise
  // at the last whitespace, otherwise just hard-cut.
  const head = s.slice(0, max);
  const lastPeriod = head.lastIndexOf(". ");
  if (lastPeriod > max * 0.6) return head.slice(0, lastPeriod + 1);
  const lastSpace = head.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return head.slice(0, lastSpace) + "…";
  return head + "…";
}

/**
 * Reads a Response body as text but refuses to accumulate more than
 * `limit` bytes. Short-circuits as soon as we exceed the cap so we never
 * materialize a pathological 100MB HTML blob in memory.
 */
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
      throw new Error("Luma page is too large to process");
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}
