"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type EventFormat = "irl" | "virtual" | "hybrid";
type AccessMode = "open" | "whitelist" | "blacklist";

const FORMAT_OPTIONS: { value: EventFormat; label: string; description: string }[] = [
  {
    value: "irl",
    label: "IRL",
    description: "Everyone in the room",
  },
  {
    value: "virtual",
    label: "Virtual",
    description: "Players on Zoom / X Space",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Mix of both",
  },
];

const ACCESS_OPTIONS: { value: AccessMode; label: string; description: string }[] = [
  { value: "open", label: "Open", description: "Anyone can join" },
  { value: "whitelist", label: "Invite Only", description: "Approved emails only" },
  { value: "blacklist", label: "Block List", description: "Everyone except blocked" },
];

// ── CSV email auto-detection ────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    // Handle quoted fields
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === "," || char === "\t" || char === ";") && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function detectEmailColumn(rows: string[][]): { columnIndex: number; columnName: string; emails: string[] } | null {
  if (rows.length === 0) return null;

  const header = rows[0];
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    // Single row — might be all emails (no header)
    const emails = header.filter((v) => EMAIL_REGEX.test(v));
    if (emails.length > 0) return { columnIndex: 0, columnName: "Column 1", emails };
    return null;
  }

  // Score each column by how many values look like emails
  let bestCol = -1;
  let bestScore = 0;
  let bestEmails: string[] = [];

  for (let col = 0; col < header.length; col++) {
    const values = dataRows.map((row) => row[col] ?? "").filter(Boolean);
    const emails = values.filter((v) => EMAIL_REGEX.test(v));
    if (emails.length > bestScore) {
      bestScore = emails.length;
      bestCol = col;
      bestEmails = emails;
    }
  }

  if (bestCol < 0 || bestScore === 0) return null;

  // Check if header itself looks like an email (no header row)
  const headerVal = header[bestCol];
  if (EMAIL_REGEX.test(headerVal)) {
    bestEmails = [headerVal, ...bestEmails];
    return { columnIndex: bestCol, columnName: `Column ${bestCol + 1}`, emails: bestEmails };
  }

  return { columnIndex: bestCol, columnName: headerVal || `Column ${bestCol + 1}`, emails: bestEmails };
}

type OrganizerSuggestion = {
  organizer_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
};

export type EditEventData = {
  id: string;
  title: string;
  description: string | null;
  prizes: string | null;
  organizer_name: string | null;
  format: EventFormat;
  access_mode: AccessMode;
  logo_url: string | null;
  logo_dark_url: string | null;
  scheduled_at: string | null;
  source_url: string | null;
  source_provider: string | null;
  cover_image_url: string | null;
  project_id: string | null;
  access_emails: string[];
};

export function CreateEventForm({ fromEventId, editEvent }: { fromEventId?: string; editEvent?: EditEventData }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<EventFormat>(editEvent?.format ?? "hybrid");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(editEvent?.logo_url ?? null);
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(editEvent?.logo_dark_url ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(editEvent?.logo_url ?? null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(editEvent?.logo_dark_url ?? null);
  const [hasDarkLogo, setHasDarkLogo] = useState(!!editEvent?.logo_dark_url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const darkFileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showMore, setShowMore] = useState(
    !!(editEvent?.prizes || editEvent?.logo_url || editEvent?.access_mode && editEvent.access_mode !== "open")
  );
  const [accessMode, setAccessMode] = useState<AccessMode>(editEvent?.access_mode ?? "open");
  const [accessEmails, setAccessEmails] = useState(editEvent?.access_emails?.join("\n") ?? "");
  const [csvInfo, setCsvInfo] = useState<{ fileName: string; columnName: string; count: number } | null>(null);

  // Controlled values for pre-fillable fields
  const [title, setTitle] = useState(editEvent?.title ?? "");
  const [description, setDescription] = useState(editEvent?.description ?? "");
  const [prizes, setPrizes] = useState(editEvent?.prizes ?? "");

  // Start mode: "now" jumps straight to questions; "schedule" sets a future
  // start time and redirects to the share page so the host can distribute
  // a pre-registration link.
  const [startMode, setStartMode] = useState<"now" | "schedule">(editEvent?.scheduled_at ? "schedule" : "now");
  const [scheduledAt, setScheduledAt] = useState(editEvent?.scheduled_at ? editEvent.scheduled_at.slice(0, 16) : "");

  // Organizer typeahead state
  const [organizerName, setOrganizerName] = useState(editEvent?.organizer_name ?? "");
  const [userId, setUserId] = useState<string | null>(null);
  const [_suggestions, setSuggestions] = useState<OrganizerSuggestion[]>([]);
  const [_showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Project link (RootData) state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectSelectedName, setProjectSelectedName] = useState<string | null>(null);
  // Small round favicon shown INSIDE the Organizer input field. Always
  // sourced from RootData (not the website logo extractor) — the inline
  // 24px slot is exactly what RootData's favicon-style logos look good
  // at, and we want it independent from the larger Organizer / Host Logo
  // upload preview below, which only takes the full brand mark.
  const [inlineOrganizerLogo, setInlineOrganizerLogo] = useState<string | null>(null);
  const [_projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState<{ project_id: number; name: string; one_liner: string | null; logo: string | null }[]>([]);
  const [projectSearching, setProjectSearching] = useState(false);
  const projectDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Refs mirror state so the async site-logo upgrade can read the
  // *latest* values inside its .then() without re-running on every state
  // change. Without these the upgrade stomps a custom file upload that
  // happens between handleProjectSelect and the site-logo response.
  const projectSelectedNameRef = useRef<string | null>(null);
  const logoFileRef = useRef<File | null>(null);
  useEffect(() => {
    projectSelectedNameRef.current = projectSelectedName;
  }, [projectSelectedName]);
  useEffect(() => {
    logoFileRef.current = logoFile;
  }, [logoFile]);

  // Luma import state — when the host pastes a Luma URL into the title
  // field, we detect it, fetch the OG metadata, and show a preview they
  // can apply (which pre-fills title + description).
  const [lumaImport, setLumaImport] = useState<{
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
  } | null>(null);
  const [lumaStatus, setLumaStatus] = useState<"idle" | "fetching" | "error">(
    "idle"
  );
  const [lumaError, setLumaError] = useState<string | null>(null);

  // Carried-over provenance from a duplicated event. Kept separate from
  // `lumaImport` so we don't accidentally show the Luma preview card on
  // a plain duplicate — it just rides through to the new row's
  // source_url / source_provider / cover_image_url at submit time.
  const [carriedProvenance, setCarriedProvenance] = useState<{
    sourceUrl: string | null;
    sourceProvider: string | null;
    coverImageUrl: string | null;
  } | null>(null);

  // Fetch authenticated user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, [supabase]);

  // Pre-fill from source event when duplicating
  useEffect(() => {
    if (!fromEventId) return;
    supabase
      .from("events")
      .select("title, description, prizes, organizer_name, format, access_mode, logo_url, logo_dark_url, source_url, source_provider, cover_image_url")
      .eq("id", fromEventId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setTitle(data.title ?? "");
        setDescription(data.description ?? "");
        setPrizes(data.prizes ?? "");
        if (data.organizer_name) setOrganizerName(data.organizer_name);
        if (data.format) setFormat(data.format as EventFormat);
        if (data.access_mode) setAccessMode(data.access_mode as AccessMode);
        if (data.logo_url) {
          setLogoUrl(data.logo_url);
          setLogoPreview(data.logo_url);
          setShowMore(true);
        }
        if (data.logo_dark_url) {
          setLogoDarkUrl(data.logo_dark_url);
          setLogoDarkPreview(data.logo_dark_url);
          setHasDarkLogo(true);
        }
        if (data.prizes) setShowMore(true);
        // Carry the original event's import provenance through to the
        // duplicate so analytics still attributes it to the right source.
        if (data.source_url || data.source_provider || data.cover_image_url) {
          setCarriedProvenance({
            sourceUrl: data.source_url ?? null,
            sourceProvider: data.source_provider ?? null,
            coverImageUrl: data.cover_image_url ?? null,
          });
        }
      });
  }, [fromEventId, supabase]);  

  // ── Luma link detection + import ──────────────────────────────────────
  // Regex matches any lu.ma or luma.com URL so we detect the link whether
  // the host pastes it alone, types around it, or drops it mid-string.
  const lumaUrlRegex = useMemo(
    () => /https?:\/\/(?:lu\.ma|(?:www\.)?luma\.com)\/\S+/i,
    []
  );
  const lumaFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLumaFetchedRef = useRef<string | null>(null);

  const fetchLumaImport = useCallback(async (url: string) => {
    setLumaStatus("fetching");
    setLumaError(null);
    try {
      const res = await fetch("/api/luma/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLumaStatus("error");
        setLumaError(body?.error ?? "Couldn't import that Luma event.");
        return;
      }
      setLumaImport({
        url: body.canonicalUrl ?? url,
        title: body.title ?? null,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
      });
      setLumaStatus("idle");
    } catch {
      setLumaStatus("error");
      setLumaError("Network error fetching Luma event.");
    }
  }, []);

  function handleTitleChange(value: string) {
    setTitle(value);

    // Reset any stale error/preview the moment the host starts editing
    // away from the detected URL so the UX doesn't feel frozen.
    if (lumaError) setLumaError(null);

    const match = value.match(lumaUrlRegex);
    if (!match) {
      // No URL in the field anymore → cancel any pending fetch so we
      // don't pop a preview for a URL the host already removed.
      if (lumaFetchRef.current) {
        clearTimeout(lumaFetchRef.current);
        lumaFetchRef.current = null;
      }
      lastLumaFetchedRef.current = null;
      return;
    }

    const url = match[0];
    // Don't re-fetch the same URL the host has already imported.
    if (url === lastLumaFetchedRef.current) return;
    if (lumaImport && lumaImport.url === url) return;

    if (lumaFetchRef.current) clearTimeout(lumaFetchRef.current);
    lumaFetchRef.current = setTimeout(() => {
      lastLumaFetchedRef.current = url;
      void fetchLumaImport(url);
    }, 450);
  }

  /** Applies the imported Luma data to the form fields. */
  function applyLumaImport() {
    if (!lumaImport) return;
    if (lumaImport.title) setTitle(lumaImport.title);
    if (lumaImport.description) setDescription(lumaImport.description);
    // Keep the preview card visible after apply so the host knows which
    // event it came from; clear via the X button if they change their mind.
  }

  /** Dismisses the preview card and resets detection so they can paste a new URL. */
  function clearLumaImport() {
    setLumaImport(null);
    setLumaStatus("idle");
    setLumaError(null);
    lastLumaFetchedRef.current = null;
  }

  // Debounced organizer name search
  const _searchOrganizers = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!query.trim() || !userId) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        const { data } = await supabase
          .from("events")
          .select("organizer_name, logo_url, logo_dark_url")
          .eq("created_by", userId)
          .not("organizer_name", "is", null)
          .ilike("organizer_name", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!data || data.length === 0) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        // Deduplicate by organizer_name (keep first = most recent)
        const seen = new Set<string>();
        const unique: OrganizerSuggestion[] = [];
        for (const row of data) {
          const name = row.organizer_name as string;
          if (!seen.has(name)) {
            seen.add(name);
            unique.push({
              organizer_name: name,
              logo_url: row.logo_url,
              logo_dark_url: row.logo_dark_url,
            });
          }
        }

        setSuggestions(unique);
        setShowSuggestions(unique.length > 0);
      }, 300);
    },
    [userId, supabase],
  );

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Logo: only PNG, JPG, SVG, or WebP allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2 MB.");
      return;
    }

    setError(null);
    setLogoFile(file);
    setLogoUrl(null);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleDarkLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Logo: only PNG, JPG, SVG, or WebP allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2 MB.");
      return;
    }

    setError(null);
    setLogoDarkFile(file);
    setLogoDarkUrl(null);
    setLogoDarkPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoUrl(null);
    if (logoPreview && !logoUrl) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    clearDarkLogo();
    setHasDarkLogo(false);
  }

  function clearDarkLogo() {
    setLogoDarkFile(null);
    setLogoDarkUrl(null);
    if (logoDarkPreview && !logoDarkUrl) URL.revokeObjectURL(logoDarkPreview);
    setLogoDarkPreview(null);
    if (darkFileInputRef.current) darkFileInputRef.current.value = "";
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCSV(text);
    const result = detectEmailColumn(rows);

    if (!result || result.emails.length === 0) {
      setError("No email column found in this file. Make sure it contains a column with email addresses.");
      if (csvInputRef.current) csvInputRef.current.value = "";
      return;
    }

    setError(null);
    // Deduplicate and lowercase
    const unique = [...new Set(result.emails.map((e) => e.toLowerCase()))];
    // Append to existing emails (don't overwrite manual entries)
    const existing = accessEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes("@"));
    const merged = [...new Set([...existing, ...unique])];
    setAccessEmails(merged.join("\n"));
    setCsvInfo({ fileName: file.name, columnName: result.columnName, count: unique.length });
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  function getEmailCount(): number {
    return accessEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@")).length;
  }

  async function copyRoundsAndQuestions(fromId: string, toEventId: string) {
    // Fetch rounds from source
    const { data: sourceRounds } = await supabase
      .from("rounds")
      .select("*")
      .eq("event_id", fromId)
      .order("sort_order", { ascending: true });

    if (!sourceRounds || sourceRounds.length === 0) return;

    for (const round of sourceRounds) {
      const { data: newRound } = await supabase
        .from("rounds")
        .insert({
          event_id: toEventId,
          round_type: round.round_type,
          title: round.title,
          sort_order: round.sort_order,
          time_limit_seconds: round.time_limit_seconds,
          base_points: round.base_points,
          time_bonus_enabled: round.time_bonus_enabled,
          wipeout_min_leverage: round.wipeout_min_leverage,
          wipeout_max_leverage: round.wipeout_max_leverage,
          interstitial_text: round.interstitial_text,
        })
        .select("id")
        .single();

      if (!newRound) continue;

      const { data: sourceQuestions } = await supabase
        .from("questions")
        .select("*")
        .eq("round_id", round.id)
        .order("sort_order", { ascending: true });

      if (!sourceQuestions || sourceQuestions.length === 0) continue;

      await supabase.from("questions").insert(
        sourceQuestions.map((q) => ({
          round_id: newRound.id,
          body: q.body,
          options: q.options,
          correct_answer: q.correct_answer,
          sort_order: q.sort_order,
          explanation: q.explanation,
        }))
      );
    }
  }

  function handleProjectQueryChange(q: string) {
    setProjectQuery(q);
    setProjectResults([]);
    if (q.trim() === "") {
      setProjectId(null);
      setProjectSelectedName(null);
    }
    if (projectDebounceRef.current) clearTimeout(projectDebounceRef.current);
    if (!q.trim()) return;
    projectDebounceRef.current = setTimeout(async () => {
      setProjectSearching(true);
      try {
        const res = await fetch("/api/rootdata/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q.trim() }),
        });
        const body = await res.json();
        setProjectResults(res.ok ? (body.results ?? []) : []);
      } catch {
        setProjectResults([]);
      } finally {
        setProjectSearching(false);
      }
    }, 400);
  }

  async function handleProjectSelect(result: { project_id: number; name: string; one_liner: string | null; logo: string | null }) {
    setProjectResults([]);
    setProjectQuery(result.name);
    setProjectSelectedName(result.name);

    // Auto-fill organizer identity from the linked project.
    setOrganizerName(result.name);
    // Inline organizer-field icon → RootData favicon (small, round, fine).
    // This is intentionally separate from the Organizer / Host Logo upload
    // section below, which only takes a full website brand logo.
    setInlineOrganizerLogo(result.logo);
    // Clear any stale upload-section preview (e.g. carried over from
    // a duplicated event) so it doesn't sit alongside a freshly selected
    // project. The site-logo upgrade below will repopulate it if it
    // finds a real brand mark; otherwise the host uploads manually.
    if (!logoFile) {
      setLogoPreview(null);
      setLogoUrl(null);
    }

    try {
      const res = await fetch("/api/rootdata/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootdata_id: String(result.project_id) }),
      });
      const body = await res.json();
      if (res.ok && body.project?.id) {
        setProjectId(body.project.id);
      }
      // Prefer the cached logo_url for the inline icon if it differs from
      // the search-result thumbnail (sometimes higher-res but still round).
      if (res.ok && body.project?.logo_url) {
        setInlineOrganizerLogo(body.project.logo_url);
      }

      // Background-fetch the FULL brand logo from the project's marketing
      // site for the Organizer / Host Logo upload preview. RootData only
      // ships round favicons, which look wrong at large sizes — the site's
      // own header logo is the right asset for share cards, leaderboards,
      // and the upload preview. If no full logo is found, the upload field
      // stays empty so the host can drop in their own.
      const websiteUrl = body.project?.website;
      if (res.ok && typeof websiteUrl === "string" && websiteUrl.trim()) {
        upgradeLogoFromSite(websiteUrl.trim());
      }
    } catch {
      // Non-fatal — project_id stays null, event still creates fine
    }
  }

  /**
   * Fire-and-forget logo upgrade from a project's marketing website.
   * Bails if the host has staged a custom upload, or if a different
   * project has been selected by the time the response lands.
   */
  function upgradeLogoFromSite(websiteUrl: string) {
    // Capture the project name we're upgrading FOR — if the host
    // switches projects mid-flight, the response is stale and we
    // discard it instead of stomping the new selection.
    const upgradeFor = projectSelectedNameRef.current;
    fetch("/api/projects/site-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: websiteUrl }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.logoUrl) return;
        if (logoFileRef.current) return; // host uploaded their own
        if (projectSelectedNameRef.current !== upgradeFor) return; // selection changed
        setLogoPreview(data.logoUrl);
        setLogoUrl(data.logoUrl);
      })
      .catch(() => {
        // Silent fallback — RootData logo stays in place.
      });
  }

  async function uploadLogos(eventId: string) {
    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `event-logos/${eventId}/logo.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from("sponsor-logos")
        .upload(path, logoFile, { upsert: true });

      if (!storageErr) {
        const { data: urlData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);
        const logoUpdate: Record<string, string> = { logo_url: urlData.publicUrl };

        if (logoDarkFile) {
          const darkExt = logoDarkFile.name.split(".").pop();
          const darkPath = `event-logos/${eventId}/logo-dark.${darkExt}`;
          const { error: darkErr } = await supabase.storage
            .from("sponsor-logos")
            .upload(darkPath, logoDarkFile, { upsert: true });
          if (!darkErr) {
            const { data: darkUrlData } = supabase.storage.from("sponsor-logos").getPublicUrl(darkPath);
            logoUpdate.logo_dark_url = darkUrlData.publicUrl;
          }
        }

        await supabase.from("events").update(logoUpdate).eq("id", eventId);
      }
    } else if (editEvent) {
      // Edit mode: explicitly set logos (including null for removals)
      const logoUpdate: Record<string, string | null> = {
        logo_url: logoUrl,
        logo_dark_url: logoDarkUrl,
      };
      await supabase.from("events").update(logoUpdate).eq("id", eventId);
    } else {
      // Create mode: only write truthy URLs
      const logoUpdate: Record<string, string> = {};
      if (logoUrl) logoUpdate.logo_url = logoUrl;
      if (logoDarkUrl) logoUpdate.logo_dark_url = logoDarkUrl;
      if (Object.keys(logoUpdate).length > 0) {
        await supabase.from("events").update(logoUpdate).eq("id", eventId);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const submittedOrganizerName = organizerName.trim() || null;

    if (!userId) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Validate: whitelist/blacklist requires at least one email
    if (accessMode !== "open" && getEmailCount() === 0) {
      setError(`Add at least one email to the ${accessMode === "whitelist" ? "invite" : "block"} list.`);
      setLoading(false);
      return;
    }

    // Validate scheduled-for-later mode
    // In edit mode, preserve the original scheduled_at (controls are hidden)
    let scheduledAtIso: string | null = editEvent?.scheduled_at ?? null;
    if (!editEvent && startMode === "schedule") {
      if (!scheduledAt) {
        setError("Pick a date and time for your event.");
        setLoading(false);
        return;
      }
      const scheduled = new Date(scheduledAt);
      if (scheduled.getTime() <= Date.now()) {
        setError("Scheduled time must be in the future.");
        setLoading(false);
        return;
      }
      scheduledAtIso = scheduled.toISOString();
    }

    // Import provenance — captured at submit time so the super-admin
    // analytics dashboard can answer "how many events came from Luma vs
    // were hand-typed". An active Luma import wins over carried-over
    // provenance from a duplicated event (host can repaste a new link).
    const sourceProvider: string =
      lumaImport
        ? "luma"
        : carriedProvenance?.sourceProvider ?? "manual";
    const sourceUrl = lumaImport?.url ?? carriedProvenance?.sourceUrl ?? null;
    const coverImageUrl =
      lumaImport?.imageUrl ?? carriedProvenance?.coverImageUrl ?? null;

    // ── Edit mode: update existing event ────────────────────────────
    if (editEvent) {
      const { error: updateError } = await supabase
        .from("events")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          prizes: prizes.trim() || null,
          organizer_name: submittedOrganizerName,
          format,
          access_mode: accessMode,
          source_provider: sourceProvider,
          source_url: sourceUrl,
          cover_image_url: coverImageUrl,
          ...(projectId ? { project_id: projectId } : {}),
          scheduled_at: scheduledAtIso,
        })
        .eq("id", editEvent.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      // Upload / update logos
      await uploadLogos(editEvent.id);

      // Update access list (replace)
      if (accessMode !== "open" && accessEmails.trim()) {
        await supabase.from("event_access_list").delete().eq("event_id", editEvent.id);
        const emails = accessEmails
          .split(/[\n,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e && e.includes("@"));
        if (emails.length > 0) {
          const unique = [...new Set(emails)];
          await supabase.from("event_access_list").insert(
            unique.map((email) => ({ event_id: editEvent.id, email }))
          );
        }
      }

      router.push(`/host/events/${editEvent.id}/questions`);
      return;
    }

    // ── Create mode: insert new event ────────────────────────────────
    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        prizes: prizes.trim() || null,
        organizer_name: submittedOrganizerName,
        format,
        access_mode: accessMode,
        created_by: userId,
        source_provider: sourceProvider,
        source_url: sourceUrl,
        cover_image_url: coverImageUrl,
        ...(projectId ? { project_id: projectId } : {}),
        ...(scheduledAtIso ? { scheduled_at: scheduledAtIso } : {}),
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Upload logos
    await uploadLogos(data.id);

    // Insert access list emails for whitelist or blacklist
    if (accessMode !== "open" && accessEmails.trim() && data) {
      const emails = accessEmails
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e.includes("@"));

      if (emails.length > 0) {
        // Deduplicate
        const unique = [...new Set(emails)];
        const rows = unique.map((email) => ({
          event_id: data.id,
          email,
        }));
        await supabase.from("event_access_list").insert(rows);
      }
    }

    // Copy rounds + questions from source event if duplicating
    if (fromEventId && data) {
      await copyRoundsAndQuestions(fromEventId, data.id);
    }

    // Scheduled events land on the share page so the host can distribute the
    // pre-registration link immediately. "Start now" jumps straight into the
    // question builder as before.
    if (startMode === "schedule") {
      router.push(`/host/events/${data.id}/share`);
    } else {
      router.push(`/host/events/${data.id}/questions`);
    }
  }

  const emailCount = getEmailCount();
  const needsEmailList = accessMode === "whitelist" || accessMode === "blacklist";
  const listLabel = accessMode === "whitelist" ? "Approved Emails" : "Blocked Emails";
  const listPlaceholder = accessMode === "whitelist"
    ? "alice@company.com\nbob@company.com\ncharlie@company.com"
    : "bot1@spam.com\ncheater@fake.com";
  const listHint = accessMode === "whitelist"
    ? "Only these players can join."
    : "These players will be blocked from joining.";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Start mode picker — hidden in edit mode */}
      {!editEvent && (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStartMode("now")}
            className={`text-left border-2 px-4 py-4 transition-colors ${
              startMode === "now"
                ? "border-primary bg-primary/5"
                : "border-border bg-surface hover:border-primary/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <svg className="size-4 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              <span className="font-heading font-semibold text-foreground">
                Start now
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Jump straight to the question builder
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStartMode("schedule")}
            className={`text-left border-2 px-4 py-4 transition-colors ${
              startMode === "schedule"
                ? "border-primary bg-primary/5"
                : "border-border bg-surface hover:border-primary/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <svg className="size-4 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="font-heading font-semibold text-foreground">
                Schedule for later
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Share a pre-registration link before game day
            </p>
          </button>
        </div>

        {startMode === "schedule" && (
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              When does it start?
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
              required
              className="w-full sm:w-auto h-9 bg-background border border-border px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Local time. We&rsquo;ll land you on the share page so you can
              send out the pre-reg link.
            </p>
          </div>
        )}
      </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Name
        </label>
        <div className="relative">
          <input
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full h-11 bg-surface border border-border px-4 pr-28 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
            placeholder="Type your event name or paste a Luma link (https://lu.ma/…)"
          />
          {lumaStatus === "fetching" && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              Fetching Luma…
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Keep it under 60 characters for clean display on leaderboards and share cards.
        </p>

        {lumaError && (
          <p className="text-[11px] text-destructive">{lumaError}</p>
        )}

        {lumaImport && (
          <div className="mt-2 border border-primary/30 bg-primary/5 p-3 flex gap-3 items-start">
            {lumaImport.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lumaImport.imageUrl}
                alt=""
                className="w-16 h-16 object-cover flex-shrink-0 border border-border"
              />
            ) : (
              <div className="w-16 h-16 bg-background border border-border flex items-center justify-center text-muted-foreground text-[10px] flex-shrink-0">
                Luma
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Imported from Luma
                </p>
                <button
                  type="button"
                  onClick={clearLumaImport}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Dismiss Luma import"
                >
                  ✕
                </button>
              </div>
              {lumaImport.title && (
                <p className="text-sm font-medium truncate">{lumaImport.title}</p>
              )}
              {lumaImport.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {lumaImport.description}
                </p>
              )}
              <div className="pt-1 flex gap-3">
                <button
                  type="button"
                  onClick={applyLumaImport}
                  className="text-xs font-medium text-primary hover:underline underline-offset-2"
                >
                  Use these details →
                </button>
                <a
                  href={lumaImport.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  View on Luma
                </a>
              </div>
            </div>
          </div>
        )}
      </div>


      {/*
        Unified Organizer field.

        Acts as both a free-text input (events.organizer_name at submit)
        AND a RootData project search. Typing fires a debounced search
        and shows a dropdown of matching projects; picking one auto-fills
        the value AND links the project (setting projectId + logo). If
        the host doesn't pick anything, the typed text becomes the
        organizer name verbatim at submit time — perfect for small
        communities / personal events that aren't on RootData.
      */}
      <div className="space-y-1.5 relative">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Organizer <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <div className="relative">
          {inlineOrganizerLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inlineOrganizerLogo}
              alt={organizerName || "Project logo"}
              className="absolute left-3 top-1/2 -translate-y-1/2 size-6 object-contain rounded pointer-events-none"
            />
          )}
          <input
            type="text"
            name="organizer_name"
            value={organizerName}
            onChange={(e) => {
              const v = e.target.value;
              setOrganizerName(v);
              // Editing the field invalidates any previously linked
              // project. Clear its ID, the inline RootData icon, and the
              // auto-filled upload logo (unless the host already uploaded
              // their own file, which we always respect).
              if (projectId || inlineOrganizerLogo) {
                setProjectId(null);
                setProjectSelectedName(null);
                setInlineOrganizerLogo(null);
                if (!logoFile) {
                  setLogoPreview(null);
                  setLogoUrl(null);
                }
              }
              handleProjectQueryChange(v);
            }}
            onBlur={() => {
              // Hide the dropdown on blur, but let mousedown on an item
              // fire first (preventDefault on the result button below).
              setTimeout(() => setProjectResults([]), 100);
            }}
            placeholder="Search RootData or type a name (e.g. Uniswap, your community)"
            autoComplete="off"
            maxLength={60}
            className={`w-full h-11 bg-surface border border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors pr-24 ${
              inlineOrganizerLogo ? "pl-11" : "px-4"
            }`}
          />
          {projectSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Searching…
            </span>
          )}
          {(projectId || inlineOrganizerLogo) && !projectSearching && (
            <button
              type="button"
              onClick={() => {
                setProjectId(null);
                setProjectSelectedName(null);
                setProjectQuery("");
                setProjectResults([]);
                setOrganizerName("");
                setInlineOrganizerLogo(null);
                if (!logoFile) {
                  setLogoPreview(null);
                  setLogoUrl(null);
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {projectResults.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 border border-border bg-surface max-h-48 overflow-y-auto">
            {projectResults.slice(0, 6).map((r) => (
              <button
                key={r.project_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleProjectSelect(r)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/5 transition-colors text-left"
              >
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt="" className="size-5 object-contain shrink-0 rounded" />
                ) : (
                  <span className="size-5 shrink-0 rounded bg-muted/40" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  {r.one_liner && (
                    <p className="truncate text-xs text-muted-foreground">{r.one_liner}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Pick a project to auto-fill the logo and tag cross-event analytics, or type any name for personal / community events.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Description <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-surface border border-border px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
          placeholder="Brief description of the event"
        />
      </div>

      {/* More options toggle */}
      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group w-full"
      >
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5 shrink-0 font-medium">
          {showMore ? "Less options" : "More options"}
          <svg
            className={`size-3.5 transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
        <div className="h-px flex-1 bg-border" />
      </button>

      {showMore && (
      <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Prizes <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <textarea
          name="prizes"
          rows={2}
          maxLength={300}
          value={prizes}
          onChange={(e) => setPrizes(e.target.value)}
          className="w-full bg-surface border border-border px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
          placeholder="e.g. 500 USDC to top 3, merch for top 10%, whitelist spots"
        />
        <p className="text-[11px] text-muted-foreground">
          Shown to players before they join. Sets expectations for rewards.
        </p>
      </div>

      {/* Event format selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Format
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={`flex flex-col items-center gap-1 py-3.5 px-2 border text-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <span className={`font-heading font-bold text-sm ${selected ? "text-primary" : ""}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] leading-tight">{opt.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Organizer / Host logo upload — auto-populated from the linked
          RootData project when available; hosts can always replace it
          with a custom file for a specific event branding. */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Organizer / Host Logo <span className="text-muted-foreground/50">(optional)</span>
        </label>

        {logoPreview ? (
          <div className="space-y-3">
            {/* Light / Dark preview */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-border bg-[#faf9f7] p-5 flex flex-col items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">Light Mode</p>
                <Image
                  src={logoPreview}
                  alt="Logo on light"
                  width={160}
                  height={40}
                  unoptimized
                  className="h-10 w-auto max-w-[160px] object-contain"
                />
              </div>
              <div className="border border-border bg-[#09090b] p-5 flex flex-col items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Dark Mode</p>
                {hasDarkLogo && logoDarkPreview ? (
                  <Image
                    src={logoDarkPreview}
                    alt="Logo on dark"
                    width={160}
                    height={40}
                    unoptimized
                    className="h-10 w-auto max-w-[160px] object-contain"
                  />
                ) : (
                  <Image
                    src={logoPreview}
                    alt="Logo on dark"
                    width={160}
                    height={40}
                    unoptimized
                    className="h-10 w-auto max-w-[160px] object-contain"
                  />
                )}
              </div>
            </div>

            {/* File info + actions */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground truncate">{logoFile?.name ?? (logoUrl ? "From previous event" : "")}</span>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={clearLogo}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Dark variant toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDarkLogo}
                onChange={(e) => {
                  setHasDarkLogo(e.target.checked);
                  if (!e.target.checked) clearDarkLogo();
                }}
                className="size-3.5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
              <span className="text-xs text-muted-foreground">I have a separate dark mode version</span>
            </label>

            {/* Dark logo upload (when checkbox is on) */}
            {hasDarkLogo && (
              <div className="pl-5">
                {logoDarkPreview ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground truncate">{logoDarkFile?.name ?? (logoDarkUrl ? "From previous event" : "")}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => darkFileInputRef.current?.click()}
                        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={clearDarkLogo}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => darkFileInputRef.current?.click()}
                    className="w-full border border-dashed border-border hover:border-primary/50 transition-colors py-3 flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground text-xs"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Upload dark mode logo
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border hover:border-primary/50 transition-colors py-5 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-medium">Upload logo</span>
            <span className="text-[11px]">PNG, JPG, SVG, WebP · max 2 MB · 200×60px recommended</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleLogoSelect}
        />
        <input
          ref={darkFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleDarkLogoSelect}
        />
        <p className="text-[11px] text-muted-foreground">
          Preview shows how your logo looks on both themes. Use the checkbox to upload separate light and dark versions.
        </p>
      </div>

      {/* Access control */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Access Control
        </label>
        <div className="grid grid-cols-3 gap-2">
          {ACCESS_OPTIONS.map((opt) => {
            const selected = accessMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAccessMode(opt.value)}
                className={`flex flex-col items-center gap-1 py-3.5 px-2 border text-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <span className={`font-heading font-bold text-sm ${selected ? "text-primary" : ""}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] leading-tight">{opt.description}</span>
              </button>
            );
          })}
        </div>

        {needsEmailList && (
          <div className="space-y-3">
            {/* CSV upload */}
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border hover:border-primary/50 transition-colors py-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-medium">Upload CSV</span>
              <span className="text-[11px]">Works with Luma, Eventbrite, or any CSV with an email column</span>
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={handleCSVUpload}
            />

            {csvInfo && (
              <div className="flex items-center gap-2 bg-correct/10 border border-correct/20 px-3 py-2">
                <svg className="size-4 text-correct shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xs text-foreground">
                  <span className="font-medium">{csvInfo.count} emails</span> imported from <span className="font-mono">{csvInfo.fileName}</span>
                  {csvInfo.columnName !== `Column 1` && (
                    <span className="text-muted-foreground"> (column: {csvInfo.columnName})</span>
                  )}
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-[10px] text-muted-foreground uppercase tracking-widest">
                  or paste manually
                </span>
              </div>
            </div>

            {/* Email textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {listLabel}
              </label>
              <textarea
                value={accessEmails}
                onChange={(e) => { setAccessEmails(e.target.value); setCsvInfo(null); }}
                rows={5}
                className="w-full bg-surface border border-border px-4 py-3 text-foreground text-sm font-mono placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
                placeholder={listPlaceholder}
              />
              <p className="text-[11px] text-muted-foreground">
                One email per line, or comma/semicolon-separated. {listHint}
                {emailCount > 0 && (
                  <span className="text-foreground font-medium">
                    {" "}({emailCount} email{emailCount !== 1 ? "s" : ""})
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading}
          className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
        >
          {loading
            ? editEvent
              ? "Saving..."
              : fromEventId
              ? "Duplicating..."
              : "Creating..."
            : editEvent
            ? "Save Changes"
            : fromEventId
            ? "Duplicate Event"
            : startMode === "schedule"
            ? "Schedule Event"
            : "Create Event"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-6"
          onClick={() => window.history.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
