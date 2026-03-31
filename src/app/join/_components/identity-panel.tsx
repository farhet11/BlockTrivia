"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type VerifiedEvent = {
  id: string;
  title: string;
  join_code: string;
  player_count: number;
};

export function IdentityPanel({
  event,
  onBack,
}: {
  event: VerifiedEvent;
  onBack: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleAuth() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/game/${event.join_code}/lobby`,
      },
    });
  }

  async function handleJoinAsGuest() {
    if (!displayName.trim()) {
      setError("Pick a display name first.");
      return;
    }
    setLoading(true);
    setError(null);

    // Check if user is already authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Update display name on profile
      await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", user.id);

      // Join the event
      await supabase.from("event_players").insert({
        event_id: event.id,
        user_id: user.id,
        display_name: displayName.trim(),
      });

      router.push(`/game/${event.join_code}/lobby`);
    } else {
      // Anonymous sign-in
      const { data, error: authError } = await supabase.auth.signInAnonymously();

      if (authError || !data.user) {
        setError("Could not join. Try signing in with Google instead.");
        setLoading(false);
        return;
      }

      // Update display name
      await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", data.user.id);

      // Join the event
      await supabase.from("event_players").insert({
        event_id: event.id,
        user_id: data.user.id,
        display_name: displayName.trim(),
      });

      router.push(`/game/${event.join_code}/lobby`);
    }

    setLoading(false);
  }

  async function handleJoinWithGoogle() {
    if (!displayName.trim()) {
      setError("Pick a display name first.");
      return;
    }
    // Store display name in localStorage so callback can pick it up
    localStorage.setItem("bt_display_name", displayName.trim());
    localStorage.setItem("bt_event_id", event.id);
    await handleGoogleAuth();
  }

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Back button */}
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

      {/* Event confirmation banner */}
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

      {/* Identity form */}
      <section className="space-y-6">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            What should we call you?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            This is how you'll appear on the leaderboard.
          </p>
        </div>

        {/* Display name */}
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
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Auth options */}
        <div className="space-y-3">
          <Button
            onClick={handleJoinWithGoogle}
            variant="outline"
            className="w-full h-12 gap-3 font-medium"
          >
            <svg className="size-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>

          <Button
            onClick={handleJoinAsGuest}
            disabled={loading}
            className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold text-base"
          >
            {loading ? "Joining..." : "Join Game"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Join as guest — no account required
          </p>
        </div>
      </section>
    </div>
  );
}
