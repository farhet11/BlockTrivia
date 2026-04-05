"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { PlayerHeader } from "@/app/_components/player-header";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { ConfirmModal } from "@/app/_components/confirm-modal";
import { TelegramLoginButton, type TelegramAuthResult } from "@/app/_components/telegram-login-button";
import {
  Gamepad2,
  Target,
  Trophy,
  CalendarDays,
  Pencil,
  Check,
  X,
  LogOut,
} from "lucide-react";

type GameEntry = {
  title: string;
  joinCode: string;
  date: string;
  rank: number;
  score: number;
  accuracy: number;
  isTop10Pct: boolean;
};

export function ProfileView({
  user,
  stats,
  gameHistory,
  providers,
}: {
  user: {
    id: string;
    displayName: string;
    username: string | null;
    email: string;
    role: "super_admin" | "host" | "player";
    avatarUrl: string | null;
  };
  stats: {
    totalGames: number;
    avgAccuracy: number;
    bestRank: number | null;
  };
  gameHistory: GameEntry[];
  providers: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Edit name state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);

  // Edit username state
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Danger zone
  const [showSignOut, setShowSignOut] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", user.id);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function saveUsername() {
    const trimmed = usernameInput.trim();
    if (trimmed.length < 5 || trimmed.length > 16) {
      setUsernameError("5-16 characters required.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError("Letters, numbers, and underscores only.");
      return;
    }
    setSavingUsername(true);
    setUsernameError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);
    if (error) {
      if (error.code === "23505") {
        setUsernameError("That username is taken.");
      } else if (error.message.includes("14 days")) {
        setUsernameError("You can only change your username once every 14 days.");
      } else {
        setUsernameError(error.message);
      }
      setSavingUsername(false);
      return;
    }
    setSavingUsername(false);
    setEditingUsername(false);
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      await supabase.auth.signOut();
      router.push("/login");
    }
    setDeleting(false);
  }

  // ── Account linking ──────────────────────────────────────────────────────
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [showTelegramLink, setShowTelegramLink] = useState(false);

  async function handleLinkGoogle() {
    setLinkingProvider("google");
    await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  const handleTelegramAuth = useCallback(async (result: TelegramAuthResult) => {
    // Telegram bot flow returns a token_hash — sign in with it to link
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "telegram" as never,
      token: result.token_hash,
    });
    if (!error) {
      setShowTelegramLink(false);
      router.refresh();
    }
  }, [supabase, router]);

  const isHost = user.role === "host" || user.role === "super_admin";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <PlayerHeader user={user} />

      <div className="flex-1 max-w-lg mx-auto w-full px-5 pt-14 py-8 space-y-8">
        {/* Identity card */}
        <section className="flex items-start gap-4">
          <PlayerAvatar seed={user.id} name={user.displayName} size={72} />
          <div className="flex-1 min-w-0 pt-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={30}
                  autoFocus
                  className="flex-1 min-w-0 text-lg font-heading font-bold bg-transparent border-b-2 border-primary outline-none text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setName(user.displayName);
                      setEditing(false);
                    }
                  }}
                />
                <button
                  onClick={saveName}
                  disabled={saving || name.trim().length < 2}
                  className="p-1 text-primary hover:text-primary/80 transition-colors"
                >
                  <Check size={18} strokeWidth={2} />
                </button>
                <button
                  onClick={() => {
                    setName(user.displayName);
                    setEditing(false);
                  }}
                  className="p-1 text-stone-400 hover:text-foreground transition-colors"
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-xl font-bold text-foreground truncate">
                  {user.displayName}
                </h1>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 text-stone-400 dark:text-zinc-500 hover:text-primary transition-colors shrink-0"
                  title="Edit display name"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
              </div>
            )}
            {/* Username */}
            {editingUsername ? (
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">@</span>
                  <input
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16));
                      setUsernameError(null);
                    }}
                    maxLength={16}
                    autoFocus
                    className="flex-1 min-w-0 text-sm bg-transparent border-b-2 border-primary outline-none text-foreground"
                    placeholder="your_handle"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveUsername();
                      if (e.key === "Escape") {
                        setUsernameInput(user.username ?? "");
                        setEditingUsername(false);
                        setUsernameError(null);
                      }
                    }}
                  />
                  <button
                    onClick={saveUsername}
                    disabled={savingUsername || usernameInput.trim().length < 5}
                    className="p-1 text-primary hover:text-primary/80 transition-colors"
                  >
                    <Check size={16} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => {
                      setUsernameInput(user.username ?? "");
                      setEditingUsername(false);
                      setUsernameError(null);
                    }}
                    className="p-1 text-stone-400 hover:text-foreground transition-colors"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
                {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
                <p className="text-[11px] text-muted-foreground">5-16 chars. Letters, numbers, underscores. Changes allowed once every 14 days.</p>
              </div>
            ) : user.username ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-stone-500 dark:text-zinc-400">
                  @{user.username}
                </p>
                <button
                  onClick={() => setEditingUsername(true)}
                  className="p-0.5 text-stone-400 dark:text-zinc-500 hover:text-primary transition-colors shrink-0"
                  title="Edit username"
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingUsername(true)}
                className="mt-0.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Set a username
              </button>
            )}
            <p className="text-sm text-stone-500 dark:text-zinc-400 truncate mt-0.5">
              {user.email}
            </p>
            <p className="text-xs text-stone-400 dark:text-zinc-500 mt-1 capitalize">
              {user.role === "super_admin" ? "Admin" : user.role}
            </p>
          </div>
        </section>

        {/* Role-conditional section */}
        {isHost ? (
          <Link
            href="/host"
            className="flex items-center gap-3 border border-border bg-surface p-4 hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors"
          >
            <CalendarDays
              size={20}
              strokeWidth={1.5}
              className="text-primary shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">My Events</p>
              <p className="text-xs text-muted-foreground">
                Manage your trivia events
              </p>
            </div>
            <span className="text-xs text-muted-foreground">&rarr;</span>
          </Link>
        ) : (
          <div className="border border-dashed border-primary/30 bg-primary/5 p-4 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              Host your own events
            </p>
            <p className="text-xs text-muted-foreground">
              Create and run live trivia for your community.
            </p>
            <a
              href="mailto:support@blocktrivia.xyz?subject=Host%20Access%20Request"
              className="inline-block text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Request Access &rarr;
            </a>
          </div>
        )}

        {/* Stats */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-500 mb-3">
            Stats
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={Gamepad2}
              value={String(stats.totalGames)}
              label="Games"
            />
            <StatCard
              icon={Target}
              value={stats.totalGames > 0 ? `${stats.avgAccuracy}%` : "—"}
              label="Accuracy"
            />
            <StatCard
              icon={Trophy}
              value={stats.bestRank ? `#${stats.bestRank}` : "—"}
              label="Best Finish"
            />
          </div>
        </section>

        {/* Game history */}
        {gameHistory.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-500 mb-3">
              Recent Games
            </h2>
            <div className="border border-border divide-y divide-border">
              {gameHistory.map((game, i) => (
                <Link
                  key={`${game.joinCode}-${i}`}
                  href={`/results/${game.joinCode}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {game.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {game.date
                        ? new Date(game.date).toLocaleDateString()
                        : ""}
                      {" · "}#{game.rank}
                      {" · "}{game.accuracy}%
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {game.score}
                    </p>
                    {game.isTop10Pct && (
                      <p className="text-[10px] font-bold text-primary">
                        Top 10%
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Linked accounts */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-500 mb-3">
            Linked Accounts
          </h2>
          <div className="border border-border divide-y divide-border">
            <AccountRow
              name="Google"
              connected={providers.includes("google")}
              onLink={handleLinkGoogle}
              linking={linkingProvider === "google"}
            />
            <div>
              <AccountRow
                name="Telegram"
                connected={providers.includes("telegram")}
                onLink={() => setShowTelegramLink(!showTelegramLink)}
              />
              {showTelegramLink && !providers.includes("telegram") && (
                <div className="px-4 pb-3">
                  <TelegramLoginButton
                    onAuth={handleTelegramAuth}
                    returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/profile`}
                  />
                </div>
              )}
            </div>
            <AccountRow name="Wallet" connected={false} comingSoon />
          </div>
        </section>

        {/* Sign out — normal action, not danger zone */}
        <button
          onClick={() => setShowSignOut(true)}
          className="w-full flex items-center gap-2 text-sm text-stone-500 dark:text-zinc-400 hover:text-foreground transition-colors py-2"
        >
          <LogOut size={16} strokeWidth={1.5} />
          Sign out
        </button>

        {/* Danger zone — tucked under accordion */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-[11px] font-medium uppercase tracking-[0.5px] text-stone-400 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-500 transition-colors select-none">
            <svg
              className="size-3 transition-transform duration-200 group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Danger Zone
          </summary>
          <div className="mt-3 pl-5">
            <button
              onClick={() => setShowDelete(true)}
              className="w-full text-left text-sm text-[#ef4444] hover:text-[#dc2626] transition-colors py-2"
            >
              Delete account
            </button>
          </div>
        </details>

        <div className="pb-8" />
      </div>

      {/* Modals */}
      {showSignOut && (
        <ConfirmModal
          title="Sign out"
          description="You'll need to sign in again to access your account."
          confirmLabel="Sign out"
          variant="default"
          onConfirm={handleSignOut}
          onCancel={() => setShowSignOut(false)}
        />
      )}
      {showDelete && (
        <DeleteConfirmModal
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="border border-border bg-surface p-4 text-center space-y-1">
      <Icon
        size={20}
        strokeWidth={2}
        className="text-stone-500 dark:text-zinc-400 mx-auto"
      />
      <p className="font-heading text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400">
        {label}
      </p>
    </div>
  );
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  Google: (
    <svg className="size-4 text-stone-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  ),
  Telegram: (
    <svg className="size-4 text-stone-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  ),
  Wallet: (
    <svg className="size-4 text-stone-400 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  ),
};

function AccountRow({
  name,
  connected,
  comingSoon = false,
  onLink,
  linking = false,
}: {
  name: string;
  connected: boolean;
  comingSoon?: boolean;
  onLink?: () => void;
  linking?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {PROVIDER_ICONS[name]}
        <span className="text-sm text-foreground">{name}</span>
      </div>
      {comingSoon ? (
        <span className="text-[10px] font-medium bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.15)] text-violet-700 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
          Soon
        </span>
      ) : connected ? (
        <span className="text-xs font-medium text-correct">Connected</span>
      ) : onLink ? (
        <button
          onClick={onLink}
          disabled={linking}
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          {linking ? "Linking..." : "Link"}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">Not linked</span>
      )}
    </div>
  );
}

function DeleteConfirmModal({
  loading,
  onConfirm,
  onCancel,
}: {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const CONFIRM_TEXT = "delete my account";
  const confirmed = input.toLowerCase().trim() === CONFIRM_TEXT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm px-4">
      <div className="bg-background border border-border w-full max-w-md p-6 space-y-4 shadow-lg select-none">
        <h2 className="font-heading text-lg font-bold text-foreground">Delete account</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your account will be <strong className="text-foreground">scheduled for deletion</strong>.
            After a 30-day grace period, all your data will be permanently removed.
          </p>
          <p>
            If you sign back in within 30 days, the deletion will be cancelled automatically.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-foreground">
            Type <span className="font-mono text-[#ef4444] font-medium">{CONFIRM_TEXT}</span> to confirm:
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            placeholder={CONFIRM_TEXT}
            autoFocus
            autoComplete="off"
            className="w-full border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-[#ef4444] transition-colors select-text"
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || loading}
            className="px-4 py-2 text-sm font-medium bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}
