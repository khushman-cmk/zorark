import { db } from "@/lib/db";
import { users, trips } from "@/lib/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import CustomerListClient from "./CustomerListClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customers | Admin Panel",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const search = typeof resolvedParams.search === "string" ? resolvedParams.search : "";
  const status = typeof resolvedParams.status === "string" ? resolvedParams.status : "all";
  const page = typeof resolvedParams.page === "string" ? parseInt(resolvedParams.page, 10) : 1;
  const limit = 25;
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [];
  
  if (search) {
    conditions.push(
      or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
        ilike(users.mobile, `%${search}%`)
      )
    );
  }
  
  if (status === "active") {
    conditions.push(eq(users.isActive, true));
  } else if (status === "suspended") {
    conditions.push(eq(users.isActive, false));
  }
  
  // We want to fetch users and their trip counts
  // Using a subquery for trip counts
  const tripCountSq = db
    .select({
      userId: trips.userId,
      count: sql<number>`count(${trips.id})`.as("trip_count")
    })
    .from(trips)
    .groupBy(trips.userId)
    .as("sq");

  const query = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      isActive: users.isActive,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      tripCount: sql<number>`COALESCE(${tripCountSq.count}, 0)`
    })
    .from(users)
    .leftJoin(tripCountSq, eq(users.id, tripCountSq.userId));

  if (conditions.length > 0) {
    // using raw sql or `and` operator. Just applying the first condition for simplicity here.
    // Drizzle requires `and(...conditions)` but for now we can just use `where` dynamically
    if (conditions.length === 1) {
      query.where(conditions[0]);
    } else {
      query.where(conditions[0]); // simplistic, but ok for now if search & status used
      // To do it properly:
      const { and } = await import("drizzle-orm");
      query.where(and(...conditions));
    }
  }

  // Count total records for pagination
  const totalRecordsResult = await db.select({ count: sql<number>`count(*)` }).from(users);
  const totalRecords = totalRecordsResult[0].count;
  const totalPages = Math.ceil(totalRecords / limit);

  query.orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  const customers = await query;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Customers</h1>
        <p className="text-zinc-500">Manage your platform users and their accounts.</p>
      </div>

      <CustomerListClient 
        customers={customers} 
        initialSearch={search} 
        initialStatus={status}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
