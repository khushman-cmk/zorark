import type { CustomModel } from "./gh-model";
import type { LngLat, SafetyErrorCode } from "./types";

/**
 * Thin client for the local GraphHopper server (npm run gh:start).
 *
 * Two profiles: `car_fast` (what a normal navigation app would pick) and
 * `car_safe` (the same car model plus our risk levels). Both are prepared
 * with Contraction Hierarchies, so plain queries take a few milliseconds;
 * sending a per-request custom model (pothole penalties) switches GraphHopper
 * to its landmark algorithm, which is slower but still well under a second.
 */

export const GH_DETAILS = [
  "road_class",
  "road_environment",
  "surface",
  "smoothness",
  "mtb_rating",
  "hike_rating",
  "horse_rating",
  "street_name",
] as const;

export type GhDetail = [from: number, to: number, value: string | number | null];

export type GhPath = {
  distance: number;
  time: number;
  weight: number;
  bbox: [number, number, number, number];
  points: { type: "LineString"; coordinates: LngLat[] };
  instructions: Array<{
    distance: number;
    time: number;
    text: string;
    sign: number;
    interval: [number, number];
    street_name?: string;
  }>;
  details: Record<(typeof GH_DETAILS)[number], GhDetail[]>;
};

export class SafetyError extends Error {
  constructor(
    readonly code: SafetyErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SafetyError";
  }
}

const TIMEOUT_MS = 4_000;

export function graphhopperUrl(): string {
  return (process.env.GRAPHHOPPER_URL?.trim() || "http://localhost:8989").replace(/\/+$/, "");
}

function signalFor(outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return outer ? AbortSignal.any([outer, timeout]) : timeout;
}

async function call(pathname: string, init: RequestInit, outer?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${graphhopperUrl()}${pathname}`, { ...init, signal: signalFor(outer), cache: "no-store" });
  } catch (err) {
    // The caller going away is not an engine fault; let the route handler see it.
    if (outer?.aborted) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new SafetyError("TIMEOUT", "The routing engine took too long to answer", 504);
    }
    throw new SafetyError("ENGINE_OFFLINE", "The routing engine is not running (npm run gh:start)", 503);
  }
}

type GhErrorBody = { message?: string; hints?: Array<{ message?: string; details?: string }> };

function mapError(status: number, body: GhErrorBody): SafetyError {
  const details = (body.hints ?? []).map((h) => h.details ?? "").join(" ");
  const message = body.message ?? `GraphHopper answered ${status}`;
  if (/PointNotFound|PointOutOfBounds/.test(details) || /Cannot find point/i.test(message)) {
    return new SafetyError("NO_SNAP", "No road found near one of the points", 422);
  }
  if (/ConnectionNotFound/.test(details) || /Connection between locations not found/i.test(message)) {
    return new SafetyError("NO_ROUTE", "No drivable route connects these points", 422);
  }
  return new SafetyError("ENGINE_ERROR", message, 502);
}

export type RouteRequest = {
  profile: "car_fast" | "car_safe";
  points: LngLat[];
  customModel?: CustomModel | null;
};

export async function ghRoute(req: RouteRequest, signal?: AbortSignal): Promise<GhPath> {
  const body: Record<string, unknown> = {
    profile: req.profile,
    points: req.points,
    points_encoded: false,
    instructions: true,
    calc_points: true,
    locale: "en",
    details: GH_DETAILS,
  };
  if (req.customModel) {
    body["ch.disable"] = true;
    body.custom_model = req.customModel;
  }
  const res = await call(
    "/route",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    signal,
  );
  const json = (await res.json().catch(() => ({}))) as { paths?: GhPath[] } & GhErrorBody;
  if (!res.ok) throw mapError(res.status, json);
  const path = json.paths?.[0];
  if (!path) throw new SafetyError("NO_ROUTE", "No drivable route connects these points", 422);
  return path;
}

/** Snap a point to the nearest routable road. */
export async function ghNearest(
  lng: number,
  lat: number,
  signal?: AbortSignal,
): Promise<{ lng: number; lat: number; distanceM: number }> {
  const res = await call(`/nearest?point=${lat},${lng}`, { method: "GET" }, signal);
  const json = (await res.json().catch(() => ({}))) as { coordinates?: [number, number]; distance?: number } & GhErrorBody;
  if (!res.ok || !json.coordinates) throw mapError(res.status, json);
  return { lng: json.coordinates[0], lat: json.coordinates[1], distanceM: json.distance ?? 0 };
}

export type GhInfo = { version: string; profiles: string[]; bbox: [number, number, number, number] };

export async function ghInfo(signal?: AbortSignal): Promise<GhInfo> {
  const res = await call("/info", { method: "GET" }, signal);
  if (!res.ok) throw new SafetyError("ENGINE_ERROR", `GraphHopper /info answered ${res.status}`, 502);
  const json = (await res.json()) as { version: string; profiles: Array<{ name: string }>; bbox: GhInfo["bbox"] };
  return { version: json.version, profiles: json.profiles.map((p) => p.name), bbox: json.bbox };
}

/** Collapse GraphHopper's [from, to, value] detail runs into one value per segment. */
export function detailPerSegment(runs: GhDetail[] | undefined, segments: number): Array<string | number | null> {
  const out: Array<string | number | null> = new Array(segments).fill(null);
  for (const [from, to, value] of runs ?? []) {
    for (let i = from; i < to && i < segments; i++) out[i] = value;
  }
  return out;
}
