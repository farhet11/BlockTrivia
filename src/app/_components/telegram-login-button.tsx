"use client";

import { useEffect, useRef } from "react";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (user: TelegramUser) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;

  useEffect(() => {
    if (!containerRef.current || !botName) return;

    (window as unknown as Record<string, unknown>).onTelegramAuth = onAuth;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "0");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    const container = containerRef.current;
    container.appendChild(script);

    return () => {
      if (container.contains(script)) container.removeChild(script);
      delete (window as unknown as Record<string, unknown>).onTelegramAuth;
    };
  }, [botName, onAuth]);

  if (!botName) return null;

  return <div ref={containerRef} className="w-full flex justify-center" />;
}
