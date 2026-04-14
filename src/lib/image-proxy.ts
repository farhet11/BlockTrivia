/**
 * Wraps an external image URL through our proxy to avoid cross-origin
 * blocking (ORB/CORB/hotlink protection).
 *
 * Local/relative URLs and data URIs are returned as-is.
 */
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  // Don't proxy relative paths, data URIs, or same-origin URLs
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
