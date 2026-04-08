import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client singleton.
 *
 * Never import this from a client component — it reads a private env var
 * and will throw on the first call if the key is missing.
 */

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local for local dev, and to Vercel env vars for production."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Default model for MindScan calls. Sonnet is fast enough and smart enough
 * for Layer 1a/1 onboarding; Opus is overkill for this layer.
 */
export const MINDSCAN_MODEL = "claude-sonnet-4-6";
