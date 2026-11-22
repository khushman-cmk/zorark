import type { RoadGroup } from "./gh-model";
import type { CellSample } from "./grid";
import type { RiskKind } from "./types";

/**
 * Plain-language reasons for a risky stretch.
 *
 * Reasons quote what the analysis actually measured (street pattern, distance
 * to water, surface tags, rider reports) rather than asserting potholes we
 * cannot see.
 */

const WATER_LABEL: Record<string, string> = {
  river: "the river",
  riverbank: "the river",
  canal: "a canal",
  drain: "an open drain",
  ditch: "a ditch",
  stream: "a stream",
  pond: "a pond",
  lake: "a lake",
  reservoir: "a reservoir",
  basin: "a water basin",
  wetland: "a wetland",
  water: "a water body",
};

function waterPhrase(water: CellSample["water"]): string {
  if (!water) return "a water body";
  const label = WATER_LABEL[water.kind] ?? "a water body";
  if (!water.name) return label;
  return label.startsWith("the ") ? `the ${water.name}` : `${label} (${water.name})`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export type StretchFacts = {
  kinds: Set<RiskKind>;
  group: RoadGroup;
  unplannedBand: number;
  waterBand: number;
  /** Water band distances from the model (band 2 within nearM, band 1 within zoneM). */
  water: { nearM: number; zoneM: number };
  /** Grid samples taken along the stretch. */
  samples: CellSample[];
  surface: string | null;
  smoothness: string | null;
  isTrack: boolean;
  potholes: number;
};

export function explain(f: StretchFacts): { reasons: string[]; place?: string } {
  const reasons: string[] = [];
  const valid = f.samples.filter((s) => !s.lowData);
  const worstU = valid.reduce<CellSample | null>((best, s) => (!best || s.u > best.u ? s : best), null);
  const place = (worstU ?? f.samples[0])?.place ?? undefined;
  const near = place ? ` near ${place}` : "";

  if (f.potholes > 0) {
    reasons.push(`${f.potholes} pothole report${f.potholes === 1 ? "" : "s"} from riders on this stretch`);
  }

  if (f.kinds.has("unplanned")) {
    // Quote the dead-end share only when it is notable; the pattern alone
    // (low orientation order) is what flagged the area otherwise.
    const detail = !worstU
      ? ""
      : worstU.dead >= 0.15
        ? ` (irregular street pattern, ${pct(worstU.dead)} of junctions are dead ends)`
        : " (irregular, maze-like street pattern)";
    reasons.push(
      f.group === "minor"
        ? `Narrow lanes through an unplanned area${near}${detail}`
        : `Main road along the edge of an unplanned area${near}`,
    );
  }

  if (f.kinds.has("water")) {
    // Name the nearest water body seen along the stretch. The distance quoted
    // is the band the router used (measured along the road in the pipeline),
    // not the coarser 100 m grid-cell distance.
    const closest = f.samples
      .filter((s) => s.waterM !== null)
      .reduce<CellSample | null>((best, s) => (!best || s.waterM! < best.waterM! ? s : best), null);
    const what = waterPhrase(closest?.water ?? null);
    reasons.push(
      f.waterBand >= 2
        ? `Runs within ${f.water.nearM} m of ${what} — prone to waterlogging`
        : `Within ${f.water.zoneM} m of ${what} — can flood after heavy rain`,
    );
  }

  if (f.kinds.has("rural")) {
    const rural = Math.max(0, ...f.samples.map((s) => s.rural));
    reasons.push(`Through open rural land${rural > 0 ? ` (${pct(rural)} farmland/scrub around)` : ""}`);
  }

  if (f.kinds.has("surface")) {
    if (f.isTrack) reasons.push("Dirt track");
    else if (f.surface) reasons.push(`Unpaved road (${f.surface.toLowerCase().replace(/_/g, " ")})`);
    if (f.smoothness) reasons.push(`Road surface mapped as ${f.smoothness.toLowerCase().replace(/_/g, " ")}`);
  }

  if (!reasons.length) reasons.push(`Lower-quality road${near}`);
  return { reasons, place };
}
