import type { LngLat } from "@/lib/safety/types";

export type Endpoint = { lat: number; lng: number; label: string };

export const toLngLat = (e: Endpoint | null): LngLat | null => (e ? [e.lng, e.lat] : null);

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export type ScoreTone = "low" | "med" | "high";

/** Score bands for colouring: ≥ 85 safe, ≥ 65 caution, below that risky. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 85) return "low";
  if (score >= 65) return "med";
  return "high";
}

export function pinLabel([lng, lat]: LngLat): string {
  return `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** "28.5272,77.3735" ⇄ endpoint, for shareable URLs. */
export function parsePoint(raw: string | undefined, label: string | undefined): Endpoint | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: label?.trim() || pinLabel([lng, lat]) };
}

export const formatPoint = (e: Endpoint) => `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
