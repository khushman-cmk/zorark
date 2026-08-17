import { db } from "@/lib/db";
import { travelProviders, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { eq } from "drizzle-orm";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  vehicleType: z.string().min(1).optional(),
  baseFare: z.number().nonnegative().optional(),
  perKmRate: z.number().nonnegative().optional(),
  deepLinkTemplate: z.string().min(1).optional(),
});

export async function PUT(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.vehicleType) updates.vehicleType = parsed.data.vehicleType;
    if (parsed.data.baseFare !== undefined) updates.baseFare = String(parsed.data.baseFare);
    if (parsed.data.perKmRate !== undefined) updates.perKmRate = String(parsed.data.perKmRate);
    if (parsed.data.deepLinkTemplate) updates.deepLinkTemplate = parsed.data.deepLinkTemplate;

    const [updated] = await db
      .update(travelProviders)
      .set(updates)
      .where(eq(travelProviders.id, id))
      .returning();

    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "UPDATE_PROVIDER",
      targetTable: "travel_providers",
      targetId: id,
      details: parsed.data as Record<string, unknown>,
    });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const { isActive } = await request.json();

    const [updated] = await db
      .update(travelProviders)
      .set({ isActive: Boolean(isActive), updatedAt: new Date() })
      .where(eq(travelProviders.id, id))
      .returning();

    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: isActive ? "ACTIVATE_PROVIDER" : "DEACTIVATE_PROVIDER",
      targetTable: "travel_providers",
      targetId: id,
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

    await db.delete(travelProviders).where(eq(travelProviders.id, id));

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "DELETE_PROVIDER",
      targetTable: "travel_providers",
      targetId: id,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
