/**
 * Section background blocks for marketing/info pages.
 *
 * Use to create alternating visual rhythm. NOT for gameplay screens —
 * gameplay stays on Warm Canvas / Night Canvas only.
 *
 * Per DESIGN.md §2 "Section Background Patterns".
 */

import type { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  className?: string;
  /** Vertical padding intensity. `tall` = hero/CTA, `default` = standard sections. */
  size?: "default" | "tall";
  /** Skip the opaque background so a parent bg (e.g. BlockPatternBg) shows through. */
  transparent?: boolean;
};

const PADDING = {
  default: "py-16 sm:py-20",
  tall: "py-20 sm:py-28",
};

/**
 * Default background. Warm Canvas (light) / Night Canvas (dark).
 * Use for hero areas, how-it-works, features.
 */
export function CanvasSection({
  children,
  className = "",
  size = "default",
  transparent = false,
}: SectionProps) {
  const bg = transparent ? "" : "bg-background";
  return (
    <section className={`${bg} ${PADDING[size]} ${className}`}>
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}

/**
 * Dark editorial block. Ink (#1a1917) bg in light mode, Night Surface (#18181b) in dark.
 * Snow headings, Ash body.
 * Use for: stats bars, social proof, testimonials, features grid.
 */
export function InkSection({ children, className = "", size = "default" }: SectionProps) {
  return (
    <section
      className={`${PADDING[size]} ${className} bg-[var(--bt-ink)] dark:bg-[var(--bt-surface)]`}
      style={{ color: "var(--bt-bg)" }}
    >
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}

/**
 * Mint accent block. Same mint bg (#3ddabe) in both themes with Ink text.
 * Use for positioning value props / callouts that need warmth without going dark.
 */
export function MintSection({ children, className = "", size = "default" }: SectionProps) {
  return (
    <section
      className={`${PADDING[size]} ${className}`}
      style={{ background: "var(--bt-mint)", color: "#1a1917" }}
    >
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}

/**
 * Loud brand block. Electric Violet bg, white text, inverted CTA.
 * Use ONE per page maximum — typically a "join the arena" CTA.
 */
export function VioletSection({ children, className = "", size = "tall" }: SectionProps) {
  return (
    <section
      className={`${PADDING[size]} ${className}`}
      style={{ background: "var(--bt-violet)", color: "#ffffff" }}
    >
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}
