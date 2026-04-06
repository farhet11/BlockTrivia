"use client";

import { useEffect, useRef, useState } from "react";

export function QrScanner({
  onScanned,
  onClose,
}: {
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(true);

  useEffect(() => {
    let animationId: number;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanFrames();
        }
      } catch {
        setError(
          window.location.protocol === "http:"
            ? "Camera requires HTTPS. On localhost, enter the code manually."
            : "Could not access camera. Check permissions and try again."
        );
      }
    }

    async function scanFrames() {
      if (!scanningRef.current || !videoRef.current) return;

      if ("BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector not in all TS libs
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const detect = async () => {
            if (!scanningRef.current || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const code = extractCode(barcodes[0].rawValue);
                if (code) {
                  scanningRef.current = false;
                  cleanup();
                  onScanned(code);
                  return;
                }
              }
            } catch {
              // Frame not ready yet
            }
            if (scanningRef.current) {
              animationId = requestAnimationFrame(detect);
            }
          };
          detect();
        } catch {
          setError("QR scanning not supported on this browser.");
        }
      } else {
        setError("QR scanning not supported in this browser. Try Chrome or use your phone's camera app.");
      }
    }

    function cleanup() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }

    startCamera();

    return () => {
      scanningRef.current = false;
      cancelAnimationFrame(animationId);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function extractCode(value: string): string | null {
    const urlMatch = value.match(/\/join\/([A-Z0-9]{5})/i);
    if (urlMatch) return urlMatch[1].toUpperCase();
    if (/^[A-Z0-9]{5}$/i.test(value.trim())) return value.trim().toUpperCase();
    return null;
  }

  function handleClose() {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  }

  // Viewfinder size as % of screen width, capped
  const VF = "min(65vw, 280px)";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* Full-screen camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Dark overlay with transparent viewfinder cutout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Top shade */}
        <div className="w-full flex-1 bg-black/60" />

        {/* Middle row */}
        <div className="flex w-full items-center" style={{ height: VF }}>
          <div className="flex-1 h-full bg-black/60" />

          {/* Viewfinder — transparent, corner brackets via pseudo-approach */}
          <div className="relative shrink-0" style={{ width: VF, height: VF }}>
            {/* Corner brackets */}
            {[
              "top-0 left-0 border-t-2 border-l-2",
              "top-0 right-0 border-t-2 border-r-2",
              "bottom-0 left-0 border-b-2 border-l-2",
              "bottom-0 right-0 border-b-2 border-r-2",
            ].map((cls, i) => (
              <span
                key={i}
                className={`absolute ${cls} border-white w-7 h-7`}
              />
            ))}
          </div>

          <div className="flex-1 h-full bg-black/60" />
        </div>

        {/* Bottom shade */}
        <div className="w-full flex-1 bg-black/60" />
      </div>

      {/* Header — close X */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-14">
        <p className="text-white font-heading text-lg font-bold">Scan QR Code</p>
        <button
          onClick={handleClose}
          className="size-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Close scanner"
        >
          <svg className="size-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Instructions or error — bottom */}
      <div className="relative z-10 mt-auto pb-16 px-5 text-center space-y-4">
        {error ? (
          <div className="bg-black/70 border border-white/10 p-5 space-y-3">
            <p className="text-sm text-white/80">{error}</p>
            <button
              onClick={handleClose}
              className="text-primary font-medium text-sm"
            >
              Go back to code entry
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/60">
            Point your camera at a BlockTrivia QR code
          </p>
        )}

        <button
          onClick={handleClose}
          className="w-full h-12 bg-white/10 hover:bg-white/15 transition-colors text-white font-medium text-sm border border-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
