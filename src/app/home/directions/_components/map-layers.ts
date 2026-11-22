import type { AddLayerObject, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { DirectionsResponse, PotholeMarker, RouteResult, Stretch } from "@/lib/safety/types";

/**
 * Everything Zippi draws on top of the basemap.
 *
 * `setStyle` (theme switch) wipes custom sources and layers, so `ensureLayers`
 * is idempotent and re-run on every `style.load`. Colours come from the
 * `--zp-*` CSS tokens because MapLibre paint properties cannot read CSS vars.
 */

export type RouteKey = "fastest" | "safest";

export type MapColors = {
  low: string;
  med: string;
  high: string;
  alt: string;
  water: string;
  rural: string;
  pink: string;
  surface: string;
  canvas: string;
};

export function readColors(): MapColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    low: v("--zp-risk-low", "#16a34a"),
    med: v("--zp-risk-med", "#d97706"),
    high: v("--zp-risk-high", "#dc2626"),
    alt: v("--zp-route-alt", "#8b8b94"),
    water: v("--zp-water", "#2563eb"),
    rural: v("--zp-rural", "#a16207"),
    pink: v("--zp-pink", "#ff2e7e"),
    surface: v("--zp-surface", "#ffffff"),
    canvas: v("--zp-canvas", "#fafafa"),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const ID = {
  overlay: "zp-overlay",
  route: (r: RouteKey) => `zp-route-${r}`,
  casing: (r: RouteKey) => `zp-route-${r}-casing`,
  stretch: "zp-stretch",
  potholes: "zp-potholes",
} as const;

type LineColor = NonNullable<Extract<AddLayerObject, { type: "line" }>["paint"]>["line-color"];

/** Paint for the route that is in focus: coloured by risk along its length. */
function riskColor(c: MapColors): LineColor {
  return ["interpolate", ["linear"], ["get", "risk"], 0, c.low, 0.25, c.med, 0.55, c.high];
}

function firstSymbolLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

function addSource(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection | string) {
  if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
}

function addLayer(map: MapLibreMap, layer: AddLayerObject, before?: string) {
  if (!map.getLayer(layer.id)) map.addLayer(layer, before);
}

export function ensureLayers(map: MapLibreMap, c: MapColors, overlay: boolean) {
  if (overlay) {
    addSource(map, ID.overlay, "/safety/overlay.geojson");
    addLayer(
      map,
      {
        id: ID.overlay,
        type: "fill",
        source: ID.overlay,
        paint: {
          "fill-color": ["match", ["get", "kind"], "water", c.water, "rural", c.rural, c.high],
          "fill-opacity": ["*", 0.11, ["get", "band"]],
        },
      },
      firstSymbolLayer(map),
    );
  }
  if (map.getLayer(ID.overlay)) map.setLayoutProperty(ID.overlay, "visibility", overlay ? "visible" : "none");

  for (const r of ["fastest", "safest"] as const) {
    addSource(map, ID.route(r), EMPTY);
    addLayer(map, {
      id: ID.casing(r),
      type: "line",
      source: ID.route(r),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.surface, "line-width": 9 },
    });
    addLayer(map, {
      id: ID.route(r),
      type: "line",
      source: ID.route(r),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.alt, "line-width": 5 },
    });
  }

  addSource(map, ID.stretch, EMPTY);
  addLayer(map, {
    id: ID.stretch,
    type: "line",
    source: ID.stretch,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": c.pink, "line-width": 16, "line-opacity": 0.3 },
  });

  addSource(map, ID.potholes, EMPTY);
  addLayer(map, {
    id: ID.potholes,
    type: "circle",
    source: ID.potholes,
    paint: {
      "circle-radius": ["+", 4, ["*", 2, ["get", "severity"]]],
      "circle-color": ["match", ["get", "severity"], 3, c.high, 2, c.med, c.rural],
      "circle-stroke-color": c.surface,
      "circle-stroke-width": 2,
    },
  });
}

function routeFeatures(route: RouteResult): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: route.segments.map((s) => ({
      type: "Feature",
      properties: { risk: s.risk },
      geometry: { type: "LineString", coordinates: route.geometry.slice(s.from, s.to + 1) },
    })),
  };
}

function setData(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

/** Draw both routes; the selected one is coloured by risk and drawn on top. */
export function showRoutes(map: MapLibreMap, c: MapColors, result: DirectionsResponse | null, selected: RouteKey) {
  const order: RouteKey[] = selected === "safest" ? ["fastest", "safest"] : ["safest", "fastest"];
  for (const r of order) {
    const route = result && !(result.sameRoute && r === "fastest") ? result[r] : null;
    setData(map, ID.route(r), route ? routeFeatures(route) : EMPTY);
    const active = r === selected || Boolean(result?.sameRoute);
    map.setPaintProperty(ID.route(r), "line-color", active ? riskColor(c) : c.alt);
    map.setPaintProperty(ID.route(r), "line-width", active ? 6 : 4.5);
    map.setPaintProperty(ID.route(r), "line-opacity", active ? 1 : 0.75);
    map.setPaintProperty(ID.casing(r), "line-width", active ? 10 : 7);
    // Re-stacking keeps the focused route above the other one.
    map.moveLayer(ID.casing(r));
    map.moveLayer(ID.route(r));
  }
  map.moveLayer(ID.stretch, ID.casing(order[1]));
  map.moveLayer(ID.potholes);
}

export function showStretch(map: MapLibreMap, route: RouteResult | null, stretch: Stretch | null) {
  setData(
    map,
    ID.stretch,
    route && stretch
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: route.geometry.slice(stretch.from, stretch.to + 1) },
            },
          ],
        }
      : EMPTY,
  );
}

export function showPotholes(map: MapLibreMap, potholes: PotholeMarker[]) {
  setData(map, ID.potholes, {
    type: "FeatureCollection",
    features: potholes.map((p) => ({
      type: "Feature",
      properties: { id: p.id, severity: p.severity, confirmations: p.confirmations },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  });
}

/** A style with no basemap, so routes still render if the tile host is down. */
export function blankStyle(c: MapColors) {
  return {
    version: 8 as const,
    sources: {},
    layers: [{ id: "background", type: "background" as const, paint: { "background-color": c.canvas } }],
  };
}
