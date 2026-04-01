"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "@/app/_components/theme-toggle";

export function HostNav({ user }: { user: User }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full flex items-center justify-between px-6 h-14">
        <a href="/host" className="flex items-center">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-7 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-7 hidden dark:block" />
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
