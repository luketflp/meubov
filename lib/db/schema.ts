/**
 * Drizzle schema for MeuBov.
 *
 * Faithfully maps the domain contracts in `lib/types.ts` to Postgres tables.
 * Column keys are written in camelCase; the `snake_case` casing option (set in
 * both `drizzle.config.ts` and the client) converts them to snake_case in the
 * database.
 *
 * Conventions:
 * - Dates travel as ISO strings "YYYY-MM-DD" and use the Postgres `date` type.
 * - Weights and areas use `numeric` to preserve decimal precision.
 * - Only STORED unions become `pgEnum`. Derived values (AnimalStatus,
 *   StockingRateClass) are computed in the domain layer and never persisted.
 */
import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums (stored unions only)                                                 */
/* -------------------------------------------------------------------------- */

/** Animal category in the beef herd. */
export const categoryEnum = pgEnum("category", [
  "calf",
  "heifer",
  "steer",
  "cow",
  "bull",
]);

/** Animal sex. */
export const sexEnum = pgEnum("sex", ["male", "female"]);

/** Health treatment type. */
export const treatmentTypeEnum = pgEnum("treatment_type", [
  "vaccine",
  "deworming",
  "medication",
  "exam",
]);

/** Status derived from a health treatment (persisted on the record). */
export const treatmentStatusEnum = pgEnum("treatment_status", [
  "scheduled",
  "overdue",
  "done",
]);

/** Breeding type. */
export const breedingTypeEnum = pgEnum("breeding_type", [
  "timedAI",
  "naturalMating",
]);

/** Pregnancy diagnosis result. */
export const diagnosisResultEnum = pgEnum("diagnosis_result", [
  "pregnant",
  "open",
  "pending",
]);

/** Animal movement type. */
export const movementTypeEnum = pgEnum("movement_type", [
  "purchase",
  "sale",
  "transfer",
]);

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

/** Farm registration data. */
export const farm = pgTable("farm", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  municipality: text("municipality").notNull(),
  stateRegistration: text("state_registration").notNull(),
  manager: text("manager").notNull(),
});

/** Lot (paddock) of the farm. */
export const lots = pgTable("lots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  grass: text("grass").notNull(),
  hectares: numeric("hectares").notNull(),
});

/** Registered breeds. */
export const breeds = pgTable("breeds", {
  name: text("name").primaryKey(),
});

/** Herd animal. */
export const animals = pgTable("animals", {
  earTag: text("ear_tag").primaryKey(),
  category: categoryEnum("category").notNull(),
  breed: text("breed").notNull(),
  sex: sexEnum("sex").notNull(),
  birthDate: date("birth_date").notNull(),
  lotId: text("lot_id")
    .notNull()
    .references(() => lots.id),
  active: boolean("active").notNull().default(true),
});

/** Weighing record of an animal (no id in the domain; use serial). */
export const weighings = pgTable("weighings", {
  id: serial("id").primaryKey(),
  animalEarTag: text("animal_ear_tag")
    .notNull()
    .references(() => animals.earTag),
  date: date("date").notNull(),
  weightKg: numeric("weight_kg").notNull(),
});

/** Health treatment applied or scheduled for an animal. */
export const treatments = pgTable("treatments", {
  id: text("id").primaryKey(),
  animalEarTag: text("animal_ear_tag")
    .notNull()
    .references(() => animals.earTag),
  type: treatmentTypeEnum("type").notNull(),
  name: text("name").notNull(),
  date: date("date").notNull(),
  status: treatmentStatusEnum("status").notNull(),
  withdrawalDays: integer("withdrawal_days").notNull(),
  notes: text("notes"),
});

/** Breeding (timed AI or natural mating) of a female. */
export const breedings = pgTable("breedings", {
  id: text("id").primaryKey(),
  animalEarTag: text("animal_ear_tag")
    .notNull()
    .references(() => animals.earTag),
  date: date("date").notNull(),
  type: breedingTypeEnum("type").notNull(),
  bullEarTag: text("bull_ear_tag").notNull(),
});

/** Pregnancy diagnosis linked to a breeding (one per breeding). */
export const pregnancyDiagnoses = pgTable("pregnancy_diagnoses", {
  breedingId: text("breeding_id")
    .primaryKey()
    .references(() => breedings.id),
  result: diagnosisResultEnum("result").notNull(),
  date: date("date").notNull(),
});

/** Calving record of a female (the mother). */
export const calvings = pgTable("calvings", {
  id: serial("id").primaryKey(),
  animalEarTag: text("animal_ear_tag")
    .notNull()
    .references(() => animals.earTag),
  date: date("date").notNull(),
  calfEarTag: text("calf_ear_tag").notNull(),
});

/** Animal movement (purchase, sale or transfer). */
export const movements = pgTable("movements", {
  id: text("id").primaryKey(),
  type: movementTypeEnum("type").notNull(),
  date: date("date").notNull(),
  quantity: integer("quantity").notNull(),
  category: categoryEnum("category").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  notes: text("notes"),
});

/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: treatmentTypeEnum("type").notNull(),
  intervalMonths: integer("interval_months").notNull(),
  withdrawalDays: integer("withdrawal_days").notNull(),
  mandatory: boolean("mandatory").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Inferred row types                                                         */
/* -------------------------------------------------------------------------- */

export type FarmRow = typeof farm.$inferSelect;
export type LotRow = typeof lots.$inferSelect;
export type BreedRow = typeof breeds.$inferSelect;
export type AnimalRow = typeof animals.$inferSelect;
export type WeighingRow = typeof weighings.$inferSelect;
export type TreatmentRow = typeof treatments.$inferSelect;
export type BreedingRow = typeof breedings.$inferSelect;
export type PregnancyDiagnosisRow = typeof pregnancyDiagnoses.$inferSelect;
export type CalvingRow = typeof calvings.$inferSelect;
export type MovementRow = typeof movements.$inferSelect;
export type HealthProtocolRow = typeof healthProtocols.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Auth (Better Auth)                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Core Better Auth tables (user/session/account/verification). Field shapes
 * mirror Better Auth's built-in core schema exactly (getAuthTables in
 * @better-auth/core). Table keys are SINGULAR, matching `usePlural: false` in
 * lib/auth/index.ts. Column keys are camelCase; the global `casing: "snake_case"`
 * (db client + drizzle.config) emits snake_case columns, so no CLI is needed to
 * keep them in sync. `id` is a text primary key because Better Auth generates
 * string ids.
 */

/** Authenticated user. */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Active login session for a user. */
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/** Credential / OAuth account linked to a user (email-password or Google). */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Short-lived verification token (email verification, password reset, etc.). */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type VerificationRow = typeof verification.$inferSelect;
