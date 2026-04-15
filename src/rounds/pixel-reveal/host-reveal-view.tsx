"use client";

/**
 * Pixel Reveal host reveal — shows the image fully un-blurred plus the correct
 * option highlighted. Styling matches the player's MCQ grid so the host and
 * player see the same answer presentation (only the host sees the image in
 * full clarity during reveal).
 */

import Image from "next/image";
import { Check } from "lucide-react";
import { proxyImageUrl } from "@/lib/image-proxy";
import type { HostRevealViewProps } from "@/lib/game/round-registry";

export function PixelRevealHostRevealView({ question }: HostRevealViewProps) {
  const options = (question.options ?? []) as string[];
  const correctIdx = question.correct_answer;
  const imageUrl = question.image_url ?? null;
  const optionLabels = ["A", "B", "C", "D"];

  return (
    <div className="space-y-4">
      {imageUrl && (
        <div className="relative w-full aspect-video bg-surface border border-border overflow-hidden">
          <Image
            src={proxyImageUrl(imageUrl)}
            alt="Question image"
            fill
            unoptimized
            className="object-contain"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const isCorrect = i === correctIdx;
          const letter = optionLabels[i] ?? String.fromCharCode(65 + i);
          const cls = `flex items-center gap-3 p-4 min-h-14 border text-left ${
            isCorrect
              ? "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct"
              : "border-border text-muted-foreground opacity-60"
          }`;
          const badgeCls = `w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold ${
            isCorrect
              ? "bg-correct/10 text-correct"
              : "bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400"
          }`;

          return (
            <div key={i} className={cls}>
              <span className={badgeCls}>
                {isCorrect ? <Check size={14} strokeWidth={2.5} /> : letter}
              </span>
              <span className={`flex-1 ${isCorrect ? "font-medium" : ""}`}>
                {opt}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
