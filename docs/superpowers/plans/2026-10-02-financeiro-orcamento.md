# Financeiro — orçamento por safra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The farm plans how much each grupo (and conta) of the plano de contas may spend over a safra, month by month, and sees at any day how much is used, what is left and where the safra is heading.

**Architecture:** A `budgets` table holds one row per line (grupo or conta) and month of a safra; the farm gains `safra_start_month`. A pure module, `lib/domain/budget.ts`, turns budgets, despesas and treatments into the view of a safra (orçado, realizado by competência up to today, previsto, % usado with its tones) and the copy plan between safras. A `budgets` API domain reads and writes lines per farm; the store caches budgets per safra on demand; `/finance/orcamento` renders the view, the Painel shows a band for the current safra, Configurações › Fazenda sets the start month.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/` first), React, Tailwind, Zustand, Elysia + Eden, Drizzle + Postgres, vitest, Playwright for the smoke.

**Spec:** `docs/superpowers/specs/2026-09-30-financeiro-orcamento-design.md`

## Global Constraints

- Work on `main` in place. No commits until the controller's single commit at the end; never `git add -A`, never stash, never touch a file outside the task's list.
- This Next.js has breaking changes: read the guide in `node_modules/next/dist/docs/` before writing a page or a route.
- No new dependency.
- Copy in pt-BR with pt-BR numbers (`formatCurrency`, `formatNumber`, `formatDate`); code, names and comments in English, in the voice of the surrounding files. No emoji.
- Phone targets ≥ 44 px (`min-h-11`), compact on md+; real `<button>`, `<a>`, `<label>`, `<input>`; `aria-label` on icon-only buttons.
- Money to the centavo; the twelve months of a line always add up to its total.
- Realizado counts only `isCost` lançamentos by `date` plus done treatment costs under Sanidade, up to today.
- Budgets never travel in the herd load; they load per safra. Reads need Financeiro view, writes Financeiro edit, every query filters by `farm_id`.
- Tests: `pnpm exec vitest run <explicit paths>` (a bare run also collects `.claude/worktrees/*`). Types: `pnpm exec tsc --noEmit`. Lint: `pnpm exec eslint <files>`. The two route snapshots update with `-u` on their two paths only.
- Tasks of one wave run in parallel on disjoint files; waves run in order: 1 · 2–3 · 4 · 5–6 · 7.

## Review Focus

1. `safraStartMonth` = 1 and = 12: `safraOf`, `safraMonths`, `safraLabel` ("Safra 2026" vs "Safra 2025/26"), a safra straddling a leap February. Tests in task 2.
2. A total whose centavos do not divide by 12, a `previous` shape that is all zero, typed months that do not add up (refused). Tests in tasks 2 and 3.
3. Today before the safra starts and after it ends: realizado, forecast and % behave. Tests in task 2.
4. A conta of another farm or grupo in PUT /budgets → `invalid_account`; 11 or 13 months → `months_mismatch`; view-only cannot write; another farm's budgets never listed. Tests in task 3.
5. Copy skips lines that already have a budget in the target safra, applies the %, rounds each month; copying the realizado creates grupo lines only. Tests in tasks 2 and 3.

## Names and signatures every task shares

### Model (decided)

```ts
// lib/types.ts
export type BudgetDistribution = "equal" | "previous" | "manual";
/** One month of one line of the orçamento: a grupo's own line (accountId absent) or a conta's. */
export interface Budget {
  id: string;
  /** Calendar year the safra starts in. */
  safra: number;
  category: ExpenseCategory;
  accountId?: string;
  /** Calendar month 1–12. */
  month: number;
  amountBrl: number;
  /** The mode last used for the line; the same on its twelve rows. */
  distribution: BudgetDistribution;
}
interface FarmData {
  // ...existing
  /** 1–12; the safra starts on this month (10 = outubro). */
  safraStartMonth: number;
}
```

DB: `farm.safra_start_month integer not null default 10` (check 1–12). New
enum `budget_distribution ('equal','previous','manual')`. New table
`budgets`: `id text pk`, `farm_id` (→ farm, cascade), `safra integer`,
`category expense_category`, `account_id text` (→ accounts, cascade,
nullable), `month integer` (check 1–12), `amount_brl numeric` (check ≥ 0),
`distribution budget_distribution`, `updated_at timestamp default now()`,
`updated_by text`. Unique index on `(farm_id, safra, category,
coalesce(account_id, ''), month)`; index on `(farm_id, safra)`. Migration
`0025_financeiro-orcamento`. `HerdData` does NOT carry budgets.

### Domain — `lib/domain/budget.ts` (pure, tested)

```ts
export interface SafraMonth { year: number; month: number; /** "out/25" */ label: string; /** "YYYY-MM" */ key: string }
/** The safra `dateIso` falls in: the calendar year it started. */
export function safraOf(dateIso: string, startMonth: number): number;
/** The 12 months from `startMonth` of `safra` on. */
export function safraMonths(safra: number, startMonth: number): SafraMonth[];
/** "Safra 2025/26" (start ≠ 1) or "Safra 2026" (start = 1). */
export function safraLabel(safra: number, startMonth: number): string;
/** First and last day. */
export function safraRange(safra: number, startMonth: number): Period;

/** 12 amounts to the centavo that add up to `total`; `previous` falls back to equal when the shape is all zero. */
export function distribute(total: number, mode: Exclude<BudgetDistribution, "manual">, previousShape?: number[]): number[];
/** The sum of twelve typed months equals the total (to the centavo). */
export function monthsAddUp(months: number[], total: number): boolean;

/** Key of a line: `${category}` or `${category}:${accountId}`. */
export type LineKey = string;
export function lineKey(category: ExpenseCategory, accountId?: string | null): LineKey;

export type BudgetTone = "brand" | "attention" | "overdue" | "none";
export interface BudgetLine {
  key: LineKey;
  category: ExpenseCategory;
  accountId: string | null;
  label: string;                 // grupo label or conta name
  /** Own rows, or (grupo without own rows) the sum of its contas; empty months when no budget. */
  budgeted: number[];            // 12, by safra month
  budgetedTotal: number;
  budgetedToDate: number;        // months up to today's month
  hasBudget: boolean;            // own rows exist (a grupo summing its contas counts as having one)
  ownRows: boolean;              // the line has its own rows
  distribution: BudgetDistribution | null;
  realized: number[];            // 12, up to today only
  realizedToDate: number;
  forecast: number;              // previsto até o fim
  usedPct: number | null;        // realizedToDate / budgetedToDate; null without budget to date
  tone: BudgetTone;              // ≤ 90 brand, 90–100 attention, > 100 overdue, none without budget
}
export interface BudgetGroup extends BudgetLine {
  accounts: BudgetLine[];        // only contas with a budget or realizado
  /** Sum of the contas' totals when the grupo has its own rows AND contas have rows and they differ; else null. */
  accountsSum: number | null;
}
export interface BudgetView {
  safra: number;
  startMonth: number;
  months: SafraMonth[];
  /** Index of today's month in `months`; -1 before the safra, 12 after it. */
  todayIndex: number;
  groups: BudgetGroup[];         // EXPENSE_GROUPS order; grupos with neither orçado nor realizado left out
  totals: Pick<BudgetLine, "budgeted" | "budgetedTotal" | "budgetedToDate" | "realized" | "realizedToDate" | "forecast" | "usedPct" | "tone">;
  /** Up to three grupos above 100 %, worst first: for the Painel band. */
  over: { label: string; usedPct: number }[];
}
export interface BudgetInputs { budgets: Budget[]; expenses: Expense[]; treatments: Treatment[]; accounts: Account[] }
export function budgetView(inputs: BudgetInputs, safra: number, startMonth: number, todayIso: string): BudgetView;

/** Previous safra's realizado per month for a line (the "previous" shape). */
export function previousShape(inputs: BudgetInputs, key: LineKey, safra: number, startMonth: number, todayIso: string): number[];

/** What "Copiar" would write: one line per source line without budget in `to`. */
export interface CopyLine { category: ExpenseCategory; accountId: string | null; months: number[] }
export function copyPlan(inputs: BudgetInputs, from: number, to: number, source: "budgeted" | "realized", adjustPct: number, startMonth: number, todayIso: string): { lines: CopyLine[]; skipped: number };
```

Rules (spec "Rules"): forecast = realizadoToDate + for each remaining month
(the current one included) the despesas already generated with a `date` in
it when any exist for the line, else that month's orçado; for the current
month the larger of the two. `realized` of a grupo = its despesas (with the
treatments on `health`) whatever their conta; of a conta = that conta's.
Realizado for the Painel and the table stops at today.

### API — domain `budgets` (`lib/api/domains/budgets/`)

```
GET    /budgets?safra=2025                       → Budget[]            (view finance)
PUT    /budgets   body { safra, category, accountId?: string, months: number[12] (≥ 0), distribution }
                                                 → Budget[] (the 12 rows) (edit finance)
                                                 400 months_mismatch (not 12), invalid_account (conta not of this farm / not of that category)
DELETE /budgets?safra=&category=&accountId=      → { removed: number }  (edit finance)
POST   /budgets/copy body { from, to, source: "budgeted" | "realized", adjustPct: -50..100 }
                                                 → { copied, skipped, budgets: Budget[] (all of `to`) } (edit finance)
PUT    /farm      body += safraStartMonth?: 1..12 (absent leaves it)
```
Use cases: `ListBudgetsUseCase`, `PutBudgetLineUseCase` (transaction: delete
the line's rows, insert 12; `updated_by` = user id), `DeleteBudgetLineUseCase`,
`CopyBudgetsUseCase` (reads the source safra's budgets + the farm's
despesas/treatments/accounts, runs `copyPlan`, writes with the same insert
as Put). Route requirements: the four budget routes + `PUT /api/herd/farm`
unchanged. Mappers: `toBudget(row)`, `toFarmData` gains `safraStartMonth`.

### Store (`lib/store/useHerdStore.ts`)

```ts
/** Budgets by safra, loaded on demand; absent = not loaded yet. */
budgets: Record<number, Budget[]>;
loadBudgets: (safra: number) => Promise<Budget[]>;
saveBudgetLine: (input: { safra: number; category: ExpenseCategory; accountId?: string; months: number[]; distribution: BudgetDistribution }) => Promise<void>;
removeBudgetLine: (input: { safra: number; category: ExpenseCategory; accountId?: string }) => Promise<void>;
copyBudgets: (input: { from: number; to: number; source: "budgeted" | "realized"; adjustPct: number }) => Promise<{ copied: number; skipped: number }>;
saveFarm: unchanged signature; FarmData carries safraStartMonth (the form sends it).
```
`loadBudgets` is called by the Orçamento page for its safra and by the
Painel for the current safra; the store caches per safra and every write
replaces that safra's array with the server's answer.

### UI

```
app/(app)/finance/orcamento/page.tsx            RequireAccess finance view; Suspense; ?safra=2025 (absent = current)
components/finance/orcamento/OrcamentoPage.tsx  header, FinanceSubnav current="orcamento", strip, table / phone cards, dialogs
components/finance/orcamento/SafraPicker.tsx     previous · current · next
components/finance/orcamento/BudgetTable.tsx     md+: Grupo › Conta (expandable), Orçado, Realizado, % usado (meter + number), Previsto até o fim, Mês a mês (sparkline), pencil; Total row; legend
components/finance/orcamento/BudgetCards.tsx     phone: one card per grupo opening to its contas
components/finance/orcamento/BudgetEditDialog.tsx  per grupo: total, distribution radios, 12 month inputs, check line, contas collapsed, "Remover orçamento do grupo"
components/finance/orcamento/CopyDialog.tsx      copiar de (orçado · realizado) safra X, ajuste %, preview, Copiar
components/finance/orcamento/Sparkline.tsx       bars = realizado, line = orçado (inline SVG, role="img")
components/finance/BudgetBand.tsx                Painel band under CapitalStrip; hidden without a current-safra budget
components/settings/FarmDataForm.tsx             "Início da safra" month select
components/finance/FinanceSubnav.tsx             section "orcamento" · "Orçamento" · /finance/orcamento
```
Empty safra: "Nenhum orçamento para esta safra" with "Copiar da safra
anterior" and "Orçar um grupo" (opens the edit dialog on Nutrição). Changing
`safraStartMonth` with budgets saved shows a warning line in the farm form
("Os orçamentos guardam seus meses; mudar o início espalha a safra atual
por duas safras.").

### Amendments found while verifying (these win over the signatures above)



## Decided by the controller before verification: budgets keep the calendar month, not a safra number

The spec promises that saved budgets keep their calendar months, so a changed
`safra_start_month` spreads them over two safras. A row keyed by `(safra,
month 1–12)` cannot do that: March of "safra 2025/26" is March 2026, and
after a change to a January start it would be shown as March 2025. So:

- `budgets` has NO `safra` column. `month` is a `date` (the first day of the
  month, `YYYY-MM-01`). Unique index on `(farm_id, category,
  coalesce(account_id, ''), month)` (name `budgets_line_month_idx`); index on
  `(farm_id, month)`.
- `Budget { id; category; accountId?; month: string /* "YYYY-MM-01" */; amountBrl; distribution }` — no `safra` field.
- `lib/domain/budget.ts`: `budgetView(inputs, safra, startMonth, today)` takes
  the rows whose `month.slice(0, 7)` is one of `safraMonths(safra, startMonth)[i].key`
  and places each at that index. Every 12-value array stays in safra order
  (index 0 = the start month). `copyPlan` reads both safras' rows from the
  same `inputs.budgets`; its `CopyLine.months` is in safra order of `to`.
- API keeps `safra` in its interface: `GET /budgets?safra=` answers the rows
  with `month` inside `safraRange(safra, farm.safra_start_month)`; `PUT`
  takes `{ safra, category, accountId?, months[12], distribution }` and
  writes `month = ${year}-${mm}-01` from `safraMonths(safra, startMonth)[i]`,
  after deleting the line's rows inside that range; `DELETE` removes the
  line's rows inside the range; `copy` maps `CopyLine.months` to the
  calendar months of `to`. Every use case reads `farm.safra_start_month`
  first (one select; `lib/api/domains/budgets/budgetLine.ts` holds that
  read plus the shared filters).
- Store: cache still `budgets: Record<number, Budget[]>` keyed by the safra
  asked for; `saveFarm` that changes `safraStartMonth` clears the cache
  (`budgets: {}`), because the same rows now belong to other safras.
- Farm form warning (task 6): "Os orçamentos guardam seus meses do
  calendário: mudar o início da safra redistribui-os entre as safras."
- The spec's Data section is amended to this by the controller.

## Reported by the drafters

- task 1 also touches: `lib/data/seed.ts` (`FARM.safraStartMonth: 10`), `lib/api/domains/herd/useCases/Load.useCase.ts` (fallback farm), `lib/api/domains/farm/farm.controller.ts`, `lib/store/useHerdStore.ts` (initial `farm`), `components/settings/FarmDataForm.tsx` (sends `safraStartMonth` back unchanged), test fixtures `lib/domain/__tests__/moneyRedaction.test.ts`, `lib/offline/__tests__/snapshot.test.ts`, `components/reports/__tests__/data.ts`. `SaveFarmUseCase` takes `safraStartMonth` optional and writes it only when sent. An offline snapshot saved before this change has no `farm.safraStartMonth`: read it as `?? 10`.
- task 3: PUT body does not pin 12 items (Elysia would answer 422); the use case answers 400 `months_mismatch`. Copied lines are saved as `"manual"`. Extra file `lib/api/domains/budgets/budgetLine.ts`. Eden types `api.budgets.delete({}, { query })`. In Vitest 4.1 `-u` goes AFTER the paths.
- task 2: `usedPct` is a percentage (120 = 120 %). A safra is empty (and the Painel band hidden) when `!view.groups.some((g) => g.hasBudget)`. `safraLabel` returns "Safra 2025/26" (capital S). `previousShape(inputs, key, safra, …)` reads `safra − 1`. `monthsAddUp` is false unless exactly 12 months. For today's month the previsto takes the larger of its orçado and every despesa dated in it.
- task 4: a farm switch, a new farm or `refreshAccess` empties `budgets`; pages call `loadBudgets` whenever `budgets[safra]` is undefined; the Painel checks Financeiro view before calling it (a 403 would toast).

## Found while verifying 1–4 (executed in the sandbox; these are what the code now is)

- `Budget` (final): `{ id: string; category: ExpenseCategory; accountId?: string; month: string /* "YYYY-MM-01" */; amountBrl: number; distribution: BudgetDistribution }`. No `safra`. `SafraMonth.month` stays the calendar month 1–12; a row sits at the index i where `row.month.slice(0, 7) === safraMonths(safra, start)[i].key`.
- DB: `budgets.month date NOT NULL` (no CHECK on it), `budgets_amount_check` only; indexes `budgets_line_month_idx` (unique, `farm_id, category, coalesce(account_id, ''), month`) and `budgets_farm_id_month_idx` (`farm_id, month`). Migration `drizzle/0025_financeiro-orcamento.sql` as generated by drizzle-kit (no prompt).
- The compile-fix fixture is `lib/reports/__tests__/data.ts`, not `components/reports/__tests__/data.ts`.
- Domain: `budgetView` and `copyPlan` take `inputs.budgets` with any months and pick their safra's by month key. `copyPlan`'s "already has a budget in `to`" = any row of the line with `month` inside `safraRange(to, start)`. So a client that previews "Copiar" must pass BOTH safras' rows: `budgets: [...(budgets[from] ?? []), ...(budgets[to] ?? [])]` (call `loadBudgets` for both). Same for the edit dialog's "previous safra's orçado" hint: it needs `budgets[safra - 1]`.
- API (`lib/api/domains/budgets/budgetLine.ts`): `safraStartMonth(repo, farmId): Promise<number>` (10 when the row is missing), `safraWhere(farmId, startMonth, safra)` (`farm_id = … and month between start and end`), `lineWhere(farmId, startMonth, { safra, category, accountId? })`, `lineRows(farmId, userId, startMonth, { safra, category, accountId?, months, distribution })` (`month = \`${key}-01\``). Every use case reads the start month first (Put: after the conta check); Copy reads `or(safraWhere(from), safraWhere(to))`.
- Bodies and answers (unchanged in shape; `month` is now the string): `GET /budgets?safra=2025` → `Budget[]` (rows with `month` in that safra); `PUT /budgets { safra, category, accountId?, months: number[] (each ≥ 0, count checked by the use case), distribution }` → the 12 `Budget` rows; 400 `{ error: "months_mismatch" }` (not 12) or `{ error: "invalid_account" }`; `DELETE /budgets?safra=&category=&accountId=` (Eden: `api.budgets.delete({}, { query })`) → `{ removed: number }`; `POST /budgets/copy { from, to, source: "budgeted" | "realized", adjustPct: -50..100 }` → `{ copied, skipped, budgets: Budget[] /* all of to */ }`. Schema violations (safra outside 2000–2100, negative month, adjustPct out of range) are Elysia 422. 403 `{ error: "forbidden", area: "finance" }` without Financeiro view (GET) or edit (writes).
- Store (final): `budgets: Record<number, Budget[]>`; `loadBudgets(safra): Promise<Budget[]>`; `saveBudgetLine({ safra, category, accountId?, months, distribution }): Promise<void>`; `removeBudgetLine({ safra, category, accountId? }): Promise<void>`; `copyBudgets({ from, to, source, adjustPct }): Promise<{ copied; skipped }>`. `budgets` becomes `{}` on `switchFarm`, `createFarm`, `refreshAccess`, and on `saveFarm` when the answer's `safraStartMonth` differs from the store's (same start: kept). Writes into a safra not loaded leave it absent.
- Task 4 also owns `lib/store/__tests__/budgets.test.ts` (the merge and the `saveFarm` clear). Task 1 already sets the store's initial `farm.safraStartMonth: 10`; task 4 no longer touches it.
- Counts after task 4: tsc clean; eslint clean on every changed file; `vitest run lib components app --exclude '**/worktrees/**'` 180 files, 1766 tests.

## Found while verifying 5–7 (executed in the sandbox; these are what the code now is)

- Task 5 adds two files the contract's UI list does not name: `components/finance/orcamento/BudgetMeter.tsx` (exports `BudgetMeter({ pct, tone, className? })` — a `role="meter"` named "<n> % do orçado" —, `TONE_TEXT`, `TONE_BAR`, `usedText(pct)` "108 %", `reais(value)` "R$ 360.000"; task 6's band imports it) and `components/finance/orcamento/editFields.ts` (pure, tested in `components/finance/__tests__/editFields.test.ts`, 15 tests: `LineFields`, `LineCheck`, `lineFields`, `withTotal`, `withDistribution`, `withMonth`, `checkLine`).
- Props: `BudgetTable` / `BudgetCards` `{ view, canEdit, onEdit(category), onAdd() }`; `BudgetEditDialog { safra, startMonth, category, pickGroup, onCategoryChange, view, previous: Budget[] | undefined, inputs, today, onOpenChange }`; `CopyDialog { safra, startMonth, inputs, source: Budget[] | undefined, onOpenChange }`; `SafraPicker { value, current, startMonth, onChange }`; `Sparkline { label, budgeted, realized, todayIndex }`; `BudgetBand { view: BudgetView | null, period }` (null without a grupo with orçado).
- URL: `/finance/orcamento?safra=YYYY` (absent = the safra holding today); `?de&ate` ride along for the sub-navigation; the band links to `?safra=<current>&de=…&ate=…`.
- `FinanceSubnav` becomes `"use client"` and, on the phone, scrolls the current pill to the middle of its row (at 390 px "Orçamento" lay past the edge). Task 5 now replaces the whole file.
- `FarmDataForm` loads the current safra's budgets itself (`loadBudgets(safraOf(today, saved start))` when absent, only with `useCan("finance", "view")`), so the warning shows on a direct visit to Configurações too; it still warns only for budgets of the current safra (`ponytail:` comment). Warning: `role="status"`, text as above.
- Labels and ids the smoke relies on: combobox "Safra"; button "Copiar da safra anterior" (phone shows "Copiar", same accessible name); "Orçar um grupo"; pencil "Editar orçamento de <grupo>"; grupo toggles named by the grupo with `aria-expanded`; strip `main dl > div` (dt, value dd, sub dd); sparkline `svg[role=img]` "<grupo>: realizado mês a mês contra o orçado"; dialog heading "Orçamento · <grupo>", "Grupo" (from "Orçar um grupo" only), "Total do grupo (R$)", fieldset "Distribuir por mês" with radios Igual / Como a safra anterior / Manual, month inputs labelled "jul/26"…, `summary` "Contas", conta totals labelled by the conta name, "Remover orçamento do grupo", "Salvar orçamento", `role="alert"` "<grupo> · A soma dos meses não confere com o total."; copy dialog heading "Copiar da safra anterior", radios "Orçado" / "Realizado", "Ajuste (%)", "Copiar"; band `section[aria-label="Orçamento da safra"]`, list "Grupos acima do orçado", link "Ver orçamento"; settings combobox "Início da safra" (id `farm-safraStartMonth`); toasts "Orçamento de <grupo> salvo|removido", "N linhas copiadas · M já tinham orçamento", "Dados da fazenda salvos".
- Smoke (`smoke.mjs`, section 07): 234/234 on 2026-10-04 (251/251 on `main` after the amendments at the end of this plan), including a start month moved one month later regrouping the saved rows over two safras (store cache dropped on the client-side move, the Painel band and the Orçamento follow), the band hidden before any budget, consultor (no pencil, no Copiar, 403 on writes) and vaqueiro (403 on GET, page and Painel closed, no budgets request from any page).
- Counts after tasks 5–6: tsc clean; eslint clean on every changed file; `vitest run lib components app --exclude '**/worktrees/**'` 181 files, 1781 tests; `next build --webpack` passes with `/finance/orcamento`.

## Tasks, waves and files


Wave 1
1. **Foundation** — `lib/types.ts`, `lib/db/schema.ts`, `drizzle/0025_financeiro-orcamento.sql` (+ meta), `lib/api/mappers.ts`, `lib/api/domains/farm/schemas/farm.schema.ts`, `lib/api/domains/farm/useCases/Save.useCase.ts` (+ its test), `lib/api/__tests__/mappers.test.ts`, `lib/domain/moneyRedaction.ts` (nothing to strip: budgets are not in the herd — confirm only), `lib/data/seed.ts` untouched. tsc clean after it.

Wave 2 (parallel)
2. **Budget domain** — `lib/domain/budget.ts`, `lib/domain/__tests__/budget.test.ts`.
3. **Budgets API** — `lib/api/domains/budgets/**` (controller, schemas, use cases, tests), registration of the controller where the other domains register (find how `expensesController` is mounted in `lib/api/app.ts` or its index), `lib/api/permissions/routeRequirements.ts`, the two snapshots.

Wave 3
4. **Store** — `lib/store/useHerdStore.ts` (budgets cache and the four actions; `saveFarm` body carries `safraStartMonth`).

Wave 4 (parallel)
5. **Orçamento page** — `app/(app)/finance/orcamento/page.tsx`, `components/finance/orcamento/*`, `components/finance/FinanceSubnav.tsx`.
6. **Painel band and farm setting** — `components/finance/BudgetBand.tsx`, `app/(app)/finance/page.tsx`, `components/settings/FarmDataForm.tsx`.

Wave 5
7. **Whole-change review and smoke** (controller).

---

### Task 1: Foundation

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0025_financeiro-orcamento.sql` (generated)
- Create: `drizzle/meta/0025_snapshot.json` (generated)
- Modify: `drizzle/meta/_journal.json` (generated)
- Modify: `lib/api/mappers.ts`
- Modify: `lib/api/domains/farm/schemas/farm.schema.ts`
- Modify: `lib/api/domains/farm/useCases/Save.useCase.ts`
- Modify (one line each, so `tsc` stays clean once `FarmData.safraStartMonth` is required): `lib/data/seed.ts`, `lib/api/domains/herd/useCases/Load.useCase.ts`, `lib/store/useHerdStore.ts`, `components/settings/FarmDataForm.tsx`, `lib/domain/__tests__/moneyRedaction.test.ts`, `lib/offline/__tests__/snapshot.test.ts`, `lib/reports/__tests__/data.ts`
- Test: `lib/api/__tests__/mappers.test.ts`
- Test: `lib/api/domains/farm/useCases/__tests__/Save.test.ts`
- Read only: `lib/domain/moneyRedaction.ts`. Nothing to strip: budgets are not in `HerdData`, and `safraStartMonth` is not money. Leave it as it is.

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `@/lib/types`: `type BudgetDistribution = "equal" | "previous" | "manual"`; `interface Budget { id: string; category: ExpenseCategory; accountId?: string; month: string /* "YYYY-MM-01" */; amountBrl: number; distribution: BudgetDistribution }` (no `safra`: the farm's start month groups the months into safras when they are read); `FarmData.safraStartMonth: number` (required).
  - `@/lib/db/schema`: `budgetDistributionEnum`; table `budgets` with columns `id, farmId, category, accountId (nullable, FK accounts cascade), month (date, the month's first day, string "YYYY-MM-01" in TS), amountBrl, distribution, updatedAt (default now), updatedBy (NOT NULL: every insert must pass the user id)`; no `safra` column; unique index `budgets_line_month_idx` on `(farm_id, category, coalesce(account_id, ''), month)`; index `budgets_farm_id_month_idx` on `(farm_id, month)`; `type BudgetRow = typeof budgets.$inferSelect`; `farm.safraStartMonth` (NOT NULL, default 10, check 1–12).
  - `@/lib/api/mappers`: `toBudget(row: BudgetRow): Budget`; `toFarmData(row)` now returns `safraStartMonth`.
  - `FarmDataBody` (PUT /farm) accepts `safraStartMonth?: 1..12`; `SaveFarmUseCase` takes `data: Omit<FarmData, "headquarters" | "safraStartMonth"> & Partial<Pick<FarmData, "safraStartMonth">>` and writes the column only when it is sent.
  - Store `saveFarm(d: Omit<FarmData, "headquarters">)` keeps its signature, so `d` now carries `safraStartMonth`. `FarmDataForm` sends the farm's current value unchanged, and task 6 adds the select.

- [ ] **Step 1: Write the failing tests**

`lib/api/__tests__/mappers.test.ts`: four Replace blocks.

Replace:
```ts
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 */
```
with:
```ts
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 * toBudget: a month of a grupo's or a conta's line, without the farm and audit columns.
 * toFarmData: the início da safra travels with the farm.
 */
```

Replace:
```ts
import { toAccount, toBankAccount, toExpense } from "@/lib/api/mappers";
import type { BankAccountRow, ExpenseRow, ExpenseSeriesRow, FarmAccountRow } from "@/lib/db/schema";
```
with:
```ts
import { toAccount, toBankAccount, toBudget, toExpense, toFarmData } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
  FarmRow,
} from "@/lib/db/schema";
```

Replace (the file's last block):
```ts
  it("says nothing when the very first linha still waits, or there is no extrato", () => {
    expect(toBankAccount(BANK, { ...LINES, pending: 3, firstPendingDate: "2026-09-01" }).reconciledUntil).toBeUndefined();
    expect(toBankAccount(BANK)).toMatchObject({ pendingLines: 0 });
    expect(toBankAccount(BANK).reconciledUntil).toBeUndefined();
  });
});
```
with:
```ts
  it("says nothing when the very first linha still waits, or there is no extrato", () => {
    expect(toBankAccount(BANK, { ...LINES, pending: 3, firstPendingDate: "2026-09-01" }).reconciledUntil).toBeUndefined();
    expect(toBankAccount(BANK)).toMatchObject({ pendingLines: 0 });
    expect(toBankAccount(BANK).reconciledUntil).toBeUndefined();
  });
});

const BUDGET: BudgetRow = {
  id: "bud-1",
  farmId: 7,
  category: "nutrition",
  accountId: "acc-1",
  month: "2025-10-01",
  amountBrl: 8333.33,
  distribution: "equal",
  updatedAt: new Date("2026-10-02T12:00:00Z"),
  updatedBy: "u-lucas",
};

describe("toBudget", () => {
  it("carries a conta's month and leaves the farm and audit columns behind", () => {
    expect(toBudget(BUDGET)).toEqual({
      id: "bud-1",
      category: "nutrition",
      accountId: "acc-1",
      month: "2025-10-01",
      amountBrl: 8333.33,
      distribution: "equal",
    });
  });

  it("gives a grupo's own line no conta", () => {
    expect(toBudget({ ...BUDGET, accountId: null }).accountId).toBeUndefined();
  });
});

const FARM: FarmRow = {
  id: 7,
  name: "Fazenda Boa Vista",
  municipality: "Uberaba - MG",
  stateRegistration: "",
  manager: "Lucas",
  headquartersLat: null,
  headquartersLng: null,
  headquartersZoom: null,
  deletedAt: null,
  safraStartMonth: 7,
};

describe("toFarmData", () => {
  it("carries the início da safra", () => {
    expect(toFarmData(FARM)).toMatchObject({ name: "Fazenda Boa Vista", safraStartMonth: 7 });
  });
});
```

`lib/api/domains/farm/useCases/__tests__/Save.test.ts`: three Replace blocks.

Replace:
```ts
 * saveFarm: the registration fields only; the sede has its own use case.
```
with:
```ts
 * saveFarm: the registration fields and, when sent, the início da safra; the
 * sede has its own use case.
```

Replace:
```ts
  headquartersZoom: 15,
};
```
with:
```ts
  headquartersZoom: 15,
  safraStartMonth: 10,
};
```

Replace:
```ts
    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
    });
  });
```
with:
```ts
    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
      safraStartMonth: 10,
    });
  });

  it("writes the início da safra when sent and leaves it when not", async () => {
    await new SaveFarmUseCase().run({ farmId: 1, data: { ...REGISTRATION, safraStartMonth: 7 } });
    expect(state.columns).toEqual({ ...REGISTRATION, safraStartMonth: 7 });

    await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });
    expect(state.columns).not.toHaveProperty("safraStartMonth");
  });
```

(Vitest does not type-check, so the missing `BudgetRow`/`FarmRow.safraStartMonth` types do not stop these from running.)

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts lib/api/domains/farm/useCases/__tests__/Save.test.ts`
Expected: FAIL. Five tests fail:
- Two report `TypeError: toBudget is not a function`.
- `toFarmData` lacks `safraStartMonth`.
- The Save result lacks `safraStartMonth: 10`.
- The `.set()` columns lack `safraStartMonth: 7`.

- [ ] **Step 3: Implement**

**3a. `lib/types.ts`**

Replace:
```ts
/** Recurring health protocol of the farm. */
export interface HealthProtocol {
```
with:
```ts
/** How the twelve months of an orçamento line were filled. */
export type BudgetDistribution = "equal" | "previous" | "manual";

/**
 * One month of one line of the orçamento: a grupo's own line (accountId absent)
 * or a conta's. It carries no safra: which safra a month falls in follows from
 * the farm's `safraStartMonth`.
 */
export interface Budget {
  id: string;
  category: ExpenseCategory;
  accountId?: string;
  /** First day of the calendar month, "YYYY-MM-01". */
  month: string;
  amountBrl: number;
  /** The mode last used for the line; the same on its twelve rows. */
  distribution: BudgetDistribution;
}

/** Recurring health protocol of the farm. */
export interface HealthProtocol {
```

Replace:
```ts
  headquarters?: { lat: number; lng: number; zoom?: number };
}
```
with:
```ts
  headquarters?: { lat: number; lng: number; zoom?: number };
  /** 1–12; the safra starts on this month (10 = outubro). */
  safraStartMonth: number;
}
```

**3b. `lib/db/schema.ts`**

Replace:
```ts
/** Why an animal left the active herd. */
export const inactiveReasonEnum = pgEnum("inactive_reason", [
```
with:
```ts
/** How the twelve months of an orçamento line were filled. */
export const budgetDistributionEnum = pgEnum("budget_distribution", [
  "equal",
  "previous",
  "manual",
]);

/** Why an animal left the active herd. */
export const inactiveReasonEnum = pgEnum("inactive_reason", [
```

Replace the whole `farm` table:
```ts
/** Farm registration data. */
export const farm = pgTable("farm", {
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
});
```
with:
```ts
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
```

Replace:
```ts
/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
```
with:
```ts
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
    category: expenseCategoryEnum("category").notNull(),
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

/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
```

Replace:
```ts
export type StatementLineRow = typeof statementLines.$inferSelect;
```
with:
```ts
export type StatementLineRow = typeof statementLines.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
```

No CHECK mentions `budget_distribution`. The enum is created in this same migration, and the checks only touch integers and numerics. `date` is already in the `drizzle-orm/pg-core` import list; its default mode reads and writes `"YYYY-MM-DD"` strings.

**3c. Migration**

Run: `pnpm exec drizzle-kit generate --name financeiro-orcamento`

If drizzle-kit stops on an interactive "created or renamed?" prompt, which it may do when it thinks a column was renamed, run this instead. It answers the first default, which is "create", and is the right answer for every question here:
`(sleep 6; printf '\r') | timeout 60 script -qfec "pnpm exec drizzle-kit generate --name financeiro-orcamento" /dev/null`

Expected: `drizzle/0025_financeiro-orcamento.sql`, `drizzle/meta/0025_snapshot.json`, and a new `_journal.json` entry (`"idx": 25, "tag": "0025_financeiro-orcamento"`). Do not hand-edit them. The SQL must be exactly this (the `when`/snapshot ids differ):
```sql
CREATE TYPE "public"."budget_distribution" AS ENUM('equal', 'previous', 'manual');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"category" "expense_category" NOT NULL,
	"account_id" text,
	"month" date NOT NULL,
	"amount_brl" numeric NOT NULL,
	"distribution" "budget_distribution" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "budgets_amount_check" CHECK ("budgets"."amount_brl" >= 0)
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "safra_start_month" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_line_month_idx" ON "budgets" USING btree ("farm_id","category",coalesce("account_id", ''),"month");--> statement-breakpoint
CREATE INDEX "budgets_farm_id_month_idx" ON "budgets" USING btree ("farm_id","month");--> statement-breakpoint
ALTER TABLE "farm" ADD CONSTRAINT "farm_safra_start_month_check" CHECK ("farm"."safra_start_month" between 1 and 12);
```
If it differs in anything else, such as a DROP, a RENAME or another table, the schema edit is wrong. Delete the three generated outputs, fix `schema.ts` and generate again.

**3d. `lib/api/mappers.ts`**

Replace:
```ts
  BankAccount,
  Breeding,
  Calving,
```
with:
```ts
  BankAccount,
  Breeding,
  Budget,
  Calving,
```

Replace:
```ts
  BreedingRow,
  CalvingRow,
```
with:
```ts
  BreedingRow,
  BudgetRow,
  CalvingRow,
```

Replace:
```ts
export function toProtocol(row: HealthProtocolRow): HealthProtocol {
```
with:
```ts
export function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    category: row.category,
    accountId: orNothing(row.accountId),
    month: row.month,
    amountBrl: row.amountBrl,
    distribution: row.distribution,
  };
}

export function toProtocol(row: HealthProtocolRow): HealthProtocol {
```

Replace:
```ts
              : { zoom: row.headquartersZoom }),
          }
        : undefined,
  };
}
```
with:
```ts
              : { zoom: row.headquartersZoom }),
          }
        : undefined,
    safraStartMonth: row.safraStartMonth,
  };
}
```

**3e. `lib/api/domains/farm/schemas/farm.schema.ts`**

Replace:
```ts
/** Body of PUT /farm: the registration fields. The sede has its own route. */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
});
```
with:
```ts
/**
 * Body of PUT /farm: the registration fields and the início da safra (absent
 * leaves it as it is). The sede has its own route.
 */
export const FarmDataBody = t.Object({
  name: t.String(),
  municipality: t.String(),
  stateRegistration: t.String(),
  manager: t.String(),
  safraStartMonth: t.Optional(t.Integer({ minimum: 1, maximum: 12 })),
});
```

**3f. `lib/api/domains/farm/useCases/Save.useCase.ts`**

Replace:
```ts
type SaveFarmUseCaseProps = { farmId: number; data: Omit<FarmData, "headquarters"> };
```
with:
```ts
type SaveFarmUseCaseProps = {
  farmId: number;
  /** `safraStartMonth` absent leaves the stored one. */
  data: Omit<FarmData, "headquarters" | "safraStartMonth"> & Partial<Pick<FarmData, "safraStartMonth">>;
};
```

Replace:
```ts
/**
 * Updates the farm registration data. The sede is saved by
 * SaveHeadquartersUseCase and never touched here. Returns the stored row
 * rather than the input, so the caller's copy is what the database holds.
 */
```
with:
```ts
/**
 * Updates the farm registration data and, when sent, the início da safra. The
 * sede is saved by SaveHeadquartersUseCase and never touched here. Returns the
 * stored row rather than the input, so the caller's copy is what the database
 * holds.
 */
```

Replace:
```ts
        manager: data.manager,
      })
```
with:
```ts
        manager: data.manager,
        ...(data.safraStartMonth === undefined ? {} : { safraStartMonth: data.safraStartMonth }),
      })
```

The controller (`farm.controller.ts`) passes `body` straight through and needs no change.

**3g. `FarmData` literals that stop compiling.** These were found with `tsc` after 3a. Each one is a one-line fix. `cli/seedCli.ts`, `EnsureForUser.useCase.ts` and `Create.useCase.ts` insert farm *rows* without the field, and the DB default 10 covers them, so leave them as they are. `lib/api/__tests__/permissions.test.ts` builds its farm inside an untyped `vi.mock`, so leave it too.

`lib/data/seed.ts`. Replace:
```ts
  headquarters: { lat: -19.721, lng: -47.911 },
};
```
with:
```ts
  headquarters: { lat: -19.721, lng: -47.911 },
  safraStartMonth: 10,
};
```

`lib/api/domains/herd/useCases/Load.useCase.ts`. Replace:
```ts
        : { name: "", municipality: "", stateRegistration: "", manager: "" },
```
with:
```ts
        : { name: "", municipality: "", stateRegistration: "", manager: "", safraStartMonth: 10 },
```

`lib/store/useHerdStore.ts`. Replace:
```ts
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
```
with:
```ts
  farm: { name: "", municipality: "", stateRegistration: "", manager: "", safraStartMonth: 10 },
```

`components/settings/FarmDataForm.tsx` (the form sends the stored value back unchanged; task 6 adds the select). Replace:
```ts
    manager: farm.manager,
  }));
```
with:
```ts
    manager: farm.manager,
    safraStartMonth: farm.safraStartMonth,
  }));
```

`lib/domain/__tests__/moneyRedaction.test.ts`. Replace:
```ts
  farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
```
with:
```ts
  farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "", safraStartMonth: 10 },
```

`lib/offline/__tests__/snapshot.test.ts`. Replace:
```ts
  farm: { name, municipality: "Campo Grande", stateRegistration: "", manager: "" },
```
with:
```ts
  farm: { name, municipality: "Campo Grande", stateRegistration: "", manager: "", safraStartMonth: 10 },
```

`lib/reports/__tests__/data.ts`. Replace:
```ts
    farm: { name: "Fazenda Teste", municipality: "", stateRegistration: "", manager: "" },
```
with:
```ts
    farm: { name: "Fazenda Teste", municipality: "", stateRegistration: "", manager: "", safraStartMonth: 10 },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts lib/api/domains/farm/useCases/__tests__/Save.test.ts lib/api/domains/farm/useCases/__tests__/SaveHeadquarters.test.ts lib/domain/__tests__/moneyRedaction.test.ts lib/offline/__tests__/snapshot.test.ts lib/reports/__tests__ components/reports/__tests__/datasets.test.ts lib/api/__tests__/routeTable.test.ts lib/api/__tests__/routeRequirements.test.ts`
Expected: PASS (12 files, 101 tests). The two route snapshots must pass without `-u`, because no route changed.

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/types.ts lib/db/schema.ts lib/api/mappers.ts lib/api/__tests__/mappers.test.ts lib/api/domains/farm/schemas/farm.schema.ts lib/api/domains/farm/useCases/Save.useCase.ts lib/api/domains/farm/useCases/__tests__/Save.test.ts lib/data/seed.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/store/useHerdStore.ts components/settings/FarmDataForm.tsx lib/domain/__tests__/moneyRedaction.test.ts lib/offline/__tests__/snapshot.test.ts lib/reports/__tests__/data.ts`
Expected: clean, with no errors from any other task (this is wave 1 alone). Nothing visible changes in the app.


### Task 2: Budget domain

**Files:**
- Create: `lib/domain/budget.ts`
- Create: `lib/domain/__tests__/budget.test.ts`
- Test: `lib/domain/__tests__/budget.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `Budget`, `BudgetDistribution` from `@/lib/types`. `Budget` carries no `safra`; its `month` is the calendar month's first day, `"YYYY-MM-01"` (CONTRACT-CHANGES).
  - Existing: `isCost` (`@/lib/domain/entries`); `EXPENSE_GROUPS`, `ACCOUNT_GROUP_LABEL`, `accountsByGroup(accounts, includeArchived)` (`@/lib/domain/accounts`); `cents` (`@/lib/domain/bankAccounts`); `monthYearLabel`, `parseISODate`, `toISO` (`@/lib/domain/dates`); `type Period` (`@/lib/domain/period`); `makeTreatment` (`lib/domain/__tests__/fixtures.ts`).
- Produces (`@/lib/domain/budget`), names and signatures as the contract's Domain block:
  - `SafraMonth`, `safraOf(dateIso, startMonth)`, `safraMonths(safra, startMonth)`, `safraLabel(safra, startMonth)`, `safraRange(safra, startMonth): Period`
  - `distribute(total, mode, previousShape?)`, `monthsAddUp(months, total)` (also false when `months.length !== 12`)
  - `LineKey`, `lineKey(category, accountId?)`
  - `BudgetTone`, `BudgetLine`, `BudgetGroup`, `BudgetView`, `BudgetInputs`, `budgetView(inputs, safra, startMonth, todayIso)`
  - `previousShape(inputs, key, safra, startMonth, todayIso)`: `safra` is the safra being budgeted; it reads `safra − 1`.
  - `CopyLine`, `copyPlan(inputs, from, to, source, adjustPct, startMonth, todayIso)`
  - Conventions later tasks rely on: every 12-number array (`budgeted`, `realized`, `CopyLine.months`, `distribute`'s result, and the `months` the PUT body should carry) is in **safra order**, index 0 = `startMonth`; a row sits at the index i where `b.month.slice(0, 7) === safraMonths(safra, startMonth)[i].key`. `budgetView` reads only the rows whose month falls inside the safra, so `inputs.budgets` may hold any months (a changed start month regroups the saved ones over two safras). `copyPlan` reads both safras from the same `inputs.budgets`. `usedPct` is in % (120 = 120 %). The empty-safra state and the Painel band test `view.groups.some((g) => g.hasBudget)`.

Cycles 2–6 append to the two files; keep a blank line before each appended block. The test file imports every name from cycle 1 on (vitest reads a missing export as `undefined`), so lint only runs at Step 5.

#### Cycle 1: Safra math

safraOf, safraMonths, safraLabel, safraRange for start months 10, 1 and 12, and a safra ending on a leap 29 February (Review Focus 1).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/__tests__/budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Account, Budget, Expense, ExpenseCategory } from "@/lib/types";
import {
  budgetView,
  copyPlan,
  distribute,
  lineKey,
  monthsAddUp,
  previousShape,
  safraLabel,
  safraMonths,
  safraOf,
  safraRange,
  type BudgetInputs,
} from "@/lib/domain/budget";
import { makeTreatment } from "./fixtures";

/** Twelve months in safra order: the given ones, then zeros. */
const months = (...head: number[]): number[] => [...head, ...Array<number>(12 - head.length).fill(0)];

describe("safra months", () => {
  it("starts in outubro: Safra 2025/26 runs 01/10/2025 to 30/09/2026", () => {
    expect(safraOf("2025-10-01", 10)).toBe(2025);
    expect(safraOf("2025-09-30", 10)).toBe(2024);
    expect(safraOf("2026-09-30", 10)).toBe(2025);
    expect(safraMonths(2025, 10).map((m) => m.label)).toEqual([
      "out/25", "nov/25", "dez/25", "jan/26", "fev/26", "mar/26",
      "abr/26", "mai/26", "jun/26", "jul/26", "ago/26", "set/26",
    ]);
    expect(safraMonths(2025, 10)[3]).toEqual({ year: 2026, month: 1, label: "jan/26", key: "2026-01" });
    expect(safraLabel(2025, 10)).toBe("Safra 2025/26");
    expect(safraRange(2025, 10)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
  });

  it("starts in janeiro: the calendar year, labelled Safra 2026", () => {
    expect(safraOf("2026-01-01", 1)).toBe(2026);
    expect(safraOf("2026-12-31", 1)).toBe(2026);
    expect(safraMonths(2026, 1).map((m) => m.key)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    ]);
    expect(safraLabel(2026, 1)).toBe("Safra 2026");
    expect(safraRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("starts in dezembro: Safra 2026/27 runs dez/26 to nov/27", () => {
    expect(safraOf("2026-11-30", 12)).toBe(2025);
    expect(safraOf("2026-12-01", 12)).toBe(2026);
    const ms = safraMonths(2026, 12);
    expect([ms[0].label, ms[1].label, ms[11].label]).toEqual(["dez/26", "jan/27", "nov/27"]);
    expect(safraLabel(2026, 12)).toBe("Safra 2026/27");
    expect(safraRange(2026, 12)).toEqual({ start: "2026-12-01", end: "2027-11-30" });
  });

  it("ends on a leap 29 February", () => {
    expect(safraRange(2027, 3)).toEqual({ start: "2027-03-01", end: "2028-02-29" });
    expect(safraRange(2026, 3).end).toBe("2027-02-28");
    expect(safraMonths(2027, 3)[11]).toEqual({ year: 2028, month: 2, label: "fev/28", key: "2028-02" });
    expect(safraOf("2028-02-29", 3)).toBe(2027);
    expect(safraOf("2028-03-01", 3)).toBe(2028);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — `Cannot find package '@/lib/domain/budget'`: the module does not exist yet.

- [ ] **Step 3: Implement**

Create `lib/domain/budget.ts`:

```ts
/**
 * Orçamento por safra: the safra's months, how a total spreads over them, and
 * per grupo and conta the orçado, the realizado (competência, up to today),
 * the previsto até o fim and the % usado. Pure: `today` always comes in.
 *
 * Every 12-number array is in safra order: index 0 is `startMonth` of the
 * safra. A Budget row is one calendar month; the farm's start month decides
 * which safra, and which index in it, that month falls on.
 */
import type {
  Account,
  Budget,
  BudgetDistribution,
  Expense,
  ExpenseCategory,
  Treatment,
} from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { cents } from "@/lib/domain/bankAccounts";
import { monthYearLabel, parseISODate, toISO } from "@/lib/domain/dates";
import { isCost } from "@/lib/domain/entries";

export interface SafraMonth {
  year: number;
  /** Calendar month 1–12. */
  month: number;
  /** "out/25" */
  label: string;
  /** "YYYY-MM" */
  key: string;
}

/** The safra `dateIso` falls in: the calendar year it started. */
export function safraOf(dateIso: string, startMonth: number): number {
  const d = parseISODate(dateIso);
  return d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
}

/** The 12 months from `startMonth` of `safra` on. */
export function safraMonths(safra: number, startMonth: number): SafraMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(safra, startMonth - 1 + i, 1);
    const iso = toISO(d);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: monthYearLabel(iso), key: iso.slice(0, 7) };
  });
}

/** "Safra 2025/26" (start ≠ 1) or "Safra 2026" (start = 1). */
export function safraLabel(safra: number, startMonth: number): string {
  return startMonth === 1 ? `Safra ${safra}` : `Safra ${safra}/${String(safra + 1).slice(-2)}`;
}

/** First and last day. */
export function safraRange(safra: number, startMonth: number): Period {
  return {
    start: toISO(new Date(safra, startMonth - 1, 1)),
    end: toISO(new Date(safra, startMonth + 11, 0)),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (4 passed)

#### Cycle 2: distribute and monthsAddUp

Equal with the remainder on the last month (R$ 100,00 → 8,33 × 11 + 8,37), previous with a zero month, all-zero and missing shape fall back to equal, typed months that do not add up (Review Focus 2).

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/__tests__/budget.test.ts`:

```ts
describe("distribute and monthsAddUp", () => {
  it("equal: floored to the centavo, the remainder on the last month", () => {
    const out = distribute(100, "equal");
    expect(out).toEqual([...Array<number>(11).fill(8.33), 8.37]);
    expect(monthsAddUp(out, 100)).toBe(true);
    expect(distribute(1200, "equal")).toEqual(Array<number>(12).fill(100));
  });

  it("previous: proportional to the shape, a zero month stays zero", () => {
    expect(distribute(1000, "previous", months(2, 0, 1, 1))).toEqual(months(500, 0, 250, 250));
    // The remainder still lands on the last month.
    const out = distribute(100, "previous", months(1, 1, 1));
    expect(out).toEqual([33.33, 33.33, 33.33, 0, 0, 0, 0, 0, 0, 0, 0, 0.01]);
    expect(monthsAddUp(out, 100)).toBe(true);
  });

  it("previous falls back to equal when the shape is all zero or missing", () => {
    expect(distribute(100, "previous", months())).toEqual(distribute(100, "equal"));
    expect(distribute(100, "previous")).toEqual(distribute(100, "equal"));
  });

  it("refuses typed months that do not add up, or not twelve of them", () => {
    expect(monthsAddUp(Array<number>(12).fill(8.33), 100)).toBe(false);
    expect(monthsAddUp(Array<number>(11).fill(10), 110)).toBe(false);
    expect(monthsAddUp(months(0.1, 0.2), 0.3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — 4 tests: `distribute is not a function` (3) and `monthsAddUp is not a function` (1).

- [ ] **Step 3: Implement**

Append to `lib/domain/budget.ts`:

```ts
/**
 * 12 amounts to the centavo that add up to `total`: equal, or proportional to
 * `previousShape`; each month floored, the remainder on the last one.
 * `previous` falls back to equal when the shape is all zero.
 */
export function distribute(
  total: number,
  mode: Exclude<BudgetDistribution, "manual">,
  previousShape?: number[]
): number[] {
  const totalCents = Math.round(total * 100);
  // Weights in whole centavos, so the products below stay integers.
  const shape =
    mode === "previous" && previousShape?.some((v) => v > 0)
      ? previousShape.map((v) => Math.round(v * 100))
      : Array<number>(12).fill(1);
  const weight = shape.reduce((s, v) => s + v, 0);
  const months = shape.map((v) => Math.floor((totalCents * v) / weight));
  months[11] = totalCents - months.slice(0, 11).reduce((s, v) => s + v, 0);
  return months.map((c) => c / 100);
}

/** The sum of twelve typed months equals the total (to the centavo). */
export function monthsAddUp(months: number[], total: number): boolean {
  return (
    months.length === 12 &&
    months.reduce((s, v) => s + Math.round(v * 100), 0) === Math.round(total * 100)
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (8 passed)

#### Cycle 3: lineKey

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/__tests__/budget.test.ts`:

```ts
describe("lineKey", () => {
  it("is the category, or category:conta", () => {
    expect(lineKey("nutrition")).toBe("nutrition");
    expect(lineKey("nutrition", null)).toBe("nutrition");
    expect(lineKey("nutrition", "nut-sal")).toBe("nutrition:nut-sal");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — `lineKey is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/domain/budget.ts`:

```ts
/** Key of a line: `${category}` or `${category}:${accountId}`. */
export type LineKey = string;

export function lineKey(category: ExpenseCategory, accountId?: string | null): LineKey {
  return accountId ? `${category}:${accountId}` : category;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (9 passed)

#### Cycle 4: budgetView

`budgetView` is one function, so its five describe blocks land in one red/green cycle, in this order: realizado (paid and pendente, future parcela and the safra before excluded, conta vs grupo, treatments under Sanidade, investimento and receita never) → orçado of a grupo from its own line vs its contas (`accountsSum`, calendar month placement, only its own safra's rows, saved months spread over two safras once the start month changes) → previsto até o fim (generated despesas vs orçado, today's month the larger; before the safra = orçado, after it = realizado, Review Focus 3) → % usado and tones at 90 and 100 → totals and `over`. The farm fixture lives here: start month 10, safra 2025, today 15/02/2026 (index 4).

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/__tests__/budget.test.ts`:

```ts
// One farm, safra starting in outubro, today in fevereiro of safra 2025/26
// (index 4). Nutrição is budgeted on the grupo and on two of its three contas,
// Administrativo on the grupo only; Sanidade has a treatment cost and no orçado.
const TODAY = "2026-02-15";

/** One row: a calendar month ("2025-10") of a line. */
const row = (category: ExpenseCategory, month: string, amountBrl: number, patch: Partial<Budget> = {}): Budget => ({
  id: `${category}:${patch.accountId ?? ""}:${month}`,
  category,
  month: `${month}-01`,
  amountBrl,
  distribution: "equal",
  ...patch,
});
/** The 12 rows of a line in a safra starting in outubro (2025 unless said); amounts in safra order (out → set). */
const budgetLine = (
  category: ExpenseCategory,
  amounts: number | number[],
  patch: Partial<Budget> = {},
  safra = 2025
): Budget[] =>
  safraMonths(safra, 10).map((m, i) =>
    row(category, m.key, typeof amounts === "number" ? amounts : amounts[i], patch)
  );

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2025-10-10",
  category: "nutrition",
  amountBrl: 100,
  ...patch,
});

const accounts: Account[] = [
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "nut-racao", group: "nutrition", name: "Ração e suplemento" },
  { id: "nut-sil", group: "nutrition", name: "Silagem" },
];

const BUDGETS: Budget[] = [
  ...budgetLine("nutrition", 1000),
  ...budgetLine("nutrition", 400, { accountId: "nut-sal" }),
  ...budgetLine("nutrition", 500, { accountId: "nut-racao" }),
  ...budgetLine("admin", 500),
];

const INPUTS: BudgetInputs = {
  budgets: BUDGETS,
  accounts,
  expenses: [
    expense("sal-out", { accountId: "nut-sal", date: "2025-10-10", amountBrl: 350, paidAt: "2025-10-12" }),
    expense("racao-nov", { accountId: "nut-racao", date: "2025-11-05", amountBrl: 600 }), // pendente
    expense("nut-jan", { date: "2026-01-20", amountBrl: 1200, paidAt: "2026-01-20" }), // no conta
    expense("sal-fev", { accountId: "nut-sal", date: "2026-02-03", amountBrl: 400 }),
    // Parcelas still ahead of today: previsto, not realizado.
    expense("racao-p2", { accountId: "nut-racao", date: "2026-02-25", amountBrl: 300, seriesId: "racao", seriesIndex: 2, seriesCount: 3 }),
    expense("racao-p3", { accountId: "nut-racao", date: "2026-03-25", amountBrl: 300, seriesId: "racao", seriesIndex: 3, seriesCount: 3 }),
    expense("adm-dez", { category: "admin", date: "2025-12-15", amountBrl: 2000 }),
    expense("adm-fev", { category: "admin", date: "2026-02-10", amountBrl: 1000 }),
    // Safra 2024/25: the "previous" shape of Nutrição.
    expense("sal-2024", { accountId: "nut-sal", date: "2024-10-15", amountBrl: 600 }),
    expense("nut-2024", { date: "2025-09-30", amountBrl: 999 }),
    // Never realizado.
    expense("trator", { kind: "investment", flow: "out", category: "other", date: "2025-12-01", amountBrl: 50000 }),
    expense("aluguel", { kind: "revenue", category: "other", date: "2026-01-10", amountBrl: 8000 }),
  ],
  treatments: [
    makeTreatment({ id: "vac", date: "2025-11-20", status: "done", costBrl: 150 }),
    makeTreatment({ id: "agendada", date: "2026-01-05", status: "scheduled", costBrl: 80 }),
    makeTreatment({ id: "sem-custo", date: "2025-12-01", status: "done" }),
  ],
};

const view = budgetView(INPUTS, 2025, 10, TODAY);
const group = (category: ExpenseCategory) => view.groups.find((g) => g.category === category)!;
const nutrition = group("nutrition");
const conta = (id: string) => nutrition.accounts.find((a) => a.accountId === id)!;

describe("budgetView: realizado", () => {
  it("counts despesas by date, paid or not, up to today only", () => {
    expect(view.todayIndex).toBe(4);
    // out 350 paid, nov 600 pendente, jan 1200 without conta, fev 400; the
    // parcela of 25/02 is after today and 30/09/2025 is the safra before.
    expect(nutrition.realized).toEqual(months(350, 600, 0, 1200, 400));
    expect(nutrition.realizedToDate).toBe(2550);
  });

  it("counts a conta's own despesas only", () => {
    expect(conta("nut-sal").realized).toEqual(months(350, 0, 0, 0, 400));
    expect(conta("nut-racao").realized).toEqual(months(0, 600));
  });

  it("puts done treatment costs under Sanidade, without orçado", () => {
    const health = group("health");
    expect(health.realized).toEqual(months(0, 150));
    expect([health.hasBudget, health.usedPct, health.tone]).toEqual([false, null, "none"]);
  });

  it("never counts an investimento or a receita", () => {
    expect(view.groups.map((g) => g.key)).toEqual(["nutrition", "health", "admin"]);
  });
});

describe("budgetView: orçado of a grupo and its contas", () => {
  it("takes the grupo's own line and flags contas that add up to something else", () => {
    expect(nutrition.budgeted).toEqual(Array<number>(12).fill(1000));
    expect([nutrition.budgetedTotal, nutrition.budgetedToDate]).toEqual([12000, 5000]);
    expect([nutrition.ownRows, nutrition.hasBudget, nutrition.distribution]).toEqual([true, true, "equal"]);
    expect(nutrition.accountsSum).toBe(10800);
    expect(group("admin").accountsSum).toBeNull();
  });

  it("lists contas with a budget or realizado, by name", () => {
    expect(nutrition.accounts.map((a) => a.label)).toEqual(["Ração e suplemento", "Sal mineral"]);
    expect(conta("nut-sal").budgetedTotal).toBe(4800);
    const withSilagem = budgetView(
      { ...INPUTS, expenses: [...INPUTS.expenses, expense("sil", { accountId: "nut-sil", amountBrl: 10 })] },
      2025, 10, TODAY
    ).groups[0];
    const silagem = withSilagem.accounts.find((a) => a.accountId === "nut-sil")!;
    expect([silagem.hasBudget, silagem.realizedToDate, silagem.tone]).toEqual([false, 10, "none"]);
  });

  it("sums the contas when the grupo has no line of its own", () => {
    const g = budgetView(
      { ...INPUTS, budgets: BUDGETS.filter((b) => !(b.category === "nutrition" && b.accountId === undefined)) },
      2025, 10, TODAY
    ).groups[0];
    expect(g.budgeted).toEqual(Array<number>(12).fill(900));
    expect([g.budgetedTotal, g.ownRows, g.hasBudget, g.distribution, g.accountsSum]).toEqual([10800, false, true, null, null]);
  });

  it("leaves accountsSum out when the contas match the grupo", () => {
    const budgets = [...budgetLine("nutrition", 900), ...BUDGETS.filter((b) => b.accountId !== undefined)];
    expect(budgetView({ ...INPUTS, budgets }, 2025, 10, TODAY).groups[0].accountsSum).toBeNull();
  });

  it("places each row on its calendar month", () => {
    const g = budgetView(
      { budgets: [row("pasture", "2025-10", 700), row("pasture", "2026-09", 300)], expenses: [], treatments: [], accounts: [] },
      2025, 10, TODAY
    ).groups[0];
    expect(g.budgeted).toEqual([700, ...Array<number>(10).fill(0), 300]);
  });

  it("reads only the rows of its own safra", () => {
    const budgets = [...BUDGETS, ...budgetLine("admin", 700, {}, 2026)];
    const admin = budgetView({ ...INPUTS, budgets }, 2025, 10, TODAY).groups.find((g) => g.key === "admin")!;
    expect(admin.budgetedTotal).toBe(6000);
  });

  it("spreads saved months over two safras when the safra starts elsewhere", () => {
    // Administrativo of out/25–set/26, read with the safra starting in janeiro.
    const inputs: BudgetInputs = { budgets: budgetLine("admin", 500), expenses: [], treatments: [], accounts: [] };
    expect(budgetView(inputs, 2025, 1, TODAY).groups[0].budgeted).toEqual([...Array<number>(9).fill(0), 500, 500, 500]);
    expect(budgetView(inputs, 2026, 1, TODAY).groups[0].budgeted).toEqual([...Array<number>(9).fill(500), 0, 0, 0]);
  });
});

describe("budgetView: previsto até o fim", () => {
  it("adds the despesas already generated, else the orçado; today's month the larger of the two", () => {
    // 2150 past + fev max(1000, 400 + 300) + mar parcela 300 + 6 × 1000.
    expect(nutrition.forecast).toBe(9450);
    expect(conta("nut-racao").forecast).toBe(600 + 500 + 300 + 6 * 500);
    // Administrativo spent 1000 in fev over a 500 orçado.
    expect(group("admin").forecast).toBe(2000 + 1000 + 7 * 500);
  });

  it("is the orçado before the safra starts", () => {
    const next = budgetView({ ...INPUTS, budgets: budgetLine("admin", 700, {}, 2026) }, 2026, 10, TODAY);
    const admin = next.groups[0];
    expect(next.todayIndex).toBe(-1);
    expect(next.groups.map((g) => g.key)).toEqual(["admin"]);
    expect([admin.realizedToDate, admin.budgetedToDate, admin.usedPct, admin.tone]).toEqual([0, 0, null, "none"]);
    expect(admin.realized).toEqual(months());
    expect(admin.forecast).toBe(8400);
  });

  it("is the realizado once the safra is over", () => {
    const past = budgetView(INPUTS, 2025, 10, "2026-10-02");
    expect(past.todayIndex).toBe(12);
    for (const g of past.groups) {
      for (const l of [g, ...g.accounts]) expect(l.forecast).toBe(l.realizedToDate);
    }
    const g = past.groups[0];
    expect([g.realizedToDate, g.budgetedToDate, g.usedPct]).toEqual([3150, 12000, 26.25]);
  });
});

describe("budgetView: % usado and its tone", () => {
  // Pastagem budgeted R$ 3,00 in outubro; today in outubro.
  const pasture = (spent: number) =>
    budgetView(
      {
        budgets: [row("pasture", "2025-10", 3)],
        expenses: [expense("p", { category: "pasture", date: "2025-10-01", amountBrl: spent })],
        treatments: [],
        accounts: [],
      },
      2025, 10, "2025-10-20"
    ).groups[0];

  it("is brand up to 90 %, attention up to 100 %, overdue above", () => {
    expect(pasture(2.7).usedPct).toBe(90);
    expect(pasture(3).usedPct).toBe(100);
    expect([2.7, 2.71, 3, 3.01].map((v) => pasture(v).tone)).toEqual(["brand", "attention", "attention", "overdue"]);
  });

  it("is none without orçado up to today's month", () => {
    const g = budgetView(
      { ...INPUTS, budgets: [row("nutrition", "2025-12", 500)] },
      2025, 10, "2025-10-20"
    ).groups[0];
    expect([g.hasBudget, g.budgetedToDate, g.realizedToDate, g.usedPct, g.tone]).toEqual([true, 0, 350, null, "none"]);
  });
});

describe("budgetView: totals and grupos over", () => {
  it("adds the grupos up", () => {
    expect(view.totals.budgeted).toEqual(Array<number>(12).fill(1500));
    expect(view.totals.realized).toEqual(months(350, 750, 2000, 1200, 1400));
    expect(view.totals).toMatchObject({
      budgetedTotal: 18000,
      budgetedToDate: 7500,
      realizedToDate: 5700,
      forecast: 9450 + 150 + 6500,
      usedPct: 76,
      tone: "brand",
    });
    expect(view.over).toEqual([{ label: "Administrativo", usedPct: 120 }]);
  });

  it("lists at most three grupos over 100 %, worst first", () => {
    const spent: [ExpenseCategory, number][] = [["nutrition", 150], ["pasture", 110], ["labor", 300], ["admin", 200]];
    const over = budgetView(
      {
        budgets: spent.map(([category]) => row(category, "2025-10", 100)),
        expenses: spent.map(([category, amountBrl]) => expense(category, { category, amountBrl })),
        treatments: [],
        accounts: [],
      },
      2025, 10, "2025-10-20"
    ).over;
    expect(over).toEqual([
      { label: "Mão de obra", usedPct: 300 },
      { label: "Administrativo", usedPct: 200 },
      { label: "Nutrição", usedPct: 150 },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — `budgetView is not a function`: the module-level `view` throws, so the file reports no tests.

- [ ] **Step 3: Implement**

Append to `lib/domain/budget.ts`:

```ts
export type BudgetTone = "brand" | "attention" | "overdue" | "none";

export interface BudgetLine {
  key: LineKey;
  category: ExpenseCategory;
  accountId: string | null;
  /** Grupo label or conta name. */
  label: string;
  /** Own rows, or (grupo without own rows) the sum of its contas; zeros when no budget. */
  budgeted: number[];
  budgetedTotal: number;
  /** Months up to today's month, that one included. */
  budgetedToDate: number;
  /** Own rows exist (a grupo summing its contas counts as having one). */
  hasBudget: boolean;
  /** The line has its own rows. */
  ownRows: boolean;
  distribution: BudgetDistribution | null;
  /** Up to today only. */
  realized: number[];
  realizedToDate: number;
  /** Previsto até o fim. */
  forecast: number;
  /** realizedToDate ÷ budgetedToDate in %; null without orçado to date. */
  usedPct: number | null;
  /** Up to 90 % brand, up to 100 % attention, above overdue; none without orçado to date. */
  tone: BudgetTone;
}

export interface BudgetGroup extends BudgetLine {
  /** Only contas with a budget or realizado, by name. */
  accounts: BudgetLine[];
  /** Sum of the contas' totals when the grupo has its own rows AND contas have rows and they differ; else null. */
  accountsSum: number | null;
}

type Figures = Pick<
  BudgetLine,
  "budgeted" | "budgetedTotal" | "budgetedToDate" | "realized" | "realizedToDate" | "forecast" | "usedPct" | "tone"
>;

export interface BudgetView {
  safra: number;
  startMonth: number;
  months: SafraMonth[];
  /** Index of today's month in `months`; -1 before the safra, 12 after it. */
  todayIndex: number;
  /** EXPENSE_GROUPS order; grupos with neither orçado nor realizado left out. */
  groups: BudgetGroup[];
  totals: Figures;
  /** Up to three grupos above 100 %, worst first: for the Painel band. */
  over: { label: string; usedPct: number }[];
}

export interface BudgetInputs {
  budgets: Budget[];
  expenses: Expense[];
  treatments: Treatment[];
  accounts: Account[];
}

const zeros = (): number[] => Array<number>(12).fill(0);
const sum = (values: number[]): number => cents(values.reduce((s, v) => s + v, 0));
/** Month by month sum of several 12-month rows. */
const addUp = (rows: number[][]): number[] => zeros().map((_, i) => sum(rows.map((r) => r[i])));

/**
 * Despesas (`isCost`, paid or not, by `date`) per line and safra month (`index`
 * by "YYYY-MM") up to `untilIso`: under their grupo and, with a conta, under
 * the conta too. Done treatments' costs go under Sanidade, as in the COE.
 */
function spentByLine(inputs: BudgetInputs, index: Map<string, number>, untilIso: string): Map<LineKey, number[]> {
  const byLine = new Map<LineKey, number[]>();
  const add = (key: LineKey, date: string, amount: number): void => {
    const i = index.get(date.slice(0, 7));
    if (i === undefined || date > untilIso) return;
    const row = byLine.get(key) ?? zeros();
    row[i] = cents(row[i] + amount);
    byLine.set(key, row);
  };
  for (const e of inputs.expenses) {
    if (!isCost(e)) continue;
    add(lineKey(e.category), e.date, e.amountBrl);
    if (e.accountId) add(lineKey(e.category, e.accountId), e.date, e.amountBrl);
  }
  for (const t of inputs.treatments) {
    if (t.status === "done" && t.costBrl !== undefined) add(lineKey("health"), t.date, t.costBrl);
  }
  return byLine;
}

/**
 * Previsto até o fim: past months as realizado; today's month the larger of
 * its orçado and its despesas; a later month its despesas already generated
 * (parcelas, recorrências, pendentes) when it has any, else its orçado.
 */
function forecastOf(budgeted: number[], realized: number[], incurred: number[], todayIndex: number): number {
  return sum(
    budgeted.map((b, i) => {
      if (i < todayIndex) return realized[i];
      if (i === todayIndex) return Math.max(b, incurred[i]);
      return incurred[i] > 0 ? incurred[i] : b;
    })
  );
}

function toneOf(usedPct: number | null): BudgetTone {
  if (usedPct === null) return "none";
  if (usedPct <= 90) return "brand";
  return usedPct <= 100 ? "attention" : "overdue";
}

function figures(budgeted: number[], realized: number[], forecast: number, todayIndex: number): Figures {
  const budgetedToDate = sum(budgeted.slice(0, todayIndex + 1));
  const realizedToDate = sum(realized);
  // In whole centavos: 2,70 of 3,00 must read 90, not 90.00000000000001.
  const usedPct =
    budgetedToDate > 0
      ? (Math.round(realizedToDate * 100) * 100) / Math.round(budgetedToDate * 100)
      : null;
  return {
    budgeted,
    budgetedTotal: sum(budgeted),
    budgetedToDate,
    realized,
    realizedToDate,
    forecast,
    usedPct,
    tone: toneOf(usedPct),
  };
}

/** The Orçamento of one safra as of `todayIso`. */
export function budgetView(inputs: BudgetInputs, safra: number, startMonth: number, todayIso: string): BudgetView {
  const months = safraMonths(safra, startMonth);
  const range = safraRange(safra, startMonth);
  const current = months.findIndex((m) => m.key === todayIso.slice(0, 7));
  const todayIndex = current >= 0 ? current : todayIso < range.start ? -1 : 12;
  const index = new Map(months.map((m, i) => [m.key, i]));
  const realized = spentByLine(inputs, index, todayIso);
  const incurred = spentByLine(inputs, index, range.end);

  // Each line's rows of this safra on their months; rows of other months are not read.
  const own = new Map<LineKey, { budgeted: number[]; distribution: BudgetDistribution }>();
  for (const b of inputs.budgets) {
    const i = index.get(b.month.slice(0, 7));
    if (i === undefined) continue;
    const key = lineKey(b.category, b.accountId);
    const rows = own.get(key) ?? { budgeted: zeros(), distribution: b.distribution };
    rows.budgeted[i] = b.amountBrl;
    own.set(key, rows);
  }

  const line = (category: ExpenseCategory, accountId: string | null, label: string, contas: BudgetLine[] = []): BudgetLine => {
    const key = lineKey(category, accountId);
    const rows = own.get(key);
    const budgetedContas = contas.filter((c) => c.ownRows);
    const budgeted =
      rows?.budgeted ?? (budgetedContas.length > 0 ? addUp(budgetedContas.map((c) => c.budgeted)) : zeros());
    const real = realized.get(key) ?? zeros();
    return {
      key,
      category,
      accountId,
      label,
      hasBudget: rows !== undefined || budgetedContas.length > 0,
      ownRows: rows !== undefined,
      distribution: rows?.distribution ?? null,
      ...figures(budgeted, real, forecastOf(budgeted, real, incurred.get(key) ?? zeros(), todayIndex), todayIndex),
    };
  };

  const contasByGroup = accountsByGroup(inputs.accounts, true);
  const groups: BudgetGroup[] = [];
  for (const category of EXPENSE_GROUPS) {
    const accounts = contasByGroup[category]
      .map((a) => line(category, a.id, a.name))
      .filter((c) => c.ownRows || c.realizedToDate > 0);
    const group = line(category, null, ACCOUNT_GROUP_LABEL[category], accounts);
    if (!group.hasBudget && group.realizedToDate === 0) continue;
    const withRows = accounts.filter((c) => c.ownRows);
    const contasTotal = sum(withRows.map((c) => c.budgetedTotal));
    const differs = group.ownRows && withRows.length > 0 && contasTotal !== group.budgetedTotal;
    groups.push({ ...group, accounts, accountsSum: differs ? contasTotal : null });
  }

  return {
    safra,
    startMonth,
    months,
    todayIndex,
    groups,
    totals: figures(
      addUp(groups.map((g) => g.budgeted)),
      addUp(groups.map((g) => g.realized)),
      sum(groups.map((g) => g.forecast)),
      todayIndex
    ),
    over: groups
      .flatMap((g) => (g.usedPct !== null && g.usedPct > 100 ? [{ label: g.label, usedPct: g.usedPct }] : []))
      .sort((a, b) => b.usedPct - a.usedPct)
      .slice(0, 3),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (27 passed)

#### Cycle 5: previousShape

The safra before's realizado of a grupo and of a conta, and `distribute(..., "previous", shape)` fed by it.

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/__tests__/budget.test.ts`:

```ts
describe("previousShape", () => {
  it("is the safra before's realizado of the line", () => {
    expect(previousShape(INPUTS, "nutrition", 2025, 10, TODAY)).toEqual([600, ...Array<number>(10).fill(0), 999]);
    expect(previousShape(INPUTS, "nutrition:nut-sal", 2025, 10, TODAY)).toEqual(months(600));
    expect(previousShape(INPUTS, "admin", 2025, 10, TODAY)).toEqual(months());
  });

  it("feeds distribute", () => {
    const shape = previousShape(INPUTS, "nutrition", 2025, 10, TODAY);
    expect(distribute(3198, "previous", shape)).toEqual([1200, ...Array<number>(10).fill(0), 1998]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — `previousShape is not a function` (2 tests).

- [ ] **Step 3: Implement**

Append to `lib/domain/budget.ts`:

```ts
/** The safra before `safra`: its realizado per month for one line (the "previous" shape). */
export function previousShape(
  inputs: BudgetInputs,
  key: LineKey,
  safra: number,
  startMonth: number,
  todayIso: string
): number[] {
  const { groups } = budgetView(inputs, safra - 1, startMonth, todayIso);
  return groups.flatMap((g) => [g, ...g.accounts]).find((l) => l.key === key)?.realized ?? zeros();
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (29 passed)

#### Cycle 6: copyPlan

Skips every line (grupo or conta) that already has rows in the target, applies the %, rounds each month to the centavo, and copies the realizado as grupo lines only (Review Focus 5).

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/__tests__/budget.test.ts`:

```ts
describe("copyPlan", () => {
  // Safra 2026/27 already has Administrativo and Sal mineral.
  const target: BudgetInputs = {
    ...INPUTS,
    budgets: [
      ...BUDGETS,
      ...budgetLine("admin", 700, {}, 2026),
      ...budgetLine("nutrition", 450, { accountId: "nut-sal" }, 2026),
    ],
  };

  it("copies the orçado lines without budget in the target, with the %", () => {
    const { lines, skipped } = copyPlan(target, 2025, 2026, "budgeted", 5, 10, TODAY);
    expect(skipped).toBe(2);
    expect(lines).toEqual([
      { category: "nutrition", accountId: null, months: Array<number>(12).fill(1050) },
      { category: "nutrition", accountId: "nut-racao", months: Array<number>(12).fill(525) },
    ]);
  });

  it("rounds each month to the centavo", () => {
    const inputs: BudgetInputs = { budgets: budgetLine("pasture", distribute(100, "equal")), expenses: [], treatments: [], accounts: [] };
    expect(copyPlan(inputs, 2025, 2026, "budgeted", 5, 10, TODAY).lines[0].months).toEqual([
      ...Array<number>(11).fill(8.75),
      8.79,
    ]);
  });

  it("copies the realizado as grupo lines only", () => {
    const { lines, skipped } = copyPlan(target, 2025, 2026, "realized", 0, 10, TODAY);
    expect(skipped).toBe(1);
    expect(lines).toEqual([
      { category: "nutrition", accountId: null, months: months(350, 600, 0, 1200, 400) },
      { category: "health", accountId: null, months: months(0, 150) },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: FAIL — `copyPlan is not a function` (3 tests).

- [ ] **Step 3: Implement**

Append to `lib/domain/budget.ts`:

```ts
/** What "Copiar" would write: one line per source line without budget in `to`. Months in safra order. */
export interface CopyLine {
  category: ExpenseCategory;
  accountId: string | null;
  months: number[];
}

/**
 * Lines of safra `from` to write into `to`: its own orçado lines (grupos and
 * contas), or its realizado per grupo; each month × (1 + adjustPct %) to the
 * centavo. A line that already has rows in `to` is skipped. Both safras are
 * read from the same `inputs.budgets`.
 */
export function copyPlan(
  inputs: BudgetInputs,
  from: number,
  to: number,
  source: "budgeted" | "realized",
  adjustPct: number,
  startMonth: number,
  todayIso: string
): { lines: CopyLine[]; skipped: number } {
  // ISO dates compare as strings.
  const target = safraRange(to, startMonth);
  const taken = new Set(
    inputs.budgets
      .filter((b) => b.month >= target.start && b.month <= target.end)
      .map((b) => lineKey(b.category, b.accountId))
  );
  const { groups } = budgetView(inputs, from, startMonth, todayIso);
  const sources =
    source === "budgeted"
      ? groups.flatMap((g) => [g, ...g.accounts]).filter((l) => l.ownRows)
      : groups.filter((g) => g.realizedToDate > 0);
  const lines = sources
    .filter((l) => !taken.has(l.key))
    .map((l) => ({
      category: l.category,
      accountId: l.accountId,
      months: (source === "budgeted" ? l.budgeted : l.realized).map((v) => cents((v * (100 + adjustPct)) / 100)),
    }));
  return { lines, skipped: sources.length - lines.length };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/budget.test.ts`
Expected: PASS (32 passed)

#### Finish

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/domain/budget.ts lib/domain/__tests__/budget.test.ts`
Expected: clean for these two files once Task 1 is in (`Budget`, `BudgetDistribution` in `lib/types.ts`). Errors inside `lib/api/domains/budgets/**` belong to Task 3 (same wave) and are not this task's.


### Task 3: Budgets API

The `budgets` domain: list one safra, save one line whole, remove one line, copy into the empty lines of a safra. Mounted in `lib/api/app.ts` like every other domain controller, behind the farm macro and the route-requirements table.

**Needs on disk before Step 2:** task 1 (`Budget`, `BudgetDistribution` in `lib/types.ts`; `budgets` and `farm.safraStartMonth` in `lib/db/schema.ts`; `toBudget` in `lib/api/mappers.ts`) and task 2 (`lib/domain/budget.ts` with `safraMonths`, `safraRange` and `copyPlan`). Task 2 runs in the same wave: if `lib/domain/budget.ts` is not there yet, wait for it. Once Step 7 mounts the controller, every test that imports `herdApi` loads `copyPlan` too.

**Files:**
- Create: `lib/api/domains/budgets/budgetLine.ts`
- Create: `lib/api/domains/budgets/schemas/budget.schema.ts`
- Create: `lib/api/domains/budgets/useCases/ListBudgets.useCase.ts`
- Create: `lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`
- Create: `lib/api/domains/budgets/useCases/DeleteBudgetLine.useCase.ts`
- Create: `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`
- Create: `lib/api/domains/budgets/budgets.controller.ts`
- Modify: `lib/api/app.ts`
- Modify: `lib/api/permissions/routeRequirements.ts`
- Modify: `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap` (regenerated)
- Modify: `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated)
- Test: `lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`
- Test: `lib/api/domains/budgets/__tests__/budgets.routes.test.ts`

**Interfaces:**
- Consumes:
  - `lib/types.ts` (task 1): `Budget`, `BudgetDistribution`, `ExpenseCategory`.
  - `lib/db/schema.ts` (task 1): table `budgets` with columns `id`, `farmId`, `category`, `accountId`, `month` (date, `"YYYY-MM-01"`), `amountBrl`, `distribution`, `updatedAt`, `updatedBy`, and no `safra`; `farm.safraStartMonth`.
  - `lib/api/mappers.ts` (task 1): `toBudget(row: BudgetRow): Budget`; existing `toAccount`, `toExpense`, `toTreatment`.
  - `lib/domain/budget.ts` (task 2): `safraMonths(safra: number, startMonth: number): SafraMonth[]` (only `.key` is read); `safraRange(safra: number, startMonth: number): Period`; `copyPlan(inputs: BudgetInputs, from: number, to: number, source: "budgeted" | "realized", adjustPct: number, startMonth: number, todayIso: string): { lines: CopyLine[]; skipped: number }`.
- Produces (Eden client `api.budgets`, used by task 4):
  - The API speaks in safras, the rows in calendar months. Every use case first reads `farm.safra_start_month` (`safraStartMonth` in `budgetLine.ts`) and turns the safra into `safraRange(safra, startMonth)` (rows by `month between start and end`) or `safraMonths(safra, startMonth)` (the i-th month written as `${key}-01`).
  - `GET /budgets?safra=2025` → `Budget[]`: the rows whose `month` falls in that safra (Financeiro view).
  - `PUT /budgets` body `{ safra, category, accountId?, months: number[], distribution }` → `Budget[]` (the line's 12 rows, `month` from the safra's first month on); it deletes the line's rows inside the safra first; 400 `{ error: "months_mismatch" | "invalid_account" }` (Financeiro edit).
  - `DELETE /budgets?safra=&category=&accountId=` → `{ removed: number }`: the line's rows inside the safra (Financeiro edit). Eden types this call as `api.budgets.delete({}, { query })`: with a required query it asks for a body too.
  - `POST /budgets/copy` body `{ from, to, source, adjustPct }` → `{ copied: number; skipped: number; budgets: Budget[] }` (`budgets` = every row of `to`; Financeiro edit).
  - The body schema leaves the month count open on purpose: 11 or 13 months reach the use case and come back as 400 `months_mismatch`, as the contract says. Pinning 12 in TypeBox would answer Elysia's 422 instead.
  - Months are stored as sent. The body carries no total, so the API cannot refuse "months that do not add up". The edit dialog refuses them with `monthsAddUp` (task 2) before it saves.
  - Copied lines are written with `distribution: "manual"`.

- [ ] **Step 1: Write the failing use-case tests**

They use the shared chainable stub `lib/api/__tests__/dbStub.ts`, as `expenses/useCases/__tests__/Delete.test.ts` does. The stub answers selects in call order, so each test queues the farm's start month (`[{ startMonth: 10 }]`) where its use case reads it: first in List, Delete and Copy, after the conta check in Put. `CopyBudgets.test.ts` runs the real `copyPlan` and `safraMonths` of task 2.

`lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts`:

```ts
/** listBudgets: one safra's rows, of this farm only, by the farm's start month. */
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

import { ListBudgetsUseCase } from "../ListBudgets.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("listBudgets", () => {
  it("reads the safra's calendar months on this farm and nothing of another farm", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [
        {
          id: "b-1",
          farmId: 7,
          category: "admin",
          accountId: null,
          month: "2025-10-01",
          amountBrl: 1500,
          distribution: "equal",
          updatedAt: new Date(0),
          updatedBy: "user-1",
        },
      ],
    ];

    const result = await new ListBudgetsUseCase().run({ farmId: 7, safra: 2025 });

    expect(renderSql(state.wheres[0] as SQL).params).toEqual([7]);
    const query = renderSql(state.wheres[1] as SQL);
    expect(query.sql).toContain('"budgets"."farm_id" = $1');
    expect(query.sql).toContain('"budgets"."month" between $2 and $3');
    // Safra 2025/26 starting in outubro.
    expect(query.params).toEqual([7, "2025-10-01", "2026-09-30"]);
    expect(result).toEqual([
      { id: "b-1", category: "admin", month: "2025-10-01", amountBrl: 1500, distribution: "equal" },
    ]);
  });

  it("follows a safra that starts in janeiro", async () => {
    state.selectResults = [[{ startMonth: 1 }], []];

    await new ListBudgetsUseCase().run({ farmId: 7, safra: 2026 });

    expect(renderSql(state.wheres[1] as SQL).params).toEqual([7, "2026-01-01", "2026-12-31"]);
  });
});
```

`lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts`:

```ts
/**
 * putBudgetLine: saves one line of a safra's orçamento whole — its twelve
 * calendar months replace the ones it had in that safra. A conta must be of
 * this farm and of the grupo, and anything but twelve months is refused. The
 * months are stored as sent: that they add up to the total typed is the
 * dialog's check (the body carries no total).
 *
 * Shared db stub: selects answer from the queue (the conta, then the farm's
 * start month), the delete and the select record their condition, the insert
 * records its rows and answers the queued `returning`.
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

import { PutBudgetLineUseCase } from "../PutBudgetLine.useCase";

/** R$ 100,00 split evenly: 8,33 eleven times and the remainder on the last month. */
const EVEN = [...Array<number>(11).fill(8.33), 8.37];
/** Safra 2025/26 starting in outubro, out/25 first. */
const OCT_TO_SEP = [
  "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01",
  "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
];
const put = (input: Partial<Parameters<PutBudgetLineUseCase["run"]>[0]>) =>
  new PutBudgetLineUseCase().run({
    farmId: 7,
    userId: "user-1",
    safra: 2025,
    category: "nutrition",
    months: EVEN,
    distribution: "equal",
    ...input,
  });
const inserted = () => state.inserts[0] as Record<string, unknown>[];

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("putBudgetLine", () => {
  it("replaces the grupo's own line with twelve rows, safra month by safra month", async () => {
    state.selectResults = [[{ startMonth: 10 }]];
    state.returning = [
      EVEN.map((amountBrl, i) => ({
        id: `b-${i}`,
        farmId: 7,
        category: "nutrition",
        accountId: null,
        month: OCT_TO_SEP[i],
        amountBrl,
        distribution: "equal",
        updatedAt: new Date(0),
        updatedBy: "user-1",
      })),
    ];

    const result = await put({});

    // The old rows of the safra go first, the grupo's own only: its contas' lines stay.
    expect(state.deletes).toBe(1);
    const removed = renderSql(state.wheres[1] as SQL);
    expect(removed.sql).toContain('"budgets"."month" between $2 and $3');
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "nutrition"]);
    // Out/25 first: the i-th amount on the i-th calendar month from outubro.
    expect(inserted().map((row) => row.month)).toEqual(OCT_TO_SEP);
    expect(inserted().map((row) => row.amountBrl)).toEqual(EVEN);
    for (const row of inserted()) {
      expect(row).toMatchObject({
        farmId: 7,
        category: "nutrition",
        accountId: null,
        distribution: "equal",
        updatedBy: "user-1",
      });
    }
    expect(result).toHaveLength(12);
    expect((result as { month: string }[])[0]).toMatchObject({ month: "2025-10-01", amountBrl: 8.33 });
  });

  it("saves a conta's line, of this farm and grupo, with the months as typed", async () => {
    state.selectResults = [[{ group: "nutrition" }], [{ startMonth: 1 }]];
    // Manual: whatever the months are, they go as sent.
    const typed = [1200, 0, 0, 450.5, 0, 0, 0, 0, 0, 0, 0, 99.99];

    await put({ accountId: "acc-sal", months: typed, distribution: "manual" });

    const conta = renderSql(state.wheres[0] as SQL);
    expect(conta.sql).toContain('"accounts"."farm_id" = $1');
    expect(conta.params).toEqual([7, "acc-sal"]);
    // Starting in janeiro, safra 2025 is the calendar year.
    expect(renderSql(state.wheres[2] as SQL).params).toEqual([7, "2025-01-01", "2025-12-31", "nutrition", "acc-sal"]);
    expect(inserted().map((row) => row.month)).toEqual([
      "2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01",
      "2025-07-01", "2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01",
    ]);
    expect(inserted().map((row) => row.amountBrl)).toEqual(typed);
    expect(inserted()[0]).toMatchObject({ accountId: "acc-sal", distribution: "manual" });
  });

  it("refuses a conta of another farm or of another grupo, and writes nothing", async () => {
    // Another farm's conta: the farm filter finds nothing.
    state.selectResults = [[]];
    expect(await put({ accountId: "acc-of-another-farm" })).toBe("invalid_account");
    state.selectResults = [[{ group: "admin" }]];
    expect(await put({ accountId: "acc-escritorio" })).toBe("invalid_account");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("refuses 11 or 13 months before reading anything", async () => {
    expect(await put({ months: EVEN.slice(1) })).toBe("months_mismatch");
    expect(await put({ months: [...EVEN, 0] })).toBe("months_mismatch");
    expect(state.wheres).toEqual([]);
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });
});
```

`lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts`:

```ts
/** deleteBudgetLine: removes one line of a safra; a grupo's own line goes alone, its contas' lines stay. */
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

import { DeleteBudgetLineUseCase } from "../DeleteBudgetLine.useCase";

const remove = (accountId?: string) =>
  new DeleteBudgetLineUseCase().run({ farmId: 7, safra: 2025, category: "admin", accountId });

beforeEach(() => {
  state.selectResults = [[{ startMonth: 10 }]];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("deleteBudgetLine", () => {
  it("removes the grupo's own twelve rows of the safra on this farm, not its contas'", async () => {
    state.returning = [Array.from({ length: 12 }, (_, i) => ({ id: `b-${i}` }))];

    expect(await remove()).toBe(12);
    const removed = renderSql(state.wheres[1] as SQL);
    expect(removed.sql).toContain('"budgets"."farm_id" = $1');
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "admin"]);
  });

  it("removes a conta's line only, and counts nothing when it had none", async () => {
    state.returning = [[]];

    expect(await remove("acc-escritorio")).toBe(0);
    expect(renderSql(state.wheres[1] as SQL).params).toEqual([7, "2025-10-01", "2026-09-30", "admin", "acc-escritorio"]);
  });
});
```

`lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:

```ts
/**
 * copyBudgets ("Copiar da safra anterior"): fills only the lines the target
 * safra lacks, from the source's orçado or its realizado, with the % applied
 * and each month rounded to the centavo; the realizado becomes grupo lines
 * only. Runs the real copyPlan of lib/domain/budget.ts.
 *
 * Shared db stub. Selects answer in call order: the farm's start month, the
 * budgets of both safras, the lançamentos, the treatments, the contas, and,
 * after the insert, the target safra as it ends up.
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
import { safraMonths } from "@/lib/domain/budget";

import { CopyBudgetsUseCase } from "../CopyBudgets.useCase";

/** Calendar months of a safra starting in outubro, in safra order: "2025-10-01"… */
const monthsOf = (safra: number) => safraMonths(safra, 10).map((m) => `${m.key}-01`);

/** The twelve rows of a line, the same amount every month. */
const line = (safra: number, category: string, accountId: string | null, amountBrl: number) =>
  monthsOf(safra).map((month) => ({
    id: `${category}-${accountId}-${month}`,
    farmId: 7,
    category,
    accountId,
    month,
    amountBrl,
    distribution: "equal",
    updatedAt: new Date(0),
    updatedBy: "user-0",
  }));

const expense = (fields: Record<string, unknown>) => ({
  id: `e-${fields.date}`,
  farmId: 7,
  kind: "expense",
  flow: null,
  category: "nutrition",
  accountId: null,
  ...fields,
});

const copy = (input: { source: "budgeted" | "realized"; adjustPct: number }) =>
  new CopyBudgetsUseCase().run({ farmId: 7, userId: "user-1", from: 2025, to: 2026, todayIso: "2026-10-02", ...input });

const inserted = () => state.inserts[0] as Record<string, unknown>[];
const rowsOf = (key: string) =>
  inserted().filter((row) => `${row.category}:${row.accountId}` === key);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.wheres = [];
});

describe("copyBudgets", () => {
  it("copies only the lines the target lacks, with the % applied and every month rounded", async () => {
    const final = line(2026, "nutrition", null, 900);
    state.selectResults = [
      [{ startMonth: 10 }],
      [
        ...line(2025, "nutrition", null, 1000),
        ...line(2025, "admin", null, 33.33),
        ...line(2025, "pasture", "acc-cerca", 8.37),
        // Nutrição already has its own line in 2026: it is not touched.
        ...final,
      ],
      [],
      [],
      // A conta's line is read only when the conta is the farm's.
      [{ id: "acc-cerca", group: "pasture", name: "Cerca", archivedAt: null }],
      final,
    ];

    const result = await copy({ source: "budgeted", adjustPct: 5 });

    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.budgets).toHaveLength(12);
    // Both safras' calendar months, on this farm only.
    const both = renderSql(state.wheres[1] as SQL);
    expect(both.sql).toContain('"budgets"."farm_id" = $1');
    expect(both.params).toEqual([7, "2025-10-01", "2026-09-30", 7, "2026-10-01", "2027-09-30"]);

    expect(inserted()).toHaveLength(24);
    expect(rowsOf("nutrition:null")).toEqual([]);
    // 33,33 × 1,05 = 34,9965 → 35,00; 8,37 × 1,05 = 8,7885 → 8,79.
    expect(rowsOf("admin:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(35));
    expect(rowsOf("pasture:acc-cerca").map((row) => row.amountBrl)).toEqual(Array(12).fill(8.79));
    expect(rowsOf("admin:null").map((row) => row.month)).toEqual(monthsOf(2026));
    for (const row of inserted()) {
      expect(row).toMatchObject({ farmId: 7, distribution: "manual", updatedBy: "user-1" });
    }
  });

  it("copies the realizado as grupo lines only, despesas and done treatments, never a receita", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [],
      [
        expense({ date: "2025-10-15", amountBrl: 300, accountId: "acc-sal" }),
        expense({ date: "2026-01-10", amountBrl: 200 }),
        expense({ date: "2025-11-01", amountBrl: 5000, kind: "revenue", category: "other" }),
      ],
      [{ row: { id: "t-1", date: "2025-11-05", status: "done", costBrl: 50 }, earTag: "001" }],
      [{ id: "acc-sal", group: "nutrition", name: "Sal mineral", archivedAt: null }],
      [],
    ];

    const result = await copy({ source: "realized", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 2, skipped: 0 });
    expect(inserted().every((row) => row.accountId === null)).toBe(true);
    // Safra order: out/25 is index 0, jan/26 index 3, nov/25 index 1.
    expect(rowsOf("nutrition:null").map((row) => row.amountBrl)).toEqual([300, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rowsOf("health:null").map((row) => row.amountBrl)).toEqual([0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rowsOf("other:null")).toEqual([]);
  });

  it("writes nothing when every line already has a budget, and answers the target as it is", async () => {
    const final = line(2026, "admin", null, 100);
    state.selectResults = [[{ startMonth: 10 }], [...line(2025, "admin", null, 90), ...final], [], [], [], final];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 0, skipped: 1 });
    expect(result.budgets).toHaveLength(12);
    expect(state.inserts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`
Expected: FAIL. The four files cannot resolve `../ListBudgets.useCase`, `../PutBudgetLine.useCase`, `../DeleteBudgetLine.useCase` and `../CopyBudgets.useCase`.

- [ ] **Step 3: Implement the line helpers and the four use cases**

`lib/api/domains/budgets/budgetLine.ts`:

```ts
/**
 * One line of the orçamento as rows: a grupo's own line (no conta) or a
 * conta's, one row per calendar month. The API speaks in safras; the farm's
 * start month, read first by every use case, says which twelve months form
 * one.
 */
import { randomUUID } from "node:crypto";
import { and, between, eq, isNull } from "drizzle-orm";

import { budgets, farm } from "@/lib/db/schema";
import { safraMonths, safraRange } from "@/lib/domain/budget";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BudgetDistribution, ExpenseCategory } from "@/lib/types";

export interface BudgetLineKey {
  safra: number;
  category: ExpenseCategory;
  /** Absent or null = the grupo's own line. */
  accountId?: string | null;
}

/** The month the farm's safra starts on (the column's default when the row is missing). */
export async function safraStartMonth(repo: RepositoryType, farmId: number): Promise<number> {
  const [row] = await repo
    .select({ startMonth: farm.safraStartMonth })
    .from(farm)
    .where(eq(farm.id, farmId))
    .limit(1);
  return row?.startMonth ?? 10;
}

/** This farm's rows whose month falls in the safra. */
export function safraWhere(farmId: number, startMonth: number, safra: number) {
  const { start, end } = safraRange(safra, startMonth);
  return and(eq(budgets.farmId, farmId), between(budgets.month, start, end));
}

/** The line's rows in the safra. The grupo's own line never takes its contas' rows. */
export function lineWhere(farmId: number, startMonth: number, { safra, category, accountId }: BudgetLineKey) {
  return and(
    safraWhere(farmId, startMonth, safra),
    eq(budgets.category, category),
    accountId ? eq(budgets.accountId, accountId) : isNull(budgets.accountId)
  );
}

/** The rows to insert: the i-th amount on the first day of the i-th month of the safra. */
export function lineRows(
  farmId: number,
  userId: string,
  startMonth: number,
  line: BudgetLineKey & { months: number[]; distribution: BudgetDistribution }
): (typeof budgets.$inferInsert)[] {
  const calendar = safraMonths(line.safra, startMonth);
  return line.months.map((amountBrl, i) => ({
    id: randomUUID(),
    farmId,
    category: line.category,
    accountId: line.accountId ?? null,
    month: `${calendar[i].key}-01`,
    amountBrl,
    distribution: line.distribution,
    updatedBy: userId,
  }));
}
```

`lib/api/domains/budgets/useCases/ListBudgets.useCase.ts`:

```ts
import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { toBudget } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { safraStartMonth, safraWhere } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget } from "@/lib/types";

interface ListBudgetsUseCaseProps {
  farmId: number;
  safra: number;
}

type ListBudgetsUseCaseResponse = Budget[];

type CurrUseCase = _UseCase<ListBudgetsUseCaseProps, ListBudgetsUseCaseResponse>;

/** Every row of one safra's orçamento on this farm: its twelve calendar months by the farm's start month. */
export class ListBudgetsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ListBudgetsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, safra }) => {
    const startMonth = await safraStartMonth(this.repository, farmId);
    const rows = await this.repository.select().from(budgets).where(safraWhere(farmId, startMonth, safra));
    return rows.map(toBudget);
  };
}
```

`lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets } from "@/lib/db/schema";
import { toBudget } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget, BudgetDistribution, ExpenseCategory } from "@/lib/types";

interface PutBudgetLineUseCaseProps {
  farmId: number;
  /** Who saved it: kept in `updated_by`. */
  userId: string;
  safra: number;
  category: ExpenseCategory;
  /** Absent = the grupo's own line. */
  accountId?: string;
  /** By safra month, the first month of the safra first. */
  months: number[];
  distribution: BudgetDistribution;
}

/**
 * - `months_mismatch`: not twelve months.
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
 */
type PutBudgetLineUseCaseResponse = Budget[] | "months_mismatch" | "invalid_account";

type CurrUseCase = _UseCase<PutBudgetLineUseCaseProps, PutBudgetLineUseCaseResponse>;

/**
 * Saves one line of a safra's orçamento: its twelve calendar months replace
 * the ones it had in that safra, in one transaction. The months are stored as
 * sent; that they add up to the total typed is the dialog's check (the body
 * carries no total).
 */
export class PutBudgetLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("PutBudgetLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, months, distribution, ...key }) => {
    if (months.length !== 12) return "months_mismatch";
    if (key.accountId !== undefined) {
      const [account] = await this.repository
        .select({ group: accounts.group })
        .from(accounts)
        .where(and(eq(accounts.farmId, farmId), eq(accounts.id, key.accountId)))
        .limit(1);
      if (account?.group !== key.category) return "invalid_account";
    }
    const startMonth = await safraStartMonth(this.repository, farmId);
    return this.repository.transaction(async (tx) => {
      await tx.delete(budgets).where(lineWhere(farmId, startMonth, key));
      const rows = await tx
        .insert(budgets)
        .values(lineRows(farmId, userId, startMonth, { ...key, months, distribution }))
        .returning();
      return rows.map(toBudget);
    });
  };
}
```

`lib/api/domains/budgets/useCases/DeleteBudgetLine.useCase.ts`:

```ts
import { db } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseCategory } from "@/lib/types";

interface DeleteBudgetLineUseCaseProps {
  farmId: number;
  safra: number;
  category: ExpenseCategory;
  /** Absent = the grupo's own line. */
  accountId?: string;
}

/** How many rows went; 0 when the line had none. */
type DeleteBudgetLineUseCaseResponse = number;

type CurrUseCase = _UseCase<DeleteBudgetLineUseCaseProps, DeleteBudgetLineUseCaseResponse>;

/** Removes one line of a safra's orçamento. A grupo's own line goes alone: its contas' lines stay. */
export class DeleteBudgetLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBudgetLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, ...key }) => {
    const startMonth = await safraStartMonth(this.repository, farmId);
    const removed = await this.repository
      .delete(budgets)
      .where(lineWhere(farmId, startMonth, key))
      .returning({ id: budgets.id });
    return removed.length;
  };
}
```

`lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:

```ts
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, animals, budgets, expenses, treatments } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toTreatment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { lineRows, safraStartMonth, safraWhere } from "@/lib/api/domains/budgets/budgetLine";
import { copyPlan } from "@/lib/domain/budget";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Budget } from "@/lib/types";

interface CopyBudgetsUseCaseProps {
  farmId: number;
  /** Who copied: kept in `updated_by`. */
  userId: string;
  from: number;
  to: number;
  source: "budgeted" | "realized";
  /** −50 to +100. */
  adjustPct: number;
  /** Realizado stops here. */
  todayIso: string;
}

interface CopyBudgetsUseCaseResponse {
  /** Lines written. */
  copied: number;
  /** Lines of `from` left out: `to` already had a budget for them. */
  skipped: number;
  /** Every row of `to` after the copy. */
  budgets: Budget[];
}

type CurrUseCase = _UseCase<CopyBudgetsUseCaseProps, CopyBudgetsUseCaseResponse>;

/**
 * "Copiar da safra anterior": each line of `from` — its orçado, or its
 * realizado by grupo — that has no budget yet in `to`, adjusted by
 * `adjustPct` and rounded month by month (copyPlan says which and how much).
 * Written as "manual": the months are the ones copied, not a split of a total.
 */
export class CopyBudgetsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CopyBudgetsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, from, to, source, adjustPct, todayIso }) => {
    const startMonth = await safraStartMonth(this.repository, farmId);
    const [budgetRows, expenseRows, treatmentRows, accountRows] = await Promise.all([
      this.repository
        .select()
        .from(budgets)
        .where(or(safraWhere(farmId, startMonth, from), safraWhere(farmId, startMonth, to))),
      this.repository.select().from(expenses).where(eq(expenses.farmId, farmId)),
      this.repository
        .select({ row: treatments, earTag: animals.earTag })
        .from(treatments)
        .innerJoin(animals, eq(treatments.animalId, animals.id))
        .where(and(eq(animals.farmId, farmId), isNull(treatments.deletedAt))),
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
    ]);
    const { lines, skipped } = copyPlan(
      {
        budgets: budgetRows.map(toBudget),
        expenses: expenseRows.map((row) => toExpense(row)),
        treatments: treatmentRows.map(({ row, earTag }) => toTreatment(row, earTag)),
        accounts: accountRows.map(toAccount),
      },
      from,
      to,
      source,
      adjustPct,
      startMonth,
      todayIso
    );
    if (lines.length > 0) {
      await this.repository
        .insert(budgets)
        .values(
          lines.flatMap((line) =>
            lineRows(farmId, userId, startMonth, { ...line, safra: to, distribution: "manual" })
          )
        )
        // A line saved in `to` meanwhile keeps its own rows.
        .onConflictDoNothing();
    }
    const target = await this.repository.select().from(budgets).where(safraWhere(farmId, startMonth, to));
    return { copied: lines.length, skipped, budgets: target.map(toBudget) };
  };
}
```

- [ ] **Step 4: Run the use-case tests**

Run: `pnpm exec vitest run lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`
Expected: PASS (4 files, 11 tests).

- [ ] **Step 5: Write the failing routes test**

`lib/api/domains/budgets/__tests__/budgets.routes.test.ts`:

```ts
/**
 * The orçamento routes behind the farm macro, auth and db mocked:
 * - a member who only sees Financeiro reads a safra and writes nothing;
 * - a member without Financeiro does not even read it;
 * - PUT takes eleven months as far as the use case, which names the refusal,
 *   and sends who saved the line;
 * - DELETE reads the line from the query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, list, put, remove, copy } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
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
vi.mock("@/lib/api/domains/budgets/useCases/ListBudgets.useCase", () => ({
  ListBudgetsUseCase: class {
    run = list;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/PutBudgetLine.useCase", () => ({
  PutBudgetLineUseCase: class {
    run = put;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/DeleteBudgetLine.useCase", () => ({
  DeleteBudgetLineUseCase: class {
    run = remove;
  },
}));
vi.mock("@/lib/api/domains/budgets/useCases/CopyBudgets.useCase", () => ({
  CopyBudgetsUseCase: class {
    run = copy;
  },
}));

import { herdApi } from "@/lib/api/app";

const LINE = { safra: 2025, category: "nutrition", months: Array(11).fill(100), distribution: "manual" };

const request = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  list.mockResolvedValue([]);
});

describe("budgets routes", () => {
  it("lets Financeiro view read a safra and refuses every write, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    const read = await request("GET", "/budgets?safra=2025");
    expect(read.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ farmId: 7, safra: 2025 });

    for (const response of [
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&category=nutrition"),
      await request("POST", "/budgets/copy", { from: 2024, to: 2025, source: "budgeted", adjustPct: 0 }),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it("keeps the orçamento from a member without Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.vaqueiro }];

    const response = await request("GET", "/budgets?safra=2025");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(list).not.toHaveBeenCalled();
  });

  it("answers months_mismatch as a 400 and saves under the caller's id", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    put.mockResolvedValue("months_mismatch");

    const response = await request("PUT", "/budgets", LINE);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "months_mismatch" });
    expect(put).toHaveBeenCalledWith({ farmId: 7, userId: "user-1", ...LINE });
  });

  it("removes the line named in the query, with the empty body Eden sends", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    remove.mockResolvedValue(12);

    const response = await request("DELETE", "/budgets?safra=2025&category=admin", {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: 12 });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, safra: 2025, category: "admin" });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec vitest run lib/api/domains/budgets/__tests__/budgets.routes.test.ts`
Expected: FAIL. Every request answers 404 because no `/budgets` route is mounted yet.

- [ ] **Step 7: Implement the schemas, the controller, the mount and the route requirements**

`lib/api/domains/budgets/schemas/budget.schema.ts`:

```ts
/** Request schemas of the orçamento: one line (a grupo's own, or a conta's) of one safra. */

import { t } from "elysia";

import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** Calendar year the safra starts in. */
const Safra = t.Integer({ minimum: 2000, maximum: 2100 });
const AccountId = t.String({ minLength: 1 });

/** Query of GET /budgets. */
export const BudgetsQuery = t.Object({ safra: Safra });

/** Query of DELETE /budgets: the line; absent `accountId` = the grupo's own. */
export const BudgetLineQuery = t.Object({
  safra: Safra,
  category: ExpenseCategoryModel,
  accountId: t.Optional(AccountId),
});

/**
 * Body of PUT /budgets: the line's months by safra month, the first month of
 * the safra first. The count is not pinned here: anything but twelve is the
 * use case's 400 `months_mismatch`.
 */
export const BudgetLineBody = t.Object({
  safra: Safra,
  category: ExpenseCategoryModel,
  accountId: t.Optional(AccountId),
  months: t.Array(t.Number({ minimum: 0 })),
  distribution: t.Union([t.Literal("equal"), t.Literal("previous"), t.Literal("manual")]),
});

/** Body of POST /budgets/copy ("Copiar"): from one safra's orçado or realizado into another. */
export const CopyBudgetsBody = t.Object({
  from: Safra,
  to: Safra,
  source: t.Union([t.Literal("budgeted"), t.Literal("realized")]),
  adjustPct: t.Number({ minimum: -50, maximum: 100 }),
});
```

`lib/api/domains/budgets/budgets.controller.ts`:

```ts
/**
 * Orçamento por safra: per grupo of the plano de contas (and, optionally, per
 * conta inside it), twelve months each. Budgets never travel in the herd
 * load: the Orçamento page and the Painel ask for one safra at a time.
 *
 * PUT saves one line whole, DELETE removes one line, POST /copy fills the
 * empty lines of a safra from another one.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { CopyBudgetsUseCase } from "./useCases/CopyBudgets.useCase";
import { DeleteBudgetLineUseCase } from "./useCases/DeleteBudgetLine.useCase";
import { ListBudgetsUseCase } from "./useCases/ListBudgets.useCase";
import { PutBudgetLineUseCase } from "./useCases/PutBudgetLine.useCase";
import {
  BudgetLineBody,
  BudgetLineQuery,
  BudgetsQuery,
  CopyBudgetsBody,
} from "./schemas/budget.schema";

export const budgetsController = new Elysia({ prefix: "/budgets" })
  .use(farmPlugin)
  .get("/", ({ farmId, query }) => new ListBudgetsUseCase().run({ farmId, safra: query.safra }), {
    farm: true,
    query: BudgetsQuery,
  })
  .put(
    "/",
    async ({ farmId, user, body, status }) => {
      // The line's twelve rows as saved.
      const result = await new PutBudgetLineUseCase().run({ farmId, userId: user.id, ...body });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: BudgetLineBody }
  )
  .delete(
    "/",
    async ({ farmId, query }) => ({ removed: await new DeleteBudgetLineUseCase().run({ farmId, ...query }) }),
    { farm: true, query: BudgetLineQuery }
  )
  .post(
    "/copy",
    ({ farmId, user, body }) =>
      new CopyBudgetsUseCase().run({ farmId, userId: user.id, todayIso: todayISO(), ...body }),
    { farm: true, body: CopyBudgetsBody }
  );
```

`lib/api/app.ts`. **Replace**:

```ts
import { bankAccountsController } from "@/lib/api/domains/bankAccounts/bankAccounts.controller";
```

with:

```ts
import { bankAccountsController } from "@/lib/api/domains/bankAccounts/bankAccounts.controller";
import { budgetsController } from "@/lib/api/domains/budgets/budgets.controller";
```

**Replace**:

```ts
  .use(bankAccountsController)
  .use(statementsController)
```

with:

```ts
  .use(bankAccountsController)
  .use(statementsController)

  /* ---- Orçamento por safra ---------------------------------------------- */
  .use(budgetsController)
```

`lib/api/permissions/routeRequirements.ts`. **Replace**:

```ts
  "POST /api/herd/statement-lines/:id/undo": edit("finance"),
```

with:

```ts
  "POST /api/herd/statement-lines/:id/undo": edit("finance"),
  // Orçamento: reading a safra is seeing money; saving, removing or copying a line writes it.
  "GET /api/herd/budgets": { view: "finance" },
  "PUT /api/herd/budgets": edit("finance"),
  "DELETE /api/herd/budgets": edit("finance"),
  "POST /api/herd/budgets/copy": edit("finance"),
```

`PUT /api/herd/farm` stays as it is: `edit("farm")`.

- [ ] **Step 8: Run the tests and regenerate the two route snapshots**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts -u`

Put `-u` **after** the two paths. Vitest 4.1's `-u` takes an optional value, so `-u <path>` would read the first path as that value, drop it from the filter, and run the whole suite.

Expected: `Snapshots 2 updated`, 2 files passed. Then run `git diff --stat lib/api/__tests__/__snapshots__`. It shows exactly 22 added lines and no removed ones:
- `routeTable.test.ts.snap` gains `"DELETE /api/herd/budgets"`, `"GET /api/herd/budgets"`, `"POST /api/herd/budgets/copy"` and `"PUT /api/herd/budgets"`.
- `routeRequirements.test.ts.snap` gains the same four keys: `{ "view": "finance" }` for the GET, and `{ "edit": ["finance"] }` for the other three.

Run: `pnpm exec vitest run lib/api/domains/budgets lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts lib/api/__tests__/farmPlugin.test.ts lib/api/__tests__/errorScope.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts`
Expected: PASS (10 files, 56 tests; budgets: 5 files, 15 tests).

- [ ] **Step 9: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/api/domains/budgets lib/api/app.ts lib/api/permissions/routeRequirements.ts`
Expected: clean for these files. If task 2 is still running, `lib/domain/budget.ts` may be missing or incomplete. Then the only errors are the unresolved `safraMonths`/`safraRange`/`copyPlan` imports in `budgetLine.ts` and `CopyBudgets.useCase.ts`, and they clear once task 2 lands.


### Task 4: Store

This task adds the budgets cache and its four actions to the store. Budgets load per safra on demand. They never enter the herd load or the phone's snapshot (`herdDataOf` does not list them). Every write puts the server's rows into the cached safra. Every path that changes the farm, the access or the farm's início da safra starts the cache over: rows carry calendar months, and the start month decides which safra each one falls in.

**Needs on disk:** task 1 (`Budget`, `BudgetDistribution`, `FarmData.safraStartMonth` in `lib/types.ts`; the store's initial `farm` already carries `safraStartMonth: 10`) and task 3 (the `budgets` controller mounted in `lib/api/app.ts`, so `api.budgets` exists in the Eden types).

**Files:**
- Modify: `lib/store/useHerdStore.ts`
- Create: `lib/store/__tests__/budgets.test.ts`
- Test: `lib/store/__tests__/budgets.test.ts`

**Interfaces:**
- Consumes:
  - `GET /budgets?safra` → `Budget[]`.
  - `PUT /budgets` → `Budget[]` (the line's 12 rows).
  - `DELETE /budgets?safra&category&accountId` → `{ removed }`.
  - `POST /budgets/copy` → `{ copied, skipped, budgets }`.
  - These four are task 3's routes, called through `api` from `@/lib/api/client`.
  - The `Budget`, `BudgetDistribution` and `ExpenseCategory` types come from `@/lib/types`.
- Produces (tasks 5 and 6 rely on these):
  - `budgets: Record<number, Budget[]>` (initial `{}`; absent key = that safra not loaded yet).
  - `loadBudgets: (safra: number) => Promise<Budget[]>`
  - `saveBudgetLine: (input: { safra: number; category: ExpenseCategory; accountId?: string; months: number[]; distribution: BudgetDistribution }) => Promise<void>`
  - `removeBudgetLine: (input: { safra: number; category: ExpenseCategory; accountId?: string }) => Promise<void>`
  - `copyBudgets: (input: { from: number; to: number; source: "budgeted" | "realized"; adjustPct: number }) => Promise<{ copied: number; skipped: number }>`
  - `saveFarm` keeps its signature: the server's answer carries `safraStartMonth` since task 1, and the farm form (task 6) puts `safraStartMonth` in the object it passes. When the saved start month differs from the store's, `saveFarm` also sets `budgets: {}`, because the same rows now belong to other safras.
  - `switchFarm`, `createFarm` and `refreshAccess` set `budgets: {}`. A page that shows budgets must call `loadBudgets(safra)` whenever `budgets[safra]` is `undefined`, not only on mount. `reloadHerd` keeps the cache: it re-reads the same farm.
  - Every action throws after `apiFail`'s toast on an error, like its neighbours.

One small store test covers the two branches that are more than an Eden call: the `withBudgetLine` merge and `saveFarm` emptying the cache on a new início da safra. It uses the store harness of `lib/store/__tests__/bankAccounts.test.ts` (sonner, auth client, Eden client, repository and offline wiring mocked).

- [ ] **Step 1: Write the failing test**

`lib/store/__tests__/budgets.test.ts`:

```ts
/**
 * Budgets in the store: a saved line swaps its rows in the cached safra, and a
 * new início da safra empties the cache, since the same months now fall in
 * other safras.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Budget, FarmData } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { budgetsPut, farmPut } = vi.hoisted(() => ({ budgetsPut: vi.fn(), farmPut: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({ api: { budgets: { put: budgetsPut }, farm: { put: farmPut } } }));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({ ApiHerdRepository: class {} }));
vi.mock("@/lib/store/offlineWiring", () => ({
  getOutbox: vi.fn(),
  getEngine: vi.fn(),
  wireOffline: vi.fn(),
  setSyncUser: vi.fn(),
  getSyncUser: vi.fn(),
}));

import { useHerdStore } from "@/lib/store/useHerdStore";

const row = (id: string, accountId?: string): Budget => ({
  id,
  category: "nutrition",
  accountId,
  month: "2025-10-01",
  amountBrl: 100,
  distribution: "equal",
});

const FARM: FarmData = { name: "Boa Vista", municipality: "Uberaba", stateRegistration: "", manager: "", safraStartMonth: 10 };

beforeEach(() => {
  useHerdStore.setState({ farm: FARM, budgets: { 2025: [row("grupo"), row("sal", "nut-sal")] } });
});

describe("budgets in the store", () => {
  it("swaps a saved line's rows in its safra and keeps its contas'", async () => {
    budgetsPut.mockResolvedValue({ data: [row("grupo-novo")], error: null });

    await useHerdStore
      .getState()
      .saveBudgetLine({ safra: 2025, category: "nutrition", months: Array(12).fill(100), distribution: "equal" });

    expect(useHerdStore.getState().budgets[2025].map((b) => b.id)).toEqual(["sal", "grupo-novo"]);
  });

  it("empties the cache when the início da safra changes, and only then", async () => {
    farmPut.mockResolvedValue({ data: FARM, error: null });
    await useHerdStore.getState().saveFarm(FARM);
    expect(useHerdStore.getState().budgets[2025]).toHaveLength(2);

    farmPut.mockResolvedValue({ data: { ...FARM, safraStartMonth: 1 }, error: null });
    await useHerdStore.getState().saveFarm({ ...FARM, safraStartMonth: 1 });
    expect(useHerdStore.getState().budgets).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/__tests__/budgets.test.ts`
Expected: FAIL — 2 tests: `saveBudgetLine is not a function`, and the cache still holds safra 2025 after the new início.

- [ ] **Step 3: Implement**

`lib/store/useHerdStore.ts`. **Replace** (the type import list):

```ts
  Breeding,
  Calving,
  CsvMapping,
  CustomCategory,
  Expense,
  FarmData,
```

with:

```ts
  Breeding,
  Budget,
  BudgetDistribution,
  Calving,
  CsvMapping,
  CustomCategory,
  Expense,
  ExpenseCategory,
  FarmData,
```

**Replace** (the store's fields, in `HerdStore`):

```ts
  /** The fila itself, in the order it goes, for the runner's list and the Sincronização sheet. */
  ops: OutboxOp[];
```

with:

```ts
  /** The fila itself, in the order it goes, for the runner's list and the Sincronização sheet. */
  ops: OutboxOp[];
  /**
   * Budgets by safra, loaded on demand; absent = not loaded yet. Never in the
   * herd load nor in the phone's snapshot; a farm switch empties it.
   */
  budgets: Record<number, Budget[]>;
```

**Replace** (the actions, in `HerdStore`):

```ts
  /** "Confirmar as N de confiança alta". */
  confirmHighMatches: (
    importId: string,
    pairs: ({ lineId: string } & MatchTarget)[]
  ) => Promise<{ resolved: Resolved[]; refused: number }>;
```

with:

```ts
  /** "Confirmar as N de confiança alta". */
  confirmHighMatches: (
    importId: string,
    pairs: ({ lineId: string } & MatchTarget)[]
  ) => Promise<{ resolved: Resolved[]; refused: number }>;
  /** Reads one safra's orçamento into `budgets` and resolves its rows. */
  loadBudgets: (safra: number) => Promise<Budget[]>;
  /**
   * Saves one line whole — a grupo's own (no `accountId`) or a conta's — with
   * its twelve months by safra month, the first month of the safra first.
   */
  saveBudgetLine: (input: {
    safra: number;
    category: ExpenseCategory;
    accountId?: string;
    months: number[];
    distribution: BudgetDistribution;
  }) => Promise<void>;
  /** Removes one line; a grupo's own line goes alone, its contas' lines stay. */
  removeBudgetLine: (input: { safra: number; category: ExpenseCategory; accountId?: string }) => Promise<void>;
  /** "Copiar": fills the lines `to` lacks from `from`'s orçado or realizado; resolves the counts. */
  copyBudgets: (input: {
    from: number;
    to: number;
    source: "budgeted" | "realized";
    adjustPct: number;
  }) => Promise<{ copied: number; skipped: number }>;
```

**Replace** (a module helper next to `keepLines`):

```ts
/** Refusals of a decision on a linha do extrato the farmer can act on. */
const LINE_REFUSALS: Record<string, string> = {
```

with:

```ts
/**
 * One line's rows swapped in a loaded safra (none: the line removed). A safra
 * not loaded yet stays absent, so its first load still reads it whole.
 */
function withBudgetLine(
  budgets: Record<number, Budget[]>,
  line: { safra: number; category: ExpenseCategory; accountId?: string },
  rows: Budget[]
): Record<number, Budget[]> {
  const cached = budgets[line.safra];
  if (!cached) return budgets;
  const others = cached.filter((b) => b.category !== line.category || b.accountId !== line.accountId);
  return { ...budgets, [line.safra]: [...others, ...rows] };
}

/** Refusals of a decision on a linha do extrato the farmer can act on. */
const LINE_REFUSALS: Record<string, string> = {
```

**Replace** (the initial cache):

```ts
  outboxCount: 0,
  ops: [],

  load: async () => {
```

with:

```ts
  outboxCount: 0,
  ops: [],
  budgets: {},

  load: async () => {
```

**Replace** (in `refreshAccess`: after a forbidden answer, an accepted convite or a deleted farm):

```ts
    set({
      ...data,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: activeFarmId ?? get().activeFarmId,
      offline: false,
      snapshotAt: null,
    });
```

with:

```ts
    set({
      ...data,
      // The farm or the access may have changed: budgets load again on demand.
      budgets: {},
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: activeFarmId ?? get().activeFarmId,
      offline: false,
      snapshotAt: null,
    });
```

**Replace** (in `switchFarm`):

```ts
    set({ ...data, activeFarmId: farmId, loaded: true, offline: false, snapshotAt: null });
```

with:

```ts
    set({ ...data, budgets: {}, activeFarmId: farmId, loaded: true, offline: false, snapshotAt: null });
```

**Replace** (in `createFarm`, which opens the new farm):

```ts
    set({
      ...herd,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: data.farmId,
      loaded: true,
    });
```

with:

```ts
    set({
      ...herd,
      budgets: {},
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: data.farmId,
      loaded: true,
    });
```

**Replace** (the `saveFarm` declaration, in `HerdStore`):

```ts
  /** Saves the registration fields; the sede is left as it is. */
  saveFarm: (d: Omit<FarmData, "headquarters">) => Promise<void>;
```

with:

```ts
  /**
   * Saves the registration fields and the início da safra; the sede is left as
   * it is. A new início empties `budgets`: the saved months fall into other safras.
   */
  saveFarm: (d: Omit<FarmData, "headquarters">) => Promise<void>;
```

**Replace** (the `saveFarm` action):

```ts
    if (error) apiFail("salvar os dados da fazenda", error);
    set({ farm: { ...(data as FarmData) } });
```

with:

```ts
    if (error) apiFail("salvar os dados da fazenda", error);
    const farm = data as FarmData;
    // Budgets keep their calendar months: another início groups them into other safras.
    const regrouped = farm.safraStartMonth !== get().farm.safraStartMonth;
    set({ farm: { ...farm }, ...(regrouped ? { budgets: {} } : {}) });
```

**Replace** (the actions, after `confirmHighMatches`):

```ts
    const result = data as { resolved: Resolved[]; refused: number };
    set((s) => mergeResolved(s, result.resolved, undefined, "pending"));
    return result;
  },
```

with:

```ts
    const result = data as { resolved: Resolved[]; refused: number };
    set((s) => mergeResolved(s, result.resolved, undefined, "pending"));
    return result;
  },

  loadBudgets: async (safra) => {
    const farmId = get().activeFarmId;
    const { data, error } = await api.budgets.get({ query: { safra } });
    if (error) apiFail("carregar o orçamento", error);
    const rows = data as Budget[];
    // A farm switch while this was on its way: the answer is the other farm's.
    if (get().activeFarmId === farmId) set((s) => ({ budgets: { ...s.budgets, [safra]: rows } }));
    return rows;
  },

  saveBudgetLine: async (input) => {
    const { data, error } = await api.budgets.put(input);
    if (error) apiFail("salvar o orçamento", error);
    set((s) => ({ budgets: withBudgetLine(s.budgets, input, data as Budget[]) }));
  },

  removeBudgetLine: async (input) => {
    // The line travels in the query; Eden asks for a body all the same.
    const { error } = await api.budgets.delete({}, { query: input });
    if (error) apiFail("remover o orçamento", error);
    set((s) => ({ budgets: withBudgetLine(s.budgets, input, []) }));
  },

  copyBudgets: async (input) => {
    const { data, error } = await api.budgets.copy.post(input);
    if (error) apiFail("copiar o orçamento", error);
    const { copied, skipped, budgets } = data as { copied: number; skipped: number; budgets: Budget[] };
    set((s) => ({ budgets: { ...s.budgets, [input.to]: budgets } }));
    return { copied, skipped };
  },
```

Every search text above occurs exactly once in the file after task 1.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/store/__tests__/budgets.test.ts lib/store/__tests__/bankAccounts.test.ts lib/store/__tests__/queueOrSend.test.ts lib/store/__tests__/activePermissions.test.ts lib/store/__tests__/dashboard.test.ts lib/store/__tests__/manejoMerge.test.ts lib/store/__tests__/selectors.test.ts`
Expected: PASS (7 files, 117 tests): the two new ones, and nothing around the new actions changed.

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/store/useHerdStore.ts lib/store/__tests__/budgets.test.ts`
Expected: clean. If `api.budgets` does not type, task 3's controller is not mounted yet. `api.budgets.delete(undefined, …)` does not compile: the query is required, so Eden asks for a body, and `{}` is the one it takes.


### Task 5: Orçamento page

**Files:**
- Create: `app/(app)/finance/orcamento/page.tsx`
- Create: `components/finance/orcamento/OrcamentoPage.tsx`
- Create: `components/finance/orcamento/SafraPicker.tsx`
- Create: `components/finance/orcamento/BudgetTable.tsx`
- Create: `components/finance/orcamento/BudgetCards.tsx`
- Create: `components/finance/orcamento/BudgetEditDialog.tsx`
- Create: `components/finance/orcamento/CopyDialog.tsx`
- Create: `components/finance/orcamento/Sparkline.tsx`
- Create: `components/finance/orcamento/BudgetMeter.tsx` (the % usado bar, shared with task 6's `BudgetBand`)
- Create: `components/finance/orcamento/editFields.ts`
- Modify: `components/finance/FinanceSubnav.tsx`
- Test: `components/finance/__tests__/editFields.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 (`lib/types.ts`): `Budget { id; category; accountId?; month: string /* "YYYY-MM-01" */; amountBrl; distribution }` (no `safra`: `budgetView` and `copyPlan` pick a safra's rows by month), `BudgetDistribution`, `FarmData.safraStartMonth: number` (an offline snapshot from before this change has none: read it `?? 10`).
  - Task 2 (`lib/domain/budget.ts`): `safraOf(dateIso, startMonth): number`, `safraMonths(safra, startMonth): SafraMonth[]`, `safraLabel(safra, startMonth): string`, `safraRange(safra, startMonth): Period`, `distribute(total, mode: "equal" | "previous", previousShape?: number[]): number[]`, `monthsAddUp(months, total): boolean`, `lineKey(category, accountId?): LineKey`, `budgetView(inputs, safra, startMonth, todayIso): BudgetView`, `previousShape(inputs, key, safra, startMonth, todayIso): number[]` (the realizado by month of the safra *before* `safra`), `copyPlan(inputs, from, to, source, adjustPct, startMonth, todayIso): { lines: CopyLine[]; skipped: number }`, types `BudgetLine`, `BudgetGroup`, `BudgetView`, `BudgetTone`, `BudgetInputs`.
  - Task 4 (`lib/store/useHerdStore.ts`): `budgets: Record<number, Budget[]>` (emptied by a farm switch and by a new início da safra: a page calls `loadBudgets(safra)` whenever `budgets[safra]` is undefined), `loadBudgets(safra): Promise<Budget[]>`, `saveBudgetLine({ safra, category, accountId?, months, distribution }): Promise<void>`, `removeBudgetLine({ safra, category, accountId? }): Promise<void>`, `copyBudgets({ from, to, source, adjustPct }): Promise<{ copied: number; skipped: number }>`. Every store action toasts and throws on an API error (`apiFail`); the UI only catches.
  - Repo: `parseAmount`, `cents`, `accountsByGroup`, `EXPENSE_GROUPS`, `EXPENSE_CATEGORY_LABEL`, `monthYear`, `MONTH_ABBREV`, `formatDate`, `todayISO`, `formatNumber`, `formatCurrency`, `periodFromSearch`, `BOTTOM_SHEET`, `PageHeader`, `ReadOnlyPill`, `RequireAccess`, `SectionCard`, `EmptyState`, `components/ui/*`.
- Produces:
  - `components/finance/orcamento/BudgetMeter.tsx`: `BudgetMeter({ pct, tone, className }: { pct: number; tone: BudgetTone; className?: string })`, `TONE_TEXT: Record<BudgetTone, string>`, `TONE_BAR: Record<BudgetTone, string>`, `usedText(pct: number): string` ("108 %"), `reais(value: number): string` ("R$ 360.000"). Task 6 imports `BudgetMeter`, `TONE_TEXT`, `usedText`.
  - `FinanceSection` gains `"orcamento"`; the sub-navigation reads Painel · Lançamentos · Contas bancárias · Orçamento and becomes a client component (`"use client"`; every importer already is one); on the phone it scrolls the current pill to the middle of its row.
  - Route `/finance/orcamento?safra=YYYY` (absent = the current safra); task 6's band links to it.
  - `components/finance/orcamento/editFields.ts`: `LineFields`, `LineCheck`, `lineFields`, `withTotal`, `withDistribution`, `withMonth`, `checkLine`.
  - Accessible names the smoke (task 7) relies on: picker combobox "Safra"; header button "Copiar da safra anterior"; "Orçar um grupo"; pencil "Editar orçamento de <grupo>"; grupo row buttons named by the grupo with `aria-expanded`; strip `main dl > div` (dt = label, first dd = value, second dd = sub); `role="meter"` named "<n> % do orçado"; sparkline `svg[role=img]` named "<grupo>: realizado mês a mês contra o orçado" with one `rect` per month up to today (`fill-overdue` above the month's orçado); dialog heading "Orçamento · <grupo>", "Total do grupo (R$)", fieldset "Distribuir por mês" with radios Igual / Como a safra anterior / Manual, month inputs labelled "jul/26"…, `summary` "Contas", conta total inputs labelled by the conta name, conta radiogroups "Distribuição de <conta>", "Grupo" select (from "Orçar um grupo" only), "Remover orçamento do grupo", "Salvar orçamento", `role="alert"` "<grupo> · A soma dos meses não confere com o total."; copy dialog heading "Copiar da safra anterior", radios "Orçado" / "Realizado", "Ajuste (%)", button "Copiar".

Shape of the page (canvas `shot-B-Orcamento-{Desktop,Edit,Phone}.png`, `boards.mjs` `orcamentoDesktop`, `editDialog`, `orcamentoPhone`): header "Orçamento · safra 2025/26" with "01/10/2025 a 30/09/2026 · COE por grupo do plano de contas", the Safra picker and "Copiar da safra anterior" (phone: "Copiar"); the sub-navigation; a strip of four cells (Orçado, Realizado até <mês>, Variação, Previsto até o fim — two columns and three cells on the phone, the previsto folded into the Variação's line); "Por grupo" as a table on md+ (Grupo › Conta, Orçado (R$), Realizado (R$), % usado, Previsto até o fim, Mês a mês, pencil; Total row; legend) and as cards on the phone. Figures in whole reais as the canvas writes them. A safra without any orçado shows "Nenhum orçamento para esta safra" with "Copiar da safra anterior" and "Orçar um grupo". A view-only member sees no pencil, no Copiar, no "Orçar um grupo", and the "Somente leitura" pill.

- [ ] **Step 1: Write the failing test**

`components/finance/__tests__/editFields.test.ts`
```ts
import { describe, expect, it } from "vitest";

import { distribute } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import {
  checkLine,
  lineFields,
  withDistribution,
  withMonth,
  withTotal,
  type LineFields,
} from "@/components/finance/orcamento/editFields";

const LABELS = ["out/25", "nov/25", "dez/25", "jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26", "jul/26", "ago/26", "set/26"];
const FLAT = Array<number>(12).fill(1);
const EMPTY = Array<string>(11).fill("");
const blank = lineFields();

describe("lineFields", () => {
  it("starts a line without rows of its own blank, under Igual", () => {
    expect(blank).toEqual({ total: "", distribution: "equal", months: Array(12).fill("") });
    // A grupo whose orçado is only the sum of its contas has no line of its own to edit.
    expect(lineFields({ ownRows: false, budgeted: Array(12).fill(10), budgetedTotal: 120, distribution: null })).toEqual(blank);
  });

  it("starts a saved line from its rows and its distribution", () => {
    const budgeted = [11200, 8400, 7000, 6300, 6300, 7000, 9800, 12600, 16800, 18200, 19600, 16800];
    const fields = lineFields({ ownRows: true, budgeted, budgetedTotal: 140000, distribution: "previous" });
    expect(fields.total).toBe("140.000,00");
    expect(fields.distribution).toBe("previous");
    expect(fields.months[0]).toBe("11.200,00");
    expect(fields.months[11]).toBe("16.800,00");
  });

  it("reads a saved line without a distribution as Manual", () => {
    const fields = lineFields({ ownRows: true, budgeted: Array(12).fill(10), budgetedTotal: 120, distribution: null });
    expect(fields.distribution).toBe("manual");
  });
});

describe("withTotal", () => {
  it("spreads a total evenly under Igual, the last month taking the centavos", () => {
    const fields = withTotal(blank, "100,00", FLAT);
    expect(fields.months.slice(0, 11)).toEqual(Array(11).fill("8,33"));
    expect(fields.months[11]).toBe("8,37");
    expect(checkLine(fields, LABELS)).toEqual({ state: "ok", total: 100, months: [...Array(11).fill(8.33), 8.37] });
  });

  it("follows the previous safra's shape under Como a safra anterior, zero where it spent nothing", () => {
    const shape = [0, 0, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0];
    const fields = withTotal({ ...blank, distribution: "previous" }, "1.200", shape);
    expect(fields.months).toEqual(distribute(1200, "previous", shape).map((m) => formatNumber(m, 2)));
    expect(fields.months[0]).toBe("0,00");
    expect(checkLine(fields, LABELS).state).toBe("ok");
  });

  it("keeps the months under Manual", () => {
    const manual: LineFields = { total: "100", distribution: "manual", months: ["50", "50", ...Array(10).fill("")] };
    expect(withTotal(manual, "120", FLAT)).toEqual({ ...manual, total: "120" });
  });

  it("blanks the months while the total is not a number", () => {
    expect(withTotal(withTotal(blank, "1.200", FLAT), "abc", FLAT).months).toEqual(Array(12).fill(""));
  });
});

describe("withMonth", () => {
  it("keeps the month as typed and makes the line Manual", () => {
    const even = withTotal(blank, "1.200", FLAT);
    const edited = withMonth(even, 0, "150");
    expect(edited.distribution).toBe("manual");
    expect(edited.months[0]).toBe("150");
    expect(edited.months.slice(1)).toEqual(even.months.slice(1));
    expect(edited.total).toBe("1.200");
  });
});

describe("withDistribution", () => {
  it("spreads the total again when Igual or Como a safra anterior is picked", () => {
    const edited = withMonth(withTotal(blank, "1.200", FLAT), 0, "150");
    expect(withDistribution(edited, "equal", FLAT).months).toEqual(Array(12).fill("100,00"));
  });

  it("keeps the months when Manual is picked", () => {
    const even = withTotal(blank, "1.200", FLAT);
    expect(withDistribution(even, "manual", FLAT)).toEqual({ ...even, distribution: "manual" });
  });
});

describe("checkLine", () => {
  it("is blank when nothing is typed, whatever the distribution", () => {
    expect(checkLine(blank, LABELS)).toEqual({ state: "blank" });
    expect(checkLine({ ...blank, distribution: "previous" }, LABELS)).toEqual({ state: "blank" });
  });

  it("refuses typed months that do not add up to the total", () => {
    const edited = withMonth(withTotal(blank, "1.200", FLAT), 0, "150");
    expect(checkLine(edited, LABELS)).toEqual({ state: "off", total: 1200, sum: 1250 });
  });

  it("reads an empty month as zero", () => {
    const fields: LineFields = { total: "100", distribution: "manual", months: ["100", ...EMPTY] };
    expect(checkLine(fields, LABELS)).toEqual({ state: "ok", total: 100, months: [100, ...Array(11).fill(0)] });
  });

  it("names the month that is not a number, and asks for the total", () => {
    expect(checkLine({ total: "100", distribution: "manual", months: ["abc", ...EMPTY] }, LABELS)).toEqual({
      state: "invalid",
      message: "Valor inválido em out/25.",
    });
    expect(checkLine({ total: "", distribution: "manual", months: ["100", ...EMPTY] }, LABELS)).toEqual({
      state: "invalid",
      message: "Informe o total em reais.",
    });
  });

  it("refuses negative values", () => {
    expect(checkLine({ total: "100", distribution: "manual", months: ["-100", "200", ...Array(10).fill("")] }, LABELS)).toEqual({
      state: "invalid",
      message: "Os valores não podem ser negativos.",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run components/finance/__tests__/editFields.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/finance/orcamento/editFields"` (the file does not exist yet).

- [ ] **Step 3: Implement**

`components/finance/orcamento/editFields.ts`
```ts
/**
 * The fields of the orçamento dialog, one set per line (the grupo's own and
 * each conta's): the total, the distribution and the twelve months as typed.
 * A total typed under Igual or Como a safra anterior spreads over the months
 * again; typing a month keeps it and makes the line Manual; `checkLine` says
 * whether the line can be saved. Pure.
 */
import type { BudgetDistribution } from "@/lib/types";
import { distribute, monthsAddUp, type BudgetLine } from "@/lib/domain/budget";
import { cents } from "@/lib/domain/bankAccounts";
import { formatNumber } from "@/lib/domain/format";
import { parseAmount } from "@/components/finance/parseAmount";

export interface LineFields {
  /** "Total (R$)" as typed. */
  total: string;
  distribution: BudgetDistribution;
  /** The twelve months as typed, in safra order. */
  months: string[];
}

/** Whether the line can be saved: blank (no budget), its months when they add up to the total, or what is wrong. */
export type LineCheck =
  | { state: "blank" }
  | { state: "invalid"; message: string }
  | { state: "off"; total: number; sum: number }
  | { state: "ok"; total: number; months: number[] };

const typed = (value: number) => formatNumber(value, 2);
const emptyMonths = () => Array<string>(12).fill("");

/** The fields of a line: its own rows when it has them, else blank under Igual. */
export function lineFields(
  line?: Pick<BudgetLine, "ownRows" | "budgeted" | "budgetedTotal" | "distribution">
): LineFields {
  if (!line?.ownRows) return { total: "", distribution: "equal", months: emptyMonths() };
  return { total: typed(line.budgetedTotal), distribution: line.distribution ?? "manual", months: line.budgeted.map(typed) };
}

/** The months `total` spreads into; blank while it is not a number ≥ 0. */
function spread(total: string, distribution: "equal" | "previous", shape: number[]): string[] {
  const value = parseAmount(total);
  return Number.isFinite(value) && value >= 0 ? distribute(value, distribution, shape).map(typed) : emptyMonths();
}

/** Typing the total: Igual and Como a safra anterior spread it again; Manual keeps the months. */
export function withTotal(fields: LineFields, total: string, shape: number[]): LineFields {
  return fields.distribution === "manual"
    ? { ...fields, total }
    : { ...fields, total, months: spread(total, fields.distribution, shape) };
}

/** Picking a distribution: Igual and Como a safra anterior spread the total; Manual keeps the months. */
export function withDistribution(fields: LineFields, distribution: BudgetDistribution, shape: number[]): LineFields {
  return distribution === "manual"
    ? { ...fields, distribution }
    : { ...fields, distribution, months: spread(fields.total, distribution, shape) };
}

/** Typing a month: it stays as typed and the line becomes Manual. */
export function withMonth(fields: LineFields, index: number, text: string): LineFields {
  return { ...fields, distribution: "manual", months: fields.months.map((month, i) => (i === index ? text : month)) };
}

/** An empty month is zero; `labels` name the month that is not a number ("out/25"). */
export function checkLine(fields: LineFields, labels: readonly string[]): LineCheck {
  if (fields.total.trim() === "" && fields.months.every((month) => month.trim() === "")) return { state: "blank" };
  const total = parseAmount(fields.total);
  if (!Number.isFinite(total)) return { state: "invalid", message: "Informe o total em reais." };
  const months: number[] = [];
  for (const [i, text] of fields.months.entries()) {
    const value = text.trim() === "" ? 0 : parseAmount(text);
    if (!Number.isFinite(value)) return { state: "invalid", message: `Valor inválido em ${labels[i]}.` };
    months.push(cents(value));
  }
  if (total < 0 || months.some((month) => month < 0)) {
    return { state: "invalid", message: "Os valores não podem ser negativos." };
  }
  if (!monthsAddUp(months, total)) {
    return { state: "off", total: cents(total), sum: cents(months.reduce((sum, month) => sum + month, 0)) };
  }
  return { state: "ok", total: cents(total), months };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run components/finance/__tests__/editFields.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: The sub-navigation, the meter and the sparkline**

`components/finance/FinanceSubnav.tsx` — replace the whole file with (the fourth section, and an effect that centres the current pill in the phone's scrolling row: at 390 px Orçamento lies past the edge, so without it the current page is not on screen):
```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { periodSearch, type Period } from "@/lib/domain/period";
import { cn } from "@/lib/utils";

export type FinanceSection = "painel" | "lancamentos" | "contas" | "orcamento";

/** The Financeiro pages; later cycles add Estoque, Patrimônio. */
const SECTIONS: readonly { key: FinanceSection; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/finance" },
  { key: "lancamentos", label: "Lançamentos", href: "/finance/lancamentos" },
  { key: "contas", label: "Contas bancárias", href: "/finance/contas" },
  { key: "orcamento", label: "Orçamento", href: "/finance/orcamento" },
];

/**
 * Sub-navigation under the PageHeader of every Financeiro page: a tab row on
 * desktop, a row of pills that scrolls sideways on the phone. The window
 * (?de&ate) goes along. `current` comes from the page rather than
 * usePathname, which can mismatch on hydration behind the proxy.
 */
export function FinanceSubnav({ current, period }: { current: FinanceSection; period: Period }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    // The phone's pills scroll sideways: centre the current one (Orçamento lies past the edge at 390 px).
    // scrollLeft only, so the page itself never moves.
    const row = nav.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !active) return;
    const r = row.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    row.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
  }, [current]);
  return (
    <nav ref={nav} aria-label="Seções do Financeiro" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
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

`components/finance/orcamento/BudgetMeter.tsx`
```tsx
/**
 * The orçamento's "% usado" bar and its tone colours (up to 90 % brand, 90 to
 * 100 % attention, above 100 % overdue), and the two ways the orçamento writes
 * its figures: whole reais and "108 %". The table, the phone cards and the
 * Painel's band share them.
 */
import type { BudgetTone } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export const TONE_TEXT: Record<BudgetTone, string> = {
  brand: "text-brand",
  attention: "text-attention",
  overdue: "text-overdue",
  none: "text-ink-soft",
};

export const TONE_BAR: Record<BudgetTone, string> = {
  brand: "bg-brand",
  attention: "bg-attention",
  overdue: "bg-overdue",
  none: "bg-hairline",
};

/** "108 %". */
export const usedText = (pct: number) => `${formatNumber(pct)} %`;

/** "R$ 360.000": the orçamento reads in whole reais. */
export const reais = (value: number) => `R$ ${formatNumber(value)}`;

/** Full at 100 %; the number goes beside it. Spans, so it fits inside a card's button. */
export function BudgetMeter({ pct, tone, className }: { pct: number; tone: BudgetTone; className?: string }) {
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(pct))}
      aria-label={`${usedText(pct)} do orçado`}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-surface ring-1 ring-hairline ring-inset", className)}
    >
      <span className={cn("block h-full", TONE_BAR[tone])} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </span>
  );
}
```

`components/finance/orcamento/Sparkline.tsx`
```tsx
/**
 * "Mês a mês": the realizado of each month up to today as bars, in the overdue
 * colour when it passes that month's orçado by more than 2 %, and the orçado
 * as a step line. 128 × 24, inline SVG.
 */
const H = 24;
const BAR = 7;
/** A bar and the gap after it. */
const STEP = 11;

interface SparklineProps {
  label: string;
  /** By safra month. */
  budgeted: number[];
  realized: number[];
  /** Months after it have no bar; -1 before the safra. */
  todayIndex: number;
}

export function Sparkline({ label, budgeted, realized, todayIndex }: SparklineProps) {
  const max = Math.max(1, ...budgeted, ...realized);
  const y = (value: number) => H - (value / max) * (H - 2);
  const planned = budgeted.some((value) => value > 0);
  const line = budgeted.map((value, i) => `${i * STEP},${y(value)} ${i * STEP + BAR},${y(value)}`).join(" ");
  return (
    <svg width="128" height={H} viewBox={`0 0 128 ${H}`} role="img" aria-label={`${label}: realizado mês a mês contra o orçado`}>
      <polyline points={line} fill="none" strokeWidth="1.25" strokeLinejoin="round" className="stroke-ink opacity-70" />
      {realized.slice(0, todayIndex + 1).map((value, i) => {
        const over = planned && value > budgeted[i] * 1.02;
        return (
          <rect
            key={i}
            x={i * STEP}
            y={y(value)}
            width={BAR}
            height={H - y(value)}
            rx="1"
            className={over ? "fill-overdue opacity-75" : "fill-brand opacity-55"}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 6: The safra picker, the table and the phone cards**

`components/finance/orcamento/SafraPicker.tsx`
```tsx
"use client";

/**
 * The safra the Orçamento shows: the one before the current, the current and
 * the next, plus the one in the URL when it lies further away.
 */
import { CalendarRange } from "lucide-react";
import { safraLabel } from "@/lib/domain/budget";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SafraPickerProps {
  value: number;
  /** The safra holding today. */
  current: number;
  startMonth: number;
  onChange(safra: number): void;
}

export function SafraPicker({ value, current, startMonth, onChange }: SafraPickerProps) {
  const options = [...new Set([current - 1, current, current + 1, value])].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger aria-label="Safra" className="min-h-11 flex-1 sm:flex-none md:min-h-8">
        <span className="flex items-center gap-2">
          <CalendarRange className="text-ink-soft" aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((safra) => (
          <SelectItem key={safra} value={String(safra)}>
            {safraLabel(safra, startMonth)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

`components/finance/orcamento/BudgetTable.tsx`
```tsx
"use client";

/**
 * "Por grupo" on md+: a row per grupo with its orçado for the whole safra,
 * the realizado to date, the % usado against the orçado to date (bar and
 * number), where the safra is heading and the month by month; a grupo opens
 * to its contas, and the pencil (Financeiro edit only) edits its orçamento.
 * A Total row and the legend close it.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import type { BudgetLine, BudgetTone, BudgetView } from "@/lib/domain/budget";
import { MONTH_ABBREV } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { BudgetMeter, TONE_BAR, TONE_TEXT, reais, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { Sparkline } from "@/components/finance/orcamento/Sparkline";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const HEAD = "h-10 px-2 text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";

const LEGEND: readonly [BudgetTone, string][] = [
  ["brand", "até 90 %"],
  ["attention", "90 a 100 %"],
  ["overdue", "acima de 100 %"],
];

/** What a row shows; the Total row has no line of its own. */
type Figures = Pick<BudgetLine, "hasBudget" | "budgetedTotal" | "realizedToDate" | "usedPct" | "tone" | "forecast">;

interface BudgetTableProps {
  view: BudgetView;
  canEdit: boolean;
  onEdit(category: ExpenseCategory): void;
  /** "Orçar um grupo". */
  onAdd(): void;
}

export function BudgetTable({ view, canEdit, onEdit, onAdd }: BudgetTableProps) {
  const [open, setOpen] = useState<ReadonlySet<ExpenseCategory>>(() => new Set());
  const toggle = (category: ExpenseCategory) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  const first = MONTH_ABBREV[view.months[0].month - 1];
  const last = MONTH_ABBREV[view.months[11].month - 1];

  return (
    <SectionCard
      title="Por grupo"
      subtitle={
        canEdit
          ? "abra um grupo para ver as contas · o lápis edita o orçado e a distribuição por mês"
          : "abra um grupo para ver as contas"
      }
      bodyClassName="p-0"
      action={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus aria-hidden />
            Orçar um grupo
          </Button>
        ) : undefined
      }
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">Orçamento por grupo</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, "pl-4 text-left")}>
              Grupo › Conta
            </th>
            <th scope="col" className={cn(HEAD, "w-[110px] text-right")}>
              Orçado (R$)
            </th>
            <th scope="col" className={cn(HEAD, "w-[120px] text-right")}>
              Realizado (R$)
            </th>
            <th scope="col" className={cn(HEAD, "w-[170px] text-left")}>
              % usado
            </th>
            <th scope="col" className={cn(HEAD, "w-[140px] text-right")}>
              Previsto até o fim
            </th>
            <th scope="col" className={cn(HEAD, "w-[150px] text-left")}>
              Mês a mês
            </th>
            <th scope="col" className={cn(HEAD, "w-12 pr-4")}>
              <span className="sr-only">Editar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {view.groups.map((group) => {
            const isOpen = open.has(group.category);
            return (
              <Fragment key={group.key}>
                <tr className={cn("border-t border-hairline", isOpen && "bg-surface")}>
                  <td className="py-2 pr-2 pl-4">
                    {group.accounts.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(group.category)}
                        className="inline-flex min-h-8 items-center gap-2 text-sm font-medium text-ink"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4 text-ink-soft" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4 text-ink-soft" aria-hidden />
                        )}
                        {group.label}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-8 items-center pl-6 text-sm font-medium text-ink">
                        {group.label}
                      </span>
                    )}
                    {group.accountsSum !== null ? (
                      <span className="block pl-6 text-xs text-attention">as contas somam {reais(group.accountsSum)}</span>
                    ) : null}
                  </td>
                  <FigureCells line={group} />
                  <td className="px-2 py-2">
                    <Sparkline
                      label={group.label}
                      budgeted={group.budgeted}
                      realized={group.realized}
                      todayIndex={view.todayIndex}
                    />
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar orçamento de ${group.label}`}
                        title={`Editar orçamento de ${group.label}`}
                        onClick={() => onEdit(group.category)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    ) : null}
                  </td>
                </tr>
                {isOpen
                  ? group.accounts.map((account) => (
                      <tr key={account.key} className="border-t border-hairline bg-surface/60">
                        <td className="py-2.5 pr-2 pl-4">
                          <span className="block pl-6 text-sm text-ink">{account.label}</span>
                        </td>
                        <FigureCells line={account} variant="account" />
                        <td />
                        <td />
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
          <tr className="border-t border-hairline bg-surface">
            <th scope="row" className="py-2.5 pr-2 pl-4 text-left text-sm font-semibold text-ink">
              Total
            </th>
            <FigureCells line={{ ...view.totals, hasBudget: true }} variant="total" />
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">
        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map(([tone, label]) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("h-1.5 w-2.5 rounded-full", TONE_BAR[tone])} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <svg width="16" height="8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" strokeWidth="1.25" className="stroke-ink opacity-70" />
          </svg>
          orçado do mês
          <span aria-hidden className="ml-2 h-2.5 w-[7px] rounded-[1px] bg-brand opacity-55" />
          realizado · {first} a {last}
        </div>
      </div>
    </SectionCard>
  );
}

/** Orçado, Realizado, % usado and Previsto of one row; the previsto turns overdue above the orçado. */
function FigureCells({ line, variant = "group" }: { line: Figures; variant?: "group" | "account" | "total" }) {
  const number = cn(
    "font-mono tabular-nums text-ink",
    variant === "account" ? "text-[13px]" : "text-sm",
    variant === "total" && "font-medium"
  );
  const over = line.hasBudget && line.forecast > line.budgetedTotal;
  return (
    <>
      <td className="px-2 py-2.5 text-right">
        <span className={cn(number, variant === "account" && "text-ink-soft")}>
          {line.hasBudget ? formatNumber(line.budgetedTotal) : "—"}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right">
        <span className={number}>{formatNumber(line.realizedToDate)}</span>
      </td>
      <td className="px-2 py-2.5">
        {line.usedPct === null ? (
          <span className="text-xs text-ink-soft">{line.hasBudget ? "nada orçado até hoje" : "sem orçamento"}</span>
        ) : (
          <span className="flex items-center gap-2.5">
            <BudgetMeter pct={line.usedPct} tone={line.tone} className="w-24 shrink-0" />
            <span className={cn("min-w-11 font-mono text-[13px] font-medium", TONE_TEXT[line.tone])}>
              {usedText(line.usedPct)}
            </span>
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right">
        <span className={cn(number, over && "text-overdue")}>{formatNumber(line.forecast)}</span>
      </td>
    </>
  );
}
```

`components/finance/orcamento/BudgetCards.tsx`
```tsx
"use client";

/**
 * "Por grupo" on the phone: a card per grupo with its % usado, the bar and
 * orçado / realizado / previsto; a card opens to its contas and, for whoever
 * edits the Financeiro, to "Editar orçamento de <grupo>".
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import type { BudgetLine, BudgetTone, BudgetView } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import { BudgetMeter, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PILL: Record<BudgetTone, string> = {
  brand: "bg-healthy-soft text-healthy",
  attention: "bg-attention-soft text-attention",
  overdue: "bg-overdue-soft text-overdue",
  none: "bg-surface text-ink-soft",
};

const WORD: Record<BudgetTone, string> = { brand: "dentro", attention: "no limite", overdue: "acima", none: "" };

interface BudgetCardsProps {
  view: BudgetView;
  canEdit: boolean;
  onEdit(category: ExpenseCategory): void;
  /** "Orçar um grupo". */
  onAdd(): void;
}

export function BudgetCards({ view, canEdit, onEdit, onAdd }: BudgetCardsProps) {
  const [open, setOpen] = useState<ExpenseCategory | null>(null);
  return (
    <section aria-labelledby="budget-cards-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="budget-cards-title" className="font-heading text-base font-semibold text-ink">
          Por grupo
        </h2>
        <p className="text-xs text-ink-soft">valores em R$</p>
      </div>
      <ul className="flex flex-col gap-2">
        {view.groups.map((group) => {
          const isOpen = open === group.category;
          const panel = `budget-card-${group.category}`;
          return (
            <li key={group.key} className="overflow-hidden rounded-lg border border-hairline bg-panel">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : group.category)}
                className="flex min-h-11 w-full flex-col gap-2.5 px-3.5 py-3 text-left"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] leading-[22px] font-medium text-ink">{group.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill line={group} />
                    {isOpen ? (
                      <ChevronDown className="size-4 text-ink-soft" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 text-ink-soft" aria-hidden />
                    )}
                  </span>
                </span>
                {group.usedPct !== null ? <BudgetMeter pct={group.usedPct} tone={group.tone} className="w-full" /> : null}
                <Figures line={group} />
              </button>
              {isOpen ? (
                <div id={panel} className="border-t border-hairline">
                  {group.accounts.length > 0 ? (
                    <ul className="divide-y divide-hairline">
                      {group.accounts.map((account) => (
                        <li key={account.key} className="flex flex-col gap-2 px-3.5 py-2.5">
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-ink">{account.label}</span>
                            <Pill line={account} />
                          </span>
                          <Figures line={account} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3.5 py-2.5 text-xs text-ink-soft">
                      Nenhuma conta do grupo tem orçamento ou despesa nesta safra.
                    </p>
                  )}
                  {canEdit ? (
                    <div className="border-t border-hairline p-1.5">
                      <Button variant="ghost" className="min-h-11 w-full" onClick={() => onEdit(group.category)}>
                        <Pencil aria-hidden />
                        Editar orçamento de {group.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <Button variant="outline" className="min-h-11" onClick={onAdd}>
          <Plus aria-hidden />
          Orçar um grupo
        </Button>
      ) : null}
    </section>
  );
}

/** "108 % · acima", "sem orçamento". */
function Pill({ line }: { line: BudgetLine }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", PILL[line.tone])}>
      {line.usedPct === null
        ? line.hasBudget
          ? "nada orçado até hoje"
          : "sem orçamento"
        : `${usedText(line.usedPct)} · ${WORD[line.tone]}`}
    </span>
  );
}

function Figures({ line }: { line: BudgetLine }) {
  const over = line.hasBudget && line.forecast > line.budgetedTotal;
  const cells: [string, string, boolean][] = [
    ["Orçado", line.hasBudget ? formatNumber(line.budgetedTotal) : "—", false],
    ["Realizado", formatNumber(line.realizedToDate), false],
    ["Previsto", formatNumber(line.forecast), over],
  ];
  return (
    <span className="grid grid-cols-3 gap-2">
      {cells.map(([label, value, overdue]) => (
        <span key={label} className="min-w-0">
          <span className="block text-[10px] font-medium tracking-wide text-ink-soft uppercase">{label}</span>
          <span className={cn("block font-mono text-[13px] leading-5 whitespace-nowrap", overdue ? "text-overdue" : "text-ink")}>
            {value}
          </span>
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 7: The edit dialog and the copy dialog**

`components/finance/orcamento/BudgetEditDialog.tsx`
```tsx
"use client";

/**
 * "Orçamento · <grupo>" for one safra: the grupo's total, how it spreads over
 * the twelve months (Igual, Como a safra anterior, Manual) and the months
 * themselves, with the check that they add up; under "Contas", the same for
 * each conta of the grupo, each with its own total and distribution. A blank
 * conta has no budget, and clearing one that had removes it. Saving writes
 * only the lines that changed and is refused while a line's months do not add
 * up to its total. A bottom sheet on the phone (months in 3 columns), the
 * centred dialog from sm up (6 columns). From "Orçar um grupo" the grupo is
 * picked here.
 */
import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Trash2 } from "lucide-react";
import type { Budget, BudgetDistribution, ExpenseCategory } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { cents } from "@/lib/domain/bankAccounts";
import {
  budgetView,
  distribute,
  lineKey,
  previousShape,
  safraLabel,
  safraMonths,
  type BudgetInputs,
  type BudgetView,
} from "@/lib/domain/budget";
import { formatCurrency } from "@/lib/domain/format";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { monthYear } from "@/lib/domain/series";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
import {
  checkLine,
  lineFields,
  withDistribution,
  withMonth,
  withTotal,
  type LineCheck,
  type LineFields,
} from "@/components/finance/orcamento/editFields";
import { Button } from "@/components/ui/button";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** A bottom sheet on the phone, the centred dialog from sm up. */
const SHEET = cn(
  BOTTOM_SHEET,
  "max-h-[90dvh] overflow-y-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-[720px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-4"
);

const DISTRIBUTIONS: readonly { value: BudgetDistribution; label: string; short: string }[] = [
  { value: "equal", label: "Igual", short: "Igual" },
  { value: "previous", label: "Como a safra anterior", short: "Anterior" },
  { value: "manual", label: "Manual", short: "Manual" },
];

/** One segment of a conta's distribution switch. */
const segment = (selected: boolean) =>
  cn(
    "flex min-h-11 flex-1 items-center justify-center rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors md:min-h-7",
    selected ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]" : "text-ink-soft hover:text-ink"
  );

interface BudgetEditDialogProps {
  safra: number;
  startMonth: number;
  category: ExpenseCategory;
  /** Opened from "Orçar um grupo": the grupo is picked in the dialog. */
  pickGroup: boolean;
  onCategoryChange(category: ExpenseCategory): void;
  /** This safra's orçamento. */
  view: BudgetView;
  /** The previous safra's budgets, for the hint; undefined while they load. */
  previous: Budget[] | undefined;
  /** This safra's budgets and the farm's lançamentos, treatments and contas. */
  inputs: BudgetInputs;
  /** The page's today: a prop, so the React Compiler keeps the form's memos. */
  today: string;
  onOpenChange(open: boolean): void;
}

export function BudgetEditDialog({
  safra,
  startMonth,
  category,
  pickGroup,
  onCategoryChange,
  view,
  previous,
  inputs,
  today,
  onOpenChange,
}: BudgetEditDialogProps) {
  // While saving the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  const months = safraMonths(safra, startMonth);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className={SHEET}>
        <DialogHeader>
          <DialogTitle className="text-lg leading-6 font-semibold sm:text-xl">
            Orçamento · {EXPENSE_CATEGORY_LABEL[category]}
          </DialogTitle>
          <DialogDescription>
            {safraLabel(safra, startMonth)} · {monthYear(`${months[0].key}-01`)} a {monthYear(`${months[11].key}-01`)}
          </DialogDescription>
        </DialogHeader>
        {pickGroup ? (
          <div className="grid gap-1.5">
            <Label htmlFor="budget-group">Grupo</Label>
            <Select
              value={category}
              onValueChange={(next) => onCategoryChange(next as ExpenseCategory)}
              disabled={busy}
            >
              <SelectTrigger id="budget-group" className="min-h-11 w-full sm:w-60 md:min-h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {EXPENSE_CATEGORY_LABEL[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {/* A new grupo starts a new form. */}
        <EditForm
          key={category}
          safra={safra}
          startMonth={startMonth}
          category={category}
          view={view}
          previous={previous}
          inputs={inputs}
          today={today}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** One line the form writes: the grupo's own (no accountId) or a conta's. */
interface Line {
  accountId?: string;
  label: string;
  /** It had rows of its own when the dialog opened. */
  had: boolean;
  start: LineFields;
}

interface EditFormProps
  extends Pick<BudgetEditDialogProps, "safra" | "startMonth" | "category" | "view" | "previous" | "inputs" | "today"> {
  onBusyChange(busy: boolean): void;
  onDone(): void;
}

function EditForm({ safra, startMonth, category, view, previous, inputs, today, onBusyChange, onDone }: EditFormProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const saveBudgetLine = useHerdStore((s) => s.saveBudgetLine);
  const removeBudgetLine = useHerdStore((s) => s.removeBudgetLine);
  const { addToast } = useToast();
  const label = EXPENSE_CATEGORY_LABEL[category];
  const labels = safraMonths(safra, startMonth).map((month) => month.label);
  const group = view.groups.find((line) => line.category === category);
  const lineOf = (accountId: string) => group?.accounts.find((line) => line.accountId === accountId);
  // The grupo's contas, and an archived one that still holds a budget in this safra.
  const contas = accountsByGroup(accounts, true)[category].filter(
    (account) => account.archivedAt === undefined || lineOf(account.id)?.ownRows
  );

  const [lines] = useState<Line[]>(() => [
    { label, had: group?.ownRows === true, start: lineFields(group) },
    ...contas.map((account) => ({
      accountId: account.id,
      label: account.name,
      had: lineOf(account.id)?.ownRows === true,
      start: lineFields(lineOf(account.id)),
    })),
  ]);
  // By accountId; "" is the grupo's own line.
  const [fields, setFields] = useState<Record<string, LineFields>>(() =>
    Object.fromEntries(lines.map((line) => [line.accountId ?? "", line.start]))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };

  const fieldsOf = (accountId = "") => fields[accountId] ?? lineFields();
  const change = (accountId: string, next: (current: LineFields) => LineFields) => {
    setError(null);
    setFields((all) => ({ ...all, [accountId]: next(all[accountId] ?? lineFields()) }));
  };
  /** "Como a safra anterior": the previous safra's realizado of the line, by month. */
  const shapeOf = (accountId: string) => previousShape(inputs, lineKey(category, accountId), safra, startMonth, today);
  const groupShape = useMemo(
    () => previousShape(inputs, lineKey(category), safra, startMonth, today),
    [inputs, category, safra, startMonth, today]
  );
  const previousView = useMemo(
    () => budgetView({ ...inputs, budgets: previous ?? [] }, safra - 1, startMonth, today),
    [inputs, previous, safra, startMonth, today]
  );

  const own = fieldsOf();
  const total = parseAmount(own.total);
  const previousShort = safraLabel(safra - 1, startMonth).replace("Safra ", "");
  const preview: Record<BudgetDistribution, string> = {
    equal:
      Number.isFinite(total) && total >= 0
        ? `${formatCurrency(distribute(total, "equal")[0])} por mês`
        : "o total dividido por 12",
    previous: groupShape.every((value) => value === 0)
      ? `sem gasto em ${previousShort}: fica igual`
      : `segue o gasto de ${previousShort}`,
    manual: "você digita cada mês",
  };
  const before = previousView.groups.find((line) => line.category === category);
  const typedContas = contas
    .map((account) => ({ name: account.name, total: parseAmount(fieldsOf(account.id).total) }))
    .filter((conta) => Number.isFinite(conta.total) && conta.total > 0);
  const hint =
    `${safraLabel(safra - 1, startMonth)}: ` +
    (previous === undefined ? "" : before?.hasBudget ? `orçado ${reais(before.budgetedTotal)} · ` : "sem orçamento · ") +
    `realizado ${reais(before?.realizedToDate ?? 0)}.` +
    (typedContas.length > 0
      ? ` As contas do grupo (${typedContas.map((conta) => conta.name).join(", ")}) somam ${reais(
          cents(typedContas.reduce((sum, conta) => sum + conta.total, 0))
        )}.`
      : "");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const writes: { line: Line; check: LineCheck }[] = [];
    for (const line of lines) {
      const current = fieldsOf(line.accountId);
      if (JSON.stringify(current) === JSON.stringify(line.start)) continue;
      const check = checkLine(current, labels);
      if (check.state === "invalid" || check.state === "off") {
        setError(`${line.label} · ${check.state === "off" ? "A soma dos meses não confere com o total." : check.message}`);
        return;
      }
      writes.push({ line, check });
    }
    setError(null);
    if (writes.length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      for (const { line, check } of writes) {
        const key = { safra, category, accountId: line.accountId };
        if (check.state === "ok") {
          await saveBudgetLine({ ...key, months: check.months, distribution: fieldsOf(line.accountId).distribution });
        } else if (line.had) {
          // A line cleared to blank had a budget: it goes.
          await removeBudgetLine(key);
        }
      }
    } catch {
      setSaving(false); // the store already toasted
      return;
    }
    setSaving(false);
    addToast({ messageType: "success", text: `Orçamento de ${label} salvo` });
    onDone();
  }

  /** The grupo's own line only: its contas keep theirs. */
  async function onRemove() {
    setSaving(true);
    try {
      await removeBudgetLine({ safra, category });
    } catch {
      setSaving(false); // the store already toasted
      return;
    }
    setSaving(false);
    addToast({ messageType: "success", text: `Orçamento de ${label} removido` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="budget-total">Total do grupo (R$)</Label>
          <Input
            id="budget-total"
            inputMode="decimal"
            placeholder="0,00"
            value={own.total}
            onChange={(e) => change("", (current) => withTotal(current, e.target.value, groupShape))}
            className="h-11 font-mono text-lg md:text-lg"
          />
        </div>
        <p className="text-[13px] leading-[18px] text-ink-soft sm:pb-1">{hint}</p>
      </div>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">Distribuir por mês</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DISTRIBUTIONS.map(({ value, label: name }) => {
            const on = own.distribution === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5",
                  on ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--color-brand)]" : "border-hairline"
                )}
              >
                <input
                  type="radio"
                  name="budget-distribution"
                  value={value}
                  checked={on}
                  onChange={() => change("", (current) => withDistribution(current, value, groupShape))}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{name}</span>
                  <span className="block text-xs text-ink-soft">{preview[value]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-ink">Meses da safra</p>
          <p className="text-xs text-ink-soft">mudar um mês passa a distribuição para Manual</p>
        </div>
        <MonthsGrid
          id="budget-month"
          labels={labels}
          fields={own}
          onMonth={(index, text) => change("", (current) => withMonth(current, index, text))}
        />
      </div>

      <CheckLine check={checkLine(own, labels)} blank="Sem total, o orçado do grupo é a soma das contas." />

      <details className="group rounded-lg border border-hairline">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 md:min-h-10 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-medium text-ink">
            Contas <span className="font-normal text-ink-soft">· opcional, cada conta com seu total</span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-hairline p-3">
          {contas.length === 0 ? (
            <p className="text-xs text-ink-soft">O grupo não tem contas no plano de contas.</p>
          ) : (
            contas.map((account) => {
              const conta = fieldsOf(account.id);
              return (
                <div key={account.id} className="grid gap-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_15rem]">
                    <Label htmlFor={`budget-conta-${account.id}`} className="block truncate font-normal">
                      {account.name}
                    </Label>
                    <Input
                      id={`budget-conta-${account.id}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={conta.total}
                      onChange={(e) =>
                        change(account.id, (current) => withTotal(current, e.target.value, shapeOf(account.id)))
                      }
                      className="min-h-11 text-right font-mono md:min-h-8"
                    />
                    <div
                      role="radiogroup"
                      aria-label={`Distribuição de ${account.name}`}
                      className="col-span-2 flex gap-0.5 rounded-lg border border-hairline bg-surface p-0.5 sm:col-span-1"
                    >
                      {DISTRIBUTIONS.map(({ value, short }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={conta.distribution === value}
                          onClick={() =>
                            change(account.id, (current) => withDistribution(current, value, shapeOf(account.id)))
                          }
                          className={segment(conta.distribution === value)}
                        >
                          {short}
                        </button>
                      ))}
                    </div>
                  </div>
                  {conta.distribution === "manual" ? (
                    <>
                      <MonthsGrid
                        id={`budget-conta-${account.id}-month`}
                        name={account.name}
                        labels={labels}
                        fields={conta}
                        onMonth={(index, text) => change(account.id, (current) => withMonth(current, index, text))}
                      />
                      <CheckLine check={checkLine(conta, labels)} blank="Sem orçamento para a conta." />
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </details>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        {lines[0].had ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-overdue hover:text-overdue sm:mr-auto md:min-h-8"
            disabled={saving}
            onClick={() => void onRemove()}
          >
            <Trash2 aria-hidden />
            Remover orçamento do grupo
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11 md:min-h-8" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11 md:min-h-8" disabled={saving}>
          Salvar orçamento
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Meses da safra": twelve inputs labelled "out/25"… with a little bar each; 3 columns on the phone, 6 from sm up. */
function MonthsGrid({
  id,
  name,
  labels,
  fields,
  onMonth,
}: {
  id: string;
  /** A conta's months carry its name in their accessible name. */
  name?: string;
  labels: string[];
  fields: LineFields;
  onMonth(index: number, text: string): void;
}) {
  const values = fields.months.map((text) => {
    const value = parseAmount(text);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const max = Math.max(...values);
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 sm:grid-cols-6">
      {labels.map((label, i) => (
        <div key={label} className="grid min-w-0 gap-1.5">
          <label htmlFor={`${id}-${i}`} className="text-xs font-medium text-ink-soft">
            {label}
          </label>
          <Input
            id={`${id}-${i}`}
            aria-label={name ? `${name}, ${label}` : undefined}
            inputMode="decimal"
            placeholder="0,00"
            value={fields.months[i]}
            onChange={(e) => onMonth(i, e.target.value)}
            className="min-h-11 px-2 text-right font-mono text-[13px] md:h-9 md:min-h-9 md:text-[13px]"
          />
          <span aria-hidden className="h-[3px] overflow-hidden rounded-full bg-surface">
            <span className="block h-full bg-brand opacity-60" style={{ width: `${max > 0 ? (values[i] / max) * 100 : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Soma dos meses confere com o total", or how far off the months are. */
function CheckLine({ check, blank }: { check: LineCheck; blank: string }) {
  return (
    <div aria-live="polite">
      {check.state === "blank" ? (
        <p className="text-xs text-ink-soft">{blank}</p>
      ) : check.state === "ok" ? (
        <p className="flex items-center justify-between gap-3 rounded-lg bg-healthy-soft px-3 py-2.5 text-sm text-healthy">
          <span className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Soma dos meses confere com o total
          </span>
          <span className="font-mono font-medium">{formatCurrency(check.total)}</span>
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-overdue-soft px-3 py-2.5 text-sm text-overdue">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {check.state === "invalid"
            ? check.message
            : check.sum > check.total
              ? `Os meses somam ${formatCurrency(check.sum)} · passam ${formatCurrency(check.sum - check.total)} do total`
              : `Os meses somam ${formatCurrency(check.sum)} · faltam ${formatCurrency(check.total - check.sum)} para o total`}
        </p>
      )}
    </div>
  );
}
```

`components/finance/orcamento/CopyDialog.tsx`
```tsx
"use client";

/**
 * "Copiar da safra anterior": the previous safra's orçado or realizado, with
 * an ajuste in % (−50 to +100, each month rounded to the centavo), becomes
 * this safra's orçado on every line, grupo or conta, that has none yet; the
 * realizado gives grupo lines only. The preview counts the lines and shows the
 * safra's orçado after copying.
 */
import { useMemo, useState, type FormEvent } from "react";
import type { Budget } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { budgetView, copyPlan, safraLabel, safraMonths, type BudgetInputs } from "@/lib/domain/budget";
import { todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { useToast } from "@/components/providers/Toasts";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
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
import { cn } from "@/lib/utils";

type Source = "budgeted" | "realized";

const SOURCES: readonly { value: Source; label: string }[] = [
  { value: "budgeted", label: "Orçado" },
  { value: "realized", label: "Realizado" },
];

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

interface CopyDialogProps {
  /** The safra copied into; the source is the one before it. */
  safra: number;
  startMonth: number;
  /** This safra's budgets and the farm's lançamentos, treatments and contas. */
  inputs: BudgetInputs;
  /** The previous safra's budgets; undefined while they load. */
  source: Budget[] | undefined;
  onOpenChange(open: boolean): void;
}

export function CopyDialog({ safra, startMonth, inputs, source, onOpenChange }: CopyDialogProps) {
  const copyBudgets = useHerdStore((s) => s.copyBudgets);
  const { addToast } = useToast();
  const [from, setFrom] = useState<Source>("budgeted");
  const [adjust, setAdjust] = useState("0");
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const previous = safraLabel(safra - 1, startMonth).replace("Safra", "safra");
  const pct = Number(adjust.replace(",", "."));
  const pctOk = adjust.trim() !== "" && Number.isFinite(pct) && pct >= -50 && pct <= 100;

  // What Copiar would write and the safra's orçado with it; null while the source loads.
  const preview = useMemo(() => {
    if (!pctOk || (from === "budgeted" && source === undefined)) return null;
    const plan = copyPlan(
      { ...inputs, budgets: [...(source ?? []), ...inputs.budgets] },
      safra - 1,
      safra,
      from,
      pct,
      startMonth,
      today
    );
    const months = safraMonths(safra, startMonth);
    // CopyLine.months follow the safra's months: each becomes the row of its calendar month.
    const planned: Budget[] = plan.lines.flatMap((line, l) =>
      line.months.map((amountBrl, i) => ({
        id: `copy-${l}-${i}`,
        category: line.category,
        accountId: line.accountId ?? undefined,
        month: `${months[i].key}-01`,
        amountBrl,
        distribution: "manual" as const,
      }))
    );
    const after = budgetView({ ...inputs, budgets: [...inputs.budgets, ...planned] }, safra, startMonth, today).totals
      .budgetedTotal;
    return { lines: plan.lines.length, skipped: plan.skipped, after };
  }, [pctOk, from, source, inputs, safra, pct, startMonth, today]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || preview.lines === 0) return;
    setBusy(true);
    let result: { copied: number; skipped: number };
    try {
      result = await copyBudgets({ from: safra - 1, to: safra, source: from, adjustPct: pct });
    } catch {
      setBusy(false); // the store already toasted
      return;
    }
    addToast({
      messageType: "success",
      text: `${count(result.copied, "linha copiada", "linhas copiadas")} · ${count(
        result.skipped,
        "já tinha orçamento",
        "já tinham orçamento"
      )}`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar da safra anterior</DialogTitle>
          <DialogDescription>
            Para a {safraLabel(safra, startMonth).replace("Safra", "safra")}: só as linhas que ainda não têm orçamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <span id="copy-source" className="text-sm leading-none font-medium">
              Copiar da {previous}
            </span>
            <div
              role="radiogroup"
              aria-labelledby="copy-source"
              className="flex gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
            >
              {SOURCES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={from === value}
                  onClick={() => setFrom(value)}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors md:min-h-8",
                    from === value
                      ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {from === "realized" ? (
              <p className="text-xs text-ink-soft">
                O realizado de cada grupo vira o orçado do mês; as contas ficam sem orçamento.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="copy-adjust">Ajuste (%)</Label>
            <Input
              id="copy-adjust"
              type="number"
              inputMode="decimal"
              min={-50}
              max={100}
              step={1}
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              className="min-h-11 w-32 font-mono md:min-h-8"
            />
            <p className={cn("text-xs", pctOk ? "text-ink-soft" : "text-overdue")}>
              {pctOk ? "de −50 a +100 %, em cada mês, arredondado ao centavo" : "Informe um ajuste de −50 a +100 %."}
            </p>
          </div>
          <div aria-live="polite" className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-sm">
            {preview === null ? (
              <p className="text-ink-soft">{pctOk ? `Carregando o orçamento da ${previous}…` : "—"}</p>
            ) : preview.lines === 0 ? (
              <p className="text-ink-soft">
                {preview.skipped > 0
                  ? "Todas as linhas já têm orçamento nesta safra."
                  : from === "budgeted"
                    ? `A ${previous} não tem orçamento.`
                    : `A ${previous} não tem despesas.`}
              </p>
            ) : (
              <>
                <p className="text-ink">
                  {count(preview.lines, "linha nova", "linhas novas")}
                  {preview.skipped > 0 ? ` · ${count(preview.skipped, "já tem orçamento", "já têm orçamento")}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  orçado da safra depois de copiar{" "}
                  <span className="font-mono text-sm font-medium text-ink">{reais(preview.after)}</span>
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-8" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="min-h-11 md:min-h-8"
              disabled={busy || preview === null || preview.lines === 0}
            >
              Copiar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: The page**

`components/finance/orcamento/OrcamentoPage.tsx`
```tsx
"use client";

/**
 * /finance/orcamento: what the farm planned to spend in each grupo of the
 * plano de contas over the safra in ?safra= (absent = the one holding today,
 * from the farm's "Início da safra"), how much of it is used and where the
 * safra is heading. The safra's budgets load on demand, and the previous
 * safra's with them for the edit dialog's hint and the copy. A table on md+,
 * cards on the phone. The window (?de&ate) only rides along for the
 * sub-navigation.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Plus, Target } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { EXPENSE_GROUPS } from "@/lib/domain/accounts";
import { budgetView, safraLabel, safraOf, safraRange, type BudgetInputs, type BudgetView } from "@/lib/domain/budget";
import { MONTH_ABBREV, formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch } from "@/lib/domain/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { BudgetCards } from "@/components/finance/orcamento/BudgetCards";
import { BudgetEditDialog } from "@/components/finance/orcamento/BudgetEditDialog";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
import { BudgetTable } from "@/components/finance/orcamento/BudgetTable";
import { CopyDialog } from "@/components/finance/orcamento/CopyDialog";
import { SafraPicker } from "@/components/finance/orcamento/SafraPicker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/** "?safra=2025": a calendar year, else null. */
function safraParam(value: string | null): number | null {
  return value !== null && /^\d{4}$/.test(value) ? Number(value) : null;
}

export function OrcamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  // An offline snapshot from before the orçamento has no início da safra.
  const startMonth = useHerdStore((s) => s.farm.safraStartMonth ?? 10);
  const expenses = useHerdStore((s) => s.expenses);
  const treatments = useHerdStore((s) => s.treatments);
  const accounts = useHerdStore((s) => s.accounts);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const current = safraOf(today, startMonth);
  const safra = safraParam(searchParams.get("safra")) ?? current;
  const budgets = useHerdStore((s) => s.budgets[safra]);
  const previousBudgets = useHerdStore((s) => s.budgets[safra - 1]);
  const setSafra = (next: number) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("safra", String(next));
    router.replace(`/finance/orcamento?${query}`, { scroll: false });
  };

  const [failed, setFailed] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ category: ExpenseCategory; pick: boolean } | null>(null);
  const [copying, setCopying] = useState(false);

  // Loaded whenever absent: the store empties the cache on a farm switch and on a new início da safra.
  const missing = budgets === undefined;
  const previousMissing = previousBudgets === undefined;
  useEffect(() => {
    if (!missing) return;
    let live = true;
    // The store toasts a failed load; the page then says so instead of waiting forever.
    loadBudgets(safra).catch(() => {
      if (live) setFailed(safra);
    });
    return () => {
      live = false;
    };
  }, [missing, safra, loadBudgets]);
  useEffect(() => {
    // The previous safra only feeds the edit dialog's hint and the copy.
    if (previousMissing) loadBudgets(safra - 1).catch(() => {});
  }, [previousMissing, safra, loadBudgets]);

  const inputs = useMemo<BudgetInputs>(
    () => ({ budgets: budgets ?? [], expenses, treatments, accounts }),
    [budgets, expenses, treatments, accounts]
  );
  const view = useMemo(
    () => (budgets ? budgetView(inputs, safra, startMonth, today) : null),
    [budgets, inputs, safra, startMonth, today]
  );
  const range = safraRange(safra, startMonth);
  const budgeted = view?.groups.some((group) => group.hasBudget) ?? false;
  /** "Orçar um grupo": the first grupo without an orçado, Nutrição on an empty safra. */
  const orcar = () =>
    setEditing({
      category:
        EXPENSE_GROUPS.find((category) => !view?.groups.some((g) => g.category === category && g.hasBudget)) ??
        "nutrition",
      pick: true,
    });
  const onEdit = (category: ExpenseCategory) => setEditing({ category, pick: false });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <PageHeader
        title={`Orçamento · ${safraLabel(safra, startMonth).replace("Safra", "safra")}`}
        subtitle={`${formatDate(range.start)} a ${formatDate(range.end)} · COE por grupo do plano de contas`}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            <SafraPicker value={safra} current={current} startMonth={startMonth} onChange={setSafra} />
            {canEdit ? (
              <Button
                variant="outline"
                className="min-h-11 md:min-h-8"
                aria-label="Copiar da safra anterior"
                disabled={view === null}
                onClick={() => setCopying(true)}
              >
                <Copy aria-hidden />
                <span className="md:hidden">Copiar</span>
                <span className="hidden md:inline">Copiar da safra anterior</span>
              </Button>
            ) : null}
          </>
        }
      />
      <FinanceSubnav current="orcamento" period={period} />

      {view === null ? (
        <p className="py-10 text-center text-sm text-ink-soft">
          {failed === safra ? "Não foi possível carregar o orçamento desta safra." : "Carregando o orçamento…"}
        </p>
      ) : !budgeted ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={Target}
            title="Nenhum orçamento para esta safra"
            description={
              canEdit
                ? "Copie o orçado ou o realizado da safra anterior, ou orce um grupo do plano de contas mês a mês."
                : "Quem edita o Financeiro define aqui quanto cada grupo pode gastar na safra."
            }
            className="pb-4"
          />
          {canEdit ? (
            <div className="flex flex-wrap justify-center gap-2 px-4">
              <Button variant="outline" className="min-h-11 md:min-h-8" onClick={() => setCopying(true)}>
                <Copy aria-hidden />
                Copiar da safra anterior
              </Button>
              <Button className="min-h-11 md:min-h-8" onClick={orcar}>
                <Plus aria-hidden />
                Orçar um grupo
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <BudgetStrip view={view} today={today} end={range.end} />
          <div className="hidden md:block">
            <BudgetTable view={view} canEdit={canEdit} onEdit={onEdit} onAdd={orcar} />
          </div>
          <div className="md:hidden">
            <BudgetCards view={view} canEdit={canEdit} onEdit={onEdit} onAdd={orcar} />
          </div>
        </>
      )}

      {editing && view ? (
        <BudgetEditDialog
          safra={safra}
          startMonth={startMonth}
          category={editing.category}
          pickGroup={editing.pick}
          onCategoryChange={(category) => setEditing({ category, pick: true })}
          view={view}
          previous={previousBudgets}
          inputs={inputs}
          today={today}
          onOpenChange={() => setEditing(null)}
        />
      ) : null}
      {copying && view ? (
        <CopyDialog
          safra={safra}
          startMonth={startMonth}
          inputs={inputs}
          source={previousBudgets}
          onOpenChange={() => setCopying(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Orçado (whole safra), Realizado up to today's month, Variação against the
 * orçado to date and Previsto até o fim. The phone keeps three cells in two
 * columns and folds the previsto into the Variação's line.
 */
function BudgetStrip({ view, today, end }: { view: BudgetView; today: string; end: string }) {
  const t = view.totals;
  const at = view.todayIndex;
  const grupos = view.groups.filter((group) => group.hasBudget).length;
  const toDate = t.budgetedToDate > 0;
  const diff = t.realizedToDate - t.budgetedToDate;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-4">
      <Cell
        label="Orçado"
        value={reais(t.budgetedTotal)}
        sub={
          <>
            <span className="hidden md:inline">
              {grupos} {grupos === 1 ? "grupo" : "grupos"} ·{" "}
            </span>
            safra inteira
          </>
        }
      />
      <Cell
        label={at < 0 ? "Realizado" : `Realizado até ${MONTH_ABBREV[view.months[Math.min(at, 11)].month - 1]}`}
        value={reais(t.realizedToDate)}
        sub={
          at < 0 ? (
            "a safra ainda não começou"
          ) : at > 11 ? (
            "safra encerrada"
          ) : (
            <>
              <span className="hidden md:inline">pago e a pagar </span>até {formatDate(today).slice(0, 5)}
            </>
          )
        }
      />
      <Cell
        label="Variação"
        value={toDate ? `${sign}${formatNumber((Math.abs(diff) / t.budgetedToDate) * 100, 1)} %` : "—"}
        ink={toDate && diff > 0 ? "text-overdue" : "text-ink"}
        sub={
          <>
            {!toDate
              ? "nada orçado até hoje"
              : diff === 0
                ? "igual ao orçado"
                : `${reais(Math.abs(diff))} ${diff > 0 ? "acima" : "abaixo"} do orçado`}
            <span className="md:hidden"> · previsto {reais(t.forecast)}</span>
          </>
        }
        className="col-span-2 md:col-span-1"
      />
      <Cell
        label="Previsto até o fim"
        value={reais(t.forecast)}
        sub={`com pendentes e recorrências até ${formatDate(end).slice(0, 5)}`}
        className="hidden md:block"
      />
    </dl>
  );
}

function Cell({
  label,
  value,
  sub,
  ink = "text-ink",
  className,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  ink?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-panel px-4 py-3.5", className)}>
      <dt className="truncate text-[11px] font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-lg font-medium tabular-nums", ink)}>{value}</dd>
      {/* The sub wraps on the phone instead of being cut. */}
      <dd className="mt-0.5 text-[11px] leading-4 text-ink-soft">{sub}</dd>
    </div>
  );
}
```

`app/(app)/finance/orcamento/page.tsx`
```tsx
"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { OrcamentoPage } from "@/components/finance/orcamento/OrcamentoPage";

// The safra and the window the sub-navigation carries live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function OrcamentoRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <OrcamentoPage />
      </Suspense>
    </RequireAccess>
  );
}
```

- [ ] **Step 9: Types, lint, tests**

Run: `pnpm exec tsc --noEmit`
Expected: clean once tasks 1–4 are in. Task 6 runs in parallel and imports `@/components/finance/orcamento/BudgetMeter` from this task: nothing of task 6 breaks this task's files.

Run: `pnpm exec eslint 'app/(app)/finance/orcamento/page.tsx' components/finance/orcamento components/finance/FinanceSubnav.tsx components/finance/__tests__/editFields.test.ts`
Expected: clean.

Run: `pnpm exec vitest run components/finance/__tests__/editFields.test.ts`
Expected: PASS.

Notes for the implementer:
- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` first (AGENTS.md): the page follows `/finance/lancamentos` — a client page, `useSearchParams` inside a `Suspense` boundary, the query read in the client.
- `previousShape` is called with the safra being edited; task 2 reads `safra − 1` from it.
- `copyPlan` and `budgetView` pick a safra's rows by month key, so the copy preview passes both safras' rows (`source` + this safra's) and the hint's `budgetView` gets the previous safra's.
- The desktop table and the phone cards are both in the DOM (one hidden by CSS), so "Orçar um grupo" and "Editar orçamento de <grupo>" exist twice; that is how the Lançamentos and Contas pages do it.


### Task 6: Painel band and farm setting

**Files:**
- Create: `components/finance/BudgetBand.tsx`
- Modify: `app/(app)/finance/page.tsx`
- Modify: `components/settings/FarmDataForm.tsx`

**Interfaces:**
- Consumes:
  - Task 1 (`lib/types.ts`): `FarmData.safraStartMonth: number` (1–12; the store's initial `farm` carries 10; an offline snapshot from before this change has none, read it `?? 10`). Task 1 already added `safraStartMonth: farm.safraStartMonth` to this form's initial state; the whole-file replacement below keeps it.
  - Task 2 (`lib/domain/budget.ts`): `safraOf(dateIso, startMonth): number`, `safraLabel(safra, startMonth): string`, `budgetView(inputs, safra, startMonth, todayIso): BudgetView` (`totals.usedPct`, `totals.tone`, `groups[].hasBudget`, `over: { label; usedPct }[]`, `safra`, `startMonth`).
  - Task 4 (`lib/store/useHerdStore.ts`): `budgets: Record<number, Budget[]>` (emptied by a farm switch and by a new início da safra: a page calls `loadBudgets(safra)` whenever `budgets[safra]` is undefined), `loadBudgets(safra): Promise<Budget[]>`, `saveFarm(d: Omit<FarmData, "headquarters">)` sending `safraStartMonth` (and emptying `budgets` when it changes).
  - Task 5 (`components/finance/orcamento/BudgetMeter.tsx`): `BudgetMeter({ pct, tone, className })`, `TONE_TEXT`, `usedText(pct)`; the route `/finance/orcamento?safra=`.
- Produces:
  - `BudgetBand({ view, period }: { view: BudgetView | null; period: Period })` — null while there is no view or no grupo has an orçado. `section[aria-label="Orçamento da safra"]` with "Orçamento · safra 2025/26 · 58 % usado", a `role="meter"`, the list "Grupos acima do orçado" ("Administrativo 134 %") and the link "Ver orçamento" → `/finance/orcamento?safra=<safra>&de=…&ate=…`.
  - Configurações › Dados da fazenda: combobox "Início da safra" (month names, lowercase), the line "A safra vai de outubro a setembro." and, when the month changes while the current safra has budgets, the warning (`role="status"`) "Os orçamentos guardam seus meses do calendário: mudar o início da safra redistribui-os entre as safras." The form loads the current safra's budgets itself (`loadBudgets` when `budgets[safra]` is absent) for a user with Financeiro view, so a direct visit to /settings warns too; without Financeiro view it loads nothing and never warns.

UI task: no component test. The band and the form take no logic worth extracting (the figures come from `budgetView`).

- [ ] **Step 1: The band**

`components/finance/BudgetBand.tsx`
```tsx
import Link from "next/link";
import { safraLabel, type BudgetView } from "@/lib/domain/budget";
import { periodSearch, type Period } from "@/lib/domain/period";
import { BudgetMeter, TONE_TEXT, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { cn } from "@/lib/utils";

/**
 * "Orçamento" on the Painel, under "Capital, dívidas e sócios": how much of
 * the current safra's orçado to date is used, the grupos already above it
 * (three at most, worst first) and the way to the page. Nothing while the
 * safra has no orçado. It follows the safra, not the window.
 */
export function BudgetBand({ view, period }: { view: BudgetView | null; period: Period }) {
  if (!view || !view.groups.some((group) => group.hasBudget)) return null;
  const { usedPct, tone } = view.totals;
  return (
    <section
      aria-label="Orçamento da safra"
      className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-panel px-4 py-3 md:flex-row md:items-center md:gap-4"
    >
      <p className="text-sm text-ink md:shrink-0">
        <span className="font-medium">Orçamento</span> · {safraLabel(view.safra, view.startMonth).replace("Safra", "safra")} ·{" "}
        {usedPct === null ? (
          <span className="text-ink-soft">nada orçado até hoje</span>
        ) : (
          <>
            <span className={cn("font-mono font-medium", TONE_TEXT[tone])}>{usedText(usedPct)}</span> usado
          </>
        )}
      </p>
      {usedPct !== null ? <BudgetMeter pct={usedPct} tone={tone} className="w-full md:max-w-60 md:flex-1" /> : null}
      {view.over.length > 0 ? (
        <ul aria-label="Grupos acima do orçado" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
          {view.over.map((group) => (
            <li key={group.label}>
              {group.label} <span className="font-mono font-medium text-overdue">{usedText(group.usedPct)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={`/finance/orcamento?safra=${view.safra}&${periodSearch(period)}`}
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-brand hover:underline md:ml-auto md:min-h-0 md:self-auto"
      >
        Ver orçamento
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: The Painel loads the current safra and shows the band**

`app/(app)/finance/page.tsx` — seven **Replace** blocks (each anchor appears once in the file).

Find:
```tsx
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * capital, dívidas e sócios, the eight indicators against their references and
 * the year before, receita × custo, mercado, composição, contas, custo por
 * lote and the newest lançamentos. Every figure follows the window.
```
Replace with:
```tsx
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * capital, dívidas e sócios, the current safra's orçamento, the eight
 * indicators against their references and the year before, receita × custo,
 * mercado, composição, contas, custo por lote and the newest lançamentos.
 * Every figure follows the window but the orçamento, which follows the safra.
```

Find:
```tsx
import { Suspense, useMemo } from "react";
```
Replace with:
```tsx
import { Suspense, useEffect, useMemo } from "react";
```

Find:
```tsx
import { capitalSummary } from "@/lib/domain/planTree";
```
Replace with:
```tsx
import { capitalSummary } from "@/lib/domain/planTree";
import { budgetView, safraOf } from "@/lib/domain/budget";
```

Find:
```tsx
import { CapitalStrip } from "@/components/finance/CapitalStrip";
```
Replace with:
```tsx
import { CapitalStrip } from "@/components/finance/CapitalStrip";
import { BudgetBand } from "@/components/finance/BudgetBand";
```

Find:
```tsx
  const transfers = useHerdStore((s) => s.transfers);
```
Replace with:
```tsx
  const transfers = useHerdStore((s) => s.transfers);
  // An offline snapshot from before the orçamento has no início da safra.
  const safraStartMonth = useHerdStore((s) => s.farm.safraStartMonth ?? 10);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
```

Find:
```tsx
    [inputs, accounts, bankAccounts, transfers, period, today]
  );
```
Replace with:
```tsx
    [inputs, accounts, bankAccounts, transfers, period, today]
  );
  // The band reads the current safra's orçamento, loaded on demand (never every safra with the herd).
  const safra = safraOf(today, safraStartMonth);
  const budgets = useHerdStore((s) => s.budgets[safra]);
  const budgetsMissing = budgets === undefined;
  useEffect(() => {
    // Whenever absent (the store empties the cache on a farm switch and a new início da safra).
    // A failed load leaves the band hidden; the store already said why.
    if (budgetsMissing) loadBudgets(safra).catch(() => {});
  }, [budgetsMissing, safra, loadBudgets]);
  const budget = useMemo(
    () => (budgets ? budgetView({ budgets, expenses, treatments, accounts }, safra, safraStartMonth, today) : null),
    [budgets, expenses, treatments, accounts, safra, safraStartMonth, today]
  );
```

Find:
```tsx
      <CapitalStrip summary={capital} period={period} resultBrl={ind.result} />
```
Replace with:
```tsx
      <CapitalStrip summary={capital} period={period} resultBrl={ind.result} />

      <BudgetBand view={budget} period={period} />
```

- [ ] **Step 3: "Início da safra" in Configurações › Dados da fazenda**

`components/settings/FarmDataForm.tsx` — replace the whole file with:
```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { safraOf } from "@/lib/domain/budget";
import { todayISO } from "@/lib/domain/dates";
import type { FarmData } from "@/lib/types";

/** The registration fields and the safra's first month; the sede is saved from the map, not from here. */
type FarmRegistration = Omit<FarmData, "headquarters">;

interface FarmField {
  key: Exclude<keyof FarmRegistration, "safraStartMonth">;
  label: string;
  mono: boolean;
}

const FIELDS: readonly FarmField[] = [
  { key: "name", label: "Nome", mono: false },
  { key: "municipality", label: "Município", mono: false },
  { key: "stateRegistration", label: "Inscrição estadual", mono: true },
  { key: "manager", label: "Responsável", mono: false },
];

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Edit form for the farm's registration data and "Início da safra". */
export function FarmDataForm() {
  const farm = useHerdStore((s) => s.farm);
  const saveFarm = useHerdStore((s) => s.saveFarm);
  const canEdit = useCan("farm", "edit");
  const { addToast } = useToast();
  // Copied field by field so the payload carries no `headquarters` key.
  const [form, setForm] = useState<FarmRegistration>(() => ({
    name: farm.name,
    municipality: farm.municipality,
    stateRegistration: farm.stateRegistration,
    manager: farm.manager,
    // An offline snapshot from before the orçamento has no início da safra.
    safraStartMonth: farm.safraStartMonth ?? 10,
  }));
  const savedStart = farm.safraStartMonth ?? 10;
  // The warning reads the current safra's budgets, loaded here when absent for
  // whoever sees the Financeiro (ponytail: budgets only in other safras do not
  // warn; ask the server for a count if that matters).
  const canSeeBudgets = useCan("finance", "view");
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
  const currentSafra = safraOf(todayISO(), savedStart);
  const savedBudgets = useHerdStore((s) => s.budgets[currentSafra]);
  const budgetsMissing = savedBudgets === undefined;
  useEffect(() => {
    // A failed load only leaves the warning out; the store already said why.
    if (canSeeBudgets && budgetsMissing) loadBudgets(currentSafra).catch(() => {});
  }, [canSeeBudgets, budgetsMissing, currentSafra, loadBudgets]);

  const start = form.safraStartMonth;
  const startChanged = start !== savedStart;
  const hasChange = startChanged || FIELDS.some(({ key }) => form[key] !== farm[key]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChange) return;
    // Registration fields and the start month only: sending no `headquarters`
    // is what tells the server to leave the map view alone.
    await saveFarm(form);
    addToast({ messageType: "success", text: "Dados da fazenda salvos" });
  }

  return (
    <SectionCard title="Dados da fazenda">
      <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, mono }) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`farm-${key}`}>{label}</Label>
            <Input
              id={`farm-${key}`}
              value={form[key]}
              onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
              readOnly={!canEdit}
              className={mono ? "font-mono" : undefined}
            />
          </div>
        ))}
        <div className="grid content-start gap-1.5">
          <Label htmlFor="farm-safraStartMonth">Início da safra</Label>
          <Select
            value={String(start)}
            onValueChange={(value) => setForm((current) => ({ ...current, safraStartMonth: Number(value) }))}
            disabled={!canEdit}
          >
            <SelectTrigger id="farm-safraStartMonth" className="min-h-11 w-full md:min-h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-soft">
            A safra vai de {MONTH_NAMES[start - 1]} a {MONTH_NAMES[(start + 10) % 12]}.
          </p>
          {startChanged && (savedBudgets?.length ?? 0) > 0 ? (
            <p role="status" className="text-xs text-attention">
              Os orçamentos guardam seus meses do calendário: mudar o início da safra redistribui-os entre as safras.
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!hasChange} className="min-h-11 md:min-h-0">
              Salvar
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean once tasks 1–5 are in. While task 5 (same wave) has not landed, the only expected error is `Cannot find module '@/components/finance/orcamento/BudgetMeter'` in `components/finance/BudgetBand.tsx`; run tsc again after task 5.

Run: `pnpm exec eslint components/finance/BudgetBand.tsx 'app/(app)/finance/page.tsx' components/settings/FarmDataForm.tsx`
Expected: clean.

Notes for the implementer:
- The Painel page is already a client page behind `RequireAccess area="finance" level="view"`, so a member without Financeiro never mounts `FinanceContent` and never asks for budgets.
- The months of the "A safra vai de … a …" line: `(start + 10) % 12` is the index of the month before `start` (outubro → setembro, janeiro → dezembro).
- `Exclude<keyof FarmRegistration, "safraStartMonth">` keeps the four text inputs typed as strings now that `FarmData` carries a number.
- The form asks for the current safra's budgets only behind `useCan("finance", "view")`: a member without Financeiro would get a 403 (and its toast) on Configurações otherwise.


### Task 7: Whole-change review and smoke

**Files:**
- Create (outside the repo, never committed): `~/.cache/meubov-plan-2026-10-02/smoke.mjs`
- Create (outside the repo): `~/.cache/meubov-plan-2026-10-02/shots/*.png`, `~/.cache/meubov-plan-2026-10-02/server.log`
- Repo: nothing. A defect found here is fixed in the file of the task that owns it (contract, "Tasks, waves and files"), then Steps 2 and 5 run again.

**Interfaces:**
- Consumes: everything tasks 1–6 produce; the accessible names listed under "Produces" in tasks 5 and 6.
- Produces: nothing in the repo; a review verdict, the gates' output, the smoke's `N/N checks passed` and the screenshots.

The controller runs this last, after wave 4 is in. Environment pitfalls from earlier smokes on this machine (memory note "MeuBov smoke-test setup"): `127.0.0.1:5433` answers as another project's Postgres, so the smoke uses its own tmpfs container; other sessions may hold ports, so check `docker ps` and `ss -ltnp` first and move to the next free pair (5448/3018…) if 5447/3017 are taken, passing `BASE` and `DB` to the script; `next start` is not blocked by another `next dev` in the directory; Better Auth answers 429 after a handful of sign-ins a minute (the script signs in three times, minutes apart); the server log line `[exact-mirror] TypeBox's TypeCompiler is required to use Union` is old and harmless; kill the server by the pid `ss -ltnp` shows, never `pkill -f` with the command text (it kills the tool's own shell); never pass a quoted `.claude/**` glob (the harness refuses it) — `--exclude '**/worktrees/**'` keeps vitest out of `.claude/worktrees/*`.

- [ ] **Step 1: Whole-change review**

Dispatch one reviewer (a fresh agent, model "opus", read-only) with this brief, verbatim:

````text
Review the uncommitted change in /home/luketa/meubov (branch main) against
docs/superpowers/specs/2026-09-30-financeiro-orcamento-design.md and
~/.cache/meubov-plan-2026-10-02/00-contract.md. The change is `git diff HEAD`
plus the untracked files of `git status --short`. Read the spec first, then
every changed file in full. Do not edit anything. Report each finding as
`path:line — severity (blocker / should-fix / nit) — what is wrong — what the
spec or contract says`, then a one-line verdict. Check:

Scope
[ ] Every changed file is in the contract's task list (or is a compile fix recorded
    in ~/.cache/meubov-plan-2026-10-02/CONTRACT-CHANGES.md); package.json and
    pnpm-lock.yaml are unchanged (no new dependency).
[ ] Out of scope stays out: no orçamento of receitas or of a resultado, none per lote
    or centro de custo, no approval flow, no e-mail alert. HerdData and GET /api/herd
    carry no budgets.

Data
[ ] farm.safra_start_month integer not null default 10, check 1–12; enum
    budget_distribution (equal, previous, manual); table budgets: id, farm_id
    (→ farm, cascade), category, account_id (→ accounts, cascade, nullable), month
    (a date, the month's first day), amount_brl numeric (check ≥ 0), distribution,
    updated_at, updated_by (not null); NO safra column (CONTRACT-CHANGES.md: rows
    keep their calendar month, so a new início da safra spreads them over two
    safras); unique budgets_line_month_idx on (farm_id, category,
    coalesce(account_id, ''), month); index budgets_farm_id_month_idx on
    (farm_id, month). Migration drizzle/0025_financeiro-orcamento.sql plus meta
    (journal and snapshot) agree with lib/db/schema.ts.
[ ] Types and mappers: Budget { id, category, accountId?, month "YYYY-MM-01",
    amountBrl, distribution } (no safra), BudgetDistribution,
    FarmData.safraStartMonth; toBudget; toFarmData carries safraStartMonth; the
    store's initial farm says 10; an offline snapshot without it reads 10.

Rules (lib/domain/budget.ts)
[ ] safraOf / safraMonths / safraLabel / safraRange for a start of 10, 1 and 12:
    "Safra 2025/26" against "Safra 2026"; a safra across a leap February.
    budgetView and copyPlan pick a safra's rows by month key; nothing reads a row
    outside its safra's twelve months.
[ ] distribute: equal = total ÷ 12 floored to the centavo, the rest on the last
    month; previous = proportional to the previous safra's realizado per month, the
    rest on the last month, equal when that shape is all zero; monthsAddUp to the
    centavo.
[ ] Realizado: isCost lançamentos by date, paid or not, under their grupo and conta,
    plus done treatments with a cost under Sanidade (no conta), up to today only;
    receitas, vendas, compras de gado, investimento, financiamento, sócios,
    rendimento and transferências never count. A grupo's realizado takes its
    despesas whatever their conta.
[ ] A grupo's orçado = its own line when it has one, else the sum of its contas'; a
    conta's = its own line; accountsSum only when both exist and differ.
[ ] Previsto até o fim = realizado to date + for each month from today's on the
    despesas already generated in it when the line has any, else that month's
    orçado (today's month: the larger of the two); todayIndex −1 → previsto =
    orçado, 12 → previsto = realizado.
[ ] % usado = realizado ÷ orçado of the months up to today's; tones ≤ 90 brand,
    90–100 attention, > 100 overdue, none without orçado to date; `over` = up to
    three grupos above 100 %, worst first.
[ ] copyPlan: one line per source line (grupo or conta) without a budget in the
    target safra; ajuste −50..100 %, each month rounded to the centavo; the
    realizado gives grupo lines only; `skipped` counts the lines left alone.

API and access
[ ] GET /budgets?safra (finance view); PUT /budgets, DELETE /budgets, POST
    /budgets/copy (finance edit); every use case reads farm.safra_start_month
    first and works on the months inside safraRange(safra); every query filters
    by farm_id; PUT replaces the line's rows of that safra with 12 in one
    transaction (month = "<key>-01") and sets updated_by; 400 months_mismatch (not
    12 months) and invalid_account (conta of another farm or of another grupo);
    PUT /farm takes safraStartMonth 1..12, absent leaves it.
[ ] Route requirements and the two snapshots list the four budget routes; a member
    without Financeiro gets 403 on all four and never a budget in any load.

Store
[ ] budgets: Record<safra, Budget[]>, loaded on demand (the Orçamento: its safra and
    the previous; the Painel and Configurações: the current safra; each page loads whenever its
    safra is absent from the cache); every write replaces that safra's rows with
    the server's answer; the cache empties on a farm switch, a new farm,
    refreshAccess and a saveFarm that changes safraStartMonth.

UI
[ ] Sub-navigation Painel · Lançamentos · Contas bancárias · Orçamento; on the phone
    the current pill is scrolled into view.
[ ] /finance/orcamento: header "Orçamento · safra X" with the safra's days and "COE
    por grupo do plano de contas", the Safra picker (previous, current, next),
    "Copiar da safra anterior"; the strip (Orçado, Realizado até <mês> "pago e a
    pagar até dd/mm", Variação in % and R$ against the orçado to date, overdue when
    above, Previsto até o fim); the table (grupo › conta expandable, orçado,
    realizado, bar + %, previsto in overdue above the orçado, sparkline with bars =
    realizado and line = orçado, pencil "Editar orçamento de <grupo>", Total row,
    legend); grupos with neither orçado nor realizado hidden; "as contas somam
    R$ X" in attention; the empty safra with both buttons; the phone: a two-column
    strip and cards that open to their contas.
[ ] Edit dialog: "Total do grupo (R$)", the previous safra's orçado and realizado,
    Igual · Como a safra anterior · Manual with their preview lines, 12 month inputs
    labelled "out/25"… with bars, typing a month switches to Manual, "Soma dos meses
    confere com o total" or the difference in overdue, saving refused while the
    months do not add up, "Contas" collapsed with each conta's total and the same
    choice, "Remover orçamento do grupo" (keeps the contas' lines); a bottom sheet
    with 3 columns on the phone. Pure field logic in
    components/finance/orcamento/editFields.ts, tested.
[ ] Copiar dialog: Orçado · Realizado of the previous safra, "Ajuste (%)", the
    preview, the toast "N linhas copiadas · M já tinham orçamento".
[ ] A view-only member: no pencil, no Copiar, no "Orçar um grupo", "Somente leitura".
[ ] The Painel band under "Capital, dívidas e sócios": "Orçamento · safra X · N %
    usado", the bar, up to three grupos above 100 %, "Ver orçamento"; hidden with no
    orçado in the current safra. Configurações › Dados da fazenda: "Início da safra"
    and, when the current safra has budgets (the form loads them for a user with
    Financeiro view, nothing without it), the warning "Os orçamentos
    guardam seus meses do calendário: mudar o início da safra redistribui-os entre
    as safras."
[ ] Targets ≥ 44 px on the phone; real buttons, links and labels; aria-label on the
    icon buttons; role="meter" and the sparkline's role="img" named.

Review Focus (each needs a test where named)
[ ] 1. safraStartMonth 1 and 12, the labels, a leap February (task 2).
[ ] 2. R$ 100,00 → 8,33 × 11 + 8,37; a previous shape all zero; typed months that do
       not add up refused (tasks 2 and 3; the dialog's side in
       components/finance/__tests__/editFields.test.ts).
[ ] 3. Today before the safra (todayIndex −1: nothing realizado, previsto = orçado)
       and after it (12: previsto = realizado) (task 2).
[ ] 4. invalid_account for a conta of another farm or grupo; months_mismatch for 11
       or 13 months; a view-only member cannot write; another farm's budgets never
       listed (task 3).
[ ] 5. Copy skips every line with a budget in the target, applies the % rounding
       each month, and the realizado gives grupo lines only (tasks 2 and 3).
````

Expected: a verdict with no blocker. Fix every blocker and should-fix in the owning task's files (the contract says which), then go on. Nits are listed in the final report, not fixed here.

- [ ] **Step 2: Gates**

Run, in `/home/luketa/meubov`:
```bash
pnpm exec tsc --noEmit
pnpm exec eslint $( { git diff --name-only --diff-filter=d HEAD -- app components lib; git ls-files --others --exclude-standard -- app components lib; } | grep -E '\.(ts|tsx|mjs)$' | sort -u )
pnpm exec vitest run lib components app --exclude '**/worktrees/**'
pnpm build
git diff --stat HEAD -- package.json pnpm-lock.yaml
```
(If `pnpm build` stops on Turbopack's `next/font/google` resolution, `pnpm exec next build --webpack` builds the same app; the verification used it.)

Expected: tsc prints nothing; eslint prints nothing; vitest reports every file passed (181 files, 1781 tests in the verification sandbox; among them `lib/domain/__tests__/budget.test.ts`, the budgets use-case tests, `components/finance/__tests__/editFields.test.ts` and the two route snapshots); the build exits 0 and its route list shows `/finance/orcamento`; the `git diff --stat` line is empty.

- [ ] **Step 3: Throwaway database, server, owner, seed**

Check the ports first:
```bash
docker ps --format '{{.Names}} {{.Ports}}'
ss -ltnp | grep -E ':(5447|3017) '
```
Expected: no `meubov-orcamento-db`, nothing on 5447 or 3017 (otherwise take the next free pair, e.g. 5448/3018, and use it below and in `BASE`/`DB`).

Database, migrated from zero:
```bash
docker run --rm -d --name meubov-orcamento-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov \
  -p 127.0.0.1:5447:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
until docker exec meubov-orcamento-db pg_isready -U meubov >/dev/null 2>&1; do sleep 1; done; sleep 2
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov pnpm db:migrate
docker exec meubov-orcamento-db psql -U meubov -tA \
  -c "select enum_range(null::budget_distribution)" \
  -c "select column_default || '|' || is_nullable from information_schema.columns where table_name = 'farm' and column_name = 'safra_start_month'" \
  -c "select indexdef from pg_indexes where tablename = 'budgets' order by indexname"
```
Expected: `migrations applied successfully!` (0000 → 0025), then `{equal,previous,manual}`, then `10|NO`, then the budgets indexes: `budgets_farm_id_month_idx` on `(farm_id, month)`, `budgets_line_month_idx` (UNIQUE, `farm_id, category, COALESCE(account_id, ''::text), month`) and the primary key.

Server on the build from Step 2 (`pnpm build`; it reads `.env.local` of the main checkout — never edit it, the overrides go on the command line). Start it in the background (the Bash tool's `run_in_background`):
```bash
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov BETTER_AUTH_URL=http://localhost:3017 \
  pnpm exec next start -p 3017 > ~/.cache/meubov-plan-2026-10-02/server.log 2>&1
```
Then wait for it, create the owner and seed the farm:
```bash
until curl -s -o /dev/null -w '%{http_code}' http://localhost:3017/api/auth/ok | grep -q 200; do sleep 1; done
curl -s -X POST http://localhost:3017/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3017' \
  -d '{"name":"Teste Orçamento","email":"teste.orcamento@meubov.local","password":"Orcamento2026!"}'
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov pnpm db:seed --email teste.orcamento@meubov.local
```
Expected: `Seeded farm "Fazenda Boa Vista" (id 1) for teste.orcamento@meubov.local: 41 animals, …`. (Sign-up answers 200 even for an e-mail that exists; the script's sign-in is the real check.) The seed's despesas run from Aug/2025 to Sep/2026 and carry the standard plano de contas (Sal mineral, Ração e suplemento, Silagem, Benfeitorias, Outras receitas…), which the script uses by name.

- [ ] **Step 4: The smoke script**

Save this as `~/.cache/meubov-plan-2026-10-02/smoke.mjs` (headless Playwright from the npx cache, chromium 1243). It was run on 2026-10-04 against tasks 1–6 exactly as this plan writes them (a sandbox clone, `next build --webpack`, `next start -p 3017`, the tmpfs database on 5447) and passed 234/234; brought in line with the amendments after the whole-change review (end of this plan), the version below passed 251/251 on `main` the same day; the accessible names it uses are the ones tasks 5 and 6 list under "Produces", plus the sidebar's "Configurações" and "Financeiro" links (`lib/nav.ts`).

How it works. It reads today in São Paulo and makes the safra start three months before today's month (four when that would be outubro, the default it must change), so the current safra always has three past months, today's month and eight ahead (on 2026-10-02: julho, "Safra 2026/27", jul/26–jun/27). It deletes the seed's despesas from the start of that safra on (the previous safra keeps the seed's, which feed the hint and "Como a safra anterior"), and every expected figure is computed from the rows it writes: Nutrição 120.000 (Igual) with Sal mineral 36.000 and Ração e suplemento 60.000, Administrativo 24.000; despesas in the three past months on Sal mineral, Ração e suplemento, Silagem (no orçado), Nutrição without conta and Administrativo (one a pagar), three a pagar ahead (Ração e suplemento 7.000 in month 6, Administrativo 3.500 in month 7, Sanidade 2.500 in month 9: a grupo without orçado, so its row stays "sem orçamento" and no total counts it), and a receita and an investimento that must not count. Nothing falls in today's month, so the realizado to date stops at the month before. From today's month on, each month of the previsto is the larger of its orçado and its despesas (month 6: Ração e suplemento counts its 7.000, Nutrição its 10.000). On 2026-10-04 that gives: Orçado R$ 144.000 ("2 grupos com orçamento"), Realizado R$ 49.250, Variação +2,6 % (R$ 1.250 acima), Previsto R$ 158.750; Nutrição 93 % (attention), previsto 127.300, with Sal mineral 79 % (brand), Ração e suplemento 127 % (overdue) and Silagem "sem orçamento"; Administrativo 149 % (overdue), previsto 31.450; Sanidade "sem orçamento", previsto 2.500; the band "103 % usado · Administrativo 149 %".

What it covers, in order: the empty database state; "Início da safra" in Configurações (saved, the "A safra vai de … a …" line); the despesas by API; the API's refusals (`months_mismatch`, `invalid_account`, and 409 `start_month_changed` on PUT, copy and DELETE sent with another início), none writing a row; the Painel with no band while the current safra has no orçado (after its GET of the safra's budgets answered); the empty safra (header, sub-navigation, picker, both buttons); Nutrição through "Orçar um grupo" (the hint, Igual and its line, Como a safra anterior against the seed's shape, a typed month flipping to Manual, the difference line, the refused save, the contas and their sum) and Administrativo through the grupo picker; the strip; the table (orçado, realizado, % and its tone, the bar, previsto and its colour, the sparkline's bars, "as contas somam R$ 96.000", Sanidade with only a despesa ahead, hidden grupos, the contas, Total, legend); the pencil reopening what was saved, 6 month columns, Cancelar; the Painel band and its place under "Capital, dívidas e sócios", Ver orçamento; `?safra=1999` falling back to the current safra and `?safra=2000` never asking for 1999; the farm form's warning on a direct visit to /settings (the form loads the current safra's budgets itself; no save); the copy into the next safra with +5 % and Administrativo already budgeted (preview, toast, the rows), the realizado copy by API (grupo lines only), a copy by API into a safra where Nutrição has only Sal mineral (no grupo line written over it); "Remover orçamento do grupo"; the phone at 390 (strip in two columns, the current pill of the sub-navigation in view, cards, the sheet with 3 columns); a consultor (sees it, no pencil, no Copiar, no "Orçar um grupo", 403 on PUT, copy and DELETE) and a vaqueiro (403 on GET /api/herd/budgets, no budgets in /api/herd, Porteira fechada on the page and the Painel, no request for budgets from the Orçamento, the Painel or Configurações); then a new início da safra one month later, saved in Configurações through client-side moves (the warning, nothing rewritten, the store's safras dropped): the Painel band and the Orçamento follow the new months, the current safra's orçado loses the old first month and gains the next safra's (the dialog's last month reads the copied 10.500,00), the safra before holds that old first month (R$ 12.000), GET /budgets answers the new months' rows; no page or console error. Every page also checks that nothing scrolls sideways and no figure or strip text is cut.

```js
// Smoke of "Financeiro: orçamento por safra" against `next start` on a throwaway database.
// Usage: BASE=http://localhost:3017 DB=meubov-orcamento-db node ~/.cache/meubov-plan-2026-10-02/smoke.mjs
// Needs a fresh database (migrated from zero, owner signed up, farm seeded). The run deletes the seed's
// despesas from the start of the current safra on and writes its own, its budgets and two copies: a second
// run on the same database fails. Do not start it a few minutes before midnight in São Paulo: "today" must
// not change during the run.
//
// Selectors come from tasks 5 and 6 of the plan (their sections list the accessible names), plus the sidebar's
// "Configurações" and "Financeiro" links (lib/nav.ts).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const require = createRequire(`${homedir()}/.npm/_npx/705bc6b22212b352/node_modules/`);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3017";
const DB = process.env.DB ?? "meubov-orcamento-db";
const OUT = process.env.OUT ?? `${homedir()}/.cache/meubov-plan-2026-10-02/shots`;
mkdirSync(OUT, { recursive: true });

const OWNER = { email: "teste.orcamento@meubov.local", password: "Orcamento2026!" };
const VIEWER = { name: "Teste Consultor", email: "teste.orcamento.consultor@meubov.local", password: "Consultor2026!" };
const HAND = { name: "Teste Vaqueiro", email: "teste.orcamento.vaqueiro@meubov.local", password: "Vaqueiro2026!" };
// PRESETS of lib/domain/permissions.ts: the consultor sees Financeiro, the vaqueiro does not.
const CONSULTOR = { herd: "view", manejo: "view", reproduction: "view", sanitary: "view", lots: "view", finance: "view", farm: "view", team: "none" };
const VAQUEIRO = { herd: "edit", manejo: "edit", reproduction: "edit", sanitary: "edit", lots: "edit", finance: "none", farm: "view", team: "none" };
const DESK = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

// ---- dates -------------------------------------------------------------------
// The app's "today" is the calendar date in São Paulo (lib/domain/dates.ts).
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const [TY, TM] = TODAY.split("-").map(Number);
const ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const wrap = (m) => ((((m - 1) % 12) + 12) % 12) + 1;
// The safra starts three months before today's month: three months behind, today's, eight ahead. When that
// lands on outubro (the default, which the smoke must change) it starts four months before.
const TODAY_INDEX = wrap(TM - 3) === 10 ? 4 : 3;
const START = wrap(TM - TODAY_INDEX);
const SAFRA = TM >= START ? TY : TY - 1;
const monthsOf = (safra) =>
  Array.from({ length: 12 }, (_, i) => {
    const at = START - 1 + i;
    const year = safra + Math.floor(at / 12);
    const month = (at % 12) + 1;
    return { year, month, key: `${year}-${String(month).padStart(2, "0")}`, label: `${ABBR[month - 1]}/${String(year).slice(2)}` };
  });
const MONTHS = monthsOf(SAFRA);
const PREV = monthsOf(SAFRA - 1);
const lastDayOf = (m) => `${m.key}-${String(new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()).padStart(2, "0")}`;
const SAFRA_START = `${MONTHS[0].key}-01`;
const SAFRA_END = lastDayOf(MONTHS[11]);
const safraLabel = (s) => (START === 1 ? `Safra ${s}` : `Safra ${s}/${String(s + 1).slice(2)}`);
const lower = (label) => label.replace("Safra", "safra");
const monthYear = (m) => `${ABBR[m.month - 1]}/${m.year}`;
const on10 = (i) => `${MONTHS[i].key}-10`;
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ddmmyyyy = (d) => `${ddmm(d)}/${d.slice(0, 4)}`;

// ---- numbers, SQL ------------------------------------------------------------
const norm = (s) => String(s).replace(/[  ]/g, " ");
const whole = (n) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const one = (n) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
const money = (n) => norm(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n));
/** "R$ 360.000": how the orçamento writes its strip and its hints. */
const reais = (n) => `R$ ${whole(n)}`;
/** "10.000,00", "R$ 1.234,56", "−3.240" → number. */
const parseBR = (s) => Number(norm(s).replace(/R\$\s?/, "").replace("−", "-").replace(/\./g, "").replace(",", "."));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sql = (q) =>
  execSync(`docker exec -i ${DB} psql -U meubov -d meubov -tA -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

// ---- what the run writes, and what the page must show -------------------------
// [grupo, conta (null = sem conta), safra month, value, a pagar]. Every row before today's month except the
// three ahead (despesas already generated: from today's month on the previsto takes the larger of a month's
// orçado and its despesas; Ração's dezembro is above its conta's orçado but below Nutrição's, Administrativo's
// janeiro above its orçado). Sanidade has only a despesa ahead and no orçado: its row stays ("sem orçamento")
// and no total counts it. Nothing in today's month, so the realizado to date stops at the month before.
const DESPESAS = [
  ["nutrition", "Sal mineral", 0, 3500],
  ["nutrition", "Sal mineral", 1, 2800],
  ["nutrition", "Sal mineral", 2, 3200],
  ["nutrition", "Ração e suplemento", 0, 8000],
  ["nutrition", "Ração e suplemento", 1, 9000],
  ["nutrition", "Ração e suplemento", 2, 8400],
  ["nutrition", null, 1, 1400],
  ["nutrition", "Silagem", 2, 1000],
  ["admin", null, 0, 3900],
  ["admin", null, 1, 4100, true],
  ["admin", null, 2, 3950],
  ["nutrition", "Ração e suplemento", 5, 7000, true],
  ["admin", null, 6, 3500, true],
  ["health", null, 8, 2500, true],
];
const GROUP_LABEL = { nutrition: "Nutrição", admin: "Administrativo", health: "Sanidade" };
/** By the % rounded to the integer the page shows: up to 90 brand, 91–100 attention, above overdue. */
const tone = (pct) => (pct === null ? "none" : Math.round(pct) > 100 ? "overdue" : Math.round(pct) > 90 ? "attention" : "brand");
/** One line's figures from DESPESAS and its equal monthly orçado (0 = no orçado). */
function expected(grupo, conta, monthly) {
  const rows = DESPESAS.filter(([g, c]) => g === grupo && (conta === undefined || c === conta));
  const realized = rows.filter((r) => r[2] < TODAY_INDEX).reduce((s, r) => s + r[3], 0);
  const inMonth = (i) => rows.filter((r) => r[2] === i).reduce((s, r) => s + r[3], 0);
  const toDate = monthly * (TODAY_INDEX + 1);
  const pct = toDate > 0 ? (realized / toDate) * 100 : null;
  const byMonth = MONTHS.map((_, i) => (i <= TODAY_INDEX ? inMonth(i) : 0));
  return {
    budgeted: monthly * 12,
    toDate,
    realized,
    // Past months as realizado; today's and every later one the larger of its orçado and its despesas.
    forecast: realized + MONTHS.slice(TODAY_INDEX).reduce((s, _, k) => s + Math.max(monthly, inMonth(TODAY_INDEX + k)), 0),
    pct,
    tone: tone(pct),
    bars: byMonth.filter((v) => v > 0).length,
    over: monthly > 0 ? byMonth.filter((v) => v > monthly * 1.02).length : 0,
  };
}
const EXP = {
  nut: expected("nutrition", undefined, 10000),
  sal: expected("nutrition", "Sal mineral", 3000),
  racao: expected("nutrition", "Ração e suplemento", 5000),
  silagem: expected("nutrition", "Silagem", 0),
  adm: expected("admin", undefined, 2000),
  san: expected("health", undefined, 0),
};
// The grupos with a budget only: Sanidade keeps its row out of every total.
const TOTAL = {
  budgeted: EXP.nut.budgeted + EXP.adm.budgeted,
  toDate: EXP.nut.toDate + EXP.adm.toDate,
  realized: EXP.nut.realized + EXP.adm.realized,
  forecast: EXP.nut.forecast + EXP.adm.forecast,
};
TOTAL.pct = (TOTAL.realized / TOTAL.toDate) * 100;
TOTAL.tone = tone(TOTAL.pct);
const DIFF = TOTAL.realized - TOTAL.toDate;
const VARIATION = {
  value: `${DIFF > 0 ? "+" : DIFF < 0 ? "−" : ""}${one((Math.abs(DIFF) / TOTAL.toDate) * 100)} %`,
  sub: DIFF === 0 ? "igual ao orçado" : `${reais(Math.abs(DIFF))} ${DIFF > 0 ? "acima" : "abaixo"} do orçado`,
};
const COLOR = { brand: "rgb(62, 113, 80)", attention: "rgb(138, 90, 18)", overdue: "rgb(154, 51, 36)", ink: "rgb(35, 32, 27)", none: "rgb(110, 103, 89)" };
const WORD = { brand: "dentro", attention: "no limite", overdue: "acima" };
const used = (pct) => `${whole(pct)} %`;

// ---- checks ------------------------------------------------------------------
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const eq = (want) => Object.assign((got) => got === want, { want });
const like = (re) => Object.assign((got) => re.test(String(got)), { want: re });
/** Polls `probe` until `ok` holds or 10 s pass: the store loads after the page paints. */
async function eventually(name, probe, ok) {
  let got;
  for (let i = 0; i < 40; i += 1) {
    got = await probe().catch((e) => `error: ${e.message.split("\n")[0]}`);
    if (ok(got)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(name, ok(got), `got ${JSON.stringify(got)}, want ${ok.want ?? "(predicate)"}`);
  return got;
}

// ---- browser, sessions -------------------------------------------------------
const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
});
const errors = [];
const FARM = Number(
  sql(`select fu.farm_id from farm_users fu join "user" u on u.id = fu.user_id
       where u.email = '${OWNER.email}' and fu.role = 'owner' order by fu.farm_id limit 1`)
);
check("seeded farm found", FARM > 0, String(FARM));

/** Console errors that are not ours: the aborted quote, Vercel's insights, a 403 the member's page asks for. */
const NOISE = /\/api\/market\/quote|_vercel|status of 403/;
async function openSession(user) {
  const context = await browser.newContext({ viewport: DESK, locale: "pt-BR" });
  // No live arroba quote: the Painel's @-figures read "—".
  await context.route("**/api/market/quote", (route) => route.abort());
  await context.addInitScript((farm) => {
    try {
      localStorage.setItem("meubov.activeFarmId", String(farm));
    } catch {}
  }, FARM);
  const res = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE },
  });
  check(`sign in ${user.email}`, res.ok(), String(res.status()));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(`${user.email} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location()?.url ?? "";
    if (NOISE.test(`${m.text()} ${where}`)) return;
    errors.push(`${user.email} console: ${m.text().slice(0, 200)} @ ${where}`);
  });
  return { context, page };
}
const apiOf = (context) => (method, path, data) =>
  context.request.fetch(`${BASE}/api/herd${path}`, {
    method,
    data,
    headers: { origin: BASE, "x-farm-id": String(FARM) },
  });

// Two members: one sees Financeiro, one does not (inserted straight into farm_users).
const anon = await browser.newContext();
for (const [user, preset, levels] of [
  [VIEWER, "consultor", CONSULTOR],
  [HAND, "vaqueiro", VAQUEIRO],
]) {
  await anon.request.post(`${BASE}/api/auth/sign-up/email`, {
    data: { name: user.name, email: user.email, password: user.password },
    headers: { origin: BASE },
  });
  sql(`insert into farm_users (farm_id, user_id, role, preset, permissions)
       select ${FARM}, id, 'member', '${preset}', '${JSON.stringify(levels)}'::jsonb from "user" where email = '${user.email}'
       on conflict do nothing`);
}
await anon.close();
check("two members on the farm", sql(`select count(*) from farm_users where farm_id = ${FARM} and role = 'member'`) === "2");

const { context: ownerContext, page } = await openSession(OWNER);
const api = apiOf(ownerContext);

// ---- page helpers ------------------------------------------------------------
const dialog = (pg = page) => pg.getByRole("dialog").last();
const visible = (locator) => locator.locator("visible=true");
const toast = (text, pg = page) =>
  pg
    .locator("[data-sonner-toast]", { hasText: text })
    .first()
    .waitFor({ timeout: 10000 })
    .then(() => true, () => false);
const mainText = async (pg = page) => norm(await pg.locator("main").innerText());
/** Waits for the toasts to go (they cover the header's actions), then shoots. */
async function shot(name, pg = page, fullPage = true) {
  await pg.waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, null, { timeout: 15000 }).catch(() => {});
  await pg.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}
async function goOrc(safra, pg = page) {
  await pg.goto(`${BASE}/finance/orcamento${safra === undefined ? "" : `?safra=${safra}`}`);
  await pg.locator("main h1").first().waitFor();
}
const farmCard = (pg = page) =>
  pg.locator("section", { has: pg.getByRole("heading", { name: "Dados da fazenda", exact: true }) }).last();

/** The strip: label → value, sub and the value's colour, for the cells on screen (dt read by textContent: the CSS upper-cases it). */
const strip = (pg = page) =>
  pg.evaluate(() => {
    const clean = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
    const out = {};
    for (const cell of document.querySelectorAll("main dl > div")) {
      if (!cell.checkVisibility()) continue;
      const dt = cell.querySelector("dt");
      const dds = cell.querySelectorAll("dd");
      if (!dt || dds.length < 2) continue;
      out[dt.textContent.trim()] = { value: clean(dds[0].innerText), sub: clean(dds[1].innerText), color: getComputedStyle(dds[0]).color };
    }
    return out;
  });
const cellBox = (label, pg = page) =>
  pg.evaluate((label) => {
    for (const cell of document.querySelectorAll("main dl > div")) {
      const dt = cell.querySelector("dt");
      if (!dt || dt.textContent.trim() !== label || !cell.checkVisibility()) continue;
      const r = cell.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) };
    }
    return null;
  }, label);

/** A visible row of the "Por grupo" table whose first line is `label`: its cells, colours, bar, sparkline and pencil. */
const tableRow = (label, pg = page) =>
  pg.evaluate((label) => {
    const clean = (s) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
    const leaf = (el) => [...el.querySelectorAll("*")].filter((e) => e.childElementCount === 0 && e.textContent.trim()).pop() ?? el;
    for (const tr of document.querySelectorAll("main table tbody tr")) {
      if (!tr.checkVisibility()) continue;
      const cells = [...tr.cells];
      if (cells.length < 5 || clean(cells[0].innerText.split("\n")[0]) !== label) continue;
      const svg = cells[5]?.querySelector('svg[role="img"]');
      const bars = svg ? [...svg.querySelectorAll("rect")].filter((r) => Number(r.getAttribute("height")) > 0) : [];
      const sum = [...cells[0].querySelectorAll("*")].find((e) => e.childElementCount === 0 && e.textContent.includes("as contas somam"));
      return {
        first: clean(cells[0].innerText),
        sumColor: sum ? getComputedStyle(sum).color : null,
        budgeted: clean(cells[1].innerText),
        realized: clean(cells[2].innerText),
        used: clean(cells[3].innerText),
        usedColor: getComputedStyle(leaf(cells[3])).color,
        meter: cells[3].querySelector('[role="meter"]')?.getAttribute("aria-label") ?? null,
        forecast: clean(cells[4].innerText),
        forecastColor: getComputedStyle(leaf(cells[4])).color,
        spark: svg
          ? {
              label: svg.getAttribute("aria-label"),
              line: svg.querySelector("polyline") !== null,
              bars: bars.length,
              over: bars.filter((r) => (r.getAttribute("class") ?? "").includes("overdue")).length,
            }
          : null,
        pencil: cells[6]?.querySelector("button")?.getAttribute("aria-label") ?? null,
        expanded: cells[0].querySelector("button[aria-expanded]")?.getAttribute("aria-expanded") ?? null,
      };
    }
    return null;
  }, label);

/** A visible phone card (the button that opens it): its lines of text and whether it is open. */
const card = (label, pg = page) =>
  pg.evaluate((label) => {
    for (const button of document.querySelectorAll("main li > button[aria-expanded]")) {
      if (!button.checkVisibility()) continue;
      const lines = button.innerText.replace(/[  ]/g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines[0] === label) return { lines, expanded: button.getAttribute("aria-expanded"), height: button.getBoundingClientRect().height };
    }
    return null;
  }, label);

/** The first days of a safra's first and last months: a budget row's `month` (a date, the month's first day) lies between. */
const rangeOf = (safra) => {
  const m = monthsOf(safra);
  return [`${m[0].key}-01`, `${m[11].key}-01`];
};
/** Budget lines of a safra by conta name (or the grupo's category): rows, sum, smallest and largest month, distributions. */
const lines = (safra) =>
  Object.fromEntries(
    sql(`select coalesce(a.name, b.category::text), count(*), sum(b.amount_brl), min(b.amount_brl), max(b.amount_brl), string_agg(distinct b.distribution::text, ',')
         from budgets b left join accounts a on a.id = b.account_id
         where b.farm_id = ${FARM} and b.month between '${rangeOf(safra)[0]}' and '${rangeOf(safra)[1]}' group by 1`)
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const [name, n, sum, min, max, dist] = row.split("|");
        return [name, { n: Number(n), sum: Number(sum), min: Number(min), max: Number(max), dist }];
      })
  );
const line = (n, each, dist) => ({ n, sum: n * each, min: each, max: each, dist });
const sameLines = (got, want) => {
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  return sorted(got) === sorted(want);
};
const plan = (name) => sql(`select id from accounts where farm_id = ${FARM} and name = '${name}' and archived_at is null limit 1`);

/** Figures (money, counts) that do not fit their box: clipped by a truncate or spilling into the next cell. */
const clippedFigures = (pg = page) =>
  pg.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("main *, [role=dialog] *")) {
      if (el.childElementCount > 0 || !el.checkVisibility()) continue;
      const text = el.textContent.replace(/[  ]/g, " ").trim();
      if (!/^[−+-]?(-?R\$ ?)?[−-]?[\d.]+(,\d{2})?$/.test(text)) continue;
      let box = el;
      while (box && getComputedStyle(box).display === "inline") box = box.parentElement;
      if (box && box.scrollWidth > box.clientWidth + 1) out.push(text);
    }
    return out;
  });
/** Text of the strip cut by a truncate. */
const cutText = (pg = page) =>
  pg.evaluate(() =>
    [...document.querySelectorAll("main dl dt, main dl dd")]
      .filter((el) => el.checkVisibility() && el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim())
  );
async function layoutOk(name, width, pg = page) {
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: nothing scrolls sideways at ${width}`, sw <= width + 1, String(sw));
  const cut = await clippedFigures(pg);
  check(`${name}: no figure clipped at ${width}`, cut.length === 0, cut.join(" | "));
  const words = await cutText(pg);
  check(`${name}: no strip text cut at ${width}`, words.length === 0, words.join(" | "));
}

/** A section that throws records one FAIL with a screenshot and lets the next one run. */
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name} (threw)`, false, e.message.split("\n")[0]);
    await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
}
async function postOk(path, body, label) {
  const res = await api("POST", path, body);
  const json = await res.json().catch(() => null);
  check(label, res.ok(), `${res.status()} ${JSON.stringify(json)}`);
  return json;
}
async function refused(label, path, body, status, error, method = "POST") {
  const res = await api(method, path, body);
  const json = await res.json().catch(() => ({}));
  check(label, res.status() === status && json?.error === error, `${res.status()} ${JSON.stringify(json)}`);
}

console.log(`today ${TODAY} · start month ${START} (${MONTH_NAMES[START - 1]}) · ${safraLabel(SAFRA)} · today's month is #${TODAY_INDEX}`);

// The previous safra's Nutrição by month, from the seed: the dialog's hint and "Como a safra anterior".
const PREV_SHAPE = PREV.map((m) =>
  Number(
    sql(`select coalesce(sum(amount_brl), 0) from expenses where farm_id = ${FARM} and kind = 'expense'
         and category = 'nutrition' and left(date::text, 7) = '${m.key}' and date::text <= '${TODAY}'`)
  )
);
const PREV_NUT = PREV_SHAPE.reduce((a, b) => a + b, 0);
const PREV_SHORT = safraLabel(SAFRA - 1).replace("Safra ", "");

// ---- 1. The current safra holds only what the smoke writes ------------------------
await step("clean the safra", async () => {
  sql(`delete from expenses where farm_id = ${FARM} and kind = 'expense' and date >= '${SAFRA_START}'`);
  check("no despesa from the start of the current safra on", sql(`select count(*) from expenses where farm_id = ${FARM} and kind = 'expense' and date >= '${SAFRA_START}'`) === "0");
  check("no budget yet", sql(`select count(*) from budgets where farm_id = ${FARM}`) === "0");
  check("the farm starts its safra in outubro (default 10)", sql(`select safra_start_month from farm where id = ${FARM}`) === "10");
});

// ---- 2. Início da safra in Configurações -------------------------------------------
await step("Início da safra", async () => {
  await page.goto(`${BASE}/settings`);
  const select = farmCard().getByRole("combobox", { name: "Início da safra" });
  await eventually("Início da safra shows outubro", async () => (await select.innerText()).trim(), eq("outubro"));
  check("the line names the safra's months", norm(await farmCard().innerText()).includes("A safra vai de outubro a setembro."));
  await select.click();
  await page.getByRole("option", { name: MONTH_NAMES[START - 1], exact: true }).click();
  check("no warning while no budget is in the store", (await page.getByText("Os orçamentos guardam seus meses").count()) === 0);
  await farmCard().getByRole("button", { name: "Salvar", exact: true }).click();
  check("Dados da fazenda salvos", await toast("Dados da fazenda salvos"));
  await eventually("farm.safra_start_month saved", async () => sql(`select safra_start_month from farm where id = ${FARM}`), eq(String(START)));
  check(
    "the line follows the month",
    norm(await farmCard().innerText()).includes(`A safra vai de ${MONTH_NAMES[START - 1]} a ${MONTH_NAMES[(START + 10) % 12]}.`)
  );
});

// ---- 3. Despesas by API, plus what never counts as realizado ------------------------
await step("despesas by API", async () => {
  for (const [category, conta, i, amountBrl, pending] of DESPESAS) {
    const date = on10(i);
    await postOk(
      "/expenses",
      { kind: "expense", category, date, amountBrl, dueDate: date, ...(pending ? {} : { paidAt: date }), ...(conta ? { accountId: plan(conta) } : {}) },
      `despesa ${GROUP_LABEL[category]}${conta ? ` › ${conta}` : ""} ${MONTHS[i].label} ${whole(amountBrl)}${pending ? " (a pagar)" : ""}`
    );
  }
  await postOk(
    "/expenses",
    { kind: "revenue", category: "other", date: on10(1), amountBrl: 5000, paidAt: on10(1), accountId: plan("Outras receitas") },
    "a receita in the safra (never realizado)"
  );
  await postOk(
    "/expenses",
    { kind: "investment", flow: "out", category: "other", date: on10(1), amountBrl: 10000, paidAt: on10(1), accountId: plan("Benfeitorias") },
    "an investimento in the safra (never realizado)"
  );
  check(
    `${DESPESAS.length} despesas in the safra`,
    sql(`select count(*) from expenses where farm_id = ${FARM} and kind = 'expense' and date >= '${SAFRA_START}'`) === String(DESPESAS.length)
  );
});

// ---- 4. What the budgets API refuses -------------------------------------------------
// Every write carries the início da safra the client read its safra with; another one is a 409.
const OTHER_START = (START % 12) + 1;
await step("budgets API refusals", async () => {
  await refused("PUT /budgets with 11 months → months_mismatch", "/budgets", { safra: SAFRA, startMonth: START, category: "admin", months: Array(11).fill(100), distribution: "manual" }, 400, "months_mismatch", "PUT");
  await refused(
    "PUT /budgets with a conta of another grupo → invalid_account",
    "/budgets",
    { safra: SAFRA, startMonth: START, category: "admin", accountId: plan("Sal mineral"), months: Array(12).fill(100), distribution: "manual" },
    400,
    "invalid_account",
    "PUT"
  );
  await refused(
    "PUT /budgets read with another início → 409 start_month_changed",
    "/budgets",
    { safra: SAFRA, startMonth: OTHER_START, category: "admin", months: Array(12).fill(100), distribution: "manual" },
    409,
    "start_month_changed",
    "PUT"
  );
  await refused(
    "POST /budgets/copy read with another início → 409 start_month_changed",
    "/budgets/copy",
    { from: SAFRA - 1, to: SAFRA, startMonth: OTHER_START, source: "realized", adjustPct: 0 },
    409,
    "start_month_changed"
  );
  await refused(
    "DELETE /budgets read with another início → 409 start_month_changed",
    `/budgets?safra=${SAFRA}&startMonth=${OTHER_START}&category=admin`,
    undefined,
    409,
    "start_month_changed",
    "DELETE"
  );
  check("a refusal writes nothing", sql(`select count(*) from budgets where farm_id = ${FARM}`) === "0");
});

// ---- 5a. The Painel has no band while the current safra has no orçado ---------------------
await step("band hidden", async () => {
  const loaded = page.waitForResponse((r) => r.url().includes(`/api/herd/budgets?safra=${SAFRA}`) && r.request().method() === "GET");
  await page.goto(`${BASE}/finance`);
  const res = await loaded;
  check("Painel loads the current safra's budgets", res.ok(), String(res.status()));
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(500);
  check("Painel: no band while the current safra has no orçado", (await page.locator('section[aria-label="Orçamento da safra"]').count()) === 0);
});

// ---- 5. The empty safra --------------------------------------------------------
await step("empty safra", async () => {
  await goOrc();
  await eventually("header: Orçamento · the current safra", async () => (await page.locator("main h1").first().innerText()).trim(), eq(`Orçamento · ${lower(safraLabel(SAFRA))}`));
  check(
    "header: the safra's days and what it covers",
    (await mainText()).includes(`${ddmmyyyy(SAFRA_START)} a ${ddmmyyyy(SAFRA_END)} · COE por grupo do plano de contas`)
  );
  const nav = page.getByRole("navigation", { name: "Seções do Financeiro" });
  const tabs = (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim());
  check("sub-navigation: Painel · Lançamentos · Contas bancárias · Orçamento", tabs.join(" · ") === "Painel · Lançamentos · Contas bancárias · Orçamento", tabs.join(" · "));
  check("sub-navigation: Orçamento is the current page", (await nav.getByRole("link", { name: "Orçamento" }).getAttribute("aria-current")) === "page");
  check("the picker shows the current safra", (await page.getByRole("combobox", { name: "Safra" }).innerText()).includes(safraLabel(SAFRA)));
  await eventually("Nenhum orçamento para esta safra", () => page.getByText("Nenhum orçamento para esta safra").count(), eq(1));
  const main = page.locator("main");
  check("empty state: Copiar da safra anterior", (await visible(main.getByRole("button", { name: "Copiar da safra anterior" })).count()) >= 1);
  check("empty state: Orçar um grupo", (await visible(main.getByRole("button", { name: "Orçar um grupo" })).count()) === 1);
  check("empty state: no strip, no table", (await page.locator("main dl").count()) === 0 && (await page.locator("main table").count()) === 0);
  await layoutOk("empty safra", DESK.width);
  await shot("desk-orcamento-vazio");
});

// ---- 6. Nutrição through the dialog, with two contas ------------------------------
const groupMonths = () => Promise.all(MONTHS.map((m) => dialog().getByLabel(m.label, { exact: true }).inputValue()));
await step("budget Nutrição", async () => {
  await visible(page.locator("main").getByRole("button", { name: "Orçar um grupo" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Nutrição" }).waitFor();
  check("Orçar um grupo opens on Nutrição", true);
  check("the dialog names the safra and its months", norm(await dialog().innerText()).includes(`${safraLabel(SAFRA)} · ${monthYear(MONTHS[0])} a ${monthYear(MONTHS[11])}`));
  check("Orçar um grupo lets the grupo be picked", (await dialog().getByLabel("Grupo", { exact: true }).count()) === 1);
  await eventually(
    "hint: the previous safra's orçado and realizado",
    async () => norm(await dialog().innerText()).includes(`${safraLabel(SAFRA - 1)}: sem orçamento · realizado ${reais(PREV_NUT)}.`),
    eq(true)
  );
  const dist = dialog().getByRole("group", { name: "Distribuir por mês" });
  check("Igual is the default", await dist.getByRole("radio", { name: /^Igual/ }).isChecked());

  await dialog().getByLabel("Total do grupo (R$)").fill("120000");
  await eventually("Igual: 10.000,00 in every month", async () => (await groupMonths()).every((v) => v === "10.000,00"), eq(true));
  check("Igual's line: R$ 10.000,00 por mês", norm(await dist.innerText()).includes("R$ 10.000,00 por mês"));
  check("Soma dos meses confere com o total", (await dialog().getByText("Soma dos meses confere com o total").count()) === 1);

  await dist.getByRole("radio", { name: /^Como a safra anterior/ }).click();
  const allZero = PREV_SHAPE.every((v) => v === 0);
  check(
    "Como a safra anterior names the previous safra",
    norm(await dist.innerText()).includes(allZero ? `sem gasto em ${PREV_SHORT}` : `segue o gasto de ${PREV_SHORT}`)
  );
  const spread = await eventually(
    "Como a safra anterior: the months still add up to 120.000",
    async () => {
      const values = (await groupMonths()).map(parseBR);
      return Math.abs(values.reduce((a, b) => a + b, 0) - 120000) < 0.005 && values.some((v) => v !== 10000) !== allZero ? values : null;
    },
    (got) => Array.isArray(got)
  );
  const shaped = Array.isArray(spread) ? spread : [];
  check(
    allZero ? "Como a safra anterior without gasto falls back to Igual" : "Como a safra anterior: zero where the previous safra spent nothing",
    allZero ? shaped.every((v) => v === 10000) : shaped.slice(0, 11).every((v, i) => (v === 0) === (PREV_SHAPE[i] === 0)),
    `${shaped.join(" ")} / ${PREV_SHAPE.join(" ")}`
  );

  await dist.getByRole("radio", { name: /^Igual/ }).click();
  await eventually("back to Igual", async () => (await groupMonths()).every((v) => v === "10.000,00"), eq(true));
  await dialog().getByLabel(MONTHS[0].label, { exact: true }).fill("1.000,00");
  check("typing a month makes the line Manual", await dist.getByRole("radio", { name: /^Manual/ }).isChecked());
  check("the check line shows the difference", norm(await dialog().innerText()).includes("Os meses somam R$ 111.000,00 · faltam R$ 9.000,00 para o total"));
  await dialog().getByRole("button", { name: "Salvar orçamento" }).click();
  check(
    "saving is refused while the months do not add up",
    await dialog().getByRole("alert").filter({ hasText: "A soma dos meses não confere com o total" }).first().waitFor({ timeout: 3000 }).then(() => true, () => false)
  );
  check("the refused save wrote nothing", sql(`select count(*) from budgets where farm_id = ${FARM}`) === "0");
  await dist.getByRole("radio", { name: /^Igual/ }).click();
  await eventually("Igual again: 10.000,00 in every month", async () => (await groupMonths()).every((v) => v === "10.000,00"), eq(true));
  await page.waitForTimeout(400); // the dialog's zoom-in
  await layoutOk("edit dialog", DESK.width);
  await shot("desk-editar", page, false);

  // Contas: Sal mineral 36.000 and Ração e suplemento 60.000, both Igual; Silagem stays blank.
  await dialog().locator("summary").filter({ hasText: "Contas" }).click();
  await dialog().getByLabel("Sal mineral", { exact: true }).fill("36000");
  await dialog().getByLabel("Ração e suplemento", { exact: true }).fill("60000");
  check("the hint sums the contas typed", norm(await dialog().innerText()).includes("As contas do grupo (Ração e suplemento, Sal mineral) somam R$ 96.000."));
  await dialog().getByRole("button", { name: "Salvar orçamento" }).click();
  check("Orçamento de Nutrição salvo", await toast("Orçamento de Nutrição salvo"));
  await eventually(
    "Nutrição: the grupo's 12 months of 10.000 and two contas, all Igual",
    async () =>
      sameLines(lines(SAFRA), {
        nutrition: line(12, 10000, "equal"),
        "Sal mineral": line(12, 3000, "equal"),
        "Ração e suplemento": line(12, 5000, "equal"),
      }),
    eq(true)
  );
});

// ---- 7. Administrativo through "Orçar um grupo" and the grupo picker --------------
await step("budget Administrativo", async () => {
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await visible(page.locator("main").getByRole("button", { name: "Orçar um grupo" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Pastagem" }).waitFor();
  check("Orçar um grupo opens on the first grupo without orçado", true);
  await dialog().getByLabel("Grupo", { exact: true }).click();
  await page.getByRole("option", { name: "Administrativo", exact: true }).click();
  await dialog().getByRole("heading", { name: "Orçamento · Administrativo" }).waitFor();
  check("the grupo is picked in the dialog", true);
  await dialog().getByLabel("Total do grupo (R$)").fill("24000");
  await eventually("Administrativo: 2.000,00 a month", async () => (await groupMonths()).every((v) => v === "2.000,00"), eq(true));
  await dialog().getByRole("button", { name: "Salvar orçamento" }).click();
  check("Orçamento de Administrativo salvo", await toast("Orçamento de Administrativo salvo"));
  await eventually("Administrativo: 12 months of 2.000", async () => JSON.stringify(lines(SAFRA).admin), eq(JSON.stringify(line(12, 2000, "equal"))));
});

// ---- 8. The strip --------------------------------------------------------------
const REALIZED_LABEL = `Realizado até ${ABBR[TM - 1]}`;
await step("strip", async () => {
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await eventually("strip: Orçado", async () => (await strip())["Orçado"]?.value, eq(reais(TOTAL.budgeted)));
  const s = await strip();
  check("strip: Orçado · 2 grupos com orçamento · safra inteira", s["Orçado"]?.sub === "2 grupos com orçamento · safra inteira", s["Orçado"]?.sub);
  check(`strip: ${REALIZED_LABEL} (receita and investimento left out)`, s[REALIZED_LABEL]?.value === reais(TOTAL.realized), JSON.stringify(s[REALIZED_LABEL]));
  check("strip: pago e a pagar até hoje", s[REALIZED_LABEL]?.sub === `pago e a pagar até ${ddmm(TODAY)}`, s[REALIZED_LABEL]?.sub);
  check("strip: Variação against the orçado to date", s["Variação"]?.value === VARIATION.value, JSON.stringify(s["Variação"]));
  check("strip: Variação in R$", s["Variação"]?.sub === VARIATION.sub, s["Variação"]?.sub);
  check("strip: Variação in the overdue colour when above", s["Variação"]?.color === (DIFF > 0 ? COLOR.overdue : COLOR.ink), s["Variação"]?.color);
  check("strip: Previsto até o fim", s["Previsto até o fim"]?.value === reais(TOTAL.forecast), JSON.stringify(s["Previsto até o fim"]));
  check("strip: previsto up to the safra's last day", s["Previsto até o fim"]?.sub === `com pendentes e recorrências até ${ddmm(SAFRA_END)}`, s["Previsto até o fim"]?.sub);
});

// ---- 9. The table: grupos, contas, tones, previsto, sparkline, Total, legend ---------
async function rowIs(label, e, { pencil = false, spark = false, budgetedText } = {}) {
  const r = await eventually(`${label}: row shown`, () => tableRow(label), (got) => got !== null && typeof got === "object");
  if (!r || typeof r !== "object") return;
  check(`${label}: orçado`, r.budgeted === (budgetedText ?? whole(e.budgeted)), r.budgeted);
  check(`${label}: realizado`, r.realized === whole(e.realized), r.realized);
  if (e.pct === null) {
    check(`${label}: sem orçamento`, r.used === "sem orçamento", r.used);
  } else {
    check(`${label}: % usado`, r.used === used(e.pct), r.used);
    check(`${label}: % in the ${e.tone} tone`, r.usedColor === COLOR[e.tone], r.usedColor);
    check(`${label}: the bar`, r.meter === `${used(e.pct)} do orçado`, r.meter);
  }
  check(`${label}: previsto até o fim`, r.forecast === whole(e.forecast), r.forecast);
  check(
    `${label}: previsto ${e.pct !== null && e.forecast > e.budgeted ? "in the overdue colour above the orçado" : "in ink"}`,
    r.forecastColor === (e.pct !== null && e.forecast > e.budgeted ? COLOR.overdue : COLOR.ink),
    r.forecastColor
  );
  if (spark) {
    check(
      `${label}: sparkline — a bar per month with realizado, overdue above the month's orçado, the orçado as a line`,
      r.spark?.bars === e.bars && r.spark?.over === e.over && r.spark?.line && r.spark?.label === `${label}: realizado mês a mês contra o orçado`,
      JSON.stringify(r.spark)
    );
  }
  if (pencil) check(`${label}: the pencil`, r.pencil === `Editar orçamento de ${label}`, r.pencil);
  return r;
}
await step("table", async () => {
  const nut = await rowIs("Nutrição", EXP.nut, { pencil: true, spark: true });
  check("Nutrição: as contas somam R$ 96.000, in attention", nut?.first.includes("as contas somam R$ 96.000") && nut?.sumColor === COLOR.attention, JSON.stringify(nut?.first) + " " + nut?.sumColor);
  check("Nutrição: closed at first", nut?.expanded === "false", nut?.expanded);
  await rowIs("Administrativo", EXP.adm, { pencil: true, spark: true });
  await rowIs("Sanidade", EXP.san, { budgetedText: "—" });
  check("grupos with neither orçado nor despesas in the safra are hidden", (await tableRow("Mão de obra")) === null && (await tableRow("Pastagem")) === null);

  await visible(page.locator("main table").getByRole("button", { name: "Nutrição", exact: true })).click();
  await eventually("Nutrição opens to its contas", async () => (await tableRow("Nutrição"))?.expanded, eq("true"));
  await rowIs("Sal mineral", EXP.sal);
  await rowIs("Ração e suplemento", EXP.racao);
  await rowIs("Silagem", EXP.silagem, { budgetedText: "—" });

  const total = await rowIs("Total", { ...TOTAL, tone: TOTAL.tone });
  check("Total: no pencil, no sparkline", total && total.pencil === null && total.spark === null);
  const text = await mainText();
  check(
    "legend: the three tones and the sparkline's marks",
    ["até 90 %", "91 a 100 %", "acima de 100 %", "orçado do mês", `realizado · ${ABBR[START - 1]} a ${ABBR[(START + 10) % 12]}`].every((t) => text.includes(t))
  );
  check("Por grupo · o lápis edita", text.includes("abra um grupo para ver as contas · o lápis edita o orçado e a distribuição por mês"));
  await layoutOk("Orçamento", DESK.width);
  await shot("desk-orcamento");
});

// ---- 10. The pencil opens what was saved ---------------------------------------------
await step("pencil", async () => {
  await visible(page.getByRole("button", { name: "Editar orçamento de Nutrição" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Nutrição" }).waitFor();
  check("the pencil opens the saved total", (await dialog().getByLabel("Total do grupo (R$)").inputValue()) === "120.000,00");
  check("… its distribution", await dialog().getByRole("group", { name: "Distribuir por mês" }).getByRole("radio", { name: /^Igual/ }).isChecked());
  check("… and its months", (await dialog().getByLabel(MONTHS[5].label, { exact: true }).inputValue()) === "10.000,00");
  check("no grupo picker from the pencil", (await dialog().getByLabel("Grupo", { exact: true }).count()) === 0);
  check("Remover orçamento do grupo is offered", (await dialog().getByRole("button", { name: "Remover orçamento do grupo" }).count()) === 1);
  await dialog().locator("summary").filter({ hasText: "Contas" }).click();
  check("a conta's saved total", (await dialog().getByLabel("Sal mineral", { exact: true }).inputValue()) === "36.000,00");
  check("Silagem stays blank", (await dialog().getByLabel("Silagem", { exact: true }).inputValue()) === "");
  const boxes = await Promise.all([0, 5, 6].map((i) => dialog().getByLabel(MONTHS[i].label, { exact: true }).boundingBox()));
  check(
    "desktop: the months in 6 columns",
    boxes.every(Boolean) && Math.abs(boxes[0].y - boxes[1].y) < 2 && boxes[2].y > boxes[0].y + 10 && Math.abs(boxes[2].x - boxes[0].x) < 2,
    JSON.stringify(boxes)
  );
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  check("Cancelar writes nothing", sameLines(lines(SAFRA), { nutrition: line(12, 10000, "equal"), "Sal mineral": line(12, 3000, "equal"), "Ração e suplemento": line(12, 5000, "equal"), admin: line(12, 2000, "equal") }));
});

// ---- 11. The Painel band ----------------------------------------------------------
await step("Painel band", async () => {
  await page.goto(`${BASE}/finance`);
  const band = page.locator('section[aria-label="Orçamento da safra"]');
  await eventually(
    "band: Orçamento · safra · % usado",
    async () => norm(await band.innerText()).replace(/\s+/g, " "),
    like(new RegExp(`^Orçamento · ${esc(lower(safraLabel(SAFRA)))} · ${esc(used(TOTAL.pct))} usado`))
  );
  check("band: the bar", (await band.getByRole("meter").getAttribute("aria-label")) === `${used(TOTAL.pct)} do orçado`);
  const text = norm(await band.innerText()).replace(/\s+/g, " ");
  check("band: Administrativo above 100 %", text.includes(`Administrativo ${used(EXP.adm.pct)}`), text);
  check("band: Nutrição is not above 100 %", !text.includes("Nutrição"), text);
  check("band: Ver orçamento opens the safra", ((await band.getByRole("link", { name: "Ver orçamento" }).getAttribute("href")) ?? "").includes(`safra=${SAFRA}`));
  const place = await page.evaluate(() => {
    const bandEl = document.querySelector('section[aria-label="Orçamento da safra"]');
    const cash = document.querySelector('section[aria-label="Caixa do período"]');
    const capital = [...document.querySelectorAll("main h2")].find((h) => h.textContent.trim() === "Capital, dívidas e sócios")?.closest("section");
    return {
      afterCash: Boolean(cash && bandEl && cash.compareDocumentPosition(bandEl) & Node.DOCUMENT_POSITION_FOLLOWING),
      capital: Boolean(capital),
      afterCapital: Boolean(capital && capital.nextElementSibling === bandEl),
    };
  });
  check("band: under Capital, dívidas e sócios (or under the caixa when that is hidden)", place.capital ? place.afterCapital : place.afterCash, JSON.stringify(place));
  await layoutOk("Painel", DESK.width);
  await shot("desk-painel-band");
  await band.getByRole("link", { name: "Ver orçamento" }).click();
  await page.waitForURL(new RegExp(`/finance/orcamento\\?safra=${SAFRA}`));
  check("Ver orçamento lands on the safra", (await page.locator("main h1").first().innerText()).trim() === `Orçamento · ${lower(safraLabel(SAFRA))}`);
});

// ---- 11b. ?safra= outside the API's 2000–2100 ------------------------------------------
await step("safra out of range", async () => {
  const asked = [];
  const onRequest = (r) => {
    if (r.url().includes("/api/herd/budgets?safra=")) asked.push(new URL(r.url()).searchParams.get("safra"));
  };
  page.on("request", onRequest);
  await goOrc(1999);
  await eventually("?safra=1999 falls back to the current safra", async () => (await page.locator("main h1").first().innerText()).trim(), eq(`Orçamento · ${lower(safraLabel(SAFRA))}`));
  await goOrc(2000);
  await eventually("?safra=2000 opens safra 2000", async () => (await page.locator("main h1").first().innerText()).trim(), eq(`Orçamento · ${lower(safraLabel(2000))}`));
  await eventually("… empty", () => page.getByText("Nenhum orçamento para esta safra").count(), eq(1));
  page.off("request", onRequest);
  check("no year outside 2000–2100 is asked for", asked.every((y) => Number(y) >= 2000 && Number(y) <= 2100), asked.join(" "));
});

// ---- 12. The farm form warns once budgets are in the store --------------------------
await step("farm form warning", async () => {
  // A direct visit: the form loads the current safra's budgets itself.
  await page.goto(`${BASE}/settings`);
  await farmCard().getByRole("combobox", { name: "Início da safra" }).click();
  await page.getByRole("option", { name: MONTH_NAMES[START % 12], exact: true }).click();
  check(
    "changing the start with budgets saved warns",
    await page
      .getByText("Os orçamentos guardam seus meses do calendário: mudar o início da safra redistribui-os entre as safras.")
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false)
  );
  await shot("desk-fazenda");
  await page.goto(`${BASE}/finance/orcamento`);
  check("leaving without Salvar keeps the month", sql(`select safra_start_month from farm where id = ${FARM}`) === String(START));
});

// ---- 13. Copy to the next safra with +5 %, one line skipped; the realizado by API ----
const NEXT = SAFRA + 1;
await step("copy to the next safra", async () => {
  const put = await api("PUT", "/budgets", { safra: NEXT, startMonth: START, category: "admin", months: Array(12).fill(1000), distribution: "manual" });
  check("Administrativo already has an orçado in the next safra (by API)", put.ok(), String(put.status()));
  await goOrc();
  await page.getByRole("combobox", { name: "Safra" }).click();
  await page.getByRole("option", { name: safraLabel(NEXT), exact: true }).click();
  await page.waitForURL(new RegExp(`safra=${NEXT}`));
  await eventually("the next safra: Administrativo only", async () => (await strip())["Orçado"]?.value, eq("R$ 12.000"));
  check("the next safra has not started", (await strip())["Realizado"]?.sub === "a safra ainda não começou", JSON.stringify((await strip())["Realizado"]));
  await visible(page.getByRole("button", { name: "Copiar da safra anterior" })).first().click();
  await dialog().getByRole("heading", { name: "Copiar da safra anterior" }).waitFor();
  check("Copiar de: Orçado by default", (await dialog().getByRole("radio", { name: "Orçado", exact: true }).getAttribute("aria-checked")) === "true");
  check("the dialog names the source safra", norm(await dialog().innerText()).includes(`Copiar da ${lower(safraLabel(SAFRA))}`));
  await dialog().getByLabel("Ajuste (%)").fill("5");
  await eventually("preview: 3 linhas novas · 1 já tem orçamento", async () => norm(await dialog().innerText()).includes("3 linhas novas · 1 já tem orçamento"), eq(true));
  check("preview: the safra's orçado after copying", norm(await dialog().innerText()).includes(`orçado da safra depois de copiar ${reais(126000 + 12000)}`));
  await page.waitForTimeout(300);
  await shot("desk-copiar", page, false);
  await dialog().getByRole("button", { name: "Copiar", exact: true }).click();
  check("toast: 3 linhas copiadas · 1 já tinha orçamento", await toast("3 linhas copiadas · 1 já tinha orçamento"));
  await eventually(
    "copied with +5 % rounded to the centavo; Administrativo kept",
    async () =>
      sameLines(
        Object.fromEntries(Object.entries(lines(NEXT)).map(([k, v]) => [k, { n: v.n, sum: v.sum, min: v.min, max: v.max }])),
        Object.fromEntries(
          Object.entries({ nutrition: line(12, 10500), "Sal mineral": line(12, 3150), "Ração e suplemento": line(12, 5250), admin: line(12, 1000) }).map(([k, v]) => [k, { n: v.n, sum: v.sum, min: v.min, max: v.max }])
        )
      ),
    eq(true)
  );
  await eventually("the page shows the copied orçado", async () => (await strip())["Orçado"]?.value, eq("R$ 138.000"));

  // Task 2: the realizado copy writes one line per grupo with realizado in the source safra, its
  // months stopping at today like every realizado of the contract.
  const res = await api("POST", "/budgets/copy", { from: SAFRA, to: SAFRA + 2, startMonth: START, source: "realized", adjustPct: 0 });
  const json = await res.json().catch(() => null);
  check("copy of the realizado: two grupos copied", res.ok() && json?.copied === 2 && json?.skipped === 0, `${res.status()} ${JSON.stringify(json)?.slice(0, 200)}`);
  const realizedLines = lines(SAFRA + 2);
  check(
    "copy of the realizado: grupo lines only, each the grupo's realizado to date",
    Object.keys(realizedLines).sort().join(",") === "admin,nutrition" && realizedLines.admin.sum === EXP.adm.realized && realizedLines.nutrition.sum === EXP.nut.realized,
    JSON.stringify(realizedLines)
  );

  // A grupo budgeted through a conta only counts as taken: the copy writes no grupo line over it.
  const sal = await api("PUT", "/budgets", { safra: SAFRA + 3, startMonth: START, category: "nutrition", accountId: plan("Sal mineral"), months: Array(12).fill(500), distribution: "manual" });
  check("Sal mineral alone in Nutrição three safras ahead (by API)", sal.ok(), String(sal.status()));
  const over = await api("POST", "/budgets/copy", { from: SAFRA, to: SAFRA + 3, startMonth: START, source: "budgeted", adjustPct: 0 });
  const overJson = await over.json().catch(() => null);
  check("copy over a grupo budgeted through its conta: 2 copied, Nutrição and Sal mineral skipped", over.ok() && overJson?.copied === 2 && overJson?.skipped === 2, `${over.status()} ${JSON.stringify(overJson)?.slice(0, 200)}`);
  const overLines = lines(SAFRA + 3);
  check(
    "… no grupo line of Nutrição written; Sal mineral kept",
    sameLines(overLines, { "Sal mineral": line(12, 500, "manual"), "Ração e suplemento": line(12, 5000, "manual"), admin: line(12, 2000, "manual") }),
    JSON.stringify(overLines)
  );
});

// ---- 14. Remover orçamento do grupo keeps the other lines ----------------------------
await step("remove a grupo's orçamento", async () => {
  await goOrc(SAFRA + 2);
  await visible(page.getByRole("button", { name: "Editar orçamento de Administrativo" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Administrativo" }).waitFor();
  await dialog().getByRole("button", { name: "Remover orçamento do grupo" }).click();
  check("toast: Orçamento de Administrativo removido", await toast("Orçamento de Administrativo removido"));
  await eventually("Administrativo removed from that safra, Nutrição kept", async () => Object.keys(lines(SAFRA + 2)).join(","), eq("nutrition"));
});

// ---- 15. Phone, 390 px ------------------------------------------------------------
await step("phone", async () => {
  await page.setViewportSize(PHONE);
  await goOrc();
  await eventually("phone: the strip", async () => (await strip())["Orçado"]?.value, eq(reais(TOTAL.budgeted)));
  const s = await strip();
  check("phone: Orçado · 2 grupos com orçamento", s["Orçado"]?.sub === "2 grupos com orçamento", s["Orçado"]?.sub);
  check("phone: Realizado · até dd/mm", s[REALIZED_LABEL]?.sub === `até ${ddmm(TODAY)}`, s[REALIZED_LABEL]?.sub);
  check("phone: Variação carries the previsto", s["Variação"]?.sub === `${VARIATION.sub} · previsto ${reais(TOTAL.forecast)}`, s["Variação"]?.sub);
  check("phone: no Previsto cell", s["Previsto até o fim"] === undefined);
  const [a, b, c] = await Promise.all(["Orçado", REALIZED_LABEL, "Variação"].map((label) => cellBox(label)));
  check("phone: strip in two columns, Variação across", a && b && c && Math.abs(a.y - b.y) < 2 && c.y > a.y + 10 && c.width > a.width * 1.8, JSON.stringify([a, b, c]));
  check("phone: no table", (await visible(page.locator("main table")).count()) === 0);
  const pill = await page.getByRole("navigation", { name: "Seções do Financeiro" }).getByRole("link", { name: "Orçamento" }).boundingBox();
  check("phone: the current section's pill is in view", pill && pill.x >= 0 && pill.x + pill.width <= PHONE.width, JSON.stringify(pill));
  for (const [label, e] of [
    ["Nutrição", EXP.nut],
    ["Administrativo", EXP.adm],
  ]) {
    const got = await card(label);
    check(`phone: ${label} card says ${used(e.pct)} · ${WORD[e.tone]}`, got?.lines.includes(`${used(e.pct)} · ${WORD[e.tone]}`), JSON.stringify(got?.lines));
    check(`phone: ${label} card figures`, [whole(e.budgeted), whole(e.realized), whole(e.forecast)].every((v) => got?.lines.includes(v)), JSON.stringify(got?.lines));
    check(`phone: ${label} card is a 44 px target`, (got?.height ?? 0) >= 44, String(got?.height));
  }
  await layoutOk("phone Orçamento", PHONE.width);
  await shot("phone-orcamento");

  await visible(page.locator("main li > button[aria-expanded]").filter({ hasText: "Nutrição" })).first().click();
  await eventually("phone: the card opens to its contas", async () => (await card("Nutrição"))?.expanded, eq("true"));
  const text = await mainText();
  check("phone: the contas under the card", ["Sal mineral", "Ração e suplemento", "Silagem"].every((t) => text.includes(t)));
  await visible(page.getByRole("button", { name: "Editar orçamento de Nutrição" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Nutrição" }).waitFor();
  await page.waitForTimeout(500); // the sheet's zoom and the backdrop blur
  const box = await dialog().boundingBox();
  check("phone: the dialog is a sheet at the bottom", box && Math.abs(box.y + box.height - PHONE.height) < 2 && box.width >= PHONE.width - 1, JSON.stringify(box));
  const m = await Promise.all([0, 1, 2, 3].map((i) => dialog().getByLabel(MONTHS[i].label, { exact: true }).boundingBox()));
  check(
    "phone: the months in 3 columns",
    m.every(Boolean) && Math.abs(m[0].y - m[2].y) < 2 && m[3].y > m[0].y + 10 && Math.abs(m[3].x - m[0].x) < 2,
    JSON.stringify(m)
  );
  check("phone: month inputs are 44 px targets", m.every((r) => r && r.height >= 44), JSON.stringify(m.map((r) => r?.height)));
  await layoutOk("phone sheet", PHONE.width);
  await shot("phone-editar", page, false);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await page.setViewportSize(DESK);
});

// ---- 16. Members ------------------------------------------------------------------
await step("members", async () => {
  const viewer = await openSession(VIEWER);
  await goOrc(undefined, viewer.page);
  await eventually("consultor sees the orçamento", async () => (await tableRow("Nutrição", viewer.page))?.budgeted, eq(whole(EXP.nut.budgeted)));
  check("consultor: no pencil", (await viewer.page.getByRole("button", { name: /^Editar orçamento de/ }).count()) === 0);
  check("consultor: no Copiar", (await viewer.page.getByRole("button", { name: /^Copiar/ }).count()) === 0);
  check("consultor: no Orçar um grupo", (await viewer.page.getByRole("button", { name: "Orçar um grupo" }).count()) === 0);
  check("consultor: Somente leitura", (await mainText(viewer.page)).includes("Somente leitura"));
  const viewerApi = apiOf(viewer.context);
  const list = await viewerApi("GET", `/budgets?safra=${SAFRA}`);
  const rows = await list.json().catch(() => null);
  check("consultor reads the safra's budgets (48 rows)", list.ok() && Array.isArray(rows) && rows.length === 48, `${list.status()} ${Array.isArray(rows) ? rows.length : JSON.stringify(rows)}`);
  const write = await viewerApi("PUT", "/budgets", { safra: SAFRA, startMonth: START, category: "pasture", months: Array(12).fill(1), distribution: "manual" });
  check("consultor cannot write a budget", write.status() === 403, String(write.status()));
  const copy = await viewerApi("POST", "/budgets/copy", { from: SAFRA, to: SAFRA + 4, startMonth: START, source: "budgeted", adjustPct: 0 });
  check("consultor cannot copy", copy.status() === 403, String(copy.status()));
  const remove = await viewerApi("DELETE", `/budgets?safra=${SAFRA}&startMonth=${START}&category=admin`);
  check("consultor cannot remove", remove.status() === 403, String(remove.status()));
  await viewer.context.close();

  const hand = await openSession(HAND);
  const asked = [];
  hand.page.on("request", (r) => {
    if (r.url().includes("/api/herd/budgets")) asked.push(r.url());
  });
  const handApi = apiOf(hand.context);
  const res = await handApi("GET", `/budgets?safra=${SAFRA}`);
  check("vaqueiro: GET /api/herd/budgets is refused", res.status() === 403, String(res.status()));
  const load = await hand.context.request.get(`${BASE}/api/herd`, { headers: { "x-farm-id": String(FARM) } });
  const herd = await load.json().catch(() => null);
  check("vaqueiro: the herd loads without any budget", load.ok() && herd !== null && !("budgets" in herd), `${load.status()} ${herd ? Object.keys(herd).join(",") : ""}`);
  await hand.page.goto(`${BASE}/finance/orcamento`);
  check("vaqueiro: Orçamento is closed", await hand.page.getByText("Porteira fechada").first().waitFor({ timeout: 15000 }).then(() => true, () => false));
  await hand.page.goto(`${BASE}/finance`);
  await hand.page.getByText("Porteira fechada").first().waitFor({ timeout: 15000 }).catch(() => {});
  check("vaqueiro: no band (the Painel is closed)", (await hand.page.locator('section[aria-label="Orçamento da safra"]').count()) === 0);
  await hand.page.goto(`${BASE}/settings`);
  await farmCard(hand.page).waitFor();
  await hand.page.waitForTimeout(1000);
  check("vaqueiro: no page asks for budgets (Orçamento, Painel, Configurações)", asked.length === 0, asked.join(" "));
  await hand.context.close();
});

// ---- 17. A new início da safra regroups the saved months over two safras ----------------
// Rows keep their calendar month: one month later as the start moves the safra's first month into the safra
// before and the next safra's first month into this one. Expected figures come from the rows in the database.
const START2 = (START % 12) + 1;
const safraLabel2 = (s) => (START2 === 1 ? `Safra ${s}` : `Safra ${s}/${String(s + 1).slice(2)}`);
const safraOf2 = (iso) => (Number(iso.slice(5, 7)) >= START2 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);
const monthsOf2 = (safra) =>
  Array.from({ length: 12 }, (_, i) => {
    const at = START2 - 1 + i;
    const year = safra + Math.floor(at / 12);
    const month = (at % 12) + 1;
    return { year, month, key: `${year}-${String(month).padStart(2, "0")}`, label: `${ABBR[month - 1]}/${String(year).slice(2)}` };
  });
/** The grupos' own lines inside a safra of the new start (every budgeted grupo here has one). */
const orcadoIn = (safra) => {
  const m = monthsOf2(safra);
  return Number(sql(`select coalesce(sum(amount_brl), 0) from budgets where farm_id = ${FARM} and account_id is null and month between '${m[0].key}-01' and '${m[11].key}-01'`));
};
const rowsIn = (safra) => {
  const m = monthsOf2(safra);
  return Number(sql(`select count(*) from budgets where farm_id = ${FARM} and month between '${m[0].key}-01' and '${m[11].key}-01'`));
};
await step("a new início regroups", async () => {
  await goOrc();
  await eventually("the Orçamento is in the store", async () => (await strip())["Orçado"]?.value, eq(reais(TOTAL.budgeted)));
  const before = Number(sql(`select count(*) from budgets where farm_id = ${FARM}`));
  // Client-side moves from here on: the store must drop the safras it holds.
  await page.getByRole("link", { name: "Configurações", exact: true }).first().click();
  await page.waitForURL(/\/settings(\?|$)/);
  await farmCard().getByRole("combobox", { name: "Início da safra" }).click();
  await page.getByRole("option", { name: MONTH_NAMES[START2 - 1], exact: true }).click();
  check("the warning before saving", await page.getByText("Os orçamentos guardam seus meses do calendário").waitFor({ timeout: 5000 }).then(() => true, () => false));
  await farmCard().getByRole("button", { name: "Salvar", exact: true }).click();
  check("Dados da fazenda salvos (new início)", await toast("Dados da fazenda salvos"));
  await eventually("farm.safra_start_month moved one month", async () => sql(`select safra_start_month from farm where id = ${FARM}`), eq(String(START2)));
  check("saving the início rewrites no budget", Number(sql(`select count(*) from budgets where farm_id = ${FARM}`)) === before);
  check("no warning once saved", (await page.getByText("Os orçamentos guardam seus meses do calendário").count()) === 0);

  const now = safraOf2(TODAY);
  const m = monthsOf2(now);
  await page.getByRole("link", { name: "Financeiro", exact: true }).first().click();
  await page.waitForURL(/\/finance(\?|$)/);
  const band = page.locator('section[aria-label="Orçamento da safra"]');
  await eventually("Painel band: the safra of the new início", async () => norm(await band.innerText()).replace(/\s+/g, " "), like(new RegExp(`^Orçamento · ${esc(lower(safraLabel2(now)))} · `)));
  await page.getByRole("navigation", { name: "Seções do Financeiro" }).getByRole("link", { name: "Orçamento" }).click();
  await page.waitForURL(/\/finance\/orcamento/);
  await eventually("the months follow the new início (header)", async () => norm(await page.locator("main").innerText()).includes(`${ddmmyyyy(`${m[0].key}-01`)} a ${ddmmyyyy(lastDayOf(m[11]))}`), eq(true));
  await eventually("the current safra's orçado regrouped (its first month left, the next safra's first came in)", async () => (await strip())["Orçado"]?.value, eq(reais(orcadoIn(now))));
  check("… which is not the old figure", orcadoIn(now) !== TOTAL.budgeted, String(orcadoIn(now)));
  await visible(page.getByRole("button", { name: "Editar orçamento de Nutrição" })).first().click();
  await dialog().getByRole("heading", { name: "Orçamento · Nutrição" }).waitFor();
  check("the dialog's first month is the new início's", (await dialog().getByLabel(m[0].label, { exact: true }).inputValue()) === "10.000,00");
  check("the dialog's last month comes from the next safra's rows (copied +5 %)", (await dialog().getByLabel(m[11].label, { exact: true }).inputValue()) === "10.500,00");
  await dialog().getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await page.getByRole("combobox", { name: "Safra" }).click();
  await page.getByRole("option", { name: safraLabel2(now - 1), exact: true }).click();
  await page.waitForURL(new RegExp(`safra=${now - 1}`));
  await eventually("the safra before holds the old first month", async () => (await strip())["Orçado"]?.value, eq(reais(orcadoIn(now - 1))));
  check("… and that is the old safra's first month (Nutrição 10.000 + Administrativo 2.000)", orcadoIn(now - 1) === 12000, String(orcadoIn(now - 1)));
  const list = await api("GET", `/budgets?safra=${now}`);
  const rows = await list.json().catch(() => []);
  check("GET /budgets answers the rows of the new safra's months", list.ok() && rows.length === rowsIn(now) && rows.every((r) => m.some((x) => r.month.startsWith(x.key))), `${rows.length} / ${rowsIn(now)}`);
  await shot("desk-orcamento-reagrupado");
});

check("no page or console errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) console.log(`failed: ${failed.map((r) => r.name).join("; ")}`);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Step 5: Run it**

Run: `BASE=http://localhost:3017 DB=meubov-orcamento-db node ~/.cache/meubov-plan-2026-10-02/smoke.mjs`
Expected: a first line `today … · start month … · Safra … · today's month is #3` (#4 when today is in January), then only PASS lines, then `251/251 checks passed`, exit 0. It takes about two minutes. Do not start it just before midnight in São Paulo: "today" must not change during the run.

A FAIL is either a locator (fix the script, and say so in the report) or a defect (fix the owning task's file, contract "Tasks, waves and files", then Step 2 again). The run deletes and writes rows, so before running again tear down (Step 7) and redo Step 3 — the server goes down with the database too (its pool points at the old container). `fail-*.png` in the shots folder shows the page when a section threw; `server.log` has the API side.

Things the script already handles: money strings carry a no-break space (`norm`); the strip's labels are upper-cased by CSS, so it reads `dt` by `textContent` and values by `innerText`; the table and the phone cards are both in the DOM, so page-level locators go through `visible=true`; dialogs animate, so their screenshots wait 300–500 ms; the store loads after the page paints, so figures are polled (`eventually`).

- [ ] **Step 6: Look at the screenshots against the canvas**

Read each image in `~/.cache/meubov-plan-2026-10-02/shots/` beside its board in `~/.cache/meubov-canvas/gestao/B/out/` (the script waits for the toasts to go before each shot):
- `desk-orcamento.png` ↔ `shot-B-Orcamento-Desktop.png` (header, picker, Copiar, strip, Nutrição open with its contas, bars and % in their tones, previsto in overdue, sparklines, pencils, Total, legend)
- `desk-editar.png` ↔ `shot-B-Orcamento-Edit.png` (the Grupo picker of "Orçar um grupo", total, hint, the three distribution cards, 12 months with bars, the check line, Contas closed, the footer)
- `phone-orcamento.png` ↔ `shot-B-Orcamento-Phone.png` (picker and Copiar, the pills of the sub-navigation with Orçamento in view, the strip in two columns, the cards with pill, bar and figures)
- no board, check against the spec's words: `phone-editar.png` (the sheet, months in 3 columns), `desk-copiar.png`, `desk-painel-band.png` (the band under "Capital, dívidas e sócios"), `desk-fazenda.png` ("Início da safra" and its warning), and the extras `desk-orcamento-vazio.png` (empty safra) and `desk-orcamento-reagrupado.png` (the safra before after the new início)

Small differences from the canvas that follow the app's components are fine (the Select trigger, the toast, the canvas's "Extrato" tab that is now "Lançamentos", Estoque and Patrimônio not there yet). Report what differs beyond the data (the smoke's figures are its own).

- [ ] **Step 7: Tear down**

```bash
kill $(ss -ltnp | grep ':3017 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
docker rm -f meubov-orcamento-db
ss -ltnp | grep -E ':(5447|3017) '; docker ps --format '{{.Names}}' | grep meubov-orcamento
```
Expected: the last two commands print nothing. The repo is as the tasks left it: `git status --short` lists only the plan's files (the smoke wrote nothing inside the repo). Nothing to commit here; the controller makes the single commit afterwards.


---

## Amendments after the whole-change review

The plan above was executed literally in a sandbox clone and its result brought to `main`. A fresh reviewer then read the whole change; these fixes came out of that review, each test-first, and are part of the change though no task section above shows them.

- `lib/api/domains/budgets/**`, `lib/store/useHerdStore.ts` — `PUT` and `DELETE /budgets` and `POST /budgets/copy` carry `startMonth` (1–12) beside the safra; the use cases answer 409 `{ error: "start_month_changed" }` and write nothing when the farm's differs. The store sends its `farm.safraStartMonth`, and on that answer toasts "O início da safra mudou em outra sessão; os orçamentos foram recarregados.", reloads the herd, empties `budgets` and rethrows, so the page reads its safra again. A session left open across another one's change wrote its months onto the wrong calendar months.
- `lib/store/useHerdStore.ts`, `components/finance/orcamento/OrcamentoPage.tsx` — `loadBudgets` rejects without a toast on a network failure or while the store is offline (`networkFailed(error) || offline`, as the anexo flow); the page's empty state then reads "Sem conexão: o orçamento precisa de sinal. Tente de novo quando conectar.", the Painel band and the farm form show nothing. Opening the Painel or Configurações without signal toasted an error.
- `lib/domain/budget.ts` — the tone (lines, totals, band) comes from the % rounded to the integer shown: up to 90 brand, 91–100 attention, above overdue; `over` lists the overdue grupos. 100,4 % read "100 %" in overdue and 90,4 % "90 %" in attention. The table's legend reads "91 a 100 %".
- `lib/api/domains/budgets/budgetLine.ts` — `lineRows` stores each month as `cents(amount)`. A client could store 8,333.
- `components/settings/FarmDataForm.tsx`, `lib/store/useHerdStore.ts` — the form sends `safraStartMonth` only when the user moved it (`saveFarm` takes it optional). A form opened before another session's change put the old início back with any edit of the name.
- `components/finance/orcamento/OrcamentoPage.tsx` — `?safra=` outside 2000–2100 falls back to the current safra, and the safra before 2000 is never asked for (the previous safra of 2000). The API refuses those years with a 422, which toasted.
- `lib/domain/budget.ts` — a grupo or conta with neither orçado nor realizado but with despesas dated in the safra after today stays in the view ("sem orçamento"). A recorrência starting next month in an unbudgeted grupo never reached its row's "Previsto até o fim".
- `lib/domain/budget.ts`, the spec's "Previsto até o fim" — each month from today's on is the larger of its orçado and its despesas already generated, the current month's rule for every later one. A small recorrência hid a month's orçado (Nutrição março counted 300 against 1.000).
- `lib/domain/budget.ts`, `components/finance/orcamento/OrcamentoPage.tsx` — the totals (Total row, the strip, the Painel band) add up the grupos with a budget only; the grupos without one keep their rows. The Orçado figure's sub reads "N grupos com orçamento". A farm budgeting two grupos read "acima do orçado" for Sanidade's treatments.
- `lib/domain/budget.ts` — `copyPlan` counts a grupo as budgeted in the target when it has own rows or any of its contas has rows there. "Copiar" wrote a grupo line over a grupo budgeted through its contas.
- `lib/api/domains/farm/**`, `components/settings/FarmDataForm.tsx` — `PUT /farm` with a `safraStartMonth` that differs from the stored one asks Financeiro edit too: 403 `{ error: "forbidden", area: "finance" }` otherwise (`SaveFarmUseCase` takes `canEditFinance`, the controller passes `can(permissions, "finance", "edit")`; the route's requirement stays Fazenda edit). The form shows the "Início da safra" select only with `useCan("finance", "edit")`, the month as read-only text otherwise. A Fazenda editor without Financeiro could regroup the whole orçamento.

Counts after the fixes: tsc clean; eslint clean on every changed file; `vitest run lib components app --exclude '**/worktrees/**'` 181 files, 1794 tests.
