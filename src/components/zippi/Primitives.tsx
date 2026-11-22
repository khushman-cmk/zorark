import Link from "next/link";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { ArrowRight, ChevronRight, MapPin, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/* ── Card ───────────────────────────────────────────────────────────── */

const CARD_TONE = {
  surface: "bg-surface border border-line",
  dark: "bg-panel border border-panel-line text-panel-fg",
  wash: "bg-pink-soft border border-pink-soft-2",
} as const;

export function Card({
  as: Tag = "div",
  tone = "surface",
  padded = true,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  tone?: keyof typeof CARD_TONE;
  padded?: boolean;
  className?: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <Tag
      className={cn(
        "relative min-w-0 overflow-hidden rounded-card shadow-card",
        CARD_TONE[tone],
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ── Section header ─────────────────────────────────────────────────── */

export function SectionHeader({
  title,
  action,
  onDark = false,
  className,
}: {
  title: string;
  action?: { label: string; href: string };
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h2
        className={cn(
          "min-w-0 truncate text-[0.95rem] font-bold tracking-tight",
          onDark ? "text-panel-fg" : "text-ink",
        )}
      >
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1 text-xs font-semibold transition-colors",
            onDark
              ? "text-panel-muted hover:text-panel-fg"
              : "text-muted hover:text-pink-ink",
          )}
        >
          {action.label}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/* ── Pill button ────────────────────────────────────────────────────── */

const PILL_TONE = {
  pink: "zp-fill-pink shadow-pink hover:brightness-108",
  dark: "bg-panel text-panel-fg hover:bg-panel-card",
  ghost: "bg-surface text-ink border border-line hover:border-line-strong",
} as const;

const PILL_SIZE = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-5 text-sm",
} as const;

export function PillButton({
  href,
  tone = "pink",
  size = "md",
  icon: Icon = ArrowRight,
  showIcon = true,
  className,
  children,
  ...rest
}: {
  href?: string;
  tone?: keyof typeof PILL_TONE;
  size?: keyof typeof PILL_SIZE;
  icon?: LucideIcon;
  showIcon?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "children">) {
  const classes = cn(
    "group inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-all",
    PILL_TONE[tone],
    PILL_SIZE[size],
    className,
  );

  const inner = (
    <>
      {children}
      {showIcon && (
        <Icon className="size-4 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {inner}
    </button>
  );
}

/* ── Icon tile ──────────────────────────────────────────────────────── */

const TILE_SIZE = {
  sm: "size-10 rounded-xl [&>svg]:size-[18px]",
  md: "size-12 rounded-tile [&>svg]:size-[22px]",
} as const;

export function IconTile({
  icon: Icon,
  tone = "wash",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: "wash" | "pink" | "onDark";
  size?: keyof typeof TILE_SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors",
        TILE_SIZE[size],
        tone === "wash" && "bg-pink-soft text-pink-ink",
        tone === "pink" && "zp-fill-pink",
        tone === "onDark" && "bg-white/10 text-pink",
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

/* ── Status pill ────────────────────────────────────────────────────── */

export function StatusPill({
  tone = "success",
  children,
}: {
  tone?: "success" | "muted" | "pink";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
        tone === "success" && "bg-success-soft text-success",
        tone === "muted" && "bg-sunken text-muted",
        tone === "pink" && "bg-pink-soft text-pink-ink",
      )}
    >
      {children}
    </span>
  );
}

/* ── Location chip ──────────────────────────────────────────────────── */

export function LocationChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[0.7rem] font-medium text-ink-soft">
      <MapPin className="size-3 shrink-0 text-pink" />
      <span className="truncate">{label}</span>
      <ChevronRight className="size-3 shrink-0 text-muted" />
    </span>
  );
}
