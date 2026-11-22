import { and, count, desc, eq, gte, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { rawPayloads } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { PROVIDER_IDS } from "@/lib/fares/types";

/**
 * The payload list.
 *
 * Filters are querystring parameters so a view is shareable and the filtering
 * happens in the database rather than in the browser.
 */

export const runtime = "nodejs";

const RANGES = { hour: 3_600_000, day: 86_400_000, week: 604_800_000 } as const;

const querySchema = z.object({
  provider: z.string().optional(),
  // "empty" is the interesting one: structurally fine, but produced nothing.
  outcome: z.enum(["all", "parsed", "failed", "empty"]).default("all"),
  status: z.string().optional(),
  range: z.enum(["hour", "day", "week", "all"]).default("day"),
  routeKey: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
});

export async function GET(request: Request) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return Response.json({ error: "Invalid query params" }, { status: 400 });
    }
    const q = parsed.data;

    const conditions: SQL[] = [];

    if (q.provider) {
      const ids = q.provider
        .split(",")
        .map((p) => p.trim())
        .filter((p): p is (typeof PROVIDER_IDS)[number] =>
          (PROVIDER_IDS as readonly string[]).includes(p),
        );
      if (ids.length > 0) {
        conditions.push(sql`${rawPayloads.provider} IN ${ids}`);
      }
    }

    if (q.outcome === "parsed") conditions.push(isNull(rawPayloads.parseError));
    if (q.outcome === "failed") conditions.push(isNotNull(rawPayloads.parseError));
    if (q.outcome === "empty") conditions.push(eq(rawPayloads.parsedCount, 0));

    if (q.status) conditions.push(eq(rawPayloads.status, q.status));
    if (q.routeKey) conditions.push(eq(rawPayloads.routeKey, q.routeKey));

    if (q.range !== "all") {
      conditions.push(
        gte(rawPayloads.capturedAt, new Date(Date.now() - RANGES[q.range])),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: rawPayloads.id,
        provider: rawPayloads.provider,
        capturedAt: rawPayloads.capturedAt,
        routeKey: rawPayloads.routeKey,
        status: rawPayloads.status,
        parsedCount: rawPayloads.parsedCount,
        parseError: rawPayloads.parseError,
        // The body can be hundreds of KB; the list only needs its size.
        bodyBytes: sql<number>`length(${rawPayloads.body})`,
      })
      .from(rawPayloads)
      .where(where)
      .orderBy(desc(rawPayloads.capturedAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);

    const [{ total }] = await db
      .select({ total: count() })
      .from(rawPayloads)
      .where(where);

    return Response.json({ data: rows, total, page: q.page, limit: q.limit });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/payloads]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
