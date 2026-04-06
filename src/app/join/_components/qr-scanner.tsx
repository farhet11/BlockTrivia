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
          video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 1280 } },
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
            ? "Camera requires HTTPS. Enter the code manually instead."
            : "Could not access camera. Please check permissions and try again."
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
            } catch { /* frame not ready */ }
            if (scanningRef.current) animationId = requestAnimationFrame(detect);
          };
          detect();
        } catch {
          setError("QR scanning not supported on this browser.");
        }
      } else {
        setError("QR scanning not supported. Try Chrome or use your phone's camera app.");
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

  return (
    <>
      {/* Sweep keyframe */}
      <style>{`
        @keyframes qr-sweep {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(228px); }
          100% { transform: translateY(0); }
        }
      `}</style>

      {/* Full-screen overlay — sits above everything */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999 }}
        className="flex flex-col bg-black"
      >
        {/* Camera feed */}
        <video
          ref={videoRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          playsInline
          muted
        />

        {/* Everything on top of the camera */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>

          {/* Top bar */}
          <div
            style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
            className="flex items-center justify-between px-5 pt-14 pb-8"
          >
            <p className="text-white font-heading text-lg font-bold tracking-tight">Scan QR Code</p>
            <button
              onClick={handleClose}
              style={{ background: "rgba(255,255,255,0.15)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
              aria-label="Close"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Centre — viewfinder */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <p className="text-white/80 text-sm font-medium tracking-wide">
              Align QR code within the frame
            </p>

            {/* Viewfinder box */}
            <div
              style={{
                width: 240,
                height: 240,
                position: "relative",
                border: "1px solid rgba(255,255,255,0.25)",
                overflow: "hidden",
              }}
            >
              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTop: "3px solid white", borderLeft: "3px solid white" },
                { top: 0, right: 0, borderTop: "3px solid white", borderRight: "3px solid white" },
                { bottom: 0, left: 0, borderBottom: "3px solid white", borderLeft: "3px solid white" },
                { bottom: 0, right: 0, borderBottom: "3px solid white", borderRight: "3px solid white" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 32, height: 32, ...s }} />
              ))}

              {/* Sweep line */}
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  top: 4,
                  height: 2,
                  background: "rgba(124,58,237,0.9)",
                  boxShadow: "0 0 8px 2px rgba(124,58,237,0.5)",
                  animation: "qr-sweep 2s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Bottom bar */}
          <div
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
            className="flex flex-col items-center gap-4 px-5 pt-10 pb-12"
          >
            {error ? (
              <div className="w-full bg-black/70 border border-white/10 p-4 space-y-3 text-center">
                <p className="text-sm text-white/80">{error}</p>
                <button onClick={handleClose} className="text-primary font-medium text-sm">
                  Go back to code entry
                </button>
              </div>
            ) : (
              <p className="text-xs text-white/40 text-center">
                Point your camera at a BlockTrivia QR code
              </p>
            )}

            <button
              onClick={handleClose}
              className="w-full h-12 text-white font-medium text-sm border border-white/20 bg-white/10"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
