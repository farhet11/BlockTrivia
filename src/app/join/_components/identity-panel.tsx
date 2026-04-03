"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  TelegramLoginButton,
  type TelegramAuthResult,
} from "@/app/_components/telegram-login-button";

type VerifiedEvent = {
  id: string;
  title: string;
  join_code: string;
  player_count: number;
};

export function IdentityPanel({
  event,
  onBack,
  onIdentityConfirmed,
}: {
  event: VerifiedEvent;
  onBack: () => void;
  onIdentityConfirmed?: (playerId: string) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<{ id: string; email?: string; name?: string } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");

  // Check if user is already authenticated (e.g. returning from OAuth)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "";
        setUser({ id: user.id, email: user.email ?? undefined, name });
        setDisplayName(name);
      }
    });
  }, [supabase]);

  const handleTelegramAuth = useCallback(
    async ({ token_hash, user: tgUser }: TelegramAuthResult) => {
      setError(null);
      setLoading(true);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash,
        type: "email",
      });
      if (verifyError) {
        setError(verifyError.message);
        setLoading(false);
        return;
      }
      setUser({ id: tgUser.id, name: tgUser.name });
      setDisplayName(tgUser.name);
      setLoading(false);
    },
    [supabase]
  );

  async function handleGoogle() {
    // Store event info so we can resume after OAuth redirect
    localStorage.setItem("bt_join_event_id", event.id);
    localStorage.setItem("bt_join_code", event.join_code);

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/join/${event.join_code}`,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/join/${event.join_code}`,
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setOtpStep("otp");
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });
    if (error) {
      setError(error.message);
    } else if (data.user) {
      const name = data.user.user_metadata?.full_name || email.split("@")[0];
      setUser({ id: data.user.id, email: data.user.email ?? undefined, name });
      setDisplayName(name);
    }
    setLoading(false);
  }

  async function handleJoinGame() {
    if (!user) return;
    if (!displayName.trim()) {
      setError("Pick a display name.");
      return;
    }

    setJoining(true);
    setError(null);

    // Update display name on profile
    await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", user.id);

    // Join the event
    const { error: joinError } = await supabase.from("event_players").insert({
      event_id: event.id,
      player_id: user.id,
    });

    if (joinError) {
      // Might already be joined
      if (joinError.code === "23505") {
        // Duplicate — already joined, proceed to liveness challenge
        onIdentityConfirmed?.(user.id);
        setJoining(false);
        return;
      }
      setError(joinError.message);
      setJoining(false);
      return;
    }

    // Proceed to liveness challenge instead of directly to lobby
    onIdentityConfirmed?.(user.id);
  }

  // Step 1: Not authenticated — show auth options
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-5">
        <div className="pt-4 pb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        {/* Event confirmation */}
        <div className="bg-accent-light border border-primary/20 p-4 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-correct animate-pulse" />
            <span className="text-xs font-bold text-accent-text uppercase tracking-wider">
              Game Found
            </span>
          </div>
          <p className="font-heading text-lg font-semibold text-foreground">
            {event.title}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {event.player_count} player{event.player_count !== 1 ? "s" : ""} waiting
          </p>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              Sign in to play
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              We need your email to track your score and rank.
            </p>
          </div>

          {/* Telegram — first for Web3 audience */}
          <TelegramLoginButton
            onAuth={handleTelegramAuth}
            returnUrl={typeof window !== "undefined" ? `${window.location.origin}/join/${event.join_code}` : `/join/${event.join_code}`}
          />

          {/* Google */}
          <Button
            onClick={handleGoogle}
            variant="outline"
            className="w-full h-12 gap-3 font-medium text-base"
          >
            <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </Button>

          {/* Email OTP alternative */}
          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Use email instead
            </button>
          ) : otpStep === "email" ? (
            <>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-widest">
                    or
                  </span>
                </div>
              </div>
              <form onSubmit={handleSendOtp} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                  placeholder="you@example.com"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  variant="outline"
                  className="w-full h-11 font-medium"
                >
                  {loading ? "Sending..." : "Send Code"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="bg-surface border border-border p-4 space-y-1">
                <p className="text-sm font-medium text-foreground">Check your inbox</p>
                <p className="text-sm text-muted-foreground">
                  We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>.
                  Click it to continue — it will bring you back here automatically.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">Received a 6-digit code instead?</p>
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  className="w-full h-11 bg-surface border border-border px-4 text-foreground text-center text-xl tracking-[0.5em] placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder="000000"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  variant="outline"
                  className="w-full h-11 font-medium"
                >
                  {loading ? "Verifying..." : "Verify Code"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setOtpStep("email"); setOtp(""); setError(null); }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Try a different email
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    );
  }

  // Step 2: Authenticated — choose display name + join
  return (
    <div className="max-w-lg mx-auto px-5">
      <div className="pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* Event confirmation */}
      <div className="bg-accent-light border border-primary/20 p-4 mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-correct animate-pulse" />
          <span className="text-xs font-bold text-accent-text uppercase tracking-wider">
            Game Found
          </span>
        </div>
        <p className="font-heading text-lg font-semibold text-foreground">
          {event.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Signed in as {user.email ?? user.name}
        </p>
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            Choose your name
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            This is how you'll appear on the leaderboard.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setError(null);
            }}
            maxLength={20}
            autoFocus
            className="w-full h-12 bg-surface border border-border px-4 text-foreground text-lg placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
            placeholder="Enter your alias"
          />
          <p className="text-xs text-muted-foreground">
            Pre-filled from your account — change it if you'd like.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleJoinGame}
          disabled={joining || !displayName.trim()}
          className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary-hover font-medium text-base"
        >
          {joining ? "Joining..." : "Join Game"}
        </Button>
      </section>
    </div>
  );
}
