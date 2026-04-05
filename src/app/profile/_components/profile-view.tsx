"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { PlayerHeader } from "@/app/_components/player-header";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { ConfirmModal } from "@/app/_components/confirm-modal";
import {
  Gamepad2,
  Target,
  Trophy,
  CalendarDays,
  Pencil,
  Check,
  X,
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
      setUsernameError("5–16 characters required.");
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
      router.push("/join");
    }
    setDeleting(false);
  }

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
                <p className="text-[11px] text-muted-foreground">5–16 chars. Letters, numbers, underscores. Changes allowed once every 14 days.</p>
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
            />
            <AccountRow
              name="Telegram"
              connected={providers.includes("telegram")}
            />
            <AccountRow name="Wallet" connected={false} comingSoon />
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-500 mb-3">
            Account
          </h2>
          <div className="space-y-2">
            <button
              onClick={() => setShowSignOut(true)}
              className="w-full text-left text-sm text-stone-600 dark:text-zinc-400 hover:text-foreground transition-colors py-2"
            >
              Sign out
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="w-full text-left text-sm text-[#ef4444] hover:text-[#dc2626] transition-colors py-2"
            >
              Delete account
            </button>
          </div>
        </section>

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
        <ConfirmModal
          title="Delete account"
          description="This will permanently delete your account, game history, and all associated data. This cannot be undone."
          confirmLabel="Delete my account"
          variant="danger"
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

function AccountRow({
  name,
  connected,
  comingSoon = false,
}: {
  name: string;
  connected: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-foreground">{name}</span>
      {comingSoon ? (
        <span className="text-[10px] font-medium bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.15)] text-violet-700 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
          Soon
        </span>
      ) : connected ? (
        <span className="text-xs font-medium text-correct">Connected</span>
      ) : (
        <span className="text-xs text-muted-foreground">Not linked</span>
      )}
    </div>
  );
}
