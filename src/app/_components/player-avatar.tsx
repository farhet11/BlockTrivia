"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { thumbs } from "@dicebear/collection";

export function PlayerAvatar({
  seed,
  name,
  size = 40,
  url,
}: {
  seed: string;
  name?: string;
  size?: number;
  /** When provided, renders the uploaded image instead of the generated avatar. */
  url?: string | null;
}) {
  const fallback = useMemo(
    () =>
      createAvatar(thumbs, {
        seed,
        size,
        backgroundColor: ["f0ecfe", "e4d9fc", "ddd0fb", "ede9fe", "c4b5fd"],
        backgroundType: ["solid"],
        shapeColor: ["7c3aed", "6d28d9", "5b21b6", "8b5cf6", "a78bfa"],
      }).toDataUri(),
    [seed, size]
  );

  return (
    <img
      src={url || fallback}
      alt={name ? `${name}'s avatar` : "Player avatar"}
      width={size}
      height={size}
      style={{ borderRadius: 8, flexShrink: 0, objectFit: "cover" }}
    />
  );
}
