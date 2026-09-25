# Financeiro — cockpit, extrato e plano de contas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/finance` as the owner's cockpit (eight indicators with reference bands and year-over-year deltas, caixa, contas a pagar/receber, custo por lote), add `/finance/extrato` and `/settings/plano-de-contas`, and turn a despesa into a lançamento with vencimento, pagamento, conta, pago para, documento and lote.

**Architecture:** The `expenses` table grows seven nullable columns (`kind`, `due_date`, `paid_at`, `counterparty`, `document`, `account_id`, `lot_id`) and a per-farm `accounts` table holds the plano de contas. All arithmetic is pure and window-based in `lib/domain/{period,ledger,economics,lotEconomics,benchmarks,accounts}.ts`: COE by competência, caixa by `paidAt`, @ produzidas = vendidas − compradas + Δ estoque from the manejos and weighings. The API gains `PATCH /expenses/:id` and an `accounts` domain; the store gains five actions; three pages and one dialog render it.

**Tech Stack:** Next.js 16 app router (read `node_modules/next/dist/docs/` before routing or `useSearchParams` code), Elysia + Eden, drizzle-orm/Postgres, zustand, Tailwind, shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-financeiro-cockpit-design.md` — read it before any task. The canvas the screens copy: https://claude.ai/artifact/DVCqpY7r2pBNz7ZAYR5b7z (row A with the merged placar, rows Extrato, Novo lançamento, Plano de contas). Its artboards are plain HTML: read `project/Main.dc.html`, `project/A-Phone.dc.html`, `project/Extrato-Desktop.dc.html`, `project/Extrato-Phone.dc.html`, `project/Lancamento-Dialog.dc.html`, `project/Lancamento-Phone.dc.html`, `project/PlanoContas-Desktop.dc.html` from that artifact (Artifact tool, action read with `path`) when a task needs exact copy or spacing.

## Global Constraints

- One task per commit, `feat(finance): …` / `test(finance): …`, no `Co-Authored-By`, no session URL, no generator footer. The user squashes at the end if they wish.
- Copy in pt-BR exactly as the spec writes it: "Lançar", "Lançamento", "Vencimento", "Já pago", "Pago para / Recebido de", "Documento", "Lote (centro de custo)", "Fazenda toda", "Plano de contas", "Extrato", "Caixa do período", "A pagar", "A receber", "Saldo realizado", "do manejo".
- Windows are inclusive ISO dates `YYYY-MM-DD`; competência uses `date`, caixa uses `paidAt`; annualising is `× 365 ÷ periodDays`; arrobas: live kg ÷ 30, carcass = kg × rendimento ÷ 15.
- Every indicator is `number | null`; the UI renders "—" for null and hides the band and the delta. Never invent a number.
- Benchmarks live only in `lib/domain/benchmarks.ts` with the spec's values and sources; every band caption names the source.
- Writes require `useCan("finance", "edit")` in the UI and `edit("finance")` in `routeRequirements.ts`; reads require finance view (`RequireAccess area="finance" level="view"`).
- Pure domain code has unit tests; components are checked by `pnpm tsc --noEmit`, `pnpm lint` and the smoke task. xlsx tests run with `TZ=America/Sao_Paulo`.
- Other worktrees under `.claude/worktrees/` make plain `pnpm vitest run` and `pnpm lint` fail there: pass the file paths to vitest and `--ignore-pattern` to eslint as the tasks show, or use the scratch vitest config from the smoke task.
- Contract of shared names: the section "Shared interfaces" below is binding for every task; a task that needs something else adds it to its own files and says so in its Produces block.

## Review Focus

1. A pending despesa dated inside the window but paid outside it must count in COE and in "A pagar", never in "Pago" — Task 3 tests `cashSummary` and Task 4 tests `coe` with the same fixture row.
2. A sale session whose animal has no chute weight and no earlier weighing must not add arrobas and must be counted in `unweighed`; the card's footnote shows it — Task 4 test, Task 9 renders it.
3. An animal bought inside the window must not appear in the opening inventory while its purchase arrobas are subtracted, or @ produzidas doubles — Task 4 test `arrobasProduced` with an entry session.
4. Marking a lançamento as pago must not change its `date`, so the Receita × Custo bars and COE stay put while Caixa moves — Task 6 `Update` test and Task 3 `cashSummary` test.
5. A conta renamed to a name that exists in the same grupo with different case must be refused (409), and archiving must not remove it from old lançamentos' labels — Task 6 `Update` test and Task 2 `accountName` test with an archived account.

## Waves (who runs in parallel)

| Wave | Tasks | Needs | Notes |
| --- | --- | --- | --- |
| 0 | 1 | — | schema, migration, types, mappers, load, redaction, seed rows; adds `kind: "expense"` / `accounts: []` wherever `tsc` demands |
| 1 | 2 | 1 | period, accounts, benchmarks (pure) |
| 2 | 3, 4, 6 | 2 | ledger, economics (with `periodAdg`), API; disjoint files |
| 3 | 5, 7 | 4 · 6 | lot economics; store actions typed against the mounted routes |
| 4 | 8, 12 | 7 · 3+4 | EntryDialog + LancarButton; export datasets |
| 5 | 9, 10, 11 | 8, 12 | the three pages; disjoint files |
| 6 | 13 | all | seed check, smoke on desktop and phone at edit and view, whole-branch review |

Between Task 4 and Task 9, `pnpm tsc --noEmit` reports errors only in `app/(app)/finance/page.tsx` (the old page imports economics helpers Task 4 removes); Tasks 5, 6, 7, 8 and 12 expect exactly that, and Task 9's rewrite clears it.

## Shared interfaces

(the contract every task was written against — verbatim)


Repo: /home/luketa/meubov (Next.js 16 app router, TypeScript strict, Elysia API under `app/api/herd/[[...slugs]]/route.ts` → `lib/api/app.ts`, Drizzle + Postgres, Zustand store `lib/store/useHerdStore.ts`, Vitest, pnpm). Read `AGENTS.md`: this Next.js differs from training data; check `node_modules/next/dist/docs/` before app-router code.
Spec: `docs/superpowers/specs/2026-09-24-financeiro-cockpit-design.md` — read it whole first.
Canvas (what the screens look like): https://claude.ai/artifact/DVCqpY7r2pBNz7ZAYR5b7z — read its `project/*.dc.html` files with the Artifact tool when a task needs exact copy or spacing (`Main.dc.html` and `A-Phone.dc.html` for the cockpit; `Extrato-*.dc.html`, `Lancamento-*.dc.html`, `PlanoContas-Desktop.dc.html` for the rest; only the "custo × cotação" card of `B-Desktop.dc.html` is used).

### Global constraints
- Copy in Portuguese (pt-BR) as the spec writes it; code, comments and commit messages in English; no emoji; no attribution trailers in commits.
- Money `formatCurrency`, numbers `formatNumber`, arrobas `formatArroba` from `lib/domain/format.ts`; dates ISO `YYYY-MM-DD` strings, `formatDate` for dd/mm/yyyy; `todayISO()` from `lib/domain/dates.ts`. Never `new Date()` in domain code: take `todayIso` as a parameter.
- Every indicator returns `number | null`; null renders "—". Never a fake number.
- Pure domain code in `lib/domain/*`, tested in `lib/domain/__tests__/*.test.ts` (see `economics.test.ts`, `fixtures.ts` for style: `describe`/`it`, fixed `REF` dates).
- Tailwind tokens already in the app: `text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `bg-canvas`, `border-hairline`, `text-brand`, `bg-brand-soft`, `text-healthy`, `text-attention`, `bg-attention-soft`, `text-overdue`, `text-scheduled`, `text-fmd`; fonts `font-heading`, `font-mono`. Components in `components/ui/*` (shadcn: Button, Dialog, Input, Label, Select, Textarea, Table, SectionCard, KpiCard, EmptyState, StatusPill; no Checkbox or Tabs: use a native `<input type="checkbox">` and the segmented button group of `components/team/PermissionsGrid.tsx`), `components/charts/*` (BarChart, LineChart, Sparkline, DonutChart until T9 deletes it), `PageHeader`, `ReadOnlyPill`, `RequireAccess`, `ExportMenu`.
- Permissions: `useCan("finance", "edit")` gates every write in the UI; API routes in `lib/api/permissions/routeRequirements.ts` (snapshot test `lib/api/__tests__/routeRequirements.test.ts` must be updated).
- Touch targets ≥ 44px on phone (`min-h-11 md:min-h-0` pattern), `aria-label` on icon-only buttons.
- Run checks with `pnpm tsc --noEmit`, `pnpm lint`, `pnpm vitest run <file>`; xlsx tests with `TZ=America/Sao_Paulo`.
- Commits: one per task, `feat(finance): ...` / `test(finance): ...`, no trailers. (The user may later squash.)

### File ownership (one task per file; do not edit files another task owns)
- T1 foundation: `lib/types.ts`, `lib/db/schema.ts`, `drizzle/00XX_financeiro-lancamentos-e-plano-de-contas.sql` + `drizzle/meta/*`, `lib/api/mappers.ts`, `lib/api/domains/herd/useCases/Load.useCase.ts`, `lib/domain/moneyRedaction.ts` (+ its test), `lib/data/seed.ts`, `cli/seedCli.ts`.
- T2 period/accounts/benchmarks: `lib/domain/period.ts`, `lib/domain/accounts.ts`, `lib/domain/benchmarks.ts`, their tests; delete `components/dashboard/period.ts` and fix its two importers (`app/(app)/dashboard/page.tsx`, `components/dashboard/PeriodPicker.tsx`) — only the import lines.
- T3 ledger: `lib/domain/ledger.ts` + test.
- T4 economics: `lib/domain/economics.ts` (rewrite) + `lib/domain/__tests__/economics.test.ts`; `lib/domain/finance.ts` (remove now-unused helpers) + test; `lib/domain/adg.ts` gains `periodAdg` + test (indicators needs it); `lib/store/dashboard.ts` only if it imports a removed name.
- T5 lot economics: `lib/domain/lotEconomics.ts` + test (consumes `periodAdg` from T4).
- T6 API: `lib/api/domains/expenses/**`, new `lib/api/domains/accounts/**`, `lib/api/app.ts` (mount), `lib/api/permissions/routeRequirements.ts` + snapshot test, `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` + its test.
- T7 store: `lib/store/useHerdStore.ts` (new actions, `accounts` slice), `lib/repository/*` if the load type needs it.
- T8 EntryDialog: `components/finance/EntryDialog.tsx`, `components/finance/LancarButton.tsx`.
- T9 cockpit: `app/(app)/finance/page.tsx`, `components/finance/{FinanceHeader,CashStrip,Placar,IndicatorCard,BenchmarkBand,CostVsPriceCard,MarketPanel,CostBreakdownCard,BillsCard,RecentEntriesCard,LotsEconomicsCard}.tsx`, `components/finance/format.tsx`; delete `FinanceKpis, LivestockIndicators, MarketNotice, QuoteChart, CostBreakdownChart, CategorySalesTable, ExpensesList, RegisterExpenseDialog` (and `components/charts/donut-chart.tsx` if unused); remove `categorySalesExportTable`/`CategorySalesRow` and their test from `lib/export/datasets/finance.ts` (deletion only; their last importers die here); `lib/__tests__/nav.test.ts` untouched.
- T10 extrato: `app/(app)/finance/extrato/page.tsx`, `components/finance/extrato/*`.
- T11 plano de contas: `app/(app)/settings/plano-de-contas/page.tsx`, `components/finance/plano/*`, `lib/nav.ts` (+ `lib/__tests__/nav.test.ts` if it snapshots children).
- T12 export: `lib/export/datasets/finance.ts` + its test (new tables; `expensesExportTable` keeps only `kind === "expense"`).
- T13 seed + smoke: `lib/data/seed.ts` rows (coordinated with T1), smoke script in scratchpad.

### Types (T1 produces; everyone consumes) — `lib/types.ts`
```ts
export type EntryKind = "expense" | "revenue";
/** One line of money the farm typed: a despesa or a receita ("lançamento"). Table stays `expenses`. */
export interface Expense {
  id: string;
  kind: EntryKind;                 // default "expense"
  date: string;                    // competência
  category: ExpenseCategory;       // grupo; a receita writes "other" and nothing reads it
  amountBrl: number;
  notes?: string;
  dueDate?: string;                // vencimento; absent = date
  paidAt?: string;                 // absent = pendente
  counterparty?: string;           // pago para / recebido de
  document?: string;
  accountId?: string;              // conta
  lotId?: string;                  // centro de custo
}
export type AccountGroup = ExpenseCategory | "revenue";
export interface Account { id: string; group: AccountGroup; name: string; archivedAt?: string }
// HerdData gains: accounts: Account[];
```
DB (T1): `expenses` + columns `kind entry_kind not null default 'expense'`, `due_date date`, `paid_at date`, `counterparty text`, `document text`, `account_id text references accounts(id) on delete set null`, `lot_id text references lots(id) on delete set null`; migration backfills `update expenses set paid_at = date where paid_at is null`. New `accounts` (`id text pk, farm_id int references farm cascade, "group" account_group not null, name text not null, archived_at timestamp`), unique `(farm_id, "group", lower(name))`. Enums `entry_kind('expense','revenue')`, `account_group(<7 categories>,'revenue')`. Mapper `toExpense`/`toAccount` use `orNothing` for nullable columns. Load returns `accounts` ordered by group, name. Redaction keeps `accounts` as is. `HerdData` default in the store: `accounts: []`.

### Domain signatures (T2–T5 produce)
```ts
// lib/domain/period.ts  (Period type stays in lib/domain/finance.ts and is re-exported here)
export type { Period } from "@/lib/domain/finance";
export function defaultPeriod(refIso: string, months = 12): Period;         // moved from components/dashboard/period.ts, same body
export function shiftPeriodByMonths(period: Period, months: number): Period; // moved, same body
export function periodDays(period: Period): number;                        // inclusive count, ≥ 1
export function priorPeriod(period: Period): Period;                       // same number of days, ending the day before `start`
export function annualise(value: number, period: Period): number;          // value * 365 / periodDays
export function inPeriod(iso: string, period: Period): boolean;            // start <= iso <= end
export function periodFromSearch(params: { get(k: string): string | null }, todayIso: string): Period; // ?de&ate valid ISO and de<=ate, else defaultPeriod(todayIso)
export function periodSearch(period: Period): string;                      // "de=YYYY-MM-DD&ate=YYYY-MM-DD"

// lib/domain/accounts.ts
export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string>;            // EXPENSE_CATEGORY_LABEL + revenue: "Receitas"
export const ACCOUNT_GROUPS: readonly AccountGroup[];                        // ["revenue", ...7 categories in EXPENSE_CATEGORY_LABEL order]
export const DEFAULT_ACCOUNTS: readonly { group: AccountGroup; name: string }[]; // the spec's list
export function accountsByGroup(accounts: Account[], includeArchived?: boolean): Record<AccountGroup, Account[]>; // sorted by name, pt-BR collation
export function missingDefaults(accounts: Account[]): { group: AccountGroup; name: string }[]; // case-insensitive, trims
export function accountName(accountId: string | undefined, accounts: Account[]): string | null;
export function counterpartySuggestions(expenses: Expense[]): string[];   // distinct trimmed, most recent date first, max 20

// lib/domain/benchmarks.ts
export type FarmSystem = "cria" | "ciclo_completo" | "recria_engorda";
export const FARM_SYSTEM_LABEL: Record<FarmSystem, string>;  // "cria" | "ciclo completo" | "recria e engorda"
export interface Benchmark { min: number; max: number; mean: number; meanLabel?: string; top: number | null; topLabel?: string; better: "low" | "high"; source: string }
export type BenchmarkKey = "costPerArroba" | "arrobasPerHa" | "gmd" | "offtake" | "stocking" | "costToRevenue" | "outlay";
export function benchmark(key: BenchmarkKey, system: FarmSystem): Benchmark; // values + sources exactly as the spec's "Rules of the figures"; gmd in kg/day (0.429 / 0.654)
export type BandTone = "healthy" | "attention" | "overdue";
export function bandTone(value: number, b: Benchmark): BandTone; // healthy past top (or past mean when top null), overdue on the wrong side of mean, attention between
export function bandPosition(value: number, b: Benchmark): number; // 0..100 clamped

// lib/domain/ledger.ts
export type LedgerKind = "expense" | "revenue" | "sale" | "purchase" | "treatment";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";
export interface LedgerRow {
  id: string;                 // expense id | movement id | `treatment:${date}:${name}`
  kind: LedgerKind;
  date: string; dueDate: string; paidAt: string | null; status: LedgerStatus;
  group: AccountGroup | "capital"; groupLabel: string; account: string | null;
  counterparty: string | null; document: string | null; lotId: string | null; lotName: string | null;
  amountBrl: number; notes: string | null; locked: boolean; headCount: number | null; expense: Expense | null;
}
export interface LedgerInputs { expenses: Expense[]; accounts: Account[]; movements: Movement[]; manejoSessions: ManejoSession[]; animals: Animal[]; treatments: Treatment[]; lots: Lot[] }
export function ledgerRows(input: LedgerInputs, period: Period, todayIso: string): LedgerRow[]; // in period by `date`, newest first then id; sale/purchase from priced movements (movement.id === session.id for derived rows; session gives counterparty, lote = predominant lotId of its done animals, document "manejo · N animais · X @" using saleSummary for sales); treatments: done with costBrl grouped by date+name, group "health", document null, headCount = animals, amount = sum; status: expense paid→"paid", revenue paid→"received", pending with dueDate < today→"overdue", pending expense→"payable", pending revenue→"receivable"; derived rows are paid/received on their date.
export interface LedgerFilter { kind: LedgerKind | "all"; group: AccountGroup | "capital" | "all"; accountId: string | "all"; lotId: string | "farm" | "all"; status: LedgerStatus | "all"; search: string }
export const EMPTY_FILTER: LedgerFilter;
export function filterLedger(rows: LedgerRow[], filter: LedgerFilter): LedgerRow[]; // search: case/accent-insensitive over account, counterparty, document, notes, groupLabel
export interface CashSummary { received: number; receivable: number; receivableCount: number; paid: number; payable: number; payableCount: number; overdueCount: number; balance: number }
export function cashSummary(input: Pick<LedgerInputs, "expenses" | "movements" | "treatments">, period: Period, todayIso: string): CashSummary; // received = revenue entries with paidAt in period + priced sale movements dated in period; paid = expense entries with paidAt in period + done treatment costs dated in period; receivable/payable = pending entries of any date; overdueCount = pending despesas (kind expense) with dueDate < today; balance = received − paid
export interface LedgerSummary { revenue: number; coe: number; sales: number; purchases: number; result: number } // over the rows given (revenue = revenue+sale rows; coe = expense+treatment rows; result = revenue − coe)
export function ledgerSummary(rows: LedgerRow[]): LedgerSummary;
export function pendingBills(expenses: Expense[], todayIso: string): { payables: Expense[]; receivables: Expense[] }; // pending, dueDate asc then date
export function effectiveDueDate(e: Expense): string; // dueDate ?? date

// lib/domain/economics.ts  (rewrite; the dashboard keeps using the first three)
export interface MonthlyRevenueCost { date: string; month: string; revenue: number; cost: number }
export function monthlyRevenueCost(movements, treatments, expenses, months: number, refIso: string): MonthlyRevenueCost[]; // revenue += kind "revenue" entries; cost excludes them
export function costBreakdownBetween(expenses, treatments, startIso, endIso): CostBreakdownSlice[]; // skips kind "revenue"
export function costBreakdown(expenses, treatments, months, refIso): CostBreakdownSlice[];
export interface EconomicsInputs { animals: Animal[]; manejoSessions: ManejoSession[]; movements: Movement[]; treatments: Treatment[]; expenses: Expense[]; invernadas: Invernada[]; lots: Lot[] }
export function coe(expenses: Expense[], treatments: Treatment[], period: Period): number;
export function periodRevenue(expenses: Expense[], movements: Movement[], period: Period): { total: number; sales: number; other: number };
export interface SoldArrobas { arrobas: number; heads: number; unweighed: number }
export function arrobasSold(sessions: ManejoSession[], animals: Animal[], period: Period): SoldArrobas; // sale sessions dated in period, animals outcome "done": weightKg × yield ÷ 15 (passYieldPct), else last weighing on/before the date × session yield ÷ 15, else unweighed++
export function arrobasBought(sessions: ManejoSession[], period: Period): { arrobas: number; heads: number }; // entry sessions in period, done animals, weightKg ÷ 30
export function herdArrobasAt(animals: Animal[], sessions: ManejoSession[], dateIso: string): { arrobas: number; heads: number }; // alive on date per spec; weight = last weighing ≤ date else first weighing after; entry animals (createdAnimal in an entry session dated after `date`) excluded
export interface ArrobasProduced { sold: number; bought: number; inventoryStart: number; inventoryEnd: number; delta: number; produced: number; unweighed: number; headsSold: number }
export function arrobasProduced(input: EconomicsInputs, period: Period, todayIso: string): ArrobasProduced; // inventoryEnd at min(period.end, todayIso)
export function costPerArroba(coeBrl: number, produced: number): number | null; // null when coe 0 or produced <= 0
export function outlayPerHeadMonth(coeBrl: number, avgHeads: number, period: Period): number | null; // coe / avgHeads / (periodDays/30.4375)
export function offtakeRate(headsSold: number, avgHeads: number, period: Period): number | null; // annualised %
export function averageCalfPrice(movements: Movement[], period: Period): number | null; // priced calf purchases in period
export function exchangeRatio(sold: SoldArrobas, quote: number | null, calfPrice: number | null): { calvesPerSteer: number | null; arrobasPerCalf: number | null };
export function farmSystem(input: EconomicsInputs, period: Period): FarmSystem; // per spec
export interface HeadCounts { start: number; end: number; avg: number }
export interface Indicators {
  period: Period; system: FarmSystem; heads: HeadCounts; hectares: number;
  revenue: number; salesRevenue: number; otherRevenue: number; coe: number; result: number;
  resultPerHa: number | null; marginPct: number | null; costToRevenuePct: number | null; capitalTurnover: number | null;
  produced: ArrobasProduced; arrobasPerHa: number | null; costPerArroba: number | null; realizedPerArroba: number | null; marginPerArroba: number | null;
  outlayPerHeadMonth: number | null; adg: { kgPerDay: number | null; animals: number }; offtakePct: number | null; stocking: number | null;
  calfPrice: number | null; exchange: { calvesPerSteer: number | null; arrobasPerCalf: number | null };
  herdArrobas: number; herdValue: number | null; inventoryDeltaBrl: number | null;
}
export function indicators(input: EconomicsInputs, period: Period, quote: number | null, todayIso: string): Indicators; // stocking = herdStockingRateAuPerHa(animals, invernadas) (null when no ha); herdValue = herdArrobas × quote; inventoryDeltaBrl = produced.delta × quote
export function indicatorDeltas(current: Indicators, prior: Indicators): Record<"result" | "costPerArroba" | "arrobasPerHa" | "outlayPerHeadMonth" | "adg" | "offtakePct" | "stocking" | "exchange", { pct: number | null; pts: number | null }>; // pct = (cur − prior)/|prior|·100; pts = cur − prior; null when either side is null or prior is 0

// lib/domain/adg.ts gains (Task 4)
export function periodAdg(animals: Animal[], period: Period): { kgPerDay: number | null; animals: number }; // per animal: first and last weighing inside the period ≥ 30 days apart → (last−first)/days; mean over animals; null when none

// lib/domain/lotEconomics.ts
export interface LotEconomics { lotId: string | null; name: string; heads: number; directBrl: number; sharedBrl: number; totalBrl: number; perHeadDay: number | null; adg: number | null; produced: number | null; costPerArroba: number | null; marginPerArroba: number | null }
export function lotEconomics(input: EconomicsInputs, period: Period, quote: number | null, todayIso: string): { lots: LotEconomics[]; farm: LotEconomics }; // active lots (deletedAt undefined) with ≥ 1 active animal or any direct cost, name asc; direct = expenses (kind expense, lotId) in period + done treatments of animals whose lotId is the lot; shared = (coe − Σ direct of all lots) × heads/Σheads; produced per lot = sold (sale sessions' done animals whose animal.lotId is the lot) − bought (entry sessions into destinationLotId) + Δ inventory of the lot's current animals; farm = totals with coe and arrobasProduced(...).produced
```

### API (T6 produces; T7 consumes via Eden `api`)
- `POST /expenses` body: `{ date, category, amountBrl, notes?, kind?, dueDate?, paidAt?, counterparty?, document?, accountId?, lotId? }` → `Expense`.
- `PATCH /expenses/:id` body: every field optional; `dueDate | paidAt | accountId | lotId | counterparty | document | notes` accept `null` to clear (`t.Nullable`) → `Expense`; 404 `{ error: "not_found" }`.
- `DELETE /expenses/:id` unchanged.
- `POST /accounts` `{ group, name }` → `Account`; 409 `{ error: "duplicate_name" }` (unique index violation or pre-check, case-insensitive).
- `PATCH /accounts/:id` `{ name?, archived?: boolean }` → `Account`; 409 on duplicate name; 404.
- `POST /accounts/defaults` → `{ created: Account[] }` (skips existing names, case-insensitive, per group).
- routeRequirements: all `edit("finance")`.
- `AddPurchaseUseCase`: expense gets `kind: "expense"`, `paidAt: date`, `counterparty: bull.central ?? undefined`, `accountId` = active account with group "breeding" and lower(name) = "sêmen" when it exists.
Use-case pattern: class with `run`, `constructor(repo = db)`, `__throwOnBrowser`; tests with the chainable db stub as in `lib/api/domains/semen/useCases/__tests__/*.test.ts`. Controller pattern: `lib/api/domains/expenses/expenses.controller.ts` with `farmPlugin`, `{ farm: true, body }`.

### Store (T7 produces) — `useHerdStore`
```ts
accounts: Account[];
addExpense(e: Omit<Expense, "id">): Promise<void>;           // exists; body now carries the new fields
updateExpense(id: string, patch: ExpensePatch): Promise<void>; // ExpensePatch = Partial<Omit<Expense,"id"|"kind">> with nullable clearing: { dueDate?: string|null; paidAt?: string|null; counterparty?: string|null; document?: string|null; accountId?: string|null; lotId?: string|null; notes?: string|null; date?; category?; amountBrl? }
markExpensePaid(id: string, paidAt: string | null): Promise<void>; // updateExpense shorthand
removeExpense(id: string): Promise<void>;                    // exists
addAccount(input: { group: AccountGroup; name: string }): Promise<Account | null>; // null on 409
updateAccount(id: string, patch: { name?: string; archived?: boolean }): Promise<boolean>; // false on 409
seedDefaultAccounts(): Promise<number>;                      // count created
```
Errors go through the existing `apiFail(...)` helper; toasts are the caller's job.

### UI components (T8–T11) — props
```ts
// T8 components/finance/EntryDialog.tsx
export function EntryDialog(props: { open: boolean; onOpenChange(open: boolean): void; expense?: Expense; defaultKind?: EntryKind }): JSX.Element; // create when `expense` absent; Portuguese copy per spec; uses store addExpense/updateExpense/addAccount, counterpartySuggestions, accountsByGroup, active lots; success toasts "Lançamento salvo" / "Despesa lançada" / "Receita lançada"
export function LancarButton(props: { size?: "sm" | "default"; className?: string; defaultKind?: EntryKind; variant?: "default" | "outline" | "ghost" }): JSX.Element; // renders the trigger + EntryDialog; hidden (returns null) without finance edit
// T9 (cockpit) — internal props free, but: IndicatorCard({ label, value: ReactNode, unit?, sub?, delta?: { text: string; positive: boolean } | null, band?: { value: number; benchmark: Benchmark; format(v: number): string }, source?: string, foot?: string, className? }); BenchmarkBand({ value, benchmark, format }); page reads `?de&ate` with `useSearchParams` + `periodFromSearch`, writes with `router.replace`.
// T10 extrato: page under app/(app)/finance/extrato; filters in the URL (`de, ate, tipo, grupo, conta, lote, status, q`); ExtratoTable (md+) / ExtratoList (phone); 50 rows per page; uses ledgerRows/filterLedger/ledgerSummary, EntryDialog for edit, markExpensePaid, removeExpense, ledgerExportTable.
// T11 plano: app/(app)/settings/plano-de-contas/page.tsx wraps <AccountsPage/> in RequireAccess finance view; lib/nav.ts child { label: "Plano de contas", href: "/settings/plano-de-contas", area: "finance" } after Fazendas.
// T12 lib/export/datasets/finance.ts
export function ledgerExportTable(rows: LedgerRow[], title = "Extrato"): ExportTable; // columns Data, Vencimento, Pagamento, Tipo, Grupo, Conta, Pago para / Recebido de, Documento, Lote, Valor, Status
export function indicatorsExportTable(ind: Indicators, prior: Indicators | null): ExportTable; // Indicador, Valor, Ano anterior, Referência
export function lotsEconomicsExportTable(lots: LotEconomics[], farm: LotEconomics): ExportTable;
export { expensesNewestFirst, expensesExportTable } // keep; expensesExportTable filters kind "expense" (Relatórios passes every lançamento); categorySales* go in T9; pluralCategoryLabel stays (reports use it)
```

---

### Task 1: Foundation — types, schema, migration, mappers, load, redaction, seed accounts

**Files:**
- Modify: `lib/types.ts` (Expense at :358-365, HerdData.expenses at :406)
- Modify: `lib/db/schema.ts` (enums before `inactiveReasonEnum` :151-152, `expenses` table :557-571, row types :696)
- Create (generated): `drizzle/0021_financeiro-lancamentos-e-plano-de-contas.sql`, `drizzle/meta/0021_snapshot.json`; Modify (generated): `drizzle/meta/_journal.json`
- Modify: `lib/api/mappers.ts` (imports :9-50, `toExpense` :206-214)
- Modify: `lib/api/domains/herd/useCases/Load.useCase.ts` (imports :10-53, destructure :74-95, `Promise.all` end ~:180, return ~:250)
- Modify: `lib/domain/__tests__/moneyRedaction.test.ts` (`herd` fixture :62-78, `redactHerdMoney` describe ~:198). `lib/domain/moneyRedaction.ts` needs NO change: `redactHerdMoney` spreads `...data`, so `accounts` already survives — the new test proves it.
- Modify: `lib/data/seed.ts` (import :9-26, expenses block :200-240, return :651)
- Modify: `lib/data/__tests__/seed.test.ts` (expense-book test :89-100)
- Modify: `cli/seedCli.ts` (expenses insert :281-292)
- Modify (compile fixes for the new required `kind` / `accounts`, verified with `tsc`):
  - `lib/api/domains/expenses/useCases/Add.useCase.ts` :9-11 (fixes both `expenses.controller.ts:17` and `semen/useCases/AddPurchase.useCase.ts:41` without touching them)
  - `components/finance/RegisterExpenseDialog.tsx` :78 (T9 deletes the file later)
  - `components/reports/useReportData.ts` :21, the object and the deps array
  - `components/reports/__tests__/datasets.test.ts` :15
  - `lib/domain/__tests__/economics.test.ts` :34 (T4 rewrites it later)
  - `lib/export/__tests__/finance.test.ts` :8-9
  - `lib/reports/__tests__/data.ts` :18
  - `lib/store/useHerdStore.ts` :566 (only `accounts: []` in the initial state; T7 owns the rest)
- Not affected (checked): `lib/api/__tests__/permissions.test.ts` (its HERD literal is untyped inside `vi.hoisted`), `lib/repository/ApiHerdRepository.ts` (`data as HerdData`).

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // lib/types.ts
  export type EntryKind = "expense" | "revenue";
  export interface Expense { id: string; kind: EntryKind; date: string; category: ExpenseCategory; amountBrl: number; notes?: string; dueDate?: string; paidAt?: string; counterparty?: string; document?: string; accountId?: string; lotId?: string }
  export type AccountGroup = ExpenseCategory | "revenue";
  export interface Account { id: string; group: AccountGroup; name: string; archivedAt?: string }
  // HerdData.accounts: Account[]
  // lib/db/schema.ts
  export const entryKindEnum;   // pgEnum("entry_kind", ["expense", "revenue"])
  export const accountGroupEnum; // pgEnum("account_group", [7 categories, "revenue"])
  export const accounts;         // pgTable("accounts")
  export type FarmAccountRow = typeof accounts.$inferSelect; // NOT "AccountRow": that name is already Better Auth's `account` row (schema.ts:772)
  // lib/api/mappers.ts
  export function toExpense(row: ExpenseRow): Expense;
  export function toAccount(row: FarmAccountRow): Account;
  // lib/api/domains/expenses/useCases/Add.useCase.ts
  type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & { kind?: EntryKind; farmId: number }; // DB default fills kind
  ```

- [ ] **Step 1: Types.** In `lib/types.ts` replace

```ts
/** Farm expense (cost outside the sanitary treatments). */
export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amountBrl: number;
  notes?: string;
}
```

with

```ts
/** Whether a lançamento is money out (despesa) or money in (receita). */
export type EntryKind = "expense" | "revenue";

/**
 * One line of money the farm typed: a despesa or a receita ("lançamento").
 * The table stays `expenses`; vendas, compras and treatment costs are not
 * lançamentos, they derive from the manejos.
 */
export interface Expense {
  id: string;
  kind: EntryKind;
  /** Competência. */
  date: string;
  /** Grupo; a receita writes "other" and nothing reads it. */
  category: ExpenseCategory;
  amountBrl: number;
  notes?: string;
  /** Vencimento; absent means `date`. */
  dueDate?: string;
  /** Day it was paid or received; absent means pendente. */
  paidAt?: string;
  /** Pago para / recebido de, free text. */
  counterparty?: string;
  /** "NF 4.812", free text. */
  document?: string;
  /** The conta (plano de contas). */
  accountId?: string;
  /** Centro de custo; absent means the whole farm. */
  lotId?: string;
}

/** Grupo of a conta: the seven expense categories plus receitas. */
export type AccountGroup = ExpenseCategory | "revenue";

/** A farm-defined conta inside a grupo ("Sal mineral" in Nutrição). */
export interface Account {
  id: string;
  group: AccountGroup;
  name: string;
  /** ISO timestamp; an archived conta leaves the form and keeps its history. */
  archivedAt?: string;
}
```

and in `HerdData` replace

```ts
  expenses: Expense[];
  customCategories: CustomCategory[];
  semenBulls: SemenBull[];
  farm: FarmData;
}
```

with

```ts
  expenses: Expense[];
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
  customCategories: CustomCategory[];
  semenBulls: SemenBull[];
  farm: FarmData;
}
```

- [ ] **Step 2: Schema.** In `lib/db/schema.ts` (imports `pgEnum`, `pgTable`, `timestamp`, `uniqueIndex`, `sql` are already there) replace

```ts
/** Why an animal left the active herd. */
export const inactiveReasonEnum
```

with

```ts
/** Whether a lançamento is money out (despesa) or money in (receita). */
export const entryKindEnum = pgEnum("entry_kind", ["expense", "revenue"]);

/** Grupo of a conta: the seven expense categories plus receitas. */
export const accountGroupEnum = pgEnum("account_group", [
  "nutrition",
  "pasture",
  "labor",
  "health",
  "breeding",
  "admin",
  "other",
  "revenue",
]);

/** Why an animal left the active herd. */
export const inactiveReasonEnum
```

Replace the whole `expenses` table

```ts
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
```

with

```ts
/**
 * A conta of the farm's plano de contas, inside one grupo. Never deleted: a
 * conta with lançamentos is archived, which hides it from the form and keeps
 * the history.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    group: accountGroupEnum("group").notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
  },
  // Names are unique per grupo ignoring case: "sal mineral" and "Sal mineral" are one conta.
  (t) => [
    uniqueIndex("accounts_farm_id_group_name_idx").on(t.farmId, t.group, sql`lower(${t.name})`),
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
    /** Competência. */
    date: date("date").notNull(),
    /** Grupo; a receita writes "other" and nothing reads it. */
    category: expenseCategoryEnum("category").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    notes: text("notes"),
    /** Vencimento; null means `date`. */
    dueDate: date("due_date"),
    /** Day it was paid or received; null means pendente. */
    paidAt: date("paid_at"),
    /** Pago para / recebido de, free text. */
    counterparty: text("counterparty"),
    /** "NF 4.812", free text. */
    document: text("document"),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Centro de custo; null means the whole farm. */
    lotId: text("lot_id").references(() => lots.id, { onDelete: "set null" }),
  },
  (t) => [index("expenses_farm_id_date_idx").on(t.farmId, t.date)]
);
```

Replace

```ts
export type ExpenseRow = typeof expenses.$inferSelect;
```

with

```ts
export type ExpenseRow = typeof expenses.$inferSelect;
export type FarmAccountRow = typeof accounts.$inferSelect;
```

- [ ] **Step 3: Generate the migration.**

```bash
cd /home/luketa/meubov && pnpm migration:create financeiro-lancamentos-e-plano-de-contas
```

Expected: `[✓] Your SQL migration file ➜ drizzle/0021_financeiro-lancamentos-e-plano-de-contas.sql`, plus `drizzle/meta/0021_snapshot.json` and a new `_journal.json` entry `idx: 21`, `tag: "0021_financeiro-lancamentos-e-plano-de-contas"`. No rename prompt (only additions). The file must read exactly (drizzle-kit output, verified):

```sql
CREATE TYPE "public"."account_group" AS ENUM('nutrition', 'pasture', 'labor', 'health', 'breeding', 'admin', 'other', 'revenue');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('expense', 'revenue');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"group" "account_group" NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "kind" "entry_kind" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_at" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "document" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "lot_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_farm_id_group_name_idx" ON "accounts" USING btree ("farm_id","group",lower("name"));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;
```

- [ ] **Step 4: Append the backfill by hand**, before the migration is applied anywhere. The generated file ends without a newline after its last `;`, so this makes the last two lines `...ON UPDATE no action;--> statement-breakpoint` and the UPDATE, the way 0017 separates statements:

```bash
cd /home/luketa/meubov && printf -- '--> statement-breakpoint\nUPDATE "expenses" SET "paid_at" = "date" WHERE "paid_at" IS NULL;' >> drizzle/0021_financeiro-lancamentos-e-plano-de-contas.sql
tail -2 drizzle/0021_financeiro-lancamentos-e-plano-de-contas.sql
```

Expected tail:

```sql
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "expenses" SET "paid_at" = "date" WHERE "paid_at" IS NULL;
```

Hashes: `pnpm migration:check` runs `drizzle-kit check`, which checks the snapshots, not the SQL, so the hand edit passes it. `drizzle-kit migrate` stores the file's sha256 when it applies it, and `pnpm migration:status` compares that stored hash with the file on disk. So edit the file before the first `migration:run`, and never after it has been applied, or `status` shows it as Pending. `migrate` itself goes by the journal's `when` and would not run it again.

```bash
cd /home/luketa/meubov && pnpm migration:check
```

Expected: `✅ Migration check completed`.

- [ ] **Step 5: Mappers.** In `lib/api/mappers.ts` add `Account,` as the first name of the `@/lib/types` import (before `Animal,`), and `FarmAccountRow,` right after `ExpenseRow,` in the `@/lib/db/schema` import. Replace

```ts
export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
  };
}
```

with

```ts
export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    category: row.category,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
    dueDate: orNothing(row.dueDate),
    paidAt: orNothing(row.paidAt),
    counterparty: orNothing(row.counterparty),
    document: orNothing(row.document),
    accountId: orNothing(row.accountId),
    lotId: orNothing(row.lotId),
  };
}

export function toAccount(row: FarmAccountRow): Account {
  return {
    id: row.id,
    group: row.group,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
  };
}
```

- [ ] **Step 6: Load.** In `lib/api/domains/herd/useCases/Load.useCase.ts`: add `accounts,` as the first name of the `@/lib/db/schema` import (before `animals,`) and `toAccount,` as the first name of the `@/lib/api/mappers` import (before `toAnimal,`). Replace

```ts
      semenBullRows,
      semenPurchaseRows,
    ] = await Promise.all([
```

with

```ts
      semenBullRows,
      semenPurchaseRows,
      accountRows,
    ] = await Promise.all([
```

Replace

```ts
        .orderBy(asc(semenPurchases.date), asc(semenPurchases.id)),
    ]);
```

with

```ts
        .orderBy(asc(semenPurchases.date), asc(semenPurchases.id)),
      this.repository
        .select()
        .from(accounts)
        .where(eq(accounts.farmId, farmId))
        .orderBy(asc(accounts.group), asc(accounts.name)),
    ]);
```

Replace

```ts
      expenses: expenseRows.map(toExpense),
      customCategories: customCategoryRows.map(toCustomCategory),
```

with

```ts
      expenses: expenseRows.map(toExpense),
      accounts: accountRows.map(toAccount),
      customCategories: customCategoryRows.map(toCustomCategory),
```

- [ ] **Step 7: Redaction test (accounts survive).** In `lib/domain/__tests__/moneyRedaction.test.ts` replace

```ts
  expenses: [{ id: "e-1", date: "2026-09-01", category: "labor", amountBrl: 1200 }],
  customCategories: [],
```

with

```ts
  expenses: [{ id: "e-1", kind: "expense", date: "2026-09-01", category: "labor", amountBrl: 1200 }],
  accounts: [{ id: "acc-1", group: "labor", name: "Salários" }],
  customCategories: [],
```

and inside `describe("redactHerdMoney", ...)` replace

```ts
    expect(redacted.farm).toEqual(herd.farm);
  });
```

with

```ts
    expect(redacted.farm).toEqual(herd.farm);
  });

  it("keeps the plano de contas: names carry no money", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.accounts).toEqual(herd.accounts);
    expect(redacted.expenses).toEqual([]);
  });
```

`lib/domain/moneyRedaction.ts` is unchanged: `redactHerdMoney` returns `{ ...data, ..., expenses: [] }`.

- [ ] **Step 8: Compile fixes for `kind` and `accounts`.** Each of these is a `tsc` error once Step 1 lands (verified):

`lib/api/domains/expenses/useCases/Add.useCase.ts`: replace

```ts
import type { Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id"> & { farmId: number };
```

with

```ts
import type { EntryKind, Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & { kind?: EntryKind; farmId: number };
```

(The insert stays as is: the column default writes `kind = 'expense'` and `toExpense` returns it. T6 adds the new fields to the insert.)

`components/finance/RegisterExpenseDialog.tsx`: replace

```ts
    await addExpense({
      date: fields.date,
```

with

```ts
    await addExpense({
      kind: "expense",
      date: fields.date,
```

`components/reports/useReportData.ts`: replace

```ts
  const expenses = useHerdStore((s) => s.expenses);
```

with

```ts
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
```

and in BOTH the returned object and the `useMemo` deps array replace

```ts
      expenses,
      customCategories,
```

with

```ts
      expenses,
      accounts,
      customCategories,
```

`lib/store/useHerdStore.ts` (initial state only): replace

```ts
  expenses: [],
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,
```

with

```ts
  expenses: [],
  accounts: [],
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,
```

`lib/reports/__tests__/data.ts`: replace

```ts
    expenses: [],
    customCategories: [],
```

with

```ts
    expenses: [],
    accounts: [],
    customCategories: [],
```

`components/reports/__tests__/datasets.test.ts`: replace

```ts
  expenses: [{ id: "e1", date: "2026-02-01", category: "nutrition", amountBrl: 500 }],
```

with

```ts
  expenses: [{ id: "e1", kind: "expense", date: "2026-02-01", category: "nutrition", amountBrl: 500 }],
```

`lib/domain/__tests__/economics.test.ts`: replace

```ts
const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  date: "2026-06-05",
```

with

```ts
const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-06-05",
```

`lib/export/__tests__/finance.test.ts`: replace

```ts
      { id: "e1", date: "2026-01-05",
```

with

```ts
      { id: "e1", kind: "expense", date: "2026-01-05",
```

and

```ts
      { id: "e2", date: "2026-08-10",
```

with

```ts
      { id: "e2", kind: "expense", date: "2026-08-10",
```

- [ ] **Step 9: Seed data.** In `lib/data/seed.ts` add `Account,` as the first name of the `@/lib/types` import (before `Animal,`). Replace everything from `const LABOR_MONTHLY = 2600;` through the end of `buildExpenses()` (currently :200-240):

```ts
const LABOR_MONTHLY = 2600;
const ADMIN_MONTHLY = 480;

/** One-off expenses: pasture upkeep, breeding, extra health and misc. */
const ONE_OFF_EXPENSES: readonly Omit<Expense, "id">[] = [
  { date: "2025-09-15", category: "pasture", amountBrl: 2900, notes: "Adubação das pastagens" },
  { date: "2026-01-20", category: "pasture", amountBrl: 1400, notes: "Sementes de braquiária" },
  { date: "2026-03-18", category: "pasture", amountBrl: 1650, notes: "Roçada e reparo de cercas" },
  { date: "2026-06-10", category: "pasture", amountBrl: 900 },
  { date: "2025-11-05", category: "breeding", amountBrl: 2100, notes: "Protocolo IATF" },
  { date: "2026-01-15", category: "breeding", amountBrl: 1300, notes: "Doses de sêmen" },
  { date: "2025-10-12", category: "health", amountBrl: 850, notes: "Consulta veterinária" },
  { date: "2026-02-08", category: "health", amountBrl: 620 },
  { date: "2026-05-11", category: "health", amountBrl: 1200, notes: "Campanha de aftosa" },
  { date: "2025-12-18", category: "other", amountBrl: 700, notes: "Combustível" },
  { date: "2026-04-22", category: "other", amountBrl: 540 },
];

/** Deterministic expense book: monthly recurring rows + one-offs, date asc. */
function buildExpenses(): Expense[] {
  const rows: Omit<Expense, "id">[] = [];
  EXPENSE_MONTHS.forEach((month, i) => {
    rows.push({
      date: `${month}-05`,
      category: "nutrition",
      amountBrl: NUTRITION_BY_MONTH[i],
      notes: "Ração e sal mineral",
    });
    rows.push({
      date: `${month}-01`,
      category: "labor",
      amountBrl: LABOR_MONTHLY,
      notes: "Diárias e encargos",
    });
    rows.push({ date: `${month}-10`, category: "admin", amountBrl: ADMIN_MONTHLY });
  });
  rows.push(...ONE_OFF_EXPENSES);
  return rows
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((row, i) => ({ ...row, id: `expense-${i + 1}` }));
}
```

with

```ts
const LABOR_MONTHLY = 2600;
const ADMIN_MONTHLY = 480;

/**
 * The farm's plano de contas: the standard list, with fixed ids so the seed
 * expenses can point at them. Mirrors DEFAULT_ACCOUNTS in lib/domain/accounts.ts.
 */
const SEED_ACCOUNTS: readonly Account[] = [
  { id: "acc-revenue-aluguel-de-pasto", group: "revenue", name: "Aluguel de pasto" },
  { id: "acc-revenue-venda-de-esterco", group: "revenue", name: "Venda de esterco" },
  { id: "acc-revenue-outras-receitas", group: "revenue", name: "Outras receitas" },
  { id: "acc-nutrition-sal-mineral", group: "nutrition", name: "Sal mineral" },
  { id: "acc-nutrition-racao-e-suplemento", group: "nutrition", name: "Ração e suplemento" },
  { id: "acc-nutrition-silagem", group: "nutrition", name: "Silagem" },
  { id: "acc-pasture-adubo", group: "pasture", name: "Adubo" },
  { id: "acc-pasture-sementes", group: "pasture", name: "Sementes" },
  { id: "acc-pasture-herbicida", group: "pasture", name: "Herbicida" },
  { id: "acc-pasture-rocada", group: "pasture", name: "Roçada" },
  { id: "acc-labor-salarios", group: "labor", name: "Salários" },
  { id: "acc-labor-encargos", group: "labor", name: "Encargos" },
  { id: "acc-labor-diarias", group: "labor", name: "Diárias" },
  { id: "acc-health-vacinas", group: "health", name: "Vacinas" },
  { id: "acc-health-vermifugos", group: "health", name: "Vermífugos" },
  { id: "acc-health-medicamentos", group: "health", name: "Medicamentos" },
  { id: "acc-health-veterinario", group: "health", name: "Veterinário" },
  { id: "acc-breeding-semen", group: "breeding", name: "Sêmen" },
  { id: "acc-breeding-iatf-e-hormonios", group: "breeding", name: "IATF e hormônios" },
  { id: "acc-breeding-touros", group: "breeding", name: "Touros" },
  { id: "acc-admin-energia", group: "admin", name: "Energia" },
  { id: "acc-admin-combustivel", group: "admin", name: "Combustível" },
  { id: "acc-admin-manutencao", group: "admin", name: "Manutenção" },
  { id: "acc-admin-impostos-e-taxas", group: "admin", name: "Impostos e taxas" },
  { id: "acc-admin-contabilidade", group: "admin", name: "Contabilidade" },
];

/** A despesa paid on its own date: kind and paidAt are filled by buildExpenses. */
type PaidExpense = Omit<Expense, "id" | "kind" | "paidAt">;

/** One-off expenses: pasture upkeep, breeding, extra health and misc. */
const ONE_OFF_EXPENSES: readonly PaidExpense[] = [
  { date: "2025-09-15", category: "pasture", amountBrl: 2900, notes: "Adubação das pastagens", accountId: "acc-pasture-adubo" },
  { date: "2026-01-20", category: "pasture", amountBrl: 1400, notes: "Sementes de braquiária", accountId: "acc-pasture-sementes" },
  { date: "2026-03-18", category: "pasture", amountBrl: 1650, notes: "Roçada e reparo de cercas", accountId: "acc-pasture-rocada" },
  { date: "2026-06-10", category: "pasture", amountBrl: 900 },
  { date: "2025-11-05", category: "breeding", amountBrl: 2100, notes: "Protocolo IATF", accountId: "acc-breeding-iatf-e-hormonios", lotId: "lot-1" },
  { date: "2026-01-15", category: "breeding", amountBrl: 1300, notes: "Doses de sêmen", accountId: "acc-breeding-semen", lotId: "lot-1" },
  { date: "2025-10-12", category: "health", amountBrl: 850, notes: "Consulta veterinária", accountId: "acc-health-veterinario", lotId: "lot-3" },
  { date: "2026-02-08", category: "health", amountBrl: 620 },
  { date: "2026-05-11", category: "health", amountBrl: 1200, notes: "Campanha de aftosa", accountId: "acc-health-vacinas" },
  { date: "2025-12-18", category: "other", amountBrl: 700, notes: "Combustível" },
  { date: "2026-04-22", category: "other", amountBrl: 540 },
];

/**
 * Receitas typed by hand and contas still open at the real "today" of the
 * demo (September 2026): Sal mineral is vencida, Salários and Energia a pagar.
 */
const OPEN_AND_REVENUE_ENTRIES: readonly Omit<Expense, "id">[] = [
  {
    kind: "revenue", date: "2026-08-12", category: "other", amountBrl: 1800,
    paidAt: "2026-08-12", accountId: "acc-revenue-venda-de-esterco",
  },
  {
    kind: "revenue", date: "2026-09-05", category: "other", amountBrl: 6400,
    paidAt: "2026-09-05", accountId: "acc-revenue-aluguel-de-pasto",
  },
  {
    kind: "expense", date: "2026-09-10", dueDate: "2026-09-30", category: "labor",
    amountBrl: 8400, accountId: "acc-labor-salarios",
  },
  {
    kind: "expense", date: "2026-09-18", dueDate: "2026-09-18", category: "nutrition",
    amountBrl: 4850, accountId: "acc-nutrition-sal-mineral",
  },
  {
    kind: "expense", date: "2026-09-20", dueDate: "2026-09-28", category: "admin",
    amountBrl: 1320, accountId: "acc-admin-energia",
  },
];

/** Deterministic expense book: monthly recurring rows + one-offs, date asc. */
function buildExpenses(): Expense[] {
  const rows: PaidExpense[] = [];
  EXPENSE_MONTHS.forEach((month, i) => {
    rows.push({
      date: `${month}-05`,
      category: "nutrition",
      amountBrl: NUTRITION_BY_MONTH[i],
      notes: "Ração e sal mineral",
      accountId: "acc-nutrition-racao-e-suplemento",
    });
    rows.push({
      date: `${month}-01`,
      category: "labor",
      amountBrl: LABOR_MONTHLY,
      notes: "Diárias e encargos",
      accountId: "acc-labor-diarias",
    });
    rows.push({ date: `${month}-10`, category: "admin", amountBrl: ADMIN_MONTHLY });
  });
  rows.push(...ONE_OFF_EXPENSES);
  const entries: Omit<Expense, "id">[] = [
    ...rows.map((row) => ({ ...row, kind: "expense" as const, paidAt: row.date })),
    ...OPEN_AND_REVENUE_ENTRIES,
  ];
  return entries
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((row, i) => ({ ...row, id: `expense-${i + 1}` }));
}
```

("Combustível" stays without a conta: its row is category `other`, the conta sits in Administrativo.) In `generateInitialData()`'s return replace

```ts
    expenses: buildExpenses(),
    customCategories: [],
```

with

```ts
    expenses: buildExpenses(),
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
    customCategories: [],
```

- [ ] **Step 10: Seed test.** The 2026-08/09 entries make 14 months, so `lib/data/__tests__/seed.test.ts` fails as is. Replace

```ts
  it("has a deterministic 12-month expense book covering every category", () => {
    const months = new Set(data.expenses.map((e) => e.date.slice(0, 7)));
    expect(months.size).toBe(12);
```

with

```ts
  it("has a deterministic 12-month expense book covering every category", () => {
    const booked = data.expenses.filter((e) => e.date <= TODAY_ISO);
    const months = new Set(booked.map((e) => e.date.slice(0, 7)));
    expect(months.size).toBe(12);
```

and after that test's closing lines

```ts
    const ids = data.expenses.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
```

add

```ts

  it("points every lançamento at a conta of its own grupo and at a seeded lote", () => {
    const groupOf = new Map(data.accounts.map((a) => [a.id, a.group]));
    const lotIds = new Set(data.lots.map((l) => l.id));
    for (const e of data.expenses) {
      if (e.accountId) {
        expect(groupOf.get(e.accountId)).toBe(e.kind === "revenue" ? "revenue" : e.category);
      }
      if (e.lotId) expect(lotIds).toContain(e.lotId);
    }
    expect(data.expenses.filter((e) => e.kind === "revenue")).toHaveLength(2);
    expect(data.expenses.filter((e) => e.paidAt === undefined)).toHaveLength(3);
  });
```

(`TODAY_ISO` is already imported there as `SEED_TODAY_ISO as TODAY_ISO`.)

- [ ] **Step 11: Seed CLI inserts accounts before expenses.** In `cli/seedCli.ts` replace

```ts
      if (data.expenses.length > 0) {
        await tx.insert(schema.expenses).values(
          data.expenses.map((e) => ({
            id: randomUUID(),
            farmId,
            date: e.date,
            category: e.category,
            amountBrl: e.amountBrl,
            notes: e.notes,
          }))
        );
      }
```

with

```ts
      const accountIdMap = new Map(data.accounts.map((a) => [a.id, randomUUID()]));
      if (data.accounts.length > 0) {
        await tx.insert(schema.accounts).values(
          data.accounts.map((a) => ({
            id: accountIdMap.get(a.id)!,
            farmId,
            group: a.group,
            name: a.name,
          }))
        );
      }

      if (data.expenses.length > 0) {
        await tx.insert(schema.expenses).values(
          data.expenses.map((e) => ({
            id: randomUUID(),
            farmId,
            kind: e.kind,
            date: e.date,
            category: e.category,
            amountBrl: e.amountBrl,
            notes: e.notes,
            dueDate: e.dueDate,
            paidAt: e.paidAt,
            counterparty: e.counterparty,
            document: e.document,
            accountId: e.accountId === undefined ? undefined : accountIdMap.get(e.accountId)!,
            lotId: e.lotId === undefined ? undefined : lotIdMap.get(e.lotId)!,
          }))
        );
      }
```

(`lotIdMap` is declared at :114 in the same transaction.)

- [ ] **Step 12: Typecheck, lint, tests.**

```bash
cd /home/luketa/meubov && pnpm tsc --noEmit
```

Expected: no output, exit 0.

```bash
cd /home/luketa/meubov && pnpm exec eslint lib/types.ts lib/db/schema.ts lib/api/mappers.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/data/seed.ts cli/seedCli.ts lib/data/__tests__/seed.test.ts lib/domain/__tests__/moneyRedaction.test.ts components/reports/useReportData.ts
pnpm vitest run --dir lib
pnpm vitest run --dir components
```

Expected: eslint prints nothing; both vitest runs green (`--dir` keeps the `.claude/worktrees` copies out; verified on a copy of main: 119 files, 1130 tests in total).

- [ ] **Step 13: Apply and seed.** The shared dev volume may lag behind main's migrations (see the smoke-test notes), so apply to a throwaway database first. Pick a free port (`docker ps`, `ss -ltnp`):

```bash
docker run --rm -d --name meubov-fin-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5446:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm migration:run
docker exec meubov-fin-db psql -U meubov -qc "insert into \"user\" (id, name, email) values ('u-fin','Teste','teste.financeiro@meubov.local')"
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:seed --email teste.financeiro@meubov.local
docker exec meubov-fin-db psql -U meubov -c "select kind, count(*), count(paid_at) paid, count(account_id) acc, count(lot_id) lot from expenses group by kind" -c "select count(*) from accounts"
```

Expected: `✅ Migrations applied to Local environment`; seed prints `... 52 expenses.`; the query gives `revenue | 2 | 2 | 2 | 0` and `expense | 50 | 47 | 34 | 3`; `accounts` count `25`. Keep the container for the later smoke (T13) or `docker rm -f meubov-fin-db`. On the real dev DB the same two commands are `pnpm migration:run` then `pnpm db:seed --email <your user> --force` (`--force` deletes that user's owned farms and reseeds).

- [ ] **Step 14: Commit.**

```bash
cd /home/luketa/meubov && git add lib/types.ts lib/db/schema.ts drizzle/0021_financeiro-lancamentos-e-plano-de-contas.sql drizzle/meta/0021_snapshot.json drizzle/meta/_journal.json lib/api/mappers.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/domain/__tests__/moneyRedaction.test.ts lib/data/seed.ts lib/data/__tests__/seed.test.ts cli/seedCli.ts lib/api/domains/expenses/useCases/Add.useCase.ts components/finance/RegisterExpenseDialog.tsx components/reports/useReportData.ts components/reports/__tests__/datasets.test.ts lib/domain/__tests__/economics.test.ts lib/export/__tests__/finance.test.ts lib/reports/__tests__/data.ts lib/store/useHerdStore.ts
git commit -m "feat(finance): lançamentos with vencimento, pagamento and plano de contas in the schema"
```

---

### Task 2: Period, plano de contas and benchmark helpers

**Files:**
- Create: `lib/domain/period.ts`, `lib/domain/accounts.ts`, `lib/domain/benchmarks.ts`
- Delete: `components/dashboard/period.ts` (its two functions move to `lib/domain/period.ts` with the same bodies)
- Modify: `app/(app)/dashboard/page.tsx:51` (import line only), `components/dashboard/PeriodPicker.tsx:5` (import line only)
- Test: `lib/domain/__tests__/period.test.ts`, `lib/domain/__tests__/accounts.test.ts`, `lib/domain/__tests__/benchmarks.test.ts`

**Interfaces:**
- Consumes:
  - `Period` from `lib/domain/finance.ts` (stays there).
  - `addDays`, `daysBetween`, `parseISODate`, `toISO` from `lib/domain/dates.ts`.
  - `EXPENSE_CATEGORY_LABEL` from `lib/domain/labels.ts`.
  - From Task 1 (`lib/types.ts`): `Expense` with `kind` and `counterparty?`, `AccountGroup = ExpenseCategory | "revenue"`, `Account { id; group; name; archivedAt? }`. This task depends on Task 1.
- Produces:
```ts
// lib/domain/period.ts
export type { Period } from "@/lib/domain/finance";
export function defaultPeriod(refIso: string, months = 12): Period;
export function shiftPeriodByMonths(period: Period, months: number): Period;
export function periodDays(period: Period): number;
export function priorPeriod(period: Period): Period;
export function annualise(value: number, period: Period): number;
export function inPeriod(iso: string, period: Period): boolean;
export function periodFromSearch(params: { get(k: string): string | null }, todayIso: string): Period;
export function periodSearch(period: Period): string;

// lib/domain/accounts.ts
export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string>;
export const ACCOUNT_GROUPS: readonly AccountGroup[];
export const DEFAULT_ACCOUNTS: readonly { group: AccountGroup; name: string }[];
export function accountsByGroup(accounts: Account[], includeArchived?: boolean): Record<AccountGroup, Account[]>;
export function missingDefaults(accounts: Account[]): { group: AccountGroup; name: string }[];
export function accountName(accountId: string | undefined, accounts: Account[]): string | null;
export function counterpartySuggestions(expenses: Expense[]): string[];

// lib/domain/benchmarks.ts
export type FarmSystem = "cria" | "ciclo_completo" | "recria_engorda";
export const FARM_SYSTEM_LABEL: Record<FarmSystem, string>;
export interface Benchmark { min: number; max: number; mean: number; meanLabel?: string; top: number | null; topLabel?: string; better: "low" | "high"; source: string }
export type BenchmarkKey = "costPerArroba" | "arrobasPerHa" | "gmd" | "offtake" | "stocking" | "costToRevenue" | "outlay";
export function benchmark(key: BenchmarkKey, system: FarmSystem): Benchmark;
export type BandTone = "healthy" | "attention" | "overdue";
export function bandTone(value: number, b: Benchmark): BandTone;
export function bandPosition(value: number, b: Benchmark): number;
```

- [ ] **Step 1: Write the failing tests**

`lib/domain/__tests__/period.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  annualise,
  defaultPeriod,
  inPeriod,
  periodDays,
  periodFromSearch,
  periodSearch,
  priorPeriod,
  shiftPeriodByMonths,
  type Period,
} from "@/lib/domain/period";

const TODAY = "2026-09-24";
const LAST_12_MONTHS: Period = { start: "2025-10-01", end: "2026-09-30" };

describe("defaultPeriod", () => {
  it("covers the last 12 calendar months ending at the reference month", () => {
    expect(defaultPeriod(TODAY)).toEqual(LAST_12_MONTHS);
  });

  it("ends on 29 February in a leap year", () => {
    expect(defaultPeriod("2024-02-10", 1)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("starts on the first day of the earliest month", () => {
    expect(defaultPeriod("2026-03-31", 3)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });
});

describe("shiftPeriodByMonths", () => {
  it("moves both ends back by a year", () => {
    expect(shiftPeriodByMonths(LAST_12_MONTHS, -12)).toEqual({
      start: "2024-10-01",
      end: "2025-09-30",
    });
  });

  it("keeps the day, rolling a missing month-end into the next month", () => {
    expect(shiftPeriodByMonths({ start: "2024-01-31", end: "2024-02-29" }, 1)).toEqual({
      start: "2024-03-02",
      end: "2024-03-29",
    });
  });
});

describe("periodDays", () => {
  it("counts both ends", () => {
    expect(periodDays({ start: TODAY, end: TODAY })).toBe(1);
    expect(periodDays({ start: "2024-02-01", end: "2024-02-29" })).toBe(29);
    expect(periodDays({ start: "2026-02-01", end: "2026-02-28" })).toBe(28);
    expect(periodDays({ start: "2024-01-01", end: "2024-12-31" })).toBe(366);
  });

  it("never goes below one day", () => {
    expect(periodDays({ start: "2026-09-24", end: "2026-09-01" })).toBe(1);
  });
});

describe("priorPeriod", () => {
  it("is the year before for a 12-month window", () => {
    expect(priorPeriod(LAST_12_MONTHS)).toEqual({ start: "2024-10-01", end: "2025-09-30" });
  });

  it("goes back by day count, not by calendar", () => {
    expect(priorPeriod({ start: "2024-01-01", end: "2024-12-31" })).toEqual({
      start: "2022-12-31",
      end: "2023-12-31",
    });
    expect(priorPeriod({ start: "2024-02-01", end: "2024-02-29" })).toEqual({
      start: "2024-01-03",
      end: "2024-01-31",
    });
  });

  it("is the day before for a one-day window", () => {
    expect(priorPeriod({ start: "2026-03-01", end: "2026-03-01" })).toEqual({
      start: "2026-02-28",
      end: "2026-02-28",
    });
  });
});

describe("annualise", () => {
  it("scales by 365 over the window's days", () => {
    expect(annualise(30, { start: "2026-01-01", end: "2026-12-31" })).toBe(30);
    expect(annualise(30, { start: "2026-01-01", end: "2026-03-14" })).toBe(150);
    expect(annualise(30, { start: "2024-01-01", end: "2024-12-31" })).toBeCloseTo((30 * 365) / 366);
  });
});

describe("inPeriod", () => {
  it("includes both ends", () => {
    const period = { start: "2026-07-01", end: "2026-09-30" };
    expect(inPeriod("2026-07-01", period)).toBe(true);
    expect(inPeriod("2026-09-30", period)).toBe(true);
    expect(inPeriod("2026-06-30", period)).toBe(false);
    expect(inPeriod("2026-10-01", period)).toBe(false);
  });
});

describe("periodFromSearch", () => {
  const read = (query: string) => periodFromSearch(new URLSearchParams(query), TODAY);

  it("reads de and ate", () => {
    expect(read("de=2026-01-01&ate=2026-06-30")).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    expect(read("de=2024-02-29&ate=2024-02-29")).toEqual({ start: "2024-02-29", end: "2024-02-29" });
  });

  it("falls back to the last 12 months on anything invalid", () => {
    for (const query of [
      "",
      "de=2026-01-01",
      "ate=2026-06-30",
      "de=2026-02-30&ate=2026-06-30",
      "de=2026-13-01&ate=2026-06-30",
      "de=2026-1-1&ate=2026-06-30",
      "de=2026-01-01&ate=junho",
      "de=2025-02-29&ate=2025-06-30",
      "de=2026-07-01&ate=2026-06-30",
    ]) {
      expect(read(query)).toEqual(LAST_12_MONTHS);
    }
  });
});

describe("periodSearch", () => {
  it("writes the query periodFromSearch reads back", () => {
    const period = { start: "2026-01-01", end: "2026-06-30" };
    expect(periodSearch(period)).toBe("de=2026-01-01&ate=2026-06-30");
    expect(periodFromSearch(new URLSearchParams(periodSearch(period)), TODAY)).toEqual(period);
  });
});
```

`lib/domain/__tests__/accounts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_GROUP_LABEL,
  ACCOUNT_GROUPS,
  accountName,
  accountsByGroup,
  counterpartySuggestions,
  DEFAULT_ACCOUNTS,
  missingDefaults,
} from "@/lib/domain/accounts";
import type { Account, Expense } from "@/lib/types";

const account = (overrides: Partial<Account>): Account => ({
  id: "acc-1",
  group: "nutrition",
  name: "Sal mineral",
  ...overrides,
});

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

describe("ACCOUNT_GROUPS and ACCOUNT_GROUP_LABEL", () => {
  it("lists Receitas first, then the seven grupos of custo", () => {
    expect(ACCOUNT_GROUPS).toEqual([
      "revenue",
      "nutrition",
      "pasture",
      "labor",
      "health",
      "breeding",
      "admin",
      "other",
    ]);
    expect(ACCOUNT_GROUPS.map((g) => ACCOUNT_GROUP_LABEL[g])).toEqual([
      "Receitas",
      "Nutrição",
      "Pastagem",
      "Mão de obra",
      "Sanidade",
      "Reprodução",
      "Administrativo",
      "Outros",
    ]);
  });
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is the standard plano de contas", () => {
    const names = (group: string) =>
      DEFAULT_ACCOUNTS.filter((a) => a.group === group).map((a) => a.name);
    expect(names("revenue")).toEqual(["Aluguel de pasto", "Venda de esterco", "Outras receitas"]);
    expect(names("nutrition")).toEqual(["Sal mineral", "Ração e suplemento", "Silagem"]);
    expect(names("pasture")).toEqual(["Adubo", "Sementes", "Herbicida", "Roçada"]);
    expect(names("labor")).toEqual(["Salários", "Encargos", "Diárias"]);
    expect(names("health")).toEqual(["Vacinas", "Vermífugos", "Medicamentos", "Veterinário"]);
    expect(names("breeding")).toEqual(["Sêmen", "IATF e hormônios", "Touros"]);
    expect(names("admin")).toEqual([
      "Energia",
      "Combustível",
      "Manutenção",
      "Impostos e taxas",
      "Contabilidade",
    ]);
    expect(names("other")).toEqual([]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(25);
  });
});

describe("accountsByGroup", () => {
  const accounts = [
    account({ id: "a-1", name: "Sal mineral" }),
    account({ id: "a-2", name: "Água" }),
    account({ id: "a-3", name: "Ração e suplemento" }),
    account({ id: "a-4", name: "Silagem", archivedAt: "2026-05-01T00:00:00.000Z" }),
    account({ id: "a-5", group: "revenue", name: "Aluguel de pasto" }),
  ];

  it("groups the active contas sorted by name the Portuguese way", () => {
    const byGroup = accountsByGroup(accounts);
    expect(byGroup.nutrition.map((a) => a.id)).toEqual(["a-2", "a-3", "a-1"]);
    expect(byGroup.revenue.map((a) => a.id)).toEqual(["a-5"]);
  });

  it("has every grupo, empty ones included", () => {
    const byGroup = accountsByGroup(accounts);
    expect(Object.keys(byGroup).sort()).toEqual([...ACCOUNT_GROUPS].sort());
    expect(byGroup.labor).toEqual([]);
  });

  it("includes archived contas when asked", () => {
    expect(accountsByGroup(accounts, true).nutrition.map((a) => a.id)).toEqual([
      "a-2",
      "a-3",
      "a-1",
      "a-4",
    ]);
  });
});

describe("missingDefaults", () => {
  it("skips names the grupo already has, ignoring case and spaces", () => {
    const missing = missingDefaults([
      account({ id: "a-1", group: "nutrition", name: "  sal MINERAL " }),
      account({ id: "a-2", group: "breeding", name: "SÊMEN", archivedAt: "2026-01-01T00:00:00.000Z" }),
      account({ id: "a-3", group: "other", name: "Adubo" }),
    ]);
    expect(missing).toHaveLength(23);
    expect(missing).not.toContainEqual({ group: "nutrition", name: "Sal mineral" });
    expect(missing).not.toContainEqual({ group: "breeding", name: "Sêmen" });
    expect(missing).toContainEqual({ group: "pasture", name: "Adubo" });
  });

  it("is the whole list for a farm with no contas", () => {
    expect(missingDefaults([])).toEqual([...DEFAULT_ACCOUNTS]);
  });
});

describe("accountName", () => {
  const accounts = [account({ id: "a-1", name: "Sal mineral" })];

  it("names the conta, or null", () => {
    expect(accountName("a-1", accounts)).toBe("Sal mineral");
    expect(accountName("gone", accounts)).toBeNull();
    expect(accountName(undefined, accounts)).toBeNull();
  });
});

describe("counterpartySuggestions", () => {
  it("lists distinct trimmed names, most recent first, without blanks", () => {
    expect(
      counterpartySuggestions([
        expense({ id: "e-1", date: "2026-07-01", counterparty: "Copel" }),
        expense({ id: "e-2", date: "2026-09-01", counterparty: " Agrovet " }),
        expense({ id: "e-3", date: "2026-08-01", counterparty: "   " }),
        expense({ id: "e-4", date: "2026-08-15" }),
        expense({ id: "e-5", date: "2026-08-20", counterparty: "Copel" }),
        expense({ id: "e-6", date: "2026-06-01", counterparty: "Agrovet" }),
      ])
    ).toEqual(["Agrovet", "Copel"]);
  });

  it("keeps at most 20", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      expense({
        id: `e-${i}`,
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        counterparty: `Fornecedor ${i + 1}`,
      })
    );
    const suggestions = counterpartySuggestions(many);
    expect(suggestions).toHaveLength(20);
    expect(suggestions[0]).toBe("Fornecedor 25");
    expect(suggestions[19]).toBe("Fornecedor 6");
  });
});
```

`lib/domain/__tests__/benchmarks.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  bandPosition,
  bandTone,
  benchmark,
  FARM_SYSTEM_LABEL,
} from "@/lib/domain/benchmarks";

describe("benchmark", () => {
  it("carries the value, the direction and the source", () => {
    expect(benchmark("costPerArroba", "cria")).toEqual({
      min: 100,
      max: 300,
      mean: 208,
      top: 165,
      better: "low",
      source: "Inttegra, safra 24/25",
    });
    expect(benchmark("stocking", "cria")).toEqual({
      min: 0,
      max: 2.4,
      mean: 0.93,
      meanLabel: "Brasil",
      top: 1.6,
      topLabel: "teto",
      better: "high",
      source: "ABIEC Beef Report 2024",
    });
    expect(benchmark("gmd", "cria")).toMatchObject({ mean: 0.429, top: 0.654, better: "high" });
    expect(benchmark("arrobasPerHa", "cria")).toMatchObject({
      mean: 4.8,
      top: 12.9,
      source: "Athenagro/Rally 2025",
    });
  });

  it("uses the production system's meta or teto", () => {
    expect(benchmark("offtake", "cria").top).toBe(35);
    expect(benchmark("offtake", "ciclo_completo").top).toBe(45);
    expect(benchmark("offtake", "recria_engorda").top).toBe(55);
    expect(benchmark("offtake", "cria")).toMatchObject({ mean: 18.9, meanLabel: "Brasil", topLabel: "meta" });

    expect(benchmark("costToRevenue", "cria").mean).toBe(65);
    expect(benchmark("costToRevenue", "ciclo_completo").mean).toBe(70);
    expect(benchmark("costToRevenue", "recria_engorda").mean).toBe(60);
    expect(benchmark("costToRevenue", "cria")).toMatchObject({ top: null, meanLabel: "teto", better: "low" });

    expect(benchmark("outlay", "cria").mean).toBe(34.7);
    expect(benchmark("outlay", "ciclo_completo").mean).toBe(52.4);
    expect(benchmark("outlay", "recria_engorda").mean).toBe(57.83);
    expect(benchmark("outlay", "cria")).toMatchObject({
      top: null,
      meanLabel: "teto 2018/19",
      source: "Inttegra 2018/19",
    });
  });

  it("names the systems", () => {
    expect(FARM_SYSTEM_LABEL).toEqual({
      cria: "cria",
      ciclo_completo: "ciclo completo",
      recria_engorda: "recria e engorda",
    });
  });
});

describe("bandTone", () => {
  it("reads a lower-is-better band", () => {
    const b = benchmark("costPerArroba", "cria");
    expect(bandTone(150, b)).toBe("healthy");
    expect(bandTone(165, b)).toBe("healthy");
    expect(bandTone(190, b)).toBe("attention");
    expect(bandTone(208, b)).toBe("attention");
    expect(bandTone(250, b)).toBe("overdue");
  });

  it("reads a higher-is-better band", () => {
    const b = benchmark("gmd", "cria");
    expect(bandTone(0.7, b)).toBe("healthy");
    expect(bandTone(0.5, b)).toBe("attention");
    expect(bandTone(0.3, b)).toBe("overdue");
  });

  it("uses the mean as the line when there is no top", () => {
    const b = benchmark("costToRevenue", "recria_engorda");
    expect(bandTone(55, b)).toBe("healthy");
    expect(bandTone(60, b)).toBe("healthy");
    expect(bandTone(62, b)).toBe("overdue");
  });

  it("moves with the system's meta", () => {
    expect(bandTone(40, benchmark("offtake", "cria"))).toBe("healthy");
    expect(bandTone(40, benchmark("offtake", "ciclo_completo"))).toBe("attention");
    expect(bandTone(40, benchmark("offtake", "recria_engorda"))).toBe("attention");
    expect(bandTone(15, benchmark("offtake", "cria"))).toBe("overdue");
    expect(bandTone(50, benchmark("outlay", "cria"))).toBe("overdue");
    expect(bandTone(50, benchmark("outlay", "ciclo_completo"))).toBe("healthy");
  });
});

describe("bandPosition", () => {
  it("places the value on the band's scale", () => {
    expect(bandPosition(200, benchmark("costPerArroba", "cria"))).toBe(50);
    expect(bandPosition(0.55, benchmark("gmd", "cria"))).toBeCloseTo(50);
  });

  it("clamps to 0..100", () => {
    expect(bandPosition(50, benchmark("costPerArroba", "cria"))).toBe(0);
    expect(bandPosition(400, benchmark("costPerArroba", "cria"))).toBe(100);
    expect(bandPosition(-5, benchmark("offtake", "cria"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/domain/__tests__/period.test.ts lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/benchmarks.test.ts` — expected FAIL: `Failed to resolve import "@/lib/domain/period"` (and the same for `accounts` and `benchmarks`).

- [ ] **Step 3: Implement**

`lib/domain/period.ts`:
```ts
/**
 * The date window every financial figure follows: two ISO dates, both
 * inclusive. Pure; the Painel, the Financeiro and the Extrato share it.
 */
import type { Period } from "@/lib/domain/finance";
import { addDays, daysBetween, parseISODate, toISO } from "@/lib/domain/dates";

export type { Period } from "@/lib/domain/finance";

/**
 * Sensible default window: the last `months` calendar months ending at `refIso`'s
 * month (start = first day of the earliest month, end = last day of `refIso`'s
 * month), matching the 12-month revenue x cost series derived from the records.
 */
export function defaultPeriod(refIso: string, months = 12): Period {
  const ref = parseISODate(refIso);
  const start = new Date(ref.getFullYear(), ref.getMonth() - (months - 1), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: toISO(start), end: toISO(end) };
}

/** Shifts both ends of a period by `months` (may be negative), keeping the day. */
export function shiftPeriodByMonths(period: Period, months: number): Period {
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  return {
    start: toISO(new Date(start.getFullYear(), start.getMonth() + months, start.getDate())),
    end: toISO(new Date(end.getFullYear(), end.getMonth() + months, end.getDate())),
  };
}

/** Days in the window, both ends counted; never less than 1. */
export function periodDays(period: Period): number {
  return Math.max(1, daysBetween(period.start, period.end) + 1);
}

/** "Ano anterior": the same number of days, ending the day before `start`. */
export function priorPeriod(period: Period): Period {
  const end = addDays(period.start, -1);
  return { start: addDays(end, -(periodDays(period) - 1)), end };
}

/** A window's figure scaled to a year: × 365 over the window's days. */
export function annualise(value: number, period: Period): number {
  return (value * 365) / periodDays(period);
}

/** True when the ISO date falls inside the window, both ends included. */
export function inPeriod(iso: string, period: Period): boolean {
  return iso >= period.start && iso <= period.end;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that names a real day (no 30 February). */
function isRealIsoDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value) && toISO(parseISODate(value)) === value;
}

/** The window in `?de=&ate=`, or the last 12 months when it is missing or invalid. */
export function periodFromSearch(
  params: { get(k: string): string | null },
  todayIso: string
): Period {
  const start = params.get("de");
  const end = params.get("ate");
  return isRealIsoDate(start) && isRealIsoDate(end) && start <= end
    ? { start, end }
    : defaultPeriod(todayIso);
}

/** The query string periodFromSearch reads: "de=YYYY-MM-DD&ate=YYYY-MM-DD". */
export function periodSearch(period: Period): string {
  return `de=${period.start}&ate=${period.end}`;
}
```

`lib/domain/accounts.ts`:
```ts
/**
 * Plano de contas: the fixed grupos (Receitas plus the seven cost categories)
 * and the farm's contas inside them. Pure.
 */
import type { Account, AccountGroup, Expense, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";

/** Label of each grupo: "Receitas" plus the cost categories' labels. */
export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string> = {
  revenue: "Receitas",
  ...EXPENSE_CATEGORY_LABEL,
};

/** Grupos in screen order: Receitas, then the cost categories. */
export const ACCOUNT_GROUPS: readonly AccountGroup[] = [
  "revenue",
  ...(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]),
];

/** What "Sugerir contas padrão" creates. */
export const DEFAULT_ACCOUNTS: readonly { group: AccountGroup; name: string }[] = [
  { group: "revenue", name: "Aluguel de pasto" },
  { group: "revenue", name: "Venda de esterco" },
  { group: "revenue", name: "Outras receitas" },
  { group: "nutrition", name: "Sal mineral" },
  { group: "nutrition", name: "Ração e suplemento" },
  { group: "nutrition", name: "Silagem" },
  { group: "pasture", name: "Adubo" },
  { group: "pasture", name: "Sementes" },
  { group: "pasture", name: "Herbicida" },
  { group: "pasture", name: "Roçada" },
  { group: "labor", name: "Salários" },
  { group: "labor", name: "Encargos" },
  { group: "labor", name: "Diárias" },
  { group: "health", name: "Vacinas" },
  { group: "health", name: "Vermífugos" },
  { group: "health", name: "Medicamentos" },
  { group: "health", name: "Veterinário" },
  { group: "breeding", name: "Sêmen" },
  { group: "breeding", name: "IATF e hormônios" },
  { group: "breeding", name: "Touros" },
  { group: "admin", name: "Energia" },
  { group: "admin", name: "Combustível" },
  { group: "admin", name: "Manutenção" },
  { group: "admin", name: "Impostos e taxas" },
  { group: "admin", name: "Contabilidade" },
];

/** Contas per grupo, every grupo present, sorted by name; archived ones only when asked. */
export function accountsByGroup(
  accounts: Account[],
  includeArchived = false
): Record<AccountGroup, Account[]> {
  const byGroup = Object.fromEntries(ACCOUNT_GROUPS.map((g) => [g, [] as Account[]])) as Record<
    AccountGroup,
    Account[]
  >;
  for (const a of accounts) {
    if (includeArchived || a.archivedAt === undefined) byGroup[a.group].push(a);
  }
  for (const g of ACCOUNT_GROUPS) byGroup[g].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return byGroup;
}

const nameKey = (group: AccountGroup, name: string) => `${group}:${name.trim().toLowerCase()}`;

/** The standard contas the farm does not have yet (archived ones count as had). */
export function missingDefaults(accounts: Account[]): { group: AccountGroup; name: string }[] {
  const have = new Set(accounts.map((a) => nameKey(a.group, a.name)));
  return DEFAULT_ACCOUNTS.filter((d) => !have.has(nameKey(d.group, d.name)));
}

/** Name of a conta, null when unset or gone. */
export function accountName(accountId: string | undefined, accounts: Account[]): string | null {
  if (accountId === undefined) return null;
  return accounts.find((a) => a.id === accountId)?.name ?? null;
}

/** "Pago para / recebido de" already typed, most recent first, at most 20. */
export function counterpartySuggestions(expenses: Expense[]): string[] {
  const names = new Set<string>();
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date))) {
    const name = e.counterparty?.trim();
    if (name) names.add(name);
    if (names.size === 20) break;
  }
  return [...names];
}
```

`lib/domain/benchmarks.ts`:
```ts
/**
 * Reference bands for the Financeiro's indicators: the trade's média and top
 * (or teto/meta), each with its source and safra. Pure data plus the two
 * readings the band needs.
 */

/** Production system: picks the meta/teto of the bands that depend on it. */
export type FarmSystem = "cria" | "ciclo_completo" | "recria_engorda";

export const FARM_SYSTEM_LABEL: Record<FarmSystem, string> = {
  cria: "cria",
  ciclo_completo: "ciclo completo",
  recria_engorda: "recria e engorda",
};

/** A band from `min` to `max` with the média and the top marked on it. */
export interface Benchmark {
  min: number;
  max: number;
  mean: number;
  meanLabel?: string;
  top: number | null;
  topLabel?: string;
  better: "low" | "high";
  source: string;
}

export type BenchmarkKey =
  | "costPerArroba"
  | "arrobasPerHa"
  | "gmd"
  | "offtake"
  | "stocking"
  | "costToRevenue"
  | "outlay";

/** Desfrute meta, % a year (Scot/Inttegra). */
const OFFTAKE_META: Record<FarmSystem, number> = { cria: 35, ciclo_completo: 45, recria_engorda: 55 };
/** Custo ÷ receita teto, % (Inttegra). */
const COST_TO_REVENUE_TETO: Record<FarmSystem, number> = { cria: 65, ciclo_completo: 70, recria_engorda: 60 };
/** Desembolso por cabeça teto, R$/cab/mês (Inttegra 2018/19). */
const OUTLAY_TETO: Record<FarmSystem, number> = { cria: 34.7, ciclo_completo: 52.4, recria_engorda: 57.83 };

/** The band of an indicator for the farm's production system. GMD in kg/day. */
export function benchmark(key: BenchmarkKey, system: FarmSystem): Benchmark {
  switch (key) {
    case "costPerArroba":
      return { min: 100, max: 300, mean: 208, top: 165, better: "low", source: "Inttegra, safra 24/25" };
    case "arrobasPerHa":
      return { min: 0, max: 16, mean: 4.8, top: 12.9, better: "high", source: "Athenagro/Rally 2025" };
    case "gmd":
      return { min: 0.2, max: 0.9, mean: 0.429, top: 0.654, better: "high", source: "Inttegra, safra 24/25" };
    case "offtake":
      return {
        min: 0,
        max: 70,
        mean: 18.9,
        meanLabel: "Brasil",
        top: OFFTAKE_META[system],
        topLabel: "meta",
        better: "high",
        source: "IBGE 2019 · Scot/Inttegra",
      };
    case "stocking":
      return {
        min: 0,
        max: 2.4,
        mean: 0.93,
        meanLabel: "Brasil",
        top: 1.6,
        topLabel: "teto",
        better: "high",
        source: "ABIEC Beef Report 2024",
      };
    case "costToRevenue":
      return {
        min: 30,
        max: 100,
        mean: COST_TO_REVENUE_TETO[system],
        meanLabel: "teto",
        top: null,
        better: "low",
        source: "Inttegra",
      };
    case "outlay":
      return {
        min: 20,
        max: 120,
        mean: OUTLAY_TETO[system],
        meanLabel: "teto 2018/19",
        top: null,
        better: "low",
        source: "Inttegra 2018/19",
      };
  }
}

export type BandTone = "healthy" | "attention" | "overdue";

/**
 * Healthy at or past the top (the mean when there is no top), overdue on the
 * wrong side of the mean, attention in between.
 */
export function bandTone(value: number, b: Benchmark): BandTone {
  // Flip lower-is-better bands so "higher is better" holds for the comparisons.
  const sign = b.better === "high" ? 1 : -1;
  const v = value * sign;
  if (v >= (b.top ?? b.mean) * sign) return "healthy";
  if (v < b.mean * sign) return "overdue";
  return "attention";
}

/** Where the value sits on the band, 0 at `min` and 100 at `max`, clamped. */
export function bandPosition(value: number, b: Benchmark): number {
  return Math.min(100, Math.max(0, ((value - b.min) / (b.max - b.min)) * 100));
}
```

Move the Painel's helpers:
```bash
git rm components/dashboard/period.ts
```

`app/(app)/dashboard/page.tsx` line 51 — replace
```ts
import { defaultPeriod } from "@/components/dashboard/period";
```
with
```ts
import { defaultPeriod } from "@/lib/domain/period";
```

`components/dashboard/PeriodPicker.tsx` line 5 — replace
```ts
import { shiftPeriodByMonths } from "@/components/dashboard/period";
```
with
```ts
import { shiftPeriodByMonths } from "@/lib/domain/period";
```

- [ ] **Step 4: Run** `pnpm vitest run lib/domain/__tests__/period.test.ts lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/benchmarks.test.ts` — expected PASS. Then `pnpm tsc --noEmit` (no error; `grep -rn "components/dashboard/period" app components lib` prints nothing) and `pnpm lint`.

- [ ] **Step 5: Commit**
```bash
git add lib/domain/period.ts lib/domain/accounts.ts lib/domain/benchmarks.ts \
  lib/domain/__tests__/period.test.ts lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/benchmarks.test.ts \
  "app/(app)/dashboard/page.tsx" components/dashboard/PeriodPicker.tsx
git commit -m "feat(finance): period, plano de contas and benchmark helpers"
```

---

### Task 3: The Extrato's ledger

**Files:**
- Create: `lib/domain/ledger.ts`
- Test: `lib/domain/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 (`lib/types.ts`): `Expense` with `kind`, `dueDate?`, `paidAt?`, `counterparty?`, `document?`, `accountId?`, `lotId?`; `Account`; `AccountGroup`.
  - Task 2: `inPeriod`, `Period` from `lib/domain/period.ts`; `ACCOUNT_GROUP_LABEL`, `accountName` from `lib/domain/accounts.ts`.
  - Existing: `saleSummary` from `lib/domain/movements.ts` (derived movement rows carry `movement.id === session.id`); `KG_PER_ARROBA` from `lib/domain/weights.ts`; `formatArroba` from `lib/domain/format.ts`; `Animal`, `Lot`, `ManejoSession`, `ManejoSessionAnimal`, `Movement`, `Treatment` from `lib/types.ts`.
- Produces:
```ts
export type LedgerKind = "expense" | "revenue" | "sale" | "purchase" | "treatment";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";
export interface LedgerRow {
  id: string; kind: LedgerKind;
  date: string; dueDate: string; paidAt: string | null; status: LedgerStatus;
  group: AccountGroup | "capital"; groupLabel: string; account: string | null;
  counterparty: string | null; document: string | null; lotId: string | null; lotName: string | null;
  amountBrl: number; notes: string | null; locked: boolean; headCount: number | null; expense: Expense | null;
}
export interface LedgerInputs { expenses: Expense[]; accounts: Account[]; movements: Movement[]; manejoSessions: ManejoSession[]; animals: Animal[]; treatments: Treatment[]; lots: Lot[] }
export function ledgerRows(input: LedgerInputs, period: Period, todayIso: string): LedgerRow[];
export interface LedgerFilter { kind: LedgerKind | "all"; group: AccountGroup | "capital" | "all"; accountId: string | "all"; lotId: string | "farm" | "all"; status: LedgerStatus | "all"; search: string }
export const EMPTY_FILTER: LedgerFilter;
export function filterLedger(rows: LedgerRow[], filter: LedgerFilter): LedgerRow[];
export interface CashSummary { received: number; receivable: number; receivableCount: number; paid: number; payable: number; payableCount: number; overdueCount: number; balance: number }
export function cashSummary(input: Pick<LedgerInputs, "expenses" | "movements" | "treatments">, period: Period, todayIso: string): CashSummary;
export interface LedgerSummary { revenue: number; coe: number; sales: number; purchases: number; result: number }
export function ledgerSummary(rows: LedgerRow[]): LedgerSummary;
export function pendingBills(expenses: Expense[], todayIso: string): { payables: Expense[]; receivables: Expense[] };
export function effectiveDueDate(e: Expense): string;
```
Row details beyond the contract, fixed here: a treatment row carries the treatment's name in `notes` (the Extrato prints "Sanidade · Vacina aftosa · N animais" and the search finds it); a venda row has `group: "revenue"` ("Receitas"), a compra row `group: "capital"` ("Capital"); a session row's counterparty is the session's (null when blank), a legacy row's is `destination` (venda) / `origin` (compra).

- [ ] **Step 1: Write the failing test**

`lib/domain/__tests__/ledger.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  cashSummary,
  EMPTY_FILTER,
  effectiveDueDate,
  filterLedger,
  ledgerRows,
  ledgerSummary,
  pendingBills,
  type LedgerFilter,
  type LedgerInputs,
  type LedgerRow,
} from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { Account, Expense, Lot, Movement } from "@/lib/types";
import { makeAnimal, makeManejoSession, makeTreatment } from "./fixtures";

const TODAY = "2026-09-24";
const PERIOD: Period = { start: "2026-07-01", end: "2026-09-30" };
const TREATMENT_ID = "treatment:2026-09-08:Vacina aftosa";

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e",
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

const lots: Lot[] = [
  { id: "lot-1", name: "Lote do Rio" },
  { id: "lot-2", name: "Engorda", deletedAt: "2026-09-21T12:00:00.000Z" },
];

const accounts: Account[] = [
  { id: "acc-sal", group: "nutrition", name: "Sal mineral" },
  { id: "acc-aluguel", group: "revenue", name: "Aluguel de pasto" },
];

const expenses: Expense[] = [
  expense({
    id: "e-paid-lot",
    date: "2026-09-10",
    category: "nutrition",
    amountBrl: 1200,
    paidAt: "2026-09-10",
    accountId: "acc-sal",
    lotId: "lot-1",
    counterparty: "Agrovét Casa do Campo",
    document: "NF 4.812",
  }),
  expense({
    id: "e-paid",
    date: "2026-08-05",
    category: "labor",
    amountBrl: 3000,
    paidAt: "2026-08-06",
    counterparty: "João Pereira",
    notes: "Salário de agosto",
  }),
  expense({
    id: "e-future",
    date: "2026-09-20",
    dueDate: "2026-10-10",
    category: "pasture",
    amountBrl: 800,
  }),
  expense({
    id: "e-overdue",
    date: "2026-09-05",
    dueDate: "2026-09-15",
    category: "admin",
    amountBrl: 500,
    counterparty: "Copel",
  }),
  expense({
    id: "r-received",
    kind: "revenue",
    date: "2026-09-12",
    amountBrl: 2000,
    paidAt: "2026-09-14",
    accountId: "acc-aluguel",
    counterparty: "Fazenda Vizinha",
  }),
  expense({
    id: "r-pending",
    kind: "revenue",
    date: "2026-09-18",
    dueDate: "2026-10-18",
    amountBrl: 700,
    counterparty: "Sítio Boa Vista",
  }),
  // Competência before the window, paid inside it: caixa only.
  expense({ id: "e-old", date: "2026-06-20", amountBrl: 400, paidAt: "2026-07-02" }),
];

const animals = [
  makeAnimal({ id: "a-101", earTag: "BR-101", lotId: "lot-1", active: false }),
  makeAnimal({ id: "a-102", earTag: "BR-102", lotId: "lot-1", active: false }),
  makeAnimal({ id: "a-201", earTag: "BR-201", lotId: "lot-2", category: "calf" }),
  makeAnimal({ id: "a-202", earTag: "BR-202", lotId: "lot-2", category: "calf" }),
];

const saleSession = makeManejoSession({
  id: "s-sale",
  name: "Venda",
  date: "2026-09-05",
  status: "closed",
  kind: "sale",
  weighing: true,
  counterparty: "Frigorífico Boi Bom",
  pricePerArroba: 300,
  carcassYieldPct: 52,
  animals: [
    // 500 kg × 52% ÷ 15 = 17,33 @ × R$ 300 = R$ 5.200; 450 kg → 15,6 @ → R$ 4.680
    { earTag: "BR-101", outcome: "done", weightKg: 500, amountBrl: 5200 },
    { earTag: "BR-102", outcome: "done", weightKg: 450, amountBrl: 4680 },
  ],
});

const entrySession = makeManejoSession({
  id: "s-entry",
  name: "Compra",
  date: "2026-08-20",
  status: "closed",
  kind: "entry",
  weighing: true,
  counterparty: "Fazenda Santa Rita",
  destinationLotId: "lot-2",
  totalAmountBrl: 8000,
  animals: [
    { earTag: "BR-201", outcome: "done", weightKg: 210, createdAnimal: true },
    { earTag: "BR-202", outcome: "done", weightKg: 240, createdAnimal: true },
  ],
});

const movements: Movement[] = [
  { id: "mov-legacy", type: "sale", date: "2026-07-15", quantity: 3, origin: "Lote A", destination: "Leilão Central", amountBrl: 6000 },
  { id: "s-entry", type: "purchase", date: "2026-08-20", quantity: 2, category: "calf", origin: "Fazenda Santa Rita", destination: "Engorda", amountBrl: 8000 },
  { id: "s-sale", type: "sale", date: "2026-09-05", quantity: 2, category: "steer", origin: "Lote do Rio", destination: "Frigorífico Boi Bom", amountBrl: 9880 },
  { id: "mov-unpriced", type: "sale", date: "2026-09-02", origin: "Lote A", destination: "Externo" },
  { id: "mov-transfer", type: "transfer", date: "2026-09-03", quantity: 5, origin: "Lote do Rio", destination: "Engorda" },
];

const treatments = [
  makeTreatment({ id: "t-1", animalEarTag: "BR-101", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-2", animalEarTag: "BR-102", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-3", animalEarTag: "BR-201", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-4", animalEarTag: "BR-202", date: "2026-09-08", status: "done" }),
  makeTreatment({ id: "t-5", animalEarTag: "BR-101", date: "2026-09-28", status: "scheduled", costBrl: 5 }),
];

const input: LedgerInputs = {
  expenses,
  accounts,
  movements,
  manejoSessions: [saleSession, entrySession],
  animals,
  treatments,
  lots,
};

const rows = ledgerRows(input, PERIOD, TODAY);
const row = (id: string): LedgerRow => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
};
const ids = (list: LedgerRow[]) => list.map((r) => r.id);
const filtered = (filter: Partial<LedgerFilter>) => ids(filterLedger(rows, { ...EMPTY_FILTER, ...filter }));

describe("ledgerRows", () => {
  it("lists the window's lançamentos, vendas, compras and treatment days, newest first", () => {
    // Same day: a venda comes before a despesa.
    expect(ids(rows)).toEqual([
      "e-future",
      "r-pending",
      "r-received",
      "e-paid-lot",
      TREATMENT_ID,
      "s-sale",
      "e-overdue",
      "s-entry",
      "e-paid",
      "mov-legacy",
    ]);
  });

  it("leaves out entries dated outside the window, unpriced movements, transfers and treatments without cost", () => {
    expect(ids(rows)).not.toContain("e-old");
    expect(ids(rows)).not.toContain("mov-unpriced");
    expect(ids(rows)).not.toContain("mov-transfer");
  });

  it("gives each row its status", () => {
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      "e-future": "payable",
      "r-pending": "receivable",
      "r-received": "received",
      "e-paid-lot": "paid",
      [TREATMENT_ID]: "paid",
      "s-sale": "received",
      "e-overdue": "overdue",
      "s-entry": "paid",
      "e-paid": "paid",
      "mov-legacy": "received",
    });
  });

  it("fills a lançamento from the expense, its conta and its lote", () => {
    expect(row("e-paid-lot")).toEqual({
      id: "e-paid-lot",
      kind: "expense",
      date: "2026-09-10",
      dueDate: "2026-09-10",
      paidAt: "2026-09-10",
      status: "paid",
      group: "nutrition",
      groupLabel: "Nutrição",
      account: "Sal mineral",
      counterparty: "Agrovét Casa do Campo",
      document: "NF 4.812",
      lotId: "lot-1",
      lotName: "Lote do Rio",
      amountBrl: 1200,
      notes: null,
      locked: false,
      headCount: null,
      expense: expenses[0],
    });
    expect(row("r-received")).toMatchObject({
      kind: "revenue",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Aluguel de pasto",
      lotId: null,
      lotName: null,
    });
    expect(row("e-overdue")).toMatchObject({ dueDate: "2026-09-15", paidAt: null });
    expect(row("e-paid")).toMatchObject({ account: null, notes: "Salário de agosto" });
  });

  it("builds a venda from its manejo session", () => {
    expect(row("s-sale")).toEqual({
      id: "s-sale",
      kind: "sale",
      date: "2026-09-05",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: null,
      counterparty: "Frigorífico Boi Bom",
      document: "manejo · 2 animais · 32,9 @",
      lotId: "lot-1",
      lotName: "Lote do Rio",
      amountBrl: 9880,
      notes: null,
      locked: true,
      headCount: 2,
      expense: null,
    });
  });

  it("builds a compra as capital, with the live arrobas and a deleted lote's name", () => {
    expect(row("s-entry")).toMatchObject({
      kind: "purchase",
      status: "paid",
      group: "capital",
      groupLabel: "Capital",
      counterparty: "Fazenda Santa Rita",
      document: "manejo · 2 animais · 15,0 @",
      lotId: "lot-2",
      lotName: "Engorda",
      amountBrl: 8000,
      headCount: 2,
      locked: true,
    });
  });

  it("builds a legacy venda from the movement alone", () => {
    expect(row("mov-legacy")).toMatchObject({
      kind: "sale",
      counterparty: "Leilão Central",
      document: null,
      lotId: null,
      lotName: null,
      headCount: 3,
      amountBrl: 6000,
      locked: true,
    });
  });

  it("drops the arrobas from the document when the venda has none", () => {
    const lotSale = makeManejoSession({
      id: "s-lot",
      date: "2026-09-09",
      status: "closed",
      kind: "sale",
      counterparty: "Vizinho",
      totalAmountBrl: 5000,
      animals: [{ earTag: "BR-101", outcome: "done" }],
    });
    const [only] = ledgerRows(
      {
        ...input,
        expenses: [],
        treatments: [],
        manejoSessions: [lotSale],
        movements: [{ id: "s-lot", type: "sale", date: "2026-09-09", quantity: 1, origin: "Lote do Rio", destination: "Vizinho", amountBrl: 5000 }],
      },
      PERIOD,
      TODAY
    );
    expect(only).toMatchObject({ document: "manejo · 1 animal", headCount: 1, lotId: "lot-1" });
  });

  it("sums a day's done treatments with cost into one Sanidade row", () => {
    expect(row(TREATMENT_ID)).toEqual({
      id: TREATMENT_ID,
      kind: "treatment",
      date: "2026-09-08",
      dueDate: "2026-09-08",
      paidAt: "2026-09-08",
      status: "paid",
      group: "health",
      groupLabel: "Sanidade",
      account: null,
      counterparty: null,
      document: null,
      lotId: null,
      lotName: null,
      amountBrl: 15,
      notes: "Vacina aftosa",
      locked: true,
      headCount: 3,
      expense: null,
    });
  });
});

describe("filterLedger", () => {
  it("returns every row with the empty filter", () => {
    expect(filterLedger(rows, EMPTY_FILTER)).toEqual(rows);
  });

  it("filters by tipo", () => {
    expect(filtered({ kind: "sale" })).toEqual(["s-sale", "mov-legacy"]);
    expect(filtered({ kind: "treatment" })).toEqual([TREATMENT_ID]);
  });

  it("filters by grupo", () => {
    expect(filtered({ group: "revenue" })).toEqual(["r-pending", "r-received", "s-sale", "mov-legacy"]);
    expect(filtered({ group: "capital" })).toEqual(["s-entry"]);
    expect(filtered({ group: "health" })).toEqual([TREATMENT_ID]);
  });

  it("filters by conta", () => {
    expect(filtered({ accountId: "acc-sal" })).toEqual(["e-paid-lot"]);
  });

  it("filters by lote, and by the farm's own rows", () => {
    expect(filtered({ lotId: "lot-1" })).toEqual(["e-paid-lot", "s-sale"]);
    expect(filtered({ lotId: "lot-2" })).toEqual(["s-entry"]);
    expect(filtered({ lotId: "farm" })).toEqual([
      "e-future",
      "r-pending",
      "r-received",
      TREATMENT_ID,
      "e-overdue",
      "e-paid",
      "mov-legacy",
    ]);
  });

  it("filters by status", () => {
    expect(filtered({ status: "overdue" })).toEqual(["e-overdue"]);
    expect(filtered({ status: "payable" })).toEqual(["e-future"]);
    expect(filtered({ status: "receivable" })).toEqual(["r-pending"]);
    expect(filtered({ status: "received" })).toEqual(["r-received", "s-sale", "mov-legacy"]);
  });

  it("searches ignoring case and accents", () => {
    expect(filtered({ search: "agrovet" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "Agrovét" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "  AGROVET " })).toEqual(["e-paid-lot"]);
  });

  it("searches conta, documento, notes and grupo", () => {
    expect(filtered({ search: "aluguel" })).toEqual(["r-received"]);
    expect(filtered({ search: "nf 4.812" })).toEqual(["e-paid-lot"]);
    expect(filtered({ search: "salario" })).toEqual(["e-paid"]);
    expect(filtered({ search: "manejo" })).toEqual(["s-sale", "s-entry"]);
    expect(filtered({ search: "sanidade" })).toEqual([TREATMENT_ID]);
  });

  it("combines filters", () => {
    expect(filtered({ kind: "expense", status: "paid" })).toEqual(["e-paid-lot", "e-paid"]);
  });
});

describe("cashSummary", () => {
  it("counts caixa by payment day and pending bills of any date", () => {
    expect(cashSummary(input, PERIOD, TODAY)).toEqual({
      received: 17880, // receita 2.000 + vendas 9.880 + 6.000
      receivable: 700,
      receivableCount: 1,
      paid: 4615, // 1.200 + 3.000 + 400 (dated June, paid July) + treatments 15
      payable: 1300,
      payableCount: 2,
      overdueCount: 1,
      balance: 13265,
    });
  });

  it("counts only despesas as vencidas, not a late receita", () => {
    const lateRevenue = expense({ id: "r-late", kind: "revenue", date: "2026-08-01", dueDate: "2026-08-31" });
    const summary = cashSummary({ ...input, expenses: [...expenses, lateRevenue] }, PERIOD, TODAY);
    expect(summary.overdueCount).toBe(1);
    expect(summary.receivableCount).toBe(2);
  });
});

describe("ledgerSummary", () => {
  it("adds up the rows given", () => {
    expect(ledgerSummary(rows)).toEqual({
      revenue: 18580, // receitas 2.700 + vendas 15.880
      coe: 5515, // despesas 5.500 + treatments 15
      sales: 15880,
      purchases: 8000,
      result: 13065,
    });
    expect(ledgerSummary([])).toEqual({ revenue: 0, coe: 0, sales: 0, purchases: 0, result: 0 });
  });
});

describe("pendingBills", () => {
  it("splits pending lançamentos, oldest vencimento first", () => {
    const { payables, receivables } = pendingBills(expenses, TODAY);
    expect(payables.map((e) => e.id)).toEqual(["e-overdue", "e-future"]);
    expect(receivables.map((e) => e.id)).toEqual(["r-pending"]);
  });
});

describe("effectiveDueDate", () => {
  it("is the vencimento, or the date when there is none", () => {
    expect(effectiveDueDate(expense({ date: "2026-08-05" }))).toBe("2026-08-05");
    expect(effectiveDueDate(expense({ date: "2026-09-05", dueDate: "2026-09-15" }))).toBe("2026-09-15");
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/domain/__tests__/ledger.test.ts` — expected FAIL: `Failed to resolve import "@/lib/domain/ledger"`.

- [ ] **Step 3: Implement**

`lib/domain/ledger.ts`:
```ts
/**
 * The Extrato: every line of money of the farm in a window — the lançamentos
 * typed by hand plus the rows derived from the manejos (vendas, compras) and
 * from the treatments with cost, which are locked. Pure.
 */
import type {
  Account,
  AccountGroup,
  Animal,
  Expense,
  Lot,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  Treatment,
} from "@/lib/types";
import { inPeriod, type Period } from "@/lib/domain/period";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { saleSummary } from "@/lib/domain/movements";
import { KG_PER_ARROBA } from "@/lib/domain/weights";
import { formatArroba } from "@/lib/domain/format";

export type LedgerKind = "expense" | "revenue" | "sale" | "purchase" | "treatment";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";

export interface LedgerRow {
  /** Expense id | movement id | `treatment:${date}:${name}`. */
  id: string;
  kind: LedgerKind;
  date: string;
  dueDate: string;
  paidAt: string | null;
  status: LedgerStatus;
  group: AccountGroup | "capital";
  groupLabel: string;
  account: string | null;
  counterparty: string | null;
  document: string | null;
  lotId: string | null;
  lotName: string | null;
  amountBrl: number;
  /** The lançamento's observação; the treatment's name on a treatment row. */
  notes: string | null;
  /** Derived from a manejo or a treatment: not editable here. */
  locked: boolean;
  headCount: number | null;
  expense: Expense | null;
}

export interface LedgerInputs {
  expenses: Expense[];
  accounts: Account[];
  movements: Movement[];
  manejoSessions: ManejoSession[];
  animals: Animal[];
  treatments: Treatment[];
  lots: Lot[];
}

/** Order of the kinds on the same day. */
const KIND_ORDER: Record<LedgerKind, number> = {
  revenue: 0,
  sale: 1,
  expense: 2,
  purchase: 3,
  treatment: 4,
};

/** Vencimento: the due date, or the date when none was typed. */
export function effectiveDueDate(e: Expense): string {
  return e.dueDate ?? e.date;
}

function entryStatus(e: Expense, todayIso: string): LedgerStatus {
  if (e.paidAt !== undefined) return e.kind === "revenue" ? "received" : "paid";
  if (effectiveDueDate(e) < todayIso) return "overdue";
  return e.kind === "revenue" ? "receivable" : "payable";
}

/** Most frequent value, the first one seen winning a tie; null when empty. */
function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

/** "manejo · N animais · X @": carcass @ for a venda, live @ for a compra. */
function sessionDocument(session: ManejoSession, done: ManejoSessionAnimal[]): string {
  const heads = `manejo · ${done.length} ${done.length === 1 ? "animal" : "animais"}`;
  let arrobas: number | null = null;
  if (session.kind === "sale") {
    arrobas = saleSummary(session)?.totalCarcassArrobas ?? null;
  } else {
    const weighed = done.filter((a) => a.weightKg !== undefined);
    if (weighed.length > 0) {
      arrobas = weighed.reduce((sum, a) => sum + (a.weightKg ?? 0), 0) / KG_PER_ARROBA;
    }
  }
  return arrobas === null ? heads : `${heads} · ${formatArroba(arrobas)}`;
}

/** Every row of the window (by `date`), newest first, then by kind, then by id. */
export function ledgerRows(input: LedgerInputs, period: Period, todayIso: string): LedgerRow[] {
  // Deleted lotes stay in `lots`, so past rows still name them.
  const lotNames = new Map(input.lots.map((l) => [l.id, l.name]));
  const lotName = (id: string | null) => (id === null ? null : (lotNames.get(id) ?? null));
  const rows: LedgerRow[] = [];

  for (const e of input.expenses) {
    if (!inPeriod(e.date, period)) continue;
    const group: AccountGroup = e.kind === "revenue" ? "revenue" : e.category;
    const lotId = e.lotId ?? null;
    rows.push({
      id: e.id,
      kind: e.kind,
      date: e.date,
      dueDate: effectiveDueDate(e),
      paidAt: e.paidAt ?? null,
      status: entryStatus(e, todayIso),
      group,
      groupLabel: ACCOUNT_GROUP_LABEL[group],
      account: accountName(e.accountId, input.accounts),
      counterparty: e.counterparty ?? null,
      document: e.document ?? null,
      lotId,
      lotName: lotName(lotId),
      amountBrl: e.amountBrl,
      notes: e.notes ?? null,
      locked: false,
      headCount: null,
      expense: e,
    });
  }

  const sessions = new Map(input.manejoSessions.map((s) => [s.id, s]));
  const lotByEarTag = new Map(input.animals.map((a) => [a.earTag, a.lotId]));
  for (const m of input.movements) {
    if (m.type === "transfer" || m.amountBrl === undefined || !inPeriod(m.date, period)) continue;
    const sale = m.type === "sale";
    // Derived movements carry their session's id; legacy rows have no session.
    const session = sessions.get(m.id);
    const done = session?.animals.filter((a) => a.outcome === "done") ?? [];
    const lotId = session
      ? mostCommon(
          done
            .map((a) => lotByEarTag.get(a.earTag))
            .filter((id): id is string => id !== undefined)
        )
      : null;
    rows.push({
      id: m.id,
      kind: sale ? "sale" : "purchase",
      date: m.date,
      dueDate: m.date,
      paidAt: m.date,
      status: sale ? "received" : "paid",
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
      account: null,
      counterparty: session
        ? session.counterparty?.trim() || null
        : sale
          ? m.destination
          : m.origin,
      document: session ? sessionDocument(session, done) : null,
      lotId,
      lotName: lotName(lotId),
      amountBrl: m.amountBrl,
      notes: m.notes ?? null,
      locked: true,
      headCount: session ? done.length : (m.quantity ?? null),
      expense: null,
    });
  }

  const treatmentDays = new Map<string, { date: string; name: string; heads: number; amount: number }>();
  for (const t of input.treatments) {
    if (t.status !== "done" || t.costBrl === undefined || !inPeriod(t.date, period)) continue;
    const id = `treatment:${t.date}:${t.name}`;
    const day = treatmentDays.get(id) ?? { date: t.date, name: t.name, heads: 0, amount: 0 };
    day.heads += 1;
    day.amount += t.costBrl;
    treatmentDays.set(id, day);
  }
  for (const [id, day] of treatmentDays) {
    rows.push({
      id,
      kind: "treatment",
      date: day.date,
      dueDate: day.date,
      paidAt: day.date,
      status: "paid",
      group: "health",
      groupLabel: ACCOUNT_GROUP_LABEL.health,
      account: null,
      counterparty: null,
      document: null,
      lotId: null,
      lotName: null,
      amountBrl: day.amount,
      notes: day.name,
      locked: true,
      headCount: day.heads,
      expense: null,
    });
  }

  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface LedgerFilter {
  kind: LedgerKind | "all";
  group: AccountGroup | "capital" | "all";
  accountId: string | "all";
  /** "farm": the rows without a lote. */
  lotId: string | "farm" | "all";
  status: LedgerStatus | "all";
  search: string;
}

export const EMPTY_FILTER: LedgerFilter = {
  kind: "all",
  group: "all",
  accountId: "all",
  lotId: "all",
  status: "all",
  search: "",
};

/** Lower case without accents, so "Agrovét" finds "agrovet". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The rows that pass every filter; the search looks at conta, quem, documento, notes and grupo. */
export function filterLedger(rows: LedgerRow[], filter: LedgerFilter): LedgerRow[] {
  const term = fold(filter.search.trim());
  return rows.filter(
    (r) =>
      (filter.kind === "all" || r.kind === filter.kind) &&
      (filter.group === "all" || r.group === filter.group) &&
      (filter.accountId === "all" || r.expense?.accountId === filter.accountId) &&
      (filter.lotId === "all" ||
        (filter.lotId === "farm" ? r.lotId === null : r.lotId === filter.lotId)) &&
      (filter.status === "all" || r.status === filter.status) &&
      (term === "" ||
        [r.account, r.counterparty, r.document, r.notes, r.groupLabel].some(
          (text) => text !== null && fold(text).includes(term)
        ))
  );
}

export interface CashSummary {
  received: number;
  receivable: number;
  receivableCount: number;
  paid: number;
  payable: number;
  payableCount: number;
  overdueCount: number;
  balance: number;
}

/**
 * Caixa do período: received and paid by payment day inside the window (priced
 * vendas and treatment costs by their date); a receber / a pagar are the
 * pending lançamentos of any date.
 */
export function cashSummary(
  input: Pick<LedgerInputs, "expenses" | "movements" | "treatments">,
  period: Period,
  todayIso: string
): CashSummary {
  const s: CashSummary = {
    received: 0,
    receivable: 0,
    receivableCount: 0,
    paid: 0,
    payable: 0,
    payableCount: 0,
    overdueCount: 0,
    balance: 0,
  };
  for (const e of input.expenses) {
    const revenue = e.kind === "revenue";
    if (e.paidAt === undefined) {
      if (revenue) {
        s.receivable += e.amountBrl;
        s.receivableCount += 1;
      } else {
        s.payable += e.amountBrl;
        s.payableCount += 1;
      }
      // Vencidas are despesas only; a late receita shows "venceu dd/mm" in A receber.
      if (!revenue && effectiveDueDate(e) < todayIso) s.overdueCount += 1;
    } else if (inPeriod(e.paidAt, period)) {
      if (revenue) s.received += e.amountBrl;
      else s.paid += e.amountBrl;
    }
  }
  for (const m of input.movements) {
    if (m.type === "sale" && m.amountBrl !== undefined && inPeriod(m.date, period)) {
      s.received += m.amountBrl;
    }
  }
  for (const t of input.treatments) {
    if (t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)) {
      s.paid += t.costBrl;
    }
  }
  s.balance = s.received - s.paid;
  return s;
}

export interface LedgerSummary {
  /** Receitas plus vendas. */
  revenue: number;
  /** Despesas plus treatments. */
  coe: number;
  sales: number;
  /** Compras de gado: capital, outside the COE. */
  purchases: number;
  /** revenue − coe. */
  result: number;
}

/** Totals of the rows given (the Extrato's summary strip). */
export function ledgerSummary(rows: LedgerRow[]): LedgerSummary {
  const s: LedgerSummary = { revenue: 0, coe: 0, sales: 0, purchases: 0, result: 0 };
  for (const r of rows) {
    if (r.kind === "revenue" || r.kind === "sale") s.revenue += r.amountBrl;
    if (r.kind === "sale") s.sales += r.amountBrl;
    if (r.kind === "expense" || r.kind === "treatment") s.coe += r.amountBrl;
    if (r.kind === "purchase") s.purchases += r.amountBrl;
  }
  s.result = s.revenue - s.coe;
  return s;
}

/** Pending despesas and receitas, oldest vencimento first, then by date. */
export function pendingBills(
  expenses: Expense[],
  todayIso: string // eslint-disable-line @typescript-eslint/no-unused-vars -- contract signature; the caller colours overdue with it
): { payables: Expense[]; receivables: Expense[] } {
  const pending = expenses
    .filter((e) => e.paidAt === undefined)
    .sort(
      (a, b) =>
        effectiveDueDate(a).localeCompare(effectiveDueDate(b)) || a.date.localeCompare(b.date)
    );
  return {
    payables: pending.filter((e) => e.kind === "expense"),
    receivables: pending.filter((e) => e.kind === "revenue"),
  };
}
```

- [ ] **Step 4: Run** `pnpm vitest run lib/domain/__tests__/ledger.test.ts` — expected PASS. Then `pnpm tsc --noEmit` and `pnpm lint` (no new warnings from `lib/domain/ledger.ts`).

- [ ] **Step 5: Commit**
```bash
git add lib/domain/ledger.ts lib/domain/__tests__/ledger.test.ts
git commit -m "feat(finance): ledger rows, filters and cash summary for the extrato"
```

---

### Task 4: Herd economics over the window (`economics.ts` rewrite, `periodAdg`)

> **Order:** needs Task 1 (`Expense.kind`, `lotId`) and Task 2 (`lib/domain/period.ts`, `FarmSystem` in `lib/domain/benchmarks.ts`) merged first. `periodAdg` lives here, not in Task 5, because `indicators` needs it; Task 5 consumes it and runs after this task.

**Files:**
- Modify (rewrite whole file): `lib/domain/economics.ts`
- Modify: `lib/domain/adg.ts` — line 4 import gains `Period`; append `periodAdg` after line 119 (end of `herdAverageAdg`)
- Modify: `lib/domain/finance.ts` — delete lines 56–99 (the blank line, then `grossMarginPerArroba`, `steerToCalfRatio`, `offtakeRatePct`, `productivityArrobasPerHa`, `capitalTurnover`: their only users were `finance.test.ts`); `Period`, `filterMonthlyByPeriod`, `PeriodResult`, `herdValue`, `periodResult` stay
- Test (rewrite whole file): `lib/domain/__tests__/economics.test.ts`
- Test (rewrite whole file): `lib/domain/__tests__/finance.test.ts`
- Test (append): `lib/domain/__tests__/adg.test.ts`

Importers checked (`grep -rn 'lib/domain/economics"\|lib/domain/finance"' app components lib`):
- `app/(app)/dashboard/page.tsx:33-34` — `filterMonthlyByPeriod`, `periodResult`, `Period`, `costBreakdownBetween`, `monthlyRevenueCost`: all kept, same signatures. No change.
- `components/dashboard/FinanceCard.tsx`, `components/finance/RevenueCostChart.tsx` — types `MonthlyRevenueCost`, `CostBreakdownSlice`, `PeriodResult`: kept.
- `components/dashboard/MarketCard.tsx` — `herdValue`: kept. `components/dashboard/{PeriodPicker,period}.ts(x)` — `Period`: kept.
- `lib/store/dashboard.ts` imports only `MonthlyAdgPoint` from adg: no change.
- `app/(app)/finance/page.tsx` (`annualRevenue`, `arrobasProducedPerYear`, `averageArrobasPerSteer`, `capitalTurnoverRatio`, `dailyCostPerHead`, `headSoldLast12m`, `productionCostPerArroba`, `productivityPerHa`, `steerToCalfExchange`, `totalCostLast12m`, and the old `averageCalfPrice(movements, refIso)` / `offtakeRate(sold, heads)` signatures), `components/finance/{CostBreakdownChart,CategorySalesTable,FinanceKpis}.tsx` — removed or rewritten by Task 9. The page stops compiling until Task 9 lands.

**Interfaces:**
- Consumes: `Expense.kind`/`lotId` (Task 1); `periodDays`, `annualise`, `inPeriod` from `lib/domain/period.ts` and `type FarmSystem` from `lib/domain/benchmarks.ts` (Task 2); `passYieldPct` (`lib/domain/movements.ts`); `carcassArrobas`, `kgToArroba`, `totalWeightKg` (`lib/domain/weights.ts`); `activeAnimals`, `herdStockingRateAuPerHa` (`lib/store/selectors.ts`); `herdValue`, `Period` (`lib/domain/finance.ts`).
- Produces (exact):
```ts
// lib/domain/adg.ts
export function periodAdg(animals: Animal[], period: Period): { kgPerDay: number | null; animals: number };
// lib/domain/economics.ts
export interface MonthlyRevenueCost { date: string; month: string; revenue: number; cost: number }
export interface CostBreakdownSlice { category: ExpenseCategory; amountBrl: number; pct: number }
export function monthlyRevenueCost(movements: Movement[], treatments: Treatment[], expenses: Expense[], months: number, refIso: string): MonthlyRevenueCost[];
export function costBreakdownBetween(expenses: Expense[], treatments: Treatment[], startIso: string, endIso: string): CostBreakdownSlice[];
export function costBreakdown(expenses: Expense[], treatments: Treatment[], months: number, refIso: string): CostBreakdownSlice[];
export interface EconomicsInputs { animals: Animal[]; manejoSessions: ManejoSession[]; movements: Movement[]; treatments: Treatment[]; expenses: Expense[]; invernadas: Invernada[]; lots: Lot[] }
export function coe(expenses: Expense[], treatments: Treatment[], period: Period): number;
export function periodRevenue(expenses: Expense[], movements: Movement[], period: Period): { total: number; sales: number; other: number };
export interface SoldArrobas { arrobas: number; heads: number; unweighed: number }
export function arrobasSold(sessions: ManejoSession[], animals: Animal[], period: Period): SoldArrobas;
export function arrobasBought(sessions: ManejoSession[], period: Period): { arrobas: number; heads: number };
export function herdArrobasAt(animals: Animal[], sessions: ManejoSession[], dateIso: string): { arrobas: number; heads: number };
export interface ArrobasProduced { sold: number; bought: number; inventoryStart: number; inventoryEnd: number; delta: number; produced: number; unweighed: number; headsSold: number }
export function arrobasProduced(input: EconomicsInputs, period: Period, todayIso: string): ArrobasProduced;
export function costPerArroba(coeBrl: number, produced: number): number | null;
export function outlayPerHeadMonth(coeBrl: number, avgHeads: number, period: Period): number | null;
export function offtakeRate(headsSold: number, avgHeads: number, period: Period): number | null;
export function averageCalfPrice(movements: Movement[], period: Period): number | null;
export function exchangeRatio(sold: SoldArrobas, quote: number | null, calfPrice: number | null): { calvesPerSteer: number | null; arrobasPerCalf: number | null };
export function farmSystem(input: EconomicsInputs, period: Period): FarmSystem;
export interface HeadCounts { start: number; end: number; avg: number }
export interface Indicators { /* exactly as the contract */ }
export function indicators(input: EconomicsInputs, period: Period, quote: number | null, todayIso: string): Indicators;
export type DeltaKey = "result" | "costPerArroba" | "arrobasPerHa" | "outlayPerHeadMonth" | "adg" | "offtakePct" | "stocking" | "exchange";
export function indicatorDeltas(current: Indicators, prior: Indicators): Record<DeltaKey, { pct: number | null; pts: number | null }>;
```
Removed from `economics.ts`: `totalCostLast12m`, `annualRevenue`, `headSoldLast12m`, `averageArrobasPerSteer`, `arrobasProducedPerYear`, `dailyCostPerHead`, `productionCostPerArroba`, `productivityPerHa`, `capitalTurnoverRatio`, `steerToCalfExchange` (only user: `app/(app)/finance/page.tsx`, Task 9). Removed from `finance.ts`: `grossMarginPerArroba`, `steerToCalfRatio`, `offtakeRatePct`, `productivityArrobasPerHa`, `capitalTurnover` (only user: `finance.test.ts`).

One deliberate reading of the contract: `exchangeRatio` averages the sold arrobas over the *weighed* sold heads (`heads − unweighed`), since an unweighed head adds no arrobas and would drag "@ médias vendidas" down.

- [ ] **Step 1: Write the failing tests**

Replace `lib/domain/__tests__/economics.test.ts` with:
```ts
import { describe, expect, it } from "vitest";
import {
  arrobasBought,
  arrobasProduced,
  arrobasSold,
  averageCalfPrice,
  coe,
  costBreakdown,
  costPerArroba,
  exchangeRatio,
  farmSystem,
  herdArrobasAt,
  indicatorDeltas,
  indicators,
  monthlyRevenueCost,
  offtakeRate,
  outlayPerHeadMonth,
  periodRevenue,
  type EconomicsInputs,
} from "@/lib/domain/economics";
import { herdStockingRateAuPerHa } from "@/lib/store/selectors";
import type {
  Animal,
  Expense,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  Treatment,
} from "@/lib/types";
import { makeAnimal, makeManejoSession } from "./fixtures";

/** Fixed reference date for deterministic assertions. */
const REF = "2026-07-24";
const TODAY = REF;
/** January to June 2026: 181 days. */
const P = { start: "2026-01-01", end: "2026-06-30" };
const DAYS = 181;

const movement = (partial: Partial<Movement>): Movement => ({
  id: "m-1",
  type: "sale",
  date: "2026-06-10",
  quantity: 1,
  category: "steer",
  origin: "Lote A",
  destination: "Externo",
  amountBrl: 1000,
  ...partial,
});

const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-06-05",
  category: "nutrition",
  amountBrl: 500,
  ...partial,
});

const treatment = (partial: Partial<Treatment>): Treatment => ({
  id: "t-1",
  animalEarTag: "BR-1",
  type: "vaccine",
  name: "Vacina",
  date: "2026-06-15",
  status: "done",
  withdrawalDays: 0,
  costBrl: 100,
  ...partial,
});

const animal = (earTag: string, partial: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `animal-${earTag}`, earTag, birthDate: "2024-01-10", ...partial });

const pass = (
  earTag: string,
  weightKg?: number,
  partial: Partial<ManejoSessionAnimal> = {}
): ManejoSessionAnimal => ({ earTag, outcome: "done", weightKg, ...partial });

const saleSession = (
  date: string,
  animals: ManejoSessionAnimal[],
  partial: Partial<ManejoSession> = {}
): ManejoSession =>
  makeManejoSession({
    id: `sale-${date}`,
    name: "Venda",
    date,
    status: "closed",
    kind: "sale",
    weighing: true,
    pricePerArroba: 300,
    carcassYieldPct: 50,
    animals,
    ...partial,
  });

const entrySession = (
  date: string,
  animals: ManejoSessionAnimal[],
  partial: Partial<ManejoSession> = {}
): ManejoSession =>
  makeManejoSession({
    id: `entry-${date}`,
    name: "Compra",
    date,
    status: "closed",
    kind: "entry",
    weighing: true,
    destinationLotId: "lot-1",
    animals,
    ...partial,
  });

const soldOnMay10 = { active: false, inactiveReason: "sale" as const, inactiveDate: "2026-05-10" };

/** Each animal's arrobas at 2025-12-31 → 2026-06-30 in the comment. */
const herd: Animal[] = [
  // A: weighed before and inside the window, 300 → 450 kg (10 @ → 15 @).
  animal("A", {
    weighings: [
      { date: "2025-12-01", weightKg: 300 },
      { date: "2026-06-01", weightKg: 450 },
    ],
  }),
  // B: first weighed inside the window, the start takes that weighing (8 @ → 10 @).
  animal("B", {
    birthDate: "2025-06-01",
    weighings: [
      { date: "2026-03-01", weightKg: 240 },
      { date: "2026-06-15", weightKg: 300 },
    ],
  }),
  // C: bought on 2026-02-10, out of the start, in the end (— → 9 @).
  animal("C", {
    weighings: [
      { date: "2026-02-10", weightKg: 210 },
      { date: "2026-06-20", weightKg: 270 },
    ],
  }),
  // D: died on 2026-04-01 (6 @ → —).
  animal("D", {
    active: false,
    inactiveReason: "death",
    inactiveDate: "2026-04-01",
    weighings: [{ date: "2025-11-01", weightKg: 180 }],
  }),
  // E: sold with a chute weight of 480 kg (15 @ → —).
  animal("E", {
    ...soldOnMay10,
    weighings: [
      { date: "2025-12-20", weightKg: 450 },
      { date: "2026-05-10", weightKg: 480 },
    ],
  }),
  // F: sold without a chute weight, last weighed at 420 kg (13 @ → —).
  animal("F", {
    ...soldOnMay10,
    weighings: [
      { date: "2025-10-01", weightKg: 390 },
      { date: "2026-04-01", weightKg: 420 },
    ],
  }),
  // G: sold, never weighed: a head without arrobas.
  animal("G", { ...soldOnMay10 }),
  // H: never weighed, still here (refugo at the venda).
  animal("H"),
];

const sessions: ManejoSession[] = [
  entrySession("2026-02-10", [pass("C", 210, { createdAnimal: true })]),
  saleSession("2026-05-10", [
    pass("E", 480),
    pass("F"),
    pass("G"),
    pass("H", 400, { outcome: "rejected" }),
  ]),
];

const expenses: Expense[] = [
  expense({ id: "e-1", date: "2026-02-05", amountBrl: 3000, paidAt: "2026-02-05" }),
  // Pending despesa inside the window: COE counts it by competência.
  expense({ id: "e-2", date: "2026-03-10", category: "labor", amountBrl: 1000 }),
  expense({ id: "e-3", kind: "revenue", date: "2026-04-01", category: "other", amountBrl: 500 }),
  expense({ id: "e-4", date: "2025-12-15", amountBrl: 800 }),
];

const treatments: Treatment[] = [
  treatment({ animalEarTag: "A", date: "2026-03-01", costBrl: 50 }),
  treatment({ id: "t-2", status: "scheduled", date: "2026-03-01", costBrl: 30 }),
];

const movements: Movement[] = [
  movement({ id: "sale-2026-05-10", date: "2026-05-10", quantity: 3, amountBrl: 9000 }),
  movement({
    id: "entry-2026-02-10",
    type: "purchase",
    category: "calf",
    date: "2026-02-10",
    quantity: 1,
    amountBrl: 2100,
    origin: "Externo",
    destination: "Lote 1",
  }),
];

const input: EconomicsInputs = {
  animals: herd,
  manejoSessions: sessions,
  movements,
  treatments,
  expenses,
  invernadas: [{ id: "inv-1", code: "01", grass: "Braquiária", hectares: 50 }],
  lots: [],
};

const empty: EconomicsInputs = {
  animals: [],
  manejoSessions: [],
  movements: [],
  treatments: [],
  expenses: [],
  invernadas: [],
  lots: [],
};

describe("monthlyRevenueCost", () => {
  it("buckets priced sales, expenses and done treatment costs by month", () => {
    const series = monthlyRevenueCost(
      [
        movement({ date: "2026-06-10", amountBrl: 8000 }),
        movement({ id: "m-2", type: "purchase", date: "2026-06-12", amountBrl: 5000 }),
        movement({ id: "m-3", type: "transfer", date: "2026-06-13", amountBrl: undefined }),
        movement({ id: "m-4", date: "2026-05-02", amountBrl: 3000 }),
      ],
      [treatment({ date: "2026-06-15", costBrl: 100 })],
      [expense({ date: "2026-06-05", amountBrl: 500 })],
      3,
      REF
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ date: "2026-05-01", revenue: 3000, cost: 0 });
    // Purchases are capital: only the sale counts as June revenue.
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 8000, cost: 600 });
    expect(series[2]).toMatchObject({ date: "2026-07-01", revenue: 0, cost: 0 });
  });

  it("excludes legacy sales without a value", () => {
    const series = monthlyRevenueCost([movement({ amountBrl: undefined })], [], [], 3, REF);
    expect(series.every((m) => m.revenue === 0)).toBe(true);
  });

  it("adds receitas to revenue and keeps them out of cost", () => {
    const series = monthlyRevenueCost(
      [],
      [],
      [
        expense({ id: "e-1", kind: "revenue", category: "other", date: "2026-06-20", amountBrl: 700 }),
        expense({ id: "e-2", date: "2026-06-05", amountBrl: 500 }),
      ],
      3,
      REF
    );
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 700, cost: 500 });
  });
});

describe("costBreakdown", () => {
  it("splits by category, folding done treatments into health", () => {
    const slices = costBreakdown(
      [
        expense({ category: "nutrition", amountBrl: 600 }),
        expense({ id: "e-2", category: "labor", amountBrl: 300 }),
      ],
      [treatment({ costBrl: 100 })],
      12,
      REF
    );
    expect(slices[0]).toMatchObject({ category: "nutrition", amountBrl: 600, pct: 60 });
    expect(slices[1]).toMatchObject({ category: "labor", amountBrl: 300, pct: 30 });
    expect(slices[2]).toMatchObject({ category: "health", amountBrl: 100, pct: 10 });
  });

  it("returns empty when there is no cost", () => {
    expect(costBreakdown([], [treatment({ status: "scheduled" })], 12, REF)).toEqual([]);
  });

  it("skips receitas", () => {
    expect(
      costBreakdown(
        [
          expense({ kind: "revenue", category: "other", amountBrl: 900 }),
          expense({ id: "e-2", amountBrl: 100 }),
        ],
        [],
        12,
        REF
      )
    ).toEqual([{ category: "nutrition", amountBrl: 100, pct: 100 }]);
  });
});

describe("coe and periodRevenue", () => {
  it("sums despesas by date (paid or not) and done treatment costs, never receitas", () => {
    expect(coe(expenses, treatments, P)).toBe(4050);
    expect(coe([], [], P)).toBe(0);
  });

  it("splits revenue into priced sales and receitas", () => {
    expect(periodRevenue(expenses, movements, P)).toEqual({ total: 9500, sales: 9000, other: 500 });
    expect(periodRevenue(expenses, movements, { start: "2026-07-01", end: "2026-07-31" })).toEqual({
      total: 0,
      sales: 0,
      other: 0,
    });
  });
});

describe("arrobasSold", () => {
  it("uses the chute weight, falls back to the last weighing and counts the unweighed", () => {
    // E: 480 kg × 50% ÷ 15 = 16 @; F: 420 kg × 50% ÷ 15 = 14 @; G: none; H was refugo.
    expect(arrobasSold(sessions, herd, P)).toEqual({ arrobas: 30, heads: 3, unweighed: 1 });
  });

  it("applies the pass's own rendimento", () => {
    const session = saleSession("2026-05-10", [pass("E", 480, { carcassYieldPct: 55 })]);
    expect(arrobasSold([session], herd, P).arrobas).toBeCloseTo((480 * 0.55) / 15, 6);
  });

  it("ignores sales outside the window", () => {
    expect(arrobasSold(sessions, herd, { start: "2026-06-01", end: "2026-06-30" })).toEqual({
      arrobas: 0,
      heads: 0,
      unweighed: 0,
    });
  });
});

describe("arrobasBought", () => {
  it("sums entry weights ÷ 30; an entry without weight counts the head only", () => {
    expect(arrobasBought(sessions, P)).toEqual({ arrobas: 7, heads: 1 });
    expect(arrobasBought([...sessions, entrySession("2026-03-01", [pass("X")])], P)).toEqual({
      arrobas: 7,
      heads: 2,
    });
  });
});

describe("herdArrobasAt", () => {
  it("counts the animals alive on the date at their weight then", () => {
    // A 10 + B 8 (first weighing) + D 6 + E 15 + F 13; G and H are heads without weight; C not yet bought.
    const start = herdArrobasAt(herd, sessions, "2025-12-31");
    expect(start.arrobas).toBeCloseTo(52, 6);
    expect(start.heads).toBe(7);
    // A 15 + B 10 + C 9; H without weight; D dead, E F G sold.
    const end = herdArrobasAt(herd, sessions, "2026-06-30");
    expect(end.arrobas).toBeCloseTo(34, 6);
    expect(end.heads).toBe(4);
  });

  it("leaves out an animal born after the date", () => {
    expect(herdArrobasAt([animal("Z", { birthDate: "2026-02-01" })], [], "2026-01-31")).toEqual({
      arrobas: 0,
      heads: 0,
    });
  });
});

describe("arrobasProduced", () => {
  it("is sold − bought + the inventory change", () => {
    const produced = arrobasProduced(input, P, TODAY);
    expect(produced).toMatchObject({ sold: 30, bought: 7, unweighed: 1, headsSold: 3 });
    expect(produced.inventoryStart).toBeCloseTo(52, 6);
    expect(produced.inventoryEnd).toBeCloseTo(34, 6);
    expect(produced.delta).toBeCloseTo(-18, 6);
    expect(produced.produced).toBeCloseTo(5, 6);
  });

  it("closes the inventory today when the window ends later", () => {
    const produced = arrobasProduced(input, { start: "2026-07-01", end: "2026-12-31" }, TODAY);
    expect(produced.inventoryEnd).toBeCloseTo(herdArrobasAt(herd, sessions, TODAY).arrobas, 6);
  });
});

describe("unit indicators", () => {
  it("costPerArroba is null without cost or without production", () => {
    expect(costPerArroba(4050, 5)).toBe(810);
    expect(costPerArroba(0, 5)).toBeNull();
    expect(costPerArroba(4050, 0)).toBeNull();
    expect(costPerArroba(4050, -3)).toBeNull();
  });

  it("outlayPerHeadMonth divides by the average heads and the months", () => {
    expect(outlayPerHeadMonth(4050, 5.5, P)).toBeCloseTo(4050 / 5.5 / (DAYS / 30.4375), 6);
    expect(outlayPerHeadMonth(4050, 0, P)).toBeNull();
    expect(outlayPerHeadMonth(0, 5.5, P)).toBeNull();
  });

  it("offtakeRate is annualised", () => {
    expect(offtakeRate(3, 5.5, P)).toBeCloseTo(((3 / 5.5) * 100 * 365) / DAYS, 6);
    expect(offtakeRate(3, 0, P)).toBeNull();
  });

  it("averageCalfPrice uses priced calf purchases in the window", () => {
    expect(averageCalfPrice(movements, P)).toBe(2100);
    expect(averageCalfPrice(movements, { start: "2026-07-01", end: "2026-07-31" })).toBeNull();
    expect(
      averageCalfPrice(
        [
          movement({ type: "purchase", category: "calf", date: "2026-03-01", quantity: 2, amountBrl: 5600 }),
          movement({ id: "m-2", type: "purchase", category: "steer", date: "2026-03-01", amountBrl: 9000 }),
          movement({ id: "m-3", type: "purchase", category: "calf", date: "2026-03-01", amountBrl: undefined }),
        ],
        P
      )
    ).toBe(2800);
  });

  it("exchangeRatio: calves per steer and arrobas per calf", () => {
    const sold = { arrobas: 30, heads: 3, unweighed: 1 };
    const ratio = exchangeRatio(sold, 300, 2100);
    expect(ratio.calvesPerSteer).toBeCloseTo((15 * 300) / 2100, 6);
    expect(ratio.arrobasPerCalf).toBe(7);
    expect(exchangeRatio(sold, null, 2100)).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
    expect(exchangeRatio(sold, 300, null)).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
    expect(exchangeRatio({ arrobas: 0, heads: 0, unweighed: 0 }, 300, 2100)).toEqual({
      calvesPerSteer: null,
      arrobasPerCalf: 7,
    });
  });
});

describe("farmSystem", () => {
  const cow = animal("V", {
    category: "cow",
    sex: "female",
    reproduction: {
      breedings: [],
      diagnoses: [],
      calvings: [{ date: "2026-03-01", calfEarTag: "K3" }],
    },
  });
  const calf = (earTag: string) => animal(earTag, { category: "calf", ...soldOnMay10 });
  const steer = animal("S1", { ...soldOnMay10 });

  it("is cria with calvings and mostly calves sold", () => {
    const system = farmSystem(
      {
        ...empty,
        animals: [cow, calf("K1"), calf("K2"), steer],
        manejoSessions: [saleSession("2026-05-10", [pass("K1"), pass("K2"), pass("S1")])],
      },
      P
    );
    expect(system).toBe("cria");
  });

  it("is recria_engorda without calvings and with compras", () => {
    expect(farmSystem(input, P)).toBe("recria_engorda");
  });

  it("is ciclo_completo otherwise", () => {
    expect(
      farmSystem(
        {
          ...empty,
          animals: [cow, steer],
          manejoSessions: [saleSession("2026-05-10", [pass("S1")])],
        },
        P
      )
    ).toBe("ciclo_completo");
    expect(farmSystem(empty, P)).toBe("ciclo_completo");
  });
});

describe("indicators", () => {
  it("assembles the placar", () => {
    const ind = indicators(input, P, 300, TODAY);
    expect(ind.period).toEqual(P);
    expect(ind.system).toBe("recria_engorda");
    expect(ind.heads).toEqual({ start: 7, end: 4, avg: 5.5 });
    expect(ind.hectares).toBe(50);
    expect(ind).toMatchObject({
      revenue: 9500,
      salesRevenue: 9000,
      otherRevenue: 500,
      coe: 4050,
      result: 5450,
      resultPerHa: 109,
      calfPrice: 2100,
    });
    expect(ind.marginPct).toBeCloseTo((5450 / 9500) * 100, 6);
    expect(ind.costToRevenuePct).toBeCloseTo((4050 / 9500) * 100, 6);
    expect(ind.produced.produced).toBeCloseTo(5, 6);
    expect(ind.arrobasPerHa).toBeCloseTo((5 * 365) / DAYS / 50, 6);
    expect(ind.costPerArroba).toBeCloseTo(810, 6);
    expect(ind.realizedPerArroba).toBeCloseTo(300, 6);
    expect(ind.marginPerArroba).toBeCloseTo(-510, 6);
    expect(ind.outlayPerHeadMonth).toBeCloseTo(4050 / 5.5 / (DAYS / 30.4375), 6);
    // B: 240 → 300 kg in 106 days; C: 210 → 270 kg in 130 days; the others have one weighing inside.
    expect(ind.adg.animals).toBe(2);
    expect(ind.adg.kgPerDay).toBeCloseTo((60 / 106 + 60 / 130) / 2, 6);
    expect(ind.offtakePct).toBeCloseTo(((3 / 5.5) * 100 * 365) / DAYS, 6);
    expect(ind.stocking).not.toBeNull();
    expect(ind.stocking).toBeCloseTo(herdStockingRateAuPerHa(herd, input.invernadas), 6);
    expect(ind.exchange.calvesPerSteer).toBeCloseTo((15 * 300) / 2100, 6);
    expect(ind.exchange.arrobasPerCalf).toBe(7);
    // Active: A 450 + B 300 + C 270 kg = 34 @.
    expect(ind.herdArrobas).toBeCloseTo(34, 6);
    expect(ind.herdValue).toBeCloseTo(10200, 6);
    expect(ind.inventoryDeltaBrl).toBeCloseTo(-5400, 6);
    expect(ind.capitalTurnover).toBeCloseTo((9500 * 365) / DAYS / 10200, 6);
  });

  it("returns null for the per-hectare figures without hectares and the priced ones without quote", () => {
    const ind = indicators({ ...input, invernadas: [] }, P, null, TODAY);
    expect(ind.hectares).toBe(0);
    expect(ind.resultPerHa).toBeNull();
    expect(ind.arrobasPerHa).toBeNull();
    expect(ind.stocking).toBeNull();
    expect(ind.herdValue).toBeNull();
    expect(ind.capitalTurnover).toBeNull();
    expect(ind.marginPerArroba).toBeNull();
    expect(ind.inventoryDeltaBrl).toBeNull();
    expect(ind.exchange).toEqual({ calvesPerSteer: null, arrobasPerCalf: null });
  });

  it("returns null everywhere a denominator is missing", () => {
    const ind = indicators(empty, P, 300, TODAY);
    expect(ind.heads).toEqual({ start: 0, end: 0, avg: 0 });
    expect(ind.result).toBe(0);
    expect(ind.marginPct).toBeNull();
    expect(ind.costToRevenuePct).toBeNull();
    expect(ind.costPerArroba).toBeNull();
    expect(ind.realizedPerArroba).toBeNull();
    expect(ind.outlayPerHeadMonth).toBeNull();
    expect(ind.offtakePct).toBeNull();
    expect(ind.adg).toEqual({ kgPerDay: null, animals: 0 });
    expect(ind.calfPrice).toBeNull();
  });
});

describe("indicatorDeltas", () => {
  const current = indicators(input, P, 300, TODAY);

  it("compares with the prior window and nulls a side without data", () => {
    const prior = {
      ...current,
      result: 2725,
      costPerArroba: null,
      adg: { kgPerDay: null, animals: 0 },
      offtakePct: 0,
    };
    const deltas = indicatorDeltas(current, prior);
    expect(deltas.result).toEqual({ pct: 100, pts: 2725 });
    expect(deltas.costPerArroba).toEqual({ pct: null, pts: null });
    expect(deltas.adg).toEqual({ pct: null, pts: null });
    expect(deltas.offtakePct).toEqual({ pct: null, pts: null });
    expect(deltas.stocking).toEqual({ pct: 0, pts: 0 });
  });

  it("measures the change against the prior's magnitude", () => {
    const deltas = indicatorDeltas(current, { ...current, result: -1000 });
    expect(deltas.result.pct).toBeCloseTo(645, 6);
    expect(deltas.result.pts).toBe(6450);
  });
});
```

Replace `lib/domain/__tests__/finance.test.ts` with:
```ts
import { describe, expect, it } from "vitest";
import { filterMonthlyByPeriod, herdValue, periodResult } from "@/lib/domain/finance";

describe("herdValue", () => {
  it("multiplies arrobas by the price", () => {
    expect(herdValue(100, 240)).toBe(24000);
  });
});

describe("periodResult", () => {
  it("consolidates revenues, costs and net margin", () => {
    const r = periodResult([1000, 500], [300, 200]);
    expect(r.totalRevenue).toBe(1500);
    expect(r.totalCost).toBe(500);
    expect(r.result).toBe(1000);
    expect(r.netMarginPct).toBeCloseTo(66.6667, 3);
  });

  it("returns margin 0 without revenue", () => {
    expect(periodResult([], [100]).netMarginPct).toBe(0);
  });
});

describe("filterMonthlyByPeriod", () => {
  it("keeps the entries inside the window, both ends inclusive", () => {
    const series = [{ date: "2026-01-01" }, { date: "2026-02-01" }, { date: "2026-03-01" }];
    expect(filterMonthlyByPeriod(series, { start: "2026-01-01", end: "2026-02-01" })).toEqual([
      { date: "2026-01-01" },
      { date: "2026-02-01" },
    ]);
  });
});
```

Append to `lib/domain/__tests__/adg.test.ts` (and add `periodAdg` to its import on line 2: `import { calculateAdg, herdAdgSamples, herdAverageAdg, monthlyAdg, periodAdg } from "@/lib/domain/adg";`):
```ts
describe("periodAdg", () => {
  const period = { start: "2026-01-01", end: "2026-06-30" };

  it("averages the animals weighed twice inside the window, 30+ days apart", () => {
    const animals = [
      // 300 → 360 kg from 2026-01-01 to 2026-03-02 (60 days): 1 kg/day; the 2025 weighing is outside.
      makeAnimal({
        weighings: [
          { date: "2025-11-01", weightKg: 250 },
          { date: "2026-01-01", weightKg: 300 },
          { date: "2026-03-02", weightKg: 360 },
        ],
      }),
      // 200 → 230 kg in 60 days: 0.5 kg/day; a sold animal still counts.
      makeAnimal({
        earTag: "BR-002",
        active: false,
        weighings: [
          { date: "2026-04-01", weightKg: 200 },
          { date: "2026-05-31", weightKg: 230 },
        ],
      }),
      // 29 days apart: left out.
      makeAnimal({
        earTag: "BR-003",
        weighings: [
          { date: "2026-06-01", weightKg: 200 },
          { date: "2026-06-30", weightKg: 230 },
        ],
      }),
      // The second weighing is after the window: left out.
      makeAnimal({
        earTag: "BR-004",
        weighings: [
          { date: "2026-05-01", weightKg: 200 },
          { date: "2026-07-15", weightKg: 250 },
        ],
      }),
    ];
    expect(periodAdg(animals, period)).toEqual({ kgPerDay: 0.75, animals: 2 });
  });

  it("is null when no animal qualifies", () => {
    expect(periodAdg([], period)).toEqual({ kgPerDay: null, animals: 0 });
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/finance.test.ts lib/domain/__tests__/adg.test.ts`
Expected: FAIL — `economics.test.ts` with `SyntaxError`/"does not provide an export named 'arrobasBought'" (and the other new names); `adg.test.ts` "periodAdg is not a function"; `finance.test.ts` passes (it only lost cases).

- [ ] **Step 3: Implement**

`lib/domain/adg.ts`: change line 4 to
```ts
import type { Animal, Weighing } from "@/lib/types";
import type { Period } from "@/lib/domain/finance";
```
and append at the end of the file:
```ts

/** Shortest span between two weighings that says something about gain. */
const PERIOD_ADG_MIN_DAYS = 30;

/**
 * Herd ADG of a window (the Placar's GMD): per animal, active or not, the
 * first and last weighing dated inside the window, when they are at least
 * 30 days apart, give (last − first) kg / days; the herd figure is the mean
 * of those animals. `animals` is how many qualified.
 */
export function periodAdg(
  animals: Animal[],
  period: Period
): { kgPerDay: number | null; animals: number } {
  const adgs: number[] = [];
  for (const animal of animals) {
    const inside = animal.weighings.filter(
      (w) => w.date >= period.start && w.date <= period.end
    );
    if (inside.length < 2) continue;
    const first = inside[0];
    const last = inside[inside.length - 1];
    const days = daysBetween(first.date, last.date);
    if (days < PERIOD_ADG_MIN_DAYS) continue;
    adgs.push((last.weightKg - first.weightKg) / days);
  }
  return {
    kgPerDay: adgs.length === 0 ? null : adgs.reduce((sum, g) => sum + g, 0) / adgs.length,
    animals: adgs.length,
  };
}
```

`lib/domain/finance.ts`: delete lines 56–99 (the blank line before `/** Gross margin per sold arroba` to the end of `capitalTurnover`). The file ends with `periodResult`.

Replace `lib/domain/economics.ts` with:
```ts
/**
 * Economics of the farm over a window: the revenue × cost series of the
 * Painel, and the Placar of Financeiro (COE, @ produzidas, custo da @,
 * desembolso, desfrute, relação de troca, production system).
 *
 * Conventions:
 * - Windows are inclusive ISO dates. Competência uses `date`.
 * - Revenue = priced sale movements + receitas lançadas (`kind: "revenue"`).
 *   Purchases are capital, never cost.
 * - COE = despesas (`kind: "expense"`, paid or not) + DONE treatments' `costBrl`.
 * - Arrobas sold are carcass arrobas (kg × rendimento ÷ 15); bought and herd
 *   arrobas are live (kg ÷ 30).
 * - Every indicator returns `number | null`; null means "insufficient data"
 *   and the UI renders "—" instead of a fake number.
 */
import type {
  Animal,
  Expense,
  ExpenseCategory,
  Invernada,
  Lot,
  ManejoSession,
  Movement,
  Treatment,
} from "@/lib/types";
import { addDays, monthYearLabel, parseISODate, toISO } from "@/lib/domain/dates";
import { carcassArrobas, kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { passYieldPct } from "@/lib/domain/movements";
import { periodAdg } from "@/lib/domain/adg";
import { herdValue, type Period } from "@/lib/domain/finance";
import { annualise, inPeriod, periodDays } from "@/lib/domain/period";
import type { FarmSystem } from "@/lib/domain/benchmarks";
import { activeAnimals, herdStockingRateAuPerHa } from "@/lib/store/selectors";

/** One month of consolidated revenue × cost (date = first day of the month). */
export interface MonthlyRevenueCost {
  date: string;
  /** Month label, e.g.: "mai/26". */
  month: string;
  revenue: number;
  cost: number;
}

/** One slice of the cost breakdown. */
export interface CostBreakdownSlice {
  category: ExpenseCategory;
  amountBrl: number;
  /** Share of the total cost, in % (0-100). */
  pct: number;
}

/** Everything the window's figures are computed from (the store's slices). */
export interface EconomicsInputs {
  animals: Animal[];
  manejoSessions: ManejoSession[];
  movements: Movement[];
  treatments: Treatment[];
  expenses: Expense[];
  invernadas: Invernada[];
  lots: Lot[];
}

/** Average days in a month, to turn a window's days into months. */
const DAYS_PER_MONTH = 30.4375;

/** First day (ISO) of the month `back` months before refIso's month. */
function monthStart(refIso: string, back: number): string {
  const ref = parseISODate(refIso);
  return toISO(new Date(ref.getFullYear(), ref.getMonth() - back, 1));
}

/** A sale with a recorded value (the only movement rows that count as revenue). */
const isPricedSale = (m: Movement): m is Movement & { amountBrl: number } =>
  m.type === "sale" && m.amountBrl !== undefined;

/** A done treatment with a recorded cost (the "health" cost rows). */
const isCostedTreatment = (t: Treatment): t is Treatment & { costBrl: number } =>
  t.status === "done" && t.costBrl !== undefined;

const isRevenue = (e: Expense): boolean => e.kind === "revenue";

/**
 * Consolidated revenue × cost of the last `months` calendar months ending at
 * refIso's month. Receitas lançadas add to revenue and never to cost. Months
 * without records stay at zero.
 */
export function monthlyRevenueCost(
  movements: Movement[],
  treatments: Treatment[],
  expenses: Expense[],
  months: number,
  refIso: string
): MonthlyRevenueCost[] {
  const buckets = new Map<string, MonthlyRevenueCost>();
  const series: MonthlyRevenueCost[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const date = monthStart(refIso, back);
    const entry: MonthlyRevenueCost = {
      date,
      month: monthYearLabel(date),
      revenue: 0,
      cost: 0,
    };
    buckets.set(date.slice(0, 7), entry);
    series.push(entry);
  }

  for (const m of movements) {
    if (!isPricedSale(m)) continue;
    const bucket = buckets.get(m.date.slice(0, 7));
    if (bucket) bucket.revenue += m.amountBrl;
  }
  for (const e of expenses) {
    const bucket = buckets.get(e.date.slice(0, 7));
    if (!bucket) continue;
    if (isRevenue(e)) bucket.revenue += e.amountBrl;
    else bucket.cost += e.amountBrl;
  }
  for (const t of treatments) {
    if (!isCostedTreatment(t)) continue;
    const bucket = buckets.get(t.date.slice(0, 7));
    if (bucket) bucket.cost += t.costBrl;
  }
  return series;
}

/**
 * Cost split by category between two ISO dates (both inclusive). Done
 * treatments' costs land in the "health" bucket; receitas are skipped. Zero
 * slices are dropped; empty array when there is no cost at all.
 */
export function costBreakdownBetween(
  expenses: Expense[],
  treatments: Treatment[],
  startIso: string,
  endIso: string
): CostBreakdownSlice[] {
  const totals = new Map<ExpenseCategory, number>();
  const add = (category: ExpenseCategory, amount: number): void => {
    totals.set(category, (totals.get(category) ?? 0) + amount);
  };

  for (const e of expenses) {
    if (!isRevenue(e) && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && t.date >= startIso && t.date <= endIso) {
      add("health", t.costBrl);
    }
  }

  const total = [...totals.values()].reduce((sum, v) => sum + v, 0);
  if (total === 0) return [];
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amountBrl]) => ({
      category,
      amountBrl,
      pct: (amountBrl / total) * 100,
    }))
    .sort((a, b) => b.amountBrl - a.amountBrl);
}

/** Cost split over the last `months` calendar months ending at refIso's month. */
export function costBreakdown(
  expenses: Expense[],
  treatments: Treatment[],
  months: number,
  refIso: string
): CostBreakdownSlice[] {
  return costBreakdownBetween(expenses, treatments, monthStart(refIso, months - 1), refIso);
}

/** COE of the window: despesas by `date`, paid or pending, plus done treatment costs. */
export function coe(expenses: Expense[], treatments: Treatment[], period: Period): number {
  let total = 0;
  for (const e of expenses) {
    if (!isRevenue(e) && inPeriod(e.date, period)) total += e.amountBrl;
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && inPeriod(t.date, period)) total += t.costBrl;
  }
  return total;
}

/** Revenue of the window: priced sales (`sales`) plus receitas lançadas (`other`). */
export function periodRevenue(
  expenses: Expense[],
  movements: Movement[],
  period: Period
): { total: number; sales: number; other: number } {
  let sales = 0;
  let other = 0;
  for (const m of movements) {
    if (isPricedSale(m) && inPeriod(m.date, period)) sales += m.amountBrl;
  }
  for (const e of expenses) {
    if (isRevenue(e) && inPeriod(e.date, period)) other += e.amountBrl;
  }
  return { total: sales + other, sales, other };
}

/** Weight (kg) of the animal's last weighing on or before the date, or null. */
function weightOnOrBefore(animal: Animal | undefined, dateIso: string): number | null {
  if (animal === undefined) return null;
  let kg: number | null = null;
  for (const w of animal.weighings) if (w.date <= dateIso) kg = w.weightKg;
  return kg;
}

/** Carcass arrobas the window sold, over how many heads, and how many had no weight at all. */
export interface SoldArrobas {
  arrobas: number;
  heads: number;
  unweighed: number;
}

/**
 * Carcass arrobas sold in the window: every animal that passed a venda dated
 * inside it, at its chute weight × its rendimento ÷ 15. Without a chute
 * weight, its last weighing on or before the venda at the same rendimento;
 * without any weight it adds nothing and counts in `unweighed`.
 */
export function arrobasSold(
  sessions: ManejoSession[],
  animals: Animal[],
  period: Period
): SoldArrobas {
  const byEarTag = new Map(animals.map((a) => [a.earTag, a]));
  let arrobas = 0;
  let heads = 0;
  let unweighed = 0;
  for (const session of sessions) {
    if (session.kind !== "sale" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      heads++;
      const kg = entry.weightKg ?? weightOnOrBefore(byEarTag.get(entry.earTag), session.date);
      if (kg === null) unweighed++;
      else arrobas += carcassArrobas(kg, passYieldPct(session, entry));
    }
  }
  return { arrobas, heads, unweighed };
}

/** Live arrobas bought in the window: entry weight ÷ 30 of every animal an entrada dated inside it received. */
export function arrobasBought(
  sessions: ManejoSession[],
  period: Period
): { arrobas: number; heads: number } {
  let arrobas = 0;
  let heads = 0;
  for (const session of sessions) {
    if (session.kind !== "entry" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      heads++;
      arrobas += kgToArroba(entry.weightKg ?? 0);
    }
  }
  return { arrobas, heads };
}

/**
 * Herd live arrobas on a date. An animal counts when it was alive on the
 * date: born on or before it, active or gone after it, and not registered by
 * an entrada dated after it. Its weight is the last weighing on or before the
 * date, else the first one after (an animal weighed for the first time later
 * was already there); never weighed, it is a head without arrobas.
 */
export function herdArrobasAt(
  animals: Animal[],
  sessions: ManejoSession[],
  dateIso: string
): { arrobas: number; heads: number } {
  const enteredLater = new Set<string>();
  for (const session of sessions) {
    if (session.kind !== "entry" || session.date <= dateIso) continue;
    for (const entry of session.animals) if (entry.createdAnimal) enteredLater.add(entry.earTag);
  }

  let arrobas = 0;
  let heads = 0;
  for (const animal of animals) {
    if (animal.birthDate > dateIso || enteredLater.has(animal.earTag)) continue;
    const stillHere =
      animal.active || (animal.inactiveDate !== undefined && animal.inactiveDate > dateIso);
    if (!stillHere) continue;
    heads++;
    const kg =
      weightOnOrBefore(animal, dateIso) ??
      animal.weighings.find((w) => w.date > dateIso)?.weightKg ??
      null;
    if (kg !== null) arrobas += kgToArroba(kg);
  }
  return { arrobas, heads };
}

/** The parts of @ produzidas: sold − bought + (inventoryEnd − inventoryStart). */
export interface ArrobasProduced {
  sold: number;
  bought: number;
  inventoryStart: number;
  inventoryEnd: number;
  delta: number;
  produced: number;
  /** Heads sold without any weight (they add no arrobas). */
  unweighed: number;
  headsSold: number;
}

/** Last day of the window that has already happened. */
const closingDate = (period: Period, todayIso: string): string =>
  period.end < todayIso ? period.end : todayIso;

/** @ produzidas in the window: the industry's denominator for custo da @. */
export function arrobasProduced(
  input: EconomicsInputs,
  period: Period,
  todayIso: string
): ArrobasProduced {
  const { animals, manejoSessions } = input;
  const sold = arrobasSold(manejoSessions, animals, period);
  const bought = arrobasBought(manejoSessions, period);
  // The opening stock is taken the day before the window so that a weighing,
  // a birth or an entrada on `start` belongs to the window. The closing stock
  // stops at today: a window ending in the future has no weights there yet.
  const inventoryStart = herdArrobasAt(animals, manejoSessions, addDays(period.start, -1)).arrobas;
  const inventoryEnd = herdArrobasAt(animals, manejoSessions, closingDate(period, todayIso)).arrobas;
  const delta = inventoryEnd - inventoryStart;
  return {
    sold: sold.arrobas,
    bought: bought.arrobas,
    inventoryStart,
    inventoryEnd,
    delta,
    produced: sold.arrobas - bought.arrobas + delta,
    unweighed: sold.unweighed,
    headsSold: sold.heads,
  };
}

/** Custo da @ produzida (R$/@); null without cost or without production. */
export function costPerArroba(coeBrl: number, produced: number): number | null {
  if (coeBrl === 0 || produced <= 0) return null;
  return coeBrl / produced;
}

/** Desembolso por cabeça por mês (R$/cab/mês); null without heads or without cost. */
export function outlayPerHeadMonth(
  coeBrl: number,
  avgHeads: number,
  period: Period
): number | null {
  if (avgHeads <= 0 || coeBrl === 0) return null;
  return coeBrl / avgHeads / (periodDays(period) / DAYS_PER_MONTH);
}

/** Taxa de desfrute: heads sold over average heads, annualised, in %. */
export function offtakeRate(headsSold: number, avgHeads: number, period: Period): number | null {
  if (avgHeads <= 0) return null;
  return annualise((headsSold / avgHeads) * 100, period);
}

/** Average price (R$/head) of the priced calf purchases in the window; null when none. */
export function averageCalfPrice(movements: Movement[], period: Period): number | null {
  let amount = 0;
  let heads = 0;
  for (const m of movements) {
    if (
      m.type === "purchase" &&
      m.category === "calf" &&
      m.amountBrl !== undefined &&
      m.quantity !== undefined &&
      inPeriod(m.date, period)
    ) {
      amount += m.amountBrl;
      heads += m.quantity;
    }
  }
  return heads === 0 ? null : amount / heads;
}

/**
 * Relação de troca: how many calves one finished steer buys (its average
 * sold arrobas × the quote ÷ the calf price), and how many arrobas one calf
 * costs. The average is over the weighed sold heads: an unweighed one has no
 * arrobas to average.
 */
export function exchangeRatio(
  sold: SoldArrobas,
  quote: number | null,
  calfPrice: number | null
): { calvesPerSteer: number | null; arrobasPerCalf: number | null } {
  if (quote === null || quote === 0 || calfPrice === null || calfPrice === 0) {
    return { calvesPerSteer: null, arrobasPerCalf: null };
  }
  const weighedHeads = sold.heads - sold.unweighed;
  return {
    calvesPerSteer:
      weighedHeads > 0 && sold.arrobas > 0
        ? ((sold.arrobas / weighedHeads) * quote) / calfPrice
        : null,
    arrobasPerCalf: calfPrice / quote,
  };
}

/**
 * Production system the window looks like: cria when it has calvings and
 * the heads sold are mostly calves; recria-engorda when it has no calvings
 * and has compras; ciclo completo otherwise.
 */
export function farmSystem(input: EconomicsInputs, period: Period): FarmSystem {
  const { animals, manejoSessions, movements } = input;
  const calvings = animals.some((a) =>
    (a.reproduction?.calvings ?? []).some((c) => inPeriod(c.date, period))
  );

  const categoryOf = new Map(animals.map((a) => [a.earTag, a.category]));
  let sold = 0;
  let calves = 0;
  for (const session of manejoSessions) {
    if (session.kind !== "sale" || !inPeriod(session.date, period)) continue;
    for (const entry of session.animals) {
      if (entry.outcome !== "done") continue;
      sold++;
      if (categoryOf.get(entry.earTag) === "calf") calves++;
    }
  }
  if (calvings && sold > 0 && calves / sold >= 0.5) return "cria";

  const bought =
    arrobasBought(manejoSessions, period).heads > 0 ||
    movements.some((m) => m.type === "purchase" && inPeriod(m.date, period));
  if (!calvings && bought) return "recria_engorda";
  return "ciclo_completo";
}

/** Heads at the window's start and end (as `herdArrobasAt` counts them) and their mean. */
export interface HeadCounts {
  start: number;
  end: number;
  avg: number;
}

/** The Placar of Financeiro for one window. */
export interface Indicators {
  period: Period;
  system: FarmSystem;
  heads: HeadCounts;
  hectares: number;
  revenue: number;
  salesRevenue: number;
  otherRevenue: number;
  coe: number;
  result: number;
  resultPerHa: number | null;
  marginPct: number | null;
  costToRevenuePct: number | null;
  capitalTurnover: number | null;
  produced: ArrobasProduced;
  arrobasPerHa: number | null;
  costPerArroba: number | null;
  realizedPerArroba: number | null;
  marginPerArroba: number | null;
  outlayPerHeadMonth: number | null;
  adg: { kgPerDay: number | null; animals: number };
  offtakePct: number | null;
  stocking: number | null;
  calfPrice: number | null;
  exchange: { calvesPerSteer: number | null; arrobasPerCalf: number | null };
  herdArrobas: number;
  herdValue: number | null;
  inventoryDeltaBrl: number | null;
}

/** Every figure of the Placar for the window, at today's quote (null when unknown). */
export function indicators(
  input: EconomicsInputs,
  period: Period,
  quote: number | null,
  todayIso: string
): Indicators {
  const { animals, manejoSessions, movements, treatments, expenses, invernadas } = input;

  const startHeads = herdArrobasAt(animals, manejoSessions, addDays(period.start, -1)).heads;
  const endHeads = herdArrobasAt(animals, manejoSessions, closingDate(period, todayIso)).heads;
  const heads = { start: startHeads, end: endHeads, avg: (startHeads + endHeads) / 2 };
  const hectares = invernadas.reduce((sum, i) => sum + i.hectares, 0);

  const revenue = periodRevenue(expenses, movements, period);
  const cost = coe(expenses, treatments, period);
  const result = revenue.total - cost;
  const produced = arrobasProduced(input, period, todayIso);
  const unitCost = costPerArroba(cost, produced.produced);
  const herdArrobas = kgToArroba(totalWeightKg(activeAnimals(animals)));
  const value = quote === null ? null : herdValue(herdArrobas, quote);
  const calfPrice = averageCalfPrice(movements, period);
  const sold: SoldArrobas = {
    arrobas: produced.sold,
    heads: produced.headsSold,
    unweighed: produced.unweighed,
  };

  return {
    period,
    system: farmSystem(input, period),
    heads,
    hectares,
    revenue: revenue.total,
    salesRevenue: revenue.sales,
    otherRevenue: revenue.other,
    coe: cost,
    result,
    resultPerHa: hectares > 0 ? result / hectares : null,
    marginPct: revenue.total > 0 ? (result / revenue.total) * 100 : null,
    costToRevenuePct: revenue.total > 0 ? (cost / revenue.total) * 100 : null,
    capitalTurnover: value ? annualise(revenue.total, period) / value : null,
    produced,
    arrobasPerHa:
      hectares > 0 && produced.produced > 0
        ? annualise(produced.produced, period) / hectares
        : null,
    costPerArroba: unitCost,
    realizedPerArroba: produced.sold > 0 ? revenue.sales / produced.sold : null,
    marginPerArroba: quote !== null && unitCost !== null ? quote - unitCost : null,
    outlayPerHeadMonth: outlayPerHeadMonth(cost, heads.avg, period),
    adg: periodAdg(animals, period),
    offtakePct: offtakeRate(produced.headsSold, heads.avg, period),
    stocking: hectares > 0 ? herdStockingRateAuPerHa(animals, invernadas) : null,
    calfPrice,
    exchange: exchangeRatio(sold, quote, calfPrice),
    herdArrobas,
    herdValue: value,
    inventoryDeltaBrl: quote === null ? null : produced.delta * quote,
  };
}

/** Indicators the Placar shows a change for, against the prior window. */
export type DeltaKey =
  | "result"
  | "costPerArroba"
  | "arrobasPerHa"
  | "outlayPerHeadMonth"
  | "adg"
  | "offtakePct"
  | "stocking"
  | "exchange";

/** The figure each delta compares. */
const deltaValue = (ind: Indicators, key: DeltaKey): number | null => {
  if (key === "adg") return ind.adg.kgPerDay;
  if (key === "exchange") return ind.exchange.calvesPerSteer;
  return ind[key];
};

/**
 * Change of each Placar figure against the prior window: `pct` relative to
 * the prior's magnitude, `pts` the plain difference (percentage points for
 * the % figures). Both null when either side has no data or the prior is 0.
 */
export function indicatorDeltas(
  current: Indicators,
  prior: Indicators
): Record<DeltaKey, { pct: number | null; pts: number | null }> {
  const keys: DeltaKey[] = [
    "result",
    "costPerArroba",
    "arrobasPerHa",
    "outlayPerHeadMonth",
    "adg",
    "offtakePct",
    "stocking",
    "exchange",
  ];
  const deltas = {} as Record<DeltaKey, { pct: number | null; pts: number | null }>;
  for (const key of keys) {
    const cur = deltaValue(current, key);
    const pre = deltaValue(prior, key);
    deltas[key] =
      cur === null || pre === null || pre === 0
        ? { pct: null, pts: null }
        : { pct: ((cur - pre) / Math.abs(pre)) * 100, pts: cur - pre };
  }
  return deltas;
}
```

- [ ] **Step 4: Run** `pnpm vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/finance.test.ts lib/domain/__tests__/adg.test.ts`
Expected: PASS, all three files.
Then `pnpm tsc --noEmit` — expected clean except `app/(app)/finance/page.tsx` (imports the removed `annualRevenue`, `arrobasProducedPerYear`, `averageArrobasPerSteer`, `capitalTurnoverRatio`, `dailyCostPerHead`, `headSoldLast12m`, `productionCostPerArroba`, `productivityPerHa`, `steerToCalfExchange`, `totalCostLast12m`, and calls `averageCalfPrice`/`offtakeRate` with the old arguments). Task 9 rewrites that page; nothing else may error.
Also `pnpm exec eslint lib/domain/economics.ts lib/domain/adg.ts lib/domain/finance.ts lib/domain/__tests__/economics.test.ts lib/domain/__tests__/finance.test.ts lib/domain/__tests__/adg.test.ts` — expected clean.

- [ ] **Step 5: Commit**
```bash
cd /home/luketa/meubov
git add lib/domain/economics.ts lib/domain/adg.ts lib/domain/finance.ts lib/domain/__tests__/economics.test.ts lib/domain/__tests__/finance.test.ts lib/domain/__tests__/adg.test.ts
git commit -m "feat(finance): compute the placar over the window from manejos and weighings"
```
No trailers.

---

### Task 5: Custo por lote (`lotEconomics`)

> **Order:** runs after Task 4. It reuses `coe`, `arrobasProduced`, `costPerArroba` and `EconomicsInputs` from `lib/domain/economics.ts`, and `periodAdg`, which Task 4 adds to `lib/domain/adg.ts` because `indicators` needs it first. Needs Task 1 (`Expense.lotId`, `Expense.kind`) and Task 2 (`periodDays`, `inPeriod`).

**Files:**
- Create: `lib/domain/lotEconomics.ts`
- Test: `lib/domain/__tests__/lotEconomics.test.ts`
- Nothing else. No importer exists yet; Task 9 (`LotsEconomicsCard`) and Task 12 (`lotsEconomicsExportTable`) consume it.

**Interfaces:**
- Consumes: `EconomicsInputs`, `coe(expenses, treatments, period)`, `arrobasProduced(input, period, todayIso)`, `costPerArroba(coeBrl, produced)` from `lib/domain/economics.ts` (Task 4); `periodAdg(animals, period)` from `lib/domain/adg.ts` (Task 4); `periodDays`, `inPeriod` from `lib/domain/period.ts` (Task 2); `type Period` from `lib/domain/finance.ts`.
- Produces (exact):
```ts
export interface LotEconomics {
  lotId: string | null; name: string; heads: number;
  directBrl: number; sharedBrl: number; totalBrl: number;
  perHeadDay: number | null; adg: number | null; produced: number | null;
  costPerArroba: number | null; marginPerArroba: number | null;
}
export function lotEconomics(
  input: EconomicsInputs, period: Period, quote: number | null, todayIso: string
): { lots: LotEconomics[]; farm: LotEconomics };
```

Rules, as implemented:
- A lote's animals are the animals whose `lotId` is the lote **today**, sold ones included (a sold animal keeps its `lotId`); heads = the active ones.
- Direct = despesas (`kind` expense) with that `lotId` dated in the window + done treatments with cost in the window whose animal (by ear tag) is in the lote. Direct cost of a deleted or unknown lote joins the shared pool, so the rows always add up to the farm's COE.
- Shared = (COE − Σ direct of the listed lotes) × heads ÷ Σ heads; 0 when Σ heads is 0.
- @ produzidas per lote = `arrobasProduced` over the lote's animals, with every session narrowed to those animals: sold from it − bought into it + their inventory change. One reading of the contract: "bought into the lote" is the entry passes of the lote's current animals rather than `destinationLotId`, so a bought animal moved to another lote is subtracted where its weight now counts. The two agree whenever the bought animal is still in the lote it entered.
- Listed: lotes without `deletedAt` with ≥ 1 head or any direct cost, by name (pt-BR). The `farm` row ("Fazenda") carries Σ heads, Σ direct, Σ shared, total = COE, the whole herd's ADG and @ produzidas.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/__tests__/lotEconomics.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { lotEconomics } from "@/lib/domain/lotEconomics";
import { coe, type EconomicsInputs } from "@/lib/domain/economics";
import type { Animal, Expense, ManejoSession, ManejoSessionAnimal, Treatment } from "@/lib/types";
import { makeAnimal, makeManejoSession, makeTreatment } from "./fixtures";

const TODAY = "2026-07-24";
/** January to June 2026: 181 days. */
const P = { start: "2026-01-01", end: "2026-06-30" };
const DAYS = 181;
const QUOTE = 300;

const animal = (earTag: string, lotId: string, partial: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `animal-${earTag}`, earTag, lotId, birthDate: "2024-01-10", ...partial });

const pass = (
  earTag: string,
  weightKg?: number,
  partial: Partial<ManejoSessionAnimal> = {}
): ManejoSessionAnimal => ({ earTag, outcome: "done", weightKg, ...partial });

const expense = (partial: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-02-01",
  category: "nutrition",
  amountBrl: 0,
  ...partial,
});

const cost = (earTag: string, costBrl: number, partial: Partial<Treatment> = {}): Treatment =>
  makeTreatment({
    id: `t-${earTag}`,
    animalEarTag: earTag,
    date: "2026-03-01",
    status: "done",
    costBrl,
    ...partial,
  });

/** Each animal's live arrobas at 2025-12-31 → 2026-06-30 in the comment. */
const animals: Animal[] = [
  // Lote A: three here today and one sold from it.
  animal("A1", "lot-a", {
    weighings: [
      { date: "2025-12-01", weightKg: 300 }, // 10 @
      { date: "2026-01-15", weightKg: 315 },
      { date: "2026-05-01", weightKg: 360 }, // 12 @
    ],
  }),
  animal("A2", "lot-a", {
    weighings: [
      { date: "2025-12-01", weightKg: 330 }, // 11 @
      { date: "2026-05-01", weightKg: 390 }, // 13 @
    ],
  }),
  animal("A3", "lot-a"),
  animal("AS", "lot-a", {
    active: false,
    inactiveReason: "sale",
    inactiveDate: "2026-04-10",
    weighings: [{ date: "2025-12-01", weightKg: 450 }], // 15 @ → sold at 480 kg: 16 @ carcass
  }),
  // Lote B: one of its own and one bought into it.
  animal("B1", "lot-b", {
    weighings: [
      { date: "2025-12-01", weightKg: 240 }, // 8 @
      { date: "2026-06-01", weightKg: 300 }, // 10 @
    ],
  }),
  animal("B2", "lot-b", {
    weighings: [
      { date: "2026-03-01", weightKg: 210 }, // bought: 7 @
      { date: "2026-06-01", weightKg: 270 }, // 9 @
    ],
  }),
];

const sessions: ManejoSession[] = [
  makeManejoSession({
    id: "sale-1",
    name: "Venda",
    date: "2026-04-10",
    status: "closed",
    kind: "sale",
    weighing: true,
    pricePerArroba: QUOTE,
    carcassYieldPct: 50,
    animals: [pass("AS", 480)],
  }),
  makeManejoSession({
    id: "entry-1",
    name: "Compra",
    date: "2026-03-01",
    status: "closed",
    kind: "entry",
    weighing: true,
    destinationLotId: "lot-b",
    animals: [pass("B2", 210, { createdAnimal: true })],
  }),
];

const expenses: Expense[] = [
  expense({ id: "e-a", lotId: "lot-a", amountBrl: 1000 }),
  // Without a lote: shared 60/40 by the heads of A (3) and B (2).
  expense({ id: "e-farm", category: "labor", amountBrl: 2000 }),
  // Lote C has no animals but a direct cost: still listed.
  expense({ id: "e-c", lotId: "lot-c", category: "pasture", amountBrl: 300 }),
  // A receita with a lote is not a cost.
  expense({ id: "e-rev", kind: "revenue", category: "other", lotId: "lot-a", amountBrl: 5000 }),
  // Outside the window.
  expense({ id: "e-old", lotId: "lot-a", date: "2025-12-20", amountBrl: 700 }),
];

const treatments: Treatment[] = [
  cost("A1", 40),
  cost("B1", 60),
  cost("B2", 99, { id: "t-B2-scheduled", status: "scheduled" }),
];

const input: EconomicsInputs = {
  animals,
  manejoSessions: sessions,
  movements: [],
  treatments,
  expenses,
  invernadas: [],
  lots: [
    { id: "lot-b", name: "Lote B" },
    { id: "lot-a", name: "Lote A" },
    { id: "lot-c", name: "Lote C" },
    { id: "lot-d", name: "Lote D", deletedAt: "2026-02-01T10:00:00.000Z" },
    { id: "lot-e", name: "Lote E" },
  ],
};

describe("lotEconomics", () => {
  const { lots, farm } = lotEconomics(input, P, QUOTE, TODAY);
  const byName = (name: string) => lots.find((l) => l.name === name)!;

  it("lists the live lotes with heads or direct cost, by name", () => {
    expect(lots.map((l) => l.name)).toEqual(["Lote A", "Lote B", "Lote C"]);
  });

  it("splits direct and shared cost", () => {
    // A: 1000 + A1's 40; B: B1's 60; C: 300. Shared pool 2000 → 3/5 and 2/5.
    expect(byName("Lote A")).toMatchObject({ lotId: "lot-a", heads: 3, directBrl: 1040, sharedBrl: 1200, totalBrl: 2240 });
    expect(byName("Lote B")).toMatchObject({ lotId: "lot-b", heads: 2, directBrl: 60, sharedBrl: 800, totalBrl: 860 });
    expect(byName("Lote C")).toMatchObject({ lotId: "lot-c", heads: 0, directBrl: 300, sharedBrl: 0, totalBrl: 300 });
  });

  it("gives R$/cab/dia, ADG, @ produzidas and custo/@ per lote", () => {
    const a = byName("Lote A");
    expect(a.perHeadDay).toBeCloseTo(2240 / 3 / DAYS, 6);
    // A1: 315 → 360 kg in 106 days; A2 has one weighing inside.
    expect(a.adg).toBeCloseTo(45 / 106, 6);
    // sold 16 − bought 0 + (12 + 13) − (10 + 11 + 15) = 5
    expect(a.produced).toBeCloseTo(5, 6);
    expect(a.costPerArroba).toBeCloseTo(448, 6);
    expect(a.marginPerArroba).toBeCloseTo(-148, 6);

    const b = byName("Lote B");
    expect(b.perHeadDay).toBeCloseTo(860 / 2 / DAYS, 6);
    // B2: 210 → 270 kg in 92 days.
    expect(b.adg).toBeCloseTo(60 / 92, 6);
    // sold 0 − bought 7 + (10 + 9) − 8 = 4
    expect(b.produced).toBeCloseTo(4, 6);
    expect(b.costPerArroba).toBeCloseTo(215, 6);
    expect(b.marginPerArroba).toBeCloseTo(85, 6);

    const c = byName("Lote C");
    expect(c.perHeadDay).toBeNull();
    expect(c.adg).toBeNull();
    expect(c.produced).toBe(0);
    expect(c.costPerArroba).toBeNull();
    expect(c.marginPerArroba).toBeNull();
  });

  it("closes on a Fazenda row whose total is the COE", () => {
    const total = coe(expenses, treatments, P);
    expect(total).toBe(3400);
    expect(farm).toMatchObject({
      lotId: null,
      name: "Fazenda",
      heads: 5,
      directBrl: 1400,
      sharedBrl: 2000,
      totalBrl: total,
    });
    expect(lots.reduce((sum, l) => sum + l.totalBrl, 0)).toBeCloseTo(total, 6);
    expect(farm.perHeadDay).toBeCloseTo(3400 / 5 / DAYS, 6);
    expect(farm.adg).toBeCloseTo((45 / 106 + 60 / 92) / 2, 6);
    // 16 sold − 7 bought + (44 − 44) = 9 = A 5 + B 4.
    expect(farm.produced).toBeCloseTo(9, 6);
    expect(farm.costPerArroba).toBeCloseTo(3400 / 9, 6);
    expect(farm.marginPerArroba).toBeCloseTo(QUOTE - 3400 / 9, 6);
  });

  it("leaves margin null without a quote and shares nothing without heads", () => {
    expect(lotEconomics(input, P, null, TODAY).farm.marginPerArroba).toBeNull();
    const noHerd = lotEconomics({ ...input, animals: [], treatments: [] }, P, QUOTE, TODAY);
    expect(noHerd.lots.map((l) => [l.name, l.sharedBrl])).toEqual([
      ["Lote A", 0],
      ["Lote C", 0],
    ]);
    expect(noHerd.farm).toMatchObject({ heads: 0, totalBrl: 3300, perHeadDay: null });
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run lib/domain/__tests__/lotEconomics.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/lotEconomics"`.

- [ ] **Step 3: Implement**

Create `lib/domain/lotEconomics.ts`:
```ts
/**
 * Custo por lote (Financeiro's "Por lote" table): each lote's direct cost,
 * its share of the farm's cost, R$/cab/dia, ADG and custo da @ produzida,
 * closing on a "Fazenda" row whose total is the window's COE.
 */
import type { Animal, ManejoSession } from "@/lib/types";
import type { Period } from "@/lib/domain/finance";
import { inPeriod, periodDays } from "@/lib/domain/period";
import { periodAdg } from "@/lib/domain/adg";
import {
  arrobasProduced,
  coe,
  costPerArroba,
  type EconomicsInputs,
} from "@/lib/domain/economics";

/** One row of the table; `lotId` null is the Fazenda row. */
export interface LotEconomics {
  lotId: string | null;
  name: string;
  /** Active animals in the lote today. */
  heads: number;
  /** Lançamentos with the lote + treatments of its animals. */
  directBrl: number;
  /** The lote's share, by heads, of the COE no lote carries. */
  sharedBrl: number;
  totalBrl: number;
  perHeadDay: number | null;
  adg: number | null;
  produced: number | null;
  costPerArroba: number | null;
  marginPerArroba: number | null;
}

/** The sessions as they touched only these animals. */
function narrowSessions(sessions: ManejoSession[], members: Animal[]): ManejoSession[] {
  const earTags = new Set(members.map((a) => a.earTag));
  return sessions.map((s) => ({ ...s, animals: s.animals.filter((e) => earTags.has(e.earTag)) }));
}

export function lotEconomics(
  input: EconomicsInputs,
  period: Period,
  quote: number | null,
  todayIso: string
): { lots: LotEconomics[]; farm: LotEconomics } {
  const { animals, manejoSessions, expenses, treatments } = input;
  const days = periodDays(period);

  const direct = new Map<string, number>();
  const addDirect = (lotId: string | undefined, amount: number): void => {
    if (lotId !== undefined) direct.set(lotId, (direct.get(lotId) ?? 0) + amount);
  };
  for (const e of expenses) {
    if (e.kind !== "revenue" && inPeriod(e.date, period)) addDirect(e.lotId, e.amountBrl);
  }
  const lotOf = new Map(animals.map((a) => [a.earTag, a.lotId]));
  for (const t of treatments) {
    if (t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)) {
      addDirect(lotOf.get(t.animalEarTag), t.costBrl);
    }
  }

  // ponytail: lot membership is today's; animal-days when asked
  const rows = input.lots
    .filter((lot) => !lot.deletedAt)
    .map((lot) => {
      const members = animals.filter((a) => a.lotId === lot.id);
      return {
        lot,
        members,
        heads: members.filter((a) => a.active).length,
        directBrl: direct.get(lot.id) ?? 0,
      };
    })
    .filter((r) => r.heads > 0 || r.directBrl > 0)
    .sort((a, b) => a.lot.name.localeCompare(b.lot.name, "pt-BR"));

  const totalCost = coe(expenses, treatments, period);
  const totalHeads = rows.reduce((sum, r) => sum + r.heads, 0);
  const totalDirect = rows.reduce((sum, r) => sum + r.directBrl, 0);
  const pool = totalCost - totalDirect;

  const row = (
    lotId: string | null,
    name: string,
    heads: number,
    directBrl: number,
    sharedBrl: number,
    adg: number | null,
    produced: number
  ): LotEconomics => {
    const totalBrl = directBrl + sharedBrl;
    const unitCost = costPerArroba(totalBrl, produced);
    return {
      lotId,
      name,
      heads,
      directBrl,
      sharedBrl,
      totalBrl,
      perHeadDay: heads > 0 ? totalBrl / heads / days : null,
      adg,
      produced,
      costPerArroba: unitCost,
      marginPerArroba: quote !== null && unitCost !== null ? quote - unitCost : null,
    };
  };

  const lots = rows.map((r) =>
    row(
      r.lot.id,
      r.lot.name,
      r.heads,
      r.directBrl,
      totalHeads > 0 ? (pool * r.heads) / totalHeads : 0,
      periodAdg(r.members, period).kgPerDay,
      arrobasProduced(
        { ...input, animals: r.members, manejoSessions: narrowSessions(manejoSessions, r.members) },
        period,
        todayIso
      ).produced
    )
  );

  const farm = row(
    null,
    "Fazenda",
    totalHeads,
    totalDirect,
    totalCost - totalDirect,
    periodAdg(animals, period).kgPerDay,
    arrobasProduced(input, period, todayIso).produced
  );

  return { lots, farm };
}
```

Notes on the test numbers: Lote C has no animals, so its @ produzidas is 0 and custo/@ is null. In the "no herd" case the treatments are dropped too, so COE is 1000 + 2000 + 300 = 3300, Lote B has neither heads nor direct cost and drops out, and the pool of 2000 stays on the Fazenda row only (Σ heads 0). The farm total stays equal to the COE because the farm's shared figure is `COE − Σ direct` even when no lote has heads.

- [ ] **Step 4: Run** `pnpm vitest run lib/domain/__tests__/lotEconomics.test.ts`
Expected: PASS.
Then `pnpm tsc --noEmit` — expected clean except `app/(app)/finance/page.tsx`, which Task 9 rewrites (the error left by Task 4).
`pnpm exec eslint lib/domain/lotEconomics.ts lib/domain/__tests__/lotEconomics.test.ts` — expected clean (the test's `!` in `byName` is a non-null assertion. If the repo's lint rules refuse it, change `byName` to `lots.find(...) as LotEconomics` and import the type).

- [ ] **Step 5: Commit**
```bash
cd /home/luketa/meubov
git add lib/domain/lotEconomics.ts lib/domain/__tests__/lotEconomics.test.ts
git commit -m "feat(finance): cost, ADG and custo da @ per lote with the shared cost split by heads"
```
No trailers.

---

### Task 6: API — lançamentos PATCH, plano de contas, compra de sêmen

**Files:**
- Create:
  - `lib/api/domains/expenses/useCases/Update.useCase.ts`
  - `lib/api/domains/expenses/useCases/__tests__/Update.test.ts`
  - `lib/api/domains/accounts/accounts.controller.ts`
  - `lib/api/domains/accounts/schemas/account.schema.ts`
  - `lib/api/domains/accounts/useCases/Add.useCase.ts`
  - `lib/api/domains/accounts/useCases/Update.useCase.ts`
  - `lib/api/domains/accounts/useCases/SeedDefaults.useCase.ts`
  - `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`
  - `lib/api/domains/accounts/useCases/__tests__/Update.test.ts`
  - `lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts`
- Modify:
  - `lib/api/domains/expenses/schemas/expense.schema.ts` (whole file, 25 lines)
  - `lib/api/domains/expenses/useCases/Add.useCase.ts` (whole file, 33 lines)
  - `lib/api/domains/expenses/expenses.controller.ts` (whole file, 28 lines)
  - `lib/api/app.ts` (import at line 24, `.use(expensesController)` at line 75)
  - `lib/api/permissions/routeRequirements.ts` (lines 80–81)
  - `lib/api/__tests__/routeRequirements.test.ts` (after line 69, the end of the semen `it`)
  - `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap`, `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated with `-u`)
  - `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` (lines 2, 5, 35–47, 87–88)
  - `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` (lines 72–113)
  - `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts` (lines 38–43, 148–183), because `writeSemenPurchase` is shared with the first purchase of a new bull
- Test: the eight test files above, plus `routeRequirements.test.ts`

**Interfaces:**
- Consumes (from Task 1): `EntryKind = "expense" | "revenue"`, `AccountGroup = ExpenseCategory | "revenue"`, `Expense` with `kind: EntryKind` and optional `dueDate`, `paidAt`, `counterparty`, `document`, `accountId`, `lotId`, and `Account` (all from `@/lib/types`); `expenses` table with the columns `kind`, `dueDate`, `paidAt`, `counterparty`, `document`, `accountId`, `lotId`; `accounts` table (`id`, `farmId`, `group`, `name`, `archivedAt` timestamp) and `FarmAccountRow` (from `@/lib/db/schema`); `toExpense`, `toAccount` (from `@/lib/api/mappers`). The tests assume `toExpense` returns `kind` always and leaves a null optional out, as `orNothing` does today. From Task 2: `DEFAULT_ACCOUNTS: readonly { group: AccountGroup; name: string }[]` from `@/lib/domain/accounts`.
- Produces:
  - `POST /api/herd/expenses`, body `NewExpenseBody`. Returns `Expense`, or 400 `{ error: "due_before_date" }`.
  - `PATCH /api/herd/expenses/:id`, body `UpdateExpenseBody`. Returns `Expense`, 404 `{ error: "not_found" }`, or 400 `{ error: "due_before_date" }`.
  - `POST /api/herd/accounts`, body `{ group: AccountGroup; name: string }`. Returns `Account`, or 409 `{ error: "duplicate_name" }`.
  - `PATCH /api/herd/accounts/:id`, body `{ name?: string; archived?: boolean }`. Returns `Account`, 404 `{ error: "not_found" }`, or 409 `{ error: "duplicate_name" }`.
  - `POST /api/herd/accounts/defaults`, no body. Returns `{ created: Account[] }`.
  - All four new routes require `edit("finance")`.

- [ ] **Step 1: Write the failing test for the expense PATCH**

`lib/api/domains/expenses/useCases/__tests__/Update.test.ts`:

```ts
/**
 * updateExpense: edits a lançamento of the farm. Only the fields sent change,
 * null clears an optional one, and the vencimento may not be before the data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => Promise.resolve(state.updateResults.shift() ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, update: updateBuilder } }));

import type { Expense } from "@/lib/types";

import { UpdateExpenseUseCase } from "../Update.useCase";

const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 500,
  notes: null,
  dueDate: "2026-09-20",
  paidAt: null,
  counterparty: "Agro Sul",
  document: "NF 4.812",
  accountId: "acc-1",
  lotId: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
});

describe("updateExpense", () => {
  it("marks a lançamento as paid", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, paidAt: "2026-09-24" }]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { paidAt: "2026-09-24" },
    });

    expect(state.updates).toEqual([{ paidAt: "2026-09-24" }]);
    expect(result).toMatchObject({ id: "e-1", kind: "expense", paidAt: "2026-09-24" });
  });

  it("clears an optional field sent as null", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, counterparty: null, dueDate: null }]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { counterparty: null, dueDate: null },
    });

    expect(state.updates).toEqual([{ counterparty: null, dueDate: null }]);
    // toExpense maps a null column to undefined (orNothing), so the key is there but empty.
    const cleared = result as Expense;
    expect(cleared.counterparty).toBeUndefined();
    expect(cleared.dueDate).toBeUndefined();
  });

  it("refuses a vencimento before the data", async () => {
    state.selectResults = [[ROW]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { dueDate: "2026-09-01" },
    });

    expect(result).toBe("due_before_date");
    expect(state.updates).toEqual([]);
  });

  it("refuses a new data after the stored vencimento", async () => {
    state.selectResults = [[ROW]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { date: "2026-09-30" },
    });

    expect(result).toBe("due_before_date");
    expect(state.updates).toEqual([]);
  });

  it("answers null for a lançamento of another farm", async () => {
    state.selectResults = [[]];

    const result = await new UpdateExpenseUseCase().run({
      farmId: 8,
      id: "e-1",
      patch: { paidAt: "2026-09-24" },
    });

    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});
```

Run: `npx vitest run lib/api/domains/expenses`
Expected: FAIL, `Failed to resolve import "../Update.useCase"`.

- [ ] **Step 2: Extend the expense schemas**

Replace all of `lib/api/domains/expenses/schemas/expense.schema.ts`:

```ts
/** Request schemas for the farm's lançamentos (despesas and receitas typed by hand). */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";

export const ExpenseCategoryModel = t.Union([
  t.Literal("nutrition"),
  t.Literal("pasture"),
  t.Literal("labor"),
  t.Literal("health"),
  t.Literal("breeding"),
  t.Literal("admin"),
  t.Literal("other"),
]);

export const EntryKindModel = t.Union([t.Literal("expense"), t.Literal("revenue")]);

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/** Body of POST /expenses. A receita sends `kind: "revenue"` and `category: "other"`. */
export const NewExpenseBody = t.Object({
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String()),
  kind: t.Optional(EntryKindModel),
  dueDate: t.Optional(DateString),
  paidAt: t.Optional(DateString),
  counterparty: t.Optional(Counterparty),
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
});

/**
 * Body of PATCH /expenses/:id. Absent leaves a field as it is; null clears the
 * optional ones (`paidAt: null` makes the lançamento pending again).
 */
export const UpdateExpenseBody = t.Object({
  date: t.Optional(DateString),
  category: t.Optional(ExpenseCategoryModel),
  amountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  kind: t.Optional(EntryKindModel),
  notes: t.Optional(t.Nullable(t.String())),
  dueDate: t.Optional(t.Nullable(DateString)),
  paidAt: t.Optional(t.Nullable(DateString)),
  counterparty: t.Optional(t.Nullable(Counterparty)),
  document: t.Optional(t.Nullable(Document)),
  accountId: t.Optional(t.Nullable(t.String())),
  lotId: t.Optional(t.Nullable(t.String())),
});
```

- [ ] **Step 3: Write the new columns on insert**

Replace all of `lib/api/domains/expenses/useCases/Add.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & {
  farmId: number;
  /** Defaults to a despesa. */
  kind?: EntryKind;
};

/** `due_before_date` when the vencimento is earlier than the data. */
type AddExpenseUseCaseResponse = Expense | "due_before_date";

type CurrUseCase = _UseCase<AddExpenseUseCaseProps, AddExpenseUseCaseResponse>;

/** Registers a lançamento and returns it with its server-generated id. */
export class AddExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({
    farmId,
    kind = "expense",
    date,
    category,
    amountBrl,
    notes,
    dueDate,
    paidAt,
    counterparty,
    document,
    accountId,
    lotId,
  }) => {
    if (dueDate !== undefined && dueDate < date) return "due_before_date";
    // ponytail: accountId/lotId are not checked against the farm; the FK only proves they exist.
    const [row] = await this.repository
      .insert(expenses)
      .values({
        id: randomUUID(),
        farmId,
        kind,
        date,
        category,
        amountBrl,
        notes,
        dueDate: dueDate ?? null,
        paidAt: paidAt ?? null,
        counterparty: counterparty ?? null,
        document: document ?? null,
        accountId: accountId ?? null,
        lotId: lotId ?? null,
      })
      .returning();
    return toExpense(row);
  };
}
```

- [ ] **Step 4: Write the update use case**

`lib/api/domains/expenses/useCases/Update.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense, ExpenseCategory } from "@/lib/types";

/** Editable fields of a lançamento; absent leaves a field, null clears it. */
export interface ExpensePatchInput {
  date?: string;
  category?: ExpenseCategory;
  amountBrl?: number;
  kind?: EntryKind;
  notes?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  counterparty?: string | null;
  document?: string | null;
  accountId?: string | null;
  lotId?: string | null;
}

interface UpdateExpenseUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse = Expense | "due_before_date" | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

/**
 * Edits a lançamento of the farm ("Editar", "Marcar como pago"). The vencimento
 * is checked against the data the row will have after the patch.
 */
export class UpdateExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
    const [current] = await this.repository.select().from(expenses).where(scope).limit(1);
    if (!current) return null;

    const date = patch.date ?? current.date;
    const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
    if (dueDate !== null && dueDate < date) return "due_before_date";

    // The body's keys are the columns' names; Drizzle skips an undefined value.
    if (Object.keys(patch).length === 0) return toExpense(current);
    const [row] = await this.repository.update(expenses).set(patch).where(scope).returning();
    return row ? toExpense(row) : null;
  };
}
```

Run: `npx vitest run lib/api/domains/expenses`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add PATCH to the expenses controller**

Replace all of `lib/api/domains/expenses/expenses.controller.ts`:

```ts
/**
 * Farm lançamentos — the despesas that do not arrive through a sanitary
 * treatment and the receitas that do not come from a venda, with their
 * vencimento, pagamento, conta and lote.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { UpdateExpenseUseCase } from "./useCases/Update.useCase";
import { NewExpenseBody, UpdateExpenseBody } from "./schemas/expense.schema";

export const expensesController = new Elysia({ prefix: "/expenses" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddExpenseUseCase().run({ farmId, ...body });
      if (result === "due_before_date") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewExpenseBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateExpenseUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "due_before_date") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateExpenseBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteExpenseUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  );
```

- [ ] **Step 6: Write the failing tests for the accounts use cases**

`lib/api/domains/accounts/useCases/__tests__/Add.test.ts`:

```ts
/**
 * addAccount: creates a conta inside a grupo. The name is trimmed and unique
 * per farm and grupo regardless of case, archived contas included.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows and record their condition, inserts record the row and
 * echo it, or reject with a queued error.
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Condition of every `select().where()` call. */
    wheres: [] as unknown[],
    /** Every `insert().values()` row that landed. */
    inserts: [] as Record<string, unknown>[],
    /** Error the next insert rejects with. */
    insertError: null as unknown,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: (condition: unknown) => {
      state.wheres.push(condition);
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function insertBuilder() {
  return {
    values: (row: Record<string, unknown>) => ({
      returning: () => {
        if (state.insertError) {
          const error = state.insertError;
          state.insertError = null;
          return Promise.reject(error);
        }
        state.inserts.push(row);
        return Promise.resolve([{ archivedAt: null, ...row }]);
      },
    }),
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { AddAccountUseCase } from "../Add.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
  state.insertError = null;
});

describe("addAccount", () => {
  it("trims the name and creates the conta", async () => {
    state.selectResults = [[]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "nutrition",
      name: "  Sal mineral ",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ farmId: 7, group: "nutrition", name: "Sal mineral" });
    expect(result).toMatchObject({ id: state.inserts[0].id, group: "nutrition", name: "Sal mineral" });
  });

  it("answers duplicate when the grupo has the name in another case", async () => {
    state.selectResults = [[{ id: "acc-1" }]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "nutrition",
      name: " SAL MINERAL ",
    });

    expect(result).toBe("duplicate");
    expect(state.inserts).toEqual([]);
    const query = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(query.sql).toContain('lower("accounts"."name") = lower(');
    expect(query.params).toContain("SAL MINERAL");
  });

  it("answers duplicate when a concurrent insert wins the unique index", async () => {
    state.selectResults = [[]];
    state.insertError = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "revenue",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });
});
```

`lib/api/domains/accounts/useCases/__tests__/Update.test.ts`:

```ts
/**
 * updateAccount: renames a conta (unique per farm and grupo regardless of
 * case) or archives and restores it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, updates record the columns set and answer from their own
 * queue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows each `update().returning()` resolves to, in call order. */
    updateResults: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function updateBuilder() {
  const builder = {
    set(columns: Record<string, unknown>) {
      state.updates.push(columns);
      return builder;
    },
    where: () => builder,
    returning: () => Promise.resolve(state.updateResults.shift() ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, update: updateBuilder } }));

import { UpdateAccountUseCase } from "../Update.useCase";

const ACCOUNT = { id: "acc-1", farmId: 7, group: "nutrition", name: "Sal mineral", archivedAt: null };

beforeEach(() => {
  state.selectResults = [];
  state.updateResults = [];
  state.updates = [];
});

describe("updateAccount", () => {
  it("archives a conta", async () => {
    state.selectResults = [[ACCOUNT]];
    state.updateResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-24T12:00:00Z") }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ id: "acc-1", name: "Sal mineral" });
  });

  it("restores an archived conta", async () => {
    state.selectResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-01T12:00:00Z") }]];
    state.updateResults = [[ACCOUNT]];

    await new UpdateAccountUseCase().run({ farmId: 7, id: "acc-1", patch: { archived: false } });

    expect(state.updates).toEqual([{ archivedAt: null }]);
  });

  it("renames, trimmed", async () => {
    state.selectResults = [[ACCOUNT], []];
    state.updateResults = [[{ ...ACCOUNT, name: "Sal proteinado" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: " Sal proteinado " },
    });

    expect(state.updates).toEqual([{ name: "Sal proteinado" }]);
    expect(result).toMatchObject({ name: "Sal proteinado" });
  });

  it("answers duplicate when another conta of the grupo has the name", async () => {
    state.selectResults = [[ACCOUNT], [{ id: "acc-2" }]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 7,
      id: "acc-1",
      patch: { name: "RAÇÃO E SUPLEMENTO" },
    });

    expect(result).toBe("duplicate");
    expect(state.updates).toEqual([]);
  });

  it("answers null for a conta of another farm", async () => {
    state.selectResults = [[]];

    const result = await new UpdateAccountUseCase().run({
      farmId: 8,
      id: "acc-1",
      patch: { archived: true },
    });

    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});
```

`lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts`:

```ts
/**
 * seedDefaultAccounts ("Sugerir contas padrão"): creates the standard contas
 * the farm does not have yet, comparing names per grupo regardless of case.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the rows and echo them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

function insertBuilder() {
  return {
    values: (rows: Record<string, unknown>[]) => {
      state.inserts.push(rows);
      const echoed = rows.map((row) => ({ archivedAt: null, ...row }));
      const chain = {
        onConflictDoNothing: () => chain,
        returning: () => Promise.resolve(echoed),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";

import { SeedDefaultAccountsUseCase } from "../SeedDefaults.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("seedDefaultAccounts", () => {
  it("skips the names the farm already has, case-insensitively", async () => {
    state.selectResults = [
      [
        { group: "nutrition", name: "SAL MINERAL" },
        { group: "revenue", name: "aluguel de pasto" },
        // Same name in another grupo does not count.
        { group: "admin", name: "Sêmen" },
      ],
    ];

    const result = await new SeedDefaultAccountsUseCase().run({ farmId: 7 });

    expect(state.inserts).toHaveLength(1);
    const names = state.inserts[0].map((row) => `${row.group}:${row.name}`);
    expect(names).not.toContain("nutrition:Sal mineral");
    expect(names).not.toContain("revenue:Aluguel de pasto");
    expect(names).toContain("breeding:Sêmen");
    expect(names).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
    expect(state.inserts[0].every((row) => row.farmId === 7)).toBe(true);
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
  });

  it("writes nothing when every default exists", async () => {
    state.selectResults = [DEFAULT_ACCOUNTS.map(({ group, name }) => ({ group, name }))];

    const result = await new SeedDefaultAccountsUseCase().run({ farmId: 7 });

    expect(state.inserts).toEqual([]);
    expect(result).toEqual({ created: [] });
  });
});
```

Run: `npx vitest run lib/api/domains/accounts`
Expected: FAIL, 3 files, `Failed to resolve import "../Add.useCase"` (and `../Update.useCase`, `../SeedDefaults.useCase`).

- [ ] **Step 7: Write the accounts schema**

`lib/api/domains/accounts/schemas/account.schema.ts`:

```ts
/** Request schemas for the plano de contas: farm-named contas inside the fixed grupos. */

import { t } from "elysia";

import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** The seven despesa grupos plus "revenue" (Receitas). */
export const AccountGroupModel = t.Union([ExpenseCategoryModel, t.Literal("revenue")]);

const AccountName = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });

/** Body of POST /accounts. */
export const NewAccountBody = t.Object({
  group: AccountGroupModel,
  name: AccountName,
});

/** Body of PATCH /accounts/:id. `archived` true archives, false restores. */
export const UpdateAccountBody = t.Object({
  name: t.Optional(AccountName),
  archived: t.Optional(t.Boolean()),
});
```

- [ ] **Step 8: Write the Add use case**

`lib/api/domains/accounts/useCases/Add.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account, AccountGroup } from "@/lib/types";

interface AddAccountUseCaseProps {
  farmId: number;
  group: AccountGroup;
  name: string;
}

/** `duplicate` when the grupo already has the name, archived contas included. */
type AddAccountUseCaseResponse = Account | "duplicate";

type CurrUseCase = _UseCase<AddAccountUseCaseProps, AddAccountUseCaseResponse>;

/**
 * Creates a conta in a grupo. The name is compared without case first; the
 * unique index on lower(name) catches a concurrent insert of the same name.
 */
export class AddAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, group, name }) => {
    const trimmed = name.trim();
    const [clash] = await this.repository
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.farmId, farmId),
          eq(accounts.group, group),
          sql`lower(${accounts.name}) = lower(${trimmed})`
        )
      )
      .limit(1);
    if (clash) return "duplicate";

    try {
      const [row] = await this.repository
        .insert(accounts)
        .values({ id: randomUUID(), farmId, group, name: trimmed })
        .returning();
      return toAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

- [ ] **Step 9: Write the Update use case**

`lib/api/domains/accounts/useCases/Update.useCase.ts`:

```ts
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

/** Absent leaves a field as it is. */
export interface AccountPatchInput {
  name?: string;
  /** True archives the conta, false restores it. */
  archived?: boolean;
}

interface UpdateAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: AccountPatchInput;
}

/** Null when the conta is not on this farm. */
type UpdateAccountUseCaseResponse = Account | "duplicate" | null;

type CurrUseCase = _UseCase<UpdateAccountUseCaseProps, UpdateAccountUseCaseResponse>;

/**
 * Renames a conta (the history follows, since lançamentos point at its id) or
 * archives and restores it. A conta is never deleted.
 */
export class UpdateAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(accounts.farmId, farmId), eq(accounts.id, id));
    const [current] = await this.repository.select().from(accounts).where(scope).limit(1);
    if (!current) return null;

    const set: Partial<typeof accounts.$inferInsert> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      const [clash] = await this.repository
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.farmId, farmId),
            eq(accounts.group, current.group),
            ne(accounts.id, id),
            sql`lower(${accounts.name}) = lower(${name})`
          )
        )
        .limit(1);
      if (clash) return "duplicate";
      set.name = name;
    }
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) return toAccount(current);

    try {
      const [row] = await this.repository.update(accounts).set(set).where(scope).returning();
      return row ? toAccount(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

- [ ] **Step 10: Write the SeedDefaults use case**

`lib/api/domains/accounts/useCases/SeedDefaults.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { toAccount } from "@/lib/api/mappers";
import { DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

interface SeedDefaultAccountsUseCaseProps {
  farmId: number;
}

/** The contas this call created; empty when the farm had them all. */
type SeedDefaultAccountsUseCaseResponse = { created: Account[] };

type CurrUseCase = _UseCase<SeedDefaultAccountsUseCaseProps, SeedDefaultAccountsUseCaseResponse>;

/**
 * "Sugerir contas padrão": creates the standard contas whose name the grupo
 * does not have yet (case-insensitive, archived contas included). Running it
 * twice creates nothing the second time.
 */
export class SeedDefaultAccountsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SeedDefaultAccountsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId }) => {
    const existing = await this.repository
      .select({ group: accounts.group, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.farmId, farmId));
    const key = (group: string, name: string) => `${group}:${name.toLowerCase()}`;
    const taken = new Set(existing.map((account) => key(account.group, account.name)));
    const missing = DEFAULT_ACCOUNTS.filter((account) => !taken.has(key(account.group, account.name)));
    if (missing.length === 0) return { created: [] };

    // A concurrent seed or add of the same name is skipped by the unique index.
    const rows = await this.repository
      .insert(accounts)
      .values(missing.map(({ group, name }) => ({ id: randomUUID(), farmId, group, name })))
      .onConflictDoNothing()
      .returning();
    return { created: rows.map(toAccount) };
  };
}
```

Run: `npx vitest run lib/api/domains/accounts`
Expected: PASS, 3 files, 10 tests.

- [ ] **Step 11: Write the accounts controller**

`lib/api/domains/accounts/accounts.controller.ts`:

```ts
/**
 * Plano de contas — farm-named contas inside the seven fixed despesa grupos
 * and Receitas. A conta is archived, never deleted, so its lançamentos keep it.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddAccountUseCase } from "./useCases/Add.useCase";
import { SeedDefaultAccountsUseCase } from "./useCases/SeedDefaults.useCase";
import { UpdateAccountUseCase } from "./useCases/Update.useCase";
import { NewAccountBody, UpdateAccountBody } from "./schemas/account.schema";

export const accountsController = new Elysia({ prefix: "/accounts" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddAccountUseCase().run({ farmId, ...body });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: NewAccountBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateAccountUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: UpdateAccountBody }
  )
  .post("/defaults", ({ farmId }) => new SeedDefaultAccountsUseCase().run({ farmId }), {
    farm: true,
  });
```

- [ ] **Step 12: Mount the controller and name its requirements**

`lib/api/app.ts`, line 24:

old:
```ts
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
```
new:
```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
```

`lib/api/app.ts`, lines 73–75:

old:
```ts
  /* ---- Custom herd categories, expenses ---------------------------------- */
  .use(categoriesController)
  .use(expensesController)
```
new:
```ts
  /* ---- Custom herd categories, lançamentos, plano de contas -------------- */
  .use(categoriesController)
  .use(expensesController)
  .use(accountsController)
```

`lib/api/permissions/routeRequirements.ts`, lines 80–81:

old:
```ts
  "POST /api/herd/expenses": edit("finance"),
  "DELETE /api/herd/expenses/:id": edit("finance"),
```
new:
```ts
  "POST /api/herd/expenses": edit("finance"),
  "PATCH /api/herd/expenses/:id": edit("finance"),
  "DELETE /api/herd/expenses/:id": edit("finance"),
  "POST /api/herd/accounts": edit("finance"),
  "PATCH /api/herd/accounts/:id": edit("finance"),
  "POST /api/herd/accounts/defaults": edit("finance"),
```

`lib/api/__tests__/routeRequirements.test.ts`: the "against the mounted app" test fails until the table names every mounted route, and two snapshot tests (`routeRequirements.test.ts` "is pinned", `routeTable.test.ts` "exposes exactly the documented routes") pin the table and the mounted routes. Add one explicit case after line 69 (the closing `});` of the semen `it`), inside `describe("ROUTE_REQUIREMENTS", ...)`:

old:
```ts
    ).toEqual({ edit: ["reproduction", "finance"] });
  });
});
```
new:
```ts
    ).toEqual({ edit: ["reproduction", "finance"] });
  });

  it("keeps lançamentos and the plano de contas behind Financeiro edit", () => {
    for (const key of [
      "PATCH /api/herd/expenses/:id",
      "POST /api/herd/accounts",
      "PATCH /api/herd/accounts/:id",
      "POST /api/herd/accounts/defaults",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });
});
```

Run: `npx vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts -u`
Expected: PASS, `Snapshots  2 updated`, including "names a requirement for every farm-scoped route and for nothing else". `git diff lib/api/__tests__/__snapshots__` must show only the four new routes (`PATCH /api/herd/expenses/:id`, `POST /api/herd/accounts`, `PATCH /api/herd/accounts/:id`, `POST /api/herd/accounts/defaults` with `edit: ["finance"]` in the requirements snapshot, and the same four in the route table).

- [ ] **Step 13: Fill the new fields on the semen purchase expense**

`lib/api/domains/semen/useCases/AddPurchase.useCase.ts`, line 2:

old:
```ts
import { and, eq } from "drizzle-orm";
```
new:
```ts
import { and, eq, isNull, sql } from "drizzle-orm";
```

Line 5:

old:
```ts
import { semenBulls, semenPurchases } from "@/lib/db/schema";
```
new:
```ts
import { accounts, semenBulls, semenPurchases } from "@/lib/db/schema";
```

Lines 30–47:

old:
```ts
/**
 * Writes one purchase of a bull and its Reprodução expense ("Sêmen — <touro>,
 * <N> doses"). The expense goes first so the purchase can point at it. Call
 * inside a transaction: the two rows land together or not at all.
 */
export async function writeSemenPurchase(
  repository: RepositoryType,
  farmId: number,
  bull: { id: string; name: string },
  input: NewSemenPurchaseInput
): Promise<WrittenSemenPurchase> {
  const expense = await new AddExpenseUseCase(repository).run({
    farmId,
    date: input.date,
    category: "breeding",
    amountBrl: input.totalBrl,
    notes: purchaseExpenseNotes(bull.name, input.doses),
  });
```
new:
```ts
/**
 * Writes one purchase of a bull and its Reprodução expense ("Sêmen — <touro>,
 * <N> doses"), paid on the purchase date, paid to the bull's central, in the
 * farm's active "Sêmen" conta when it has one. The expense goes first so the
 * purchase can point at it. Call inside a transaction: the two rows land
 * together or not at all.
 */
export async function writeSemenPurchase(
  repository: RepositoryType,
  farmId: number,
  bull: { id: string; name: string; central: string | null },
  input: NewSemenPurchaseInput
): Promise<WrittenSemenPurchase> {
  const [account] = await repository
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.farmId, farmId),
        eq(accounts.group, "breeding"),
        isNull(accounts.archivedAt),
        sql`lower(${accounts.name}) = 'sêmen'`
      )
    )
    .limit(1);
  const expense = await new AddExpenseUseCase(repository).run({
    farmId,
    kind: "expense",
    date: input.date,
    paidAt: input.date,
    category: "breeding",
    amountBrl: input.totalBrl,
    counterparty: bull.central ?? undefined,
    accountId: account?.id,
    notes: purchaseExpenseNotes(bull.name, input.doses),
  });
  // No vencimento is sent, so Add's only refusal cannot happen here.
  if (expense === "due_before_date") throw new Error(expense);
```

Lines 87–88:

old:
```ts
      const [bull] = await tx
        .select({ id: semenBulls.id, name: semenBulls.name })
```
new:
```ts
      const [bull] = await tx
        .select({ id: semenBulls.id, name: semenBulls.name, central: semenBulls.central })
```

`AddBullUseCase` passes its inserted row, which already has `central`; it needs no change.

- [ ] **Step 14: Update the semen tests**

`lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts`, lines 72–113. The `selectResults` queue is now: the bull (with `central`), then the "Sêmen" conta lookup.

old:
```ts
  it("writes the expense, then the purchase pointing at it", async () => {
    state.selectResults = [[{ id: "bull-1", name: "Tufão da Serra" }]];
```
new:
```ts
  it("writes the expense, then the purchase pointing at it", async () => {
    state.selectResults = [
      // 1. the bull of the farm
      [{ id: "bull-1", name: "Tufão da Serra", central: "CRV Lagoa" }],
      // 2. the farm's active "Sêmen" conta in Reprodução
      [{ id: "acc-semen" }],
    ];
```

old:
```ts
    expect(expense).toMatchObject({
      farmId: 7,
      date: "2026-08-20",
      category: "breeding",
      amountBrl: 42.5,
      notes: "Sêmen — Tufão da Serra, 1 dose",
    });
```
new:
```ts
    expect(expense).toMatchObject({
      farmId: 7,
      kind: "expense",
      date: "2026-08-20",
      paidAt: "2026-08-20",
      dueDate: null,
      category: "breeding",
      amountBrl: 42.5,
      counterparty: "CRV Lagoa",
      accountId: "acc-semen",
      notes: "Sêmen — Tufão da Serra, 1 dose",
    });
```

old:
```ts
      expense: {
        id: expense.id,
        date: "2026-08-20",
        category: "breeding",
        amountBrl: 42.5,
        notes: "Sêmen — Tufão da Serra, 1 dose",
      },
    });
  });
});
```
new:
```ts
      expense: {
        id: expense.id,
        kind: "expense",
        date: "2026-08-20",
        paidAt: "2026-08-20",
        category: "breeding",
        amountBrl: 42.5,
        counterparty: "CRV Lagoa",
        accountId: "acc-semen",
        notes: "Sêmen — Tufão da Serra, 1 dose",
      },
    });
  });

  it("leaves the conta and the counterparty empty when the farm has neither", async () => {
    state.selectResults = [[{ id: "bull-1", name: "Tufão da Serra", central: null }], []];

    await new AddPurchaseUseCase().run({
      farmId: 7,
      bullId: "bull-1",
      input: { date: "2026-08-20", doses: 10, totalBrl: 400 },
    });

    expect(state.inserts[0].row).toMatchObject({ counterparty: null, accountId: null });
  });
});
```

`lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`, lines 38–43 (the first purchase now also looks up the "Sêmen" conta; this farm has none):

old:
```ts
vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ insert: insertBuilder })),
  },
}));
```
new:
```ts
/** The "Sêmen" conta lookup of a first purchase: this farm has none. */
function selectBuilder() {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve([]),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ insert: insertBuilder, select: selectBuilder })),
  },
}));
```

Lines 149–155:

old:
```ts
    expect(expense).toMatchObject({
      farmId: 7,
      date: "2026-08-01",
      category: "breeding",
      amountBrl: 1140,
      notes: "Sêmen — Tufão da Serra, 30 doses",
    });
```
new:
```ts
    expect(expense).toMatchObject({
      farmId: 7,
      kind: "expense",
      date: "2026-08-01",
      paidAt: "2026-08-01",
      category: "breeding",
      amountBrl: 1140,
      counterparty: null,
      accountId: null,
      notes: "Sêmen — Tufão da Serra, 30 doses",
    });
```

Lines 177–183:

old:
```ts
      expense: {
        id: expense.id,
        date: "2026-08-01",
        category: "breeding",
        amountBrl: 1140,
        notes: "Sêmen — Tufão da Serra, 30 doses",
      },
```
new:
```ts
      expense: {
        id: expense.id,
        kind: "expense",
        date: "2026-08-01",
        paidAt: "2026-08-01",
        category: "breeding",
        amountBrl: 1140,
        notes: "Sêmen — Tufão da Serra, 30 doses",
      },
```

Run: `npx vitest run lib/api/domains/semen`
Expected: PASS, all semen test files.

- [ ] **Step 15: Run the API suite and the type check**

Run: `npx vitest run lib/api`
Expected: PASS, no failures.

Run: `npx tsc --noEmit`
Expected: no errors in `lib/api/**` (errors elsewhere belong to tasks not yet done; none may point at a file of this task).

- [ ] **Step 16: Commit**

```bash
git add lib/api/domains/expenses lib/api/domains/accounts \
  lib/api/domains/semen/useCases/AddPurchase.useCase.ts \
  lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts \
  lib/api/domains/semen/useCases/__tests__/AddBull.test.ts \
  lib/api/app.ts lib/api/permissions/routeRequirements.ts \
  lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/__snapshots__
git commit -m "feat(finance): edit lançamentos, keep a plano de contas, file semen purchases as paid"
```

---

### Task 7: Store — lançamento edits and plano de contas actions

**Depends on:** T1 (types, `accounts: []` already in the store's initial state) and T6 (`PATCH /expenses/:id`, `/accounts` routes mounted in `lib/api/app.ts`, so the Eden `api` type has them).

**Files:**
- Modify: `lib/store/useHerdStore.ts`
  - `@/lib/types` import :7-32 (add `Account`, `AccountGroup`)
  - after `SemenBullPatch` :134-135 (new `ExpensePatch`)
  - `HerdStore` interface, `addExpense`/`removeExpense` :357-358
  - implementation, `removeExpense` :1452-1456
- No change: `lib/repository/ApiHerdRepository.ts` / `HerdRepository.ts`. `load` returns `HerdData`, which carries `accounts` since T1. `load` (:590-591 `set({ ...data, ... })`), `refreshAccess` (:606-607), `switchFarm` (:623) and `reloadHerd` (:476 `set({ ...fresh, loaded: true })`) all spread `repository.load()`, so they fill and refresh `accounts` without edits.
- Test: none. `lib/store/__tests__/` has only `activePermissions`, `dashboard` and `selectors` tests (pure selectors). Nothing in the repo mocks `@/lib/api/client` or calls store actions in a test, so there is no pattern to follow. Store tests are skipped. The server behaviour (409, PATCH) is covered by T6's use-case tests.

**Interfaces:**
- Consumes (T6, via Eden): `api.expenses({ id }).patch(body)` → `Expense` | 404; `api.accounts.post({ group, name })` → `Account` | 409 `{ error: "duplicate_name" }`; `api.accounts({ id }).patch({ name?, archived? })` → `Account` | 409 | 404; `api.accounts.defaults.post()` → `{ created: Account[] }`.
- Produces:
  ```ts
  export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
    [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId"]?: string | null;
  };
  accounts: Account[];                                             // from HerdData (T1)
  updateExpense: (id: string, patch: ExpensePatch) => Promise<void>;
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  addAccount: (input: { group: AccountGroup; name: string }) => Promise<Account | null>;
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  seedDefaultAccounts: () => Promise<number>;
  ```

- [ ] **Step 1: Imports.** In `lib/store/useHerdStore.ts` replace

```ts
import type {
  Animal,
  Breeding,
```

with

```ts
import type {
  Account,
  AccountGroup,
  Animal,
  Breeding,
```

- [ ] **Step 2: `ExpensePatch`.** Replace

```ts
/** Editable fields of a semen bull (only sent ones change; a blank text clears it). */
export type SemenBullPatch = Partial<Pick<SemenBull, "name" | "code" | "breed" | "central">>;
```

with

```ts
/** Editable fields of a semen bull (only sent ones change; a blank text clears it). */
export type SemenBullPatch = Partial<Pick<SemenBull, "name" | "code" | "breed" | "central">>;

/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
  [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId"]?:
    | string
    | null;
};
```

- [ ] **Step 3: Interface.** In `HerdStore` replace

```ts
  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
```

with

```ts
  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  /** Saves the sent fields of a lançamento and keeps the server's row. */
  updateExpense: (id: string, patch: ExpensePatch) => Promise<void>;
  /** Marks a lançamento paid/received on `paidAt`, or pendente again with null. */
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  /** Creates a conta; null when its grupo already has that name (409). */
  addAccount: (input: { group: AccountGroup; name: string }) => Promise<Account | null>;
  /** Renames, archives or restores a conta; false when the name is taken (409). */
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Creates the standard contas the farm lacks; resolves how many were created. */
  seedDefaultAccounts: () => Promise<number>;
```

(`addExpense` needs no change: it posts `e` as is, and `Omit<Expense, "id">` now carries `kind` and the new optional fields.)

- [ ] **Step 4: Actions.** Replace

```ts
  removeExpense: async (id) => {
    const { error } = await api.expenses({ id }).delete();
    if (error) apiFail("remover a despesa", error);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },
```

with

```ts
  updateExpense: async (id, patch) => {
    const { data, error } = await api.expenses({ id }).patch(patch);
    if (error) apiFail("salvar o lançamento", error);
    const expense = data as Expense;
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
  },

  markExpensePaid: (id, paidAt) => get().updateExpense(id, { paidAt }),

  removeExpense: async (id) => {
    const { error } = await api.expenses({ id }).delete();
    if (error) apiFail("remover a despesa", error);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },

  addAccount: async (input) => {
    const { data, error } = await api.accounts.post(input);
    if (error) {
      if (error.status === CONFLICT) return null;
      apiFail("criar a conta", error);
    }
    const account = data as Account;
    set((s) => ({ accounts: [...s.accounts, account] }));
    return account;
  },

  updateAccount: async (id, patch) => {
    const { data, error } = await api.accounts({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar a conta", error);
    }
    const account = data as Account;
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? account : a)) }));
    return true;
  },

  seedDefaultAccounts: async () => {
    const { data, error } = await api.accounts.defaults.post();
    if (error) apiFail("criar as contas padrão", error);
    const { created } = data as { created: Account[] };
    set((s) => ({ accounts: [...s.accounts, ...created] }));
    return created.length;
  },
```

Notes: `CONFLICT` (= 409) is the module constant at :503, the one `updateSemenBull` uses; `addCustomCategory` does the same with a literal `409`. New contas are appended, not sorted: consumers go through `accountsByGroup` (T2), which sorts by name. A 404 on `updateAccount` goes to `apiFail` like any other error.

- [ ] **Step 5: Typecheck and lint.**

```bash
cd /home/luketa/meubov && pnpm tsc --noEmit; pnpm exec eslint lib/store/useHerdStore.ts
```

Expected: `tsc` reports only the `app/(app)/finance/page.tsx` errors Task 4 left (Task 9 rewrites that page); nothing in `lib/store/useHerdStore.ts`; eslint prints nothing. This was verified against stub routes with T6's contract shapes: `.patch` on `api.expenses({ id })` with a `t.Nullable` body, and `api.accounts.defaults.post()` with no body. If `tsc` reports `Property 'accounts' does not exist` on `api`, T6's `accountsController` is not mounted in `lib/api/app.ts` yet.

```bash
cd /home/luketa/meubov && pnpm vitest run --dir lib/store
```

Expected: the existing store tests stay green.

- [ ] **Step 6: Commit.**

```bash
cd /home/luketa/meubov && git add lib/store/useHerdStore.ts
git commit -m "feat(finance): store actions to edit lançamentos and manage the plano de contas"
```

---

### Task 8: EntryDialog + LancarButton

**Files:**
- Create: `components/finance/EntryDialog.tsx`
- Create: `components/finance/LancarButton.tsx`
- Test: none (components are checked by tsc, eslint and the smoke task; the pure parts they call are tested in Tasks 2 and 7)

`RegisterExpenseDialog.tsx` stays until Task 9 deletes it with the rest of the old page.

**Interfaces:**
- Consumes:
  - `useHerdStore` (Task 7): `accounts: Account[]`, `expenses: Expense[]`, `lots: Lot[]`, `animals: Animal[]`, `addExpense(e: Omit<Expense, "id">): Promise<void>`, `updateExpense(id: string, patch: ExpensePatch): Promise<void>` (nullable `dueDate | paidAt | counterparty | document | accountId | lotId | notes` clear the field), `addAccount(input: { group: AccountGroup; name: string }): Promise<Account | null>` (null on duplicate).
  - `lib/types.ts` (Task 1): `Expense`, `EntryKind`, `ExpenseCategory`, `AccountGroup`.
  - `lib/domain/accounts.ts` (Task 2): `accountsByGroup(accounts: Account[], includeArchived?: boolean): Record<AccountGroup, Account[]>`, `counterpartySuggestions(expenses: Expense[]): string[]`.
  - `lib/store/selectors.ts`: `activeLots(lots: Lot[]): Lot[]`, `activeAnimals(animals: Animal[]): Animal[]`.
  - `lib/store/usePermissions.ts`: `useCan(area, level): boolean`.
  - `lib/domain/dates.ts`: `todayISO()`; `lib/domain/labels.ts`: `EXPENSE_CATEGORY_LABEL`.
- Produces:
  - `export function EntryDialog(props: { open: boolean; onOpenChange(open: boolean): void; expense?: Expense; defaultKind?: EntryKind }): JSX.Element` — create when `expense` is absent, edit otherwise (kind fixed, switch hidden).
  - `export function LancarButton(props: { size?: "sm" | "default"; className?: string; defaultKind?: EntryKind; variant?: "default" | "outline" | "ghost" }): JSX.Element | null` — trigger + `EntryDialog`; `null` without `useCan("finance", "edit")`.

Design notes (binding for this task):
- The form lives in an inner `EntryForm` rendered inside `DialogContent`. Radix unmounts the content while closed, so every open starts from fresh `useState` built from `expense` / `defaultKind` — no reset effect.
- Radix `SelectItem` refuses `""` as a value, so "Sem conta" and "Fazenda toda" use the sentinel `"none"`.
- Valor is a text field with `inputMode="decimal"`: "3.240,50", "3240,5" and "3240.5" all parse.
- Vencimento follows Data until the user changes it (`dueTouched`); an edited lançamento that already had a `dueDate` starts as touched.
- A conta that is archived, or a lote that was deleted, stays selectable while it is the lançamento's current value, so editing an old row does not blank the Select.

- [ ] **Step 1: Write `components/finance/EntryDialog.tsx`**

```tsx
"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento, conta,
 * pago para, documento and lote (centro de custo). With `expense` it edits that
 * lançamento and the Despesa | Receita switch is hidden. Vendas and compras de
 * gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, EntryKind, Expense, ExpenseCategory } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
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
    dueTouched: expense.dueDate !== undefined,
    paid: expense.paidAt !== undefined,
    paidAt: expense.paidAt ?? today,
    counterparty: expense.counterparty ?? "",
    document: expense.document ?? "",
    lotId: expense.lotId ?? NONE,
    notes: expense.notes ?? "",
  };
}

/** "3.240,50", "3240,5" or "3240.5" → 3240.5; NaN when it is not a number. */
function parseAmount(text: string): number {
  const clean = text.replace(/\s|R\$/g, "");
  if (clean === "") return Number.NaN;
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
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
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind));
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  function onDateChange(date: string) {
    setFields((f) => ({ ...f, date, dueDate: f.dueTouched ? f.dueDate : date }));
  }

  async function onCreateAccount() {
    const name = (newAccountName ?? "").trim();
    if (name === "") return;
    const created = await addAccount({ group, name });
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
    if (fields.dueDate === "") {
      setError("Informe o vencimento.");
      return;
    }
    if (fields.dueDate < fields.date) {
      setError("O vencimento não pode ser antes da data");
      return;
    }
    if (fields.paid && fields.paidAt === "") {
      setError(revenue ? "Informe a data do recebimento." : "Informe a data do pagamento.");
      return;
    }
    setError(null);
    setSaving(true);

    const category: ExpenseCategory = revenue ? "other" : fields.category;
    const paidAt = fields.paid ? fields.paidAt : null;
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

    if (expense) {
      await updateExpense(expense.id, {
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
      });
      addToast({ messageType: "success", text: "Lançamento salvo" });
    } else {
      await addExpense({
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
      });
      addToast({ messageType: "success", text: revenue ? "Receita lançada" : "Despesa lançada" });
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
            className="min-h-11 font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-amount">Valor (R$)</Label>
          <Input
            id="entry-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono"
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
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setNewAccountName(null);
                  }
                }}
                className="min-h-11"
              />
              <Button type="button" className="min-h-11" onClick={() => void onCreateAccount()}>
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
            value={fields.dueDate}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
            className="min-h-11 font-mono"
          />
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
            className="min-h-11 font-mono"
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
          {expense ? "Salvar" : "Lançar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 2: Write `components/finance/LancarButton.tsx`**

```tsx
"use client";

/** "Lançar": opens the EntryDialog. Nothing for a member without Financeiro edit. */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { EntryKind } from "@/lib/types";
import { useCan } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryDialog } from "@/components/finance/EntryDialog";

export function LancarButton({
  size = "default",
  className,
  defaultKind = "expense",
  variant = "default",
}: {
  size?: "sm" | "default";
  className?: string;
  defaultKind?: EntryKind;
  variant?: "default" | "outline" | "ghost";
}) {
  const canEdit = useCan("finance", "edit");
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={cn("min-h-11 md:min-h-0", className)}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" aria-hidden />
        Lançar
      </Button>
      <EntryDialog open={open} onOpenChange={setOpen} defaultKind={defaultKind} />
    </>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run:
```bash
cd /home/luketa/meubov && pnpm tsc --noEmit; pnpm exec eslint components/finance/EntryDialog.tsx components/finance/LancarButton.tsx
```
Expected: `tsc` reports only the `app/(app)/finance/page.tsx` errors Task 4 left (Task 9 rewrites that page), none in these two files; eslint prints nothing. A type error on `updateExpense`/`addAccount`/`accounts` means Task 7 has not landed; a type error on `Expense.kind` means Task 1 has not.

- [ ] **Step 4: Commit**

```bash
cd /home/luketa/meubov && git add components/finance/EntryDialog.tsx components/finance/LancarButton.tsx && git commit -m "feat(finance): add the lançamento dialog with vencimento, pagamento, conta and lote"
```

---

### Task 9: Cockpit — /finance

**Files:**
- Create: `components/finance/FinanceHeader.tsx`, `components/finance/CashStrip.tsx`, `components/finance/BenchmarkBand.tsx`, `components/finance/IndicatorCard.tsx`, `components/finance/CostVsPriceCard.tsx`, `components/finance/Placar.tsx`, `components/finance/MarketPanel.tsx`, `components/finance/CostBreakdownCard.tsx`, `components/finance/BillsCard.tsx`, `components/finance/RecentEntriesCard.tsx`, `components/finance/LotsEconomicsCard.tsx`
- Modify: `app/(app)/finance/page.tsx` (rewrite), `components/finance/RevenueCostChart.tsx` (totals legend + result line). `components/finance/format.tsx` stays as is.
- Modify (deletion only): `lib/export/datasets/finance.ts` and `lib/export/__tests__/finance.test.ts` lose `categorySalesExportTable` / `CategorySalesRow` and their test, whose last importers die in Step 1. `pluralCategoryLabel` stays (`components/reports/tables.ts` and `app/(app)/relatorios/banco/page.tsx` use it).
- Delete (verified with grep: each is imported only by the old `app/(app)/finance/page.tsx` or by another file in this list; `components/semen/attention-notice.tsx` names MarketNotice only in a comment): `components/finance/FinanceKpis.tsx`, `components/finance/LivestockIndicators.tsx`, `components/finance/MarketNotice.tsx`, `components/finance/QuoteChart.tsx`, `components/finance/CostBreakdownChart.tsx`, `components/finance/CategorySalesTable.tsx`, `components/finance/ExpensesList.tsx`, `components/finance/RegisterExpenseDialog.tsx`, `components/charts/donut-chart.tsx` (its only user is `CostBreakdownChart.tsx`).
- Test: none new (the domain is tested in Tasks 2–5; the page is checked by tsc, eslint and Task 13's smoke).

**Interfaces:**
- Consumes:
  - `import { periodFromSearch, periodSearch, priorPeriod, inPeriod, type Period } from "@/lib/domain/period"` (T2)
  - `import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts"` (T2)
  - `import { benchmark, bandPosition, bandTone, FARM_SYSTEM_LABEL, type Benchmark, type BenchmarkKey, type BandTone } from "@/lib/domain/benchmarks"` (T2)
  - `import { cashSummary, effectiveDueDate, ledgerRows, pendingBills, type CashSummary, type LedgerRow, type LedgerStatus } from "@/lib/domain/ledger"` (T3)
  - `import { costBreakdownBetween, indicatorDeltas, indicators, monthlyRevenueCost, type ArrobasProduced, type CostBreakdownSlice, type EconomicsInputs, type Indicators, type MonthlyRevenueCost } from "@/lib/domain/economics"` (T4)
  - `import { lotEconomics, type LotEconomics } from "@/lib/domain/lotEconomics"` (T5)
  - `import { filterMonthlyByPeriod } from "@/lib/domain/finance"` (unchanged)
  - store `useHerdStore`: `accounts`, `markExpensePaid(id, paidAt)` (T7), plus `animals, manejoSessions, movements, treatments, expenses, invernadas, lots`
  - `import { LancarButton } from "@/components/finance/LancarButton"` (T8, props `{ size?, className?, defaultKind?, variant? }`)
  - `import { indicatorsExportTable, lotsEconomicsExportTable } from "@/lib/export/datasets/finance"` (T12)
  - `PeriodPicker` from `@/components/dashboard/PeriodPicker` (its import already moved to `lib/domain/period` by T2)
- Produces (all in `components/finance/`):
  - `FinanceHeader({ period, onPeriodChange, canEdit, ind, prior, lots, farm })`
  - `CashStrip({ cash: CashSummary })`
  - `BenchmarkBand({ value, benchmark, format })`
  - `IndicatorCard({ label, value, unit?, sub?, delta?, stats?, band?, source?, foot?, className? })` plus `yoyDelta(delta, { lowerIsBetter?, pts? })`, `DeltaText({ delta })`, `type IndicatorDelta = { text; positive; up? }`. The contract's shape plus two optional additions: `stats` (the Resultado card's three figures) and `delta.up` (arrow direction, so "−8%" can be good and still point down).
  - `CostVsPriceCard({ ind, quote, delta, className? })` plus `producedEquation(p: ArrobasProduced)`. **`quote: number | null` is added**: `Indicators` does not carry the day's cotação, and the third bar needs it.
  - `Placar({ ind, deltas, quote })`: `quote` added for the same reason.
  - `MarketPanel({ quote: ArrobaQuoteView, ind })`
  - `CostBreakdownCard({ breakdown, expenses, treatments, accounts, period })`
  - `BillsCard({ payables, receivables, canEdit })`: reads `accounts`, `lots` and `markExpensePaid` from the store.
  - `RecentEntriesCard({ rows, period })`
  - `LotsEconomicsCard({ lots, farm, quote })`
  - `RevenueCostChart({ months })`

Notes that change the brief:
- `components/ui/checkbox.tsx` and `components/ui/tabs.tsx` do not exist in the repo. BillsCard uses a native `<input type="checkbox" className="accent-brand">`, as `components/calendar/ScheduleTreatmentForm.tsx` does, and a two-button segmented control with `aria-pressed`. Its look is the repo's segmented group (`components/team/PermissionsGrid.tsx`), the same classes Task 8's Despesa | Receita switch and Task 10's tipo buttons use: group `gap-0.5 rounded-lg border border-hairline bg-surface p-0.5`, button `min-h-11 rounded-md px-3 text-[13px] md:min-h-8`, selected `bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]`, else `text-ink-soft hover:text-ink`. No new ui primitive.
- `StatusPill` has fixed labels ("Feito", "Atrasado"…) and takes no text. RecentEntriesCard draws its own pill with the same classes (`bg-healthy-soft text-healthy`…) and the canvas labels "pago", "recebido", "a pagar", "a receber", "vencida".
- `recentEntries(rows, 5)` is not in the contract. `ledgerRows` already sorts newest first, so the card takes `rows.slice(0, 5)`.
- The row title follows the canvas: "Nutrição › Sal mineral" (grupo › conta), or just the grupo when there is no conta.
- "Ver extrato" in Composição also carries `&grupo=<open group>` (the spec says it links "with the window and the grupo"; T10 reads `grupo` from the URL).
- `useSearchParams` in this Next.js: a prerendered page that calls it must sit under a `<Suspense>` boundary, or the production build fails (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`, "Prerendering"). The page wraps its content the way `app/(app)/relatorios/romaneio/page.tsx` does.

- [ ] **Step 1: Delete the old finance widgets and the donut**

```bash
cd /home/luketa/meubov
grep -rln "FinanceKpis\|LivestockIndicators\|finance/MarketNotice\|QuoteChart\|CostBreakdownChart\|CategorySalesTable\|ExpensesList\|RegisterExpenseDialog\|donut-chart" app components lib cli --include=*.ts --include=*.tsx
```
Expected: only `app/(app)/finance/page.tsx` and files from the list below (Step 13 rewrites the page).

```bash
git rm components/finance/FinanceKpis.tsx components/finance/LivestockIndicators.tsx \
  components/finance/MarketNotice.tsx components/finance/QuoteChart.tsx \
  components/finance/CostBreakdownChart.tsx components/finance/CategorySalesTable.tsx \
  components/finance/ExpensesList.tsx components/finance/RegisterExpenseDialog.tsx \
  components/charts/donut-chart.tsx
```

Their last importers are gone, so drop the category sales export too. In `lib/export/datasets/finance.ts` delete the `CategorySalesRow` interface with its doc comment (`/** One categoria of the "Vendas e faturamento estimado por categoria" card. */`) and the `categorySalesExportTable` function with its doc comment (`/** The card's rows and its Total line as a table. */`), each with the blank line after it; keep `pluralCategoryLabel`, which sits between them. In `lib/export/__tests__/finance.test.ts` remove `categorySalesExportTable,` from the import and delete the whole block

```ts
describe("categorySalesExportTable", () => {
  it("writes one row per categoria and the Total line", () => {
    const table = categorySalesExportTable(
      [{ category: "steer", headCount: 2, averageArrobas: 18, totalArrobas: 36, estimatedValue: 11_000 }],
      { headCount: 2, averageArrobas: 18, totalArrobas: 36, estimatedValue: 11_000 }
    );
    expect(table.rows).toEqual([
      ["Bois", 2, 18, 36, 11_000],
      ["Total", 2, 18, 36, 11_000],
    ]);
  });
});
```

(with the blank line after it). Then `grep -rn "categorySales\|CategorySalesRow" app components lib` prints nothing.

- [ ] **Step 2: Write `components/finance/BenchmarkBand.tsx`**

```tsx
import { bandPosition, bandTone, type BandTone, type Benchmark } from "@/lib/domain/benchmarks";
import { cn } from "@/lib/utils";

interface BenchmarkBandProps {
  value: number;
  benchmark: Benchmark;
  /** How the tick labels print a benchmark value, e.g. `v => `${formatNumber(v)}%``. */
  format: (value: number) => string;
}

const TONE: Record<BandTone, { fill: string; ring: string }> = {
  healthy: { fill: "bg-healthy", ring: "ring-healthy" },
  attention: { fill: "bg-attention", ring: "ring-attention" },
  overdue: { fill: "bg-overdue", ring: "ring-overdue" },
};

/** Keeps a label under its tick without spilling past the track's ends. */
function labelAlign(position: number): string {
  if (position < 12) return "translate-x-0";
  if (position > 88) return "-translate-x-full";
  return "-translate-x-1/2";
}

/**
 * The reference band under an indicator: the track, a tick for the média and
 * one for the top, the farm's value as a colored marker and a soft fill from
 * the worse end to it.
 */
export function BenchmarkBand({ value, benchmark, format }: BenchmarkBandProps) {
  const position = bandPosition(value, benchmark);
  const tone = TONE[bandTone(value, benchmark)];
  const ticks = [
    {
      key: "mean",
      at: bandPosition(benchmark.mean, benchmark),
      label: `${benchmark.meanLabel ?? "média"} ${format(benchmark.mean)}`,
    },
    ...(benchmark.top === null
      ? []
      : [
          {
            key: "top",
            at: bandPosition(benchmark.top, benchmark),
            label: `${benchmark.topLabel ?? "top"} ${format(benchmark.top)}`,
          },
        ]),
  ];
  const fill =
    benchmark.better === "high"
      ? { left: 0, width: `${position}%` }
      : { left: `${position}%`, right: 0 };

  return (
    <div
      role="img"
      aria-label={ticks.map((tick) => tick.label).join(" · ")}
      className="relative mt-1.5 mb-3.5 h-1.5 rounded-full border border-hairline bg-canvas"
    >
      <span className={cn("absolute inset-y-0 rounded-full opacity-25", tone.fill)} style={fill} />
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className="absolute -inset-y-1 w-px bg-ink-soft/60"
          style={{ left: `${tick.at}%` }}
        />
      ))}
      <span
        className={cn(
          "absolute top-1/2 -ml-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-panel ring-1",
          tone.fill,
          tone.ring
        )}
        style={{ left: `${position}%` }}
      />
      <div className="absolute inset-x-0 top-2.5 h-3">
        {ticks.map((tick) => (
          <span
            key={tick.key}
            className={cn(
              "absolute text-[10px] leading-3 whitespace-nowrap text-ink-soft",
              labelAlign(tick.at)
            )}
            style={{ left: `${tick.at}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/finance/IndicatorCard.tsx`**

```tsx
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Benchmark } from "@/lib/domain/benchmarks";
import { formatNumber } from "@/lib/domain/format";
import { BenchmarkBand } from "@/components/finance/BenchmarkBand";
import { cn } from "@/lib/utils";

/** `positive` = good for the farm (colors it); `up` = the figure rose (points the arrow). */
export interface IndicatorDelta {
  text: string;
  positive: boolean;
  up?: boolean;
}

export interface IndicatorStat {
  label: string;
  value: string;
  sub: string;
}

/**
 * "+8% vs ano anterior", or "+3,5 pts vs ano anterior" with `pts`. Null when
 * either year has no figure, which hides the delta. `lowerIsBetter` for cost.
 */
export function yoyDelta(
  delta: { pct: number | null; pts: number | null },
  options: { lowerIsBetter?: boolean; pts?: boolean } = {}
): IndicatorDelta | null {
  const value = options.pts ? delta.pts : delta.pct;
  if (value === null) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const amount = options.pts
    ? `${formatNumber(Math.abs(value), 1)} pts`
    : `${formatNumber(Math.abs(value), 0)}%`;
  return {
    text: `${sign}${amount} vs ano anterior`,
    positive: options.lowerIsBetter ? value <= 0 : value >= 0,
    up: value >= 0,
  };
}

export function DeltaText({ delta }: { delta: IndicatorDelta }) {
  const up = delta.up ?? delta.positive;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap",
        delta.positive ? "text-healthy" : "text-overdue"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3.5" aria-hidden />
      )}
      {delta.text}
    </span>
  );
}

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

interface IndicatorCardProps {
  label: string;
  /** "—" when the records can't support the figure. */
  value: ReactNode;
  unit?: string;
  sub?: string;
  delta?: IndicatorDelta | null;
  /** A row of small figures under the value (the Resultado card). */
  stats?: IndicatorStat[];
  band?: { value: number; benchmark: Benchmark; format: (value: number) => string };
  /** Band caption: source and safra. */
  source?: string;
  /** Closing note when the card has no band. */
  foot?: string;
  className?: string;
}

/** One Placar indicator, in the KpiCard look, with its reference band pinned to the bottom. */
export function IndicatorCard({
  label,
  value,
  unit,
  sub,
  delta,
  stats,
  band,
  source,
  foot,
  className,
}: IndicatorCardProps) {
  return (
    <div className={cn("flex h-full flex-col rounded-lg border border-hairline bg-panel p-4", className)}>
      <p className={LABEL}>{label}</p>
      <div className="mt-1.5 font-mono text-2xl font-medium text-ink">
        {value}
        {unit ? <span className="text-sm text-ink-soft"> {unit}</span> : null}
      </div>
      {delta || sub ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {delta ? <DeltaText delta={delta} /> : null}
          {sub ? <span className="text-xs text-ink-soft">{sub}</span> : null}
        </div>
      ) : null}
      {stats ? (
        <dl className="mt-3.5 grid grid-cols-3 border-t border-hairline">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn("min-w-0 pt-2.5", index > 0 && "border-l border-hairline pl-3")}
            >
              <dt className={LABEL}>{stat.label}</dt>
              <dd className="mt-1 truncate font-mono text-lg font-medium text-ink">{stat.value}</dd>
              <dd className="mt-0.5 truncate text-[11px] text-ink-soft">{stat.sub}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {band || source ? (
        <div className="mt-auto pt-2">
          {band ? (
            <BenchmarkBand value={band.value} benchmark={band.benchmark} format={band.format} />
          ) : null}
          {source ? <p className="mt-0.5 text-[10px] leading-3.5 text-ink-soft">{source}</p> : null}
        </div>
      ) : null}
      {foot ? <p className="mt-auto pt-2.5 text-[11px] leading-3.5 text-ink-soft">{foot}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Write `components/finance/CostVsPriceCard.tsx`**

```tsx
import { Fragment } from "react";
import type { ArrobasProduced, Indicators } from "@/lib/domain/economics";
import { benchmark } from "@/lib/domain/benchmarks";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { DeltaText, type IndicatorDelta } from "@/components/finance/IndicatorCard";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const DASH = "—";
const MONO = "font-mono text-sm font-medium whitespace-nowrap";

/** "2.006 vendidas − 280 compradas + 212 de estoque" (the stock term keeps its sign). */
export function producedEquation(p: ArrobasProduced): string {
  const sign = p.delta < 0 ? "−" : "+";
  return `${formatNumber(p.sold)} vendidas − ${formatNumber(p.bought)} compradas ${sign} ${formatNumber(Math.abs(p.delta))} de estoque`;
}

interface CostVsPriceCardProps {
  ind: Indicators;
  /** Today's arroba price, or null when the quote is unavailable. */
  quote: number | null;
  /** Year-over-year change of the custo/@ (down is good). */
  delta: IndicatorDelta | null;
  className?: string;
}

/** Custo da @ produzida, preço médio realizado and today's cotação on one R$/@ scale. */
export function CostVsPriceCard({ ind, quote, delta, className }: CostVsPriceCardProps) {
  const bars = [
    { label: "Custo da @ produzida", value: ind.costPerArroba, fill: "bg-fmd", ink: "text-fmd", delta },
    { label: "Preço médio realizado", value: ind.realizedPerArroba, fill: "bg-scheduled", ink: "text-scheduled", delta: null },
    { label: "Cotação de hoje", value: quote, fill: "bg-brand", ink: "text-brand", delta: null },
  ];
  const largest = Math.max(0, ...bars.map((bar) => bar.value ?? 0));
  const max = Math.max(350, Math.ceil(largest / 50) * 50);
  const reference = benchmark("costPerArroba", ind.system);
  const produced = ind.produced;
  const margin = ind.marginPerArroba;
  const unweighed =
    produced.unweighed > 0
      ? ` · ${produced.unweighed} ${produced.unweighed === 1 ? "vendido" : "vendidos"} sem peso`
      : "";

  return (
    <SectionCard
      title="Custo da @ produzida × cotação"
      subtitle="R$ por arroba · o custo do período contra o preço de hoje"
      className={className}
    >
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[172px_minmax(0,1fr)_84px]">
        {bars.map((bar) => (
          <Fragment key={bar.label}>
            <div className="flex flex-col">
              <span className="text-[13px] leading-4.5 text-ink">{bar.label}</span>
              {bar.delta ? <DeltaText delta={bar.delta} /> : null}
            </div>
            <div
              aria-hidden
              className="relative h-2.5 overflow-hidden rounded-full border border-hairline bg-canvas"
            >
              {bar.value !== null ? (
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", bar.fill)}
                  style={{ width: `${Math.min(100, Math.max(0, (bar.value / max) * 100))}%` }}
                />
              ) : null}
            </div>
            <span className={cn("text-right", MONO, bar.value === null ? "text-ink-soft" : bar.ink)}>
              {bar.value === null ? DASH : formatCurrency(bar.value)}
            </span>
          </Fragment>
        ))}
        <span aria-hidden />
        <div aria-hidden className="flex justify-between text-[10px] leading-3 text-ink-soft">
          <span>0</span>
          <span>R$ {formatNumber(max)}/@</span>
        </div>
        <span aria-hidden />
      </div>

      <p className="mt-3 border-t border-hairline pt-2.5 text-[13px] leading-4.5 text-ink">
        Margem na cotação{" "}
        <span
          className={cn(
            MONO,
            margin === null ? "text-ink-soft" : margin >= 0 ? "text-healthy" : "text-overdue"
          )}
        >
          {margin === null ? DASH : `${formatCurrency(margin)}/@`}
        </span>{" "}
        · média Inttegra <span className={MONO}>{formatCurrency(reference.mean)}</span> · top{" "}
        <span className={MONO}>{reference.top === null ? DASH : formatCurrency(reference.top)}</span>{" "}
        <span className="text-ink-soft">(safra 24/25)</span>
      </p>
      <p className="mt-1.5 text-[11px] leading-4 text-ink-soft">
        @ produzidas = {producedEquation(produced)} = {formatNumber(produced.produced)} @ · COE{" "}
        {formatCurrency(ind.coe)}
        {unweighed}
      </p>
    </SectionCard>
  );
}
```

- [ ] **Step 5: Write `components/finance/Placar.tsx`**

```tsx
import type { Indicators, indicatorDeltas } from "@/lib/domain/economics";
import { benchmark, FARM_SYSTEM_LABEL, type BenchmarkKey } from "@/lib/domain/benchmarks";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { IndicatorCard, yoyDelta } from "@/components/finance/IndicatorCard";
import { CostVsPriceCard, producedEquation } from "@/components/finance/CostVsPriceCard";

const DASH = "—";
const DAYS_PER_MONTH = 30.4375;

interface PlacarProps {
  ind: Indicators;
  deltas: ReturnType<typeof indicatorDeltas>;
  /** Today's arroba price, or null when the quote is unavailable. */
  quote: number | null;
}

/** The eight indicators of the window, each against its reference and the year before. */
export function Placar({ ind, deltas, quote }: PlacarProps) {
  const produced = ind.produced;
  const { kgPerDay, animals } = ind.adg;
  const { calvesPerSteer, arrobasPerCalf } = ind.exchange;
  const outlay = ind.outlayPerHeadMonth;
  const offtake = ind.offtakePct;
  const stocking = ind.stocking;

  // A figure without data hides its band and its source with it.
  const band = (key: BenchmarkKey, value: number | null, format: (value: number) => string) =>
    value === null ? undefined : { value, benchmark: benchmark(key, ind.system), format };
  const source = (key: BenchmarkKey, value: number | null) =>
    value === null ? undefined : benchmark(key, ind.system).source;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <IndicatorCard
        label="Resultado do período"
        value={formatCurrency(ind.result)}
        delta={yoyDelta(deltas.result)}
        sub={`receita ${formatCurrency(ind.revenue)} − COE ${formatCurrency(ind.coe)}`}
        stats={[
          {
            label: "R$/ha",
            value: ind.resultPerHa === null ? DASH : formatCurrency(ind.resultPerHa),
            sub: `${formatNumber(ind.hectares)} ha`,
          },
          {
            label: "Margem",
            value: ind.marginPct === null ? DASH : `${formatNumber(ind.marginPct, 1)}%`,
            sub: "da receita",
          },
          {
            label: "Giro do capital",
            value: ind.capitalTurnover === null ? DASH : `${formatNumber(ind.capitalTurnover, 2)}×`,
            sub: "receita ÷ rebanho",
          },
        ]}
        band={band("costToRevenue", ind.costToRevenuePct, (v) => `${formatNumber(v)}%`)}
        source={
          ind.costToRevenuePct === null
            ? undefined
            : `custo ÷ receita ${formatNumber(ind.costToRevenuePct, 1)}% · teto de ${FARM_SYSTEM_LABEL[ind.system]} · Inttegra`
        }
      />

      <CostVsPriceCard
        className="md:col-span-2"
        ind={ind}
        quote={quote}
        delta={yoyDelta(deltas.costPerArroba, { lowerIsBetter: true })}
      />

      <IndicatorCard
        label="@ produzidas"
        value={formatNumber(produced.produced)}
        unit={
          ind.arrobasPerHa === null ? "@" : `@ · ${formatNumber(ind.arrobasPerHa, 2)} @/ha/ano`
        }
        delta={yoyDelta(deltas.arrobasPerHa)}
        sub={producedEquation(produced)}
        band={band("arrobasPerHa", ind.arrobasPerHa, (v) => formatNumber(v, 1))}
        source={source("arrobasPerHa", ind.arrobasPerHa)}
      />

      <IndicatorCard
        label="Desembolso por cabeça"
        value={outlay === null ? DASH : formatNumber(outlay, 2)}
        unit={outlay === null ? undefined : "R$/cab/mês"}
        delta={yoyDelta(deltas.outlayPerHeadMonth, { lowerIsBetter: true })}
        sub={
          outlay === null
            ? undefined
            : `${formatCurrency(outlay / DAYS_PER_MONTH)} por cabeça por dia`
        }
        band={band("outlay", outlay, formatCurrency)}
        source={source("outlay", outlay)}
      />

      <IndicatorCard
        label="GMD do rebanho"
        value={kgPerDay === null ? DASH : formatNumber(kgPerDay, 3)}
        unit={kgPerDay === null ? undefined : "kg/dia"}
        delta={yoyDelta(deltas.adg)}
        sub={`pesagens dos manejos, ${formatNumber(animals)} ${animals === 1 ? "animal" : "animais"}`}
        band={band("gmd", kgPerDay, (v) => `${formatNumber(v * 1000)} g`)}
        source={source("gmd", kgPerDay)}
      />

      <IndicatorCard
        label="Taxa de desfrute"
        value={offtake === null ? DASH : formatNumber(offtake, 1)}
        unit={offtake === null ? undefined : "%"}
        delta={yoyDelta(deltas.offtakePct, { pts: true })}
        sub={`${formatNumber(produced.headsSold)} vendidas sobre ${formatNumber(ind.heads.avg)} cabeças`}
        band={band("offtake", offtake, (v) => `${formatNumber(v, 1)}%`)}
        source={source("offtake", offtake)}
      />

      <IndicatorCard
        label="Lotação"
        value={stocking === null ? DASH : formatNumber(stocking, 2)}
        unit={stocking === null ? undefined : "UA/ha"}
        delta={yoyDelta(deltas.stocking)}
        sub={`${formatNumber(ind.heads.end)} cabeças em ${formatNumber(ind.hectares)} ha`}
        band={band("stocking", stocking, (v) => formatNumber(v, 2))}
        source={source("stocking", stocking)}
      />

      <IndicatorCard
        label="Relação de troca"
        value={calvesPerSteer === null ? DASH : `1 boi ≈ ${formatNumber(calvesPerSteer, 1)} bezerros`}
        delta={yoyDelta(deltas.exchange)}
        sub={
          arrobasPerCalf === null
            ? undefined
            : `${formatNumber(arrobasPerCalf, 1)} @ por bezerro · pelas suas compras`
        }
        foot="sem cotação de bezerro no app · calculado pelas suas compras"
      />
    </div>
  );
}
```

- [ ] **Step 6: Write `components/finance/CashStrip.tsx`**

```tsx
import type { CashSummary } from "@/lib/domain/ledger";
import { formatCurrency } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Caixa do período": what came in and went out by payment date, and what is still open. */
export function CashStrip({ cash }: { cash: CashSummary }) {
  const cells = [
    { label: "Recebido", value: cash.received, sub: "vendas e outras receitas", ink: "text-ink" },
    {
      label: "A receber",
      value: cash.receivable,
      sub: plural(cash.receivableCount, "lançamento", "lançamentos"),
      ink: "text-scheduled",
    },
    { label: "Pago", value: cash.paid, sub: "despesas e tratamentos", ink: "text-ink" },
    {
      label: "A pagar",
      value: cash.payable,
      sub:
        plural(cash.payableCount, "conta", "contas") +
        (cash.overdueCount > 0 ? ` · ${plural(cash.overdueCount, "vencida", "vencidas")}` : ""),
      ink: cash.overdueCount > 0 ? "text-overdue" : "text-ink",
    },
    {
      label: "Saldo realizado",
      value: cash.balance,
      sub: "recebido − pago",
      ink: cash.balance >= 0 ? "text-healthy" : "text-overdue",
      // On the phone the balance takes the whole last row.
      className: "col-span-2 bg-surface md:col-span-1 md:bg-panel",
    },
  ];

  return (
    <section
      aria-label="Caixa do período"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5"
    >
      {cells.map((cell) => (
        <div key={cell.label} className={cn("min-w-0 bg-panel px-4 py-3.5", cell.className)}>
          <p className={LABEL}>{cell.label}</p>
          <p className={cn("mt-1 truncate font-mono text-lg font-medium", cell.ink)}>
            {formatCurrency(cell.value)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-soft">{cell.sub}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 7: Rewrite `components/finance/RevenueCostChart.tsx`**

```tsx
import { Wallet } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import type { MonthlyRevenueCost } from "@/lib/domain/economics";
import { formatCompactCurrency } from "@/components/finance/format";
import { cn } from "@/lib/utils";

interface RevenueCostChartProps {
  /** The window's months, oldest first. */
  months: MonthlyRevenueCost[];
}

function LegendDot({ colorClass, text }: { colorClass: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-soft">
      <span aria-hidden className={cn("size-2 rounded-full", colorClass)} />
      {text}
    </span>
  );
}

/** Monthly revenue × cost bars of the window, with the totals and the result above them. */
export function RevenueCostChart({ months }: RevenueCostChartProps) {
  const revenue = months.reduce((sum, month) => sum + month.revenue, 0);
  const cost = months.reduce((sum, month) => sum + month.cost, 0);
  const result = revenue - cost;

  if (revenue === 0 && cost === 0) {
    return (
      <SectionCard title="Receita × Custo" subtitle="por mês, do que a fazenda lançou">
        <EmptyState
          icon={Wallet}
          title="Sem lançamentos financeiros"
          description="Registre vendas com valor e lance despesas para acompanhar receita × custo."
        />
      </SectionCard>
    );
  }

  const groups: BarGroup[] = months.map((month) => ({
    label: month.month,
    bars: [
      { key: "Receita", value: month.revenue, colorClass: "text-brand" },
      { key: "Custo", value: month.cost, colorClass: "text-fmd" },
    ],
  }));

  return (
    <SectionCard title="Receita × Custo" subtitle="por mês, do que a fazenda lançou">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <LegendDot colorClass="bg-brand" text={`Receita ${formatCompactCurrency(revenue)}`} />
        <LegendDot colorClass="bg-fmd" text={`Custo (COE) ${formatCompactCurrency(cost)}`} />
        <span
          className={cn(
            "ml-auto font-mono text-xs font-medium",
            result >= 0 ? "text-healthy" : "text-overdue"
          )}
        >
          resultado {formatCompactCurrency(result)}
        </span>
      </div>
      <BarChart groups={groups} height={220} formatValue={formatCompactCurrency} />
    </SectionCard>
  );
}
```

- [ ] **Step 8: Write `components/finance/MarketPanel.tsx`**

```tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ArrobaQuoteView } from "@/lib/data/useArrobaQuote";
import type { Indicators } from "@/lib/domain/economics";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { Sparkline } from "@/components/charts/sparkline";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";
const DASH = "—";

/**
 * "Mercado": the arroba and its month, then what the price says about the
 * farm — troca, the herd's worth and the price it actually sold at. "—" when
 * the quote is unavailable: the app never shows a made-up price.
 */
export function MarketPanel({ quote, ind }: { quote: ArrobaQuoteView; ind: Indicators }) {
  const price = quote.price;
  const rising = (quote.changePct ?? 0) >= 0;
  const { calvesPerSteer, arrobasPerCalf } = ind.exchange;
  const change = ind.inventoryDeltaBrl;

  const rows = [
    {
      label: "Relação de troca",
      sub:
        arrobasPerCalf === null
          ? "suas compras"
          : `${formatNumber(arrobasPerCalf, 1)} @ por bezerro · suas compras`,
      value: calvesPerSteer === null ? DASH : `1 boi ≈ ${formatNumber(calvesPerSteer, 1)} bezerros`,
    },
    {
      label: "Valor do rebanho",
      sub:
        `${formatNumber(ind.herdArrobas)} @ × cotação` +
        (change === null
          ? ""
          : ` · ${change < 0 ? "−" : "+"}${formatCompactCurrency(Math.abs(change))} no período`),
      value: ind.herdValue === null ? DASH : formatCurrency(ind.herdValue),
    },
    {
      label: "Preço médio realizado",
      sub: `${formatNumber(ind.produced.headsSold)} cab. vendidas · ${formatNumber(ind.produced.sold)} @`,
      value: ind.realizedPerArroba === null ? DASH : `${formatCurrency(ind.realizedPerArroba)}/@`,
    },
  ];

  return (
    <SectionCard title="Mercado" subtitle="cotação, troca e patrimônio">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>Arroba do boi gordo</p>
          <p className="mt-1 font-mono text-2xl font-medium whitespace-nowrap text-ink">
            {price === null ? (
              DASH
            ) : (
              <>
                {formatNumber(price, 2)}
                <span className="text-sm text-ink-soft"> R$/@</span>
              </>
            )}
          </p>
          {quote.changePct !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                rising ? "text-healthy" : "text-overdue"
              )}
            >
              {rising ? (
                <ArrowUpRight className="size-3.5" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden />
              )}
              {rising ? "+" : "−"}
              {formatNumber(Math.abs(quote.changePct), 1)}% no mês
            </span>
          ) : null}
        </div>
        <Sparkline values={quote.series.slice(-12).map((point) => point.value)} />
      </div>

      <ul className="mt-3 border-t border-hairline">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-hairline py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{row.label}</p>
              <p className="mt-px text-xs text-ink-soft">{row.sub}</p>
            </div>
            <span className="font-mono text-sm font-medium whitespace-nowrap text-ink">{row.value}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] leading-4 text-ink-soft">
        {price === null
          ? "Fontes de cotação indisponíveis no momento — os valores que dependem da arroba mostram “—”. Receitas e custos seguem reais, calculados dos lançamentos da fazenda."
          : `Cotação: ${quote.sourceLabel}.${quote.seriesSourceLabel ? ` Histórico: ${quote.seriesSourceLabel}.` : ""}`}
      </p>
    </SectionCard>
  );
}
```

- [ ] **Step 9: Write `components/finance/CostBreakdownCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import type { Account, Expense, ExpenseCategory, Treatment } from "@/lib/types";
import type { CostBreakdownSlice } from "@/lib/domain/economics";
import { accountName } from "@/lib/domain/accounts";
import { inPeriod, periodSearch, type Period } from "@/lib/domain/period";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** Slice colors by rank, largest first, as the Painel's FinanceCard paints them. */
const SLICE_COLORS = [
  "bg-brand",
  "bg-scheduled",
  "bg-attention",
  "bg-fmd",
  "bg-healthy",
  "bg-ink-soft",
  "bg-ink-soft/40",
];

interface CostBreakdownCardProps {
  breakdown: CostBreakdownSlice[];
  expenses: Expense[];
  treatments: Treatment[];
  accounts: Account[];
  period: Period;
}

/** The group's despesas in the window by conta ("Sem conta" when none), plus treatments under Sanidade. */
function accountTotals(
  category: ExpenseCategory,
  expenses: Expense[],
  treatments: Treatment[],
  accounts: Account[],
  period: Period
): { label: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.kind === "revenue" || expense.category !== category) continue;
    if (!inPeriod(expense.date, period)) continue;
    const label = accountName(expense.accountId, accounts) ?? "Sem conta";
    totals.set(label, (totals.get(label) ?? 0) + expense.amountBrl);
  }
  if (category === "health") {
    const treated = treatments.reduce(
      (sum, t) =>
        t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)
          ? sum + t.costBrl
          : sum,
      0
    );
    if (treated > 0) totals.set("Tratamentos (manejos)", treated);
  }
  return [...totals]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** COE by grupo; a grupo opens to its contas, the largest open by default. */
export function CostBreakdownCard({
  breakdown,
  expenses,
  treatments,
  accounts,
  period,
}: CostBreakdownCardProps) {
  // null = the default (largest open); "none" = the user closed every grupo.
  const [picked, setPicked] = useState<ExpenseCategory | "none" | null>(null);
  const open =
    picked === "none" ? null : picked ?? (breakdown.length > 0 ? breakdown[0].category : null);
  const openSlice = breakdown.find((slice) => slice.category === open) ?? null;
  const total = breakdown.reduce((sum, slice) => sum + slice.amountBrl, 0);
  const largest = Math.max(1, ...breakdown.map((slice) => slice.amountBrl));
  const byAccount = openSlice
    ? accountTotals(openSlice.category, expenses, treatments, accounts, period)
    : [];

  const extratoHref = `/finance/extrato?${periodSearch(period)}${open ? `&grupo=${open}` : ""}`;

  return (
    <SectionCard
      title="Composição de custos"
      subtitle={`COE ${formatCurrency(total)} · toque num grupo para abrir as contas`}
      action={
        <Link
          href={extratoHref}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver extrato
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {breakdown.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem custos no período"
          description="Lance despesas (ou tratamentos com custo) para ver a composição."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {breakdown.map((slice, index) => {
              const color = SLICE_COLORS[index % SLICE_COLORS.length];
              const isOpen = slice.category === open;
              return (
                <li key={slice.category}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setPicked(isOpen ? "none" : slice.category)}
                    className={cn(
                      "block min-h-11 w-full rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface md:min-h-0",
                      isOpen && "bg-surface"
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-[13px] text-ink">
                        <span aria-hidden className={cn("size-2 rounded-full", color)} />
                        {EXPENSE_CATEGORY_LABEL[slice.category]}
                      </span>
                      <span className="font-mono text-[13px] whitespace-nowrap text-ink">
                        {formatCurrency(slice.amountBrl)}
                        <span className="text-ink-soft"> · {formatNumber(slice.pct, 1)}%</span>
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="mt-1 block h-1.5 overflow-hidden rounded-full border border-hairline bg-canvas"
                    >
                      <span
                        className={cn("block h-full rounded-full", color)}
                        style={{ width: `${(slice.amountBrl / largest) * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {openSlice ? (
            <div className="mt-3 border-t border-hairline pt-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {EXPENSE_CATEGORY_LABEL[openSlice.category]} por conta
                </span>
                <span className="text-xs text-ink-soft">
                  {byAccount.length} {byAccount.length === 1 ? "conta" : "contas"}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {byAccount.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate pl-4 text-ink">{row.label}</span>
                    <span className="font-mono whitespace-nowrap text-ink">
                      {formatCurrency(row.amount)}
                      <span className="text-ink-soft">
                        {" "}
                        · {formatNumber(openSlice.amountBrl > 0 ? (row.amount / openSlice.amountBrl) * 100 : 0)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 10: Write `components/finance/BillsCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Expense } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { LancarButton } from "@/components/finance/LancarButton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

type Tab = "payables" | "receivables";

interface BillsCardProps {
  /** Pending despesas, oldest vencimento first. */
  payables: Expense[];
  /** Pending receitas, oldest vencimento first. */
  receivables: Expense[];
  canEdit: boolean;
}

/** "Contas": what is still to pay and to receive, ticked off the day it is settled. */
export function BillsCard({ payables, receivables, canEdit }: BillsCardProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const lots = useHerdStore((s) => s.lots);
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("payables");
  const today = todayISO();

  const list = tab === "payables" ? payables : receivables;
  const total = list.reduce((sum, entry) => sum + entry.amountBrl, 0);
  const verb = tab === "payables" ? "pago" : "recebido";
  const tabs: { key: Tab; label: string }[] = [
    { key: "payables", label: `A pagar · ${payables.length}` },
    { key: "receivables", label: `A receber · ${receivables.length}` },
  ];

  async function onMark(entry: Expense) {
    try {
      await markExpensePaid(entry.id, todayISO());
      addToast({ messageType: "success", text: `Marcado como ${verb}` });
    } catch {
      // apiFail has shown the error toast.
    }
  }

  return (
    <SectionCard
      title="Contas"
      subtitle="vencimentos em aberto · marque quando pagar"
      action={
        <LancarButton
          size="sm"
          variant="ghost"
          defaultKind={tab === "receivables" ? "revenue" : "expense"}
        />
      }
    >
      <div className="mb-2 inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
              tab === item.key
                ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                : "text-ink-soft hover:text-ink"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nada em aberto"
          description={
            tab === "payables"
              ? "Nenhuma despesa esperando pagamento."
              : "Nenhuma receita esperando recebimento."
          }
        />
      ) : (
        <>
          <ul>
            {list.map((entry, index) => {
              const due = effectiveDueDate(entry);
              const late = due < today;
              const group = entry.kind === "revenue" ? "revenue" : entry.category;
              const conta = accountName(entry.accountId, accounts);
              const title = conta
                ? `${ACCOUNT_GROUP_LABEL[group]} › ${conta}`
                : ACCOUNT_GROUP_LABEL[group];
              const lotName = entry.lotId
                ? lots.find((lot) => lot.id === entry.lotId)?.name
                : undefined;
              const detail = [entry.counterparty ?? entry.notes, lotName].filter(Boolean).join(" · ");
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "flex min-h-12 items-center gap-1 py-1",
                    index > 0 && "border-t border-hairline"
                  )}
                >
                  <label className="-ml-3 flex size-11 shrink-0 cursor-pointer items-center justify-center has-disabled:cursor-default">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={!canEdit}
                      onChange={() => onMark(entry)}
                      aria-label={`Marcar ${title} como ${verb}`}
                      className="size-4 accent-brand"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{title}</p>
                    {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2">
                    <span className="font-mono text-sm font-medium whitespace-nowrap text-ink">
                      {formatCurrency(entry.amountBrl)}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[11px] whitespace-nowrap",
                        late ? "text-overdue" : "text-ink-soft"
                      )}
                    >
                      {late ? "venceu" : "vence"} {formatDate(due).slice(0, 5)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="-mx-4 mt-2 -mb-4 flex items-center justify-between gap-2 rounded-b-lg border-t border-hairline bg-surface px-4 py-2.5">
            <span className="text-[13px] font-semibold text-ink">
              {tab === "payables" ? "Total a pagar" : "Total a receber"}
            </span>
            <span className="font-mono text-sm font-semibold whitespace-nowrap text-ink">
              {formatCurrency(total)}
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 11: Write `components/finance/RecentEntriesCard.tsx`**

```tsx
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ReceiptText } from "lucide-react";
import type { LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { periodSearch, type Period } from "@/lib/domain/period";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const RECENT = 5;

/** StatusPill's colors with the ledger's words (StatusPill's own labels are fixed). */
const STATUS: Record<LedgerStatus, { label: string; pill: string; dot: string }> = {
  paid: { label: "pago", pill: "bg-healthy-soft text-healthy", dot: "bg-healthy" },
  received: { label: "recebido", pill: "bg-healthy-soft text-healthy", dot: "bg-healthy" },
  payable: { label: "a pagar", pill: "bg-attention-soft text-attention", dot: "bg-attention" },
  receivable: { label: "a receber", pill: "bg-scheduled-soft text-scheduled", dot: "bg-scheduled" },
  overdue: { label: "vencida", pill: "bg-overdue-soft text-overdue", dot: "bg-overdue" },
};

/** The five newest Extrato rows of the window. */
export function RecentEntriesCard({ rows, period }: { rows: LedgerRow[]; period: Period }) {
  const recent = rows.slice(0, RECENT);

  return (
    <SectionCard
      title="Últimos lançamentos"
      subtitle={`${rows.length} no período · despesas, receitas, vendas e compras`}
      action={
        <Link
          href={`/finance/extrato?${periodSearch(period)}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver extrato
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {recent.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhum lançamento no período"
          description="Lance despesas e receitas, ou registre vendas e compras nos manejos."
        />
      ) : (
        <ul>
          {recent.map((row, index) => {
            const income = row.kind === "revenue" || row.kind === "sale";
            const status = STATUS[row.status];
            const title = row.account ? `${row.groupLabel} › ${row.account}` : row.groupLabel;
            const detail = [row.counterparty ?? row.notes, row.lotName].filter(Boolean).join(" · ");
            return (
              <li
                key={row.id}
                className={cn(
                  "flex min-h-11 items-center gap-3 py-2",
                  index > 0 && "border-t border-hairline"
                )}
              >
                <span className="w-10 shrink-0 font-mono text-xs text-ink-soft">
                  {formatDate(row.date).slice(0, 5)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    income ? "bg-healthy-soft text-healthy" : "bg-surface text-ink-soft"
                  )}
                >
                  {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {title}
                    {row.locked ? (
                      <span className="text-[11px] font-normal text-ink-soft"> · automático</span>
                    ) : null}
                  </p>
                  {detail ? <p className="mt-px truncate text-xs text-ink-soft">{detail}</p> : null}
                </div>
                <span
                  className={cn(
                    "hidden items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap sm:inline-flex",
                    status.pill
                  )}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-sm font-medium whitespace-nowrap",
                    income ? "text-healthy" : "text-ink"
                  )}
                >
                  {income ? "+" : "−"}
                  {formatCurrency(row.amountBrl)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 12: Write `components/finance/LotsEconomicsCard.tsx`**

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const DASH = "—";
const COLUMNS = [
  "Cab.",
  "Custo direto",
  "Rateio",
  "Custo total",
  "R$/cab/dia",
  "GMD",
  "@ produzidas",
  "Custo/@",
  "Margem/@",
];

const money = (value: number | null) => (value === null ? DASH : formatCurrency(value));
const number = (value: number | null, decimals = 0) =>
  value === null ? DASH : formatNumber(value, decimals);

function Margin({ value }: { value: number | null }) {
  if (value === null) return <>{DASH}</>;
  return (
    <span className={cn("font-medium", value >= 0 ? "text-healthy" : "text-overdue")}>
      {value >= 0 ? "+" : "−"}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

/** The nine figure cells of a row, in COLUMNS order. */
function figures(row: LotEconomics): ReactNode[] {
  return [
    formatNumber(row.heads),
    money(row.directBrl),
    <span key="shared" className="text-ink-soft">
      {money(row.sharedBrl)}
    </span>,
    money(row.totalBrl),
    number(row.perHeadDay, 2),
    row.adg === null ? DASH : `${formatNumber(row.adg, 2)} kg`,
    number(row.produced),
    money(row.costPerArroba),
    <Margin key="margin" value={row.marginPerArroba} />,
  ];
}

interface LotsEconomicsCardProps {
  lots: LotEconomics[];
  farm: LotEconomics;
  /** Today's arroba price, or null when unavailable. */
  quote: number | null;
}

/** "Por lote": each lote as a centro de custo, with the farm's totals under it. */
export function LotsEconomicsCard({ lots, farm, quote }: LotsEconomicsCardProps) {
  return (
    <SectionCard
      title="Por lote"
      subtitle="custo direto + rateio por cabeça · lote como centro de custo"
      action={
        <Link
          href="/lots"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {lots.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum lote ativo"
          description="Crie lotes e lance custos neles para ver o custo por lote."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] tracking-wide text-ink-soft uppercase">Lote</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column}
                      className="text-right text-[11px] tracking-wide text-ink-soft uppercase"
                    >
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((row) => (
                  <TableRow key={row.lotId ?? row.name}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{row.name}</span>
                        <span className="text-xs text-ink-soft">{formatNumber(row.heads)} cab</span>
                      </div>
                    </TableCell>
                    {figures(row).map((cell, index) => (
                      <TableCell key={COLUMNS[index]} className="text-right font-mono whitespace-nowrap">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Fazenda</TableCell>
                  {figures(farm).map((cell, index) => (
                    <TableCell
                      key={COLUMNS[index]}
                      className="text-right font-mono font-semibold whitespace-nowrap"
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <ul className="-mt-1 md:hidden">
            {lots.map((row, index) => (
              <li
                key={row.lotId ?? row.name}
                className={cn("py-3", index > 0 && "border-t border-hairline")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{row.name}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{formatNumber(row.heads)} cab</span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-ink-soft">Custo</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">
                      {formatCompactCurrency(row.totalBrl)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-ink-soft">R$/cab/dia</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">{number(row.perHeadDay, 2)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-ink-soft">Custo/@</dt>
                    <dd className="mt-0.5 font-mono text-sm text-ink">{money(row.costPerArroba)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-soft">
            Rateio: despesas sem lote divididas por cabeça. Margem/@ na cotação de hoje (
            {quote === null ? DASH : formatCurrency(quote)}).
          </p>
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 13: Write `components/finance/FinanceHeader.tsx`**

```tsx
import type { Indicators } from "@/lib/domain/economics";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import type { Period } from "@/lib/domain/period";
import { formatDate } from "@/lib/domain/dates";
import { indicatorsExportTable, lotsEconomicsExportTable } from "@/lib/export/datasets/finance";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { ExportMenu } from "@/components/export/ExportMenu";
import { LancarButton } from "@/components/finance/LancarButton";

interface FinanceHeaderProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  canEdit: boolean;
  ind: Indicators;
  prior: Indicators;
  lots: LotEconomics[];
  farm: LotEconomics;
}

/** Title, the window, "Exportar" (desktop) and "Lançar" (Financeiro edit only). */
export function FinanceHeader({
  period,
  onPeriodChange,
  canEdit,
  ind,
  prior,
  lots,
  farm,
}: FinanceHeaderProps) {
  return (
    <PageHeader
      title="Financeiro"
      subtitle="Indicadores da pecuária de corte"
      badges={canEdit ? undefined : <ReadOnlyPill />}
      actions={
        <>
          <PeriodPicker value={period} onChange={onPeriodChange} />
          <ExportMenu
            title="Financeiro"
            formats={["xlsx", "print"]}
            className="hidden md:inline-flex"
            current={{
              label: "Financeiro",
              detail: `de ${formatDate(period.start)} até ${formatDate(period.end)}`,
              build: () => [indicatorsExportTable(ind, prior), lotsEconomicsExportTable(lots, farm)],
            }}
            hint="Duas tabelas: os indicadores do período contra o ano anterior e o custo por lote."
          />
          <LancarButton />
        </>
      }
    />
  );
}
```

- [ ] **Step 14: Rewrite `app/(app)/finance/page.tsx`**

```tsx
"use client";

/**
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * the eight indicators against their references and the year before, receita
 * × custo, mercado, composição, contas, custo por lote and the newest
 * lançamentos. Every figure follows the window.
 */
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { todayISO } from "@/lib/domain/dates";
import { filterMonthlyByPeriod } from "@/lib/domain/finance";
import { periodFromSearch, periodSearch, priorPeriod, type Period } from "@/lib/domain/period";
import {
  costBreakdownBetween,
  indicatorDeltas,
  indicators,
  monthlyRevenueCost,
  type EconomicsInputs,
} from "@/lib/domain/economics";
import { cashSummary, ledgerRows, pendingBills } from "@/lib/domain/ledger";
import { lotEconomics } from "@/lib/domain/lotEconomics";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { FinanceHeader } from "@/components/finance/FinanceHeader";
import { CashStrip } from "@/components/finance/CashStrip";
import { Placar } from "@/components/finance/Placar";
import { RevenueCostChart } from "@/components/finance/RevenueCostChart";
import { MarketPanel } from "@/components/finance/MarketPanel";
import { CostBreakdownCard } from "@/components/finance/CostBreakdownCard";
import { BillsCard } from "@/components/finance/BillsCard";
import { LotsEconomicsCard } from "@/components/finance/LotsEconomicsCard";
import { RecentEntriesCard } from "@/components/finance/RecentEntriesCard";

/**
 * Opened by URL without Financeiro, the page is the "Porteira fechada" of
 * NoAccess. The window lives in the URL query, which useSearchParams reads
 * inside a Suspense boundary.
 */
export default function FinancePage() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <FinanceContent />
      </Suspense>
    </RequireAccess>
  );
}

/** Calendar months from `startIso`'s month through `refIso`'s, at least one. */
function monthsSpanned(startIso: string, refIso: string): number {
  const [startYear, startMonth] = startIso.split("-").map(Number);
  const [refYear, refMonth] = refIso.split("-").map(Number);
  return Math.max(1, (refYear - startYear) * 12 + refMonth - startMonth + 1);
}

function FinanceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const movements = useHerdStore((s) => s.movements);
  const treatments = useHerdStore((s) => s.treatments);
  const expenses = useHerdStore((s) => s.expenses);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lots = useHerdStore((s) => s.lots);
  const accounts = useHerdStore((s) => s.accounts);
  // Live arroba quote; null price = every @-figure shows "—".
  const quote = useArrobaQuote();
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const setPeriod = (next: Period) =>
    router.replace(`/finance?${periodSearch(next)}`, { scroll: false });

  const inputs = useMemo<EconomicsInputs>(
    () => ({ animals, manejoSessions, movements, treatments, expenses, invernadas, lots }),
    [animals, manejoSessions, movements, treatments, expenses, invernadas, lots]
  );
  const ind = useMemo(
    () => indicators(inputs, period, quote.price, today),
    [inputs, period, quote.price, today]
  );
  const prior = useMemo(
    () => indicators(inputs, priorPeriod(period), quote.price, today),
    [inputs, period, quote.price, today]
  );
  const deltas = useMemo(() => indicatorDeltas(ind, prior), [ind, prior]);
  const cash = useMemo(
    () => cashSummary({ expenses, movements, treatments }, period, today),
    [expenses, movements, treatments, period, today]
  );
  const rows = useMemo(
    () => ledgerRows({ ...inputs, accounts }, period, today),
    [inputs, accounts, period, today]
  );
  const lotEcon = useMemo(
    () => lotEconomics(inputs, period, quote.price, today),
    [inputs, period, quote.price, today]
  );
  const series = useMemo(
    () =>
      filterMonthlyByPeriod(
        monthlyRevenueCost(movements, treatments, expenses, monthsSpanned(period.start, today), today),
        period
      ),
    [movements, treatments, expenses, period, today]
  );
  const breakdown = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
  );
  const bills = useMemo(() => pendingBills(expenses, today), [expenses, today]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <FinanceHeader
        period={period}
        onPeriodChange={setPeriod}
        canEdit={canEdit}
        ind={ind}
        prior={prior}
        lots={lotEcon.lots}
        farm={lotEcon.farm}
      />

      <CashStrip cash={cash} />

      <Placar ind={ind} deltas={deltas} quote={quote.price} />

      {/* Desktop reads in rows; the phone reorders to chart, composição, contas, lançamentos, lotes, mercado. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="order-1 lg:col-span-7">
          <RevenueCostChart months={series} />
        </div>
        <div className="order-6 lg:order-2 lg:col-span-5">
          <MarketPanel quote={quote} ind={ind} />
        </div>
        <div className="order-2 lg:order-3 lg:col-span-6">
          <CostBreakdownCard
            breakdown={breakdown}
            expenses={expenses}
            treatments={treatments}
            accounts={accounts}
            period={period}
          />
        </div>
        <div className="order-3 lg:order-4 lg:col-span-6">
          <BillsCard payables={bills.payables} receivables={bills.receivables} canEdit={canEdit} />
        </div>
        <div className="order-5 lg:col-span-12">
          <LotsEconomicsCard lots={lotEcon.lots} farm={lotEcon.farm} quote={quote.price} />
        </div>
        <div className="order-4 lg:order-6 lg:col-span-12">
          <RecentEntriesCard rows={rows} period={period} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 15: Type-check, lint and run the tests**

```bash
cd /home/luketa/meubov
pnpm tsc --noEmit
pnpm exec eslint app components lib --ignore-pattern '.claude/**'
TZ=America/Sao_Paulo pnpm exec vitest run lib components --passWithNoTests
```
Expected: tsc silent (the `app/(app)/finance/page.tsx` errors Task 4 left are gone), eslint with no errors, vitest all green. There are no new tests because Tasks 2–5 and 12 cover the domain.

- [ ] **Step 16: Open the page on the dev server**

```bash
cd /home/luketa/meubov
pnpm dev
```
(Run it in the background.) Sign in with a throwaway `teste.*` user that holds the seeded farm, then open `http://localhost:3000/finance` and `http://localhost:3000/finance?de=2025-01-01&ate=2025-12-31`. Check that the page renders without console errors, that the PeriodPicker arrows change the `de`/`ate` query, that "Ver extrato" carries the window, and that the phone width (390 px) stacks Caixa in two columns with Saldo on its own row. Task 13's smoke runs the full desktop/phone and edit/view pass. Stop the server.

- [ ] **Step 17: Commit**

```bash
cd /home/luketa/meubov
git add "app/(app)/finance/page.tsx" components/finance/FinanceHeader.tsx components/finance/CashStrip.tsx \
  components/finance/BenchmarkBand.tsx components/finance/IndicatorCard.tsx components/finance/CostVsPriceCard.tsx \
  components/finance/Placar.tsx components/finance/MarketPanel.tsx components/finance/CostBreakdownCard.tsx \
  components/finance/BillsCard.tsx components/finance/RecentEntriesCard.tsx components/finance/LotsEconomicsCard.tsx \
  components/finance/RevenueCostChart.tsx lib/export/datasets/finance.ts lib/export/__tests__/finance.test.ts
git status --short
git commit -m "feat(finance): open Financeiro on the cockpit of the window

Caixa do período, the eight indicators against their reference bands and
the year before, receita x custo, mercado, composição by conta, contas a
pagar e a receber, custo por lote and the newest lançamentos. The window
lives in ?de&ate. The old KPI row, donut, sales-by-category table and
despesas list go."
```
Expected: `git status --short` lists only the files above and the nine deletions from Step 1 as staged. The message has no trailer lines.

---

### Task 10: Extrato — /finance/extrato

**Files:**
- Create: `app/(app)/finance/extrato/page.tsx`
- Create: `components/finance/extrato/ExtratoPage.tsx`
- Create: `components/finance/extrato/ExtratoFilters.tsx`
- Create: `components/finance/extrato/ExtratoSummary.tsx`
- Create: `components/finance/extrato/ExtratoTable.tsx`
- Create: `components/finance/extrato/ExtratoList.tsx`
- Create: `components/finance/extrato/RowActions.tsx`
- Modify: none (verified: `PeriodPicker`, `ExportMenu`, `PageHeader`, `ReadOnlyPill`, `RequireAccess`, `components/herd/pagination.ts`, `components/providers/Toasts.tsx` are used as they are).
- Test: no unit test (the logic lives in `lib/domain/ledger.ts`, tested by Task 3); `pnpm tsc --noEmit`, `pnpm lint`, a manual look at `/finance/extrato`; Task 13's smoke run covers desktop + phone at edit and view.

Notes verified against the repo:
- `components/ui` has no `tabs`, `checkbox` or `sheet` (the contract's list is wrong there). The tipo tabs are a local segmented `aria-pressed` group with the repo's segmented look (`components/team/PermissionsGrid.tsx`; the same classes as Task 8's Despesa | Receita switch and Task 9's A pagar | A receber); the phone "Filtros" sheet and the row sheet are a `Dialog` pinned to the bottom (`BOTTOM_SHEET`).
- `StatusPill` has fixed labels (`Saudável`, `Atrasado`...), so the Tipo and Status pills are local spans with the same `*-soft` tokens.
- Pagination reuses `paginate`, `pageWindow`, `ELLIPSIS` and `Page<T>` from `components/herd/pagination.ts` (its `rangeLabel` says "animais", so the caption is local).
- `useSearchParams` must sit under a `Suspense` boundary (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`, "Prerendering"), as `app/(app)/baixas/page.tsx` does. `router.replace(href, { scroll: false })` as in `components/manejo/manejo-history.tsx`.
- Store actions throw after `apiFail` already toasted the error, so callers only toast success and swallow the throw.
- `AppShell` gives `main` `pb-28` on phones; the page adds `pb-16` so the floating "Lançar" (`bottom-24`, 48px) never covers the last row.
- Canvas: the artifact's `project/Extrato-Desktop.dc.html` (lower-case pills with a dot on status, "Grupo: todos" triggers, a "Lançamentos" card with "mais recentes primeiro · vendas e compras vêm dos manejos", summary subs "vendas e outras receitas", "despesas e tratamentos", "receitas − despesas"). The phone layout follows the spec and `project/Extrato-Phone.dc.html`.

**Interfaces:**
- Consumes:
  - `import { periodFromSearch, periodSearch, type Period } from "@/lib/domain/period";` (T2)
  - `import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountsByGroup, accountName } from "@/lib/domain/accounts";` (T2)
  - `import { filterLedger, ledgerRows, ledgerSummary, type LedgerFilter, type LedgerKind, type LedgerRow, type LedgerStatus, type LedgerSummary } from "@/lib/domain/ledger";` (T3)
  - `import type { Account, AccountGroup, Lot } from "@/lib/types";` (T1)
  - `useHerdStore` slices `expenses, accounts, movements, manejoSessions, animals, treatments, lots` and actions `markExpensePaid(id, paidAt)`, `removeExpense(id)` (T7)
  - `import { EntryDialog } from "@/components/finance/EntryDialog";` with `{ open, onOpenChange, expense? }` (T8)
  - `import { LancarButton } from "@/components/finance/LancarButton";` with `{ className? }` (T8)
  - `import { ledgerExportTable } from "@/lib/export/datasets/finance";` (T12)
- Produces:
  - `app/(app)/finance/extrato/page.tsx` default export `ExtratoRoute`.
  - `ExtratoPage()` — reads/writes the URL query `de, ate, tipo, grupo, conta, lote, status, q, pagina`.
  - `ExtratoFilters({ period, filter, accounts, lots, activeCount, onPeriodChange, onChange })`; exports `type StatusChoice`, `type ExtratoFilter`, `type FilterKey`, `KIND_TABS`, `KIND_TAB_LABEL`, `STATUS_CHOICES`, `STATUS_CHOICE_LABEL`, `BOTTOM_SHEET`.
  - `ExtratoSummary({ rows, summary })`.
  - `ExtratoTable({ page, onPageChange })`; exports `LedgerKindPill({ kind })`, `LedgerStatusPill({ status })`, `LedgerAmount({ row, className? })`.
  - `ExtratoList({ rows })`.
  - `RowActions({ row, labeled?, onDone? })`.
  - URL values: `tipo` = `LedgerKind`; `grupo` = `AccountGroup | "capital"`; `conta` = account id; `lote` = lot id | `farm`; `status` = `settled` (pago ou recebido) | `payable` | `receivable` | `overdue`; `q` trimmed text; `pagina` ≥ 2. Defaults (`all`, empty, page 1) are dropped from the URL.

- [ ] **Step 1: Write `components/finance/extrato/RowActions.tsx`**

```tsx
"use client";

/**
 * What a row of the Extrato lets you do. A lançamento: Editar (the
 * EntryDialog filled in), Marcar como pago / recebido while pending, and
 * Remover after a confirmation. A row the manejos wrote is locked and says
 * so. The buttons need Financeiro at edit.
 */
import { useState } from "react";
import { CheckCircle2, Lock, Pencil, Trash2 } from "lucide-react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
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
  if (!canEdit || !expense) return null;

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

  const remove = async () => {
    setBusy(true);
    try {
      await removeExpense(expense.id);
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
      </div>

      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}

      <Dialog
        open={confirming}
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
              onClick={remove}
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

- [ ] **Step 2: Write `components/finance/extrato/ExtratoTable.tsx`**

```tsx
"use client";

/**
 * The Extrato on md+: one table row per ledger row, 50 per page, with the
 * pager in the card's footer. Also exports the Tipo and Status pills and the
 * signed value, which the phone list reuses.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LedgerKind, LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { ELLIPSIS, pageWindow, type Page } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActions } from "@/components/finance/extrato/RowActions";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

const KIND_PILL: Record<LedgerKind, { label: string; className: string }> = {
  expense: { label: "despesa", className: "bg-surface text-ink-soft" },
  revenue: { label: "receita", className: "bg-healthy-soft text-healthy" },
  sale: { label: "venda", className: "bg-brand-soft text-brand" },
  purchase: { label: "compra", className: "bg-scheduled-soft text-scheduled" },
  treatment: { label: "tratamento", className: "bg-fmd-soft text-fmd" },
};

const STATUS_PILL: Record<LedgerStatus, { label: string; className: string }> = {
  paid: { label: "pago", className: "bg-healthy-soft text-healthy" },
  received: { label: "recebido", className: "bg-healthy-soft text-healthy" },
  payable: { label: "a pagar", className: "bg-attention-soft text-attention" },
  receivable: { label: "a receber", className: "bg-scheduled-soft text-scheduled" },
  overdue: { label: "vencida", className: "bg-overdue-soft text-overdue" },
};

export function LedgerKindPill({ kind }: { kind: LedgerKind }) {
  const pill = KIND_PILL[kind];
  return <span className={cn(PILL, pill.className)}>{pill.label}</span>;
}

export function LedgerStatusPill({ status }: { status: LedgerStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span className={cn(PILL, pill.className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {pill.label}
    </span>
  );
}

/** Receitas and vendas come in: "+" and healthy. */
export function LedgerAmount({ row, className }: { row: LedgerRow; className?: string }) {
  const incoming = row.kind === "revenue" || row.kind === "sale";
  return (
    <span
      className={cn(
        "font-mono whitespace-nowrap tabular-nums",
        incoming ? "text-healthy" : "text-ink",
        className
      )}
    >
      {incoming ? "+" : ""}
      {formatCurrency(row.amountBrl)}
    </span>
  );
}

const HEAD = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

interface ExtratoTableProps {
  page: Page<LedgerRow>;
  onPageChange: (page: number) => void;
}

export function ExtratoTable({ page, onPageChange }: ExtratoTableProps) {
  return (
    <SectionCard
      title="Lançamentos"
      subtitle="mais recentes primeiro · vendas e compras vêm dos manejos"
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(HEAD, "pl-4")}>Data</TableHead>
            <TableHead className={HEAD}>Vencimento</TableHead>
            <TableHead className={HEAD}>Tipo</TableHead>
            <TableHead className={HEAD}>Grupo › Conta</TableHead>
            <TableHead className={cn(HEAD, "whitespace-normal")}>Pago para / Recebido de</TableHead>
            <TableHead className={HEAD}>Documento</TableHead>
            <TableHead className={HEAD}>Lote</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Valor</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={cn(HEAD, "pr-4 text-right")}>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="pl-4 font-mono text-xs text-ink">{formatDate(row.date)}</TableCell>
              <TableCell className="font-mono text-xs text-ink-soft">{formatDate(row.dueDate)}</TableCell>
              <TableCell>
                <LedgerKindPill kind={row.kind} />
              </TableCell>
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
              <TableCell>
                {row.lotName ? (
                  <span className="text-ink">{row.lotName}</span>
                ) : (
                  <span className="text-xs text-ink-soft">fazenda</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <LedgerAmount row={row} />
              </TableCell>
              <TableCell>
                <LedgerStatusPill status={row.status} />
              </TableCell>
              <TableCell className="pr-4 text-right">
                <RowActions row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <nav
        aria-label="Paginação"
        className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-sm text-ink-soft"
      >
        <span aria-live="polite">
          Mostrando {formatNumber(page.from)}–{formatNumber(page.to)} de {formatNumber(page.total)}
        </span>
        {page.pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={page.page === 1}
              onClick={() => onPageChange(page.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft aria-hidden />
            </Button>
            {pageWindow(page.page, page.pageCount).map((slot, index) =>
              slot === ELLIPSIS ? (
                <span key={`ellipsis-${index}`} aria-hidden className="w-8 text-center">
                  …
                </span>
              ) : (
                <Button
                  key={slot}
                  variant={slot === page.page ? "outline" : "ghost"}
                  size="icon"
                  className={cn("font-mono", slot === page.page && "pointer-events-none text-ink")}
                  aria-current={slot === page.page ? "page" : undefined}
                  aria-label={`Página ${slot}`}
                  onClick={() => onPageChange(slot)}
                >
                  {formatNumber(slot)}
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={page.page === page.pageCount}
              onClick={() => onPageChange(page.page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </nav>
    </SectionCard>
  );
}
```

- [ ] **Step 3: Write `components/finance/extrato/ExtratoFilters.tsx`**

```tsx
"use client";

/**
 * The Extrato's filters card: the window, the tipo tabs, grupo, conta, lote,
 * status and the text search. On a phone the window and the tipo tabs stay on
 * the page and the rest opens in a "Filtros" sheet.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Account, AccountGroup, Lot } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountsByGroup } from "@/lib/domain/accounts";
import type { LedgerFilter, LedgerKind } from "@/lib/domain/ledger";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** "pagos / recebidos" is one choice over two ledger statuses. */
export type StatusChoice = "all" | "settled" | "payable" | "receivable" | "overdue";
export type ExtratoFilter = Omit<LedgerFilter, "status"> & { status: StatusChoice };
/** The URL keys the filters write. */
export type FilterKey = "tipo" | "grupo" | "conta" | "lote" | "status" | "q";

export const KIND_TABS: readonly (LedgerKind | "all")[] = [
  "all",
  "expense",
  "revenue",
  "sale",
  "purchase",
  "treatment",
];
export const KIND_TAB_LABEL: Record<LedgerKind | "all", string> = {
  all: "Tudo",
  expense: "Despesas",
  revenue: "Receitas",
  sale: "Vendas",
  purchase: "Compras",
  treatment: "Tratamentos",
};
export const STATUS_CHOICES: readonly StatusChoice[] = ["all", "settled", "payable", "receivable", "overdue"];
export const STATUS_CHOICE_LABEL: Record<StatusChoice, string> = {
  all: "todos",
  settled: "pagos / recebidos",
  payable: "a pagar",
  receivable: "a receber",
  overdue: "vencidas",
};

/** A Dialog pinned to the bottom of a phone screen. */
export const BOTTOM_SHEET =
  "top-auto bottom-0 left-0 w-full max-w-full translate-x-0 translate-y-0 rounded-b-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-full";

const SEARCH_DELAY_MS = 300;

interface ExtratoFiltersProps {
  period: Period;
  filter: ExtratoFilter;
  accounts: Account[];
  /** The lotes offered: the active ones plus removed ones the window's rows name. */
  lots: Lot[];
  /** Filters besides the window and the tipo that narrow the list (the "Filtros" count). */
  activeCount: number;
  onPeriodChange: (period: Period) => void;
  onChange: (changes: Partial<Record<FilterKey, string>>) => void;
}

export function ExtratoFilters({
  period,
  filter,
  accounts,
  lots,
  activeCount,
  onPeriodChange,
  onChange,
}: ExtratoFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const fields = { filter, accounts, lots, onChange };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-3 md:flex-row md:flex-wrap md:items-center md:gap-2 md:p-4">
      {/* PeriodPicker is inline-flex: full width on a phone. */}
      <div className="[&>div]:flex [&>div]:w-full [&_input]:flex-1 md:[&>div]:inline-flex md:[&>div]:w-auto md:[&_input]:flex-none">
        <PeriodPicker value={period} onChange={onPeriodChange} />
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            role="group"
            aria-label="Tipo"
            className="inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
          >
            {KIND_TABS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={filter.kind === kind}
                onClick={() => onChange({ tipo: kind })}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
                  filter.kind === kind
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {KIND_TAB_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>

        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="min-h-11 shrink-0 md:hidden">
              <SlidersHorizontal aria-hidden />
              Filtros{activeCount > 0 ? ` · ${activeCount}` : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className={BOTTOM_SHEET} aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Filtros</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <FilterFields {...fields} stacked />
            </div>
            <Button className="min-h-11" onClick={() => setSheetOpen(false)}>
              Ver lançamentos
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden md:contents">
        <FilterFields {...fields} />
      </div>
    </section>
  );
}

interface FilterFieldsProps {
  filter: ExtratoFilter;
  accounts: Account[];
  lots: Lot[];
  onChange: ExtratoFiltersProps["onChange"];
  /** Full-width fields, one per line (the phone sheet). */
  stacked?: boolean;
}

function FilterFields({ filter, accounts, lots, onChange, stacked = false }: FilterFieldsProps) {
  const byGroup = accountsByGroup(accounts, true);
  const accountOptions =
    filter.group === "all"
      ? ACCOUNT_GROUPS.flatMap((group) => byGroup[group])
      : filter.group === "capital"
        ? []
        : byGroup[filter.group];

  return (
    <>
      <FilterSelect
        label="Grupo"
        value={filter.group}
        stacked={stacked}
        onValueChange={(grupo) => onChange({ grupo, conta: "all" })}
      >
        <SelectItem value="all">todos</SelectItem>
        {ACCOUNT_GROUPS.map((group: AccountGroup) => (
          <SelectItem key={group} value={group}>
            {ACCOUNT_GROUP_LABEL[group]}
          </SelectItem>
        ))}
        <SelectItem value="capital">Capital</SelectItem>
      </FilterSelect>

      <FilterSelect
        label="Conta"
        value={filter.accountId}
        stacked={stacked}
        disabled={accountOptions.length === 0}
        onValueChange={(conta) => onChange({ conta })}
      >
        <SelectItem value="all">todas</SelectItem>
        {accountOptions.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {filter.group === "all"
              ? `${account.name} · ${ACCOUNT_GROUP_LABEL[account.group]}`
              : account.name}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Lote"
        value={filter.lotId}
        stacked={stacked}
        onValueChange={(lote) => onChange({ lote })}
      >
        <SelectItem value="all">todos</SelectItem>
        <SelectItem value="farm">Fazenda (sem lote)</SelectItem>
        {lots.map((lot) => (
          <SelectItem key={lot.id} value={lot.id}>
            {lot.deletedAt ? `${lot.name} (removido)` : lot.name}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Status"
        value={filter.status}
        stacked={stacked}
        onValueChange={(status) => onChange({ status })}
      >
        {STATUS_CHOICES.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_CHOICE_LABEL[status]}
          </SelectItem>
        ))}
      </FilterSelect>

      <SearchField value={filter.search} stacked={stacked} onSearch={(q) => onChange({ q })} />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  disabled,
  stacked,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  stacked: boolean;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={`Filtrar por ${label.toLowerCase()}`}
        className={cn("min-h-11 font-medium md:min-h-0", stacked && "w-full")}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-ink-soft">{label}:</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/** Types into local state; `q` in the URL catches up 300 ms after the last key. */
function SearchField({
  value,
  stacked,
  onSearch,
}: {
  value: string;
  stacked: boolean;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // The URL's q changed elsewhere ("Limpar filtros", the other field): the box follows it.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  return (
    <div className={cn("relative", stacked ? "w-full" : "md:w-56")}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-soft"
      />
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Pago para / recebido de"
        aria-label="Buscar por conta, pago para / recebido de, documento ou observação"
        className="h-11 pl-8 md:h-8"
      />
    </div>
  );
}
```

- [ ] **Step 4: Write `components/finance/extrato/ExtratoSummary.tsx`**

```tsx
/**
 * The strip over the Extrato's rows: Receitas, Despesas (COE), Vendas and
 * Compras de gado, and the Resultado, all over the filtered rows.
 */
import type { LedgerKind, LedgerRow, LedgerSummary } from "@/lib/domain/ledger";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const heads = (rows: LedgerRow[], kind: LedgerKind): number =>
  rows.reduce((sum, row) => (row.kind === kind ? sum + (row.headCount ?? 0) : sum), 0);

const count = (n: number, one: string, many: string): string =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

export function ExtratoSummary({ rows, summary }: { rows: LedgerRow[]; summary: LedgerSummary }) {
  const cells = [
    { label: "Receitas", value: summary.revenue, sub: "vendas e outras receitas", tone: "text-ink" },
    { label: "Despesas (COE)", value: summary.coe, sub: "despesas e tratamentos", tone: "text-ink" },
    {
      label: "Vendas de gado",
      value: summary.sales,
      sub: `${count(heads(rows, "sale"), "cabeça", "cabeças")} · entram nas receitas`,
      tone: "text-ink",
    },
    {
      label: "Compras de gado",
      value: summary.purchases,
      sub: `${count(heads(rows, "purchase"), "bezerro", "bezerros")} · capital, fora do COE`,
      tone: "text-ink",
    },
    {
      label: "Resultado",
      value: summary.result,
      sub: "receitas − despesas",
      tone: summary.result >= 0 ? "text-healthy" : "text-overdue",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-5">
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={cn("bg-panel px-4 py-3", index === cells.length - 1 && "col-span-2 md:col-span-1")}
        >
          <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">{cell.label}</dt>
          <dd className={cn("mt-1 font-mono text-base tabular-nums md:text-lg", cell.tone)}>
            {formatCurrency(cell.value)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-ink-soft">{cell.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 5: Write `components/finance/extrato/ExtratoList.tsx`**

```tsx
"use client";

/**
 * The Extrato on a phone: one line per row (date, conta, "grupo · quem ·
 * lote", value and status), 50 at a time with "Carregar mais". A tap opens
 * the row in a bottom sheet with its details and actions.
 */
import { useState, type ReactNode } from "react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BOTTOM_SHEET } from "@/components/finance/extrato/ExtratoFilters";
import {
  LedgerAmount,
  LedgerKindPill,
  LedgerStatusPill,
} from "@/components/finance/extrato/ExtratoTable";
import { RowActions } from "@/components/finance/extrato/RowActions";

const PAGE_SIZE = 50;

function subline(row: LedgerRow): string {
  return [row.account ? row.groupLabel : null, row.counterparty, row.lotName ?? "fazenda"]
    .filter(Boolean)
    .join(" · ");
}

export function ExtratoList({ rows }: { rows: LedgerRow[] }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up on every render: a removed row closes its sheet.
  const open = openId === null ? null : (rows.find((row) => row.id === openId) ?? null);

  const details: [string, ReactNode][] = open
    ? [
        ["Valor", <LedgerAmount key="v" row={open} />],
        ["Tipo", <LedgerKindPill key="t" kind={open.kind} />],
        ["Status", <LedgerStatusPill key="s" status={open.status} />],
        ["Vencimento", <span key="d" className="font-mono">{formatDate(open.dueDate)}</span>],
        ["Pagamento", <span key="p" className="font-mono">{open.paidAt ? formatDate(open.paidAt) : "—"}</span>],
        ["Pago para / recebido de", open.counterparty ?? "—"],
        ["Documento", <span key="doc" className="font-mono text-xs">{open.document ?? "—"}</span>],
        ["Lote", open.lotName ?? "fazenda"],
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-panel">
        {rows.slice(0, shown).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setOpenId(row.id)}
              className="grid min-h-11 w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <span className="font-mono text-xs text-ink-soft">{formatDate(row.date).slice(0, 5)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.account ?? row.groupLabel}
                </span>
                <span className="block truncate text-xs text-ink-soft">{subline(row)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <LedgerAmount row={row} className="text-sm" />
                <LedgerStatusPill status={row.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {rows.length > shown ? (
        <Button variant="outline" className="min-h-11" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Carregar mais
        </Button>
      ) : null}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent className={BOTTOM_SHEET}>
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.account ?? open.groupLabel}</DialogTitle>
                <DialogDescription>
                  {formatDate(open.date)} · {open.groupLabel}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                {details.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <RowActions row={open} labeled onDone={() => setOpenId(null)} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/finance/extrato/ExtratoPage.tsx`**

```tsx
"use client";

/**
 * /finance/extrato: every lançamento of the window plus the vendas, compras
 * and tratamentos the manejos wrote. The window and the filters live in the
 * URL query (de, ate, tipo, grupo, conta, lote, status, q, pagina), so "Ver
 * extrato" links land on a filtered list and reloading keeps it.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Receipt, SearchX } from "lucide-react";
import type { AccountGroup } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch, periodSearch, type Period } from "@/lib/domain/period";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { filterLedger, ledgerRows, ledgerSummary } from "@/lib/domain/ledger";
import { ledgerExportTable } from "@/lib/export/datasets/finance";
import { paginate } from "@/components/herd/pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { LancarButton } from "@/components/finance/LancarButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ExtratoFilters,
  KIND_TABS,
  KIND_TAB_LABEL,
  STATUS_CHOICES,
  STATUS_CHOICE_LABEL,
  type ExtratoFilter,
} from "@/components/finance/extrato/ExtratoFilters";
import { ExtratoSummary } from "@/components/finance/extrato/ExtratoSummary";
import { ExtratoTable } from "@/components/finance/extrato/ExtratoTable";
import { ExtratoList } from "@/components/finance/extrato/ExtratoList";

const PAGE_SIZE = 50;
const GROUP_VALUES: readonly (AccountGroup | "capital" | "all")[] = ["all", ...ACCOUNT_GROUPS, "capital"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseFilter(params: URLSearchParams): ExtratoFilter {
  return {
    kind: oneOf(params.get("tipo"), KIND_TABS, "all"),
    group: oneOf(params.get("grupo"), GROUP_VALUES, "all"),
    accountId: params.get("conta") || "all",
    lotId: params.get("lote") || "all",
    status: oneOf(params.get("status"), STATUS_CHOICES, "all"),
    search: params.get("q")?.trim() ?? "",
  };
}

const lancamentos = (n: number): string => (n === 1 ? "1 lançamento" : `${formatNumber(n)} lançamentos`);

export function ExtratoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const today = todayISO();
  const canEdit = useCan("finance", "edit");

  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);

  const { period, filter, pageNumber } = useMemo(() => {
    const params = new URLSearchParams(query);
    return {
      period: periodFromSearch(params, today),
      filter: parseFilter(params),
      pageNumber: Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1),
    };
  }, [query, today]);

  const rows = useMemo(
    () => ledgerRows({ expenses, accounts, movements, manejoSessions, animals, treatments, lots }, period, today),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, period, today]
  );
  const filtered = useMemo(() => {
    const narrowed = filterLedger(rows, {
      ...filter,
      status: filter.status === "settled" ? "all" : filter.status,
    });
    return filter.status === "settled" ? narrowed.filter((row) => row.status === "paid" || row.status === "received") : narrowed;
  }, [rows, filter]);
  const summary = useMemo(() => ledgerSummary(filtered), [filtered]);
  const page = paginate(filtered, pageNumber, PAGE_SIZE);
  const lotOptions = lots.filter((lot) => !lot.deletedAt || rows.some((row) => row.lotId === lot.id));

  /** Merges `changes` into the query; defaults leave the URL, and any filter change goes back to page 1. */
  const setParams = (changes: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === "" || value === "all" || (key === "pagina" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!("pagina" in changes)) next.delete("pagina");
    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };
  const setPeriod = (next: Period) => setParams({ de: next.start, ate: next.end });
  const clearFilters = () => router.replace(`${pathname}?${periodSearch(period)}`, { scroll: false });

  const filterLabels: string[] = [];
  if (filter.kind !== "all") filterLabels.push(`Tipo: ${KIND_TAB_LABEL[filter.kind]}`);
  if (filter.group !== "all") {
    filterLabels.push(`Grupo: ${filter.group === "capital" ? "Capital" : ACCOUNT_GROUP_LABEL[filter.group]}`);
  }
  if (filter.accountId !== "all") filterLabels.push(`Conta: ${accountName(filter.accountId, accounts) ?? "—"}`);
  if (filter.lotId !== "all") {
    const lotName =
      filter.lotId === "farm" ? "Fazenda (sem lote)" : (lots.find((lot) => lot.id === filter.lotId)?.name ?? "—");
    filterLabels.push(`Lote: ${lotName}`);
  }
  if (filter.status !== "all") filterLabels.push(`Status: ${STATUS_CHOICE_LABEL[filter.status]}`);
  if (filter.search) filterLabels.push(`Busca: “${filter.search}”`);
  const periodLabel = `${formatDate(period.start)} e ${formatDate(period.end)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <Link
        href={`/finance?${periodSearch(period)}`}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Financeiro
      </Link>

      <PageHeader
        title="Extrato"
        subtitle={`${lancamentos(filtered.length)} entre ${periodLabel}`}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            {filtered.length > 0 ? (
              <ExportMenu
                title="Extrato"
                formats={["xlsx", "csv", "print"]}
                current={{
                  label: "Extrato",
                  detail: lancamentos(filtered.length),
                  filters: [`Período: ${formatDate(period.start)} a ${formatDate(period.end)}`, ...filterLabels],
                  build: () => [ledgerExportTable(filtered)],
                }}
              />
            ) : null}
            <LancarButton className="hidden md:inline-flex" />
          </>
        }
      />

      <ExtratoFilters
        period={period}
        filter={filter}
        accounts={accounts}
        lots={lotOptions}
        activeCount={filterLabels.length - (filter.kind === "all" ? 0 : 1)}
        onPeriodChange={setPeriod}
        onChange={setParams}
      />

      {rows.length === 0 ? (
        <section className="rounded-lg border border-hairline bg-panel">
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento no período"
            description={
              canEdit
                ? "Use “Lançar” para registrar uma despesa ou receita, ou escolha outro período."
                : "Escolha outro período para ver os lançamentos."
            }
          />
        </section>
      ) : filtered.length === 0 ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Nada com esses filtros"
            description="Nenhum lançamento do período passa pelos filtros escolhidos."
            className="pb-4"
          />
          <Button variant="outline" className="min-h-11 md:min-h-8" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </section>
      ) : (
        <>
          <ExtratoSummary rows={filtered} summary={summary} />
          <div className="hidden md:block">
            <ExtratoTable page={page} onPageChange={(next) => setParams({ pagina: String(next) })} />
          </div>
          <div className="md:hidden">
            {/* A new query starts the phone list over at 50 rows. */}
            <ExtratoList key={query} rows={filtered} />
          </div>
        </>
      )}

      {canEdit ? <FloatingLancar /> : null}
    </div>
  );
}

/** The phone's round "Lançar" over the tab bar; md+ uses the header's button. */
function FloatingLancar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-label="Lançar"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 z-30 size-12 rounded-full shadow-lg md:hidden"
      >
        <Plus className="size-5" aria-hidden />
      </Button>
      {open ? <EntryDialog open onOpenChange={setOpen} /> : null}
    </>
  );
}
```

- [ ] **Step 7: Write `app/(app)/finance/extrato/page.tsx`**

```tsx
"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ExtratoPage } from "@/components/finance/extrato/ExtratoPage";

// The filters live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function ExtratoRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <ExtratoPage />
      </Suspense>
    </RequireAccess>
  );
}
```

- [ ] **Step 8: Type-check and lint**

Run: `cd /home/luketa/meubov && pnpm tsc --noEmit && pnpm lint`
Expected: no errors. If `react-hooks` flags the `setSeen`/`setText` in `SearchField`'s render, it is the documented "adjust state on prop change" pattern already used in `components/herd/useHerdView.ts`; keep it.

- [ ] **Step 9: Look at it in the dev server**

Run the dev server (`pnpm dev`, see the smoke-test memory for the port and the throwaway `teste.*` user), open `/finance/extrato` on desktop and at 390px wide:
- the window from "Ver extrato" (`?de=…&ate=…`) is kept; "← Financeiro" returns with it;
- each tipo tab, grupo (conta list narrows, conta resets), lote, status "pagos / recebidos" and the search (300 ms) change the URL and the rows, and go back to page 1;
- "Mostrando 1–50 de N" and the pager with more than 50 rows; "Carregar mais" on the phone;
- a pending despesa: "Marcar como pago" flips the pill to "pago" and toasts; Remover asks, then toasts "Lançamento removido"; Editar opens the filled EntryDialog; a venda row shows the lock and "do manejo";
- with Financeiro at view: "Somente leitura", no Lançar, no row buttons, locks still shown.
Task 13 runs the full smoke.

- [ ] **Step 10: Commit**

```bash
cd /home/luketa/meubov
git add "app/(app)/finance/extrato/page.tsx" components/finance/extrato/
git commit -m "feat(finance): list every lançamento in an Extrato with filters in the URL" -m "The Extrato shows the window's despesas and receitas with the vendas, compras and tratamentos the manejos wrote, filtered by tipo, grupo, conta, lote, status and a search, 50 rows per page (a list with Carregar mais on the phone). Rows can be edited, marked paid and removed; derived rows are locked. Exports the filtered rows to xlsx, csv and print."
```

---

### Task 11: Plano de contas page and its nav entry

**Files:**
- Create: `app/(app)/settings/plano-de-contas/page.tsx`
- Create: `components/finance/plano/AccountsPage.tsx`
- Create: `components/finance/plano/AccountDialog.tsx`
- Modify: `lib/nav.ts:63-66` (the Configurações `children` array)
- Modify: `lib/__tests__/nav.test.ts:68-75` (the Dono's children) and `:86-88` (the consultor test)
- Test: `lib/__tests__/nav.test.ts`

**Interfaces:**
- Consumes:
  - `useHerdStore` (Task 7): `accounts: Account[]`, `expenses: Expense[]`, `addAccount(input: { group: AccountGroup; name: string }): Promise<Account | null>`, `updateAccount(id: string, patch: { name?: string; archived?: boolean }): Promise<boolean>` (false on duplicate), `seedDefaultAccounts(): Promise<number>`.
  - `lib/types.ts` (Task 1): `Account { id; group: AccountGroup; name; archivedAt? }`, `AccountGroup`, `Expense.accountId`.
  - `lib/domain/accounts.ts` (Task 2): `ACCOUNT_GROUP_LABEL`, `ACCOUNT_GROUPS` (`["revenue", ...7 categories]`), `accountsByGroup(accounts, includeArchived?)`.
  - `lib/domain/period.ts` (Task 2): `defaultPeriod(refIso: string, months = 12): Period`, `inPeriod(iso: string, period: Period): boolean`.
  - `lib/domain/format.ts`: `formatCurrency`, `formatNumber`; `lib/domain/dates.ts`: `todayISO`; `useCan`; `RequireAccess`, `PageHeader`, `ReadOnlyPill`, `SectionCard`, `Button`, `Input`, `Label`, `Select*`, `Dialog*`.
- Produces:
  - Route `/settings/plano-de-contas` (finance view).
  - `export function AccountsPage(): JSX.Element`.
  - `export function AccountDialog(props: { open: boolean; onOpenChange(open: boolean): void; defaultGroup: AccountGroup }): JSX.Element`.
  - `NAV_ITEMS` Configurações child `{ label: "Plano de contas", href: "/settings/plano-de-contas", area: "finance" }` after Fazendas.

Design notes (binding for this task):
- "12 meses" is the cockpit's default window, `defaultPeriod(todayISO())`, so the plano and the Financeiro agree on what "the last 12 months" is. The lançamento count is all-time: it says whether a conta has history, which is what matters before archiving.
- Rows are a list, not a table, so the phone needs no second layout; the two cards sit side by side from `lg` and stack below it.
- The dialog's form mounts inside `DialogContent` (unmounted while closed), so each open starts clean without a reset effect.

- [ ] **Step 1: Add the nav child in `lib/nav.ts`**

Replace (lines 63–66):
```ts
    children: [
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
    ],
```
with:
```ts
    children: [
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
      { label: "Plano de contas", href: "/settings/plano-de-contas", area: "finance" },
    ],
```

- [ ] **Step 2: Update `lib/__tests__/nav.test.ts`**

Replace the Dono test (lines 68–75):
```ts
  it("shows every item and Equipe to the Dono", () => {
    const items = visibleNav(NAV_ITEMS, FULL_PERMISSIONS);
    expect(items.map((item) => item.href)).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
    ]);
  });
```
with:
```ts
  it("shows every item, Equipe and Plano de contas to the Dono", () => {
    const items = visibleNav(NAV_ITEMS, FULL_PERMISSIONS);
    expect(items.map((item) => item.href)).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(items.find((item) => item.href === "/settings")?.children).toEqual([
      { label: "Equipe", href: "/settings/equipe", area: "team" },
      { label: "Fazendas", href: "/settings/fazendas" },
      { label: "Plano de contas", href: "/settings/plano-de-contas", area: "finance" },
    ]);
  });
```
The vaqueiro test (Financeiro at none) keeps expecting only Fazendas, which now also proves Plano de contas hides with Financeiro. Replace the consultor test (lines 86–88):
```ts
  it("keeps Financeiro for a consultor, who sees values", () => {
    expect(visibleNav(NAV_ITEMS, PRESETS.consultor).map((item) => item.href)).toContain("/finance");
  });
```
with:
```ts
  it("keeps Financeiro and Plano de contas for a consultor, who sees values", () => {
    const items = visibleNav(NAV_ITEMS, PRESETS.consultor);
    expect(items.map((item) => item.href)).toContain("/finance");
    expect(items.find((item) => item.href === "/settings")?.children?.map((c) => c.href)).toContain(
      "/settings/plano-de-contas"
    );
  });
```

- [ ] **Step 3: Run the nav test**

Run: `cd /home/luketa/meubov && pnpm vitest run lib/__tests__/nav.test.ts`
Expected: `Test Files  1 passed (1)`, all tests passed.

- [ ] **Step 4: Write `components/finance/plano/AccountDialog.tsx`**

```tsx
"use client";

/** "Nova conta": a name inside one grupo, Receitas included. */
import { useState, type FormEvent } from "react";
import type { AccountGroup } from "@/lib/types";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL } from "@/lib/domain/accounts";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
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

export function AccountDialog({
  open,
  onOpenChange,
  defaultGroup,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultGroup: AccountGroup;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>
            A conta detalha um grupo: &quot;Sal mineral&quot; em Nutrição, &quot;Aluguel de
            pasto&quot; em Receitas.
          </DialogDescription>
        </DialogHeader>
        <AccountForm defaultGroup={defaultGroup} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ defaultGroup, onDone }: { defaultGroup: AccountGroup; onDone(): void }) {
  const addAccount = useHerdStore((s) => s.addAccount);
  const { addToast } = useToast();
  const [group, setGroup] = useState<AccountGroup>(defaultGroup);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") {
      setError("Informe o nome da conta.");
      return;
    }
    if (!(await addAccount({ group, name: clean }))) {
      setError("Já existe uma conta com esse nome");
      return;
    }
    addToast({ messageType: "success", text: `Conta "${clean}" criada` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="account-group">Grupo</Label>
        <Select value={group} onValueChange={(value) => setGroup(value as AccountGroup)}>
          <SelectTrigger id="account-group" className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {ACCOUNT_GROUP_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-name">Nome</Label>
        <Input
          id="account-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Sal mineral"
          className="min-h-11"
        />
      </div>
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11">
          Criar conta
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 5: Write `components/finance/plano/AccountsPage.tsx`**

```tsx
"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside the fixed grupos. Receitas
 * on the left (Venda de gado is automatic, from the manejos), Despesas (COE) on
 * the right, one block per grupo with its last 12 months and lançamento count.
 * A conta is never deleted: archiving hides it from the form and keeps history.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Plus, Sparkles } from "lucide-react";
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, ACCOUNT_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { defaultPeriod, inPeriod } from "@/lib/domain/period";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { AccountDialog } from "@/components/finance/plano/AccountDialog";

/** Where the app writes into a grupo by itself. */
const GROUP_HINT: Partial<Record<AccountGroup, string>> = {
  health: "Tratamentos com custo entram aqui sozinhos",
  breeding: "Compras de sêmen entram aqui sozinhas",
};

const EXPENSE_GROUPS = ACCOUNT_GROUPS.filter((g): g is ExpenseCategory => g !== "revenue");

interface AccountStats {
  total12m: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<AccountGroup | null>(null);

  const window12m = defaultPeriod(todayISO());
  const stats = new Map<string, AccountStats>();
  for (const e of expenses) {
    if (!e.accountId) continue;
    const s = stats.get(e.accountId) ?? { total12m: 0, count: 0 };
    s.count += 1;
    if (inPeriod(e.date, window12m)) s.total12m += e.amountBrl;
    stats.set(e.accountId, s);
  }
  const byGroup = accountsByGroup(accounts, true);

  function openDialog(group: AccountGroup) {
    setAdding(group);
  }

  async function onSuggest() {
    const created = await seedDefaultAccounts();
    addToast({
      messageType: created > 0 ? "success" : "info",
      text:
        created === 0
          ? "Todas as contas padrão já existem"
          : created === 1
            ? "1 conta criada"
            : `${created} contas criadas`,
    });
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div>
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Configurações
          </Link>
        </div>

        <PageHeader
          title="Plano de contas"
          subtitle="As contas de cada grupo. Os grupos formam o COE e não mudam; as contas são da fazenda."
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            canEdit ? (
              <>
                <Button variant="outline" className="min-h-11 md:min-h-0" onClick={() => void onSuggest()}>
                  <Sparkles data-icon="inline-start" aria-hidden />
                  Sugerir contas padrão
                </Button>
                <Button className="min-h-11 md:min-h-0" onClick={() => openDialog("revenue")}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Nova conta
                </Button>
              </>
            ) : undefined
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-5">
          <SectionCard
            title="Receitas"
            subtitle="Entradas de dinheiro além das vendas"
            className="lg:col-span-2"
            action={canEdit ? <AddAccountButton onClick={() => openDialog("revenue")} /> : null}
          >
            <ul className="-mx-4 -mt-4 divide-y divide-hairline">
              <li className="flex min-h-11 items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">Venda de gado</span>
                <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                  automática
                </span>
              </li>
            </ul>
            <AccountList accounts={byGroup.revenue} stats={stats} canEdit={canEdit} />
          </SectionCard>

          <SectionCard title="Despesas (COE)" subtitle="Valores dos últimos 12 meses" className="lg:col-span-3">
            <div className="-my-4 divide-y divide-hairline">
              {EXPENSE_GROUPS.map((group) => (
                <section key={group} className="py-4">
                  <header className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-ink">{ACCOUNT_GROUP_LABEL[group]}</h3>
                      {GROUP_HINT[group] ? (
                        <p className="text-xs text-ink-soft">{GROUP_HINT[group]}</p>
                      ) : null}
                    </div>
                    {canEdit ? <AddAccountButton onClick={() => openDialog(group)} /> : null}
                  </header>
                  <AccountList accounts={byGroup[group]} stats={stats} canEdit={canEdit} />
                </section>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta com lançamentos não se apaga: arquive para tirá-la do formulário e manter o
            histórico. Renomear uma conta renomeia também os lançamentos antigos. Lançamento sem
            conta fica só no grupo.
          </p>
        </div>
      </div>

      <AccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultGroup={adding ?? "revenue"}
      />
    </div>
  );
}

function AddAccountButton({ onClick }: { onClick(): void }) {
  return (
    <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={onClick}>
      <Plus data-icon="inline-start" aria-hidden />
      Conta
    </Button>
  );
}

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  canEdit,
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  canEdit: boolean;
}) {
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  return (
    <>
      {active.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">Sem contas — lançamentos ficam só no grupo</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {active.map((account) => (
            <AccountRow key={account.id} account={account} stats={stats.get(account.id)} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {archived.length > 0 ? (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-ink-soft hover:text-ink md:min-h-0">
            Arquivadas ({archived.length})
          </summary>
          <ul className="divide-y divide-hairline">
            {archived.map((account) => (
              <AccountRow key={account.id} account={account} stats={stats.get(account.id)} canEdit={canEdit} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function AccountRow({
  account,
  stats,
  canEdit,
}: {
  account: Account;
  stats: AccountStats | undefined;
  canEdit: boolean;
}) {
  const updateAccount = useHerdStore((s) => s.updateAccount);
  const { addToast } = useToast();
  const [name, setName] = useState<string | null>(null);
  const archived = Boolean(account.archivedAt);
  const count = stats?.count ?? 0;

  async function onRename() {
    const clean = (name ?? "").trim();
    if (clean === "" || clean === account.name) {
      setName(null);
      return;
    }
    if (!(await updateAccount(account.id, { name: clean }))) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: "Conta renomeada" });
    setName(null);
  }

  async function onArchive() {
    if (await updateAccount(account.id, { archived: !archived })) {
      addToast({ messageType: "success", text: archived ? "Conta restaurada" : "Conta arquivada" });
    }
  }

  if (name !== null) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${account.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onRename();
            if (e.key === "Escape") setName(null);
          }}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onRename()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setName(null)}>
          Cancelar
        </Button>
      </li>
    );
  }

  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className={archived ? "min-w-0 flex-1 truncate text-sm text-ink-soft" : "min-w-0 flex-1 truncate text-sm font-medium text-ink"}>
        {account.name}
      </span>
      <span className="font-mono text-sm text-ink">{formatCurrency(stats?.total12m ?? 0)}</span>
      <span className="w-24 text-right text-xs text-ink-soft">
        {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
      </span>
      {canEdit ? (
        <span className="flex gap-1">
          {archived ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 md:min-h-0"
              onClick={() => setName(account.name)}
            >
              Renomear
            </Button>
          )}
          <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => void onArchive()}>
            {archived ? "Restaurar" : "Arquivar"}
          </Button>
        </span>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 6: Write `app/(app)/settings/plano-de-contas/page.tsx`**

```tsx
import { RequireAccess } from "@/components/layout/RequireAccess";
import { AccountsPage } from "@/components/finance/plano/AccountsPage";

/** /settings/plano-de-contas: the farm's contas inside the fixed grupos. */
export default function PlanoDeContasPage() {
  return (
    <RequireAccess area="finance" level="view">
      <AccountsPage />
    </RequireAccess>
  );
}
```

- [ ] **Step 7: Type-check, lint and re-run the nav test**

Run:
```bash
cd /home/luketa/meubov && pnpm tsc --noEmit && pnpm exec eslint "app/(app)/settings/plano-de-contas/page.tsx" components/finance/plano lib/nav.ts lib/__tests__/nav.test.ts && pnpm vitest run lib/__tests__/nav.test.ts
```
Expected: tsc and eslint print nothing; vitest `Test Files  1 passed (1)`.

- [ ] **Step 8: Commit**

```bash
cd /home/luketa/meubov && git add "app/(app)/settings/plano-de-contas/page.tsx" components/finance/plano lib/nav.ts lib/__tests__/nav.test.ts && git commit -m "feat(finance): add the plano de contas page under Configurações"
```

---

### Task 12: Export tables for the Extrato, the Placar and Por lote

**Files:**
- Modify: `lib/export/datasets/finance.ts` (imports at lines 1–7; `expensesExportTable` at lines 14–26 keeps only despesas; new tables appended after line 64, the end of the file)
- Test: `lib/export/__tests__/finance.test.ts` (imports at lines 2–3; new `describe` blocks appended after line 37, the end of the file)

**Not in this task:** removing `categorySalesExportTable` / `CategorySalesRow`. This task runs in wave 2, and until Task 9 (wave 3) rewrites `app/(app)/finance/page.tsx` and deletes `components/finance/CategorySalesTable.tsx`, both still import them — removing them here breaks `tsc`. Task 9 drops them (and their test block) together with their last users. `pluralCategoryLabel` stays for good: `components/reports/tables.ts` and `app/(app)/relatorios/banco/page.tsx` use it.

**Interfaces:**
- Consumes:
  - `lib/domain/ledger.ts` (Task 3): `LedgerRow`, `LedgerKind`, `LedgerStatus`.
  - `lib/domain/economics.ts` (Task 4): `Indicators`.
  - `lib/domain/lotEconomics.ts` (Task 5): `LotEconomics`.
  - `lib/domain/benchmarks.ts` (Task 2): `benchmark(key: BenchmarkKey, system: FarmSystem): Benchmark`, `BenchmarkKey`.
  - `lib/export/table.ts`: `buildTable`, `ExportTable`, `withoutMoney`.
  - `lib/domain/format.ts`: `formatNumber`.
- Produces:
  - `export function ledgerExportTable(rows: readonly LedgerRow[], title = "Extrato"): ExportTable` — columns Data (date), Vencimento (date), Pagamento (date), Tipo, Grupo, Conta, Pago para / Recebido de, Documento, Lote, Valor (R$) (money), Status; rows in the order given (the Extrato's).
  - `export function indicatorsExportTable(ind: Indicators, prior: Indicators | null, title = "Indicadores"): ExportTable` — columns Indicador, Valor (number, 2 decimals), Ano anterior (number, 2 decimals), Referência.
  - `export function lotsEconomicsExportTable(lots: readonly LotEconomics[], farm: LotEconomics, title = "Por lote"): ExportTable` — one row per lote, then a "Fazenda" row.
  - `expensesExportTable` now leaves receitas out: the Relatórios "Despesas" sheet (`components/reports/datasets.ts`) passes every lançamento to it.

Design notes (binding for this task):
- Dates travel as ISO strings in `kind: "date"` columns and money as numbers in `kind: "money"` columns, like `expensesExportTable`; `withoutMoney` then drops Valor and every money column of Por lote.
- The sign of a lançamento lives in Tipo, not in Valor: values stay positive so a sum by Tipo in a spreadsheet works.
- The Placar table mixes units in one Valor column, so each Indicador label carries its unit. The whole table is finance-only (it is exported only from `/finance`), so its values are `number`, not `money`.
- Referência is "média X · top Y · fonte" from `benchmark(key, ind.system)` where the indicator has a band, else "".

- [ ] **Step 1: Write the failing tests**

Replace lines 2–3 of `lib/export/__tests__/finance.test.ts`:
```ts
import { categorySalesExportTable, expensesExportTable } from "@/lib/export/datasets/finance";
import type { Expense } from "@/lib/types";
```
with:
```ts
import {
  categorySalesExportTable,
  expensesExportTable,
  indicatorsExportTable,
  ledgerExportTable,
  lotsEconomicsExportTable,
} from "@/lib/export/datasets/finance";
import { withoutMoney } from "@/lib/export/table";
import type { Indicators } from "@/lib/domain/economics";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import type { Expense } from "@/lib/types";
```
Line 1 (`import { describe, expect, it } from "vitest";`) stays.

Append at the end of the file:
```ts
describe("expensesExportTable with receitas", () => {
  it("leaves the receitas out of the Despesas sheet", () => {
    const table = expensesExportTable([
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
      { id: "r1", kind: "revenue", date: "2026-02-05", category: "other", amountBrl: 900 },
    ]);
    expect(table.rows).toEqual([["2026-01-05", "Nutrição", null, 100]]);
  });
});

const baseRow: LedgerRow = {
  id: "e1",
  kind: "expense",
  date: "2026-08-10",
  dueDate: "2026-08-20",
  paidAt: null,
  status: "payable",
  group: "health",
  groupLabel: "Sanidade",
  account: "Vacinas",
  counterparty: "Agrovet Uberaba",
  document: "NF 4.812",
  lotId: "lot1",
  lotName: "Recria 2",
  amountBrl: 3240,
  notes: null,
  locked: false,
  headCount: null,
  expense: null,
};

describe("ledgerExportTable", () => {
  it("writes the Extrato's columns with dates as ISO and Valor as money", () => {
    const table = ledgerExportTable([baseRow]);
    expect(table.title).toBe("Extrato");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Vencimento", "date"],
      ["Pagamento", "date"],
      ["Tipo", undefined],
      ["Grupo", undefined],
      ["Conta", undefined],
      ["Pago para / Recebido de", undefined],
      ["Documento", undefined],
      ["Lote", undefined],
      ["Valor (R$)", "money"],
      ["Status", undefined],
    ]);
    expect(table.rows).toEqual([
      [
        "2026-08-10",
        "2026-08-20",
        null,
        "Despesa",
        "Sanidade",
        "Vacinas",
        "Agrovet Uberaba",
        "NF 4.812",
        "Recria 2",
        3240,
        "A pagar",
      ],
    ]);
  });

  it("keeps a receita's value positive and names it in Tipo and Status", () => {
    const receita: LedgerRow = {
      ...baseRow,
      id: "e2",
      kind: "revenue",
      paidAt: "2026-08-12",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Aluguel de pasto",
      lotId: null,
      lotName: null,
      amountBrl: 1800,
    };
    const [row] = ledgerExportTable([receita]).rows;
    expect(row[2]).toBe("2026-08-12");
    expect(row[3]).toBe("Receita");
    expect(row[8]).toBe("Fazenda");
    expect(row[9]).toBe(1800);
    expect(row[10]).toBe("Recebido");
  });

  it("names a derived venda and an overdue despesa", () => {
    const rows = ledgerExportTable([
      { ...baseRow, id: "m1", kind: "sale", status: "received", group: "revenue", groupLabel: "Receitas", locked: true },
      { ...baseRow, id: "e3", status: "overdue" },
    ]).rows;
    expect(rows.map((r) => [r[3], r[10]])).toEqual([
      ["Venda de gado", "Recebido"],
      ["Despesa", "Vencido"],
    ]);
  });

  it("drops Valor when money is hidden", () => {
    const table = withoutMoney(ledgerExportTable([baseRow]), false);
    expect(table.columns.map((c) => c.header)).not.toContain("Valor (R$)");
    expect(table.rows[0]).toHaveLength(10);
  });
});

const period = { start: "2025-09-01", end: "2026-08-31" };

function indicatorsFixture(overrides: Partial<Indicators> = {}): Indicators {
  return {
    period,
    system: "ciclo_completo",
    heads: { start: 100, end: 110, avg: 105 },
    hectares: 200,
    revenue: 500_000,
    salesRevenue: 480_000,
    otherRevenue: 20_000,
    coe: 350_000,
    result: 150_000,
    resultPerHa: 750,
    marginPct: 30,
    costToRevenuePct: 70,
    capitalTurnover: 0.8,
    produced: {
      sold: 1500,
      bought: 300,
      inventoryStart: 1800,
      inventoryEnd: 1900,
      delta: 100,
      produced: 1300,
      unweighed: 0,
      headsSold: 90,
    },
    arrobasPerHa: 6.5,
    costPerArroba: 269.23,
    realizedPerArroba: 320,
    marginPerArroba: 40.77,
    outlayPerHeadMonth: 45.5,
    adg: { kgPerDay: 0.52, animals: 80 },
    offtakePct: 42,
    stocking: 1.1,
    calfPrice: 2800,
    exchange: { calvesPerSteer: 2.1, arrobasPerCalf: 9.3 },
    herdArrobas: 1900,
    herdValue: 589_000,
    inventoryDeltaBrl: 31_000,
    ...overrides,
  };
}

describe("indicatorsExportTable", () => {
  it("writes one row per indicator with the prior window and the reference", () => {
    const table = indicatorsExportTable(indicatorsFixture(), indicatorsFixture({ result: 90_000, costPerArroba: null }));
    expect(table.title).toBe("Indicadores");
    expect(table.columns.map((c) => c.header)).toEqual(["Indicador", "Valor", "Ano anterior", "Referência"]);
    expect(table.rows.map((r) => r[0])).toEqual([
      "Resultado do período (R$)",
      "Resultado por hectare (R$/ha)",
      "Margem (%)",
      "Custo ÷ receita (%)",
      "Custo da @ produzida (R$/@)",
      "Preço médio realizado (R$/@)",
      "Margem por @ (R$/@)",
      "@ produzidas",
      "@/ha/ano",
      "Desembolso por cabeça (R$/cab/mês)",
      "GMD (kg/dia)",
      "Taxa de desfrute (%)",
      "Lotação (UA/ha)",
      "Relação de troca (bezerros por boi)",
      "Valor do rebanho (R$)",
    ]);
    expect(table.rows[0]).toEqual(["Resultado do período (R$)", 150_000, 90_000, ""]);
    expect(table.rows[4].slice(0, 3)).toEqual(["Custo da @ produzida (R$/@)", 269.23, null]);
    expect(table.rows[4][3]).toContain("208");
    expect(table.rows[4][3]).toContain("165");
    expect(table.rows[14][3]).toBe("");
  });

  it("leaves Ano anterior empty without a prior window and keeps null values null", () => {
    const table = indicatorsExportTable(indicatorsFixture({ costPerArroba: null }), null);
    expect(table.rows.every((r) => r[2] === null)).toBe(true);
    expect(table.rows[4][1]).toBeNull();
  });
});

describe("lotsEconomicsExportTable", () => {
  const lot: LotEconomics = {
    lotId: "lot1",
    name: "Recria 2",
    heads: 88,
    directBrl: 12_000,
    sharedBrl: 30_000,
    totalBrl: 42_000,
    perHeadDay: 1.31,
    adg: 0.61,
    produced: 150,
    costPerArroba: 280,
    marginPerArroba: 30,
  };
  const farm: LotEconomics = { ...lot, lotId: null, name: "Fazenda toda", heads: 200, adg: null, produced: null, costPerArroba: null, marginPerArroba: null };

  it("writes one row per lote and a Fazenda row, money columns flagged", () => {
    const table = lotsEconomicsExportTable([lot], farm);
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Lote", undefined],
      ["Cabeças", "number"],
      ["Custo direto (R$)", "money"],
      ["Rateio (R$)", "money"],
      ["Custo total (R$)", "money"],
      ["R$/cab/dia", "money"],
      ["GMD (kg/dia)", "number"],
      ["@ produzidas", "number"],
      ["Custo/@ (R$)", "money"],
      ["Margem/@ (R$)", "money"],
    ]);
    expect(table.rows).toEqual([
      ["Recria 2", 88, 12_000, 30_000, 42_000, 1.31, 0.61, 150, 280, 30],
      ["Fazenda", 200, 12_000, 30_000, 42_000, 1.31, null, null, null, null],
    ]);
    expect(withoutMoney(table, false).columns.map((c) => c.header)).toEqual([
      "Lote",
      "Cabeças",
      "GMD (kg/dia)",
      "@ produzidas",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /home/luketa/meubov && TZ=America/Sao_Paulo pnpm vitest run lib/export/__tests__/finance.test.ts`
Expected: FAIL — `ledgerExportTable is not a function` (and the same for the other two), and "leaves the receitas out of the Despesas sheet" (the receita is still exported); the two old `describe` blocks still pass.

- [ ] **Step 3: Add the tables to `lib/export/datasets/finance.ts`**

Replace lines 1–7:
```ts
/**
 * The Financeiro as tables: every despesa, and the herd's estimated sale value
 * by categoria at the arroba price of the day.
 */
import type { Category, Expense } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";
```
with:
```ts
/**
 * The Financeiro as tables: every despesa, the Extrato's rows, the Placar's
 * indicators beside the prior window and their references, and the Por lote
 * table.
 */
import type { Category, Expense } from "@/lib/types";
import type { LedgerKind, LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import type { Indicators } from "@/lib/domain/economics";
import type { LotEconomics } from "@/lib/domain/lotEconomics";
import { benchmark, type BenchmarkKey } from "@/lib/domain/benchmarks";
import { formatNumber } from "@/lib/domain/format";
import { EXPENSE_CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";
import { buildTable, type ExportTable } from "@/lib/export/table";
```

Replace
```ts
/** Every despesa, newest first. */
export function expensesExportTable(expenses: readonly Expense[], title = "Despesas"): ExportTable {
```
with
```ts
/** Every despesa, newest first; receitas lançadas are left out. */
export function expensesExportTable(expenses: readonly Expense[], title = "Despesas"): ExportTable {
```
and
```ts
    expensesNewestFirst(expenses)
```
with
```ts
    expensesNewestFirst(expenses.filter((e) => e.kind === "expense"))
```

Append at the end of the file (after line 64):
```ts
const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  expense: "Despesa",
  revenue: "Receita",
  sale: "Venda de gado",
  purchase: "Compra de gado",
  treatment: "Tratamento",
};

const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  paid: "Pago",
  received: "Recebido",
  payable: "A pagar",
  receivable: "A receber",
  overdue: "Vencido",
};

/** The Extrato's rows as given (already filtered and ordered). */
export function ledgerExportTable(rows: readonly LedgerRow[], title = "Extrato"): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.date },
      { header: "Vencimento", kind: "date", value: (r) => r.dueDate },
      { header: "Pagamento", kind: "date", value: (r) => r.paidAt },
      { header: "Tipo", value: (r) => LEDGER_KIND_LABEL[r.kind] },
      { header: "Grupo", value: (r) => r.groupLabel },
      { header: "Conta", value: (r) => r.account },
      { header: "Pago para / Recebido de", value: (r) => r.counterparty },
      { header: "Documento", value: (r) => r.document },
      { header: "Lote", value: (r) => r.lotName ?? "Fazenda" },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "Status", value: (r) => LEDGER_STATUS_LABEL[r.status] },
    ],
    rows
  );
}

interface IndicatorLine {
  label: string;
  value: (ind: Indicators) => number | null;
  /** The band this indicator is read against, when it has one. */
  key?: BenchmarkKey;
  /** Decimal places of the reference text. */
  decimals: number;
}

const INDICATOR_LINES: readonly IndicatorLine[] = [
  { label: "Resultado do período (R$)", value: (i) => i.result, decimals: 2 },
  { label: "Resultado por hectare (R$/ha)", value: (i) => i.resultPerHa, decimals: 2 },
  { label: "Margem (%)", value: (i) => i.marginPct, decimals: 1 },
  { label: "Custo ÷ receita (%)", value: (i) => i.costToRevenuePct, key: "costToRevenue", decimals: 0 },
  { label: "Custo da @ produzida (R$/@)", value: (i) => i.costPerArroba, key: "costPerArroba", decimals: 2 },
  { label: "Preço médio realizado (R$/@)", value: (i) => i.realizedPerArroba, decimals: 2 },
  { label: "Margem por @ (R$/@)", value: (i) => i.marginPerArroba, decimals: 2 },
  { label: "@ produzidas", value: (i) => i.produced.produced, decimals: 1 },
  { label: "@/ha/ano", value: (i) => i.arrobasPerHa, key: "arrobasPerHa", decimals: 1 },
  { label: "Desembolso por cabeça (R$/cab/mês)", value: (i) => i.outlayPerHeadMonth, key: "outlay", decimals: 2 },
  { label: "GMD (kg/dia)", value: (i) => i.adg.kgPerDay, key: "gmd", decimals: 3 },
  { label: "Taxa de desfrute (%)", value: (i) => i.offtakePct, key: "offtake", decimals: 1 },
  { label: "Lotação (UA/ha)", value: (i) => i.stocking, key: "stocking", decimals: 2 },
  { label: "Relação de troca (bezerros por boi)", value: (i) => i.exchange.calvesPerSteer, decimals: 1 },
  { label: "Valor do rebanho (R$)", value: (i) => i.herdValue, decimals: 2 },
];

/** "média 208,00 · top 165,00 · Inttegra 24/25", or "" for an indicator without a band. */
function referenceText(line: IndicatorLine, ind: Indicators): string {
  if (!line.key) return "";
  const b = benchmark(line.key, ind.system);
  const mean = `${b.meanLabel ?? "média"} ${formatNumber(b.mean, line.decimals)}`;
  const top = b.top === null ? "" : ` · ${b.topLabel ?? "top"} ${formatNumber(b.top, line.decimals)}`;
  return `${mean}${top} · ${b.source}`;
}

/** The Placar: each indicator, the same window a year earlier, and its reference. */
export function indicatorsExportTable(
  ind: Indicators,
  prior: Indicators | null,
  title = "Indicadores"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Indicador", value: (l) => l.label },
      { header: "Valor", kind: "number", decimals: 2, value: (l) => l.value(ind) },
      { header: "Ano anterior", kind: "number", decimals: 2, value: (l) => (prior ? l.value(prior) : null) },
      { header: "Referência", value: (l) => referenceText(l, ind) },
    ],
    INDICATOR_LINES
  );
}

/** The Por lote table: each active lote, then the whole farm. */
export function lotsEconomicsExportTable(
  lots: readonly LotEconomics[],
  farm: LotEconomics,
  title = "Por lote"
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Lote", value: (l) => l.name },
      { header: "Cabeças", kind: "number", value: (l) => l.heads },
      { header: "Custo direto (R$)", kind: "money", value: (l) => l.directBrl },
      { header: "Rateio (R$)", kind: "money", value: (l) => l.sharedBrl },
      { header: "Custo total (R$)", kind: "money", value: (l) => l.totalBrl },
      { header: "R$/cab/dia", kind: "money", value: (l) => l.perHeadDay },
      { header: "GMD (kg/dia)", kind: "number", decimals: 3, value: (l) => l.adg },
      { header: "@ produzidas", kind: "number", decimals: 1, value: (l) => l.produced },
      { header: "Custo/@ (R$)", kind: "money", value: (l) => l.costPerArroba },
      { header: "Margem/@ (R$)", kind: "money", value: (l) => l.marginPerArroba },
    ],
    [...lots, { ...farm, name: "Fazenda" }]
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd /home/luketa/meubov && TZ=America/Sao_Paulo pnpm vitest run lib/export/__tests__/finance.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  10 passed (10)`. If the Referência assertions fail, compare with Task 2's `benchmark("costPerArroba", …)`: the spec fixes média R$ 208 and top R$ 165.

- [ ] **Step 5: Type-check and lint**

Run:
```bash
cd /home/luketa/meubov && pnpm tsc --noEmit; pnpm exec eslint lib/export/datasets/finance.ts lib/export/__tests__/finance.test.ts
```
Expected: `tsc` reports only the `app/(app)/finance/page.tsx` errors Task 4 left (Task 9 rewrites that page); eslint prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /home/luketa/meubov && git add lib/export/datasets/finance.ts lib/export/__tests__/finance.test.ts && git commit -m "feat(finance): export the extrato, the indicators and the lotes' economics"
```

---

### Task 13: Seed check, smoke test and whole-branch review

**Files:**
- Create (scratchpad only, not committed): `<scratchpad>/smoke/finance-smoke.mjs`
- Modify: nothing in the repo unless the smoke finds a bug

**Interfaces:**
- Consumes: everything Tasks 1–12 shipped; the seed from Task 1.
- Produces: screenshots and a pass/fail list for the user; fixes committed as `fix(finance): …` if needed.

- [ ] **Step 1: Confirm the tree is clean and every earlier task's checks pass**

Run:
```bash
cd /home/luketa/meubov && git status --short && pnpm tsc --noEmit && pnpm exec eslint . --ignore-pattern '.claude/**' && TZ=America/Sao_Paulo pnpm exec vitest run lib components --passWithNoTests
```
Expected: no output from `git status --short`, tsc silent, eslint clean, vitest all green. If the quoted glob is refused by the harness, write the scratch vitest config from the smoke memory (plain object, exclude `["**/node_modules/**", "**/dist/**", "**/.claude/**"]`) and pass `--config`.

- [ ] **Step 2: Start an isolated database and migrate from zero**

Pick a name and ports nobody else uses (`docker ps`, `ss -ltnp` first):
```bash
docker run --rm -d --name meubov-financeiro-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5445:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
sleep 3
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5445/meubov pnpm migration:run
```
Expected: every migration applied, the new one last (`financeiro-lancamentos-e-plano-de-contas`). Verify the backfill and the table:
```bash
docker exec meubov-financeiro-db psql -U meubov -d meubov -c '\d accounts' -c "select count(*) from expenses where paid_at is null"
```
Expected: `accounts` with the unique index on `(farm_id, "group", lower(name))`; count 0 (no rows yet).

- [ ] **Step 3: Start the app, sign up a throwaway user and seed**

```bash
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5445/meubov BETTER_AUTH_URL=http://localhost:3015 pnpm exec next dev -p 3015 > /tmp/claude-1000/-home-luketa-meubov/ab476698-e048-4d44-a906-1c1c9b8b6e4b/scratchpad/smoke/dev.log 2>&1 &
sleep 8; curl -s http://localhost:3015/api/auth/ok
curl -s -X POST http://localhost:3015/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Teste Financeiro","email":"teste.financeiro@meubov.local","password":"Financeiro2026!"}'
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5445/meubov pnpm db:seed --email teste.financeiro@meubov.local
```
Expected: `{"ok":true}`, sign-up 200, seed prints the farm id (1) with the accounts count and the expenses count. If `next dev` refuses because another dev server runs in this directory, use `pnpm build` then `DATABASE_URL=… BETTER_AUTH_URL=http://localhost:3015 pnpm exec next start -p 3015`.

- [ ] **Step 4: Write the headless smoke script**

`<scratchpad>/smoke/finance-smoke.mjs`:
```js
import { createRequire } from "node:module";
const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");
const BASE = "http://localhost:3015";
const OUT = "/tmp/claude-1000/-home-luketa-meubov/ab476698-e048-4d44-a906-1c1c9b8b6e4b/scratchpad/smoke/";
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` });
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`${ok ? "ok " : "FAIL"} ${what}`); };

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR" });
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: "teste.financeiro@meubov.local", password: "Financeiro2026!" } });
  check(res.ok(), `sign-in ${viewport.width}`);
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("_vercel") && !u.includes("_rsc")) failures.push(`request failed ${u}`); });
  page.on("pageerror", (e) => failures.push(`page error ${e.message}`));
  return page;
}

for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await session(viewport);
  const main = page.locator("main");

  await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" });
  check(await main.getByRole("heading", { name: "Financeiro" }).isVisible(), `${name} cockpit heading`);
  check(await main.getByText("Saldo realizado").first().isVisible(), `${name} caixa strip`);
  check(await main.getByText("Custo da @ produzida × cotação").isVisible(), `${name} bars card`);
  check(await main.getByText("Taxa de desfrute").first().isVisible(), `${name} placar`);
  check(await main.getByText("Por lote").first().isVisible(), `${name} lots card`);
  // Contas' A pagar | A receber are aria-pressed buttons (no tabs primitive in components/ui).
  check(await main.getByRole("button", { name: /^A pagar · \d+$/ }).isVisible(), `${name} contas tabs`);
  check((await main.getByText("NaN").count()) === 0 && (await main.getByText("undefined").count()) === 0, `${name} no NaN/undefined`);
  await page.screenshot({ path: `${OUT}${name}-finance.png`, fullPage: true });

  // Lançar a despesa pendente, then mark it paid from Contas.
  await main.getByRole("button", { name: "Lançar" }).locator("visible=true").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor").fill("1234,50");
  // A despesa labels the field "Pago para" (a receita, "Recebido de").
  await dialog.getByLabel("Pago para").fill("Smoke Agropecuária");
  // Native checkbox inside its <label> ("Já pago em" while checked): uncheck = pending.
  await dialog.getByLabel("Já pago").uncheck();
  await dialog.getByRole("button", { name: "Lançar" }).click();
  await page.waitForTimeout(800);
  // Only Contas rows carry a checkbox; Últimos lançamentos lists the same name without one.
  const bill = main.getByRole("listitem").filter({ hasText: "Smoke Agropecuária" }).filter({ has: page.getByRole("checkbox") });
  check((await bill.count()) === 1, `${name} pending despesa listed in Contas`);
  // click, not check(): the box stays unchecked (controlled) while the row leaves the list.
  await bill.getByRole("checkbox").click();
  await page.waitForTimeout(800);
  check((await bill.count()) === 0, `${name} marked paid`);

  await page.goto(`${BASE}/finance/extrato`, { waitUntil: "networkidle" });
  check(await main.getByRole("heading", { name: "Extrato" }).isVisible(), `${name} extrato heading`);
  // The table (md+) and the list (phone) are both in the DOM; only one is visible.
  check(await main.getByText("Smoke Agropecuária").locator("visible=true").first().isVisible(), `${name} extrato shows the new row`);
  // "do manejo" is the table's lock; the phone list shows it only in the row sheet.
  if (name === "desktop") check(await main.getByText("do manejo").first().isVisible(), `${name} extrato locked rows`);
  // On the phone the search sits in the "Filtros" sheet.
  if (name === "phone") await main.getByRole("button", { name: /Filtros/ }).click();
  await (name === "phone" ? page.getByRole("dialog") : main).getByPlaceholder("Pago para / recebido de").fill("smoke");
  await page.waitForTimeout(600);
  if (name === "phone") await page.getByRole("button", { name: "Ver lançamentos" }).click();
  check((await main.getByText("Smoke Agropecuária").locator("visible=true").count()) >= 1 && (await main.getByText("do manejo").count()) === 0, `${name} extrato search filters`);
  await page.screenshot({ path: `${OUT}${name}-extrato.png`, fullPage: true });

  await page.goto(`${BASE}/settings/plano-de-contas`, { waitUntil: "networkidle" });
  check(await main.getByRole("heading", { name: "Plano de contas" }).isVisible(), `${name} plano heading`);
  check(await main.getByText("Sal mineral").first().isVisible(), `${name} plano lists seeded contas`);
  await page.screenshot({ path: `${OUT}${name}-plano.png`, fullPage: true });
  await page.context().close();
}

// View-only member: money visible, no writes.
{
  const page = await session({ width: 1440, height: 900 });
  await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" });
  // The member is created in Step 5 (SQL); this block runs after it signs in.
  await page.context().close();
}

await browser.close();
if (failures.length) { console.error("\nFAILURES\n" + failures.join("\n")); process.exit(1); }
console.log("\nall green");
```

- [ ] **Step 5: Add a member with Financeiro at view and check the read-only screens**

```bash
curl -s -X POST http://localhost:3015/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Teste Consultor","email":"teste.financeiro.view@meubov.local","password":"Financeiro2026!"}'
docker exec meubov-financeiro-db psql -U meubov -d meubov -c "insert into farm_users (farm_id, user_id, role, preset, permissions) select 1, id, 'member', 'consultor', '{\"finance\":\"view\"}'::jsonb from \"user\" where email = 'teste.financeiro.view@meubov.local'"
```
(Read `lib/domain/permissions.ts` for the exact JSON shape of `permissions` and the preset names before running the insert; adjust the JSON so Financeiro is `view` and everything else follows the preset.)
Extend the script's last block to sign in as `teste.financeiro.view@meubov.local`, open `/finance`, and check: the `ReadOnlyPill` ("Somente leitura" — read the component for the exact text) is visible, no "Lançar" button inside `main`, the Contas checkboxes (native `<input type="checkbox">`, `main.getByRole("checkbox")`) are disabled, `/finance/extrato` shows no Editar/Remover buttons, `/settings/plano-de-contas` shows no "Nova conta". Screenshot `view-finance.png`.

- [ ] **Step 6: Run the smoke and look at every screenshot**

Run: `node <scratchpad>/smoke/finance-smoke.mjs`
Expected: `all green`. Open each PNG with the Read tool and compare against the canvas: placar with bands and captions, bars card spanning two columns on desktop and full width on phone, Caixa strip, Contas tabs, Por lote table (desktop) / blocks (phone), Extrato filters and table/list, Plano de contas two cards. Fix what differs; a fix is its own `fix(finance): …` commit with the test that would have caught it when the code is pure.

- [ ] **Step 7: Whole-branch review**

Dispatch a fresh reviewer (model opus) with the spec, the plan and `git diff <base>..HEAD` to look for: money leaking to a member without Financeiro (grep every new API response and `redactHerdMoney`), a `date` change on mark-as-paid, double counting between movements and sessions in `ledgerRows`/`periodRevenue`, `herdArrobasAt` with entry animals, per-lot shared cost summing to `coe − Σ direct`, URL period parsing with bad input, phone overflow (`white-space: nowrap` on long contas). Fix findings as `fix(finance): …` commits.

- [ ] **Step 8: Tear down**

```bash
kill $(ss -ltnp | awk '/:3015 /{print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
docker rm -f meubov-financeiro-db
```
Expected: port free, container gone. Report to the user: what passed, what was fixed, the screenshots' paths, and offer the finishing choices (commit as is / squash into one `feat(finance): …` commit / push).

---

