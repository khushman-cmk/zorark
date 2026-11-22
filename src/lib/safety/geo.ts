import type { LngLat } from "./types";

/** Small-distance geometry on WGS84 coordinates (city scale, metre accuracy). */

const R = 6_371_008.8;
const RAD = Math.PI / 180;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative distance (m) at each vertex of a polyline. */
export function cumulativeM(line: LngLat[]): Float64Array {
  const out = new Float64Array(line.length);
  for (let i = 1; i < line.length; i++) out[i] = out[i - 1] + haversineM(line[i - 1], line[i]);
  return out;
}

/** Distance (m) from point `p` to segment a-b, using a local flat projection around `p`. */
export function pointSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos(p[1] * RAD);
  const ky = 111_320;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export type Bbox = [number, number, number, number];

export function bboxOf(points: LngLat[]): Bbox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

export function padBbox([w, s, e, n]: Bbox, metres: number): Bbox {
  const dLat = metres / 111_320;
  const dLng = metres / (111_320 * Math.cos(((s + n) / 2) * RAD));
  return [w - dLng, s - dLat, e + dLng, n + dLat];
}

export function inBbox([lng, lat]: LngLat, [w, s, e, n]: Bbox): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/**
 * Distance (m) from `p` to the nearest point of `line`.
 *
 * Linear in the polyline length; routes here are a few hundred vertices, and
 * a bbox pre-check skips far segments cheaply.
 */
export function distanceToLineM(p: LngLat, line: LngLat[], within = Infinity): number {
  let best = Infinity;
  const padLat = Math.min(within, 5_000) / 111_320;
  const padLng = padLat / Math.cos(p[1] * RAD);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (
      Number.isFinite(within) &&
      (Math.max(a[0], b[0]) < p[0] - padLng ||
        Math.min(a[0], b[0]) > p[0] + padLng ||
        Math.max(a[1], b[1]) < p[1] - padLat ||
        Math.min(a[1], b[1]) > p[1] + padLat)
    ) {
      continue;
    }
    const d = pointSegmentM(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** Points every `stepM` metres along `line`, each tagged with its segment index. */
export function sampleLine(line: LngLat[], stepM: number): Array<{ p: LngLat; seg: number; atM: number }> {
  const out: Array<{ p: LngLat; seg: number; atM: number }> = [];
  let base = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = haversineM(a, b);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], seg: i - 1, atM: base + len * t });
    }
    base += len;
  }
  return out;
}
