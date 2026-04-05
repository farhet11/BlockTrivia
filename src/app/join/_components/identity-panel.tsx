"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  TelegramLoginButton,
  type TelegramAuthResult,
} from "@/app/_components/telegram-login-button";

// ── Validation constants ────────────────────────────────────────────────────
const USERNAME_MIN = 5;
const USERNAME_MAX = 16;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const ALIAS_MIN = 2;
const ALIAS_MAX = 20;

type VerifiedEvent = {
  id: string;
  title: string;
  join_code: string;
  player_count: number;
  question_count: number;
  prizes: string | null;
  estimated_minutes: number | null;
  host_name: string | null;
  access_mode: "open" | "whitelist";
};

function GameFoundCard({
  event,
  subtitle,
}: {
  event: VerifiedEvent;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="border-l-[3px] border-l-primary bg-primary/5 border border-border p-4 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-correct animate-pulse" />
        <span className="text-xs font-bold text-primary uppercase tracking-wider">
          Game Found
        </span>
      </div>
      <p className="font-heading text-lg font-semibold text-foreground">
        {event.title}
      </p>
      <p className="text-sm text-stone-500 dark:text-zinc-400 mt-1">
        {event.question_count > 0 && <>{event.question_count} questions</>}
        {event.question_count > 0 && event.estimated_minutes && <> · </>}
        {event.estimated_minutes && <>~{event.estimated_minutes} min</>}
        {(event.question_count > 0 || event.estimated_minutes) && event.player_count > 0 && <> · </>}
        {event.player_count > 0 && <>{event.player_count} player{event.player_count !== 1 ? "s" : ""} waiting</>}
      </p>
      {event.host_name && (
        <p className="text-sm text-stone-500 dark:text-zinc-400 mt-0.5">
          Hosted by <span className="font-medium text-foreground">{event.host_name}</span>
          {event.access_mode === "whitelist" && (
            <span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5">
              Invite Only
            </span>
          )}
        </p>
      )}
      {subtitle && (
        <p className="text-sm text-stone-500 dark:text-zinc-400 mt-1">{subtitle}</p>
      )}
      {event.prizes && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-xs font-bold text-primary uppercase tracking-wider">Prizes</p>
          <p className="text-sm text-foreground mt-0.5">{event.prizes}</p>
        </div>
      )}
    </div>
  );
}

function validateUsername(value: string): string | null {
  if (!value.trim()) return "Username is required.";
  if (value.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (value.length > USERNAME_MAX) return `Max ${USERNAME_MAX} characters.`;
  if (!USERNAME_REGEX.test(value)) return "Letters, numbers, and underscores only.";
  return null;
}

function validateAlias(value: string): string | null {
  if (!value.trim()) return "Alias can't be empty.";
  if (value.trim().length < ALIAS_MIN) return `At least ${ALIAS_MIN} characters.`;
  if (value.trim().length > ALIAS_MAX) return `Max ${ALIAS_MAX} characters.`;
  return null;
}

export function IdentityPanel({
  event,
  onBack,
  onIdentityConfirmed,
}: {
  event: VerifiedEvent;
  onBack: () => void;
  onIdentityConfirmed?: (playerId: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<{ id: string; email?: string; name?: string } | null>(null);
  const [username, setUsername] = useState("");
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [usingAlias, setUsingAlias] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState("");

  // Username availability check
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const checkTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  function checkUsernameAvailability(value: string) {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    setUsernameStatus("idle");

    const validation = validateUsername(value);
    if (validation) return; // Don't check invalid usernames

    setUsernameStatus("checking");
    checkTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", value)
        .maybeSingle();

      // If it's the current user's own username, it's fine
      if (data && data.id !== user?.id) {
        setUsernameStatus("taken");
      } else {
        setUsernameStatus("available");
      }
    }, 400);
  }

  // Helper: load profile and determine first-time vs returning
  async function loadProfile(userId: string, fallbackName: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, full_name, username")
      .eq("id", userId)
      .single();

    if (profile?.username) {
      setUsername(profile.username);
      setIsFirstTime(false);
    } else {
      // Suggest a username from the fallback name
      const suggested = fallbackName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, USERNAME_MAX);
      const finalSuggested = suggested.length >= USERNAME_MIN ? suggested : "";
      setUsername(finalSuggested);
      if (finalSuggested) checkUsernameAvailability(finalSuggested);
      setIsFirstTime(true);
    }

    // Backfill full_name if missing
    return profile;
  }

  // Check if user is already authenticated (e.g. returning from OAuth)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (authUser) {
        const name =
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          authUser.email?.split("@")[0] ||
          "";
        setUser({ id: authUser.id, email: authUser.email ?? undefined, name });

        const profile = await loadProfile(authUser.id, name);

        // Backfill full_name if missing
        const fullName =
          authUser.user_metadata?.full_name ||
          [authUser.user_metadata?.first_name, authUser.user_metadata?.last_name].filter(Boolean).join(" ") ||
          authUser.user_metadata?.name ||
          null;
        if (fullName && !profile?.full_name) {
          supabase.from("profiles").update({ full_name: fullName }).eq("id", authUser.id).then(() => {});
        }
      }
    });
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const profile = await loadProfile(tgUser.id, tgUser.name);

      if (tgUser.name && !profile?.full_name) {
        supabase.from("profiles").update({ full_name: tgUser.name }).eq("id", tgUser.id).then(() => {});
      }
      setLoading(false);
    },
    [supabase] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleGoogle() {
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
      await loadProfile(data.user.id, name);
    }
    setLoading(false);
  }

  async function handleJoinGame() {
    if (!user) return;

    // Validate username for first-time users
    if (isFirstTime || editing) {
      const usernameError = validateUsername(username);
      if (usernameError) {
        setError(usernameError);
        return;
      }
    }

    // Validate alias if using one
    if (usingAlias) {
      const aliasError = validateAlias(alias);
      if (aliasError) {
        setError(aliasError);
        return;
      }
    }

    setJoining(true);
    setError(null);

    // Whitelist check: if event is invite-only, verify email is on the list
    if (event.access_mode === "whitelist") {
      const userEmail = user.email?.toLowerCase();
      if (!userEmail) {
        setError("This event is invite-only. We couldn't verify your email.");
        setJoining(false);
        return;
      }
      const { data: allowed } = await supabase
        .from("event_access_list")
        .select("id")
        .eq("event_id", event.id)
        .ilike("email", userEmail)
        .maybeSingle();

      if (!allowed) {
        setError("This event is invite-only. Your email is not on the guest list.");
        setJoining(false);
        return;
      }
    }

    // Save username to profile if first-time or editing
    if (isFirstTime || editing) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ username: username.trim() })
        .eq("id", user.id);

      if (updateError) {
        // Unique constraint violation = username taken
        if (updateError.code === "23505") {
          setError("That username is taken. Try another.");
        } else if (updateError.message.includes("username_format")) {
          setError("Letters, numbers, and underscores only (5–16 chars).");
        } else {
          setError(updateError.message);
        }
        setJoining(false);
        return;
      }
    }

    // Join the event
    const { error: joinError } = await supabase.from("event_players").insert({
      event_id: event.id,
      player_id: user.id,
    });

    const gameAlias = usingAlias ? alias.trim() : null;

    if (joinError) {
      if (joinError.code === "23505") {
        // Already joined — update alias if set
        if (gameAlias) {
          const { error: aliasError } = await supabase
            .from("event_players")
            .update({ game_alias: gameAlias })
            .eq("event_id", event.id)
            .eq("player_id", user.id);
          if (aliasError?.code === "23505") {
            setError("That alias is already taken in this game.");
            setJoining(false);
            return;
          }
        }
        onIdentityConfirmed?.(user.id);
        setJoining(false);
        return;
      }
      setError(joinError.message);
      setJoining(false);
      return;
    }

    // Set alias if provided
    if (gameAlias) {
      const { error: aliasError } = await supabase
        .from("event_players")
        .update({ game_alias: gameAlias })
        .eq("event_id", event.id)
        .eq("player_id", user.id);
      if (aliasError?.code === "23505") {
        setError("That alias is already taken in this game.");
        setJoining(false);
        return;
      }
    }

    onIdentityConfirmed?.(user.id);
  }

  // ── Step 1: Not authenticated — show auth options ─────────────────────────
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

        <GameFoundCard event={event} />

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

  // ── Step 2: Authenticated ─────────────────────────────────────────────────
  const showSetup = isFirstTime || editing;

  return (
    <div className="max-w-lg mx-auto px-5">
      <div className="pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} strokeWidth={2.5} className="text-stone-500 dark:text-zinc-400" />
          Back
        </button>
      </div>

      <GameFoundCard
        event={event}
        subtitle={<>Signed in as <span className="font-medium text-foreground">{user.email ?? user.name}</span></>}
      />

      {showSetup ? (
        /* ── First-time: pick a username ──────────────────────────────────── */
        <section className="space-y-6">
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              Pick a username
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your permanent handle across all games. Can only be changed once every 14 days.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                  const value = cleaned.slice(0, USERNAME_MAX);
                  setUsername(value);
                  setError(null);
                  checkUsernameAvailability(value);
                }}
                maxLength={USERNAME_MAX}
                autoFocus
                className={`w-full h-12 bg-surface border pl-9 pr-10 text-foreground text-lg placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors ${
                  usernameStatus === "taken" ? "border-destructive" : "border-border"
                }`}
                placeholder="your_handle"
              />
              {/* Availability indicator */}
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                {usernameStatus === "checking" && (
                  <span className="block w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                )}
                {usernameStatus === "available" && (
                  <svg className="w-5 h-5 text-correct" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {usernameStatus === "taken" && (
                  <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {USERNAME_MIN}–{USERNAME_MAX} characters. Letters, numbers, underscores.
              </p>
              {usernameStatus === "taken" && (
                <p className="text-xs text-destructive font-medium">Taken</p>
              )}
              {usernameStatus === "available" && (
                <p className="text-xs text-correct font-medium">Available</p>
              )}
            </div>
          </div>

          {/* Optional game alias */}
          {!usingAlias ? (
            <button
              type="button"
              onClick={() => setUsingAlias(true)}
              className="text-sm text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors"
            >
              Use a game alias for this event
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Game Alias
                </label>
                <button
                  type="button"
                  onClick={() => { setUsingAlias(false); setAlias(""); }}
                  className="text-xs text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors"
                >
                  remove
                </button>
              </div>
              <input
                type="text"
                value={alias}
                onChange={(e) => {
                  setAlias(e.target.value.slice(0, ALIAS_MAX));
                  setError(null);
                }}
                maxLength={ALIAS_MAX}
                className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                placeholder="Fun name for this game only..."
              />
              <p className="text-xs text-muted-foreground">
                {ALIAS_MIN}–{ALIAS_MAX} characters. Shown instead of @{username || "username"} on this game&apos;s leaderboard.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleJoinGame}
            disabled={joining || !username.trim() || usernameStatus === "taken" || usernameStatus === "checking"}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary-hover font-heading font-medium text-base disabled:opacity-50 transition-colors"
          >
            {joining ? "Joining..." : "Join Game"}
          </button>
        </section>
      ) : (
        /* ── Returning user: one-tap join ─────────────────────────────────── */
        <section className="space-y-6">
          <div className="border border-border bg-surface p-5 space-y-1">
            <p className="text-sm text-stone-500 dark:text-zinc-400">
              Joining as
            </p>
            <div className="flex items-center justify-between">
              <p className="font-heading text-xl font-bold text-foreground">
                @{username}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
              >
                change
              </button>
            </div>
          </div>

          {/* Optional game alias */}
          {!usingAlias ? (
            <button
              type="button"
              onClick={() => setUsingAlias(true)}
              className="text-sm text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors"
            >
              Use a game alias for this event
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Game Alias
                </label>
                <button
                  type="button"
                  onClick={() => { setUsingAlias(false); setAlias(""); }}
                  className="text-xs text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors"
                >
                  remove
                </button>
              </div>
              <input
                type="text"
                value={alias}
                onChange={(e) => {
                  setAlias(e.target.value.slice(0, ALIAS_MAX));
                  setError(null);
                }}
                maxLength={ALIAS_MAX}
                className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
                placeholder="Fun name for this game only..."
              />
              <p className="text-xs text-muted-foreground">
                {ALIAS_MIN}–{ALIAS_MAX} characters. Shown instead of @{username} on this game&apos;s leaderboard.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleJoinGame}
            disabled={joining}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary-hover font-heading font-medium text-base disabled:opacity-50 transition-colors"
          >
            {joining ? "Joining..." : "Join Game"}
          </button>
        </section>
      )}
    </div>
  );
}
