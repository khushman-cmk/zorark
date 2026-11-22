import type { LucideIcon } from "lucide-react";
import { HeroScene } from "./art/HeroScene";
import { IconTile, PillButton } from "./Primitives";

/**
 * Placeholder for the dashboard sections that are designed but not built yet.
 * Keeps every sidebar link resolving to a real, on-theme page instead of a 404.
 */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-70 lg:block">
        <HeroScene className="h-full w-full" />
      </div>

      <div className="relative z-10 max-w-lg p-8 sm:p-12">
        <IconTile icon={icon} />
        <h1 className="mt-5 text-[2rem] font-extrabold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2.5 text-[0.95rem] leading-relaxed text-muted">{description}</p>
        <PillButton href="/home" className="mt-7">
          Back to dashboard
        </PillButton>
      </div>
    </section>
  );
}
