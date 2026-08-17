import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

let setupPromise: Promise<void> | null = null;

export function ensureDatabaseSetup() {
  if (!setupPromise) {
    setupPromise = (async () => {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

      // ── Users ──────────────────────────────────────────────────────────────
      await db.execute(sql`
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

      // Add new columns to users if they don't exist yet (idempotent).
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);

      // ── OTP Verifications ─────────────────────────────────────────────────
      await db.execute(sql`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_purpose') THEN
          CREATE TYPE otp_purpose AS ENUM ('login', 'register', 'password_reset');
        END IF;
      END $$`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS otp_verifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          mobile text NOT NULL,
          code text NOT NULL,
          purpose otp_purpose NOT NULL,
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      // ── Fuel Prices ───────────────────────────────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS fuel_prices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          state text NOT NULL,
          city text NOT NULL,
          fuel_type text NOT NULL,
          price_per_litre numeric(8,2) NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      // Unique index so CSV upsert can do ON CONFLICT (state, city, fuel_type)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS fuel_prices_state_city_type_idx
        ON fuel_prices (state, city, fuel_type)
      `);

      // ── Travel Providers ──────────────────────────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS travel_providers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          vehicle_type text NOT NULL,
          base_fare numeric(10,2) NOT NULL,
          per_km_rate numeric(8,2) NOT NULL,
          deep_link_template text NOT NULL,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      // ── Trips ─────────────────────────────────────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS trips (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id),
          type text NOT NULL,
          origin text NOT NULL,
          destination text NOT NULL,
          distance_km numeric(10,2),
          fuel_cost numeric(10,2),
          toll_cost numeric(10,2),
          route_preference text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      // ── Toll Plazas ───────────────────────────────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS toll_plazas (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          highway_name text NOT NULL,
          plaza_name text NOT NULL,
          state text NOT NULL,
          rate_light numeric(8,2) NOT NULL,
          rate_medium numeric(8,2),
          rate_heavy numeric(8,2),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      // ── Admin Audit Logs ──────────────────────────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id uuid NOT NULL REFERENCES users(id),
          action text NOT NULL,
          target_table text,
          target_id text,
          details jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    })();
  }

  return setupPromise;
}
