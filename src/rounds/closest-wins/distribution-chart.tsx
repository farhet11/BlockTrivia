"use client";

/**
 * Closest Wins — answer distribution chart.
 *
 * Auto-buckets player guesses into 5–7 ranges and renders horizontal bars.
 * Scale (linear vs log) is picked automatically from max/min ratio so it
 * handles both tight clusters (year guesses) and wild ranges (gwei/ETH).
 *
 * Bar colors:
 *   - default: Stone #78756e
 *   - bucket containing target: Correct Green #22c55e
 *   - bucket containing "you" (player view): Electric Violet #7c3aed
 *   - "you" and target in same bucket: bar stays green, still labeled "Your guess"
 */

import { Target } from "lucide-react";

export interface Bucket {
  min: number;
  max: number;
  label: string;
  count: number;
  isLast: boolean;
}

interface Props {
  guesses: number[];
  target: number;
  /** Player's own guess (player view only). */
  yourGuess?: number | null;
  /** Player-only rank display: "You were #3 closest out of 47". */
  yourRank?: number | null;
  /** Host-only: show dashed median/mean lines. */
  showStats?: boolean;
  unit?: string | null;
}

const COLOR_DEFAULT = "#78756e";
const COLOR_TARGET = "#22c55e";
const COLOR_YOU = "#7c3aed";
const BUCKET_COUNT = 6;
const MAX_HEIGHT_PX = 200;

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function buildBuckets(guesses: number[], target: number): Bucket[] {
  const values = [...guesses, target];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  if (rawMin === rawMax) {
    return [
      {
        min: rawMin,
        max: rawMax,
        label: formatNum(rawMin),
        count: guesses.length,
        isLast: true,
      },
    ];
  }

  const allPositive = rawMin > 0;
  const ratio = allPositive ? rawMax / rawMin : Infinity;
  const useLog = allPositive && ratio > 100;

  const buckets: Bucket[] = [];

  if (useLog) {
    const logMin = Math.log10(rawMin);
    const logMax = Math.log10(rawMax);
    const step = (logMax - logMin) / BUCKET_COUNT;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      const lo = Math.pow(10, logMin + step * i);
      const hi = Math.pow(10, logMin + step * (i + 1));
      buckets.push({
        min: lo,
        max: hi,
        label: `${formatNum(lo)}–${formatNum(hi)}`,
        count: 0,
        isLast: i === BUCKET_COUNT - 1,
      });
    }
  } else {
    const step = (rawMax - rawMin) / BUCKET_COUNT;
    for (let i = 0; i < BUCKET_COUNT; i++) {
      const lo = rawMin + step * i;
      const hi = rawMin + step * (i + 1);
      buckets.push({
        min: lo,
        max: hi,
        label: `${formatNum(lo)}–${formatNum(hi)}`,
        count: 0,
        isLast: i === BUCKET_COUNT - 1,
      });
    }
  }

  for (const v of guesses) {
    const idx = bucketIndex(v, buckets);
    if (idx >= 0) buckets[idx].count++;
  }

  return buckets;
}

function bucketIndex(value: number, buckets: Bucket[]): number {
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.isLast) {
      if (value >= b.min && value <= b.max) return i;
    } else {
      if (value >= b.min && value < b.max) return i;
    }
  }
  return -1;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function ClosestWinsDistributionChart({
  guesses,
  target,
  yourGuess = null,
  yourRank = null,
  showStats = false,
  unit,
}: Props) {
  if (guesses.length === 0) return null;

  const buckets = buildBuckets(guesses, target);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const targetIdx = bucketIndex(target, buckets);
  const yourIdx =
    yourGuess !== null && yourGuess !== undefined
      ? bucketIndex(yourGuess, buckets)
      : -1;

  const med = showStats ? median(guesses) : null;
  const mn = showStats ? mean(guesses) : null;

  // Find global x-range for positioning the target diamond + median/mean lines.
  const minEdge = buckets[0].min;
  const maxEdge = buckets[buckets.length - 1].max;
  const range = maxEdge - minEdge;
  const positionPct = (v: number): number =>
    range > 0 ? Math.max(0, Math.min(100, ((v - minEdge) / range) * 100)) : 50;

  return (
    <div className="border border-border bg-surface p-4 space-y-3">
      {/* Header: count + optional rank */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {guesses.length} {guesses.length === 1 ? "guess" : "guesses"}
        </p>
        {yourRank !== null && yourRank !== undefined && (
          <p className="text-xs font-medium text-foreground">
            You were{" "}
            <span className="font-mono font-bold text-primary">#{yourRank}</span>{" "}
            closest out of {guesses.length}
          </p>
        )}
      </div>

      {/* Chart body */}
      <div
        className="relative space-y-1.5"
        style={{ maxHeight: MAX_HEIGHT_PX }}
      >
        {buckets.map((b, i) => {
          const isTarget = i === targetIdx;
          const isYou = i === yourIdx;
          const barColor = isTarget
            ? COLOR_TARGET
            : isYou
              ? COLOR_YOU
              : COLOR_DEFAULT;
          const widthPct = Math.max(
            b.count > 0 ? 2 : 0,
            (b.count / maxCount) * 100,
          );

          return (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-[40%] shrink-0 truncate">
                {b.label}
              </span>
              <div className="relative flex-1 h-5 bg-muted/30">
                <div
                  className="h-full transition-[width] duration-300"
                  style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                />
                {isYou && (
                  <span
                    className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-white"
                  >
                    Your guess
                  </span>
                )}
              </div>
              <span className="font-mono text-xs tabular-nums text-foreground w-8 text-right shrink-0">
                {b.count}
              </span>
            </div>
          );
        })}

        {/* Target diamond marker on the axis */}
        <div className="relative h-3 mt-1" aria-hidden="true">
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${positionPct(target)}%` }}
          >
            <Target size={12} strokeWidth={2.5} className="text-correct" />
          </div>
          {showStats && med !== null && (
            <div
              className="absolute top-0 bottom-0 border-l border-dashed border-muted-foreground/60"
              style={{ left: `${positionPct(med)}%` }}
              title={`Median: ${formatNum(med)}`}
            />
          )}
          {showStats && mn !== null && (
            <div
              className="absolute top-0 bottom-0 border-l border-dotted border-muted-foreground/60"
              style={{ left: `${positionPct(mn)}%` }}
              title={`Mean: ${formatNum(mn)}`}
            />
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3" style={{ backgroundColor: COLOR_TARGET }} />
          Target
        </span>
        {yourIdx >= 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3" style={{ backgroundColor: COLOR_YOU }} />
            You
          </span>
        )}
        {showStats && med !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-muted-foreground/60" />
            Median {formatNum(med)}
            {unit ? ` ${unit}` : ""}
          </span>
        )}
        {showStats && mn !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t border-dotted border-muted-foreground/60" />
            Mean {formatNum(mn)}
            {unit ? ` ${unit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
