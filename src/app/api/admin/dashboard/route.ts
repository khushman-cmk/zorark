import { db } from "@/lib/db";
import { users, trips, fuelPrices } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, gte, sql, desc, isNull } from "drizzle-orm";

export async function GET() {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Total users (not deleted)
    const [totalUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(isNull(users.deletedAt));

    // New users this week
    const [newUsersRow] = await db
      .select({ count: count() })
      .from(users)
      .where(
        sql`${users.createdAt} >= ${weekAgo} AND ${users.deletedAt} IS NULL`
      );

    // Total trips by type
    const tripsByType = await db
      .select({ type: trips.type, count: count() })
      .from(trips)
      .groupBy(trips.type);

    // Top 5 destinations
    const topDestinations = await db
      .select({ destination: trips.destination, count: count() })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(desc(count()))
      .limit(5);

    // Fuel prices last updated
    const [lastFuelUpdate] = await db
      .select({ updatedAt: fuelPrices.updatedAt })
      .from(fuelPrices)
      .orderBy(desc(fuelPrices.updatedAt))
      .limit(1);

    return Response.json({
      totalUsers: totalUsersRow.count,
      newUsersThisWeek: newUsersRow.count,
      tripsByType,
      topDestinations,
      fuelPricesLastUpdated: lastFuelUpdate?.updatedAt ?? null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/dashboard]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
