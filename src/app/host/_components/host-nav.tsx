"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "@/app/_components/theme-toggle";

export function HostNav({ user }: { user: User }) {
  const router = useRouter();
  const supabase = createClient();

  const shortName =
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Host";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full flex items-center justify-between px-6 h-14">
        <a href="/host" className="flex items-center">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Sign out"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
