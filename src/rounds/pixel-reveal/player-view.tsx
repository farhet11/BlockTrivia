"use client";

/**
 * Pixel Reveal PlayerView
 *
 * MECHANIC:
 *   An image is gradually revealed over the timer duration. Two reveal styles
 *   (per question, host-selected — column `questions.reveal_mode` from
 *   migration 061):
 *
 *   1) 'pixelated' (default) — canvas downscale→upscale with nearest-neighbor
 *      interpolation. Classic Minecraft-style blocky reveal. Works well for
 *      photos and textures where color/shape blobs seed the guess.
 *
 *   2) 'tile_reveal' — 8×8 grid (64 tiles), random tile order, tiles uncover
 *      over the timer. Much better for logos: a recognizable silhouette
 *      leaks the answer even at 3% pixelation, but tile mode hides the
 *      outline entirely and drip-feeds identifiable fragments.
 *
 * REVEAL CURVE (same for both modes, brief §1):
 *   t = elapsed / totalTime
 *   eased = t³                    — cubic ease-in, slow start fast finish
 *   pixelated: percent = 0.03 + 0.97 × eased
 *   tile_reveal: revealedTiles = floor(eased × 64)
 *
 *   Keeps the image mysterious for the first ~60% of the timer so fast
 *   guessers earn the speed bonus. The last few seconds snap from "I think
 *   I see it" to "obviously that's X."
 *
 * SCORING (mirrors SQL in migration 055):
 *   base_points + floor(base_points × ratio²)
 *   where ratio = timeRemaining / totalTime
 *
 * DB: questions.image_url + questions.reveal_mode.
 *     correct_answer is MCQ-style (option index).
 */

import { useEffect, useMemo, useRef } from "react";
import { Check, X, ScanEye } from "lucide-react";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { RoundPlayerViewProps } from "@/lib/game/round-registry";
import { proxyImageUrl } from "@/lib/image-proxy";

const OPTION_LABELS = ["A", "B", "C", "D"];

/** Minimum pixelation ratio — 3% of full resolution = unrecognizable blobs. */
const MIN_PERCENT = 0.03;

/** Throttle cap for the canvas redraw loop (brief §9 — 30fps is plenty). */
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

/** Cubic ease-in: slow start, fast finish. */
function easeIn(t: number): number {
  return t * t * t;
}

// ─── Tile Reveal constants ────────────────────────────────────────────────
/** 8×8 grid = 64 tiles. Matches brief §3. */
const TILE_GRID = 8;
const TILE_COUNT = TILE_GRID * TILE_GRID;
/** Per-tile fade-in duration when a tile uncovers. Brief §3: 150ms. */
const TILE_FADE_MS = 150;

/**
 * Deterministic string → 32-bit hash (FNV-1a). Seeds the shuffle so every
 * player watching the same question sees the same tile reveal order — and
 * so the host's stage mirror matches.
 */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, good enough for a tile-order shuffle. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of [0..TILE_COUNT) seeded deterministically by id. */
function shuffledTiles(seed: string): number[] {
  const rand = mulberry32(hashSeed(seed));
  const arr = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function PixelRevealPlayerView({
  question,
  phase,
  timeLeft,
  hasAnswered,
  isSubmitting,
  selectedAnswer,
  lastResult,
  onSubmit,
}: RoundPlayerViewProps) {
  const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;
  const isTimedOut = timeLeft === 0 && !hasAnswered;

  // Image URL from question data (set by question builder, stored in questions.image_url).
  // Proxied through /api/image-proxy so the canvas stays same-origin (no CORS taint).
  const imageUrl = question.image_url ? proxyImageUrl(question.image_url) : null;

  // Which reveal mechanic to use. Defaults to 'pixelated' for back-compat
  // with questions created before migration 061.
  const revealMode: "pixelated" | "tile_reveal" =
    question.reveal_mode === "tile_reveal" ? "tile_reveal" : "pixelated";

  // Tile order is deterministic per-question — seeded by question.id so all
  // players (and the host's stage mirror) see the same sequence. Memoised
  // per question so the array is stable across re-renders.
  const tileOrder = useMemo(
    () => (revealMode === "tile_reveal" ? shuffledTiles(question.id) : null),
    [question.id, revealMode]
  );

  // Progress: 0 at question start, 1 at timer end. Drives both the pixelation
  // percent and the thin progress bar under the image.
  // NOTE: play-view.tsx passes timeLeft in SECONDS (not ms) — matching the
  // "{timeLeft}s" display. Stay in seconds here so the math lines up.
  const timeLimitSec = question.time_limit_seconds;
  const remaining = timeLeft ?? timeLimitSec;
  const elapsed = Math.max(0, timeLimitSec - remaining);
  const rawProgress = timeLimitSec > 0 ? Math.min(1, elapsed / timeLimitSec) : 1;

  // Snap to fully clear the moment the player locks in or the host reveals.
  const clearOverride = isRevealing || hasAnswered;
  const percent = clearOverride
    ? 1
    : MIN_PERCENT + (1 - MIN_PERCENT) * easeIn(rawProgress);

  // Canvas + offscreen source-image refs.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgReadyRef = useRef(false);
  const lastDrawRef = useRef(0);
  /**
   * Offscreen "scratch" canvas — we downscale the image into here, never
   * into the visible canvas. Without this, step 1 of the pixelation draws a
   * tiny (e.g. 22×12) full-resolution copy into the top-left of the visible
   * canvas, which leaks the answer whenever the letterbox gap above the
   * image leaves that pixel visible. (Observed bug: mini Solana logo in
   * top-left corner of the letterbox.)
   */
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * Per-tile reveal timestamps (ms from performance.now). -1 means the tile
   * has not been revealed yet. Indexed by TILE POSITION (0..63, row-major),
   * not by shuffle-order. We record `now` the first time a tile flips from
   * hidden to revealed so the 150ms fade-in animation can compute age.
   * Reset on question change (new question.id triggers the image-load effect).
   */
  const tileRevealedAtRef = useRef<number[]>([]);
  /** RAF handle used to smoothly animate the tile fade-in over 150ms. */
  const rafRef = useRef<number | null>(null);

  /**
   * Downscale-then-upscale with nearest-neighbor interpolation — the canonical
   * "Minecraft" pixelation trick. Per brief §1. Called on image load, every
   * timer tick (via the effect below), and on container resize.
   */
  function drawPixelated() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgReadyRef.current) return;

    // Throttle redraws to 30fps — pixelation is a low-frequency effect, no
    // point burning CPU on phone GPUs in IRL events.
    const now = performance.now();
    if (now - lastDrawRef.current < FRAME_MS) return;
    lastDrawRef.current = now;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size the backing store to match the displayed size × devicePixelRatio,
    // so pixels stay crisp on retina screens.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.floor(rect.width * dpr));
    const H = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    // Fit the image inside the canvas with letterboxing (object-contain
    // semantics). Computes a centered destination rect that preserves the
    // image's aspect ratio — matches what host-reveal shows.
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = W / H;
    let dW: number, dH: number, dX: number, dY: number;
    if (imgAspect > canvasAspect) {
      // Image is wider than canvas — pin to width, letterbox top/bottom.
      dW = W;
      dH = W / imgAspect;
      dX = 0;
      dY = (H - dH) / 2;
    } else {
      // Image is taller — pin to height, letterbox left/right.
      dH = H;
      dW = H * imgAspect;
      dX = (W - dW) / 2;
      dY = 0;
    }

    // Downscaled size — grows cubically as the timer runs out.
    // Minimum 2×2 so the math never collapses to zero pixels.
    const w = Math.max(2, Math.floor(dW * percent));
    const h = Math.max(2, Math.floor(dH * percent));

    // Step 1: downscale into OFFSCREEN scratch canvas (not the visible one).
    // Doing this on the visible canvas would paint a tiny crumb into the
    // top-left corner that the subsequent stretched copy doesn't cover when
    // there's vertical letterboxing — which leaks the answer.
    if (!scratchRef.current) {
      scratchRef.current = document.createElement("canvas");
    }
    const scratch = scratchRef.current;
    if (scratch.width !== w) scratch.width = w;
    if (scratch.height !== h) scratch.height = h;
    const sctx = scratch.getContext("2d");
    if (!sctx) return;
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0, w, h);

    // Step 2: stretch the scratch bitmap onto the visible canvas with
    // nearest-neighbor interpolation — that's what produces the blocky
    // "pixelated" look (vs. smooth blur).
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(scratch, 0, 0, w, h, dX, dY, dW, dH);
  }

  /**
   * Tile Reveal draw path — 8×8 grid, random-order uncover, per-tile 150ms
   * fade. Unlike pixelation, each revealed tile shows the image fragment at
   * full crisp resolution; the mystery comes from NOT seeing the silhouette
   * until enough tiles uncover.
   *
   * Brief §3. No throttle here — we're called from both React re-renders
   * (every timer tick, ~1 Hz) and the rAF fade loop (60 Hz during fade).
   */
  function drawTiles() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgReadyRef.current || !tileOrder) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas sizing — mirror pixelated path so swapping modes doesn't jump.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.floor(rect.width * dpr));
    const H = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    // Letterbox rect (object-contain equivalent).
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = W / H;
    let dW: number, dH: number, dX: number, dY: number;
    if (imgAspect > canvasAspect) {
      dW = W; dH = W / imgAspect; dX = 0; dY = (H - dH) / 2;
    } else {
      dH = H; dW = H * imgAspect; dX = (W - dW) / 2; dY = 0;
    }

    // Mark newly-revealed tiles. revealedAtRef is indexed by tile POSITION
    // (0..63 row-major); tileOrder[i] tells us which position reveals at
    // step i. So we walk the first `target` positions in reveal order and
    // stamp them `now` if they haven't been stamped yet.
    const now = performance.now();
    const target = clearOverride
      ? TILE_COUNT
      : Math.floor(easeIn(rawProgress) * TILE_COUNT);
    for (let i = 0; i < target; i++) {
      const tileIdx = tileOrder[i];
      if (tileRevealedAtRef.current[tileIdx] < 0) {
        // If we're snapping all tiles open at once (player answered / host
        // revealed), back-date the stamp so no fade plays — the reveal IS
        // the moment; fading would dilute it.
        tileRevealedAtRef.current[tileIdx] = clearOverride
          ? now - TILE_FADE_MS
          : now;
      }
    }

    // Theme-aware fill colors. Matches the design tokens in globals.css:
    //   Warm Canvas  #faf9f7  (light)
    //   Night Canvas #09090b  (dark)
    //   Warm Border  #e8e5e0  (light)
    //   Night Border #27272a  (dark)
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");
    const bg = isDark ? "#09090b" : "#faf9f7";
    const border = isDark ? "#27272a" : "#e8e5e0";

    // Clear → fill letterbox with bg → paint image → cover hidden tiles.
    // Painting bg under the image means tiles that never reveal stay fully
    // opaque (no half-image leak through).
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(dX, dY, dW, dH);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, dX, dY, dW, dH);

    // Overlay bg on hidden / fading tiles.
    const tileW = dW / TILE_GRID;
    const tileH = dH / TILE_GRID;
    for (let t = 0; t < TILE_COUNT; t++) {
      const rAt = tileRevealedAtRef.current[t];
      const col = t % TILE_GRID;
      const row = Math.floor(t / TILE_GRID);
      const tx = dX + col * tileW;
      const ty = dY + row * tileH;

      if (rAt < 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = bg;
        ctx.fillRect(tx, ty, tileW, tileH);
      } else {
        const age = now - rAt;
        if (age < TILE_FADE_MS) {
          ctx.globalAlpha = 1 - age / TILE_FADE_MS;
          ctx.fillStyle = bg;
          ctx.fillRect(tx, ty, tileW, tileH);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Grid lines — draw last, on top of everything, for consistent structure.
    // Half-pixel offset keeps 1px lines crisp (canvas fills between pixels).
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(1, dpr);
    for (let i = 0; i <= TILE_GRID; i++) {
      const x = Math.floor(dX + i * tileW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, dY);
      ctx.lineTo(x, dY + dH);
      ctx.stroke();
      const y = Math.floor(dY + i * tileH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(dX, y);
      ctx.lineTo(dX + dW, y);
      ctx.stroke();
    }
  }

  /**
   * rAF loop that smoothly animates tile fade-ins. React re-renders only
   * once per timer tick (~1 Hz) — not enough granularity for a 150ms fade.
   * This loop runs at monitor refresh rate while any tile is within its
   * fade window, then stops itself.
   */
  function scheduleFadeLoop() {
    if (rafRef.current !== null) return; // already running
    const tick = () => {
      const now = performance.now();
      let needsMore = false;
      for (let i = 0; i < TILE_COUNT; i++) {
        const rAt = tileRevealedAtRef.current[i];
        if (rAt >= 0 && now - rAt < TILE_FADE_MS) {
          needsMore = true;
          break;
        }
      }
      drawTiles();
      rafRef.current = needsMore ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  /** Dispatcher — picks the right draw path based on the host's choice. */
  function draw() {
    if (revealMode === "tile_reveal") {
      drawTiles();
      scheduleFadeLoop();
    } else {
      drawPixelated();
    }
  }

  // Reset per-tile reveal state whenever the question changes. Without this,
  // tiles from the previous question would appear already-revealed on the
  // next one. Also cancel any in-flight rAF fade from the outgoing question.
  useEffect(() => {
    tileRevealedAtRef.current = new Array(TILE_COUNT).fill(-1);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [question.id]);

  // Load the source image once per question. We use the browser Image
  // constructor (not next/image) because we need the raw bitmap for canvas
  // drawImage — next/image would give us a DOM <img> wrapped in an optimizer
  // layer, which complicates cross-origin reads.
  useEffect(() => {
    if (!imageUrl) return;
    imgReadyRef.current = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      imgRef.current = img;
      imgReadyRef.current = true;
      // Kick one draw on load so the initial state paints before the first
      // timer tick forces a re-render.
      lastDrawRef.current = 0; // bypass the throttle for this first frame
      draw();
    };
    img.onerror = () => {
      imgReadyRef.current = false;
    };
    return () => {
      imgRef.current = null;
      imgReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Redraw whenever the reveal progress changes. React re-renders on every
  // timer tick (timeLeft prop), so this fires roughly once per second.
  // Pixelated mode is throttled internally to 30fps; tile mode kicks a
  // short rAF burst to smooth the 150ms fade.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percent]);

  // Redraw on container resize (orientation change, sidebar toggle, etc.).
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      lastDrawRef.current = 0; // force a frame through the throttle
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel any in-flight rAF fade on unmount to avoid setState-on-unmounted.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Instruction pill — Lucide ScanEye matches the RoundTypeBadge */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-[var(--bt-hover)] border border-border px-3 py-1.5">
          <ScanEye size={14} strokeWidth={2.5} />
          Identify the image — early answers earn more points
        </span>
      </div>

      {/* Pixelated image container */}
      {imageUrl ? (
        <div className="relative w-full aspect-video border border-border overflow-hidden bg-muted">
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            aria-label="Pixel reveal question image"
          />
          {/* Reveal progress bar — shows how de-pixelated the image is */}
          {!isRevealing && !hasAnswered && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-border">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${rawProgress * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-video border border-border flex items-center justify-center bg-muted text-muted-foreground text-sm">
          No image available
        </div>
      )}

      {/* 2x2 option grid */}
      <div className="grid grid-cols-2 gap-3">
        {question.options.map((option, i) => {
          const isSelected = selectedAnswer !== null && selectedAnswer === i;
          const isCorrectOption = lastResult?.correctAnswer === i;

          const isLong = option.length >= 40;
          let cls = `${isLong ? "relative p-4 pt-7" : "flex items-center gap-3 p-4"} min-h-14 border text-left transition-colors w-full `;

          if (isRevealing) {
            if (isCorrectOption) cls += "border-correct bg-[var(--bt-correct-tint)] text-foreground";
            else if (isSelected) cls += "border-wrong bg-[var(--bt-wrong-tint)] text-foreground opacity-60";
            else cls += "border-border text-foreground opacity-60";
          } else if (isSelected) {
            cls += "border-primary bg-accent-light text-primary";
          } else if (hasAnswered || isTimedOut) {
            cls += "border-border text-muted-foreground";
          } else {
            cls += "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
          }

          const badgeCls = `${isLong ? "absolute top-[6px] left-[8px]" : "shrink-0"} w-5 h-5 flex items-center justify-center text-[11px] font-medium ${
            isRevealing && isCorrectOption
              ? "bg-[var(--bt-correct)] text-white"
              : isRevealing && isSelected && !isCorrectOption
              ? "bg-[var(--bt-wrong)] text-white"
              : "bg-[var(--bt-hover)] text-[var(--bt-stone)]"
          }`;

          return (
            <button
              key={i}
              disabled={hasAnswered || phase !== "playing" || isSubmitting || isTimedOut}
              onClick={() => onSubmit(i)}
              className={cls}
              style={
                isRevealing && isCorrectOption
                  ? { animation: "correct-pulse 420ms ease-out" }
                  : isRevealing && isSelected && !isCorrectOption
                  ? { animation: "shake 480ms ease-in-out" }
                  : undefined
              }
              aria-label={`Answer ${OPTION_LABELS[i]}: ${option}`}
            >
              <span className={badgeCls}>
                {isRevealing && isCorrectOption ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : isRevealing && isSelected && !isCorrectOption ? (
                  <X size={14} strokeWidth={2.5} />
                ) : (
                  OPTION_LABELS[i]
                )}
              </span>
              <span className="leading-snug break-words text-sm font-medium">
                {isSubmitting && isSelected ? (
                  <span className="inline-flex items-center gap-1.5">
                    <BlockSpinner variant="wave" size={16} />
                    {option}
                  </span>
                ) : (
                  option
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
