import { db } from "@/lib/db";
import { adminLogs, users } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  adminId: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
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

    const { page, limit, adminId, action, from, to } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof sql>[] = [];
    if (adminId) conditions.push(sql`${adminLogs.adminId} = ${adminId}`);
    if (action) conditions.push(sql`${adminLogs.action} ILIKE ${"%" + action + "%"}`);
    if (from) conditions.push(sql`${adminLogs.createdAt} >= ${new Date(from)}`);
    if (to) conditions.push(sql`${adminLogs.createdAt} <= ${new Date(to)}`);

    const whereClause =
      conditions.length > 0
        ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
        : undefined;

    let query = db
      .select({
        id: adminLogs.id,
        action: adminLogs.action,
        targetTable: adminLogs.targetTable,
        targetId: adminLogs.targetId,
        details: adminLogs.details,
        createdAt: adminLogs.createdAt,
        adminName: users.name,
        adminEmail: users.email,
      })
      .from(adminLogs)
      .leftJoin(users, eq(adminLogs.adminId, users.id))
      .$dynamic();

    if (whereClause) query = query.where(whereClause);

    const rows = await query.orderBy(desc(adminLogs.createdAt)).limit(limit).offset(offset);

    let countQuery = db.select({ total: count() }).from(adminLogs).$dynamic();
    if (whereClause) countQuery = countQuery.where(whereClause);
    const [{ total }] = await countQuery;

    return Response.json({ data: rows, total, page, limit });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
