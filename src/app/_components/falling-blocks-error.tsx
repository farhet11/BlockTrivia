"use client";

import { useRef } from "react";

type Action = {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary";
};

export function FallingBlocksError({
  heading = "Something went wrong",
  body = "The page you're looking for doesn't exist, or something broke on our end. Let's get you back on track.",
  actions = [],
}: {
  heading?: string;
  body?: string;
  actions?: Action[];
}) {
  const blocksRef = useRef<HTMLDivElement>(null);

  function replayAnimation() {
    const el = blocksRef.current;
    if (!el) return;
    el.classList.remove("fallen");
    void el.offsetWidth; // force reflow
    el.classList.add("fallen");
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6 text-center">
      {/* Falling blocks logo */}
      <div
        ref={blocksRef}
        className="fallen"
        style={{ width: 120, height: 120, position: "relative" }}
      >
        {/* Top-left: violet with prompt icon */}
        <div
          className="block-tl"
          style={{
            position: "absolute",
            width: 52,
            height: 52,
            left: 0,
            top: 0,
            background: "var(--bt-violet)",
            borderRadius: 3,
          }}
        >
          <svg
            style={{ position: "absolute", left: 10, top: 12 }}
            width={28}
            height={28}
            viewBox="0 0 83 83"
          >
            <polygon
              fill="var(--bt-spinner-glyph)"
              points="0,10 31.47,41.6 0,73 20.31,73.7 52.4,41.6 20.31,9.5"
            />
            <rect
              fill="var(--bt-spinner-glyph)"
              x="38.68"
              y="66.51"
              width="44.06"
              height="6.99"
            />
          </svg>
        </div>

        {/* Top-right: foreground color */}
        <div
          className="block-tr"
          style={{
            position: "absolute",
            width: 52,
            height: 52,
            right: 0,
            top: 0,
            background: "var(--bt-ink)",
            borderRadius: 3,
          }}
        />

        {/* Bottom-left: foreground color */}
        <div
          className="block-bl"
          style={{
            position: "absolute",
            width: 52,
            height: 52,
            left: 0,
            bottom: 0,
            background: "var(--bt-ink)",
            borderRadius: 3,
          }}
        />

        {/* Bottom-right: violet with check icon */}
        <div
          className="block-br"
          style={{
            position: "absolute",
            width: 52,
            height: 52,
            right: 0,
            bottom: 0,
            background: "var(--bt-violet)",
            borderRadius: 3,
          }}
        >
          <svg
            style={{ position: "absolute", right: 10, bottom: 12 }}
            width={28}
            height={28}
            viewBox="0 0 83 83"
          >
            <polygon
              fill="var(--bt-spinner-glyph)"
              points="31.53,69.64 9.55,47.58 24.17,47.14 31.57,54.54 72.74,13.37 73.18,27.99"
            />
          </svg>
        </div>
      </div>

      {/* Copy — extra top margin to clear blocks that fall outside their container */}
      <div className="space-y-2 mt-6">
        <h1 className="font-heading text-xl font-bold">{heading}</h1>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          {body}
        </p>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {actions.map((action, i) => {
            const cls =
              action.variant === "secondary"
                ? "w-full py-3.5 px-8 border border-border font-heading text-sm font-medium hover:bg-muted/50 transition-colors text-center"
                : "w-full py-3.5 px-8 bg-primary text-primary-foreground font-heading font-medium text-sm hover:bg-primary-hover transition-colors text-center";

            if (action.href) {
              return (
                <a key={i} href={action.href} className={cls}>
                  {action.label}
                </a>
              );
            }
            return (
              <button key={i} onClick={action.onClick} className={cls}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={replayAnimation}
        className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-2"
      >
        replay animation
      </button>

      {/* Keyframes */}
      <style>{`
        @keyframes fall-tl {
          0%, 25% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          60%      { transform: translate(-18px, -24px) rotate(-18deg); opacity: 0.7; }
          80%      { transform: translate(-14px, -20px) rotate(-14deg); opacity: 0.5; }
          100%     { transform: translate(-16px, -22px) rotate(-16deg); opacity: 0.35; }
        }
        @keyframes fall-tr {
          0%, 30% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          65%     { transform: translate(22px, -8px) rotate(10deg); opacity: 0.7; }
          85%     { transform: translate(18px, -4px) rotate(7deg); opacity: 0.5; }
          100%    { transform: translate(20px, -6px) rotate(8deg); opacity: 0.35; }
        }
        @keyframes fall-bl {
          0%, 35% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          70%     { transform: translate(-20px, 28px) rotate(-12deg); opacity: 0.7; }
          90%     { transform: translate(-16px, 24px) rotate(-9deg); opacity: 0.5; }
          100%    { transform: translate(-18px, 26px) rotate(-10deg); opacity: 0.35; }
        }
        @keyframes fall-br {
          0%, 28% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          63%     { transform: translate(16px, 30px) rotate(14deg); opacity: 0.7; }
          83%     { transform: translate(12px, 26px) rotate(11deg); opacity: 0.5; }
          100%    { transform: translate(14px, 28px) rotate(12deg); opacity: 0.35; }
        }
        @keyframes breathe-fallen {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 0.45; }
        }

        .fallen .block-tl {
          animation:
            fall-tl 1.8s ease-out forwards,
            breathe-fallen 3s ease-in-out 2s infinite;
        }
        .fallen .block-tr {
          animation:
            fall-tr 1.8s ease-out forwards,
            breathe-fallen 3s ease-in-out 2.4s infinite;
        }
        .fallen .block-bl {
          animation:
            fall-bl 1.8s ease-out forwards,
            breathe-fallen 3s ease-in-out 2.8s infinite;
        }
        .fallen .block-br {
          animation:
            fall-br 1.8s ease-out forwards,
            breathe-fallen 3s ease-in-out 2.2s infinite;
        }
      `}</style>
    </div>
  );
}
