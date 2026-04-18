"use client";

import { ThemeProvider } from "next-themes";

// next-themes injects an inline <script> for FOUC prevention.
// React 19 emits a console.error about script tags in components — this is
// harmless noise in dev mode only. Suppress it so the dev overlay stays clean.
if (typeof window !== "undefined") {
  const _err = console.error.bind(console);
  console.error = (...args: Parameters<typeof console.error>) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) return;
    _err(...args);
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
