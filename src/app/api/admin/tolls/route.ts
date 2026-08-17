import { db } from "@/lib/db";
import { tollPlazas, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { z } from "zod";

export async function GET() {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();
    const rows = await db.select().from(tollPlazas).orderBy(tollPlazas.state);
    return Response.json({ data: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const addSchema = z.object({
  highwayName: z.string().min(1),
  plazaName: z.string().min(1),
  state: z.string().min(1),
  rateLight: z.number().nonnegative(),
  rateMedium: z.number().nonnegative().optional(),
  rateHeavy: z.number().nonnegative().optional(),
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
      .insert(tollPlazas)
      .values({
        highwayName: parsed.data.highwayName,
        plazaName: parsed.data.plazaName,
        state: parsed.data.state,
        rateLight: String(parsed.data.rateLight),
        rateMedium: parsed.data.rateMedium !== undefined ? String(parsed.data.rateMedium) : undefined,
        rateHeavy: parsed.data.rateHeavy !== undefined ? String(parsed.data.rateHeavy) : undefined,
      })
      .returning();

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "ADD_TOLL_PLAZA",
      targetTable: "toll_plazas",
      targetId: row.id,
      details: parsed.data as Record<string, unknown>,
    });

    return Response.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
