import { db } from "@/lib/db";
import { users, trips } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
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

    const { page, limit, search, role } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [isNull(users.deletedAt)];
    if (search) {
      conditions.push(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )!
      );
    }
    if (role) {
      conditions.push(eq(users.role, role));
    }

    const whereClause = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(users.createdAt)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(whereClause);

    return Response.json({ data: rows, total, page, limit });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/users GET]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
