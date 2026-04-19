import Link from "next/link";

/**
 * Global footer.
 *
 * - `default` (Warm Canvas) — used on app/utility pages (profile, login, etc).
 * - `ink` (Ink block) — used on marketing pages to close the section rhythm.
 *   Per DESIGN.md §5 "Section Rhythm".
 */
export function GlobalFooter({ tone = "default" }: { tone?: "default" | "ink" } = {}) {
  const isInk = tone === "ink";
  const containerStyle = isInk
    ? { background: "var(--bt-ink)", color: "var(--bt-stone)", borderTopColor: "var(--bt-border)" }
    : undefined;
  const linkClass = isInk
    ? "text-xs hover:text-white transition-colors"
    : "text-xs text-muted-foreground hover:text-foreground transition-colors";
  const textClass = isInk ? "text-xs" : "text-xs text-muted-foreground";

  return (
    <footer className="border-t border-border bg-background" style={containerStyle}>
      <div className="w-full max-w-[1600px] mx-auto px-8 py-4 flex items-center justify-between">
        <p className={textClass}>
          BlockTrivia &copy; {new Date().getFullYear()}
        </p>
        <div className="flex items-center gap-6">
          <Link href="/terms" className={linkClass}>
            Terms
          </Link>
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>
          <a
            href="https://x.com/BlockTrivia_com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter / X"
            className={isInk ? "hover:text-white transition-colors" : "text-muted-foreground hover:text-foreground transition-colors"}
          >
            <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
