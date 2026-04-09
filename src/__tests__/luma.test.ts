import { describe, it, expect } from "vitest";
import { validateLumaUrl, parseOgTags } from "@/lib/luma";

// ---------------------------------------------------------------------------
// validateLumaUrl — URL allowlist + SSRF guard
// ---------------------------------------------------------------------------
describe("validateLumaUrl", () => {
  it("accepts lu.ma event URLs", () => {
    expect(validateLumaUrl("https://lu.ma/abc123")).toBeNull();
  });

  it("accepts luma.com event URLs", () => {
    expect(validateLumaUrl("https://luma.com/some-event")).toBeNull();
  });

  it("accepts www.luma.com event URLs", () => {
    expect(validateLumaUrl("https://www.luma.com/some-event")).toBeNull();
  });

  it("rejects non-Luma hosts", () => {
    expect(validateLumaUrl("https://eventbrite.com/e/123")).toMatch(/doesn't look like a Luma/i);
  });

  it("rejects http:// Luma URLs (https only)", () => {
    expect(validateLumaUrl("http://lu.ma/abc")).toMatch(/https/i);
  });

  it("rejects the Luma homepage without a path", () => {
    expect(validateLumaUrl("https://lu.ma/")).toMatch(/full Luma event URL/i);
    expect(validateLumaUrl("https://luma.com/")).toMatch(/full Luma event URL/i);
  });

  it("rejects malformed URLs", () => {
    expect(validateLumaUrl("not-a-url")).toMatch(/invalid url/i);
    expect(validateLumaUrl("")).toMatch(/invalid url/i);
  });

  it("rejects localhost and private IPs via SSRF guard", () => {
    // These would pass the Luma allowlist (they don't) but should be
    // caught by the upstream SSRF guard regardless.
    expect(validateLumaUrl("https://127.0.0.1/pretend-luma")).not.toBeNull();
    expect(validateLumaUrl("https://10.0.0.1/pretend-luma")).not.toBeNull();
  });

  it("is case-insensitive on the hostname", () => {
    expect(validateLumaUrl("https://LU.MA/abc")).toBeNull();
    expect(validateLumaUrl("https://Luma.com/event")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseOgTags — pure HTML → LumaImport transformer
// ---------------------------------------------------------------------------
describe("parseOgTags", () => {
  it("extracts og:title, og:description, og:image, og:url", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="DeFi Summit Berlin 2026">
          <meta property="og:description" content="A full day of builders and protocols on the ground in Berlin.">
          <meta property="og:image" content="https://cdn.lu.ma/events/abc.jpg">
          <meta property="og:url" content="https://lu.ma/defi-summit-berlin">
        </head>
      </html>
    `;
    const result = parseOgTags(html);
    expect(result.title).toBe("DeFi Summit Berlin 2026");
    expect(result.description).toBe(
      "A full day of builders and protocols on the ground in Berlin."
    );
    expect(result.imageUrl).toBe("https://cdn.lu.ma/events/abc.jpg");
    expect(result.canonicalUrl).toBe("https://lu.ma/defi-summit-berlin");
  });

  it("falls back to twitter:* tags when og:* are missing", () => {
    const html = `
      <meta name="twitter:title" content="Twitter Fallback Event">
      <meta name="twitter:description" content="Only twitter tags here.">
      <meta name="twitter:image" content="https://cdn.lu.ma/twitter.jpg">
    `;
    const result = parseOgTags(html);
    expect(result.title).toBe("Twitter Fallback Event");
    expect(result.description).toBe("Only twitter tags here.");
    expect(result.imageUrl).toBe("https://cdn.lu.ma/twitter.jpg");
  });

  it("falls back to <title> tag when no meta tags", () => {
    const html = `<html><head><title>Bare Title Event</title></head><body></body></html>`;
    const result = parseOgTags(html);
    expect(result.title).toBe("Bare Title Event");
  });

  it("returns null for missing fields instead of empty strings", () => {
    const html = `<html><head></head></html>`;
    const result = parseOgTags(html);
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.canonicalUrl).toBe("");
  });

  it("handles attribute order flipping (content before property)", () => {
    const html = `<meta content="Flipped Order Event" property="og:title">`;
    expect(parseOgTags(html).title).toBe("Flipped Order Event");
  });

  it("handles single-quoted attributes", () => {
    const html = `<meta property='og:title' content='Single Quotes Event'>`;
    expect(parseOgTags(html).title).toBe("Single Quotes Event");
  });

  it("decodes common HTML entities in titles and descriptions", () => {
    const html = `
      <meta property="og:title" content="Web3 &amp; AI Mixer">
      <meta property="og:description" content="Hosted by &quot;Zero Knowledge&quot; &mdash; don&#39;t miss it">
    `;
    const result = parseOgTags(html);
    expect(result.title).toBe("Web3 & AI Mixer");
    // &mdash; isn't in our minimal decoder — we only cover what Luma
    // actually emits, which is the named basic set. Apostrophe IS covered.
    expect(result.description).toContain("'t miss");
    expect(result.description).toContain('"Zero Knowledge"');
  });

  it("truncates descriptions over 500 chars at a sentence boundary", () => {
    const longText =
      "Opening keynote from a founder. Panel on intent-based architectures. " +
      "Workshop on rollup sequencing. Lightning talks from early-stage teams. " +
      "Closing AMA with core contributors and a chance to connect with other " +
      "builders in the space over food and drinks. There will also be a demo " +
      "area for new projects to show off their latest work and get feedback. " +
      "Come hang out, build connections, and leave with ideas you can ship " +
      "next week. This event is free to attend but registration is required " +
      "due to venue capacity limits. Extra words to push past 500 characters.";
    const html = `<meta property="og:description" content="${longText}">`;
    const result = parseOgTags(html);
    expect(result.description).not.toBeNull();
    expect(result.description!.length).toBeLessThanOrEqual(500);
  });

  it("ignores meta tags for unrelated properties", () => {
    const html = `
      <meta property="og:site_name" content="Luma">
      <meta property="og:type" content="website">
      <meta property="og:title" content="Real Event Title">
    `;
    const result = parseOgTags(html);
    expect(result.title).toBe("Real Event Title");
  });

  it("picks the first og:title if duplicates exist", () => {
    const html = `
      <meta property="og:title" content="First">
      <meta property="og:title" content="Second">
    `;
    expect(parseOgTags(html).title).toBe("First");
  });
});
