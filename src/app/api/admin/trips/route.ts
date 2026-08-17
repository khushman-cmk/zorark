import { db } from "@/lib/db";
import { trips } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, gte, lte, sql, avg, desc } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  type: z.enum(["vehicle", "travel"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  analytics: z.coerce.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }

    const { page, limit, type, from, to, analytics } = parsed.data;

    // Analytics mode — return chart data
    if (analytics) {
      // Top 10 destinations
      const topDestinations = await db
        .select({ destination: trips.destination, count: count() })
        .from(trips)
        .groupBy(trips.destination)
        .orderBy(desc(count()))
        .limit(10);

      // Average fuel cost per day over last 30 days
      const fuelTrend = await db.execute(sql`
        SELECT
          DATE_TRUNC('day', created_at) AS day,
          AVG(fuel_cost::numeric) AS avg_cost,
          COUNT(*) AS trip_count
        FROM trips
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND fuel_cost IS NOT NULL
        GROUP BY day
        ORDER BY day ASC
      `);

      // Toll vs no-toll split
      const tollSplit = await db
        .select({ preference: trips.routePreference, count: count() })
        .from(trips)
        .groupBy(trips.routePreference);

      return Response.json({ topDestinations, fuelTrend: fuelTrend.rows, tollSplit });
    }

    // List mode — paginated
    const offset = (page - 1) * limit;
    const conditions: ReturnType<typeof sql>[] = [];
    if (type) conditions.push(sql`${trips.type} = ${type}`);
    if (from) conditions.push(sql`${trips.createdAt} >= ${new Date(from)}`);
    if (to) conditions.push(sql`${trips.createdAt} <= ${new Date(to)}`);

    const whereClause =
      conditions.length > 0
        ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
        : undefined;

    let query = db.select().from(trips).$dynamic();
    if (whereClause) query = query.where(whereClause);

    const rows = await query
      .orderBy(desc(trips.createdAt))
      .limit(limit)
      .offset(offset);

    let countQuery = db.select({ total: count() }).from(trips).$dynamic();
    if (whereClause) countQuery = countQuery.where(whereClause);
    const [{ total }] = await countQuery;

    return Response.json({ data: rows, total, page, limit });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/trips]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
