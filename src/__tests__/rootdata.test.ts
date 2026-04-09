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
        data: [
          {
            project_id: 42,
            name: "Uniswap",
            one_liner: "Decentralized trading protocol",
            logo: "https://example.com/uni.png",
            tags: ["DeFi", "DEX"],
          },
        ],
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

  it("returns empty array when data is not an array", async () => {
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
          project_id: 123,
          project_name: "Aave",
          one_liner: "Lending protocol",
          description: "Open source liquidity protocol",
          logo: "https://example.com/aave.png",
          social_media: {
            website: "https://aave.com",
            X: "https://x.com/AaveAave",
            gitbook: "https://docs.aave.com",
          },
          investors: [
            { name: "Framework Ventures", logo: null, type: "VC" },
          ],
          tags: [{ name: "DeFi" }, { name: "Lending" }],
          similar_project: [
            { project_id: 7, project_name: "Compound", logo: null },
            { project_id: 11, project_name: "MakerDAO", logo: null },
          ],
          token_symbol: "AAVE",
          establishment_date: "2017",
          total_funding: 49000000,
          ecosystem: ["Ethereum", "Polygon"],
          on_main_net: true,
          plan_to_launch: false,
          on_test_net: false,
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("123");

    expect(project.rootdata_id).toBe("123");
    expect(project.name).toBe("Aave");
    expect(project.description).toBe("Open source liquidity protocol");
    expect(project.website).toBe("https://aave.com");
    expect(project.twitter).toBe("https://x.com/AaveAave");
    expect(project.gitbook).toBe("https://docs.aave.com");
    expect(project.investors).toHaveLength(1);
    expect(project.investors[0].name).toBe("Framework Ventures");
    expect(project.ecosystem_tags).toEqual(["DeFi", "Lending"]);
    expect(project.similar_project).toHaveLength(2);
    expect(project.similar_project[0].name).toBe("Compound");
    expect(project.token_symbol).toBe("AAVE");
    expect(project.establishment_date).toBe("2017");
    expect(project.total_funding).toBe(49000000);
    expect(project.ecosystem).toEqual(["Ethereum", "Polygon"]);
    expect(project.on_main_net).toBe(true);
    expect(project.plan_to_launch).toBe(false);
    expect(project.on_test_net).toBe(false);
    expect(project.raw).toBeDefined();
  });

  it("handles missing optional fields gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          project_name: "Minimal Project",
          // no investors, tags, social_media, one_liner, etc.
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("999");

    expect(project.name).toBe("Minimal Project");
    expect(project.investors).toEqual([]);
    expect(project.ecosystem_tags).toEqual([]);
    expect(project.similar_project).toEqual([]);
    expect(project.ecosystem).toEqual([]);
    expect(project.one_liner).toBeNull();
    expect(project.logo_url).toBeNull();
    expect(project.website).toBeNull();
    expect(project.twitter).toBeNull();
    expect(project.gitbook).toBeNull();
    expect(project.token_symbol).toBeNull();
    expect(project.establishment_date).toBeNull();
    expect(project.total_funding).toBeNull();
    expect(project.on_main_net).toBeNull();
    expect(project.plan_to_launch).toBeNull();
    expect(project.on_test_net).toBeNull();
  });

  it("coerces 1/0 booleans for network status flags", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          project_name: "Boolean Coercion",
          on_main_net: 1,
          plan_to_launch: 0,
          on_test_net: "true",
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("1");

    expect(project.on_main_net).toBe(true);
    expect(project.plan_to_launch).toBe(false);
    expect(project.on_test_net).toBe(true);
  });

  it("parses total_funding from numeric string", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          project_name: "String Funding",
          total_funding: "15000000",
        },
      }),
    } as Response);

    const { rootdata } = await import("@/lib/rootdata");
    const project = await rootdata.getProject("1");

    expect(project.total_funding).toBe(15000000);
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
