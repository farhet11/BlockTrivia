"use client";

import { useState, useEffect } from "react";
import { HostSidebar } from "./host-sidebar";
import { AppHeader } from "@/app/_components/app-header";

const SIDEBAR_KEY = "bt-sidebar-collapsed";

export function DashboardShell({
  user,
  children,
}: {
  user: { id: string; displayName: string; email: string; avatarUrl?: string | null };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col overflow-hidden">
      {/* Full-width fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background">
        <AppHeader user={user} avatarUrl={user.avatarUrl} logoHref="/host" isHost />
      </div>

      {/* Below header: sidebar + content (pt-14 offsets the fixed header) */}
      <div
        className={`flex flex-1 overflow-hidden pt-14 transition-[padding] duration-300 ease-out pl-11 ${
          collapsed ? "md:pl-14" : "md:pl-60"
        }`}
      >
        <HostSidebar
          user={user}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />

        <main className="flex-1 min-w-0 max-w-[1600px] mx-auto px-6 py-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
