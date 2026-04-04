"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { FindGame } from "./find-game";
import { IdentityPanel } from "./identity-panel";
import { LivenessChallenge } from "@/app/_components/liveness-challenge";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { LogOut } from "lucide-react";

type VerifiedEvent = {
  id: string;
  title: string;
  join_code: string;
  player_count: number;
};

export function JoinFlow({ initialCode }: { initialCode?: string } = {}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<"find" | "identity" | "liveness">("find");
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
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
    setCurrentPlayerId(null);
  }

  function handleIdentityConfirmed(playerId: string) {
    setCurrentPlayerId(playerId);
    setStep("liveness");
  }

  function handleLivenessSuccess() {
    if (verifiedEvent && currentPlayerId) {
      router.push(`/game/${verifiedEvent.join_code}/lobby`);
    }
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
              className="p-2 text-stone-500 dark:text-zinc-400 hover:text-violet-600 transition-colors duration-150"
            >
              <LogOut size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Sliding panels container */}
      <div className="relative pt-14">
        <div
          className="flex transition-transform duration-400 ease-out"
          style={{
            width: "300%",
            transform: step === "identity" ? "translateX(-33.333%)" : step === "liveness" ? "translateX(-66.666%)" : "translateX(0)",
          }}
        >
          {/* Panel 1: Find Game */}
          <div className="w-1/3">
            <FindGame
              initialCode={initialCode}
              onVerified={verifyCode}
            />
          </div>

          {/* Panel 2: Identity */}
          <div className="w-1/3">
            {verifiedEvent && (
              <IdentityPanel
                event={verifiedEvent}
                onBack={handleBack}
                onIdentityConfirmed={handleIdentityConfirmed}
              />
            )}
          </div>

          {/* Panel 3: Liveness Check */}
          <div className="w-1/3">
            {verifiedEvent && currentPlayerId && (
              <LivenessChallenge
                eventId={verifiedEvent.id}
                playerId={currentPlayerId}
                onSuccess={handleLivenessSuccess}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
