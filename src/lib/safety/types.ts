/**
 * Shapes shared by the safe-routing API and the directions UI.
 *
 * Kept free of server imports so client components can use them.
 */

export type LngLat = [lng: number, lat: number];

export type RiskKind = "unplanned" | "water" | "rural" | "surface" | "pothole";

export type RouteSegment = {
  /** Index range into `geometry` (inclusive start, inclusive end). */
  from: number;
  to: number;
  /** 0 (no risk) … 1 (worst), after road-class modulation. */
  risk: number;
};

export type Stretch = {
  id: string;
  from: number;
  to: number;
  startM: number;
  lengthM: number;
  risk: number;
  kinds: RiskKind[];
  reasons: string[];
  place?: string;
  /** Within reach of the start/end and on both routes: no route can avoid it. */
  unavoidable: boolean;
  center: LngLat;
  bbox: [number, number, number, number];
};

export type Instruction = {
  text: string;
  distanceM: number;
  timeS: number;
  sign: number;
  street?: string;
  /** Index into `geometry` where the manoeuvre happens. */
  at: number;
};

export type RouteResult = {
  distanceM: number;
  timeS: number;
  geometry: LngLat[];
  bbox: [number, number, number, number];
  segments: RouteSegment[];
  safety: {
    /** 0 … 100, higher is safer. */
    score: number;
    riskyM: number;
    riskyShare: number;
    potholeCount: number;
  };
  stretches: Stretch[];
  instructions: Instruction[];
};

export type PotholeMarker = {
  id: string;
  lat: number;
  lng: number;
  severity: 1 | 2 | 3;
  confirmations: number;
  createdAt: string;
};

export type DirectionsResponse = {
  fastest: RouteResult;
  safest: RouteResult;
  sameRoute: boolean;
  potholes: PotholeMarker[];
  meta: {
    configHash: string;
    stale: boolean;
    potholeReroute: boolean;
    tookMs: number;
  };
};

export type SafetyErrorCode =
  | "INVALID"
  | "OUT_OF_AREA"
  | "NO_SNAP"
  | "NO_ROUTE"
  | "ENGINE_OFFLINE"
  | "TIMEOUT"
  | "ENGINE_ERROR"
  | "UNAUTHENTICATED"
  | "TOO_FAR_FROM_ROAD"
  | "RATE_LIMITED";
