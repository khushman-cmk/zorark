import { db } from "@/lib/db";
import { fuelPrices, adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";

export async function POST(request: Request) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const text = buffer.toString("utf-8");

    // Parse CSV: expected columns: state, city, fuel_type, price_per_litre
    let records: unknown[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      return Response.json({ error: "Invalid CSV format" }, { status: 400 });
    }

    const validFuelTypes = ["petrol", "e20", "diesel"];
    let upserted = 0;
    const errors: string[] = [];

    for (const [i, record] of (records as Record<string, string>[]).entries()) {
      const { state, city, fuel_type, price_per_litre } = record;

      if (!state || !city || !fuel_type || !price_per_litre) {
        errors.push(`Row ${i + 2}: missing required fields`);
        continue;
      }

      if (!validFuelTypes.includes(fuel_type.toLowerCase())) {
        errors.push(`Row ${i + 2}: invalid fuel_type "${fuel_type}"`);
        continue;
      }

      const price = parseFloat(price_per_litre);
      if (isNaN(price) || price <= 0) {
        errors.push(`Row ${i + 2}: invalid price "${price_per_litre}"`);
        continue;
      }

      await db.execute(sql`
        INSERT INTO fuel_prices (state, city, fuel_type, price_per_litre, updated_at)
        VALUES (${state.trim()}, ${city.trim()}, ${fuel_type.toLowerCase()}, ${String(price)}, now())
        ON CONFLICT (state, city, fuel_type)
        DO UPDATE SET price_per_litre = EXCLUDED.price_per_litre, updated_at = now()
      `);
      upserted++;
    }

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "BULK_UPLOAD_FUEL_PRICES",
      targetTable: "fuel_prices",
      details: { upserted, errors: errors.length, total: records.length },
    });

    return Response.json({ upserted, errors, total: records.length });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/fuel-prices/csv]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
