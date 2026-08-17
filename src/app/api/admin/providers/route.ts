import { db } from "@/lib/db";
import { travelProviders, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { z } from "zod";

export async function GET() {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();
    const rows = await db.select().from(travelProviders).orderBy(travelProviders.name);
    return Response.json({ data: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const addSchema = z.object({
  name: z.string().min(1),
  vehicleType: z.string().min(1),
  baseFare: z.number().nonnegative(),
  perKmRate: z.number().nonnegative(),
  deepLinkTemplate: z.string().min(1),
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
      .insert(travelProviders)
      .values({
        name: parsed.data.name,
        vehicleType: parsed.data.vehicleType,
        baseFare: String(parsed.data.baseFare),
        perKmRate: String(parsed.data.perKmRate),
        deepLinkTemplate: parsed.data.deepLinkTemplate,
      })
      .returning();

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "ADD_PROVIDER",
      targetTable: "travel_providers",
      targetId: row.id,
      details: parsed.data as Record<string, unknown>,
    });

    return Response.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
