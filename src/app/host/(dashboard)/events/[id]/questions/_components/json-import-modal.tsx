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
  image_url?: string;
  correct_answer_numeric?: number;
};

type ImportRound = {
  title?: string;
  round_type?: string;
  /** @deprecated use round_type */
  type?: string;
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
    // ── Round 1: MCQ ──────────────────────────────────────────────────────
    {
      title: "Crypto Basics — MCQ",
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
          explanation: "BlockTrivia is a live trivia game that helps Web3 projects identify genuine community members.",
        },
        {
          body: "What does EVM stand for?",
          options: [
            "Ethereum Virtual Machine",
            "Encrypted Value Module",
            "External Validation Mechanism",
            "Ethereum Verified Mint",
          ],
          correct_answer: 0,
          explanation: "EVM = Ethereum Virtual Machine — the runtime environment for smart contracts on Ethereum.",
        },
        {
          body: "Which consensus mechanism does Ethereum currently use?",
          options: [
            "Proof of Work",
            "Proof of Stake",
            "Delegated Proof of Stake",
            "Proof of Authority",
          ],
          correct_answer: 1,
          explanation: "Ethereum transitioned to Proof of Stake with The Merge in September 2022.",
        },
      ],
    },
    // ── Round 2: True / False ─────────────────────────────────────────────
    {
      title: "True or False",
      round_type: "true_false",
      time_limit_seconds: 15,
      base_points: 100,
      questions: [
        {
          body: "Bitcoin has a maximum supply of 21 million coins.",
          correct_answer: 0,
          explanation: "True — Bitcoin's hard cap of 21 million is enforced by the protocol.",
        },
        {
          body: "Smart contracts can be modified after deployment on Ethereum.",
          correct_answer: 1,
          explanation: "False — deployed smart contracts are immutable. Upgradeable patterns use proxy contracts.",
        },
        {
          body: "Gas fees on Ethereum are paid in ETH.",
          correct_answer: 0,
          explanation: "True — all transaction fees on Ethereum are denominated and paid in ETH.",
        },
      ],
    },
    // ── Round 3: WipeOut ──────────────────────────────────────────────────
    {
      title: "WipeOut — High Stakes",
      round_type: "wipeout",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "What is the primary purpose of a liquidity pool in DeFi?",
          options: [
            "Enable decentralised token swaps without an order book",
            "Store user passwords securely",
            "Mine new cryptocurrency tokens",
            "Validate blockchain transactions",
          ],
          correct_answer: 0,
          explanation: "Liquidity pools let AMMs like Uniswap facilitate trades without traditional market makers.",
        },
        {
          body: "What does 'impermanent loss' refer to?",
          options: [
            "Loss from providing liquidity when token prices diverge",
            "Losing your private key temporarily",
            "A temporary network outage",
            "Gas fees that are refunded later",
          ],
          correct_answer: 0,
          explanation: "Impermanent loss occurs when the price ratio of pooled tokens changes versus simply holding them.",
        },
        {
          body: "Which protocol pioneered the automated market maker (AMM) model?",
          options: [
            "Aave",
            "Uniswap",
            "Chainlink",
            "OpenSea",
          ],
          correct_answer: 1,
          explanation: "Uniswap popularised the constant-product AMM formula (x * y = k) in DeFi.",
        },
      ],
    },
    // ── Round 4: Reversal ─────────────────────────────────────────────────
    {
      title: "Reversal — Find the False",
      round_type: "reversal",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "Which statement about Bitcoin is FALSE?",
          options: [
            "Bitcoin uses a proof-of-work consensus mechanism",
            "Bitcoin transactions are recorded on a public ledger",
            "Bitcoin smart contracts support the same functionality as Ethereum",
            "Bitcoin was created by the pseudonymous Satoshi Nakamoto",
          ],
          correct_answer: 2,
          explanation: "Bitcoin's scripting language is intentionally limited compared to Ethereum's Turing-complete EVM.",
        },
        {
          body: "Which statement about NFTs is FALSE?",
          options: [
            "NFTs can represent ownership of digital art",
            "Each NFT has a unique token ID on the blockchain",
            "NFTs guarantee the underlying asset cannot be copied",
            "NFTs can be transferred between wallets",
          ],
          correct_answer: 2,
          explanation: "NFTs prove ownership on-chain, but the underlying digital file can still be copied — ownership ≠ copy protection.",
        },
        {
          body: "Which statement about stablecoins is FALSE?",
          options: [
            "USDC is backed by cash and short-term treasuries",
            "DAI maintains its peg through overcollateralised crypto positions",
            "All stablecoins are backed 1:1 by US dollars in a bank",
            "Stablecoins are widely used for DeFi lending and borrowing",
          ],
          correct_answer: 2,
          explanation: "Algorithmic and crypto-collateralised stablecoins (like DAI) don't rely on fiat bank reserves.",
        },
      ],
    },
    // ── Round 5: Pressure Cooker ──────────────────────────────────────────
    {
      title: "Pressure Cooker — Spotlight",
      round_type: "pressure_cooker",
      time_limit_seconds: 15,
      base_points: 100,
      questions: [
        {
          body: "What is a 'rug pull' in crypto?",
          options: [
            "When developers abandon a project after taking investor funds",
            "When a token price suddenly increases",
            "A type of blockchain consensus mechanism",
            "A DeFi lending strategy",
          ],
          correct_answer: 0,
          explanation: "A rug pull is a scam where developers drain liquidity or funds, leaving investors with worthless tokens.",
        },
        {
          body: "What does 'DYOR' stand for in crypto communities?",
          options: [
            "Decentralise Your Own Resources",
            "Do Your Own Research",
            "Deposit Your Original Returns",
            "Distribute Yield On Request",
          ],
          correct_answer: 1,
          explanation: "DYOR = Do Your Own Research — a common reminder to verify claims before investing.",
        },
        {
          body: "What is a 'gas war'?",
          options: [
            "A geopolitical conflict over natural gas",
            "When users compete by bidding up gas fees to get transactions included faster",
            "A game mode in blockchain-based video games",
            "When miners refuse to process transactions",
          ],
          correct_answer: 1,
          explanation: "Gas wars happen during high-demand events (NFT mints, token launches) when users outbid each other for block space.",
        },
      ],
    },
    // ── Round 6: Pixel Reveal ─────────────────────────────────────────────
    {
      title: "Pixel Reveal — Name That Logo",
      round_type: "pixel_reveal",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "Which blockchain protocol does this logo belong to?",
          options: ["Ethereum", "Solana", "Polygon", "Avalanche"],
          correct_answer: 0,
          explanation: "The diamond-shaped logo is Ethereum's iconic symbol.",
          image_url: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
        },
        {
          body: "Identify this DeFi protocol from its logo.",
          options: ["Aave", "Compound", "Uniswap", "SushiSwap"],
          correct_answer: 2,
          explanation: "The pink unicorn is Uniswap's recognisable brand mark.",
          image_url: "https://cryptologos.cc/logos/uniswap-uni-logo.png",
        },
        {
          body: "Which blockchain does this logo represent?",
          options: ["Cardano", "Polkadot", "Solana", "Cosmos"],
          correct_answer: 2,
          explanation: "The gradient circle is Solana's logo.",
          image_url: "https://cryptologos.cc/logos/solana-sol-logo.png",
        },
      ],
    },
    // ── Round 7: Closest Wins ─────────────────────────────────────────────
    {
      title: "Closest Wins — Numbers Game",
      round_type: "closest_wins",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "How many mass (gwei) is 1 ETH? (enter a number)",
          options: [],
          correct_answer: 0,
          correct_answer_numeric: 1000000000,
          explanation: "1 ETH = 1,000,000,000 gwei (10^9).",
        },
        {
          body: "What is Bitcoin's maximum supply? (enter a number)",
          options: [],
          correct_answer: 0,
          correct_answer_numeric: 21000000,
          explanation: "Bitcoin has a hard cap of 21,000,000 BTC.",
        },
        {
          body: "In what year was the Ethereum mainnet launched? (enter the year)",
          options: [],
          correct_answer: 0,
          correct_answer_numeric: 2015,
          explanation: "Ethereum mainnet (Frontier) went live on July 30, 2015.",
        },
      ],
    },
    // ── Round 8: The Narrative ────────────────────────────────────────────
    {
      title: "The Narrative — Read the Room",
      round_type: "the_narrative",
      time_limit_seconds: 20,
      base_points: 100,
      questions: [
        {
          body: "Which sector will see the most crypto adoption in the next 2 years?",
          options: ["Gaming / GameFi", "Real-world assets (RWA)", "Social media (SocialFi)", "AI + Crypto"],
          correct_answer: 0,
          explanation: "Majority vote wins — there's no objectively correct answer. Read the room!",
        },
        {
          body: "What is the biggest barrier to mainstream crypto adoption?",
          options: ["Poor UX and complex wallets", "Regulatory uncertainty", "Volatility and risk perception", "Lack of real utility"],
          correct_answer: 0,
          explanation: "The majority decides. The Narrative rewards social intuition, not factual knowledge.",
        },
        {
          body: "Which L2 will have the most TVL by end of 2026?",
          options: ["Arbitrum", "Base", "Optimism", "zkSync"],
          correct_answer: 0,
          explanation: "No right answer — just the crowd's consensus. Did you read the room?",
        },
      ],
    },
    // ── Round 9: Oracle's Dilemma ─────────────────────────────────────────
    {
      title: "Oracle's Dilemma — Trust or Doubt",
      round_type: "oracles_dilemma",
      time_limit_seconds: 25,
      base_points: 100,
      questions: [
        {
          body: "What is a 'flash loan' in DeFi?",
          options: [
            "An uncollateralised loan that must be repaid within one transaction",
            "A loan with extremely high interest rates",
            "A peer-to-peer lending arrangement",
            "A government-backed emergency crypto loan",
          ],
          correct_answer: 0,
          explanation: "Flash loans are borrowed and repaid atomically within a single block — no collateral needed.",
        },
        {
          body: "What does MEV stand for?",
          options: [
            "Maximum Extractable Value",
            "Minimum Ethereum Validation",
            "Multi-chain Exchange Volume",
            "Managed Escrow Vault",
          ],
          correct_answer: 0,
          explanation: "MEV = Maximum Extractable Value — profit extracted by reordering, inserting, or censoring transactions.",
        },
        {
          body: "What is an 'oracle' in blockchain context?",
          options: [
            "A service that feeds external data to smart contracts",
            "A type of consensus algorithm",
            "A blockchain explorer tool",
            "A hardware wallet manufacturer",
          ],
          correct_answer: 0,
          explanation: "Oracles bridge off-chain data (prices, weather, etc.) into on-chain smart contracts.",
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

    // Pre-validate ALL rounds before any mutations (deletes or inserts).
    // This prevents partial writes where a delete committed but an insert failed.
    for (const r of importRounds) {
      const roundType = r.round_type ?? r.type ?? "mcq";
      if (roundType === "true_false") {
        const mcqQuestions = (r.questions ?? []).filter(
          (q) => Array.isArray(q.options) && q.options.length > 2
        );
        if (mcqQuestions.length > 0) {
          setError(
            `"${r.title ?? "Untitled round"}" is a True/False round, but ${mcqQuestions.length} question(s) have multiple options. Import to an MCQ round instead to preserve the options.`
          );
          return;
        }
      }
    }

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
        ...(q.image_url ? { image_url: q.image_url } : {}),
        ...(q.correct_answer_numeric != null ? { correct_answer_numeric: q.correct_answer_numeric } : {}),
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

    // Validate: warn if importing MCQ questions into a True/False round
    if (isTrueFalse) {
      const mcqQuestions = parsed.filter(
        (q) => Array.isArray(q.options) && q.options.length > 2
      );
      if (mcqQuestions.length > 0) {
        setError(
          `This is a True/False round, but ${mcqQuestions.length} question(s) have multiple options. Create an MCQ round instead to preserve the options.`
        );
        return;
      }
    }

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
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
