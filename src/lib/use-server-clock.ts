"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

/**
 * useServerClock — syncs a one-time clock offset between the client and the
 * Postgres server so host + player can agree on "now" regardless of device
 * clock skew.
 *
 * Why this exists:
 *   `question_started_at` is set on the server (or host's clock) as an ISO
 *   timestamp. Each client then computes remaining time as:
 *     remaining = (startedAt + duration) - Date.now()
 *   If the host device clock and player device clock differ by N seconds, the
 *   timers desync by N seconds. Measured drift on consumer phones is
 *   frequently 1–5s (Android especially).
 *
 * Fix:
 *   On mount, each client fetches `get_server_time()` (migration 057) and
 *   stores `offset = serverMs - clientMs`. Subsequently, `serverNow()`
 *   returns `Date.now() + offset` — the server's view of now.
 *
 * Usage:
 *   const { serverNow } = useServerClock();
 *   const remaining = (startedAt + duration) - serverNow();
 */
export function useServerClock() {
  // Ref so serverNow() always reads the latest offset without re-render churn
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    const supabase = createClient();
    const sentAt = Date.now();

    supabase.rpc("get_server_time").then(({ data, error }) => {
      if (error || !data) {
        console.warn("[clock-sync] failed, falling back to client clock:", error?.message);
        return;
      }
      // Round-trip latency — assume half went each way
      const rtt = Date.now() - sentAt;
      const serverMs = new Date(data as string).getTime() + rtt / 2;
      offsetRef.current = serverMs - Date.now();
    });
  }, []);

  // Returns the server's approximation of "now" in ms since epoch.
  // Stable identity via useCallback so callers can include it in effect deps
  // without triggering re-renders (reads from ref, no re-subscribe churn).
  const serverNow = useCallback((): number => {
    return Date.now() + offsetRef.current;
  }, []);

  return { serverNow };
}
