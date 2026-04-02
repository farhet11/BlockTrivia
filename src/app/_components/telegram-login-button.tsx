"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface TelegramAuthResult {
  token_hash: string;
  user: { id: string; name: string; telegram_id: string };
}

const STORAGE_KEY = "bt_telegram_pending";

function savePending(token: string, deepLink: string) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, deepLink, expiresAt: Date.now() + 5 * 60 * 1000 })
    );
  } catch {}
}

function loadPending(): { token: string; deepLink: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPending() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (result: TelegramAuthResult) => void;
}) {
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const startPolling = useCallback((token: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/auth/telegram/status?token=${token}`);
        const statusData = await statusRes.json();
        if (statusData.completed) {
          stopPolling();
          clearPending();
          setState("idle");
          onAuth({ token_hash: statusData.token_hash, user: statusData.user });
        }
      } catch {
        // network blip — keep polling
      }
    }, 1500);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      clearPending();
      setState("idle");
    }, 5 * 60 * 1000);
  }, [stopPolling, onAuth]);

  // On mount: resume polling if there's a live pending token (handles mobile app-switch)
  useEffect(() => {
    const pending = loadPending();
    if (pending) {
      setState("waiting");
      setDeepLink(pending.deepLink);
      startPolling(pending.token);
    }
    return () => stopPolling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClick() {
    stopPolling();
    setState("waiting");
    setErrorMsg(null);
    setDeepLink(null);

    const res = await fetch("/api/auth/telegram/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });
    const data = await res.json();

    if (!res.ok) {
      setState("error");
      setErrorMsg(data.error ?? "Failed to start Telegram login");
      return;
    }

    setDeepLink(data.deep_link);
    savePending(data.token, data.deep_link);
    startPolling(data.token);
  }

  if (state === "waiting") {
    return (
      <div className="w-full space-y-2">
        {deepLink ? (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-11 flex items-center justify-center gap-3 border border-border bg-surface hover:bg-background text-foreground font-medium text-sm transition-colors"
          >
            <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            Open Telegram to continue
          </a>
        ) : (
          <button
            disabled
            className="w-full h-11 flex items-center justify-center gap-3 border border-border bg-surface text-muted-foreground font-medium text-sm cursor-not-allowed"
          >
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            Preparing link...
          </button>
        )}
        <p className="text-xs text-muted-foreground text-center">
          Tap the button above, then tap <strong>Start</strong> in Telegram
        </p>
        <button
          type="button"
          onClick={() => { stopPolling(); clearPending(); setState("idle"); setDeepLink(null); }}
          className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1">
      <button
        type="button"
        onClick={handleClick}
        className="w-full h-11 flex items-center justify-center gap-3 border border-border bg-surface hover:bg-background text-foreground font-medium text-sm transition-colors"
      >
        <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        Continue with Telegram
      </button>
      {state === "error" && (
        <p className="text-xs text-destructive text-center">{errorMsg}</p>
      )}
    </div>
  );
}
