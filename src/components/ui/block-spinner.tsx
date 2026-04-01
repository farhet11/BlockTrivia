// components/ui/block-spinner.tsx
// BlockTrivia branded loading spinners with automatic light/dark mode
// Two variants: "wave" (simple pulse) and "story" (logo assembly sequence)
// Logo layout: >_ top-left (violet), dark top-right, dark bottom-left, checkmark bottom-right (violet)

'use client';

import { useTheme } from 'next-themes';

interface BlockSpinnerProps {
  variant?: 'wave' | 'story';
  size?: number;
}

export function BlockSpinner({ variant = 'story', size = 48 }: BlockSpinnerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const dark = isDark ? '#e8e5e0' : '#1a1917';
  const violet = '#7c3aed';
  const iconFill = isDark ? '#1a1917' : '#f0e6fc';
  const id = Math.random().toString(36).slice(2, 8);

  if (variant === 'wave') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="status"
        aria-label="Loading"
      >
        <style>{`
          @keyframes bt-wave-${id} { 0%,100% { opacity: 0.12; } 50% { opacity: 0.8; } }
          @media (prefers-reduced-motion: reduce) { .bt-w-${id} { animation: none !important; opacity: 0.4; } }
        `}</style>
        <rect className={`bt-w-${id}`} x="1" y="1" width="21" height="21" rx="3"
          fill={violet} style={{ opacity: 0.12, animation: `bt-wave-${id} 2.4s ease-in-out 0s infinite` }} />
        <rect className={`bt-w-${id}`} x="26" y="1" width="21" height="21" rx="3"
          fill={dark} style={{ opacity: 0.12, animation: `bt-wave-${id} 2.4s ease-in-out 0.3s infinite` }} />
        <rect className={`bt-w-${id}`} x="1" y="26" width="21" height="21" rx="3"
          fill={dark} style={{ opacity: 0.12, animation: `bt-wave-${id} 2.4s ease-in-out 0.6s infinite` }} />
        <rect className={`bt-w-${id}`} x="26" y="26" width="21" height="21" rx="3"
          fill={violet} style={{ opacity: 0.12, animation: `bt-wave-${id} 2.4s ease-in-out 0.9s infinite` }} />
      </svg>
    );
  }

  // Story variant — logo assembles itself
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="status"
      aria-label="Loading"
    >
      <style>{`
        @keyframes bt-s1-${id} { 0%,15% { fill: ${violet}; opacity: 0.15; } 20%,40% { fill: ${violet}; opacity: 0.9; } 45%,100% { fill: ${violet}; opacity: 0.15; } }
        @keyframes bt-s2-${id} { 0%,15% { fill: ${dark}; opacity: 0.15; } 20%,40% { fill: ${dark}; opacity: 0.65; } 45%,100% { fill: ${dark}; opacity: 0.15; } }
        @keyframes bt-s3-${id} { 0%,45% { fill: ${dark}; opacity: 0.15; } 50%,70% { fill: ${dark}; opacity: 0.65; } 75%,100% { fill: ${dark}; opacity: 0.15; } }
        @keyframes bt-s4-${id} { 0%,45% { fill: ${violet}; opacity: 0.15; } 50%,70% { fill: ${violet}; opacity: 0.9; } 75%,100% { fill: ${violet}; opacity: 0.15; } }
        @keyframes bt-prompt-${id} { 0%,15% { opacity: 0; } 20%,40% { opacity: 1; } 45%,100% { opacity: 0; } }
        @keyframes bt-check-${id} { 0%,45% { opacity: 0; } 50%,70% { opacity: 1; } 75%,100% { opacity: 0; } }
        @keyframes bt-pulse-${id} { 0%,75% { transform: scale(1); } 82% { transform: scale(1.05); } 90% { transform: scale(1); } 100% { transform: scale(1); } }
        .bt-story-${id} { animation: bt-pulse-${id} 3.2s ease-in-out infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .bt-story-${id} { animation: none !important; }
          .bt-story-${id} rect { animation: none !important; opacity: 0.4 !important; }
          .bt-story-${id} .bt-icon { animation: none !important; opacity: 0.7 !important; }
        }
      `}</style>
      <g className={`bt-story-${id}`}>
        {/* Top-left: violet >_ block */}
        <rect x="1" y="1" width="21" height="21" rx="3"
          fill={violet} opacity={0.15}
          style={{ animation: `bt-s1-${id} 3.2s ease-in-out infinite` }} />
        {/* Top-right: dark block */}
        <rect x="26" y="1" width="21" height="21" rx="3"
          fill={dark} opacity={0.15}
          style={{ animation: `bt-s2-${id} 3.2s ease-in-out infinite` }} />
        {/* Bottom-left: dark block */}
        <rect x="1" y="26" width="21" height="21" rx="3"
          fill={dark} opacity={0.15}
          style={{ animation: `bt-s3-${id} 3.2s ease-in-out infinite` }} />
        {/* Bottom-right: violet checkmark block */}
        <rect x="26" y="26" width="21" height="21" rx="3"
          fill={violet} opacity={0.15}
          style={{ animation: `bt-s4-${id} 3.2s ease-in-out infinite` }} />

        {/* >_ terminal prompt icon — top-left block */}
        <g className="bt-icon" fill={iconFill} opacity={0}
          style={{ animation: `bt-prompt-${id} 3.2s ease-in-out infinite` }}>
          <polygon points="5,6 9.5,11.5 5,17 8,17.1 12.5,11.5 8,5.9" />
          <rect x="10" y="15.5" width="7" height="1.8" rx="0.5" />
        </g>

        {/* Checkmark icon — bottom-right block */}
        <g className="bt-icon" fill={iconFill} opacity={0}
          style={{ animation: `bt-check-${id} 3.2s ease-in-out infinite` }}>
          <polygon points="33.5,39.5 30,35.5 32.5,35.4 33.7,36.6 41.5,28.8 41.7,31.5" />
        </g>
      </g>
    </svg>
  );
}
