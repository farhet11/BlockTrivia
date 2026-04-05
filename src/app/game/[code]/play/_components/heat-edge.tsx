"use client";

/**
 * Heat Edge — Timer Urgency Aura
 *
 * Peripheral screen glow that intensifies as the question timer runs down.
 * Edges only — center content stays crystal clear.
 *
 * Phases:
 *   100%–50%  → No glow. Clean canvas.
 *   50%–20%   → Amber glow fades in at screen edges.
 *   20%–0%    → Red glow, pulsing.
 *   On answer  → Glow kills instantly (500ms fade).
 *   On timeout → Component unmounts (parent stops rendering on phase change).
 *
 * Implementation: single fixed overlay with stacked inset box-shadows.
 * Second exception to the "zero box-shadows" rule (first is focus rings).
 * Gameplay-only functional effect, not decorative.
 */

function getAuraStyle(pct: number, isAnswered: boolean) {
  // Kill aura immediately when player answers
  if (isAnswered) return { opacity: 0, color: "transparent" };
  // No glow above 50%
  if (pct > 0.5) return { opacity: 0, color: "transparent" };

  if (pct > 0.2) {
    // Amber phase: 50% → 20%
    const intensity = 1 - (pct - 0.2) / 0.3; // 0→1 as 50%→20%
    return {
      opacity: 0.25 + intensity * 0.25,
      color: "245, 158, 11",
    };
  }

  // Red phase: 20% → 0% — progressively more intense
  const intensity = 1 - pct / 0.2; // 0→1 as 20%→0%
  const r = Math.round(239 + intensity * 16);
  const g = Math.round(68 - intensity * 40);
  const b = Math.round(68 - intensity * 40);
  return {
    opacity: 0.45 + intensity * 0.35,
    color: `${r}, ${g}, ${b}`,
  };
}

export function HeatEdge({
  timeLeft,
  totalTime,
  isAnswered,
}: {
  /** Seconds remaining */
  timeLeft: number | null;
  /** Total seconds for this question */
  totalTime: number;
  /** Player has submitted an answer */
  isAnswered: boolean;
}) {
  if (timeLeft === null) return null;

  const pct = timeLeft / totalTime;
  const aura = getAuraStyle(pct, isAnswered);
  const isPulsing = pct <= 0.2 && pct > 0 && !isAnswered;

  // No glow to render
  if (aura.opacity === 0) return null;

  const boxShadow = [
    // Layer 1: tight bright edge — the "hot" inner rim
    `inset 0 0 40px 20px rgba(${aura.color}, ${aura.opacity * 0.9})`,
    // Layer 2: medium spread — the visible cloud body
    `inset 0 0 100px 50px rgba(${aura.color}, ${aura.opacity * 0.6})`,
    // Layer 3: wide soft halo — atmospheric diffusion
    `inset 0 0 200px 80px rgba(${aura.color}, ${aura.opacity * 0.35})`,
    // Layer 4: ultra-wide subtle wash — barely there, adds warmth
    `inset 0 0 350px 100px rgba(${aura.color}, ${aura.opacity * 0.15})`,
  ].join(", ");

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-40"
        style={{
          boxShadow,
          transition: "box-shadow 500ms ease",
          animation: isPulsing ? "heat-edge-pulse 1.6s ease-in-out infinite" : "none",
        }}
        aria-hidden="true"
      />
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes heat-edge-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        }
      `}</style>
    </>
  );
}
