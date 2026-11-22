import { and, between, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { potholeConfirmations, potholeReports } from "@/lib/schema";
import type { SafetyConfig } from "./config";
import { type Bbox, haversineM } from "./geo";
import { effectiveSeverity } from "./gh-model";
import { SafetyError } from "./graphhopper";
import type { PotholeMarker } from "./types";

/**
 * Crowd-sourced pothole reports.
 *
 * Read straight from Postgres for every request, limited to the area in
 * question and served by the (status, lat, lng) index — a millisecond-scale
 * query. Deliberately no in-memory cache: the report endpoint and the
 * directions endpoint may run in different server instances, and a fresh
 * report must affect the very next route everywhere.
 */

function cutoff(cfg: SafetyConfig): Date {
  return new Date(Date.now() - cfg.potholes.expireDays * 86_400_000);
}

function toMarker(r: typeof potholeReports.$inferSelect): PotholeMarker {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    severity: effectiveSeverity(r.severity, r.confirmations),
    confirmations: r.confirmations,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Active, unexpired reports inside `bbox` (west, south, east, north). */
export async function potholesIn([w, s, e, n]: Bbox, cfg: SafetyConfig, limit = 500): Promise<PotholeMarker[]> {
  await ensureDatabaseSetup();
  const rows = await db
    .select()
    .from(potholeReports)
    .where(
      and(
        eq(potholeReports.status, "active"),
        between(potholeReports.lat, s, n),
        between(potholeReports.lng, w, e),
        gt(potholeReports.lastConfirmedAt, cutoff(cfg)),
      ),
    )
    .limit(limit);
  return rows.map(toMarker);
}

export type ReportInput = {
  userId: string;
  rawLat: number;
  rawLng: number;
  lat: number;
  lng: number;
  severity: 1 | 2 | 3;
  note?: string;
};

export type ReportResult = { pothole: PotholeMarker; deduped: boolean; alreadyConfirmed: boolean };

/**
 * Record a report, or confirm an existing one within `dedupeM` metres.
 *
 * Runs in a transaction so two riders reporting the same spot at once cannot
 * create twin rows past the rate limit.
 */
export async function reportPothole(input: ReportInput, cfg: SafetyConfig): Promise<ReportResult> {
  await ensureDatabaseSetup();
  const result = await db.transaction(async (tx) => {
    const [{ value: today }] = await tx
      .select({ value: count() })
      .from(potholeConfirmations)
      .where(
        and(
          eq(potholeConfirmations.userId, input.userId),
          gt(potholeConfirmations.createdAt, new Date(Date.now() - 86_400_000)),
        ),
      );
    if (today >= cfg.potholes.maxPerUserPerDay) {
      throw new SafetyError("RATE_LIMITED", "You have reached today's report limit. Thank you for helping!", 429);
    }

    const dLat = cfg.potholes.dedupeM / 111_320;
    const dLng = dLat / Math.cos((input.lat * Math.PI) / 180);
    const nearby = await tx
      .select()
      .from(potholeReports)
      .where(
        and(
          eq(potholeReports.status, "active"),
          gt(potholeReports.lastConfirmedAt, cutoff(cfg)),
          between(potholeReports.lat, input.lat - dLat, input.lat + dLat),
          between(potholeReports.lng, input.lng - dLng, input.lng + dLng),
        ),
      );
    const match = nearby
      .map((r) => ({ r, d: haversineM([input.lng, input.lat], [r.lng, r.lat]) }))
      .filter(({ d }) => d <= cfg.potholes.dedupeM)
      .sort((a, b) => a.d - b.d)[0]?.r;

    if (match) {
      const inserted = await tx
        .insert(potholeConfirmations)
        .values({ reportId: match.id, userId: input.userId })
        .onConflictDoNothing()
        .returning({ reportId: potholeConfirmations.reportId });
      if (!inserted.length) return { row: match, deduped: true, alreadyConfirmed: true };
      const [row] = await tx
        .update(potholeReports)
        .set({
          confirmations: sql`${potholeReports.confirmations} + 1`,
          severity: sql`GREATEST(${potholeReports.severity}, ${input.severity})`,
          lastConfirmedAt: new Date(),
        })
        .where(eq(potholeReports.id, match.id))
        .returning();
      return { row, deduped: true, alreadyConfirmed: false };
    }

    const [row] = await tx
      .insert(potholeReports)
      .values({
        lat: input.lat,
        lng: input.lng,
        rawLat: input.rawLat,
        rawLng: input.rawLng,
        severity: input.severity,
        note: input.note?.trim() || null,
        reportedBy: input.userId,
      })
      .returning();
    await tx.insert(potholeConfirmations).values({ reportId: row.id, userId: input.userId });
    return { row, deduped: false, alreadyConfirmed: false };
  });

  return { pothole: toMarker(result.row), deduped: result.deduped, alreadyConfirmed: result.alreadyConfirmed };
}
