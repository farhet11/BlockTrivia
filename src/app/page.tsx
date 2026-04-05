import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlobalNav } from "./_components/global-nav";
import { GlobalFooter } from "./_components/global-footer";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalNav />
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-14 text-center space-y-8">
        <div className="space-y-5">
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold leading-snug" style={{ letterSpacing: "-0.02em" }}>
            Community Intelligence,{" "}
            <span className="text-primary">Gamified.</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Real-time trivia for Web3 communities. Instant leaderboard. Zero cheating.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/join">
            <Button className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary-hover font-medium">
              Join a Game
            </Button>
          </Link>
          <Link href="/host">
            <Button variant="outline" className="h-11 px-6 font-medium">
              Host an Event
            </Button>
          </Link>
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
