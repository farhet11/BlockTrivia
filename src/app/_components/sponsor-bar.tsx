"use client";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

export function SponsorBar({ sponsors }: { sponsors: Sponsor[] }) {
  if (!sponsors || sponsors.length === 0) return null;

  return (
    <div className="w-full border-t border-border/50 bg-background/80 py-2 px-4">
      <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg mx-auto">
        {sponsors
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => (
            <img
              key={s.id}
              src={s.logo_url}
              alt={s.name ?? "Sponsor"}
              title={s.name ?? undefined}
              className="h-5 max-w-[80px] object-contain grayscale opacity-50 dark:invert dark:brightness-200"
            />
          ))}
      </div>
    </div>
  );
}
