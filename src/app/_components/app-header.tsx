"use client";

import { AvatarDropdown } from "./avatar-dropdown";

export function AppHeader({
  user,
  avatarUrl,
  right,
  logoHref = "/join",
  isHost = false,
  fullWidth = false,
}: {
  user?: { id: string; displayName: string; email?: string } | null;
  avatarUrl?: string | null;
  right?: React.ReactNode;
  logoHref?: string;
  isHost?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className="border-b border-border w-full shrink-0">
      <header className={`px-5 h-14 flex items-center justify-between w-full ${fullWidth ? "" : "max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto"}`}>
        <a href={logoHref}>
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
          {right}
          {user ? <AvatarDropdown user={user} avatarUrl={avatarUrl} isHost={isHost} /> : null}
        </div>
      </header>
    </div>
  );
}
