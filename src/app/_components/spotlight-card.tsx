export type SpotlightEntry = {
  emoji: string;
  title: string;
  username: string;
  stat_value: string;
  player_id: string;
};

export function SpotlightCard({
  spotlight,
  isMe,
  animIndex = 0,
}: {
  spotlight: SpotlightEntry;
  isMe: boolean;
  animIndex?: number;
}) {
  return (
    <div
      className={`border border-border border-l-[3px] border-l-primary px-4 py-3.5 ${
        isMe ? "bg-primary/[0.06] dark:bg-primary/[0.08]" : "bg-background"
      }`}
      style={{ animation: `lb-fade-up 240ms ease-out ${animIndex * 60}ms both` }}
    >
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-primary mb-1">
        <span className="mr-1.5">{spotlight.emoji}</span>
        {spotlight.title}
      </p>
      <p className="text-[14px] font-medium text-foreground leading-snug">
        @{spotlight.username}
        <span className="text-muted-foreground mx-1.5">·</span>
        <span className="text-[14px] font-normal text-muted-foreground">{spotlight.stat_value}</span>
      </p>
    </div>
  );
}
