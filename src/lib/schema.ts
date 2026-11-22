import {
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  json,
  numeric,
  pgEnum,
  primaryKey,
  pgTable,
  smallint,
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
  
  // Profile Additions
  profilePhoto: text("profile_photo"),
  jobTitle: text("job_title"),
  employeeId: text("employee_id"),
  
  // Security Additions
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  recoveryEmail: text("recovery_email"),
  recoveryPhone: text("recovery_phone"),
  
  locationConsent: boolean("location_consent").notNull().default(false),
  role: text("role").notNull().default("user"), // "user" | "admin"
  isActive: boolean("is_active").notNull().default(true),
  suspensionReason: text("suspension_reason"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Customer Tags & Notes ───────────────────────────────────────────────────

export const customerNotes = pgTable("customer_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerTags = pgTable("customer_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => users.id),
  tag: text("tag").notNull(),
  addedBy: uuid("added_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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


// --- Active Sessions ---------------------------------------------------------
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  device: text("device"),
  location: text("location"),
  ipAddress: text("ip_address"),
  isActive: boolean("is_active").notNull().default(true),
  loginTime: timestamp("login_time", { withTimezone: true }).notNull().defaultNow(),
  lastActive: timestamp("last_active", { withTimezone: true }).notNull().defaultNow(),
});

// --- Login History -----------------------------------------------------------
export const loginHistory = pgTable("login_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  ipAddress: text("ip_address"),
  device: text("device"),
  status: text("status").notNull(), // "success" | "failed"
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

// --- Backup Codes ------------------------------------------------------------
export const backupCodes = pgTable("backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  code: text("code").notNull(),
  used: boolean("used").notNull().default(false),
});


// ═══════════════════════════════════════════════════════════════════════════
// Fare comparison (Uber · Ola · Rapido)
//
// The spec these follow is written against SQLite, so BLOB becomes bytea,
// AUTOINCREMENT becomes bigserial and epoch integers become timestamptz.
// Following the house convention, status-like columns are plain text
// documented by a pgEnum and constrained with zod at the API boundary.
// ═══════════════════════════════════════════════════════════════════════════

/** Documentation only; the columns below store text. */
export const providerIdEnum = pgEnum("fare_provider", ["uber", "ola", "rapido"]);
export const sessionStatusEnum = pgEnum("provider_session_status", [
  "connected",
  "degraded",
  "expired",
  "disconnected",
  "open",
]);

/** Postgres bytea, which Drizzle has no first-class column type for. */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// --- Provider Sessions -------------------------------------------------------
// One encrypted row per provider. The plaintext is
// { storageState, authHeaders, deviceProfileId } sealed with AES-256-GCM using
// the provider name as additional authenticated data, so a blob cannot be
// moved between providers. These are third-party account credentials —
// functionally passwords.
export const providerSessions = pgTable("provider_session", {
  provider: text("provider").primaryKey(), // "uber" | "ola" | "rapido"
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  ciphertext: bytea("ciphertext").notNull(),
  deviceProfileId: text("device_profile_id"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastFailAt: timestamp("last_fail_at", { withTimezone: true }),
  status: text("status").notNull().default("disconnected"),
  failStreak: integer("fail_streak").notNull().default(0),
});

// --- Fare Cache --------------------------------------------------------------
// Keyed on a quantised coordinate grid so nearby pickups share a row. Never
// evicted while a provider is unhealthy — that is what makes serving
// stale-but-labelled data instead of an error work for free.
export const fareCache = pgTable(
  "fare_cache",
  {
    routeKey: text("route_key").notNull(),
    provider: text("provider").notNull(),
    options: json("options").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.routeKey, t.provider] }),
    index("fare_cache_provider_fetched_idx").on(t.provider, t.fetchedAt),
  ],
);

// --- Rate Ledger -------------------------------------------------------------
// The daily budget brake. One row per provider per day.
export const rateLedger = pgTable(
  "rate_ledger",
  {
    provider: text("provider").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.day] })],
);

// --- Raw Payloads ------------------------------------------------------------
// Every provider response, success and failure, as a capped ring buffer.
// These are undocumented APIs that change without notice; this is what makes
// a breakage a five-minute fix instead of a re-investigation.
export const rawPayloads = pgTable(
  "raw_payload",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    routeKey: text("route_key"),
    status: text("status"),
    parsedCount: integer("parsed_count"),
    parseError: text("parse_error"),
    body: text("body").notNull(),
  },
  (t) => [
    index("raw_payload_provider_captured_idx").on(t.provider, t.capturedAt),
    index("raw_payload_provider_error_idx").on(t.provider, t.parseError),
  ],
);

// --- Ride Observations -------------------------------------------------------
// Every payload exploded into its individual ride rows, written in the same
// transaction as the payload. This is what turns the console from a list of
// blobs into price history, cross-provider comparison and the earliest
// possible warning that a parser broke.
export const rideObservations = pgTable(
  "ride_observation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    payloadId: integer("payload_id")
      .notNull()
      .references(() => rawPayloads.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    routeKey: text("route_key"),
    rideName: text("ride_name").notNull(), // "Uber Go AC", "Mini", "Bike Direct"
    category: text("category"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    priceLow: numeric("price_low", { precision: 10, scale: 2 }),
    priceHigh: numeric("price_high", { precision: 10, scale: 2 }),
    etaMin: integer("eta_min"),
    currency: text("currency").notNull().default("INR"),
  },
  (t) => [
    index("idx_ride_lookup").on(t.provider, t.rideName, t.observedAt),
    index("idx_ride_route").on(t.routeKey, t.observedAt),
  ],
);


// ═══════════════════════════════════════════════════════════════════════════
// Safe routing — crowd-sourced pothole reports
//
// Riders drop a pin; the server snaps it to the nearest road. A pin within a
// few metres of an active report confirms it instead of duplicating it, and
// confirmations raise its effective severity. Active reports add a routing
// penalty to the safest route and appear on every route's risk breakdown.
// ═══════════════════════════════════════════════════════════════════════════

// --- Pothole Reports ---------------------------------------------------------
export const potholeReports = pgTable(
  "pothole_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lat: doublePrecision("lat").notNull(), // snapped to the road
    lng: doublePrecision("lng").notNull(),
    rawLat: doublePrecision("raw_lat").notNull(), // where the rider tapped
    rawLng: doublePrecision("raw_lng").notNull(),
    severity: smallint("severity").notNull(), // 1 minor · 2 bad · 3 dangerous
    note: text("note"),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    confirmations: integer("confirmations").notNull().default(1),
    status: text("status").notNull().default("active"), // "active" | "resolved"
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pothole_report_status_loc_idx").on(t.status, t.lat, t.lng),
    index("pothole_report_reporter_idx").on(t.reportedBy, t.createdAt),
  ],
);

// --- Pothole Confirmations ---------------------------------------------------
// One row per rider per report (the reporter's own row included), so a rider
// cannot inflate a report and the daily report limit is a single count.
export const potholeConfirmations = pgTable(
  "pothole_confirmation",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => potholeReports.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.reportId, t.userId] }),
    index("pothole_confirmation_user_idx").on(t.userId, t.createdAt),
  ],
);
