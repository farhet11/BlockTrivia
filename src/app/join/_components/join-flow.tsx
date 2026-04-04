"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { FindGame } from "./find-game";
import { IdentityPanel } from "./identity-panel";
import { LivenessChallenge } from "@/app/_components/liveness-challenge";
import { PlayerHeader } from "@/app/_components/player-header";

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
  const [sessionUser, setSessionUser] = useState<{ id: string; displayName: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Player";
        setSessionUser({ id: user.id, displayName: name });
      }
    });
  }, [supabase]);

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
      <PlayerHeader user={sessionUser} fixed />

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
