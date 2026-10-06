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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Permissions } from "@/lib/domain/permissions";
import type { AccountGroup, CsvMapping, ExpenseCategory } from "@/lib/types";

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
  "insemination",
  "ultrasound",
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

/** Preset a member's levels were picked from (lib/domain/permissions.ts). */
export const farmMemberPresetEnum = pgEnum("farm_member_preset", [
  "gerente",
  "vaqueiro",
  "consultor",
  "personalizado",
]);

/** Lifecycle of a convite. Expired is derived from expires_at, never stored. */
export const farmInviteStatusEnum = pgEnum("farm_invite_status", [
  "pending",
  "accepted",
  "declined",
  "canceled",
]);

/** Manejo session lifecycle. */
export const manejoSessionStatusEnum = pgEnum("manejo_session_status", [
  "open",
  "closed",
]);

/**
 * What a manejo session does to each animal at the chute. Health and weighing
 * only record history; transfer, sale and entry also move the herd (lot, active
 * flag, registration) and feed the financial ledger. Insemination records an
 * IATF breeding per cow, each taking one dose of a semen bull.
 */
export const manejoKindEnum = pgEnum("manejo_kind", [
  "health",
  "weighing",
  "transfer",
  "sale",
  "entry",
  "insemination",
]);

/** Outcome of one animal inside a manejo session. */
export const manejoOutcomeEnum = pgEnum("manejo_outcome", [
  "pending",
  "done",
  "skipped",
  "rejected",
  "held",
]);

/** What the money of a lançamento is (lib/types.ts EntryKind). */
export const entryKindEnum = pgEnum("entry_kind", [
  "expense",
  "revenue",
  "investment",
  "financing",
  "partners",
  "yield",
]);

/** Movimento of an investment, financing or partners lançamento. */
export const entryFlowEnum = pgEnum("entry_flow", ["in", "out"]);

/** A parcelamento (N parcelas of one purchase) or a recorrência (the same bill again and again). */
export const seriesModeEnum = pgEnum("series_mode", ["installments", "recurring"]);

/** Interval between two lançamentos of a série. */
export const seriesFrequencyEnum = pgEnum("series_frequency", ["monthly", "weekly"]);

/** Conta corrente, caixa, cartão de crédito or aplicação. */
export const bankAccountKindEnum = pgEnum("bank_account_kind", [
  "checking",
  "cash",
  "card",
  "investment",
]);

/** File format of an imported extrato. */
export const statementFormatEnum = pgEnum("statement_format", ["ofx", "csv"]);

/** Where a linha do extrato stands in the conciliação. */
export const statementLineStatusEnum = pgEnum("statement_line_status", [
  "pending",
  "matched",
  "created",
  "transfer",
  "ignored",
]);

/** How the twelve months of an orçamento line were filled. */
export const budgetDistributionEnum = pgEnum("budget_distribution", [
  "equal",
  "previous",
  "manual",
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
export const farm = pgTable(
  "farm",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    municipality: text("municipality").notNull(),
    stateRegistration: text("state_registration").notNull(),
    manager: text("manager").notNull(),
    /**
     * Saved map view of the farm (sede): where the map opens and how close.
     * All three are null until the farmer saves a view; the map then falls back
     * to the drawn invernadas and, failing those, to a fixed center.
     */
    headquartersLat: numeric("headquarters_lat", { mode: "number" }),
    headquartersLng: numeric("headquarters_lng", { mode: "number" }),
    headquartersZoom: integer("headquarters_zoom"),
    /**
     * Set when the Dono deletes the farm. Its rows stay; every lookup that turns
     * a user into a farm (the farm macro, the farm list, the lazy first farm)
     * skips it from then on.
     */
    deletedAt: timestamp("deleted_at"),
    /** Month the safra starts on (10 = outubro): the orçamento's twelve months count from it. */
    safraStartMonth: integer("safra_start_month").notNull().default(10),
  },
  (t) => [check("farm_safra_start_month_check", sql`${t.safraStartMonth} between 1 and 12`)]
);

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
    /** Preset the levels came from; null on the Dono row. */
    preset: farmMemberPresetEnum("preset"),
    /** Level per area; null on the Dono row, who holds everything. */
    permissions: jsonb("permissions").$type<Permissions>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.farmId, t.userId] }),
    index("farm_users_user_id_idx").on(t.userId),
  ]
);

/**
 * A convite to join a farm, claimed by signing in with its e-mail. Accepted,
 * declined and canceled rows stay for history; at most one per e-mail is
 * pending on a farm.
 */
export const farmInvites = pgTable(
  "farm_invites",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** Trimmed and lowercased. */
    email: text("email").notNull(),
    preset: farmMemberPresetEnum("preset").notNull(),
    permissions: jsonb("permissions").$type<Permissions>().notNull(),
    status: farmInviteStatusEnum("status").notNull().default("pending"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => [
    uniqueIndex("farm_invites_one_pending_per_email_unique")
      .on(t.farmId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index("farm_invites_email_idx").on(t.email),
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
  /**
   * Soft deletion. The row survives because manejo sessions, placements and
   * sold animals still point at it — dropping it would tear holes in history.
   * Every lookup that picks a lot to write to must ignore a deleted row; the
   * herd snapshot still ships it so past records can print its name.
   */
  deletedAt: timestamp("deleted_at"),
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
    /**
     * Set when a removed invernada still names past lot placements: it leaves
     * the lists and the map, the history keeps it, and its code is free again.
     */
    removedAt: timestamp("removed_at"),
  },
  (t) => [
    uniqueIndex("invernadas_farm_id_code_unique")
      .on(t.farmId, t.code)
      .where(sql`${t.removedAt} is null`),
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
    /** Soft delete: the reading stays for audit, the herd stops seeing it. */
    deletedAt: timestamp("deleted_at"),
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
    /** Shared by the treatments one scheduling action created; null before batches. */
    batchId: text("batch_id"),
    /** Soft delete: the row stays for audit, the herd stops seeing it. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("treatments_animal_id_date_idx").on(t.animalId, t.date),
    index("treatments_batch_id_idx").on(t.batchId),
  ]
);

/**
 * Bull the farm buys semen from (not a herd animal: herd bulls for natural
 * mating are animals of category `bull`). Its stock is never stored — it
 * derives from the purchases and the breedings that used a dose.
 */
export const semenBulls = pgTable(
  "semen_bulls",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Registro or central code, e.g. "NEL-4471". */
    code: text("code"),
    /** Free text, picked from the farm's breeds. */
    breed: text("breed"),
    /** Central de sêmen the doses come from. */
    central: text("central"),
  },
  // Names are unique per farm ignoring case: "tufão" and "Tufão" are one bull.
  (t) => [uniqueIndex("semen_bulls_farm_id_name_idx").on(t.farmId, sql`lower(${t.name})`)]
);

/** One purchase of semen doses of a bull, written together with its expense. */
export const semenPurchases = pgTable(
  "semen_purchases",
  {
    id: text("id").primaryKey(),
    bullId: text("bull_id")
      .notNull()
      .references(() => semenBulls.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    doses: integer("doses").notNull(),
    totalBrl: numeric("total_brl", { mode: "number" }).notNull(),
    /** Fornecedor, free text: they are outside the farm. */
    seller: text("seller"),
    /** Expense the purchase wrote in Financeiro; nulls out if that row goes. */
    expenseId: text("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("semen_purchases_bull_id_idx").on(t.bullId),
    check("semen_purchases_doses_positive", sql`${t.doses} > 0`),
  ]
);

/** Breeding (timed AI or natural mating) of a female. */
export const breedings = pgTable(
  "breedings",
  {
    id: text("id").primaryKey(),
    animalId: text("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    type: breedingTypeEnum("type").notNull(),
    /** Plain text: the bull may be external / not registered in the herd. */
    bullEarTag: text("bull_ear_tag").notNull(),
    /**
     * Semen bull whose dose this breeding used; null for any other bull.
     * Restricts: a bull cannot be deleted while a breeding used its doses.
     */
    semenBullId: text("semen_bull_id").references(() => semenBulls.id),
  },
  // A bull's stock counts its breedings on every dose taken.
  (t) => [index("breedings_semen_bull_id_idx").on(t.semenBullId)]
);

/** Pregnancy diagnosis linked to a breeding (one per breeding). */
export const pregnancyDiagnoses = pgTable("pregnancy_diagnoses", {
  breedingId: text("breeding_id")
    .primaryKey()
    .references(() => breedings.id, { onDelete: "cascade" }),
  result: diagnosisResultEnum("result").notNull(),
  date: date("date").notNull(),
  /** The vet's observação at the exam ("gestação de ~60 dias"), when given. */
  notes: text("notes"),
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
 * A place money sits: a conta corrente (takes extratos), the farm's caixa or a
 * cartão de crédito. Archived, it leaves "Pago por" and keeps its rows.
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: bankAccountKindEnum("kind").notNull(),
    name: text("name").notNull(),
    /** "c/c 12.345-6", "final 4471". */
    label: text("label"),
    /** Saldo at the end of `openingDate`; for a card, negative = owed. */
    openingBalanceBrl: numeric("opening_balance_brl", { mode: "number" }).notNull().default(0),
    openingDate: date("opening_date").notNull(),
    isMain: boolean("is_main").notNull().default(false),
    /** Card only. */
    closingDay: integer("closing_day"),
    dueDay: integer("due_day"),
    /** Card only: the conta corrente that pays the fatura. */
    paysFromId: text("pays_from_id").references((): AnyPgColumn => bankAccounts.id, {
      onDelete: "set null",
    }),
    csvMapping: jsonb("csv_mapping").$type<CsvMapping>(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bank_accounts_farm_id_idx").on(t.farmId),
    // One conta principal per farm.
    uniqueIndex("bank_accounts_farm_id_main_idx").on(t.farmId).where(sql`${t.isMain}`),
    check("bank_accounts_closing_day_check", sql`${t.closingDay} between 1 and 31`),
    check("bank_accounts_due_day_check", sql`${t.dueDay} between 1 and 31`),
  ]
);

/**
 * Animal movement (purchase, sale or transfer) — LEGACY, read-only.
 *
 * New movements are manejo sessions of kind transfer/sale/entry, and the
 * ledger derives from them (lib/domain/movements.ts). These rows predate that
 * model: their head count and category were typed by hand and no animal is
 * linked, hence both columns are nullable for anything written since.
 */
export const movements = pgTable(
  "movements",
  {
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
    /** Conta bancária of a purchase/sale. */
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("movements_bank_account_id_idx").on(t.bankAccountId)]
);

/**
 * A grupo de despesa the farm created, next to the seven built-in ones. The
 * columns that hold a grupo (`accounts.group`, `expenses.category`,
 * `expense_series.category`, `budgets.category`) are text: a built-in grupo
 * is its key ("nutrition"), a farm grupo its row id, so they carry no FK.
 */
export const expenseGroups = pgTable(
  "expense_groups",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Names are unique per farm ignoring case.
  (t) => [uniqueIndex("expense_groups_farm_name_idx").on(t.farmId, sql`lower(${t.name})`)]
);

/**
 * A conta of the farm's plano de contas, inside one grupo. A conta with
 * lançamentos is archived, which hides it from the form and keeps the history;
 * only an unused one is deleted (its orçamento lines go with it).
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    /** "revenue", a capital grupo, a built-in despesa key or an expense_groups id. */
    group: text("group").$type<AccountGroup>().notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
    /** Financing only, both or neither: saldo devedor at the end of `openingDate`. */
    openingBalanceBrl: numeric("opening_balance_brl", { mode: "number" }),
    openingDate: date("opening_date"),
  },
  // Names are unique per grupo ignoring case: "sal mineral" and "Sal mineral" are one conta.
  (t) => [
    uniqueIndex("accounts_farm_id_group_name_idx").on(t.farmId, t.group, sql`lower(${t.name})`),
  ]
);

/**
 * The rule behind a parcelamento or a recorrência and the template of every
 * lançamento it generates. `amountBrl` is the total of a parcelamento and the
 * value of each ocorrência of a recorrência. `generatedCount` is how many
 * ocorrências were written so far: the top-up continues after it, so an
 * ocorrência removed on its own never comes back.
 */
export const expenseSeries = pgTable(
  "expense_series",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    mode: seriesModeEnum("mode").notNull(),
    frequency: seriesFrequencyEnum("frequency").notNull(),
    /** 1–31, monthly only; a shorter month uses its last day. */
    dayOfMonth: integer("day_of_month"),
    /** First vencimento. */
    startsOn: date("starts_on").notNull(),
    /** Recurring only; null = sem fim. */
    endsOn: date("ends_on"),
    /** Parcelas; installments only. */
    count: integer("count"),
    generatedCount: integer("generated_count").notNull().default(0),
    kind: entryKindEnum("kind").notNull().default("expense"),
    /** Investment, financing and partners only. */
    flow: entryFlowEnum("flow"),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
    /** What the lançamento is, shown first in the list; null falls back to the pago para. */
    history: text("history"),
    counterparty: text("counterparty"),
    document: text("document"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("expense_series_farm_id_idx").on(t.farmId),
    check("expense_series_day_of_month_check", sql`${t.dayOfMonth} between 1 and 31`),
    check("expense_series_count_check", sql`${t.count} between 2 and 48`),
  ]
);

/**
 * A lançamento: one line of money the farm typed, a despesa or a receita
 * (costs outside the sanitary treatments, revenue outside the vendas).
 */
export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: entryKindEnum("kind").notNull().default("expense"),
    /** Investment, financing and partners only: "in" or "out". */
    flow: entryFlowEnum("flow"),
    /** Competência. */
    date: date("date").notNull(),
    /** Grupo of a despesa (a built-in key or an expense_groups id); the other kinds write "other" and nothing reads it. */
    category: text("category").$type<ExpenseCategory>().notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    notes: text("notes"),
    /** Vencimento; null means `date`. */
    dueDate: date("due_date"),
    /** Day it was paid or received; null means pendente. */
    paidAt: date("paid_at"),
    /** What the lançamento is, shown first in the list; null falls back to the pago para. */
    history: text("history"),
    /** Pago para / recebido de, free text. */
    counterparty: text("counterparty"),
    /** "NF 4.812", free text. */
    document: text("document"),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Centro de custo; null means the whole farm. */
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
    /** The série that generated this row; null for a lançamento typed once. */
    seriesId: text("series_id").references(() => expenseSeries.id, { onDelete: "set null" }),
    /** 1-based position in the série. */
    seriesIndex: integer("series_index"),
    /** "Pago por": the conta the money left or entered; paid rows only. */
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("expenses_farm_id_date_idx").on(t.farmId, t.date),
    index("expenses_bank_account_id_idx").on(t.bankAccountId),
    // One row per position: the top-up of a recorrência can run twice without doubling a bill.
    uniqueIndex("expenses_series_id_series_index_idx").on(t.seriesId, t.seriesIndex),
  ]
);

/**
 * A photo or PDF attached to a lançamento. The file lives in Vercel Blob
 * (private store) at `pathname`, always under `farms/<farmId>/expenses/<expenseId>/`.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    pathname: text("pathname").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** User id of who attached it; no FK, the anexo outlives a removed member. */
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("attachments_expense_id_idx").on(t.expenseId)]
);

/** Money moving between two contas of the farm (saque, aplicação, pagamento de fatura). */
export const transfers = pgTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    fromId: text("from_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    toId: text("to_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** User id; no FK, the row outlives a removed member. */
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("transfers_farm_id_idx").on(t.farmId),
    check("transfers_accounts_check", sql`${t.fromId} <> ${t.toId}`),
    check("transfers_amount_check", sql`${t.amountBrl} > 0`),
  ]
);

/** An extrato file (OFX or CSV) imported into a conta corrente. */
export const statementImports = pgTable(
  "statement_imports",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    format: statementFormatEnum("format").notNull(),
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    /** OFX LEDGERBAL. */
    bankBalanceBrl: numeric("bank_balance_brl", { mode: "number" }),
    bankBalanceDate: date("bank_balance_date"),
    lineCount: integer("line_count").notNull(),
    /** Lines of the file already seen in an earlier import. */
    skippedCount: integer("skipped_count").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [index("statement_imports_bank_account_id_idx").on(t.bankAccountId)]
);

/**
 * One line of an imported extrato and what it confirms. `externalId` is the
 * OFX FITID, or for a CSV a hash of date, description, value and occurrence,
 * so importing the same period twice skips what was seen. A record pairs with
 * one line at most (unique indexes; a transferência one per conta); removing it returns the line to pending
 * (the FK nulls the pointer and a trigger resets the status, migration 0023).
 */
export const statementLines = pgTable(
  "statement_lines",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    importId: text("import_id")
      .notNull()
      .references(() => statementImports.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    /** Signed: + entrada, − saída. */
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    externalId: text("external_id").notNull(),
    status: statementLineStatusEnum("status").notNull().default("pending"),
    expenseId: text("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    /** A sale/entry manejo session id or a legacy movement id: no FK, it names either. */
    movementId: text("movement_id"),
    transferId: text("transfer_id").references(() => transfers.id, { onDelete: "set null" }),
    ignoreReason: text("ignore_reason"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [
    uniqueIndex("statement_lines_account_external_idx").on(t.bankAccountId, t.externalId),
    index("statement_lines_import_id_idx").on(t.importId),
    index("statement_lines_farm_id_status_idx").on(t.farmId, t.status),
    uniqueIndex("statement_lines_expense_id_idx").on(t.expenseId),
    uniqueIndex("statement_lines_movement_id_idx").on(t.movementId),
    // A transferência has two sides: one line per conta.
    uniqueIndex("statement_lines_transfer_id_idx").on(t.transferId, t.bankAccountId),
  ]
);

/**
 * One calendar month of one line of the orçamento: a grupo's own line
 * (`accountId` null) or a conta's. No safra column: the farm's
 * `safraStartMonth` groups the months into safras when they are read, so a
 * changed start regroups them. A line is written twelve rows at a time, all
 * carrying the distribution last used.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    category: text("category").$type<ExpenseCategory>().notNull(),
    /** Null = the grupo's own line; removing the conta removes its lines. */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    /** First day of the calendar month. */
    month: date("month").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    distribution: budgetDistributionEnum("distribution").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    /** User id; no FK, the row outlives a removed member. */
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    // One row per line and month; the grupo's own line has no conta.
    uniqueIndex("budgets_line_month_idx").on(
      t.farmId,
      t.category,
      sql`coalesce(${t.accountId}, '')`,
      t.month
    ),
    index("budgets_farm_id_month_idx").on(t.farmId, t.month),
    check("budgets_amount_check", sql`${t.amountBrl} >= 0`),
  ]
);

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
    /** Touros of an insemination, in the order picked; the first is pre-selected for every cow. */
    semenBullIds: jsonb("semen_bull_ids").$type<string[]>(),
    planType: treatmentTypeEnum("plan_type"),
    planName: text("plan_name"),
    planWithdrawalDays: integer("plan_withdrawal_days"),
    planDose: text("plan_dose"),
    planResponsible: text("plan_responsible"),
    planCostBrl: numeric("plan_cost_brl", { mode: "number" }),
    planNextDate: date("plan_next_date"),
    planNotes: text("plan_notes"),
    /** Soft delete: the manejo leaves the history, the row stays for audit. */
    deletedAt: timestamp("deleted_at"),
    /** Venda or compra: the conta bancária its money went through. */
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("manejo_sessions_farm_id_idx").on(t.farmId),
    index("manejo_sessions_bank_account_id_idx").on(t.bankAccountId),
  ]
);

/**
 * Per-animal state of a manejo session (the chute line). The effect refs
 * (treatment, booster, weighing, breeding) support the undo of a pass; they
 * null out if the effect row is deleted elsewhere.
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
    /**
     * Rendimento (%) this boiada pass was priced at, when the brete changed it
     * from the venda's padrão. Null: the pass follows the padrão.
     */
    carcassYieldPct: numeric("carcass_yield_pct", { mode: "number" }),
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
    breedingId: text("breeding_id").references(() => breedings.id, {
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
export type FarmInviteRow = typeof farmInvites.$inferSelect;
export type LotRow = typeof lots.$inferSelect;
export type InvernadaRow = typeof invernadas.$inferSelect;
export type LotPlacementRow = typeof lotPlacements.$inferSelect;
export type BreedRow = typeof breeds.$inferSelect;
export type AnimalRow = typeof animals.$inferSelect;
export type WeighingRow = typeof weighings.$inferSelect;
export type TreatmentRow = typeof treatments.$inferSelect;
export type SemenBullRow = typeof semenBulls.$inferSelect;
export type SemenPurchaseRow = typeof semenPurchases.$inferSelect;
export type BreedingRow = typeof breedings.$inferSelect;
export type PregnancyDiagnosisRow = typeof pregnancyDiagnoses.$inferSelect;
export type CalvingRow = typeof calvings.$inferSelect;
export type MovementRow = typeof movements.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type FarmAccountRow = typeof accounts.$inferSelect;
export type ExpenseGroupRow = typeof expenseGroups.$inferSelect;
export type ExpenseSeriesRow = typeof expenseSeries.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type TransferRow = typeof transfers.$inferSelect;
export type StatementImportRow = typeof statementImports.$inferSelect;
export type StatementLineRow = typeof statementLines.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
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
