import type { SafetyConfig } from "./config";

/**
 * Risk level → routing priority, the one place this mapping lives.
 *
 * It generates GraphHopper's `car_safe` custom model (scripts/gh/import.ts)
 * and scores routes in the scorer, so what the router avoided and what the
 * explain panel reports can never disagree.
 *
 * The pipeline stores each way's level 0-6 in GraphHopper's `mtb_rating`
 * (see scripts/safety/zsafety/tag.py). Road class softens it: an arterial
 * skirting a village keeps most of its priority, a lane inside it does not.
 */

export type RoadGroup = "minor" | "tertiary" | "major" | "motorway";

const GROUP_CLASSES: Record<Exclude<RoadGroup, "motorway">, string[]> = {
  minor: ["RESIDENTIAL", "UNCLASSIFIED", "SERVICE", "ROAD", "TRACK", "LIVING_STREET", "OTHER"],
  tertiary: ["TERTIARY"],
  major: ["PRIMARY", "SECONDARY", "TRUNK"],
};

const UNPAVED = ["UNPAVED", "FINE_GRAVEL", "GRAVEL", "GROUND", "DIRT", "GRASS", "SAND"];

export function roadGroup(roadClass: string | undefined | null): RoadGroup {
  const rc = (roadClass ?? "").toUpperCase();
  if (rc === "MOTORWAY") return "motorway";
  if (GROUP_CLASSES.major.includes(rc)) return "major";
  if (rc === "TERTIARY") return "tertiary";
  return "minor";
}

/** Priority factor for a way at `level` (0-6) in road group `group`. */
export function levelPriority(level: number, group: RoadGroup, cfg: SafetyConfig): number {
  const m = cfg.priority.levelMultiplier[Math.max(0, Math.min(6, Math.round(level)))];
  const k = cfg.priority.classInfluence[group];
  return 1 - k * (1 - m);
}

export function isUnpaved(surface: string | undefined | null): boolean {
  return UNPAVED.includes((surface ?? "").toUpperCase());
}

export type EdgeInfo = {
  level: number;
  roadClass?: string | null;
  surface?: string | null;
  smoothness?: string | null;
};

/** Everything except potholes, multiplied — mirrors buildSafetyModel exactly. */
export function priorityFor(edge: EdgeInfo, cfg: SafetyConfig): number {
  let p = levelPriority(edge.level, roadGroup(edge.roadClass), cfg);
  if (isUnpaved(edge.surface)) p *= cfg.priority.unpaved;
  const smooth = cfg.priority.smoothness[(edge.smoothness ?? "").toUpperCase()];
  if (smooth !== undefined) p *= smooth;
  if ((edge.roadClass ?? "").toUpperCase() === "TRACK") p *= cfg.priority.track;
  return p;
}

const round4 = (v: number) => String(Math.round(v * 10_000) / 10_000);
const anyOf = (field: string, values: string[]) => values.map((v) => `${field} == ${v}`).join(" || ");

export type CustomModel = {
  distance_influence?: number;
  priority?: Array<{ if?: string; else_if?: string; else?: null; multiply_by: string }>;
  areas?: { type: "FeatureCollection"; features: unknown[] };
};

/** The server-side `car_safe` custom model (graphhopper/models/safety.json). */
export function buildSafetyModel(cfg: SafetyConfig): CustomModel {
  const priority: NonNullable<CustomModel["priority"]> = [];
  for (let level = 1; level <= 6; level++) {
    for (const group of ["minor", "tertiary", "major"] as const) {
      const p = levelPriority(level, group, cfg);
      if (p >= 1) continue;
      priority.push({
        if: `mtb_rating == ${level} && (${anyOf("road_class", GROUP_CLASSES[group])})`,
        multiply_by: round4(p),
      });
    }
  }
  priority.push({ if: anyOf("surface", UNPAVED), multiply_by: round4(cfg.priority.unpaved) });
  for (const [value, factor] of Object.entries(cfg.priority.smoothness)) {
    priority.push({ if: `smoothness == ${value}`, multiply_by: round4(factor) });
  }
  priority.push({ if: "road_class == TRACK", multiply_by: round4(cfg.priority.track) });
  return { distance_influence: cfg.priority.distanceInfluence, priority };
}

// ─── Potholes (per request) ──────────────────────────────────────────────────

export type PotholeInput = { lat: number; lng: number; severity: 1 | 2 | 3 };

function circle(lng: number, lat: number, radiusM: number, n = 16): [number, number][] {
  const mLat = 111_320;
  const mLng = mLat * Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * (i % n)) / n;
    ring.push([lng + (radiusM * Math.cos(a)) / mLng, lat + (radiusM * Math.sin(a)) / mLat]);
  }
  return ring;
}

/** A sliver triangle (~1 cm²) used only to widen a MultiPolygon's bounding box. */
function anchor(lng: number, lat: number): [number, number][][] {
  return [[[lng, lat], [lng + 1e-7, lat], [lng, lat + 1e-7], [lng, lat]]];
}

/**
 * Per-request custom model penalising roads that pass reported potholes.
 *
 * Each severity is one MultiPolygon area of small circles. GraphHopper 11
 * pre-filters edges by a bounding box built from the edge's two *tower* nodes
 * only (GHUtility.createBBox), so a small circle on a curved edge can be
 * skipped before the exact geometry test runs. Two far-away anchor slivers
 * widen each area's bounding box past that pre-filter; the exact
 * PreparedPolygon test then decides, and the slivers themselves are far too
 * small to touch a road.
 */
export function buildPotholeModel(
  potholes: PotholeInput[],
  bbox: [number, number, number, number],
  cfg: SafetyConfig,
): CustomModel | null {
  if (!potholes.length) return null;
  const [w, s, e, n] = bbox;
  const pad = 0.05;
  const features: unknown[] = [];
  const priority: NonNullable<CustomModel["priority"]> = [];
  for (const sev of [1, 2, 3] as const) {
    const group = potholes.filter((p) => p.severity === sev);
    if (!group.length) continue;
    const id = `pothole_s${sev}`;
    features.push({
      type: "Feature",
      id,
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          ...group.map((p) => [circle(p.lng, p.lat, cfg.potholes.radiusM)]),
          anchor(w - pad, s - pad),
          anchor(e + pad, n + pad),
        ],
      },
    });
    priority.push({ if: `in_${id}`, multiply_by: round4(cfg.potholes.severityMultiplier[sev - 1]) });
  }
  return { areas: { type: "FeatureCollection", features }, priority };
}

/** Severity grows with independent confirmations: sev + ⌊log₂ confirmations⌋, capped at 3. */
export function effectiveSeverity(severity: number, confirmations: number): 1 | 2 | 3 {
  const boost = Math.floor(Math.log2(Math.max(1, confirmations)));
  return Math.max(1, Math.min(3, severity + boost)) as 1 | 2 | 3;
}
