"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { FindGame } from "./find-game";
import { IdentityPanel } from "./identity-panel";
import { ThemeToggle } from "@/app/_components/theme-toggle";

type VerifiedEvent = {
  id: string;
  title: string;
  join_code: string;
  player_count: number;
};

export function JoinFlow({ initialCode }: { initialCode?: string } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<"find" | "identity">("find");
  const [verifiedEvent, setVerifiedEvent] = useState<VerifiedEvent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-verify if code is provided via URL
  useEffect(() => {
    if (initialCode && initialCode.length === 5) {
      verifyCode(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function verifyCode(code: string): Promise<boolean> {
    const { data: event } = await supabase
      .from("events")
      .select("id, title, join_code")
      .eq("join_code", code.toUpperCase())
      .single();

    if (!event) return false;

    // Get player count
    const { count } = await supabase
      .from("event_players")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id);

    setVerifiedEvent({
      ...event,
      player_count: count ?? 0,
    });
    setStep("identity");
    return true;
  }

  function handleBack() {
    setStep("find");
    setVerifiedEvent(null);
  }

  return (
    <div className="min-h-dvh bg-background overflow-hidden" ref={containerRef}>
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-5 h-14 max-w-lg mx-auto">
          <img
            src="/logo-light.svg"
            alt="BlockTrivia"
            className="h-6 dark:hidden"
          />
          <img
            src="/logo-dark.svg"
            alt="BlockTrivia"
            className="h-6 hidden dark:block"
          />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setStep("find");
                setVerifiedEvent(null);
              }}
              aria-label="Sign out"
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Sliding panels container */}
      <div className="relative pt-14">
        <div
          className="flex transition-transform duration-400 ease-out"
          style={{
            width: "200%",
            transform: step === "identity" ? "translateX(-50%)" : "translateX(0)",
          }}
        >
          {/* Panel 1: Find Game */}
          <div className="w-1/2">
            <FindGame
              initialCode={initialCode}
              onVerified={verifyCode}
            />
          </div>

          {/* Panel 2: Identity */}
          <div className="w-1/2">
            {verifiedEvent && (
              <IdentityPanel
                event={verifiedEvent}
                onBack={handleBack}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
