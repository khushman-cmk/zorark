import { readFile } from "node:fs/promises";
import path from "node:path";
import { configHash, getSafetyConfig, inRegion, SAFETY_ROOT, type SafetyConfig } from "./config";
import { bboxOf, distanceToLineM, inBbox, padBbox, sampleLine } from "./geo";
import { buildPotholeModel } from "./gh-model";
import { ghInfo, ghRoute, SafetyError } from "./graphhopper";
import { getGrid, peekGrid, type GridStore } from "./grid";
import { potholesIn } from "./potholes";
import { scoreRoute, type ScoredPothole } from "./scorer";
import type { DirectionsResponse, LngLat, RouteResult } from "./types";

/**
 * Fastest vs safest directions between two points in the covered region.
 *
 * 1. Ask GraphHopper for both profiles in parallel (CH, a few ms each).
 * 2. Potholes only ever raise costs, so if none lies on the safest route it
 *    is still optimal with them included. Only when one does, re-route with
 *    a per-request pothole penalty (landmark algorithm, slower).
 * 3. Score both routes identically and explain their risky stretches.
 */

const VERSION_FILE = path.join(SAFETY_ROOT, "graphhopper", "graph-cache", "zippi-version.json");
const VERSION_KEY = Symbol.for("zippi.safety.engineVersion");

/** configHash the routing graph was imported with (written by scripts/gh/import.ts). */
async function engineConfigHash(): Promise<string | null> {
  const g = globalThis as unknown as Record<symbol, Promise<string | null> | undefined>;
  g[VERSION_KEY] ??= readFile(VERSION_FILE, "utf8")
    .then((raw) => (JSON.parse(raw) as { configHash?: string }).configHash ?? null)
    .catch(() => null);
  return g[VERSION_KEY]!;
}

async function isStale(grid: GridStore | null): Promise<boolean> {
  const current = configHash();
  const engine = await engineConfigHash();
  return (grid !== null && grid.meta.configHash !== current) || (engine !== null && engine !== current);
}

/** Share of `a`'s length lying within `toleranceM` of `b`. */
function overlapShare(a: LngLat[], b: LngLat[], toleranceM: number): number {
  const samples = sampleLine(a, 20);
  if (!samples.length) return 1;
  const near = samples.filter(({ p }) => distanceToLineM(p, b, toleranceM) <= toleranceM).length;
  return near / samples.length;
}

/** Stretches near the start or end that both routes share cannot be avoided. */
function markUnavoidable(route: RouteResult, other: RouteResult, cfg: SafetyConfig) {
  const total = route.distanceM;
  const reach = cfg.score.unavoidableM;
  for (const s of route.stretches) {
    const nearEnds = s.startM < reach || s.startM + s.lengthM > total - reach;
    if (!nearEnds) continue;
    const part = route.geometry.slice(s.from, s.to + 1);
    s.unavoidable = overlapShare(part, other.geometry, 15) >= 0.8;
  }
}

export async function getDirections(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<DirectionsResponse> {
  const started = performance.now();
  const cfg = getSafetyConfig();
  if (!inRegion(from[0], from[1], cfg) || !inRegion(to[0], to[1], cfg)) {
    throw new SafetyError("OUT_OF_AREA", `Safe routing currently covers ${cfg.region.name} only`, 422);
  }

  const searchBox = padBbox(bboxOf([from, to]), 5_000);
  const [grid, fastPath, safePath, nearbyPotholes] = await Promise.all([
    // Explanations degrade gracefully without the grid; routing does not need it.
    getGrid().catch((err) => {
      console.error("[safety] grid unavailable", err);
      return null;
    }),
    ghRoute({ profile: "car_fast", points: [from, to] }, signal),
    ghRoute({ profile: "car_safe", points: [from, to] }, signal),
    potholesIn(searchBox, cfg).catch((err) => {
      console.error("[safety] pothole lookup failed", err);
      return [];
    }),
  ]);

  const potholes: ScoredPothole[] = nearbyPotholes.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, severity: p.severity }));
  const corridor = cfg.potholes.corridorM;
  const onSafest = potholes.some(
    (p) => distanceToLineM([p.lng, p.lat], safePath.points.coordinates, corridor) <= corridor,
  );

  let safest = safePath;
  if (onSafest) {
    const box = padBbox(bboxOf([...fastPath.points.coordinates, ...safePath.points.coordinates]), 2_000);
    safest = await ghRoute({ profile: "car_safe", points: [from, to], customModel: buildPotholeModel(potholes, box, cfg) }, signal);
  }

  const ctx = { cfg, grid, potholes };
  const fastestResult = scoreRoute(fastPath, ctx);
  const safestResult = scoreRoute(safest, ctx);
  markUnavoidable(fastestResult, safestResult, cfg);
  markUnavoidable(safestResult, fastestResult, cfg);

  const sameRoute =
    overlapShare(safestResult.geometry, fastestResult.geometry, cfg.score.sameRouteToleranceM) >=
      cfg.score.sameRouteShare &&
    overlapShare(fastestResult.geometry, safestResult.geometry, cfg.score.sameRouteToleranceM) >=
      cfg.score.sameRouteShare;

  // Pins worth showing: every active report in the area the routes span,
  // including the original safest route — the pothole that caused a detour
  // must stay visible even though the final routes no longer pass it.
  const shownBox = padBbox(
    bboxOf([...fastestResult.geometry, ...safestResult.geometry, ...safePath.points.coordinates]),
    500,
  );
  const markers = nearbyPotholes.filter((p) => inBbox([p.lng, p.lat], shownBox));

  return {
    fastest: fastestResult,
    safest: safestResult,
    sameRoute,
    potholes: markers,
    meta: {
      configHash: configHash(),
      stale: await isStale(grid),
      potholeReroute: onSafest,
      tookMs: Math.round(performance.now() - started),
    },
  };
}

export type SafetyStatus = {
  engine: { up: boolean; version?: string; profiles?: string[]; error?: string };
  grid: { loaded: boolean; builtAt?: string; error?: string };
  configHash: string;
  stale: boolean;
};

export async function safetyStatus(signal?: AbortSignal): Promise<SafetyStatus> {
  const [engine, grid] = await Promise.all([
    ghInfo(signal)
      .then((info) => ({ up: info.profiles.includes("car_safe"), version: info.version, profiles: info.profiles }))
      .catch((err: unknown) => ({ up: false, error: err instanceof Error ? err.message : String(err) })),
    getGrid()
      .then((g) => ({ loaded: true as const, builtAt: g.meta.builtAt, store: g }))
      .catch((err: unknown) => ({ loaded: false as const, error: err instanceof Error ? err.message : String(err) })),
  ]);
  const store = "store" in grid ? grid.store : peekGrid();
  return {
    engine,
    grid: grid.loaded ? { loaded: true, builtAt: grid.builtAt } : { loaded: false, error: grid.error },
    configHash: configHash(),
    stale: await isStale(store),
  };
}

/** Boot hook: load the grid and touch the engine so the first request is fast. Never throws. */
export async function warmSafety(): Promise<void> {
  await Promise.allSettled([getGrid(), ghInfo()]);
}
