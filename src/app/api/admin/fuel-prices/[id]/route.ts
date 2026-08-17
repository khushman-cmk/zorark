import { db } from "@/lib/db";
import { fuelPrices, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { eq } from "drizzle-orm";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  pricePerLitre: z.number().positive(),
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

    // Fetch old price for audit log
    const [old] = await db.select().from(fuelPrices).where(eq(fuelPrices.id, id)).limit(1);
    if (!old) return Response.json({ error: "Not found" }, { status: 404 });

    const [updated] = await db
      .update(fuelPrices)
      .set({
        pricePerLitre: String(parsed.data.pricePerLitre),
        updatedAt: new Date(),
      })
      .where(eq(fuelPrices.id, id))
      .returning();

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "UPDATE_FUEL_PRICE",
      targetTable: "fuel_prices",
      targetId: id,
      details: {
        old_price: old.pricePerLitre,
        new_price: parsed.data.pricePerLitre,
      },
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

    await db.delete(fuelPrices).where(eq(fuelPrices.id, id));

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "DELETE_FUEL_PRICE",
      targetTable: "fuel_prices",
      targetId: id,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
