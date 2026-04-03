"use client";

import { useEffect } from "react";

export default function HostGameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6 text-center">
      <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
      <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
      <div className="space-y-2">
        <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          The host panel encountered an error. Reload to restore your session.
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => window.location.reload()}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          Reload
        </button>
        <button
          onClick={reset}
          className="w-full py-2.5 px-4 border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
