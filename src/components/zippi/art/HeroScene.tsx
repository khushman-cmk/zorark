import { cn } from "@/lib/cn";
import { CarRear } from "./CarRear";

// [x, width, height] against a 214 baseline. Kept as data so the markup stays
// small and the silhouette is easy to retune.
const FAR_TOWERS: [number, number, number][] = [
  [12, 34, 78], [52, 22, 112], [78, 40, 62], [122, 26, 96], [152, 30, 132],
  [186, 20, 74], [210, 44, 104], [258, 24, 148], [286, 34, 88], [324, 28, 118],
  [356, 38, 70], [398, 22, 126], [424, 32, 92], [460, 26, 140], [490, 40, 76],
  [534, 26, 108],
];

const NEAR_TOWERS: [number, number, number][] = [
  [0, 46, 54], [50, 30, 86], [84, 52, 40], [140, 34, 70], [178, 44, 50],
  [226, 28, 92], [258, 48, 44], [310, 32, 66], [346, 50, 38], [400, 30, 80],
  [434, 44, 48], [482, 34, 72], [520, 44, 42],
];

const BASELINE = 214;

/**
 * The dashboard hero illustration: a low sun over a city skyline with a road
 * running out of frame and a car heading into town. Purely decorative.
 *
 * Every colour comes from a CSS custom property or a gradient in SvgDefs, so
 * the whole scene re-tints in dark mode without a second copy.
 */
export function HeroScene({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      <svg
        viewBox="0 0 560 320"
        fill="none"
        focusable="false"
        className="zp-fade-hero h-full w-full"
        preserveAspectRatio="xMaxYMax slice"
      >
        {/* Sun, sitting behind the skyline. */}
        <circle cx="360" cy="152" r="104" fill="url(#zp-grad-sun)" opacity="0.30" />
        <circle cx="360" cy="152" r="74" fill="url(#zp-grad-sun)" opacity="0.62" />

        {/* Atmospheric haze rising off the city. */}
        <rect x="0" y="60" width="560" height="154" fill="url(#zp-grad-haze)" />

        {/* Far skyline. */}
        <g fill="var(--zp-pink)" opacity="0.28">
          {FAR_TOWERS.map(([x, w, h]) => (
            <rect key={`f-${x}`} x={x} y={BASELINE - h} width={w} height={h} rx="2" />
          ))}
        </g>

        {/* Near skyline, with lit windows. */}
        <g fill="var(--zp-pink)" opacity="0.55">
          {NEAR_TOWERS.map(([x, w, h]) => (
            <rect key={`n-${x}`} x={x} y={BASELINE - h} width={w} height={h} rx="2" />
          ))}
        </g>
        <g fill="var(--zp-surface)" opacity="0.5">
          {NEAR_TOWERS.flatMap(([x, w, h]) =>
            Array.from({ length: Math.max(0, Math.floor(h / 22)) }, (_, row) =>
              Array.from({ length: Math.max(1, Math.floor(w / 16)) }, (_, col) => (
                <rect
                  key={`w-${x}-${row}-${col}`}
                  x={x + 6 + col * 16}
                  y={BASELINE - h + 10 + row * 22}
                  width="5"
                  height="7"
                  rx="1"
                />
              )),
            ),
          )}
        </g>

        {/* Ground and road, kept in the pink family so it never reads as a
            grey block sitting on the page. */}
        <rect x="0" y={BASELINE} width="560" height="106" fill="var(--zp-pink)" opacity="0.10" />
        <path
          d="M78 320 C140 266 232 228 560 216 L560 320 Z"
          fill="var(--zp-pink)"
          opacity="0.20"
        />
        {/* Centre line, shrinking toward the horizon. */}
        <g stroke="var(--zp-pink)" strokeLinecap="round" opacity="0.65">
          <path d="M150 314 L182 292" strokeWidth="7" />
          <path d="M214 276 L250 262" strokeWidth="5.5" />
          <path d="M284 251 L326 243" strokeWidth="4" />
          <path d="M362 237 L404 232" strokeWidth="3" />
          <path d="M436 229 L474 226" strokeWidth="2.2" />
        </g>
      </svg>

      {/* The car rides above the SVG so it can be sized independently. */}
      <CarRear className="absolute bottom-[9%] right-[8%] w-[36%] max-w-[220px]" />
    </div>
  );
}
