import {
  boolean,
  integer,
  json,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "login",
  "register",
  "password_reset",
]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const fuelTypeEnum = pgEnum("fuel_type", ["petrol", "e20", "diesel"]);

export const tripTypeEnum = pgEnum("trip_type", ["vehicle", "travel"]);

export const routePreferenceEnum = pgEnum("route_preference", [
  "toll",
  "no_toll",
]);

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  mobile: text("mobile").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  locationConsent: boolean("location_consent").notNull().default(false),
  role: text("role").notNull().default("user"), // "user" | "admin"
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── OTP Verifications ───────────────────────────────────────────────────────

export const otpVerifications = pgTable("otp_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  mobile: text("mobile").notNull(),
  code: text("code").notNull(),
  purpose: otpPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Fuel Prices ─────────────────────────────────────────────────────────────

export const fuelPrices = pgTable("fuel_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  fuelType: text("fuel_type").notNull(), // "petrol" | "e20" | "diesel"
  pricePerLitre: numeric("price_per_litre", { precision: 8, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Travel Providers ────────────────────────────────────────────────────────

export const travelProviders = pgTable("travel_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  perKmRate: numeric("per_km_rate", { precision: 8, scale: 2 }).notNull(),
  deepLinkTemplate: text("deep_link_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Trips ───────────────────────────────────────────────────────────────────

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "vehicle" | "travel"
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
  fuelCost: numeric("fuel_cost", { precision: 10, scale: 2 }),
  tollCost: numeric("toll_cost", { precision: 10, scale: 2 }),
  routePreference: text("route_preference"), // "toll" | "no_toll"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Toll Plazas ─────────────────────────────────────────────────────────────

export const tollPlazas = pgTable("toll_plazas", {
  id: uuid("id").primaryKey().defaultRandom(),
  highwayName: text("highway_name").notNull(),
  plazaName: text("plaza_name").notNull(),
  state: text("state").notNull(),
  rateLight: numeric("rate_light", { precision: 8, scale: 2 }).notNull(),
  rateMedium: numeric("rate_medium", { precision: 8, scale: 2 }),
  rateHeavy: numeric("rate_heavy", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Admin Audit Logs ────────────────────────────────────────────────────────

export const adminLogs = pgTable("admin_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetTable: text("target_table"),
  targetId: text("target_id"),
  details: json("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
