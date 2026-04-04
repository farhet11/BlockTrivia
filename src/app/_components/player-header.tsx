"use client";

import { ThemeToggle } from "./theme-toggle";
import { AvatarDropdown } from "./avatar-dropdown";

export function PlayerHeader({
  user,
  children,
  fixed = false,
}: {
  user?: { id: string; displayName: string; email?: string } | null;
  children?: React.ReactNode;
  fixed?: boolean;
}) {
  return (
    <header
      className={`border-b border-border bg-background/80 backdrop-blur-sm z-50 ${
        fixed ? "fixed top-0 left-0 right-0" : ""
      }`}
    >
      <div className="flex items-center justify-between px-5 h-14 max-w-lg mx-auto">
        <a href="/join">
          <img
            src="/logo-light.svg"
            alt="BlockTrivia"
            className="h-6 dark:hidden"
          />
          <img
            src="/logo-dark.svg"
            alt="BlockTrivia"
            className="h-6 hidden dark:block"
          />
        </a>

        <div className="flex items-center gap-2">
          {children}
          {user ? <AvatarDropdown user={user} /> : <ThemeToggle />}
        </div>
      </div>
    </header>
  );
}
