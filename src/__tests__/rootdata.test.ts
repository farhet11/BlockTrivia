import { describe, it, expect, vi, beforeEach } from "vitest";
import { isCacheStale } from "@/lib/rootdata";

// ---------------------------------------------------------------------------
// isCacheStale — pure function, no mocks needed
// ---------------------------------------------------------------------------
describe("isCacheStale", () => {
  it("returns true when syncedAt is null (never synced)", () => {
    expect(isCacheStale(null)).toBe(true);
  });

  it("returns true when syncedAt is more than 7 days ago", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheStale(eightDaysAgo)).toBe(true);
  });

  it("returns false when syncedAt is less than 7 days ago", () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheStale(oneDayAgo)).toBe(false);
  });

  it("returns false when syncedAt is just now", () => {
    const justNow = new Date().toISOString();
    expect(isCacheStale(justNow)).toBe(false);
  });

  it("returns true when syncedAt is exactly 7 days ago (boundary)", () => {
    const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1).toISOString();
    expect(isCacheStale(exactlySevenDays)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rootdata.search — mocked fetch
// ---------------------------------------------------------------------------
describe("rootdata.search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Stub ROOTDATA_API_KEY so server-only import doesn't throw
    process.env.ROOTDATA_API_KEY = "test-key";
  });

  it("returns normalized results on success", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          project_list: [
            {
              project_id: 42,
              name: "Uniswap",
              one_liner: "Decentralized trading protocol",
              logo: "https://example.com/uni.png",
              tags: ["DeFi", "DEX"],
            },
          ],
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const results = await rootdata.search("Uniswap");

    expect(results).toHaveLength(1);
    expect(results[0].project_id).toBe(42);
    expect(results[0].name).toBe("Uniswap");
    expect(results[0].one_liner).toBe("Decentralized trading protocol");
    expect(results[0].tags).toEqual(["DeFi", "DEX"]);
  });

  it("returns empty array when project_list is missing", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const results = await rootdata.search("nonexistent");
    expect(results).toEqual([]);
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    await expect(rootdata.search("fail")).rejects.toThrow("RootData search failed: 503");
  });
});

// ---------------------------------------------------------------------------
// rootdata.getProject — mocked fetch
// ---------------------------------------------------------------------------
describe("rootdata.getProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ROOTDATA_API_KEY = "test-key";
  });

  it("normalizes a full project response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          name: "Aave",
          one_liner: "Lending protocol",
          description: "Open source liquidity protocol",
          logo: "https://example.com/aave.png",
          website: "https://aave.com",
          twitter: "@AaveAave",
          team: [
            { name: "Stani", position: "CEO", twitter: "@StaniKulechov", linkedin: null, avatar: null },
          ],
          investors: [
            { name: "Framework Ventures", logo: null, type: "VC" },
          ],
          tags: [{ name: "DeFi" }, { name: "Lending" }],
          funding_list: [
            {
              round: "Series A",
              amount: 25000000,
              date: "2020-07-01",
              investors: [{ name: "Framework Ventures" }],
            },
          ],
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("123");

    expect(project.rootdata_id).toBe("123");
    expect(project.name).toBe("Aave");
    expect(project.team_members).toHaveLength(1);
    expect(project.team_members[0].name).toBe("Stani");
    expect(project.team_members[0].role).toBe("CEO");
    expect(project.investors).toHaveLength(1);
    expect(project.ecosystem_tags).toEqual(["DeFi", "Lending"]);
    expect(project.funding_history[0].round).toBe("Series A");
    expect(project.funding_history[0].amount_usd).toBe(25000000);
  });

  it("handles missing optional fields gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          name: "Minimal Project",
          // no team, investors, tags, funding, one_liner, etc.
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("999");

    expect(project.name).toBe("Minimal Project");
    expect(project.team_members).toEqual([]);
    expect(project.investors).toEqual([]);
    expect(project.ecosystem_tags).toEqual([]);
    expect(project.funding_history).toEqual([]);
    expect(project.one_liner).toBeNull();
    expect(project.logo_url).toBeNull();
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    await expect(rootdata.getProject("123")).rejects.toThrow("RootData getProject failed: 429");
  });
});
