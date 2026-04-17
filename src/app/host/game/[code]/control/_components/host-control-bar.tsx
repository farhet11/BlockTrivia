"use client";

/**
 * HostControlBar — fixed-bottom sticky action bar for every host game screen
 * (playing, revealing, leaderboard, interstitial, paused). 4-slot layout:
 *
 *   [ ← Previous ]  [ Pause ]  [ Primary CTA ]  [ ⋮ Overflow ]
 *
 * The bar background stays solid; the 8px fade lives as a sibling strip
 * above it so page content fades into the surface color while scrolling.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, MoreVertical, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface OverflowMenuItem {
  key: string;
  label: string;
  /** "danger" renders Wrong Red text; "muted" renders Stone. Defaults to default. */
  tone?: "default" | "danger" | "muted";
  icon?: LucideIcon;
  onSelect: () => void;
}

interface HostControlBarProps {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** "filled" = violet solid (default). "ghost" = violet outlined — used
   *  during timer-running so host doesn't accidentally tap Reveal. */
  primaryVariant?: "filled" | "ghost";
  /** Icon rendered to the left of primaryLabel. Always visible. */
  primaryIcon?: LucideIcon;

  /** Pause / Resume / etc. Omit to hide the slot. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  /** Icon for the secondary slot. Required to render icon-only on mobile. */
  secondaryIcon?: LucideIcon;

  /** Previous-question slot. Omit when there is nothing to go back to. */
  onPrevious?: () => void;
  /** When true, the Previous slot flips to "Back to current" (replay mode). */
  inReplayMode?: boolean;

  /** Overflow menu items. Omit or pass empty array to hide the ⋮ slot. */
  overflowItems?: OverflowMenuItem[];

  /** Optional content rendered above the buttons (e.g. sponsor strip). */
  above?: React.ReactNode;
}

export function HostControlBar({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryVariant = "filled",
  primaryIcon: PrimaryIcon,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  secondaryIcon: SecondaryIcon,
  onPrevious,
  inReplayMode = false,
  overflowItems,
  above,
}: HostControlBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the overflow popover on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const hasOverflow = !!overflowItems && overflowItems.length > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      {/* 8px fade strip — sits ABOVE the bar so content scrolls underneath
          the fade into the solid bar bg. The bar itself has no transparency. */}
      <div
        aria-hidden="true"
        className="h-2"
        style={{
          background:
            "linear-gradient(to top, var(--color-surface), transparent)",
        }}
      />
      <div className="pointer-events-auto bg-surface border-t border-border">
        {above}
        <div className="max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          {/* Slot 1: Previous / Back to current (icon-only on mobile) */}
          {onPrevious && (
            <button
              onClick={onPrevious}
              className="h-12 w-12 sm:w-auto sm:px-4 bg-surface border border-border font-heading font-medium hover:bg-background transition-colors inline-flex items-center justify-center sm:gap-1.5"
              aria-label={inReplayMode ? "Back to current" : "Previous question"}
            >
              {inReplayMode ? (
                <X size={16} strokeWidth={2} />
              ) : (
                <ChevronLeft size={16} strokeWidth={2} />
              )}
              <span className="hidden sm:inline">
                {inReplayMode ? "Back to current" : "Previous"}
              </span>
            </button>
          )}

          {/* Slot 2: Pause (icon-only on mobile when icon provided) */}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              disabled={secondaryDisabled}
              aria-label={secondaryLabel}
              className={
                SecondaryIcon
                  ? "h-12 w-12 sm:w-auto sm:px-5 bg-surface border border-border font-heading font-medium hover:bg-background transition-colors disabled:opacity-50 inline-flex items-center justify-center sm:gap-1.5"
                  : "h-12 px-5 bg-surface border border-border font-heading font-medium hover:bg-background transition-colors disabled:opacity-50"
              }
            >
              {SecondaryIcon && <SecondaryIcon size={16} strokeWidth={2} />}
              <span className={SecondaryIcon ? "hidden sm:inline" : ""}>{secondaryLabel}</span>
            </button>
          )}

          {/* Slot 3: Primary CTA — icon + text on all sizes */}
          <button
            onClick={onPrimary}
            disabled={primaryDisabled}
            className={
              primaryVariant === "ghost"
                ? "flex-1 h-12 bg-surface border border-primary text-primary font-heading font-medium hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                : "flex-1 h-12 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            }
          >
            {PrimaryIcon && <PrimaryIcon size={16} strokeWidth={2} />}
            {primaryLabel}
          </button>

          {/* Slot 4: Overflow ⋮ */}
          {hasOverflow && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-12 w-12 text-muted-foreground hover:text-foreground hover:bg-background transition-colors flex items-center justify-center"
              >
                <MoreVertical size={18} strokeWidth={2} />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 bottom-[calc(100%+6px)] w-56 bg-surface border border-border shadow-lg"
                >
                  {overflowItems!.map((item) => {
                    const toneCls =
                      item.tone === "danger"
                        ? "text-wrong"
                        : item.tone === "muted"
                          ? "text-muted-foreground"
                          : "text-foreground";
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          item.onSelect();
                        }}
                        className={`w-full h-11 px-4 text-left text-sm font-normal hover:bg-background transition-colors inline-flex items-center gap-2.5 ${toneCls}`}
                      >
                        {Icon && <Icon size={16} strokeWidth={2} />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
