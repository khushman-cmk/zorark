"use client";

import { Construction, ShieldCheck, Shuffle, TriangleAlert, Waves, Wheat, type LucideIcon } from "lucide-react";
import type { RiskKind, RouteResult, Stretch } from "@/lib/safety/types";
import { cn } from "@/lib/cn";
import { formatDistance } from "./format";
import type { RouteKey } from "./map-layers";

const KIND: Record<RiskKind, { label: string; icon: LucideIcon; tone: string }> = {
  unplanned: { label: "Unplanned area", icon: Shuffle, tone: "bg-risk-high-soft text-risk-high" },
  water: { label: "Near water", icon: Waves, tone: "bg-water-soft text-water" },
  rural: { label: "Rural road", icon: Wheat, tone: "bg-rural-soft text-rural" },
  surface: { label: "Bad surface", icon: Construction, tone: "bg-risk-med-soft text-risk-med" },
  pothole: { label: "Pothole reported", icon: TriangleAlert, tone: "bg-risk-high-soft text-risk-high" },
};

export function ExplainList({
  route,
  which,
  focus,
  onFocus,
}: {
  route: RouteResult;
  which: RouteKey;
  focus: Stretch | null;
  onFocus: (stretch: Stretch | null) => void;
}) {
  const title = which === "safest" ? "Why this route" : "Risks on the fastest route";
  return (
    <section
      aria-label={title}
      data-testid="explain-list"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <h2 className="text-[0.95rem] font-bold tracking-tight text-ink">{title}</h2>
      {route.stretches.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <ShieldCheck className="size-4 text-success" /> No risky stretches on this route.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {route.stretches.map((s) => {
            const active = focus?.id === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onFocus(active ? null : s)}
                  aria-pressed={active}
                  data-testid="stretch"
                  className={cn(
                    "w-full rounded-tile border p-3 text-left transition-colors",
                    active ? "border-pink bg-pink-soft" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    {s.kinds.map((k) => {
                      const { label, icon: Icon, tone } = KIND[k];
                      return (
                        <span key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", tone)}>
                          <Icon className="size-3" /> {label}
                        </span>
                      );
                    })}
                    {s.unavoidable && (
                      <span className="rounded-full bg-sunken px-2 py-0.5 text-[0.7rem] font-semibold text-muted">
                        Unavoidable
                      </span>
                    )}
                  </span>
                  <span className="mt-2 block text-sm leading-snug text-ink">{s.reasons[0]}</span>
                  {s.reasons.slice(1).map((r) => (
                    <span key={r} className="mt-1 block text-xs leading-snug text-ink-soft">
                      {r}
                    </span>
                  ))}
                  <span className="mt-2 block text-[0.7rem] text-muted">
                    {formatDistance(s.lengthM)} · starts {formatDistance(s.startM)} in
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
