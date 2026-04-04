import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function GlobalNav() {
  return (
    <header className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center shrink-0">
          <img
            src="/logo-light.svg"
            alt="BlockTrivia"
            className="h-[22px] dark:hidden"
          />
          <img
            src="/logo-dark.svg"
            alt="BlockTrivia"
            className="h-[22px] hidden dark:block"
          />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
