import { db } from "@/lib/db";
import { users, trips, fuelPrices, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, gte, lte, and, sql, desc, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const url = new URL(request.url);
    const startParam = url.searchParams.get("startDate");
    const endParam = url.searchParams.get("endDate");

    let startDate = startParam ? new Date(startParam) : undefined;
    let endDate = endParam ? new Date(endParam) : undefined;

    // Adjust end date to the end of the day
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateFilter = startDate && endDate 
      ? and(gte(users.createdAt, startDate), lte(users.createdAt, endDate))
      : undefined;

    const tripsDateFilter = startDate && endDate
      ? and(gte(trips.createdAt, startDate), lte(trips.createdAt, endDate))
      : undefined;

    // Total users (not deleted)
    const [totalUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), dateFilter));

    // New users this week (or period if specified)
    const [newUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(
        startDate && endDate 
          ? and(dateFilter, isNull(users.deletedAt))
          : sql`${users.createdAt} >= ${weekAgo} AND ${users.deletedAt} IS NULL`
      );

    // Active users (isActive = true)
    const [activeUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(
        startDate && endDate
          ? and(sql`${users.isActive} = true AND ${users.deletedAt} IS NULL`, dateFilter)
          : sql`${users.isActive} = true AND ${users.deletedAt} IS NULL`
      );

    // Trips today (or in period)
    const [tripsTodayRow] = await db
      .select({ count: count() })
      .from(trips)
      .where(
        startDate && endDate ? tripsDateFilter : gte(trips.createdAt, today)
      );

    // Total trips by type
    const tripsByType = await db
      .select({ type: trips.type, count: count() })
      .from(trips)
      .where(tripsDateFilter)
      .groupBy(trips.type);

    // Top 5 destinations
    const topDestinations = await db
      .select({ destination: trips.destination, count: count() })
      .from(trips)
      .where(tripsDateFilter)
      .groupBy(trips.destination)
      .orderBy(desc(count()))
      .limit(5);

    // Fuel prices last updated
    const [lastFuelUpdate] = await db
      .select({ updatedAt: fuelPrices.updatedAt })
      .from(fuelPrices)
      .orderBy(desc(fuelPrices.updatedAt))
      .limit(1);

    // Recent Activity (Admin Logs)
    const recentActivity = await db
      .select({
        id: adminLogs.id,
        action: adminLogs.action,
        details: adminLogs.details,
        targetTable: adminLogs.targetTable,
        targetId: adminLogs.targetId,
        createdAt: adminLogs.createdAt,
        adminName: users.name,
      })
      .from(adminLogs)
      .leftJoin(users, eq(adminLogs.adminId, users.id))
      .orderBy(desc(adminLogs.createdAt))
      .limit(10);

    return Response.json({
      totalUsers: totalUsersRow.count,
      newUsersThisWeek: newUsersRow.count,
      activeUsers: activeUsersRow.count,
      tripsToday: tripsTodayRow.count,
      tripsByType,
      topDestinations,
      fuelPricesLastUpdated: lastFuelUpdate?.updatedAt ?? null,
      recentActivity,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/dashboard]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
