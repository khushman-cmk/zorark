/**
 * Seed script — creates the first admin user.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Set these in .env.local before running:
 *   ADMIN_EMAIL=admin@zorark.com
 *   ADMIN_PASSWORD=YourStrongPasswordHere
 *   ADMIN_NAME=Zorark Admin
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Zorark Admin";
  const mobile = process.env.ADMIN_MOBILE ?? `admin-${Date.now()}`;
  const dbUrl =
    process.env.DATABASE_URL?.trim() ??
    "postgres://postgres:postgres@localhost:5432/postgres";

  if (!email || !password) {
    console.error(
      "❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local"
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // Ensure the users table exists with all required columns.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        mobile text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        location_consent boolean NOT NULL DEFAULT false,
        role text NOT NULL DEFAULT 'user',
        is_active boolean NOT NULL DEFAULT true,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Add columns if they don't exist yet (idempotent).
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, mobile, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin')
       ON CONFLICT (email) DO UPDATE
         SET role = 'admin',
             is_active = true,
             updated_at = now()
       RETURNING id, email, role`,
      [name, email, mobile, passwordHash]
    );

    console.log("✅  Admin user seeded:");
    console.table(result.rows[0]);
  } catch (err) {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
