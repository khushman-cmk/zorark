import type { SafetyConfig } from "./config";
import { explain } from "./explain";
import { bboxOf, cumulativeM, haversineM, pointSegmentM, sampleLine } from "./geo";
import { isUnpaved, priorityFor, roadGroup, type RoadGroup } from "./gh-model";
import { detailPerSegment, type GhPath } from "./graphhopper";
import type { CellSample, GridStore } from "./grid";
import type { Instruction, LngLat, RiskKind, RouteResult, RouteSegment, Stretch } from "./types";

/**
 * Score a GraphHopper path and find its risky stretches.
 *
 * Risk per segment is 1 − priority, using the same priorityFor() that
 * generated the router's custom model, applied to the levels GraphHopper
 * returns as path details. Potholes reported within the corridor multiply on
 * top. Scoring is identical for the fastest and the safest route, so the two
 * are directly comparable.
 */

export type ScoredPothole = { id: string; lat: number; lng: number; severity: 1 | 2 | 3 };

export type ScoreContext = {
  cfg: SafetyConfig;
  grid: GridStore | null;
  potholes: ScoredPothole[];
};

type SegmentInfo = {
  len: number;
  risk: number;
  level: number;
  waterBand: number;
  unplannedBand: number;
  group: RoadGroup;
  roadClass: string | null;
  surface: string | null;
  smoothness: string | null;
  kinds: Set<RiskKind>;
  potholeIds: string[];
};

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? null : String(v));
const num = (v: string | number | null | undefined) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

function segmentInfos(path: GhPath, ctx: ScoreContext): SegmentInfo[] {
  const coords = path.points.coordinates;
  const n = Math.max(0, coords.length - 1);
  const d = path.details;
  const rc = detailPerSegment(d.road_class, n);
  const surface = detailPerSegment(d.surface, n);
  const smooth = detailPerSegment(d.smoothness, n);
  const mtb = detailPerSegment(d.mtb_rating, n);
  const hike = detailPerSegment(d.hike_rating, n);
  const horse = detailPerSegment(d.horse_rating, n);
  const { cfg } = ctx;
  const sevMult = cfg.potholes.severityMultiplier;

  const out: SegmentInfo[] = [];
  for (let i = 0; i < n; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const roadClass = str(rc[i]);
    const level = num(mtb[i]);
    const s = str(surface[i]);
    const sm = str(smooth[i]);
    let p = priorityFor({ level, roadClass, surface: s, smoothness: sm }, cfg);

    const kinds = new Set<RiskKind>();
    const waterBand = num(hike[i]);
    const unplannedBand = num(horse[i]);
    if (unplannedBand > 0) kinds.add("unplanned");
    if (waterBand > 0) kinds.add("water");
    // The level combines unplanned, water and rural; rural is the only one not
    // stored separately, so a level with neither of the others means rural.
    if (level > 0 && unplannedBand === 0 && waterBand === 0) kinds.add("rural");
    const smoothFactor = cfg.priority.smoothness[(sm ?? "").toUpperCase()];
    if (isUnpaved(s) || smoothFactor !== undefined || (roadClass ?? "").toUpperCase() === "TRACK") {
      kinds.add("surface");
    }

    const potholeIds: string[] = [];
    let worst = 1;
    for (const ph of ctx.potholes) {
      if (pointSegmentM([ph.lng, ph.lat], a, b) <= cfg.potholes.corridorM) {
        potholeIds.push(ph.id);
        worst = Math.min(worst, sevMult[ph.severity - 1]);
      }
    }
    if (potholeIds.length) {
      p *= worst;
      kinds.add("pothole");
    }

    out.push({
      len: haversineM(a, b),
      risk: Math.max(0, Math.min(1, 1 - p)),
      level,
      waterBand,
      unplannedBand,
      group: roadGroup(roadClass),
      roadClass,
      surface: isUnpaved(s) ? s : null,
      smoothness: smoothFactor !== undefined ? sm : null,
      kinds,
      potholeIds,
    });
  }
  return out;
}

/** Merge neighbouring segments of similar risk, for drawing. */
function colourRuns(infos: SegmentInfo[]): RouteSegment[] {
  const runs: RouteSegment[] = [];
  for (let i = 0; i < infos.length; i++) {
    const risk = Math.round(infos[i].risk * 20) / 20;
    const last = runs[runs.length - 1];
    if (last && last.risk === risk) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, risk });
  }
  return runs;
}

function gridSamples(grid: GridStore | null, coords: LngLat[], from: number, to: number, stepM = 40): CellSample[] {
  if (!grid) return [];
  return sampleLine(coords.slice(from, to + 1), stepM)
    .map(({ p }) => grid.sample(p[0], p[1]))
    .filter((s): s is CellSample => s !== null);
}

function findStretches(path: GhPath, infos: SegmentInfo[], ctx: ScoreContext, cum: Float64Array): Stretch[] {
  const { score } = ctx.cfg;
  const coords = path.points.coordinates;
  type Run = { from: number; to: number };
  const runs: Run[] = [];
  for (let i = 0; i < infos.length; i++) {
    if (infos[i].risk < score.riskyThreshold) continue;
    const last = runs[runs.length - 1];
    if (last && cum[i] - cum[last.to] < score.mergeGapM) last.to = i + 1;
    else runs.push({ from: i, to: i + 1 });
  }

  const stretches: Stretch[] = [];
  for (const run of runs) {
    const lengthM = cum[run.to] - cum[run.from];
    if (lengthM < score.minStretchM) continue;
    const segs = infos.slice(run.from, run.to);
    const weight = new Map<RiskKind, number>();
    let riskSum = 0;
    for (const s of segs) {
      riskSum += s.risk * s.len;
      if (s.risk >= score.riskyThreshold) for (const k of s.kinds) weight.set(k, (weight.get(k) ?? 0) + s.len);
    }
    const kinds = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const lead = segs.reduce((best, s) => (s.risk * s.len > best.risk * best.len ? s : best), segs[0]);
    const potholes = new Set(segs.flatMap((s) => s.potholeIds));
    const { reasons, place } = explain({
      kinds: new Set(kinds),
      group: lead.group,
      unplannedBand: Math.max(...segs.map((s) => s.unplannedBand)),
      waterBand: Math.max(...segs.map((s) => s.waterBand)),
      water: ctx.cfg.water,
      samples: gridSamples(ctx.grid, coords, run.from, run.to),
      surface: segs.find((s) => s.surface)?.surface ?? null,
      smoothness: segs.find((s) => s.smoothness)?.smoothness ?? null,
      isTrack: segs.some((s) => (s.roadClass ?? "").toUpperCase() === "TRACK"),
      potholes: potholes.size,
    });

    const midM = cum[run.from] + lengthM / 2;
    let mid = run.from;
    while (mid < run.to && cum[mid + 1] < midM) mid++;
    const part = coords.slice(run.from, run.to + 1);
    stretches.push({
      id: `${run.from}-${run.to}`,
      from: run.from,
      to: run.to,
      startM: Math.round(cum[run.from]),
      lengthM: Math.round(lengthM),
      risk: Math.round((riskSum / Math.max(lengthM, 1)) * 100) / 100,
      kinds,
      reasons,
      place,
      unavoidable: false,
      center: coords[Math.min(mid, coords.length - 1)],
      bbox: bboxOf(part),
    });
  }
  return stretches;
}

export function scoreRoute(path: GhPath, ctx: ScoreContext): RouteResult {
  const coords = path.points.coordinates;
  const infos = segmentInfos(path, ctx);
  const cum = cumulativeM(coords);
  const total = cum[cum.length - 1] || 0;
  const weighted = infos.reduce((acc, s) => acc + s.len * s.risk, 0);
  const stretches = findStretches(path, infos, ctx, cum);
  const riskyM = stretches.reduce((acc, s) => acc + s.lengthM, 0);
  const potholeIds = new Set(infos.flatMap((s) => s.potholeIds));
  const scoreValue = total > 0 ? 100 * (1 - weighted / (total * ctx.cfg.score.normaliser)) : 100;

  const instructions: Instruction[] = path.instructions.map((ins) => ({
    text: ins.text,
    distanceM: Math.round(ins.distance),
    timeS: Math.round(ins.time / 1000),
    sign: ins.sign,
    street: ins.street_name || undefined,
    at: ins.interval[0],
  }));

  return {
    distanceM: Math.round(path.distance),
    timeS: Math.round(path.time / 1000),
    geometry: coords,
    bbox: path.bbox ?? bboxOf(coords),
    segments: colourRuns(infos),
    safety: {
      score: Math.max(0, Math.min(100, Math.round(scoreValue))),
      riskyM: Math.round(riskyM),
      riskyShare: total > 0 ? Math.round((riskyM / total) * 1000) / 1000 : 0,
      potholeCount: potholeIds.size,
    },
    stretches,
    instructions,
  };
}
