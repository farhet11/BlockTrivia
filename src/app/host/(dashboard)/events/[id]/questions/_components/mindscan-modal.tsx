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
  const [count, setCount] = useState<MindScanCount>(10);
  const [difficulty, setDifficulty] = useState<MindScanDifficulty>("medium");
  const [targetRoundId, setTargetRoundId] = useState(rounds[0]?.id ?? "");

  const [stage, setStage] = useState<"input" | "review">("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generated, setGenerated] = useState<MindScanQuestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectedCount = selected.size;
  const allSelected =
    generated.length > 0 && selectedCount === generated.length;

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

      if (data) onImported(data as Question[]);
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
              Generate questions ✨
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
            {/* Content textarea */}
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
