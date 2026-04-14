"use client";

import { useEffect } from "react";
import { FallingBlocksError } from "@/app/_components/falling-blocks-error";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <FallingBlocksError
      heading="Something went wrong"
      body="Something broke on our end. Let's get you back on track."
      actions={[
        { label: "Reload", onClick: () => window.location.reload() },
        { label: "Go home", href: "/", variant: "secondary" },
      ]}
    />
  );
}
