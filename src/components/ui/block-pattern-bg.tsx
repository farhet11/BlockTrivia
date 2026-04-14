// BlockTrivia branded background pattern with breathing checkmarks and terminal prompts
// Uses canvas for performance. Supports light/dark mode via next-themes.

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTheme } from 'next-themes';

// === LOCKED SETTINGS (from UX Design session, March 30 2026) ===
const CONFIG = {
  blockSize: 20,         // px — scale of each 2x2 block motif
  opacity: 0.05,         // 5% — subtle but readable
  gap: 10,               // px — spacing between motifs
  rotation: 0,           // degrees — no rotation
  breathIntensity: 2.5,  // boost — original 0.45 rendered at <2% alpha (invisible)
  breathSpeed: 0.24,     // lower = slower breathing cycle (~5s per breath)
  specialFrequency: 0.982, // hash threshold — ~1.8% of positions become checkmarks/prompts
  skipFrequency: 0.12,  // hash threshold — ~12% of positions are empty for breathing room

  // Colors per theme
  light: {
    bg: '#faf9f7',
    dark: [26, 25, 23],
    violet: [124, 58, 237],
    gradientStops: [
      { offset: 0, color: 'rgba(240,236,254,0.28)' },
      { offset: 0.4, color: 'rgba(248,244,255,0.12)' },
      { offset: 1, color: 'rgba(250,249,247,0)' },
    ],
  },
  dark: {
    bg: '#09090b',
    dark: [250, 249, 247],
    violet: [167, 139, 250],
    gradientStops: [
      { offset: 0, color: 'rgba(124,58,237,0.07)' },
      { offset: 0.4, color: 'rgba(124,58,237,0.02)' },
      { offset: 1, color: 'rgba(9,9,11,0)' },
    ],
  },
};

// Deterministic hash functions for consistent pattern across renders
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 269.3 + y * 183.1) * 29847.1234;
  return n - Math.floor(n);
}
function hash3(x: number, y: number): number {
  const n = Math.sin(x * 419.7 + y * 97.3) * 61283.7891;
  return n - Math.floor(n);
}

// Smooth breathing easing — lingers at peak and trough
function smoothBreath(t: number): number {
  const s = Math.sin(t);
  return (s * s) * Math.sign(s) * 0.5 + 0.5;
}

// Draw checkmark from logo SVG path data
function drawCheckmark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  const sc = s / 83;
  ctx.beginPath();
  ctx.moveTo((-41.65 + 31.53) * sc, (69.64 - 41.5) * sc);
  ctx.lineTo((-41.65 + 9.55) * sc, (47.58 - 41.5) * sc);
  ctx.lineTo((-41.65 + 24.17) * sc, (47.14 - 41.5) * sc);
  ctx.lineTo((-41.65 + 31.57) * sc, (54.54 - 41.5) * sc);
  ctx.lineTo((-41.65 + 72.74) * sc, (13.37 - 41.5) * sc);
  ctx.lineTo((-41.65 + 73.18) * sc, (27.99 - 41.5) * sc);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Draw terminal prompt >_ from logo SVG path data
function drawPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  const sc = s / 83;
  ctx.beginPath();
  ctx.moveTo(0 * sc, 10.13 * sc);
  ctx.lineTo(31.47 * sc, 41.6 * sc);
  ctx.lineTo(0 * sc, 73.08 * sc);
  ctx.lineTo(20.31 * sc, 73.69 * sc);
  ctx.lineTo(52.4 * sc, 41.6 * sc);
  ctx.lineTo(20.31 * sc, 9.51 * sc);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(38.68 * sc, 66.51 * sc, 44.06 * sc, 6.99 * sc);
  ctx.restore();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

interface BreathItem {
  x: number;
  y: number;
  s: number;
  type: 'check' | 'prompt';
  phase: number;
  baseAlpha: number;
}

export function BlockPatternBg() {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const breathRef = useRef<HTMLCanvasElement>(null);
  const breathItemsRef = useRef<BreathItem[]>([]);
  const animRef = useRef<number>(0);
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';
  const theme = isDark ? CONFIG.dark : CONFIG.light;

  const drawBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = 2;
    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // Warm gradient overlay
    const grd = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.7);
    theme.gradientStops.forEach(s => grd.addColorStop(s.offset, s.color));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    const s = CONFIG.blockSize * dpr;
    const gap = CONFIG.gap * dpr;
    const unit = s + gap;
    const rad = s * 0.09;
    const innerGap = s * 0.07;
    const half = s / 2;
    const cxc = w / 2, cyc = h / 2;
    const maxD = Math.sqrt(cxc * cxc + cyc * cyc);
    const angle = CONFIG.rotation * Math.PI / 180;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);

    const extra = Math.max(w, h) * 0.5;
    const items: BreathItem[] = [];

    for (let y = -extra; y < h + extra; y += unit) {
      for (let x = -extra; x < w + extra; x += unit) {
        const col = Math.floor((x + extra) / unit);
        const row = Math.floor((y + extra) / unit);
        const h1 = hash(col, row), h2 = hash2(col, row), h3 = hash3(col, row);

        if (h1 < CONFIG.skipFrequency) continue;

        // Radial fade — dense at edges, fades to near-zero at center
        const dx = x + half - cxc, dy = y + half - cyc;
        const distRatio = Math.sqrt(dx * dx + dy * dy) / maxD;
        const alpha = CONFIG.opacity * (0.05 + 0.95 * Math.pow(distRatio, 0.6));

        const [dr, dg, db] = theme.dark;
        const [vr, vg, vb] = theme.violet;
        const darkCol = `rgba(${dr},${dg},${db},${alpha})`;
        const violetCol = `rgba(${vr},${vg},${vb},${alpha * 1.6})`;

        const isSpecial = h1 > CONFIG.specialFrequency;

        if (isSpecial) {
          items.push({
            x, y, s, type: h3 < 0.5 ? 'check' : 'prompt',
            phase: h2 * Math.PI * 2, baseAlpha: alpha,
          });
          continue;
        }

        const bw = half - innerGap;
        const violetTR = h2 > 0.7, violetBL = h2 < 0.6;

        drawRoundedRect(ctx, x, y, bw, bw, rad); ctx.fillStyle = darkCol; ctx.fill();
        drawRoundedRect(ctx, x + half + innerGap, y, bw, bw, rad); ctx.fillStyle = violetTR ? violetCol : darkCol; ctx.fill();
        drawRoundedRect(ctx, x, y + half + innerGap, bw, bw, rad); ctx.fillStyle = violetBL ? violetCol : darkCol; ctx.fill();
        drawRoundedRect(ctx, x + half + innerGap, y + half + innerGap, bw, bw, rad); ctx.fillStyle = darkCol; ctx.fill();
      }
    }

    ctx.restore();
    breathItemsRef.current = items;
  }, [theme]);

  // Use a ref to hold the animation callback to avoid temporal dead zone
  // (the callback references itself for requestAnimationFrame loops)
  const animateBreathRef = useRef<FrameRequestCallback>(() => {});

  const animateBreath = useCallback((time: number) => {
    const canvas = breathRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const items = breathItemsRef.current;
    if (items.length === 0) {
      animRef.current = requestAnimationFrame(animateBreathRef.current);
      return;
    }

    const angle = CONFIG.rotation * Math.PI / 180;
    const [vr, vg, vb] = theme.violet;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);

    for (const item of items) {
      const t = time * 0.001 * CONFIG.breathSpeed;
      const breathVal = smoothBreath(t + item.phase);
      const fadeAlpha = item.baseAlpha * (0.3 + breathVal * 0.7) * CONFIG.breathIntensity * 2.5;

      if (fadeAlpha < 0.001) continue;

      // Soft glow
      const glowRadius = item.s * (0.8 + breathVal * 0.5);
      const grad = ctx.createRadialGradient(
        item.x + item.s / 2, item.y + item.s / 2, 0,
        item.x + item.s / 2, item.y + item.s / 2, glowRadius
      );
      grad.addColorStop(0, `rgba(${vr},${vg},${vb},${fadeAlpha * 0.35})`);
      grad.addColorStop(0.5, `rgba(${vr},${vg},${vb},${fadeAlpha * 0.1})`);
      grad.addColorStop(1, `rgba(${vr},${vg},${vb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(item.x + item.s / 2, item.y + item.s / 2, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Icon
      ctx.fillStyle = `rgba(${vr},${vg},${vb},${fadeAlpha})`;
      if (item.type === 'check') drawCheckmark(ctx, item.x, item.y, item.s);
      else drawPrompt(ctx, item.x, item.y, item.s);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(animateBreathRef.current);
  }, [theme]);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    animateBreathRef.current = animateBreath;
  });

  useEffect(() => {
    const resize = () => {
      const dpr = 2;
      [baseRef, breathRef].forEach(ref => {
        const c = ref.current;
        if (!c) return;
        c.width = window.innerWidth * dpr;
        c.height = window.innerHeight * dpr;
        c.style.width = window.innerWidth + 'px';
        c.style.height = window.innerHeight + 'px';
      });
      drawBase();
    };

    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(animateBreath);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [drawBase, animateBreath]);

  // Redraw when theme changes
  useEffect(() => { drawBase(); }, [isDark, drawBase]);

  return (
    <>
      <canvas
        ref={baseRef}
        style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={breathRef}
        style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      />
    </>
  );
}
