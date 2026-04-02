"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const params = useParams();
  const code = params?.code as string | undefined;

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6 text-center">
      <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
      <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
      <div className="space-y-2">
        <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          There was a problem loading the game. Tap below to rejoin.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {code && (
          <a
            href={`/game/${code}/lobby`}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-heading font-medium text-sm text-center hover:bg-primary/90 transition-colors"
          >
            Rejoin game
          </a>
        )}
        <button
          onClick={reset}
          className="w-full py-2.5 px-4 border border-border font-heading text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
