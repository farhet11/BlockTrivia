"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { DropdownMenu } from "radix-ui";
import { createClient } from "@/lib/supabase";
import { PlayerAvatar } from "./player-avatar";
import { User, Settings, LogOut, Sun, Moon, Monitor } from "lucide-react";

const MENU_ICON = { size: 16, strokeWidth: 2.5 } as const;

export function AvatarDropdown({
  user,
  isHost = false,
  avatarUrl,
}: {
  user: { id: string; displayName: string; email?: string };
  isHost?: boolean;
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Mount guard for next-themes to avoid hydration mismatch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push(isHost ? "/login" : "/join");
  }

  const themeSegments = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="p-1 shrink-0 hover:opacity-80 transition-opacity cursor-pointer outline-none"
          aria-label="Account menu"
        >
          <PlayerAvatar seed={user.id} name={user.displayName} size={32} url={avatarUrl} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[100] min-w-[240px] bg-surface border border-border rounded-lg animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
        >
          {/* User info */}
          <div className="px-4 py-3">
            <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
            {user.email && <p className="text-xs text-stone-500 dark:text-zinc-400 truncate">{user.email}</p>}
          </div>

          <DropdownMenu.Separator className="h-px bg-border" />

          {/* Theme — single row with segmented control */}
          {mounted && (
            <div
              className="flex items-center justify-between gap-3 px-4 py-2.5"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm text-foreground">Theme</span>
              <div className="flex border border-border rounded-md overflow-hidden">
                {themeSegments.map((seg) => {
                  const active = theme === seg.value;
                  const Icon = seg.icon;
                  return (
                    <button
                      key={seg.value}
                      onClick={() => setTheme(seg.value)}
                      className={`flex items-center justify-center w-8 h-7 transition-colors ${
                        active
                          ? "bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.15)] text-primary"
                          : "text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300"
                      }`}
                      title={seg.label}
                    >
                      <Icon size={14} strokeWidth={2.5} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DropdownMenu.Separator className="h-px bg-border" />

          {/* Navigation */}
          <DropdownMenu.Item
            onClick={() => router.push("/profile")}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground cursor-pointer outline-none hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors"
          >
            <User {...MENU_ICON} className="text-stone-500 dark:text-zinc-400" />
            Profile
          </DropdownMenu.Item>

          {isHost && (
            <DropdownMenu.Item
              onClick={() => router.push("/host/settings")}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground cursor-pointer outline-none hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors"
            >
              <Settings {...MENU_ICON} className="text-stone-500 dark:text-zinc-400" />
              Settings
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="h-px bg-border" />

          {/* Sign out */}
          <DropdownMenu.Item
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#ef4444] cursor-pointer outline-none hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors"
          >
            <LogOut size={16} strokeWidth={2.5} />
            Sign out
          </DropdownMenu.Item>

          <div className="h-1" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
