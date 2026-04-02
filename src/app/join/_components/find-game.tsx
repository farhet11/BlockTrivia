"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { QrScanner } from "./qr-scanner";

export function FindGame({
  initialCode,
  onVerified,
}: {
  initialCode?: string;
  onVerified: (code: string) => Promise<boolean>;
}) {
  const [chars, setChars] = useState<string[]>(
    initialCode
      ? initialCode.toUpperCase().padEnd(5, "").split("").slice(0, 5)
      : ["", "", "", "", ""]
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = chars.join("");
  const isComplete = code.length === 5 && chars.every((c) => c !== "");

  const handleChange = useCallback(
    (index: number, value: string) => {
      const char = value.slice(-1).toUpperCase();
      if (char && !/[A-Z0-9]/.test(char)) return;

      const next = [...chars];
      next[index] = char;
      setChars(next);
      setError(null);

      // Auto-advance to next input
      if (char && index < 4) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [chars]
  );

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !chars[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 4) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    if (!pasted) return;
    const next = pasted.split("").concat(["", "", "", "", ""]).slice(0, 5);
    setChars(next);
    setError(null);
    // Focus last filled or the next empty
    const lastIndex = Math.min(pasted.length, 4);
    inputRefs.current[lastIndex]?.focus();
  }

  async function handleSubmit() {
    if (!isComplete) return;
    setLoading(true);
    setError(null);
    const found = await onVerified(code);
    if (!found) {
      setError("Game not found. Check your code and try again.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Hero */}
      <section className="pt-10 pb-8 space-y-2">
        <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-foreground">
          Join the <span className="text-primary">Arena</span>
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Enter your access code to join the game.
        </p>
      </section>

      {/* Code input */}
      <section className="space-y-5">
        <div
          className="flex justify-center gap-2.5"
          style={shake ? { animation: "shake 0.4s ease-in-out" } : undefined}
        >
          {chars.map((char, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={char}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className={`w-14 h-16 text-center text-2xl font-mono font-bold tracking-wider bg-surface border-2 outline-none transition-colors ${
                char
                  ? "border-primary text-foreground"
                  : "border-border text-foreground"
              } focus:border-primary`}
              autoFocus={i === 0 && !initialCode}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Divider */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-widest">
              or
            </span>
          </div>
        </div>

        {/* QR scanner button */}
        <div className="space-y-1.5">
          <button
            onClick={() => setShowScanner(true)}
            className="w-full flex items-center justify-center gap-3 h-12 bg-surface border border-border text-foreground font-medium text-sm active:scale-[0.98] transition-transform"
          >
            <svg className="size-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75H16.5v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75H16.5v-.75z" />
            </svg>
            Scan Venue QR
          </button>
          <p className="text-xs text-muted-foreground text-center">
            Opens your camera to scan the QR code displayed at the venue
          </p>
        </div>

        {showScanner && (
          <QrScanner
            onScanned={(code) => {
              setShowScanner(false);
              const next = code.toUpperCase().split("").concat(["", "", "", "", ""]).slice(0, 5);
              setChars(next);
              onVerified(code);
            }}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* Find Game CTA */}
        <Button
          onClick={handleSubmit}
          disabled={!isComplete || loading}
          className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary-hover font-medium text-base"
        >
          {loading ? "Finding..." : "Find Game"}
        </Button>
      </section>

      {/* Below the fold — What is BlockTrivia? */}
      <div className="border-t border-border mt-14 pt-10 space-y-8 pb-16">
        <div className="border-l-[3px] border-primary pl-4">
          <h2 className="font-heading text-xl font-bold tracking-tight">
            What is BlockTrivia?
          </h2>
        </div>

        <p className="font-heading italic text-lg text-muted-foreground leading-relaxed">
          "A high-stakes, real-time trivia experience designed for the world's
          most innovative communities. Knowledge is the only currency here."
        </p>

        <div className="space-y-7">
          {[
            {
              num: "1",
              title: "Enter the Arena",
              desc: "Scan the venue QR or enter the 5-digit session code to initialize your game session.",
            },
            {
              num: "2",
              title: "Compete in Real-time",
              desc: "Answer questions as they appear on the main stage. Speed + accuracy = higher score multiplier.",
            },
            {
              num: "3",
              title: "Climb the Leaderboard",
              desc: "Outsmart the competition, track your rank in real-time, and claim your spot at the top.",
            },
          ].map((step) => (
            <div key={step.num} className="flex gap-4">
              <span className="text-2xl font-bold text-primary leading-none">
                {step.num}.
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
