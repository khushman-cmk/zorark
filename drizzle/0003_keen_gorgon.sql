-- Safe routing: crowd-sourced pothole reports.
--
-- Hand-trimmed: drizzle-kit also emitted the fare-comparison tables
-- (fare_cache, provider_session, rate_ledger, raw_payload, ride_observation
-- and their enums), which were added to schema.ts without a migration and are
-- created at runtime by ensureDatabaseSetup() in src/lib/db-init.ts. Creating
-- them here would fail on any database where they already exist. The 0003
-- snapshot records them, so later `db:generate` runs will not emit them again.
CREATE TABLE IF NOT EXISTS "pothole_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"raw_lat" double precision NOT NULL,
	"raw_lng" double precision NOT NULL,
	"severity" smallint NOT NULL,
	"note" text,
	"reported_by" uuid,
	"confirmations" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pothole_report_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pothole_confirmation" (
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pothole_confirmation_report_id_user_id_pk" PRIMARY KEY("report_id","user_id"),
	CONSTRAINT "pothole_confirmation_report_id_pothole_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."pothole_report"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "pothole_confirmation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pothole_confirmation_user_idx" ON "pothole_confirmation" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pothole_report_status_loc_idx" ON "pothole_report" USING btree ("status","lat","lng");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pothole_report_reporter_idx" ON "pothole_report" USING btree ("reported_by","created_at");
