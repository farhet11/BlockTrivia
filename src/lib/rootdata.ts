/**
 * RootData API client — server-side only.
 *
 * RootData is a credit-based blockchain project intelligence API.
 * Costs: Search = free (unlimited), Get Project = 2 credits.
 *
 * To protect credits we always check the DB cache first. If
 * rootdata_synced_at is <7 days old, we return the cached row and
 * skip the API call entirely.
 *
 * Usage:
 *   import { rootdata } from "@/lib/rootdata";
 *   const results = await rootdata.search("Uniswap");
 *   const project = await rootdata.getProject("12345");
 */

import "server-only";

const BASE_URL = "https://api.rootdata.com/open";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getApiKey(): string {
  const key = process.env.ROOTDATA_API_KEY;
  if (!key) throw new Error("ROOTDATA_API_KEY is not set");
  return key;
}

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: getApiKey(),
    language: "1", // 1 = English
  };
}

// ── Search response types ──────────────────────────────────────────────────

export type RootDataSearchResult = {
  /** RootData internal project ID */
  project_id: number;
  /** Project name */
  name: string;
  /** Short one-liner description */
  one_liner: string | null;
  /** Logo image URL */
  logo: string | null;
  /** Ecosystem / chain tags */
  tags: string[];
};

// ── Project detail types ───────────────────────────────────────────────────

export type RootDataInvestor = {
  name: string;
  logo: string | null;
  type: string | null; // "VC", "Angel", etc.
};

export type RootDataSimilarProject = {
  project_id: number | null;
  name: string;
  logo: string | null;
};

export type RootDataProject = {
  rootdata_id: string;
  name: string;
  one_liner: string | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  twitter: string | null;
  gitbook: string | null;
  investors: RootDataInvestor[];
  ecosystem_tags: string[];
  /** Sister projects RootData groups together — useful for misconception contrast. */
  similar_project: RootDataSimilarProject[];
  /** Token ticker, e.g. "UNI". null = pre-token. */
  token_symbol: string | null;
  /** Free-text founding/launch date from RootData. */
  establishment_date: string | null;
  /** Total disclosed funding in USD. Silent context only — never surfaced in UI. */
  total_funding: number | null;
  /** Chains the project lives on, e.g. ["Ethereum", "Base"]. */
  ecosystem: string[];
  on_main_net: boolean | null;
  plan_to_launch: boolean | null;
  on_test_net: boolean | null;
  /** Raw payload from RootData get_item — future-proofs new fields. */
  raw: Record<string, unknown>;
};

// ── API methods ────────────────────────────────────────────────────────────

/**
 * Search RootData for projects matching a query string.
 * Free — no credits consumed.
 */
async function search(query: string): Promise<RootDataSearchResult[]> {
  const res = await fetch(`${BASE_URL}/ser_inv`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, include_investors: 0 }),
  });

  if (!res.ok) {
    throw new Error(`RootData search failed: ${res.status}`);
  }

  const json = await res.json();

  // RootData returns { data: [...] } — a direct array, not nested under project_list
  const list: unknown[] = Array.isArray(json?.data) ? json.data : [];

  return list.map((item) => {
    const p = item as Record<string, unknown>;
    // project_id may come as a direct field or be encoded in rootdataurl (?k=base64)
    let pid = Number(p.project_id ?? p.id ?? 0);
    if (!pid && typeof p.rootdataurl === "string") {
      const m = p.rootdataurl.match(/[?&]k=([A-Za-z0-9+/=]+)/);
      if (m) pid = Number(atob(m[1]));
    }
    return {
      project_id: pid,
      name: String(p.name ?? ""),
      one_liner: p.one_liner ? String(p.one_liner) : null,
      logo: p.logo ? String(p.logo) : null,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    };
  });
}

/**
 * Fetch full project details from RootData.
 * Costs 2 credits — only call when the caller has confirmed the project ID.
 */
async function getProject(rootdataId: string): Promise<RootDataProject> {
  const res = await fetch(`${BASE_URL}/get_item`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      project_id: Number(rootdataId),
      // We are on the free tier — include_team is Pro-only and would be a no-op.
      include_investors: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`RootData getProject failed: ${res.status}`);
  }

  const json = await res.json();
  const d = (json?.data ?? {}) as Record<string, unknown>;

  // social_media is an object e.g. { website: "url", X: "url", gitbook: "url" }
  const social = (d.social_media ?? {}) as Record<string, unknown>;

  // Normalize investors — docs field: investors[].name, .logo
  const rawInvestors = Array.isArray(d.investors) ? d.investors : [];
  const investors: RootDataInvestor[] = rawInvestors.map((inv: unknown) => {
    const i = inv as Record<string, unknown>;
    return {
      name: String(i.name ?? i.org_name ?? ""),
      logo: i.logo ? String(i.logo) : null,
      type: i.type ? String(i.type) : null,
    };
  });

  // Normalize tags — docs field: tags (string[] or {name}[])
  const rawTags = Array.isArray(d.tags) ? d.tags : [];
  const ecosystemTags: string[] = rawTags
    .map((t: unknown) => {
      if (typeof t === "string") return t;
      const tag = t as Record<string, unknown>;
      return String(tag.name ?? "");
    })
    .filter(Boolean);

  // Normalize similar_project — docs field: similar_project[].project_id, .project_name, .logo
  const rawSimilar = Array.isArray(d.similar_project) ? d.similar_project : [];
  const similarProjects: RootDataSimilarProject[] = rawSimilar
    .map((sp: unknown) => {
      const s = sp as Record<string, unknown>;
      return {
        project_id: s.project_id != null ? Number(s.project_id) : null,
        name: String(s.project_name ?? s.name ?? ""),
        logo: s.logo ? String(s.logo) : null,
      };
    })
    .filter((sp) => sp.name.length > 0);

  // Normalize ecosystem — docs field: ecosystem (string[] or {name}[] depending on payload)
  const rawEcosystem = Array.isArray(d.ecosystem) ? d.ecosystem : [];
  const ecosystem: string[] = rawEcosystem
    .map((e: unknown) => {
      if (typeof e === "string") return e;
      const obj = e as Record<string, unknown>;
      return String(obj.name ?? obj.ecosystem_name ?? "");
    })
    .filter(Boolean);

  // total_funding may be a number or numeric string
  const rawFunding = d.total_funding;
  let totalFunding: number | null = null;
  if (typeof rawFunding === "number" && Number.isFinite(rawFunding)) {
    totalFunding = rawFunding;
  } else if (typeof rawFunding === "string" && rawFunding.trim() !== "") {
    const n = Number(rawFunding);
    if (Number.isFinite(n)) totalFunding = n;
  }

  // Booleans may come back as 1/0 or true/false
  const toBool = (v: unknown): boolean | null => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      if (v === "1" || v.toLowerCase() === "true") return true;
      if (v === "0" || v.toLowerCase() === "false") return false;
    }
    return null;
  };

  return {
    rootdata_id: rootdataId,
    // docs: project_name (not name)
    name: String(d.project_name ?? d.name ?? ""),
    one_liner: d.one_liner ? String(d.one_liner) : null,
    description: d.description ? String(d.description) : null,
    logo_url: d.logo ? String(d.logo) : null,
    // docs: website and twitter live inside social_media; twitter keyed as X
    website: social.website ? String(social.website) : null,
    twitter: (social.twitter ?? social.X) ? String(social.twitter ?? social.X) : null,
    gitbook: social.gitbook ? String(social.gitbook) : null,
    investors,
    ecosystem_tags: ecosystemTags,
    similar_project: similarProjects,
    token_symbol: d.token_symbol ? String(d.token_symbol) : null,
    establishment_date: d.establishment_date ? String(d.establishment_date) : null,
    total_funding: totalFunding,
    ecosystem,
    on_main_net: toBool(d.on_main_net),
    plan_to_launch: toBool(d.plan_to_launch),
    on_test_net: toBool(d.on_test_net),
    raw: d,
  };
}

/**
 * Check if a cached project row is stale (>7 days since last sync).
 */
export function isCacheStale(syncedAt: string | null): boolean {
  if (!syncedAt) return true;
  return Date.now() - new Date(syncedAt).getTime() > CACHE_TTL_MS;
}

export const rootdata = { search, getProject };
