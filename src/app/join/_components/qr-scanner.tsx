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
          video: { facingMode: "environment" },
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
            : "Could not access camera. Check permissions."
        );
      }
    }

    async function scanFrames() {
      if (!scanningRef.current || !videoRef.current) return;

      // Use BarcodeDetector if available (Chrome, Edge, Android)
      if ("BarcodeDetector" in window) {
        try {
          // @ts-expect-error — BarcodeDetector is not in all TS libs yet
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const detect = async () => {
            if (!scanningRef.current || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const url = barcodes[0].rawValue;
                const code = extractCode(url);
                if (code) {
                  scanningRef.current = false;
                  cleanup();
                  onScanned(code);
                  return;
                }
              }
            } catch {
              // Frame not ready, continue
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
        setError(
          "QR scanning not supported in this browser. Try Chrome or use your phone's camera app."
        );
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
    // Handle full URLs like blocktrivia.com/join/ABCDE or just the code
    const urlMatch = value.match(/\/join\/([A-Z0-9]{5})/i);
    if (urlMatch) return urlMatch[1].toUpperCase();

    // Raw 5-char code
    if (/^[A-Z0-9]{5}$/i.test(value.trim())) {
      return value.trim().toUpperCase();
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/90 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        {error ? (
          <div className="bg-surface p-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={onClose}
              className="text-primary font-medium text-sm hover:underline underline-offset-4"
            >
              Go back to code entry
            </button>
          </div>
        ) : (
          <>
            <div className="relative aspect-square overflow-hidden bg-black max-h-[60vh]">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Scan frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2/3 aspect-square border-2 border-white/60 rounded-lg" />
              </div>
            </div>
            <p className="text-center text-sm text-white/70">
              Point your camera at a BlockTrivia QR code
            </p>
          </>
        )}

        <button
          onClick={() => {
            scanningRef.current = false;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            onClose();
          }}
          className="w-full text-center text-sm text-white/70 hover:text-white transition-colors py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
