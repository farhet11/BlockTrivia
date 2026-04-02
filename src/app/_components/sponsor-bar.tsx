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
    <div className="w-full sticky bottom-0 z-10 border-t border-border/50 bg-background/80 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.06)] py-5 px-4">
      <p className="text-center text-xs text-muted-foreground uppercase tracking-wider mb-3">
        Today&apos;s sponsors
      </p>
      <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg mx-auto">
        {sponsors
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => (
            <img
              key={s.id}
              src={s.logo_url}
              alt={s.name ?? "Sponsor"}
              title={s.name ?? undefined}
              className="h-8 max-w-[120px] object-contain grayscale opacity-60 dark:invert dark:brightness-200"
            />
          ))}
      </div>
    </div>
  );
}
