"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { FallingBlocksError } from "@/app/_components/falling-blocks-error";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const params = useParams();
  const code = params?.code as string | undefined;

  const actions = [
    ...(code
      ? [{ label: "Rejoin game", href: `/game/${code}/lobby` }]
      : []),
    {
      label: "Try again",
      onClick: reset,
      variant: "secondary" as const,
    },
  ];

  return (
    <FallingBlocksError
      heading="Something went wrong"
      body="There was a problem loading the game. Tap below to rejoin."
      actions={actions}
    />
  );
}
