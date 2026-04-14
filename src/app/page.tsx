import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlobalNav } from "./_components/global-nav";
import { GlobalFooter } from "./_components/global-footer";
import { CanvasSection, InkSection, VioletSection } from "./_components/marketing/section";
import { NumberedStep } from "./_components/marketing/numbered-step";
import { StatsBar } from "./_components/marketing/stats-bar";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalNav />

      <main className="flex-1 pt-14">
        {/* ── Hero (Warm Canvas) ────────────────────────────────────────── */}
        <CanvasSection size="tall">
          <div className="text-center space-y-8">
            <div className="space-y-5">
              <h1
                className="font-heading mx-auto max-w-3xl"
                style={{
                  fontSize: "clamp(52px, 8vw, 96px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                Community Intelligence,{" "}
                <span className="text-primary">Gamified.</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Real-time trivia for Web3 communities. Instant leaderboard. Zero cheating.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link href="/join" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto h-12 px-6 bg-primary text-primary-foreground hover:bg-primary-hover font-heading font-medium">
                  Join a Game
                </Button>
              </Link>
              <Link href="/host" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto h-12 px-6 font-heading font-medium">
                  Host an Event
                </Button>
              </Link>
            </div>
          </div>
        </CanvasSection>

        {/* ── Stats / social proof (Ink) ────────────────────────────────── */}
        <InkSection>
          <StatsBar
            tone="dark"
            stats={[
              { number: "12k+", label: "Players competing" },
              { number: "340", label: "Live events run" },
              { number: "97%", label: "Cheat-free finishes" },
            ]}
          />
        </InkSection>

        {/* ── How it works (Warm Canvas + numbered steps) ────────────────── */}
        <CanvasSection>
          <div className="space-y-12">
            <h2
              className="font-heading text-center"
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
              }}
            >
              How it works
            </h2>
            <div className="grid sm:grid-cols-3 gap-8 sm:gap-6 max-w-4xl mx-auto">
              <Step
                n={1}
                title="Create your event"
                body="Build rounds in minutes. Import questions from JSON or write them in-app."
              />
              <Step
                n={2}
                title="Players join"
                body="Share a 5-character code or QR. No app, no wallet, no friction."
              />
              <Step
                n={3}
                title="Watch the leaderboard"
                body="Real-time scoring exposes who actually knows your protocol."
              />
            </div>
          </div>
        </CanvasSection>

        {/* ── CTA block (Violet — ONE per page max) ──────────────────────── */}
        <VioletSection>
          <div className="text-center space-y-6 max-w-2xl mx-auto">
            <h2
              className="font-heading"
              style={{
                fontSize: "clamp(32px, 5vw, 56px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: "#ffffff",
              }}
            >
              Find out who really knows.
            </h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.8)" }}>
              Run your first event in under five minutes. Free for the first 100 players.
            </p>
            <div className="pt-2">
              <Link href="/host">
                <Button
                  className="h-12 px-7 font-heading font-medium hover:opacity-90 transition-opacity"
                  style={{ background: "#1a1917", color: "#ffffff" }}
                >
                  Host an Event
                </Button>
              </Link>
            </div>
          </div>
        </VioletSection>

        {/* ── Features (Warm Canvas) ─────────────────────────────────────── */}
        <CanvasSection>
          <div className="space-y-12">
            <h2
              className="font-heading text-center"
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
              }}
            >
              Built for live rooms.
            </h2>
            <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <Feature
                title="Server-authoritative scoring"
                body="Answers are validated server-side. The leaderboard is the truth."
              />
              <Feature
                title="Eight round types"
                body="MCQ, True/False, WipeOut, Closest Wins, and four more — mix and match."
              />
              <Feature
                title="CSV export"
                body="One click. Top 10% auto-flagged for follow-up."
              />
            </div>
          </div>
        </CanvasSection>
      </main>

      <GlobalFooter tone="ink" />
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="space-y-3">
      <NumberedStep n={n} />
      <h3 className="font-heading text-lg" style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <h3 className="font-heading text-lg" style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
