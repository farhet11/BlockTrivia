"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { Round, Question } from "./question-builder";
import type {
  MindScanCount,
  MindScanDifficulty,
  MindScanQuestion,
} from "@/lib/mindscan/types";

/**
 * MindScan Layer 1a modal.
 *
 * Mirrors JsonImportModal's round-targeting + insert flow. Host pastes content,
 * picks count/difficulty/target round, clicks Generate, reviews the returned
 * questions (read-only preview cards with checkboxes), and imports the selected
 * ones into the target round via the same `questions` insert path as JSON
 * import.
 *
 * No inline editing — host edits imported questions in the existing
 * question-row.tsx after the modal closes.
 */

const COUNT_OPTIONS: MindScanCount[] = [5, 10, 15];
const DIFFICULTY_OPTIONS: Array<{ value: MindScanDifficulty; label: string }> =
  [
    { value: "easy", label: "Easy" },
    { value: "medium", label: "Medium" },
    { value: "hard", label: "Hard" },
  ];

export function MindScanModal({
  rounds,
  onImported,
  onClose,
}: {
  rounds: Round[];
  onImported: (questions: Question[]) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [content, setContent] = useState("");
  const [count, setCount] = useState<MindScanCount>(5);
  const [difficulty, setDifficulty] = useState<MindScanDifficulty>("medium");
  const [targetRoundId, setTargetRoundId] = useState(rounds[0]?.id ?? "");

  const [stage, setStage] = useState<"input" | "review">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layer 1b: input source tabs
  const [activeTab, setActiveTab] = useState<"paste" | "url" | "audio">(
    "paste"
  );
  const [fetchUrl, setFetchUrl] = useState("");
  const [fetchState, setFetchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribeState, setTranscribeState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [showFullPreview, setShowFullPreview] = useState(false);

  const [generated, setGenerated] = useState<MindScanQuestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectedCount = selected.size;
  const allSelected =
    generated.length > 0 && selectedCount === generated.length;

  async function handleFetchUrl() {
    setError(null);
    if (!fetchUrl.trim()) {
      setError("Enter a URL to fetch.");
      return;
    }
    setFetchState("loading");
    try {
      const res = await fetch("/api/mindscan/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fetchUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not fetch that URL.");
        setFetchState("error");
        return;
      }
      setContent(data.content);
      setFetchState("done");
      setShowFullPreview(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setFetchState("error");
    }
  }

  async function handleTranscribe(file: File) {
    setError(null);
    setAudioFile(file);
    setTranscribeState("loading");
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const res = await fetch("/api/mindscan/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not transcribe that file.");
        setTranscribeState("error");
        return;
      }
      setContent(data.content);
      setTranscribeState("done");
      setShowFullPreview(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setTranscribeState("error");
    }
  }

  function switchTab(tab: "paste" | "url" | "audio") {
    setActiveTab(tab);
    setError(null);
  }

  async function handleGenerate() {
    setError(null);
    if (content.trim().length < 50) {
      setError("Paste at least 50 characters of content.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/mindscan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, count, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      const questions = (data.questions ?? []) as MindScanQuestion[];
      if (questions.length === 0) {
        setError("No valid questions came back. Try regenerating.");
        return;
      }
      setGenerated(questions);
      setSelected(new Set(questions.map((_, i) => i)));
      setStage("review");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(generated.map((_, i) => i)));
    }
  }

  async function handleImport() {
    setError(null);

    if (!targetRoundId) {
      setError("Create a round first before importing.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one question to import.");
      return;
    }

    setLoading(true);
    try {
      // Find next sort_order for the target round.
      const { data: existing } = await supabase
        .from("questions")
        .select("sort_order")
        .eq("round_id", targetRoundId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const startOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

      const targetRound = rounds.find((r) => r.id === targetRoundId);
      const isTrueFalse = targetRound?.round_type === "true_false";

      // MindScan generates 4-option MCQs. If the host picked a true_false
      // round, fall back to ["True","False"] like the JSON importer does —
      // but the 0/1 correct_answer mapping here is lossy, so we just drop
      // into the first two options. In practice the host should import
      // into an mcq or wipeout round.
      const picks = [...selected].sort((a, b) => a - b).map((i) => generated[i]);

      const rows = picks.map((q, i) => ({
        round_id: targetRoundId,
        body: q.body,
        options: isTrueFalse ? ["True", "False"] : q.options,
        correct_answer: isTrueFalse
          ? Math.min(q.correct_answer, 1)
          : q.correct_answer,
        explanation: q.explanation ?? null,
        sort_order: startOrder + i,
      }));

      const { data, error: insertError } = await supabase
        .from("questions")
        .insert(rows)
        .select();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      if (data && data.length > 0) {
        onImported(data as Question[]);
      } else {
        // Insert succeeded but select-back returned nothing (RLS or DB issue).
        setError("Questions saved but could not be loaded back. Refresh the page to see them.");
        return;
      }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const targetIsTrueFalse =
    rounds.find((r) => r.id === targetRoundId)?.round_type === "true_false";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-surface border border-border w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              Generate questions
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste your whitepaper, blog post, FAQ, or docs. We&rsquo;ll turn it
              into quiz questions that test understanding.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {stage === "input" && (
          <>
            {/* Tab switcher */}
            <div className="flex gap-1 border-b border-border">
              {(
                [
                  {
                    id: "paste" as const,
                    label: "Paste",
                    icon: (
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    ),
                  },
                  {
                    id: "url" as const,
                    label: "URL",
                    icon: (
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    ),
                  },
                  {
                    id: "audio" as const,
                    label: "Audio",
                    icon: (
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    ),
                  },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === t.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Paste tab */}
            {activeTab === "paste" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Paste content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setError(null);
                  }}
                  rows={10}
                  className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Paste a whitepaper section, blog post, FAQ, or docs page here..."
                />
                <p className="text-xs text-muted-foreground">
                  {content.length.toLocaleString()} / 30,000 characters
                </p>
              </div>
            )}

            {/* URL tab */}
            {activeTab === "url" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Article URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={fetchUrl}
                      onChange={(e) => {
                        setFetchUrl(e.target.value);
                        setError(null);
                      }}
                      placeholder="https://mirror.xyz/..."
                      className="flex-1 h-9 bg-background border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button
                      onClick={handleFetchUrl}
                      disabled={
                        fetchState === "loading" || !fetchUrl.trim()
                      }
                      variant="outline"
                    >
                      {fetchState === "loading" ? "Fetching..." : "Fetch"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Works with whitepapers, blog posts, FAQs, docs. Max 500 KB.
                  </p>
                </div>

                {fetchState === "done" && content && (
                  <ContentPreview
                    content={content}
                    showFull={showFullPreview}
                    onToggleFull={() => setShowFullPreview((v) => !v)}
                    onContentChange={(v) => setContent(v)}
                  />
                )}
              </div>
            )}

            {/* Audio tab */}
            {activeTab === "audio" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Audio file
                  </label>
                  <label
                    className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-8 cursor-pointer transition-colors ${
                      transcribeState === "loading"
                        ? "border-primary bg-primary/5 cursor-wait"
                        : "border-border hover:border-primary hover:bg-accent"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".mp3,.wav,.m4a,audio/*"
                      disabled={transcribeState === "loading"}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleTranscribe(f);
                      }}
                    />
                    {transcribeState === "loading" ? (
                      <>
                        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">
                          Transcribing {audioFile?.name}...
                        </p>
                      </>
                    ) : (
                      <>
                        <svg
                          className="size-8 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v12m-4-4l4 4 4-4M4 20h16"
                          />
                        </svg>
                        <p className="text-sm text-foreground font-medium">
                          {audioFile ? audioFile.name : "Click to upload"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          MP3, WAV, M4A — max 25 MB
                        </p>
                      </>
                    )}
                  </label>
                  <p className="text-xs text-muted-foreground italic flex items-start gap-1.5">
                    <svg className="size-3.5 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recording a Twitter Space? Enable recording before you start, then download from your profile after it ends.
                  </p>
                </div>

                {transcribeState === "done" && content && (
                  <ContentPreview
                    content={content}
                    showFull={showFullPreview}
                    onToggleFull={() => setShowFullPreview((v) => !v)}
                    onContentChange={(v) => setContent(v)}
                  />
                )}
              </div>
            )}

            {/* Settings row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  How many
                </label>
                <select
                  value={count}
                  onChange={(e) =>
                    setCount(Number(e.target.value) as MindScanCount)
                  }
                  className="w-full h-9 bg-surface border border-border px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  {COUNT_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c} questions
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as MindScanDifficulty)
                  }
                  className="w-full h-9 bg-surface border border-border px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Import into
                </label>
                <select
                  value={targetRoundId}
                  onChange={(e) => setTargetRoundId(e.target.value)}
                  disabled={rounds.length === 0}
                  className="w-full h-9 bg-surface border border-border px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {rounds.length === 0 ? (
                    <option value="">No rounds yet</option>
                  ) : (
                    rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title || "Untitled Round"} ({r.round_type})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {targetIsTrueFalse && (
              <p className="text-xs text-muted-foreground italic">
                Note: importing MCQ output into a True/False round will collapse
                options to True/False only. Use an MCQ or WipeOut round for
                best results.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !content.trim() || rounds.length === 0}
                className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
              >
                {loading ? "Generating..." : "Generate"}
              </Button>
            </div>
          </>
        )}

        {stage === "review" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {generated.length} questions generated · {selectedCount} selected
              </p>
              <button
                onClick={toggleSelectAll}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="space-y-3">
              {generated.map((q, i) => (
                <PreviewCard
                  key={i}
                  question={q}
                  selected={selected.has(i)}
                  onToggle={() => toggleSelect(i)}
                />
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStage("input");
                  setGenerated([]);
                  setSelected(new Set());
                }}
              >
                ← Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={loading || selectedCount === 0}
                className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
              >
                {loading
                  ? "Importing..."
                  : `Import ${selectedCount} to round`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContentPreview({
  content,
  showFull,
  onToggleFull,
  onContentChange,
}: {
  content: string;
  showFull: boolean;
  onToggleFull: () => void;
  onContentChange: (v: string) => void;
}) {
  return (
    <div className="border border-green-500/30 bg-green-500/5 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <span className="text-green-500">✓</span>
          Content ready — {content.length.toLocaleString()} chars
        </p>
        <button
          type="button"
          onClick={onToggleFull}
          className="text-xs font-medium text-primary hover:text-primary/80"
        >
          {showFull ? "Collapse" : "Edit"}
        </button>
      </div>
      {showFull ? (
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          rows={8}
          className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      ) : (
        <p className="text-xs text-muted-foreground line-clamp-3">
          {content.slice(0, 200)}
          {content.length > 200 ? "..." : ""}
        </p>
      )}
    </div>
  );
}

function PreviewCard({
  question,
  selected,
  onToggle,
}: {
  question: MindScanQuestion;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`border px-4 py-3 cursor-pointer transition-colors ${
        selected
          ? "border-primary bg-accent-light"
          : "border-border bg-background hover:bg-accent"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 size-4 rounded-sm border-2 flex items-center justify-center shrink-0 ${
            selected ? "border-primary bg-primary" : "border-border"
          }`}
        >
          {selected && (
            <svg
              className="size-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground leading-snug">
            {question.body}
          </p>
          <ul className="space-y-1">
            {question.options.map((opt, i) => (
              <li
                key={i}
                className={`text-xs flex items-start gap-2 ${
                  i === question.correct_answer
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                <span className="shrink-0">
                  {i === question.correct_answer ? "✓" : "·"}
                </span>
                <span>{opt}</span>
              </li>
            ))}
          </ul>
          {question.explanation && (
            <p className="text-xs text-muted-foreground italic pt-1 border-t border-border">
              {question.explanation}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
