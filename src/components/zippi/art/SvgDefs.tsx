/**
 * Shared SVG gradient and clip definitions, mounted exactly once per page.
 *
 * Two components that each carry their own <linearGradient id="g"> produce
 * duplicate IDs in the document; url(#g) then binds to whichever came first
 * and the other renders wrong, often only in a production build. Hoisting the
 * defs here makes the IDs unique by construction.
 *
 * The stops read CSS custom properties, so a single shared definition still
 * themes correctly when :root.dark swaps the values underneath it.
 */
export function SvgDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="pointer-events-none absolute"
    >
      <defs>
        <linearGradient id="zp-grad-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--zp-pink-400)" />
          <stop offset="55%" stopColor="var(--zp-pink)" />
          <stop offset="100%" stopColor="var(--zp-pink-strong)" />
        </linearGradient>

        <linearGradient id="zp-grad-pink-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--zp-pink)" />
          <stop offset="100%" stopColor="var(--zp-pink-strong)" />
        </linearGradient>

        {/* Darkens the foot of a destination tile so white text stays legible. */}
        <linearGradient id="zp-grad-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="35%" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.78)" />
        </linearGradient>

        <radialGradient id="zp-grad-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--zp-pink-300)" />
          <stop offset="70%" stopColor="var(--zp-pink)" />
          <stop offset="100%" stopColor="var(--zp-pink-strong)" />
        </radialGradient>

        <linearGradient id="zp-grad-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--zp-pink)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--zp-pink)" stopOpacity="0.02" />
        </linearGradient>

        <linearGradient id="zp-grad-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--zp-ink)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--zp-ink)" stopOpacity="0.30" />
        </linearGradient>
      </defs>
    </svg>
  );
}
