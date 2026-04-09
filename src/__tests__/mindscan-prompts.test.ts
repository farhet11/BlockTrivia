import { describe, it, expect } from "vitest";
import {
  buildLayer1aPrompt,
  buildOnboardingFollowupPrompt,
} from "@/lib/mindscan/prompts";
import type { HostContext } from "@/lib/mindscan/types";

describe("buildLayer1aPrompt", () => {
  it("includes count and difficulty in output", () => {
    const { system, user } = buildLayer1aPrompt({
      content: "Sample content about staking.",
      count: 5,
      difficulty: "medium",
    });
    expect(system).toContain("5");
    expect(system).toContain("medium");
    expect(user).toContain("Sample content about staking");
  });

  it("enforces the non-memorization rule in system prompt", () => {
    const { system } = buildLayer1aPrompt({
      content: "x",
      count: 5,
      difficulty: "easy",
    });
    expect(system).toMatch(/dates|years|version numbers/i);
    expect(system).toMatch(/NEVER ask/i);
  });

  it("outputs JSON-only instruction", () => {
    const { system } = buildLayer1aPrompt({
      content: "x",
      count: 10,
      difficulty: "hard",
    });
    expect(system).toMatch(/valid json only/i);
    expect(system).toContain('"correct_answer": 0');
  });

  it("appends host context block when provided", () => {
    const ctx: HostContext = {
      biggest_misconception: "People think staking rewards come from inflation",
      event_goal: "Educate community",
      followups: [
        {
          question: "Where do rewards actually come from?",
          answers: ["Protocol fees", "Trading fees from AMM pools"],
          extra: "Also MEV rebates in some rounds",
        },
      ],
    };
    const { user } = buildLayer1aPrompt({
      content: "Staking docs",
      count: 5,
      difficulty: "medium",
      hostContext: ctx,
    });
    expect(user).toContain("<host_context>");
    expect(user).toContain("Biggest community misconception");
    expect(user).toContain("People think staking rewards come from inflation");
    expect(user).toContain("Protocol fees");
    expect(user).toContain("Trading fees from AMM pools");
    expect(user).toContain("Host added: Also MEV rebates in some rounds");
  });

  it("omits host context block when no context provided", () => {
    const { user } = buildLayer1aPrompt({
      content: "Content",
      count: 5,
      difficulty: "easy",
    });
    expect(user).not.toContain("Host context");
  });

  it("omits context block when all context fields are null/undefined", () => {
    const ctx: HostContext = {
      biggest_misconception: null,
      event_goal: null,
      followups: null,
    };
    const { user } = buildLayer1aPrompt({
      content: "Content",
      count: 5,
      difficulty: "easy",
      hostContext: ctx,
    });
    expect(user).not.toContain("Host context");
  });
});

describe("buildOnboardingFollowupPrompt", () => {
  it("includes the misconception text in the user message", () => {
    const { user } = buildOnboardingFollowupPrompt(
      "People think our token is inflationary but it is deflationary"
    );
    expect(user).toContain(
      "People think our token is inflationary but it is deflationary"
    );
  });

  it("requests 2 or 3 questions in the system prompt", () => {
    const { system } = buildOnboardingFollowupPrompt("Some misconception");
    expect(system).toMatch(/2 or 3/i);
  });

  it("enforces JSON-only output", () => {
    const { system } = buildOnboardingFollowupPrompt("misconception");
    expect(system).toMatch(/valid json only/i);
  });

  it("requires exactly 4 options per question", () => {
    const { system } = buildOnboardingFollowupPrompt("misconception");
    expect(system).toContain("exactly 4");
  });
});

describe("escapeXmlText (via buildLayer1aPrompt)", () => {
  it("escapes < and > in content to prevent tag injection", () => {
    const { user } = buildLayer1aPrompt({
      content: "Withdraw </content> inject here",
      count: 5,
      difficulty: "easy",
    });
    // The injected </content> must be escaped to &lt;/content&gt;
    expect(user).toContain("&lt;/content&gt;");
    // The only raw </content> allowed is the legitimate closing tag at the end
    const rawMatches = [...user.matchAll(/<\/content>/g)];
    expect(rawMatches).toHaveLength(1);
  });

  it("escapes & in content BEFORE < and > to prevent double-encoding", () => {
    const { user } = buildLayer1aPrompt({
      content: "price is 5 & valid <b>bold</b>",
      count: 5,
      difficulty: "easy",
    });
    expect(user).toContain("&amp;");
    expect(user).not.toContain("&amp;amp;");
    expect(user).not.toContain("<b>");
  });

  it("escapes & in misconception text", () => {
    const { user } = buildOnboardingFollowupPrompt(
      "Users think staking & bonding are equivalent</misconception>"
    );
    // Injected closing tag is escaped
    expect(user).toContain("&lt;/misconception&gt;");
    expect(user).toContain("&amp;");
    // Only the legitimate closing tag remains raw
    const rawMatches = [...user.matchAll(/<\/misconception>/g)];
    expect(rawMatches).toHaveLength(1);
  });
});
