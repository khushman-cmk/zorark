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

      // ── Fare comparison (Uber · Ola · Rapido) ──────────────────────────────
      // Sealed third-party sessions. iv/tag/ciphertext are AES-256-GCM parts;
      // the provider name is the additional authenticated data, so a blob
      // cannot be moved between providers.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS provider_session (
          provider text PRIMARY KEY,
          iv bytea NOT NULL,
          tag bytea NOT NULL,
          ciphertext bytea NOT NULL,
          device_profile_id text,
          captured_at timestamptz NOT NULL DEFAULT now(),
          refreshed_at timestamptz,
          last_ok_at timestamptz,
          last_fail_at timestamptz,
          status text NOT NULL DEFAULT 'disconnected',
          fail_streak integer NOT NULL DEFAULT 0
        )
      `);

      // Keyed on a quantised coordinate grid so nearby pickups share a row.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS fare_cache (
          route_key text NOT NULL,
          provider text NOT NULL,
          options json NOT NULL,
          fetched_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (route_key, provider)
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS fare_cache_provider_fetched_idx
          ON fare_cache (provider, fetched_at)
      `);

      // The daily budget brake.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS rate_ledger (
          provider text NOT NULL,
          day date NOT NULL,
          count integer NOT NULL DEFAULT 0,
          PRIMARY KEY (provider, day)
        )
      `);

      // Every provider response, kept as a capped ring buffer.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS raw_payload (
          id bigserial PRIMARY KEY,
          provider text NOT NULL,
          captured_at timestamptz NOT NULL DEFAULT now(),
          route_key text,
          status text,
          parsed_count integer,
          parse_error text,
          body text NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS raw_payload_provider_captured_idx
          ON raw_payload (provider, captured_at DESC)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS raw_payload_provider_error_idx
          ON raw_payload (provider, parse_error)
      `);

      // Each payload exploded into its individual rides, for price history
      // and parser-regression detection.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ride_observation (
          id bigserial PRIMARY KEY,
          payload_id bigint NOT NULL REFERENCES raw_payload(id) ON DELETE CASCADE,
          provider text NOT NULL,
          observed_at timestamptz NOT NULL DEFAULT now(),
          route_key text,
          ride_name text NOT NULL,
          category text,
          price numeric(10,2) NOT NULL,
          price_low numeric(10,2),
          price_high numeric(10,2),
          eta_min integer,
          currency text NOT NULL DEFAULT 'INR'
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_ride_lookup
          ON ride_observation (provider, ride_name, observed_at DESC)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_ride_route
          ON ride_observation (route_key, observed_at DESC)
      `);

      // ── Safe routing: crowd pothole reports ──────────────────────────────
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pothole_report (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          lat double precision NOT NULL,
          lng double precision NOT NULL,
          raw_lat double precision NOT NULL,
          raw_lng double precision NOT NULL,
          severity smallint NOT NULL,
          note text,
          reported_by uuid REFERENCES users(id) ON DELETE SET NULL,
          confirmations integer NOT NULL DEFAULT 1,
          status text NOT NULL DEFAULT 'active',
          last_confirmed_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pothole_report_status_loc_idx
          ON pothole_report (status, lat, lng)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pothole_report_reporter_idx
          ON pothole_report (reported_by, created_at)
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pothole_confirmation (
          report_id uuid NOT NULL REFERENCES pothole_report(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (report_id, user_id)
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS pothole_confirmation_user_idx
          ON pothole_confirmation (user_id, created_at)
      `);
    })();
  }

  return setupPromise;
}
