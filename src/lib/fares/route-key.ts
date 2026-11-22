import { fareConfig } from "./config";
import type { Coord } from "./types";

/**
 * Cache keys quantised onto a coordinate grid, so two people standing a few
 * metres apart share a cached answer instead of each costing the shared
 * account a request.
 *
 * Known limitation, worth stating in the UI rather than hiding: this is a
 * grid, so two points metres apart either side of a cell edge do not share a
 * row. Coarsening FARE_CACHE_GRID_DEG trades precision for hit rate.
 */

function quantise(value: number): string {
  const grid = fareConfig.cacheGridDeg;
  return (Math.round(value / grid) * grid).toFixed(4);
}

export function routeKey(pickup: Coord, drop: Coord): string {
  const p = `${quantise(pickup.latitude)},${quantise(pickup.longitude)}`;
  const d = `${quantise(drop.latitude)},${quantise(drop.longitude)}`;
  return `${p}|${d}`;
}

/** Great-circle distance in km, used for the `meta` SSE event. */
export function straightLineKm(pickup: Coord, drop: Coord): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(drop.latitude - pickup.latitude);
  const dLng = toRad(drop.longitude - pickup.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(pickup.latitude)) *
      Math.cos(toRad(drop.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

/**
 * Splits a formatted address into the locality and city Rapido's SEO fare URL
 * needs. The address arrives as "Locality, City, State, Country", so the city
 * is third from the end. Returns null when the address is too coarse to use.
 */
export function localityAndCity(
  coord: Coord,
): { locality: string; city: string } | null {
  const parts = (coord.address ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  return {
    city: parts[parts.length - 3],
    locality: coord.name?.trim() || parts[0],
  };
}
