"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { PodiumLayout, RankingRow, PinnedRankSection, type LbEntry } from "@/app/_components/lb-podium";

// ── Demo questions ────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: "q1",
    body: "What does DeFi stand for?",
    options: ["Decentralized Finance", "Digital Finance", "Deferred Finance", "Distributed Fiat"],
    correctIndex: 0,
    explanation: "DeFi — Decentralized Finance — refers to financial services built on public blockchains, removing traditional intermediaries.",
  },
  {
    id: "q2",
    body: "Which consensus mechanism does Ethereum use after The Merge?",
    options: ["Proof of Work", "Proof of Stake", "Proof of Authority", "Proof of History"],
    correctIndex: 1,
    explanation: "Ethereum switched from Proof of Work to Proof of Stake in September 2022 during The Merge, cutting energy use by ~99.95%.",
  },
  {
    id: "q3",
    body: "What is a DAO?",
    options: ["A type of NFT", "Decentralized Autonomous Organization", "A blockchain consensus rule", "A token standard"],
    correctIndex: 1,
    explanation: "A DAO (Decentralized Autonomous Organization) is a member-owned community governed by on-chain rules and token voting.",
  },
  {
    id: "q4",
    body: "What does TVL stand for in DeFi?",
    options: ["Total Value Locked", "Token Vault Ledger", "Transaction Volume Limit", "Total Verified Liquidity"],
    correctIndex: 0,
    explanation: "TVL (Total Value Locked) measures the total value of crypto assets deposited in a DeFi protocol — a key health metric.",
  },
  {
    id: "q5",
    body: "What is a smart contract?",
    options: [
      "A legal agreement between two blockchains",
      "Self-executing code stored on a blockchain",
      "A type of hardware wallet",
      "An AI-powered trading bot",
    ],
    correctIndex: 1,
    explanation: "Smart contracts are self-executing programs on a blockchain that automatically enforce agreement terms without intermediaries.",
  },
  {
    id: "q6",
    body: "What is an NFT?",
    options: ["Non-Fungible Token", "New Financial Technology", "Network Fee Transaction", "Native Fungible Token"],
    correctIndex: 0,
    explanation: "NFT stands for Non-Fungible Token — a unique, indivisible digital asset whose ownership is verified on a blockchain.",
  },
  {
    id: "q7",
    body: "Which chain pioneered the concept of programmable smart contracts?",
    options: ["Bitcoin", "Solana", "Ethereum", "Polygon"],
    correctIndex: 2,
    explanation: "Ethereum, launched in 2015 by Vitalik Buterin, was the first blockchain to introduce a Turing-complete smart contract platform.",
  },
];

const TIME_LIMIT = 20; // seconds per question
const BASE_POINTS = 100;

// ── Bot players ───────────────────────────────────────────────────────────────
const BOTS = [
  { id: "bot1", display_name: "CryptoSage" },
  { id: "bot2", display_name: "DegenQueen" },
  { id: "bot3", display_name: "MaxWeb3" },
  { id: "bot4", display_name: "SolanaFan" },
];

// Bot accuracy per question (pre-determined so scores feel realistic)
const BOT_ACCURACY: Record<string, boolean[]> = {
  bot1: [true, true, true, true, true, true, false],   // ~86%
  bot2: [true, false, true, true, false, true, true],  // ~71%
  bot3: [true, true, false, true, true, false, true],  // ~71%
  bot4: [false, true, true, false, true, true, false], // ~57%
};

// Bot answer times (seconds, simulating how fast they "answer")
const BOT_TIMES: Record<string, number[]> = {
  bot1: [4, 6, 5, 3, 7, 4, 9],
  bot2: [8, 12, 9, 6, 14, 7, 11],
  bot3: [5, 8, 13, 7, 5, 10, 6],
  bot4: [11, 7, 10, 14, 8, 13, 12],
};

function calcPoints(correct: boolean, elapsedSeconds: number): number {
  if (!correct) return 0;
  const timeBonus = Math.round((TIME_LIMIT - elapsedSeconds) / TIME_LIMIT * BASE_POINTS);
  return BASE_POINTS + Math.max(0, timeBonus);
}

type Phase = "name" | "lobby" | "question" | "reveal" | "leaderboard" | "final";

type PlayerScore = { id: string; display_name: string; total_score: number };

export function DemoView({ initialDisplayName = "" }: { initialDisplayName?: string }) {
  const [phase, setPhase] = useState<Phase>("name");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameError, setNameError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const [playerScoreHistory, setPlayerScoreHistory] = useState<number[]>([]);
  const [botScores, setBotScores] = useState<Record<string, number>>({ bot1: 0, bot2: 0, bot3: 0, bot4: 0 });
  const [lobbyCountdown, setLobbyCountdown] = useState(5);
  const [revealCountdown, setRevealCountdown] = useState(4);
  const [lbCountdown, setLbCountdown] = useState(5);
  const answerTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playerId = "player-me";
  const question = QUESTIONS[questionIndex];

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── Lobby countdown → question ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "lobby") return;
    setLobbyCountdown(5);
    timerRef.current = setInterval(() => {
      setLobbyCountdown((n) => {
        if (n <= 1) { clearTimer(); setPhase("question"); return 0; }
        return n - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase]);

  // ── Question timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "question") return;
    setTimeLeft(TIME_LIMIT);
    setSelectedOption(null);
    answerTimeRef.current = 0;
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, TIME_LIMIT - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0) { clearTimer(); revealAnswers(TIME_LIMIT); }
    }, 200);
    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIndex]);

  const revealAnswers = useCallback((elapsed: number) => {
    // Score player
    const correct = selectedOption === question.correctIndex;
    const pts = calcPoints(correct, elapsed);
    setPlayerScore((s) => s + pts);
    setPlayerScoreHistory((h) => [...h, pts]);

    // Score bots
    setBotScores((prev) => {
      const next = { ...prev };
      BOTS.forEach((b) => {
        const botCorrect = BOT_ACCURACY[b.id][questionIndex];
        const botElapsed = BOT_TIMES[b.id][questionIndex];
        next[b.id] = (next[b.id] || 0) + calcPoints(botCorrect, botElapsed);
      });
      return next;
    });

    setPhase("reveal");
  }, [selectedOption, question, questionIndex]);

  const handleAnswer = (idx: number) => {
    if (selectedOption !== null || phase !== "question") return;
    clearTimer();
    const elapsed = TIME_LIMIT - timeLeft;
    answerTimeRef.current = elapsed;
    setSelectedOption(idx);
    revealAnswers(elapsed);
  };

  // ── Reveal countdown → leaderboard ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "reveal") return;
    setRevealCountdown(4);
    timerRef.current = setInterval(() => {
      setRevealCountdown((n) => {
        if (n <= 1) {
          clearTimer();
          setPhase("leaderboard");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, questionIndex]);

  // ── Leaderboard countdown → next question or final ─────────────────────────
  useEffect(() => {
    if (phase !== "leaderboard") return;
    setLbCountdown(5);
    timerRef.current = setInterval(() => {
      setLbCountdown((n) => {
        if (n <= 1) {
          clearTimer();
          if (questionIndex + 1 >= QUESTIONS.length) {
            setPhase("final");
          } else {
            setQuestionIndex((i) => i + 1);
            setPhase("question");
          }
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, questionIndex]);

  // ── Leaderboard data ────────────────────────────────────────────────────────
  function getLeaderboard(currentPlayerScore: number, currentBotScores: Record<string, number>): LbEntry[] {
    const entries = [
      { player_id: playerId, display_name: displayName || "You", total_score: currentPlayerScore },
      ...BOTS.map((b) => ({ player_id: b.id, display_name: b.display_name, total_score: currentBotScores[b.id] || 0 })),
    ];
    entries.sort((a, b) => b.total_score - a.total_score);
    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  function startGame() {
    const name = displayName.trim();
    if (!name) { setNameError("Enter a display name to play"); return; }
    if (name.length < 2) { setNameError("Name must be at least 2 characters"); return; }
    setNameError("");
    setPhase("lobby");
  }

  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const timerColor = timerPct > 50 ? "#22c55e" : timerPct > 25 ? "#f59e0b" : "#ef4444";

  // ── Render ──────────────────────────────────────────────────────────────────

  // NAME ENTRY
  if (phase === "name") {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-5 max-w-lg mx-auto w-full space-y-8">
          <div className="text-center space-y-2">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Demo Game</p>
            <h1 className="font-heading text-2xl font-bold">Web3 Knowledge Check</h1>
            <p className="text-sm text-muted-foreground">
              {QUESTIONS.length} questions · {TIME_LIMIT}s each · No sign-in needed
            </p>
          </div>
          <div className="w-full space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setNameError(""); }}
              onKeyDown={(e) => e.key === "Enter" && startGame()}
              placeholder="e.g. CryptoWizard"
              maxLength={24}
              className="w-full h-12 border border-border bg-background px-4 text-base font-medium focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500">{nameError}</p>}
            <button
              onClick={startGame}
              className="w-full h-12 bg-primary text-primary-foreground font-heading font-semibold hover:bg-primary-hover transition-colors"
            >
              Start Demo →
            </button>
          </div>
          <div className="border border-border bg-surface w-full p-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Playing against</p>
            <div className="flex items-center gap-3">
              {BOTS.map((b) => (
                <div key={b.id} className="flex flex-col items-center gap-1">
                  <PlayerAvatar seed={b.id} name={b.display_name} size={36} />
                  <span className="text-[10px] text-muted-foreground">{b.display_name.split(/(?=[A-Z])/).join(" ").slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LOBBY
  if (phase === "lobby") {
    const allPlayers = [
      { id: playerId, display_name: displayName },
      ...BOTS,
    ];
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Demo Game</p>
            <h2 className="font-heading text-2xl font-bold">Web3 Knowledge Check</h2>
            <p className="text-sm text-muted-foreground">
              Starting in <span className="font-bold text-foreground tabular-nums">{lobbyCountdown}s</span>…
            </p>
          </div>
          <div className="border border-border divide-y divide-border">
            {allPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <PlayerAvatar seed={p.id} name={p.display_name} size={36} />
                <span className="font-medium text-sm">{p.display_name}</span>
                {p.id === playerId && (
                  <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5">you</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // QUESTION
  if (phase === "question") {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Q{questionIndex + 1} / {QUESTIONS.length}
          </span>
          <span
            className="font-heading text-2xl font-bold tabular-nums"
            style={{ color: timerColor, transition: "color 0.3s" }}
          >
            {timeLeft}
          </span>
          <ThemeToggle />
        </header>

        {/* Timer bar */}
        <div className="h-1 bg-border transition-all duration-200" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />

        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-6 flex flex-col gap-6">
          <p className="font-heading text-xl font-semibold leading-snug">{question.body}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={selectedOption !== null}
                className={`text-left px-4 py-4 border font-medium text-sm transition-colors ${
                  selectedOption === null
                    ? "border-border hover:border-primary hover:bg-primary/5"
                    : "border-border opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-2">
                  {["A", "B", "C", "D"][i]}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // REVEAL
  if (phase === "reveal") {
    const correct = selectedOption === question.correctIndex;
    const didAnswer = selectedOption !== null;
    const ptsEarned = playerScoreHistory[playerScoreHistory.length - 1] ?? 0;

    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Q{questionIndex + 1} / {QUESTIONS.length}
          </span>
          <span className="text-xs text-muted-foreground">
            Next in <span className="font-bold text-foreground">{revealCountdown}s</span>
          </span>
          <ThemeToggle />
        </header>

        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-6 flex flex-col gap-5">
          {/* Result banner */}
          <div className={`border p-4 text-center space-y-1 ${
            !didAnswer ? "border-border bg-surface" :
            correct ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"
          }`}>
            <p className={`font-heading text-lg font-bold ${
              !didAnswer ? "text-muted-foreground" :
              correct ? "text-green-500" : "text-red-500"
            }`}>
              {!didAnswer ? "Time's up!" : correct ? "Correct! ✓" : "Wrong ✗"}
            </p>
            {didAnswer && (
              <p className="text-sm text-muted-foreground">
                {correct ? `+${ptsEarned} points` : "No points this round"}
              </p>
            )}
          </div>

          {/* Answer options — highlighted */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.options.map((opt, i) => {
              const isCorrect = i === question.correctIndex;
              const isSelected = i === selectedOption;
              return (
                <div
                  key={i}
                  className={`px-4 py-4 border text-sm font-medium ${
                    isCorrect
                      ? "border-green-500 bg-green-500/10 text-green-600 dark:text-green-400"
                      : isSelected
                      ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                      : "border-border opacity-40"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider mr-2 opacity-60">
                    {["A", "B", "C", "D"][i]}
                  </span>
                  {opt}
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          <div className="border border-border bg-surface p-4 space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Did you know?</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{question.explanation}</p>
          </div>

          {/* Running score */}
          <div className="flex items-center justify-between border border-border px-4 py-3">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your score</span>
            <span className="font-heading text-xl font-bold tabular-nums">{playerScore}</span>
          </div>
        </div>
      </div>
    );
  }

  // LEADERBOARD (between rounds)
  if (phase === "leaderboard") {
    const lb = getLeaderboard(playerScore, botScores);
    const podium = lb.slice(0, 3);
    const rest = lb.slice(3);
    const firstScore = lb[0]?.total_score ?? 1;
    const myRank = lb.find((e) => e.player_id === playerId)?.rank ?? 0;
    const inTop3 = myRank <= 3;

    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-6 space-y-5">
          <div className="text-center space-y-0.5">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
              After Q{questionIndex + 1}
            </p>
            <h2 className="font-heading text-2xl font-bold">Leaderboard</h2>
            <p className="text-xs text-muted-foreground animate-pulse">
              Next question in {lbCountdown}s…
            </p>
          </div>
          <PodiumLayout entries={podium} myPlayerId={playerId} />
          {rest.length > 0 && (
            <div className="border-t border-border">
              {rest.map((entry, i) => (
                <RankingRow
                  key={entry.player_id}
                  entry={entry}
                  firstScore={firstScore}
                  delta={null}
                  isMe={entry.player_id === playerId}
                  animIndex={i + 3}
                />
              ))}
            </div>
          )}
          {!inTop3 && (
            <PinnedRankSection
              entry={lb.find((e) => e.player_id === playerId) ?? { player_id: playerId, display_name: displayName, total_score: playerScore, rank: myRank }}
              firstScore={firstScore}
              visibleCount={lb.length}
              topEntries={lb.slice(0, 3)}
              allEntries={lb}
            />
          )}
        </div>
      </div>
    );
  }

  // FINAL
  if (phase === "final") {
    const lb = getLeaderboard(playerScore, botScores);
    const podium = lb.slice(0, 3);
    const rest = lb.slice(3);
    const firstScore = lb[0]?.total_score ?? 1;
    const myEntry = lb.find((e) => e.player_id === playerId);
    const totalQ = QUESTIONS.length;
    const correctCount = playerScoreHistory.filter((p) => p > 0).length;
    const accuracy = Math.round((correctCount / totalQ) * 100);

    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-8">
          <div className="text-center space-y-1">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Game Over</p>
            <h1 className="font-heading text-2xl font-bold">Final Results</h1>
            <p className="text-sm text-muted-foreground">Web3 Knowledge Check · Demo</p>
          </div>

          {/* Personal result */}
          {myEntry && (
            <div className={`border p-4 space-y-3 ${myEntry.rank === 1 ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Your result</p>
                  <p className="font-heading text-xl font-bold">#{myEntry.rank}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Score</p>
                  <p className="font-heading text-xl font-bold tabular-nums">{myEntry.total_score}</p>
                </div>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground border-t border-border pt-3">
                <span><span className="font-semibold text-foreground">{correctCount}/{totalQ}</span> correct</span>
                <span><span className="font-semibold text-foreground">{accuracy}%</span> accuracy</span>
              </div>
              {myEntry.rank === 1 && (
                <p className="text-xs font-bold text-primary uppercase tracking-wider">★ You won the demo!</p>
              )}
            </div>
          )}

          {/* Podium */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top Players</p>
            <PodiumLayout entries={podium} myPlayerId={playerId} />
          </div>

          {rest.length > 0 && (
            <div className="border-t border-border">
              {rest.map((entry, i) => (
                <RankingRow
                  key={entry.player_id}
                  entry={entry}
                  firstScore={firstScore}
                  delta={null}
                  isMe={entry.player_id === playerId}
                  animIndex={i}
                />
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="border border-primary/20 bg-primary/5 p-6 text-center space-y-4">
            <p className="font-heading text-lg font-bold">Ready for the real thing?</p>
            <p className="text-sm text-muted-foreground">
              Join a live event or host your own trivia for your community.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/join"
                className="inline-flex items-center justify-center h-11 px-6 bg-primary text-primary-foreground font-heading font-medium text-sm hover:bg-primary-hover transition-colors"
              >
                Join a Game →
              </a>
              <a
                href="/host"
                className="inline-flex items-center justify-center h-11 px-6 border border-border font-heading font-medium text-sm hover:bg-accent transition-colors"
              >
                Host an Event
              </a>
            </div>
            <button
              onClick={() => {
                setPhase("name");
                setQuestionIndex(0);
                setPlayerScore(0);
                setPlayerScoreHistory([]);
                setBotScores({ bot1: 0, bot2: 0, bot3: 0, bot4: 0 });
                setSelectedOption(null);
              }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
