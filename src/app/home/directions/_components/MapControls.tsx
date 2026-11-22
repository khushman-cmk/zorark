"use client";

import { Layers, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Floating buttons over the map: risk overlay toggle, report mode, legends. */
export function MapControls({
  overlay,
  onOverlay,
  reportMode,
  onReportMode,
  hasRoute,
}: {
  overlay: boolean;
  onOverlay: (on: boolean) => void;
  reportMode: boolean;
  onReportMode: (on: boolean) => void;
  hasRoute: boolean;
}) {
  const pill =
    "pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold shadow-pill transition-colors";
  return (
    <>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => onOverlay(!overlay)}
          aria-pressed={overlay}
          data-testid="toggle-overlay"
          className={cn(pill, overlay ? "border-pink bg-pink-soft text-pink-ink" : "border-line bg-surface text-ink hover:border-line-strong")}
        >
          <Layers className="size-3.5" /> Risk map
        </button>
        <button
          type="button"
          onClick={() => onReportMode(!reportMode)}
          aria-pressed={reportMode}
          data-testid="toggle-report"
          className={cn(pill, reportMode ? "border-pink bg-pink-soft text-pink-ink" : "border-line bg-surface text-ink hover:border-line-strong")}
        >
          <TriangleAlert className="size-3.5" /> Report pothole
        </button>
      </div>

      {reportMode && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-panel px-4 py-2 text-xs font-semibold text-panel-fg shadow-pill">
          Tap the road where the pothole is
          <button type="button" onClick={() => onReportMode(false)} aria-label="Cancel reporting" className="rounded-full p-0.5 hover:bg-white/10">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top-left: the map's attribution expands along the bottom edge on small screens. */}
      {(overlay || hasRoute) && !reportMode && (
        <div data-testid="map-legend" className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-9.5rem)] flex-col gap-1.5 rounded-tile border border-line bg-surface/95 p-2.5 text-[0.7rem] text-ink-soft shadow-pill">
          {hasRoute && (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-12 rounded-full bg-gradient-to-r from-risk-low via-risk-med to-risk-high" />
              Route: safe → risky
            </span>
          )}
          {overlay && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-risk-high/60" /> Unplanned</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-water/60" /> Near water</span>
              <span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-sm bg-rural/60" /> Rural</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}
