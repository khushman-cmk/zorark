import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fareConfig } from "../config";
import { providers } from "../providers";
import { readStatus } from "./store";
import { isOpen } from "../orchestrator/breaker";
import { streamFares } from "../orchestrator/stream";
import { resolveFirst } from "../geocode";
import type { Coord, ProviderId } from "../types";

/**
 * Session health.
 *
 * Passive health comes first: every organic fare fetch already updates
 * last_ok_at and the fail streak, so under real traffic the active prober
 * below almost never runs. It only fires for a provider that has had no auth
 * signal at all for a while.
 *
 * Probes are real fare fetches on a rotating popular route, so each one
 * validates the session, exercises the parser and warms the cache at once
 * rather than being pure overhead.
 */

const CANARY_ROUTES = [
  { from: "Indiranagar", to: "Koramangala" },
  { from: "Andheri", to: "Bandra" },
  { from: "Connaught Place", to: "Saket" },
  { from: "Hitech City", to: "Gachibowli" },
] as const;

let canaryIndex = 0;

/** Postgres advisory lock key, so only one process ever probes. */
const LOCK_KEY = 8_421_337;

async function acquireLock(): Promise<boolean> {
  try {
    const result = await db.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`,
    );
    return Boolean(result.rows?.[0]?.locked);
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => {});
}

/** Which providers have gone quiet long enough to be worth probing. */
async function needsProbe(): Promise<ProviderId[]> {
  const quiet: ProviderId[] = [];
  const cutoff = Date.now() - fareConfig.probeAfterQuietMs;

  for (const provider of providers) {
    if (!provider.requiresSession) continue;
    // Probing while the breaker is open is exactly how an expired session
    // becomes a banned one.
    if (isOpen(provider.id)) continue;

    const record = await readStatus(provider.id).catch(() => null);
    if (!record) continue;
    if (record.status === "disconnected" || record.status === "expired") continue;

    const lastSignal = Math.max(
      record.lastOkAt?.getTime() ?? 0,
      record.lastFailAt?.getTime() ?? 0,
    );
    if (lastSignal < cutoff) quiet.push(provider.id);
  }

  return quiet;
}

async function canaryCoords(): Promise<{ pickup: Coord; drop: Coord } | null> {
  const route = CANARY_ROUTES[canaryIndex % CANARY_ROUTES.length];
  canaryIndex += 1;

  const [pickup, drop] = await Promise.all([
    resolveFirst(route.from).catch(() => null),
    resolveFirst(route.to).catch(() => null),
  ]);
  if (!pickup || !drop) return null;
  return { pickup, drop };
}

export async function runProbeCycle(): Promise<{ probed: ProviderId[] }> {
  const quiet = await needsProbe();
  if (quiet.length === 0) return { probed: [] };

  const coords = await canaryCoords();
  if (!coords) return { probed: [] };

  const targets = providers.filter((p) => quiet.includes(p.id));

  // Driving it through the normal stream means the probe respects every rate
  // brake and writes its result into the cache like any other fetch.
  for await (const _event of streamFares(coords.pickup, coords.drop, {
    providers: targets,
  })) {
    void _event;
  }

  return { probed: quiet };
}

/**
 * Starts the prober.
 *
 * Three guards, each catching a different failure: a runtime check so it
 * never starts in an edge or build context, a globalThis flag because hot
 * reload re-evaluates modules, and a database advisory lock for multi-process
 * deploys.
 *
 * Self-rescheduling setTimeout rather than setInterval: an Uber probe takes
 * around twenty seconds and intervals would overlap.
 */
const BOOT_FLAG = Symbol.for("zippi.fares.prober");

export function startHealthProber(): void {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.FARE_DISABLE_PROBER === "1") return;

  const g = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (g[BOOT_FLAG]) return;
  g[BOOT_FLAG] = true;

  const schedule = () => {
    const base = fareConfig.probeAfterQuietMs;
    // ±20% jitter, so a restart storm does not synchronise every instance.
    const delay = base * (0.8 + Math.random() * 0.4);
    const timer = setTimeout(async () => {
      let held = false;
      try {
        held = await acquireLock();
        if (held) await runProbeCycle();
      } catch (err) {
        console.error("[fares/health] probe cycle failed", err);
      } finally {
        if (held) await releaseLock();
        schedule();
      }
    }, delay);
    // Never hold the process open just for a probe.
    timer.unref?.();
  };

  schedule();
}
