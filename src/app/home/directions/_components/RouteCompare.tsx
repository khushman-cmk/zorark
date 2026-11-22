"use client";

import { Clock, ShieldCheck, Zap } from "lucide-react";
import type { DirectionsResponse, RouteResult } from "@/lib/safety/types";
import { cn } from "@/lib/cn";
import { formatDistance, formatDuration, scoreTone } from "./format";
import type { RouteKey } from "./map-layers";

const TONE = {
  low: "bg-success-soft text-success",
  med: "bg-risk-med-soft text-risk-med",
  high: "bg-risk-high-soft text-risk-high",
} as const;

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-baseline gap-0.5 rounded-full px-2.5 py-1 text-sm font-bold", TONE[scoreTone(score)], className)}
      aria-label={`Safety score ${score} out of 100`}
    >
      {score}
      <span className="text-[0.65rem] font-semibold opacity-80">/100</span>
    </span>
  );
}

function tradeoff(fastest: RouteResult, safest: RouteResult): string {
  const extraMin = Math.round((safest.timeS - fastest.timeS) / 60);
  const avoided = fastest.safety.riskyM - safest.safety.riskyM;
  const time = extraMin <= 0 ? "Same time" : `+${extraMin} min`;
  return avoided > 0 ? `${time} · avoids ${formatDistance(avoided)} of risky road` : time;
}

function Card({
  kind,
  route,
  active,
  onSelect,
  note,
}: {
  kind: RouteKey | "both";
  route: RouteResult;
  active: boolean;
  onSelect?: () => void;
  note?: string;
}) {
  const Icon = kind === "fastest" ? Zap : ShieldCheck;
  const title = kind === "fastest" ? "Fastest" : kind === "safest" ? "Safest" : "Fastest & safest";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`route-card-${kind}`}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-card border bg-surface p-4 text-left shadow-card transition-colors",
        active ? "border-pink ring-2 ring-pink-soft-2" : "border-line hover:border-line-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Icon className={cn("size-3.5", kind === "fastest" ? "text-muted" : "text-success")} />
          {title}
        </span>
        <ScoreBadge score={route.safety.score} />
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-xl font-extrabold tracking-tight text-ink">{formatDuration(route.timeS)}</span>
        <span className="text-sm text-muted">{formatDistance(route.distanceM)}</span>
      </span>
      <span className="text-xs text-ink-soft">
        {route.safety.riskyM > 0 ? `${formatDistance(route.safety.riskyM)} of risky road` : "No risky stretches"}
        {route.safety.potholeCount > 0 &&
          ` · ${route.safety.potholeCount} pothole${route.safety.potholeCount === 1 ? "" : "s"}`}
      </span>
      {note && <span className="text-xs font-semibold text-success">{note}</span>}
    </button>
  );
}

export function RouteCompare({
  result,
  selected,
  onSelect,
}: {
  result: DirectionsResponse;
  selected: RouteKey;
  onSelect: (key: RouteKey) => void;
}) {
  if (result.sameRoute) {
    return (
      <section aria-label="Route comparison" data-testid="route-compare">
        <Card kind="both" route={result.safest} active note="The fastest route is already the safest one." />
      </section>
    );
  }
  return (
    <section aria-label="Route comparison" data-testid="route-compare" className="grid grid-cols-2 gap-3">
      <Card
        kind="safest"
        route={result.safest}
        active={selected === "safest"}
        onSelect={() => onSelect("safest")}
        note={tradeoff(result.fastest, result.safest)}
      />
      <Card kind="fastest" route={result.fastest} active={selected === "fastest"} onSelect={() => onSelect("fastest")} />
      <p className="col-span-2 flex items-center gap-1.5 text-[0.7rem] text-muted">
        <Clock className="size-3" /> Times are without live traffic.
      </p>
    </section>
  );
}
