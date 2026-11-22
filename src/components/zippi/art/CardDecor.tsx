import { cn } from "@/lib/cn";

/** Soft pink waves along the foot of the wallet card. */
export function WalletWaves({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
    >
      <path
        d="M0 70c46-26 92-26 138 0s92 26 138 0l44-22v72H0Z"
        fill="var(--zp-pink)"
        opacity="0.22"
      />
      <path
        d="M0 92c46-26 92-26 138 0s92 26 138 0l44-20v48H0Z"
        fill="var(--zp-pink)"
        opacity="0.55"
      />
      <path
        d="M0 110c52-20 104-20 156 0s112 16 164-6v16H0Z"
        fill="var(--zp-pink-strong)"
        opacity="0.75"
      />
    </svg>
  );
}

/**
 * The skyline that bleeds off the bottom of the sidebar. `slice` crops it
 * rather than squashing it, and the parent clips the overflow, so it can
 * never widen the page.
 */
export function SidebarSkyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 290 128"
      fill="none"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
      className={cn("h-full w-full", className)}
    >
      <g fill="var(--zp-pink)" opacity="0.20">
        {[
          [4, 24, 46], [32, 16, 72], [52, 30, 38], [86, 20, 60], [110, 26, 84],
          [140, 18, 50], [162, 32, 66], [198, 22, 92], [224, 28, 54], [256, 30, 74],
        ].map(([x, w, h]) => (
          <rect key={x} x={x} y={92 - h} width={w} height={h} rx="2" />
        ))}
      </g>
      <g fill="var(--zp-pink)" opacity="0.45">
        {[
          [0, 30, 28], [36, 22, 46], [62, 36, 22], [104, 24, 38], [134, 32, 26],
          [172, 22, 44], [200, 36, 24], [242, 22, 38], [268, 22, 26],
        ].map(([x, w, h]) => (
          <rect key={`n${x}`} x={x} y={92 - h} width={w} height={h} rx="2" />
        ))}
      </g>

      {/* Road, light trail, and a car heading into town. */}
      <rect x="0" y="92" width="290" height="36" fill="var(--zp-pink)" opacity="0.10" />
      <path
        d="M6 122c26-9 58-14 96-15"
        stroke="var(--zp-pink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M18 112c22-6 48-9 78-10"
        stroke="var(--zp-pink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <g>
        <ellipse cx="196" cy="120" rx="40" ry="5" fill="var(--zp-pink)" opacity="0.28" />
        <ellipse cx="172" cy="116" rx="9" ry="6" fill="var(--zp-pink-strong)" opacity="0.9" />
        <ellipse cx="220" cy="116" rx="9" ry="6" fill="var(--zp-pink-strong)" opacity="0.9" />
        <path
          d="M158 116v-9c0-3 2-6 5-7l8-7c2-2 5-3 8-3h22c3 0 6 1 8 3l8 7c3 1 5 4 5 7v9Z"
          fill="var(--zp-pink)"
          opacity="0.9"
        />
        <path
          d="M170 100l6-5c2-2 4-2 6-2h18c2 0 4 0 6 2l6 5Z"
          fill="var(--zp-pink-400)"
          opacity="0.8"
        />
        <rect x="160" y="106" width="12" height="4" rx="2" fill="var(--zp-pink-strong)" />
        <rect x="218" y="106" width="12" height="4" rx="2" fill="var(--zp-pink-strong)" />
      </g>
    </svg>
  );
}
