"use client";

import type { SpotlightCard } from "@/lib/game/spotlight-stats";

export function SpotlightCards({
  cards,
  myPlayerId,
}: {
  cards: SpotlightCard[];
  myPlayerId?: string | null;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        Player Spotlights
      </p>
      <div className="space-y-2">
        {cards.map((card) => {
          const isMe = card.player_id === myPlayerId;
          return (
            <div
              key={card.name}
              className={`border border-border border-l-[3px] border-l-primary p-4 bg-background ${isMe ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none shrink-0">{card.emoji}</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
                      {card.name}
                    </p>
                    <p className="text-[15px] font-medium text-foreground leading-snug">
                      {card.display_name}
                      {isMe && (
                        <span className="text-primary font-bold"> (you)</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0 tabular-nums">
                  {card.stat_value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
