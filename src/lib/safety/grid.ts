import { readFile } from "node:fs/promises";
import path from "node:path";
import { SAFETY_ROOT } from "./config";

/**
 * The 100 m analysis grid exported by the pipeline (data/safety/grid.*).
 *
 * Used only to explain risk ("irregular lanes near Gejha", "40 m from a
 * pond"); routing itself reads the levels GraphHopper baked in at import.
 * Cell indexing must match scripts/safety/zsafety/config.py exactly — the
 * shared vectors in config/safety-testvectors.json pin both sides. The grid
 * constants (mPerDegLon in particular) are read from grid.json rather than
 * recomputed, so Math.cos and Python's cos can never disagree in the last bit.
 */

type LayerSpec = { name: string; dtype: "u8" | "u16"; offset: number; length: number; scale: number };

type GridMeta = {
  version: number;
  configHash: string;
  builtAt: string;
  west: number;
  south: number;
  cellM: number;
  mPerDegLat: number;
  mPerDegLon: number;
  nx: number;
  ny: number;
  layers: LayerSpec[];
  flags: { lowData: number; hasRoad: number };
  waters: Array<{ kind: string; name: string }>;
  places: Array<{ name: string; kind: string; lng: number; lat: number }>;
};

export type CellSample = {
  cell: number;
  /** Unplanned score 0…1. */
  u: number;
  /** Street orientation order 0…1 (1 = clean grid). */
  phi: number;
  /** Dead-end share 0…1. */
  dead: number;
  /** Rural land-use share 0…1. */
  rural: number;
  /** Metres to the nearest water body (≤ 250), or null. */
  waterM: number | null;
  water: { kind: string; name: string } | null;
  place: string | null;
  lowData: boolean;
};

export type GridStore = {
  meta: GridMeta;
  cellIndex(lng: number, lat: number): number;
  sample(lng: number, lat: number): CellSample | null;
};

export const GRID_DIR = path.join(SAFETY_ROOT, "data", "safety");
const GLOBAL_KEY = Symbol.for("zippi.safety.grid");

export function cellIndexFor(
  meta: Pick<GridMeta, "west" | "south" | "cellM" | "mPerDegLat" | "mPerDegLon" | "nx" | "ny">,
  lng: number,
  lat: number,
): number {
  const x = (lng - meta.west) * meta.mPerDegLon;
  const y = (lat - meta.south) * meta.mPerDegLat;
  const ix = Math.floor(x / meta.cellM);
  const iy = Math.floor(y / meta.cellM);
  if (ix < 0 || ix >= meta.nx || iy < 0 || iy >= meta.ny) return -1;
  return iy * meta.nx + ix;
}

function build(meta: GridMeta, bin: Buffer): GridStore {
  const view = (name: string) => {
    const spec = meta.layers.find((l) => l.name === name);
    if (!spec) throw new Error(`grid.bin has no layer ${name}`);
    return spec.dtype === "u16"
      ? new Uint16Array(bin.buffer, bin.byteOffset + spec.offset, spec.length)
      : new Uint8Array(bin.buffer, bin.byteOffset + spec.offset, spec.length);
  };
  const scale = (name: string) => meta.layers.find((l) => l.name === name)!.scale;
  const u = view("u");
  const phi = view("phi");
  const dead = view("dead");
  const rural = view("rural");
  const wdist = view("wdist");
  const flags = view("flags");
  const wid = view("wid");
  const pid = view("pid");
  const fs = scale("u");

  const cellIndex = (lng: number, lat: number) => cellIndexFor(meta, lng, lat);
  return {
    meta,
    cellIndex,
    sample(lng, lat) {
      const i = cellIndex(lng, lat);
      if (i < 0) return null;
      const w = wid[i];
      const p = pid[i];
      return {
        cell: i,
        u: u[i] * fs,
        phi: phi[i] * fs,
        dead: dead[i] * fs,
        rural: rural[i] * fs,
        waterM: wdist[i] === 255 ? null : wdist[i],
        water: w === 65535 ? null : (meta.waters[w] ?? null),
        place: p === 65535 ? null : (meta.places[p]?.name ?? null),
        lowData: (flags[i] & meta.flags.lowData) !== 0,
      };
    },
  };
}

type Slot = { store: GridStore | null; loading: Promise<GridStore> | null };

function slot(): Slot {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>;
  return (g[GLOBAL_KEY] ??= { store: null, loading: null });
}

/** Loads once per process (≈5 MB); concurrent callers share the same promise. */
export async function getGrid(): Promise<GridStore> {
  const s = slot();
  if (s.store) return s.store;
  s.loading ??= (async () => {
    const [metaRaw, bin] = await Promise.all([
      readFile(path.join(GRID_DIR, "grid.json"), "utf8"),
      readFile(path.join(GRID_DIR, "grid.bin")),
    ]);
    const store = build(JSON.parse(metaRaw) as GridMeta, bin);
    s.store = store;
    return store;
  })().catch((err) => {
    s.loading = null;
    throw err;
  });
  return s.loading;
}

/** The grid if already loaded, otherwise null (never blocks a request on disk I/O). */
export function peekGrid(): GridStore | null {
  return slot().store;
}
