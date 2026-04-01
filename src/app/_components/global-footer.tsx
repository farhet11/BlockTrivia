export function GlobalFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="w-full max-w-[1600px] mx-auto px-8 py-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          BlockTrivia &copy; {new Date().getFullYear()}
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://x.com/BlockTrivia_com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter / X"
            className="text-muted-foreground hover:text-foreground transition-colors"
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
