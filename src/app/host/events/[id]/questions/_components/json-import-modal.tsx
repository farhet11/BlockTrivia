"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { Round, Question } from "./question-builder";

/**
 * Expected JSON format (output of Custom GPT pipeline):
 * [
 *   {
 *     "body": "What is Ethereum?",
 *     "options": ["A blockchain", "A token", "A wallet", "An exchange"],
 *     "correct_answer": 0
 *   }
 * ]
 */

export function JsonImportModal({
  rounds,
  onImported,
  onClose,
}: {
  rounds: Round[];
  onImported: (questions: Question[]) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [json, setJson] = useState("");
  const [targetRoundId, setTargetRoundId] = useState(rounds[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    setError(null);

    if (!targetRoundId) {
      setError("Create a round first before importing.");
      return;
    }

    let parsed: Array<{ body: string; options: string[]; correct_answer: number }>;
    try {
      parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error("Expected an array");
    } catch {
      setError("Invalid JSON. Paste an array of question objects.");
      return;
    }

    // Validate structure
    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      if (!q.body || !Array.isArray(q.options) || typeof q.correct_answer !== "number") {
        setError(
          `Question ${i + 1} is missing required fields (body, options, correct_answer).`
        );
        return;
      }
    }

    setLoading(true);

    // Get current max sort_order for the target round
    const { data: existing } = await supabase
      .from("questions")
      .select("sort_order")
      .eq("round_id", targetRoundId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const startOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

    const rows = parsed.map((q, i) => ({
      round_id: targetRoundId,
      body: q.body,
      options: q.options,
      correct_answer: q.correct_answer,
      sort_order: startOrder + i,
    }));

    const { data, error: insertError } = await supabase
      .from("questions")
      .insert(rows)
      .select();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      onImported(data);
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-surface border border-border w-full max-w-lg mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Import Questions (JSON)</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Target round */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Import into round
          </label>
          <select
            value={targetRoundId}
            onChange={(e) => setTargetRoundId(e.target.value)}
            className="w-full h-9 bg-surface border border-border px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title || "Untitled Round"}
              </option>
            ))}
          </select>
        </div>

        {/* JSON textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            JSON Array
          </label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={10}
            className="w-full bg-background border border-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder={`[\n  {\n    "body": "What is Ethereum?",\n    "options": ["A blockchain", "A token", "A wallet", "An exchange"],\n    "correct_answer": 0\n  }\n]`}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || !json.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
          >
            {loading ? "Importing..." : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
