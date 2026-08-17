import { db } from "@/lib/db";
import { users, trips, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, isNull } from "drizzle-orm";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();
    const { id } = await ctx.params;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        role: users.role,
        isActive: users.isActive,
        locationConsent: users.locationConsent,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const [{ tripCount }] = await db
      .select({ tripCount: count() })
      .from(trips)
      .where(eq(trips.userId, id));

    return Response.json({ ...user, tripCount });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const updates: Partial<{ isActive: boolean; role: string; updatedAt: Date }> = {};
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({ id: users.id, role: users.role, isActive: users.isActive });

    if (!updated) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Audit log
    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: parsed.data.role ? "UPDATE_USER_ROLE" : "UPDATE_USER_STATUS",
      targetTable: "users",
      targetId: id,
      details: parsed.data as Record<string, unknown>,
    });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    const { id } = await ctx.params;

    await db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "DELETE_USER",
      targetTable: "users",
      targetId: id,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
