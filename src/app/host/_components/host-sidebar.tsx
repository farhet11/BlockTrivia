"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Plus, BarChart3, FileText, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const ICON_SW = 1.5; // sidebar icons — thinnest, matches Claude's sidebar elegance

type NavItem = {
  label: string;
  href: string | null;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  comingSoon?: boolean;
};

type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Events",
    items: [
      { label: "My Events", href: "/host", icon: CalendarDays },
      { label: "Create Event", href: "/host/events/new", icon: Plus },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Analytics", href: null, icon: BarChart3, comingSoon: true },
      { label: "Question Bank", href: null, icon: FileText, comingSoon: true },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", href: "/profile", icon: Settings },
    ],
  },
];

export function HostSidebar({
  user,
  collapsed,
  onToggleCollapse,
}: {
  user: { id: string; displayName: string; email: string };
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  function isActive(href: string | null) {
    if (!href) return false;
    if (href === "/host") return pathname === "/host";
    return pathname.startsWith(href);
  }

  // ── Expanded sidebar ──────────────────────────────────────────────────────
  const expandedContent = (
    <nav className="flex flex-col h-full bg-surface border-r border-border">
      {/* Top: collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex items-center gap-3 h-10 px-4 text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300 transition-colors duration-150 shrink-0"
        title="Collapse sidebar"
      >
        <PanelLeftClose size={18} strokeWidth={ICON_SW} />
        <span className="text-xs font-medium">Collapse</span>
      </button>

      {/* Nav sections */}
      <div className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-500 px-3 mb-1.5">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                if (item.comingSoon) {
                  return (
                    <li key={item.label}>
                      <span className="flex items-center gap-3 h-10 px-3 text-sm font-medium text-stone-400 dark:text-zinc-600 cursor-default select-none">
                        <Icon size={20} strokeWidth={ICON_SW} />
                        {item.label}
                        <span className="ml-auto text-[10px] font-medium bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.15)] text-violet-700 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                          Soon
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href!}

                      className={`flex items-center gap-3 h-10 px-3 text-sm font-medium transition-colors duration-150 ${
                        active
                          ? "border-l-[3px] border-primary bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.15)] text-primary"
                          : "border-l-[3px] border-transparent text-stone-600 dark:text-zinc-400 hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23]"
                      }`}
                    >
                      <Icon size={20} strokeWidth={ICON_SW} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom: user info (no avatar — it's in the header) */}
      <div className="border-t border-border px-4 py-3">
        <Link href="/profile" className="block min-w-0 hover:opacity-80 transition-opacity">
          <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
          <p className="text-xs text-stone-500 dark:text-zinc-400 truncate">{user.email}</p>
        </Link>
      </div>
    </nav>
  );

  // ── Collapsed icon rail ────────────────────────────────────────────────────
  // Mobile: w-11 (44px) to save space. Desktop: w-14 (56px).
  // The parent aside controls the actual width; the nav fills it.
  const collapsedContent = (
    <nav className="flex flex-col items-center h-full bg-surface border-r border-border">
      {/* Top: expand toggle */}
      <button
        onClick={onToggleCollapse}
        className="w-full h-10 flex items-center justify-center text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300 transition-colors duration-150 shrink-0"
        title="Expand sidebar"
      >
        <PanelLeftOpen size={18} strokeWidth={ICON_SW} />
      </button>

      {/* Icon-only nav */}
      <div className="flex-1 py-2 flex flex-col items-center gap-1 overflow-y-auto">
        {NAV_SECTIONS.flatMap((section) =>
          section.items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            if (item.comingSoon) {
              return (
                <div
                  key={item.label}
                  className="w-full h-10 flex items-center justify-center text-stone-400 dark:text-zinc-600 cursor-default"
                  title={`${item.label} (coming soon)`}
                >
                  <Icon size={20} strokeWidth={ICON_SW} />
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href!}
                className={`w-full h-10 flex items-center justify-center transition-colors duration-150 ${
                  active
                    ? "text-primary"
                    : "text-stone-500 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-200"
                }`}
                title={item.label}
              >
                <Icon size={20} strokeWidth={active ? 2.25 : ICON_SW} />
              </Link>
            );
          })
        )}
      </div>
    </nav>
  );

  return (
    <aside
      className={`flex flex-col fixed top-0 bottom-0 left-0 z-40 pt-14 bg-surface border-r border-border transition-[width] duration-300 ease-out overflow-hidden ${
        collapsed ? "w-11 md:w-14" : "w-11 md:w-60"
      }`}
    >
      {/* Mobile: always icon rail. Desktop: respects collapsed state */}
      <div className="md:hidden h-full">{collapsedContent}</div>
      <div className="hidden md:flex md:flex-col h-full">
        {collapsed ? collapsedContent : <div className="w-60 min-w-60 h-full">{expandedContent}</div>}
      </div>
    </aside>
  );
}
