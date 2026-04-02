"use client";

import { useState } from "react";

export function JoinCodeCopy({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = `${window.location.origin}/join/${joinCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="group"
      title={copied ? "Copied!" : "Click to copy join link"}
    >
      <span className="font-mono text-lg font-bold tracking-[0.2em] text-foreground group-hover:text-primary transition-colors">
        {copied ? "Copied!" : joinCode}
      </span>
    </button>
  );
}
