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
 * - Weights, areas and money use `numeric({ mode: "number" })` so rows come
 *   back as numbers, matching the domain types without mapping.
 * - Only STORED unions become `pgEnum`. Derived values (AnimalStatus,
 *   StockingRateClass) are computed in the domain layer and never persisted.
 * - Every herd table is scoped by `farmId`; child tables of an animal inherit
 *   the farm through `animalId`. Farm-scoped FKs cascade so deleting a farm
 *   removes the whole tenant.
 * - Animals use a surrogate `id` (app-generated uuid); the ear tag is unique
 *   per farm only. Clients keep addressing animals by ear tag.
 */
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

/** Role of a user inside a farm. */
export const farmRoleEnum = pgEnum("farm_role", ["owner", "member"]);

/** Manejo session lifecycle. */
export const manejoSessionStatusEnum = pgEnum("manejo_session_status", [
  "open",
  "closed",
]);

/**
 * What a manejo session does to each animal at the chute. Health and weighing
 * only record history; transfer, sale and entry also move the herd (lot, active
 * flag, registration) and feed the financial ledger.
 */
export const manejoKindEnum = pgEnum("manejo_kind", [
  "health",
  "weighing",
  "transfer",
  "sale",
  "entry",
]);

/** Outcome of one animal inside a manejo session. */
export const manejoOutcomeEnum = pgEnum("manejo_outcome", [
  "pending",
  "done",
  "skipped",
]);

/** Category of a farm expense. */
export const expenseCategoryEnum = pgEnum("expense_category", [
  "nutrition",
  "pasture",
  "labor",
  "health",
  "breeding",
  "admin",
  "other",
]);

/** Why an animal left the active herd. */
export const inactiveReasonEnum = pgEnum("inactive_reason", [
  "sale",
  "death",
  "loss",
  "other",
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
  /** Farm HQ (sede) coordinates — map center before any invernada is drawn. */
  headquartersLat: numeric("headquarters_lat", { mode: "number" }),
  headquartersLng: numeric("headquarters_lng", { mode: "number" }),
});

/** Membership of a user in a farm (a user can join many farms). */
export const farmUsers = pgTable(
  "farm_users",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: farmRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.farmId, t.userId] }),
    index("farm_users_user_id_idx").on(t.userId),
  ]
);

/**
 * Logical group of cattle. A lot moves between physical invernadas over time;
 * animal.lotId continues to express membership in this group.
 *
 * grass/hectares/boundary are legacy columns kept nullable for a later,
 * separately deployable cleanup migration. New code never reads or writes them.
 */
export const lots = pgTable("lots", {
  id: text("id").primaryKey(),
  farmId: integer("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  needsReview: boolean("needs_review").notNull().default(false),
  grass: text("grass"),
  hectares: numeric("hectares", { mode: "number" }),
  boundary: jsonb("boundary").$type<[number, number][]>(),
});

/** Fixed physical pasture/paddock of a farm. */
export const invernadas = pgTable(
  "invernadas",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Farm-local fixed number/code (for example "03" or "3A"). */
    code: text("code").notNull(),
    name: text("name"),
    grass: text("grass").notNull(),
    hectares: numeric("hectares", { mode: "number" }).notNull(),
    /** Open ring of [lng, lat] pairs; the first point is not repeated. */
    boundary: jsonb("boundary").$type<[number, number][]>(),
  },
  (t) => [
    uniqueIndex("invernadas_farm_id_code_unique").on(t.farmId, t.code),
    index("invernadas_farm_id_idx").on(t.farmId),
  ]
);

/** Dated occupancy of an invernada by one logical lot. */
export const lotPlacements = pgTable(
  "lot_placements",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id),
    invernadaId: text("invernada_id")
      .notNull()
      .references(() => invernadas.id),
    /** Inclusive start of this placement. */
    startedOn: date("started_on").notNull(),
    /** Exclusive end; null means this is the lot's current placement. */
    endedOn: date("ended_on"),
    notes: text("notes"),
    /** True only for the placement synthesized during the data migration. */
    baseline: boolean("baseline").notNull().default(false),
  },
  (t) => [
    uniqueIndex("lot_placements_one_open_per_lot_unique")
      .on(t.lotId)
      .where(sql`${t.endedOn} is null`),
    index("lot_placements_farm_id_idx").on(t.farmId),
    index("lot_placements_lot_id_started_on_idx").on(t.lotId, t.startedOn),
    index("lot_placements_invernada_id_idx").on(t.invernadaId),
    check(
      "lot_placements_valid_period_check",
      sql`${t.endedOn} is null or ${t.endedOn} > ${t.startedOn}`
    ),
  ]
);

/** Registered breeds of a farm. */
export const breeds = pgTable(
  "breeds",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.name] })]
);

/**
 * User-defined herd category, mapped to a canonical base category. Domain
 * rules (sex, reproduction, indicators) always run on the base; the custom
 * name is presentation.
 */
export const customCategories = pgTable(
  "custom_categories",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    baseCategory: categoryEnum("base_category").notNull(),
  },
  (t) => [uniqueIndex("custom_categories_farm_id_name_unique").on(t.farmId, t.name)]
);

/** Herd animal. Ear tags are unique per farm, not globally. */
export const animals = pgTable(
  "animals",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    earTag: text("ear_tag").notNull(),
    category: categoryEnum("category").notNull(),
    breed: text("breed").notNull(),
    sex: sexEnum("sex").notNull(),
    birthDate: date("birth_date").notNull(),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id),
    /** Optional user-defined category; `category` always holds its base. */
    customCategoryId: text("custom_category_id").references(
      () => customCategories.id,
      { onDelete: "set null" }
    ),
    active: boolean("active").notNull().default(true),
    /** Why the animal left the herd; null while active. */
    inactiveReason: inactiveReasonEnum("inactive_reason"),
    /** The day it left (morte, perda, venda); null while active. */
    inactiveDate: date("inactive_date"),
    /** What happened, in the farmer's words: "encontrada morta no pasto". */
    inactiveNotes: text("inactive_notes"),
  },
  (t) => [
    uniqueIndex("animals_farm_id_ear_tag_unique").on(t.farmId, t.earTag),
    index("animals_farm_id_idx").on(t.farmId),
  ]
);

/** Weighing record of an animal (no id in the domain; use serial). */
export const weighings = pgTable(
  "weighings",
  {
    id: serial("id").primaryKey(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weightKg: numeric("weight_kg", { mode: "number" }).notNull(),
  },
  (t) => [index("weighings_animal_id_date_idx").on(t.animalId, t.date)]
);

/** Health treatment applied or scheduled for an animal. */
export const treatments = pgTable(
  "treatments",
  {
    id: text("id").primaryKey(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    type: treatmentTypeEnum("type").notNull(),
    name: text("name").notNull(),
    date: date("date").notNull(),
    status: treatmentStatusEnum("status").notNull(),
    withdrawalDays: integer("withdrawal_days").notNull(),
    dose: text("dose"),
    responsible: text("responsible"),
    costBrl: numeric("cost_brl", { mode: "number" }),
    notes: text("notes"),
  },
  (t) => [index("treatments_animal_id_date_idx").on(t.animalId, t.date)]
);

/** Breeding (timed AI or natural mating) of a female. */
export const breedings = pgTable("breedings", {
  id: text("id").primaryKey(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: breedingTypeEnum("type").notNull(),
  /** Plain text: the bull may be external / not registered in the herd. */
  bullEarTag: text("bull_ear_tag").notNull(),
});

/** Pregnancy diagnosis linked to a breeding (one per breeding). */
export const pregnancyDiagnoses = pgTable("pregnancy_diagnoses", {
  breedingId: text("breeding_id")
    .primaryKey()
    .references(() => breedings.id, { onDelete: "cascade" }),
  result: diagnosisResultEnum("result").notNull(),
  date: date("date").notNull(),
});

/** Calving record of a female (the mother). */
export const calvings = pgTable("calvings", {
  id: serial("id").primaryKey(),
  animalId: text("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  /** Plain text: the calf may not be registered (yet) as an animal. */
  calfEarTag: text("calf_ear_tag").notNull(),
});

/**
 * Animal movement (purchase, sale or transfer) — LEGACY, read-only.
 *
 * New movements are manejo sessions of kind transfer/sale/entry, and the
 * ledger derives from them (lib/domain/movements.ts). These rows predate that
 * model: their head count and category were typed by hand and no animal is
 * linked, hence both columns are nullable for anything written since.
 */
export const movements = pgTable("movements", {
  id: text("id").primaryKey(),
  farmId: integer("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  type: movementTypeEnum("type").notNull(),
  date: date("date").notNull(),
  quantity: integer("quantity"),
  category: categoryEnum("category"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  /** Total value in BRL; present for purchase/sale, null for transfer. */
  amountBrl: numeric("amount_brl", { mode: "number" }),
  notes: text("notes"),
});

/** Farm expense (cost outside the sanitary treatments). */
export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    category: expenseCategoryEnum("category").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    notes: text("notes"),
  },
  (t) => [index("expenses_farm_id_date_idx").on(t.farmId, t.date)]
);

/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
  id: text("id").primaryKey(),
  farmId: integer("farm_id")
    .notNull()
    .references(() => farm.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: treatmentTypeEnum("type").notNull(),
  intervalMonths: integer("interval_months").notNull(),
  withdrawalDays: integer("withdrawal_days").notNull(),
  mandatory: boolean("mandatory").notNull(),
});

/**
 * Manejo session: a curral working session. The optional sanitary plan
 * (ManejoTreatmentPlan) is flattened into nullable `plan*` columns; the plan
 * exists when `planType` is set.
 */
export const manejoSessions = pgTable(
  "manejo_sessions",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: date("date").notNull(),
    status: manejoSessionStatusEnum("status").notNull().default("open"),
    kind: manejoKindEnum("kind").notNull().default("health"),
    weighing: boolean("weighing").notNull(),
    notes: text("notes"),
    /** Lot every animal lands in — transfer and entry sessions. */
    destinationLotId: text("destination_lot_id").references(() => lots.id),
    /** Buyer (sale) or seller (entry), free text: they are outside the farm. */
    counterparty: text("counterparty"),
    /** Sale priced per arroba: R$/@ applied to each animal's chute weight. */
    pricePerArroba: numeric("price_per_arroba", { mode: "number" }),
    /** Rendimento de carcaça (%) pricing the arrobas of a venda per arroba. */
    carcassYieldPct: numeric("carcass_yield_pct", { mode: "number" }),
    /** Closed price in BRL: a sale sold as one lot, or an entry's purchase total. */
    totalAmountBrl: numeric("total_amount_brl", { mode: "number" }),
    planType: treatmentTypeEnum("plan_type"),
    planName: text("plan_name"),
    planWithdrawalDays: integer("plan_withdrawal_days"),
    planDose: text("plan_dose"),
    planResponsible: text("plan_responsible"),
    planCostBrl: numeric("plan_cost_brl", { mode: "number" }),
    planNextDate: date("plan_next_date"),
    planNotes: text("plan_notes"),
  },
  (t) => [index("manejo_sessions_farm_id_idx").on(t.farmId)]
);

/**
 * Per-animal state of a manejo session (the chute line). The effect refs
 * (treatment, booster, weighing) support the undo of a pass; they null out if
 * the effect row is deleted elsewhere.
 */
export const manejoSessionAnimals = pgTable(
  "manejo_session_animals",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => manejoSessions.id, { onDelete: "cascade" }),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    /** 0-based position in the chute line (the session's animal order). */
    position: integer("position").notNull(),
    outcome: manejoOutcomeEnum("outcome").notNull().default("pending"),
    weightKg: numeric("weight_kg", { mode: "number" }),
    notes: text("notes"),
    /** What this animal was worth in a priced sale (R$/@ × its chute weight). */
    amountBrl: numeric("amount_brl", { mode: "number" }),
    /** Lot the animal came from, so undoing a transfer pass can restore it. */
    previousLotId: text("previous_lot_id").references(() => lots.id),
    /** True when an entry session registered this animal — undo deletes it. */
    createdAnimal: boolean("created_animal").notNull().default(false),
    treatmentId: text("treatment_id").references(() => treatments.id, {
      onDelete: "set null",
    }),
    boosterId: text("booster_id").references(() => treatments.id, {
      onDelete: "set null",
    }),
    weighingId: integer("weighing_id").references(() => weighings.id, {
      onDelete: "set null",
    }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.animalId] })]
);

/* -------------------------------------------------------------------------- */
/* Inferred row types                                                         */
/* -------------------------------------------------------------------------- */

export type FarmRow = typeof farm.$inferSelect;
export type FarmUserRow = typeof farmUsers.$inferSelect;
export type LotRow = typeof lots.$inferSelect;
export type InvernadaRow = typeof invernadas.$inferSelect;
export type LotPlacementRow = typeof lotPlacements.$inferSelect;
export type BreedRow = typeof breeds.$inferSelect;
export type AnimalRow = typeof animals.$inferSelect;
export type WeighingRow = typeof weighings.$inferSelect;
export type TreatmentRow = typeof treatments.$inferSelect;
export type BreedingRow = typeof breedings.$inferSelect;
export type PregnancyDiagnosisRow = typeof pregnancyDiagnoses.$inferSelect;
export type CalvingRow = typeof calvings.$inferSelect;
export type MovementRow = typeof movements.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
export type HealthProtocolRow = typeof healthProtocols.$inferSelect;
export type ManejoSessionRow = typeof manejoSessions.$inferSelect;
export type ManejoSessionAnimalRow = typeof manejoSessionAnimals.$inferSelect;

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
