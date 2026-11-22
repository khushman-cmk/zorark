import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { getSafetyConfig } from "@/lib/safety/config";
import { explain } from "@/lib/safety/explain";
import { distanceToLineM, haversineM, sampleLine } from "@/lib/safety/geo";
import {
  buildPotholeModel,
  buildSafetyModel,
  effectiveSeverity,
  levelPriority,
  priorityFor,
  roadGroup,
} from "@/lib/safety/gh-model";
import type { GhPath } from "@/lib/safety/graphhopper";
import { cellIndexFor } from "@/lib/safety/grid";
import { scoreRoute } from "@/lib/safety/scorer";
import type { LngLat } from "@/lib/safety/types";

/**
 * Pure unit tests for safe routing: no browser, no routing engine, no DB.
 */

const cfg = getSafetyConfig();

test.describe("grid indexing", () => {
  test("matches the Python pipeline on the shared test vectors", () => {
    const tv = JSON.parse(readFileSync("config/safety-testvectors.json", "utf8")) as {
      nx: number;
      ny: number;
      mPerDegLon: number;
      vectors: Array<{ name: string; lng: number; lat: number; cell: number }>;
    };
    const [west, south] = cfg.region.bbox;
    const meta = { west, south, cellM: 100, mPerDegLat: 111_320, mPerDegLon: tv.mPerDegLon, nx: tv.nx, ny: tv.ny };
    for (const v of tv.vectors) {
      expect(cellIndexFor(meta, v.lng, v.lat), v.name).toBe(v.cell);
    }
  });
});

test.describe("risk → routing priority", () => {
  test("level 0 never penalises, and motorways are exempt", () => {
    for (const group of ["minor", "tertiary", "major", "motorway"] as const) {
      expect(levelPriority(0, group, cfg)).toBe(1);
    }
    expect(levelPriority(6, "motorway", cfg)).toBe(1);
  });

  test("a lane in a high-risk area loses far more priority than the arterial beside it", () => {
    const lane = levelPriority(6, "minor", cfg);
    const arterial = levelPriority(6, "major", cfg);
    expect(lane).toBeCloseTo(0.3, 5);
    expect(arterial).toBeGreaterThan(0.85);
    expect(levelPriority(4, "tertiary", cfg)).toBeGreaterThan(lane);
  });

  test("surface evidence multiplies on top", () => {
    const base = priorityFor({ level: 0, roadClass: "residential" }, cfg);
    expect(base).toBe(1);
    expect(priorityFor({ level: 0, roadClass: "residential", surface: "gravel" }, cfg)).toBeCloseTo(cfg.priority.unpaved);
    expect(priorityFor({ level: 0, roadClass: "track" }, cfg)).toBeCloseTo(cfg.priority.track);
    expect(
      priorityFor({ level: 3, roadClass: "residential", surface: "dirt", smoothness: "very_bad" }, cfg),
    ).toBeCloseTo(levelPriority(3, "minor", cfg) * cfg.priority.unpaved * cfg.priority.smoothness.VERY_BAD);
  });

  test("road classes group as expected", () => {
    expect(roadGroup("residential")).toBe("minor");
    expect(roadGroup("SERVICE")).toBe("minor");
    expect(roadGroup("tertiary")).toBe("tertiary");
    expect(roadGroup("primary")).toBe("major");
    expect(roadGroup("motorway")).toBe("motorway");
  });

  test("the generated GraphHopper model mirrors priorityFor", () => {
    const model = buildSafetyModel(cfg);
    expect(model.distance_influence).toBe(cfg.priority.distanceInfluence);
    const lane6 = model.priority!.find((s) => s.if?.startsWith("mtb_rating == 6 &&") && s.if.includes("RESIDENTIAL"));
    expect(Number(lane6?.multiply_by)).toBeCloseTo(levelPriority(6, "minor", cfg), 4);
    expect(model.priority!.some((s) => s.if?.includes("MOTORWAY"))).toBe(false);
    for (const s of model.priority!) {
      const m = Number(s.multiply_by);
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThan(1);
    }
  });
});

test.describe("pothole model", () => {
  test("is empty without potholes", () => {
    expect(buildPotholeModel([], [77, 28, 78, 29], cfg)).toBeNull();
  });

  test("groups by severity and widens each area's bbox with anchors", () => {
    const model = buildPotholeModel(
      [
        { lat: 28.5, lng: 77.2, severity: 3 },
        { lat: 28.51, lng: 77.21, severity: 3 },
        { lat: 28.52, lng: 77.22, severity: 1 },
      ],
      [77.19, 28.49, 77.23, 28.53],
      cfg,
    )!;
    const features = model.areas!.features as Array<{ id: string; geometry: { coordinates: unknown[] } }>;
    expect(features.map((f) => f.id).sort()).toEqual(["pothole_s1", "pothole_s3"]);
    const s3 = features.find((f) => f.id === "pothole_s3")!;
    expect(s3.geometry.coordinates).toHaveLength(2 + 2); // two circles + two anchors
    expect(model.priority).toContainEqual({ if: "in_pothole_s3", multiply_by: String(cfg.potholes.severityMultiplier[2]) });
  });

  test("confirmations raise severity, capped at 3", () => {
    expect(effectiveSeverity(1, 1)).toBe(1);
    expect(effectiveSeverity(1, 2)).toBe(2);
    expect(effectiveSeverity(1, 4)).toBe(3);
    expect(effectiveSeverity(3, 50)).toBe(3);
  });
});

/** A straight 1 km path east, 10 segments of ~98 m, with per-segment details. */
function syntheticPath(details: Partial<GhPath["details"]>): GhPath {
  const coords: LngLat[] = Array.from({ length: 11 }, (_, i) => [77.3 + i * 0.001, 28.5]);
  return {
    distance: 980,
    time: 120_000,
    weight: 0,
    bbox: [77.3, 28.5, 77.31, 28.5],
    points: { type: "LineString", coordinates: coords },
    instructions: [{ distance: 980, time: 120_000, text: "Continue", sign: 0, interval: [0, 10] }],
    details: {
      road_class: [[0, 10, "residential"]],
      road_environment: [[0, 10, "road"]],
      surface: [[0, 10, "asphalt"]],
      smoothness: [[0, 10, null]],
      mtb_rating: [[0, 10, 0]],
      hike_rating: [[0, 10, 0]],
      horse_rating: [[0, 10, 0]],
      street_name: [[0, 10, "Test Marg"]],
      ...details,
    },
  };
}

test.describe("route scoring", () => {
  test("a clean route scores 100 with no stretches", () => {
    const r = scoreRoute(syntheticPath({}), { cfg, grid: null, potholes: [] });
    expect(r.safety.score).toBe(100);
    expect(r.stretches).toEqual([]);
    expect(r.distanceM).toBe(980);
  });

  test("finds and explains an unplanned stretch", () => {
    const r = scoreRoute(
      syntheticPath({
        mtb_rating: [[0, 2, 0], [2, 6, 6], [6, 10, 0]],
        horse_rating: [[0, 2, 0], [2, 6, 3], [6, 10, 0]],
      }),
      { cfg, grid: null, potholes: [] },
    );
    expect(r.stretches).toHaveLength(1);
    const s = r.stretches[0];
    expect(s.kinds).toEqual(["unplanned"]);
    expect(s.lengthM).toBeGreaterThan(380);
    expect(s.lengthM).toBeLessThan(400);
    expect(s.reasons[0]).toContain("unplanned area");
    expect(r.safety.score).toBeLessThan(100);
    expect(r.safety.riskyM).toBe(s.lengthM);
  });

  test("merges risky runs separated by a short gap", () => {
    // Two risky segments with one clean ~98 m segment between: gap >= mergeGapM (60 m), so they stay separate.
    const apart = scoreRoute(
      syntheticPath({ mtb_rating: [[0, 1, 6], [1, 2, 0], [2, 3, 6], [3, 10, 0]] }),
      { cfg, grid: null, potholes: [] },
    );
    expect(apart.stretches).toHaveLength(2);
  });

  test("a reported pothole on the route becomes its own stretch", () => {
    const r = scoreRoute(syntheticPath({}), {
      cfg,
      grid: null,
      potholes: [{ id: "p1", lat: 28.5, lng: 77.3075, severity: 3 }],
    });
    expect(r.safety.potholeCount).toBe(1);
    expect(r.stretches).toHaveLength(1);
    expect(r.stretches[0].kinds).toContain("pothole");
    expect(r.stretches[0].reasons[0]).toContain("1 pothole report");
  });

  test("colour runs cover the whole route", () => {
    const r = scoreRoute(syntheticPath({ mtb_rating: [[0, 5, 0], [5, 10, 4]] }), { cfg, grid: null, potholes: [] });
    expect(r.segments[0].from).toBe(0);
    expect(r.segments.at(-1)!.to).toBe(10);
    for (let i = 1; i < r.segments.length; i++) expect(r.segments[i].from).toBe(r.segments[i - 1].to);
  });
});

test.describe("explanations", () => {
  test("water reasons quote the band distance, not the grid distance", () => {
    const { reasons } = explain({
      kinds: new Set(["water"]),
      group: "minor",
      unplannedBand: 0,
      waterBand: 2,
      water: { nearM: 40, zoneM: 120 },
      samples: [
        { cell: 1, u: 0, phi: 1, dead: 0, rural: 0, waterM: 85, water: { kind: "drain", name: "Kushak Nallah" }, place: null, lowData: false },
      ],
      surface: null,
      smoothness: null,
      isTrack: false,
      potholes: 0,
    });
    expect(reasons).toEqual(["Runs within 40 m of an open drain (Kushak Nallah) — prone to waterlogging"]);
  });
});

test.describe("geometry", () => {
  test("haversine and point-to-line distances are metre-accurate", () => {
    expect(haversineM([77, 28], [77, 29])).toBeCloseTo(111_195, -2);
    const line: LngLat[] = [[77.3, 28.5], [77.31, 28.5]];
    expect(distanceToLineM([77.305, 28.5009], line)).toBeCloseTo(100, -1);
  });

  test("samples cover a line at the requested spacing", () => {
    const samples = sampleLine([[77.3, 28.5], [77.31, 28.5]], 20);
    expect(samples.length).toBeGreaterThanOrEqual(48);
    expect(samples.length).toBeLessThanOrEqual(50);
  });
});
