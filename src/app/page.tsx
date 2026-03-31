import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./_components/theme-toggle";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center space-y-8">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="space-y-6">
        <img src="/logo-light.svg" alt="BlockTrivia" className="h-10 mx-auto dark:hidden" />
        <img src="/logo-dark.svg" alt="BlockTrivia" className="h-10 mx-auto hidden dark:block" />
        <h1 className="font-heading text-2xl sm:text-3xl font-medium tracking-tight leading-snug">
          Community Intelligence,<br />
          <span className="text-primary">gamified.</span>
        </h1>
      </div>
      <div className="flex gap-3">
        <Link href="/join">
          <Button className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold">
            Join a Game
          </Button>
        </Link>
        <Link href="/host">
          <Button variant="outline" className="h-11 px-6 font-semibold">
            Host an Event
          </Button>
        </Link>
      </div>
    </main>
  );
}
