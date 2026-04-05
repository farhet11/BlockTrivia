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
  question_count: number;
  prizes: string | null;
  estimated_minutes: number | null;
  host_name: string | null;
  access_mode: "open" | "whitelist" | "blacklist";
};

export function JoinFlow({ initialCode }: { initialCode?: string } = {}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<"find" | "identity" | "liveness">("find");
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [verifiedEvent, setVerifiedEvent] = useState<VerifiedEvent | null>(null);
  const [sessionUser, setSessionUser] = useState<{ id: string; displayName: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent browser auto-scroll from fighting translateX positioning
  // (autoFocus on inputs in off-screen panels causes unwanted scrollLeft)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reset = () => { el.scrollLeft = 0; };
    reset();
    el.addEventListener("scroll", reset, { passive: false });
    return () => el.removeEventListener("scroll", reset);
  }, [step]);

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
      .select("id, title, join_code, prizes, access_mode, organizer_name, profiles!events_created_by_fkey(display_name)")
      .eq("join_code", code.toUpperCase())
      .single();

    if (!event) return false;

    // Get player count + round data for time estimate in parallel
    const [{ count }, { data: rounds }] = await Promise.all([
      supabase
        .from("event_players")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id),
      supabase
        .from("rounds")
        .select("time_limit_seconds, questions(id)")
        .eq("event_id", event.id),
    ]);

    // Estimate: sum of (questions × timer) per round + ~8s interstitial per round
    let estimated_minutes: number | null = null;
    let question_count = 0;
    if (rounds && rounds.length > 0) {
      const totalSeconds = rounds.reduce((sum, r) => {
        const qCount = (r.questions as unknown[])?.length ?? 0;
        question_count += qCount;
        const timer = r.time_limit_seconds ?? 15;
        return sum + qCount * timer + 8;
      }, 0);
      estimated_minutes = Math.max(1, Math.round(totalSeconds / 60));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hostProfile = (event as any).profiles?.display_name ?? null;

    setVerifiedEvent({
      id: event.id,
      title: event.title,
      join_code: event.join_code,
      player_count: count ?? 0,
      question_count,
      prizes: event.prizes ?? null,
      estimated_minutes,
      host_name: (event as any).organizer_name ?? hostProfile,
      access_mode: ((event as any).access_mode as "open" | "whitelist") ?? "open",
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
      <PlayerHeader user={sessionUser} />

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
          <div className="w-1/3 overflow-hidden">
            <FindGame
              initialCode={initialCode}
              onVerified={verifyCode}
            />
          </div>

          {/* Panel 2: Identity */}
          <div className="w-1/3 overflow-hidden">
            {verifiedEvent && (
              <IdentityPanel
                event={verifiedEvent}
                onBack={handleBack}
                onIdentityConfirmed={handleIdentityConfirmed}
              />
            )}
          </div>

          {/* Panel 3: Liveness Check */}
          <div className="w-1/3 overflow-hidden">
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
