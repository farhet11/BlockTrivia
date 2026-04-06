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

  const VF = 256; // viewfinder px

  return (
    <>
      <style>{`
        @keyframes qr-sweep {
          0%   { top: 6px; }
          50%  { top: ${VF - 10}px; }
          100% { top: 6px; }
        }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", display: "flex", flexDirection: "column" }}>

        {/* Camera — fills entire screen */}
        <video
          ref={videoRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          playsInline
          muted
        />

        {/* UI layer */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>

          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "56px 20px 16px",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
          }}>
            <span style={{ color: "white", fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px", fontFamily: "var(--font-outfit, sans-serif)" }}>
              Scan QR Code
            </span>
            <button
              onClick={handleClose}
              style={{
                width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer",
                background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Viewfinder — centred in remaining space */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>

            {/* The box — box-shadow creates the dark surround without extra panels */}
            <div style={{
              position: "relative",
              width: VF,
              height: VF,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              borderRadius: 4,
              overflow: "hidden",
            }}>
              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTop: "3px solid #fff", borderLeft: "3px solid #fff", borderTopLeftRadius: 4 },
                { top: 0, right: 0, borderTop: "3px solid #fff", borderRight: "3px solid #fff", borderTopRightRadius: 4 },
                { bottom: 0, left: 0, borderBottom: "3px solid #fff", borderLeft: "3px solid #fff", borderBottomLeftRadius: 4 },
                { bottom: 0, right: 0, borderBottom: "3px solid #fff", borderRight: "3px solid #fff", borderBottomRightRadius: 4 },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 28, height: 28, ...s }} />
              ))}

              {/* Sweep line */}
              <div style={{
                position: "absolute",
                left: 8,
                right: 8,
                height: 2,
                background: "rgba(124,58,237,0.9)",
                boxShadow: "0 0 8px 3px rgba(124,58,237,0.4)",
                animation: "qr-sweep 2s ease-in-out infinite",
              }} />
            </div>

            {/* Instruction text — sits below box, above dark surround level */}
            {!error && (
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 500, textAlign: "center", margin: 0 }}>
                Place the QR code within the frame to scan
              </p>
            )}

            {error && (
              <div style={{
                width: VF + 40,
                background: "rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "16px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, margin: 0 }}>{error}</p>
                <button onClick={handleClose} style={{ color: "#7c3aed", fontWeight: 600, fontSize: 13, background: "none", border: "none", cursor: "pointer" }}>
                  Go back to code entry
                </button>
              </div>
            )}
          </div>

          {/* Cancel button — pinned to bottom */}
          <div style={{
            padding: "16px 24px 40px",
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
          }}>
            <button
              onClick={handleClose}
              style={{
                width: "100%", height: 48, border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.08)", color: "white",
                fontSize: 15, fontWeight: 500, cursor: "pointer", borderRadius: 4,
              }}
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
