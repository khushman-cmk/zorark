import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The safe-routing model, read from config/safety-model.json.
 *
 * That file is the single source of truth shared with the Python pipeline
 * (scripts/safety). Only the parts the server needs are validated here.
 */

const band = z.array(z.number()).nonempty();

const schema = z.object({
  version: z.number(),
  region: z.object({ name: z.string(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  unplanned: z.object({ bands: band }),
  water: z.object({ nearM: z.number(), zoneM: z.number() }),
  rural: z.object({ bands: band }),
  priority: z.object({
    levelMultiplier: z.array(z.number()).length(7),
    classInfluence: z.object({ minor: z.number(), tertiary: z.number(), major: z.number(), motorway: z.number() }),
    unpaved: z.number(),
    smoothness: z.record(z.string(), z.number()),
    track: z.number(),
    distanceInfluence: z.number(),
  }),
  potholes: z.object({
    severityMultiplier: z.tuple([z.number(), z.number(), z.number()]),
    radiusM: z.number(),
    corridorM: z.number(),
    dedupeM: z.number(),
    snapMaxM: z.number(),
    expireDays: z.number(),
    maxPerUserPerDay: z.number(),
  }),
  score: z.object({
    riskyThreshold: z.number(),
    mergeGapM: z.number(),
    minStretchM: z.number(),
    unavoidableM: z.number(),
    normaliser: z.number(),
    sameRouteShare: z.number(),
    sameRouteToleranceM: z.number(),
  }),
});

export type SafetyConfig = z.infer<typeof schema>;

export const SAFETY_ROOT = process.cwd();
export const MODEL_PATH = path.join(SAFETY_ROOT, "config", "safety-model.json");

type Loaded = { config: SafetyConfig; hash: string };
const GLOBAL_KEY = Symbol.for("zippi.safety.config");

function load(): Loaded {
  const raw = readFileSync(MODEL_PATH);
  // Same normalisation as the pipeline, so a CRLF checkout hashes identically.
  const normalised = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return {
    config: schema.parse(JSON.parse(raw.toString("utf8"))),
    hash: createHash("sha256").update(normalised).digest("hex").slice(0, 12),
  };
}

function loaded(): Loaded {
  const g = globalThis as unknown as Record<symbol, Loaded | undefined>;
  return (g[GLOBAL_KEY] ??= load());
}

export function getSafetyConfig(): SafetyConfig {
  return loaded().config;
}

/** Content hash of the model file; stamped into every build artefact. */
export function configHash(): string {
  return loaded().hash;
}

export function inRegion(lng: number, lat: number, cfg: SafetyConfig = getSafetyConfig()): boolean {
  const [w, s, e, n] = cfg.region.bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}
