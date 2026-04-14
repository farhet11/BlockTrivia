"use client";

/**
 * Modifier Activation Overlay
 *
 * Full-screen dramatic overlay that appears for ~2.5s when a host activates
 * a modifier live during a game. Sequence:
 *   0ms    — dark backdrop fades in
 *   100ms  — modifier name scales up from center (spring)
 *   300ms  — radial burst glow expands
 *   600ms  — subtitle fades in
 *   1800ms — overlay collapses downward
 *   2500ms — gone, standard ModifierOverlay takes over
 *
 * Amber/gold palette — consistent with Jackpot Mode. Future modifiers
 * can override via activationColor on ModifierModule.
 */

import { useEffect, useState } from "react";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";

interface ModifierActivationOverlayProps {
  /** Display name of the modifier (e.g. "Jackpot Mode") */
  modifierName: string;
  /** Short subtitle (e.g. "First correct answer wins 5× points") */
  subtitle?: string;
  /** Modifier type key — looked up against the round-type badge mapping. */
  modifierType?: string;
  /** Called when the animation finishes (~2.5s) */
  onComplete: () => void;
}

export function ModifierActivationOverlay({
  modifierName,
  subtitle,
  modifierType = "jackpot",
  onComplete,
}: ModifierActivationOverlayProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    // enter → hold at 100ms (title scales up)
    const t1 = setTimeout(() => setPhase("hold"), 100);
    // hold → exit at 1800ms (starts collapsing)
    const t2 = setTimeout(() => setPhase("exit"), 1800);
    // fully gone at 2500ms
    const t3 = setTimeout(() => onComplete(), 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        animation: phase === "exit"
          ? "modifier-collapse 700ms ease-in forwards"
          : "modifier-backdrop-in 200ms ease-out forwards",
        pointerEvents: "none",
      }}
    >
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/80"
        style={{
          animation: "modifier-backdrop-in 200ms ease-out forwards",
        }}
      />

      {/* Radial burst glow */}
      <div
        className="absolute"
        style={{
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,158,11,0.3) 0%, rgba(245,158,11,0) 70%)",
          animation: phase !== "enter"
            ? "modifier-burst 800ms ease-out 200ms forwards"
            : "none",
          opacity: phase === "exit" ? 0 : undefined,
          transition: "opacity 300ms ease",
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 px-8"
        style={{
          animation: phase !== "enter"
            ? "modifier-entrance 500ms cubic-bezier(0.34,1.56,0.64,1) forwards"
            : "none",
          opacity: phase === "enter" ? 0 : undefined,
        }}
      >
        {/* Icon — stage-size 48px badge */}
        <div style={{ filter: "drop-shadow(0 0 20px rgba(245,158,11,0.6))" }}>
          <RoundTypeBadge type={modifierType} size={48} />
        </div>

        {/* Modifier name */}
        <h1
          className="font-heading text-3xl md:text-4xl font-bold text-amber-300 text-center uppercase tracking-wider"
          style={{ textShadow: "0 0 40px rgba(245,158,11,0.5)" }}
        >
          {modifierName}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p
            className="text-sm md:text-base text-amber-200/80 text-center max-w-sm"
            style={{
              animation: "modifier-subtitle-in 400ms ease-out 500ms both",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
