import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function GlobalNav() {
  return (
    <header className="fixed top-0 left-0 right-0 border-b border-border bg-background/90 backdrop-blur-sm z-50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/logo-light.svg"
            alt="BlockTrivia"
            width={92}
            height={22}
            className="h-[22px] w-auto dark:hidden"
          />
          <Image
            src="/logo-dark.svg"
            alt="BlockTrivia"
            width={92}
            height={22}
            className="h-[22px] w-auto hidden dark:block"
          />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
