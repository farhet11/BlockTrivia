"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface TelegramAuthResult {
  token_hash: string;
  user: { id: string; name: string; telegram_id: string };
}

export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (result: TelegramAuthResult) => void;
}) {
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handleClick() {
    stopPolling();
    setState("waiting");
    setErrorMsg(null);

    // Open the window synchronously (before any await) to avoid popup blocking.
    // On mobile this becomes a redirect; on desktop it opens t.me in a new tab.
    const popup = window.open("about:blank", "_blank");

    const res = await fetch("/api/auth/telegram/init", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      popup?.close();
      setState("error");
      setErrorMsg(data.error ?? "Failed to start Telegram login");
      return;
    }

    // Navigate the already-opened window to the Telegram deep link
    if (popup) {
      popup.location.href = data.deep_link;
    } else {
      // Fallback if popup was blocked anyway (e.g. iOS Safari in some modes)
      window.location.href = data.deep_link;
    }

    // Poll for completion
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(
          `/api/auth/telegram/status?token=${data.token}`
        );
        const statusData = await statusRes.json();

        if (statusData.completed) {
          stopPolling();
          setState("idle");
          onAuth({ token_hash: statusData.token_hash, user: statusData.user });
        }
      } catch {
        // network blip — keep polling
      }
    }, 1500);

    // Auto-cancel after 5 minutes
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setState("idle");
    }, 5 * 60 * 1000);
  }

  if (state === "waiting") {
    return (
      <div className="w-full space-y-2">
        <button
          disabled
          className="w-full h-11 flex items-center justify-center gap-3 bg-[#2AABEE]/70 text-white font-semibold text-sm cursor-not-allowed"
        >
          <svg
            className="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              d="M12 3a9 9 0 1 0 9 9"
            />
          </svg>
          Waiting for Telegram...
        </button>
        <p className="text-xs text-muted-foreground text-center">
          Tap <strong>Start</strong> in the Telegram app, then return here
        </p>
        <button
          type="button"
          onClick={() => { stopPolling(); setState("idle"); }}
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
        className="w-full h-11 flex items-center justify-center gap-3 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold text-sm transition-colors"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        Log in with Telegram
      </button>
      {state === "error" && (
        <p className="text-xs text-destructive text-center">{errorMsg}</p>
      )}
    </div>
  );
}
