"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { FindGame } from "./find-game";
import { IdentityPanel } from "./identity-panel";

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
          {verifiedEvent && (
            <div className="flex items-center gap-2 bg-accent-light px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-correct animate-pulse" />
              <span className="text-accent-text text-[11px] font-bold tracking-tight uppercase">
                {verifiedEvent.title.length > 20
                  ? verifiedEvent.title.slice(0, 20) + "..."
                  : verifiedEvent.title}
              </span>
            </div>
          )}
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
