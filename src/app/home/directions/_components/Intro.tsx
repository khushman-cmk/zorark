"use client";

import { ArrowRight, Shuffle, TriangleAlert, Waves } from "lucide-react";
import type { Endpoint } from "./format";

/**
 * Shown before the first search: what Safe Directions does, plus a few
 * routes through known risky areas to try.
 */

const EXAMPLES: Array<{ title: string; from: Endpoint; to: Endpoint }> = [
  {
    title: "Kotla Mubarakpur, South Delhi",
    from: { lat: 28.58039, lng: 77.21501, label: "Lodhi Colony side" },
    to: { lat: 28.56901, lng: 77.23139, label: "Defence Colony side" },
  },
  {
    title: "Tughlakabad village",
    from: { lat: 28.51495, lng: 77.27621, label: "Tughlakabad east" },
    to: { lat: 28.51025, lng: 77.25779, label: "Tughlakabad west" },
  },
  {
    title: "Sector 108 → Sector 93, Noida",
    from: { lat: 28.52713, lng: 77.37168, label: "Sector 108, Noida" },
    to: { lat: 28.52027, lng: 77.39632, label: "Sector 93, Noida" },
  },
  {
    title: "Munirka, South Delhi",
    from: { lat: 28.56495, lng: 77.15907, label: "Vasant Vihar side" },
    to: { lat: 28.54485, lng: 77.18313, label: "Munirka south" },
  },
];

export function Intro({ onExample }: { onExample: (from: Endpoint, to: Endpoint) => void }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card" data-testid="directions-intro">
      <h2 className="text-[0.95rem] font-bold tracking-tight text-ink">The safest way, not just the fastest</h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink-soft">
        <li className="flex gap-2.5">
          <Shuffle className="mt-0.5 size-4 shrink-0 text-risk-high" />
          Avoids narrow lanes in unplanned villages and colonies, where roads are most likely broken.
        </li>
        <li className="flex gap-2.5">
          <Waves className="mt-0.5 size-4 shrink-0 text-water" />
          Keeps away from ponds, canals and open drains that waterlog in the rain.
        </li>
        <li className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-med" />
          Steers around potholes other riders have reported.
        </li>
      </ul>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Try a route</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            type="button"
            onClick={() => onExample(ex.from, ex.to)}
            className="group flex items-center justify-between gap-3 rounded-tile border border-line px-3 py-2.5 text-left text-sm text-ink transition-colors hover:border-pink"
          >
            {ex.title}
            <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-pink" />
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Covers Delhi NCR. Search a place or click the map to set start and destination.</p>
    </section>
  );
}
