/**
 * Reveal Answer button — disabled-state regression tests.
 *
 * Bug: the host-side "Reveal Answer" button was ghosted visually while the
 * timer was still running, but the click handler still fired — letting the
 * host accidentally cut off players mid-answer. Fix wires a real `disabled`
 * prop through `isRevealBlocked`. These tests pin that contract so a future
 * refactor can't silently drop the guard again.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { isRevealBlocked } from "@/app/host/game/[code]/control/_components/reveal-gate";
import { HostControlBar } from "@/app/host/game/[code]/control/_components/host-control-bar";

describe("isRevealBlocked", () => {
  it("blocks reveal while timer is running and not everyone has answered", () => {
    expect(isRevealBlocked(5, 3, 10)).toBe(true);
  });

  it("allows reveal once timer hits 0, regardless of answer count", () => {
    expect(isRevealBlocked(0, 3, 10)).toBe(false);
    expect(isRevealBlocked(-1, 3, 10)).toBe(false);
  });

  it("allows early reveal when every player has answered", () => {
    expect(isRevealBlocked(5, 10, 10)).toBe(false);
    expect(isRevealBlocked(15, 2, 2)).toBe(false);
  });

  it("does not block when timeLeft is null (pre-start / transition)", () => {
    expect(isRevealBlocked(null, 0, 5)).toBe(false);
  });

  it("does not block with zero players", () => {
    expect(isRevealBlocked(5, 0, 0)).toBe(false);
  });
});

describe("HostControlBar — disabled button contract", () => {
  it("does not invoke onPrimary when primaryDisabled is true", () => {
    const onPrimary = vi.fn();
    render(
      <HostControlBar
        primaryLabel="Reveal Answer"
        onPrimary={onPrimary}
        primaryDisabled={isRevealBlocked(5, 3, 10)}
      />,
    );
    const btn = screen.getByRole("button", { name: /reveal answer/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("invokes onPrimary once the gate allows reveal", () => {
    const onPrimary = vi.fn();
    render(
      <HostControlBar
        primaryLabel="Reveal Answer"
        onPrimary={onPrimary}
        primaryDisabled={isRevealBlocked(0, 3, 10)}
      />,
    );
    const btn = screen.getByRole("button", { name: /reveal answer/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});
