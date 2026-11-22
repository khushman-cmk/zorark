"use client";

import { ChevronDown } from "lucide-react";
import type { RouteResult } from "@/lib/safety/types";
import { formatDistance } from "./format";

/** Turn-by-turn instructions, collapsed by default. */
export function RouteSteps({ route }: { route: RouteResult }) {
  if (!route.instructions.length) return null;
  return (
    <details className="group rounded-card border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold text-ink">
        Turn-by-turn ({route.instructions.length} steps)
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-2 px-4 pb-4">
        {route.instructions.map((ins, i) => (
          <li key={`${ins.at}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-ink-soft">{ins.text}</span>
            {ins.distanceM > 0 && <span className="shrink-0 text-xs text-muted">{formatDistance(ins.distanceM)}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
