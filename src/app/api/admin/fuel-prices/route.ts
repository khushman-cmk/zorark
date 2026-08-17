import { db } from "@/lib/db";
import { fuelPrices, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { count, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";

const querySchema = z.object({
  state: z.string().optional(),
  city: z.string().optional(),
  fuelType: z.enum(["petrol", "e20", "diesel"]).optional(),
});

export async function GET(request: Request) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const url = new URL(request.url);
    const { state, city, fuelType } = querySchema.parse(
      Object.fromEntries(url.searchParams)
    );

    let query = db.select().from(fuelPrices).$dynamic();
    if (state) query = query.where(ilike(fuelPrices.state, `%${state}%`));
    if (city) query = query.where(ilike(fuelPrices.city, `%${city}%`));
    if (fuelType) query = query.where(eq(fuelPrices.fuelType, fuelType));

    const rows = await query.orderBy(fuelPrices.state, fuelPrices.city);
    return Response.json({ data: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const addSchema = z.object({
  state: z.string().min(1),
  city: z.string().min(1),
  fuelType: z.enum(["petrol", "e20", "diesel"]),
  pricePerLitre: z.number().positive(),
});

export async function POST(request: Request) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();

    const body = await request.json();
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
    }

    const [row] = await db
      .insert(fuelPrices)
      .values({
        state: parsed.data.state,
        city: parsed.data.city,
        fuelType: parsed.data.fuelType,
        pricePerLitre: String(parsed.data.pricePerLitre),
      })
      .returning();

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "ADD_FUEL_PRICE",
      targetTable: "fuel_prices",
      targetId: row.id,
      details: parsed.data as Record<string, unknown>,
    });

    return Response.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
