import { cn } from "@/lib/cn";

export type MonumentKey = "taj" | "gate" | "towers" | "skyline";

/**
 * City silhouettes for the destination tiles.
 *
 * The reference design uses photographs. There are no licensed photos in this
 * project and remote images are out of scope, so each city gets a drawn
 * landmark instead: same visual weight, no assets, and it re-tints with the
 * theme. Everything paints with currentColor, so the caller sets the tone.
 */
export function Monument({
  variant,
  className,
}: {
  variant: MonumentKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 90"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMax meet"
    >
      {variant === "taj" && <Taj />}
      {variant === "gate" && <Gate />}
      {variant === "towers" && <Towers />}
      {variant === "skyline" && <Skyline />}
    </svg>
  );
}

/** Agra. */
function Taj() {
  return (
    <g fill="currentColor">
      <rect x="16" y="80" width="128" height="10" />
      {[24, 44, 112, 132].map((x) => (
        <g key={x}>
          <rect x={x - 4} y="34" width="8" height="46" rx="2" />
          <circle cx={x} cy="31" r="6" />
          <rect x={x - 1.5} y="20" width="3" height="9" rx="1.5" />
        </g>
      ))}
      <rect x="56" y="52" width="48" height="28" />
      <path d="M80 20c14 0 24 11 24 24 0 3-1 6-2 8H58c-1-2-2-5-2-8 0-13 10-24 24-24Z" />
      <rect x="78.5" y="8" width="3" height="11" rx="1.5" />
      <circle cx="80" cy="6" r="3" />
      <path d="M72 80V66a8 8 0 0 1 16 0v14Z" fill="var(--zp-ink)" opacity="0.35" />
    </g>
  );
}

/** Delhi. */
function Gate() {
  return (
    <g fill="currentColor">
      <rect x="20" y="82" width="120" height="8" />
      <path d="M38 82V30c0-6 5-11 11-11h62c6 0 11 5 11 11v52h-18V38c0-3-2-5-5-5H61c-3 0-5 2-5 5v44Z" />
      <path d="M56 82V44a24 24 0 0 1 48 0v38h-14V46a10 10 0 0 0-20 0v36Z" />
      <rect x="34" y="14" width="92" height="8" rx="2" />
      <rect x="42" y="6" width="76" height="7" rx="2" />
      <rect x="76" y="0" width="8" height="5" rx="2" />
    </g>
  );
}

/** Noida. */
function Towers() {
  return (
    <g fill="currentColor">
      <rect x="8" y="84" width="144" height="6" />
      <rect x="14" y="46" width="26" height="38" rx="2" />
      <rect x="44" y="24" width="22" height="60" rx="2" />
      <rect x="70" y="10" width="26" height="74" rx="3" />
      <rect x="80" y="2" width="6" height="9" rx="3" />
      <rect x="100" y="34" width="24" height="50" rx="2" />
      <rect x="128" y="54" width="22" height="30" rx="2" />
      <g fill="var(--zp-ink)" opacity="0.28">
        {[
          [20, 54], [30, 54], [20, 68], [30, 68],
          [50, 34], [58, 34], [50, 50], [58, 50], [50, 66], [58, 66],
          [76, 22], [86, 22], [76, 40], [86, 40], [76, 58], [86, 58],
          [106, 44], [114, 44], [106, 62], [114, 62],
          [134, 62], [142, 62],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="5" height="7" rx="1" />
        ))}
      </g>
    </g>
  );
}

/** Gurgaon. */
function Skyline() {
  return (
    <g fill="currentColor">
      <rect x="4" y="84" width="152" height="6" />
      <path d="M12 84V52l18-10 18 10v42Z" />
      <rect x="54" y="30" width="20" height="54" rx="2" />
      <path d="M78 84V18l14-12 14 12v66Z" />
      <rect x="110" y="40" width="18" height="44" rx="2" />
      <path d="M132 84V56l12-8 12 8v28Z" />
      <g fill="var(--zp-ink)" opacity="0.28">
        {[
          [20, 60], [32, 60], [20, 72], [32, 72],
          [60, 40], [60, 56], [60, 70],
          [84, 30], [94, 30], [84, 48], [94, 48], [84, 66], [94, 66],
          [116, 50], [116, 66],
          [138, 64], [146, 64],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="5" height="7" rx="1" />
        ))}
      </g>
    </g>
  );
}
