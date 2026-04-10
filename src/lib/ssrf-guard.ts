/**
 * SSRF guard — shared validation for any server-side URL fetch.
 *
 * Blocks requests to private IP ranges, localhost, and cloud metadata
 * endpoints (e.g. AWS 169.254.169.254). Use this in any API route that
 * fetches a user-supplied URL.
 */

// Private IP ranges, localhost, link-local, and cloud metadata endpoints.
// 169.254.x.x covers AWS/GCP/Azure instance metadata (classic SSRF target).
const BLOCKED_HOSTS =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1|fc00:|fd[0-9a-f]{2}:)/i;

/**
 * Validates a URL for safe server-side fetching.
 * Returns an error string if invalid/blocked, or null if safe.
 */
export function validateUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "Invalid URL — must start with http:// or https://";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http:// and https:// URLs are supported";
  }
  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    return "That URL is not accessible";
  }
  return null; // valid
}

/**
 * Checks that a Response's final URL (after redirects) is not a blocked host.
 * Use this after any `fetch(..., { redirect: "follow" })` call to guard
 * against SSRF via open redirect — an input URL could 301 to an internal
 * metadata endpoint even when the original input passed validateUrl().
 *
 * Throws if the final destination is blocked.
 */
export function assertSafeRedirectDestination(res: Response): void {
  let finalUrl: URL;
  try {
    finalUrl = new URL(res.url);
  } catch {
    // res.url is empty or unparseable — safer to block than silently allow.
    // An empty res.url can indicate fetch interception or runtime differences.
    throw new Error("Could not verify redirect destination — request blocked for safety");
  }
  if (BLOCKED_HOSTS.test(finalUrl.hostname)) {
    throw new Error(`Redirect destination blocked: ${finalUrl.hostname}`);
  }
}
