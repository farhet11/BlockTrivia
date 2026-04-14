"use client";

import Image from "next/image";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

export function SponsorBar({ sponsors }: { sponsors: Sponsor[] }) {
  if (!sponsors || sponsors.length === 0) return null;

  return (
    <div className="w-full border-t border-border/50 bg-background/80 py-3 md:py-5 px-4">
      <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wider mb-2 md:mb-3">
        Sponsored by
      </p>
      <div className="flex items-center justify-center gap-4 md:gap-6 flex-wrap max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
        {sponsors
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => (
            <Image
              key={s.id}
              src={s.logo_url}
              alt={s.name ?? "Sponsor"}
              title={s.name ?? undefined}
              width={120}
              height={32}
              unoptimized
              className="h-5 md:h-8 w-auto max-w-[80px] md:max-w-[120px] object-contain grayscale opacity-60 dark:invert dark:brightness-200"
            />
          ))}
      </div>
    </div>
  );
}
