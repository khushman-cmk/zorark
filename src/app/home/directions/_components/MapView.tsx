"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { MapPinOff } from "lucide-react";
import type { DirectionsResponse, LngLat, Stretch } from "@/lib/safety/types";
import { cn } from "@/lib/cn";
import {
  blankStyle,
  ensureLayers,
  readColors,
  showPotholes,
  showRoutes,
  showStretch,
  type RouteKey,
} from "./map-layers";

/**
 * The route map. Client-only (WebGL), loaded through next/dynamic.
 *
 * MapLibre is driven imperatively: React state flows in through props, and
 * each effect pushes just its slice into the map. Props are mirrored into a
 * ref so the `style.load` handler — which fires again after every theme
 * switch — can redraw everything from the latest values.
 */

const STYLE = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || "https://tiles.openfreemap.org/styles/positron",
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_DARK || "https://tiles.openfreemap.org/styles/dark",
};
const NCR_CENTER: LngLat = [77.21, 28.61];
const STYLE_TIMEOUT_MS = 10_000;

export type MapViewProps = {
  theme: "light" | "dark";
  from: LngLat | null;
  to: LngLat | null;
  result: DirectionsResponse | null;
  selected: RouteKey;
  focus: Stretch | null;
  overlay: boolean;
  picking: boolean;
  onPick: (lngLat: LngLat) => void;
};

function pin(label: string, tone: "pink" | "dark") {
  const el = document.createElement("div");
  el.className = cn(
    "grid size-8 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow-pill",
    tone === "pink" ? "bg-pink-strong" : "bg-panel",
  );
  el.textContent = label;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function MapView(props: MapViewProps) {
  const { from, to } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<{ from: Marker | null; to: Marker | null }>({ from: null, to: null });
  const latest = useRef(props);
  const [ready, setReady] = useState(false);
  // Client-only component (next/dynamic, ssr: false), so `document` exists here.
  const [failed] = useState(() => !hasWebGL());
  const [basemapDown, setBasemapDown] = useState(false);

  useEffect(() => {
    latest.current = props;
  });

  // Create the map once.
  useEffect(() => {
    if (failed || !container.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new MapLibreMap({
        container: container.current,
        style: STYLE[latest.current.theme],
        center: NCR_CENTER,
        zoom: 10.5,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error("[map] could not start the map", err);
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    const redraw = () => {
      const p = latest.current;
      const colors = readColors();
      ensureLayers(map, colors, p.overlay);
      showRoutes(map, colors, p.result, p.selected);
      showStretch(map, p.result?.[p.selected] ?? null, p.focus);
      showPotholes(map, p.result?.potholes ?? []);
      setReady(true);
    };
    map.on("style.load", redraw);

    // If the tile host is unreachable, fall back to a plain background so the
    // routes, pins and explanations still work.
    const fallback = window.setTimeout(() => {
      if (!map.isStyleLoaded()) {
        setBasemapDown(true);
        map.setStyle(blankStyle(readColors()));
      }
    }, STYLE_TIMEOUT_MS);
    map.once("style.load", () => window.clearTimeout(fallback));

    map.on("click", (e) => {
      if (latest.current.picking) latest.current.onPick([e.lngLat.lng, e.lngLat.lat]);
    });

    return () => {
      window.clearTimeout(fallback);
      map.remove();
      mapRef.current = null;
    };
  }, [failed]);

  // Theme switch: new basemap; style.load redraws our layers.
  const firstTheme = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    map.setStyle(basemapDown ? blankStyle(readColors()) : STYLE[props.theme]);
  }, [props.theme, basemapDown]);

  // Routes, selection and potholes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    showRoutes(map, readColors(), props.result, props.selected);
    showPotholes(map, props.result?.potholes ?? []);
  }, [ready, props.result, props.selected]);

  // Fit the view to a fresh result.
  useEffect(() => {
    const map = mapRef.current;
    const r = props.result;
    if (!map || !r) return;
    const [w, s, e, n] = [
      Math.min(r.fastest.bbox[0], r.safest.bbox[0]),
      Math.min(r.fastest.bbox[1], r.safest.bbox[1]),
      Math.max(r.fastest.bbox[2], r.safest.bbox[2]),
      Math.max(r.fastest.bbox[3], r.safest.bbox[3]),
    ];
    map.fitBounds(new LngLatBounds([w, s], [e, n]), { padding: 60, maxZoom: 16, duration: 600 });
  }, [props.result]);

  // Focus a risky stretch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const route = props.result?.[props.selected] ?? null;
    showStretch(map, route, props.focus);
    if (props.focus) {
      const [w, s, e, n] = props.focus.bbox;
      map.fitBounds(new LngLatBounds([w, s], [e, n]), { padding: 90, maxZoom: 17, duration: 500 });
    }
  }, [ready, props.focus, props.result, props.selected]);

  // Risk overlay toggle (loaded lazily the first time it is switched on).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ensureLayers(map, readColors(), props.overlay);
  }, [ready, props.overlay]);

  // Start / end pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ends = { from, to };
    for (const key of ["from", "to"] as const) {
      const at = ends[key];
      const current = markers.current[key];
      if (!at) {
        current?.remove();
        markers.current[key] = null;
      } else if (current) {
        current.setLngLat(at);
      } else {
        markers.current[key] = new Marker({ element: pin(key === "from" ? "A" : "B", key === "from" ? "pink" : "dark") })
          .setLngLat(at)
          .addTo(map);
      }
    }
  }, [from, to]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = props.picking ? "crosshair" : "";
  }, [props.picking, ready]);

  if (failed) {
    return (
      <div className="grid h-full place-items-center rounded-card border border-line bg-sunken p-6 text-center">
        <div>
          <MapPinOff className="mx-auto size-8 text-muted" />
          <p className="mt-3 text-sm font-semibold text-ink">The map needs WebGL</p>
          <p className="mt-1 text-xs text-muted">Routes and explanations still work in the panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={container}
        role="region"
        aria-label="Route map"
        data-testid="directions-map"
        className="h-full w-full overflow-hidden rounded-card border border-line bg-sunken"
      />
      {basemapDown && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 text-[0.7rem] font-medium text-muted shadow-pill">
          Basemap unavailable — showing routes only
        </p>
      )}
    </div>
  );
}
