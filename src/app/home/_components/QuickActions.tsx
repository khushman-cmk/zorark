import Link from "next/link";
import { Bus, Car, ChevronRight, Fuel, type LucideIcon } from "lucide-react";
import { IconTile } from "@/components/zippi/Primitives";
import { QUICK_ACTIONS, type QuickAction } from "@/lib/home-data";

const ICONS: Record<QuickAction["icon"], LucideIcon> = {
  ride: Car,
  travel: Bus,
  fuel: Fuel,
};

export function QuickActions() {
  return (
    <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {QUICK_ACTIONS.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          data-testid={`quick-${action.key}`}
          className="group flex min-w-0 items-center gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pill"
        >
          <IconTile icon={ICONS[action.icon]} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem] font-bold text-ink">
              {action.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted">
              {action.subtitle}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </section>
  );
}
