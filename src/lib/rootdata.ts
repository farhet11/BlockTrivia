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

export type RootDataTeamMember = {
  name: string;
  role: string | null;
  twitter: string | null;
  linkedin: string | null;
  avatar: string | null;
};

export type RootDataInvestor = {
  name: string;
  logo: string | null;
  type: string | null; // "VC", "Angel", etc.
};

export type RootDataFundingRound = {
  round: string | null; // "Seed", "Series A", etc.
  amount_usd: number | null;
  date: string | null; // ISO date string
  investors: string[]; // investor names
};

export type RootDataProject = {
  rootdata_id: string;
  name: string;
  one_liner: string | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  twitter: string | null;
  team_members: RootDataTeamMember[];
  investors: RootDataInvestor[];
  ecosystem_tags: string[];
  funding_history: RootDataFundingRound[];
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

  // RootData returns { ok: true, data: { project_list: [...] } }
  const list: unknown[] = json?.data?.project_list ?? [];

  return list.map((item) => {
    const p = item as Record<string, unknown>;
    return {
      project_id: Number(p.project_id ?? p.id ?? 0),
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
  const res = await fetch(`${BASE_URL}/pro_det`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      project_id: Number(rootdataId),
      include_team: 1,
      include_investors: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`RootData getProject failed: ${res.status}`);
  }

  const json = await res.json();
  const d = (json?.data ?? {}) as Record<string, unknown>;

  // Normalize team members
  const rawTeam = Array.isArray(d.team) ? d.team : [];
  const teamMembers: RootDataTeamMember[] = rawTeam.map((m: unknown) => {
    const member = m as Record<string, unknown>;
    return {
      name: String(member.name ?? ""),
      role: member.position ? String(member.position) : null,
      twitter: member.twitter ? String(member.twitter) : null,
      linkedin: member.linkedin ? String(member.linkedin) : null,
      avatar: member.avatar ? String(member.avatar) : null,
    };
  });

  // Normalize investors
  const rawInvestors = Array.isArray(d.investors) ? d.investors : [];
  const investors: RootDataInvestor[] = rawInvestors.map((inv: unknown) => {
    const i = inv as Record<string, unknown>;
    return {
      name: String(i.name ?? ""),
      logo: i.logo ? String(i.logo) : null,
      type: i.type ? String(i.type) : null,
    };
  });

  // Normalize funding rounds
  const rawFunding = Array.isArray(d.funding_list) ? d.funding_list : [];
  const fundingHistory: RootDataFundingRound[] = rawFunding.map((r: unknown) => {
    const f = r as Record<string, unknown>;
    const fundInvestors: string[] = Array.isArray(f.investors)
      ? (f.investors as Record<string, unknown>[]).map((i) => String(i.name ?? ""))
      : [];
    return {
      round: f.round ? String(f.round) : null,
      amount_usd: f.amount ? Number(f.amount) : null,
      date: f.date ? String(f.date) : null,
      investors: fundInvestors,
    };
  });

  // Normalize tags
  const rawTags = Array.isArray(d.tags) ? d.tags : [];
  const ecosystemTags: string[] = rawTags.map((t: unknown) => {
    const tag = t as Record<string, unknown>;
    return String(tag.name ?? tag ?? "");
  });

  return {
    rootdata_id: rootdataId,
    name: String(d.name ?? ""),
    one_liner: d.one_liner ? String(d.one_liner) : null,
    description: d.description ? String(d.description) : null,
    logo_url: d.logo ? String(d.logo) : null,
    website: d.website ? String(d.website) : null,
    twitter: d.twitter ? String(d.twitter) : null,
    team_members: teamMembers,
    investors,
    ecosystem_tags: ecosystemTags,
    funding_history: fundingHistory,
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
