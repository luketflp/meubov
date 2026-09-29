# Financeiro — recorrência, parcelamento e anexos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lançamento can be split into parcelas or repeat every month or week, so "A pagar" and "A receber" show what is coming without typing each bill, and a photo or PDF of the NF or recibo stays attached to it. Ships the Financeiro sub-navigation (Painel · Extrato).

**Architecture:** A new `expense_series` table holds the rule and the template; each generated lançamento is an ordinary `expenses` row with `series_id` and `series_index` (unique together). All date and money arithmetic is pure in `lib/domain/series.ts`: position i of a série falls on `occurrenceDate(rule, i)` (a shorter month uses its last day), parcelas split to the centavo with the remainder on the last, and `scopeRows` picks what "Só esta" / "Esta e as próximas" / "Todas" reach — never a paid row. The API creates a whole série on `POST /expenses` with `repeat`, takes `scope` on PATCH and DELETE, and the herd load tops up every recorrência to today + 12 months. Anexos live in a private Vercel Blob store behind `lib/api/blob.ts`; the browser uploads straight to Blob with a token our API signs, registers the file, and reads it back only through `GET /api/herd/attachments/:id`.

**Tech Stack:** Next.js 16 app router (read `AGENTS.md` and `node_modules/next/dist/docs/` before app-router code — this Next differs from training data), Elysia + Eden treaty, drizzle-orm/Postgres, zustand, Tailwind, shadcn/ui, vitest, `@vercel/blob` 2.8 (the only new dependency).

**Spec:** `docs/superpowers/specs/2026-09-28-financeiro-recorrencia-anexos-design.md` — binding; read it whole first. Canvas: https://claude.ai/artifact/CQpkoLkCw8FrATae492nwY — `project/Main.dc.html` (dialog in Parcelado, desktop), `project/A-Dialog-Phone.dc.html` (sheet in Recorrente, phone, with the sub-navigation pills), `project/A-Bills.dc.html` (Contas and Extrato markers, "Editar recorrência" choice). Read them with the Artifact tool (action read, `path`) when a task needs exact copy or spacing.

**Vercel Blob decision (checked against the installed `@vercel/blob` 2.8.0 types and source):** private stores exist (`access: "private"` on `put`/client `upload`), and a server-side read exists: `get(pathname, { access: "private" })` returns `{ statusCode: 200, stream, blob: { size, contentType } }` (or null). `head` and `del` take a pathname. So the store is **private**: no URL of a file is ever reachable without our API. Upload: the client calls `upload(pathname, file, { access: "private", handleUploadUrl: "/api/herd/attachments/upload-token", headers: { "x-farm-id" } })`; our route checks session, farm, Financeiro edit, the pathname prefix `farms/<farmId>/expenses/<expenseId>/`, that the lançamento is the farm's and has < 10 anexos, then answers `{ type: "blob.generate-client-token", clientToken }` signed with `generateClientTokenFromReadWriteToken` (5 MB max, the five allowed types, no random suffix, no overwrite, 15 min). We do not use `handleUpload`: its only extra is the upload-completed webhook, and the client registers the file itself (`POST /expenses/:id/attachments`), where the server re-checks the prefix and reads the stored blob's real size and type with `head` (deleting a refused blob). Download: `GET /api/herd/attachments/:id` looks the anexo up by farm and id and streams `get(...).stream` with `content-disposition: inline`, `cache-control: private, no-store`, `x-content-type-options: nosniff`. The page fetches it with the `x-farm-id` header and shows an object URL (an `<a href>` straight to the route would lose the header and resolve the user's default farm).

**Decisions beyond the spec's letter (all keep its behaviour):**
- `Expense.attachmentCount` is optional in the type (`?: number`); the API always sends a number (0 when none). Required, it breaks 36 hand-written fixtures in 13 files for no behaviour.
- `Expense` also gains `seriesFrequency?` and `seriesDay?` (recorrências only): Contas and the Extrato need them to say "todo dia 20" without shipping the séries separately.
- `expense_series.generated_count`: how many positions were written. The top-up continues after it, so an ocorrência removed with "Só esta" never comes back (topping up by the unique index alone would resurrect it on the next load).
- "Esta e as próximas" on a recorrência with a new vencimento re-dates the unpaid rows in scope **in place** by their position (same outcome as delete + regenerate, but ids and anexos survive). The new day comes from the edited vencimento; the dialog does not offer a frequency change on edit (Repetir is hidden when editing, per spec).
- Removing "Esta e as próximas" / "Todas" of a recorrência sets `ends_on` to the day before the first removed position (for "Todas", the day before `starts_on`), so the load writes nothing after it.
- `GET /api/herd/attachments/status` → `{ enabled }` (Financeiro view): the dialog needs to know whether to show "Anexos indisponíveis neste ambiente" before any lançamento exists.
- Files chosen while creating a série attach to its first row (the NF belongs to the purchase).
- The Repetir section sits after Vencimento/Pagamento and before "Pago para", where the canvas draws it.

## Global Constraints

- One task per commit, `feat(finance): …` (fixes `fix(finance): …`), committed **by pathspec** exactly as each task's commit step lists. No `Co-Authored-By`, no session URL, no generator footer — check the message before every commit.
- Copy in pt-BR exactly as the spec and canvas write it: "Repetir", "Uma vez", "Parcelado", "Recorrente", "Valor total (R$)", "Parcelas", "Primeira parcela vence", "Intervalo", "mensal", "semanal", "segue a 1ª parcela, abaixo", "segue a recorrência, abaixo", "a última parcela absorve os centavos", "Repete a cada", "mês", "semana", "no dia", "até", "sem fim", "próximas:", "Anexos", "Adicionar foto ou PDF", "Tirar foto", "Escolher arquivo", "até 5 MB · fotos são reduzidas no celular", "Anexos indisponíveis neste ambiente", "precisa de sinal", "Só esta", "Esta e as próximas", "Todas", "Aplicar a mudança em", "Editar recorrência", "Ver anexos", "Parcela 2/3", "Recorrente · todo dia 20", "Painel", "Extrato". Code, comments and commit messages in English; no emoji.
- Money views need Financeiro **view**, writes Financeiro **edit**: `useCan("finance", "edit")` in the UI, `lib/api/permissions/routeRequirements.ts` on the API. Its two snapshot tests (`routeRequirements.test.ts`, `routeTable.test.ts`) are updated with `-u` on those explicit paths only, in Task 3 — never a bare `vitest -u`.
- Vitest always with explicit paths and `--exclude '**/worktrees/**'` (other worktrees under `.claude/worktrees/` break a plain run); eslint with `--ignore-pattern '.claude/**'`. `pnpm tsc --noEmit` and eslint clean at the end of every task, except the one tsc error Task 4 names and Task 5 clears.
- No new dependency beyond `@vercel/blob`. Dates are ISO `YYYY-MM-DD`; domain code never calls `new Date()` for "today" — it takes `todayIso` (`todayISO()` from `lib/domain/dates.ts` at the edge).
- Use-case pattern as in the repo: class with `run`, `constructor(repo = db, …)`, `__throwOnBrowser`; tests with the chainable stub `lib/api/__tests__/dbStub.ts` (or a local echo stub where stated) and the in-memory Blob fake `lib/api/__tests__/memoryBlob.ts`.
- Touch targets ≥ 44 px on the phone (`min-h-11 md:min-h-0`), `aria-label` or `sr-only` text on icon-only controls.

## Review Focus

1. Day 31 lands on 28 Feb (2027) and 29 Feb (2028), then back on 31 Mar — Task 2 `occurrenceDate` and `installmentPlan` tests.
2. The remainder goes on the last parcela and the parcelas add up to the total (1000 ÷ 3 → 333.33, 333.33, 333.34) — Task 2 `installmentPlan` test and Task 4 `AddSeries` test.
3. Paid rows are never touched by "Esta e as próximas" or "Todas", edit or removal — Task 2 `scopeRows` test, Task 4 `UpdateSeries` (paid row 3 kept out of the siblings' update) and `Delete` tests.
4. A pathname outside `farms/<farmId>/expenses/<expenseId>/` is refused before any insert or token — Task 3 `Register` and `IssueUploadToken` tests.
5. Another farm's anexo is refused on stream: the lookup binds the caller's farm id and the id, and nothing is read from Blob — Task 3 `Open` test.

## Waves (who runs in parallel)

| Wave | Tasks | Needs | Notes |
| --- | --- | --- | --- |
| 0 | 1 | — | types, schema, migration 0022, mappers, load hydration |
| 1 | 2, 3, 6 | 1 | pure série rules; anexos API + Blob wrapper (owns `package.json`, `app.ts`, `routeRequirements.ts` and its snapshots); sub-navigation. Disjoint files |
| 2 | 4 | 2 · 3 | série API (its Delete uses `lib/api/blob.ts` from 3); adds the top-up to the load |
| 3 | 5 | 4 | store actions typed against the mounted routes; clears Task 4's tsc error |
| 4 | 7 | 5 | markers, scope dialog, anexo tiles and viewer, Extrato row actions |
| 5 | 8 | 7 | EntryDialog Repetir + Anexos (uses 7's `SeriesScopeDialog` and tiles) |
| 6 | 9 | all | throwaway Postgres + `next start`, API and UI smoke; Blob steps only with a token |

`lib/api/domains/herd/useCases/Load.useCase.ts` is edited by Task 1 (hydration) and Task 4 (the top-up call): different waves, Task 4's hunk applies on top of Task 1's.

## Shared interfaces

```ts
// lib/types.ts (Task 1)
export interface Expense { /* …existing… */ seriesId?: string; seriesIndex?: number; seriesCount?: number; seriesFrequency?: SeriesFrequency; seriesDay?: number; attachmentCount?: number }
export type SeriesMode = "installments" | "recurring";
export type SeriesFrequency = "monthly" | "weekly";
export type SeriesScope = "one" | "following" | "all";
export interface SeriesRepeat { mode: SeriesMode; count?: number; frequency: SeriesFrequency; dayOfMonth?: number; startsOn: string; endsOn?: string }
export interface Attachment { id: string; expenseId: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string }

// lib/api/mappers.ts (Task 1)
export function toExpense(row: ExpenseRow, series?: ExpenseSeriesRow, attachmentCount?: number): Expense;
export function toAttachment(row: AttachmentRow): Attachment;

// lib/domain/series.ts (Task 2)
export interface SeriesRule { frequency: SeriesFrequency; dayOfMonth?: number | null; startsOn: string; endsOn?: string | null }
export function occurrenceDate(rule: SeriesRule, index: number): string;
export function addMonths(iso: string, months: number): string;
export function seriesHorizon(todayIso: string): string;                  // today + 12 months
export function installmentPlan(total: number, count: number, startsOn: string, frequency: SeriesFrequency): { index: number; dueDate: string; amountBrl: number }[];
export function recurringDates(rule: SeriesRule, fromIndex: number, untilIso: string): { index: number; date: string }[];
export function nextDueDates(rule: SeriesRule, n: number): string[];
export function firstMonthlyOnOrAfter(fromIso: string, day: number): string;
export function ruleFromOccurrence(frequency: SeriesFrequency, index: number, dueDate: string): { startsOn: string; dayOfMonth: number | null };
export function scopeRows<T extends { seriesIndex?: number | null; paidAt?: string | null }>(rows: T[], index: number, scope: SeriesScope): T[];
export function installmentLabel(e: Expense): string | null;              // "2/3"
export function recurrenceLabel(e: Expense): string | null;               // "todo dia 20" | "toda semana"
export function monthYear(iso: string): string;                           // "dez/2026"

// lib/domain/attachments.ts (Task 3)
MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, ATTACHMENT_TYPES, ATTACHMENT_ACCEPT, COMPRESS_MAX_SIDE, COMPRESS_QUALITY,
isAttachmentType, attachmentContentType, attachmentPrefix, attachmentPathname, parseAttachmentPathname, fitWithin, formatBytes, fileCountLabel

// lib/api/blob.ts (Task 3)
export interface BlobStore { enabled(): boolean; clientToken(pathname, limits): Promise<string>; head(pathname): Promise<BlobFile | null>; stream(pathname): Promise<(BlobFile & { body: ReadableStream<Uint8Array> }) | null>; del(pathnames: string[]): Promise<void> }
export const vercelBlobStore: BlobStore;
export function deleteBlobsQuietly(store: BlobStore, pathnames: string[]): Promise<void>;
```

API (Tasks 3–4), all under `/api/herd`, all finance-gated:
- `POST /expenses` body + `repeat?: SeriesRepeat` → `Expense[]` (every created row, first position first); 400 `due_before_date` | `invalid_repeat`.
- `PATCH /expenses/:id` body + `scope?: SeriesScope` → `Expense` (the edited row); DELETE `/expenses/:id?scope=` → `{ id }`.
- `GET /attachments/status` → `{ enabled }` (view) · `POST /attachments/upload-token` (edit, Blob client-token protocol) · `GET /expenses/:id/attachments` → `Attachment[]` (view) · `POST /expenses/:id/attachments` `{ pathname, fileName }` → `Attachment` (edit; 400 `bad_path` | `too_large` | `bad_type`, 404, 409 `too_many`, 503 `disabled`) · `GET /attachments/:id` → the file (view) · `DELETE /attachments/:id` → `{ id }` (edit).

Store (Task 5): `addExpense(e, repeat?) → Promise<Expense[]>`; `updateExpense(id, patch, scope = "one")` and `removeExpense(id, scope = "one")` re-read the herd when the scope is wider than "one"; `attachmentsEnabled()`, `listAttachments(expenseId)`, `uploadAttachment(expenseId, file, onProgress?)`, `removeAttachment(attachment)` (the last two keep `attachmentCount` in step).

UI (Tasks 6–8): `FinanceSubnav({ current: "painel" | "extrato", period })`; `InstallmentChip`, `RecurrenceTag`, `AttachmentCount` (`{ expense: Expense | null }`); `SeriesScopeDialog({ open, onOpenChange, expense, action: "edit" | "remove", amountChange?, busy?, onConfirm(scope) })`; `SavedAttachmentTile`, `PendingFileTile`, `useAttachmentUrl`; `AttachmentsDialog({ expense, onOpenChange })`; `RepeatSection`, `initialRepeat`, `repeatFromFields`; `AttachmentsField({ expenseId?, pending, onPendingChange, busy? })`, `PendingFile`; `compressImage(file)`.


---

### Task 1: Foundation — types, schema, migration, mappers, load

**Files:**
- Modify: `lib/types.ts` (end of `Expense`), `lib/db/schema.ts` (enums before `accountGroupEnum`, `expense_series` before `expenses`, `expenses` columns + unique index, `attachments` after it, row types), `lib/api/mappers.ts` (`toExpense`, new `toAttachment`), `lib/api/domains/herd/useCases/Load.useCase.ts` (two more selects, hydration of `expenses`)
- Create (generated): `drizzle/0022_financeiro-series-e-anexos.sql`, `drizzle/meta/0022_snapshot.json`; Modify (generated): `drizzle/meta/_journal.json`
- Create: `lib/api/__tests__/mappers.test.ts`
- Modify (expectation only): `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`, `…/AddPurchase.test.ts`
- Not affected (checked with tsc): every `Expense` fixture (all new fields are optional), `expenseRows.map(toExpense)` is replaced here (a bare `.map(toExpense)` would pass the index as the série).

**Interfaces:**
- Consumes: nothing new.
- Produces: the types, `expenseSeries` / `attachments` tables with `ExpenseSeriesRow` / `AttachmentRow`, enums `seriesModeEnum` / `seriesFrequencyEnum`, `toExpense(row, series?, attachmentCount = 0)`, `toAttachment(row)`. The load now answers every lançamento with its série fields and `attachmentCount`.

- [ ] **Step 1: Types.**

In `lib/types.ts` replace

```ts
  lotId?: string;
}
```

with

```ts
  lotId?: string;
  /** The série (parcelamento or recorrência) this row belongs to. */
  seriesId?: string;
  /** 1-based position in its série: the "2" of "2/3". */
  seriesIndex?: number;
  /** Parcelas of its parcelamento: the "3" of "2/3". Recorrências leave it out. */
  seriesCount?: number;
  /** How its recorrência repeats. Parcelas leave it out. */
  seriesFrequency?: SeriesFrequency;
  /** Day of the month a monthly recorrência falls on ("todo dia 20"). */
  seriesDay?: number;
  /**
   * Anexos (photos, PDFs) attached to it. The API always sends it (0 when
   * none); optional so a new lançamento and test fixtures need not carry it.
   */
  attachmentCount?: number;
}

/** A parcelamento (N parcelas of one purchase) or a recorrência (the same bill again and again). */
export type SeriesMode = "installments" | "recurring";

/** Interval between two lançamentos of a série. */
export type SeriesFrequency = "monthly" | "weekly";

/** Which rows of a série an edit or a removal reaches: "Só esta", "Esta e as próximas", "Todas". */
export type SeriesScope = "one" | "following" | "all";

/** How a new lançamento repeats (POST /expenses `repeat`). */
export interface SeriesRepeat {
  mode: SeriesMode;
  /** Parcelas, 2–48; installments only. */
  count?: number;
  frequency: SeriesFrequency;
  /** 1–31, monthly only; a shorter month uses its last day. Defaults to the day of `startsOn`. */
  dayOfMonth?: number;
  /** First vencimento. */
  startsOn: string;
  /** Last day an ocorrência may fall on; recurring only, absent = sem fim. */
  endsOn?: string;
}

/** A photo or PDF attached to a lançamento. */
export interface Attachment {
  id: string;
  expenseId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** ISO timestamp. */
  createdAt: string;
}
```

- [ ] **Step 2: Schema.**

`check`, `index`, `uniqueIndex`, `integer`, `sql` are already imported in `lib/db/schema.ts`.

In `lib/db/schema.ts` replace

```ts
export const entryKindEnum = pgEnum("entry_kind", ["expense", "revenue"]);
```

with

```ts
export const entryKindEnum = pgEnum("entry_kind", ["expense", "revenue"]);

/** A parcelamento (N parcelas of one purchase) or a recorrência (the same bill again and again). */
export const seriesModeEnum = pgEnum("series_mode", ["installments", "recurring"]);

/** Interval between two lançamentos of a série. */
export const seriesFrequencyEnum = pgEnum("series_frequency", ["monthly", "weekly"]);
```

In `lib/db/schema.ts` replace

```ts
/**
 * A lançamento: one line of money the farm typed, a despesa or a receita
```

with

```ts
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
    category: expenseCategoryEnum("category").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
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
```

In `lib/db/schema.ts` replace

```ts
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
  },
  (t) => [index("expenses_farm_id_date_idx").on(t.farmId, t.date)]
);
```

with

```ts
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
    /** The série that generated this row; null for a lançamento typed once. */
    seriesId: text("series_id").references(() => expenseSeries.id, { onDelete: "set null" }),
    /** 1-based position in the série. */
    seriesIndex: integer("series_index"),
  },
  (t) => [
    index("expenses_farm_id_date_idx").on(t.farmId, t.date),
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
```

In `lib/db/schema.ts` replace

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
```

with

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
export type ExpenseSeriesRow = typeof expenseSeries.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
```

- [ ] **Step 3: Generate the migration.**

```bash
pnpm migration:create financeiro-series-e-anexos
```
Expected: `[✓] Your SQL migration file ➜ drizzle/0022_financeiro-series-e-anexos.sql`, plus `drizzle/meta/0022_snapshot.json` and a `_journal.json` entry `idx: 22`. No prompt (additions only). The SQL must read exactly:

```sql
CREATE TYPE "public"."series_frequency" AS ENUM('monthly', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."series_mode" AS ENUM('installments', 'recurring');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"expense_id" text NOT NULL,
	"pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "attachments_pathname_unique" UNIQUE("pathname")
);
--> statement-breakpoint
CREATE TABLE "expense_series" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"mode" "series_mode" NOT NULL,
	"frequency" "series_frequency" NOT NULL,
	"day_of_month" integer,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"count" integer,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"kind" "entry_kind" DEFAULT 'expense' NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_brl" numeric NOT NULL,
	"account_id" text,
	"lot_id" text,
	"counterparty" text,
	"document" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_series_day_of_month_check" CHECK ("expense_series"."day_of_month" between 1 and 31),
	CONSTRAINT "expense_series_count_check" CHECK ("expense_series"."count" between 2 and 48)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "series_index" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_expense_id_idx" ON "attachments" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_series_farm_id_idx" ON "expense_series" USING btree ("farm_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_series_id_expense_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."expense_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_series_id_series_index_idx" ON "expenses" USING btree ("series_id","series_index");
```

If it differs, the schema step was not applied verbatim: fix the schema, delete the three generated changes, generate again.

- [ ] **Step 4: Mappers.**

In `lib/api/mappers.ts` replace

```ts
  Animal,
  Breeding,
```

with

```ts
  Animal,
  Attachment,
  Breeding,
```

In `lib/api/mappers.ts` replace

```ts
  AnimalRow,
  BreedingRow,
```

with

```ts
  AnimalRow,
  AttachmentRow,
  BreedingRow,
```

In `lib/api/mappers.ts` replace

```ts
  ExpenseRow,
  FarmAccountRow,
```

with

```ts
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
```

In `lib/api/mappers.ts` replace

```ts

export function toExpense(row: ExpenseRow): Expense {
  return {
```

with

```ts

/**
 * `series` is the row's série when it has one: a parcela gets the parcela
 * count ("2/3"), an ocorrência the frequency and day ("todo dia 20").
 */
export function toExpense(
  row: ExpenseRow,
  series?: ExpenseSeriesRow,
  attachmentCount = 0
): Expense {
  const recurring = series?.mode === "recurring";
  return {
```

In `lib/api/mappers.ts` replace

```ts
    lotId: orNothing(row.lotId),
  };
```

with

```ts
    lotId: orNothing(row.lotId),
    seriesId: orNothing(row.seriesId),
    seriesIndex: orNothing(row.seriesIndex),
    seriesCount: series?.mode === "installments" ? orNothing(series.count) : undefined,
    seriesFrequency: recurring ? series.frequency : undefined,
    seriesDay: recurring && series.frequency === "monthly" ? orNothing(series.dayOfMonth) : undefined,
    attachmentCount,
  };
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    expenseId: row.expenseId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
```

- [ ] **Step 5: Load gives every lançamento its série fields and anexo count.**

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
```

with

```ts
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
  animals,
  breedings,
```

with

```ts
  animals,
  attachments,
  breedings,
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
  customCategories,
  expenses,
```

with

```ts
  customCategories,
  expenseSeries,
  expenses,
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
      accountRows,
    ] = await Promise.all([
```

with

```ts
      accountRows,
      seriesRows,
      attachmentCountRows,
    ] = await Promise.all([
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
        .orderBy(asc(accounts.group), asc(accounts.name)),
    ]);
```

with

```ts
        .orderBy(asc(accounts.group), asc(accounts.name)),
      this.repository.select().from(expenseSeries).where(eq(expenseSeries.farmId, farmId)),
      this.repository
        .select({ expenseId: attachments.expenseId, total: count() })
        .from(attachments)
        .where(eq(attachments.farmId, farmId))
        .groupBy(attachments.expenseId),
    ]);
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts

    const herdAnimals = animalRows.map((row) =>
```

with

```ts

    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
    const attachmentsByExpense = new Map(
      attachmentCountRows.map((row) => [row.expenseId, row.total])
    );

    const herdAnimals = animalRows.map((row) =>
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
      manejoSessions: sessions,
      expenses: expenseRows.map(toExpense),
      accounts: accountRows.map(toAccount),
```

with

```ts
      manejoSessions: sessions,
      expenses: expenseRows.map((row) =>
        toExpense(
          row,
          row.seriesId === null ? undefined : seriesById.get(row.seriesId),
          attachmentsByExpense.get(row.id) ?? 0
        )
      ),
      accounts: accountRows.map(toAccount),
```

- [ ] **Step 6: Mapper test.**

Create `lib/api/__tests__/mappers.test.ts`:

```ts
/** toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20"). */
import { describe, expect, it } from "vitest";

import { toExpense } from "@/lib/api/mappers";
import type { ExpenseRow, ExpenseSeriesRow } from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-27",
  category: "nutrition",
  amountBrl: 4000,
  notes: null,
  dueDate: "2026-11-10",
  paidAt: null,
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
};

const SERIES: ExpenseSeriesRow = {
  id: "s-1",
  farmId: 7,
  mode: "installments",
  frequency: "monthly",
  dayOfMonth: 10,
  startsOn: "2026-10-10",
  endsOn: null,
  count: 3,
  generatedCount: 3,
  kind: "expense",
  category: "nutrition",
  amountBrl: 12000,
  accountId: null,
  lotId: null,
  counterparty: null,
  document: null,
  notes: null,
  createdAt: new Date("2026-09-27T12:00:00Z"),
};

describe("toExpense", () => {
  it("gives a parcela its position and count", () => {
    const expense = toExpense(ROW, SERIES, 2);
    expect(expense).toMatchObject({ seriesId: "s-1", seriesIndex: 2, seriesCount: 3, attachmentCount: 2 });
    expect(expense.seriesFrequency).toBeUndefined();
  });

  it("gives an ocorrência its frequency and day, never a count", () => {
    const expense = toExpense(ROW, { ...SERIES, mode: "recurring", count: null, dayOfMonth: 20 });
    expect(expense).toMatchObject({ seriesFrequency: "monthly", seriesDay: 20, attachmentCount: 0 });
    expect(expense.seriesCount).toBeUndefined();
  });

  it("leaves a lançamento typed once without série fields", () => {
    const expense = toExpense({ ...ROW, seriesId: null, seriesIndex: null });
    expect(expense.seriesId).toBeUndefined();
    expect(expense.seriesIndex).toBeUndefined();
    expect(expense.attachmentCount).toBe(0);
  });
});
```

- [ ] **Step 7: The two semen tests that pin the whole expense.**

`toExpense` now always sends `attachmentCount: 0`, so the two `toEqual` on the purchase's expense gain it.

In `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts` replace

```ts
        notes: "Sêmen — Tufão da Serra, 30 doses",
      },
```

with

```ts
        notes: "Sêmen — Tufão da Serra, 30 doses",
        attachmentCount: 0,
      },
```

In `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` replace

```ts
        notes: "Sêmen — Tufão da Serra, 1 dose",
      },
```

with

```ts
        notes: "Sêmen — Tufão da Serra, 1 dose",
        attachmentCount: 0,
      },
```

- [ ] **Step 8: Check.**

```bash
pnpm tsc --noEmit
pnpm exec vitest run lib/api/__tests__/mappers.test.ts lib/api/domains/semen lib/api/domains/expenses lib/api/__tests__/permissions.test.ts --exclude '**/worktrees/**'
```
Expected: tsc silent; vitest all green (mappers 3 tests).

- [ ] **Step 9: Commit.**

```bash
git add lib/types.ts \
  lib/db/schema.ts \
  drizzle/0022_financeiro-series-e-anexos.sql \
  drizzle/meta/0022_snapshot.json \
  drizzle/meta/_journal.json \
  lib/api/mappers.ts \
  lib/api/domains/herd/useCases/Load.useCase.ts \
  lib/api/__tests__/mappers.test.ts \
  lib/api/domains/semen/useCases/__tests__/AddBull.test.ts \
  lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts
git commit -m "feat(finance): series and attachments tables, types and load"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 2: Pure série rules (`lib/domain/series.ts`)

**Files:**
- Create: `lib/domain/series.ts`, `lib/domain/__tests__/series.test.ts`

**Interfaces:**
- Consumes: `Expense`, `SeriesFrequency`, `SeriesScope` (Task 1); `addDays`, `MONTH_ABBREV`, `parseISODate`, `toISO` from `lib/domain/dates.ts`.
- Produces: the `lib/domain/series.ts` signatures of "Shared interfaces".

- [ ] **Step 1: Write the failing test.**

Create `lib/domain/__tests__/series.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Expense } from "@/lib/types";
import {
  addMonths,
  firstMonthlyOnOrAfter,
  installmentLabel,
  installmentPlan,
  monthYear,
  nextDueDates,
  occurrenceDate,
  recurrenceLabel,
  recurringDates,
  ruleFromOccurrence,
  scopeRows,
  seriesHorizon,
} from "@/lib/domain/series";

describe("occurrenceDate", () => {
  it("falls on the last day of a shorter month (31 → 28 Feb in 2027, 29 Feb in 2028)", () => {
    const jan31 = { frequency: "monthly" as const, dayOfMonth: 31, startsOn: "2027-01-31" };
    expect([1, 2, 3, 4].map((i) => occurrenceDate(jan31, i))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expect(occurrenceDate({ ...jan31, startsOn: "2028-01-31" }, 2)).toBe("2028-02-29");
  });

  it("crosses the year", () => {
    expect(occurrenceDate({ frequency: "monthly", startsOn: "2026-11-05" }, 3)).toBe("2027-01-05");
  });

  it("steps a week at a time", () => {
    expect(occurrenceDate({ frequency: "weekly", startsOn: "2026-12-28" }, 2)).toBe("2027-01-04");
  });
});

describe("installmentPlan", () => {
  it("splits to the centavo and puts the remainder on the last parcela", () => {
    const plan = installmentPlan(1000, 3, "2026-10-10", "monthly");
    expect(plan.map((p) => p.amountBrl)).toEqual([333.33, 333.33, 333.34]);
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(plan.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it("adds up to the total", () => {
    const plan = installmentPlan(12000.01, 7, "2026-10-10", "weekly");
    const cents = plan.reduce((sum, p) => sum + Math.round(p.amountBrl * 100), 0);
    expect(cents).toBe(1200001);
    expect(plan[1].dueDate).toBe("2026-10-17");
  });

  it("keeps the first parcela's day across a short month", () => {
    expect(installmentPlan(300, 3, "2027-01-31", "monthly").map((p) => p.dueDate)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });
});

describe("recurringDates", () => {
  const rule = { frequency: "monthly" as const, dayOfMonth: 5, startsOn: "2026-10-05" };

  it("stops at the window", () => {
    expect(recurringDates(rule, 1, "2026-12-31").map((o) => o.date)).toEqual([
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
    ]);
  });

  it("stops at endsOn when it comes first", () => {
    expect(recurringDates({ ...rule, endsOn: "2026-11-30" }, 1, "2027-12-31")).toHaveLength(2);
  });

  it("tops up from the next position only", () => {
    expect(recurringDates(rule, 4, "2027-02-05")).toEqual([
      { index: 4, date: "2027-01-05" },
      { index: 5, date: "2027-02-05" },
    ]);
    expect(recurringDates(rule, 6, "2027-02-05")).toEqual([]);
  });

  it("covers today + 12 months", () => {
    expect(seriesHorizon("2026-09-28")).toBe("2027-09-28");
    expect(recurringDates(rule, 1, seriesHorizon("2026-09-28"))).toHaveLength(12);
  });
});

describe("nextDueDates", () => {
  it("lists the next vencimentos, fewer when the série ends", () => {
    const rule = { frequency: "monthly" as const, dayOfMonth: 5, startsOn: "2026-10-05" };
    expect(nextDueDates(rule, 3)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(nextDueDates({ ...rule, endsOn: "2026-10-31" }, 3)).toEqual(["2026-10-05"]);
  });
});

describe("firstMonthlyOnOrAfter", () => {
  it("takes this month when the day is still ahead, else the next", () => {
    expect(firstMonthlyOnOrAfter("2026-09-28", 30)).toBe("2026-09-30");
    expect(firstMonthlyOnOrAfter("2026-09-28", 5)).toBe("2026-10-05");
    expect(firstMonthlyOnOrAfter("2026-09-28", 28)).toBe("2026-09-28");
  });
});

describe("ruleFromOccurrence", () => {
  it("puts the edited position on the new vencimento", () => {
    const rule = ruleFromOccurrence("monthly", 4, "2027-01-20");
    expect(rule).toEqual({ startsOn: "2026-10-20", dayOfMonth: 20 });
    expect(occurrenceDate({ frequency: "monthly", ...rule }, 4)).toBe("2027-01-20");
  });

  it("walks a weekly série back whole weeks", () => {
    expect(ruleFromOccurrence("weekly", 3, "2026-10-15")).toEqual({ startsOn: "2026-10-01", dayOfMonth: null });
  });
});

describe("scopeRows", () => {
  const rows = [
    { id: "a", seriesIndex: 1, paidAt: "2026-10-05" },
    { id: "b", seriesIndex: 2 },
    { id: "c", seriesIndex: 3, paidAt: "2026-10-01" },
    { id: "d", seriesIndex: 4 },
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);

  it("reaches only the row for Só esta, paid or not", () => {
    expect(ids(scopeRows(rows, 3, "one"))).toEqual(["c"]);
  });

  it("leaves paid rows out of Esta e as próximas and Todas", () => {
    expect(ids(scopeRows(rows, 2, "following"))).toEqual(["b", "d"]);
    expect(ids(scopeRows(rows, 3, "following"))).toEqual(["d"]);
    expect(ids(scopeRows(rows, 4, "all"))).toEqual(["b", "d"]);
  });
});

describe("labels", () => {
  const base: Expense = { id: "e", kind: "expense", date: "2026-10-01", category: "labor", amountBrl: 1 };

  it("names a parcela and an ocorrência", () => {
    expect(installmentLabel({ ...base, seriesIndex: 2, seriesCount: 3 })).toBe("2/3");
    expect(recurrenceLabel({ ...base, seriesFrequency: "monthly", seriesDay: 20 })).toBe("todo dia 20");
    expect(recurrenceLabel({ ...base, seriesFrequency: "weekly" })).toBe("toda semana");
    expect(installmentLabel(base)).toBeNull();
    expect(recurrenceLabel(base)).toBeNull();
  });

  it("formats month and year", () => {
    expect(monthYear("2026-12-05")).toBe("dez/2026");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});
```

- [ ] **Step 2: Run it.**

```bash
pnpm exec vitest run lib/domain/__tests__/series.test.ts --exclude '**/worktrees/**'
```
Expected: FAIL — `Cannot find module '@/lib/domain/series'` (or failed to resolve import).

- [ ] **Step 3: Implement.**

Create `lib/domain/series.ts`:

```ts
/**
 * Parcelamentos and recorrências: the dates and values a série generates and
 * which of its rows an edit or a removal reaches. Pure: `today` always comes in.
 *
 * Position i (1-based) of a série falls on `occurrenceDate(rule, i)`: weekly,
 * `startsOn` + 7·(i−1) days; monthly, the month of `startsOn` + (i−1) on
 * `dayOfMonth`, or on the month's last day when it is shorter (31 → 28/29 Feb).
 */
import type { Expense, SeriesFrequency, SeriesScope } from "@/lib/types";
import { addDays, MONTH_ABBREV, parseISODate, toISO } from "@/lib/domain/dates";

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 48;
/** How far ahead a recorrência keeps its ocorrências written. */
export const HORIZON_MONTHS = 12;
/** Guard against a runaway loop (weekly over a long window is ~53 a year). */
const MAX_OCCURRENCES = 600;

export interface SeriesRule {
  frequency: SeriesFrequency;
  /** Monthly only; absent = the day of `startsOn`. */
  dayOfMonth?: number | null;
  startsOn: string;
  /** Last day an ocorrência may fall on; absent = sem fim. */
  endsOn?: string | null;
}

/** Vencimento of position `index` (1-based; 0 and below walk back before `startsOn`). */
export function occurrenceDate(rule: SeriesRule, index: number): string {
  if (rule.frequency === "weekly") return addDays(rule.startsOn, 7 * (index - 1));
  const start = parseISODate(rule.startsOn);
  const day = rule.dayOfMonth ?? start.getDate();
  const month = start.getMonth() + index - 1;
  const lastDay = new Date(start.getFullYear(), month + 1, 0).getDate();
  return toISO(new Date(start.getFullYear(), month, Math.min(day, lastDay)));
}

/** `iso` plus `months` calendar months, on the same day or the month's last. */
export function addMonths(iso: string, months: number): string {
  return occurrenceDate({ frequency: "monthly", startsOn: iso }, months + 1);
}

/** The last day a recorrência is written up to: today + 12 months. */
export function seriesHorizon(todayIso: string): string {
  return addMonths(todayIso, HORIZON_MONTHS);
}

export interface InstallmentLine {
  index: number;
  dueDate: string;
  amountBrl: number;
}

/**
 * The parcelas of `total`: each floor(total ÷ count) to the centavo, the last
 * one takes the remainder, so they always add up to the total.
 */
export function installmentPlan(
  total: number,
  count: number,
  startsOn: string,
  frequency: SeriesFrequency
): InstallmentLine[] {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / count);
  const rule: SeriesRule = { frequency, startsOn };
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    dueDate: occurrenceDate(rule, i + 1),
    amountBrl: (i === count - 1 ? cents - each * (count - 1) : each) / 100,
  }));
}

/**
 * Positions from `fromIndex` whose vencimento falls on or before both `untilIso`
 * and the rule's `endsOn`.
 */
export function recurringDates(
  rule: SeriesRule,
  fromIndex: number,
  untilIso: string
): { index: number; date: string }[] {
  const last = rule.endsOn && rule.endsOn < untilIso ? rule.endsOn : untilIso;
  const out: { index: number; date: string }[] = [];
  for (let index = fromIndex; out.length < MAX_OCCURRENCES; index += 1) {
    const date = occurrenceDate(rule, index);
    if (date > last) break;
    out.push({ index, date });
  }
  return out;
}

/** The first `n` vencimentos of a rule (fewer when `endsOn` comes first): the dialog's "próximas". */
export function nextDueDates(rule: SeriesRule, n: number): string[] {
  const out: string[] = [];
  for (let index = 1; out.length < n; index += 1) {
    const date = occurrenceDate(rule, index);
    if (rule.endsOn && date > rule.endsOn) break;
    out.push(date);
  }
  return out;
}

/** First day on or after `fromIso` that falls on `day` (or on a shorter month's last day). */
export function firstMonthlyOnOrAfter(fromIso: string, day: number): string {
  const here = occurrenceDate({ frequency: "monthly", dayOfMonth: day, startsOn: fromIso }, 1);
  return here >= fromIso
    ? here
    : occurrenceDate({ frequency: "monthly", dayOfMonth: day, startsOn: fromIso }, 2);
}

/**
 * The rule that puts position `index` on `dueDate`, keeping the frequency: the
 * day of `dueDate` becomes the day of the month and `startsOn` walks back
 * (index − 1) intervals. Used when "Esta e as próximas" moves a vencimento.
 */
export function ruleFromOccurrence(
  frequency: SeriesFrequency,
  index: number,
  dueDate: string
): { startsOn: string; dayOfMonth: number | null } {
  if (frequency === "weekly") return { startsOn: addDays(dueDate, -7 * (index - 1)), dayOfMonth: null };
  const dayOfMonth = parseISODate(dueDate).getDate();
  return {
    startsOn: occurrenceDate({ frequency, dayOfMonth, startsOn: dueDate }, 2 - index),
    dayOfMonth,
  };
}

interface SeriesPosition {
  seriesIndex?: number | null;
  paidAt?: string | null;
}

/**
 * Rows of one série an edit or removal reaches. "one": the row at `index`.
 * "following": unpaid rows from `index` on. "all": every unpaid row. Paid rows
 * never enter a wider scope.
 */
export function scopeRows<T extends SeriesPosition>(rows: T[], index: number, scope: SeriesScope): T[] {
  if (scope === "one") return rows.filter((row) => row.seriesIndex === index);
  return rows.filter(
    (row) => !row.paidAt && (scope === "all" || (row.seriesIndex ?? 0) >= index)
  );
}

/** "2/3" on a parcela; null otherwise. */
export function installmentLabel(expense: Expense): string | null {
  return expense.seriesIndex !== undefined && expense.seriesCount !== undefined
    ? `${expense.seriesIndex}/${expense.seriesCount}`
    : null;
}

/** "todo dia 20" or "toda semana" on an ocorrência; null otherwise. */
export function recurrenceLabel(expense: Expense): string | null {
  if (expense.seriesFrequency === "weekly") return "toda semana";
  if (expense.seriesFrequency === "monthly" && expense.seriesDay !== undefined) {
    return `todo dia ${expense.seriesDay}`;
  }
  return null;
}

/** "dez/2026". */
export function monthYear(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTH_ABBREV[d.getMonth()]}/${d.getFullYear()}`;
}
```

- [ ] **Step 4: Run again.**

```bash
pnpm exec vitest run lib/domain/__tests__/series.test.ts --exclude '**/worktrees/**'
pnpm tsc --noEmit
```
Expected: 18 tests pass; tsc silent.

- [ ] **Step 5: Commit.**

```bash
git add lib/domain/series.ts \
  lib/domain/__tests__/series.test.ts
git commit -m "feat(finance): the dates, values and scope of parcelamentos and recorrências"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 3: Anexos API and the Blob wrapper

**Files:**
- Modify (by command): `package.json`, `pnpm-lock.yaml`
- Create: `lib/domain/attachments.ts` + `lib/domain/__tests__/attachments.test.ts`, `lib/api/blob.ts`, `lib/api/__tests__/memoryBlob.ts`
- Create: `lib/api/domains/attachments/attachments.controller.ts`, `schemas/attachment.schema.ts`, `useCases/{IssueUploadToken,Register,List,Open,Delete}.useCase.ts`, `useCases/__tests__/{Register,IssueUploadToken,Open}.test.ts`, `__tests__/attachments.routes.test.ts`
- Modify: `lib/api/app.ts` (mount), `lib/api/permissions/routeRequirements.ts` (six routes), `lib/api/__tests__/routeRequirements.test.ts` (one test); snapshots `lib/api/__tests__/__snapshots__/{routeRequirements,routeTable}.test.ts.snap` by `-u`

**Interfaces:**
- Consumes: `attachments`, `expenses` tables and `toAttachment` (Task 1); `farmPlugin` (`user`, `farmId`).
- Produces: `lib/domain/attachments.ts`, `lib/api/blob.ts` (`BlobStore`, `vercelBlobStore`, `deleteBlobsQuietly`) and the fake `memoryBlobStore(files?, enabled = true)` → `{ store, files, deleted, tokens }`; the six anexo routes of "Shared interfaces".

- [ ] **Step 1: Add the dependency.**

```bash
pnpm add @vercel/blob
```
Expected: `dependencies: + @vercel/blob ^2.8.0` (a 2.x ≥ 2.8 is fine: `get()` with `access: "private"` and `generateClientTokenFromReadWriteToken` must exist — `grep -c 'declare function get' node_modules/@vercel/blob/dist/index.d.ts` prints 1). Only `package.json` and `pnpm-lock.yaml` change.

- [ ] **Step 2: Pure anexo rules: test first.**

Create `lib/domain/__tests__/attachments.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  attachmentContentType,
  attachmentPathname,
  fileCountLabel,
  fitWithin,
  formatBytes,
  isAttachmentType,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

describe("attachment pathnames", () => {
  it("builds the farm's folder with a safe name", () => {
    expect(attachmentPathname(7, "e-1", "u-1", "Nota Fiscal nº 4.812.pdf")).toBe(
      "farms/7/expenses/e-1/u-1-Nota-Fiscal-n-4.812.pdf"
    );
    expect(attachmentPathname(7, "e-1", "u-1", "ção")).toBe("farms/7/expenses/e-1/u-1-cao");
    expect(attachmentPathname(7, "e-1", "u-1", "///")).toBe("farms/7/expenses/e-1/u-1-anexo");
  });

  it("reads back the farm and lançamento, refusing anything else", () => {
    expect(parseAttachmentPathname("farms/7/expenses/e-1/u-1-nf.pdf")).toEqual({ farmId: 7, expenseId: "e-1" });
    expect(parseAttachmentPathname("farms/7/expenses/e-1/sub/u-1.pdf")).toBeNull();
    expect(parseAttachmentPathname("other/7/expenses/e-1/u-1.pdf")).toBeNull();
    expect(parseAttachmentPathname("farms/x/expenses/e-1/u-1.pdf")).toBeNull();
  });
});

describe("attachment types", () => {
  it("takes photos and PDF only", () => {
    expect(isAttachmentType("image/jpeg")).toBe(true);
    expect(isAttachmentType("application/pdf")).toBe(true);
    expect(isAttachmentType("image/svg+xml")).toBe(false);
    expect(isAttachmentType("text/html")).toBe(false);
  });

  it("types an untyped .heic", () => {
    expect(attachmentContentType("IMG_1.HEIC", "")).toBe("image/heic");
    expect(attachmentContentType("nf.pdf", "application/pdf")).toBe("application/pdf");
  });
});

describe("fitWithin", () => {
  it("scales the longest side down and never up", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("labels", () => {
  it("formats sizes and counts", () => {
    expect(formatBytes(480 * 1024)).toBe("480 KB");
    expect(formatBytes(300)).toBe("1 KB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(fileCountLabel(1)).toBe("1 arquivo");
    expect(fileCountLabel(2)).toBe("2 arquivos");
  });
});
```

```bash
pnpm exec vitest run lib/domain/__tests__/attachments.test.ts --exclude '**/worktrees/**'
```
Expected: FAIL — cannot resolve `@/lib/domain/attachments`.

- [ ] **Step 3: Implement them.**

Create `lib/domain/attachments.ts`:

```ts
/**
 * Anexos: what may be attached to a lançamento and where the file lives.
 * Pure; shared by the API (checks) and the dialog (compression, labels).
 */

/** Largest file after the phone reduced it. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Anexos per lançamento. */
export const MAX_ATTACHMENTS = 10;
export const ATTACHMENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];
/** `accept` of the file inputs; ".heic" because some browsers give HEIC no type. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_TYPES, ".heic"].join(",");
/** A photo is reduced to this longest side, JPEG at this quality. */
export const COMPRESS_MAX_SIDE = 1600;
export const COMPRESS_QUALITY = 0.8;

export function isAttachmentType(contentType: string): boolean {
  return ATTACHMENT_TYPES.includes(contentType);
}

/** The file's type, "image/heic" for a .heic the browser left untyped. */
export function attachmentContentType(fileName: string, type: string): string {
  if (type === "" && /\.heic$/i.test(fileName)) return "image/heic";
  return type;
}

/** Every anexo of a lançamento lives under this folder of the store. */
export function attachmentPrefix(farmId: number, expenseId: string): string {
  return `farms/${farmId}/expenses/${expenseId}/`;
}

/** `farms/<farmId>/expenses/<expenseId>/<id>-<name>`, the name reduced to safe characters. */
export function attachmentPathname(
  farmId: number,
  expenseId: string,
  id: string,
  fileName: string
): string {
  const safe =
    fileName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "anexo";
  return `${attachmentPrefix(farmId, expenseId)}${id}-${safe}`;
}

/** The farm and lançamento a pathname claims; null when it is not one of ours. */
export function parseAttachmentPathname(
  pathname: string
): { farmId: number; expenseId: string } | null {
  const match = /^farms\/(\d+)\/expenses\/([^/]+)\/[^/]+$/.exec(pathname);
  return match ? { farmId: Number(match[1]), expenseId: match[2] } : null;
}

/** Scales width × height down so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** "480 KB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "1 arquivo", "2 arquivos". */
export function fileCountLabel(count: number): string {
  return count === 1 ? "1 arquivo" : `${count} arquivos`;
}
```

```bash
pnpm exec vitest run lib/domain/__tests__/attachments.test.ts --exclude '**/worktrees/**'
```
Expected: 6 tests pass.

- [ ] **Step 4: The store wrapper and its in-memory fake.**

Create `lib/api/blob.ts`:

```ts
/**
 * The anexos' file store, behind one small interface so the use cases can be
 * tested with the in-memory fake (`lib/api/__tests__/memoryBlob.ts`).
 *
 * Production is a PRIVATE Vercel Blob store: no file is reachable by URL, the
 * browser uploads straight to Blob with a short-lived client token our API
 * signs (the file never crosses our function's 4.5 MB body limit), and every
 * read goes through GET /api/herd/attachments/:id, which streams the blob
 * with the server's read-write token after checking the farm.
 */
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export interface BlobFile {
  size: number;
  contentType: string;
}

export interface BlobStore {
  /** False without BLOB_READ_WRITE_TOKEN: the dialog says "Anexos indisponíveis neste ambiente". */
  enabled(): boolean;
  /** A client token that lets the browser upload exactly `pathname`, within the limits. */
  clientToken(
    pathname: string,
    limits: { maximumSizeInBytes: number; allowedContentTypes: readonly string[] }
  ): Promise<string>;
  /** Size and type of a stored file; null when there is none. */
  head(pathname: string): Promise<BlobFile | null>;
  /** The file's bytes; null when there is none. */
  stream(pathname: string): Promise<(BlobFile & { body: ReadableStream<Uint8Array> }) | null>;
  del(pathnames: string[]): Promise<void>;
}

/** How long a client token stays valid: enough for 5 MB over a weak rural signal. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

export const vercelBlobStore: BlobStore = {
  enabled: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),

  clientToken: (pathname, limits) =>
    generateClientTokenFromReadWriteToken({
      pathname,
      maximumSizeInBytes: limits.maximumSizeInBytes,
      allowedContentTypes: [...limits.allowedContentTypes],
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: Date.now() + TOKEN_TTL_MS,
    }),

  async head(pathname) {
    try {
      const blob = await head(pathname);
      return { size: blob.size, contentType: blob.contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },

  async stream(pathname) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, size: result.blob.size, contentType: result.blob.contentType };
  },

  del: async (pathnames) => {
    if (pathnames.length > 0) await del(pathnames);
  },
};

/** Removes files after their rows are gone; a failure is logged, never blocks the removal. */
export async function deleteBlobsQuietly(store: BlobStore, pathnames: string[]): Promise<void> {
  try {
    await store.del(pathnames);
  } catch (error) {
    console.error("[anexos] could not delete blobs", pathnames, error);
  }
}
```

Create `lib/api/__tests__/memoryBlob.ts`:

```ts
/**
 * In-memory BlobStore for use-case tests: `files` is what the store holds,
 * `deleted` every pathname passed to `del`, `tokens` every pathname a client
 * token was signed for.
 */
import type { BlobFile, BlobStore } from "@/lib/api/blob";

export function memoryBlobStore(initial: Record<string, BlobFile> = {}, enabled = true) {
  const files = new Map(Object.entries(initial));
  const deleted: string[] = [];
  const tokens: string[] = [];
  const store: BlobStore = {
    enabled: () => enabled,
    clientToken: async (pathname) => {
      tokens.push(pathname);
      return `token:${pathname}`;
    },
    head: async (pathname) => files.get(pathname) ?? null,
    stream: async (pathname) => {
      const file = files.get(pathname);
      return file ? { ...file, body: new Blob(["bytes"]).stream() } : null;
    },
    del: async (pathnames) => {
      for (const pathname of pathnames) {
        deleted.push(pathname);
        files.delete(pathname);
      }
    },
  };
  return { store, files, deleted, tokens };
}
```

- [ ] **Step 5: Use-case tests (they fail until Step 6).**

Create `lib/api/domains/attachments/useCases/__tests__/Register.test.ts`:

```ts
/**
 * Registering an anexo the browser uploaded: the pathname must sit in this
 * farm's folder of this lançamento and the stored blob must be at most 5 MB of
 * an allowed type. Chainable db stub (lib/api/__tests__/dbStub.ts) and the
 * in-memory blob store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";
import { MAX_ATTACHMENT_BYTES } from "@/lib/domain/attachments";

import { RegisterAttachmentUseCase } from "../Register.useCase";

const PATH = "farms/7/expenses/e-1/u-1-nf.jpg";
const input = { farmId: 7, userId: "user-1", expenseId: "e-1", pathname: PATH, fileName: "nf.jpg" };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
});

describe("registerAttachment", () => {
  it("records a photo that sits in the farm's folder", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 480_000, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 1 }]];
    state.returning = [
      [
        {
          id: "a-1",
          farmId: 7,
          expenseId: "e-1",
          pathname: PATH,
          fileName: "nf.jpg",
          contentType: "image/jpeg",
          sizeBytes: 480_000,
          createdAt: new Date("2026-09-28T12:00:00Z"),
          createdBy: "user-1",
        },
      ],
    ];

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run(input);

    expect(result).toMatchObject({ id: "a-1", expenseId: "e-1", sizeBytes: 480_000 });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, pathname: PATH, sizeBytes: 480_000, createdBy: "user-1" });
  });

  it("refuses a pathname outside the farm's folder without touching the store", async () => {
    const other = "farms/8/expenses/e-1/u-1-nf.jpg";
    const blob = memoryBlobStore({ [other]: { size: 1000, contentType: "image/jpeg" } });

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run({ ...input, pathname: other });

    expect(result).toBe("bad_path");
    expect(state.inserts).toEqual([]);
    expect(blob.deleted).toEqual([]);
  });

  it("refuses a pathname of another lançamento", async () => {
    const blob = memoryBlobStore();
    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run({
      ...input,
      pathname: "farms/7/expenses/e-2/u-1-nf.jpg",
    });
    expect(result).toBe("bad_path");
  });

  it("refuses and deletes a blob over 5 MB", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: MAX_ATTACHMENT_BYTES + 1, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    const result = await new RegisterAttachmentUseCase(undefined, blob.store).run(input);

    expect(result).toBe("too_large");
    expect(blob.deleted).toEqual([PATH]);
    expect(state.inserts).toEqual([]);
  });

  it("refuses and deletes a blob of another type", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "text/html" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("bad_type");
    expect(blob.deleted).toEqual([PATH]);
  });

  it("refuses the eleventh anexo", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[{ id: "e-1" }], [{ total: 10 }]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("too_many");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a lançamento that is not on the farm", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[]];

    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("not_found");
  });

  it("says so when the environment has no Blob store", async () => {
    const blob = memoryBlobStore({}, false);
    expect(await new RegisterAttachmentUseCase(undefined, blob.store).run(input)).toBe("disabled");
  });
});
```

Create `lib/api/domains/attachments/useCases/__tests__/IssueUploadToken.test.ts`:

```ts
/** A client token is signed only for a file in this farm's folder of one of its lançamentos. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";

import { IssueUploadTokenUseCase } from "../IssueUploadToken.useCase";

beforeEach(() => {
  state.selectResults = [];
});

describe("issueUploadToken", () => {
  it("signs a token for the exact pathname", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [[{ id: "e-1" }], [{ total: 0 }]];

    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-1/u-1-nf.pdf",
    });

    expect(result).toEqual({ clientToken: "token:farms/7/expenses/e-1/u-1-nf.pdf" });
  });

  it("refuses another farm's folder", async () => {
    const blob = memoryBlobStore();
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/8/expenses/e-1/u-1-nf.pdf",
    });
    expect(result).toBe("bad_path");
    expect(blob.tokens).toEqual([]);
  });

  it("refuses a lançamento that is not on the farm", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [[]];
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-9/u-1-nf.pdf",
    });
    expect(result).toBe("not_found");
    expect(blob.tokens).toEqual([]);
  });

  it("says so without a Blob store", async () => {
    const blob = memoryBlobStore({}, false);
    const result = await new IssueUploadTokenUseCase(undefined, blob.store).run({
      farmId: 7,
      pathname: "farms/7/expenses/e-1/u-1-nf.pdf",
    });
    expect(result).toBe("disabled");
  });
});
```

Create `lib/api/domains/attachments/useCases/__tests__/Open.test.ts`:

```ts
/** Streaming an anexo: only one of the caller's farm, looked up by farm and id. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";
import { renderSql } from "@/lib/api/__tests__/dbStub";

import { OpenAttachmentUseCase } from "../Open.useCase";

const PATH = "farms/8/expenses/e-1/u-1-nf.jpg";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("openAttachment", () => {
  it("refuses another farm's anexo: the lookup is scoped to the caller's farm", async () => {
    // The anexo a-1 belongs to farm 8; the farm-scoped select finds nothing for farm 7.
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [[]];

    const result = await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 7, id: "a-1" });

    expect(result).toBeNull();
    const where = renderSql(state.wheres[0] as SQL);
    expect(where.sql).toContain('"attachments"."farm_id" = $1');
    expect(where.params).toEqual([7, "a-1"]);
  });

  it("streams an anexo of the farm", async () => {
    const blob = memoryBlobStore({ [PATH]: { size: 1000, contentType: "image/jpeg" } });
    state.selectResults = [
      [{ id: "a-1", farmId: 8, pathname: PATH, fileName: "nf.jpg", contentType: "image/jpeg" }],
    ];

    const result = await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 8, id: "a-1" });

    expect(result).toMatchObject({ fileName: "nf.jpg", contentType: "image/jpeg", size: 1000 });
  });

  it("is null when the file is gone from the store", async () => {
    const blob = memoryBlobStore();
    state.selectResults = [
      [{ id: "a-1", farmId: 8, pathname: PATH, fileName: "nf.jpg", contentType: "image/jpeg" }],
    ];
    expect(await new OpenAttachmentUseCase(undefined, blob.store).run({ farmId: 8, id: "a-1" })).toBeNull();
  });
});
```

```bash
pnpm exec vitest run lib/api/domains/attachments --exclude '**/worktrees/**'
```
Expected: FAIL — the use-case modules do not exist yet.

- [ ] **Step 6: Schemas and use cases.**

Create `lib/api/domains/attachments/schemas/attachment.schema.ts`:

```ts
/** Request schemas for the anexos of a lançamento. */

import { t } from "elysia";

/**
 * What `upload()` of @vercel/blob/client posts to its `handleUploadUrl` to ask
 * for a client token. Only the token request is accepted: the "upload
 * completed" callback is not used (the client registers the anexo itself).
 */
export const UploadTokenBody = t.Object({
  type: t.Literal("blob.generate-client-token"),
  payload: t.Object({
    pathname: t.String({ minLength: 1, maxLength: 400 }),
    clientPayload: t.Optional(t.Nullable(t.String())),
    multipart: t.Optional(t.Boolean()),
  }),
});

/** Body of POST /expenses/:id/attachments, after the browser uploaded the file. */
export const RegisterAttachmentBody = t.Object({
  pathname: t.String({ minLength: 1, maxLength: 400 }),
  fileName: t.String({ minLength: 1, maxLength: 200 }),
});
```

Create `lib/api/domains/attachments/useCases/IssueUploadToken.useCase.ts`:

```ts
import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface IssueUploadTokenUseCaseProps {
  farmId: number;
  pathname: string;
}

/**
 * `disabled` without a Blob token; `bad_path` outside
 * `farms/<farmId>/expenses/<id>/`; `not_found` when the lançamento is not on
 * this farm; `too_many` at 10 anexos.
 */
type IssueUploadTokenUseCaseResponse =
  | { clientToken: string }
  | "disabled"
  | "bad_path"
  | "not_found"
  | "too_many";

type CurrUseCase = _UseCase<IssueUploadTokenUseCaseProps, IssueUploadTokenUseCaseResponse>;

/** Signs a client token for one file of one lançamento of the caller's farm. */
export class IssueUploadTokenUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("IssueUploadTokenUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, pathname }) => {
    if (!this.blob.enabled()) return "disabled";
    const target = parseAttachmentPathname(pathname);
    if (!target || target.farmId !== farmId) return "bad_path";

    const [expense] = await this.repository
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, target.expenseId)))
      .limit(1);
    if (!expense) return "not_found";

    const [{ total }] = await this.repository
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, target.expenseId)));
    if (total >= MAX_ATTACHMENTS) return "too_many";

    const clientToken = await this.blob.clientToken(pathname, {
      maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
      allowedContentTypes: ATTACHMENT_TYPES,
    });
    return { clientToken };
  };
}
```

Create `lib/api/domains/attachments/useCases/Register.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { toAttachment } from "@/lib/api/mappers";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  isAttachmentType,
  parseAttachmentPathname,
} from "@/lib/domain/attachments";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Attachment } from "@/lib/types";

interface RegisterAttachmentUseCaseProps {
  farmId: number;
  userId: string;
  expenseId: string;
  pathname: string;
  fileName: string;
}

type RegisterAttachmentUseCaseResponse =
  | Attachment
  | "disabled"
  | "bad_path"
  | "not_found"
  | "too_many"
  | "missing_blob"
  | "too_large"
  | "bad_type";

type CurrUseCase = _UseCase<RegisterAttachmentUseCaseProps, RegisterAttachmentUseCaseResponse>;

/**
 * Records a file the browser already uploaded. The pathname must sit in this
 * farm's folder of this lançamento, and the stored blob (not what the client
 * says) must be at most 5 MB of an allowed type; a refused blob is deleted.
 */
export class RegisterAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("RegisterAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, expenseId, pathname, fileName }) => {
    if (!this.blob.enabled()) return "disabled";
    const target = parseAttachmentPathname(pathname);
    if (!target || target.farmId !== farmId || target.expenseId !== expenseId) return "bad_path";

    const [expense] = await this.repository
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.farmId, farmId), eq(expenses.id, expenseId)))
      .limit(1);
    if (!expense) return "not_found";

    const [{ total }] = await this.repository
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, expenseId)));
    if (total >= MAX_ATTACHMENTS) return "too_many";

    const file = await this.blob.head(pathname);
    if (!file) return "missing_blob";
    if (file.size > MAX_ATTACHMENT_BYTES || !isAttachmentType(file.contentType)) {
      await deleteBlobsQuietly(this.blob, [pathname]);
      return file.size > MAX_ATTACHMENT_BYTES ? "too_large" : "bad_type";
    }

    const [row] = await this.repository
      .insert(attachments)
      .values({
        id: randomUUID(),
        farmId,
        expenseId,
        pathname,
        fileName: fileName.trim().slice(0, 200) || "anexo",
        contentType: file.contentType,
        sizeBytes: file.size,
        createdBy: userId,
      })
      .returning();
    return toAttachment(row);
  };
}
```

Create `lib/api/domains/attachments/useCases/List.useCase.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { toAttachment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Attachment } from "@/lib/types";

interface ListAttachmentsUseCaseProps {
  farmId: number;
  expenseId: string;
}

type CurrUseCase = _UseCase<ListAttachmentsUseCaseProps, Attachment[]>;

/** The anexos of one lançamento of the farm, oldest first. */
export class ListAttachmentsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ListAttachmentsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, expenseId }) => {
    const rows = await this.repository
      .select()
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, expenseId)))
      .orderBy(asc(attachments.createdAt), asc(attachments.id));
    return rows.map(toAttachment);
  };
}
```

Create `lib/api/domains/attachments/useCases/Open.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface OpenAttachmentUseCaseProps {
  farmId: number;
  id: string;
}

interface OpenedAttachment {
  fileName: string;
  contentType: string;
  size: number;
  body: ReadableStream<Uint8Array>;
}

/** Null when the anexo is not on this farm or its file is gone. */
type CurrUseCase = _UseCase<OpenAttachmentUseCaseProps, OpenedAttachment | null>;

/** The bytes of an anexo of the caller's farm, read from the private store. */
export class OpenAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("OpenAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const [row] = await this.repository
      .select()
      .from(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.id, id)))
      .limit(1);
    if (!row) return null;
    const file = await this.blob.stream(row.pathname);
    if (!file) return null;
    return { fileName: row.fileName, contentType: row.contentType, size: file.size, body: file.body };
  };
}
```

Create `lib/api/domains/attachments/useCases/Delete.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteAttachmentUseCaseProps {
  farmId: number;
  id: string;
}

type CurrUseCase = _UseCase<DeleteAttachmentUseCaseProps, boolean>;

/** Removes an anexo of the farm and then its file; false when it is not there. */
export class DeleteAttachmentUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("DeleteAttachmentUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const rows = await this.repository
      .delete(attachments)
      .where(and(eq(attachments.farmId, farmId), eq(attachments.id, id)))
      .returning({ pathname: attachments.pathname });
    if (rows.length === 0) return false;
    await deleteBlobsQuietly(this.blob, rows.map((row) => row.pathname));
    return true;
  };
}
```

- [ ] **Step 7: Controller, mount and permissions.**

Create `lib/api/domains/attachments/attachments.controller.ts`:

```ts
/**
 * Anexos of the lançamentos: photos and PDFs in a private Vercel Blob store.
 * The browser uploads straight to Blob with a token from POST
 * /attachments/upload-token, then registers the file here; every read streams
 * through GET /attachments/:id. Writes need Financeiro edit, reads view
 * (routeRequirements.ts).
 */
import { Elysia } from "elysia";

import { vercelBlobStore } from "@/lib/api/blob";
import { farmPlugin } from "@/lib/api/plugins/farm";

import { DeleteAttachmentUseCase } from "./useCases/Delete.useCase";
import { IssueUploadTokenUseCase } from "./useCases/IssueUploadToken.useCase";
import { ListAttachmentsUseCase } from "./useCases/List.useCase";
import { OpenAttachmentUseCase } from "./useCases/Open.useCase";
import { RegisterAttachmentUseCase } from "./useCases/Register.useCase";
import { RegisterAttachmentBody, UploadTokenBody } from "./schemas/attachment.schema";

export const attachmentsController = new Elysia()
  .use(farmPlugin)
  .get("/attachments/status", () => ({ enabled: vercelBlobStore.enabled() }), { farm: true })
  .post(
    "/attachments/upload-token",
    async ({ farmId, body, status }) => {
      const result = await new IssueUploadTokenUseCase().run({
        farmId,
        pathname: body.payload.pathname,
      });
      if (result === "disabled") return status(503, { error: result });
      if (result === "bad_path") return status(400, { error: result });
      if (result === "not_found") return status(404, { error: result });
      if (result === "too_many") return status(409, { error: result });
      // The shape @vercel/blob/client's upload() reads back.
      return { type: "blob.generate-client-token" as const, clientToken: result.clientToken };
    },
    { farm: true, body: UploadTokenBody }
  )
  .get(
    "/expenses/:id/attachments",
    ({ farmId, params }) => new ListAttachmentsUseCase().run({ farmId, expenseId: params.id }),
    { farm: true }
  )
  .post(
    "/expenses/:id/attachments",
    async ({ farmId, user, params, body, status }) => {
      const result = await new RegisterAttachmentUseCase().run({
        farmId,
        userId: user.id,
        expenseId: params.id,
        pathname: body.pathname,
        fileName: body.fileName,
      });
      if (result === "disabled") return status(503, { error: result });
      if (result === "not_found" || result === "missing_blob") return status(404, { error: result });
      if (result === "too_many") return status(409, { error: result });
      if (result === "bad_path" || result === "too_large" || result === "bad_type") {
        return status(400, { error: result });
      }
      return result;
    },
    { farm: true, body: RegisterAttachmentBody }
  )
  .get(
    "/attachments/:id",
    async ({ farmId, params, status }) => {
      const file = await new OpenAttachmentUseCase().run({ farmId, id: params.id });
      if (!file) return status(404, { error: "not_found" });
      return new Response(file.body, {
        headers: {
          "content-type": file.contentType,
          "content-length": String(file.size),
          "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    },
    { farm: true }
  )
  .delete(
    "/attachments/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteAttachmentUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  );
```

In `lib/api/app.ts` replace

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
```

with

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { attachmentsController } from "@/lib/api/domains/attachments/attachments.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
```

In `lib/api/app.ts` replace

```ts

  /* ---- Custom herd categories, lançamentos, plano de contas -------------- */
  .use(categoriesController)
  .use(expensesController)
  .use(accountsController)
```

with

```ts

  /* ---- Custom herd categories, lançamentos, anexos, plano de contas ------ */
  .use(categoriesController)
  .use(expensesController)
  .use(attachmentsController)
  .use(accountsController)
```

In `lib/api/permissions/routeRequirements.ts` replace

```ts
  "POST /api/herd/accounts/defaults": edit("finance"),
```

with

```ts
  "POST /api/herd/accounts/defaults": edit("finance"),
  // Anexos: reading one is seeing money, writing one is editing a lançamento.
  "GET /api/herd/attachments/status": { view: "finance" },
  "POST /api/herd/attachments/upload-token": edit("finance"),
  "GET /api/herd/attachments/:id": { view: "finance" },
  "DELETE /api/herd/attachments/:id": edit("finance"),
  "GET /api/herd/expenses/:id/attachments": { view: "finance" },
  "POST /api/herd/expenses/:id/attachments": edit("finance"),
```

In `lib/api/__tests__/routeRequirements.test.ts` replace

```ts
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });
});

describe("ROUTE_REQUIREMENTS against the mounted app", () => {
```

with

```ts
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
      "GET /api/herd/attachments/:id",
      "GET /api/herd/expenses/:id/attachments",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ view: "finance" });
    }
    for (const key of [
      "POST /api/herd/attachments/upload-token",
      "DELETE /api/herd/attachments/:id",
      "POST /api/herd/expenses/:id/attachments",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });
});

describe("ROUTE_REQUIREMENTS against the mounted app", () => {
```

- [ ] **Step 8: Route test: no upload token without Financeiro edit.**

Create `lib/api/domains/attachments/__tests__/attachments.routes.test.ts`:

```ts
/**
 * The anexo routes behind the farm macro, auth and db mocked: a member who
 * only sees Financeiro may list and open anexos but gets no upload token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, issue } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  issue: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(state.membership),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/api/domains/attachments/useCases/IssueUploadToken.useCase", () => ({
  IssueUploadTokenUseCase: class {
    run = issue;
  },
}));

import { herdApi } from "@/lib/api/app";

const tokenRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/attachments/upload-token", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname: "farms/7/expenses/e-1/u-1-nf.jpg", clientPayload: null, multipart: false },
      }),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  issue.mockReset();
  issue.mockResolvedValue({ clientToken: "vercel_blob_client_x" });
});

describe("upload token", () => {
  it("is refused without Financeiro edit, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    const response = await tokenRequest();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(issue).not.toHaveBeenCalled();
  });

  it("answers in the shape @vercel/blob/client reads", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];

    const response = await tokenRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "blob.generate-client-token",
      clientToken: "vercel_blob_client_x",
    });
    expect(issue).toHaveBeenCalledWith({ farmId: 7, pathname: "farms/7/expenses/e-1/u-1-nf.jpg" });
  });
});
```

- [ ] **Step 9: Run, then update the two route snapshots on explicit paths only.**

```bash
pnpm exec vitest run lib/api/domains/attachments lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**'
```
Expected: every attachments test passes; exactly two failures, `is pinned` and `exposes exactly the documented routes` (snapshot mismatch: six new routes).

```bash
pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**' -u
```
Expected: `Snapshots 2 updated`; `git diff --stat lib/api/__tests__/__snapshots__` shows +24 and +6 lines, nothing removed.

- [ ] **Step 10: Check.**

```bash
pnpm tsc --noEmit
pnpm exec eslint lib/api lib/domain --ignore-pattern '.claude/**'
pnpm exec vitest run lib/api lib/domain --exclude '**/worktrees/**'
```
Expected: tsc and eslint silent; vitest all green.

- [ ] **Step 11: Commit.**

```bash
git add package.json \
  pnpm-lock.yaml \
  lib/domain/attachments.ts \
  lib/domain/__tests__/attachments.test.ts \
  lib/api/blob.ts \
  lib/api/__tests__/memoryBlob.ts \
  lib/api/domains/attachments \
  lib/api/app.ts \
  lib/api/permissions/routeRequirements.ts \
  lib/api/__tests__/routeRequirements.test.ts \
  lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap \
  lib/api/__tests__/__snapshots__/routeTable.test.ts.snap
git commit -m "feat(finance): anexos in a private Blob store behind the farm check"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 4: Série API — repeat on create, scoped edit and removal, top-up on load

**Files:**
- Modify: `lib/api/domains/expenses/schemas/expense.schema.ts` (`SeriesScopeModel`, `RepeatModel`, `repeat`, `scope`, `DeleteExpenseQuery`)
- Create: `lib/api/domains/expenses/useCases/{AddSeries,TopUpSeries,UpdateSeries}.useCase.ts`
- Replace: `lib/api/domains/expenses/useCases/Delete.useCase.ts`, `lib/api/domains/expenses/expenses.controller.ts`
- Create: `lib/api/domains/expenses/useCases/__tests__/{AddSeries,TopUpSeries,UpdateSeries,Delete}.test.ts`
- Modify: `lib/api/domains/herd/useCases/Load.useCase.ts` (the top-up call and its two imports only)

**Interfaces:**
- Consumes: `lib/domain/series.ts` (Task 2); `lib/api/blob.ts` and `memoryBlobStore` (Task 3); `UpdateExpenseUseCase` / `ExpensePatchInput` (existing, unchanged); `toExpense(row, series)` (Task 1).
- Produces: `POST /expenses` → `Expense[]` with `repeat`; `PATCH`/`DELETE /expenses/:id` with `scope`; `TopUpSeriesUseCase` run by every herd load. Routes and their paths are unchanged (no snapshot moves).

- [ ] **Step 1: Tests first.**

Create `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`:

```ts
/**
 * addSeries: a parcelamento writes N parcelas with the purchase's date and
 * stepped vencimentos; a recorrência writes each ocorrência on its own
 * vencimento up to a year ahead. The db stub echoes what is inserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { inserts: [] as Record<string, unknown>[][] },
}));

vi.mock("@/lib/db", () => {
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(values) ? values : [values];
        state.inserts.push(rows);
        return { returning: () => Promise.resolve(rows) };
      },
    }),
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import { AddSeriesUseCase } from "../AddSeries.useCase";

const ENTRY = {
  farmId: 7,
  todayIso: "2026-09-28",
  date: "2026-09-27",
  category: "nutrition" as const,
  counterparty: "Nutron",
  document: "NF 4.812",
};

beforeEach(() => {
  state.inserts = [];
});

describe("addSeries — parcelado", () => {
  it("creates N rows with the same date, stepped vencimentos and the centavos on the last", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      paidAt: "2026-09-27",
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({ mode: "installments", count: 3, amountBrl: 1000, generatedCount: 3, endsOn: null });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-27", "2026-09-27", "2026-09-27"]);
    expect(rows.map((row) => row.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(rows.map((row) => row.amountBrl)).toEqual([333.33, 333.33, 333.34]);
    expect(rows.map((row) => row.paidAt)).toEqual(["2026-09-27", null, null]);
    expect(rows.map((row) => row.seriesIndex)).toEqual([1, 2, 3]);
    expect(rows.every((row) => row.seriesId === series.id && row.counterparty === "Nutron")).toBe(true);
    expect(Array.isArray(result) && result.map((e) => `${e.seriesIndex}/${e.seriesCount}`)).toEqual([
      "1/3",
      "2/3",
      "3/3",
    ]);
  });

  it("refuses a first parcela before the purchase", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-09-01" },
    });
    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a parcelamento without a count", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1000,
      repeat: { mode: "installments", frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
  });
});

describe("addSeries — recorrente", () => {
  it("writes each ocorrência on its own date up to today + 12 months", async () => {
    await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "labor",
      amountBrl: 6480,
      repeat: { mode: "recurring", frequency: "monthly", dayOfMonth: 5, startsOn: "2026-10-05" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({ mode: "recurring", dayOfMonth: 5, count: null, endsOn: null, generatedCount: 12 });
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ date: "2026-10-05", dueDate: "2026-10-05", amountBrl: 6480 });
    expect(rows[11]).toMatchObject({ date: "2027-09-05", dueDate: "2027-09-05", seriesIndex: 12 });
  });

  it("stops at até", async () => {
    await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1280,
      repeat: { mode: "recurring", frequency: "monthly", dayOfMonth: 20, startsOn: "2026-10-20", endsOn: "2026-12-31" },
    });
    expect(state.inserts[1].map((row) => row.dueDate)).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
  });

  it("refuses an end before the start", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 1280,
      repeat: { mode: "recurring", frequency: "weekly", startsOn: "2026-10-20", endsOn: "2026-10-01" },
    });
    expect(result).toBe("invalid_repeat");
  });
});
```

Create `lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`:

```ts
/**
 * topUpSeries: the load writes the ocorrências that now fall inside
 * today + 12 months, after the last one generated, and nothing twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { TopUpSeriesUseCase } from "../TopUpSeries.useCase";

const SALARIO = {
  id: "s-1",
  farmId: 7,
  mode: "recurring",
  frequency: "monthly",
  dayOfMonth: 5,
  startsOn: "2026-10-05",
  endsOn: null,
  count: null,
  generatedCount: 12,
  kind: "expense",
  category: "labor",
  amountBrl: 6480,
  accountId: "acc-salarios",
  lotId: null,
  counterparty: null,
  document: null,
  notes: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
});

describe("topUpSeries", () => {
  it("writes the months that entered the window, after the last one generated", async () => {
    // Created on 2026-09-28 with 12 ocorrências (to 2027-09-05); now it is 2026-11-10.
    state.selectResults = [[SALARIO]];

    const written = await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" });

    expect(written).toBe(2);
    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows.map((row) => [row.seriesIndex, row.dueDate])).toEqual([
      [13, "2027-10-05"],
      [14, "2027-11-05"],
    ]);
    expect(rows[0]).toMatchObject({ seriesId: "s-1", date: "2027-10-05", amountBrl: 6480, accountId: "acc-salarios" });
    expect(state.updates).toEqual([{ generatedCount: 14 }]);
  });

  it("is idempotent: nothing new inside the window writes nothing", async () => {
    state.selectResults = [[{ ...SALARIO, generatedCount: 14 }]];

    expect(await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" })).toBe(0);
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("stops at até", async () => {
    state.selectResults = [[{ ...SALARIO, endsOn: "2027-09-30" }]];

    expect(await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" })).toBe(0);
  });
});
```

Create `lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`:

```ts
/**
 * updateSeries: "Esta e as próximas" and "Todas" rewrite the unpaid rows of
 * the série in scope and its template; paid rows never change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";

import { UpdateSeriesUseCase } from "../UpdateSeries.useCase";

const row = (index: number, paidAt: string | null, dueDate: string) => ({
  id: `e-${index}`,
  farmId: 7,
  kind: "expense",
  date: dueDate,
  category: "admin",
  amountBrl: 1280,
  notes: null,
  dueDate,
  paidAt,
  counterparty: "Cemig",
  document: null,
  accountId: "acc-energia",
  lotId: null,
  seriesId: "s-1",
  seriesIndex: index,
});

// Energia, todo dia 20: 1 paid, 2 open (edited), 3 paid ahead of time, 4 open.
const ROWS = [
  row(1, "2026-09-20", "2026-09-20"),
  row(2, null, "2026-10-20"),
  row(3, "2026-10-01", "2026-11-20"),
  row(4, null, "2026-12-20"),
];

const SERIES = {
  id: "s-1",
  farmId: 7,
  mode: "recurring",
  frequency: "monthly",
  dayOfMonth: 20,
  startsOn: "2026-09-20",
  endsOn: null,
  count: null,
  generatedCount: 4,
  amountBrl: 1280,
};

/** Ids an `inArray`/`eq` where of the n-th recorded condition binds. */
const params = (n: number) => renderSql(state.wheres[n] as SQL).params;

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
  state.wheres = [];
});

describe("updateSeries", () => {
  it("Esta e as próximas: rewrites the unpaid rows from this one on, never a paid one", async () => {
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], ROWS];
    state.returning = [[{ ...ROWS[1], amountBrl: 1350 }]];

    const result = await new UpdateSeriesUseCase().run({
      farmId: 7,
      id: "e-2",
      patch: { amountBrl: 1350 },
      scope: "following",
    });

    expect(result).toMatchObject({ id: "e-2", amountBrl: 1350 });
    // The row, the série template, then the siblings in scope.
    expect(state.updates).toEqual([{ amountBrl: 1350 }, { amountBrl: 1350 }, { amountBrl: 1350 }]);
    const siblings = params(state.wheres.length - 1);
    expect(siblings).toContain("e-4");
    expect(siblings).not.toContain("e-1");
    expect(siblings).not.toContain("e-3");
  });

  it("Todas: reaches every unpaid row, still no paid one", async () => {
    state.selectResults = [[ROWS[3]], [SERIES], [ROWS[3]], ROWS];
    state.returning = [[ROWS[3]]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-4", patch: { counterparty: "Cemig SA" }, scope: "all" });

    const siblings = params(state.wheres.length - 1);
    expect(siblings).toContain("e-2");
    expect(siblings).not.toContain("e-1");
    expect(siblings).not.toContain("e-3");
  });

  it("moves the day of a recorrência and re-dates the unpaid rows by position", async () => {
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], ROWS];
    state.returning = [[{ ...ROWS[1], dueDate: "2026-10-25", date: "2026-10-25" }]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-2", patch: { dueDate: "2026-10-25" }, scope: "following" });

    expect(state.updates[0]).toEqual({ dueDate: "2026-10-25", date: "2026-10-25" });
    expect(state.updates[1]).toEqual({ startsOn: "2026-09-25", dayOfMonth: 25 });
    // Only row 4 follows (row 3 is paid): 2026-12-25.
    expect(state.updates.slice(2)).toEqual([{ date: "2026-12-25", dueDate: "2026-12-25" }]);
  });

  it("never re-splits a parcelamento's value", async () => {
    const parcela = { ...ROWS[1], amountBrl: 4000 };
    state.selectResults = [[parcela], [{ ...SERIES, mode: "installments", count: 4 }], [parcela], ROWS];
    state.returning = [[{ ...parcela, amountBrl: 4100 }]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-2", patch: { amountBrl: 4100, notes: "3x no boleto" }, scope: "following" });

    expect(state.updates).toEqual([
      { amountBrl: 4100, notes: "3x no boleto" },
      { notes: "3x no boleto" },
      { notes: "3x no boleto" },
    ]);
  });
});
```

Create `lib/api/domains/expenses/useCases/__tests__/Delete.test.ts`:

```ts
/**
 * deleteExpense with a scope: removes the unpaid rows in scope, stops a
 * recorrência and deletes the anexos' files; paid rows stay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    wheres: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import type { SQL } from "drizzle-orm";
import { renderSql } from "@/lib/api/__tests__/dbStub";
import { memoryBlobStore } from "@/lib/api/__tests__/memoryBlob";

import { DeleteExpenseUseCase } from "../Delete.useCase";

const row = (index: number, paidAt: string | null) => ({
  id: `e-${index}`,
  farmId: 7,
  seriesId: "s-1",
  seriesIndex: index,
  paidAt,
  date: "2026-09-05",
  dueDate: null,
});
const ROWS = [row(1, "2026-09-05"), row(2, null), row(3, "2026-10-01"), row(4, null)];
const SERIES = { id: "s-1", mode: "recurring", frequency: "monthly", dayOfMonth: 5, startsOn: "2026-09-05", endsOn: null };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deleteExpense", () => {
  it("Esta e as próximas: removes the unpaid rows from this one on and ends the recorrência", async () => {
    const blob = memoryBlobStore({ "farms/7/expenses/e-4/u-nf.pdf": { size: 1, contentType: "application/pdf" } });
    state.selectResults = [[ROWS[1]], [SERIES], ROWS, [{ pathname: "farms/7/expenses/e-4/u-nf.pdf" }]];

    const removed = await new DeleteExpenseUseCase(undefined, blob.store).run({ farmId: 7, id: "e-2", scope: "following" });

    expect(removed).toBe(true);
    // Position 2 fell on 2026-10-05: the série now ends the day before.
    expect(state.updates).toEqual([{ endsOn: "2026-10-04" }]);
    const deleted = renderSql(state.wheres[state.wheres.length - 1] as SQL).params;
    expect(deleted).toEqual([7, "e-2", "e-4"]);
    expect(blob.deleted).toEqual(["farms/7/expenses/e-4/u-nf.pdf"]);
  });

  it("Todas: removes every unpaid row and keeps the paid ones", async () => {
    state.selectResults = [[ROWS[3]], [SERIES], ROWS, []];

    await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "e-4", scope: "all" });

    expect(renderSql(state.wheres[state.wheres.length - 1] as SQL).params).toEqual([7, "e-2", "e-4"]);
    expect(state.updates).toEqual([{ endsOn: "2026-09-04" }]);
  });

  it("Só esta removes the row alone, even from a série", async () => {
    state.selectResults = [[ROWS[1]], []];

    await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "e-2" });

    expect(renderSql(state.wheres[state.wheres.length - 1] as SQL).params).toEqual([7, "e-2"]);
    expect(state.updates).toEqual([]);
  });

  it("is false for a lançamento not on the farm", async () => {
    state.selectResults = [[]];
    expect(await new DeleteExpenseUseCase(undefined, memoryBlobStore().store).run({ farmId: 7, id: "x" })).toBe(false);
    expect(state.deletes).toBe(0);
  });
});
```

```bash
pnpm exec vitest run lib/api/domains/expenses --exclude '**/worktrees/**'
```
Expected: FAIL — AddSeries, TopUpSeries and UpdateSeries modules missing; 3 Delete tests fail ("Esta e as próximas…", "Todas…", "is false for a lançamento not on the farm": the old use case ignores `scope`).

- [ ] **Step 2: Request schemas.**

In `lib/api/domains/expenses/schemas/expense.schema.ts` replace

```ts

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/** Body of POST /expenses. A receita sends `kind: "revenue"` and `category: "other"`. */
export const NewExpenseBody = t.Object({
```

with

```ts

/** "Só esta" · "Esta e as próximas" · "Todas" (as não pagas). */
export const SeriesScopeModel = t.Union([t.Literal("one"), t.Literal("following"), t.Literal("all")]);

/** How a new lançamento repeats: N parcelas, or the same bill every week or month. */
export const RepeatModel = t.Object({
  mode: t.Union([t.Literal("installments"), t.Literal("recurring")]),
  count: t.Optional(t.Integer({ minimum: 2, maximum: 48 })),
  frequency: t.Union([t.Literal("monthly"), t.Literal("weekly")]),
  dayOfMonth: t.Optional(t.Integer({ minimum: 1, maximum: 31 })),
  startsOn: DateString,
  endsOn: t.Optional(DateString),
});

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/**
 * Body of POST /expenses. A receita sends `kind: "revenue"` and `category: "other"`.
 * With `repeat` it creates the whole série; `amountBrl` is then the total of a
 * parcelamento or the value of each ocorrência of a recorrência.
 */
export const NewExpenseBody = t.Object({
```

In `lib/api/domains/expenses/schemas/expense.schema.ts` replace

```ts
  lotId: t.Optional(t.String()),
});
```

with

```ts
  lotId: t.Optional(t.String()),
  repeat: t.Optional(RepeatModel),
});
```

In `lib/api/domains/expenses/schemas/expense.schema.ts` replace

```ts
  lotId: t.Optional(t.Nullable(t.String())),
});
```

with

```ts
  lotId: t.Optional(t.Nullable(t.String())),
  /** For a row of a série; absent = "one". */
  scope: t.Optional(SeriesScopeModel),
});

/** Query of DELETE /expenses/:id; absent scope = "one". */
export const DeleteExpenseQuery = t.Object({ scope: t.Optional(SeriesScopeModel) });
```

- [ ] **Step 3: Create a série.**

Create `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { parseISODate } from "@/lib/domain/dates";
import {
  installmentPlan,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  recurringDates,
  seriesHorizon,
} from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense, ExpenseCategory, SeriesRepeat } from "@/lib/types";

interface AddSeriesUseCaseProps {
  farmId: number;
  todayIso: string;
  kind?: EntryKind;
  /** Competência of every parcela; a recorrência ignores it (each ocorrência is its own). */
  date: string;
  category: ExpenseCategory;
  /** Total of a parcelamento; value of each ocorrência of a recorrência. */
  amountBrl: number;
  /** Paid/received on this day: the first row only. */
  paidAt?: string;
  notes?: string;
  counterparty?: string;
  document?: string;
  accountId?: string;
  lotId?: string;
  repeat: SeriesRepeat;
}

/**
 * `due_before_date` when the first parcela falls before the purchase;
 * `invalid_repeat` when a parcelamento has no valid count, a recorrência ends
 * before it starts, or nothing falls in the window.
 */
type AddSeriesUseCaseResponse = Expense[] | "due_before_date" | "invalid_repeat";

type CurrUseCase = _UseCase<AddSeriesUseCaseProps, AddSeriesUseCaseResponse>;

/**
 * Creates a série and its rows in one transaction. A parcelamento writes every
 * parcela with the purchase's `date` and stepped vencimentos, the last one
 * taking the centavos; a recorrência writes each ocorrência on its own
 * vencimento up to min(endsOn, today + 12 months), and the herd load tops up
 * the rest as time passes.
 */
export class AddSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, todayIso, repeat, kind = "expense", ...entry }) => {
    const installments = repeat.mode === "installments";
    const count = repeat.count ?? 0;
    if (installments && (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS)) {
      return "invalid_repeat";
    }
    if (installments && repeat.startsOn < entry.date) return "due_before_date";
    if (!installments && repeat.endsOn !== undefined && repeat.endsOn < repeat.startsOn) {
      return "invalid_repeat";
    }

    const dayOfMonth =
      repeat.frequency === "monthly"
        ? (repeat.dayOfMonth ?? parseISODate(repeat.startsOn).getDate())
        : null;
    const endsOn = installments ? null : (repeat.endsOn ?? null);
    const lines = installments
      ? installmentPlan(entry.amountBrl, count, repeat.startsOn, repeat.frequency).map((line) => ({
          ...line,
          date: entry.date,
        }))
      : recurringDates(
          { frequency: repeat.frequency, dayOfMonth, startsOn: repeat.startsOn, endsOn },
          1,
          seriesHorizon(todayIso)
        ).map(({ index, date }) => ({ index, date, dueDate: date, amountBrl: entry.amountBrl }));
    if (lines.length === 0) return "invalid_repeat";

    const template = {
      kind,
      category: entry.category,
      notes: entry.notes ?? null,
      counterparty: entry.counterparty ?? null,
      document: entry.document ?? null,
      accountId: entry.accountId ?? null,
      lotId: entry.lotId ?? null,
    };

    return this.repository.transaction(async (tx) => {
      const [series] = await tx
        .insert(expenseSeries)
        .values({
          id: randomUUID(),
          farmId,
          mode: repeat.mode,
          frequency: repeat.frequency,
          dayOfMonth,
          startsOn: repeat.startsOn,
          endsOn,
          count: installments ? count : null,
          generatedCount: lines.length,
          amountBrl: entry.amountBrl,
          ...template,
        })
        .returning();
      const rows = await tx
        .insert(expenses)
        .values(
          lines.map((line) => ({
            id: randomUUID(),
            farmId,
            ...template,
            date: line.date,
            dueDate: line.dueDate,
            amountBrl: line.amountBrl,
            // "Já pago" belongs to the first row; the others are bills to come.
            paidAt: line.index === 1 ? (entry.paidAt ?? null) : null,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
        )
        .returning();
      return rows
        .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))
        .map((row) => toExpense(row, series));
    });
  };
}
```

- [ ] **Step 4: Top up the recorrências.**

Create `lib/api/domains/expenses/useCases/TopUpSeries.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { recurringDates, seriesHorizon } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface TopUpSeriesUseCaseProps {
  farmId: number;
  todayIso: string;
}

/** How many ocorrências were written. */
type CurrUseCase = _UseCase<TopUpSeriesUseCaseProps, number>;

/**
 * Writes the ocorrências of the farm's recorrências that now fall inside
 * today + 12 months, continuing after the last one generated (so one removed
 * on its own never comes back). Idempotent: a second run finds nothing new,
 * and two loads racing collide on the unique (series_id, series_index) index
 * instead of doubling a bill.
 */
export class TopUpSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("TopUpSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, todayIso }) => {
    const recurring = await this.repository
      .select()
      .from(expenseSeries)
      .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.mode, "recurring")));
    const horizon = seriesHorizon(todayIso);
    let written = 0;
    for (const series of recurring) {
      const due = recurringDates(series, series.generatedCount + 1, horizon);
      if (due.length === 0) continue;
      await this.repository.transaction(async (tx) => {
        await tx
          .insert(expenses)
          .values(
            due.map(({ index, date }) => ({
              id: randomUUID(),
              farmId,
              kind: series.kind,
              date,
              dueDate: date,
              category: series.category,
              amountBrl: series.amountBrl,
              notes: series.notes,
              counterparty: series.counterparty,
              document: series.document,
              accountId: series.accountId,
              lotId: series.lotId,
              seriesId: series.id,
              seriesIndex: index,
            }))
          )
          .onConflictDoNothing();
        await tx
          .update(expenseSeries)
          .set({ generatedCount: due[due.length - 1].index })
          .where(eq(expenseSeries.id, series.id));
      });
      written += due.length;
    }
    return written;
  };
}
```

- [ ] **Step 5: Scoped edit.**

Create `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { occurrenceDate, ruleFromOccurrence, scopeRows } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense } from "@/lib/types";

import { UpdateExpenseUseCase, type ExpensePatchInput } from "./Update.useCase";

interface UpdateSeriesUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
  scope: "following" | "all";
}

/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse = Expense | "due_before_date" | null;

type CurrUseCase = _UseCase<UpdateSeriesUseCaseProps, UpdateSeriesUseCaseResponse>;

type SharedFields = Pick<
  ExpensePatchInput,
  "category" | "accountId" | "lotId" | "counterparty" | "document" | "notes" | "amountBrl"
>;

/** What an edit carries to the série's other rows: only the fields it sent. */
function sharedFields(patch: ExpensePatchInput, recurring: boolean): SharedFields {
  const { category, accountId, lotId, counterparty, document, notes, amountBrl } = patch;
  // A parcela's value is edited per parcela: the total is never re-split.
  const fields: SharedFields = {
    category,
    accountId,
    lotId,
    counterparty,
    document,
    notes,
    amountBrl: recurring ? amountBrl : undefined,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as SharedFields;
}

/**
 * "Esta e as próximas" / "Todas" on a row of a série. The row itself takes the
 * whole patch; the série's template and every UNPAID row in scope take the
 * shared fields (conta, lote, pago para, documento, observação, and the valor
 * of a recorrência). Moving an ocorrência's vencimento moves the rule: its day
 * becomes the série's day and every unpaid row in scope is re-dated by its
 * position, in place (ids and anexos survive). Paid rows never change.
 */
export class UpdateSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch, scope }) =>
    this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
        .limit(1);
      if (!current) return null;
      const alone = () => new UpdateExpenseUseCase(tx).run({ farmId, id, patch });
      if (current.seriesId === null || current.seriesIndex === null) return alone();
      const [series] = await tx
        .select()
        .from(expenseSeries)
        .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, current.seriesId)))
        .limit(1);
      if (!series) return alone();

      const recurring = series.mode === "recurring";
      const dueDate = patch.dueDate ?? null;
      const moved = recurring && dueDate !== null && dueDate !== (current.dueDate ?? current.date);
      // An ocorrência's data is its vencimento: moving one moves both.
      const updated = await new UpdateExpenseUseCase(tx).run({
        farmId,
        id,
        patch: moved ? { ...patch, date: dueDate } : patch,
      });
      if (updated === null || updated === "due_before_date") return updated;

      const shared = sharedFields(patch, recurring);
      const rule = moved ? ruleFromOccurrence(series.frequency, current.seriesIndex, dueDate) : null;
      if (Object.keys(shared).length === 0 && rule === null) return updated;

      await tx
        .update(expenseSeries)
        .set({ ...shared, ...rule })
        .where(eq(expenseSeries.id, series.id));

      const siblings = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.seriesId, series.id)));
      const targets = scopeRows(siblings, current.seriesIndex, scope).filter((row) => row.id !== id);
      if (targets.length === 0) return updated;

      if (rule === null) {
        await tx
          .update(expenses)
          .set(shared)
          .where(and(eq(expenses.farmId, farmId), inArray(expenses.id, targets.map((row) => row.id))));
        return updated;
      }
      // ponytail: a row the move pushes past endsOn stays; the next edit or removal settles it.
      const next = { frequency: series.frequency, ...rule };
      for (const row of targets) {
        const date = occurrenceDate(next, row.seriesIndex ?? 0);
        await tx
          .update(expenses)
          .set({ ...shared, date, dueDate: date })
          .where(and(eq(expenses.farmId, farmId), eq(expenses.id, row.id)));
      }
      return updated;
    });
}
```

- [ ] **Step 6: Scoped removal that also deletes the anexos' files.**

Replace the whole of `lib/api/domains/expenses/useCases/Delete.useCase.ts` with:

```ts
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenseSeries, expenses } from "@/lib/db/schema";
import { deleteBlobsQuietly, vercelBlobStore, type BlobStore } from "@/lib/api/blob";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { addDays } from "@/lib/domain/dates";
import { occurrenceDate, scopeRows } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SeriesScope } from "@/lib/types";

interface DeleteExpenseUseCaseProps {
  farmId: number;
  id: string;
  /** For a row of a série; absent = "one". */
  scope?: SeriesScope;
}

/** False when the expense does not exist on this farm. */
type DeleteExpenseUseCaseResponse = boolean;

type CurrUseCase = _UseCase<DeleteExpenseUseCaseProps, DeleteExpenseUseCaseResponse>;

/**
 * Removes a lançamento — or, on a row of a série, "Esta e as próximas" (the
 * unpaid rows from it on) or "Todas" (every unpaid row). A recorrência also
 * stops: its `endsOn` becomes the day before the first position removed, so
 * the load writes nothing after it. Paid rows stay. The anexos' files go after
 * the rows; a failure there is logged and never blocks the removal.
 */
export class DeleteExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;
  private blob: BlobStore;

  constructor(repo: RepositoryType = db, blob: BlobStore = vercelBlobStore) {
    __throwOnBrowser("DeleteExpenseUseCase.constructor");
    this.repository = repo;
    this.blob = blob;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, scope = "one" }) => {
    const pathnames = await this.repository.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.farmId, farmId), eq(expenses.id, id)))
        .limit(1);
      if (!current) return null;

      let ids = [id];
      if (scope !== "one" && current.seriesId !== null && current.seriesIndex !== null) {
        const [series] = await tx
          .select()
          .from(expenseSeries)
          .where(and(eq(expenseSeries.farmId, farmId), eq(expenseSeries.id, current.seriesId)))
          .limit(1);
        const siblings = await tx
          .select()
          .from(expenses)
          .where(and(eq(expenses.farmId, farmId), eq(expenses.seriesId, current.seriesId)));
        ids = scopeRows(siblings, current.seriesIndex, scope).map((row) => row.id);
        if (series?.mode === "recurring") {
          const cut = addDays(occurrenceDate(series, scope === "all" ? 1 : current.seriesIndex), -1);
          const endsOn = series.endsOn !== null && series.endsOn < cut ? series.endsOn : cut;
          await tx.update(expenseSeries).set({ endsOn }).where(eq(expenseSeries.id, series.id));
        }
      }
      if (ids.length === 0) return [];

      const files = await tx
        .select({ pathname: attachments.pathname })
        .from(attachments)
        .where(and(eq(attachments.farmId, farmId), inArray(attachments.expenseId, ids)));
      await tx.delete(expenses).where(and(eq(expenses.farmId, farmId), inArray(expenses.id, ids)));
      return files.map((file) => file.pathname);
    });
    if (pathnames === null) return false;
    if (pathnames.length > 0) await deleteBlobsQuietly(this.blob, pathnames);
    return true;
  };
}
```

- [ ] **Step 7: Controller.**

Replace the whole of `lib/api/domains/expenses/expenses.controller.ts` with:

```ts
/**
 * Farm lançamentos — the despesas that do not arrive through a sanitary
 * treatment and the receitas that do not come from a venda, with their
 * vencimento, pagamento, conta and lote. A lançamento may repeat: POST with
 * `repeat` creates a parcelamento or a recorrência, and PATCH/DELETE on one
 * of its rows take a `scope` ("one" · "following" · "all").
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { AddSeriesUseCase } from "./useCases/AddSeries.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { UpdateExpenseUseCase } from "./useCases/Update.useCase";
import { UpdateSeriesUseCase } from "./useCases/UpdateSeries.useCase";
import { DeleteExpenseQuery, NewExpenseBody, UpdateExpenseBody } from "./schemas/expense.schema";

export const expensesController = new Elysia({ prefix: "/expenses" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const { repeat, ...entry } = body;
      // Every created row: one, or the whole série.
      const result = repeat
        ? await new AddSeriesUseCase().run({ farmId, todayIso: todayISO(), ...entry, repeat })
        : await new AddExpenseUseCase().run({ farmId, ...entry });
      if (result === "due_before_date" || result === "invalid_repeat") {
        return status(400, { error: result });
      }
      return Array.isArray(result) ? result : [result];
    },
    { farm: true, body: NewExpenseBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const { scope = "one", ...patch } = body;
      const result =
        scope === "one"
          ? await new UpdateExpenseUseCase().run({ farmId, id: params.id, patch })
          : await new UpdateSeriesUseCase().run({ farmId, id: params.id, patch, scope });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "due_before_date") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateExpenseBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, query, status }) => {
      const removed = await new DeleteExpenseUseCase().run({
        farmId,
        id: params.id,
        scope: query.scope,
      });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true, query: DeleteExpenseQuery }
  );
```

- [ ] **Step 8: The load tops up before it reads.**

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
import { herdMovements } from "@/lib/domain/movements";
import {
```

with

```ts
import { herdMovements } from "@/lib/domain/movements";
import { todayISO } from "@/lib/domain/dates";
import { TopUpSeriesUseCase } from "@/lib/api/domains/expenses/useCases/TopUpSeries.useCase";
import {
```

In `lib/api/domains/herd/useCases/Load.useCase.ts` replace

```ts
  public run: CurrUseCase["run"] = async ({ farmId }) => {
    const [
```

with

```ts
  public run: CurrUseCase["run"] = async ({ farmId }) => {
    // Recorrências keep a year of bills ahead in Contas: write what now falls in the window.
    await new TopUpSeriesUseCase(this.repository).run({ farmId, todayIso: todayISO() });

    const [
```

- [ ] **Step 9: Check.**

```bash
pnpm exec vitest run lib/api/domains/expenses lib/api/__tests__/permissions.test.ts lib/api/__tests__/routeTable.test.ts lib/api/__tests__/routeRequirements.test.ts --exclude '**/worktrees/**'
pnpm tsc --noEmit
```
Expected: vitest all green (routes unchanged: POST/PATCH/DELETE /expenses keep their paths). tsc reports exactly one error, `lib/store/useHerdStore.ts(…): error TS2352: Conversion of type 'Expense[]' to type 'Expense'` in `addExpense` — POST /expenses now answers every created row; Task 5 clears it. Any other error is a bug here.

- [ ] **Step 10: Commit.**

```bash
git add lib/api/domains/expenses/schemas/expense.schema.ts \
  lib/api/domains/expenses/useCases/AddSeries.useCase.ts \
  lib/api/domains/expenses/useCases/TopUpSeries.useCase.ts \
  lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts \
  lib/api/domains/expenses/useCases/Delete.useCase.ts \
  lib/api/domains/expenses/expenses.controller.ts \
  lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts \
  lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts \
  lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts \
  lib/api/domains/expenses/useCases/__tests__/Delete.test.ts \
  lib/api/domains/herd/useCases/Load.useCase.ts
git commit -m "feat(finance): parcelamentos and recorrências in the lançamentos API"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 5: Store — rows of a série, scopes and anexos

**Files:**
- Modify: `lib/store/useHerdStore.ts` (type imports, one domain import, the `HerdStore` interface members for lançamentos, the `addExpense`…`removeExpense` implementations, four new anexo actions)

**Interfaces:**
- Consumes: the routes of Tasks 3–4 through Eden (`api.expenses`, `api.attachments`); `attachmentContentType`, `attachmentPathname` (Task 3); `upload` from `@vercel/blob/client`, imported lazily so it stays out of the first bundle; `reloadHerd` (existing).
- Produces: the store API of "Shared interfaces". Existing callers keep compiling: `markExpensePaid` goes through `updateExpense(id, { paidAt })` with scope "one"; `EntryDialog` awaits `addExpense` and ignores the rows until Task 8.

- [ ] **Step 1: Store actions.**

In `lib/store/useHerdStore.ts` replace

```ts
  Animal,
  Breeding,
```

with

```ts
  Animal,
  Attachment,
  Breeding,
```

In `lib/store/useHerdStore.ts` replace

```ts
  SemenPurchase,
  Sex,
```

with

```ts
  SemenPurchase,
  SeriesRepeat,
  SeriesScope,
  Sex,
```

In `lib/store/useHerdStore.ts` replace

```ts
import { todayISO } from "@/lib/domain/dates";
import { localApply, localStartSession } from "@/lib/offline/localApply";
```

with

```ts
import { todayISO } from "@/lib/domain/dates";
import { attachmentContentType, attachmentPathname } from "@/lib/domain/attachments";
import { localApply, localStartSession } from "@/lib/offline/localApply";
```

In `lib/store/useHerdStore.ts` replace

```ts
  removeProtocol: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  /** Saves the sent fields of a lançamento and keeps the server's row. */
  updateExpense: (id: string, patch: ExpensePatch) => Promise<void>;
  /** Marks a lançamento paid/received on `paidAt`, or pendente again with null. */
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  /** Creates a conta; null when its grupo already has that name (409). */
```

with

```ts
  removeProtocol: (id: string) => Promise<void>;
  /**
   * Lança a despesa or receita — with `repeat`, the whole parcelamento or
   * recorrência — and resolves every row created, first position first.
   */
  addExpense: (e: Omit<Expense, "id">, repeat?: SeriesRepeat) => Promise<Expense[]>;
  /**
   * Saves the sent fields of a lançamento and keeps the server's row. On a row
   * of a série, "following"/"all" rewrite its other rows too, so the herd is
   * re-read.
   */
  updateExpense: (id: string, patch: ExpensePatch, scope?: SeriesScope) => Promise<void>;
  /** Marks a lançamento paid/received on `paidAt`, or pendente again with null. */
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
  /** Whether this environment stores anexos (a Blob token is configured). */
  attachmentsEnabled: () => Promise<boolean>;
  /** The anexos of a lançamento, oldest first. */
  listAttachments: (expenseId: string) => Promise<Attachment[]>;
  /**
   * Uploads a file straight to the Blob store with a token from our API, then
   * registers it on the lançamento. `onProgress` gets 0–100.
   */
  uploadAttachment: (
    expenseId: string,
    file: File,
    onProgress?: (percentage: number) => void
  ) => Promise<Attachment>;
  removeAttachment: (attachment: Attachment) => Promise<void>;
  /** Creates a conta; null when its grupo already has that name (409). */
```

In `lib/store/useHerdStore.ts` replace

```ts

  addExpense: async (e) => {
    const { data, error } = await api.expenses.post(e);
    if (error) apiFail("lançar a despesa", error);
    const expense = data as Expense;
    set((s) => ({ expenses: [...s.expenses, expense] }));
  },

  updateExpense: async (id, patch) => {
    const { data, error } = await api.expenses({ id }).patch(patch);
    if (error) apiFail("salvar o lançamento", error);
    const expense = data as Expense;
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
  },
```

with

```ts

  addExpense: async (e, repeat) => {
    const { data, error } = await api.expenses.post(repeat ? { ...e, repeat } : e);
    if (error) apiFail("lançar a despesa", error);
    const created = data as Expense[];
    set((s) => ({ expenses: [...s.expenses, ...created] }));
    return created;
  },

  updateExpense: async (id, patch, scope = "one") => {
    const { data, error } = await api.expenses({ id }).patch({ ...patch, scope });
    if (error) apiFail("salvar o lançamento", error);
    if (scope !== "one") {
      await reloadHerd(set);
      return;
    }
    const expense = data as Expense;
    // The row's série and anexos did not change: keep what the load gave it.
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === id
          ? {
              ...expense,
              seriesCount: e.seriesCount,
              seriesFrequency: e.seriesFrequency,
              seriesDay: e.seriesDay,
              attachmentCount: e.attachmentCount,
            }
          : e
      ),
    }));
  },
```

In `lib/store/useHerdStore.ts` replace

```ts

  removeExpense: async (id) => {
    const { error } = await api.expenses({ id }).delete();
    if (error) apiFail("remover a despesa", error);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },
```

with

```ts

  removeExpense: async (id, scope = "one") => {
    const { error } = await api.expenses({ id }).delete(undefined, { query: { scope } });
    if (error) apiFail("remover a despesa", error);
    if (scope !== "one") {
      await reloadHerd(set);
      return;
    }
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },

  attachmentsEnabled: async () => {
    const { data, error } = await api.attachments.status.get();
    return !error && data.enabled;
  },

  listAttachments: async (expenseId) => {
    const { data, error } = await api.expenses({ id: expenseId }).attachments.get();
    if (error) apiFail("carregar os anexos", error);
    return data as Attachment[];
  },

  uploadAttachment: async (expenseId, file, onProgress) => {
    const farmId = get().activeFarmId;
    if (farmId === null) throw new Error("no active farm for the upload");
    const { upload } = await import("@vercel/blob/client");
    let pathname: string;
    try {
      const blob = await upload(
        attachmentPathname(farmId, expenseId, crypto.randomUUID(), file.name),
        file,
        {
          access: "private",
          handleUploadUrl: "/api/herd/attachments/upload-token",
          headers: { "x-farm-id": String(farmId) },
          contentType: attachmentContentType(file.name, file.type),
          onUploadProgress: ({ percentage }) => onProgress?.(percentage),
        }
      );
      pathname = blob.pathname;
    } catch (error) {
      toast.error(`Não foi possível enviar ${file.name}. Tente novamente.`);
      throw error;
    }
    const { data, error } = await api
      .expenses({ id: expenseId })
      .attachments.post({ pathname, fileName: file.name });
    if (error) apiFail("salvar o anexo", error);
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === expenseId ? { ...e, attachmentCount: (e.attachmentCount ?? 0) + 1 } : e
      ),
    }));
    return data as Attachment;
  },

  removeAttachment: async (attachment) => {
    const { error } = await api.attachments({ id: attachment.id }).delete();
    if (error) apiFail("remover o anexo", error);
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === attachment.expenseId
          ? { ...e, attachmentCount: Math.max(0, (e.attachmentCount ?? 0) - 1) }
          : e
      ),
    }));
  },
```

- [ ] **Step 2: Check.**

```bash
pnpm tsc --noEmit
pnpm exec eslint lib/store --ignore-pattern '.claude/**'
pnpm exec vitest run lib/store --exclude '**/worktrees/**'
```
Expected: tsc silent (Task 4's store error is gone); eslint silent; vitest green.

- [ ] **Step 3: Commit.**

```bash
git add lib/store/useHerdStore.ts
git commit -m "feat(finance): store actions for séries, scopes and anexos"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 6: Financeiro sub-navigation

**Files:**
- Create: `components/finance/FinanceSubnav.tsx`
- Modify: `app/(app)/finance/page.tsx` (import + one line under `FinanceHeader`), `components/finance/extrato/ExtratoPage.tsx` (drops the "← Financeiro" link, which the sub-navigation replaces, with its `Link`/`ArrowLeft` imports; one line under `PageHeader`)

**Interfaces:**
- Consumes: `periodSearch`, `Period` from `lib/domain/period.ts`.
- Produces: `FinanceSubnav({ current, period })`. Later Financeiro pages add their section to `SECTIONS`. `current` is a prop, not `usePathname()`: with the app's `proxy.ts`, Next warns that `usePathname` can mismatch on hydration (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`).

- [ ] **Step 1: The component.**

Create `components/finance/FinanceSubnav.tsx`:

```tsx
import Link from "next/link";
import { periodSearch, type Period } from "@/lib/domain/period";
import { cn } from "@/lib/utils";

export type FinanceSection = "painel" | "extrato";

/** The Financeiro pages; later cycles add Contas bancárias, Orçamento, Estoque, Patrimônio. */
const SECTIONS: readonly { key: FinanceSection; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/finance" },
  { key: "extrato", label: "Extrato", href: "/finance/extrato" },
];

/**
 * Sub-navigation under the PageHeader of every Financeiro page: a tab row on
 * desktop, a row of pills that scrolls sideways on the phone. The window
 * (?de&ate) goes along. `current` comes from the page rather than
 * usePathname, which can mismatch on hydration behind the proxy.
 */
export function FinanceSubnav({ current, period }: { current: FinanceSection; period: Period }) {
  return (
    <nav aria-label="Seções do Financeiro" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-2 md:w-auto md:gap-6 md:border-b md:border-hairline">
        {SECTIONS.map((section) => {
          const active = section.key === current;
          return (
            <Link
              key={section.key}
              href={`${section.href}?${periodSearch(period)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
                "md:-mb-px md:h-10 md:min-h-0 md:rounded-none md:border-0 md:border-b-2 md:px-0",
                active
                  ? "border-brand bg-brand-soft font-medium text-ink md:border-brand md:bg-transparent"
                  : "border-hairline bg-panel text-ink-soft hover:text-ink md:border-transparent md:bg-transparent"
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Under the Painel's header.**

In `app/(app)/finance/page.tsx` replace

```tsx
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { CashStrip } from "@/components/finance/CashStrip";
```

with

```tsx
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { CashStrip } from "@/components/finance/CashStrip";
```

In `app/(app)/finance/page.tsx` replace

```tsx

      <CashStrip cash={cash} />
```

with

```tsx

      <FinanceSubnav current="painel" period={period} />

      <CashStrip cash={cash} />
```

- [ ] **Step 3: Under the Extrato's header, replacing its back link.**

In `components/finance/extrato/ExtratoPage.tsx` replace

```tsx
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Receipt, SearchX } from "lucide-react";
import type { AccountGroup } from "@/lib/types";
```

with

```tsx
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Receipt, SearchX } from "lucide-react";
import type { AccountGroup } from "@/lib/types";
```

In `components/finance/extrato/ExtratoPage.tsx` replace

```tsx
import { EntryDialog } from "@/components/finance/EntryDialog";
import { LancarButton } from "@/components/finance/LancarButton";
```

with

```tsx
import { EntryDialog } from "@/components/finance/EntryDialog";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { LancarButton } from "@/components/finance/LancarButton";
```

In `components/finance/extrato/ExtratoPage.tsx` replace

```tsx
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <Link
        href={`/finance?${periodSearch(period)}`}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Financeiro
      </Link>

      <PageHeader
```

with

```tsx
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <PageHeader
```

In `components/finance/extrato/ExtratoPage.tsx` replace

```tsx

      <ExtratoFilters
```

with

```tsx

      <FinanceSubnav current="extrato" period={period} />

      <ExtratoFilters
```

- [ ] **Step 4: Check.**

```bash
pnpm tsc --noEmit
pnpm exec eslint components/finance 'app/(app)/finance' --ignore-pattern '.claude/**'
```
Expected: silent (from Wave 1 on, tsc may still show Task 4's one store error if Task 5 has not landed; nothing in these files).

- [ ] **Step 5: Commit.**

```bash
git add components/finance/FinanceSubnav.tsx \
  'app/(app)/finance/page.tsx' \
  components/finance/extrato/ExtratoPage.tsx
git commit -m "feat(finance): Painel · Extrato sub-navigation"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 7: Markers, the scope choice and “Ver anexos”

**Files:**
- Create: `components/finance/SeriesMarkers.tsx`, `components/finance/SeriesScopeDialog.tsx`, `components/finance/attachments/AttachmentTile.tsx`, `components/finance/attachments/AttachmentsDialog.tsx`
- Modify: `components/finance/BillsCard.tsx`, `components/finance/RecentEntriesCard.tsx`, `components/finance/extrato/ExtratoTable.tsx`, `components/finance/extrato/ExtratoList.tsx`
- Replace: `components/finance/extrato/RowActions.tsx`

**Interfaces:**
- Consumes: `installmentLabel`, `recurrenceLabel`, `monthYear` (Task 2); `formatBytes`, `fileCountLabel` (Task 3); store `accounts`, `expenses`, `removeExpense(id, scope)`, `listAttachments` (Task 5); `getActiveFarmId` for the `x-farm-id` header of the file fetch.
- Produces: the marker components, `SeriesScopeDialog`, `SavedAttachmentTile` / `PendingFileTile` / `useAttachmentUrl`, `AttachmentsDialog`. RowActions now renders for a Financeiro **view** member when the row has anexos (only "Ver anexos"); Editar / Marcar / Remover stay behind edit. Removing a row of a série opens the scope choice instead of the plain confirmation.

- [ ] **Step 1: Markers.**

Create `components/finance/SeriesMarkers.tsx`:

```tsx
/**
 * What marks a row of a série or with anexos, on Contas, Últimos lançamentos
 * and the Extrato: the "2/3" chip of a parcela, the repeat icon with "todo dia
 * 20" of an ocorrência, the paperclip with the count of anexos.
 */
import { Paperclip, Repeat } from "lucide-react";
import type { Expense } from "@/lib/types";
import { installmentLabel, recurrenceLabel } from "@/lib/domain/series";

export function InstallmentChip({ expense }: { expense: Expense | null }) {
  const label = expense ? installmentLabel(expense) : null;
  if (!expense || !label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-4 font-medium text-ink">
      <span aria-hidden>{label}</span>
      <span className="sr-only">
        parcela {expense.seriesIndex} de {expense.seriesCount}
      </span>
    </span>
  );
}

export function RecurrenceTag({ expense }: { expense: Expense | null }) {
  const label = expense ? recurrenceLabel(expense) : null;
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-ink-soft">
      <Repeat className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function AttachmentCount({ expense }: { expense: Expense | null }) {
  const count = expense?.attachmentCount ?? 0;
  if (count === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] leading-4 text-ink-soft">
      <Paperclip className="size-3" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{count === 1 ? "1 anexo" : `${count} anexos`}</span>
    </span>
  );
}
```

- [ ] **Step 2: The scope choice.**

Create `components/finance/SeriesScopeDialog.tsx`:

```tsx
"use client";

/**
 * "Só esta" · "Esta e as próximas" · "Todas": where an edit or a removal of a
 * row of a parcelamento or recorrência applies. Paid rows never change; the
 * copy says so.
 */
import { useState } from "react";
import type { Expense, SeriesScope } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { monthYear } from "@/lib/domain/series";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SeriesScopeDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense: Expense;
  action: "edit" | "remove";
  /** The valor before and after the edit, when it changed. */
  amountChange?: { from: number; to: number } | null;
  busy?: boolean;
  onConfirm(scope: SeriesScope): void;
}

export function SeriesScopeDialog({
  open,
  onOpenChange,
  expense,
  action,
  amountChange,
  busy = false,
  onConfirm,
}: SeriesScopeDialogProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const [scope, setScope] = useState<SeriesScope>("following");

  const recurring = expense.seriesFrequency !== undefined;
  const edit = action === "edit";
  const noun = recurring ? "recorrência" : "parcelamento";
  const rows = expenses.filter((e) => e.seriesId === expense.seriesId);
  const unpaid = rows.filter((e) => !e.paidAt).length;
  const firstDue = rows.map(effectiveDueDate).sort()[0] ?? effectiveDueDate(expense);
  const due = effectiveDueDate(expense);
  const group = expense.kind === "revenue" ? "revenue" : expense.category;
  const name = [accountName(expense.accountId, accounts) ?? ACCOUNT_GROUP_LABEL[group], expense.counterparty]
    .filter(Boolean)
    .join(" · ");
  const items = recurring ? "contas" : "parcelas";

  const options: { scope: SeriesScope; label: string; hint: string }[] = [
    {
      scope: "one",
      label: "Só esta",
      hint: recurring
        ? `a conta de ${formatDate(due)}`
        : `a parcela ${expense.seriesIndex}/${expense.seriesCount}`,
    },
    {
      scope: "following",
      label: "Esta e as próximas",
      hint: `${formatDate(due).slice(0, 5)} em diante · as anteriores ficam como estão`,
    },
    {
      scope: "all",
      label: "Todas",
      hint: edit
        ? `as ${rows.length} ${items} desde ${monthYear(firstDue)} · as já pagas guardam o valor pago`
        : `as ${unpaid} não pagas · as já pagas ficam`,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Editar" : "Remover"} {noun}
          </DialogTitle>
          <DialogDescription>
            {name} · <InstallmentChip expense={expense} />
            <RecurrenceTag expense={expense} />.
            {edit && amountChange ? (
              <>
                {" "}
                O valor passa de <span className="font-mono">{formatCurrency(amountChange.from)}</span> para{" "}
                <span className="font-mono">{formatCurrency(amountChange.to)}</span>.
              </>
            ) : null}{" "}
            {edit ? "Onde aplicar?" : "O que remover?"}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">
            {edit ? "Aplicar a mudança em" : "Remover"}
          </legend>
          {options.map((option) => (
            <label
              key={option.scope}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                scope === option.scope ? "border-brand bg-brand-soft" : "border-hairline"
              )}
            >
              <input
                type="radio"
                name="series-scope"
                checked={scope === option.scope}
                onChange={() => setScope(option.scope)}
                className="mt-0.5 size-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-9"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={edit ? "default" : "destructive"}
            className="min-h-11 md:min-h-9"
            disabled={busy}
            onClick={() => onConfirm(scope)}
          >
            {edit ? "Salvar" : busy ? "Removendo…" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Anexo tiles and the viewer.**

Create `components/finance/attachments/AttachmentTile.tsx`:

```tsx
"use client";

/**
 * One anexo as a tile: the photo itself or a PDF icon, its name and size, a
 * remove button in the corner and, while it uploads, a progress bar. A saved
 * anexo is fetched through GET /api/herd/attachments/:id (with the farm
 * header) into an object URL, which the tile shows and opens.
 */
import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { getActiveFarmId } from "@/lib/api/activeFarm";
import { formatBytes } from "@/lib/domain/attachments";
import { cn } from "@/lib/utils";

/** Object URL of a saved anexo's bytes; null until fetched (or when it fails). */
export function useAttachmentUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const farmId = getActiveFarmId();
    fetch(`/api/herd/attachments/${id}`, {
      headers: farmId === null ? undefined : { "x-farm-id": String(farmId) },
    })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}

/** A data URL of a local photo for its preview; null for a PDF. */
function useImagePreview(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return url;
}

interface TileProps {
  name: string;
  sizeBytes: number;
  contentType: string;
  url: string | null;
  /** Saved anexos open in a new tab; a file still on the phone does not. */
  openable?: boolean;
  /** 0–100 while uploading. */
  progress?: number | null;
  error?: string | null;
  onRemove?: () => void;
  removing?: boolean;
}

function Tile({ name, sizeBytes, contentType, url, openable, progress, error, onRemove, removing }: TileProps) {
  const image = contentType.startsWith("image/") && contentType !== "image/heic";
  const preview = (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-hairline bg-surface">
      {image && url ? (
        // An object URL of the anexo's bytes: next/image cannot optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-ink-soft">
          <FileText className="size-6" aria-hidden />
          <span className="text-[11px] font-medium">{contentType === "application/pdf" ? "PDF" : "Foto"}</span>
        </span>
      )}
    </span>
  );
  return (
    <li className="relative flex min-w-0 flex-col gap-1">
      {openable && url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`Abrir ${name}`}>
          {preview}
        </a>
      ) : (
        preview
      )}
      {progress != null ? (
        <span className="absolute inset-x-1 top-[calc(100%-3.25rem)] h-1 overflow-hidden rounded-full bg-hairline">
          <span className="block h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remover ${name}`}
          className="absolute -top-2 -right-2 flex size-11 items-center justify-center md:size-7"
        >
          <span className="flex size-6 items-center justify-center rounded-full border border-hairline bg-panel text-ink-soft shadow-sm hover:text-overdue">
            <X className="size-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
      <span className="truncate text-xs text-ink">{name}</span>
      <span className={cn("font-mono text-[11px]", error ? "text-overdue" : "text-ink-soft")}>
        {error ?? (progress != null ? `${Math.round(progress)}%` : formatBytes(sizeBytes))}
      </span>
    </li>
  );
}

export function SavedAttachmentTile({
  attachment,
  onRemove,
  removing,
}: {
  attachment: Attachment;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const url = useAttachmentUrl(attachment.id);
  return (
    <Tile
      name={attachment.fileName}
      sizeBytes={attachment.sizeBytes}
      contentType={attachment.contentType}
      url={url}
      openable
      onRemove={onRemove}
      removing={removing}
    />
  );
}

export function PendingFileTile({
  file,
  contentType,
  progress,
  error,
  onRemove,
}: {
  file: File;
  contentType: string;
  progress?: number | null;
  error?: string | null;
  onRemove?: () => void;
}) {
  const url = useImagePreview(file);
  return (
    <Tile
      name={file.name}
      sizeBytes={file.size}
      contentType={contentType}
      url={url}
      progress={progress}
      error={error}
      onRemove={onRemove}
    />
  );
}
```

Create `components/finance/attachments/AttachmentsDialog.tsx`:

```tsx
"use client";

/** "Ver anexos": the photos and PDFs of a lançamento, each opening in a new tab. */
import { useEffect, useState } from "react";
import type { Attachment, Expense } from "@/lib/types";
import { fileCountLabel } from "@/lib/domain/attachments";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { SavedAttachmentTile } from "@/components/finance/attachments/AttachmentTile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AttachmentsDialog({
  expense,
  onOpenChange,
}: {
  expense: Expense;
  onOpenChange(open: boolean): void;
}) {
  const listAttachments = useHerdStore((s) => s.listAttachments);
  const [list, setList] = useState<Attachment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAttachments(expense.id)
      .then((found) => {
        if (!cancelled) setList(found);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expense.id, listAttachments]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anexos</DialogTitle>
          <DialogDescription>
            {list === null ? "Carregando…" : `${fileCountLabel(list.length)} · toque para abrir`}
          </DialogDescription>
        </DialogHeader>
        {list !== null && list.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum anexo neste lançamento.</p>
        ) : null}
        {list !== null && list.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {list.map((attachment) => (
              <SavedAttachmentTile key={attachment.id} attachment={attachment} />
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Contas.**

In `components/finance/BillsCard.tsx` replace

```tsx
import { LancarButton } from "@/components/finance/LancarButton";
import { EmptyState } from "@/components/ui/empty-state";
```

with

```tsx
import { LancarButton } from "@/components/finance/LancarButton";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { EmptyState } from "@/components/ui/empty-state";
```

In `components/finance/BillsCard.tsx` replace

```tsx
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{title}</p>
                    {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                  </div>
```

with

```tsx
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="truncate">{title}</span>
                      <InstallmentChip expense={entry} />
                    </p>
                    <p className="mt-px flex items-center gap-1 text-xs text-ink-soft empty:hidden">
                      <AttachmentCount expense={entry} />
                      {detail ? <span className="truncate">{detail}</span> : null}
                      <RecurrenceTag expense={entry} />
                    </p>
                  </div>
```

- [ ] **Step 5: Últimos lançamentos.**

In `components/finance/RecentEntriesCard.tsx` replace

```tsx
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";
```

with

```tsx
import { SectionCard } from "@/components/ui/section-card";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { cn } from "@/lib/utils";
```

In `components/finance/RecentEntriesCard.tsx` replace

```tsx
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {title}
                    {row.locked ? (
                      <span className="text-[11px] font-normal text-ink-soft"> · automático</span>
                    ) : null}
                  </p>
                  {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                </div>
```

with

```tsx
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <span className="truncate">
                      {title}
                      {row.locked ? (
                        <span className="text-[11px] font-normal text-ink-soft"> · automático</span>
                      ) : null}
                    </span>
                    <InstallmentChip expense={row.expense} />
                  </p>
                  <p className="mt-px flex items-center gap-1 text-xs text-ink-soft empty:hidden">
                    <AttachmentCount expense={row.expense} />
                    {detail ? <span className="truncate">{detail}</span> : null}
                    <RecurrenceTag expense={row.expense} />
                  </p>
                </div>
```

- [ ] **Step 6: Extrato table and list.**

In `components/finance/extrato/ExtratoTable.tsx` replace

```tsx
import { RowActions } from "@/components/finance/extrato/RowActions";
import { cn } from "@/lib/utils";
```

with

```tsx
import { RowActions } from "@/components/finance/extrato/RowActions";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { cn } from "@/lib/utils";
```

In `components/finance/extrato/ExtratoTable.tsx` replace

```tsx
              <TableCell className="min-w-36 whitespace-normal">
                <span className="block font-medium text-ink">{row.account ?? row.groupLabel}</span>
                {row.account ? (
                  <span className="block text-xs text-ink-soft">{row.groupLabel}</span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-44 whitespace-normal text-ink">{row.counterparty ?? "—"}</TableCell>
              <TableCell className="max-w-36 font-mono text-xs whitespace-normal text-ink">
                {row.document ?? "—"}
              </TableCell>
```

with

```tsx
              <TableCell className="min-w-36 whitespace-normal">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  {row.account ?? row.groupLabel}
                  <InstallmentChip expense={row.expense} />
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-soft empty:hidden">
                  {row.account ? <span>{row.groupLabel}</span> : null}
                  <RecurrenceTag expense={row.expense} />
                </span>
              </TableCell>
              <TableCell className="max-w-44 whitespace-normal text-ink">{row.counterparty ?? "—"}</TableCell>
              <TableCell className="max-w-36 font-mono text-xs whitespace-normal text-ink">
                <span className="inline-flex items-center gap-1.5">
                  {row.document ?? "—"}
                  <AttachmentCount expense={row.expense} />
                </span>
              </TableCell>
```

In `components/finance/extrato/ExtratoList.tsx` replace

```tsx
import { RowActions } from "@/components/finance/extrato/RowActions";
```

with

```tsx
import { RowActions } from "@/components/finance/extrato/RowActions";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
```

In `components/finance/extrato/ExtratoList.tsx` replace

```tsx
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.account ?? row.groupLabel}
                </span>
                <span className="block truncate text-xs text-ink-soft">{subline(row)}</span>
              </span>
```

with

```tsx
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <span className="truncate">{row.account ?? row.groupLabel}</span>
                  <InstallmentChip expense={row.expense} />
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-soft">
                  <AttachmentCount expense={row.expense} />
                  <span className="truncate">{subline(row)}</span>
                  <RecurrenceTag expense={row.expense} />
                </span>
              </span>
```

- [ ] **Step 7: Row actions: Ver anexos and the scoped removal.**

Replace the whole of `components/finance/extrato/RowActions.tsx` with:

```tsx
"use client";

/**
 * What a row of the Extrato lets you do. A lançamento: Ver anexos when it has
 * any (Financeiro at view is enough), Editar (the EntryDialog filled in),
 * Marcar como pago / recebido while pending, and Remover after a confirmation
 * — for a row of a série, the choice of "Só esta", "Esta e as próximas" or
 * "Todas". A row the manejos wrote is locked and says so. Editing needs
 * Financeiro at edit.
 */
import { useState } from "react";
import { CheckCircle2, Lock, Paperclip, Pencil, Trash2 } from "lucide-react";
import type { SeriesScope } from "@/lib/types";
import type { LedgerRow } from "@/lib/domain/ledger";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsDialog } from "@/components/finance/attachments/AttachmentsDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LOCKED_HINT = "Vendas, compras e tratamentos vêm dos manejos";

interface RowActionsProps {
  row: LedgerRow;
  /** Full-width buttons with their names, for the phone's row sheet. */
  labeled?: boolean;
  /** After the row was marked paid or removed (the phone closes its sheet). */
  onDone?: () => void;
}

export function RowActions({ row, labeled = false, onDone }: RowActionsProps) {
  const canEdit = useCan("finance", "edit");
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (row.locked) {
    return labeled ? (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Lock className="size-4 shrink-0" aria-hidden />
        {LOCKED_HINT}.
      </p>
    ) : (
      <span
        title={LOCKED_HINT}
        className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-soft"
      >
        <Lock className="size-3.5" aria-hidden />
        do manejo
      </span>
    );
  }

  const expense = row.expense;
  if (!expense) return null;
  const hasFiles = (expense.attachmentCount ?? 0) > 0;
  if (!canEdit && !hasFiles) return null;

  const revenue = expense.kind === "revenue";
  const pending = row.paidAt === null;
  const markLabel = revenue ? "Marcar como recebido" : "Marcar como pago";

  const markPaid = async () => {
    setBusy(true);
    try {
      await markExpensePaid(expense.id, todayISO());
      addToast({ messageType: "success", text: revenue ? "Marcado como recebido" : "Marcado como pago" });
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope: SeriesScope = "one") => {
    setBusy(true);
    try {
      await removeExpense(expense.id, scope);
      addToast({ messageType: "success", text: "Lançamento removido" });
      setConfirming(false);
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const variant = labeled ? "outline" : "ghost";
  const size = labeled ? "default" : "icon-sm";
  const buttonClass = labeled ? "min-h-11 w-full justify-start" : "text-ink-soft hover:text-ink";

  return (
    <>
      <div className={labeled ? "flex flex-col gap-2" : "flex items-center justify-end gap-0.5"}>
        {hasFiles ? (
          <Button
            type="button"
            variant={variant}
            size={size}
            className={buttonClass}
            aria-label={labeled ? undefined : "Ver anexos"}
            title={labeled ? undefined : "Ver anexos"}
            onClick={() => setViewing(true)}
          >
            <Paperclip aria-hidden />
            {labeled ? "Ver anexos" : null}
          </Button>
        ) : null}
        {canEdit ? (
          <>
            <Button
              type="button"
              variant={variant}
              size={size}
              className={buttonClass}
              aria-label={labeled ? undefined : "Editar lançamento"}
              title={labeled ? undefined : "Editar"}
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden />
              {labeled ? "Editar" : null}
            </Button>
            {pending ? (
              <Button
                type="button"
                variant={variant}
                size={size}
                className={buttonClass}
                aria-label={labeled ? undefined : markLabel}
                title={labeled ? undefined : markLabel}
                disabled={busy}
                onClick={markPaid}
              >
                <CheckCircle2 aria-hidden />
                {labeled ? markLabel : null}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={variant}
              size={size}
              className={cn(buttonClass, "hover:text-overdue")}
              aria-label={labeled ? undefined : "Remover lançamento"}
              title={labeled ? undefined : "Remover"}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
              {labeled ? "Remover" : null}
            </Button>
          </>
        ) : null}
      </div>

      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}
      {viewing ? <AttachmentsDialog expense={expense} onOpenChange={setViewing} /> : null}

      {expense.seriesId && confirming ? (
        <SeriesScopeDialog
          open
          onOpenChange={setConfirming}
          expense={expense}
          action="remove"
          busy={busy}
          onConfirm={(scope) => void remove(scope)}
        />
      ) : null}

      <Dialog
        open={confirming && !expense.seriesId}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover lançamento?</DialogTitle>
            <DialogDescription>
              Essa {revenue ? "receita" : "despesa"} some do extrato e dos indicadores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 8: Check.**

```bash
pnpm tsc --noEmit
pnpm exec eslint components/finance --ignore-pattern '.claude/**'
```
Expected: silent.

- [ ] **Step 9: Commit.**

```bash
git add components/finance/SeriesMarkers.tsx \
  components/finance/SeriesScopeDialog.tsx \
  components/finance/attachments/AttachmentTile.tsx \
  components/finance/attachments/AttachmentsDialog.tsx \
  components/finance/BillsCard.tsx \
  components/finance/RecentEntriesCard.tsx \
  components/finance/extrato/ExtratoTable.tsx \
  components/finance/extrato/ExtratoList.tsx \
  components/finance/extrato/RowActions.tsx
git commit -m "feat(finance): parcela, recorrência and anexo markers with the scope choice"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 8: EntryDialog — Repetir and Anexos

**Files:**
- Create: `components/finance/RepeatSection.tsx`, `components/finance/__tests__/repeatFields.test.ts`, `components/finance/attachments/compressImage.ts`, `components/finance/attachments/AttachmentsField.tsx`
- Replace: `components/finance/EntryDialog.tsx`

**Interfaces:**
- Consumes: Task 2 (`installmentPlan`, `nextDueDates`, `recurringDates`, `firstMonthlyOnOrAfter`, labels), Task 3 (`lib/domain/attachments.ts`), Task 5 (store), Task 7 (`SeriesScopeDialog`, tiles).
- Produces: `RepeatSection`, `initialRepeat(date)`, `repeatFromFields(fields, date) → SeriesRepeat | string | null` (a string is the error to show); `AttachmentsField`, `PendingFile`; `compressImage(file)`. EntryDialog keeps its props.

- [ ] **Step 1: Repetir: test first.**

Create `components/finance/__tests__/repeatFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initialRepeat, repeatFromFields } from "@/components/finance/RepeatSection";

const DATE = "2026-09-27";

describe("repeatFromFields", () => {
  it("is null for Uma vez", () => {
    expect(repeatFromFields(initialRepeat(DATE), DATE)).toBeNull();
  });

  it("builds a parcelamento from the first vencimento", () => {
    const fields = { ...initialRepeat(DATE), choice: "installments" as const, count: "3", firstDue: "2026-10-10" };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "installments",
      count: 3,
      frequency: "monthly",
      startsOn: "2026-10-10",
    });
  });

  it("refuses 1 or 49 parcelas and a first parcela before Data", () => {
    const base = { ...initialRepeat(DATE), choice: "installments" as const };
    expect(repeatFromFields({ ...base, count: "1" }, DATE)).toBe("Informe de 2 a 48 parcelas.");
    expect(repeatFromFields({ ...base, count: "49" }, DATE)).toBe("Informe de 2 a 48 parcelas.");
    expect(repeatFromFields({ ...base, firstDue: "2026-09-01" }, DATE)).toBe(
      "A primeira parcela não pode vencer antes da data"
    );
  });

  it("starts a monthly recorrência on the next day it falls on", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, day: "5", noEnd: false, until: "2026-12-31" };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "recurring",
      frequency: "monthly",
      dayOfMonth: 5,
      startsOn: "2026-10-05",
      endsOn: "2026-12-31",
    });
  });

  it("starts a weekly recorrência on Data, sem fim", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, frequency: "weekly" as const };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "recurring",
      frequency: "weekly",
      dayOfMonth: undefined,
      startsOn: DATE,
      endsOn: undefined,
    });
  });

  it("asks for até unless sem fim", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, noEnd: false, until: "" };
    expect(repeatFromFields(fields, DATE)).toBe("Informe até quando repete, ou marque sem fim.");
  });
});
```

```bash
pnpm exec vitest run components/finance/__tests__/repeatFields.test.ts --exclude '**/worktrees/**'
```
Expected: FAIL — cannot resolve `@/components/finance/RepeatSection`.

- [ ] **Step 2: The Repetir section.**

Create `components/finance/RepeatSection.tsx`:

```tsx
"use client";

/**
 * "Repetir" in the EntryDialog: Uma vez · Parcelado · Recorrente. Parcelado
 * splits the Valor total into N parcelas with their own vencimentos and lists
 * them; Recorrente repeats the Valor every month (on a day) or week, until a
 * date or sem fim, and shows the next vencimentos.
 */
import { Repeat } from "lucide-react";
import type { SeriesFrequency, SeriesMode, SeriesRepeat } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  firstMonthlyOnOrAfter,
  installmentPlan,
  monthYear,
  nextDueDates,
  recurringDates,
} from "@/lib/domain/series";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type RepeatChoice = "once" | SeriesMode;

export interface RepeatFields {
  choice: RepeatChoice;
  /** Parcelas, as typed. */
  count: string;
  /** "Primeira parcela vence". */
  firstDue: string;
  frequency: SeriesFrequency;
  /** "no dia", as typed (monthly recorrência). */
  day: string;
  /** "até"; ignored while `noEnd`. */
  until: string;
  noEnd: boolean;
}

const CHOICES: readonly { choice: RepeatChoice; label: string }[] = [
  { choice: "once", label: "Uma vez" },
  { choice: "installments", label: "Parcelado" },
  { choice: "recurring", label: "Recorrente" },
];

export function initialRepeat(date: string): RepeatFields {
  return {
    choice: "once",
    count: "3",
    firstDue: date,
    frequency: "monthly",
    day: String(Number(date.slice(8, 10))),
    until: "",
    noEnd: true,
  };
}

/** The rule the fields describe, or a message saying what is missing. */
export function repeatFromFields(fields: RepeatFields, date: string): SeriesRepeat | string | null {
  if (fields.choice === "once") return null;
  if (fields.choice === "installments") {
    const count = Number(fields.count);
    if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
      return `Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`;
    }
    if (fields.firstDue === "") return "Informe quando vence a primeira parcela.";
    if (fields.firstDue < date) return "A primeira parcela não pode vencer antes da data";
    return { mode: "installments", count, frequency: fields.frequency, startsOn: fields.firstDue };
  }
  const monthly = fields.frequency === "monthly";
  const day = Number(fields.day);
  if (monthly && (!Number.isInteger(day) || day < 1 || day > 31)) return "Informe o dia (1 a 31).";
  const startsOn = monthly ? firstMonthlyOnOrAfter(date, day) : date;
  if (!fields.noEnd && fields.until === "") return "Informe até quando repete, ou marque sem fim.";
  if (!fields.noEnd && fields.until < startsOn) return "A recorrência termina antes da primeira conta.";
  return {
    mode: "recurring",
    frequency: fields.frequency,
    dayOfMonth: monthly ? day : undefined,
    startsOn,
    endsOn: fields.noEnd ? undefined : fields.until,
  };
}

const dayMonth = (iso: string) => formatDate(iso).slice(0, 5);

export function RepeatSection({
  fields,
  onChange,
  date,
  amount,
}: {
  fields: RepeatFields;
  onChange(patch: Partial<RepeatFields>): void;
  date: string;
  /** Valor as parsed (NaN while empty). */
  amount: number;
}) {
  const repeat = date === "" ? null : repeatFromFields(fields, date);
  const valid = repeat !== null && typeof repeat !== "string" ? repeat : null;

  return (
    <fieldset className="grid min-w-0 gap-3 border-t border-hairline pt-4">
      <legend className="float-left w-full text-sm font-semibold text-ink">Repetir</legend>
      <div
        role="radiogroup"
        aria-label="Repetir"
        className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
      >
        {CHOICES.map(({ choice, label }) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={fields.choice === choice}
            onClick={() => onChange({ choice })}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
              fields.choice === choice
                ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {fields.choice === "installments" ? (
        <>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-count">Parcelas</Label>
              <Input
                id="repeat-count"
                type="number"
                inputMode="numeric"
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                value={fields.count}
                onChange={(e) => onChange({ count: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-first">Primeira parcela vence</Label>
              <Input
                id="repeat-first"
                type="date"
                value={fields.firstDue}
                onChange={(e) => onChange({ firstDue: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="repeat-interval">Intervalo</Label>
              <Select value={fields.frequency} onValueChange={(v) => onChange({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="repeat-interval" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mensal</SelectItem>
                  <SelectItem value="weekly">semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valid?.mode === "installments" ? (
            <InstallmentPreview repeat={valid} amount={amount} />
          ) : null}
        </>
      ) : null}

      {fields.choice === "recurring" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="repeat-frequency">Repete a cada</Label>
              <Select value={fields.frequency} onValueChange={(v) => onChange({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="repeat-frequency" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mês</SelectItem>
                  <SelectItem value="weekly">semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fields.frequency === "monthly" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="repeat-day">no dia</Label>
                <Input
                  id="repeat-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={fields.day}
                  onChange={(e) => onChange({ day: e.target.value })}
                  className="min-h-11 font-mono md:min-h-0"
                />
              </div>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="repeat-until">até</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="repeat-until"
                type="date"
                value={fields.until}
                disabled={fields.noEnd}
                onChange={(e) => onChange({ until: e.target.value })}
                className="min-h-11 w-auto min-w-0 flex-1 font-mono md:min-h-0"
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
                <input
                  type="checkbox"
                  role="switch"
                  checked={fields.noEnd}
                  onChange={(e) => onChange({ noEnd: e.target.checked })}
                  className="size-4 accent-brand"
                />
                sem fim
              </label>
            </div>
          </div>
          {valid?.mode === "recurring" ? <RecurringPreview repeat={valid} /> : null}
        </>
      ) : null}

      {typeof repeat === "string" && fields.choice !== "once" ? (
        <p className="text-xs text-ink-soft">{repeat}</p>
      ) : null}
    </fieldset>
  );
}

function InstallmentPreview({ repeat, amount }: { repeat: SeriesRepeat; amount: number }) {
  const count = repeat.count ?? 0;
  const total = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const plan = installmentPlan(total, count, repeat.startsOn, repeat.frequency);
  return (
    <>
      <p className="text-xs text-ink-soft">
        O valor total é dividido em {count} parcelas, cada uma com seu vencimento em Contas.
      </p>
      <div className="overflow-hidden rounded-lg border border-hairline">
        <ol aria-label="Parcelas" className="max-h-56 overflow-y-auto">
          {plan.map((line) => (
            <li
              key={line.index}
              className={cn("flex min-h-9 items-center gap-2.5 px-3", line.index > 1 && "border-t border-hairline")}
            >
              <span className="inline-flex shrink-0 items-center rounded-md border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-4 font-medium text-ink">
                {line.index}/{count}
              </span>
              <span className="font-mono text-[13px] text-ink">{dayMonth(line.dueDate)}</span>
              <span className="text-xs text-ink-soft">vence</span>
              <span className="ml-auto font-mono text-[13px] font-medium text-ink">
                {formatCurrency(line.amountBrl)}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-2 border-t border-hairline bg-surface px-3 py-2">
          <span className="text-xs text-ink-soft">a última parcela absorve os centavos</span>
          <span className="text-[13px] font-semibold text-ink">
            Total <span className="font-mono">{formatCurrency(total)}</span>
          </span>
        </div>
      </div>
    </>
  );
}

function RecurringPreview({ repeat }: { repeat: SeriesRepeat }) {
  const rule = { frequency: repeat.frequency, dayOfMonth: repeat.dayOfMonth, startsOn: repeat.startsOn, endsOn: repeat.endsOn };
  const next = nextDueDates(rule, 3);
  const until = repeat.endsOn;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-soft">
      <Repeat className="size-3.5" aria-hidden />
      <span>próximas:</span>
      <span className="font-mono text-ink">{next.map(dayMonth).join(" · ")}</span>
      <span className="basis-full">
        {until
          ? `${recurringDates(rule, 1, until).length} contas até ${monthYear(until)}, cada uma aparece em Contas perto do vencimento`
          : "sem fim · Contas mostra as contas dos próximos 12 meses"}
      </span>
    </p>
  );
}
```

```bash
pnpm exec vitest run components/finance/__tests__/repeatFields.test.ts --exclude '**/worktrees/**'
```
Expected: 6 tests pass.

- [ ] **Step 3: Photo reduction and the Anexos block.**

Create `components/finance/attachments/compressImage.ts`:

```ts
/**
 * A photo from the phone is reduced before it leaves: longest side 1600 px,
 * JPEG at 0.8 — a 4 MB camera shot becomes a few hundred KB. A photo already
 * small enough, a PDF, or a format the browser cannot decode (HEIC outside
 * Safari) goes as it is; the 5 MB limit still applies after this.
 */
import {
  COMPRESS_MAX_SIDE,
  COMPRESS_QUALITY,
  MAX_ATTACHMENT_BYTES,
  fitWithin,
} from "@/lib/domain/attachments";

const DECODABLE = ["image/jpeg", "image/png", "image/webp"];

export async function compressImage(file: File): Promise<File> {
  if (!DECODABLE.includes(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, COMPRESS_MAX_SIDE);
  if (width === bitmap.width && height === bitmap.height && file.size <= MAX_ATTACHMENT_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY)
  );
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}
```

Create `components/finance/attachments/AttachmentsField.tsx`:

```tsx
"use client";

/**
 * "Anexos" in the EntryDialog: photos and PDFs of the NF or recibo. Editing a
 * lançamento, a file uploads the moment it is chosen and a removal is
 * immediate. On a new lançamento the files wait in `pending` and the dialog
 * uploads them once the lançamento exists, showing each one's progress.
 * Without a Blob store the block says so; offline the buttons wait for signal.
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, FolderOpen, Paperclip } from "lucide-react";
import type { Attachment } from "@/lib/types";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  attachmentContentType,
  fileCountLabel,
  isAttachmentType,
} from "@/lib/domain/attachments";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { compressImage } from "@/components/finance/attachments/compressImage";
import { PendingFileTile, SavedAttachmentTile } from "@/components/finance/attachments/AttachmentTile";
import { Button } from "@/components/ui/button";

/** A chosen file not yet on the server. */
export interface PendingFile {
  key: string;
  file: File;
  contentType: string;
  /** 0–100 while uploading, null before. */
  progress: number | null;
  error: string | null;
}

interface AttachmentsFieldProps {
  /** The lançamento being edited; absent on a new one. */
  expenseId?: string;
  pending: PendingFile[];
  onPendingChange(update: (files: PendingFile[]) => PendingFile[]): void;
  /** True while the dialog saves (and uploads the pending files). */
  busy?: boolean;
}

export function AttachmentsField({ expenseId, pending, onPendingChange, busy = false }: AttachmentsFieldProps) {
  const attachmentsEnabled = useHerdStore((s) => s.attachmentsEnabled);
  const listAttachments = useHerdStore((s) => s.listAttachments);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const removeAttachment = useHerdStore((s) => s.removeAttachment);
  const offline = useHerdStore((s) => s.offline);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<Attachment[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    attachmentsEnabled()
      .then(async (on) => {
        if (cancelled) return;
        setEnabled(on);
        if (on && expenseId) {
          const found = await listAttachments(expenseId);
          if (!cancelled) setSaved(found);
        }
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentsEnabled, listAttachments, expenseId]);

  const total = saved.length + pending.length;
  const canAdd = enabled === true && !offline && !busy && total < MAX_ATTACHMENTS;

  const patchPending = (key: string, patch: Partial<PendingFile>) =>
    onPendingChange((files) => files.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  async function upload(item: PendingFile, id: string) {
    try {
      const attachment = await uploadAttachment(id, item.file, (progress) =>
        patchPending(item.key, { progress })
      );
      onPendingChange((files) => files.filter((f) => f.key !== item.key));
      setSaved((list) => [...list, attachment]);
    } catch {
      patchPending(item.key, { progress: null, error: "não enviado" });
    }
  }

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);
    const room = MAX_ATTACHMENTS - total;
    if (chosen.length > room) setError(`No máximo ${MAX_ATTACHMENTS} anexos por lançamento.`);
    const accepted: PendingFile[] = [];
    for (const original of chosen.slice(0, Math.max(0, room))) {
      const contentType = attachmentContentType(original.name, original.type);
      if (!isAttachmentType(contentType)) {
        setError("Só fotos (JPEG, PNG, WebP, HEIC) e PDF.");
        continue;
      }
      const file = await compressImage(original);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${original.name} passa de 5 MB.`);
        continue;
      }
      accepted.push({
        key: crypto.randomUUID(),
        file,
        contentType: attachmentContentType(file.name, file.type),
        progress: expenseId ? 0 : null,
        error: null,
      });
    }
    onPendingChange((files) => [...files, ...accepted]);
    if (expenseId) for (const item of accepted) await upload(item, expenseId);
  }

  async function onRemoveSaved(attachment: Attachment) {
    setRemoving(attachment.id);
    try {
      await removeAttachment(attachment);
      setSaved((list) => list.filter((a) => a.id !== attachment.id));
    } catch {
      // apiFail already told the user.
    } finally {
      setRemoving(null);
    }
  }

  return (
    <fieldset className="grid min-w-0 gap-3 border-t border-hairline pt-4">
      <legend className="float-left w-full">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink">Anexos</span>
          {total > 0 ? <span className="text-xs text-ink-soft">{fileCountLabel(total)}</span> : null}
        </span>
      </legend>
      {enabled === false ? (
        <p className="text-sm text-ink-soft">Anexos indisponíveis neste ambiente</p>
      ) : (
        <>
          {total > 0 ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {saved.map((attachment) => (
                <SavedAttachmentTile
                  key={attachment.id}
                  attachment={attachment}
                  removing={removing === attachment.id}
                  onRemove={busy ? undefined : () => void onRemoveSaved(attachment)}
                />
              ))}
              {pending.map((item) => (
                <PendingFileTile
                  key={item.key}
                  file={item.file}
                  contentType={item.contentType}
                  progress={item.progress}
                  error={item.error}
                  onRemove={
                    busy || item.progress !== null
                      ? undefined
                      : () => onPendingChange((files) => files.filter((f) => f.key !== item.key))
                  }
                />
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:hidden"
              disabled={!canAdd}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera aria-hidden />
              Tirar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:hidden"
              disabled={!canAdd}
              onClick={() => fileRef.current?.click()}
            >
              <FolderOpen aria-hidden />
              Escolher arquivo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="hidden md:inline-flex"
              disabled={!canAdd}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip aria-hidden />
              Adicionar foto ou PDF
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void onChoose(e)}
          />
          <input ref={fileRef} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={(e) => void onChoose(e)} />
          <p className="text-xs text-ink-soft">
            {offline ? "precisa de sinal" : "até 5 MB · fotos são reduzidas no celular"}
          </p>
          {error ? <p className="text-xs text-overdue">{error}</p> : null}
        </>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 4: The dialog.**

Replace the whole of `components/finance/EntryDialog.tsx` with:

```tsx
"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento, conta,
 * pago para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { Repeat } from "lucide-react";
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, EntryKind, Expense, ExpenseCategory, SeriesScope } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import {
  RepeatSection,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LIST = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

/** Select value for "Sem conta" and "Fazenda toda": Radix refuses "". */
const NONE = "none";

const KINDS: readonly { kind: EntryKind; label: string }[] = [
  { kind: "expense", label: "Despesa" },
  { kind: "revenue", label: "Receita" },
];

interface EntryFields {
  kind: EntryKind;
  date: string;
  amount: string;
  category: ExpenseCategory;
  accountId: string;
  dueDate: string;
  /** The user changed Vencimento; until then it follows Data. */
  dueTouched: boolean;
  paid: boolean;
  paidAt: string;
  counterparty: string;
  document: string;
  lotId: string;
  notes: string;
}

function initialFields(expense: Expense | undefined, defaultKind: EntryKind): EntryFields {
  const today = todayISO();
  if (!expense) {
    return {
      kind: defaultKind,
      date: today,
      amount: "",
      category: "nutrition",
      accountId: NONE,
      dueDate: today,
      dueTouched: false,
      paid: true,
      paidAt: today,
      counterparty: "",
      document: "",
      lotId: NONE,
      notes: "",
    };
  }
  return {
    kind: expense.kind,
    date: expense.date,
    amount: String(expense.amountBrl).replace(".", ","),
    category: expense.category,
    accountId: expense.accountId ?? NONE,
    dueDate: expense.dueDate ?? expense.date,
    dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
    paid: expense.paidAt !== undefined,
    paidAt: expense.paidAt ?? today,
    counterparty: expense.counterparty ?? "",
    document: expense.document ?? "",
    lotId: expense.lotId ?? NONE,
    notes: expense.notes ?? "",
  };
}

export function EntryDialog({
  open,
  onOpenChange,
  expense,
  defaultKind = "expense",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Despesas e receitas da fazenda. Vendas e compras de gado entram sozinhas pelos
            manejos.
          </DialogDescription>
        </DialogHeader>
        <EntryForm expense={expense} defaultKind={defaultKind} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  expense,
  defaultKind,
  onDone,
}: {
  expense?: Expense;
  defaultKind: EntryKind;
  onDone(): void;
}) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
  const [scopePatch, setScopePatch] = useState<ExpensePatch | null>(null);
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  const revenue = fields.kind === "revenue";
  const group: AccountGroup = revenue ? "revenue" : fields.category;
  const groupAccounts = accountsByGroup(accounts)[group];
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === group && !groupAccounts.some((a) => a.id === currentAccount.id)
      ? [...groupAccounts, currentAccount]
      : groupAccounts;

  const heads = activeAnimals(animals);
  const lotOptions = [
    ...activeLots(lots),
    ...lots.filter((lot) => lot.deletedAt != null && lot.id === fields.lotId),
  ];
  const suggestions = counterpartySuggestions(expenses);

  const repeating = !expense && repeatFields.choice !== "once";
  const seriesLine = expense
    ? installmentLabel(expense)
      ? `Parcela ${installmentLabel(expense)}`
      : recurrenceLabel(expense)
        ? `Recorrente · ${recurrenceLabel(expense)}`
        : null
    : null;

  function onDateChange(date: string) {
    setFields((f) => ({ ...f, date, dueDate: f.dueTouched ? f.dueDate : date }));
    // The first parcela never falls before Data; the day follows Data until Repetir is chosen.
    if (date === "") return;
    setRepeatFields((r) => ({
      ...r,
      firstDue: r.firstDue < date ? date : r.firstDue,
      day: r.choice === "once" ? String(Number(date.slice(8, 10))) : r.day,
    }));
  }

  async function saveEdit(target: Expense, patch: ExpensePatch, scope: SeriesScope) {
    setSaving(true);
    try {
      await updateExpense(target.id, patch, scope);
      addToast({ messageType: "success", text: "Lançamento salvo" });
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    setSaving(false);
    onDone();
  }

  /** Uploads the files chosen before the lançamento existed, one at a time, with progress. */
  async function uploadPending(expenseId: string) {
    for (const item of pending) {
      const patch = (next: Partial<PendingFile>) =>
        setPending((files) => files.map((f) => (f.key === item.key ? { ...f, ...next } : f)));
      try {
        patch({ progress: 0 });
        await uploadAttachment(expenseId, item.file, (progress) => patch({ progress }));
        patch({ progress: 100 });
      } catch {
        patch({ progress: null, error: "não enviado" }); // the store already toasted
      }
    }
  }

  async function onCreateAccount() {
    const name = (newAccountName ?? "").trim();
    if (name === "" || creatingAccount) return;
    setCreatingAccount(true);
    let created;
    try {
      created = await addAccount({ group, name });
    } catch {
      return; // apiFail already toasted
    } finally {
      setCreatingAccount(false);
    }
    if (!created) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    set({ accountId: created.id });
    setNewAccountName(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fields.date === "") {
      setError("Informe a data do lançamento.");
      return;
    }
    const amountBrl = parseAmount(fields.amount);
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      setError("Informe o valor (maior que zero).");
      return;
    }
    const repeat = expense ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
    }
    if (!repeat && fields.dueDate === "") {
      setError("Informe o vencimento.");
      return;
    }
    if (!repeat && fields.dueDate < fields.date) {
      setError("O vencimento não pode ser antes da data");
      return;
    }
    if (fields.paid && fields.paidAt === "") {
      setError(revenue ? "Informe a data do recebimento." : "Informe a data do pagamento.");
      return;
    }
    setError(null);

    const category: ExpenseCategory = revenue ? "other" : fields.category;
    const paidAt = fields.paid ? fields.paidAt : null;
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

    if (expense) {
      const patch: ExpensePatch = {
        date: fields.date,
        category,
        amountBrl,
        dueDate: fields.dueDate,
        paidAt,
        counterparty,
        document: docNumber,
        accountId,
        lotId,
        notes,
      };
      // A row of a série asks where the change applies before saving.
      if (expense.seriesId) setScopePatch(patch);
      else await saveEdit(expense, patch, "one");
      return;
    }

    setSaving(true);
    try {
      const created = await addExpense(
        {
          kind: fields.kind,
          date: fields.date,
          category,
          amountBrl,
          dueDate: fields.dueDate,
          paidAt: paidAt ?? undefined,
          counterparty: counterparty ?? undefined,
          document: docNumber ?? undefined,
          accountId: accountId ?? undefined,
          lotId: lotId ?? undefined,
          notes: notes ?? undefined,
        },
        repeat ?? undefined
      );
      addToast({ messageType: "success", text: revenue ? "Receita lançada" : "Despesa lançada" });
      // The NF or recibo belongs to the purchase: the first parcela or ocorrência carries it.
      if (created.length > 0 && pending.length > 0) await uploadPending(created[0].id);
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense ? null : (
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
        >
          {KINDS.map(({ kind, label }) => {
            const selected = fields.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  set({ kind, accountId: NONE });
                  setNewAccountName(null);
                }}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors md:min-h-8",
                  selected
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-date">Data</Label>
          <Input
            id="entry-date"
            type="date"
            value={fields.date}
            onChange={(e) => onDateChange(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-amount">
            {repeatFields.choice === "installments" && !expense ? "Valor total (R$)" : "Valor (R$)"}
          </Label>
          <Input
            id="entry-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>

        <div className="grid gap-1.5">
          {revenue ? (
            <>
              <span className="text-sm leading-none font-medium">Grupo</span>
              <p className="flex min-h-11 items-center rounded-lg border border-input bg-surface px-2.5 text-sm text-ink-soft">
                Receitas
              </p>
            </>
          ) : (
            <>
              <Label htmlFor="entry-category">Grupo</Label>
              <Select
                value={fields.category}
                onValueChange={(category) => {
                  set({ category: category as ExpenseCategory, accountId: NONE });
                  setNewAccountName(null);
                }}
              >
                <SelectTrigger id="entry-category" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((category) => (
                    <SelectItem key={category} value={category}>
                      {EXPENSE_CATEGORY_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta</Label>
          {newAccountName === null ? (
            <>
              <Select value={fields.accountId} onValueChange={(accountId) => set({ accountId })}>
                <SelectTrigger id="entry-account" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem conta</SelectItem>
                  {accountOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setNewAccountName("")}
                className="inline-flex min-h-11 items-center self-start text-xs font-medium text-brand hover:underline md:min-h-0"
              >
                + nova conta
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Input
                id="entry-account"
                autoFocus
                value={newAccountName}
                placeholder="Nome da conta"
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onCreateAccount();
                  }
                }}
                className="min-h-11"
              />
              <Button
                type="button"
                className="min-h-11"
                disabled={creatingAccount}
                onClick={() => void onCreateAccount()}
              >
                Criar
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entry-due">Vencimento</Label>
          <Input
            id="entry-due"
            type="date"
            value={repeating ? "" : fields.dueDate}
            disabled={repeating}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
            className="min-h-11 font-mono md:min-h-0"
          />
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments"
                ? "segue a 1ª parcela, abaixo"
                : "segue a recorrência, abaixo"}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">
            {revenue ? "Recebimento" : "Pagamento"}
          </span>
          <div className="flex min-h-11 items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={fields.paid}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
              {revenue ? "Já recebido" : "Já pago"}
              {fields.paid ? " em" : ""}
            </label>
            {fields.paid ? (
              <Input
                type="date"
                aria-label={revenue ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
            ) : null}
          </div>
        </div>
      </div>

      {expense ? (
        seriesLine ? (
          <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-sm text-ink">
            <Repeat className="size-4 text-ink-soft" aria-hidden />
            {seriesLine}
          </p>
        ) : null
      ) : (
        <RepeatSection
          fields={repeatFields}
          onChange={(patch) => setRepeatFields((r) => ({ ...r, ...patch }))}
          date={fields.date}
          amount={parseAmount(fields.amount)}
        />
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="entry-counterparty">{revenue ? "Recebido de" : "Pago para"}</Label>
        <Input
          id="entry-counterparty"
          list="entry-counterparty-list"
          value={fields.counterparty}
          onChange={(e) => set({ counterparty: e.target.value })}
          className="min-h-11"
        />
        <datalist id="entry-counterparty-list">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {suggestions.length > 0 ? (
          <p className="text-xs text-ink-soft">sugestões dos lançamentos anteriores</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-document">Documento</Label>
          <Input
            id="entry-document"
            value={fields.document}
            placeholder="NF 4.812"
            onChange={(e) => set({ document: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-lot">Lote (centro de custo)</Label>
          <Select value={fields.lotId} onValueChange={(lotId) => set({ lotId })}>
            <SelectTrigger id="entry-lot" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Fazenda toda (rateio por cabeça)</SelectItem>
              {lotOptions.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.name} · {heads.filter((a) => a.lotId === lot.id).length} cab
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-soft">Sem lote = fazenda toda, rateado por cabeça</p>
        </div>
      </div>

      <AttachmentsField
        expenseId={expense?.id}
        pending={pending}
        onPendingChange={setPending}
        busy={saving}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="entry-notes">Observação</Label>
        <Textarea
          id="entry-notes"
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Ex.: reforço de aftosa, 2ª dose"
        />
      </div>

      {error ? <p className="text-xs text-overdue">{error}</p> : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense
            ? "Salvar"
            : repeatFields.choice === "installments"
              ? `Lançar ${repeatFields.count} parcelas`
              : repeatFields.choice === "recurring"
                ? "Lançar recorrência"
                : "Lançar"}
        </Button>
      </DialogFooter>

      {expense && scopePatch ? (
        <SeriesScopeDialog
          open
          onOpenChange={(open) => {
            if (!open) setScopePatch(null);
          }}
          expense={expense}
          action="edit"
          amountChange={
            scopePatch.amountBrl !== undefined && scopePatch.amountBrl !== expense.amountBrl
              ? { from: expense.amountBrl, to: scopePatch.amountBrl }
              : null
          }
          busy={saving}
          onConfirm={(scope) => void saveEdit(expense, scopePatch, scope)}
        />
      ) : null}
    </form>
  );
}
```

- [ ] **Step 5: Check.**

```bash
pnpm tsc --noEmit
pnpm exec eslint components/finance --ignore-pattern '.claude/**'
pnpm exec vitest run components/finance --exclude '**/worktrees/**'
```
Expected: silent; vitest green.

- [ ] **Step 6: Commit.**

```bash
git add components/finance/__tests__/repeatFields.test.ts \
  components/finance/RepeatSection.tsx \
  components/finance/attachments/compressImage.ts \
  components/finance/attachments/AttachmentsField.tsx \
  components/finance/EntryDialog.tsx
git commit -m "feat(finance): repeat a lançamento and attach its NF in the dialog"
```
Expected: one commit, no other file staged (`git status --short` lists nothing from this task). No `Co-Authored-By`, session URL or footer.


---

### Task 9: Smoke on a throwaway database, then the whole-branch checks

**Files:**
- Create (scratchpad only, never committed): `<scratchpad>/smoke-serie/api-smoke.mjs`, `<scratchpad>/smoke-serie/ui-smoke.mjs` — `<scratchpad>` is your session's scratchpad directory.
- Modify: nothing in the repo unless the smoke finds a bug (then a `fix(finance): …` commit by pathspec, with the test that would have caught it when the code is pure).

**Interfaces:**
- Consumes: everything Tasks 1–8 shipped; the seed (`pnpm db:seed --email`).
- Produces: a pass/fail list and screenshots for the user. The Blob steps run only when `BLOB_READ_WRITE_TOKEN` is set in the environment of `next start` (pass `BLOB=1` to both scripts then); without it they are skipped and the scripts print a note saying so — report that note.

- [ ] **Step 1: The tree is clean and every check passes**

```bash
cd /home/luketa/meubov && git status --short && pnpm tsc --noEmit && pnpm exec eslint . --ignore-pattern '.claude/**' && TZ=America/Sao_Paulo pnpm exec vitest run lib components --exclude '**/worktrees/**'
```
Expected: no output from `git status --short`; tsc and eslint silent; vitest all green (after Tasks 1–8 on base `c7f9109`: 155 files, 1470 tests).

- [ ] **Step 2: Throwaway database, migrated from zero**

Check `docker ps` and `ss -ltnp` first; pick other ports if 5448 or 3018 are taken.
```bash
docker run --rm -d --name meubov-serie-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5448:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
sleep 4
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5448/meubov pnpm migration:run
docker exec meubov-serie-db psql -U meubov -d meubov -c '\d expense_series' -c '\d attachments' -c '\di expenses_series_id_series_index_idx'
```
Expected: `✅ Migrations applied`, `0022_financeiro-series-e-anexos` last; both tables listed; the unique index on `(series_id, series_index)`.

- [ ] **Step 3: Build, start, sign up and seed**

```bash
cd /home/luketa/meubov && pnpm build
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5448/meubov BETTER_AUTH_URL=http://localhost:3018 nohup pnpm exec next start -p 3018 > <scratchpad>/smoke-serie/server.log 2>&1 &
sleep 6; curl -s http://localhost:3018/api/auth/ok
curl -s -X POST http://localhost:3018/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Teste Serie","email":"teste.serie@meubov.local","password":"Serie2026!!"}'
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5448/meubov pnpm db:seed --email teste.serie@meubov.local
```
Expected: build succeeds; `{"ok":true}`; sign-up 200; `Seeded farm "Fazenda Boa Vista" (id 1) … 25 accounts, 52 expenses.` To exercise anexos, export a real `BLOB_READ_WRITE_TOKEN` (a **private** Blob store) in the `next start` line; never write it to `.env.local`.

- [ ] **Step 4: The API smoke**

`<scratchpad>/smoke-serie/api-smoke.mjs`:

```js
// API smoke for parcelamento, recorrência and anexos against a running server.
// The Blob steps run only when the server has BLOB_READ_WRITE_TOKEN (pass BLOB=1).
import { createRequire } from "node:module";
const REPO = process.env.REPO ?? "/home/luketa/meubov";
const BASE = process.env.BASE ?? "http://localhost:3018";
const EMAIL = process.env.EMAIL ?? "teste.serie@meubov.local";
const PASSWORD = process.env.PASSWORD ?? "Serie2026!!";
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };

const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
check(signIn.ok, "sign-in");
const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const api = async (method, path, body) => {
  const res = await fetch(`${BASE}/api/herd${path}`, {
    method, headers: { cookie, origin: BASE, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const herd = async () => (await api("GET", "")).data;
const ofSeries = (data, id) => data.expenses.filter((e) => e.seriesId === id).sort((a, b) => a.seriesIndex - b.seriesIndex);

// Parcelado: 3 × of R$ 1.000,00, first vencimento 2026-10-10.
const parcelado = await api("POST", "/expenses", {
  date: "2026-09-27", category: "nutrition", amountBrl: 1000, counterparty: "Nutron", paidAt: "2026-09-27",
  repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
});
check(parcelado.status === 200 && parcelado.data.length === 3, "parcelado creates 3 rows");
check(JSON.stringify(parcelado.data.map((e) => e.amountBrl)) === "[333.33,333.33,333.34]", "centavos on the last parcela");
check(parcelado.data.every((e) => e.date === "2026-09-27"), "parcelas keep the purchase date");
check(parcelado.data.map((e) => e.dueDate).join() === "2026-10-10,2026-11-10,2026-12-10", "stepped vencimentos");
check(parcelado.data[0].paidAt === "2026-09-27" && !parcelado.data[1].paidAt, "Já pago on the first parcela only");
check(parcelado.data[1].seriesCount === 3 && parcelado.data[1].seriesIndex === 2, "2/3 markers");
const parcelaSeries = parcelado.data[0].seriesId;

// Recorrente: todo dia 5, sem fim.
const recorrente = await api("POST", "/expenses", {
  date: "2026-09-28", category: "labor", amountBrl: 6480, counterparty: "Folha",
  repeat: { mode: "recurring", frequency: "monthly", dayOfMonth: 5, startsOn: "2026-10-05" },
});
check(recorrente.status === 200 && recorrente.data.length >= 12, `recorrente writes a year ahead (${recorrente.data.length})`);
check(recorrente.data[0].date === "2026-10-05" && recorrente.data[0].dueDate === "2026-10-05", "ocorrência dated on its vencimento");
check(recorrente.data[0].seriesDay === 5 && recorrente.data[0].seriesFrequency === "monthly", "todo dia 5 marker");
const recSeries = recorrente.data[0].seriesId;

// Load twice: top-up is idempotent.
const first = await herd();
const second = await herd();
check(ofSeries(first, recSeries).length === ofSeries(second, recSeries).length, "top-up idempotent across loads");
check(ofSeries(second, parcelaSeries)[1].seriesCount === 3, "load carries the parcela count");

// Pay ocorrência 3 ahead of time, then "Esta e as próximas" from ocorrência 2 raises the valor.
const rec = ofSeries(second, recSeries);
await api("PATCH", `/expenses/${rec[2].id}`, { paidAt: "2026-09-28" });
const edit = await api("PATCH", `/expenses/${rec[1].id}`, { amountBrl: 6800, scope: "following" });
check(edit.status === 200 && edit.data.amountBrl === 6800, "edit following answers the row");
const afterEdit = ofSeries(await herd(), recSeries);
check(afterEdit[0].amountBrl === 6480, "earlier ocorrência untouched");
check(afterEdit[2].amountBrl === 6480, "paid ocorrência untouched by the scoped edit");
check(afterEdit[3].amountBrl === 6800 && afterEdit.at(-1).amountBrl === 6800, "later unpaid ocorrências follow");

// Move the day of the recorrência from ocorrência 4 on.
const move = await api("PATCH", `/expenses/${afterEdit[3].id}`, { dueDate: "2027-01-20", scope: "following" });
check(move.status === 200, "move vencimento following");
const moved = ofSeries(await herd(), recSeries);
check(moved[3].dueDate === "2027-01-20" && moved[3].date === "2027-01-20", "moved ocorrência re-dated");
check(moved[4].dueDate === "2027-02-20", "next ocorrência on the new day");
check(moved[2].dueDate === "2026-12-05", "paid ocorrência keeps its date");
check(moved[4].seriesDay === 20, "série day is now 20");

// Remove "Esta e as próximas" from ocorrência 5: 1–4 stay, the série stops.
const del = await api("DELETE", `/expenses/${moved[4].id}?scope=following`);
check(del.status === 200, "remove following");
const afterDel = ofSeries(await herd(), recSeries);
check(afterDel.length === 4 && afterDel.at(-1).seriesIndex === 4, "rows from 5 on are gone, 1–4 stay");
const afterReload = ofSeries(await herd(), recSeries);
check(afterReload.length === 4, "no top-up after the série stopped");

// Remove Todas from the parcelamento: the paid first parcela stays.
const delAll = await api("DELETE", `/expenses/${ofSeries(await herd(), parcelaSeries)[1].id}?scope=all`);
check(delAll.status === 200, "remove all");
const parcelasLeft = ofSeries(await herd(), parcelaSeries);
check(parcelasLeft.length === 1 && parcelasLeft[0].paidAt === "2026-09-27", "only the paid parcela stays");

// Anexos: without a Blob token the environment says so.
const status = await api("GET", "/attachments/status");
if (process.env.BLOB === "1") {
  check(status.data.enabled === true, "anexos enabled");
  const { upload } = createRequire(`${REPO}/package.json`)("@vercel/blob/client");
  const { farmId } = (await api("GET", "/health")).data;
  const target = parcelasLeft[0].id;
  // A 1×1 PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const blob = await upload(`farms/${farmId}/expenses/${target}/${crypto.randomUUID()}-nf.png`, new Blob([png], { type: "image/png" }), {
    access: "private",
    handleUploadUrl: `${BASE}/api/herd/attachments/upload-token`,
    headers: { cookie, origin: BASE },
    contentType: "image/png",
  });
  const reg = await api("POST", `/expenses/${target}/attachments`, { pathname: blob.pathname, fileName: "nf.png" });
  check(reg.status === 200 && reg.data.sizeBytes === png.length, "anexo registered with the stored size");
  const opened = await fetch(`${BASE}/api/herd/attachments/${reg.data.id}`, { headers: { cookie } });
  check(opened.status === 200 && opened.headers.get("content-type") === "image/png", "anexo streams back");
  const outside = await api("POST", `/expenses/${target}/attachments`, { pathname: `farms/${farmId + 1000}/expenses/${target}/x-nf.png`, fileName: "x.png" });
  check(outside.status === 400 && outside.data.error === "bad_path", "pathname outside the farm refused");
  const counted = (await herd()).expenses.find((e) => e.id === target);
  check(counted.attachmentCount === 1, "load counts the anexo");
  const removed = await api("DELETE", `/attachments/${reg.data.id}`);
  check(removed.status === 200, "anexo removed");
} else {
  check(status.status === 200 && status.data.enabled === false, "anexos disabled without BLOB_READ_WRITE_TOKEN");
  const token = await api("POST", "/attachments/upload-token", {
    type: "blob.generate-client-token",
    payload: { pathname: `farms/1/expenses/${parcelasLeft[0].id}/x-nf.pdf`, clientPayload: null, multipart: false },
  });
  check(token.status === 503, "no upload token without a Blob store");
  console.log("note: Blob upload/open steps skipped (no BLOB_READ_WRITE_TOKEN; run with BLOB=1 when the server has one)");
}
const list = await api("GET", `/expenses/${parcelasLeft[0].id}/attachments`);
check(list.status === 200 && Array.isArray(list.data), "list anexos");
const missing = await api("GET", "/attachments/nope");
check(missing.status === 404, "unknown anexo is 404");

if (failures.length) { console.error(`\nFAILURES\n${failures.join("\n")}`); process.exit(1); }
console.log("\nall green");
```

Run: `node <scratchpad>/smoke-serie/api-smoke.mjs` (add `BLOB=1` in front when the server has a token).
Expected: every line `ok`, then `all green`. Without a token: the lines `anexos disabled without BLOB_READ_WRITE_TOKEN` and `no upload token without a Blob store`, and the note `Blob upload/open steps skipped …`. With `BLOB=1`: `anexo registered with the stored size`, `anexo streams back`, `pathname outside the farm refused`, `load counts the anexo`, `anexo removed`. Sign-in needs the `origin` header (Better Auth refuses a request without one: `MISSING_OR_NULL_ORIGIN`).

- [ ] **Step 5: The UI smoke (desktop 1440 and phone 390)**

`<scratchpad>/smoke-serie/ui-smoke.mjs`:

```js
// UI smoke: Repetir in the dialog, markers in Contas and the Extrato, the scope choice.
import { createRequire } from "node:module";
const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3018";
const EMAIL = process.env.EMAIL ?? "teste.serie@meubov.local";
const PASSWORD = process.env.PASSWORD ?? "Serie2026!!";
const OUT = new URL(".", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` });
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? "ok  " : "FAIL"} ${what}`); };
const poll = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };

for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(`${name} page error ${e.message}`));
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: EMAIL, password: PASSWORD }, headers: { origin: BASE } });
  check(res.ok(), `${name} sign-in`);
  const main = page.locator("main");

  await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" });
  const nav = main.getByRole("navigation", { name: "Seções do Financeiro" });
  check(await nav.getByRole("link", { name: "Painel" }).getAttribute("aria-current") === "page", `${name} subnav marks Painel`);

  // Parcelado through the dialog.
  const run = Date.now().toString(36);
  const counterparty = `Parcela ${name} ${run}`;
  await main.getByRole("button", { name: "Lançar" }).locator("visible=true").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Parcelado" }).click();
  check(await dialog.getByText("Valor total (R$)").isVisible(), `${name} Valor total label`);
  check(await dialog.getByText("segue a 1ª parcela, abaixo").isVisible(), `${name} vencimento follows the 1ª parcela`);
  await dialog.getByLabel("Valor total (R$)").fill("1000");
  await dialog.getByRole("spinbutton", { name: "Parcelas" }).fill("3");
  check(await dialog.getByText("a última parcela absorve os centavos").isVisible(), `${name} parcelas preview`);
  check(await dialog.getByText("R$ 333,34").isVisible(), `${name} last parcela takes the centavos`);
  check(await dialog.getByText(/Anexos indisponíveis neste ambiente|Adicionar foto ou PDF|Tirar foto/).first().isVisible(), `${name} anexos block`);
  await dialog.getByLabel("Pago para").fill(counterparty);
  await dialog.getByLabel("Já pago").uncheck();
  await dialog.getByRole("button", { name: "Lançar 3 parcelas" }).click();
  check(await poll(async () => (await page.getByRole("dialog").count()) === 0), `${name} dialog closes`);
  const bills = main.getByRole("listitem").filter({ hasText: counterparty }).filter({ has: page.getByRole("checkbox") });
  check(await poll(async () => (await bills.count()) === 3), `${name} 3 parcelas in Contas`);
  check(await bills.first().getByText("1/3").isVisible(), `${name} 1/3 chip`);

  // Recorrente through the dialog.
  const folha = `Folha ${name} ${run}`;
  await main.getByRole("button", { name: "Lançar" }).locator("visible=true").first().click();
  await dialog.getByRole("radio", { name: "Recorrente" }).click();
  await dialog.getByLabel("Valor (R$)").fill("6480");
  await dialog.getByLabel("no dia").fill("5");
  check(await dialog.getByText("próximas:").isVisible(), `${name} próximas preview`);
  await dialog.getByLabel("Pago para").fill(folha);
  await dialog.getByLabel("Já pago").uncheck();
  await dialog.getByRole("button", { name: "Lançar recorrência" }).click();
  check(await poll(async () => (await page.getByRole("dialog").count()) === 0), `${name} recorrência dialog closes`);
  const folhaRows = main.getByRole("listitem").filter({ hasText: folha }).filter({ has: page.getByRole("checkbox") });
  check(await poll(async () => (await folhaRows.count()) >= 12), `${name} ocorrências in Contas`);
  check(await folhaRows.first().getByText("todo dia 5").isVisible(), `${name} todo dia 5 tag`);
  await page.screenshot({ path: `${OUT}${name}-contas.png`, fullPage: true });

  // Extrato: edit an ocorrência "Esta e as próximas".
  await page.goto(`${BASE}/finance/extrato?de=2026-01-01&ate=2027-12-31&q=${encodeURIComponent(folha)}`, { waitUntil: "networkidle" });
  check(await main.getByRole("navigation", { name: "Seções do Financeiro" }).getByRole("link", { name: "Extrato" }).getAttribute("aria-current") === "page", `${name} subnav marks Extrato`);
  if (name === "desktop") {
    // The oldest ocorrência is the last row (newest first).
    await main.getByRole("button", { name: "Editar lançamento" }).last().click();
  } else {
    await main.getByRole("listitem").filter({ hasText: folha }).last().getByRole("button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Editar" }).click();
  }
  const edit = page.getByRole("dialog", { name: "Editar lançamento" });
  check(await edit.getByText("Recorrente · todo dia 5").isVisible(), `${name} edit shows the recorrência`);
  await edit.getByLabel("Valor (R$)").fill("6800");
  await edit.getByRole("button", { name: "Salvar" }).click();
  const scope = page.getByRole("dialog", { name: "Editar recorrência" });
  check(await poll(() => scope.isVisible()), `${name} scope dialog opens`);
  check(await scope.getByText("Esta e as próximas").isVisible(), `${name} scope options`);
  await scope.getByRole("button", { name: "Salvar" }).click();
  // On the phone the row's sheet stays open under the dialogs; wait for the two dialogs of the edit.
  check(await poll(async () => (await edit.count()) === 0 && (await scope.count()) === 0, 8000), `${name} scoped edit saved`);
  if (name === "phone") await page.keyboard.press("Escape");
  check(await poll(async () => (await main.getByText("R$ 6.800,00").locator("visible=true").count()) >= 2), `${name} ocorrências show the new valor`);
  await page.screenshot({ path: `${OUT}${name}-extrato.png`, fullPage: true });

  if (process.env.BLOB === "1" && name === "desktop") {
    // Attach a photo to the first parcela, then open it from "Ver anexos".
    await page.goto(`${BASE}/finance/extrato?de=2026-01-01&ate=2027-12-31&q=${encodeURIComponent(counterparty)}`, { waitUntil: "networkidle" });
    await main.getByRole("button", { name: "Editar lançamento" }).last().click();
    const form = page.getByRole("dialog", { name: "Editar lançamento" });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await form.locator('input[type="file"][multiple]').setInputFiles({ name: "nf.png", mimeType: "image/png", buffer: png });
    check(await poll(() => form.getByText("1 arquivo").isVisible(), 20000), `${name} photo uploaded`);
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "networkidle" });
    await main.getByRole("button", { name: "Ver anexos" }).first().click();
    const viewer = page.getByRole("dialog", { name: "Anexos" });
    check(await poll(async () => (await viewer.locator("img").count()) === 1 && (await viewer.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0)), 10000), `${name} anexo opens`);
    await page.keyboard.press("Escape");
  } else if (name === "desktop") {
    console.log("note: Blob UI steps skipped (run with BLOB=1 when the server has BLOB_READ_WRITE_TOKEN)");
  }
  await ctx.close();
}

await browser.close();
if (failures.length) { console.error(`\nFAILURES\n${failures.join("\n")}`); process.exit(1); }
console.log("\nall green");
```

Run: `node <scratchpad>/smoke-serie/ui-smoke.mjs` (`BLOB=1` in front with a token).
Expected: `all green`; without a token, the note `Blob UI steps skipped …`. Open `desktop-contas.png`, `phone-contas.png`, `desktop-extrato.png`, `phone-extrato.png` with the Read tool and compare with the canvas: the "1/3" chip beside the conta, "todo dia 5" with the repeat icon under it, the paperclip count beside Documento (with a token), the Painel · Extrato tabs (desktop) and pills (phone). Names carry a per-run suffix, so the script can run again on the same database.

- [ ] **Step 6: Tear down**

```bash
kill $(ss -ltnp | awk '/:3018 /{print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
docker rm -f meubov-serie-db
```
Expected: port 3018 free, container gone. Report: what passed, what was skipped (the Blob steps without a token), what was fixed, the screenshot paths.
