"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { GlobalNav } from "@/app/_components/global-nav";
import { GlobalFooter } from "@/app/_components/global-footer";
import {
  TelegramLoginButton,
  type TelegramAuthResult,
} from "@/app/_components/telegram-login-button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  async function handleGoogle() {
    if (!termsAccepted) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Pass ?terms=1 so the callback can stamp terms_accepted_at
        redirectTo: `${window.location.origin}/auth/callback?terms=1`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setError(error.message);
  }

  const handleTelegramAuth = useCallback(
    async ({ token_hash }: TelegramAuthResult) => {
      if (!termsAccepted) return;
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
      // Stamp consent for Telegram (post-auth client-side update)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ terms_accepted_at: new Date().toISOString() })
          .eq("id", user.id)
          .is("terms_accepted_at", null);
      }
      window.location.href = "/host";
    },
    [supabase, termsAccepted]
  );

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });
    if (error) {
      setError(error.message);
    } else {
      // Stamp consent for email OTP flow
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ terms_accepted_at: new Date().toISOString() })
          .eq("id", user.id)
          .is("terms_accepted_at", null);
      }
      window.location.href = "/host";
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <GlobalNav />
      <main className="flex flex-1 items-center justify-center px-4 pt-14">
        <div className="w-full max-w-sm space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {step === "otp" ? "Check your email" : "Welcome back"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {step === "otp"
                ? `We sent a 6-digit code to ${email}`
                : "Sign in to manage your trivia events."}
            </p>
          </div>

          {step === "email" ? (
            <div className="space-y-4">
              {/* ToS consent */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary cursor-pointer"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  I have read and agree to the{" "}
                  <a href="/terms" target="_blank" className="text-foreground underline underline-offset-2 hover:text-primary transition-colors">Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy" target="_blank" className="text-foreground underline underline-offset-2 hover:text-primary transition-colors">Privacy Policy</a>.
                </span>
              </label>

              {/* Telegram — first for Web3 audience */}
              <div className={!termsAccepted ? "opacity-40 pointer-events-none select-none" : ""}>
                <TelegramLoginButton onAuth={handleTelegramAuth} returnUrl={typeof window !== "undefined" ? `${window.location.origin}/host` : "/host"} />
              </div>

              {/* Google OAuth */}
              <Button
                variant="outline"
                className="w-full h-11 gap-3 font-medium"
                onClick={handleGoogle}
                disabled={!termsAccepted}
              >
                <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-4 text-xs text-muted-foreground uppercase tracking-widest">
                    or
                  </span>
                </div>
              </div>

              {/* Email OTP */}
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  disabled={loading || !termsAccepted}
                  className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
                >
                  {loading ? "Sending..." : "Send Code"}
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                  className="w-full h-11 bg-surface border border-border px-4 text-foreground text-center text-xl tracking-[0.5em] placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                  placeholder="000000"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
              >
                {loading ? "Verifying..." : "Verify Code"}
              </Button>

              <button
                type="button"
                onClick={() => { setStep("email"); setError(null); setOtp(""); }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Use a different email
              </button>
            </form>
          )}
        </div>
      </main>
      <GlobalFooter />
    </div>
  );
}
