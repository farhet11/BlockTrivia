"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface BrandedQRProps {
  value: string;
  size?: number;
  showLogo?: boolean;
}

export function BrandedQR({ value, size = 200, showLogo = true }: BrandedQRProps) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qrRef = useRef<any>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QRCodeStyling = require("qr-code-styling");

    const qr = new QRCodeStyling({
      width: size,
      height: size,
      type: "svg",
      data: value,
      image: showLogo ? (isDark ? "/logo-icon-dark.svg" : "/logo-icon.svg") : undefined,
      dotsOptions: {
        type: "classy",
        color: isDark ? "#e8e5e0" : "#1a1917",
      },
      cornersSquareOptions: {
        color: "#7c3aed",
        type: "square",
      },
      cornersDotOptions: {
        color: "#5b21b6",
        type: "square",
      },
      backgroundOptions: {
        color: "transparent",
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 6,
        hideBackgroundDots: true,
      },
      qrOptions: {
        errorCorrectionLevel: "H",
      },
    });

    if (ref.current) {
      ref.current.innerHTML = "";
      qr.append(ref.current);
    }
    qrRef.current = qr;
  }, [value, size, isDark, showLogo]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`QR code to join game`}
    />
  );
}
