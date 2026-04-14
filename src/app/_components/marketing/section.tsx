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
};

const PADDING = {
  default: "py-16 sm:py-20",
  tall: "py-20 sm:py-28",
};

/**
 * Default background. Warm Canvas (light) / Night Canvas (dark).
 * Use for hero areas, how-it-works, features.
 */
export function CanvasSection({ children, className = "", size = "default" }: SectionProps) {
  return (
    <section className={`bg-background ${PADDING[size]} ${className}`}>
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}

/**
 * Dark editorial block. Ink (#1a1917) bg, Snow headings, Ash body.
 * Use for: stats bars, social proof, testimonials.
 */
export function InkSection({ children, className = "", size = "default" }: SectionProps) {
  return (
    <section
      className={`${PADDING[size]} ${className}`}
      style={{ background: "#1a1917", color: "#fafafa" }}
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
      style={{ background: "#7c3aed", color: "#ffffff" }}
    >
      <div className="max-w-5xl mx-auto px-6">{children}</div>
    </section>
  );
}
