"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { Round, Question } from "./question-builder";

/**
 * Supported JSON formats:
 *
 * FORMAT A — Full import (rounds + questions, auto-creates rounds):
 * {
 *   "rounds": [
 *     {
 *       "title": "Round 1 — Basics",
 *       "type": "mcq",              // "mcq" | "true_false" | "wipeout"
 *       "time_limit_seconds": 15,   // 10 | 15 | 20 | 30
 *       "questions": [
 *         {
 *           "body": "What does EVM stand for?",
 *           "options": ["Ethereum Virtual Machine", "Encrypted Value Module", "External Validation", "Ethereum Verified Mint"],
 *           "correct_answer": 0,
 *           "explanation": "EVM = Ethereum Virtual Machine — the runtime for smart contracts."
 *         }
 *       ]
 *     },
 *     {
 *       "title": "Round 2 — True or False",
 *       "type": "true_false",
 *       "time_limit_seconds": 10,
 *       "questions": [
 *         {
 *           "body": "Ethereum was founded by Vitalik Buterin.",
 *           "correct_answer": 0,
 *           "explanation": "Yes — Vitalik co-founded Ethereum in 2013."
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * FORMAT B — Simple import (flat array, choose target round manually):
 * [
 *   {
 *     "body": "What is a smart contract?",
 *     "options": ["Self-executing code", "A legal document", "A crypto wallet", "A token standard"],
 *     "correct_answer": 0,
 *     "explanation": "Smart contracts are programs stored on a blockchain that run when conditions are met."
 *   }
 * ]
 *
 * Notes:
 * - true_false questions don't need "options" (auto-set to ["True","False"])
 * - "explanation" is optional on all question types
 * - correct_answer is 0-based index (0=A or True, 1=B or False, etc.)
 */

type ImportQuestion = {
  body: string;
  options?: string[];
  correct_answer: number;
  explanation?: string;
};

type ImportRound = {
  title?: string;
  type?: "mcq" | "true_false" | "wipeout";
  time_limit_seconds?: number;
  questions: ImportQuestion[];
};

export function JsonImportModal({
  eventId,
  rounds,
  onImported,
  onRoundsCreated,
  onClose,
}: {
  eventId: string;
  rounds: Round[];
  onImported: (questions: Question[]) => void;
  onRoundsCreated: (rounds: Round[]) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [json, setJson] = useState("");
  const [targetRoundId, setTargetRoundId] = useState(rounds[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Detect which format was pasted
  function detectFormat(raw: string): "full" | "simple" | null {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return "simple";
      if (parsed && Array.isArray(parsed.rounds)) return "full";
      return null;
    } catch {
      return null;
    }
  }

  const format = json.trim() ? detectFormat(json) : null;

  async function handleImport() {
    setError(null);
    setLoading(true);

    try {
      if (format === "full") {
        await importFull();
      } else if (format === "simple") {
        await importSimple();
      } else {
        setError("Invalid JSON. See format guide above.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function importFull() {
    const parsed: { rounds: ImportRound[] } = JSON.parse(json);

    // Get current max sort_order for rounds
    const startRoundOrder = rounds.length;
    const newRounds: Round[] = [];
    const newQuestions: Question[] = [];

    for (let ri = 0; ri < parsed.rounds.length; ri++) {
      const r = parsed.rounds[ri];

      // Create the round
      const { data: roundData, error: roundErr } = await supabase
        .from("rounds")
        .insert({
          event_id: eventId,
          title: r.title ?? `Round ${startRoundOrder + ri + 1}`,
          round_type: r.type ?? "mcq",
          time_limit_seconds: r.time_limit_seconds ?? 15,
          sort_order: startRoundOrder + ri,
        })
        .select()
        .single();

      if (roundErr || !roundData) {
        setError(`Failed to create round "${r.title}": ${roundErr?.message}`);
        return;
      }

      newRounds.push(roundData as Round);

      // Insert questions for this round
      const isTrueFalse = r.type === "true_false";
      const rows = r.questions.map((q, qi) => ({
        round_id: roundData.id,
        body: q.body,
        options: isTrueFalse ? ["True", "False"] : (q.options ?? ["", "", "", ""]),
        correct_answer: q.correct_answer,
        explanation: q.explanation ?? null,
        sort_order: qi,
      }));

      const { data: qData, error: qErr } = await supabase
        .from("questions")
        .insert(rows)
        .select();

      if (qErr) {
        setError(`Failed to insert questions for "${r.title}": ${qErr.message}`);
        return;
      }

      newQuestions.push(...(qData as Question[]));
    }

    onRoundsCreated(newRounds);
    onImported(newQuestions);
    onClose();
  }

  async function importSimple() {
    if (!targetRoundId) {
      setError("Create a round first before importing.");
      return;
    }

    const parsed: ImportQuestion[] = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      setError("Expected a JSON array.");
      return;
    }

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      if (!q.body || typeof q.correct_answer !== "number") {
        setError(`Question ${i + 1} is missing "body" or "correct_answer".`);
        return;
      }
    }

    const { data: existing } = await supabase
      .from("questions")
      .select("sort_order")
      .eq("round_id", targetRoundId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const startOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

    const targetRound = rounds.find((r) => r.id === targetRoundId);
    const isTrueFalse = targetRound?.round_type === "true_false";

    const rows = parsed.map((q, i) => ({
      round_id: targetRoundId,
      body: q.body,
      options: isTrueFalse ? ["True", "False"] : (q.options ?? ["", "", "", ""]),
      correct_answer: q.correct_answer,
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
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-surface border border-border w-full max-w-2xl mx-4 p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Import Questions (JSON)</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Format guide */}
        <div className="bg-background border border-border p-3 space-y-1.5 text-xs font-mono text-muted-foreground">
          <p className="font-sans font-semibold text-foreground text-xs uppercase tracking-wider mb-2">Supported formats</p>
          <p><span className="text-primary">Format A</span> — Full import: object with <code>"rounds"</code> array. Auto-creates rounds + questions.</p>
          <p><span className="text-primary">Format B</span> — Simple import: flat array of questions. Choose target round below.</p>
          <p className="pt-1">Fields: <code>body</code>, <code>options</code> (skip for true_false), <code>correct_answer</code> (0-based), <code>explanation</code> (optional)</p>
          <p>Round types: <code>"mcq"</code> · <code>"true_false"</code> · <code>"wipeout"</code></p>
          <p>Time limits: <code>10</code> · <code>15</code> · <code>20</code> · <code>30</code> seconds</p>
        </div>

        {/* Format indicator */}
        {format && (
          <p className="text-xs font-medium">
            Detected:{" "}
            <span className="text-primary">
              {format === "full" ? "Format A — Full import (creates rounds)" : "Format B — Simple import"}
            </span>
          </p>
        )}

        {/* Target round — only for simple format */}
        {(format === "simple" || !format) && rounds.length > 0 && (
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
                  {r.title || "Untitled Round"} ({r.round_type})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* JSON textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Paste JSON
          </label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={12}
            className="w-full bg-background border border-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder={`{ "rounds": [ { "title": "Round 1", "type": "mcq", "time_limit_seconds": 15, "questions": [ ... ] } ] }`}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={loading || !json.trim() || !format}
            className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
          >
            {loading ? "Importing..." : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
