import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { fareCache } from "@/lib/schema";
import { fareConfig } from "../config";
import type { FareOption, ProviderId } from "../types";

/**
 * Three-band fare cache.
 *
 * Keyed on a quantised coordinate grid so nearby pickups share a row, which
 * is what keeps a shared account's request count sane under real traffic.
 *
 *   fresh  < 90s        serve, no provider contact at all
 *   stale  90s - 30min  serve marked stale with its age, refresh behind it
 *   old    > 30min      serve only when the provider is down, heavily marked
 */

export type CacheBand = "fresh" | "stale" | "old";

export type CacheHit = {
  band: CacheBand;
  ageSec: number;
  options: FareOption[];
  fetchedAt: Date;
};

export async function readCache(
  routeKey: string,
  provider: ProviderId,
): Promise<CacheHit | null> {
  const [row] = await db
    .select()
    .from(fareCache)
    .where(and(eq(fareCache.routeKey, routeKey), eq(fareCache.provider, provider)))
    .limit(1);

  if (!row) return null;

  const ageMs = Date.now() - row.fetchedAt.getTime();
  const band: CacheBand =
    ageMs < fareConfig.freshMs ? "fresh" : ageMs < fareConfig.staleMs ? "stale" : "old";

  return {
    band,
    ageSec: Math.round(ageMs / 1000),
    options: row.options as FareOption[],
    fetchedAt: row.fetchedAt,
  };
}

export async function writeCache(
  routeKey: string,
  provider: ProviderId,
  options: FareOption[],
): Promise<void> {
  const now = new Date();
  await db
    .insert(fareCache)
    .values({
      routeKey,
      provider,
      options: options as unknown as Record<string, unknown>,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: [fareCache.routeKey, fareCache.provider],
      set: { options: options as unknown as Record<string, unknown>, fetchedAt: now },
    });
}

/**
 * Housekeeping.
 *
 * Deliberately takes the set of healthy providers: rows are never evicted for
 * a provider that is currently unhealthy, because those rows are exactly what
 * lets us answer "stale, and here is why" instead of "error".
 */
export async function evictOld(healthyProviders: ProviderId[]): Promise<number> {
  if (healthyProviders.length === 0) return 0;

  const cutoff = new Date(Date.now() - fareConfig.staleMs * 4);
  let removed = 0;
  for (const provider of healthyProviders) {
    const result = await db
      .delete(fareCache)
      .where(and(eq(fareCache.provider, provider), lt(fareCache.fetchedAt, cutoff)));
    removed += result.rowCount ?? 0;
  }
  return removed;
}
