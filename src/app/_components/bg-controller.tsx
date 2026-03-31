"use client";

import { usePathname } from "next/navigation";
import { BlockPatternBg } from "@/components/ui/block-pattern-bg";

const PATTERN_ROUTES = ["/", "/login"];

export function BgController() {
  const pathname = usePathname();
  if (!PATTERN_ROUTES.includes(pathname)) return null;
  return <BlockPatternBg />;
}
