import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/schema";

const fallbackUrl = "postgres://postgres:postgres@localhost:5432/postgres";
const configuredUrl = process.env.DATABASE_URL?.trim();

const pool = new Pool({
  connectionString: configuredUrl && configuredUrl.length > 0 ? configuredUrl : fallbackUrl,
});

export const db = drizzle(pool, { schema });
