import { cn } from "@/lib/cn";

/**
 * A sleek sedan seen from behind, with pink rim light and tail lights.
 * Used at large size in the hero and smaller in the fuel promo card.
 * Decorative only.
 */
export function CarRear({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 210 116"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      {/* Pooled light on the road under the car. */}
      <ellipse cx="105" cy="104" rx="92" ry="10" fill="var(--zp-pink)" opacity="0.22" />

      {/* Wheels sit behind the body so only the lower arc shows. */}
      <ellipse cx="48" cy="93" rx="17" ry="12" fill="#08080a" />
      <ellipse cx="162" cy="93" rx="17" ry="12" fill="#08080a" />

      {/* Body. */}
      <path
        d="M20 92 L18 64 C18 55 24 48 33 45 L54 26 C59 21 66 18 73 18 H137 C144 18 151 21 156 26 L177 45 C186 48 192 55 192 64 L190 92 Z"
        fill="#141419"
      />

      {/* Roof highlight, catching the sun. */}
      <path
        d="M54 26 C59 21 66 18 73 18 H137 C144 18 151 21 156 26 L166 35 H44 Z"
        fill="#24242c"
      />

      {/* Rear windscreen. */}
      <path
        d="M62 40 C64 34 69 30 75 30 H135 C141 30 146 34 148 40 L152 56 H58 Z"
        fill="#0a0a0d"
      />
      <path
        d="M62 40 C64 34 69 30 75 30 H98 L94 56 H58 Z"
        fill="#2e2e38"
        opacity="0.55"
      />

      {/* Tail lights. */}
      <rect x="26" y="62" width="42" height="11" rx="5.5" fill="url(#zp-grad-pink-v)" />
      <rect x="142" y="62" width="42" height="11" rx="5.5" fill="url(#zp-grad-pink-v)" />

      {/* Rim light down each flank. */}
      <path
        d="M18 64 C18 55 24 48 33 45 L54 26"
        stroke="var(--zp-pink)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M192 64 C192 55 186 48 177 45 L156 26"
        stroke="var(--zp-pink)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Bumper and plate. */}
      <rect x="72" y="78" width="66" height="10" rx="3" fill="#0a0a0d" />
      <rect x="86" y="80" width="38" height="6" rx="2" fill="#3a3a45" opacity="0.7" />
    </svg>
  );
}
