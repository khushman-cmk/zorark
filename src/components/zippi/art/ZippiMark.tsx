import { cn } from "@/lib/cn";

/**
 * The Zippi bolt: a stylised "Z" drawn as a lightning stroke, with three
 * speed lines trailing it. Carries the pink gradient from SvgDefs, so it needs
 * that component mounted somewhere on the page.
 */
export function ZippiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-8 w-auto", className)}
    >
      <path
        d="M15 7h16L18 22h15"
        stroke="url(#zp-grad-pink)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 7h2.5M9 14.5h3.5M6 22h2.5"
        stroke="url(#zp-grad-pink)"
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

/**
 * The bolt plus the wordmark. "Zippi" stays real text rather than paths so it
 * inherits the font, remains selectable, and is read out by screen readers.
 */
export function ZippiWordmark({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ZippiMark className={markClassName} />
      <span
        className={cn(
          "text-[1.6rem] font-extrabold tracking-tight leading-none",
          textClassName,
        )}
      >
        Zippi
      </span>
    </span>
  );
}
