"use client";

import Link from "next/link";
import { AvatarDropdown } from "@/app/_components/avatar-dropdown";

export function DashboardHeader({
  user,
}: {
  user: { id: string; displayName: string; email: string };
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 h-14 min-w-0">
        <Link href="/host">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
        </Link>

        <AvatarDropdown user={user} isHost />
      </div>
    </header>
  );
}
