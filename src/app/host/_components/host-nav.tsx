"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { LogOut } from "lucide-react";

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
            className="p-2 text-stone-500 dark:text-zinc-400 hover:text-violet-600 transition-colors duration-150"
            aria-label="Sign out"
          >
            <LogOut size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </header>
  );
}
