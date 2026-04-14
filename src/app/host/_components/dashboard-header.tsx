"use client";

import Image from "next/image";
import Link from "next/link";
import { AvatarDropdown } from "@/app/_components/avatar-dropdown";

export function DashboardHeader({
  user,
  avatarUrl,
}: {
  user: { id: string; displayName: string; email: string };
  avatarUrl?: string | null;
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 h-14 min-w-0">
        <Link href="/host">
          <Image src="/logo-light.svg" alt="BlockTrivia" width={100} height={24} className="h-6 w-auto dark:hidden" />
          <Image src="/logo-dark.svg" alt="BlockTrivia" width={100} height={24} className="h-6 w-auto hidden dark:block" />
        </Link>

        <AvatarDropdown user={user} isHost avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
