import { db } from "@/lib/db";
import { users, trips, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, gte, lte, and, desc, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const url = new URL(request.url);
    const startParam = url.searchParams.get("startDate");
    const endParam = url.searchParams.get("endDate");

    const startDate = startParam ? new Date(startParam) : undefined;
    const endDate = endParam ? new Date(endParam) : undefined;

    // Adjust end date to the end of the day
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const customerFilter = and(isNull(users.deletedAt), eq(users.role, "user"));
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
      .where(customerFilter);

    // New users this week (or period if specified)
    const [newUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(
        startDate && endDate 
          ? and(customerFilter, dateFilter)
          : and(customerFilter, gte(users.createdAt, weekAgo))
      );

    // Active users (isActive = true)
    const [activeUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(
        startDate && endDate
          ? and(customerFilter, eq(users.isActive, true), dateFilter)
          : and(customerFilter, eq(users.isActive, true))
      );

    // Trips today (or in period)
    const [tripsInPeriodRow] = await db
      .select({ count: count() })
      .from(trips)
      .where(
        startDate && endDate ? tripsDateFilter : gte(trips.createdAt, today)
      );

    const [totalTripsRow] = await db
      .select({ count: count() })
      .from(trips)
      .where(tripsDateFilter);

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

    // Recent customer rides, including the customer who made each trip.
    const recentTrips = await db
      .select({
        id: trips.id,
        userName: users.name,
        userEmail: users.email,
        type: trips.type,
        origin: trips.origin,
        destination: trips.destination,
        createdAt: trips.createdAt,
      })
      .from(trips)
      .innerJoin(users, eq(trips.userId, users.id))
      .where(
        tripsDateFilter
          ? and(tripsDateFilter, customerFilter)
          : customerFilter
      )
      .orderBy(desc(trips.createdAt))
      .limit(10);

    const recentSignups = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(customerFilter)
      .orderBy(desc(users.createdAt))
      .limit(10);

    return Response.json({
      totalUsers: totalUsersRow.count,
      newUsersThisWeek: newUsersRow.count,
      activeUsers: activeUsersRow.count,
      tripsInPeriod: tripsInPeriodRow.count,
      totalTrips: totalTripsRow.count,
      tripsByType,
      topDestinations,
      recentActivity,
      recentTrips,
      recentSignups,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/dashboard]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
