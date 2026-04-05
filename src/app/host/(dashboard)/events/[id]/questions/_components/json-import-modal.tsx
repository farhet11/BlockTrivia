"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { Round, Question } from "./question-builder";

/**
 * JSON Import Formats
 *
 * FULL IMPORT — array of rounds (auto-creates rounds + questions):
 * [
 *   {
 *     "title": "Round 1 — Basics",
 *     "round_type": "mcq",           // "mcq" | "true_false" | "wipeout"
 *     "time_limit_seconds": 15,      // 10 | 15 | 20 | 30
 *     "base_points": 100,            // optional, default 100
 *     "questions": [
 *       {
 *         "body": "What does EVM stand for?",
 *         "options": ["Ethereum Virtual Machine", "Encrypted Value Module", "External Validation", "Ethereum Verified Mint"],
 *         "correct_answer": 0,
 *         "explanation": "EVM = Ethereum Virtual Machine."
 *       }
 *     ]
 *   }
 * ]
 *
 * SINGLE ROUND — flat array of questions (add to a selected round):
 * [
 *   {
 *     "body": "What is a smart contract?",
 *     "options": ["Self-executing code", "A legal document", "A crypto wallet", "A token standard"],
 *     "correct_answer": 0,
 *     "explanation": "Optional."
 *   }
 * ]
 *
 * Notes:
 * - true_false questions don't need "options" (auto-set to ["True","False"])
 * - "explanation" is optional
 * - correct_answer is 0-based (0 = A or True, 1 = B or False, etc.)
 */

type ImportQuestion = {
  body: string;
  options?: string[];
  correct_answer: number;
  explanation?: string;
};

type ImportRound = {
  title?: string;
  round_type?: "mcq" | "true_false" | "wipeout";
  /** @deprecated use round_type */
  type?: "mcq" | "true_false" | "wipeout";
  time_limit_seconds?: number;
  base_points?: number;
  questions: ImportQuestion[];
};

function detectFormat(raw: string): "full" | "simple" | null {
  try {
    const parsed = JSON.parse(raw);

    // Legacy: object with rounds array
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.rounds)) {
      return "full";
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      // Array of round objects (has a "questions" array inside)
      if (first && Array.isArray(first.questions)) return "full";
      // Array of question objects (has "body" field)
      if (first && typeof first.body === "string") return "simple";
      // Empty questions array edge case
      if (first && ("title" in first || "round_type" in first || "type" in first)) return "full";
    }

    if (Array.isArray(parsed) && parsed.length === 0) return null;

    return null;
  } catch {
    return null;
  }
}

export function JsonImportModal({
  eventId,
  rounds,
  onImported,
  onRoundsCreated,
  onRoundsReplaced,
  onClose,
}: {
  eventId: string;
  rounds: Round[];
  onImported: (questions: Question[]) => void;
  onRoundsCreated: (rounds: Round[]) => void;
  onRoundsReplaced: (rounds: Round[], questions: Question[]) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [json, setJson] = useState("");
  const [targetRoundId, setTargetRoundId] = useState(rounds[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importMode, setImportMode] = useState<"add" | "replace">("add");

  const format = json.trim() ? detectFormat(json) : null;
  const showModeChoice = format === "full" && rounds.length > 0;

  const SAMPLE_JSON = JSON.stringify([
    {
      title: "What is BlockTrivia?",
      round_type: "mcq",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "What is BlockTrivia?",
          options: [
            "A real-time trivia platform for Web3 communities",
            "A blockchain-based casino",
            "An NFT marketplace",
            "A DeFi yield protocol",
          ],
          correct_answer: 0,
          explanation: "BlockTrivia is a live trivia game that helps Web3 projects find who actually understands their protocol - not just airdrop farmers.",
        },
        {
          body: "What does a player's rank on the BlockTrivia leaderboard actually prove?",
          options: [
            "How much ETH they hold",
            "How fast and accurately they answered questions about the protocol",
            "How many NFTs they own",
            "Their on-chain transaction history",
          ],
          correct_answer: 1,
          explanation: "The leaderboard reflects knowledge + speed - a signal of genuine protocol understanding, not just token wealth.",
        },
        {
          body: "Who is BlockTrivia primarily built for?",
          options: [
            "Casual gamers looking for crypto prizes",
            "Web3 projects that want to identify informed community members",
            "Developers building smart contracts",
            "Crypto influencers running giveaways",
          ],
          correct_answer: 1,
          explanation: "BlockTrivia is a tool for protocols and DAOs to run knowledge-based events - separating real community from airdrop hunters.",
        },
        {
          body: "Which of the following is NOT a feature of BlockTrivia?",
          options: [
            "Real-time leaderboard during the game",
            "CSV export of player results after the event",
            "On-chain token rewards distributed automatically",
            "A host control panel to manage the game live",
          ],
          correct_answer: 2,
          explanation: "BlockTrivia does not handle on-chain rewards. It provides data (leaderboard, CSV) that projects can use to distribute rewards however they choose.",
        },
      ],
    },
    {
      title: "True or False Round",
      round_type: "true_false",
      time_limit_seconds: 15,
      base_points: 100,
      questions: [
        {
          body: "BlockTrivia requires players to connect a crypto wallet to join.",
          correct_answer: 1,
          explanation: "False - players join with Google or email. No wallet needed to play.",
        },
        {
          body: "Hosts can pause a live BlockTrivia game at any time.",
          correct_answer: 0,
          explanation: "True - the host control panel includes a pause button that freezes the timer for all players.",
        },
        {
          body: "BlockTrivia automatically distributes token rewards to top-ranked players.",
          correct_answer: 1,
          explanation: "False - BlockTrivia provides a CSV export with rankings. The project decides how to reward players.",
        },
        {
          body: "Faster correct answers earn more points in BlockTrivia.",
          correct_answer: 0,
          explanation: "True - scoring includes a speed bonus, so answering quickly and correctly maximises your score.",
        },
      ],
    },
    {
      title: "WipeOut - Go All In",
      round_type: "wipeout",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "What happens to a player's score if they use the WipeOut wager and answer incorrectly?",
          options: [
            "Their wager is subtracted from their score",
            "They lose all their points and are eliminated",
            "Nothing - wrong answers are ignored in WipeOut",
            "They drop to the bottom of the leaderboard",
          ],
          correct_answer: 0,
          explanation: "In WipeOut, players set a wager before answering. A wrong answer deducts the wagered amount — high risk, high reward.",
        },
        {
          body: "In a WipeOut round, what does wagering your maximum points mean?",
          options: [
            "You double your score if correct, lose it all if wrong",
            "You are guaranteed to win the round",
            "Your answer is locked in before the question appears",
            "You skip the question entirely",
          ],
          correct_answer: 0,
          explanation: "Maximum wager = maximum leverage. Correct answer doubles your points; wrong answer wipes them out.",
        },
        {
          body: "Which player strategy is most rewarded in a WipeOut round?",
          options: [
            "Wager low and play it safe every time",
            "Wager high only on questions you are confident about",
            "Skip all questions to preserve your current score",
            "Wager randomly to keep opponents guessing",
          ],
          correct_answer: 1,
          explanation: "WipeOut rewards conviction — big wagers on confident answers can leapfrog multiple positions on the leaderboard.",
        },
      ],
    },
  ], null, 2);

  function handleCopySample() {
    navigator.clipboard.writeText(SAMPLE_JSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleUseSample() {
    setJson(SAMPLE_JSON);
    setShowSample(false);
  }

  async function handleImport() {
    setError(null);
    setLoading(true);
    try {
      if (format === "full") {
        await importFull();
      } else if (format === "simple") {
        await importSimple();
      } else {
        setError("Couldn't detect format. Paste a valid JSON array.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function importFull() {
    let parsed: { rounds: ImportRound[] } | ImportRound[];

    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Invalid JSON.");
      return;
    }

    // Normalise: both `[{...rounds}]` and `{ rounds: [...] }` are valid
    const importRounds: ImportRound[] = Array.isArray(parsed)
      ? parsed
      : parsed.rounds;

    // Replace mode: delete all existing rounds (cascade removes questions)
    if (importMode === "replace" && rounds.length > 0) {
      const { error: delErr } = await supabase
        .from("rounds")
        .delete()
        .eq("event_id", eventId);
      if (delErr) {
        setError(`Failed to clear existing rounds: ${delErr.message}`);
        return;
      }
    }

    const startRoundOrder = importMode === "replace" ? 0 : rounds.length;
    const newRounds: Round[] = [];
    const newQuestions: Question[] = [];

    for (let ri = 0; ri < importRounds.length; ri++) {
      const r = importRounds[ri];
      const roundType = r.round_type ?? r.type ?? "mcq";

      const { data: roundData, error: roundErr } = await supabase
        .from("rounds")
        .insert({
          event_id: eventId,
          title: r.title ?? `Round ${startRoundOrder + ri + 1}`,
          round_type: roundType,
          time_limit_seconds: r.time_limit_seconds ?? 15,
          base_points: r.base_points ?? 100,
          sort_order: startRoundOrder + ri,
        })
        .select()
        .single();

      if (roundErr || !roundData) {
        setError(`Failed to create round "${r.title}": ${roundErr?.message}`);
        return;
      }

      newRounds.push(roundData as Round);

      const isTrueFalse = roundType === "true_false";
      const rows = (r.questions ?? []).map((q, qi) => ({
        round_id: roundData.id,
        body: q.body,
        options: isTrueFalse ? ["True", "False"] : (q.options ?? ["", "", "", ""]),
        correct_answer: q.correct_answer,
        explanation: q.explanation ?? null,
        sort_order: qi,
      }));

      if (rows.length > 0) {
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
    }

    if (importMode === "replace") {
      onRoundsReplaced(newRounds, newQuestions);
    } else {
      onRoundsCreated(newRounds);
      onImported(newQuestions);
    }
    onClose();
  }

  async function importSimple() {
    if (!targetRoundId) {
      setError("Create a round first before importing.");
      return;
    }

    let parsed: ImportQuestion[];
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Invalid JSON.");
      return;
    }

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Import Questions (JSON)</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Collapsible format help */}
        <div className="border border-border">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="uppercase tracking-wider">Format reference</span>
            <svg
              className={`size-3.5 transition-transform ${showHelp ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showHelp && (
            <div className="border-t border-border px-3 py-3 space-y-3 text-xs font-mono text-muted-foreground bg-background">
              <div>
                <p className="font-sans font-semibold text-foreground mb-1">Full import — array of rounds</p>
                <pre className="whitespace-pre-wrap leading-relaxed">{`[
  {
    "title": "Round Name",
    "round_type": "mcq",        // mcq | true_false | wipeout
    "time_limit_seconds": 15,   // 10 | 15 | 20 | 30
    "base_points": 100,         // optional
    "questions": [
      {
        "body": "Question text?",
        "options": ["A", "B", "C", "D"],
        "correct_answer": 0,    // 0-based index
        "explanation": "..."    // optional
      }
    ]
  }
]`}</pre>
              </div>
              <div>
                <p className="font-sans font-semibold text-foreground mb-1">Single round — flat array of questions</p>
                <pre className="whitespace-pre-wrap leading-relaxed">{`[
  {
    "body": "Question text?",
    "options": ["A", "B", "C", "D"],
    "correct_answer": 0,
    "explanation": "..."
  }
]`}</pre>
              </div>
              <p className="font-sans">Skip <code>options</code> for <code>true_false</code> rounds — auto-set to True/False.</p>
            </div>
          )}
        </div>

        {/* Sample quiz accordion */}
        <div className="border border-border">
          <button
            onClick={() => setShowSample((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="uppercase tracking-wider">Sample quiz — BlockTrivia</span>
            <svg
              className={`size-3.5 transition-transform ${showSample ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSample && (
            <div className="border-t border-border bg-background">
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">3 rounds · 11 questions — MCQ, True/False, and WipeOut. Ready to import.</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopySample}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 border border-border"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={handleUseSample}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 border border-primary"
                  >
                    Use this
                  </button>
                </div>
              </div>
              <pre className="px-3 pb-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{SAMPLE_JSON}</pre>
            </div>
          )}
        </div>

        {/* Auto-detected format badge */}
        {format && (
          <p className="text-xs font-medium">
            Detected:{" "}
            <span className="text-primary font-semibold">
              {format === "full" ? "Full import — creates rounds + questions" : "Single round — adds to selected round"}
            </span>
          </p>
        )}

        {/* Add vs Replace — only shown for full import when rounds exist */}
        {showModeChoice && (
          <div className="border border-border">
            <button
              onClick={() => setImportMode("add")}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border ${importMode === "add" ? "bg-accent-light" : "hover:bg-accent"}`}
            >
              <span className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${importMode === "add" ? "border-primary" : "border-border"}`}>
                {importMode === "add" && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Add to existing</p>
                <p className="text-xs text-muted-foreground">Append new rounds after your {rounds.length} existing round{rounds.length !== 1 ? "s" : ""}</p>
              </div>
            </button>
            <button
              onClick={() => setImportMode("replace")}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${importMode === "replace" ? "bg-destructive/5" : "hover:bg-accent"}`}
            >
              <span className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${importMode === "replace" ? "border-destructive" : "border-border"}`}>
                {importMode === "replace" && <span className="size-2 rounded-full bg-destructive" />}
              </span>
              <div>
                <p className={`text-sm font-medium ${importMode === "replace" ? "text-destructive" : "text-foreground"}`}>Replace all</p>
                <p className="text-xs text-muted-foreground">Delete existing rounds and questions, then import fresh</p>
              </div>
            </button>
          </div>
        )}

        {/* Target round — only shown for single-round format */}
        {format === "simple" && rounds.length > 0 && (
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
            onChange={(e) => { setJson(e.target.value); setError(null); }}
            rows={12}
            className="w-full bg-background border border-border px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder={`[ { "title": "Round 1", "round_type": "mcq", "time_limit_seconds": 15, "questions": [ ... ] } ]`}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={loading || !json.trim() || !format}
            className={`font-medium ${showModeChoice && importMode === "replace" ? "bg-destructive text-white hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary-hover"}`}
          >
            {loading ? "Importing..." : showModeChoice && importMode === "replace" ? "Replace & Import" : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
