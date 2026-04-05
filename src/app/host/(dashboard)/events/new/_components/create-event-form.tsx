"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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

export function CreateEventForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<EventFormat>("hybrid");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [hasDarkLogo, setHasDarkLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const darkFileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showMore, setShowMore] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("open");
  const [accessEmails, setAccessEmails] = useState("");
  const [csvInfo, setCsvInfo] = useState<{ fileName: string; columnName: string; count: number } | null>(null);

  // Organizer typeahead state
  const [organizerName, setOrganizerName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OrganizerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Fetch authenticated user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, [supabase]);

  // Debounced organizer name search
  const searchOrganizers = useCallback(
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

  function handleOrganizerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setOrganizerName(value);
    searchOrganizers(value);
  }

  function handleSelectSuggestion(suggestion: OrganizerSuggestion) {
    setOrganizerName(suggestion.organizer_name);

    if (suggestion.logo_url) {
      setLogoPreview(suggestion.logo_url);
      setLogoUrl(suggestion.logo_url);
      setLogoFile(null);
    }

    if (suggestion.logo_dark_url) {
      setLogoDarkPreview(suggestion.logo_dark_url);
      setLogoDarkUrl(suggestion.logo_dark_url);
      setLogoDarkFile(null);
      setHasDarkLogo(true);
    }

    if (suggestion.logo_url || suggestion.logo_dark_url) {
      setShowMore(true);
    }

    setShowSuggestions(false);
    setSuggestions([]);
  }

  function handleOrganizerBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }

  function handleOrganizerFocus() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (suggestions.length > 0) setShowSuggestions(true);
  }

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const prizes = (form.get("prizes") as string)?.trim() || null;
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

    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        title,
        description: description || null,
        prizes,
        organizer_name: submittedOrganizerName,
        format,
        access_mode: accessMode,
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Upload logo(s) after event creation (need event ID for storage path)
    if (logoFile && data) {
      const ext = logoFile.name.split(".").pop();
      const path = `event-logos/${data.id}/logo.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("sponsor-logos")
        .upload(path, logoFile, { upsert: true });

      if (!storageErr) {
        const { data: urlData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);
        const logoUpdate: Record<string, string> = { logo_url: urlData.publicUrl };

        // Upload dark variant if provided
        if (logoDarkFile) {
          const darkExt = logoDarkFile.name.split(".").pop();
          const darkPath = `event-logos/${data.id}/logo-dark.${darkExt}`;
          const { error: darkErr } = await supabase.storage
            .from("sponsor-logos")
            .upload(darkPath, logoDarkFile, { upsert: true });

          if (!darkErr) {
            const { data: darkUrlData } = supabase.storage.from("sponsor-logos").getPublicUrl(darkPath);
            logoUpdate.logo_dark_url = darkUrlData.publicUrl;
          }
        }

        await supabase
          .from("events")
          .update(logoUpdate)
          .eq("id", data.id);
      }
    } else if (data) {
      // Handle URL-based logos (from organizer suggestion, no file upload)
      const logoUpdate: Record<string, string> = {};
      if (logoUrl) logoUpdate.logo_url = logoUrl;
      if (logoDarkUrl) logoUpdate.logo_dark_url = logoDarkUrl;
      if (Object.keys(logoUpdate).length > 0) {
        await supabase.from("events").update(logoUpdate).eq("id", data.id);
      }
    }

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

    router.push(`/host/events/${data.id}/questions`);
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
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Name
        </label>
        <input
          name="title"
          required
          maxLength={100}
          className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
          placeholder="e.g. ETH Denver 2026 - Main Stage Trivia"
        />
        <p className="text-[11px] text-muted-foreground">
          Keep it under 60 characters for clean display on leaderboards and share cards.
        </p>
      </div>

      <div className="space-y-1.5 relative">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Organizer Name <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <input
          name="organizer_name"
          value={organizerName}
          onChange={handleOrganizerChange}
          onBlur={handleOrganizerBlur}
          onFocus={handleOrganizerFocus}
          maxLength={60}
          autoComplete="off"
          className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
          placeholder="e.g. Uniswap, Aave, your project name"
        />

        {/* Organizer suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 border border-border bg-surface max-h-48 overflow-y-auto shadow-sm">
            {suggestions.map((s) => (
              <button
                key={s.organizer_name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(s)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/5 transition-colors text-left"
              >
                {s.logo_url ? (
                  <img
                    src={s.logo_url}
                    alt=""
                    className="size-5 object-contain shrink-0"
                  />
                ) : (
                  <div className="size-5 bg-muted/30 shrink-0 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {s.organizer_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="truncate">{s.organizer_name}</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Shown on the public results page. Defaults to your profile name if left blank.
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

      {/* Event logo upload */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Logo <span className="text-muted-foreground/50">(optional)</span>
        </label>

        {logoPreview ? (
          <div className="space-y-3">
            {/* Light / Dark preview */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-border bg-[#faf9f7] p-5 flex flex-col items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">Light Mode</p>
                <img
                  src={logoPreview}
                  alt="Logo on light"
                  className="h-10 max-w-[160px] object-contain"
                />
              </div>
              <div className="border border-border bg-[#09090b] p-5 flex flex-col items-center gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Dark Mode</p>
                {hasDarkLogo && logoDarkPreview ? (
                  <img
                    src={logoDarkPreview}
                    alt="Logo on dark"
                    className="h-10 max-w-[160px] object-contain"
                  />
                ) : (
                  <img
                    src={logoPreview}
                    alt="Logo on dark"
                    className="h-10 max-w-[160px] object-contain"
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
          {loading ? "Creating..." : "Create Event"}
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
