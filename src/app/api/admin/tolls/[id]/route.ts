import { db } from "@/lib/db";
import { tollPlazas, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { eq } from "drizzle-orm";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  highwayName: z.string().min(1).optional(),
  plazaName: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  rateLight: z.number().nonnegative().optional(),
  rateMedium: z.number().nonnegative().optional(),
  rateHeavy: z.number().nonnegative().optional(),
});

export async function PUT(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    const { id } = await ctx.params;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.highwayName) updates.highwayName = parsed.data.highwayName;
    if (parsed.data.plazaName) updates.plazaName = parsed.data.plazaName;
    if (parsed.data.state) updates.state = parsed.data.state;
    if (parsed.data.rateLight !== undefined) updates.rateLight = String(parsed.data.rateLight);
    if (parsed.data.rateMedium !== undefined) updates.rateMedium = String(parsed.data.rateMedium);
    if (parsed.data.rateHeavy !== undefined) updates.rateHeavy = String(parsed.data.rateHeavy);

    const [updated] = await db
      .update(tollPlazas)
      .set(updates)
      .where(eq(tollPlazas.id, id))
      .returning();

    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "UPDATE_TOLL_PLAZA",
      targetTable: "toll_plazas",
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

    await db.delete(tollPlazas).where(eq(tollPlazas.id, id));

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "DELETE_TOLL_PLAZA",
      targetTable: "toll_plazas",
      targetId: id,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
