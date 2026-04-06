"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AppHeader } from "@/app/_components/app-header";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { ConfirmModal } from "@/app/_components/confirm-modal";
import { GlobalFooter } from "@/app/_components/global-footer";
import { TelegramLoginButton, type TelegramAuthResult } from "@/app/_components/telegram-login-button";
import { Pencil, Check, X, LogOut, Camera, ChevronRight, Trash2 } from "lucide-react";

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

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [showSignOut, setShowSignOut] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [showTelegramLink, setShowTelegramLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [showRemovePhoto, setShowRemovePhoto] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);
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
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
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

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("File too large. Max 5 MB.");
      setTimeout(() => setAvatarError(null), 4000);
      e.target.value = "";
      return;
    }

    setAvatarError(null);
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (uploadError) {
      console.error("Avatar upload failed:", uploadError);
      setAvatarError("Upload failed. Try a JPG, PNG or WebP under 5 MB.");
      setTimeout(() => setAvatarError(null), 4000);
    } else {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl + `?v=${Date.now()}`);
    }
    setUploadingAvatar(false);
    e.target.value = "";
  }

  async function handleDeleteAvatar() {
    setUploadingAvatar(true);
    const isStorageUrl = (avatarUrl ?? "").includes("/storage/v1/object/public/avatars/");
    if (isStorageUrl) {
      const ext = avatarUrl!.split(".").pop()?.split("?")[0] ?? "jpg";
      await supabase.storage.from("avatars").remove([`${user.id}/avatar.${ext}`]);
    }
    await supabase.from("profiles").update({ avatar_url: "none" }).eq("id", user.id);
    setAvatarUrl(null);
    setUploadingAvatar(false);
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

  const handleTelegramAuth = useCallback(
    async (result: TelegramAuthResult) => {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "telegram" as never,
        token: result.token_hash,
      });
      if (!error) {
        setShowTelegramLink(false);
        router.refresh();
      }
    },
    [supabase, router]
  );

  const isHost = user.role === "host" || user.role === "super_admin";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppHeader user={user} avatarUrl={avatarUrl} />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5 pt-20 pb-12 space-y-6">
        {/* Identity Hero */}
        <section className="flex flex-col items-center text-center pt-4">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            title="Change photo"
          >
            <PlayerAvatar seed={user.id} name={user.displayName} size={80} url={avatarUrl} />
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ borderRadius: 8 }}
            >
              {uploadingAvatar ? (
                <div className="size-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              ) : (
                <Camera size={16} className="text-white" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          {avatarError && (
            <p className="mt-1.5 text-xs text-destructive">{avatarError}</p>
          )}
          {avatarUrl && !uploadingAvatar && !avatarError && (
            <button
              onClick={() => setShowRemovePhoto(true)}
              className="mt-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove photo
            </button>
          )}

          <div className="mt-3">
            {editing ? (
              <div className="flex items-center gap-2 justify-center">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={30}
                  autoFocus
                  className="text-xl font-heading font-bold bg-transparent border-b-2 border-primary outline-none text-foreground text-center"
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
                  <Check size={16} strokeWidth={2} />
                </button>
                <button
                  onClick={() => {
                    setName(user.displayName);
                    setEditing(false);
                  }}
                  className="p-1 text-stone-400 hover:text-foreground transition-colors"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 justify-center">
                <h1 className="font-heading text-xl font-bold text-foreground">{user.displayName}</h1>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 text-stone-400 dark:text-zinc-500 hover:text-primary transition-colors shrink-0"
                  title="Edit display name"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {editingUsername ? (
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1.5 justify-center">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={usernameInput}
                  onChange={(e) => {
                    setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16));
                    setUsernameError(null);
                  }}
                  maxLength={16}
                  autoFocus
                  className="text-sm bg-transparent border-b-2 border-primary outline-none text-foreground text-center"
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
                  <Check size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={() => {
                    setUsernameInput(user.username ?? "");
                    setEditingUsername(false);
                    setUsernameError(null);
                  }}
                  className="p-1 text-stone-400 hover:text-foreground transition-colors"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
              {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
              <p className="text-[10px] text-muted-foreground">5-16 chars · letters, numbers, underscores · changes every 14 days</p>
            </div>
          ) : user.username ? (
            <div className="flex items-center gap-1 justify-center mt-0.5">
              <p className="text-sm text-muted-foreground">@{user.username}</p>
              <button
                onClick={() => setEditingUsername(true)}
                className="p-0.5 text-stone-400 dark:text-zinc-500 hover:text-primary transition-colors shrink-0"
                title="Edit username"
              >
                <Pencil size={11} strokeWidth={2} />
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

          <p className="text-[11px] text-muted-foreground/60 mt-1 tabular-nums">{user.email}</p>
        </section>

        {/* Stats Strip */}
        <section className="grid grid-cols-3 divide-x divide-border border border-border">
          <StatTile value={String(stats.totalGames)} label="Games" />
          <StatTile value={stats.totalGames > 0 ? `${stats.avgAccuracy}%` : "—"} label="Accuracy" />
          <StatTile value={stats.bestRank ? `#${stats.bestRank}` : "—"} label="Best Finish" />
        </section>

        {/* Role CTA */}
        {isHost ? (
          <Link
            href="/host"
            className="flex items-center justify-between px-4 py-3.5 bg-accent-light border border-primary/20 hover:border-primary/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">My Events</p>
              <p className="text-xs text-muted-foreground">Manage your trivia events</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </Link>
        ) : (
          <div className="border border-dashed border-primary/30 bg-primary/5 px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Host your own events</p>
              <p className="text-xs text-muted-foreground">Create and run live trivia for your community.</p>
            </div>
            <a
              href="mailto:support@blocktrivia.xyz?subject=Host%20Access%20Request"
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0 ml-3"
            >
              Request →
            </a>
          </div>
        )}

        {/* Game history */}
        {gameHistory.length > 0 && (
          <section>
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Games
            </h2>
            <div className="space-y-2">
              {gameHistory.map((game, i) => (
                <Link
                  key={`${game.joinCode}-${i}`}
                  href={`/results/${game.joinCode}`}
                  className="flex items-center gap-3.5 px-4 py-3 border border-border hover:bg-warm-hover transition-colors"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-muted shrink-0">
                    <span className="font-heading text-sm font-bold tabular-nums">#{game.rank}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{game.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatGameDate(game.date)} · {game.accuracy}% accuracy
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-foreground">{game.score.toLocaleString()}</p>
                    {game.isTop10Pct && <p className="text-[9px] font-bold text-primary uppercase tracking-wider">Top 10%</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {gameHistory.length === 0 && (
          <section className="border border-dashed border-border py-8 text-center">
            <p className="text-sm text-muted-foreground">No games played yet</p>
            <Link href="/join" className="mt-2 inline-block text-xs text-primary hover:text-primary/80 transition-colors">
              Join a game →
            </Link>
          </section>
        )}

        {/* Connected Accounts */}
        <section>
          <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Connected Accounts
          </h2>
          <div className="flex flex-wrap gap-2">
            <AccountBadge
              name="Google"
              connected={providers.includes("google")}
              onLink={handleLinkGoogle}
              linking={linkingProvider === "google"}
            />
            <div>
              <AccountBadge
                name="Telegram"
                connected={providers.includes("telegram")}
                onLink={() => setShowTelegramLink(!showTelegramLink)}
              />
              {showTelegramLink && !providers.includes("telegram") && (
                <div className="mt-2">
                  <TelegramLoginButton
                    onAuth={handleTelegramAuth}
                    returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/profile`}
                  />
                </div>
              )}
            </div>
            <AccountBadge name="Wallet" connected={false} comingSoon />
          </div>
        </section>

        {/* Footer actions */}
        <div className="pt-2 flex flex-col gap-1">
          <button
            onClick={() => setShowSignOut(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            <LogOut size={15} strokeWidth={1.5} />
            Sign out
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-2 text-xs text-stone-400 dark:text-zinc-600 hover:text-destructive transition-colors py-1"
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Delete account
          </button>
        </div>
      </div>

      {/* Modals */}
      {showRemovePhoto && (
        <ConfirmModal
          title="Remove photo?"
          description="Your avatar will revert to the generated thumbdice image."
          confirmLabel="Remove"
          variant="default"
          onConfirm={() => { setShowRemovePhoto(false); handleDeleteAvatar(); }}
          onCancel={() => setShowRemovePhoto(false)}
        />
      )}
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

      <GlobalFooter />
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="py-4 text-center">
      <p className="font-heading text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function formatGameDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    <svg
      className="size-4 text-stone-400 dark:text-zinc-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  ),
};

function AccountBadge({
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
  if (comingSoon) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-full bg-muted/30">
        <div className="text-muted-foreground shrink-0">{PROVIDER_ICONS[name]}</div>
        <span className="text-xs text-muted-foreground">{name}</span>
        <span className="text-[9px] font-medium text-muted-foreground ml-0.5">Soon</span>
      </div>
    );
  }

  return (
    <button
      onClick={onLink}
      disabled={linking || connected}
      className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-full hover:bg-warm-hover transition-colors disabled:cursor-default"
    >
      <div className="text-muted-foreground shrink-0">{PROVIDER_ICONS[name]}</div>
      <span className="text-xs text-foreground">{name}</span>
      {connected ? (
        <span className="text-[9px] font-medium text-correct ml-0.5">✓</span>
      ) : (
        <span className="text-[9px] text-muted-foreground ml-0.5">Link</span>
      )}
    </button>
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
          <p>If you sign back in within 30 days, the deletion will be cancelled automatically.</p>
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
