# Financeiro — lançamentos pelo plano de contas e investimentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Financeiro keeps the money that is neither custo nor receita (investimentos, aplicações, financiamentos, sócios) and shows every lançamento the ADM Rural way: the plano de contas as a tree, the saldo and extrato of the picked conta beside it, one toolbar acting on the picked lançamento.

**Architecture:** `Expense.kind` gains four kinds and says what the money is; the direction is derived by `entryFlow` (`lib/domain/entries.ts`). The resultado reads the kind (COE = despesas only), everything that follows money reads the direction. A pure module, `lib/domain/planTree.ts`, turns the store's data into the tree, the rows and the figures of each nó; `/finance/lancamentos` renders it and replaces `/finance/extrato`, which redirects.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/` first), React, Tailwind, Zustand, Elysia + Eden, Drizzle + Postgres, vitest, Playwright for the smoke.

**Spec:** `docs/superpowers/specs/2026-10-01-financeiro-lancamentos-investimentos-design.md`

## Global Constraints

- Work on `main` in place. No commits until the controller's single commit at the end; never `git add -A`, never stash, never touch a file outside the task's list.
- This Next.js has breaking changes: read the guide in `node_modules/next/dist/docs/` before writing a page, a route or a redirect.
- No new dependency.
- Copy in pt-BR with pt-BR numbers (`formatCurrency`, `formatNumber`, `formatDate`); code, names and comments in English, in the voice of the surrounding files. No emoji.
- Phone targets ≥ 44 px (`min-h-11`), compact on md+; real `<button>`, `<a>`, `<label>`; `aria-label` on icon-only buttons.
- The seven grupos of the COE stay fixed. The COE counts only `kind = expense`; the receita only `kind = revenue`.
- A row of the new kinds stores `category = 'other'` and no lote; a rendimento stores no conta do plano, no vencimento, `paid_at = date` and an aplicação as its conta bancária.
- No CHECK constraint may mention a new enum value in the migration that adds it (Postgres refuses to use an enum value inside the transaction that created it).
- Reads need Financeiro view, writes Financeiro edit, every query filters by farm; a member without Financeiro receives no lançamento and no saldo inicial.
- Tests: `pnpm exec vitest run <explicit paths>` (a bare run also collects `.claude/worktrees/*`). Types: `pnpm exec tsc --noEmit`. Lint: `pnpm exec eslint <files>`. The two route snapshots update with `-u` on their two paths only.
- Tasks of one wave run in parallel on disjoint files; waves run in order: 1 · 2–5 · 6–7 · 8–12 · 13.

## Review Focus

1. A nó in the URL that no longer exists or is malformed (`conta:<deleted>`, `banco:`, `grupo:nope`) falls back to "todos" instead of crashing. Tests in tasks 6 and 10.
2. Saldo devedor ignores a liberação still pending and every line paid on or before the conta's opening date. Test in task 6.
3. Old `/finance/extrato` links (`grupo=capital`, `tipo=treatment`, `conta=<account id>`, `status=overdue`, unknown values) land on the right nó. Tests in tasks 6 and 10.
4. Parcelar: a total whose centavos do not divide, more parcelas than centavos, a paid row, a row of a série, a rendimento. Tests in task 4.
5. A capital lançamento with no movimento, an entrada sent to a cartão, and an edit that changes the kind while the conta still belongs to the old group. Tests in task 4.

## Names and signatures every task shares

### Model (decided)

`Expense.kind` says what the money is; the direction is derived.

```ts
// lib/types.ts
export type EntryKind = "expense" | "revenue" | "investment" | "financing" | "partners" | "yield";
export type EntryFlow = "in" | "out";
/** The three groups outside the resultado that hold contas do plano. */
export type CapitalGroup = "investment" | "financing" | "partners";
export type AccountGroup = ExpenseCategory | "revenue" | CapitalGroup;
export type BankAccountKind = "checking" | "cash" | "card" | "investment";

interface Expense {
  // ...existing fields
  /** Movimento of an investment, financing or partners row; absent on the others. */
  flow?: EntryFlow;
}
interface Account {
  // ...existing fields
  /** Financing only: saldo devedor at the end of `openingDate`. */
  openingBalanceBrl?: number;
  openingDate?: string;
}
```

DB: `entry_kind` += `investment, financing, partners, yield`; `account_group`
+= `investment, financing, partners`; `bank_account_kind` += `investment`;
new enum `entry_flow ('in','out')`; `expenses.flow` and `expense_series.flow`
(nullable); `accounts.opening_balance_brl` (numeric, nullable) and
`accounts.opening_date` (date, nullable).

Rows of the new kinds store `category = 'other'`, `lot_id = null`. A `yield`
row stores `flow = null`, `account_id = null`, `due_date = null`,
`paid_at = date` and the aplicação in `bank_account_id`.

```ts
// lib/domain/entries.ts  (task 1)
export const CAPITAL_GROUPS: readonly CapitalGroup[];            // investment, financing, partners
export function isCapitalKind(kind: EntryKind): kind is CapitalGroup;
/** in: receita, rendimento, and a capital row whose flow is "in". Capital rows without flow are "out". */
export function entryFlow(e: { kind: EntryKind; flow?: EntryFlow | null }): EntryFlow;
export function isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean;
/** The COE takes only these. */
export function isCost(e: { kind: EntryKind }): boolean;        // kind === "expense"
/** The receita takes only these. */
export function isRevenue(e: { kind: EntryKind }): boolean;     // kind === "revenue"
/** Grupo of the plano a lançamento sits in; null for a rendimento. */
export function entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null;
export const ENTRY_KIND_LABEL: Record<EntryKind, string>;        // Despesa, Receita, Investimento, Financiamento, Sócios, Rendimento
export const FLOW_LABEL: Record<CapitalGroup, Record<EntryFlow, string>>;
//   investment: out "Compra", in "Venda do bem"; financing: out "Pagamento", in "Liberação"; partners: out "Retirada", in "Aporte"
/** Which conta bancária kinds may pay or receive a lançamento. */
export function mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean;
//   card: a despesa, or an investment that is not an inflow. investment (aplicação): only a yield.
//   checking, cash: everything except a yield.
```

```ts
// lib/domain/accounts.ts  (task 1)
export const EXPENSE_GROUPS: readonly ExpenseCategory[];         // the seven, screen order
export const ACCOUNT_GROUPS: readonly AccountGroup[];            // revenue, the seven, then CAPITAL_GROUPS
export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string>;  // + Investimentos, Financiamentos, Sócios
export const DEFAULT_ACCOUNTS;                                    // + Benfeitorias, Máquinas e implementos, Equipamentos (investment), Distribuição de lucro (partners)
// lib/domain/bankAccounts.ts
BANK_ACCOUNT_KIND_LABEL.investment = "Aplicação";
```

### Domain signatures

```ts
// lib/domain/ledger.ts  (task 2)
export type LedgerKind = EntryKind | "sale" | "purchase" | "treatment";
interface LedgerRow {
  // existing fields, plus:
  /** Money in: receitas, vendas, rendimentos and capital rows that enter. */
  inflow: boolean;
}
// `group` keeps the type `AccountGroup | "capital"`: a capital lançamento carries its
// own group; "capital" stays for what has no group of the plano — compras de gado
// (groupLabel "Investimentos", account "Compra de gado") and rendimentos
// (groupLabel "Rendimento", account null).
// entryStatus, matchesStatusChoice, cashSummary and pendingBills go by direction and take every kind.
// ledgerSummary is unchanged (it already reads the kinds it sums).

// lib/domain/bankAccounts.ts  (task 2)
export type BankMoveKind = EntryKind | "sale" | "purchase" | "transferIn" | "transferOut";
export function payingAccounts(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow | null): BankAccount[]; // by mayPayFrom

// lib/domain/statements/match.ts (task 2): a candidate's side is entryFlow, never `kind === "revenue"`.

// lib/domain/economics.ts, lotEconomics.ts (task 3): cost = isCost, revenue = isRevenue.
// lib/domain/moneyRedaction.ts (task 3): redactHerdMoney also strips openingBalanceBrl and openingDate from accounts.
```

```ts
// lib/domain/planTree.ts  (task 6)
export type PlanNode =
  | { type: "all" }
  | { type: "banks" }
  | { type: "bank"; id: string }
  | { type: "group"; group: CapitalGroup | "expenses" | "revenue" | ExpenseCategory } // "expenses" = the whole COE
  | { type: "account"; id: string }
  | { type: "auto"; which: "purchases" | "sales" };

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<category> · conta:<id> · compra-de-gado · venda-de-gado. */
export function nodeParam(node: PlanNode): string;
export function parseNode(param: string | null | undefined): PlanNode | null;   // null: absent or unknown
/** The old Extrato filters (?tipo, ?grupo, ?conta=<account id>) as a nó; null when none was set. */
export function legacyNode(params: { tipo?: string | null; grupo?: string | null; conta?: string | null }): PlanNode | null;

export interface PlanInputs extends LedgerInputs { bankAccounts: BankAccount[]; transfers: Transfer[] }

export interface TreeItem {
  node: PlanNode;
  key: string;               // nodeParam(node)
  label: string;
  /** What the figure is, on the six top groups: "saldo", "no período", "devedor", "retirado", "custo (COE)". */
  tag?: string;
  amountBrl: number;         // 0 shows "—"
  bankKind?: BankAccountKind;
  /** Written by the manejos (Compra de gado, Venda de gado). */
  locked?: boolean;
  archived?: boolean;
  children?: TreeItem[];     // present (maybe empty) on what can open
}
/** The six top groups in order: banks, investment, financing, partners, expenses, revenue. */
export function planTree(inputs: PlanInputs, period: Period, todayIso: string): TreeItem[];

/** Saldo devedor of a conta de financiamento at the end of `day`. */
export function debtBalance(account: Account, expenses: Expense[], day: string): number;

export interface PaneRow {
  id: string;                // ledger row id, or the transferência id
  /** Payment day on a conta bancária; competência everywhere else. */
  date: string;
  history: string;           // who or what: counterparty, else notes, else the conta or grupo name
  detail: string | null;     // documento, parcela, "manejo · 24 animais · 512 @"
  contra: string | null;     // contra partida
  contraGroup: string | null;
  amountBrl: number;         // signed: + entra, − sai
  /** Saldo after the line (conta bancária) or saldo devedor after it (conta de financiamento, paid lines); else null. */
  balance: number | null;
  ledger: LedgerRow | null;  // null for a transferência
  transfer: Transfer | null;
}
/** Newest first. */
export function nodeRows(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): PaneRow[];
export function filterPaneRows(rows: PaneRow[], filter: { lotId: string | "farm" | "all"; pendingOnly: boolean; search: string }): PaneRow[];

export type FigureTone = "ink" | "healthy" | "attention" | "overdue" | "scheduled";
export interface Figure { label: string; /** BRL unless `text` is set. */ amountBrl: number | null; text?: string; sub: string; tone: FigureTone }
export interface NodeSummary {
  /** "Bancos e caixa", "Despesas › Nutrição"; null on a top group and on "todos". */
  crumb: string | null;
  title: string;
  /** "conta corrente", "principal", "investimento", "fora do custo (COE)"… */
  pills: { text: string; tone: "muted" | "brand" | "scheduled" | "fmd" }[];
  figures: Figure[];         // always four
  /** A financiamento: 0–1 of what was owed that is paid; else undefined. */
  paidShare?: number;
  bank?: BankAccount;        // the conta bancária of a bank nó
  account?: Account;         // the conta do plano of an account nó
}
/** null when the nó points at something that no longer exists. */
export function nodeSummary(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): NodeSummary | null;

/** What "Novo" starts with on a nó. */
export interface EntryInitial { kind?: EntryKind; flow?: EntryFlow; category?: ExpenseCategory; accountId?: string; bankAccountId?: string }
export function entryInitialFor(node: PlanNode, accounts: Account[]): EntryInitial;

/** The Painel's "Capital, dívidas e sócios". */
export interface CapitalSummary {
  invested: number; investedAssets: number; investedCattle: number;
  applications: number; yieldInPeriod: number;
  debt: number; debtAccounts: number; nextInstallment: { dueDate: string; amountBrl: number } | null;
  withdrawn: number;
}
export function capitalSummary(inputs: PlanInputs, period: Period, todayIso: string): CapitalSummary;
```

### API

```
POST  /expenses            body += kind (six literals), flow?: "in" | "out"
PATCH /expenses/:id        body += flow?: "in" | "out"
POST  /expenses/:id/split  body { count: 2..48, frequency: "monthly" | "weekly", startsOn: DateString }
                           200 Expense[] (first position first) · 404 not_found ·
                           400 not_splittable | invalid_repeat | due_before_date
POST  /accounts            body group: any AccountGroup; + openingBalanceBrl?: number ≥ 0, openingDate?: DateString
PATCH /accounts/:id        body += openingBalanceBrl?: number | null, openingDate?: string | null
POST/PATCH /bank-accounts  kind += "investment"
```

New 400 codes: `invalid_account` (a capital kind without a conta, or with a
conta of another farm or group; a despesa/receita whose conta belongs to a
capital group; a yield with a conta), `invalid_opening` (saldo inicial
without its date or the reverse, or on a group that is not financing).
`invalid_bank_account` also covers `mayPayFrom` saying no. A capital kind
without `flow` is stored as `out`. Route requirement:
`"POST /api/herd/expenses/:id/split": edit("finance")`.

```ts
// lib/api/domains/bankAccounts/payingAccount.ts (task 4)
export async function isPayingAccount(repo, farmId, bankAccountId, kind: EntryKind, allowArchived = false, flow: EntryFlow | null = null): Promise<boolean>;
// lib/api/domains/expenses/entryRules.ts (task 4)
/** The row as it will be stored (category, lot, flow, conta, dates normalised) or the refusal. */
export async function normaliseEntry(repo, farmId, entry): Promise<NormalisedEntry | "invalid_account">;
```

### Store (task 7)

```ts
splitExpense: (id: string, input: { count: number; frequency: SeriesFrequency; startsOn: string }) => Promise<Expense[]>;
addAccount: (input: { group: AccountGroup; name: string; openingBalanceBrl?: number; openingDate?: string }) => Promise<Account | null>;
updateAccount: (id: string, patch: { name?: string; archived?: boolean; openingBalanceBrl?: number | null; openingDate?: string | null }) => Promise<boolean>;
// ExpensePatch gains `flow?: EntryFlow`. addExpense keeps its signature (Expense carries flow).
```

### UI components

```tsx
// components/finance/EntryDialog.tsx (task 8)
EntryDialog({ open, onOpenChange, expense?, defaultKind?, fromLine?, onResolved?,
  initial?: EntryInitial,      // "Novo" on a picked nó
  template?: Expense })        // Duplicar: a new lançamento filled from this one (today, pending, no anexos, no repeat)
// A yield (expense or template of kind "yield", or initial.kind "yield") renders the YieldDialog form instead.
// components/finance/YieldDialog.tsx (task 8)
YieldDialog({ open, onOpenChange, bankAccountId: string, expense?: Expense })

// components/finance/plano/NewAccountDialog.tsx (task 9) — replaces AccountDialog.tsx
export type AccountPlace = "bank" | CapitalGroup | "expense" | "revenue";
NewAccountDialog({ open, onOpenChange, defaultPlace?: AccountPlace, defaultCategory?: ExpenseCategory })
// "Banco ou caixa" hands over to the existing BankAccountDialog.

// components/finance/lancamentos/ (tasks 10 and 11)
// task 10: LancamentosPage.tsx, PlanTreeNav.tsx, NodePane.tsx
// task 11: PaneRows.tsx, LancamentosToolbar.tsx, RowSheet.tsx, SplitDialog.tsx, useEntryActions.tsx, pills.tsx
PaneRows({ node: PlanNode, rows: PaneRow[], view: "extrato" | "detalhado",
  selectedId: string | null, onSelect(id: string | null): void,
  page: number, onPageChange(page: number): void })
//   md+: a table, 50 rows a page, a radio per row. Phone: a list that grows by 50, tapping a row opens RowSheet.
LancamentosToolbar({ node: PlanNode, row: PaneRow | null, onPrint(): void, onDone(): void })
//   md+ only. onDone after a change that may have removed or replaced the picked row.
// pills.tsx: LedgerKindPill, LedgerStatusPill, LedgerAmount (moved from extrato/ExtratoTable.tsx).

// components/finance/CapitalStrip.tsx (task 12)
CapitalStrip({ summary: CapitalSummary, period: Period, resultBrl: number })
```

URL of `/finance/lancamentos`: `de`, `ate`, `conta` (nó; absent = "todos" on
md+, the tree alone on the phone), `visao=detalhado` (absent = extrato),
`lote`, `status=pendentes`, `q`, `pagina`.

### Amendments found while verifying (these win over the signatures above)

- task 6: `entryInitialFor(node, accounts, bankAccounts: BankAccount[] = [])` — third argument added so a bank nó that is an aplicação starts a rendimento. Tasks 10 and 11 pass `bankAccounts`.
- task 6: in the "bancos" nó a transferência is two rows (one per side) with ids `${transfer.id}:${bankAccountId}`; in a single bank nó the id is the transfer id. Row actions must read `row.transfer.id`, never parse `row.id`.
- task 6: strips the spec leaves open — "bancos": Saldo em contas · Entradas · Saídas · Cartões; "todos": fourth figure "Fora do resultado" = entradas − saídas of capital, rendimento and compra rows.
- task 6: rows of every nó except a bank are sorted by `date` desc, then vencimento desc. Every row except a transferência carries `ledger`.
- task 10: `resolveNode(param, inputs, period, today)` lives in `components/finance/lancamentos/legacySearch.ts`. `NodePane` renders `<PaneRows key=…>` keyed by nó, window and filters.
- task 11: `useEntryActions(row, node, onDone?)`; `InstallmentPreview` is exported from `components/finance/RepeatSection.tsx` (one-line change owned by task 11); `RowSheet` imports task 10's `paneExportTable`. The toolbar renders for view-only members too (Ver anexos, Imprimir only).
- task 8: pure helpers in `components/finance/entryFields.ts` (`initialFields`, `withKind`, `entryValues`). Duplicar on a rendimento opens a blank "Lançar rendimento" on the same aplicação.
- task 9: `openingFromFields(amount, date)` exported from `NewAccountDialog.tsx`.
- task 1: also touches `lib/domain/ledger.ts` (one `as LedgerKind` cast, task 2 drops it), `lib/store/useHerdStore.ts` (three `as Parameters<…>[0]` casts on POST bodies, task 7 drops them), `components/finance/contas/AccountCard.tsx` (`ICON.investment = PiggyBank`, `DEFAULT_LABEL.investment = "aplicação"`), `components/finance/extrato/ExtratoFilters.tsx` (Grupo select keeps Receitas + the seven), `lib/data/seed.ts` (`SEED_ACCOUNTS` gains `acc-investment-benfeitorias`, `acc-investment-maquinas-e-implementos`, `acc-investment-equipamentos`, `acc-partners-distribuicao-de-lucro`) and `lib/api/__tests__/mappers.test.ts`.
- task 2: `matchesStatusChoice(row: Pick<LedgerRow, "inflow" | "status">, choice)` (was `"kind" | "status"`). A venda row now carries `account: "Venda de gado"` (a compra `"Compra de gado"`, groupLabel "Investimentos"). `KIND_TAB_LABEL` in `ExtratoFilters.tsx` became `Partial<…>` (file dies in task 11). `KIND_PILL` in `ExtratoTable.tsx` gained investimento/financiamento/sócios/rendimento; task 11's `pills.tsx` should carry those four entries over.
- task 4: `normaliseEntry(repo, farmId, entry: EntryInput): Promise<NormalisedEntry | "invalid_account" | "invalid_bank_account">` (also refuses a rendimento without its aplicação). `NormalisedEntry = { kind; flow: EntryFlow | null; category; dueDate: string | null; paidAt: string | null; accountId: string | null; lotId: string | null }`. Split lives in `SplitExpenseUseCase` (`lib/api/domains/expenses/useCases/Split.useCase.ts`); Eden call `api.expenses({ id }).split.post({ count, frequency, startsOn })`. Schema exports `EntryFlowModel`, `SplitExpenseBody`. `ExpensePatchInput.flow?: EntryFlow`. A série edit with scope following/all shares `flow` to the template and unpaid rows; a kind change reaches the edited row only. POST /expenses with a yield + `repeat` answers 400 `invalid_repeat`.
- task 4: also touches `lib/api/domains/statements/statements.controller.ts` (`invalid_account: 400` in `REFUSAL_STATUS`; `ResolveRefusal` gains `"invalid_account"`) and `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` (one queued select: AddExpense reads the group of the conta it gets).
- task 5: new 400 code `investment_cannot_be_main` on POST/PATCH `/bank-accounts` (an aplicação is never the conta principal, even as the farm's first conta; card fields are ignored on it). `validOpening(group, balance, date)` is exported from `lib/api/domains/accounts/useCases/Add.useCase.ts`. `invalid_opening` is checked on PATCH against the conta as it will be after the patch (so clearing only one half is refused). Duplicate names still answer 409 `duplicate_name`.
- task 3: also touches `lib/api/__tests__/permissions.test.ts` (its mocked herd gains a financing conta with saldo inicial; `redactHerdMoney` now maps `accounts`, and the vaqueiro test asserts the saldo inicial is stripped).
- task 7: drops task 1's three `as Parameters<…>[0]` casts; `apiFail` knows `invalid_account`, `invalid_opening`, `investment_cannot_be_main`; `splitExpense` toasts `not_splittable | invalid_repeat | due_before_date` itself and throws.
- task 6: `PaneRow.detail` joins with " · " the observação, the documento (a manejo row's "manejo · N animais · X @") and the parcela, leaving out whichever is already `history`. An investimento reads "Agro Máquinas Uberaba" over "Trator MF 4275 · NF 2.871". Task 11 renders `detail` as is and never adds `notes` again.
- task 8: `PaidByField` takes `flow?: EntryFlow`; `defaultPaidBy(accounts, kind, flow?)` and `paidByOptions(accounts, kind, value, flow?)` take it too. `LancarButton` takes `initial?: EntryInitial`. Test file `components/finance/__tests__/entryFields.test.ts`. EntryDialog says "Começa na conta escolhida…" only when `initial` carries a kind or a conta bancária, so passing `entryInitialFor(...)` = `{}` on todos / Bancos e caixa is fine.
- task 9: `components/finance/contas/AccountCard.tsx` keeps one line for task 9 (an aplicação shows "sem extrato" like the caixa); task 1 already did its icon and label. `ContasPage` also offers "Lançar rendimento" on a picked aplicação through `EntryDialog initial={{ kind: "yield", bankAccountId }}` (needs task 8). `AccountsPage` imports `debtBalance` from `@/lib/domain/planTree`.
- task 10: the two columns start at `xl`, not `md`: beside the sidebar a 300 px tree leaves the pane too narrow below 1280 px. Below `xl` (phones and tablets) `conta` absent shows the tree alone and a picked nó its pane with "Plano de contas" back (`max-xl:hidden` / `xl:hidden`); the toolbar, the md+ table and the FAB keep the `md` boundary. `conta` absent = "todos" on xl+.
- task 11: `pills.tsx` exports only `LedgerStatusPill`; `LedgerKindPill` and `LedgerAmount` had no reader left and go with `extrato/`. `useEntryActions` passes `bankAccounts` to `entryInitialFor`. PaneRows renders `row.detail` under the history in Extrato and Detalhado (no parcela chip in the md+ table, the phone list keeps it); a row's radio is named `Selecionar <history>, <detail>, <dd/mm/aaaa>`.

## Tasks, waves and files


Wave 1
1. **Foundation** — `lib/types.ts`, `lib/db/schema.ts`, `drizzle/0024_*`
   (+ meta), `lib/api/mappers.ts`, `lib/domain/entries.ts`,
   `lib/domain/accounts.ts`, tests `lib/domain/__tests__/entries.test.ts`,
   `accounts.test.ts`. Compile fixes: `BANK_ACCOUNT_KIND_LABEL` in
   `lib/domain/bankAccounts.ts`; `EXPENSE_GROUPS` import in
   `components/finance/plano/AccountsPage.tsx`; the group select of
   `components/finance/plano/AccountDialog.tsx` keeps offering only Receitas
   and the seven.

Wave 2 (parallel)
2. **Ledger, contas and conciliação by direction** — `lib/domain/ledger.ts`,
   `lib/domain/bankAccounts.ts`, `lib/domain/statements/match.ts`,
   `lib/export/datasets/finance.ts`, their tests. Compile fix: `KIND_PILL`
   in `components/finance/extrato/ExtratoTable.tsx`.
3. **Resultado reads the kind** — `lib/domain/economics.ts`,
   `lib/domain/lotEconomics.ts`, `lib/domain/moneyRedaction.ts`,
   `components/finance/CostBreakdownCard.tsx` (the cost filter only), tests.
4. **Lançamentos API** — `lib/api/domains/expenses/**`,
   `lib/api/domains/bankAccounts/payingAccount.ts`,
   `lib/api/domains/statements/useCases/ResolveLine.useCase.ts` (side check),
   `lib/api/permissions/routeRequirements.ts`, the two snapshots, tests.
5. **Plano de contas and contas bancárias API** —
   `lib/api/domains/accounts/**`, `lib/api/domains/bankAccounts/schemas/**`,
   `lib/api/domains/bankAccounts/useCases/{AddBankAccount,UpdateBankAccount}.useCase.ts`,
   tests.

Wave 3 (parallel)
6. **Plan tree** — `lib/domain/planTree.ts`, `lib/domain/__tests__/planTree.test.ts`.
7. **Store** — `lib/store/useHerdStore.ts`.

Wave 4 (parallel)
8. **Novo lançamento** — `components/finance/EntryDialog.tsx`,
   `components/finance/YieldDialog.tsx`,
   `components/finance/contas/PaidByField.tsx`,
   `components/finance/contas/useMarkPaid.tsx`,
   `components/finance/contas/MovementAccountDialog.tsx`,
   `components/finance/LancarButton.tsx`.
9. **Contas** — `components/finance/plano/NewAccountDialog.tsx` (new),
   `components/finance/plano/AccountDialog.tsx` (deleted),
   `components/finance/plano/AccountsPage.tsx`,
   `components/finance/contas/BankAccountDialog.tsx`,
   `components/finance/contas/AccountCard.tsx`,
   `components/finance/contas/ContasPage.tsx`.
10. **Lançamentos page** — `app/(app)/finance/lancamentos/page.tsx` (new),
    `app/(app)/finance/extrato/page.tsx` (becomes the redirect),
    `components/finance/lancamentos/{LancamentosPage,PlanTreeNav,NodePane}.tsx`,
    `components/finance/FinanceSubnav.tsx`, `paneExportTable` in
    `lib/export/datasets/finance.ts`.
11. **Rows and toolbar** —
    `components/finance/lancamentos/{PaneRows,LancamentosToolbar,RowSheet,SplitDialog,useEntryActions,pills}.tsx`,
    `components/finance/extrato/*` (deleted), `BOTTOM_SHEET` moved to
    `components/ui/bottom-sheet.ts` with `components/offline/SyncSheet.tsx`
    importing it from there.
12. **Painel** — `components/finance/CapitalStrip.tsx` (new),
    `app/(app)/finance/page.tsx`, `components/finance/CashStrip.tsx`,
    `components/finance/BillsCard.tsx`,
    `components/finance/RecentEntriesCard.tsx`,
    `components/finance/CostBreakdownCard.tsx` (the link),
    `components/finance/SeriesScopeDialog.tsx`,
    `components/finance/contas/ConciliarPage.tsx`,
    `components/finance/contas/AccountMovements.tsx`.

Wave 5
13. **Whole-change review and smoke** on a throwaway database (see the
    memory note "MeuBov smoke-test setup": tmpfs Postgres on its own port,
    migrate from zero, `teste.*` user, seed, headless Playwright).

---

### Task 1: Foundation

**Files:**
- Create: `lib/domain/entries.ts`
- Create (generated): `drizzle/0024_financeiro-investimentos.sql`, `drizzle/meta/0024_snapshot.json`
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`
- Modify (generated): `drizzle/meta/_journal.json`
- Modify: `lib/api/mappers.ts`
- Modify: `lib/domain/accounts.ts`
- Modify: `lib/data/seed.ts` — `SEED_ACCOUNTS` gains the four new default contas
- Modify (compile fix): `lib/domain/bankAccounts.ts` — `BANK_ACCOUNT_KIND_LABEL.investment`
- Modify (compile fix): `lib/domain/ledger.ts` — one cast, line 125 (task 2 owns the file)
- Modify (compile fix): `lib/store/useHerdStore.ts` — three casts in `addExpense`, `addAccount`, `addBankAccount` (task 7 owns the file)
- Modify (compile fix): `components/finance/contas/AccountCard.tsx` — `ICON` and `DEFAULT_LABEL` gain `investment` (task 9 owns the file)
- Modify (keep behaviour): `components/finance/plano/AccountsPage.tsx` — imports `EXPENSE_GROUPS`
- Modify (keep behaviour): `components/finance/plano/AccountDialog.tsx` — the select keeps Receitas and the seven
- Modify (keep behaviour): `components/finance/extrato/ExtratoFilters.tsx` — the Grupo select keeps Receitas and the seven
- Test: `lib/domain/__tests__/entries.test.ts` (new), `lib/domain/__tests__/accounts.test.ts`, `lib/api/__tests__/mappers.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `lib/types.ts`: `EntryKind = "expense" | "revenue" | "investment" | "financing" | "partners" | "yield"`; `EntryFlow = "in" | "out"`; `CapitalGroup = "investment" | "financing" | "partners"`; `AccountGroup = ExpenseCategory | "revenue" | CapitalGroup`; `BankAccountKind = "checking" | "cash" | "card" | "investment"`; `Expense.flow?: EntryFlow`; `Account.openingBalanceBrl?: number`; `Account.openingDate?: string`.
  - `lib/db/schema.ts`: `entryFlowEnum` (`entry_flow`); `expenses.flow` and `expenseSeries.flow` (`EntryFlow | null` in `ExpenseRow` / `ExpenseSeriesRow`); `accounts.openingBalanceBrl` (`number | null`) and `accounts.openingDate` (`string | null`) in `FarmAccountRow`; the three enums widened.
  - `lib/api/mappers.ts`: `toExpense` sets `flow` (undefined when null); `toAccount` sets `openingBalanceBrl` and `openingDate` (undefined when null).
  - `lib/domain/entries.ts`: `CAPITAL_GROUPS: readonly CapitalGroup[]`; `isCapitalKind(kind: EntryKind): kind is CapitalGroup`; `entryFlow(e: { kind: EntryKind; flow?: EntryFlow | null }): EntryFlow`; `isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean`; `isCost(e: { kind: EntryKind }): boolean`; `isRevenue(e: { kind: EntryKind }): boolean`; `entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null`; `ENTRY_KIND_LABEL: Record<EntryKind, string>`; `FLOW_LABEL: Record<CapitalGroup, Record<EntryFlow, string>>`; `mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean`.
  - `lib/domain/accounts.ts`: `EXPENSE_GROUPS: readonly ExpenseCategory[]`; `ACCOUNT_GROUPS` (revenue, the seven, investment, financing, partners); `ACCOUNT_GROUP_LABEL` (+ Investimentos, Financiamentos, Sócios); `DEFAULT_ACCOUNTS` (29 rows).
  - `lib/domain/bankAccounts.ts`: `BANK_ACCOUNT_KIND_LABEL.investment === "Aplicação"`.
  - Temporary shims later tasks remove or overwrite: `kind: e.kind as LedgerKind` in `ledger.ts` (task 2 widens `LedgerKind` and drops the cast); `as Parameters<…>[0]` in three store actions (no-ops once tasks 4 and 5 widen the API bodies; task 7 may drop them); `["revenue" as const, ...EXPENSE_GROUPS]` in `AccountDialog.tsx` and `ExtratoFilters.tsx` (both files are deleted by tasks 9 and 11).

After this task alone, `pnpm exec tsc --noEmit` is clean and the app behaves as before: the API still refuses the new kinds, groups and bank kinds (tasks 4 and 5 widen it), and no screen offers them.

---

- [ ] **Step 1: Write the failing mapper test**

`lib/api/__tests__/mappers.test.ts` — four Replace blocks.

Replace:
```ts
/**
 * toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20").
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 */
```
with:
```ts
/**
 * toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20").
 * toAccount: a financiamento carries its saldo inicial.
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 */
```

Replace:
```ts
import { toBankAccount, toExpense } from "@/lib/api/mappers";
import type { BankAccountRow, ExpenseRow, ExpenseSeriesRow } from "@/lib/db/schema";
```
with:
```ts
import { toAccount, toBankAccount, toExpense } from "@/lib/api/mappers";
import type { BankAccountRow, ExpenseRow, ExpenseSeriesRow, FarmAccountRow } from "@/lib/db/schema";
```

Replace (in `ROW`):
```ts
  kind: "expense",
  date: "2026-09-27",
```
with:
```ts
  kind: "expense",
  flow: null,
  date: "2026-09-27",
```

Replace (in `SERIES`):
```ts
  kind: "expense",
  category: "nutrition",
  amountBrl: 12000,
```
with:
```ts
  kind: "expense",
  flow: null,
  category: "nutrition",
  amountBrl: 12000,
```

Replace (end of `describe("toExpense")`):
```ts
    expect(expense.attachmentCount).toBe(0);
  });
});
```
with:
```ts
    expect(expense.attachmentCount).toBe(0);
  });

  it("carries the movimento of a capital row and leaves it out elsewhere", () => {
    expect(toExpense({ ...ROW, kind: "financing", flow: "in" })).toMatchObject({ kind: "financing", flow: "in" });
    expect(toExpense(ROW).flow).toBeUndefined();
  });
});

const ACCOUNT: FarmAccountRow = {
  id: "acc-1",
  farmId: 7,
  group: "financing",
  name: "Pronaf Sicredi",
  archivedAt: null,
  openingBalanceBrl: 120000,
  openingDate: "2026-06-30",
};

describe("toAccount", () => {
  it("carries the saldo inicial of a financiamento, and nothing when there is none", () => {
    expect(toAccount(ACCOUNT)).toMatchObject({ openingBalanceBrl: 120000, openingDate: "2026-06-30" });
    const plain = toAccount({ ...ACCOUNT, group: "nutrition", openingBalanceBrl: null, openingDate: null });
    expect(plain.openingBalanceBrl).toBeUndefined();
    expect(plain.openingDate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts`
Expected: FAIL — 2 tests: "carries the movimento of a capital row…" (`flow` is undefined) and "carries the saldo inicial of a financiamento…" (`openingBalanceBrl` is undefined). The 6 existing tests pass.

- [ ] **Step 3: Implement types, schema and mappers**

`lib/types.ts` — three Replace blocks.

Replace:
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
```
with:
```ts
/**
 * What the money of a lançamento is. Despesa and receita make the resultado;
 * investimento, financiamento and sócios move money outside it, each with a
 * `flow`; a rendimento is what an aplicação earned.
 */
export type EntryKind = "expense" | "revenue" | "investment" | "financing" | "partners" | "yield";

/** Direction of a lançamento: money in or out of the conta bancária. */
export type EntryFlow = "in" | "out";

/** The three groups outside the resultado that hold contas do plano. */
export type CapitalGroup = "investment" | "financing" | "partners";

/**
 * One line of money the farm typed ("lançamento"): a despesa, a receita, or
 * money outside the resultado. The table stays `expenses`; vendas, compras and
 * treatment costs are not lançamentos, they derive from the manejos.
 */
export interface Expense {
  id: string;
  kind: EntryKind;
  /** Movimento of an investment, financing or partners row; absent on the others. */
  flow?: EntryFlow;
  /** Competência. */
  date: string;
  /** Grupo of a despesa; the other kinds write "other" and nothing reads it. */
  category: ExpenseCategory;
```

Replace:
```ts
/** Grupo of a conta: the seven expense categories plus receitas. */
export type AccountGroup = ExpenseCategory | "revenue";
```
with:
```ts
/** Grupo of a conta: receitas, the seven expense categories and the three outside the resultado. */
export type AccountGroup = ExpenseCategory | "revenue" | CapitalGroup;
```

Replace:
```ts
  /** ISO timestamp; an archived conta leaves the form and keeps its history. */
  archivedAt?: string;
}

/** Conta corrente (takes extratos), caixa (cash) or cartão de crédito. */
export type BankAccountKind = "checking" | "cash" | "card";
```
with:
```ts
  /** ISO timestamp; an archived conta leaves the form and keeps its history. */
  archivedAt?: string;
  /** Financing only: saldo devedor at the end of `openingDate`. */
  openingBalanceBrl?: number;
  openingDate?: string;
}

/** Conta corrente (takes extratos), caixa (cash), cartão de crédito or aplicação. */
export type BankAccountKind = "checking" | "cash" | "card" | "investment";
```

`lib/db/schema.ts` — seven Replace blocks. New enum values go at the END of each list (Postgres appends them; a value in the middle would generate `ADD VALUE … BEFORE`).

Replace:
```ts
/** Whether a lançamento is money out (despesa) or money in (receita). */
export const entryKindEnum = pgEnum("entry_kind", ["expense", "revenue"]);
```
with:
```ts
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
```

Replace:
```ts
/** Conta corrente, caixa or cartão de crédito. */
export const bankAccountKindEnum = pgEnum("bank_account_kind", ["checking", "cash", "card"]);
```
with:
```ts
/** Conta corrente, caixa, cartão de crédito or aplicação. */
export const bankAccountKindEnum = pgEnum("bank_account_kind", [
  "checking",
  "cash",
  "card",
  "investment",
]);
```

Replace:
```ts
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
```
with:
```ts
/** Grupo of a conta: the seven expense categories, receitas and the three outside the resultado. */
export const accountGroupEnum = pgEnum("account_group", [
  "nutrition",
  "pasture",
  "labor",
  "health",
  "breeding",
  "admin",
  "other",
  "revenue",
  "investment",
  "financing",
  "partners",
]);
```

Replace (the `accounts` table):
```ts
    group: accountGroupEnum("group").notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
  },
```
with:
```ts
    group: accountGroupEnum("group").notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
    /** Financing only, both or neither: saldo devedor at the end of `openingDate`. */
    openingBalanceBrl: numeric("opening_balance_brl", { mode: "number" }),
    openingDate: date("opening_date"),
  },
```

Replace (the `expense_series` table — the only place where `kind` is followed by `category`):
```ts
    kind: entryKindEnum("kind").notNull().default("expense"),
    category: expenseCategoryEnum("category").notNull(),
```
with:
```ts
    kind: entryKindEnum("kind").notNull().default("expense"),
    /** Investment, financing and partners only. */
    flow: entryFlowEnum("flow"),
    category: expenseCategoryEnum("category").notNull(),
```

Replace (the `expenses` table):
```ts
    kind: entryKindEnum("kind").notNull().default("expense"),
    /** Competência. */
```
with:
```ts
    kind: entryKindEnum("kind").notNull().default("expense"),
    /** Investment, financing and partners only: "in" or "out". */
    flow: entryFlowEnum("flow"),
    /** Competência. */
```

Replace:
```ts
    /** Grupo; a receita writes "other" and nothing reads it. */
```
with:
```ts
    /** Grupo of a despesa; the other kinds write "other" and nothing reads it. */
```

Do NOT add a CHECK constraint that names a new enum value (e.g. "flow only on capital kinds", "opening only on financing"): Postgres refuses to use an enum value in the transaction that added it, and the migrator runs the migration in one transaction. Tasks 4 and 5 enforce those rules in the API.

`lib/api/mappers.ts` — two Replace blocks.

Replace (in `toExpense`):
```ts
    id: row.id,
    kind: row.kind,
    date: row.date,
```
with:
```ts
    id: row.id,
    kind: row.kind,
    flow: orNothing(row.flow),
    date: row.date,
```

Replace (in `toAccount`):
```ts
    group: row.group,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
  };
```
with:
```ts
    group: row.group,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
    openingBalanceBrl: orNothing(row.openingBalanceBrl),
    openingDate: orNothing(row.openingDate),
  };
```

- [ ] **Step 4: Generate the migration**

Run (from `/home/luketa/meubov`; no database needed, `generate` only diffs the schema against `drizzle/meta/0023_snapshot.json`):

`pnpm exec drizzle-kit generate --name financeiro-investimentos`

Expected: it writes `drizzle/0024_financeiro-investimentos.sql`, `drizzle/meta/0024_snapshot.json` and a new `_journal.json` entry (`idx: 24`, `tag: "0024_financeiro-investimentos"`), with no prompt (the change only adds). The SQL must be exactly these 13 statements (checked by generating against a copy of the repo):

```sql
CREATE TYPE "public"."entry_flow" AS ENUM('in', 'out');--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'financing';--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'partners';--> statement-breakpoint
ALTER TYPE "public"."bank_account_kind" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'financing';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'partners';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'yield';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_balance_brl" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_date" date;--> statement-breakpoint
ALTER TABLE "expense_series" ADD COLUMN "flow" "entry_flow";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "flow" "entry_flow";
```

Do not edit it by hand. If the file holds anything else (a DROP, a RENAME, a CHECK, a SET DEFAULT), the schema edit is wrong: delete the three generated outputs (the `.sql`, `0024_snapshot.json`, and revert `_journal.json` with `git checkout drizzle/meta/_journal.json`), fix `schema.ts`, generate again.

If drizzle-kit ever stops at an interactive "created or renamed?" prompt (it should not here), answer it with the first option (create) the way the repo did for 0017:
`(sleep 6; printf '\r') | timeout 60 script -qfec "pnpm exec drizzle-kit generate --name financeiro-investimentos" /dev/null`

This SQL was applied on a throwaway Postgres 17 both on top of 0023 and from zero in one run: both succeed (no statement uses a new enum value).

- [ ] **Step 5: Run the mapper test**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Write the failing test for `entries.ts`**

`lib/domain/__tests__/entries.test.ts` (new):
```ts
import { describe, expect, it } from "vitest";
import {
  CAPITAL_GROUPS,
  ENTRY_KIND_LABEL,
  entryFlow,
  entryGroup,
  FLOW_LABEL,
  isCapitalKind,
  isCost,
  isInflow,
  isRevenue,
  mayPayFrom,
} from "@/lib/domain/entries";
import type { BankAccountKind, EntryFlow, EntryKind } from "@/lib/types";

const KINDS: EntryKind[] = ["expense", "revenue", "investment", "financing", "partners", "yield"];

describe("entryFlow and isInflow", () => {
  it("sends a despesa out and brings a receita and a rendimento in", () => {
    expect(entryFlow({ kind: "expense" })).toBe("out");
    expect(entryFlow({ kind: "revenue" })).toBe("in");
    expect(entryFlow({ kind: "yield" })).toBe("in");
  });

  it("follows the flow of an investimento, a financiamento and sócios", () => {
    for (const kind of CAPITAL_GROUPS) {
      expect(entryFlow({ kind, flow: "in" })).toBe("in");
      expect(entryFlow({ kind, flow: "out" })).toBe("out");
    }
  });

  it("takes a capital row without flow as out", () => {
    for (const kind of CAPITAL_GROUPS) {
      expect(entryFlow({ kind })).toBe("out");
      expect(entryFlow({ kind, flow: null })).toBe("out");
    }
  });

  it("ignores a flow on a despesa, a receita or a rendimento", () => {
    expect(entryFlow({ kind: "expense", flow: "in" })).toBe("out");
    expect(entryFlow({ kind: "revenue", flow: "out" })).toBe("in");
    expect(entryFlow({ kind: "yield", flow: "out" })).toBe("in");
  });

  it("says in exactly when the flow is in", () => {
    expect(KINDS.filter((kind) => isInflow({ kind, flow: "in" }))).toEqual([
      "revenue",
      "investment",
      "financing",
      "partners",
      "yield",
    ]);
    expect(KINDS.filter((kind) => isInflow({ kind }))).toEqual(["revenue", "yield"]);
  });
});

describe("isCost, isRevenue and isCapitalKind", () => {
  it("counts only a despesa as custo and only a receita as receita", () => {
    expect(KINDS.filter((kind) => isCost({ kind }))).toEqual(["expense"]);
    expect(KINDS.filter((kind) => isRevenue({ kind }))).toEqual(["revenue"]);
  });

  it("knows the three kinds outside the resultado that hold contas", () => {
    expect(CAPITAL_GROUPS).toEqual(["investment", "financing", "partners"]);
    expect(KINDS.filter(isCapitalKind)).toEqual(["investment", "financing", "partners"]);
  });
});

describe("entryGroup", () => {
  it("puts a despesa in its grupo of custo", () => {
    expect(entryGroup({ kind: "expense", category: "nutrition" })).toBe("nutrition");
    expect(entryGroup({ kind: "expense", category: "other" })).toBe("other");
  });

  it("puts a receita in Receitas and a capital row in its own group, whatever the category", () => {
    expect(entryGroup({ kind: "revenue", category: "other" })).toBe("revenue");
    expect(entryGroup({ kind: "investment", category: "other" })).toBe("investment");
    expect(entryGroup({ kind: "financing", category: "other" })).toBe("financing");
    expect(entryGroup({ kind: "partners", category: "health" })).toBe("partners");
  });

  it("gives a rendimento no grupo", () => {
    expect(entryGroup({ kind: "yield", category: "other" })).toBeNull();
  });
});

describe("labels", () => {
  it("names each kind", () => {
    expect(KINDS.map((kind) => ENTRY_KIND_LABEL[kind])).toEqual([
      "Despesa",
      "Receita",
      "Investimento",
      "Financiamento",
      "Sócios",
      "Rendimento",
    ]);
  });

  it("names each movimento", () => {
    expect(FLOW_LABEL).toEqual({
      investment: { out: "Compra", in: "Venda do bem" },
      financing: { out: "Pagamento", in: "Liberação" },
      partners: { out: "Retirada", in: "Aporte" },
    });
  });
});

describe("mayPayFrom", () => {
  /** Every kind with each flow it can carry: capital kinds both ways and without flow. */
  const CASES: [EntryKind, EntryFlow | undefined][] = [
    ["expense", undefined],
    ["revenue", undefined],
    ["investment", "out"],
    ["investment", "in"],
    ["investment", undefined],
    ["financing", "out"],
    ["financing", "in"],
    ["partners", "out"],
    ["partners", "in"],
    ["yield", undefined],
  ];
  const allowed = (bank: BankAccountKind) =>
    CASES.filter(([kind, flow]) => mayPayFrom(bank, kind, flow)).map(([kind, flow]) =>
      flow ? `${kind}:${flow}` : kind
    );

  it("lets a conta corrente and the caixa take everything but a rendimento", () => {
    const all = CASES.filter(([kind]) => kind !== "yield").map(([kind, flow]) => (flow ? `${kind}:${flow}` : kind));
    expect(allowed("checking")).toEqual(all);
    expect(allowed("cash")).toEqual(all);
  });

  it("lets a cartão pay a despesa or the compra of an investimento, nothing else", () => {
    expect(allowed("card")).toEqual(["expense", "investment:out", "investment"]);
  });

  it("lets an aplicação take only its rendimento", () => {
    expect(allowed("investment")).toEqual(["yield"]);
  });

  it("reads a null flow as out", () => {
    expect(mayPayFrom("card", "investment", null)).toBe(true);
    expect(mayPayFrom("card", "partners", null)).toBe(false);
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/entries.test.ts`
Expected: FAIL — `Cannot find package '@/lib/domain/entries'` (the module does not exist yet; no tests run).

- [ ] **Step 8: Implement `entries.ts`**

`lib/domain/entries.ts` (new):
```ts
/**
 * What a lançamento is and which way its money goes. `kind` says what the
 * money is; the direction derives from it, and from `flow` on the three kinds
 * outside the resultado (investimento, financiamento, sócios). Pure.
 */
import type {
  AccountGroup,
  BankAccountKind,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  ExpenseCategory,
} from "@/lib/types";

/** The three groups outside the resultado that hold contas do plano, in screen order. */
export const CAPITAL_GROUPS: readonly CapitalGroup[] = ["investment", "financing", "partners"];

/** Investimento, financiamento or sócios: a conta of its own group and a movimento. */
export function isCapitalKind(kind: EntryKind): kind is CapitalGroup {
  return (CAPITAL_GROUPS as readonly EntryKind[]).includes(kind);
}

/** in: receita, rendimento, and a capital row whose flow is "in". Capital rows without flow are "out". */
export function entryFlow(e: { kind: EntryKind; flow?: EntryFlow | null }): EntryFlow {
  if (e.kind === "revenue" || e.kind === "yield") return "in";
  return isCapitalKind(e.kind) && e.flow === "in" ? "in" : "out";
}

export function isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean {
  return entryFlow(e) === "in";
}

/** The COE takes only these. */
export function isCost(e: { kind: EntryKind }): boolean {
  return e.kind === "expense";
}

/** The receita takes only these. */
export function isRevenue(e: { kind: EntryKind }): boolean {
  return e.kind === "revenue";
}

/** Grupo of the plano a lançamento sits in; null for a rendimento. */
export function entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null {
  if (e.kind === "expense") return e.category;
  if (e.kind === "yield") return null;
  return e.kind;
}

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  expense: "Despesa",
  revenue: "Receita",
  investment: "Investimento",
  financing: "Financiamento",
  partners: "Sócios",
  yield: "Rendimento",
};

/** The movimento of each capital kind, by direction. */
export const FLOW_LABEL: Record<CapitalGroup, Record<EntryFlow, string>> = {
  investment: { out: "Compra", in: "Venda do bem" },
  financing: { out: "Pagamento", in: "Liberação" },
  partners: { out: "Retirada", in: "Aporte" },
};

/**
 * Which conta bancária kinds may pay or receive a lançamento. A cartão pays a
 * despesa or the compra of an investimento, nothing else; an aplicação only
 * earns its rendimento (money reaches it and leaves it by transferência); a
 * conta corrente and the caixa take everything but a rendimento.
 */
export function mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean {
  if (bank === "investment") return kind === "yield";
  if (kind === "yield") return false;
  if (bank === "card") return kind === "expense" || (kind === "investment" && entryFlow({ kind, flow }) === "out");
  return true;
}
```

- [ ] **Step 9: Run the test**

Run: `pnpm exec vitest run lib/domain/__tests__/entries.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 10: Update the plano de contas test (failing)**

`lib/domain/__tests__/accounts.test.ts` — five Replace blocks.

Replace:
```ts
  DEFAULT_ACCOUNTS,
  missingDefaults,
} from "@/lib/domain/accounts";
```
with:
```ts
  DEFAULT_ACCOUNTS,
  EXPENSE_GROUPS,
  missingDefaults,
} from "@/lib/domain/accounts";
```

Replace:
```ts
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
```
with:
```ts
describe("ACCOUNT_GROUPS and ACCOUNT_GROUP_LABEL", () => {
  it("lists Receitas first, then the seven grupos of custo, then the three outside the resultado", () => {
    expect(ACCOUNT_GROUPS).toEqual([
      "revenue",
      "nutrition",
      "pasture",
      "labor",
      "health",
      "breeding",
      "admin",
      "other",
      "investment",
      "financing",
      "partners",
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
      "Investimentos",
      "Financiamentos",
      "Sócios",
    ]);
  });
});

describe("EXPENSE_GROUPS", () => {
  it("is the seven grupos of custo in screen order", () => {
    expect(EXPENSE_GROUPS).toEqual(["nutrition", "pasture", "labor", "health", "breeding", "admin", "other"]);
  });
});
```

Replace:
```ts
    expect(names("other")).toEqual([]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(25);
```
with:
```ts
    expect(names("other")).toEqual([]);
    expect(names("investment")).toEqual(["Benfeitorias", "Máquinas e implementos", "Equipamentos"]);
    expect(names("financing")).toEqual([]);
    expect(names("partners")).toEqual(["Distribuição de lucro"]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(29);
```

Replace:
```ts
    expect(byGroup.labor).toEqual([]);
```
with:
```ts
    expect(byGroup.labor).toEqual([]);
    expect(byGroup.financing).toEqual([]);
```

Replace:
```ts
    expect(missing).toHaveLength(23);
```
with:
```ts
    expect(missing).toHaveLength(27);
```

- [ ] **Step 11: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/accounts.test.ts`
Expected: FAIL — 5 tests: ACCOUNT_GROUPS lacks the three groups, `EXPENSE_GROUPS` is undefined, `DEFAULT_ACCOUNTS` has 25 rows, `byGroup.financing` is undefined, `missingDefaults` returns 23.

- [ ] **Step 12: Implement `accounts.ts`**

`lib/domain/accounts.ts` — two Replace blocks.

Replace:
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
```
with:
```ts
/**
 * Plano de contas: the fixed grupos (Receitas, the seven cost categories and
 * the three outside the resultado) and the farm's contas inside them. Pure.
 */
import type { Account, AccountGroup, Expense, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

/** The seven grupos of custo (the COE), in screen order. */
export const EXPENSE_GROUPS: readonly ExpenseCategory[] = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

/** Label of each grupo: "Receitas", the cost categories' labels and the three outside the resultado. */
export const ACCOUNT_GROUP_LABEL: Record<AccountGroup, string> = {
  revenue: "Receitas",
  ...EXPENSE_CATEGORY_LABEL,
  investment: "Investimentos",
  financing: "Financiamentos",
  partners: "Sócios",
};

/** Grupos in screen order: Receitas, the cost categories, then the three outside the resultado. */
export const ACCOUNT_GROUPS: readonly AccountGroup[] = ["revenue", ...EXPENSE_GROUPS, ...CAPITAL_GROUPS];
```

Replace:
```ts
  { group: "admin", name: "Contabilidade" },
];
```
with:
```ts
  { group: "admin", name: "Contabilidade" },
  { group: "investment", name: "Benfeitorias" },
  { group: "investment", name: "Máquinas e implementos" },
  { group: "investment", name: "Equipamentos" },
  { group: "partners", name: "Distribuição de lucro" },
];
```

`accountsByGroup` needs no change: it builds its keys from `ACCOUNT_GROUPS`, so the three new groups appear (empty) in its result.

`lib/data/seed.ts` — `SEED_ACCOUNTS` mirrors `DEFAULT_ACCOUNTS`, so the seeded farm gets the four new contas too (same id pattern `acc-<group>-<slug>`).

Replace:
```ts
  { id: "acc-admin-contabilidade", group: "admin", name: "Contabilidade" },
];
```
with:
```ts
  { id: "acc-admin-contabilidade", group: "admin", name: "Contabilidade" },
  { id: "acc-investment-benfeitorias", group: "investment", name: "Benfeitorias" },
  { id: "acc-investment-maquinas-e-implementos", group: "investment", name: "Máquinas e implementos" },
  { id: "acc-investment-equipamentos", group: "investment", name: "Equipamentos" },
  { id: "acc-partners-distribuicao-de-lucro", group: "partners", name: "Distribuição de lucro" },
];
```

- [ ] **Step 13: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/entries.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts`
Expected: PASS. (`SeedDefaults.test.ts` counts relative to `DEFAULT_ACCOUNTS.length`, so it needs no edit.)

- [ ] **Step 14: Compile fixes, and keep every screen as it was**

The widened unions break these places (found with `tsc --noEmit` after Steps 3–12; nothing else in `app/`, `components/`, `lib/` or `cli/` breaks). Each fix is the smallest that compiles without changing behaviour.

`lib/domain/bankAccounts.ts` — `Record<BankAccountKind, string>` needs the new key.

Replace:
```ts
  card: "Cartão",
};
```
with:
```ts
  card: "Cartão",
  investment: "Aplicação",
};
```

`lib/domain/ledger.ts` — `LedgerKind` is still the old literal union (task 2 redefines it as `EntryKind | "sale" | "purchase" | "treatment"` and then drops this cast). No row of a new kind exists yet, the API refuses them.

Replace:
```ts
      kind: e.kind,
      date: e.date,
```
with:
```ts
      kind: e.kind as LedgerKind,
      date: e.date,
```

`lib/store/useHerdStore.ts` — the Eden bodies of `POST /expenses`, `POST /accounts` and `POST /bank-accounts` still take only the old literals (tasks 4 and 5 widen them; these casts then become no-ops).

Replace:
```ts
    const { data, error } = await api.expenses.post(repeat ? { ...e, repeat } : e);
```
with:
```ts
    const { data, error } = await api.expenses.post((repeat ? { ...e, repeat } : e) as Parameters<typeof api.expenses.post>[0]);
```

Replace:
```ts
    const { data, error } = await api.accounts.post(input);
```
with:
```ts
    const { data, error } = await api.accounts.post(input as Parameters<typeof api.accounts.post>[0]);
```

Replace:
```ts
    const { data, error } = await api["bank-accounts"].post(input);
```
with:
```ts
    const { data, error } = await api["bank-accounts"].post(input as Parameters<(typeof api)["bank-accounts"]["post"]>[0]);
```

`components/finance/contas/AccountCard.tsx` — two `as const` maps indexed by `account.kind`. PiggyBank is the aplicação icon of the canvas.

Replace:
```ts
import { CalendarDays, CircleCheck, CreditCard, Landmark, Wallet } from "lucide-react";
```
with:
```ts
import { CalendarDays, CircleCheck, CreditCard, Landmark, PiggyBank, Wallet } from "lucide-react";
```

Replace:
```ts
const ICON = { checking: Landmark, cash: Wallet, card: CreditCard } as const;
const DEFAULT_LABEL = { checking: "conta corrente", cash: "dinheiro", card: "crédito" } as const;
```
with:
```ts
const ICON = { checking: Landmark, cash: Wallet, card: CreditCard, investment: PiggyBank } as const;
const DEFAULT_LABEL = { checking: "conta corrente", cash: "dinheiro", card: "crédito", investment: "aplicação" } as const;
```

`components/finance/plano/AccountsPage.tsx` — the local `EXPENSE_GROUPS` filter (`g !== "revenue"`) would now let the three capital groups into the Despesas (COE) card. Import the domain's list instead.

Replace:
```ts
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, ACCOUNT_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
import type { Account, AccountGroup } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountsByGroup, EXPENSE_GROUPS } from "@/lib/domain/accounts";
```

Replace (delete the local constant and the blank line after it):
```ts
const EXPENSE_GROUPS = ACCOUNT_GROUPS.filter((g): g is ExpenseCategory => g !== "revenue");

```
with nothing.

`components/finance/plano/AccountDialog.tsx` — its Grupo select keeps offering only Receitas and the seven (task 9 replaces this dialog).

Replace:
```ts
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL } from "@/lib/domain/accounts";
```
with:
```ts
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS } from "@/lib/domain/accounts";
```

Replace:
```tsx
            {ACCOUNT_GROUPS.map((g) => (
```
with:
```tsx
            {["revenue" as const, ...EXPENSE_GROUPS].map((g) => (
```

`components/finance/extrato/ExtratoFilters.tsx` — the Extrato's Grupo select and its "todas as contas" list keep Receitas and the seven (task 11 deletes this file).

Replace:
```ts
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
import { ACCOUNT_GROUP_LABEL, accountsByGroup, EXPENSE_GROUPS } from "@/lib/domain/accounts";
```

Replace:
```tsx
      ? ACCOUNT_GROUPS.flatMap((group) => byGroup[group])
```
with:
```tsx
      ? ["revenue" as const, ...EXPENSE_GROUPS].flatMap((group) => byGroup[group])
```

Replace:
```tsx
        {ACCOUNT_GROUPS.map((group: AccountGroup) => (
```
with:
```tsx
        {["revenue" as const, ...EXPENSE_GROUPS].map((group: AccountGroup) => (
```

Left as is on purpose: `BankAccountDialog.tsx` lists its own `KINDS` (`checking`, `cash`, `card`), so Aplicação does not appear yet (task 9); `ExtratoPage.tsx`'s `GROUP_VALUES` now accepts `?grupo=investment` typed by hand in the URL, which lists nothing (task 10 replaces that page).

- [ ] **Step 15: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/entries.test.ts lib/domain/__tests__/accounts.test.ts lib/api/__tests__/mappers.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts lib/domain/__tests__/bankAccounts.test.ts lib/domain/__tests__/ledger.test.ts lib/data/__tests__/seed.test.ts`
Expected: PASS (7 files, 91 tests)

- [ ] **Step 16: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean (task 1 is alone in wave 1; nothing else is expected).

Run: `pnpm exec eslint lib/types.ts lib/db/schema.ts lib/api/mappers.ts lib/api/__tests__/mappers.test.ts lib/domain/entries.ts lib/domain/__tests__/entries.test.ts lib/domain/accounts.ts lib/domain/__tests__/accounts.test.ts lib/domain/bankAccounts.ts lib/domain/ledger.ts lib/store/useHerdStore.ts components/finance/contas/AccountCard.tsx components/finance/plano/AccountsPage.tsx components/finance/plano/AccountDialog.tsx components/finance/extrato/ExtratoFilters.tsx lib/data/seed.ts`
Expected: clean

Optional: `git status --short` lists exactly the files under **Files** plus `drizzle/0024_financeiro-investimentos.sql` and `drizzle/meta/0024_snapshot.json` (and the two untracked spec files that were there before).


### Task 2: Ledger, contas and conciliação by direction

**Files:**
- Modify: `lib/domain/ledger.ts`
- Modify: `lib/domain/bankAccounts.ts`
- Modify: `lib/domain/statements/match.ts`
- Modify: `lib/export/datasets/finance.ts`
- Modify: `components/finance/extrato/ExtratoTable.tsx` (compile fix: `KIND_PILL` gains the four kinds; `LedgerAmount` reads `row.inflow`)
- Modify: `components/finance/extrato/ExtratoFilters.tsx` (one-line compile fix: `KIND_TAB_LABEL` becomes `Partial`, the old tabs never offer the new kinds)
- Test: `lib/domain/__tests__/ledger.test.ts`
- Test: `lib/domain/__tests__/bankAccounts.test.ts`
- Test: `lib/domain/statements/__tests__/match.test.ts` (the match tests live here, not under `lib/domain/__tests__`)
- Test: `lib/export/__tests__/finance.test.ts`

**Interfaces:**
- Consumes (task 1):
  - `@/lib/types`: `EntryKind` (six literals), `EntryFlow`, `Expense.flow?: EntryFlow`, `AccountGroup` with `"investment" | "financing" | "partners"`, `BankAccountKind` with `"investment"`, `Account.openingBalanceBrl?`/`openingDate?`.
  - `@/lib/domain/entries`: `isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean`, `entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null`, `ENTRY_KIND_LABEL: Record<EntryKind, string>` (Despesa, Receita, Investimento, Financiamento, Sócios, Rendimento), `mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean`.
  - `@/lib/domain/accounts`: `ACCOUNT_GROUP_LABEL` with `investment: "Investimentos"`, `financing: "Financiamentos"`, `partners: "Sócios"`.
  - `@/lib/domain/bankAccounts`: `BANK_ACCOUNT_KIND_LABEL.investment = "Aplicação"` (task 1's compile fix; this task does not touch that block).
- Produces:
  - `lib/domain/ledger.ts`: `export type LedgerKind = EntryKind | "sale" | "purchase" | "treatment";` · `LedgerRow.inflow: boolean` · `LedgerRow.group: AccountGroup | "capital"` where `"capital"` is only a compra de gado (`groupLabel "Investimentos"`, `account "Compra de gado"`) or a rendimento (`groupLabel "Rendimento"`, `account null`) · a venda has `account "Venda de gado"` · `matchesStatusChoice(row: Pick<LedgerRow, "inflow" | "status">, choice: LedgerStatus | "settled" | "all"): boolean` · `cashSummary` and `pendingBills` keep their signatures and take every kind by direction · `ledgerSummary` unchanged.
  - `lib/domain/bankAccounts.ts`: `export type BankMoveKind = EntryKind | "sale" | "purchase" | "transferIn" | "transferOut";` (a lançamento's move carries its own kind) · `payingAccounts(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow | null): BankAccount[]`.
  - `lib/domain/statements/match.ts`: `CandidateKind` keeps its six literals; for a lançamento `"expense"` now means "goes out" and `"revenue"` "comes in", by `entryFlow`, whatever its kind.
  - `lib/export/datasets/finance.ts`: `ledgerExportTable` names the four new kinds.

---

#### Cycle a: the ledger

- [ ] **Step 1a: Write the failing test**

`lib/domain/__tests__/ledger.test.ts` — five **Replace** blocks.

Replace:
```ts
      id: "e-paid-lot",
      kind: "expense",
```
With:
```ts
      id: "e-paid-lot",
      kind: "expense",
      inflow: false,
```

Replace:
```ts
      id: "s-sale",
      kind: "sale",
      date: "2026-09-05",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: null,
```
With:
```ts
      id: "s-sale",
      kind: "sale",
      inflow: true,
      date: "2026-09-05",
      dueDate: "2026-09-05",
      paidAt: "2026-09-05",
      status: "received",
      group: "revenue",
      groupLabel: "Receitas",
      account: "Venda de gado",
```

Replace:
```ts
  it("builds a compra as capital, with the live arrobas and a deleted lote's name", () => {
    expect(row("s-entry")).toMatchObject({
      kind: "purchase",
      status: "paid",
      group: "capital",
      groupLabel: "Capital",
```
With:
```ts
  it("builds a compra as capital under Investimentos, with the live arrobas and a deleted lote's name", () => {
    expect(row("s-entry")).toMatchObject({
      kind: "purchase",
      inflow: false,
      status: "paid",
      group: "capital",
      groupLabel: "Investimentos",
      account: "Compra de gado",
```

Replace:
```ts
      id: TREATMENT_ID,
      kind: "treatment",
```
With:
```ts
      id: TREATMENT_ID,
      kind: "treatment",
      inflow: false,
```

Replace (the whole last `describe`, from its first line to the end of the file):
```ts
describe("matchesStatusChoice", () => {
  it("counts the vencidas under a pagar and a receber by kind", () => {
    const lateBill = { kind: "expense", status: "overdue" } as const;
    const lateReceita = { kind: "revenue", status: "overdue" } as const;
    expect(matchesStatusChoice(lateBill, "payable")).toBe(true);
    expect(matchesStatusChoice(lateBill, "receivable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "receivable")).toBe(true);
    expect(matchesStatusChoice(lateReceita, "payable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "overdue")).toBe(true);
    expect(matchesStatusChoice({ kind: "expense", status: "payable" }, "overdue")).toBe(false);
    expect(matchesStatusChoice({ kind: "revenue", status: "received" }, "settled")).toBe(true);
  });
});
```
With:
```ts
describe("matchesStatusChoice", () => {
  it("counts the vencidas under a pagar and a receber by direction", () => {
    const lateBill = { inflow: false, status: "overdue" } as const;
    const lateReceita = { inflow: true, status: "overdue" } as const;
    expect(matchesStatusChoice(lateBill, "payable")).toBe(true);
    expect(matchesStatusChoice(lateBill, "receivable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "receivable")).toBe(true);
    expect(matchesStatusChoice(lateReceita, "payable")).toBe(false);
    expect(matchesStatusChoice(lateReceita, "overdue")).toBe(true);
    expect(matchesStatusChoice({ inflow: false, status: "payable" }, "overdue")).toBe(false);
    expect(matchesStatusChoice({ inflow: true, status: "received" }, "settled")).toBe(true);
  });
});

describe("money outside the resultado", () => {
  const capitalAccounts: Account[] = [
    ...accounts,
    { id: "acc-maq", group: "investment", name: "Máquinas e implementos" },
    { id: "acc-pronaf", group: "financing", name: "Pronaf custeio" },
    { id: "acc-lucro", group: "partners", name: "Distribuição de lucro" },
  ];
  const capital: Expense[] = [
    expense({ id: "c-trator", kind: "investment", flow: "out", date: "2026-09-10", amountBrl: 50000, paidAt: "2026-09-10", accountId: "acc-maq" }),
    expense({ id: "c-sucata", kind: "investment", flow: "in", date: "2026-09-11", amountBrl: 2000, paidAt: "2026-09-11", accountId: "acc-maq" }),
    // Pending, due after today: a receber.
    expense({ id: "c-liberacao", kind: "financing", flow: "in", date: "2026-09-20", dueDate: "2026-10-05", amountBrl: 80000, accountId: "acc-pronaf" }),
    // Pending, past due: vencida.
    expense({ id: "c-parcela", kind: "financing", flow: "out", date: "2026-09-05", dueDate: "2026-09-15", amountBrl: 4000, accountId: "acc-pronaf" }),
    expense({ id: "c-retirada", kind: "partners", flow: "out", date: "2026-09-12", amountBrl: 6000, paidAt: "2026-09-12", accountId: "acc-lucro" }),
    expense({ id: "c-aporte", kind: "partners", flow: "in", date: "2026-09-13", amountBrl: 10000, paidAt: "2026-09-13", accountId: "acc-lucro" }),
    // No flow: a compra (money out), pending and past its date.
    expense({ id: "c-sem-flow", kind: "investment", date: "2026-09-14", amountBrl: 700, accountId: "acc-maq" }),
    expense({ id: "c-rendimento", kind: "yield", date: "2026-09-22", amountBrl: 312.5, paidAt: "2026-09-22", bankAccountId: "aplic" }),
  ];
  const capitalInput: LedgerInputs = { ...input, expenses: capital, accounts: capitalAccounts, movements: [], treatments: [] };
  const capitalRows = ledgerRows(capitalInput, PERIOD, TODAY);

  it("gives each row its grupo, its conta, its direction and a status by direction", () => {
    expect(capitalRows.map((r) => [r.id, r.kind, r.inflow, r.group, r.groupLabel, r.account, r.status])).toEqual([
      ["c-rendimento", "yield", true, "capital", "Rendimento", null, "received"],
      ["c-liberacao", "financing", true, "financing", "Financiamentos", "Pronaf custeio", "receivable"],
      ["c-sem-flow", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "overdue"],
      ["c-aporte", "partners", true, "partners", "Sócios", "Distribuição de lucro", "received"],
      ["c-retirada", "partners", false, "partners", "Sócios", "Distribuição de lucro", "paid"],
      ["c-sucata", "investment", true, "investment", "Investimentos", "Máquinas e implementos", "received"],
      ["c-trator", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "paid"],
      ["c-parcela", "financing", false, "financing", "Financiamentos", "Pronaf custeio", "overdue"],
    ]);
  });

  it("orders the new kinds after the despesas on the same day", () => {
    const day = "2026-09-10";
    const sameDay = ledgerRows(
      {
        ...capitalInput,
        expenses: [
          expense({ id: "a-yield", kind: "yield", date: day, paidAt: day }),
          expense({ id: "b-partners", kind: "partners", flow: "out", date: day }),
          expense({ id: "c-financing", kind: "financing", flow: "out", date: day }),
          expense({ id: "d-investment", kind: "investment", flow: "out", date: day }),
          expense({ id: "e-expense", date: day }),
          expense({ id: "f-revenue", kind: "revenue", date: day }),
        ],
        movements: [{ id: "g-purchase", type: "purchase", date: day, origin: "A", destination: "B", amountBrl: 10 }],
      },
      PERIOD,
      TODAY
    );
    expect(ids(sameDay)).toEqual(["f-revenue", "e-expense", "d-investment", "c-financing", "b-partners", "a-yield", "g-purchase"]);
  });

  it("puts a pending outflow under a pagar and a pending inflow under a receber", () => {
    const chosen = (choice: "payable" | "receivable" | "settled") =>
      ids(capitalRows.filter((r) => matchesStatusChoice(r, choice)));
    expect(chosen("payable")).toEqual(["c-sem-flow", "c-parcela"]);
    expect(chosen("receivable")).toEqual(["c-liberacao"]);
    expect(chosen("settled")).toEqual(["c-rendimento", "c-aporte", "c-retirada", "c-sucata", "c-trator"]);
  });

  it("takes every kind in the caixa and in a pagar / a receber by direction", () => {
    expect(cashSummary(capitalInput, PERIOD, TODAY)).toEqual({
      received: 12312.5, // venda do bem 2.000 + aporte 10.000 + rendimento 312,50
      receivable: 80000, // liberação pendente
      receivableCount: 1,
      paid: 56000, // trator 50.000 + retirada 6.000
      payable: 4700, // parcela 4.000 + compra sem movimento 700
      payableCount: 2,
      overdueCount: 2,
      balance: -43687.5,
    });
  });

  it("splits the pending ones into payables and receivables, oldest vencimento first", () => {
    const { payables, receivables } = pendingBills(capital, TODAY);
    expect(payables.map((e) => e.id)).toEqual(["c-sem-flow", "c-parcela"]);
    expect(receivables.map((e) => e.id)).toEqual(["c-liberacao"]);
  });

  it("changes none of the Extrato's summary totals", () => {
    const together = ledgerRows({ ...input, expenses: [...expenses, ...capital], accounts: capitalAccounts }, PERIOD, TODAY);
    expect(together).toHaveLength(rows.length + capital.length);
    expect(ledgerSummary(together)).toEqual(ledgerSummary(rows));
  });
});
```

- [ ] **Step 2a: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/ledger.test.ts`
Expected: FAIL — rows have no `inflow`, the venda/compra have `account: null` and the compra `groupLabel: "Capital"`, capital rows get grupo "Outros" and a status by `kind === "revenue"`, `matchesStatusChoice` reads `row.kind`, `cashSummary`/`pendingBills` count a liberação as a payable. ("changes none of the Extrato's summary totals" already passes: it pins `ledgerSummary`.)

- [ ] **Step 3a: Implement**

`lib/domain/ledger.ts` — **Replace** blocks, in order. (Task 1 left a compile shim, `kind: e.kind as LedgerKind` in `ledgerRows`; widening `LedgerKind` makes it useless and the block that rewrites `ledgerRows` drops it.)

Replace:
```ts
  Animal,
  Expense,
  Lot,
```
With:
```ts
  Animal,
  EntryKind,
  Expense,
  Lot,
```

Replace:
```ts
import { formatArroba } from "@/lib/domain/format";
```
With:
```ts
import { formatArroba } from "@/lib/domain/format";
import { ENTRY_KIND_LABEL, entryGroup, isInflow } from "@/lib/domain/entries";
```

Replace:
```ts
export type LedgerKind = "expense" | "revenue" | "sale" | "purchase" | "treatment";
```
With:
```ts
export type LedgerKind = EntryKind | "sale" | "purchase" | "treatment";
```

Replace:
```ts
  kind: LedgerKind;
  date: string;
```
With:
```ts
  kind: LedgerKind;
  /** Money in: receitas, vendas, rendimentos and capital rows that enter. */
  inflow: boolean;
  date: string;
```

Replace:
```ts
  group: AccountGroup | "capital";
  groupLabel: string;
```
With:
```ts
  /** The grupo of the plano; "capital" for what has none: compras de gado and rendimentos. */
  group: AccountGroup | "capital";
  groupLabel: string;
```

Replace:
```ts
const KIND_ORDER: Record<LedgerKind, number> = {
  revenue: 0,
  sale: 1,
  expense: 2,
  purchase: 3,
  treatment: 4,
};
```
With:
```ts
const KIND_ORDER: Record<LedgerKind, number> = {
  revenue: 0,
  sale: 1,
  expense: 2,
  investment: 3,
  financing: 4,
  partners: 5,
  yield: 6,
  purchase: 7,
  treatment: 8,
};
```

Replace:
```ts
function entryStatus(e: Expense, todayIso: string): LedgerStatus {
  if (e.paidAt !== undefined) return e.kind === "revenue" ? "received" : "paid";
  if (effectiveDueDate(e) < todayIso) return "overdue";
  return e.kind === "revenue" ? "receivable" : "payable";
}
```
With:
```ts
/** Settled or pending by direction; a pending one past its vencimento is overdue either way. */
function entryStatus(e: Expense, todayIso: string): LedgerStatus {
  const inflow = isInflow(e);
  if (e.paidAt !== undefined) return inflow ? "received" : "paid";
  if (effectiveDueDate(e) < todayIso) return "overdue";
  return inflow ? "receivable" : "payable";
}
```

Replace:
```ts
    const group: AccountGroup = e.kind === "revenue" ? "revenue" : e.category;
    const lotId = e.lotId ?? null;
    rows.push({
      id: e.id,
      kind: e.kind as LedgerKind,
      date: e.date,
      dueDate: effectiveDueDate(e),
      paidAt: e.paidAt ?? null,
      status: entryStatus(e, todayIso),
      group,
      groupLabel: ACCOUNT_GROUP_LABEL[group],
```
With:
```ts
    const group = entryGroup(e);
    const lotId = e.lotId ?? null;
    rows.push({
      id: e.id,
      kind: e.kind,
      inflow: isInflow(e),
      date: e.date,
      dueDate: effectiveDueDate(e),
      paidAt: e.paidAt ?? null,
      status: entryStatus(e, todayIso),
      // A rendimento sits in no grupo of the plano.
      group: group ?? "capital",
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : ACCOUNT_GROUP_LABEL[group],
```

Replace:
```ts
      kind: sale ? "sale" : "purchase",
      date: m.date,
      dueDate: m.date,
      paidAt: m.date,
      status: sale ? "received" : "paid",
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
      account: null,
```
With:
```ts
      kind: sale ? "sale" : "purchase",
      inflow: sale,
      date: m.date,
      dueDate: m.date,
      paidAt: m.date,
      status: sale ? "received" : "paid",
      // A compra de gado is an investimento the manejos write: no conta of the plano.
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : ACCOUNT_GROUP_LABEL.investment,
      account: sale ? "Venda de gado" : "Compra de gado",
```

Replace:
```ts
      kind: "treatment",
      date: day.date,
```
With:
```ts
      kind: "treatment",
      inflow: false,
      date: day.date,
```

Replace:
```ts
/**
 * The Extrato's status choice: "a pagar" and "a receber" include their own
 * vencidas (an unpaid despesa or receita past due is "overdue"), and
 * "settled" is paid or received.
 */
export function matchesStatusChoice(
  row: Pick<LedgerRow, "kind" | "status">,
  choice: LedgerStatus | "settled" | "all"
): boolean {
  if (choice === "all") return true;
  if (choice === "settled") return row.status === "paid" || row.status === "received";
  if (row.status === "overdue" && choice === "payable") return row.kind === "expense";
  if (row.status === "overdue" && choice === "receivable") return row.kind === "revenue";
  return row.status === choice;
}
```
With:
```ts
/**
 * The Extrato's status choice: "a pagar" and "a receber" include their own
 * vencidas (an unpaid lançamento past due is "overdue": a pagar when it goes
 * out, a receber when it comes in), and "settled" is paid or received.
 */
export function matchesStatusChoice(
  row: Pick<LedgerRow, "inflow" | "status">,
  choice: LedgerStatus | "settled" | "all"
): boolean {
  if (choice === "all") return true;
  if (choice === "settled") return row.status === "paid" || row.status === "received";
  if (row.status === "overdue" && choice === "payable") return !row.inflow;
  if (row.status === "overdue" && choice === "receivable") return row.inflow;
  return row.status === choice;
}
```

Replace:
```ts
 * pagar are the pending lançamentos of any date. Compras count as pago here,
 * though they stay capital (outside the COE) in the rows and `ledgerSummary`.
 */
```
With:
```ts
 * pagar are the pending lançamentos of any date. Every kind counts by its
 * direction: a liberação or an aporte is received, a parcela or a retirada
 * paid, a rendimento received. Compras count as pago here, though they stay
 * capital (outside the COE) in the rows and `ledgerSummary`.
 */
```

Replace:
```ts
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
```
With:
```ts
  for (const e of input.expenses) {
    const inflow = isInflow(e);
    if (e.paidAt === undefined) {
      if (inflow) {
        s.receivable += e.amountBrl;
        s.receivableCount += 1;
      } else {
        s.payable += e.amountBrl;
        s.payableCount += 1;
      }
      // Vencidas are outflows only; a late entrada shows "venceu dd/mm" in A receber.
      if (!inflow && effectiveDueDate(e) < todayIso) s.overdueCount += 1;
    } else if (inPeriod(e.paidAt, period)) {
      if (inflow) s.received += e.amountBrl;
      else s.paid += e.amountBrl;
    }
  }
```

Replace:
```ts
/** Pending despesas and receitas, oldest vencimento first, then by date. */
```
With:
```ts
/** Pending lançamentos of every kind by direction, oldest vencimento first, then by date. */
```

Replace:
```ts
    payables: pending.filter((e) => e.kind === "expense"),
    receivables: pending.filter((e) => e.kind === "revenue"),
```
With:
```ts
    payables: pending.filter((e) => !isInflow(e)),
    receivables: pending.filter((e) => isInflow(e)),
```

`ledgerSummary` stays as it is.

- [ ] **Step 4a: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/ledger.test.ts`
Expected: PASS

---

#### Cycle b: contas bancárias

- [ ] **Step 1b: Write the failing test**

`lib/domain/__tests__/bankAccounts.test.ts` — four **Replace** blocks.

Replace:
```ts
import type { BankAccount, Expense, Movement, Transfer } from "@/lib/types";
```
With:
```ts
import type { BankAccount, EntryFlow, EntryKind, Expense, Movement, Transfer } from "@/lib/types";
```

Replace:
```ts
  paysFromId: "sicredi",
};
```
With:
```ts
  paysFromId: "sicredi",
};
const APLICACAO: BankAccount = { ...SICREDI, id: "aplic", kind: "investment", name: "CDB Sicredi", openingBalanceBrl: 20000, isMain: false };
```

Replace:
```ts
describe("faturaOf", () => {
```
With:
```ts
describe("money outside the resultado", () => {
  const capital = (id: string, patch: Partial<Expense>) =>
    expense(id, { category: "other", paidAt: "2026-09-10", bankAccountId: "sicredi", ...patch });
  const inputs: BankInputs = {
    ...EMPTY,
    expenses: [
      capital("liberacao", { kind: "financing", flow: "in", amountBrl: 80000 }),
      capital("parcela", { kind: "financing", flow: "out", amountBrl: 4000 }),
      capital("retirada", { kind: "partners", flow: "out", amountBrl: 6000 }),
      // No flow: a compra.
      capital("trator", { kind: "investment", amountBrl: 50000 }),
      capital("rendimento", { kind: "yield", bankAccountId: "aplic", amountBrl: 312.5 }),
    ],
  };

  it("signs a liberação, a pagamento, a retirada and a rendimento by their direction", () => {
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(10000 + 80000 - 4000 - 6000 - 50000);
    expect(accountBalance(APLICACAO, inputs, "2026-09-30")).toBe(20312.5);
    const rows = accountMovements(SICREDI, inputs, { start: "2026-09-01", end: "2026-09-30" });
    expect(rows.map((r) => [r.id, r.kind, r.amountBrl, r.balance])).toEqual([
      ["trator", "investment", -50000, 30000],
      ["retirada", "partners", -6000, 80000],
      ["parcela", "financing", -4000, 86000],
      ["liberacao", "financing", 80000, 90000],
    ]);
  });

  it("counts an aplicação in the saldo em contas, never a cartão", () => {
    expect(bankTotal([SICREDI, APLICACAO, CARD], inputs, "2026-09-30")).toBe(30000 + 20312.5);
  });
});

describe("faturaOf", () => {
```

Replace (the whole last `describe`, to the end of the file):
```ts
describe("payingAccounts", () => {
  it("offers the conta principal first, cartões for despesas only, no archived conta", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    const list = [CARD, CAIXA, archived, SICREDI];
    expect(payingAccounts(list, "expense").map((a) => a.id)).toEqual(["sicredi", "card", "caixa"]);
    expect(payingAccounts(list, "revenue").map((a) => a.id)).toEqual(["sicredi", "caixa"]);
  });
});
```
With:
```ts
describe("payingAccounts", () => {
  it("offers the conta principal first, cartões for despesas only, no archived conta", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    const list = [CARD, CAIXA, APLICACAO, archived, SICREDI];
    expect(payingAccounts(list, "expense").map((a) => a.id)).toEqual(["sicredi", "card", "caixa"]);
    expect(payingAccounts(list, "revenue").map((a) => a.id)).toEqual(["sicredi", "caixa"]);
  });

  it("offers a cartão to a compra of an investimento and an aplicação only to a rendimento", () => {
    const list = [CARD, CAIXA, APLICACAO, SICREDI];
    const offered = (kind: EntryKind, flow?: EntryFlow) => payingAccounts(list, kind, flow).map((a) => a.id);
    expect(offered("investment", "out")).toEqual(["sicredi", "card", "caixa"]);
    // No flow: a compra.
    expect(offered("investment")).toEqual(["sicredi", "card", "caixa"]);
    expect(offered("investment", "in")).toEqual(["sicredi", "caixa"]);
    expect(offered("financing", "out")).toEqual(["sicredi", "caixa"]);
    expect(offered("financing", "in")).toEqual(["sicredi", "caixa"]);
    expect(offered("partners", "out")).toEqual(["sicredi", "caixa"]);
    expect(offered("yield")).toEqual(["aplic"]);
  });
});
```

- [ ] **Step 2b: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/bankAccounts.test.ts`
Expected: FAIL — `movesOf` signs every kind but receita as a saída (the liberação is −80.000, the rendimento −312,50); `payingAccounts` offers the aplicação to a despesa and a receita and the cartão to nothing but a despesa.

- [ ] **Step 3b: Implement**

`lib/domain/bankAccounts.ts` — **Replace** blocks (task 1 already added `investment: "Aplicação"` to `BANK_ACCOUNT_KIND_LABEL`; leave that block alone).

Replace:
```ts
 * What counts in a conta: the paid lançamentos and the vendas/compras whose
 * `bankAccountId` is it, and the transferências in and out, all dated after
 * `openingDate` (anything on or before it is already in the saldo inicial).
```
With:
```ts
 * What counts in a conta: the paid lançamentos of every kind (signed by their
 * direction, `entryFlow`) and the vendas/compras whose `bankAccountId` is it,
 * and the transferências in and out, all dated after `openingDate` (anything
 * on or before it is already in the saldo inicial).
```

Replace:
```ts
import type { BankAccount, EntryKind, Expense, Movement, Transfer } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { addDays, lastDayOfMonth } from "@/lib/domain/dates";
```
With:
```ts
import type { BankAccount, EntryFlow, EntryKind, Expense, Movement, Transfer } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { addDays, lastDayOfMonth } from "@/lib/domain/dates";
import { isInflow, mayPayFrom } from "@/lib/domain/entries";
```

Replace:
```ts
export type BankMoveKind = "expense" | "revenue" | "sale" | "purchase" | "transferIn" | "transferOut";
```
With:
```ts
export type BankMoveKind = EntryKind | "sale" | "purchase" | "transferIn" | "transferOut";
```

Replace:
```ts
    if (e.bankAccountId !== account.id || e.paidAt === undefined || !after(e.paidAt)) continue;
    const revenue = e.kind === "revenue";
    moves.push({
      id: e.id,
      kind: revenue ? "revenue" : "expense",
      date: e.paidAt,
      amountBrl: revenue ? e.amountBrl : -e.amountBrl,
      expense: e,
    });
```
With:
```ts
    if (e.bankAccountId !== account.id || e.paidAt === undefined || !after(e.paidAt)) continue;
    moves.push({
      id: e.id,
      kind: e.kind,
      date: e.paidAt,
      amountBrl: isInflow(e) ? e.amountBrl : -e.amountBrl,
      expense: e,
    });
```

Replace:
```ts
/** "Saldo em contas": every conta corrente and caixa that is not archived. Cartões stay out. */
```
With:
```ts
/** "Saldo em contas": every conta corrente, caixa and aplicação that is not archived. Cartões stay out. */
```

Replace:
```ts
/**
 * The contas "Pago por" offers: not archived, the conta principal first; a
 * cartão only for a despesa.
 */
export function payingAccounts(accounts: BankAccount[], kind: EntryKind): BankAccount[] {
  return accounts
    .filter((a) => a.archivedAt === undefined && (kind === "expense" || a.kind !== "card"))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
}
```
With:
```ts
/**
 * The contas "Pago por" offers: not archived, that may pay or receive this
 * lançamento (`mayPayFrom`: a cartão only a despesa or the compra of an
 * investimento, an aplicação only a rendimento), the conta principal first.
 */
export function payingAccounts(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow | null): BankAccount[] {
  return accounts
    .filter((a) => a.archivedAt === undefined && mayPayFrom(a.kind, kind, flow))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
}
```

Callers still compile unchanged (the third parameter is optional): `components/finance/contas/PaidByField.tsx` (`payingAccounts(accounts, kind)` twice), `components/finance/contas/useMarkPaid.tsx:45`, `components/finance/contas/MovementAccountDialog.tsx:42` and `components/finance/extrato/RowActions.tsx:64` (both `"revenue"`: checking and caixa only, as before, now without aplicações). Do not edit them here.

- [ ] **Step 4b: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/bankAccounts.test.ts`
Expected: PASS

---

#### Cycle c: the conciliação's side

- [ ] **Step 1c: Write the failing test**

`lib/domain/statements/__tests__/match.test.ts` — one **Replace** block.

Replace:
```ts
  it("pairs entradas with receitas, vendas and transferências in; skips resolved lines", () => {
```
With:
```ts
  it("puts a lançamento on the side of its direction, whatever its kind", () => {
    const capital = (id: string, patch: Partial<Expense>) =>
      expense(id, { category: "other", dueDate: "2026-09-22", amountBrl: 80000, ...patch });
    const list = candidates([
      capital("liberacao", { kind: "financing", flow: "in" }),
      capital("parcela", { kind: "financing", flow: "out" }),
      capital("aporte", { kind: "partners", flow: "in" }),
      // No flow: a compra.
      capital("trator", { kind: "investment" }),
    ]);
    const map = suggestMatches(
      [line("in", "2026-09-22", "TED RECEBIDA", 80000), line("out", "2026-09-22", "PAGTO", -80000)],
      list
    );
    expect(map.get("in")?.map((s) => s.candidate.target.id)).toEqual(["liberacao", "aporte"]);
    expect(map.get("out")?.map((s) => s.candidate.target.id)).toEqual(["parcela", "trator"]);
  });

  it("pairs entradas with receitas, vendas and transferências in; skips resolved lines", () => {
```

- [ ] **Step 2c: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/match.test.ts`
Expected: FAIL — every lançamento that is not a receita is a saída, so the entrada line gets no suggestion and the saída line gets all four.

- [ ] **Step 3c: Implement**

`lib/domain/statements/match.ts` — **Replace** blocks.

Replace:
```ts
 * Same side (saída ↔ despesa, compra, transferência out; entrada ↔ receita,
 * venda, transferência in), value equal to the centavo, not yet paired, of
 * this conta or of none, within ±5 days. Pure.
 */
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { effectiveDueDate } from "@/lib/domain/ledger";

export type CandidateKind = "expense" | "revenue" | "sale" | "purchase" | "transferOut" | "transferIn";
```
With:
```ts
 * Same side (saída ↔ a lançamento going out, compra, transferência out;
 * entrada ↔ a lançamento coming in, venda, transferência in), value equal to
 * the centavo, not yet paired, of this conta or of none, within ±5 days. Pure.
 */
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { isInflow } from "@/lib/domain/entries";

/** For a lançamento, "expense" goes out and "revenue" comes in (`entryFlow`), whatever its kind. */
export type CandidateKind = "expense" | "revenue" | "sale" | "purchase" | "transferOut" | "transferIn";
```

Replace:
```ts
      kind: e.kind === "revenue" ? "revenue" : "expense",
```
With:
```ts
      kind: isInflow(e) ? "revenue" : "expense",
```

- [ ] **Step 4c: Run the tests**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/match.test.ts`
Expected: PASS

---

#### Cycle d: the export and the old Extrato's pills

- [ ] **Step 1d: Write the failing test**

`lib/export/__tests__/finance.test.ts` — three **Replace** blocks.

Replace:
```ts
const baseRow: LedgerRow = {
  id: "e1",
  kind: "expense",
```
With:
```ts
describe("expensesExportTable with money outside the resultado", () => {
  it("leaves investimentos and rendimentos out of the Despesas sheet", () => {
    const table = expensesExportTable([
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
      { id: "i1", kind: "investment", flow: "out", date: "2026-02-05", category: "other", amountBrl: 50000 },
      { id: "y1", kind: "yield", date: "2026-02-06", category: "other", amountBrl: 312.5, paidAt: "2026-02-06" },
    ]);
    expect(table.rows).toEqual([["2026-01-05", "Nutrição", null, 100]]);
  });
});

const baseRow: LedgerRow = {
  id: "e1",
  kind: "expense",
  inflow: false,
```

Replace:
```ts
      kind: "revenue",
      paidAt: "2026-08-12",
```
With:
```ts
      kind: "revenue",
      inflow: true,
      paidAt: "2026-08-12",
```

Replace:
```ts
  it("drops Valor when money is hidden", () => {
```
With:
```ts
  it("names the kinds outside the resultado", () => {
    const rows = ledgerExportTable([
      { ...baseRow, id: "i1", kind: "investment", group: "investment", groupLabel: "Investimentos" },
      { ...baseRow, id: "f1", kind: "financing", inflow: true, status: "receivable", group: "financing", groupLabel: "Financiamentos" },
      { ...baseRow, id: "p1", kind: "partners", group: "partners", groupLabel: "Sócios" },
      { ...baseRow, id: "y1", kind: "yield", inflow: true, status: "received", group: "capital", groupLabel: "Rendimento", account: null },
    ]).rows;
    expect(rows.map((r) => [r[3], r[4], r[11]])).toEqual([
      ["Investimento", "Investimentos", "A pagar"],
      ["Financiamento", "Financiamentos", "A receber"],
      ["Sócios", "Sócios", "A pagar"],
      ["Rendimento", "Rendimento", "Recebido"],
    ]);
  });

  it("drops Valor when money is hidden", () => {
```

- [ ] **Step 2d: Run it and watch it fail**

Run: `pnpm exec vitest run lib/export/__tests__/finance.test.ts`
Expected: FAIL — "names the kinds outside the resultado": `LEDGER_KIND_LABEL` has no `investment`, `financing`, `partners`, `yield` (Tipo is `undefined`). The Despesas-sheet test already passes: it pins the `kind === "expense"` filter.

- [ ] **Step 3d: Implement**

`lib/export/datasets/finance.ts` — **Replace** blocks.

Replace:
```ts
import { buildTable, type ExportTable } from "@/lib/export/table";
```
With:
```ts
import { buildTable, type ExportTable } from "@/lib/export/table";
import { ENTRY_KIND_LABEL } from "@/lib/domain/entries";
```

Replace:
```ts
/** Every despesa, newest first; receitas lançadas are left out. */
```
With:
```ts
/** Every despesa, newest first; receitas and the kinds outside the resultado are left out. */
```

Replace:
```ts
const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  expense: "Despesa",
  revenue: "Receita",
  sale: "Venda de gado",
```
With:
```ts
const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  ...ENTRY_KIND_LABEL,
  sale: "Venda de gado",
```

(`expensesExportTable` keeps `expenses.filter((e) => e.kind === "expense")`.)

`components/finance/extrato/ExtratoTable.tsx` — **Replace** blocks (compile fix; the file goes in task 11, which moves these pills to `pills.tsx`).

Replace:
```ts
  treatment: { label: "tratamento", className: "bg-fmd-soft text-fmd" },
};
```
With:
```ts
  treatment: { label: "tratamento", className: "bg-fmd-soft text-fmd" },
  investment: { label: "investimento", className: "bg-scheduled-soft text-scheduled" },
  financing: { label: "financiamento", className: "bg-fmd-soft text-fmd" },
  partners: { label: "sócios", className: "bg-surface text-ink-soft" },
  yield: { label: "rendimento", className: "bg-healthy-soft text-healthy" },
};
```

Replace:
```ts
/** Receitas and vendas come in: "+" and healthy. */
export function LedgerAmount({ row, className }: { row: LedgerRow; className?: string }) {
  const incoming = row.kind === "revenue" || row.kind === "sale";
```
With:
```ts
/** What comes in (receitas, vendas, rendimentos, capital that enters): "+" and healthy. */
export function LedgerAmount({ row, className }: { row: LedgerRow; className?: string }) {
  const incoming = row.inflow;
```

`components/finance/extrato/ExtratoFilters.tsx` — one-line compile fix (`Record<LedgerKind | "all", string>` no longer has every key; the tabs only list the old kinds and `oneOf(..., KIND_TABS, ...)` never yields a new one).

Replace:
```ts
export const KIND_TAB_LABEL: Record<LedgerKind | "all", string> = {
```
With:
```ts
export const KIND_TAB_LABEL: Partial<Record<LedgerKind | "all", string>> = {
```

- [ ] **Step 4d: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/bankAccounts.test.ts lib/domain/statements/__tests__/match.test.ts lib/export/__tests__/finance.test.ts`
Expected: PASS

---

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/domain/ledger.ts lib/domain/bankAccounts.ts lib/domain/statements/match.ts lib/export/datasets/finance.ts components/finance/extrato/ExtratoTable.tsx components/finance/extrato/ExtratoFilters.tsx lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/bankAccounts.test.ts lib/domain/statements/__tests__/match.test.ts lib/export/__tests__/finance.test.ts`
Expected: lint clean. tsc clean in every file of this task and in every file that reads `LedgerRow`, `LedgerKind`, `BankMove`, `payingAccounts` or `matchesStatusChoice` (`ExtratoPage`, `ExtratoList`, `ExtratoSummary`, `RowActions`, `RecentEntriesCard`, `MovementAccountDialog`, `AccountMovements`, `PaidByField`, `useMarkPaid`, `ConciliarPage`, `LineDialogs`, `app/(app)/finance/page.tsx`). This task causes no error elsewhere. Errors that may show while tasks 3, 4 and 5 of the same wave are mid-edit belong to them and are not fixed here: `lib/domain/economics.ts`, `lotEconomics.ts`, `moneyRedaction.ts`, `components/finance/CostBreakdownCard.tsx` (task 3); `lib/api/domains/expenses/**`, `lib/api/domains/bankAccounts/payingAccount.ts`, `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`, `lib/api/permissions/routeRequirements.ts` (task 4); `lib/api/domains/accounts/**`, `lib/api/domains/bankAccounts/schemas/**`, `lib/api/domains/bankAccounts/useCases/{AddBankAccount,UpdateBankAccount}.useCase.ts` (task 5). If `@/lib/domain/entries` does not resolve, task 1 is not done: stop.


### Task 3: Resultado reads the kind

**Files:**
- Modify: `lib/domain/economics.ts`
- Modify: `lib/domain/lotEconomics.ts`
- Modify: `lib/domain/moneyRedaction.ts`
- Modify: `components/finance/CostBreakdownCard.tsx` (the cost filter of `accountTotals` only)
- Test: `lib/domain/__tests__/economics.test.ts`
- Test: `lib/domain/__tests__/lotEconomics.test.ts`
- Test: `lib/domain/__tests__/moneyRedaction.test.ts`
- Test: `lib/api/__tests__/permissions.test.ts` (its herd fixture gains a conta: `redactHerdMoney` now maps `accounts`)

**Interfaces:**
- Consumes (task 1):
  - `@/lib/domain/entries`: `isCost(e: { kind: EntryKind }): boolean` (`kind === "expense"`), `isRevenue(e: { kind: EntryKind }): boolean` (`kind === "revenue"`).
  - `@/lib/types`: `EntryKind` with `investment | financing | partners | yield`, `Expense.flow?: EntryFlow`, `AccountGroup` with `"financing"`, `Account.openingBalanceBrl?: number`, `Account.openingDate?: string`.
- Produces: no new names. `monthlyRevenueCost`, `costBreakdownBetween`, `costBreakdown`, `coe`, `periodRevenue`, `indicators` and `lotEconomics` keep their signatures and count only `isCost` as cost and `isRevenue` as receita; the Painel (`app/(app)/finance/page.tsx`) and the dashboard (`app/(app)/dashboard/page.tsx`, `FinanceCard`) get it through them with no change. `redactHerdMoney` returns every `Account` without `openingBalanceBrl` and `openingDate`.

---

#### Cycle a: COE, receita, monthly series and composição

- [ ] **Step 1a: Write the failing test**

`lib/domain/__tests__/economics.test.ts` — one **Replace** block.

Replace:
```ts
describe("arrobasSold", () => {
```
With:
```ts
/** Money outside the resultado, inside the window and inside the last 12 months. */
const outsideResult: Expense[] = [
  expense({ id: "x-trator", kind: "investment", flow: "out", category: "other", date: "2026-06-05", amountBrl: 50000, paidAt: "2026-06-05" }),
  expense({ id: "x-parcela", kind: "financing", flow: "out", category: "other", date: "2026-06-10", amountBrl: 4000 }),
  expense({ id: "x-retirada", kind: "partners", flow: "out", category: "other", date: "2026-06-12", amountBrl: 6000, paidAt: "2026-06-12" }),
  expense({ id: "x-rendimento", kind: "yield", category: "other", date: "2026-06-30", amountBrl: 312.5, paidAt: "2026-06-30", bankAccountId: "aplic" }),
];
const withOutside = [...expenses, ...outsideResult];

describe("money outside the resultado", () => {
  it("changes neither the COE, the receita nor the Placar", () => {
    expect(coe(withOutside, treatments, P)).toBe(4050);
    expect(periodRevenue(withOutside, movements, P)).toEqual({ total: 9500, sales: 9000, other: 500 });
    expect(indicators({ ...input, expenses: withOutside }, P, 300, TODAY)).toEqual(indicators(input, P, 300, TODAY));
  });

  it("changes neither the monthly series nor the composição", () => {
    expect(monthlyRevenueCost(movements, treatments, withOutside, 6, REF)).toEqual(
      monthlyRevenueCost(movements, treatments, expenses, 6, REF)
    );
    expect(costBreakdown(withOutside, treatments, 12, REF)).toEqual(costBreakdown(expenses, treatments, 12, REF));
  });
});

describe("arrobasSold", () => {
```

- [ ] **Step 2a: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/economics.test.ts`
Expected: FAIL — `coe`, `monthlyRevenueCost` and `costBreakdownBetween` count everything that is not a receita as cost, so the COE is 64.362,50, June's cost and the Placar move, and an "other" slice appears.

- [ ] **Step 3a: Implement**

`lib/domain/economics.ts` — **Replace** blocks.

Replace:
```ts
 * - Revenue = priced sale movements + receitas lançadas (`kind: "revenue"`).
 *   Purchases are capital, never cost.
 * - COE = despesas (`kind: "expense"`, paid or not) + DONE treatments' `costBrl`.
```
With:
```ts
 * - Revenue = priced sale movements + receitas lançadas (`isRevenue`).
 *   Purchases are capital, never cost.
 * - COE = despesas (`isCost`, paid or not) + DONE treatments' `costBrl`.
 * - Investimentos, financiamentos, sócios and rendimentos are neither.
```

Replace:
```ts
import { annualise, inPeriod, periodDays } from "@/lib/domain/period";
```
With:
```ts
import { annualise, inPeriod, periodDays } from "@/lib/domain/period";
import { isCost, isRevenue } from "@/lib/domain/entries";
```

Replace:
```ts
const isRevenue = (e: Expense): boolean => e.kind === "revenue";

/**
 * Consolidated revenue × cost of the last `months` calendar months ending at
 * refIso's month. Receitas lançadas add to revenue and never to cost. Months
 * without records stay at zero.
 */
```
With:
```ts
/**
 * Consolidated revenue × cost of the last `months` calendar months ending at
 * refIso's month. Receitas lançadas add to revenue, despesas to cost, the
 * kinds outside the resultado to neither. Months without records stay at zero.
 */
```

Replace:
```ts
    else bucket.cost += e.amountBrl;
```
With:
```ts
    else if (isCost(e)) bucket.cost += e.amountBrl;
```

Replace:
```ts
 * Cost split by category between two ISO dates (both inclusive). Done
 * treatments' costs land in the "health" bucket; receitas are skipped. Zero
 * slices are dropped; empty array when there is no cost at all.
```
With:
```ts
 * Cost split by category between two ISO dates (both inclusive): the
 * despesas, and the done treatments' costs in the "health" bucket. Zero
 * slices are dropped; empty array when there is no cost at all.
```

Replace:
```ts
    if (!isRevenue(e) && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
```
With:
```ts
    if (isCost(e) && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
```

Replace:
```ts
    if (!isRevenue(e) && inPeriod(e.date, period)) total += e.amountBrl;
```
With:
```ts
    if (isCost(e) && inPeriod(e.date, period)) total += e.amountBrl;
```

(`periodRevenue` keeps `isRevenue(e)`, now the imported one.)

`components/finance/CostBreakdownCard.tsx` — **Replace** blocks (the composição's breakdown by conta must add up to the slice `costBreakdownBetween` gives).

Replace:
```ts
import { accountName } from "@/lib/domain/accounts";
```
With:
```ts
import { accountName } from "@/lib/domain/accounts";
import { isCost } from "@/lib/domain/entries";
```

Replace:
```ts
    if (expense.kind === "revenue" || expense.category !== category) continue;
```
With:
```ts
    if (!isCost(expense) || expense.category !== category) continue;
```

- [ ] **Step 4a: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/economics.test.ts`
Expected: PASS

---

#### Cycle b: custo por lote

- [ ] **Step 1b: Write the failing test**

`lib/domain/__tests__/lotEconomics.test.ts` — one **Replace** block.

Replace:
```ts
  it("leaves margin null without a quote and shares nothing without heads", () => {
```
With:
```ts
  it("leaves money outside the resultado out of every lote and of the rateio", () => {
    // The API stores no lote on these; a stray one still adds nothing.
    const outside: Expense[] = [
      expense({ id: "x-inv", kind: "investment", flow: "out", category: "other", lotId: "lot-a", amountBrl: 50000 }),
      expense({ id: "x-fin", kind: "financing", flow: "out", category: "other", lotId: "lot-a", amountBrl: 4000 }),
      expense({ id: "x-ret", kind: "partners", flow: "out", category: "other", lotId: "lot-b", amountBrl: 6000 }),
      expense({ id: "x-yield", kind: "yield", category: "other", amountBrl: 312.5, paidAt: "2026-02-01" }),
    ];
    expect(lotEconomics({ ...input, expenses: [...expenses, ...outside] }, P, QUOTE, TODAY)).toEqual(
      lotEconomics(input, P, QUOTE, TODAY)
    );
  });

  it("leaves margin null without a quote and shares nothing without heads", () => {
```

- [ ] **Step 2b: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/lotEconomics.test.ts`
Expected: FAIL — Lote A's direct cost takes the investimento and the parcela and Lote B's the retirada, so the direct costs and the rateio move.

- [ ] **Step 3b: Implement**

`lib/domain/lotEconomics.ts` — **Replace** blocks.

Replace:
```ts
import { inPeriod, periodDays } from "@/lib/domain/period";
```
With:
```ts
import { inPeriod, periodDays } from "@/lib/domain/period";
import { isCost } from "@/lib/domain/entries";
```

Replace:
```ts
  /** Lançamentos with the lote + treatments of its animals. */
```
With:
```ts
  /** Despesas with the lote + treatments of its animals. */
```

Replace:
```ts
    if (e.kind !== "revenue" && inPeriod(e.date, period)) addDirect(e.lotId, e.amountBrl);
```
With:
```ts
    if (isCost(e) && inPeriod(e.date, period)) addDirect(e.lotId, e.amountBrl);
```

- [ ] **Step 4b: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/lotEconomics.test.ts`
Expected: PASS

---

#### Cycle c: the saldo inicial is money

- [ ] **Step 1c: Write the failing test**

`lib/domain/__tests__/moneyRedaction.test.ts` — two **Replace** blocks.

Replace:
```ts
import type { HerdData, ManejoSession, SemenBull, Treatment } from "@/lib/types";
```
With:
```ts
import type { Account, HerdData, ManejoSession, SemenBull, Treatment } from "@/lib/types";
```

Replace:
```ts
  it("does not mutate its input", () => {
```
With:
```ts
  it("strips a financiamento's saldo inicial and its date, and keeps the conta", () => {
    const pronaf: Account = {
      id: "acc-2",
      group: "financing",
      name: "Pronaf custeio",
      openingBalanceBrl: 120000,
      openingDate: "2026-01-31",
    };
    const redacted = redactHerdMoney({ ...herd, accounts: [...herd.accounts, pronaf] });
    expect(redacted.accounts).toEqual([...herd.accounts, { id: "acc-2", group: "financing", name: "Pronaf custeio" }]);
    expect(redacted.accounts[1]).not.toHaveProperty("openingBalanceBrl");
    expect(redacted.accounts[1]).not.toHaveProperty("openingDate");
    expect(pronaf.openingBalanceBrl).toBe(120000);
  });

  it("does not mutate its input", () => {
```

`lib/api/__tests__/permissions.test.ts` — two **Replace** blocks. Its mocked herd has no `accounts`; once `redactHerdMoney` maps them, GET /api/herd would throw for a member without Financeiro.

Replace:
```ts
    lots: [],
```
With:
```ts
    lots: [],
    accounts: [
      { id: "acc-1", group: "financing", name: "Pronaf", openingBalanceBrl: 120000, openingDate: "2026-06-30" },
    ],
```

Replace:
```ts
    expect(data.expenses).toEqual([]);
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
```
With:
```ts
    expect(data.expenses).toEqual([]);
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
    expect(data.accounts).toEqual([{ id: "acc-1", group: "financing", name: "Pronaf" }]);
```

- [ ] **Step 2c: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/moneyRedaction.test.ts lib/api/__tests__/permissions.test.ts`
Expected: FAIL — 2 tests: `redactHerdMoney` passes `accounts` through, so the Pronaf still carries `openingBalanceBrl: 120000` and `openingDate`, in the unit test and in GET /api/herd for a vaqueiro.

- [ ] **Step 3c: Implement**

`lib/domain/moneyRedaction.ts` — **Replace** blocks.

Replace:
```ts
import type {
  HerdData,
```
With:
```ts
import type {
  Account,
  HerdData,
```

Replace:
```ts
export function redactHerdMoney(data: HerdData): HerdData {
  return {
    ...data,
```
With:
```ts
/** A financiamento's saldo inicial and its date; the conta's name carries no money. */
function redactAccount(account: Account): Account {
  return without(without(account, "openingBalanceBrl"), "openingDate");
}

export function redactHerdMoney(data: HerdData): HerdData {
  return {
    ...data,
    accounts: data.accounts.map(redactAccount),
```

- [ ] **Step 4c: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts lib/domain/__tests__/moneyRedaction.test.ts lib/api/__tests__/permissions.test.ts`
Expected: PASS

---

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/domain/economics.ts lib/domain/lotEconomics.ts lib/domain/moneyRedaction.ts components/finance/CostBreakdownCard.tsx lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts lib/domain/__tests__/moneyRedaction.test.ts lib/api/__tests__/permissions.test.ts`
Expected: lint clean; tsc clean (verified on top of tasks 1 and 2; this task changes no signature, so no caller breaks). Errors that may show while the other tasks of the same wave are mid-edit belong to them and are not fixed here: `lib/domain/ledger.ts`, `lib/domain/bankAccounts.ts`, `lib/domain/statements/match.ts`, `lib/export/datasets/finance.ts`, `components/finance/extrato/*` and their tests (task 2); `lib/api/domains/expenses/**`, `lib/api/domains/bankAccounts/payingAccount.ts`, `ResolveLine.useCase.ts`, `routeRequirements.ts` (task 4); `lib/api/domains/accounts/**`, `lib/api/domains/bankAccounts/{schemas,useCases}/**` (task 5).

Other readers of `Expense.kind` that sum or label money and belong to later tasks (do not touch them here): `components/finance/RecentEntriesCard.tsx:50` (`income` should be `row.inflow`), `components/finance/BillsCard.tsx:108`, `components/finance/contas/AccountMovements.tsx:57`, `components/finance/contas/ConciliarPage.tsx:126` and `components/finance/SeriesScopeDialog.tsx:59` (grupo label by `kind === "revenue"`; should use `entryGroup`) — task 12; `components/finance/contas/useMarkPaid.tsx:40,45,77,79` and `PaidByField.tsx` ("pago"/"recebido" and `payingAccounts` without `flow`) — task 8; `lib/api/domains/expenses/useCases/Update.useCase.ts:105` (signed by `kind === "revenue"`) — task 4; `components/finance/plano/AccountsPage.tsx:51` sums per conta, not cost, and is fine.


### Task 4: Lançamentos API

Every lançamento passes through one rule, `normaliseEntry`, which says what each kind needs and what gets stored. "Pago por" is checked by direction (`mayPayFrom`). Rows of a série carry `flow`. The conciliação reads the side with `entryFlow`. A new route, `POST /expenses/:id/split`, handles "Parcelar".

**Files:**
- Create: `lib/api/domains/expenses/entryRules.ts`
- Create: `lib/api/domains/expenses/useCases/Split.useCase.ts`
- Modify: `lib/api/domains/bankAccounts/payingAccount.ts`
- Modify: `lib/api/domains/expenses/schemas/expense.schema.ts`
- Modify: `lib/api/domains/expenses/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/Update.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/TopUpSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/expenses.controller.ts`
- Modify: `lib/api/domains/statements/useCases/ResolveLine.useCase.ts` (side check, `invalid_account` refusal)
- Modify: `lib/api/domains/statements/statements.controller.ts` (one-line compile fix: `invalid_account: 400` in `REFUSAL_STATUS`)
- Modify: `lib/api/permissions/routeRequirements.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Add.test.ts` (rewritten)
- Test: `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Update.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Split.test.ts` (new)
- Test: `lib/api/domains/expenses/__tests__/expenses.routes.test.ts` (new)
- Test: `lib/api/domains/statements/useCases/__tests__/statements.test.ts`
- Test: `lib/api/__tests__/routeRequirements.test.ts`, plus both snapshots under `lib/api/__tests__/__snapshots__/` (updated with `-u` on the two snapshot test paths only)
- Test: `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` (one queued select: AddExpense now reads the group of the "Sêmen" conta it is handed)

**Interfaces:**
- Consumes (task 1):
  - `@/lib/types`: `EntryKind` (six kinds), `EntryFlow`, `CapitalGroup`, `AccountGroup`, `Expense.flow?: EntryFlow`, `SeriesFrequency`.
  - `@/lib/domain/entries`: `CAPITAL_GROUPS: readonly CapitalGroup[]`, `isCapitalKind(kind: EntryKind): kind is CapitalGroup`, `entryFlow(e: { kind: EntryKind; flow?: EntryFlow | null }): EntryFlow`, `mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean`.
  - `@/lib/db/schema`: `expenses.flow` and `expenseSeries.flow` (`entry_flow`, nullable). `entry_kind` has the six values. `toExpense` maps `flow` (`orNothing(row.flow)`).
- Produces:
  - `isPayingAccount(repo: RepositoryType, farmId: number, bankAccountId: string, kind: EntryKind, allowArchived = false, flow: EntryFlow | null = null): Promise<boolean>`
  - From `lib/api/domains/expenses/entryRules.ts`:
    - `EntryInput`
    - `NormalisedEntry { kind; flow: EntryFlow | null; category; dueDate: string | null; paidAt: string | null; accountId: string | null; lotId: string | null }`
    - `normaliseEntry(repo, farmId, entry: EntryInput): Promise<NormalisedEntry | "invalid_account" | "invalid_bank_account">`
  - `SplitExpenseUseCase`.
  - `POST /api/herd/expenses/:id/split`, body `{ count: 2..48, frequency: "monthly" | "weekly", startsOn: DateString }`. Answers:
    - `200 Expense[]`, first position first;
    - `404 { error: "not_found" }`;
    - `400 { error: "not_splittable" | "invalid_repeat" | "due_before_date" }`.

    The Eden call is `api.expenses({ id }).split.post(input)`.
  - From `expense.schema.ts`: `EntryKindModel` (six kinds), `EntryFlowModel`, `SplitExpenseBody`. `NewExpenseBody` and `UpdateExpenseBody` gain `flow?`.
  - `ExpensePatchInput.flow?: EntryFlow`.
  - POST and PATCH `/expenses` can answer 400 `invalid_account`. `ResolveRefusal` gains `"invalid_account"`.

- [ ] **Step 1: Write the failing tests for Add (the kind's rules and "Pago por" by direction)**

Replace the whole file `lib/api/domains/expenses/useCases/__tests__/Add.test.ts` with:

```ts
/**
 * addExpense: registers a lançamento with its vencimento, pagamento, conta and
 * lote. A despesa by default; a vencimento before the data is refused. The
 * kinds fora do resultado take a conta do plano of their group and a
 * movimento; a rendimento takes its aplicação and is paid on its data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the conta do plano, then "Pago por"), inserts record
 * the row and echo it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every `insert().values()` row. */
    inserts: [] as Record<string, unknown>[],
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

function insertBuilder() {
  return {
    values: (row: Record<string, unknown>) => ({
      returning: () => {
        state.inserts.push(row);
        return Promise.resolve([row]);
      },
    }),
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { AddExpenseUseCase } from "../Add.useCase";

const ENTRY = { farmId: 7, date: "2026-09-10", category: "nutrition" as const, amountBrl: 500 };
const add = (input: Parameters<AddExpenseUseCase["run"]>[0]) => new AddExpenseUseCase().run(input);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addExpense", () => {
  it("writes every new column, a despesa by default", async () => {
    state.selectResults = [[{ group: "nutrition" }]];

    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      notes: "Sal",
      dueDate: "2026-09-20",
      counterparty: "Agro Sul",
      document: "NF 4.812",
      accountId: "acc-1",
      lotId: "lot-1",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      farmId: 7,
      kind: "expense",
      flow: null,
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      notes: "Sal",
      dueDate: "2026-09-20",
      paidAt: null,
      counterparty: "Agro Sul",
      document: "NF 4.812",
      accountId: "acc-1",
      lotId: "lot-1",
    });
    expect(result).toMatchObject({ kind: "expense", dueDate: "2026-09-20" });
  });

  it("writes absent optionals as null", async () => {
    await new AddExpenseUseCase().run({
      farmId: 7,
      kind: "revenue",
      date: "2026-09-10",
      category: "other",
      amountBrl: 800,
    });

    expect(state.inserts[0]).toMatchObject({
      kind: "revenue",
      dueDate: null,
      paidAt: null,
      counterparty: null,
      document: null,
      accountId: null,
      lotId: null,
    });
  });

  it("refuses a vencimento before the data and inserts nothing", async () => {
    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "nutrition",
      amountBrl: 500,
      dueDate: "2026-09-01",
    });

    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });
});

describe("addExpense — fora do resultado", () => {
  it("refuses an investimento without conta, or with a conta of another group or farm", async () => {
    const compra = { ...ENTRY, kind: "investment" as const, amountBrl: 38000 };
    expect(await add(compra)).toBe("invalid_account");
    state.selectResults = [[{ group: "financing" }]];
    expect(await add({ ...compra, accountId: "acc-pronaf" })).toBe("invalid_account");
    state.selectResults = [[]];
    expect(await add({ ...compra, accountId: "acc-of-another-farm" })).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("stores a capital lançamento sent without movimento as a saída, without grupo or lote", async () => {
    state.selectResults = [[{ group: "partners" }]];

    await add({ ...ENTRY, kind: "partners", accountId: "acc-retiradas", lotId: "lot-1" });

    expect(state.inserts[0]).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "other",
      lotId: null,
      accountId: "acc-retiradas",
    });
  });

  it("keeps a despesa or a receita out of the contas fora do resultado", async () => {
    state.selectResults = [[{ group: "investment" }]];
    expect(await add({ ...ENTRY, accountId: "acc-benfeitorias" })).toBe("invalid_account");
    state.selectResults = [[{ group: "partners" }]];
    expect(await add({ ...ENTRY, kind: "revenue", category: "other", accountId: "acc-aportes" })).toBe(
      "invalid_account"
    );
    expect(state.inserts).toEqual([]);
  });

  it("lets a cartão pay a compra, never a retirada or a venda do bem", async () => {
    const paidByCard = { paidAt: "2026-09-10", bankAccountId: "cartao" };
    const card = [{ kind: "card", archivedAt: null }];
    state.selectResults = [[{ group: "partners" }], card];
    expect(await add({ ...ENTRY, kind: "partners", accountId: "acc-retiradas", ...paidByCard })).toBe(
      "invalid_bank_account"
    );
    state.selectResults = [[{ group: "investment" }], card];
    expect(
      await add({ ...ENTRY, kind: "investment", flow: "in", accountId: "acc-maquinas", ...paidByCard })
    ).toBe("invalid_bank_account");
    expect(state.inserts).toEqual([]);

    state.selectResults = [[{ group: "investment" }], card];
    expect(await add({ ...ENTRY, kind: "investment", accountId: "acc-maquinas", ...paidByCard })).toMatchObject({
      kind: "investment",
      flow: "out",
      bankAccountId: "cartao",
    });
  });

  it("keeps a rendimento in its aplicação, paid on its data, and refuses it anywhere else", async () => {
    const rendimento = { ...ENTRY, kind: "yield" as const, amountBrl: 812.4 };
    state.selectResults = [[{ kind: "investment", archivedAt: null }]];
    await add({ ...rendimento, dueDate: "2026-09-30", lotId: "lot-1", bankAccountId: "cdb" });
    expect(state.inserts[0]).toMatchObject({
      kind: "yield",
      flow: null,
      category: "other",
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      lotId: null,
      bankAccountId: "cdb",
    });

    state.selectResults = [[{ kind: "checking", archivedAt: null }]];
    expect(await add({ ...rendimento, bankAccountId: "sicredi" })).toBe("invalid_bank_account");
    expect(await add(rendimento)).toBe("invalid_bank_account");
    expect(await add({ ...rendimento, accountId: "acc-1", bankAccountId: "cdb" })).toBe("invalid_account");
    expect(state.inserts).toHaveLength(1);
  });
});
```

**Replace** in `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts`:

```ts
      // 2. the farm's active "Sêmen" conta in Reprodução
      [{ id: "acc-semen" }],
    ];
```

with:

```ts
      // 2. the farm's active "Sêmen" conta in Reprodução
      [{ id: "acc-semen" }],
      // 3. AddExpense checks that conta's group
      [{ group: "breeding" }],
    ];
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Add.test.ts`
Expected: FAIL. "writes every new column" fails because no `flow: null` is written. The other two old tests pass. Every test under "fora do resultado" fails: no conta is checked, `flow` is never written, a capital row keeps its grupo and lote, and a rendimento is not paid on its data.

- [ ] **Step 3: Implement `isPayingAccount` by direction, `normaliseEntry` and Add**

Replace the whole file `lib/api/domains/bankAccounts/payingAccount.ts` with:

```ts
import { and, eq } from "drizzle-orm";

import { bankAccounts } from "@/lib/db/schema";
import { mayPayFrom } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind } from "@/lib/types";

/**
 * Whether a lançamento of `kind` (and movimento `flow`) may be paid from or
 * received into the conta. The conta must be of this farm and not archived
 * (unless `allowArchived`: a row that already holds it). Its kind must be one
 * `mayPayFrom` takes: a cartão only pays a despesa or a compra of an
 * investimento, and an aplicação only receives a rendimento. A venda or a
 * compra of the manejos passes "revenue", which keeps cartões and aplicações out.
 */
export async function isPayingAccount(
  repo: RepositoryType,
  farmId: number,
  bankAccountId: string,
  kind: EntryKind,
  allowArchived = false,
  flow: EntryFlow | null = null
): Promise<boolean> {
  const [account] = await repo
    .select({ kind: bankAccounts.kind, archivedAt: bankAccounts.archivedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
    .limit(1);
  return (
    account !== undefined &&
    (allowArchived || account.archivedAt === null) &&
    mayPayFrom(account.kind, kind, flow)
  );
}
```

Create `lib/api/domains/expenses/entryRules.ts`:

```ts
/**
 * What a lançamento needs and what it stores, by kind. Add, AddSeries and
 * Update all ask here.
 *
 * - investment, financing, partners: a conta do plano of the same group and
 *   of this farm, and a movimento (a saída when none is sent). Grupo
 *   "other", no lote.
 * - yield: its aplicação as conta bancária (isPayingAccount says which one
 *   may receive it), paid on its data. No conta do plano, no vencimento, no
 *   lote, no movimento.
 * - expense, revenue: as sent. A conta, when given, must be of this farm and
 *   outside the capital groups.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { CAPITAL_GROUPS, isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { CapitalGroup, EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

/** A lançamento as sent, or a row as it will be after a patch. */
export interface EntryInput {
  kind: EntryKind;
  flow?: EntryFlow | null;
  date: string;
  category: ExpenseCategory;
  dueDate?: string | null;
  paidAt?: string | null;
  accountId?: string | null;
  lotId?: string | null;
  bankAccountId?: string | null;
}

/** The columns the kind decides, as they are stored. */
export interface NormalisedEntry {
  kind: EntryKind;
  flow: EntryFlow | null;
  category: ExpenseCategory;
  dueDate: string | null;
  paidAt: string | null;
  accountId: string | null;
  lotId: string | null;
}

/**
 * The row as it will be stored, or why not.
 *
 * `invalid_account`: a capital lançamento without a conta of its group on
 * this farm; a despesa or receita in a conta of another farm or of a capital
 * group; a rendimento with a conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select, and only when a conta do plano is sent.
 */
export async function normaliseEntry(
  repo: RepositoryType,
  farmId: number,
  entry: EntryInput
): Promise<NormalisedEntry | "invalid_account" | "invalid_bank_account"> {
  const accountId = entry.accountId ?? null;
  if (entry.kind === "yield") {
    if (accountId !== null) return "invalid_account";
    if (!entry.bankAccountId) return "invalid_bank_account";
    return {
      kind: "yield",
      flow: null,
      category: "other",
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    // A capital lançamento sits in a conta of its own group; a despesa or receita never in a capital one.
    const fits =
      account !== undefined &&
      (capital ? account.group === entry.kind : !CAPITAL_GROUPS.includes(account.group as CapitalGroup));
    if (!fits) return "invalid_account";
  }
  const common = { dueDate: entry.dueDate ?? null, paidAt: entry.paidAt ?? null, accountId };
  return capital
    ? { kind: entry.kind, flow: entry.flow ?? "out", category: "other", lotId: null, ...common }
    : { kind: entry.kind, flow: null, category: entry.category, lotId: entry.lotId ?? null, ...common };
}
```

Replace the whole file `lib/api/domains/expenses/useCases/Add.useCase.ts` with:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";

type AddExpenseUseCaseProps = Omit<Expense, "id" | "kind"> & {
  farmId: number;
  /** Defaults to a despesa. */
  kind?: EntryKind;
};

/**
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_account`: the conta do plano does not fit the kind (see normaliseEntry).
 * - `invalid_bank_account`: "Pago por" is not a conta of the farm that may pay
 *   it. That covers an archived conta, a cartão receiving money, and anything
 *   but an aplicação for a rendimento.
 */
type AddExpenseUseCaseResponse = Expense | "due_before_date" | "invalid_account" | "invalid_bank_account";

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
    flow,
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
    bankAccountId,
  }) => {
    const entry = await normaliseEntry(this.repository, farmId, {
      kind,
      flow,
      date,
      category,
      dueDate,
      paidAt,
      accountId,
      lotId,
      bankAccountId,
    });
    if (typeof entry === "string") return entry;
    if (entry.dueDate !== null && entry.dueDate < date) return "due_before_date";
    // A pending lançamento has no conta.
    const payingAccountId = entry.paidAt === null ? null : (bankAccountId ?? null);
    if (
      payingAccountId !== null &&
      !(await isPayingAccount(this.repository, farmId, payingAccountId, kind, false, entry.flow))
    ) {
      return "invalid_bank_account";
    }
    // ponytail: lotId is not checked against the farm; the FK only proves it exists.
    const [row] = await this.repository
      .insert(expenses)
      .values({
        id: randomUUID(),
        farmId,
        ...entry,
        date,
        amountBrl,
        notes,
        counterparty: counterparty ?? null,
        document: document ?? null,
        bankAccountId: payingAccountId,
      })
      .returning();
    return toExpense(row);
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts lib/api/domains/semen/useCases/__tests__/AddBull.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for the séries (AddSeries, TopUpSeries)**

**Replace** in `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`:

```ts
const { state } = vi.hoisted(() => ({
  state: { inserts: [] as Record<string, unknown>[][] },
}));

vi.mock("@/lib/db", () => {
  const db = {
    insert: () => ({
```

with:

```ts
const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order: the conta do plano, then "Pago por". */
    selectResults: [] as Record<string, unknown>[][],
    inserts: [] as Record<string, unknown>[][],
  },
}));

vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
      };
      return builder;
    },
    insert: () => ({
```

**Replace** in the same file:

```ts
beforeEach(() => {
  state.inserts = [];
});
```

with:

```ts
beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});
```

**Replace** in the same file:

```ts
    expect(await run("2025-09-27")).toBe("starts_too_old");
    expect(await run("2025-09-28")).not.toBe("starts_too_old");
  });
});
```

with:

```ts
    expect(await run("2025-09-27")).toBe("starts_too_old");
    expect(await run("2025-09-28")).not.toBe("starts_too_old");
  });
});

describe("addSeries — fora do resultado", () => {
  it("writes a financiamento's movimento on the série and every parcela, without grupo or lote", async () => {
    state.selectResults = [[{ group: "financing" }]];

    await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "financing",
      accountId: "acc-pronaf",
      lotId: "lot-1",
      amountBrl: 1200,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({
      kind: "financing",
      flow: "out",
      category: "other",
      accountId: "acc-pronaf",
      lotId: null,
    });
    expect(rows.every((row) => row.flow === "out" && row.category === "other" && row.lotId === null)).toBe(true);
  });

  it("refuses a série of sócios without a conta of its group", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "partners",
      amountBrl: 5000,
      repeat: { mode: "recurring", frequency: "monthly", startsOn: "2026-10-05" },
    });
    expect(result).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("never repeats a rendimento", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      kind: "yield",
      amountBrl: 50,
      bankAccountId: "cdb",
      repeat: { mode: "recurring", frequency: "monthly", startsOn: "2026-10-05" },
    });
    expect(result).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
  });
});
```

**Replace** in `lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`:

```ts
  it("stops at até", async () => {
```

with:

```ts
  it("writes the série's kind and movimento on each new row", async () => {
    const pronaf = { ...SALARIO, kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" };
    state.selectResults = [[pronaf], [pronaf]];

    await new TopUpSeriesUseCase().run({ farmId: 7, todayIso: "2026-11-10" });

    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" });
  });

  it("stops at até", async () => {
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`
Expected: FAIL. The financiamento série keeps "nutrition" and lot-1 and writes no `flow`. The sócios série without a conta is created. The recurring rendimento is created. The top-up writes no `flow`.

- [ ] **Step 7: Implement AddSeries and TopUpSeries**

Replace the whole file `lib/api/domains/expenses/useCases/AddSeries.useCase.ts` with:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";
import { parseISODate } from "@/lib/domain/dates";
import {
  addMonths,
  HORIZON_MONTHS,
  installmentPlan,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  recurringDates,
  seriesHorizon,
} from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, Expense, ExpenseCategory, SeriesRepeat } from "@/lib/types";

interface AddSeriesUseCaseProps {
  farmId: number;
  todayIso: string;
  kind?: EntryKind;
  /** Movimento of an investment, financing or partners série; absent = saída. */
  flow?: EntryFlow;
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
  /** "Pago por" of the first row, when it is paid. */
  bankAccountId?: string;
  repeat: SeriesRepeat;
}

/**
 * - `due_before_date`: the first parcela falls before the purchase.
 * - `invalid_repeat`: a parcelamento has no valid count (2–48, at least a
 *   centavo each), a recorrência ends before it starts, nothing falls in the
 *   window, or it is a rendimento.
 * - `starts_too_old`: a recorrência starts more than 12 months ago.
 * - `invalid_account` and `invalid_bank_account`: as for one lançamento
 *   (normaliseEntry, isPayingAccount).
 */
type AddSeriesUseCaseResponse =
  | Expense[]
  | "due_before_date"
  | "invalid_repeat"
  | "starts_too_old"
  | "invalid_account"
  | "invalid_bank_account";

type CurrUseCase = _UseCase<AddSeriesUseCaseProps, AddSeriesUseCaseResponse>;

/**
 * Creates a série and its rows in one transaction.
 *
 * A parcelamento writes every parcela with the purchase's `date` and stepped
 * vencimentos; the last one takes the centavos. A recorrência writes each
 * ocorrência on its own vencimento up to min(endsOn, today + 12 months), and
 * the herd load tops up the rest as time passes.
 */
export class AddSeriesUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddSeriesUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, todayIso, repeat, kind = "expense", flow, ...entry }) => {
    // A rendimento is what one day earned: it never repeats.
    if (kind === "yield") return "invalid_repeat";
    const installments = repeat.mode === "installments";
    const count = repeat.count ?? 0;
    if (installments && (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS)) {
      return "invalid_repeat";
    }
    // Every parcela carries at least one centavo.
    if (installments && Math.round(entry.amountBrl * 100) < count) return "invalid_repeat";
    if (installments && repeat.startsOn < entry.date) return "due_before_date";
    if (!installments && repeat.endsOn !== undefined && repeat.endsOn < repeat.startsOn) {
      return "invalid_repeat";
    }
    // A backdated recorrência would write a year of past bills at once.
    if (!installments && repeat.startsOn < addMonths(todayIso, -HORIZON_MONTHS)) return "starts_too_old";

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
    const shape = await normaliseEntry(this.repository, farmId, { ...entry, kind, flow });
    if (typeof shape === "string") return shape;
    const firstAccountId = entry.paidAt === undefined ? null : (entry.bankAccountId ?? null);
    if (
      firstAccountId !== null &&
      !(await isPayingAccount(this.repository, farmId, firstAccountId, kind, false, shape.flow))
    ) {
      return "invalid_bank_account";
    }

    const template = {
      kind,
      flow: shape.flow,
      category: shape.category,
      notes: entry.notes ?? null,
      counterparty: entry.counterparty ?? null,
      document: entry.document ?? null,
      accountId: shape.accountId,
      lotId: shape.lotId,
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
            bankAccountId: line.index === 1 ? firstAccountId : null,
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

**Replace** in `lib/api/domains/expenses/useCases/TopUpSeries.useCase.ts`:

```ts
              kind: series.kind,
```

with:

```ts
              kind: series.kind,
              flow: series.flow,
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing tests for Update and UpdateSeries (Review Focus 5)**

**Replace** in `lib/api/domains/expenses/useCases/__tests__/Update.test.ts`:

```ts
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
```

with:

```ts
const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
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
  bankAccountId: null,
};
```

**Replace** in the same file:

```ts
    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});
```

with:

```ts
    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});

describe("updateExpense — what the kind needs", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("refuses a new kind while the conta still belongs to the old group", async () => {
    state.selectResults = [[ROW], [{ group: "nutrition" }]];
    expect(await run({ kind: "investment" })).toBe("invalid_account");

    const benfeitoria = { ...ROW, kind: "investment", flow: "out", category: "other", accountId: "acc-benf" };
    state.selectResults = [[benfeitoria], [{ group: "investment" }]];
    expect(await run({ kind: "expense" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("turns a despesa into an investimento: the conta's group, no grupo, no lote, a saída", async () => {
    state.selectResults = [[{ ...ROW, lotId: "lot-1" }], [{ group: "investment" }]];
    state.updateResults = [[{ ...ROW, kind: "investment", flow: "out", category: "other", accountId: "acc-benf" }]];

    const result = await run({ kind: "investment", accountId: "acc-benf", category: "nutrition", lotId: "lot-1" });

    expect(state.updates[0]).toMatchObject({
      kind: "investment",
      flow: "out",
      category: "other",
      lotId: null,
      accountId: "acc-benf",
    });
    expect(result).toMatchObject({ kind: "investment", flow: "out" });
  });

  it("checks Pago por against a new movimento: an aporte never enters a cartão", async () => {
    const retirada = {
      ...ROW,
      kind: "partners",
      flow: "out",
      category: "other",
      accountId: "acc-socios",
      paidAt: "2026-09-12",
      bankAccountId: "cartao",
    };
    state.selectResults = [[retirada], [{ group: "partners" }], [{ kind: "card", archivedAt: null }]];

    expect(await run({ flow: "in" })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
  });

  it("keeps a rendimento paid on its data", async () => {
    const rendimento = {
      ...ROW,
      kind: "yield",
      category: "other",
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      bankAccountId: "cdb",
    };
    state.selectResults = [[rendimento]];
    state.updateResults = [[{ ...rendimento, date: "2026-09-30", paidAt: "2026-09-30" }]];

    await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({ date: "2026-09-30", paidAt: "2026-09-30", dueDate: null });
  });
});
```

**Replace** in `lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`:

```ts
  it("never re-splits a parcelamento's value", async () => {
```

with:

```ts
  it("carries a new movimento to the série and its unpaid rows", async () => {
    const aporte = (r: ReturnType<typeof row>) => ({
      ...r,
      kind: "partners",
      flow: "out",
      category: "other",
      accountId: "acc-socios",
      bankAccountId: null,
    });
    const rows = ROWS.map(aporte);
    // The row, the série, the row again (its own update), its conta do plano, its linhas (none), the siblings.
    state.selectResults = [[rows[1]], [SERIES], [rows[1]], [{ group: "partners" }], [], rows];
    state.returning = [[{ ...rows[1], flow: "in" }]];

    await new UpdateSeriesUseCase().run({ farmId: 7, id: "e-2", patch: { flow: "in" }, scope: "all" });

    expect(state.updates[0]).toMatchObject({ kind: "partners", flow: "in", category: "other" });
    // The série template, then row 4 (rows 1 and 3 are paid).
    expect(state.updates.slice(1)).toEqual([{ flow: "in" }, { flow: "in" }]);
  });

  it("never re-splits a parcelamento's value", async () => {
```

- [ ] **Step 10: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`
Expected: FAIL. The kind change is saved with the old conta. The despesa keeps its grupo and lote. The aporte is saved on the cartão. The rendimento ends up unpaid. The série's rows never receive `flow`. The old describe blocks still pass.

- [ ] **Step 11: Implement Update and UpdateSeries**

Replace the whole file `lib/api/domains/expenses/useCases/Update.useCase.ts` with:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { normaliseEntry } from "@/lib/api/domains/expenses/entryRules";
import { sameCents, unpairStale } from "@/lib/api/domains/statements/unpairStale";
import { entryFlow } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, Expense, ExpenseCategory } from "@/lib/types";

/** Editable fields of a lançamento; absent leaves a field, null clears it. */
export interface ExpensePatchInput {
  date?: string;
  category?: ExpenseCategory;
  amountBrl?: number;
  kind?: EntryKind;
  /** Movimento of an investment, financing or partners row. */
  flow?: EntryFlow;
  notes?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  counterparty?: string | null;
  document?: string | null;
  accountId?: string | null;
  lotId?: string | null;
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId?: string | null;
}

interface UpdateExpenseUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpensePatchInput;
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse =
  | Expense
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account"
  | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

/**
 * Edits a lançamento of the farm ("Editar", "Marcar como pago"), checked as
 * the row will be after the patch:
 * - the vencimento against the data;
 * - what the kind needs and stores (normaliseEntry), when the kind, the
 *   movimento or the conta do plano changes, or when the row is fora do
 *   resultado;
 * - "Pago por", when it changes, or against a new kind or movimento.
 * A linha do extrato the edit no longer agrees with (unpaid, other conta,
 * value or side) is unpaired in the same transaction.
 */
export class UpdateExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, patch }) =>
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
      const [current] = await tx.select().from(expenses).where(scope).limit(1).for("update");
      if (!current) return null;

      const kind = patch.kind ?? current.kind;
      const date = patch.date ?? current.date;
      const merged = {
        kind,
        flow: patch.flow ?? current.flow,
        date,
        category: patch.category ?? current.category,
        dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
        paidAt: patch.paidAt === undefined ? current.paidAt : patch.paidAt,
        accountId: patch.accountId === undefined ? current.accountId : patch.accountId,
        lotId: patch.lotId === undefined ? current.lotId : patch.lotId,
        bankAccountId: patch.bankAccountId === undefined ? current.bankAccountId : patch.bankAccountId,
      };
      // A despesa or receita that keeps its kind and conta keeps its shape: no query for the conta.
      const reshaped =
        patch.kind !== undefined ||
        patch.flow !== undefined ||
        patch.accountId !== undefined ||
        (kind !== "expense" && kind !== "revenue");
      const shape = reshaped ? await normaliseEntry(tx, farmId, merged) : null;
      if (typeof shape === "string") return shape;
      const after = shape ?? merged;
      if (after.dueDate !== null && after.dueDate < date) return "due_before_date";

      // Unpaying clears the conta; a pending lançamento never holds one.
      const paid = after.paidAt !== null;
      const bankAccountId = !paid ? (current.bankAccountId ? null : undefined) : patch.bankAccountId;
      const contaAfter = bankAccountId === undefined ? current.bankAccountId : bankAccountId;
      // An unchanged conta saves even if archived; a new kind or movimento is still checked (no receita on a cartão).
      const contaChanged = contaAfter !== current.bankAccountId;
      if (
        contaAfter !== null &&
        (contaChanged || kind !== current.kind || after.flow !== current.flow) &&
        !(await isPayingAccount(tx, farmId, contaAfter, kind, !contaChanged, after.flow))
      ) {
        return "invalid_bank_account";
      }

      // Only the declared fields reach the update, never a stray column like farmId. When
      // normaliseEntry ran, the columns the kind decides are written as it left them.
      const { category, amountBrl, notes, paidAt, counterparty, document, accountId, lotId } = patch;
      const declared = {
        date: patch.date,
        kind: patch.kind,
        category,
        amountBrl,
        notes,
        dueDate: patch.dueDate,
        paidAt,
        counterparty,
        document,
        accountId,
        lotId,
        bankAccountId,
        ...shape,
      };
      const set = Object.fromEntries(
        Object.entries(declared).filter(([, value]) => value !== undefined)
      ) as Partial<typeof expenses.$inferInsert>;
      if (Object.keys(set).length === 0) return toExpense(current);
      const [row] = await tx.update(expenses).set(set).where(scope).returning();
      if (!row) return null;
      if (
        paidAt !== undefined ||
        bankAccountId !== undefined ||
        amountBrl !== undefined ||
        patch.kind !== undefined ||
        patch.flow !== undefined
      ) {
        const signed = entryFlow(row) === "in" ? row.amountBrl : -row.amountBrl;
        await unpairStale(
          tx,
          farmId,
          "expenseId",
          id,
          (line) => row.paidAt !== null && row.bankAccountId === line.bankAccountId && sameCents(signed, line)
        );
      }
      return toExpense(row);
    });
}
```

**Replace** in `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`:

```ts
/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account" | null;

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
```

with:

```ts
/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse =
  | Expense
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account"
  | null;

type CurrUseCase = _UseCase<UpdateSeriesUseCaseProps, UpdateSeriesUseCaseResponse>;

type SharedFields = Partial<
  Pick<
    typeof expenses.$inferInsert,
    "category" | "flow" | "accountId" | "lotId" | "counterparty" | "document" | "notes" | "amountBrl"
  >
>;

/**
 * What an edit carries to the série's other rows: only the fields it sent.
 * Grupo, movimento and lote go as the edited row stored them, since its kind
 * may have overruled the form.
 */
function sharedFields(patch: ExpensePatchInput, recurring: boolean, row: Expense): SharedFields {
  const { category, flow, accountId, lotId, counterparty, document, notes, amountBrl } = patch;
  const fields: SharedFields = {
    category: category === undefined ? undefined : row.category,
    flow: flow === undefined ? undefined : (row.flow ?? null),
    accountId,
    lotId: lotId === undefined ? undefined : (row.lotId ?? null),
    counterparty,
    document,
    notes,
    // A parcela's value is edited per parcela: the total is never re-split.
    amountBrl: recurring ? amountBrl : undefined,
  };
```

**Replace** in the same file:

```ts
 * whole patch; the série's template and every UNPAID row in scope take the
 * shared fields (conta, lote, pago para, documento, observação, and the valor
 * of a recorrência). Moving an ocorrência's vencimento moves the rule: its day
```

with:

```ts
 * whole patch; the série's template and every UNPAID row in scope take the
 * shared fields (grupo, conta, movimento, lote, pago para, documento,
 * observação, and the valor of a recorrência). Moving an ocorrência's
 * vencimento moves the rule: its day
```

**Replace** in the same file:

```ts
      const shared = sharedFields(patch, recurring);
```

with:

```ts
      // ponytail: a new kind reaches this row only (the form never changes it); share it once an edit may.
      const shared = sharedFields(patch, recurring, updated);
```

- [ ] **Step 12: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts`
Expected: PASS

- [ ] **Step 13: Write the failing tests for Parcelar (Review Focus 4) and its route**

Create `lib/api/domains/expenses/useCases/__tests__/Split.test.ts`:

```ts
/**
 * splitExpense ("Parcelar"): one pending lançamento outside any série becomes
 * a parcelamento of N parcelas, split as a new one is. The first parcela is
 * the row itself (same id, so its anexos stay). The db stub echoes what is
 * written; an update echoes the locked row with the columns set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** The lançamento the use case locks. */
    row: {} as Record<string, unknown>,
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const rows = state.selectResults.shift() ?? [];
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        for: () => builder,
        then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
      };
      return builder;
    },
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(values) ? values : [values];
        state.inserts.push(rows);
        return { returning: () => Promise.resolve(rows) };
      },
    }),
    update: () => ({
      set: (columns: Record<string, unknown>) => {
        state.updates.push(columns);
        return { where: () => ({ returning: () => Promise.resolve([{ ...state.row, ...columns }]) }) };
      },
    }),
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import type { Expense } from "@/lib/types";

import { SplitExpenseUseCase } from "../Split.useCase";

/** A compra of a trator, R$ 1.000,00, still to pay. */
const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "investment",
  flow: "out",
  date: "2026-09-27",
  category: "other",
  amountBrl: 1000,
  notes: null,
  dueDate: "2026-09-27",
  paidAt: null,
  counterparty: "Agro Máquinas",
  document: "NF 912",
  accountId: "acc-maquinas",
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: null,
};

/** Queues the lançamento the use case locks, then its anexos' count. */
function given(row: Record<string, unknown>, attachments = 0) {
  state.row = row;
  state.selectResults = [[row], [{ total: attachments }]];
}

const split = (count: number, startsOn = "2026-10-10") =>
  new SplitExpenseUseCase().run({ farmId: 7, id: "e-1", count, frequency: "monthly", startsOn });

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.updates = [];
});

describe("splitExpense", () => {
  it("keeps the first id, splits the centavos as a new parcelamento and sums to the total", async () => {
    given(ROW, 2);

    const result = (await split(3)) as Expense[];

    const [[series], rows] = state.inserts;
    expect(series).toMatchObject({
      mode: "installments",
      frequency: "monthly",
      dayOfMonth: 10,
      startsOn: "2026-10-10",
      endsOn: null,
      count: 3,
      generatedCount: 3,
      amountBrl: 1000,
      kind: "investment",
      flow: "out",
      accountId: "acc-maquinas",
      counterparty: "Agro Máquinas",
    });
    // The row becomes parcela 1 in place.
    expect(state.updates).toEqual([
      { dueDate: "2026-10-10", amountBrl: 333.33, seriesId: series.id, seriesIndex: 1 },
    ]);
    expect(rows.map((row) => [row.seriesIndex, row.date, row.dueDate, row.amountBrl])).toEqual([
      [2, "2026-09-27", "2026-11-10", 333.33],
      [3, "2026-09-27", "2026-12-10", 333.34],
    ]);
    expect(rows.every((row) => row.kind === "investment" && row.flow === "out" && row.document === "NF 912")).toBe(
      true
    );
    expect(result.map((e) => [e.id, `${e.seriesIndex}/${e.seriesCount}`])).toEqual([
      ["e-1", "1/3"],
      [rows[0].id, "2/3"],
      [rows[1].id, "3/3"],
    ]);
    expect(result[0].attachmentCount).toBe(2);
    expect(result.reduce((cents, e) => cents + Math.round(e.amountBrl * 100), 0)).toBe(100000);
  });

  it.each([1, 49])("refuses %i parcelas", async (count) => {
    given(ROW);
    expect(await split(count)).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
  });

  it("refuses more parcelas than centavos", async () => {
    given({ ...ROW, amountBrl: 0.02 });
    expect(await split(3)).toBe("invalid_repeat");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it.each<[string, Record<string, unknown>]>([
    ["a paid lançamento", { paidAt: "2026-09-27", bankAccountId: "sicredi" }],
    ["a parcela of a série", { seriesId: "s-1", seriesIndex: 2 }],
    [
      "a rendimento",
      { kind: "yield", flow: null, accountId: null, dueDate: null, paidAt: "2026-09-27", bankAccountId: "cdb" },
    ],
  ])("refuses %s", async (_, patch) => {
    given({ ...ROW, ...patch });
    expect(await split(3)).toBe("not_splittable");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("refuses a first parcela before the lançamento's data", async () => {
    given(ROW);
    expect(await split(3, "2026-09-01")).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });

  it("is null for a lançamento of another farm", async () => {
    state.selectResults = [[]];
    expect(await split(3)).toBeNull();
  });
});
```

Create `lib/api/domains/expenses/__tests__/expenses.routes.test.ts`:

```ts
/**
 * POST /expenses/:id/split behind the farm macro, with auth and db mocked:
 * - a member who only sees Financeiro cannot parcelar;
 * - another farm's lançamento is a 404;
 * - a refusal is a 400 naming it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, split } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  split: vi.fn(),
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
vi.mock("@/lib/api/domains/expenses/useCases/Split.useCase", () => ({
  SplitExpenseUseCase: class {
    run = split;
  },
}));

import { herdApi } from "@/lib/api/app";

const BODY = { count: 3, frequency: "monthly", startsOn: "2026-10-10" };

const splitRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/expenses/e-9/split", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify(BODY),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  split.mockReset();
});

describe("POST /expenses/:id/split", () => {
  it("refuses a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
    const response = await splitRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(split).not.toHaveBeenCalled();
  });

  it("answers 404 for another farm's lançamento and 400 naming a refusal", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    split.mockResolvedValueOnce(null).mockResolvedValueOnce("not_splittable");

    expect((await splitRequest()).status).toBe(404);
    expect(split).toHaveBeenCalledWith({ farmId: 7, id: "e-9", ...BODY });
    const refused = await splitRequest();
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "not_splittable" });
  });
});
```

**Replace** in `lib/api/__tests__/routeRequirements.test.ts`:

```ts
      "PATCH /api/herd/expenses/:id",
      "POST /api/herd/accounts",
```

with:

```ts
      "PATCH /api/herd/expenses/:id",
      "POST /api/herd/expenses/:id/split",
      "POST /api/herd/accounts",
```

- [ ] **Step 14: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/__tests__/routeRequirements.test.ts`
Expected: FAIL. Split.test cannot resolve `../Split.useCase`. The route answers 404 where 403 and 400 are expected. `ROUTE_REQUIREMENTS["POST /api/herd/expenses/:id/split"]` is undefined.

- [ ] **Step 15: Implement Split, its schema, route and requirement**

Create `lib/api/domains/expenses/useCases/Split.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments, expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { parseISODate } from "@/lib/domain/dates";
import { installmentPlan, MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "@/lib/domain/series";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, SeriesFrequency } from "@/lib/types";

interface SplitExpenseUseCaseProps {
  farmId: number;
  id: string;
  /** Parcelas, 2–48. */
  count: number;
  frequency: SeriesFrequency;
  /** Vencimento of the first parcela. */
  startsOn: string;
}

/**
 * - null: the lançamento is not on this farm.
 * - `not_splittable`: it is paid, already part of a série, or a rendimento.
 * - `invalid_repeat` and `due_before_date`: as for a new parcelamento (AddSeries).
 */
type SplitExpenseUseCaseResponse = Expense[] | "not_splittable" | "invalid_repeat" | "due_before_date" | null;

type CurrUseCase = _UseCase<SplitExpenseUseCaseProps, SplitExpenseUseCaseResponse>;

/**
 * "Parcelar": turns one pending lançamento into a parcelamento of `count`
 * parcelas. Their total is the lançamento's value, split as a new
 * parcelamento is: the last parcela takes the centavos.
 *
 * The row becomes parcela 1 in place, so its id and its anexos stay.
 * Parcelas 2..N are new rows with its fields. Answers every row, first
 * position first, mapped as the load maps them.
 */
export class SplitExpenseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SplitExpenseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id, count: parcelas, frequency, startsOn }) =>
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenses.farmId, farmId), eq(expenses.id, id));
      const [row] = await tx.select().from(expenses).where(scope).limit(1).for("update");
      if (!row) return null;
      if (row.paidAt !== null || row.seriesId !== null || row.kind === "yield") return "not_splittable";
      if (!Number.isInteger(parcelas) || parcelas < MIN_INSTALLMENTS || parcelas > MAX_INSTALLMENTS) {
        return "invalid_repeat";
      }
      // Every parcela carries at least one centavo.
      if (Math.round(row.amountBrl * 100) < parcelas) return "invalid_repeat";
      if (startsOn < row.date) return "due_before_date";

      const [first, ...rest] = installmentPlan(row.amountBrl, parcelas, startsOn, frequency);
      const template = {
        kind: row.kind,
        flow: row.flow,
        category: row.category,
        notes: row.notes,
        counterparty: row.counterparty,
        document: row.document,
        accountId: row.accountId,
        lotId: row.lotId,
      };
      const [series] = await tx
        .insert(expenseSeries)
        .values({
          id: randomUUID(),
          farmId,
          mode: "installments",
          frequency,
          dayOfMonth: frequency === "monthly" ? parseISODate(startsOn).getDate() : null,
          startsOn,
          endsOn: null,
          count: parcelas,
          generatedCount: parcelas,
          amountBrl: row.amountBrl,
          ...template,
        })
        .returning();
      const [updated] = await tx
        .update(expenses)
        .set({ dueDate: first.dueDate, amountBrl: first.amountBrl, seriesId: series.id, seriesIndex: 1 })
        .where(scope)
        .returning();
      const added = await tx
        .insert(expenses)
        .values(
          rest.map((line) => ({
            id: randomUUID(),
            farmId,
            ...template,
            date: row.date,
            dueDate: line.dueDate,
            amountBrl: line.amountBrl,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
        )
        .returning();
      const [files] = await tx
        .select({ total: count() })
        .from(attachments)
        .where(and(eq(attachments.farmId, farmId), eq(attachments.expenseId, id)));
      return [
        toExpense(updated, series, files?.total ?? 0),
        ...added
          .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))
          .map((parcela) => toExpense(parcela, series)),
      ];
    });
}
```

Replace the whole file `lib/api/domains/expenses/schemas/expense.schema.ts` with:

```ts
/** Request schemas for the farm's lançamentos (every kind typed by hand). */

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

/** Despesa, receita, the three kinds fora do resultado, and rendimento. */
export const EntryKindModel = t.Union([
  t.Literal("expense"),
  t.Literal("revenue"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
  t.Literal("yield"),
]);

/** Movimento of an investimento, financiamento or sócios lançamento: entrada or saída. */
export const EntryFlowModel = t.Union([t.Literal("in"), t.Literal("out")]);

/** "Só esta" · "Esta e as próximas" · "Todas" (as não pagas). */
export const SeriesScopeModel = t.Union([t.Literal("one"), t.Literal("following"), t.Literal("all")]);

const Frequency = t.Union([t.Literal("monthly"), t.Literal("weekly")]);
const InstallmentCount = t.Integer({ minimum: 2, maximum: 48 });

/** How a new lançamento repeats: N parcelas, or the same bill every week or month. */
export const RepeatModel = t.Object({
  mode: t.Union([t.Literal("installments"), t.Literal("recurring")]),
  count: t.Optional(InstallmentCount),
  frequency: Frequency,
  dayOfMonth: t.Optional(t.Integer({ minimum: 1, maximum: 31 })),
  startsOn: DateString,
  endsOn: t.Optional(DateString),
});

const Counterparty = t.String({ maxLength: 120 });
const Document = t.String({ maxLength: 120 });

/**
 * Body of POST /expenses.
 *
 * A receita and the kinds fora do resultado send `category: "other"`.
 * investment, financing and partners send a conta of their group and `flow`
 * (absent is a saída). A yield sends its aplicação as `bankAccountId` and no
 * `repeat`.
 *
 * With `repeat` it creates the whole série; `amountBrl` is then the total of
 * a parcelamento or the value of each ocorrência of a recorrência.
 */
export const NewExpenseBody = t.Object({
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String()),
  kind: t.Optional(EntryKindModel),
  flow: t.Optional(EntryFlowModel),
  dueDate: t.Optional(DateString),
  paidAt: t.Optional(DateString),
  counterparty: t.Optional(Counterparty),
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
  /** "Pago por"; kept only with `paidAt` (a yield is paid on its `date`). */
  bankAccountId: t.Optional(t.String()),
  repeat: t.Optional(RepeatModel),
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
  flow: t.Optional(EntryFlowModel),
  notes: t.Optional(t.Nullable(t.String())),
  dueDate: t.Optional(t.Nullable(DateString)),
  paidAt: t.Optional(t.Nullable(DateString)),
  counterparty: t.Optional(t.Nullable(Counterparty)),
  document: t.Optional(t.Nullable(Document)),
  accountId: t.Optional(t.Nullable(t.String())),
  lotId: t.Optional(t.Nullable(t.String())),
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId: t.Optional(t.Nullable(t.String())),
  /** For a row of a série; absent = "one". */
  scope: t.Optional(SeriesScopeModel),
});

/** Body of POST /expenses/:id/split ("Parcelar"): the lançamento's value is the total, split as a new parcelamento. */
export const SplitExpenseBody = t.Object({
  count: InstallmentCount,
  frequency: Frequency,
  /** Vencimento of the first parcela. */
  startsOn: DateString,
});

/** Query of DELETE /expenses/:id; absent scope = "one". */
export const DeleteExpenseQuery = t.Object({ scope: t.Optional(SeriesScopeModel) });
```

Replace the whole file `lib/api/domains/expenses/expenses.controller.ts` with:

```ts
/**
 * Farm lançamentos, with their vencimento, pagamento, conta and lote:
 * - the despesas that do not arrive through a sanitary treatment;
 * - the receitas that do not come from a venda;
 * - the money fora do resultado (investimentos, financiamentos, sócios,
 *   rendimentos).
 *
 * A lançamento may repeat. POST with `repeat` creates a parcelamento or a
 * recorrência. PATCH/DELETE on one of its rows take a `scope` ("one" ·
 * "following" · "all"). POST /:id/split turns a pending one into a
 * parcelamento ("Parcelar").
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { todayISO } from "@/lib/domain/dates";

import { AddExpenseUseCase } from "./useCases/Add.useCase";
import { AddSeriesUseCase } from "./useCases/AddSeries.useCase";
import { DeleteExpenseUseCase } from "./useCases/Delete.useCase";
import { GetExpenseUseCase } from "./useCases/Get.useCase";
import { SplitExpenseUseCase } from "./useCases/Split.useCase";
import { UpdateExpenseUseCase } from "./useCases/Update.useCase";
import { UpdateSeriesUseCase } from "./useCases/UpdateSeries.useCase";
import {
  DeleteExpenseQuery,
  NewExpenseBody,
  SplitExpenseBody,
  UpdateExpenseBody,
} from "./schemas/expense.schema";

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
      if (typeof result === "string") return status(400, { error: result });
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
      if (typeof result === "string") return status(400, { error: result });
      // The row as the load shows it: its série's fields and its anexos' count.
      return (await new GetExpenseUseCase().run({ farmId, id: params.id })) ?? result;
    },
    { farm: true, body: UpdateExpenseBody }
  )
  .post(
    "/:id/split",
    async ({ farmId, params, body, status }) => {
      // Every row of the new parcelamento, the original (now parcela 1) first.
      const result = await new SplitExpenseUseCase().run({ farmId, id: params.id, ...body });
      if (result === null) return status(404, { error: "not_found" });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: SplitExpenseBody }
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

**Replace** in `lib/api/permissions/routeRequirements.ts`:

```ts
  "DELETE /api/herd/expenses/:id": edit("finance"),
```

with:

```ts
  "DELETE /api/herd/expenses/:id": edit("finance"),
  "POST /api/herd/expenses/:id/split": edit("finance"),
```

- [ ] **Step 16: Run the tests and update the two route snapshots**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts -u`
Then: `git diff lib/api/__tests__/__snapshots__/`
Expected: the only change in each snapshot is the new `POST /api/herd/expenses/:id/split` entry. In `routeRequirements.test.ts.snap` that entry is `{ "edit": ["finance"] }`.

Run: `pnpm exec vitest run lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts`
Expected: PASS

- [ ] **Step 17: Write the failing test for the conciliação's side check**

**Replace** in `lib/api/domains/statements/useCases/__tests__/statements.test.ts`:

```ts
  it("gives a venda without conta the line's conta", async () => {
```

with:

```ts
  it("reads the side of a lançamento fora do resultado from its movimento", async () => {
    const entrada = { ...LINE, amountBrl: 4850 };
    const liberacao = { ...EXPENSE, kind: "financing", flow: "in", category: "other", accountId: "acc-pronaf" };
    state.selectResults = [[entrada], [liberacao]];
    state.returning = [
      [{ ...liberacao, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...entrada, status: "matched", expenseId: "e-1" }],
    ];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toMatchObject({
      line: { status: "matched" },
    });

    // A pagamento (saída) never confirms an entrada.
    state.selectResults = [[entrada], [{ ...liberacao, flow: "out" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("wrong_side");
  });

  it("gives a venda without conta the line's conta", async () => {
```

- [ ] **Step 18: Run it and watch it fail**

Run: `pnpm exec vitest run lib/api/domains/statements/useCases/__tests__/statements.test.ts`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'id')`. The pagamento (`flow: "out"`) is not refused as `wrong_side`, because any kind other than "expense" counts as an entrada, so the use case goes on to an update the stub has no row queued for.

- [ ] **Step 19: Implement the side check and the new refusal**

**Replace** in `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`:

```ts
import { AddExpenseUseCase } from "@/lib/api/domains/expenses/useCases/Add.useCase";
```

with:

```ts
import { AddExpenseUseCase } from "@/lib/api/domains/expenses/useCases/Add.useCase";
import { entryFlow } from "@/lib/domain/entries";
```

**Replace** in the same file:

```ts
 * than the line; `due_before_date` and `invalid_bank_account`: the lançamento
 * "Criar lançamento" sent.
```

with:

```ts
 * than the line; `due_before_date`, `invalid_account` and
 * `invalid_bank_account`: the lançamento "Criar lançamento" sent.
```

**Replace** in the same file:

```ts
  | "due_before_date"
  | "invalid_bank_account";
```

with:

```ts
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account";
```

**Replace** in the same file:

```ts
    if ((expense.kind === "expense") !== outflow) throw new Refused("wrong_side");
```

with:

```ts
    if ((entryFlow(expense) === "out") !== outflow) throw new Refused("wrong_side");
```

**Replace** in `lib/api/domains/statements/statements.controller.ts`:

```ts
  invalid_bank_account: 400,
};
```

with:

```ts
  invalid_bank_account: 400,
  invalid_account: 400,
};
```

- [ ] **Step 20: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/expenses lib/api/domains/statements lib/api/domains/bankAccounts lib/api/domains/semen lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts`
Expected: PASS

- [ ] **Step 21: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean (verified on top of tasks 1–3; task 1's casts in `lib/store/useHerdStore.ts` keep the store compiling until task 5 widens `/accounts` and `/bank-accounts`).

Run: `pnpm exec eslint lib/api/domains/expenses lib/api/domains/bankAccounts/payingAccount.ts lib/api/domains/statements/useCases/ResolveLine.useCase.ts lib/api/domains/statements/statements.controller.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/permissions/routeRequirements.ts lib/api/__tests__/routeRequirements.test.ts lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts`
Expected: clean


### Task 5: Plano de contas and contas bancárias API

`/accounts` now takes the three groups fora do resultado. A conta de financiamento can carry its saldo devedor inicial. `/bank-accounts` takes the Aplicação kind. An aplicação holds a saldo inicial the way a caixa does. It is never the conta principal and has no card fields.

**Files:**
- Modify: `lib/api/domains/accounts/schemas/account.schema.ts`
- Modify: `lib/api/domains/accounts/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/accounts/useCases/Update.useCase.ts`
- Modify: `lib/api/domains/accounts/accounts.controller.ts`
- Modify: `lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts`
- Modify: `lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts`
- Modify: `lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/Update.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts` (run only)
- Test: `lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`

Two things need no change:
- `SeedDefaults.useCase.ts` already inserts whatever `DEFAULT_ACCOUNTS` lists. Its tests count against `DEFAULT_ACCOUNTS.length`, so task 1's four new contas need no count fix.
- Statement imports stay with contas correntes: `ImportStatement.useCase.ts` refuses every `kind !== "checking"` with `not_checking`, so an aplicação cannot get through. No test is added.

**Interfaces:**
- Consumes (task 1):
  - `AccountGroup` = `ExpenseCategory | "revenue" | CapitalGroup`.
  - `Account.openingBalanceBrl?: number` and `Account.openingDate?: string`.
  - `BankAccountKind` gains `"investment"`.
  - `accounts.openingBalanceBrl` (numeric, mode number, nullable) and `accounts.openingDate` (date string, nullable) in `@/lib/db/schema`.
  - `toAccount` maps both opening fields.
  - `DEFAULT_ACCOUNTS` holds the four new contas.
- Produces:
  - `AccountGroupModel` with all eleven grupos.
  - `NewAccountBody` gains `openingBalanceBrl?: number ≥ 0` and `openingDate?: DateString`.
  - `UpdateAccountBody` gains `openingBalanceBrl?: number ≥ 0 | null` and `openingDate?: DateString | null`.
  - `validOpening(group: AccountGroup, balance: number | null, date: string | null): boolean`, exported from `accounts/useCases/Add.useCase.ts`.
  - `400 { error: "invalid_opening" }` on POST and PATCH `/accounts`.
  - `BankAccountKindModel` gains `"investment"`.
  - `400 { error: "investment_cannot_be_main" }` on POST and PATCH `/bank-accounts`.

- [ ] **Step 1: Write the failing tests for the saldo devedor inicial**

**Replace** in `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`:

```ts
      group: "revenue",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });
});
```

with:

```ts
      group: "revenue",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });

  it("takes the saldo devedor inicial of a conta de financiamento", async () => {
    state.selectResults = [[]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "financing",
      name: "Pronaf Investimento",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });

    expect(state.inserts[0]).toMatchObject({
      group: "financing",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });
    expect(result).toMatchObject({ group: "financing", openingBalanceBrl: 180000, openingDate: "2026-06-30" });
  });

  it("refuses a saldo inicial without its date, a date alone, or one outside financiamento", async () => {
    const conta = { farmId: 7, name: "Pronaf" };
    expect(await new AddAccountUseCase().run({ ...conta, group: "financing", openingBalanceBrl: 1000 })).toBe(
      "invalid_opening"
    );
    expect(await new AddAccountUseCase().run({ ...conta, group: "financing", openingDate: "2026-06-30" })).toBe(
      "invalid_opening"
    );
    expect(
      await new AddAccountUseCase().run({
        ...conta,
        group: "partners",
        openingBalanceBrl: 1000,
        openingDate: "2026-06-30",
      })
    ).toBe("invalid_opening");
    expect(state.inserts).toEqual([]);
  });
});
```

**Replace** in `lib/api/domains/accounts/useCases/__tests__/Update.test.ts`:

```ts
const ACCOUNT = { id: "acc-1", farmId: 7, group: "nutrition", name: "Sal mineral", archivedAt: null };
```

with:

```ts
const ACCOUNT = {
  id: "acc-1",
  farmId: 7,
  group: "nutrition",
  name: "Sal mineral",
  archivedAt: null,
  openingBalanceBrl: null,
  openingDate: null,
};
```

**Replace** in the same file:

```ts
    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});
```

with:

```ts
    expect(result).toBeNull();
    expect(state.updates).toEqual([]);
  });
});

describe("updateAccount — saldo devedor inicial", () => {
  const PRONAF = { ...ACCOUNT, id: "acc-2", group: "financing", name: "Pronaf" };
  const run = (patch: Parameters<UpdateAccountUseCase["run"]>[0]["patch"]) =>
    new UpdateAccountUseCase().run({ farmId: 7, id: "acc-2", patch });

  it("sets and clears it on a conta de financiamento", async () => {
    state.selectResults = [[PRONAF]];
    state.updateResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];

    const result = await run({ openingBalanceBrl: 180000, openingDate: "2026-06-30" });

    expect(state.updates).toEqual([{ openingBalanceBrl: 180000, openingDate: "2026-06-30" }]);
    expect(result).toMatchObject({ openingBalanceBrl: 180000, openingDate: "2026-06-30" });

    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
    state.updateResults = [[PRONAF]];
    await run({ openingBalanceBrl: null, openingDate: null });
    expect(state.updates[1]).toEqual({ openingBalanceBrl: null, openingDate: null });
  });

  it("refuses half of it, and any of it outside financiamento", async () => {
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
    expect(await run({ openingDate: null })).toBe("invalid_opening");
    state.selectResults = [[ACCOUNT]];
    expect(await run({ openingBalanceBrl: 500, openingDate: "2026-06-30" })).toBe("invalid_opening");
    expect(state.updates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/accounts/useCases/__tests__/Update.test.ts`
Expected: FAIL. Add ignores both fields and creates every conta. Update writes nothing and never answers `invalid_opening`.

- [ ] **Step 3: Implement the grupos and the saldo inicial**

Replace the whole file `lib/api/domains/accounts/schemas/account.schema.ts` with:

```ts
/** Request schemas for the plano de contas: farm-named contas inside the fixed grupos. */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";
import { ExpenseCategoryModel } from "@/lib/api/domains/expenses/schemas/expense.schema";

/** The seven despesa grupos, "revenue" (Receitas) and the three fora do resultado. */
export const AccountGroupModel = t.Union([
  ExpenseCategoryModel,
  t.Literal("revenue"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
]);

const AccountName = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });

/** Saldo devedor of a financiamento at the end of its `openingDate`. */
const OpeningBalance = t.Number({ minimum: 0 });

/** Body of POST /accounts. A conta de financiamento may send its saldo inicial with its date. */
export const NewAccountBody = t.Object({
  group: AccountGroupModel,
  name: AccountName,
  openingBalanceBrl: t.Optional(OpeningBalance),
  openingDate: t.Optional(DateString),
});

/**
 * Body of PATCH /accounts/:id. `archived` true archives, false restores. The
 * saldo inicial and its date go together; null clears them.
 */
export const UpdateAccountBody = t.Object({
  name: t.Optional(AccountName),
  archived: t.Optional(t.Boolean()),
  openingBalanceBrl: t.Optional(t.Nullable(OpeningBalance)),
  openingDate: t.Optional(t.Nullable(DateString)),
});
```

Replace the whole file `lib/api/domains/accounts/useCases/Add.useCase.ts` with:

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
  /** Financing only: saldo devedor at the end of `openingDate`; both or neither. */
  openingBalanceBrl?: number;
  openingDate?: string;
}

/**
 * - `duplicate`: the grupo already has the name, archived contas included.
 * - `invalid_opening`: a saldo inicial comes without its date (or the
 *   reverse), or on a grupo that is not financiamento.
 */
type AddAccountUseCaseResponse = Account | "duplicate" | "invalid_opening";

type CurrUseCase = _UseCase<AddAccountUseCaseProps, AddAccountUseCaseResponse>;

/** A saldo inicial comes with its date, and only on a conta de financiamento. */
export function validOpening(group: AccountGroup, balance: number | null, date: string | null): boolean {
  return balance === null ? date === null : date !== null && group === "financing";
}

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

  public run: CurrUseCase["run"] = async ({ farmId, group, name, openingBalanceBrl = null, openingDate = null }) => {
    if (!validOpening(group, openingBalanceBrl, openingDate)) return "invalid_opening";
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
        .values({ id: randomUUID(), farmId, group, name: trimmed, openingBalanceBrl, openingDate })
        .returning();
      return toAccount(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

Replace the whole file `lib/api/domains/accounts/useCases/Update.useCase.ts` with:

```ts
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account } from "@/lib/types";

import { validOpening } from "./Add.useCase";

/** Absent leaves a field as it is; null clears it. */
export interface AccountPatchInput {
  name?: string;
  /** True archives the conta, false restores it. */
  archived?: boolean;
  /** Saldo devedor inicial of a conta de financiamento and its date: both or neither. */
  openingBalanceBrl?: number | null;
  openingDate?: string | null;
}

interface UpdateAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: AccountPatchInput;
}

/**
 * - null: the conta is not on this farm.
 * - `invalid_opening`: as in AddAccount, checked on the conta as it will be
 *   after the patch.
 */
type UpdateAccountUseCaseResponse = Account | "duplicate" | "invalid_opening" | null;

type CurrUseCase = _UseCase<UpdateAccountUseCaseProps, UpdateAccountUseCaseResponse>;

/**
 * Renames a conta (the history follows, since lançamentos point at its id),
 * archives and restores it, or sets the saldo devedor inicial of a conta de
 * financiamento. A conta is never deleted and never changes grupo.
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
    const balance = patch.openingBalanceBrl === undefined ? current.openingBalanceBrl : patch.openingBalanceBrl;
    const date = patch.openingDate === undefined ? current.openingDate : patch.openingDate;
    if (!validOpening(current.group, balance, date)) return "invalid_opening";

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
    if (patch.openingBalanceBrl !== undefined) set.openingBalanceBrl = patch.openingBalanceBrl;
    if (patch.openingDate !== undefined) set.openingDate = patch.openingDate;
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

Replace the whole file `lib/api/domains/accounts/accounts.controller.ts` with:

```ts
/**
 * Plano de contas: farm-named contas inside the fixed grupos — Receitas, the
 * seven despesa grupos, and the three fora do resultado (investimentos,
 * financiamentos, sócios).
 *
 * A conta is archived, never deleted, so its lançamentos keep it. A conta de
 * financiamento may carry its saldo devedor inicial.
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
      if (result === "invalid_opening") return status(400, { error: result });
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
      if (result === "invalid_opening") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateAccountBody }
  )
  .post("/defaults", ({ farmId }) => new SeedDefaultAccountsUseCase().run({ farmId }), {
    farm: true,
  });
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/accounts`
Expected: PASS. That includes `SeedDefaults.test.ts`, which stays green with task 1's four new defaults.

- [ ] **Step 5: Write the failing tests for the aplicação**

**Replace** in `lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`:

```ts
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, paysFromId: "other-farm" })).toBe("invalid_pays_from");
    expect(state.inserts).toEqual([]);
  });
});
```

with:

```ts
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, paysFromId: "other-farm" })).toBe("invalid_pays_from");
    expect(state.inserts).toEqual([]);
  });

  it("keeps an aplicação off the conta principal, even as the farm's first conta, with no card fields", async () => {
    state.selectResults = [[]]; // no conta principal yet
    state.returning = [[{ ...ROW, id: "cdb", kind: "investment", isMain: false }]];
    await new AddBankAccountUseCase().run({
      farmId: 7,
      kind: "investment",
      name: "CDB Sicredi",
      openingDate: "2026-08-31",
      openingBalanceBrl: 20000,
      closingDay: 5,
      dueDay: 10,
      paysFromId: "sicredi",
    });
    expect(state.inserts[0]).toMatchObject({
      kind: "investment",
      isMain: false,
      openingBalanceBrl: 20000,
      closingDay: null,
      dueDay: null,
      paysFromId: null,
    });
    expect(state.updates).toEqual([]);

    const marked = { farmId: 7, kind: "investment" as const, name: "CDB", openingDate: "2026-08-31", isMain: true };
    expect(await new AddBankAccountUseCase().run(marked)).toBe("investment_cannot_be_main");
    expect(state.inserts).toHaveLength(1);
  });
});
```

**Replace** in the same file:

```ts
  it("moves the conta principal in one transaction", async () => {
```

with:

```ts
  it("never marks an aplicação principal and ignores card fields on it", async () => {
    const cdb = { ...ROW, id: "cdb", kind: "investment", isMain: false };
    state.selectResults = [[cdb]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 7, id: "cdb", patch: { isMain: true } })).toBe(
      "investment_cannot_be_main"
    );
    expect(state.updates).toEqual([]);

    state.selectResults = [[cdb]];
    state.returning = [[{ ...cdb, openingBalanceBrl: 25000 }]];
    await new UpdateBankAccountUseCase().run({
      farmId: 7,
      id: "cdb",
      patch: { openingBalanceBrl: 25000, closingDay: 5 },
    });
    expect(state.updates).toEqual([{ openingBalanceBrl: 25000 }]);
  });

  it("moves the conta principal in one transaction", async () => {
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm exec vitest run lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`
Expected: FAIL. A first aplicação becomes the conta principal. An aplicação marked principal is saved instead of being answered `investment_cannot_be_main`.

- [ ] **Step 7: Implement the Aplicação kind**

**Replace** in `lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts`:

```ts
export const BankAccountKindModel = t.Union([t.Literal("checking"), t.Literal("cash"), t.Literal("card")]);

/** Body of POST /bank-accounts. A cartão takes closingDay and dueDay, and may name the conta that pays it. */
```

with:

```ts
/** Conta corrente, caixa, cartão, aplicação. */
export const BankAccountKindModel = t.Union([
  t.Literal("checking"),
  t.Literal("cash"),
  t.Literal("card"),
  t.Literal("investment"),
]);

/**
 * Body of POST /bank-accounts. A cartão takes closingDay and dueDay, and may
 * name the conta that pays it. Only a conta corrente or a caixa may be principal.
 */
```

**Replace** in `lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts`:

```ts
 * of the farm; `card_cannot_be_main` for a cartão marked principal.
 */
type AddBankAccountUseCaseResponse = BankAccount | "card_days" | "invalid_pays_from" | "card_cannot_be_main";
```

with:

```ts
 * of the farm; `card_cannot_be_main` for a cartão marked principal and
 * `investment_cannot_be_main` for an aplicação marked principal.
 */
type AddBankAccountUseCaseResponse =
  | BankAccount
  | "card_days"
  | "invalid_pays_from"
  | "card_cannot_be_main"
  | "investment_cannot_be_main";
```

**Replace** in the same file:

```ts
    const card = kind === "card";
    if (card && (input.closingDay === undefined || input.dueDay === undefined)) return "card_days";
    if (card && input.isMain) return "card_cannot_be_main";
```

with:

```ts
    const card = kind === "card";
    // Only a conta corrente or a caixa receives the vendas and compras of the manejos.
    const mainable = kind === "checking" || kind === "cash";
    if (card && (input.closingDay === undefined || input.dueDay === undefined)) return "card_days";
    if (!mainable && input.isMain) return card ? "card_cannot_be_main" : "investment_cannot_be_main";
```

**Replace** in the same file:

```ts
      const isMain = !card && (input.isMain === true || !main);
```

with:

```ts
      const isMain = mainable && (input.isMain === true || !main);
```

**Replace** in `lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts`:

```ts
  | "card_cannot_be_main"
  | "main_required"
```

with:

```ts
  | "card_cannot_be_main"
  | "investment_cannot_be_main"
  | "main_required"
```

**Replace** in the same file:

```ts
      const card = current.kind === "card";
      if (card && patch.isMain) return "card_cannot_be_main";
```

with:

```ts
      const card = current.kind === "card";
      // Only a conta corrente or a caixa receives the vendas and compras of the manejos.
      const mainable = current.kind === "checking" || current.kind === "cash";
      if (!mainable && patch.isMain) return card ? "card_cannot_be_main" : "investment_cannot_be_main";
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run lib/api/domains/bankAccounts lib/api/domains/accounts lib/api/domains/statements`
Expected: PASS

- [ ] **Step 9: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean (verified on top of tasks 1–4; task 1's casts in `lib/store/useHerdStore.ts` are now no-ops, task 7 drops them).

Run: `pnpm exec eslint lib/api/domains/accounts lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`
Expected: clean


### Task 6: Plan tree

**Files:**
- Create: `lib/domain/planTree.ts`
- Test: `lib/domain/__tests__/planTree.test.ts`

**Interfaces:**
- Consumes:
  - `@/lib/types` (task 1): `EntryKind` with `"investment" | "financing" | "partners" | "yield"`, `EntryFlow`, `CapitalGroup`, `AccountGroup` with the three capital groups, `BankAccountKind` with `"investment"`, `Expense.flow?: EntryFlow`, `Account.openingBalanceBrl?: number`, `Account.openingDate?: string`.
  - `@/lib/domain/entries` (task 1): `isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean`.
  - `@/lib/domain/accounts` (task 1): `EXPENSE_GROUPS: readonly ExpenseCategory[]`, `ACCOUNT_GROUP_LABEL: Record<AccountGroup, string>` (with "Investimentos", "Financiamentos", "Sócios"), `accountsByGroup(accounts: Account[], includeArchived?: boolean): Record<AccountGroup, Account[]>`.
  - `@/lib/domain/bankAccounts` (tasks 1–2): `BANK_ACCOUNT_KIND_LABEL` (with `investment: "Aplicação"`), `accountBalance(account, inputs, day): number`, `accountMovements(account, inputs, period): BankMove[]` (signed by direction, a rendimento enters its aplicação), `bankTotal(accounts, inputs, day): number` (cartões out, aplicações in), `cents(value): number`, `faturaOf(card, date): Fatura`.
  - `@/lib/domain/ledger` (task 2): `ledgerRows(input: LedgerInputs, period: Period, todayIso: string): LedgerRow[]` with `inflow: boolean` and rows of every kind, `status` by direction. This task reads: a capital lançamento has `group` = its own group and `groupLabel` "Investimentos" / "Financiamentos" / "Sócios"; a rendimento has `group: "capital"`, `groupLabel: "Rendimento"`, `account: null`; a compra de gado `groupLabel: "Investimentos"`, `account: "Compra de gado"`; a venda `groupLabel: "Receitas"`, `account: "Venda de gado"`. Also `effectiveDueDate`, `LedgerInputs`, `LedgerKind`, `LedgerRow`, `LedgerStatus`.
  - `@/lib/domain/economics` (task 3): `coe(expenses, treatments, period): number`, `periodRevenue(expenses, movements, period): { total: number; sales: number; other: number }`.
  - Unchanged: `inPeriod`, `Period` (`@/lib/domain/period`), `formatDate` (`@/lib/domain/dates`), `formatNumber`, `formatCurrency` (`@/lib/domain/format`), `installmentLabel` (`@/lib/domain/series`), `makeTreatment` (`lib/domain/__tests__/fixtures.ts`).
- Produces (`@/lib/domain/planTree`), with the contract's names and types: `PlanNode`, `nodeParam`, `parseNode`, `legacyNode`, `PlanInputs`, `TreeItem`, `planTree`, `debtBalance`, `PaneRow`, `nodeRows`, `filterPaneRows`, `FigureTone`, `Figure`, `NodeSummary`, `nodeSummary`, `EntryInitial`, `CapitalSummary`, `capitalSummary`, and
  - `entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[] = []): EntryInitial`. The third argument is added to the contract's signature: without the contas bancárias a nó cannot tell an aplicação (which starts a rendimento) from a conta corrente. Callers pass the store's `bankAccounts`.
  - In the "bancos" nó a transferência is two rows, one per side, with ids `${transfer.id}:${bankAccountId}` (the conciliação's pair key), so the group nets it to zero. In a bank nó it is one row with id `transfer.id`. `row.transfer` always holds the record.
  - Every row but a transferência carries its `ledger` row, including a bank nó's line whose competência is outside the window.
  - `history` is the counterparty, else the observação, else the conta or grupo name; `detail` joins with " · " the observação, the documento (a manejo row's "manejo · N animais · X @") and the parcela, leaving out whichever is already the history. An investimento reads "Agro Máquinas Uberaba" over "Trator MF 4275 · NF 2.871".
  - Rows of every nó except a bank: by `date` desc, then vencimento desc, so a parcelamento (one competência) lists its last parcela first.
  - `nodeSummary` of "bancos": Saldo em contas · Entradas no período · Saídas no período · Cartões (what the cartões owe today; transferências stay out of entradas and saídas). On "todos" the fourth figure, "Fora do resultado", is entradas − saídas of the investimento, financiamento, sócios, rendimento and compra rows of the window.

The cycles run debt before tree because the tree's Financiamentos figure uses `debtBalance`. The test file imports every export from the start: vitest reads a name the module does not export yet as `undefined`, so each cycle fails with "… is not a function" until its function is appended. `tsc` and `eslint` run once, in the last step.

#### Cycle 1: URL of a nó and the old Extrato links

- [ ] **Step 1: Write the failing test**

Create `lib/domain/__tests__/planTree.test.ts` with the farm every later cycle uses and the tests of `nodeParam`, `parseNode` and `legacyNode`:

```ts
import { describe, expect, it } from "vitest";
import type { Account, BankAccount, Expense, Movement, Transfer } from "@/lib/types";
import { EXPENSE_GROUPS } from "@/lib/domain/accounts";
import { formatCurrency } from "@/lib/domain/format";
import {
  capitalSummary,
  debtBalance,
  entryInitialFor,
  filterPaneRows,
  legacyNode,
  nodeParam,
  nodeRows,
  nodeSummary,
  parseNode,
  planTree,
  type PaneRow,
  type PlanInputs,
  type PlanNode,
  type TreeItem,
} from "@/lib/domain/planTree";
import { makeManejoSession, makeTreatment } from "./fixtures";

// One small farm: two contas correntes, a caixa, an aplicação, a cartão and an
// archived caixa; contas in every group; lançamentos of every kind.
const TODAY = "2026-09-24";
const PERIOD = { start: "2026-07-01", end: "2026-09-30" };
const TREATMENT = "treatment:2026-09-08:Vacina aftosa";

const bank = (patch: Pick<BankAccount, "id" | "kind" | "name"> & Partial<BankAccount>): BankAccount => ({
  openingBalanceBrl: 0,
  openingDate: "2026-06-30",
  isMain: false,
  pendingLines: 0,
  ...patch,
});
const SICREDI = bank({
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 10000,
  isMain: true,
  pendingLines: 5,
  reconciledUntil: "2026-09-20",
  lastImportId: "imp-1",
});
const BB = bank({ id: "bb", kind: "checking", name: "Banco do Brasil", openingBalanceBrl: 30000 });
const CAIXA = bank({ id: "caixa", kind: "cash", name: "Caixa da fazenda", openingBalanceBrl: 500 });
const RDC = bank({ id: "rdc", kind: "investment", name: "Aplicação RDC" });
const CARTAO = bank({ id: "cartao", kind: "card", name: "Cartão Sicredi", closingDay: 31, dueDay: 10, paysFromId: "sicredi" });
const OLD = bank({ id: "old", kind: "cash", name: "Cofre antigo", archivedAt: "2026-01-10T00:00:00.000Z" });

const accounts: Account[] = [
  { id: "inv-maq", group: "investment", name: "Máquinas e implementos" },
  { id: "inv-benf", group: "investment", name: "Benfeitorias" },
  { id: "fin-custeio", group: "financing", name: "Custeio Sicredi" },
  { id: "fin-consorcio", group: "financing", name: "Consórcio trator", openingBalanceBrl: 100000, openingDate: "2026-07-31" },
  { id: "soc-lucro", group: "partners", name: "Distribuição de lucro" },
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "hea-vac", group: "health", name: "Vacinas" },
  { id: "adm-tel", group: "admin", name: "Telefone", archivedAt: "2026-09-01T00:00:00.000Z" },
  { id: "rev-aluguel", group: "revenue", name: "Aluguel de pasto" },
  { id: "rev-esterco", group: "revenue", name: "Venda de esterco", archivedAt: "2026-09-01T00:00:00.000Z" },
];
const account = (id: string): Account => accounts.find((a) => a.id === id)!;

const entry = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...patch,
});
/** Parcela `index` of 3 of the custeio's pagamentos, all with the liberação's competência. */
const parcela = (index: number, dueDate: string, paid: boolean): Expense =>
  entry(`f-p${index}`, {
    kind: "financing",
    flow: "out",
    accountId: "fin-custeio",
    date: "2026-07-15",
    dueDate,
    amountBrl: 10000,
    seriesId: "s-custeio",
    seriesIndex: index,
    seriesCount: 3,
    ...(paid && { paidAt: dueDate, bankAccountId: "sicredi" }),
  });

const expenses: Expense[] = [
  entry("e-sal", {
    category: "nutrition",
    accountId: "nut-sal",
    date: "2026-09-10",
    amountBrl: 1200,
    paidAt: "2026-09-10",
    bankAccountId: "sicredi",
    counterparty: "Agrovét Casa do Campo",
    document: "NF 4.812",
    lotId: "lot-1",
  }),
  entry("e-vac", { category: "health", accountId: "hea-vac", date: "2026-09-15", dueDate: "2026-10-15", amountBrl: 300 }),
  entry("e-tel", { category: "admin", accountId: "adm-tel", date: "2026-08-05", amountBrl: 90, paidAt: "2026-08-05", bankAccountId: "cartao" }),
  // Competência before the window, paid inside it: only the caixa shows it.
  entry("e-old", { category: "nutrition", accountId: "nut-sal", date: "2026-06-20", amountBrl: 400, paidAt: "2026-07-02", bankAccountId: "caixa" }),
  entry("r-aluguel", {
    kind: "revenue",
    accountId: "rev-aluguel",
    date: "2026-09-12",
    amountBrl: 2000,
    paidAt: "2026-09-14",
    bankAccountId: "bb",
    counterparty: "Fazenda Vizinha",
  }),
  entry("i-rocadeira", {
    kind: "investment",
    flow: "out",
    accountId: "inv-maq",
    date: "2026-09-18",
    amountBrl: 18500,
    paidAt: "2026-09-18",
    bankAccountId: "sicredi",
    counterparty: "Agro Máquinas",
    document: "NF 3.318",
  }),
  entry("i-venda", { kind: "investment", flow: "in", accountId: "inv-maq", date: "2026-08-20", amountBrl: 5000, paidAt: "2026-08-20", bankAccountId: "bb" }),
  entry("i-cerca", { kind: "investment", flow: "out", accountId: "inv-benf", date: "2026-09-20", dueDate: "2026-10-10", amountBrl: 2000 }),
  // Before the window and before Sicredi's opening date: only "Desde o início" counts it.
  entry("i-old", { kind: "investment", flow: "out", accountId: "inv-maq", date: "2026-03-10", amountBrl: 7000, paidAt: "2026-03-10", bankAccountId: "sicredi" }),
  entry("f-lib", {
    kind: "financing",
    flow: "in",
    accountId: "fin-custeio",
    date: "2026-07-15",
    amountBrl: 30000,
    paidAt: "2026-07-15",
    bankAccountId: "sicredi",
    document: "cédula 40/02871",
  }),
  parcela(1, "2026-08-15", true),
  parcela(2, "2026-09-15", true),
  parcela(3, "2026-10-15", false),
  // Paid on the consórcio's opening date: already inside its saldo inicial.
  entry("f-old", { kind: "financing", flow: "out", accountId: "fin-consorcio", date: "2026-07-20", amountBrl: 5000, paidAt: "2026-07-31" }),
  entry("f-c1", { kind: "financing", flow: "out", accountId: "fin-consorcio", date: "2026-08-31", amountBrl: 5000, paidAt: "2026-08-31", bankAccountId: "sicredi" }),
  // A liberação still pending: not owed yet.
  entry("f-lib-pend", { kind: "financing", flow: "in", accountId: "fin-consorcio", date: "2026-09-22", amountBrl: 20000 }),
  entry("p-ret", {
    kind: "partners",
    flow: "out",
    accountId: "soc-lucro",
    date: "2026-09-05",
    amountBrl: 6000,
    paidAt: "2026-09-05",
    bankAccountId: "sicredi",
    counterparty: "Lucas",
  }),
  entry("p-aporte", { kind: "partners", flow: "in", accountId: "soc-lucro", date: "2026-08-01", amountBrl: 1000, paidAt: "2026-08-01", bankAccountId: "caixa" }),
  entry("y-1", { kind: "yield", date: "2026-09-01", amountBrl: 250, paidAt: "2026-09-01", bankAccountId: "rdc" }),
];

const movements: Movement[] = [
  { id: "m-sale", type: "sale", date: "2026-09-20", quantity: 10, origin: "Engorda", destination: "Frigorífico Minerva", amountBrl: 50000, bankAccountId: "sicredi" },
  { id: "m-buy", type: "purchase", date: "2026-08-10", quantity: 8, origin: "Leilão Central", destination: "Recria", amountBrl: 20000, bankAccountId: "bb" },
];

const T_APL: Transfer = { id: "t-apl", fromId: "sicredi", toId: "rdc", date: "2026-09-21", amountBrl: 10000 };

const inputs: PlanInputs = {
  expenses,
  accounts,
  movements,
  manejoSessions: [],
  animals: [],
  treatments: [
    makeTreatment({ id: "t-1", animalEarTag: "BR-001", date: "2026-09-08", status: "done", costBrl: 5 }),
    makeTreatment({ id: "t-2", animalEarTag: "BR-002", date: "2026-09-08", status: "done", costBrl: 5 }),
  ],
  lots: [{ id: "lot-1", name: "Lote do Rio" }],
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
};

describe("nodeParam and parseNode", () => {
  const nodes: PlanNode[] = [
    { type: "all" },
    { type: "banks" },
    { type: "bank", id: "sicredi" },
    { type: "group", group: "investment" },
    { type: "group", group: "financing" },
    { type: "group", group: "partners" },
    { type: "group", group: "expenses" },
    { type: "group", group: "revenue" },
    { type: "group", group: "nutrition" },
    { type: "account", id: "nut-sal" },
    { type: "auto", which: "purchases" },
    { type: "auto", which: "sales" },
  ];

  it("writes each nó as its URL value", () => {
    expect(nodes.map((node) => nodeParam(node))).toEqual([
      "todos",
      "bancos",
      "banco:sicredi",
      "investimentos",
      "financiamentos",
      "socios",
      "despesas",
      "receitas",
      "grupo:nutrition",
      "conta:nut-sal",
      "compra-de-gado",
      "venda-de-gado",
    ]);
  });

  it("reads back every nó, every grupo de despesa included", () => {
    const grupos: PlanNode[] = EXPENSE_GROUPS.map((group) => ({ type: "group", group }));
    for (const node of [...nodes, ...grupos]) expect(parseNode(nodeParam(node))).toEqual(node);
  });

  it("reads an absent, empty, unknown or malformed value as null", () => {
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "grupo:nope", "grupo:revenue"]) {
      expect(parseNode(value)).toBeNull();
    }
  });

  it("still reads a conta that was deleted; nodeSummary is what finds it gone", () => {
    expect(parseNode("conta:deleted")).toEqual({ type: "account", id: "deleted" });
  });
});

describe("legacyNode", () => {
  it("turns the old Extrato filters into a nó", () => {
    expect(legacyNode({ conta: "nut-sal" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "revenue" })).toEqual({ type: "group", group: "revenue" });
    expect(legacyNode({ grupo: "nutrition" })).toEqual({ type: "group", group: "nutrition" });
    expect(legacyNode({ grupo: "capital" })).toEqual({ type: "auto", which: "purchases" });
    expect(legacyNode({ tipo: "expense" })).toEqual({ type: "group", group: "expenses" });
    expect(legacyNode({ tipo: "revenue" })).toEqual({ type: "group", group: "revenue" });
    expect(legacyNode({ tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    expect(legacyNode({ tipo: "purchase" })).toEqual({ type: "auto", which: "purchases" });
    expect(legacyNode({ tipo: "treatment" })).toEqual({ type: "group", group: "health" });
  });

  it("prefers conta over grupo over tipo", () => {
    expect(legacyNode({ conta: "nut-sal", grupo: "admin", tipo: "sale" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "admin", tipo: "sale" })).toEqual({ type: "group", group: "admin" });
    expect(legacyNode({ grupo: "nope", tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
  });

  it("is null when no old filter was set or the values are unknown", () => {
    expect(legacyNode({})).toBeNull();
    expect(legacyNode({ tipo: null, grupo: null, conta: null })).toBeNull();
    expect(legacyNode({ conta: "", grupo: "nope", tipo: "toString" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `Cannot find package '@/lib/domain/planTree'` (the module does not exist yet).

- [ ] **Step 3: Implement**

Create `lib/domain/planTree.ts` with the header, the imports of every cycle, the contract's types and the URL functions:

```ts
/**
 * Lançamentos by the plano de contas: the tree of nós with their figures for
 * the window, the rows of the picked nó with contra partida and running saldo,
 * its strip of four figures, what "Novo" starts with, and the Painel's
 * "Capital, dívidas e sócios". Pure.
 *
 * A conta bancária reads its movimentação by payment day (`accountMovements`);
 * every other nó reads the ledger rows by `date` (competência) in the window.
 */
import type {
  Account,
  AccountGroup,
  BankAccount,
  BankAccountKind,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  Transfer,
} from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import {
  BANK_ACCOUNT_KIND_LABEL,
  accountBalance,
  accountMovements,
  bankTotal,
  cents,
  faturaOf,
} from "@/lib/domain/bankAccounts";
import { formatDate } from "@/lib/domain/dates";
import { coe, periodRevenue } from "@/lib/domain/economics";
import { isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import {
  effectiveDueDate,
  ledgerRows,
  type LedgerInputs,
  type LedgerKind,
  type LedgerRow,
  type LedgerStatus,
} from "@/lib/domain/ledger";
import { inPeriod, type Period } from "@/lib/domain/period";
import { installmentLabel } from "@/lib/domain/series";

/** A row of the tree. `group: "expenses"` is the whole COE. */
export type PlanNode =
  | { type: "all" }
  | { type: "banks" }
  | { type: "bank"; id: string }
  | { type: "group"; group: CapitalGroup | "expenses" | "revenue" | ExpenseCategory }
  | { type: "account"; id: string }
  | { type: "auto"; which: "purchases" | "sales" };

export interface PlanInputs extends LedgerInputs {
  bankAccounts: BankAccount[];
  transfers: Transfer[];
}

export interface TreeItem {
  node: PlanNode;
  /** nodeParam(node). */
  key: string;
  label: string;
  /** What the figure is, on the six top groups: "saldo", "no período", "devedor", "retirado", "custo (COE)". */
  tag?: string;
  /** 0 shows "—". */
  amountBrl: number;
  bankKind?: BankAccountKind;
  /** Written by the manejos (Compra de gado, Venda de gado). */
  locked?: boolean;
  archived?: boolean;
  /** Present (maybe empty) on what can open. */
  children?: TreeItem[];
}

export interface PaneRow {
  /** Ledger row id, or the transferência id (`<id>:<conta bancária>` per side in Bancos e caixa). */
  id: string;
  /** Payment day on a conta bancária; competência everywhere else. */
  date: string;
  /** Who or what: counterparty, else notes, else the conta or grupo name. */
  history: string;
  /** Observação, documento (a manejo's "manejo · 24 animais · 512 @") and parcela, each only when it is not the history. */
  detail: string | null;
  /** Contra partida. */
  contra: string | null;
  contraGroup: string | null;
  /** Signed: + entra, − sai. */
  amountBrl: number;
  /** Saldo after the line (conta bancária) or saldo devedor after it (financiamento, paid lines); else null. */
  balance: number | null;
  /** Null for a transferência. */
  ledger: LedgerRow | null;
  transfer: Transfer | null;
}

export type FigureTone = "ink" | "healthy" | "attention" | "overdue" | "scheduled";

export interface Figure {
  label: string;
  /** BRL unless `text` is set. */
  amountBrl: number | null;
  text?: string;
  sub: string;
  tone: FigureTone;
}

export interface NodeSummary {
  /** "Bancos e caixa", "Despesas › Nutrição"; null on a top group and on "todos". */
  crumb: string | null;
  title: string;
  /** "conta corrente", "principal", "investimento", "fora do custo (COE)"… */
  pills: { text: string; tone: "muted" | "brand" | "scheduled" | "fmd" }[];
  /** Always four. */
  figures: Figure[];
  /** A financiamento: 0–1 of what was owed that is paid; else undefined. */
  paidShare?: number;
  /** The conta bancária of a bank nó. */
  bank?: BankAccount;
  /** The conta do plano of an account nó. */
  account?: Account;
}

/** What "Novo" starts with on a nó. */
export interface EntryInitial {
  kind?: EntryKind;
  flow?: EntryFlow;
  category?: ExpenseCategory;
  accountId?: string;
  bankAccountId?: string;
}

/** The Painel's "Capital, dívidas e sócios". */
export interface CapitalSummary {
  invested: number;
  investedAssets: number;
  investedCattle: number;
  applications: number;
  yieldInPeriod: number;
  debt: number;
  debtAccounts: number;
  nextInstallment: { dueDate: string; amountBrl: number } | null;
  withdrawn: number;
}

/** The groups that are not a grupo of Despesas. */
type TopGroup = CapitalGroup | "expenses" | "revenue";

const GROUP_PARAM: Record<TopGroup, string> = {
  investment: "investimentos",
  financing: "financiamentos",
  partners: "socios",
  expenses: "despesas",
  revenue: "receitas",
};

const isCategory = (value: string): value is ExpenseCategory =>
  (EXPENSE_GROUPS as readonly string[]).includes(value);

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<category> · conta:<id> · compra-de-gado · venda-de-gado. */
export function nodeParam(node: PlanNode): string {
  switch (node.type) {
    case "all":
      return "todos";
    case "banks":
      return "bancos";
    case "bank":
      return `banco:${node.id}`;
    case "account":
      return `conta:${node.id}`;
    case "auto":
      return node.which === "purchases" ? "compra-de-gado" : "venda-de-gado";
    case "group":
      return isCategory(node.group) ? `grupo:${node.group}` : GROUP_PARAM[node.group];
  }
}

/** The nó of a `conta` value; null when absent, unknown or malformed. */
export function parseNode(param: string | null | undefined): PlanNode | null {
  if (!param) return null;
  if (param === "todos") return { type: "all" };
  if (param === "bancos") return { type: "banks" };
  if (param === "compra-de-gado") return { type: "auto", which: "purchases" };
  if (param === "venda-de-gado") return { type: "auto", which: "sales" };
  const group = (Object.keys(GROUP_PARAM) as TopGroup[]).find((g) => GROUP_PARAM[g] === param);
  if (group) return { type: "group", group };
  const match = /^(banco|conta|grupo):(.+)$/.exec(param);
  if (!match) return null;
  const [, prefix, value] = match;
  if (prefix === "banco") return { type: "bank", id: value };
  if (prefix === "conta") return { type: "account", id: value };
  return isCategory(value) ? { type: "group", group: value } : null;
}

/** The old Extrato's `tipo` values. */
const LEGACY_KIND = new Map<string, PlanNode>([
  ["expense", { type: "group", group: "expenses" }],
  ["revenue", { type: "group", group: "revenue" }],
  ["sale", { type: "auto", which: "sales" }],
  ["purchase", { type: "auto", which: "purchases" }],
  ["treatment", { type: "group", group: "health" }],
]);

/** The old Extrato filters (?tipo, ?grupo, ?conta=<account id>) as a nó; null when none was set. */
export function legacyNode(params: {
  tipo?: string | null;
  grupo?: string | null;
  conta?: string | null;
}): PlanNode | null {
  const { tipo, grupo, conta } = params;
  if (conta) return { type: "account", id: conta };
  if (grupo === "revenue") return { type: "group", group: "revenue" };
  if (grupo === "capital") return { type: "auto", which: "purchases" };
  if (grupo && isCategory(grupo)) return { type: "group", group: grupo };
  return LEGACY_KIND.get(tipo ?? "") ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (7 tests).

#### Cycle 2: saldo devedor

- [ ] **Step 5: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("debtBalance", () => {
  it("adds the liberações received and takes the pagamentos paid, each on its payment day", () => {
    const custeio = account("fin-custeio");
    expect(debtBalance(custeio, expenses, "2026-07-14")).toBe(0);
    expect(debtBalance(custeio, expenses, "2026-07-15")).toBe(30000);
    expect(debtBalance(custeio, expenses, "2026-08-15")).toBe(20000);
    expect(debtBalance(custeio, expenses, TODAY)).toBe(10000);
  });

  it("starts from the saldo inicial, ignoring what was paid on or before its date and a liberação still pending", () => {
    const consorcio = account("fin-consorcio");
    expect(debtBalance(consorcio, expenses, "2026-07-30")).toBe(100000);
    expect(debtBalance(consorcio, expenses, "2026-07-31")).toBe(100000);
    expect(debtBalance(consorcio, expenses, "2026-08-31")).toBe(95000);
    expect(debtBalance(consorcio, expenses, "2026-12-31")).toBe(95000);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: debtBalance is not a function` (2 tests).

- [ ] **Step 7: Implement**

Append to `lib/domain/planTree.ts`:

```ts
/** What a financiamento owed (saldo inicial + liberações) and paid by the end of `day`. */
function debtParts(account: Account, expenses: Expense[], day: string): { owed: number; paid: number } {
  let owed = account.openingBalanceBrl ?? 0;
  let paid = 0;
  for (const e of expenses) {
    if (e.accountId !== account.id || e.paidAt === undefined || e.paidAt > day) continue;
    // On or before the opening date it is already inside the saldo inicial.
    if (account.openingDate !== undefined && e.paidAt <= account.openingDate) continue;
    if (isInflow(e)) owed += e.amountBrl;
    else paid += e.amountBrl;
  }
  return { owed, paid };
}

/** Saldo devedor of a conta de financiamento at the end of `day`. Pending lines never count. */
export function debtBalance(account: Account, expenses: Expense[], day: string): number {
  const { owed, paid } = debtParts(account, expenses, day);
  return cents(owed - paid);
}
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (9 tests).

#### Cycle 3: the tree

- [ ] **Step 9: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("planTree", () => {
  const tree = planTree(inputs, PERIOD, TODAY);
  const top = (key: string): TreeItem => tree.find((i) => i.key === key)!;
  const figures = (items: TreeItem[] = []) => items.map((i) => [i.label, i.amountBrl]);

  it("lists the six groups in order, each saying what its figure is", () => {
    expect(tree.map((i) => [i.key, i.label, i.tag, i.amountBrl])).toEqual([
      ["bancos", "Bancos e caixa", "saldo", 57650],
      ["investimentos", "Investimentos", "no período", 35500],
      ["financiamentos", "Financiamentos", "devedor", 105000],
      ["socios", "Sócios", "retirado", 5000],
      ["despesas", "Despesas", "custo (COE)", 1600],
      ["receitas", "Receitas", "no período", 52000],
    ]);
  });

  it("shows each conta bancária with its saldo today, the conta principal first and the cartão last", () => {
    expect(top("bancos").children?.map((i) => [i.key, i.bankKind, i.amountBrl, i.archived])).toEqual([
      ["banco:sicredi", "checking", 29300, false],
      ["banco:bb", "checking", 17000, false],
      ["banco:caixa", "cash", 1100, false],
      ["banco:rdc", "investment", 10250, false],
      ["banco:cartao", "card", -90, false],
    ]);
  });

  it("sums investimentos, financiamentos and sócios per conta, with Compra de gado locked last", () => {
    expect(figures(top("investimentos").children)).toEqual([
      ["Benfeitorias", 2000],
      ["Máquinas e implementos", 13500],
      ["Compra de gado", 20000],
    ]);
    expect(top("investimentos").children?.at(-1)).toMatchObject({ key: "compra-de-gado", locked: true });
    expect(figures(top("financiamentos").children)).toEqual([
      ["Consórcio trator", 95000],
      ["Custeio Sicredi", 10000],
    ]);
    expect(figures(top("socios").children)).toEqual([["Distribuição de lucro", 5000]]);
  });

  it("opens Despesas into the seven grupos with the treatments under Sanidade", () => {
    const grupos = top("despesas").children ?? [];
    expect(grupos.map((i) => i.key)).toEqual(EXPENSE_GROUPS.map((c) => `grupo:${c}`));
    const grupo = (c: string) => grupos.find((i) => i.key === `grupo:${c}`)!;
    expect(["nutrition", "health", "admin", "pasture"].map((c) => grupo(c).amountBrl)).toEqual([1200, 310, 90, 0]);
    expect(figures(grupo("health").children)).toEqual([["Vacinas", 300]]);
    expect(grupo("pasture").children).toEqual([]);
  });

  it("opens Receitas with Venda de gado locked first", () => {
    expect(figures(top("receitas").children)).toEqual([
      ["Venda de gado", 50000],
      ["Aluguel de pasto", 2000],
    ]);
    expect(top("receitas").children?.[0]).toMatchObject({ key: "venda-de-gado", locked: true });
  });

  it("keeps an archived conta only while it has a line in the window", () => {
    const admin = (items: TreeItem[]) =>
      items.find((i) => i.key === "despesas")?.children?.find((i) => i.key === "grupo:admin")?.children;
    expect(admin(tree)).toEqual([expect.objectContaining({ key: "conta:adm-tel", archived: true, amountBrl: 90 })]);
    expect(admin(planTree(inputs, { start: "2026-09-01", end: "2026-09-30" }, TODAY))).toEqual([]);
    expect(JSON.stringify(tree)).not.toContain("rev-esterco");
    expect(top("bancos").children?.map((i) => i.key)).not.toContain("banco:old");
    const moved = { ...inputs, transfers: [...inputs.transfers, { id: "t-old", fromId: "old", toId: "caixa", date: "2026-09-02", amountBrl: 50 }] };
    expect(planTree(moved, PERIOD, TODAY)[0].children?.find((i) => i.key === "banco:old")).toMatchObject({
      archived: true,
      amountBrl: -50,
    });
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: planTree is not a function`, thrown while collecting the `planTree` block, so vitest reports the file as failed.

- [ ] **Step 11: Implement**

Append to `lib/domain/planTree.ts`:

```ts
const BANKS = "Bancos e caixa";
const EXPENSES = "Despesas";
const PURCHASES = "Compra de gado";
const SALES = "Venda de gado";

/** + entra, − sai. */
const signed = (r: LedgerRow): number => (r.inflow ? r.amountBrl : -r.amountBrl);

/** Σ of `value` over `items`, to the centavo. */
function sum<T>(items: T[], value: (item: T) => number): number {
  return cents(items.reduce((total, item) => total + value(item), 0));
}

/** Saídas − entradas of the rows `pick` takes: what was invested, retirado or spent. */
const spent = (rows: LedgerRow[], pick: (r: LedgerRow) => boolean = () => true): number =>
  sum(rows.filter(pick), (r) => -signed(r));

/** Entradas − saídas of the rows `pick` takes. */
const earned = (rows: LedgerRow[], pick: (r: LedgerRow) => boolean): number => sum(rows.filter(pick), signed);

/** Picks the rows of these kinds. */
const isKind = (...kinds: LedgerKind[]) => (r: LedgerRow): boolean => kinds.includes(r.kind);

/** A row of the COE: a despesa or a treatment. */
const inCoe = isKind("expense", "treatment");

/** As Contas bancárias lists them: the conta principal first, cartões last. */
const byBankOrder = (a: BankAccount, b: BankAccount): number =>
  Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card");

/** The financiamentos whose saldo devedor counts in the group's. */
const liveFinancing = (accounts: Account[]): Account[] =>
  accounts.filter((a) => a.group === "financing" && a.archivedAt === undefined);

/** A row of the tree, keyed by its URL value. */
const item = (node: PlanNode, label: string, amountBrl: number, extra: Partial<TreeItem> = {}): TreeItem => ({
  node,
  key: nodeParam(node),
  label,
  amountBrl,
  ...extra,
});

/** The six top groups in order: banks, investment, financing, partners, expenses, revenue. */
export function planTree(inputs: PlanInputs, period: Period, todayIso: string): TreeItem[] {
  const rows = ledgerRows(inputs, period, todayIso);
  const withLines = new Set(rows.map((r) => r.expense?.accountId));
  const byGroup = accountsByGroup(inputs.accounts, true);
  const of = (id: string) => (r: LedgerRow) => r.expense?.accountId === id;
  /** The grupo's contas by name; an archived one only while it has a line in the window. */
  const contas = (group: AccountGroup, amount: (a: Account) => number): TreeItem[] =>
    byGroup[group]
      .filter((a) => a.archivedAt === undefined || withLines.has(a.id))
      .map((a) => item({ type: "account", id: a.id }, a.name, amount(a), { archived: a.archivedAt !== undefined }));
  const debt = (a: Account) => debtBalance(a, inputs.expenses, todayIso);
  const live = liveFinancing(inputs.accounts);
  const banks = [...inputs.bankAccounts]
    .sort(byBankOrder)
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);

  return [
    item({ type: "banks" }, BANKS, bankTotal(inputs.bankAccounts, inputs, todayIso), {
      tag: "saldo",
      children: banks.map((b) =>
        item({ type: "bank", id: b.id }, b.name, accountBalance(b, inputs, todayIso), {
          bankKind: b.kind,
          archived: b.archivedAt !== undefined,
        })
      ),
    }),
    item(
      { type: "group", group: "investment" },
      ACCOUNT_GROUP_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
      {
        tag: "no período",
        children: [
          ...contas("investment", (a) => spent(rows, of(a.id))),
          item({ type: "auto", which: "purchases" }, PURCHASES, spent(rows, isKind("purchase")), { locked: true }),
        ],
      }
    ),
    item({ type: "group", group: "financing" }, ACCOUNT_GROUP_LABEL.financing, sum(live, debt), {
      tag: "devedor",
      children: contas("financing", debt),
    }),
    item({ type: "group", group: "partners" }, ACCOUNT_GROUP_LABEL.partners, spent(rows, isKind("partners")), {
      tag: "retirado",
      children: contas("partners", (a) => spent(rows, of(a.id))),
    }),
    item({ type: "group", group: "expenses" }, EXPENSES, cents(coe(inputs.expenses, inputs.treatments, period)), {
      tag: "custo (COE)",
      children: EXPENSE_GROUPS.map((c) =>
        item({ type: "group", group: c }, ACCOUNT_GROUP_LABEL[c], spent(rows, (r) => inCoe(r) && r.group === c), {
          children: contas(c, (a) => spent(rows, of(a.id))),
        })
      ),
    }),
    item(
      { type: "group", group: "revenue" },
      ACCOUNT_GROUP_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
      {
        tag: "no período",
        children: [
          item({ type: "auto", which: "sales" }, SALES, earned(rows, isKind("sale")), { locked: true }),
          ...contas("revenue", (a) => earned(rows, of(a.id))),
        ],
      }
    ),
  ];
}
```

- [ ] **Step 12: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (15 tests).

#### Cycle 4: rows of a nó

- [ ] **Step 13: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("nodeRows", () => {
  const rows = (node: PlanNode, period = PERIOD) => nodeRows(node, inputs, period, TODAY);
  const ids = (list: PaneRow[]) => list.map((r) => r.id);

  it("gives a conta bancária its movimentação by payment day with the saldo after each line", () => {
    const sicredi = rows({ type: "bank", id: "sicredi" });
    expect(sicredi.map((r) => [r.id, r.date, r.amountBrl, r.balance])).toEqual([
      ["t-apl", "2026-09-21", -10000, 29300],
      ["m-sale", "2026-09-20", 50000, 39300],
      ["i-rocadeira", "2026-09-18", -18500, -10700],
      ["f-p2", "2026-09-15", -10000, 7800],
      ["e-sal", "2026-09-10", -1200, 17800],
      ["p-ret", "2026-09-05", -6000, 19000],
      ["f-c1", "2026-08-31", -5000, 25000],
      ["f-p1", "2026-08-15", -10000, 30000],
      ["f-lib", "2026-07-15", 30000, 40000],
    ]);
    expect(sicredi[0]).toMatchObject({ ledger: null, transfer: T_APL });
    expect(sicredi[3].ledger?.expense?.id).toBe("f-p2");
  });

  it("names the conta do plano as the contra partida of a conta bancária's line", () => {
    expect(rows({ type: "bank", id: "sicredi" }).map((r) => [r.id, r.history, r.detail, r.contra, r.contraGroup])).toEqual([
      ["t-apl", "Transferência para Aplicação RDC", null, "Aplicação RDC", "transferência"],
      ["m-sale", "Frigorífico Minerva", null, "Venda de gado", "Receitas"],
      ["i-rocadeira", "Agro Máquinas", "NF 3.318", "Máquinas e implementos", "Investimentos"],
      ["f-p2", "Custeio Sicredi", "parcela 2/3", "Custeio Sicredi", "Financiamentos"],
      ["e-sal", "Agrovét Casa do Campo", "NF 4.812", "Sal mineral", "Despesas › Nutrição"],
      ["p-ret", "Lucas", null, "Distribuição de lucro", "Sócios"],
      ["f-c1", "Consórcio trator", null, "Consórcio trator", "Financiamentos"],
      ["f-p1", "Custeio Sicredi", "parcela 1/3", "Custeio Sicredi", "Financiamentos"],
      ["f-lib", "Custeio Sicredi", "cédula 40/02871", "Custeio Sicredi", "Financiamentos"],
    ]);
  });

  it("puts who over what: observação, documento and the manejo's line under it, never repeating the history", () => {
    const farm: PlanInputs = {
      ...inputs,
      expenses: [
        entry("i-trator", {
          kind: "investment",
          flow: "out",
          accountId: "inv-maq",
          date: "2026-09-03",
          counterparty: "Agro Máquinas Uberaba",
          notes: "Trator MF 4275",
          document: "NF 2.871",
        }),
        entry("e-diesel", { category: "admin", date: "2026-09-02", notes: "Diesel do trator", document: "NF 77" }),
      ],
      manejoSessions: [
        makeManejoSession({
          id: "m-sale",
          date: "2026-09-20",
          status: "closed",
          kind: "sale",
          counterparty: "Frigorífico Minerva",
          animals: [{ earTag: "BR-101", outcome: "done" }],
        }),
      ],
    };
    const lines = nodeRows({ type: "all" }, farm, PERIOD, TODAY);
    const line = (id: string) => lines.find((r) => r.id === id)!;
    expect(["i-trator", "e-diesel", "m-sale", TREATMENT].map((id) => [line(id).history, line(id).detail])).toEqual([
      ["Agro Máquinas Uberaba", "Trator MF 4275 · NF 2.871"],
      ["Diesel do trator", "NF 77"],
      ["Frigorífico Minerva", "manejo · 1 animal"],
      ["Vacina aftosa", null],
    ]);
  });

  it("takes a line paid in the window even when its competência is older", () => {
    expect(rows({ type: "bank", id: "caixa" }).map((r) => [r.id, r.date, r.balance])).toEqual([
      ["p-aporte", "2026-08-01", 1100],
      ["e-old", "2026-07-02", 100],
    ]);
    expect(ids(rows({ type: "account", id: "nut-sal" }))).toEqual(["e-sal"]);
  });

  it("puts a rendimento in its aplicação and in todos only", () => {
    expect(rows({ type: "bank", id: "rdc" }).map((r) => [r.id, r.history, r.contra, r.contraGroup, r.amountBrl, r.balance])).toEqual([
      ["t-apl", "Transferência de Sicredi", "Sicredi", "transferência", 10000, 10250],
      ["y-1", "Rendimento", "Rendimento", null, 250, 250],
    ]);
    expect(ids(rows({ type: "all" }))).toContain("y-1");
    const others: PlanNode[] = [{ type: "banks" }, { type: "group", group: "investment" }, { type: "group", group: "revenue" }];
    for (const node of others) expect(ids(rows(node))).not.toContain("y-1");
  });

  it("shows a financiamento by competência, the latest vencimento first, with the saldo devedor after each paid line", () => {
    expect(rows({ type: "account", id: "fin-custeio" }).map((r) => [r.id, r.date, r.amountBrl, r.balance, r.contra])).toEqual([
      ["f-p3", "2026-07-15", -10000, null, null],
      ["f-p2", "2026-07-15", -10000, 10000, "Sicredi"],
      ["f-p1", "2026-07-15", -10000, 20000, "Sicredi"],
      ["f-lib", "2026-07-15", 30000, 30000, "Sicredi"],
    ]);
    const group = rows({ type: "group", group: "financing" });
    expect(ids(group)).toEqual(["f-lib-pend", "f-c1", "f-old", "f-p3", "f-p2", "f-p1", "f-lib"]);
    expect(group.every((r) => r.balance === null)).toBe(true);
  });

  it("gives every other nó its rows by competência, newest first, signed, with the conta bancária as contra partida", () => {
    expect(rows({ type: "group", group: "investment" }).map((r) => [r.id, r.amountBrl, r.contra, r.contraGroup])).toEqual([
      ["i-cerca", -2000, null, null],
      ["i-rocadeira", -18500, "Sicredi", "Bancos e caixa"],
      ["i-venda", 5000, "Banco do Brasil", "Bancos e caixa"],
      ["m-buy", -20000, "Banco do Brasil", "Bancos e caixa"],
    ]);
    expect(ids(rows({ type: "group", group: "expenses" }))).toEqual(["e-vac", "e-sal", TREATMENT, "e-tel"]);
    expect(ids(rows({ type: "group", group: "health" }))).toEqual(["e-vac", TREATMENT]);
    expect(ids(rows({ type: "group", group: "revenue" }))).toEqual(["m-sale", "r-aluguel"]);
    expect(ids(rows({ type: "group", group: "partners" }))).toEqual(["p-ret", "p-aporte"]);
    expect(ids(rows({ type: "auto", which: "sales" }))).toEqual(["m-sale"]);
    expect(ids(rows({ type: "auto", which: "purchases" }))).toEqual(["m-buy"]);
    expect(ids(rows({ type: "account", id: "inv-maq" }))).toEqual(["i-rocadeira", "i-venda"]);
    expect(rows({ type: "group", group: "health" }).find((r) => r.id === TREATMENT)).toMatchObject({
      history: "Vacina aftosa",
      amountBrl: -10,
    });
  });

  it("shows in Bancos e caixa every line with a conta bancária plus both sides of each transferência", () => {
    const banks = rows({ type: "banks" });
    expect(ids(banks)).toEqual([
      "t-apl:sicredi",
      "t-apl:rdc",
      "m-sale",
      "i-rocadeira",
      "r-aluguel",
      "e-sal",
      "p-ret",
      "f-c1",
      "i-venda",
      "m-buy",
      "e-tel",
      "p-aporte",
      "f-p2",
      "f-p1",
      "f-lib",
    ]);
    expect(banks.slice(0, 2).map((r) => [r.amountBrl, r.contra, r.contraGroup, r.transfer?.id])).toEqual([
      [-10000, "Aplicação RDC", "transferência", "t-apl"],
      [10000, "Sicredi", "transferência", "t-apl"],
    ]);
    expect(banks.find((r) => r.id === "e-tel")).toMatchObject({ contra: "Cartão Sicredi", amountBrl: -90 });
  });

  it("is empty for a conta that no longer exists", () => {
    expect(rows({ type: "bank", id: "gone" })).toEqual([]);
    expect(rows({ type: "account", id: "gone" })).toEqual([]);
  });
});
```

- [ ] **Step 14: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: nodeRows is not a function` (9 tests).

- [ ] **Step 15: Implement**

Append to `lib/domain/planTree.ts`:

```ts
/** Every day there is: a conta bancária looks its lançamentos up whatever their competência. */
const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

/** Ledger kinds of each group that is not a grupo of Despesas. */
const GROUP_KINDS: Record<TopGroup, readonly LedgerKind[]> = {
  investment: ["investment", "purchase"],
  financing: ["financing"],
  partners: ["partners"],
  expenses: ["expense", "treatment"],
  revenue: ["revenue", "sale"],
};

function belongs(node: Exclude<PlanNode, { type: "bank" }>, r: LedgerRow): boolean {
  switch (node.type) {
    case "all":
      return true;
    case "banks":
      // A rendimento stays in its aplicação's nó.
      return r.bankAccountId !== null && r.kind !== "yield";
    case "account":
      return r.expense?.accountId === node.id;
    case "auto":
      return r.kind === (node.which === "purchases" ? "purchase" : "sale");
    case "group":
      return isCategory(node.group) ? inCoe(r) && r.group === node.group : GROUP_KINDS[node.group].includes(r.kind);
  }
}

/** "Trator MF 4275 · NF 2.871 · parcela 2/10": observação, documento and parcela, without what the history already says. */
function detailOf(r: LedgerRow, history: string): string | null {
  const parcela = r.expense ? installmentLabel(r.expense) : null;
  return [r.notes, r.document, parcela && `parcela ${parcela}`].filter((t) => t && t !== history).join(" · ") || null;
}

const bankName = (banks: BankAccount[], id: string | null): string | null =>
  banks.find((b) => b.id === id)?.name ?? null;

/** A ledger row as every nó but a conta bancária shows it: the contra partida is the conta bancária. */
function ledgerLine(r: LedgerRow, banks: BankAccount[]): PaneRow {
  const contra = bankName(banks, r.bankAccountId);
  const history = r.counterparty ?? r.notes ?? r.account ?? r.groupLabel;
  return {
    id: r.id,
    date: r.date,
    history,
    detail: detailOf(r, history),
    contra,
    contraGroup: contra === null ? null : BANKS,
    amountBrl: signed(r),
    balance: null,
    ledger: r,
    transfer: null,
  };
}

/** One side of a transferência: the contra partida is the other conta. */
function transferLine(t: Transfer, side: string, banks: BankAccount[], balance: number | null, id = t.id): PaneRow {
  const incoming = t.toId === side;
  const other = bankName(banks, incoming ? t.fromId : t.toId) ?? "outra conta";
  return {
    id,
    date: t.date,
    history: t.notes ?? `Transferência ${incoming ? "de" : "para"} ${other}`,
    detail: null,
    contra: other,
    contraGroup: "transferência",
    amountBrl: incoming ? t.amountBrl : -t.amountBrl,
    balance,
    ledger: null,
    transfer: t,
  };
}

/** Newest first. */
export function nodeRows(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): PaneRow[] {
  const banks = inputs.bankAccounts;
  if (node.type === "bank") {
    const bank = banks.find((b) => b.id === node.id);
    if (!bank) return [];
    const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
    return accountMovements(bank, inputs, period).map((move) => {
      if (move.transfer) return transferLine(move.transfer, bank.id, banks, move.balance);
      const r = byId.get(move.id)!;
      const group = isCategory(r.group) ? `${EXPENSES} › ${r.groupLabel}` : r.groupLabel;
      return {
        ...ledgerLine(r, banks),
        date: move.date,
        contra: r.account ?? group,
        contraGroup: r.account === null ? null : group,
        amountBrl: move.amountBrl,
        balance: move.balance,
      };
    });
  }

  const rows = ledgerRows(inputs, period, todayIso)
    .filter((r) => belongs(node, r))
    .map((r) => ledgerLine(r, banks));
  if (node.type === "banks") {
    // Both sides, keyed as the conciliação keys them, so the group nets them to zero.
    for (const t of inputs.transfers.filter((t) => inPeriod(t.date, period))) {
      rows.push(
        transferLine(t, t.fromId, banks, null, `${t.id}:${t.fromId}`),
        transferLine(t, t.toId, banks, null, `${t.id}:${t.toId}`)
      );
    }
  }
  const financing =
    node.type === "account" ? inputs.accounts.find((a) => a.id === node.id && a.group === "financing") : undefined;
  if (financing) {
    for (const row of rows) {
      // ponytail: lines paid the same day share that day's closing saldo; a running sum if that confuses anyone.
      if (row.ledger?.paidAt) row.balance = debtBalance(financing, inputs.expenses, row.ledger.paidAt);
    }
  }
  const due = (r: PaneRow) => r.ledger?.dueDate ?? r.date;
  // Parcelas share their competência: the latest vencimento first.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || due(b).localeCompare(due(a)));
}
```

- [ ] **Step 16: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (24 tests).

#### Cycle 5: the pane's filters

- [ ] **Step 17: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("filterPaneRows", () => {
  const filter = (rows: PaneRow[], patch: Partial<Parameters<typeof filterPaneRows>[1]>) =>
    filterPaneRows(rows, { lotId: "all", pendingOnly: false, search: "", ...patch }).map((r) => r.id);
  const banks = nodeRows({ type: "banks" }, inputs, PERIOD, TODAY);
  const sicredi = nodeRows({ type: "bank", id: "sicredi" }, inputs, PERIOD, TODAY);

  it("filters by lote, a transferência passing only “all”", () => {
    expect(filter(banks, {})).toHaveLength(banks.length);
    expect(filter(banks, { lotId: "lot-1" })).toEqual(["e-sal"]);
    const farm = filter(banks, { lotId: "farm" });
    expect(farm).toHaveLength(banks.length - 3);
    expect(farm).not.toContain("t-apl:sicredi");
  });

  it("keeps only what is still to pay or receive", () => {
    const financing = nodeRows({ type: "group", group: "financing" }, inputs, PERIOD, TODAY);
    expect(filter(financing, { pendingOnly: true })).toEqual(["f-lib-pend", "f-p3"]);
    expect(filter(sicredi, { pendingOnly: true })).toEqual([]);
  });

  it("searches history, detail and contra partida without accents or case", () => {
    expect(filter(sicredi, { search: "agrovet" })).toEqual(["e-sal"]);
    expect(filter(sicredi, { search: "PARCELA 2" })).toEqual(["f-p2"]);
    expect(filter(sicredi, { search: "nutricao" })).toEqual(["e-sal"]);
    expect(filter(sicredi, { search: "transferencia" })).toEqual(["t-apl"]);
    expect(filter(sicredi, { search: "  socios " })).toEqual(["p-ret"]);
  });
});
```

- [ ] **Step 18: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: filterPaneRows is not a function` (3 tests).

- [ ] **Step 19: Implement**

Append to `lib/domain/planTree.ts`:

```ts
const PENDING: readonly LedgerStatus[] = ["payable", "receivable", "overdue"];

/** Lower case without accents, as the Extrato's search folds. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Lote ("farm" = without lote; a transferência passes only "all"), pending only, and search. */
export function filterPaneRows(
  rows: PaneRow[],
  filter: { lotId: string | "farm" | "all"; pendingOnly: boolean; search: string }
): PaneRow[] {
  const term = fold(filter.search.trim());
  return rows.filter(
    (r) =>
      (filter.lotId === "all" ||
        (r.ledger !== null && r.ledger.lotId === (filter.lotId === "farm" ? null : filter.lotId))) &&
      (!filter.pendingOnly || (r.ledger !== null && PENDING.includes(r.ledger.status))) &&
      (term === "" ||
        [r.history, r.detail, r.contra, r.contraGroup].some((text) => text !== null && fold(text).includes(term)))
  );
}
```

- [ ] **Step 20: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (27 tests).

#### Cycle 6: the strip of each nó

- [ ] **Step 21: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("nodeSummary", () => {
  const summary = (node: PlanNode) => nodeSummary(node, inputs, PERIOD, TODAY);
  const strip = (node: PlanNode) => summary(node)?.figures.map((f) => [f.label, f.text ?? f.amountBrl, f.sub, f.tone]);

  it("is null for a nó whose conta no longer exists, as an old link may carry", () => {
    expect(summary({ type: "bank", id: "gone" })).toBeNull();
    expect(summary(parseNode("conta:deleted")!)).toBeNull();
  });

  it("sums receitas, COE, resultado and what stays out of it on todos", () => {
    expect(summary({ type: "all" })).toMatchObject({ crumb: null, title: "Todos os lançamentos", pills: [] });
    expect(strip({ type: "all" })).toEqual([
      ["Receitas", 52000, "vendas e outras receitas", "healthy"],
      ["Despesas (COE)", 1600, "despesas e tratamentos", "ink"],
      ["Resultado", 50400, "receitas − custo", "healthy"],
      ["Fora do resultado", -30250, "capital, dívidas e sócios · entradas − saídas", "ink"],
    ]);
  });

  it("shows a conta corrente's saldo, entradas, saídas and conciliação", () => {
    expect(summary({ type: "bank", id: "sicredi" })).toMatchObject({
      crumb: "Bancos e caixa",
      title: "Sicredi",
      pills: [
        { text: "conta corrente", tone: "muted" },
        { text: "principal", tone: "brand" },
      ],
      bank: SICREDI,
    });
    expect(strip({ type: "bank", id: "sicredi" })).toEqual([
      ["Saldo hoje", 29300, "em 24/09/2026", "ink"],
      ["Entradas no período", 80000, "2 recebimentos", "healthy"],
      ["Saídas no período", 60700, "7 pagamentos", "ink"],
      ["Conciliação", "até 20/09", "5 linhas do banco a conciliar", "attention"],
    ]);
    expect(summary({ type: "bank", id: "sicredi" })?.figures[3].amountBrl).toBeNull();
  });

  it("swaps the fourth figure on a caixa, a cartão and an aplicação", () => {
    expect(strip({ type: "bank", id: "caixa" })?.[3]).toEqual(["Lançamentos", "2", "no período", "ink"]);
    expect(strip({ type: "bank", id: "cartao" })?.[3]).toEqual(["Fatura aberta", 90, "vence 10/10/2026", "attention"]);
    expect(strip({ type: "bank", id: "rdc" })?.[3]).toEqual(["Rendimento no período", 250, "1 rendimento", "healthy"]);
    expect(summary({ type: "bank", id: "rdc" })?.pills).toEqual([{ text: "aplicação", tone: "muted" }]);
  });

  it("adds the contas up on Bancos e caixa, leaving the transferências out of entradas and saídas", () => {
    expect(strip({ type: "banks" })).toEqual([
      ["Saldo em contas", 57650, "hoje · sem os cartões", "ink"],
      ["Entradas no período", 88000, "5 recebimentos", "healthy"],
      ["Saídas no período", 70790, "8 pagamentos", "ink"],
      ["Cartões", 90, "a pagar · fora do saldo", "attention"],
    ]);
  });

  it("shows an investimento's compras, what was paid, what is still to pay and the total since the start", () => {
    expect(summary({ type: "group", group: "investment" })).toMatchObject({
      crumb: null,
      title: "Investimentos",
      pills: [
        { text: "investimento", tone: "scheduled" },
        { text: "fora do custo (COE)", tone: "muted" },
      ],
    });
    expect(strip({ type: "group", group: "investment" })).toEqual([
      ["Investido no período", 35500, "3 compras · pela data da compra", "ink"],
      ["Pago", 38500, "saiu do caixa", "ink"],
      ["A pagar", 2000, "1 lançamento · próxima 10/10", "attention"],
      ["Desde o início", 42500, "tudo o que entrou no grupo", "ink"],
    ]);
    expect(summary({ type: "account", id: "inv-maq" })).toMatchObject({
      crumb: "Investimentos",
      title: "Máquinas e implementos",
      account: account("inv-maq"),
    });
    expect(strip({ type: "account", id: "inv-maq" })?.[3]).toEqual(["Desde o início", 20500, "tudo o que entrou nesta conta", "ink"]);
    expect(summary({ type: "auto", which: "purchases" })).toMatchObject({ crumb: "Investimentos", title: "Compra de gado" });
  });

  it("shows a financiamento's saldo devedor, liberado, pago, próxima parcela and how much is quitado", () => {
    expect(summary({ type: "account", id: "fin-custeio" })).toMatchObject({
      crumb: "Financiamentos",
      title: "Custeio Sicredi",
      pills: [
        { text: "financiamento", tone: "fmd" },
        { text: "fora do resultado", tone: "muted" },
      ],
    });
    expect(strip({ type: "account", id: "fin-custeio" })).toEqual([
      ["Saldo devedor", 10000, "1 parcela a pagar", "ink"],
      ["Liberado", 30000, "1 liberação", "scheduled"],
      ["Pago", 20000, "2 parcelas", "ink"],
      ["Próxima parcela", 10000, "vence 15/10/2026", "attention"],
    ]);
    expect(summary({ type: "account", id: "fin-custeio" })?.paidShare).toBeCloseTo(2 / 3);
    expect(strip({ type: "account", id: "fin-consorcio" })?.[3]).toEqual(["Próxima parcela", "—", "nenhuma parcela a pagar", "ink"]);
    expect(summary({ type: "account", id: "fin-consorcio" })?.paidShare).toBeCloseTo(0.05);
    expect(summary({ type: "group", group: "financing" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "group", group: "financing" })?.paidShare).toBeCloseTo(25000 / 130000);
    expect(summary({ type: "group", group: "investment" })?.paidShare).toBeUndefined();
  });

  it("shows what the sócios took out, put in and the net", () => {
    expect(strip({ type: "group", group: "partners" })).toEqual([
      ["Retirado", 6000, "1 retirada", "ink"],
      ["Aportado", 1000, "1 aporte", "healthy"],
      ["Líquido", 5000, "retirado − aportado", "ink"],
      ["A pagar", 0, "nada a pagar", "ink"],
    ]);
  });

  it("shows a grupo de despesa with its share of the COE", () => {
    expect(summary({ type: "group", group: "health" })).toMatchObject({
      crumb: "Despesas",
      title: "Sanidade",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(strip({ type: "group", group: "health" })).toEqual([
      ["No período", 310, "2 lançamentos", "ink"],
      ["Pago", 10, "saiu do caixa", "ink"],
      ["A pagar", 300, "1 lançamento · próxima 15/10", "attention"],
      ["% do COE", "19 %", `de ${formatCurrency(1600)}`, "ink"],
    ]);
    expect(summary({ type: "account", id: "nut-sal" })).toMatchObject({ crumb: "Despesas › Nutrição", title: "Sal mineral" });
    expect(summary({ type: "account", id: "adm-tel" })?.pills).toContainEqual({ text: "arquivada", tone: "muted" });
  });

  it("shows a receita with what came in and its share of the receita", () => {
    expect(summary({ type: "auto", which: "sales" })).toMatchObject({ crumb: "Receitas", title: "Venda de gado" });
    expect(strip({ type: "auto", which: "sales" })).toEqual([
      ["No período", 50000, "1 lançamento", "ink"],
      ["Recebido", 50000, "entrou no caixa", "healthy"],
      ["A receber", 0, "nada a receber", "ink"],
      ["% da receita", "96 %", `de ${formatCurrency(52000)}`, "ink"],
    ]);
  });
});
```

- [ ] **Step 22: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: nodeSummary is not a function` (10 tests).

- [ ] **Step 23: Implement**

Append to `lib/domain/planTree.ts`:

```ts
type Pill = NodeSummary["pills"][number];

/** Which strip a nó shows. */
type Strip = "all" | "banks" | "expense" | "revenue" | CapitalGroup;

const PILLS: Record<Strip, Pill[]> = {
  all: [],
  banks: [],
  expense: [{ text: "custo (COE)", tone: "muted" }],
  revenue: [{ text: "receita", tone: "muted" }],
  investment: [{ text: "investimento", tone: "scheduled" }, { text: "fora do custo (COE)", tone: "muted" }],
  financing: [{ text: "financiamento", tone: "fmd" }, { text: "fora do resultado", tone: "muted" }],
  partners: [{ text: "sócios", tone: "muted" }, { text: "fora do resultado", tone: "muted" }],
};
const ARCHIVED: Pill = { text: "arquivada", tone: "muted" };

/** What is in the resultado; the rest of "todos" is "Fora do resultado". */
const RESULT_KINDS: readonly LedgerKind[] = [...GROUP_KINDS.expenses, ...GROUP_KINDS.revenue];

const count = (n: number, one: string, many: string): string => `${formatNumber(n)} ${n === 1 ? one : many}`;
const dayMonth = (iso: string): string => formatDate(iso).slice(0, 5);
/** A figure in BRL, or in words when `value` is text. */
const fig = (label: string, value: number | string, sub: string, tone: FigureTone = "ink"): Figure =>
  typeof value === "string"
    ? { label, amountBrl: null, text: value, sub, tone }
    : { label, amountBrl: value, sub, tone };
const share = (part: number, whole: number): string =>
  whole > 0 ? `${formatNumber((part / whole) * 100)} %` : "—";
const amount = (rows: LedgerRow[]): number => sum(rows, (r) => r.amountBrl);
const settled = (rows: LedgerRow[]): LedgerRow[] => rows.filter((r) => r.paidAt !== null);
const pending = (rows: LedgerRow[]): LedgerRow[] => rows.filter((r) => r.paidAt === null);

/** "A pagar" / "A receber": the pending rows, how many and the next vencimento. */
function dueFigure(label: string, rows: LedgerRow[], none: string, tone: FigureTone): Figure {
  if (rows.length === 0) return fig(label, 0, none);
  const next = rows.map((r) => r.dueDate).sort()[0];
  const sub = `${count(rows.length, "lançamento", "lançamentos")} · próxima ${dayMonth(next)}`;
  return fig(label, amount(rows), sub, tone);
}

/** Pending saídas of the lançamentos `pick` takes, earliest vencimento first. */
const toPay = (expenses: Expense[], pick: (e: Expense) => boolean): Expense[] =>
  expenses
    .filter((e) => pick(e) && e.paidAt === undefined && !isInflow(e))
    .sort((a, b) => effectiveDueDate(a).localeCompare(effectiveDueDate(b)));

/** Where a nó sits and which strip it shows. */
function placeOf(node: PlanNode, account: Account | undefined): { strip: Strip; crumb: string | null; title: string } {
  if (account) {
    const g = account.group;
    return isCategory(g)
      ? { strip: "expense", crumb: `${EXPENSES} › ${ACCOUNT_GROUP_LABEL[g]}`, title: account.name }
      : { strip: g, crumb: ACCOUNT_GROUP_LABEL[g], title: account.name };
  }
  if (node.type === "banks") return { strip: "banks", crumb: null, title: BANKS };
  if (node.type === "auto") {
    return node.which === "purchases"
      ? { strip: "investment", crumb: ACCOUNT_GROUP_LABEL.investment, title: PURCHASES }
      : { strip: "revenue", crumb: ACCOUNT_GROUP_LABEL.revenue, title: SALES };
  }
  if (node.type === "group") {
    if (node.group === "expenses") return { strip: "expense", crumb: null, title: EXPENSES };
    if (isCategory(node.group)) return { strip: "expense", crumb: EXPENSES, title: ACCOUNT_GROUP_LABEL[node.group] };
    return { strip: node.group, crumb: null, title: ACCOUNT_GROUP_LABEL[node.group] };
  }
  return { strip: "all", crumb: null, title: "Todos os lançamentos" };
}

/** The fourth figure of a conta bancária: what its kind needs to show. */
function bankFourth(bank: BankAccount, rows: PaneRow[], balance: number, todayIso: string): Figure {
  switch (bank.kind) {
    case "card": {
      // What is owed today, as a positive figure.
      const owed = Math.max(0, -balance);
      const due = formatDate(faturaOf(bank, todayIso).due);
      return fig("Fatura aberta", owed, `vence ${due}`, owed > 0 ? "attention" : "ink");
    }
    case "investment": {
      const yields = rows.filter((r) => r.ledger?.kind === "yield");
      const sub = count(yields.length, "rendimento", "rendimentos");
      return fig("Rendimento no período", sum(yields, (r) => r.amountBrl), sub, "healthy");
    }
    case "cash":
      return fig("Lançamentos", formatNumber(rows.length), "no período");
    case "checking":
      return fig(
        "Conciliação",
        bank.reconciledUntil ? `até ${dayMonth(bank.reconciledUntil)}` : "—",
        bank.pendingLines > 0
          ? `${count(bank.pendingLines, "linha", "linhas")} do banco a conciliar`
          : bank.lastImportId
            ? "tudo conciliado"
            : "nenhum extrato importado",
        bank.pendingLines > 0 ? "attention" : "ink"
      );
  }
}

function bankSummary(bank: BankAccount, inputs: PlanInputs, period: Period, todayIso: string): NodeSummary {
  const rows = nodeRows({ type: "bank", id: bank.id }, inputs, period, todayIso);
  const ins = rows.filter((r) => r.amountBrl > 0);
  const outs = rows.filter((r) => r.amountBrl < 0);
  const balance = accountBalance(bank, inputs, todayIso);
  const pills: Pill[] = [{ text: BANK_ACCOUNT_KIND_LABEL[bank.kind].toLowerCase(), tone: "muted" }];
  if (bank.isMain) pills.push({ text: "principal", tone: "brand" });
  if (bank.archivedAt !== undefined) pills.push(ARCHIVED);
  return {
    crumb: BANKS,
    title: bank.name,
    pills,
    figures: [
      fig("Saldo hoje", balance, `em ${formatDate(todayIso)}`),
      fig(
        "Entradas no período",
        sum(ins, (r) => r.amountBrl),
        count(ins.length, "recebimento", "recebimentos"),
        "healthy"
      ),
      fig("Saídas no período", sum(outs, (r) => -r.amountBrl), count(outs.length, "pagamento", "pagamentos")),
      bankFourth(bank, rows, balance, todayIso),
    ],
    bank,
  };
}

/** null when the nó points at something that no longer exists. */
export function nodeSummary(node: PlanNode, inputs: PlanInputs, period: Period, todayIso: string): NodeSummary | null {
  if (node.type === "bank") {
    const bank = inputs.bankAccounts.find((b) => b.id === node.id);
    return bank ? bankSummary(bank, inputs, period, todayIso) : null;
  }
  const account = node.type === "account" ? inputs.accounts.find((a) => a.id === node.id) : undefined;
  if (node.type === "account" && account === undefined) return null;

  const { strip, crumb, title } = placeOf(node, account);
  const lines = nodeRows(node, inputs, period, todayIso).flatMap((r) => (r.ledger ? [r.ledger] : []));
  const ins = lines.filter((r) => r.inflow);
  const outs = lines.filter((r) => !r.inflow);
  const pills = [...PILLS[strip], ...(account?.archivedAt !== undefined ? [ARCHIVED] : [])];
  const summary = (figures: Figure[], paidShare?: number): NodeSummary => ({
    crumb,
    title,
    pills,
    figures,
    ...(paidShare !== undefined && { paidShare }),
    ...(account && { account }),
  });

  switch (strip) {
    case "all": {
      const revenue = cents(periodRevenue(inputs.expenses, inputs.movements, period).total);
      const cost = cents(coe(inputs.expenses, inputs.treatments, period));
      const result = cents(revenue - cost);
      return summary([
        fig("Receitas", revenue, "vendas e outras receitas", "healthy"),
        fig("Despesas (COE)", cost, "despesas e tratamentos"),
        fig("Resultado", result, "receitas − custo", result < 0 ? "overdue" : "healthy"),
        fig(
          "Fora do resultado",
          earned(lines, (r) => !RESULT_KINDS.includes(r.kind)),
          "capital, dívidas e sócios · entradas − saídas"
        ),
      ]);
    }
    case "banks": {
      const cards = inputs.bankAccounts.filter((b) => b.kind === "card" && b.archivedAt === undefined);
      const owed = sum(cards, (c) => Math.max(0, -accountBalance(c, inputs, todayIso)));
      return summary([
        fig("Saldo em contas", bankTotal(inputs.bankAccounts, inputs, todayIso), "hoje · sem os cartões"),
        fig("Entradas no período", amount(ins), count(ins.length, "recebimento", "recebimentos"), "healthy"),
        fig("Saídas no período", amount(outs), count(outs.length, "pagamento", "pagamentos")),
        fig("Cartões", owed, "a pagar · fora do saldo", owed > 0 ? "attention" : "ink"),
      ]);
    }
    case "expense": {
      const cost = cents(coe(inputs.expenses, inputs.treatments, period));
      return summary([
        fig("No período", amount(lines), count(lines.length, "lançamento", "lançamentos")),
        fig("Pago", amount(settled(lines)), "saiu do caixa"),
        dueFigure("A pagar", pending(lines), "nada a pagar", "attention"),
        fig("% do COE", share(amount(lines), cost), `de ${formatCurrency(cost)}`),
      ]);
    }
    case "revenue": {
      const revenue = cents(periodRevenue(inputs.expenses, inputs.movements, period).total);
      return summary([
        fig("No período", amount(lines), count(lines.length, "lançamento", "lançamentos")),
        fig("Recebido", amount(settled(lines)), "entrou no caixa", "healthy"),
        dueFigure("A receber", pending(lines), "nada a receber", "scheduled"),
        fig("% da receita", share(amount(lines), revenue), `de ${formatCurrency(revenue)}`),
      ]);
    }
    case "investment": {
      const sinceStart = nodeRows(node, inputs, ALL_TIME, todayIso).flatMap((r) => (r.ledger ? [r.ledger] : []));
      return summary([
        fig("Investido no período", spent(lines), `${count(outs.length, "compra", "compras")} · pela data da compra`),
        fig("Pago", amount(settled(outs)), "saiu do caixa"),
        dueFigure("A pagar", pending(outs), "nada a pagar", "attention"),
        fig(
          "Desde o início",
          spent(sinceStart),
          node.type === "group" ? "tudo o que entrou no grupo" : "tudo o que entrou nesta conta"
        ),
      ]);
    }
    case "partners": {
      const out = amount(outs);
      const back = amount(ins);
      return summary([
        fig("Retirado", out, count(outs.length, "retirada", "retiradas")),
        fig("Aportado", back, count(ins.length, "aporte", "aportes"), "healthy"),
        fig("Líquido", cents(out - back), "retirado − aportado"),
        dueFigure("A pagar", pending(outs), "nada a pagar", "attention"),
      ]);
    }
    case "financing": {
      const contas = account ? [account] : liveFinancing(inputs.accounts);
      const ids = new Set(contas.map((a) => a.id));
      const parts = contas.map((a) => debtParts(a, inputs.expenses, todayIso));
      const owed = sum(parts, (p) => p.owed);
      const paid = sum(parts, (p) => p.paid);
      const due = toPay(inputs.expenses, (e) => e.accountId !== undefined && ids.has(e.accountId));
      const released = settled(ins);
      const payments = settled(outs);
      return summary(
        [
          fig(
            "Saldo devedor",
            cents(owed - paid),
            due.length === 0 ? "nenhuma parcela a pagar" : `${count(due.length, "parcela", "parcelas")} a pagar`
          ),
          fig("Liberado", amount(released), count(released.length, "liberação", "liberações"), "scheduled"),
          fig("Pago", amount(payments), count(payments.length, "parcela", "parcelas")),
          due.length > 0
            ? fig("Próxima parcela", due[0].amountBrl, `vence ${formatDate(effectiveDueDate(due[0]))}`, "attention")
            : fig("Próxima parcela", "—", "nenhuma parcela a pagar"),
        ],
        owed > 0 ? Math.min(1, paid / owed) : 0
      );
    }
  }
}
```

- [ ] **Step 24: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (37 tests).

#### Cycle 7: what Novo starts with

- [ ] **Step 25: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("entryInitialFor", () => {
  const initial = (node: PlanNode) => entryInitialFor(node, accounts, inputs.bankAccounts);

  it("starts Novo with nothing on todos, Bancos e caixa and the lines of the manejos", () => {
    expect(initial({ type: "all" })).toEqual({});
    expect(initial({ type: "banks" })).toEqual({});
    expect(initial({ type: "auto", which: "sales" })).toEqual({});
  });

  it("starts on the picked conta bancária, a rendimento on an aplicação", () => {
    expect(initial({ type: "bank", id: "sicredi" })).toEqual({ bankAccountId: "sicredi" });
    expect(initial({ type: "bank", id: "rdc" })).toEqual({ kind: "yield", bankAccountId: "rdc" });
  });

  it("starts with the kind of the group, the grupo and the conta", () => {
    expect(initial({ type: "group", group: "financing" })).toEqual({ kind: "financing" });
    expect(initial({ type: "group", group: "expenses" })).toEqual({ kind: "expense" });
    expect(initial({ type: "group", group: "breeding" })).toEqual({ kind: "expense", category: "breeding" });
    expect(initial({ type: "group", group: "revenue" })).toEqual({ kind: "revenue" });
    expect(initial({ type: "account", id: "nut-sal" })).toEqual({ kind: "expense", category: "nutrition", accountId: "nut-sal" });
    expect(initial({ type: "account", id: "rev-aluguel" })).toEqual({ kind: "revenue", accountId: "rev-aluguel" });
    expect(initial({ type: "account", id: "soc-lucro" })).toEqual({ kind: "partners", accountId: "soc-lucro" });
    expect(initial({ type: "account", id: "gone" })).toEqual({});
  });
});
```

- [ ] **Step 26: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: entryInitialFor is not a function` (3 tests).

- [ ] **Step 27: Implement**

Append to `lib/domain/planTree.ts`:

```ts
/** What "Novo" starts with on a nó. Pass `bankAccounts` so an aplicação starts a rendimento. */
export function entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[] = []): EntryInitial {
  switch (node.type) {
    case "bank":
      return bankAccounts.find((b) => b.id === node.id)?.kind === "investment"
        ? { kind: "yield", bankAccountId: node.id }
        : { bankAccountId: node.id };
    case "group":
      if (node.group === "expenses") return { kind: "expense" };
      if (isCategory(node.group)) return { kind: "expense", category: node.group };
      return { kind: node.group };
    case "account": {
      const account = accounts.find((a) => a.id === node.id);
      if (!account) return {};
      const g = account.group;
      return isCategory(g)
        ? { kind: "expense", category: g, accountId: account.id }
        : { kind: g, accountId: account.id };
    }
    default:
      return {};
  }
}
```

- [ ] **Step 28: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (40 tests).

#### Cycle 8: the Painel's capital strip

- [ ] **Step 29: Write the failing test**

Append to `lib/domain/__tests__/planTree.test.ts`:

```ts
describe("capitalSummary", () => {
  it("adds up the Painel's capital, dívidas e sócios", () => {
    expect(capitalSummary(inputs, PERIOD, TODAY)).toEqual({
      invested: 35500,
      investedAssets: 15500,
      investedCattle: 20000,
      applications: 10250,
      yieldInPeriod: 250,
      debt: 105000,
      debtAccounts: 2,
      nextInstallment: { dueDate: "2026-10-15", amountBrl: 10000 },
      withdrawn: 5000,
    });
  });

  it("leaves archived financiamentos out and counts only the contas that still owe", () => {
    const more: Account[] = [
      ...accounts,
      { id: "fin-old", group: "financing", name: "Antigo", openingBalanceBrl: 5000, openingDate: "2026-01-01", archivedAt: "2026-02-01T00:00:00.000Z" },
      { id: "fin-zero", group: "financing", name: "Quitado" },
    ];
    expect(capitalSummary({ ...inputs, accounts: more }, PERIOD, TODAY)).toMatchObject({ debt: 105000, debtAccounts: 2 });
  });
});
```

- [ ] **Step 30: Run it and watch it fail**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: FAIL — `TypeError: capitalSummary is not a function` (2 tests).

- [ ] **Step 31: Implement**

Append to `lib/domain/planTree.ts`:

```ts
/** The Painel's "Capital, dívidas e sócios". */
export function capitalSummary(inputs: PlanInputs, period: Period, todayIso: string): CapitalSummary {
  const rows = ledgerRows(inputs, period, todayIso);
  const investedAssets = spent(rows, isKind("investment"));
  const investedCattle = spent(rows, isKind("purchase"));
  const debts = liveFinancing(inputs.accounts).map((a) => debtBalance(a, inputs.expenses, todayIso));
  const next = toPay(inputs.expenses, (e) => e.kind === "financing")[0];
  return {
    invested: cents(investedAssets + investedCattle),
    investedAssets,
    investedCattle,
    applications: sum(
      inputs.bankAccounts.filter((b) => b.kind === "investment" && b.archivedAt === undefined),
      (b) => accountBalance(b, inputs, todayIso)
    ),
    yieldInPeriod: earned(rows, isKind("yield")),
    debt: sum(debts, (d) => d),
    debtAccounts: debts.filter((d) => d !== 0).length,
    nextInstallment: next ? { dueDate: effectiveDueDate(next), amountBrl: next.amountBrl } : null,
    withdrawn: spent(rows, isKind("partners")),
  };
}
```

- [ ] **Step 32: Run the tests**

Run: `pnpm exec vitest run lib/domain/__tests__/planTree.test.ts`
Expected: PASS (42 tests).

- [ ] **Step 33: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint lib/domain/planTree.ts lib/domain/__tests__/planTree.test.ts`
Expected: clean (verified with tasks 1–5 and 7 applied). Nothing in these two files may fail; if `tsc` reports errors elsewhere they come from task 7 (store, same wave) while it is still in progress.


### Task 7: Store

This task adds `splitExpense`. It also carries the saldo inicial in `addAccount` and `updateAccount`, the movimento in `ExpensePatch`, and readable toasts for the new refusals, and drops task 1's three `as Parameters<…>[0]` casts.

This task owns only `lib/store/useHerdStore.ts`, so it adds no store test file. Its checks are tsc, lint, the existing store tests and the smoke (task 13).

**Files:**
- Modify: `lib/store/useHerdStore.ts`

**Interfaces:**
- Consumes:
  - Task 4:
    - `POST /expenses/:id/split`. Eden: `api.expenses({ id }).split.post({ count, frequency, startsOn })` answers `Expense[]` with the original row (now parcela 1) first. Refusals: 400 `not_splittable | invalid_repeat | due_before_date`, 404 `not_found`.
    - `flow?: "in" | "out"` on POST and PATCH `/expenses`.
    - 400 `invalid_account`, also on `/statement-lines/:id/create`.
  - Task 5:
    - `openingBalanceBrl` / `openingDate` on POST and PATCH `/accounts`.
    - 400 `invalid_opening`.
    - 400 `investment_cannot_be_main` on `/bank-accounts`.
  - Task 1: `Expense.flow?: EntryFlow`, `AccountGroup` with the capital groups, `SeriesFrequency`.
- Produces:
  - `splitExpense: (id: string, input: { count: number; frequency: SeriesFrequency; startsOn: string }) => Promise<Expense[]>`. On a refusal it shows a toast and throws.
  - `addAccount: (input: { group: AccountGroup; name: string; openingBalanceBrl?: number; openingDate?: string }) => Promise<Account | null>`.
  - `updateAccount: (id: string, patch: { name?: string; archived?: boolean; openingBalanceBrl?: number | null; openingDate?: string | null }) => Promise<boolean>`.
  - `ExpensePatch` gains `flow?: EntryFlow`.
  - `apiFail` gains toasts for `invalid_account`, `invalid_opening` and `investment_cannot_be_main`, and the corrected `invalid_bank_account` text. They reach `addExpense`, `updateExpense`, `resolveStatementLine` (line create), `addAccount`, `updateAccount`, `addBankAccount` and `updateBankAccount`.

- [ ] **Step 1: Implement**

**Replace** in `lib/store/useHerdStore.ts`:

```ts
  SemenPurchase,
  SeriesRepeat,
```

with:

```ts
  SemenPurchase,
  SeriesFrequency,
  SeriesRepeat,
```

**Replace** in the same file:

```ts
/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
```

with:

```ts
/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl" | "flow">> & {
```

**Replace** in the same file:

```ts
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
```

with:

```ts
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
  /**
   * "Parcelar": turns a pending lançamento outside any série into `count`
   * parcelas, its value the total. Resolves every row, the original (now
   * parcela 1, same id and anexos) first.
   */
  splitExpense: (
    id: string,
    input: { count: number; frequency: SeriesFrequency; startsOn: string }
  ) => Promise<Expense[]>;
```

**Replace** in the same file:

```ts
  /** Creates a conta; null when its grupo already has that name (409). */
  addAccount: (input: { group: AccountGroup; name: string }) => Promise<Account | null>;
  /** Renames, archives or restores a conta; false when the name is taken (409). */
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
```

with:

```ts
  /**
   * Creates a conta (a conta de financiamento with its saldo devedor inicial
   * and its date, when given); null when its grupo already has that name (409).
   */
  addAccount: (input: {
    group: AccountGroup;
    name: string;
    openingBalanceBrl?: number;
    openingDate?: string;
  }) => Promise<Account | null>;
  /**
   * Renames, archives or restores a conta, or sets (null clears) the saldo
   * devedor inicial of a conta de financiamento; false when the name is taken (409).
   */
  updateAccount: (
    id: string,
    patch: { name?: string; archived?: boolean; openingBalanceBrl?: number | null; openingDate?: string | null }
  ) => Promise<boolean>;
```

**Replace** in the same file:

```ts
/** Refusals of the contas bancárias the farmer can act on, whatever the action. */
const BANK_REFUSALS: Record<string, string> = {
  same_account: "Escolha contas diferentes.",
  invalid_bank_account:
    "Essa conta não serve aqui: um cartão só paga despesas e uma conta arquivada não recebe lançamentos.",
```

with:

```ts
/** Refusals the farmer can act on, whatever the action: contas bancárias, plano de contas, lançamentos. */
const BANK_REFUSALS: Record<string, string> = {
  same_account: "Escolha contas diferentes.",
  invalid_bank_account:
    "Essa conta não serve aqui: um cartão só paga despesas e compras de bens, uma aplicação só recebe rendimentos e uma conta arquivada não recebe lançamentos.",
  invalid_account: "Escolha uma conta do plano para esse lançamento.",
  invalid_opening: "O saldo devedor inicial vai com a data dele, e só numa conta de financiamento.",
  investment_cannot_be_main: "Uma aplicação não pode ser a conta principal.",
```

**Replace** in the same file:

```ts
/** A scoped edit or removal was saved but the re-read of the other rows failed. */
```

with:

```ts
/** Refusals of "Parcelar" the farmer can act on. */
const SPLIT_REFUSALS: Record<string, string> = {
  not_splittable: "Só um lançamento pendente e fora de parcelamento pode ser parcelado.",
  invalid_repeat: "O valor não dá um centavo para cada parcela.",
  due_before_date: "A primeira parcela não pode vencer antes da data do lançamento.",
};

/** A scoped edit or removal was saved but the re-read of the other rows failed. */
```

**Replace** in the same file:

```ts
    // The server may have unpaired its linha do extrato (pago, conta, valor or tipo changed).
    const unpairs = ["paidAt", "bankAccountId", "amountBrl", "kind"].some((key) => key in patch);
```

with:

```ts
    // The server may have unpaired its linha do extrato (pago, conta, valor, tipo or movimento changed).
    const unpairs = ["paidAt", "bankAccountId", "amountBrl", "kind", "flow"].some((key) => key in patch);
```

**Replace** in the same file:

```ts
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    // Its linha do extrato went back to pending: the conta's figures change.
    if (isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },
```

with:

```ts
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    // Its linha do extrato went back to pending: the conta's figures change.
    if (isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },

  splitExpense: async (id, input) => {
    const { data, error } = await api.expenses({ id }).split.post(input);
    if (error) {
      const code = (error.value as { error?: string } | null)?.error ?? "";
      const message = SPLIT_REFUSALS[code];
      if (message) {
        toast.error(message);
        throw new Error(`parcelar o lançamento failed (${code})`);
      }
      apiFail("parcelar o lançamento", error);
    }
    // The original row is parcela 1 (same id); the others are new.
    const rows = data as Expense[];
    set((s) => ({
      expenses: [...s.expenses.map((e) => (e.id === id ? rows[0] : e)), ...rows.slice(1)],
    }));
    return rows;
  },
```

`addAccount` and `updateAccount` keep their bodies: they already pass `input` and `patch` through to `api.accounts.post` and `api.accounts({ id }).patch`. A 409 still answers null or false. A 400 `invalid_opening` goes through `apiFail`, which now shows its toast.

Drop task 1's three compile shims: tasks 4 and 5 widened the bodies, so the casts are no-ops.

**Replace** in the same file:

```ts
    const { data, error } = await api.expenses.post((repeat ? { ...e, repeat } : e) as Parameters<typeof api.expenses.post>[0]);
```

with:

```ts
    const { data, error } = await api.expenses.post(repeat ? { ...e, repeat } : e);
```

**Replace** in the same file:

```ts
    const { data, error } = await api.accounts.post(input as Parameters<typeof api.accounts.post>[0]);
```

with:

```ts
    const { data, error } = await api.accounts.post(input);
```

**Replace** in the same file:

```ts
    const { data, error } = await api["bank-accounts"].post(input as Parameters<(typeof api)["bank-accounts"]["post"]>[0]);
```

with:

```ts
    const { data, error } = await api["bank-accounts"].post(input);
```

- [ ] **Step 2: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean in `lib/store/useHerdStore.ts` (verified on top of tasks 1–5, casts dropped). Tasks 4 and 5 have landed, so the Eden types know `split`, `flow`, the new kinds and groups, and the opening fields. Errors may remain in task 6's `lib/domain/planTree.ts` (same wave) until it lands.

Run: `pnpm exec eslint lib/store/useHerdStore.ts`
Expected: clean

- [ ] **Step 3: Run the existing store tests**

Run: `pnpm exec vitest run lib/store/__tests__`
Expected: PASS


### Task 8: Novo lançamento

**Files:**
- Create: `components/finance/entryFields.ts`
- Create: `components/finance/YieldDialog.tsx`
- Modify: `components/finance/EntryDialog.tsx` (whole file)
- Modify: `components/finance/contas/PaidByField.tsx` (whole file)
- Modify: `components/finance/contas/useMarkPaid.tsx` (whole file)
- Modify: `components/finance/contas/MovementAccountDialog.tsx`
- Modify: `components/finance/LancarButton.tsx` (whole file)
- Test: `components/finance/__tests__/entryFields.test.ts`

**Interfaces:**
- Consumes:
  - `@/lib/types`: `EntryKind` (six literals), `EntryFlow`, `CapitalGroup`, `AccountGroup`, `Expense.flow?: EntryFlow`, `BankAccountKind` with `"investment"` (task 1).
  - `@/lib/domain/entries` (task 1): `CAPITAL_GROUPS: readonly CapitalGroup[]`, `isCapitalKind(kind): kind is CapitalGroup`, `isInflow(e: { kind; flow? }): boolean`, `mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean`, `ENTRY_KIND_LABEL: Record<EntryKind, string>`, `FLOW_LABEL: Record<CapitalGroup, Record<EntryFlow, string>>`.
  - `@/lib/domain/accounts` (task 1): `accountsByGroup(accounts)` keyed by every `AccountGroup`, capital groups included.
  - `@/lib/domain/bankAccounts` (task 2): `payingAccounts(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow | null): BankAccount[]`.
  - `@/lib/domain/planTree` (task 6): `interface EntryInitial { kind?: EntryKind; flow?: EntryFlow; category?: ExpenseCategory; accountId?: string; bankAccountId?: string }` (type only).
  - `@/lib/store/useHerdStore` (task 7): `ExpensePatch` with `flow?: EntryFlow`; `addExpense(e: Omit<Expense, "id">, repeat?)`, `updateExpense(id, patch, scope?)`, `addAccount({ group: AccountGroup; name })`.
  - API (task 4): `POST /expenses` takes the six kinds and `flow`; a `yield` is `{ kind: "yield", date, amountBrl, category: "other", paidAt: date, bankAccountId, notes }`; `PATCH /expenses/:id` takes `flow`.
- Produces:
  - `EntryDialog({ open, onOpenChange, expense?, defaultKind?, fromLine?, onResolved?, initial?: EntryInitial, template?: Expense })` — a yield (`expense`, `template` or `initial` of kind `"yield"`) renders `YieldDialog`.
  - `YieldDialog({ open, onOpenChange, bankAccountId: string, expense?: Expense })`.
  - `PaidByField({ id, accounts, kind, flow?: EntryFlow, value, disabled?, onChange })`, `defaultPaidBy(accounts, kind, flow?)`, `paidByOptions(accounts, kind, value, flow?)`.
  - `LancarButton({ size?, className?, defaultKind?, variant?, initial?: EntryInitial })`.
  - `components/finance/entryFields.ts`: `NONE`, `EntryFields`, `EntrySource`, `EntryValues`, `initialFields(source, bankAccounts, today)`, `withKind(fields, kind, flow, bankAccounts)`, `entryValues(fields, repeating)`.

- [ ] **Step 1: Write the failing test**

`components/finance/__tests__/entryFields.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { BankAccount, Expense } from "@/lib/types";
import { NONE, entryValues, initialFields, withKind, type EntryFields } from "@/components/finance/entryFields";

const TODAY = "2026-10-01";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa", isMain: false };
const CARD: BankAccount = {
  ...SICREDI,
  id: "card",
  kind: "card",
  name: "Cartão Sicredi",
  isMain: false,
  closingDay: 31,
  dueDay: 10,
};
const BANKS = [CARD, CAIXA, SICREDI];

/** A new despesa of R$ 1.500,00, paid today from the Sicredi. */
const form = (patch: Partial<EntryFields> = {}): EntryFields => ({
  ...initialFields({ defaultKind: "expense" }, BANKS, TODAY),
  amount: "1.500,00",
  ...patch,
});

describe("initialFields", () => {
  it("starts a new despesa paid today from the conta principal", () => {
    expect(initialFields({ defaultKind: "expense" }, BANKS, TODAY)).toMatchObject({
      kind: "expense",
      flow: "out",
      date: TODAY,
      dueDate: TODAY,
      paid: true,
      paidAt: TODAY,
      bankAccountId: "sicredi",
      accountId: NONE,
      lotId: NONE,
    });
  });

  it("starts on the picked nó", () => {
    const initial = { kind: "financing", flow: "in", accountId: "custeio", bankAccountId: "caixa" } as const;
    expect(initialFields({ defaultKind: "expense", initial }, BANKS, TODAY)).toMatchObject({
      kind: "financing",
      flow: "in",
      accountId: "custeio",
      bankAccountId: "caixa",
    });
    expect(initialFields({ defaultKind: "expense", initial: { category: "health" } }, BANKS, TODAY).category).toBe(
      "health"
    );
  });

  it("Duplicar keeps what the lançamento is and starts it today, pending, outside any série", () => {
    const template: Expense = {
      id: "trator-6",
      kind: "investment",
      flow: "out",
      date: "2026-02-10",
      category: "other",
      amountBrl: 9000.5,
      dueDate: "2026-10-10",
      paidAt: "2026-10-10",
      bankAccountId: "card",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      accountId: "maquinas",
      notes: "Trator MF 4275",
      seriesId: "s1",
      seriesIndex: 6,
      seriesCount: 6,
      attachmentCount: 2,
    };
    expect(initialFields({ defaultKind: "expense", template }, BANKS, TODAY)).toEqual({
      kind: "investment",
      flow: "out",
      date: TODAY,
      amount: "9000,5",
      category: "other",
      accountId: "maquinas",
      dueDate: TODAY,
      dueTouched: false,
      paid: false,
      paidAt: TODAY,
      bankAccountId: "sicredi",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      lotId: NONE,
      notes: "Trator MF 4275",
    });
  });

  it("edits a capital row with its movimento; one stored without it is a saída", () => {
    const row: Expense = {
      id: "l1",
      kind: "financing",
      flow: "in",
      date: "2025-11-15",
      category: "other",
      amountBrl: 150000,
      accountId: "custeio",
    };
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY).flow).toBe("in");
    expect(initialFields({ defaultKind: "expense", expense: { ...row, flow: undefined } }, BANKS, TODAY).flow).toBe(
      "out"
    );
  });
});

describe("withKind", () => {
  it("moves Pago por off a cartão when the new direction cannot use it", () => {
    const onCard = form({ bankAccountId: "card" });
    expect(withKind(onCard, "revenue", "out", BANKS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "investment", "out", BANKS).bankAccountId).toBe("card");
    expect(withKind(onCard, "investment", "in", BANKS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "partners", "out", BANKS).bankAccountId).toBe("sicredi");
  });

  it("starts a new kind without conta and keeps it when only the movimento changes", () => {
    const compra = form({ kind: "investment", accountId: "maquinas" });
    expect(withKind(compra, "investment", "in", BANKS).accountId).toBe("maquinas");
    expect(withKind(compra, "partners", "out", BANKS).accountId).toBe(NONE);
  });
});

describe("entryValues", () => {
  it("refuses a capital kind without conta", () => {
    expect(entryValues(form({ kind: "partners" }), false)).toBe("Escolha a conta do plano.");
  });

  it("writes an investimento with its movimento and conta, category other and no lote", () => {
    const values = entryValues(
      form({ kind: "investment", flow: "in", category: "health", accountId: "maquinas", lotId: "engorda" }),
      false
    );
    expect(values).toMatchObject({ flow: "in", category: "other", accountId: "maquinas", lotId: null, amountBrl: 1500 });
  });

  it("writes a despesa with its grupo and lote and no movimento", () => {
    const values = entryValues(form({ category: "health", lotId: "engorda", flow: "in" }), false);
    expect(values).toMatchObject({ category: "health", lotId: "engorda" });
    expect(values).not.toHaveProperty("flow");
  });

  it("writes a receita in category other, with no movimento", () => {
    const values = entryValues(form({ kind: "revenue", category: "health" }), false);
    expect(values).toMatchObject({ category: "other" });
    expect(values).not.toHaveProperty("flow");
  });

  it("leaves a pending lançamento without payment day or conta bancária", () => {
    expect(entryValues(form({ paid: false }), false)).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("asks the day of the recebimento on an aporte and of the pagamento on a retirada", () => {
    const aporte = form({ kind: "partners", flow: "in", accountId: "socio", paidAt: "" });
    expect(entryValues(aporte, false)).toBe("Informe a data do recebimento.");
    expect(entryValues({ ...aporte, flow: "out" }, false)).toBe("Informe a data do pagamento.");
  });

  it("reads Vencimento only when Repetir does not set it", () => {
    expect(entryValues(form({ dueDate: "" }), false)).toBe("Informe o vencimento.");
    expect(entryValues(form({ dueDate: "" }), true)).not.toBeTypeOf("string");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run components/finance/__tests__/entryFields.test.ts`
Expected: FAIL — `Cannot find package '@/components/finance/entryFields'` (the module does not exist yet).

- [ ] **Step 3: Implement**

**3a.** Create `components/finance/entryFields.ts`:

```ts
/**
 * The fields of "Novo lançamento" and what they become. `initialFields` says
 * where the form starts (the lançamento edited or duplicated, the nó picked,
 * a linha do extrato), `withKind` keeps it sound when the type or the
 * movimento changes, and `entryValues` turns it into the row the API takes: a
 * receita and the capital kinds write category "other"; the capital kinds
 * need a conta and a movimento and take no lote. Pure.
 */
import type { BankAccount, EntryFlow, EntryKind, Expense, ExpenseCategory, StatementLine } from "@/lib/types";
import { isCapitalKind, isInflow, mayPayFrom } from "@/lib/domain/entries";
import type { EntryInitial } from "@/lib/domain/planTree";
import { parseAmount } from "@/components/finance/parseAmount";
import { defaultPaidBy } from "@/components/finance/contas/PaidByField";

/** Select value for "Sem conta" and "Fazenda toda": Radix refuses "". */
export const NONE = "none";

export interface EntryFields {
  kind: EntryKind;
  /** Movimento; read on investimento, financiamento and sócios only. */
  flow: EntryFlow;
  date: string;
  amount: string;
  category: ExpenseCategory;
  accountId: string;
  dueDate: string;
  /** The user changed Vencimento; until then it follows Data. */
  dueTouched: boolean;
  paid: boolean;
  paidAt: string;
  /** "Pago por": a conta bancária id, "" when the farm has none. */
  bankAccountId: string;
  counterparty: string;
  document: string;
  lotId: string;
  notes: string;
}

/** Where the form starts. */
export interface EntrySource {
  /** Editar. */
  expense?: Expense;
  /** Duplicar: a new lançamento filled from this one. */
  template?: Expense;
  /** "Novo" on a picked nó. */
  initial?: EntryInitial;
  /** "Criar lançamento" from a linha do extrato. */
  fromLine?: StatementLine;
  defaultKind: EntryKind;
}

/** The row the fields describe, without its kind; null clears (edit) or is left out (create). */
export interface EntryValues {
  /** Movimento of an investimento, financiamento or sócios; absent on the others. */
  flow?: EntryFlow;
  date: string;
  category: ExpenseCategory;
  amountBrl: number;
  dueDate: string;
  paidAt: string | null;
  counterparty: string | null;
  document: string | null;
  accountId: string | null;
  bankAccountId: string | null;
  lotId: string | null;
  notes: string | null;
}

const amountText = (amountBrl: number) => String(amountBrl).replace(".", ",");

export function initialFields(source: EntrySource, bankAccounts: BankAccount[], today: string): EntryFields {
  const { expense, template, initial, fromLine } = source;
  if (fromLine) {
    return {
      kind: fromLine.amountBrl < 0 ? "expense" : "revenue",
      flow: "out",
      date: fromLine.date,
      amount: amountText(Math.abs(fromLine.amountBrl)),
      category: "nutrition",
      accountId: NONE,
      dueDate: fromLine.date,
      dueTouched: false,
      paid: true,
      paidAt: fromLine.date,
      bankAccountId: fromLine.bankAccountId,
      counterparty: "",
      document: "",
      lotId: NONE,
      notes: fromLine.description,
    };
  }
  if (expense) {
    return {
      kind: expense.kind,
      flow: expense.flow ?? "out",
      date: expense.date,
      amount: amountText(expense.amountBrl),
      category: expense.category,
      accountId: expense.accountId ?? NONE,
      dueDate: expense.dueDate ?? expense.date,
      dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
      paid: expense.paidAt !== undefined,
      paidAt: expense.paidAt ?? today,
      // A row paid before the contas existed stays without one until the farmer picks it.
      bankAccountId:
        expense.bankAccountId ?? (expense.paidAt ? "" : defaultPaidBy(bankAccounts, expense.kind, expense.flow)),
      counterparty: expense.counterparty ?? "",
      document: expense.document ?? "",
      lotId: expense.lotId ?? NONE,
      notes: expense.notes ?? "",
    };
  }
  // Duplicar keeps what the lançamento is and drops when and how it was paid.
  const kind = template?.kind ?? initial?.kind ?? source.defaultKind;
  const flow = template?.flow ?? initial?.flow ?? "out";
  return {
    kind,
    flow,
    date: today,
    amount: template ? amountText(template.amountBrl) : "",
    category: template?.category ?? initial?.category ?? "nutrition",
    accountId: template?.accountId ?? initial?.accountId ?? NONE,
    dueDate: today,
    dueTouched: false,
    paid: !template,
    paidAt: today,
    bankAccountId: initial?.bankAccountId ?? defaultPaidBy(bankAccounts, kind, flow),
    counterparty: template?.counterparty ?? "",
    document: template?.document ?? "",
    lotId: template?.lotId ?? NONE,
    notes: template?.notes ?? "",
  };
}

/**
 * The type or the movimento changed: another kind starts without conta (its
 * grupo changed), and "Pago por" leaves a conta that may not take the new
 * direction (a cartão never receives).
 */
export function withKind(
  fields: EntryFields,
  kind: EntryKind,
  flow: EntryFlow,
  bankAccounts: BankAccount[]
): EntryFields {
  const current = bankAccounts.find((a) => a.id === fields.bankAccountId);
  return {
    ...fields,
    kind,
    flow,
    accountId: kind === fields.kind ? fields.accountId : NONE,
    bankAccountId:
      current && mayPayFrom(current.kind, kind, flow) ? current.id : defaultPaidBy(bankAccounts, kind, flow),
  };
}

/**
 * The row the fields describe, or the message that stops it. `repeating`:
 * Repetir sets the vencimentos, so Vencimento is not read.
 */
export function entryValues(fields: EntryFields, repeating: boolean): EntryValues | string {
  if (fields.date === "") return "Informe a data do lançamento.";
  const amountBrl = parseAmount(fields.amount);
  if (!Number.isFinite(amountBrl) || amountBrl <= 0) return "Informe o valor (maior que zero).";
  const capital = isCapitalKind(fields.kind);
  if (capital && fields.accountId === NONE) return "Escolha a conta do plano.";
  if (!repeating && fields.dueDate === "") return "Informe o vencimento.";
  if (!repeating && fields.dueDate < fields.date) return "O vencimento não pode ser antes da data";
  if (fields.paid && fields.paidAt === "") {
    return isInflow(fields) ? "Informe a data do recebimento." : "Informe a data do pagamento.";
  }
  return {
    ...(capital ? { flow: fields.flow } : {}),
    date: fields.date,
    category: fields.kind === "expense" ? fields.category : "other",
    amountBrl,
    dueDate: fields.dueDate,
    paidAt: fields.paid ? fields.paidAt : null,
    counterparty: fields.counterparty.trim() || null,
    document: fields.document.trim() || null,
    accountId: fields.accountId === NONE ? null : fields.accountId,
    bankAccountId: fields.paid && fields.bankAccountId !== "" ? fields.bankAccountId : null,
    lotId: capital || fields.lotId === NONE ? null : fields.lotId,
    notes: fields.notes.trim() || null,
  };
}
```

**3b.** Replace the whole file `components/finance/contas/PaidByField.tsx` with:

```tsx
"use client";

/**
 * "Pago por" / "Recebido em": the conta a lançamento was paid from or received
 * into. Offers the contas that may take it (`payingAccounts`: not archived,
 * the conta principal first, a cartão only for a despesa or the compra of an
 * investimento, an aplicação only for a rendimento) and "Sem conta" ("" — a
 * row paid before the contas existed). Renders nothing while no conta may.
 */
import type { BankAccount, EntryFlow, EntryKind } from "@/lib/types";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
import { isInflow } from "@/lib/domain/entries";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The conta "Pago por" starts on: the conta principal, else the first one offered; "" with none. */
export function defaultPaidBy(accounts: BankAccount[], kind: EntryKind, flow?: EntryFlow): string {
  return payingAccounts(accounts, kind, flow)[0]?.id ?? "";
}

/** Radix Select takes no "" value: "Sem conta" goes by this one. */
const NO_ACCOUNT = "__none";

/** The contas the field lists; none means it renders nothing. */
export function paidByOptions(
  accounts: BankAccount[],
  kind: EntryKind,
  value: string,
  flow?: EntryFlow
): BankAccount[] {
  const options = payingAccounts(accounts, kind, flow);
  // A row paid by a conta archived since keeps showing it.
  const current = accounts.find((a) => a.id === value);
  return current && !options.includes(current) ? [...options, current] : options;
}

export function PaidByField({
  id,
  accounts,
  kind,
  flow,
  value,
  disabled,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  /** Movimento of an investimento, financiamento or sócios. */
  flow?: EntryFlow;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const shown = paidByOptions(accounts, kind, value, flow);
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{isInflow({ kind, flow }) ? "Recebido em" : "Pago por"}</Label>
      <Select
        value={value === "" ? NO_ACCOUNT : value}
        onValueChange={(next) => onChange(next === NO_ACCOUNT ? "" : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
        <SelectContent>
          {shown.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {bankAccountLabel(a)}
            </SelectItem>
          ))}
          <SelectItem value={NO_ACCOUNT}>Sem conta</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

**3c.** Create `components/finance/YieldDialog.tsx`:

```tsx
"use client";

/**
 * "Lançar rendimento": what an aplicação earned. It is received on its own
 * date into the aplicação, raises its saldo and stays out of the receita: no
 * conta do plano, vencimento or repetition. With `expense` it edits that
 * rendimento (the same three fields).
 */
import { useState, type FormEvent } from "react";
import type { Expense } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
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
import { Textarea } from "@/components/ui/textarea";

export function YieldDialog({
  open,
  onOpenChange,
  bankAccountId,
  expense,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The aplicação. */
  bankAccountId: string;
  expense?: Expense;
}) {
  const name = useHerdStore((s) => s.bankAccounts.find((a) => a.id === bankAccountId)?.name);
  // While saving the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar rendimento" : "Lançar rendimento"}</DialogTitle>
          <DialogDescription>
            {name ?? "Aplicação"} · soma no saldo da aplicação e fica fora da receita.
          </DialogDescription>
        </DialogHeader>
        <YieldForm
          bankAccountId={bankAccountId}
          expense={expense}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function YieldForm({
  bankAccountId,
  expense,
  onBusyChange,
  onDone,
}: {
  bankAccountId: string;
  expense?: Expense;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const { addToast } = useToast();
  const [date, setDate] = useState(() => expense?.date ?? todayISO());
  const [amount, setAmount] = useState(expense ? String(expense.amountBrl).replace(".", ",") : "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date === "") return setError("Informe a data do rendimento.");
    const amountBrl = parseAmount(amount);
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) return setError("Informe o valor (maior que zero).");
    setError(null);
    setSaving(true);
    try {
      // A rendimento is received on its own date.
      if (expense) {
        await updateExpense(expense.id, { date, amountBrl, paidAt: date, notes: notes.trim() || null });
      } else {
        await addExpense({
          kind: "yield",
          date,
          amountBrl,
          category: "other",
          paidAt: date,
          bankAccountId,
          notes: notes.trim() || undefined,
        });
      }
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    addToast({ messageType: "success", text: expense ? "Rendimento salvo" : "Rendimento lançado" });
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="yield-date">Data</Label>
          <Input
            id="yield-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="yield-amount">Valor (R$)</Label>
          <Input
            id="yield-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="yield-notes">Observação</Label>
        <Textarea
          id="yield-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: rendimento de setembro"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving}>
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

**3d.** Replace the whole file `components/finance/EntryDialog.tsx` with:

```tsx
"use client";

/**
 * "Novo lançamento": a despesa, a receita or money that stays out of the
 * resultado (investimento, financiamento, sócios), with vencimento, pagamento
 * and the conta bancária it was paid by ("Pago por"), conta do plano, pago
 * para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. A capital kind needs a conta of its grupo and a
 * Movimento (Compra / Venda do bem, Pagamento / Liberação, Retirada / Aporte)
 * and takes no grupo or lote; the words about paying follow the direction.
 * `initial` starts it on the nó picked in Lançamentos; `template` fills it
 * from a lançamento (Duplicar: today, pending, no anexos, no repetition).
 * With `fromLine` it is "Criar lançamento" of the conciliação: the linha do
 * extrato fixes the kind (despesa or receita), the value and the payment (on
 * its date, by its conta) and the lançamento is saved paired with it. With
 * `expense` it edits that lançamento: the type switch and Repetir are hidden,
 * a row of a série says which ("Parcela 2/3", "Recorrente · todo dia 20") and
 * saving asks where the change applies. A rendimento opens the YieldDialog
 * instead. Vendas and compras de gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { Info, Repeat } from "lucide-react";
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type {
  AccountGroup,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  SeriesScope,
  StatementLine,
} from "@/lib/types";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, ENTRY_KIND_LABEL, FLOW_LABEL, isCapitalKind, isInflow } from "@/lib/domain/entries";
import type { EntryInitial } from "@/lib/domain/planTree";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import {
  NONE,
  entryValues,
  initialFields,
  withKind,
  type EntryFields,
  type EntrySource,
} from "@/components/finance/entryFields";
import {
  RepeatSection,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { YieldDialog } from "@/components/finance/YieldDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
import { PaidByField, paidByOptions } from "@/components/finance/contas/PaidByField";
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

/** The type switch: despesa, receita, then the three kinds outside the resultado. */
const KINDS: readonly EntryKind[] = ["expense", "revenue", ...CAPITAL_GROUPS];

/** Movimento, the saída first. */
const FLOWS: readonly EntryFlow[] = ["out", "in"];

/** The line under the type switch of a kind outside the resultado. */
const CAPITAL_NOTICE: Record<CapitalGroup, string> = {
  investment:
    "Investimento é capital: fica fora do custo (COE) e do resultado do período. Sai do caixa quando é pago.",
  financing:
    "Financiamento é dívida: fica fora do custo (COE) e do resultado do período. A liberação aumenta o saldo devedor; cada pagamento o baixa.",
  partners:
    "Sócios é dinheiro dos donos: fica fora do custo (COE) e do resultado do período. A retirada sai do caixa; o aporte entra.",
};

/** Toast after one lançamento was created; parcelas and recorrências say so instead. */
const CREATED_TOAST: Record<EntryKind, string> = {
  expense: "Despesa lançada",
  revenue: "Receita lançada",
  investment: "Investimento lançado",
  financing: "Financiamento lançado",
  partners: "Lançamento de sócios salvo",
  yield: "Rendimento lançado",
};

/** One segment of the type and Movimento switches. */
function segmentClass(selected: boolean, className: string) {
  return cn(
    "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
    selected ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]" : "text-ink-soft hover:text-ink",
    className
  );
}

/** Whether "Parcelas" holds a count the server takes (2–48). */
function countInRange(typed: string): boolean {
  const count = Number(typed);
  return Number.isInteger(count) && count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS;
}

export function EntryDialog({
  open,
  onOpenChange,
  expense,
  defaultKind = "expense",
  fromLine,
  onResolved,
  initial,
  template,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
  /** "Criar lançamento" from a linha do extrato. */
  fromLine?: StatementLine;
  /** After the lançamento was created and paired with `fromLine`. */
  onResolved?(resolved: Resolved): void;
  /** "Novo" on a picked nó: kind, movimento, grupo, conta and conta bancária start from it. */
  initial?: EntryInitial;
  /** Duplicar: a new lançamento filled from this one. */
  template?: Expense;
}) {
  // While saving (and uploading) the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  // A rendimento has its own small form, on the aplicação of whichever started it.
  const rendimento = [expense, template, initial].find((source) => source?.kind === "yield");
  if (rendimento) {
    return (
      <YieldDialog
        open={open}
        onOpenChange={onOpenChange}
        bankAccountId={rendimento.bankAccountId ?? ""}
        expense={expense?.kind === "yield" ? expense : undefined}
      />
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : fromLine ? "Criar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            {fromLine
              ? "Preenchido pela linha do banco · confira a conta do plano."
              : initial?.kind || initial?.bankAccountId
                ? "Começa na conta escolhida no plano de contas. Vendas e compras de gado entram sozinhas pelos manejos."
                : "Despesas, receitas, investimentos, financiamentos e sócios. Vendas e compras de gado entram sozinhas pelos manejos."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          source={{ expense, template, initial, fromLine, defaultKind }}
          onResolved={onResolved}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  source,
  onResolved,
  onBusyChange,
  onDone,
}: {
  source: EntrySource;
  onResolved?(resolved: Resolved): void;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const { expense, fromLine } = source;
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const resolveStatementLine = useHerdStore((s) => s.resolveStatementLine);
  const { addToast } = useToast();
  /** The linha do extrato fixes the kind, the value and the payment. */
  const fixed = fromLine !== undefined;

  const [fields, setFields] = useState<EntryFields>(() => initialFields(source, bankAccounts, todayISO()));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
  const [scopePatch, setScopePatch] = useState<ExpensePatch | null>(null);
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };
  const [creatingAccount, setCreatingAccount] = useState(false);

  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  /** Investimento, financiamento or sócios: conta required, Movimento, no grupo or lote. */
  const capitalKind = isCapitalKind(fields.kind) ? fields.kind : null;
  const inflow = isInflow(fields);
  const group: AccountGroup = capitalKind ?? (fields.kind === "revenue" ? "revenue" : fields.category);
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

  const repeating = !expense && !fixed && repeatFields.choice !== "once";
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

  /**
   * Uploads the files chosen before the lançamento existed, one at a time, with
   * progress; answers how many failed.
   */
  async function uploadPending(expenseId: string): Promise<number> {
    let failed = 0;
    for (const item of pending) {
      const patch = (next: Partial<PendingFile>) =>
        setPending((files) => files.map((f) => (f.key === item.key ? { ...f, ...next } : f)));
      try {
        patch({ progress: 0 });
        await uploadAttachment(expenseId, item.file, (progress) => patch({ progress }));
        patch({ progress: 100 });
      } catch {
        patch({ progress: null, error: "não enviado" }); // the store already toasted
        failed += 1;
      }
    }
    return failed;
  }

  async function onCreateAccount() {
    const name = (newAccountName ?? "").trim();
    if (name === "" || creatingAccount) return;
    setCreatingAccount(true);
    let created;
    try {
      // A financiamento created here has no saldo inicial: Configurações › Plano de contas sets it.
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
    const values = entryValues(fields, repeating);
    if (typeof values === "string") {
      setError(values);
      return;
    }
    const repeat = expense || fixed ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
    }
    setError(null);

    if (expense) {
      // Every field, null clearing; a capital row also sends its Movimento.
      const patch: ExpensePatch = values;
      // A row of a série asks where the change applies before saving.
      if (expense.seriesId) setScopePatch(patch);
      else await saveEdit(expense, patch, "one");
      return;
    }

    if (fromLine) {
      setSaving(true);
      const resolved = await resolveStatementLine(fromLine, {
        type: "create",
        entry: {
          date: values.date,
          category: values.category,
          amountBrl: values.amountBrl,
          dueDate: values.dueDate,
          counterparty: values.counterparty ?? undefined,
          document: values.document ?? undefined,
          accountId: values.accountId ?? undefined,
          lotId: values.lotId ?? undefined,
          notes: values.notes ?? undefined,
        },
      }).catch(() => null); // apiFail already toasted
      if (!resolved?.expense) {
        setSaving(false);
        return;
      }
      const failed = pending.length > 0 ? await uploadPending(resolved.expense.id) : 0;
      addToast(
        failed > 0
          ? { messageType: "warning", text: `Lançamento conciliado; ${failed} anexo(s) não enviado(s) — anexe em Editar.` }
          : { messageType: "success", text: "Lançamento criado e conciliado" }
      );
      setSaving(false);
      onResolved?.(resolved);
      onDone();
      return;
    }

    setSaving(true);
    let created: Expense[];
    try {
      created = await addExpense(
        {
          kind: fields.kind,
          flow: values.flow,
          date: values.date,
          category: values.category,
          amountBrl: values.amountBrl,
          dueDate: values.dueDate,
          paidAt: values.paidAt ?? undefined,
          counterparty: values.counterparty ?? undefined,
          document: values.document ?? undefined,
          accountId: values.accountId ?? undefined,
          bankAccountId: values.bankAccountId ?? undefined,
          lotId: values.lotId ?? undefined,
          notes: values.notes ?? undefined,
        },
        repeat ?? undefined
      );
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    // The NF or recibo belongs to the purchase: the first parcela or ocorrência carries it.
    const failed = created.length > 0 && pending.length > 0 ? await uploadPending(created[0].id) : 0;
    if (failed > 0) {
      addToast({
        messageType: "warning",
        text: `Lançamento salvo; ${failed} anexo(s) não enviado(s) — anexe em Editar.`,
      });
    } else {
      const text =
        created.length > 1
          ? repeatFields.choice === "recurring"
            ? "Recorrência lançada"
            : "Parcelas lançadas"
          : CREATED_TOAST[fields.kind];
      addToast({ messageType: "success", text });
    }
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense || fixed ? null : (
        // Five segments: on the phone the row scrolls sideways instead of wrapping.
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5"
        >
          {KINDS.map((kind) => {
            const selected = fields.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setFields((f) => withKind(f, kind, f.flow, bankAccounts));
                  setNewAccountName(null);
                }}
                className={segmentClass(selected, "shrink-0 grow")}
              >
                {ENTRY_KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>
      )}

      {capitalKind ? (
        <p className="flex items-start gap-2.5 rounded-lg bg-scheduled-soft px-3 py-2.5 text-[13px] leading-[18px] text-scheduled">
          <Info className="mt-px size-4 shrink-0" aria-hidden />
          {CAPITAL_NOTICE[capitalKind]}
        </p>
      ) : null}

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
            readOnly={fixed}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>

        {capitalKind ? null : (
          <div className="grid gap-1.5">
            {fields.kind === "revenue" ? (
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
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta do plano</Label>
          {newAccountName === null ? (
            <>
              {/* A capital kind has no "Sem conta": "" shows the placeholder until one is picked. */}
              <Select
                value={capitalKind && fields.accountId === NONE ? "" : fields.accountId}
                onValueChange={(accountId) => set({ accountId })}
              >
                <SelectTrigger id="entry-account" className="min-h-11 w-full" aria-required={capitalKind ? true : undefined}>
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {capitalKind ? null : <SelectItem value={NONE}>Sem conta</SelectItem>}
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
        {capitalKind ? (
          <div className="grid content-start gap-1.5">
            <span id="entry-flow" className="text-sm leading-none font-medium">
              Movimento
            </span>
            <div
              role="radiogroup"
              aria-labelledby="entry-flow"
              className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
            >
              {FLOWS.map((flow) => {
                const selected = fields.flow === flow;
                return (
                  <button
                    key={flow}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setFields((f) => withKind(f, f.kind, flow, bankAccounts))}
                    className={segmentClass(selected, "flex-1")}
                  >
                    {FLOW_LABEL[capitalKind][flow]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

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
          <span className="text-sm leading-none font-medium">{inflow ? "Recebimento" : "Pagamento"}</span>
          <div className="flex min-h-11 items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={fields.paid}
                disabled={fixed}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
              {inflow ? "Já recebido" : "Já pago"}
              {fields.paid ? " em" : ""}
            </label>
            {fields.paid ? (
              <Input
                type="date"
                aria-label={inflow ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                disabled={fixed}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
            ) : null}
          </div>
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments" ? "só a 1ª parcela" : "só a 1ª conta"}
            </p>
          ) : null}
        </div>
        {fields.paid && paidByOptions(bankAccounts, fields.kind, fields.bankAccountId, fields.flow).length > 0 ? (
          <div className="sm:col-start-2">
            <PaidByField
              id="entry-paid-by"
              accounts={bankAccounts}
              kind={fields.kind}
              flow={fields.flow}
              value={fields.bankAccountId}
              disabled={fixed}
              onChange={(bankAccountId) => set({ bankAccountId })}
            />
          </div>
        ) : null}
      </div>

      {fixed ? null : expense ? (
        seriesLine ? (
          <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-sm text-ink">
            <Repeat className="size-4 text-ink-soft" aria-hidden />
            {seriesLine}
          </p>
        ) : null
      ) : (
        <RepeatSection
          fields={repeatFields}
          onChange={(patch) =>
            setRepeatFields((r) => ({
              ...r,
              ...patch,
              // Parcelado picks up a Vencimento the user already set.
              ...(patch.choice === "installments" && r.choice !== "installments" && fields.dueTouched && fields.dueDate
                ? { firstDue: fields.dueDate }
                : {}),
            }))
          }
          date={fields.date}
          amount={parseAmount(fields.amount)}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Without Lote, Pago para and Documento share the row. */}
        <div className={cn("grid gap-1.5", capitalKind ? null : "sm:col-span-2")}>
          <Label htmlFor="entry-counterparty">{inflow ? "Recebido de" : "Pago para"}</Label>
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
        <div className="grid content-start gap-1.5">
          <Label htmlFor="entry-document">Documento</Label>
          <Input
            id="entry-document"
            value={fields.document}
            placeholder="NF 4.812"
            onChange={(e) => set({ document: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        {capitalKind ? null : (
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
        )}
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

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense
            ? "Salvar"
            : fixed
              ? "Salvar e conciliar"
              : repeatFields.choice === "installments"
                ? `Lançar ${countInRange(repeatFields.count) ? `${repeatFields.count} ` : ""}parcelas`
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

Notes for the implementer:
- `entryValues` never returns `kind`; the create path adds `kind: fields.kind`. `values` is assigned to `ExpensePatch` as is: a despesa/receita patch has no `flow` key, a capital one has it. Never add an `id` to the create body (Duplicar goes through the create path because `expense` is undefined).
- Submitting a capital kind without a conta stops in `entryValues` ("Escolha a conta do plano.") before any store call.
- `fromLine` keeps the type switch hidden, so it stays despesa/receita.

**3e.** Replace the whole file `components/finance/contas/useMarkPaid.tsx` with:

```tsx
"use client";

/**
 * "Marcar como pago / recebido" with the conta. With one conta (or none) the
 * lançamento is marked at once from it; with two or more, a small dialog asks
 * "Pago por" (or "Recebido em") and the day first. The words follow the
 * lançamento's direction, the contas offered its kind and movimento. The
 * hook toasts either way.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import type { Expense } from "@/lib/types";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
import { isInflow } from "@/lib/domain/entries";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { PaidByField, defaultPaidBy } from "@/components/finance/contas/PaidByField";
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

export function useMarkPaid(onDone?: () => void): {
  /** Marks now, or opens the dialog; resolves once the silent mark settled. */
  request(expense: Expense): Promise<void>;
  dialog: ReactNode;
} {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const { addToast } = useToast();
  const [target, setTarget] = useState<Expense | null>(null);

  const mark = async (expense: Expense, paidAt: string, bankAccountId: string | null) => {
    await markExpensePaid(expense.id, paidAt, bankAccountId);
    addToast({ messageType: "success", text: isInflow(expense) ? "Marcado como recebido" : "Marcado como pago" });
    onDone?.();
  };

  const request = async (expense: Expense) => {
    const options = payingAccounts(bankAccounts, expense.kind, expense.flow);
    if (options.length >= 2) {
      setTarget(expense);
      return;
    }
    try {
      await mark(expense, todayISO(), options[0]?.id ?? null);
    } catch {
      // apiFail already toasted
    }
  };

  const dialog = target ? (
    <MarkPaidDialog
      expense={target}
      onClose={() => setTarget(null)}
      onConfirm={(paidAt, bankAccountId) => mark(target, paidAt, bankAccountId)}
    />
  ) : null;
  return { request, dialog };
}

function MarkPaidDialog({
  expense,
  onClose,
  onConfirm,
}: {
  expense: Expense;
  onClose(): void;
  onConfirm(paidAt: string, bankAccountId: string): Promise<void>;
}) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const inflow = isInflow(expense);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [bankAccountId, setBankAccountId] = useState(() =>
    defaultPaidBy(bankAccounts, expense.kind, expense.flow)
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paidAt === "" || bankAccountId === "") return;
    setBusy(true);
    try {
      await onConfirm(paidAt, bankAccountId);
      onClose();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{inflow ? "Marcar como recebido" : "Marcar como pago"}</DialogTitle>
          <DialogDescription>{inflow ? "Em que conta o dinheiro entrou?" : "De que conta o dinheiro saiu?"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <PaidByField
            id="mark-paid-account"
            accounts={bankAccounts}
            kind={expense.kind}
            flow={expense.flow}
            value={bankAccountId}
            onChange={setBankAccountId}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="mark-paid-date">{inflow ? "Recebido em" : "Pago em"}</Label>
            <Input
              id="mark-paid-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="min-h-11 font-mono"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy || paidAt === ""}>
              {inflow ? "Marcar recebido" : "Marcar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**3f.** `components/finance/contas/MovementAccountDialog.tsx` — the call stays `"revenue"`; say why.

Replace:

```tsx
  const options = payingAccounts(bankAccounts, "revenue");
```

with:

```tsx
  // A venda or compra de gado moves through a conta corrente or the caixa, as a receita does: never a cartão or an aplicação.
  const options = payingAccounts(bankAccounts, "revenue");
```

**3g.** Replace the whole file `components/finance/LancarButton.tsx` with:

```tsx
"use client";

/** "Lançar": opens the EntryDialog. Nothing for a member without Financeiro edit. */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { EntryKind } from "@/lib/types";
import type { EntryInitial } from "@/lib/domain/planTree";
import { useCan } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryDialog } from "@/components/finance/EntryDialog";

export function LancarButton({
  size = "default",
  className,
  defaultKind = "expense",
  variant = "default",
  initial,
}: {
  size?: "sm" | "default";
  className?: string;
  defaultKind?: EntryKind;
  variant?: "default" | "outline" | "ghost";
  /** "Novo" on a picked nó of Lançamentos. */
  initial?: EntryInitial;
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
      <EntryDialog open={open} onOpenChange={setOpen} defaultKind={defaultKind} initial={initial} />
    </>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run components/finance/__tests__/entryFields.test.ts components/finance/__tests__/repeatFields.test.ts components/finance/__tests__/parseAmount.test.ts`
Expected: PASS (23 tests)

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint components/finance/entryFields.ts components/finance/__tests__/entryFields.test.ts components/finance/YieldDialog.tsx components/finance/EntryDialog.tsx components/finance/contas/PaidByField.tsx components/finance/contas/useMarkPaid.tsx components/finance/contas/MovementAccountDialog.tsx components/finance/LancarButton.tsx`
Expected: lint clean; tsc clean, no error anywhere (verified with tasks 1–7 applied and 9–12 not yet). If tasks 9–12 of the same wave are mid-edit, an error in their own files is theirs; none may point at the files above.


### Task 9: Contas

**Files:**
- Create: `components/finance/plano/NewAccountDialog.tsx`
- Delete: `components/finance/plano/AccountDialog.tsx`
- Modify: `components/finance/plano/AccountsPage.tsx` (whole file)
- Modify: `components/finance/contas/BankAccountDialog.tsx`
- Modify: `components/finance/contas/AccountCard.tsx` (one line; task 1 did the rest)
- Modify: `components/finance/contas/ContasPage.tsx`

**Interfaces:**
- Consumes:
  - `@/lib/types` (task 1): `CapitalGroup`, `AccountGroup` with the capital groups, `Account.openingBalanceBrl?: number`, `Account.openingDate?: string`, `BankAccountKind` with `"investment"`.
  - `@/lib/domain/accounts` (task 1): `EXPENSE_GROUPS: readonly ExpenseCategory[]`, `ACCOUNT_GROUP_LABEL` (with Investimentos, Financiamentos, Sócios), `accountsByGroup(accounts, includeArchived?)` keyed by every `AccountGroup`.
  - `@/lib/domain/entries` (task 1): `CAPITAL_GROUPS: readonly CapitalGroup[]`.
  - `@/lib/domain/bankAccounts` (task 1): `BANK_ACCOUNT_KIND_LABEL.investment = "Aplicação"`; `bankTotal` already counts every non-cartão conta.
  - `@/lib/domain/planTree` (task 6): `debtBalance(account: Account, expenses: Expense[], day: string): number`.
  - Store (task 7): `addAccount({ group, name, openingBalanceBrl?, openingDate? }): Promise<Account | null>`, `updateAccount(id, { name?, archived?, openingBalanceBrl?: number | null, openingDate?: string | null }): Promise<boolean>`, `addBankAccount({ kind: "investment", … })`.
  - Task 8 (same wave): `EntryDialog({ …, initial?: EntryInitial })`; with `initial.kind === "yield"` it renders the YieldDialog.
- Produces:
  - `export type AccountPlace = "bank" | CapitalGroup | "expense" | "revenue";`
  - `NewAccountDialog({ open, onOpenChange, defaultPlace?: AccountPlace, defaultCategory?: ExpenseCategory })` — defaults `"expense"` / `"nutrition"`; "Banco ou caixa" + Continuar opens `BankAccountDialog` from inside; `onOpenChange(false)` fires once, when whichever dialog is showing closes.
  - `openingFromFields(amount: string, date: string): { openingBalanceBrl: number; openingDate: string } | null | string` (exported from `NewAccountDialog.tsx`; null = both blank, string = the message).

UI task: no component tests. Steps are implement → tsc → lint.

- [ ] **Step 1: Create `components/finance/plano/NewAccountDialog.tsx`**

```tsx
"use client";

/**
 * "Nova conta": where it sits in the plano — Banco ou caixa, Investimento,
 * Financiamento, Sócios, Despesa (with its grupo) or Receita — then its name.
 * A financiamento may take the saldo devedor it had on a day. "Banco ou
 * caixa" hands over to the conta bancária form (BankAccountDialog), rendered
 * from here so callers need nothing else.
 */
import { useState, type FormEvent } from "react";
import { Banknote, HandCoins, Landmark, Receipt, Tractor, Users, type LucideIcon } from "lucide-react";
import type { AccountGroup, CapitalGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS } from "@/lib/domain/accounts";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AccountPlace = "bank" | CapitalGroup | "expense" | "revenue";

const PLACES: readonly { place: AccountPlace; label: string; hint: string; Icon: LucideIcon }[] = [
  { place: "bank", label: "Banco ou caixa", hint: "conta corrente, caixa, cartão, aplicação · tem saldo", Icon: Landmark },
  { place: "investment", label: "Investimento", hint: "benfeitorias, máquinas, equipamentos · fora do custo", Icon: Tractor },
  { place: "financing", label: "Financiamento", hint: "empréstimo, consórcio · tem saldo devedor", Icon: HandCoins },
  { place: "partners", label: "Sócios", hint: "retiradas, distribuição de lucro, aportes", Icon: Users },
  { place: "expense", label: "Despesa", hint: "entra no custo (COE), dentro de um grupo", Icon: Receipt },
  { place: "revenue", label: "Receita", hint: "aluguel de pasto, serviços, outras entradas", Icon: Banknote },
];

const NAME_PLACEHOLDER: Record<Exclude<AccountPlace, "bank">, string> = {
  investment: "Ex.: Máquinas e implementos",
  financing: "Ex.: Consórcio trator",
  partners: "Ex.: Distribuição de lucro",
  expense: "Ex.: Sal mineral",
  revenue: "Ex.: Aluguel de pasto",
};

/**
 * Saldo devedor inicial of a financiamento and its day, both or neither:
 * null when both are blank, else the values or the message that stops them.
 */
export function openingFromFields(
  amount: string,
  date: string
): { openingBalanceBrl: number; openingDate: string } | null | string {
  const typed = amount.trim();
  if (typed === "" && date === "") return null;
  if (typed === "" || date === "") return "Informe o saldo e a data, ou deixe os dois em branco.";
  const openingBalanceBrl = parseAmount(typed);
  if (!Number.isFinite(openingBalanceBrl) || openingBalanceBrl < 0) {
    return "Informe o saldo devedor inicial (zero ou mais).";
  }
  return { openingBalanceBrl, openingDate: date };
}

export function NewAccountDialog({
  open,
  onOpenChange,
  defaultPlace = "expense",
  defaultCategory = "nutrition",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultPlace?: AccountPlace;
  defaultCategory?: ExpenseCategory;
}) {
  /** "Banco ou caixa" was confirmed: the conta bancária form takes over. */
  const [bank, setBank] = useState(false);
  const close = () => {
    setBank(false);
    onOpenChange(false);
  };
  return (
    <>
      <Dialog
        open={open && !bank}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>A conta aparece na árvore de Lançamentos, com o extrato dela.</DialogDescription>
          </DialogHeader>
          <NewAccountForm
            defaultPlace={defaultPlace}
            defaultCategory={defaultCategory}
            onBank={() => setBank(true)}
            onDone={close}
          />
        </DialogContent>
      </Dialog>
      {open && bank ? (
        <BankAccountDialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
        />
      ) : null}
    </>
  );
}

function NewAccountForm({
  defaultPlace,
  defaultCategory,
  onBank,
  onDone,
}: {
  defaultPlace: AccountPlace;
  defaultCategory: ExpenseCategory;
  onBank(): void;
  onDone(): void;
}) {
  const addAccount = useHerdStore((s) => s.addAccount);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (place === "bank") return onBank();
    const clean = name.trim();
    if (clean === "") return setError("Informe o nome da conta.");
    const start = place === "financing" ? openingFromFields(opening, openingDate) : null;
    if (typeof start === "string") return setError(start);
    const group: AccountGroup = place === "expense" ? category : place;
    setError(null);
    setBusy(true);
    let created;
    try {
      created = await addAccount({ group, name: clean, ...start });
    } catch {
      return; // apiFail already toasted
    } finally {
      setBusy(false);
    }
    if (!created) return setError("Já existe uma conta com esse nome");
    addToast({ messageType: "success", text: `Conta "${clean}" criada` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <span id="new-account-place" className="text-sm leading-none font-medium">
          Onde ela fica no plano
        </span>
        <div role="radiogroup" aria-labelledby="new-account-place" className="grid gap-2 sm:grid-cols-2">
          {PLACES.map(({ place: value, label, hint, Icon }) => {
            const selected = place === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setPlace(value);
                  setError(null);
                }}
                className={cn(
                  "flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--color-brand)]"
                    : "border-hairline bg-panel hover:bg-surface"
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-brand" : "text-ink-soft")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs text-ink-soft">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {place === "bank" ? (
        <p className="text-xs text-ink-soft">Continue para escolher entre conta corrente, caixa, cartão e aplicação.</p>
      ) : (
        <>
          {place === "expense" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="new-account-group">Grupo</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
                <SelectTrigger id="new-account-group" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {ACCOUNT_GROUP_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="new-account-name">Nome</Label>
            <Input
              id="new-account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDER[place]}
              className="min-h-11 md:min-h-0"
            />
          </div>
          {place === "financing" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="new-account-opening">Saldo devedor inicial (R$)</Label>
                  <Input
                    id="new-account-opening"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                    className="min-h-11 font-mono md:min-h-0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-account-opening-date">Em</Label>
                  <Input
                    id="new-account-opening-date"
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="min-h-11 font-mono md:min-h-0"
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-ink-soft">
                O que ainda faltava pagar nesse dia. Cada pagamento lançado depois baixa o saldo; cada liberação aumenta.
              </p>
            </>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={busy}>
          {place === "bank" ? "Continuar" : "Criar conta"}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

Notes: `...start` spreads `null` to nothing, so only a financiamento with both fields sends `openingBalanceBrl`/`openingDate`. The bank hand-off keeps the caller's `open` true while `BankAccountDialog` shows and calls `onOpenChange(false)` once it closes, so a caller that mounts `NewAccountDialog` conditionally still works.

- [ ] **Step 2: Plano de contas page**

Delete the old dialog (plain `rm`, nothing is staged):

Run: `rm components/finance/plano/AccountDialog.tsx`

Replace the whole file `components/finance/plano/AccountsPage.tsx` (task 1 already changed its `EXPENSE_GROUPS` import; this version supersedes it) with:

```tsx
"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside the fixed grupos.
 * Receitas (Venda de gado is automatic, from the manejos) and Fora do
 * resultado (Investimentos with the automatic Compra de gado, Financiamentos,
 * Sócios) on the left, Despesas (COE) on the right, one block per grupo. A
 * conta shows its last 12 months and lançamento count; a financiamento shows
 * its saldo devedor today instead, its saldo inicial under the name, and
 * edits the saldo inicial beside the name. A conta is never deleted:
 * archiving hides it from the form and keeps history.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Info, Pencil, Plus, Sparkles } from "lucide-react";
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, isCapitalKind, isInflow } from "@/lib/domain/entries";
import { debtBalance } from "@/lib/domain/planTree";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { defaultPeriod, inPeriod } from "@/lib/domain/period";
import { cn } from "@/lib/utils";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  NewAccountDialog,
  openingFromFields,
  type AccountPlace,
} from "@/components/finance/plano/NewAccountDialog";

/** Where the app writes into a grupo by itself, or what a grupo holds. */
const GROUP_HINT: Partial<Record<AccountGroup, string>> = {
  health: "Tratamentos com custo entram aqui sozinhos",
  breeding: "Compras de sêmen entram aqui sozinhas",
  investment: "Benfeitorias, máquinas e equipamentos",
  financing: "Empréstimos, financiamentos e consórcios",
  partners: "Retiradas, distribuição de lucro e aportes",
};

interface AccountStats {
  /** Last 12 months, a venda do bem or an aporte taken off; a financiamento's saldo devedor today. */
  amount: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<{ place: AccountPlace; category?: ExpenseCategory } | null>(null);

  const today = todayISO();
  const window12m = defaultPeriod(today);
  const stats = new Map<string, AccountStats>();
  for (const e of expenses) {
    if (!e.accountId) continue;
    const s = stats.get(e.accountId) ?? { amount: 0, count: 0 };
    if (!inPeriod(e.date, window12m)) continue;
    s.count += 1;
    s.amount += isCapitalKind(e.kind) && isInflow(e) ? -e.amountBrl : e.amountBrl;
    stats.set(e.accountId, s);
  }
  const byGroup = accountsByGroup(accounts, true);
  // A financiamento shows what is still owed today instead of its 12 months.
  for (const account of byGroup.financing) {
    stats.set(account.id, {
      amount: debtBalance(account, expenses, today),
      count: stats.get(account.id)?.count ?? 0,
    });
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
          subtitle="As contas de cada grupo. Os grupos não mudam: os de despesa formam o COE e os de fora do resultado não entram no custo; as contas são da fazenda."
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            canEdit ? (
              <>
                <Button variant="outline" className="min-h-11 md:min-h-0" onClick={() => void onSuggest()}>
                  <Sparkles data-icon="inline-start" aria-hidden />
                  Sugerir contas padrão
                </Button>
                <Button className="min-h-11 md:min-h-0" onClick={() => setAdding({ place: "expense" })}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Nova conta
                </Button>
              </>
            ) : undefined
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SectionCard
              title="Receitas"
              subtitle="Entradas de dinheiro além das vendas"
              action={canEdit ? <AddAccountButton onClick={() => setAdding({ place: "revenue" })} /> : null}
            >
              <ul className="-mx-4 -mt-4 divide-y divide-hairline">
                <AutomaticLine name="Venda de gado" className="px-4" />
              </ul>
              <AccountList accounts={byGroup.revenue} stats={stats} canEdit={canEdit} />
            </SectionCard>

            <SectionCard
              title="Fora do resultado"
              subtitle="Fora do custo (COE) · financiamentos mostram o saldo devedor de hoje"
            >
              <div className="-my-4 divide-y divide-hairline">
                {CAPITAL_GROUPS.map((group) => (
                  <GroupSection
                    key={group}
                    group={group}
                    onAdd={canEdit ? () => setAdding({ place: group }) : undefined}
                  >
                    {group === "investment" ? (
                      <ul className="mt-2 divide-y divide-hairline">
                        <AutomaticLine name="Compra de gado" />
                      </ul>
                    ) : null}
                    <AccountList
                      accounts={byGroup[group]}
                      stats={stats}
                      canEdit={canEdit}
                      empty="Sem contas — crie uma para lançar aqui"
                    />
                  </GroupSection>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Despesas (COE)" subtitle="Valores dos últimos 12 meses" className="lg:col-span-3">
            <div className="-my-4 divide-y divide-hairline">
              {EXPENSE_GROUPS.map((group) => (
                <GroupSection
                  key={group}
                  group={group}
                  onAdd={canEdit ? () => setAdding({ place: "expense", category: group }) : undefined}
                >
                  <AccountList accounts={byGroup[group]} stats={stats} canEdit={canEdit} />
                </GroupSection>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta com lançamentos não se apaga: arquive para tirá-la do formulário e manter o
            histórico. Renomear uma conta renomeia também os lançamentos antigos. Despesa ou receita
            sem conta fica só no grupo; investimento, financiamento e sócios sempre levam uma conta.
          </p>
        </div>
      </div>

      <NewAccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultPlace={adding?.place}
        defaultCategory={adding?.category}
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

/** A line the manejos write by themselves (Venda de gado, Compra de gado). */
function AutomaticLine({ name, className }: { name: string; className?: string }) {
  return (
    <li className={cn("flex min-h-11 items-center gap-2 py-2", className)}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
      <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
        automática
      </span>
    </li>
  );
}

/** One grupo inside a card: its name, its hint, "+ Conta" and what follows. */
function GroupSection({ group, onAdd, children }: { group: AccountGroup; onAdd?: () => void; children: ReactNode }) {
  return (
    <section className="py-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{ACCOUNT_GROUP_LABEL[group]}</h3>
          {GROUP_HINT[group] ? <p className="text-xs text-ink-soft">{GROUP_HINT[group]}</p> : null}
        </div>
        {onAdd ? <AddAccountButton onClick={onAdd} /> : null}
      </header>
      {children}
    </section>
  );
}

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  canEdit,
  empty = "Sem contas — lançamentos ficam só no grupo",
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  canEdit: boolean;
  /** What an empty grupo says. */
  empty?: string;
}) {
  const active = accounts.filter((a) => !a.archivedAt);
  const archived = accounts.filter((a) => a.archivedAt);
  return (
    <>
      {active.length === 0 ? (
        <p className="mt-2 text-xs text-ink-soft">{empty}</p>
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
  /** Renaming; a financiamento also edits its saldo devedor inicial and its day. */
  const [draft, setDraft] = useState<{ name: string; opening: string; openingDate: string } | null>(null);
  const archived = Boolean(account.archivedAt);
  const financing = account.group === "financing";
  const count = stats?.count ?? 0;

  function startEdit() {
    setDraft({
      name: account.name,
      opening: account.openingBalanceBrl === undefined ? "" : String(account.openingBalanceBrl).replace(".", ","),
      openingDate: account.openingDate ?? "",
    });
  }

  async function onSave() {
    if (!draft) return;
    const clean = draft.name.trim();
    const rename = clean !== "" && clean !== account.name;
    const opening = financing ? openingFromFields(draft.opening, draft.openingDate) : null;
    if (typeof opening === "string") {
      addToast({ messageType: "error", text: opening });
      return;
    }
    if (!rename && !financing) {
      setDraft(null);
      return;
    }
    const patch = {
      ...(rename ? { name: clean } : {}),
      // Both blank clears the saldo inicial.
      ...(financing ? (opening ?? { openingBalanceBrl: null, openingDate: null }) : {}),
    };
    if (!(await updateAccount(account.id, patch))) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: financing ? "Conta salva" : "Conta renomeada" });
    setDraft(null);
  }

  async function onArchive() {
    if (await updateAccount(account.id, { archived: !archived })) {
      addToast({ messageType: "success", text: archived ? "Conta restaurada" : "Conta arquivada" });
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void onSave();
    if (e.key === "Escape") setDraft(null);
  };

  if (draft !== null) {
    return (
      <li className="flex flex-wrap items-end gap-2 py-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${account.name}`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        {financing ? (
          <>
            <label className="grid gap-1 text-xs text-ink-soft">
              Saldo devedor inicial (R$)
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={draft.opening}
                onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
                onKeyDown={onKeyDown}
                className="min-h-11 w-36 font-mono md:min-h-8"
              />
            </label>
            <label className="grid gap-1 text-xs text-ink-soft">
              Em
              <Input
                type="date"
                value={draft.openingDate}
                onChange={(e) => setDraft({ ...draft, openingDate: e.target.value })}
                onKeyDown={onKeyDown}
                className="min-h-11 w-40 font-mono md:min-h-8"
              />
            </label>
          </>
        ) : null}
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onSave()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setDraft(null)}>
          Cancelar
        </Button>
      </li>
    );
  }

  const edit = financing ? "Editar" : "Renomear";
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className={cn("min-w-0 flex-1 basis-full text-sm break-words md:basis-0", archived ? "text-ink-soft" : "font-medium text-ink")}>
        {account.name}
        {financing && account.openingDate ? (
          <span className="block text-xs font-normal text-ink-soft">
            inicial {formatCurrency(account.openingBalanceBrl ?? 0)} em {formatDate(account.openingDate)}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-sm text-ink">{formatCurrency(stats?.amount ?? 0)}</span>
      <span className="w-24 text-right text-xs text-ink-soft">
        {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
      </span>
      {canEdit ? (
        <span className="ml-auto flex gap-1">
          {archived ? null : (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`${edit} ${account.name}`}
              title={edit}
              onClick={startEdit}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`${archived ? "Restaurar" : "Arquivar"} ${account.name}`}
            title={archived ? "Restaurar" : "Arquivar"}
            onClick={() => void onArchive()}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </Button>
        </span>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 3: Aplicação in Contas bancárias**

**3a.** `components/finance/contas/BankAccountDialog.tsx`

Replace:

```tsx
 * "Nova conta" / "Editar conta": a conta corrente, the farm's caixa or a
 * cartão. A cartão takes its fechamento and vencimento days and the conta
 * that pays it; the others take a saldo inicial on a date. Editing adds
 * Arquivar and Excluir (only a conta nothing points at).
```

with:

```tsx
 * "Nova conta" / "Editar conta": a conta corrente, the farm's caixa, a
 * cartão or an aplicação. A cartão takes its fechamento and vencimento days
 * and the conta that pays it; the others take a saldo inicial on a date. An
 * aplicação is never the conta principal. Editing adds Arquivar and Excluir
 * (only a conta nothing points at).
```

Replace:

```tsx
const KINDS: readonly BankAccountKind[] = ["checking", "cash", "card"];
```

with:

```tsx
const KINDS: readonly BankAccountKind[] = ["checking", "cash", "card", "investment"];

const NAME_PLACEHOLDER: Record<BankAccountKind, string> = {
  checking: "Sicredi",
  cash: "Caixa da fazenda",
  card: "Cartão Sicredi",
  investment: "Aplicação Sicredi",
};

/** "Pago por" starts on the conta principal: a conta corrente or the caixa, never a cartão or an aplicação. */
function mayBeMain(kind: BankAccountKind): boolean {
  return kind === "checking" || kind === "cash";
}
```

Replace:

```tsx
            Onde o dinheiro da fazenda fica: conta no banco, caixa em dinheiro ou cartão de crédito.
```

with:

```tsx
            Onde o dinheiro da fazenda fica: conta no banco, caixa em dinheiro, cartão de crédito ou aplicação.
```

Replace:

```tsx
  const first = !accounts.some((a) => a.kind !== "card");
```

with:

```tsx
  const first = !accounts.some((a) => mayBeMain(a.kind));
```

Replace:

```tsx
      ...(!card && fields.isMain ? { isMain: true } : {}),
```

with:

```tsx
      ...(mayBeMain(fields.kind) && fields.isMain ? { isMain: true } : {}),
```

Replace (four segments: on the phone the row scrolls sideways):

```tsx
      <div role="radiogroup" aria-label="Tipo" className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
```

with:

```tsx
      <div role="radiogroup" aria-label="Tipo" className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5">
```

Replace:

```tsx
              onClick={() => set({ kind, isMain: kind === "card" ? false : fields.isMain || first })}
```

with:

```tsx
              onClick={() => set({ kind, isMain: mayBeMain(kind) && (fields.isMain || first) })}
```

Replace:

```tsx
                "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors disabled:opacity-50 md:min-h-8",
```

with:

```tsx
                "flex min-h-11 shrink-0 grow items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors disabled:opacity-50 md:min-h-8",
```

Replace:

```tsx
            placeholder={card ? "Cartão Sicredi" : fields.kind === "cash" ? "Caixa da fazenda" : "Sicredi"}
```

with:

```tsx
            placeholder={NAME_PLACEHOLDER[fields.kind]}
```

Replace:

```tsx
      ) : (
        <>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
```

with:

```tsx
      ) : mayBeMain(fields.kind) ? (
        <>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
```

Replace:

```tsx
            <span className="text-xs text-ink-soft">· “Pago por” começa nela</span>
          </label>
        </>
      )}
```

with:

```tsx
            <span className="text-xs text-ink-soft">· “Pago por” começa nela</span>
          </label>
        </>
      ) : null}
```

(The saldo inicial block and its help line "O saldo no fim desse dia…" already apply to every kind but the cartão, so an aplicação gets them as a caixa does. The kind label comes from `BANK_ACCOUNT_KIND_LABEL.investment` = "Aplicação".)

**3b.** `components/finance/contas/AccountCard.tsx` (task 1 already added `PiggyBank`, `ICON.investment` and `DEFAULT_LABEL.investment`). An aplicação has no extrato, like the caixa; without this it would fall into the conta corrente's conciliação states.

Replace:

```tsx
        ) : account.kind === "cash" ? (
          <span>sem extrato</span>
```

with:

```tsx
        ) : account.kind === "cash" || account.kind === "investment" ? (
          <span>sem extrato</span>
```

**3c.** `components/finance/contas/ContasPage.tsx`

Replace:

```tsx
 * /finance/contas: how much money the farm has in each conta today, what is
 * owed on each cartão, and the movimentação of the conta picked.
```

with:

```tsx
 * /finance/contas: how much money the farm has in each conta and aplicação
 * today, what is owed on each cartão, and the movimentação of the conta
 * picked. An aplicação earns by "Lançar rendimento" and takes no extrato.
```

Replace:

```tsx
import { ArrowLeftRight, Landmark, Plus, Upload } from "lucide-react";
```

with:

```tsx
import { ArrowLeftRight, Landmark, Plus, TrendingUp, Upload } from "lucide-react";
```

Replace:

```tsx
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
```

with:

```tsx
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { EntryDialog } from "@/components/finance/EntryDialog";
```

Replace:

```tsx
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | "import" | null>(null);
```

with:

```tsx
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | "import" | "yield" | null>(null);
```

Replace:

```tsx
  const holding = active.filter((a) => a.kind !== "card").length;
```

with:

```tsx
  // "Saldo em contas" (bankTotal) takes contas correntes, caixas and aplicações; cartões stay out.
  const holding = active.filter((a) => a.kind === "checking" || a.kind === "cash").length;
  const applications = active.filter((a) => a.kind === "investment").length;
```

Replace:

```tsx
                {formatNumber(holding)} {holding === 1 ? "conta" : "contas"} · a fatura do cartão fica fora do saldo até ser paga
```

with:

```tsx
                {formatNumber(holding)} {holding === 1 ? "conta" : "contas"}
                {applications > 0
                  ? ` e ${formatNumber(applications)} ${applications === 1 ? "aplicação" : "aplicações"}`
                  : null}{" "}
                · a fatura do cartão fica fora do saldo até ser paga
```

(Reads "3 contas e 1 aplicação · a fatura do cartão fica fora do saldo até ser paga".)

Replace:

```tsx
            description="A conta do banco, o caixa em dinheiro e o cartão: o saldo de cada uma aparece aqui e o extrato do banco confere os lançamentos."
```

with:

```tsx
            description="A conta do banco, o caixa em dinheiro, o cartão e a aplicação: o saldo de cada uma aparece aqui e o extrato do banco confere os lançamentos."
```

Replace:

```tsx
              action={
                canEdit && selected.kind === "checking" && selected.archivedAt === undefined ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-8"
                    aria-label="Importar extrato (OFX/CSV)"
                    onClick={() => setDialog("import")}
                  >
                    <Upload aria-hidden />
                    {/* The phone keeps the card's title readable: the icon says it. */}
                    <span className="hidden sm:inline">Importar extrato (OFX/CSV)</span>
                  </Button>
                ) : undefined
              }
```

with:

```tsx
              action={
                !canEdit || selected.archivedAt !== undefined ? undefined : selected.kind === "checking" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-8"
                    aria-label="Importar extrato (OFX/CSV)"
                    onClick={() => setDialog("import")}
                  >
                    <Upload aria-hidden />
                    {/* The phone keeps the card's title readable: the icon says it. */}
                    <span className="hidden sm:inline">Importar extrato (OFX/CSV)</span>
                  </Button>
                ) : selected.kind === "investment" ? (
                  // An aplicação has no extrato: it earns by rendimento.
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-8"
                    aria-label="Lançar rendimento"
                    onClick={() => setDialog("yield")}
                  >
                    <TrendingUp aria-hidden />
                    <span className="hidden sm:inline">Lançar rendimento</span>
                  </Button>
                ) : undefined
              }
```

Replace:

```tsx
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
```

with:

```tsx
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
      {dialog === "yield" && selected ? (
        <EntryDialog open onOpenChange={() => setDialog(null)} initial={{ kind: "yield", bankAccountId: selected.id }} />
      ) : null}
```

"Saldo em contas" needs no change: `bankTotal` already sums every conta that is not a cartão, aplicações included.

- [ ] **Step 4: Types and lint**

Run: `grep -rn "plano/AccountDialog" app components lib` 
Expected: no output (nothing imports the deleted dialog).

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint components/finance/plano/NewAccountDialog.tsx components/finance/plano/AccountsPage.tsx components/finance/contas/BankAccountDialog.tsx components/finance/contas/AccountCard.tsx components/finance/contas/ContasPage.tsx`
Expected: lint clean; tsc clean, no error anywhere (verified with tasks 1–8 applied and 10–12 not yet). While task 8 is still in flight, `ContasPage.tsx` reports `Property 'initial' does not exist` on `EntryDialog`; that one clears when task 8 is done. If tasks 10–12 are mid-edit, an error in their own files is theirs.


### Task 10: Lançamentos page

**Files:**
- Create: `app/(app)/finance/lancamentos/page.tsx`
- Create: `components/finance/lancamentos/LancamentosPage.tsx`
- Create: `components/finance/lancamentos/PlanTreeNav.tsx`
- Create: `components/finance/lancamentos/NodePane.tsx`
- Create: `components/finance/lancamentos/legacySearch.ts`
- Modify: `app/(app)/finance/extrato/page.tsx` (becomes the redirect)
- Modify: `components/finance/FinanceSubnav.tsx`
- Modify: `lib/export/datasets/finance.ts` (adds `paneExportTable`)
- Test: `components/finance/lancamentos/__tests__/legacySearch.test.ts`
- Test: `lib/export/__tests__/paneExport.test.ts`

**Interfaces:**
- Consumes:
  - `@/lib/domain/planTree` (task 6): `PlanNode`, `PlanInputs`, `TreeItem`, `PaneRow`, `NodeSummary`, `FigureTone`, `nodeParam(node)`, `parseNode(param)`, `legacyNode({ tipo, grupo, conta })`, `planTree(inputs, period, todayIso)`, `nodeRows(node, inputs, period, todayIso)`, `filterPaneRows(rows, { lotId, pendingOnly, search })`, `nodeSummary(node, inputs, period, todayIso): NodeSummary | null`, `entryInitialFor(node, accounts, bankAccounts): EntryInitial` (pass `bankAccounts`, so Novo on an aplicação starts a rendimento).
  - `LedgerRow.inflow` (task 2), `BankAccountKind` with `"investment"` (task 1).
  - `EntryDialog({ open, onOpenChange, initial })` and `YieldDialog({ open, onOpenChange, bankAccountId })` (task 8).
  - `NewAccountDialog({ open, onOpenChange })` from `components/finance/plano/NewAccountDialog.tsx` (task 9).
  - `PaneRows({ node, rows, view, selectedId, onSelect, page, onPageChange })` and `LancamentosToolbar({ node, row, onPrint, onDone })` (task 11), exactly as the contract pins them.
  - Existing: `ExportMenu`, `useExportContext`, `usePrintStore`, `PeriodPicker`, `PageHeader`, `ReadOnlyPill`, `RequireAccess`, `TransferDialog`, `ImportDialog`, `EmptyState`.
- Produces:
  - `paneExportTable(rows: readonly PaneRow[], title: string): ExportTable` in `lib/export/datasets/finance.ts` (task 11's `RowSheet` prints one row with it).
  - `legacySearch(query: Record<string, string | string[] | undefined>): string` and `resolveNode(param: string | null, inputs: PlanInputs, period: Period, todayIso: string): { picked: PlanNode | null; node: PlanNode; summary: NodeSummary }` in `components/finance/lancamentos/legacySearch.ts`.
  - `FinanceSection = "painel" | "lancamentos" | "contas"`; the sub-navigation reads Painel · Lançamentos · Contas bancárias.
  - Routes: `/finance/lancamentos`; `/finance/extrato` redirects there.
  - Layout: the two columns start at `xl`. With the sidebar (`md:pl-60`) a 300 px tree leaves the pane too narrow below 1280 px, so phones and tablets alike show the tree until a nó is picked, then its pane with "Plano de contas" to go back (`max-xl:hidden` / `xl:hidden`). The header, the toolbar and the md+ table keep their `md` boundary.
  - `NodePane` renders `<PaneRows key={listKey} …/>`: `listKey` changes with the nó, the window and the filters, so the phone list starts over at 50 rows and its sheet closes (PaneRows keeps that state inside).

- [ ] **Step 1: Write the failing tests**

`components/finance/lancamentos/__tests__/legacySearch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/types";
import { legacyNode, nodeParam, type PlanInputs } from "@/lib/domain/planTree";
import { legacySearch, resolveNode } from "@/components/finance/lancamentos/legacySearch";

const query = (old: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(new URLSearchParams(legacySearch(old)));

describe("legacySearch", () => {
  it("keeps the window, the search and the lote, and drops the page", () => {
    expect(query({ de: "2025-10-01", ate: "2026-09-30", q: "nutron", lote: "lot-1", pagina: "3" })).toEqual({
      de: "2025-10-01",
      ate: "2026-09-30",
      q: "nutron",
      lote: "lot-1",
    });
  });

  it("turns a pending status into pendentes and drops the others", () => {
    for (const status of ["payable", "receivable", "overdue"]) {
      expect(query({ status })).toEqual({ status: "pendentes" });
    }
    for (const status of ["settled", "all", "nope"]) {
      expect(query({ status })).toEqual({});
    }
  });

  it("turns an old conta do plano into its nó", () => {
    expect(query({ conta: "acc-1" })).toEqual({ conta: "conta:acc-1" });
  });

  it("turns grupo=capital and tipo=treatment into the nó legacyNode picks", () => {
    // planTree.test pins which nó each one is; here, that the redirect carries it.
    for (const old of [{ grupo: "capital" }, { tipo: "treatment" }]) {
      const node = legacyNode(old);
      expect(node).not.toBeNull();
      expect(query(old)).toEqual({ conta: nodeParam(node!) });
    }
  });

  it("leaves the nó out for unknown values and gives nothing for an empty query", () => {
    expect(query({ tipo: "nope", grupo: "nope" })).toEqual({});
    expect(legacySearch({})).toBe("");
  });

  it("reads the first value of a repeated key", () => {
    expect(query({ q: ["boi", "vaca"] })).toEqual({ q: "boi" });
  });
});

const sal: Account = { id: "acc-1", group: "nutrition", name: "Sal mineral" };
const inputs: PlanInputs = {
  expenses: [],
  accounts: [sal],
  movements: [],
  manejoSessions: [],
  animals: [],
  treatments: [],
  lots: [],
  bankAccounts: [],
  transfers: [],
};
const period = { start: "2025-10-01", end: "2026-09-30" };
const TODAY = "2026-09-30";

describe("resolveNode", () => {
  it("falls back to todos when conta is absent, malformed or gone", () => {
    for (const param of [null, "", "nope", "banco:", "grupo:nope", "conta:deleted"]) {
      const resolved = resolveNode(param, inputs, period, TODAY);
      expect(resolved.picked).toBeNull();
      expect(resolved.node).toEqual({ type: "all" });
      expect(resolved.summary.figures).toHaveLength(4);
    }
  });

  it("picks a group and a conta that exist", () => {
    expect(resolveNode("despesas", inputs, period, TODAY).picked).toEqual({ type: "group", group: "expenses" });
    const conta = resolveNode("conta:acc-1", inputs, period, TODAY);
    expect(conta.picked).toEqual({ type: "account", id: "acc-1" });
    expect(conta.node).toEqual({ type: "account", id: "acc-1" });
    expect(conta.summary.title).toBe("Sal mineral");
  });
});
```

`lib/export/__tests__/paneExport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { withoutMoney } from "@/lib/export/table";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { PaneRow } from "@/lib/domain/planTree";

const ledger: LedgerRow = {
  id: "e1",
  kind: "expense",
  date: "2026-09-22",
  dueDate: "2026-10-22",
  paidAt: "2026-09-22",
  status: "paid",
  group: "nutrition",
  groupLabel: "Nutrição",
  account: "Ração e suplemento",
  bankAccountId: "b-1",
  counterparty: "Boleto Nutron",
  document: "NF 20.118",
  lotId: null,
  lotName: null,
  amountBrl: 4000,
  notes: null,
  locked: false,
  headCount: null,
  expense: null,
  inflow: false,
};

const boleto: PaneRow = {
  id: "e1",
  date: "2026-09-22",
  history: "Boleto Nutron",
  detail: "NF 20.118",
  contra: "Ração e suplemento",
  contraGroup: "Despesas › Nutrição",
  amountBrl: -4000,
  balance: 96204.75,
  ledger,
  transfer: null,
};

const aplicacao: PaneRow = {
  id: "t1",
  date: "2026-09-21",
  history: "Aplicação",
  detail: "transferência entre contas",
  contra: "Aplicação RDC Sicredi",
  contraGroup: "Bancos e caixa",
  amountBrl: -80000,
  balance: 100204.75,
  ledger: null,
  transfer: { id: "t1", fromId: "b-1", toId: "b-2", date: "2026-09-21", amountBrl: 80000 },
};

describe("paneExportTable", () => {
  it("writes the rows of a nó as shown: value signed, the saldo after each line", () => {
    const table = paneExportTable([boleto, aplicacao], "Sicredi");
    expect(table.title).toBe("Sicredi");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Histórico", undefined],
      ["Detalhe", undefined],
      ["Contra partida", undefined],
      ["Grupo", undefined],
      ["Vencimento", "date"],
      ["Lote", undefined],
      ["Valor (R$)", "money"],
      ["Saldo (R$)", "money"],
      ["Status", undefined],
    ]);
    expect(table.rows).toEqual([
      [
        "2026-09-22",
        "Boleto Nutron",
        "NF 20.118",
        "Ração e suplemento",
        "Despesas › Nutrição",
        "2026-10-22",
        "Fazenda",
        -4000,
        96204.75,
        "Pago",
      ],
      [
        "2026-09-21",
        "Aplicação",
        "transferência entre contas",
        "Aplicação RDC Sicredi",
        "Bancos e caixa",
        null,
        null,
        -80000,
        100204.75,
        null,
      ],
    ]);
  });

  it("drops Valor and Saldo when money is hidden", () => {
    const table = withoutMoney(paneExportTable([boleto], "Sicredi"), false);
    const headers = table.columns.map((c) => c.header);
    expect(headers).not.toContain("Valor (R$)");
    expect(headers).not.toContain("Saldo (R$)");
    expect(table.rows[0]).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run components/finance/lancamentos/__tests__/legacySearch.test.ts lib/export/__tests__/paneExport.test.ts`
Expected: FAIL — `legacySearch.test.ts` cannot resolve `@/components/finance/lancamentos/legacySearch`; `paneExport.test.ts` fails with `paneExportTable is not a function`.

- [ ] **Step 3: Implement**

**3a. `lib/export/datasets/finance.ts`** — two Replace blocks.

Replace:

```ts
import { buildTable, type ExportTable } from "@/lib/export/table";
```

with:

```ts
import type { PaneRow } from "@/lib/domain/planTree";
import { buildTable, type ExportTable } from "@/lib/export/table";
```

Replace:

```ts
interface IndicatorLine {
```

with:

```ts
/** The rows of a nó of Lançamentos as shown (filtered, newest first): value signed, saldo after each line when the nó keeps one. */
export function paneExportTable(rows: readonly PaneRow[], title: string): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.date },
      { header: "Histórico", value: (r) => r.history },
      { header: "Detalhe", value: (r) => r.detail },
      { header: "Contra partida", value: (r) => r.contra },
      { header: "Grupo", value: (r) => r.contraGroup },
      { header: "Vencimento", kind: "date", value: (r) => r.ledger?.dueDate ?? null },
      { header: "Lote", value: (r) => (r.ledger ? (r.ledger.lotName ?? "Fazenda") : null) },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "Saldo (R$)", kind: "money", value: (r) => r.balance },
      { header: "Status", value: (r) => (r.ledger ? LEDGER_STATUS_LABEL[r.ledger.status] : null) },
    ],
    rows
  );
}

interface IndicatorLine {
```

**3b. Create `components/finance/lancamentos/legacySearch.ts`:**

```ts
/**
 * What the URL's query means to Lançamentos: the nó `conta` picks, and the old
 * Extrato's query (its links and bookmarks) turned into this page's. Pure: the
 * page, the redirect and the tests call it.
 */
import type { Period } from "@/lib/domain/period";
import {
  legacyNode,
  nodeParam,
  nodeSummary,
  parseNode,
  type NodeSummary,
  type PlanInputs,
  type PlanNode,
} from "@/lib/domain/planTree";

const ALL: PlanNode = { type: "all" };
/** The old filters that keep their key and value. */
const KEPT = ["de", "ate", "q", "lote"] as const;
/** The old status choices that meant a pending lançamento. */
const PENDING = ["payable", "receivable", "overdue"];

export interface ResolvedNode {
  /** The nó of the URL; null when it is absent, malformed or gone. */
  picked: PlanNode | null;
  /** What the pane shows: the nó picked, else "todos". */
  node: PlanNode;
  summary: NodeSummary;
}

/** The nó of `conta`. One that is malformed or no longer exists reads as none, and the pane shows "todos". */
export function resolveNode(param: string | null, inputs: PlanInputs, period: Period, todayIso: string): ResolvedNode {
  const parsed = parseNode(param);
  const summary = parsed ? nodeSummary(parsed, inputs, period, todayIso) : null;
  if (parsed && summary) return { picked: parsed, node: parsed, summary };
  // "todos" always exists.
  return { picked: null, node: ALL, summary: nodeSummary(ALL, inputs, period, todayIso)! };
}

/**
 * The old Extrato's query as this page's: the window, the search and the lote
 * stay; a pending status ("a pagar", "a receber", "vencidas") becomes
 * "pendentes" and any other goes; tipo, grupo and conta become the nó.
 */
export function legacySearch(query: Record<string, string | string[] | undefined>): string {
  // A repeated key keeps its first value.
  const one = (key: string): string | null => [query[key]].flat()[0] ?? null;
  const next = new URLSearchParams();
  for (const key of KEPT) {
    const value = one(key);
    if (value) next.set(key, value);
  }
  const node = legacyNode({ tipo: one("tipo"), grupo: one("grupo"), conta: one("conta") });
  if (node) next.set("conta", nodeParam(node));
  if (PENDING.includes(one("status") ?? "")) next.set("status", "pendentes");
  return next.toString();
}
```

**3c. `app/(app)/finance/extrato/page.tsx`** — Replace the whole file with (a Server Component: `searchParams` is a promise, `redirect` throws, per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `04-functions/redirect.md`):

```tsx
import { redirect } from "next/navigation";
import { legacySearch } from "@/components/finance/lancamentos/legacySearch";

/** The old Extrato: its links and bookmarks land on Lançamentos with the same window and filters. */
export default async function ExtratoRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = legacySearch(await searchParams);
  redirect(query ? `/finance/lancamentos?${query}` : "/finance/lancamentos");
}
```

**3d. `components/finance/FinanceSubnav.tsx`** — two Replace blocks. (Its callers pass `"painel"` and `"contas"`, unchanged; the only `"extrato"` caller is `components/finance/extrato/ExtratoPage.tsx`, which task 11 deletes.)

Replace:

```ts
export type FinanceSection = "painel" | "extrato" | "contas";
```

with:

```ts
export type FinanceSection = "painel" | "lancamentos" | "contas";
```

Replace:

```ts
  { key: "extrato", label: "Extrato", href: "/finance/extrato" },
```

with:

```ts
  { key: "lancamentos", label: "Lançamentos", href: "/finance/lancamentos" },
```

**3e. Create `app/(app)/finance/lancamentos/page.tsx`:**

```tsx
"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { LancamentosPage } from "@/components/finance/lancamentos/LancamentosPage";

// The nó, the window and the filters live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function LancamentosRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <LancamentosPage />
      </Suspense>
    </RequireAccess>
  );
}
```

**3f. Create `components/finance/lancamentos/LancamentosPage.tsx`:**

```tsx
"use client";

/**
 * /finance/lancamentos: the plano de contas as a tree on the left and, on the
 * right, the nó picked in it with its figures and its lançamentos, under one
 * toolbar that acts on the lançamento picked in the list. The nó, the window,
 * the view and the filters live in the URL query (conta, de, ate, visao, lote,
 * status, q, pagina), so the Painel's links land on a nó and reloading keeps
 * it. Below xl (phones, tablets) the two columns do not fit: the page is the
 * tree until a nó is picked, then its pane.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch, type Period } from "@/lib/domain/period";
import {
  entryInitialFor,
  filterPaneRows,
  nodeParam,
  nodeRows,
  planTree,
  type PlanInputs,
  type PlanNode,
} from "@/lib/domain/planTree";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useExportContext } from "@/components/export/useExportContext";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { resolveNode } from "@/components/finance/lancamentos/legacySearch";
import { LancamentosToolbar } from "@/components/finance/lancamentos/LancamentosToolbar";
import { NodePane } from "@/components/finance/lancamentos/NodePane";
import { PlanTreeNav } from "@/components/finance/lancamentos/PlanTreeNav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALL: PlanNode = { type: "all" };

const lancamentos = (n: number): string => (n === 1 ? "1 lançamento" : `${formatNumber(n)} lançamentos`);

export function LancamentosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const today = todayISO();
  const canEdit = useCan("finance", "edit");
  const print = usePrintStore((s) => s.print);
  const exportContext = useExportContext();

  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const inputs = useMemo<PlanInputs>(
    () => ({ expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers }),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers]
  );

  const params = useMemo(() => new URLSearchParams(query), [query]);
  const period = useMemo(() => periodFromSearch(params, today), [params, today]);
  const view = params.get("visao") === "detalhado" ? "detalhado" : "extrato";
  const lotId = params.get("lote") || "all";
  const pendingOnly = params.get("status") === "pendentes";
  const search = params.get("q")?.trim() ?? "";
  const pageNumber = Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1);

  // A nó that is malformed or gone reads as none: "todos" on md+, the tree on a phone.
  const { picked, node, summary } = useMemo(
    () => resolveNode(params.get("conta"), inputs, period, today),
    [params, inputs, period, today]
  );
  const tree = useMemo(() => planTree(inputs, period, today), [inputs, period, today]);
  const rows = useMemo(() => nodeRows(node, inputs, period, today), [node, inputs, period, today]);
  const allCount = useMemo(
    () => (node.type === "all" ? rows.length : nodeRows(ALL, inputs, period, today).length),
    [node, rows, inputs, period, today]
  );
  const shown = useMemo(
    () => filterPaneRows(rows, { lotId, pendingOnly, search }),
    [rows, lotId, pendingOnly, search]
  );
  const lotOptions = lots.filter((lot) => !lot.deletedAt || rows.some((row) => row.ledger?.lotId === lot.id));

  // The picked row belongs to one nó, window and filter set: changing any of them drops it.
  const scope = [nodeParam(node), period.start, period.end, lotId, pendingOnly, search].join("|");
  const [selection, setSelection] = useState<{ id: string; scope: string } | null>(null);
  const selectedRow = selection?.scope === scope ? (shown.find((row) => row.id === selection.id) ?? null) : null;
  const [entering, setEntering] = useState(false);

  /** The URL with `changes` merged in; defaults leave it, and all but a page change go back to page 1. */
  const hrefWith = (changes: Record<string, string | undefined>): string => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === "" || value === "all" || (key === "pagina" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!("pagina" in changes)) next.delete("pagina");
    const nextQuery = next.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  };
  const setParams = (changes: Record<string, string | undefined>) =>
    router.replace(hrefWith(changes), { scroll: false });
  const setPeriod = (next: Period) => setParams({ de: next.start, ate: next.end });

  const lotLabel = lotId === "farm" ? "Fazenda (sem lote)" : (lots.find((lot) => lot.id === lotId)?.name ?? "—");
  const filters = [
    `Período: ${formatDate(period.start)} a ${formatDate(period.end)}`,
    `Conta: ${summary.crumb ? `${summary.crumb} › ` : ""}${summary.title}`,
    ...(lotId === "all" ? [] : [`Lote: ${lotLabel}`]),
    ...(pendingOnly ? ["Só pendentes"] : []),
    ...(search ? [`Busca: “${search}”`] : []),
  ];
  // Imprimir of the toolbar: the rows on screen, through the print sheet Exportar uses.
  const printRows = () =>
    print({
      title: summary.title,
      subtitle: lancamentos(shown.length),
      tables: [paneExportTable(shown, summary.title)],
      context: exportContext(filters),
    });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <div className={cn("flex flex-col gap-4", picked && "max-md:hidden")}>
        <PageHeader
          title="Lançamentos"
          subtitle="A conta escolhida no plano de contas mostra o saldo e o extrato dela"
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            <>
              <div className="hidden md:block">
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>
              {shown.length > 0 ? (
                <ExportMenu
                  title="Lançamentos"
                  className="hidden md:inline-flex"
                  formats={["xlsx", "csv", "print"]}
                  current={{
                    label: summary.title,
                    detail: lancamentos(shown.length),
                    filters,
                    build: () => [paneExportTable(shown, summary.title)],
                  }}
                />
              ) : null}
            </>
          }
        />
        <FinanceSubnav current="lancamentos" period={period} />
        {/* PeriodPicker is inline-flex: full width on a phone. */}
        <div className="md:hidden [&_input]:flex-1 [&>div]:flex [&>div]:w-full">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <LancamentosToolbar node={node} row={selectedRow} onPrint={printRows} onDone={() => setSelection(null)} />

      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PlanTreeNav
          className={cn(picked && "max-xl:hidden")}
          tree={tree}
          allCount={allCount}
          selectedKey={nodeParam(node)}
          hrefFor={(target) => hrefWith({ conta: nodeParam(target) })}
          period={period}
          canEdit={canEdit}
        />
        <div className={cn("flex min-w-0 flex-col gap-3", !picked && "max-xl:hidden")}>
          <Link
            href={hrefWith({ conta: "" })}
            className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand xl:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Plano de contas
          </Link>
          <NodePane
            node={node}
            summary={summary}
            rows={shown}
            total={rows.length}
            view={view}
            lotId={lotId}
            pendingOnly={pendingOnly}
            search={search}
            lots={lotOptions}
            page={pageNumber}
            selectedId={selectedRow?.id ?? null}
            listKey={scope}
            canEdit={canEdit}
            onChange={setParams}
            onSelect={(id) => setSelection(id === null ? null : { id, scope })}
          />
        </div>
      </div>

      {canEdit ? (
        <>
          {/* The phone's "Lançar" over the tab bar; md+ has Novo in the toolbar. */}
          <Button
            onClick={() => setEntering(true)}
            className="fixed right-4 bottom-24 z-30 h-12 gap-2 rounded-full px-[18px] text-[15px] shadow-lg md:hidden"
          >
            <Plus className="size-[18px]" aria-hidden />
            Lançar
          </Button>
          {entering ? (
            <EntryDialog open onOpenChange={setEntering} initial={entryInitialFor(node, accounts, bankAccounts)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
```

Note: the toolbar is rendered for every member who reaches the page (it is `md:flex` only inside task 11's component, and without Financeiro edit it holds only Ver anexos and Imprimir), so a member at view keeps the anexos the old Extrato's row actions gave them.

**3g. Create `components/finance/lancamentos/PlanTreeNav.tsx`:**

```tsx
"use client";

/**
 * The plano de contas, the left column of Lançamentos: a search by name,
 * "Todos os lançamentos" and the six groups with their figure for the window.
 * Each row is a link that picks its nó (the URL's `conta`); the groups and the
 * grupos of Despesas open and close in place, the path to the picked nó
 * starting open. "+" opens Nova conta and the gear goes to Configurações.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  CreditCard,
  HandCoins,
  Landmark,
  ListTree,
  Lock,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Settings2,
  Tractor,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { BankAccountKind } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { nodeParam, type PlanNode, type TreeItem } from "@/lib/domain/planTree";
import { NewAccountDialog } from "@/components/finance/plano/NewAccountDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The six top groups, by their `conta` value. */
const GROUP_ICON: Record<string, LucideIcon> = {
  bancos: Landmark,
  investimentos: Tractor,
  financiamentos: HandCoins,
  socios: Users,
  despesas: Receipt,
  receitas: Banknote,
};
const BANK_ICON: Record<BankAccountKind, LucideIcon> = {
  checking: Landmark,
  cash: Wallet,
  card: CreditCard,
  investment: PiggyBank,
};
/** 6 px, then 18 px a level: group › grupo › conta. */
const INDENT = ["pl-1.5", "pl-6", "pl-[42px]"];
const ALL: PlanNode = { type: "all" };
const ALL_KEY = nodeParam(ALL);
const SELECTED = "bg-brand-soft font-medium ring-1 ring-brand/30 ring-inset";

/** Lower case without accents, so "socios" finds "Sócios". */
const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The items whose name has `term`, with the groups above them; a match keeps all it holds. */
function filterTree(items: TreeItem[], term: string): TreeItem[] {
  return items.flatMap((item) => {
    if (fold(item.label).includes(term)) return [item];
    const children = item.children ? filterTree(item.children, term) : [];
    return children.length > 0 ? [{ ...item, children }] : [];
  });
}

/** Keys of the items above `key`, top first; null when it is not in the tree. */
function pathTo(items: TreeItem[], key: string): string[] | null {
  for (const item of items) {
    if (item.key === key) return [];
    const below = item.children ? pathTo(item.children, key) : null;
    if (below) return [item.key, ...below];
  }
  return null;
}

/** "84.312", "−3.240"; "—" for zero. */
function figure(value: number): string {
  if (Math.round(value) === 0) return "—";
  return `${value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}`;
}

function LockMark() {
  return (
    <span title="do manejo, automático" className="inline-flex shrink-0 text-ink-soft">
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">do manejo, automático</span>
    </span>
  );
}

interface TreeRowProps {
  item: TreeItem;
  depth: number;
  expanded: boolean;
  selected: boolean;
  href: string;
  onToggle(): void;
  onPick(): void;
}

function TreeRow({ item, depth, expanded, selected, href, onToggle, onPick }: TreeRowProps) {
  const top = depth === 0;
  const Icon = top ? GROUP_ICON[item.key] : item.bankKind ? BANK_ICON[item.bankKind] : undefined;
  return (
    <div className={cn("flex items-center rounded-lg", INDENT[Math.min(depth, 2)], selected && SELECTED)}>
      {item.children ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Fechar" : "Abrir"} ${item.label}`}
          disabled={item.children.length === 0}
          onClick={onToggle}
          className="flex h-11 w-6 shrink-0 items-center justify-center rounded-md text-ink-soft hover:text-ink disabled:opacity-60 md:h-[30px] md:w-5"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
      ) : (
        <span aria-hidden className="w-6 shrink-0 md:w-5" />
      )}
      <Link
        href={href}
        onClick={onPick}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-1.5 pr-2 text-[15px] md:min-h-[30px] md:text-sm",
          item.archived ? "text-ink-soft" : "text-ink",
          top && "font-semibold"
        )}
      >
        {Icon ? (
          <Icon className={cn("size-3.5 shrink-0", top || selected ? "text-brand" : "text-ink-soft")} aria-hidden />
        ) : null}
        <span className="truncate">{item.label}</span>
        {item.locked ? <LockMark /> : null}
        {item.tag ? (
          <span className="shrink-0 text-[10px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase">
            {item.tag}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto pl-2 font-mono text-xs whitespace-nowrap tabular-nums",
            Math.round(item.amountBrl) === 0 ? "text-ink-soft" : "text-ink",
            top && "font-medium"
          )}
        >
          {figure(item.amountBrl)}
        </span>
      </Link>
    </div>
  );
}

interface PlanTreeNavProps {
  tree: TreeItem[];
  /** Rows of "Todos os lançamentos" in the window. */
  allCount: number;
  /** `nodeParam` of the nó on screen. */
  selectedKey: string;
  hrefFor(node: PlanNode): string;
  period: Period;
  canEdit: boolean;
  className?: string;
}

export function PlanTreeNav({ tree, allCount, selectedKey, hrefFor, period, canEdit, className }: PlanTreeNavProps) {
  // Every top group starts open, plus the grupo that holds the picked nó.
  const [open, setOpen] = useState(
    () => new Set([...tree.map((item) => item.key), ...(pathTo(tree, selectedKey) ?? [])])
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const term = fold(query.trim());
  const items = term ? filterTree(tree, term) : tree;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const reveal = (key: string) => setOpen((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const list = (level: TreeItem[], depth: number): ReactNode => (
    <ul className="flex flex-col gap-px">
      {level.map((item) => {
        // A search opens everything it kept.
        const expanded = item.children !== undefined && (term !== "" || open.has(item.key));
        return (
          <li
            key={item.key}
            className={cn(depth === 0 && "mt-1.5 border-t border-hairline pt-1.5 first:mt-0 first:border-t-0 first:pt-0")}
          >
            <TreeRow
              item={item}
              depth={depth}
              expanded={expanded}
              selected={item.key === selectedKey}
              href={hrefFor(item.node)}
              onToggle={() => toggle(item.key)}
              onPick={() => reveal(item.key)}
            />
            {expanded && item.children?.length ? list(item.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      aria-labelledby="plan-tree-title"
      className={cn("overflow-hidden rounded-lg border border-hairline bg-panel", className)}
    >
      <header className="hidden items-center justify-between gap-2 border-b border-hairline py-2 pr-2 pl-4 md:flex">
        <h2 id="plan-tree-title" className="font-heading text-base font-semibold text-ink">
          Plano de contas
        </h2>
        {canEdit ? (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Nova conta"
              title="Nova conta"
              className="text-ink-soft"
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="text-ink-soft" asChild>
              <Link href="/settings/plano-de-contas" aria-label="Gerenciar o plano de contas" title="Gerenciar o plano de contas">
                <Settings2 aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 p-1.5 md:px-2 md:pt-2.5 md:pb-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-soft"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conta"
            aria-label="Buscar conta"
            className="h-11 pl-8 md:h-8"
          />
        </div>
        <div>
          <Link
            href={hrefFor(ALL)}
            aria-current={selectedKey === ALL_KEY ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-lg pr-2 pl-1.5 text-[15px] text-ink md:min-h-[30px] md:text-sm",
              selectedKey === ALL_KEY && SELECTED
            )}
          >
            <ListTree className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
            Todos os lançamentos
            <span className="ml-auto font-mono text-xs text-ink-soft tabular-nums">{formatNumber(allCount)}</span>
          </Link>
          <div aria-hidden className="mx-1 my-1.5 h-px bg-hairline" />
          {items.length > 0 ? (
            list(items, 0)
          ) : (
            <p className="px-2 py-3 text-sm text-ink-soft">Nenhuma conta com esse nome.</p>
          )}
        </div>
      </div>

      <p className="hidden border-t border-hairline bg-surface px-4 py-2 text-[11px] leading-4 text-ink-soft md:block">
        Valores de {formatDate(period.start)} a {formatDate(period.end)} ·{" "}
        <Lock className="inline size-3 align-[-2px]" aria-hidden /> entra sozinho pelos manejos
      </p>

      {creating ? <NewAccountDialog open onOpenChange={setCreating} /> : null}
    </section>
  );
}
```

**3h. Create `components/finance/lancamentos/NodePane.tsx`:**

```tsx
"use client";

/**
 * The right column of Lançamentos: where the nó sits, its name and kind, its
 * own actions (a conta bancária transfers and imports its extrato, an
 * aplicação takes its rendimento), the strip of four figures, the "% quitado"
 * of a financiamento, then Extrato | Detalhado, the filters and the rows. On a
 * phone it drops the card and the filters.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, Receipt, Search, SearchX, TrendingUp, Upload } from "lucide-react";
import type { Lot } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/domain/format";
import type { FigureTone, NodeSummary, PaneRow, PlanNode } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { YieldDialog } from "@/components/finance/YieldDialog";
import { ImportDialog } from "@/components/finance/contas/ImportDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { PaneRows } from "@/components/finance/lancamentos/PaneRows";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TONE: Record<FigureTone, string> = {
  ink: "text-ink",
  healthy: "text-healthy",
  attention: "text-attention",
  overdue: "text-overdue",
  scheduled: "text-scheduled",
};

const PILL_TONE: Record<NodeSummary["pills"][number]["tone"], string> = {
  muted: "bg-surface text-ink-soft",
  brand: "bg-brand-soft text-brand",
  scheduled: "bg-scheduled-soft text-scheduled",
  fmd: "bg-fmd-soft text-fmd",
};

const VIEWS = [
  { view: "extrato", label: "Extrato" },
  { view: "detalhado", label: "Detalhado" },
] as const;

const SEARCH_DELAY_MS = 300;
const ACTION = "min-h-11 md:min-h-8";

/** The URL keys the pane writes. */
type PaneKey = "visao" | "lote" | "status" | "q" | "pagina";

interface NodePaneProps {
  node: PlanNode;
  summary: NodeSummary;
  /** The rows after the filters. */
  rows: PaneRow[];
  /** The nó's rows in the window before the filters. */
  total: number;
  view: "extrato" | "detalhado";
  lotId: string;
  pendingOnly: boolean;
  search: string;
  /** The lotes offered: the active ones plus removed ones the rows name. */
  lots: Lot[];
  page: number;
  selectedId: string | null;
  /** Changes with the nó, the window and the filters: the phone list starts over. */
  listKey: string;
  canEdit: boolean;
  onChange(changes: Partial<Record<PaneKey, string>>): void;
  onSelect(id: string | null): void;
}

export function NodePane({
  node,
  summary,
  rows,
  total,
  view,
  lotId,
  pendingOnly,
  search,
  lots,
  page,
  selectedId,
  listKey,
  canEdit,
  onChange,
  onSelect,
}: NodePaneProps) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const [dialog, setDialog] = useState<"transfer" | "import" | "yield" | null>(null);
  // The conta bancária of the nó, while the user may move money in it.
  const bank = canEdit && summary.bank?.archivedAt === undefined ? summary.bank : undefined;
  const canTransfer = bankAccounts.filter((a) => a.archivedAt === undefined).length > 1;
  const quitado = summary.paidShare === undefined ? null : Math.round(summary.paidShare * 100);

  return (
    <section
      aria-labelledby="node-pane-title"
      className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-hairline md:bg-panel"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:border-b md:border-hairline md:px-4 md:py-3">
        <div className="min-w-0">
          {summary.crumb ? <p className="text-xs text-ink-soft">{summary.crumb}</p> : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2
              id="node-pane-title"
              className="font-heading text-[22px] leading-7 font-semibold text-ink md:text-lg md:leading-[26px]"
            >
              {summary.title}
            </h2>
            {summary.pills.map((pill) => (
              <span
                key={pill.text}
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                  PILL_TONE[pill.tone]
                )}
              >
                {pill.text}
              </span>
            ))}
          </div>
          {summary.bank?.label ? <p className="mt-0.5 text-xs text-ink-soft">{summary.bank.label}</p> : null}
        </div>
        {bank ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canTransfer ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("transfer")}>
                <ArrowLeftRight aria-hidden />
                Transferir
              </Button>
            ) : null}
            {bank.kind === "checking" ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("import")}>
                <Upload aria-hidden />
                Importar extrato
              </Button>
            ) : null}
            {bank.kind === "investment" ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("yield")}>
                <TrendingUp aria-hidden />
                Lançar rendimento
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:rounded-none md:border-x-0 md:border-t-0 lg:grid-cols-4">
        {summary.figures.map((figure) => (
          <div key={figure.label} className="min-w-0 bg-panel px-4 py-3">
            <dt className="truncate text-[11px] font-medium tracking-wide text-ink-soft uppercase">{figure.label}</dt>
            <dd
              className={cn(
                "mt-1 truncate font-mono text-base font-medium tabular-nums md:text-[17px]",
                TONE[figure.tone]
              )}
            >
              {figure.text ?? (figure.amountBrl === null ? "—" : formatCurrency(figure.amountBrl))}
            </dd>
            {/* The sub wraps: "3 compras · pela data da compra" is cut in a narrow cell otherwise. */}
            <dd className="mt-0.5 text-[11px] leading-4 text-ink-soft">{figure.sub}</dd>
          </div>
        ))}
      </dl>

      {quitado !== null ? (
        <div className="flex items-center gap-3 md:border-b md:border-hairline md:px-4 md:py-2.5">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quitado}
            aria-label={`${formatPercent(quitado)} quitado`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface ring-1 ring-hairline ring-inset"
          >
            <div className="h-full bg-brand" style={{ width: `${quitado}%` }} />
          </div>
          <span className="text-xs whitespace-nowrap text-ink-soft">
            <span className="font-mono font-medium text-ink">{formatPercent(quitado)}</span> quitado
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 md:border-b md:border-hairline md:px-4 md:py-2.5">
        <div
          role="radiogroup"
          aria-label="Visão"
          className="flex flex-1 items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5 md:flex-none"
        >
          {VIEWS.map((option) => (
            <button
              key={option.view}
              type="button"
              role="radio"
              aria-checked={view === option.view}
              onClick={() => onChange({ visao: option.view === "detalhado" ? option.view : "" })}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8 md:flex-none",
                view === option.view
                  ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="hidden flex-wrap items-center gap-3 md:flex">
          <Select value={lotId} onValueChange={(lote) => onChange({ lote })}>
            <SelectTrigger aria-label="Filtrar por lote" className="font-medium">
              <span className="flex min-w-0 items-center gap-1">
                <span className="text-ink-soft">Lote:</span>
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">todos</SelectItem>
              <SelectItem value="farm">Fazenda (sem lote)</SelectItem>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.deletedAt ? `${lot.name} (removido)` : lot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-ink">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(event) => onChange({ status: event.target.checked ? "pendentes" : "" })}
              className="size-4 accent-brand"
            />
            Só pendentes
          </label>
          <SearchField value={search} onSearch={(q) => onChange({ q })} />
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-hairline bg-panel md:rounded-none md:border-0">
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento no período"
            description={
              canEdit
                ? "Lance o primeiro nesta conta, ou escolha outro período."
                : "Escolha outro período para ver os lançamentos."
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8 md:rounded-none md:border-0">
          <EmptyState
            icon={SearchX}
            title="Nada com esses filtros"
            description="Nenhum lançamento desta conta passa pelos filtros escolhidos."
            className="pb-4"
          />
          <Button
            variant="outline"
            className="min-h-11 md:min-h-8"
            onClick={() => onChange({ lote: "all", status: "", q: "" })}
          >
            Limpar filtros
          </Button>
        </div>
      ) : (
        <PaneRows
          key={listKey}
          node={node}
          rows={rows}
          view={view}
          selectedId={selectedId}
          onSelect={onSelect}
          page={page}
          onPageChange={(next) => onChange({ pagina: String(next) })}
        />
      )}

      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={bank?.id} />
      ) : null}
      {dialog === "import" && bank ? <ImportDialog account={bank} onOpenChange={() => setDialog(null)} /> : null}
      {dialog === "yield" && bank ? (
        <YieldDialog open onOpenChange={() => setDialog(null)} bankAccountId={bank.id} />
      ) : null}
    </section>
  );
}

/** Types into local state; `q` in the URL catches up 300 ms after the last key. */
function SearchField({ value, onSearch }: { value: string; onSearch(q: string): void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // The URL's q changed elsewhere ("Limpar filtros"): the box follows it.
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
    <div className="relative w-48">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-soft"
      />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Buscar no histórico"
        aria-label="Buscar no histórico, documento ou contra partida"
        className="h-8 pl-8"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run components/finance/lancamentos/__tests__/legacySearch.test.ts lib/export/__tests__/paneExport.test.ts lib/export/__tests__/finance.test.ts`
Expected: PASS

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint "app/(app)/finance/lancamentos/page.tsx" "app/(app)/finance/extrato/page.tsx" components/finance/lancamentos/LancamentosPage.tsx components/finance/lancamentos/PlanTreeNav.tsx components/finance/lancamentos/NodePane.tsx components/finance/lancamentos/legacySearch.ts components/finance/lancamentos/__tests__/legacySearch.test.ts components/finance/FinanceSubnav.tsx lib/export/datasets/finance.ts lib/export/__tests__/paneExport.test.ts`
Expected: lint clean. With tasks 1–9 in and task 11 not yet, tsc reports exactly these four errors, all gone once task 11 lands:
- `components/finance/lancamentos/LancamentosPage.tsx`: Cannot find module `@/components/finance/lancamentos/LancamentosToolbar`.
- `components/finance/lancamentos/NodePane.tsx`: Cannot find module `@/components/finance/lancamentos/PaneRows`, and `Parameter 'next' implicitly has an 'any' type` (the `onPageChange` of that missing component).
- `components/finance/extrato/ExtratoPage.tsx`: `Type '"extrato"' is not assignable to type 'FinanceSection'` (task 11 deletes that file).


### Task 11: Rows and toolbar

**Files:**
- Create: `components/finance/lancamentos/pills.tsx`
- Create: `components/finance/lancamentos/useEntryActions.tsx`
- Create: `components/finance/lancamentos/SplitDialog.tsx`
- Create: `components/finance/lancamentos/RowSheet.tsx`
- Create: `components/finance/lancamentos/PaneRows.tsx`
- Create: `components/finance/lancamentos/LancamentosToolbar.tsx`
- Create: `components/ui/bottom-sheet.ts`
- Modify: `components/offline/SyncSheet.tsx` (imports `BOTTOM_SHEET` from `components/ui/bottom-sheet`)
- Modify: `components/finance/RepeatSection.tsx` (one word: `export` on `InstallmentPreview`, so Parcelar shows the same list of parcelas; no other task owns this file)
- Delete: `components/finance/extrato/ExtratoFilters.tsx`, `components/finance/extrato/ExtratoList.tsx`, `components/finance/extrato/ExtratoPage.tsx`, `components/finance/extrato/ExtratoSummary.tsx`, `components/finance/extrato/ExtratoTable.tsx`, `components/finance/extrato/RowActions.tsx`
- Test: `components/finance/lancamentos/__tests__/entryActions.test.ts`

Outside `components/finance/extrato/`, the only importer of it is `components/offline/SyncSheet.tsx` (`BOTTOM_SHEET`), repointed here, and `app/(app)/finance/extrato/page.tsx`, which task 10 turns into the redirect. `RecentEntriesCard.tsx` and `BillsCard.tsx` import nothing from it, so task 12 needs no compile fix from this task.

**Interfaces:**
- Consumes:
  - `@/lib/domain/planTree` (task 6): `PlanNode`, `PaneRow` (its `detail` already joins observação, documento and parcela: render it as is), `entryInitialFor(node, accounts, bankAccounts): EntryInitial`.
  - `LedgerRow.inflow`, `LedgerKind = EntryKind | "sale" | "purchase" | "treatment"`, `payingAccounts(accounts, kind, flow?)` (task 2).
  - `splitExpense(id, { count, frequency, startsOn }): Promise<Expense[]>` on `useHerdStore` (task 7).
  - `EntryDialog({ open, onOpenChange, expense?, initial?, template? })` (task 8; a yield opens the YieldDialog form inside it).
  - `paneExportTable(rows: readonly PaneRow[], title: string): ExportTable` from `lib/export/datasets/finance.ts` (task 10) — the sheet's Imprimir prints its one row.
  - Existing: `useMarkPaid(onDone?) → { request(expense), dialog }`, `MovementAccountDialog({ row: LedgerRow, onOpenChange, onDone? })`, `AttachmentsDialog({ expense, onOpenChange })`, `SeriesScopeDialog`, `removeExpense(id, scope)`, `removeTransfer(id)`, `installmentPlan` through `InstallmentPreview` / `repeatFromFields` of `RepeatSection`, `paginate` / `pageWindow` / `ELLIPSIS`, `InstallmentChip` / `RecurrenceTag` / `AttachmentCount`, `usePrintStore`, `useExportContext`.
- Produces (task 10 renders the first two with exactly these props):
  - `PaneRows({ node: PlanNode, rows: PaneRow[], view: "extrato" | "detalhado", selectedId: string | null, onSelect(id: string | null): void, page: number, onPageChange(page: number): void })`. It keeps the phone list's length and sheet in state: the caller gives it a `key` that changes with the nó, the window and the filters.
  - `LancamentosToolbar({ node: PlanNode, row: PaneRow | null, onPrint(): void, onDone(): void })` — renders `hidden md:flex` itself. With Financeiro edit: Novo · Editar · Excluir · Marcar como pago · Parcelar · Duplicar, then Conta / Ver anexos when they apply, then Imprimir. Without edit: Ver anexos (when it applies) and Imprimir.
  - `RowSheet({ row: PaneRow | null, node: PlanNode, onOpenChange(open: boolean): void })`.
  - `SplitDialog({ expense: Expense, onOpenChange(open: boolean): void, onDone?(): void })`.
  - `useEntryActions(row: PaneRow | null, node: PlanNode, onDone?: () => void): { actions: Record<EntryActionKey, EntryAction>; dialogs: ReactNode }`, `applicableActions(row, canEdit, bankAccounts): Record<EntryActionKey, boolean>`, `EntryActionKey`, `EntryAction`.
  - `pills.tsx`: `LedgerStatusPill({ status: LedgerStatus })` only. The old `LedgerKindPill` and `LedgerAmount` had no reader left (the rows sign their own value, no screen shows the kind pill), so they go with `extrato/`.
  - `components/ui/bottom-sheet.ts`: `BOTTOM_SHEET`.

- [ ] **Step 1: Write the failing test**

`components/finance/lancamentos/__tests__/entryActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BankAccount, Expense } from "@/lib/types";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { PaneRow } from "@/lib/domain/planTree";
import { applicableActions } from "@/components/finance/lancamentos/useEntryActions";

const sicredi: BankAccount = {
  id: "b-1",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-01-01",
  isMain: true,
  pendingLines: 0,
};

const carreta: Expense = { id: "e1", kind: "investment", flow: "out", date: "2026-09-05", category: "other", amountBrl: 19500 };

/** The ledger row of a lançamento, or of a venda of the manejos when `expense` is null. */
function ledgerRow(expense: Expense | null, patch: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: expense?.id ?? "m1",
    kind: expense?.kind ?? "sale",
    date: "2026-09-05",
    dueDate: "2026-11-05",
    paidAt: expense?.paidAt ?? null,
    status: expense?.paidAt ? "paid" : "payable",
    group: "investment",
    groupLabel: "Investimentos",
    account: "Máquinas e implementos",
    bankAccountId: null,
    counterparty: "Agropecuária Sertão",
    document: null,
    lotId: null,
    lotName: null,
    amountBrl: 19500,
    notes: null,
    locked: expense === null,
    headCount: null,
    expense,
    inflow: false,
    ...patch,
  };
}

function paneRow(ledger: LedgerRow | null, transfer: PaneRow["transfer"] = null): PaneRow {
  return {
    id: ledger?.id ?? transfer?.id ?? "x",
    date: "2026-09-05",
    history: "Agropecuária Sertão",
    detail: null,
    contra: null,
    contraGroup: null,
    amountBrl: -19500,
    balance: null,
    ledger,
    transfer,
  };
}

const enabled = (actions: Record<string, boolean>): string[] =>
  Object.keys(actions)
    .filter((key) => actions[key])
    .sort();

describe("applicableActions", () => {
  it("offers only Novo while no row is picked, and nothing without Financeiro edit", () => {
    expect(enabled(applicableActions(null, true, [sicredi]))).toEqual(["new"]);
    expect(enabled(applicableActions(null, false, [sicredi]))).toEqual([]);
  });

  it("offers every write on a pending lançamento", () => {
    expect(enabled(applicableActions(paneRow(ledgerRow(carreta)), true, [sicredi]))).toEqual([
      "duplicate",
      "edit",
      "markPaid",
      "new",
      "remove",
      "split",
    ]);
  });

  it("neither marks paid nor splits a paid row, and does not split a row of a série or a rendimento", () => {
    const paid = { ...carreta, paidAt: "2026-09-05" };
    const parcela = { ...carreta, seriesId: "s1", seriesIndex: 6, seriesCount: 6 };
    const rendimento: Expense = { ...carreta, kind: "yield", flow: undefined };
    expect(applicableActions(paneRow(ledgerRow(paid)), true, [sicredi])).toMatchObject({
      markPaid: false,
      split: false,
      edit: true,
      duplicate: true,
    });
    expect(applicableActions(paneRow(ledgerRow(parcela)), true, [sicredi])).toMatchObject({ markPaid: true, split: false });
    expect(applicableActions(paneRow(ledgerRow(rendimento)), true, [sicredi]).split).toBe(false);
  });

  it("only removes a transferência", () => {
    const transfer = { id: "t1", fromId: "b-1", toId: "b-2", date: "2026-09-21", amountBrl: 80000 };
    expect(enabled(applicableActions(paneRow(null, transfer), true, [sicredi]))).toEqual(["new", "remove"]);
  });

  it("gives a venda of the manejos only its conta, and none while no conta can take it", () => {
    const venda = paneRow(ledgerRow(null, { status: "received", paidAt: "2026-09-20", inflow: true }));
    expect(enabled(applicableActions(venda, true, [sicredi]))).toEqual(["account", "new"]);
    expect(applicableActions(venda, true, []).account).toBe(false);
  });

  it("leaves a member without Financeiro edit only the anexos", () => {
    const withFiles = { ...carreta, attachmentCount: 2 };
    expect(enabled(applicableActions(paneRow(ledgerRow(withFiles)), false, [sicredi]))).toEqual(["attachments"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run components/finance/lancamentos/__tests__/entryActions.test.ts`
Expected: FAIL — cannot resolve `@/components/finance/lancamentos/useEntryActions`.

- [ ] **Step 3: Implement**

**3a. Create `components/ui/bottom-sheet.ts`:**

```ts
/** A Dialog pinned to the bottom of a phone screen. */
export const BOTTOM_SHEET =
  "top-auto bottom-0 left-0 w-full max-w-full translate-x-0 translate-y-0 rounded-b-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-full";
```

**3b. `components/offline/SyncSheet.tsx`** — Replace:

```ts
import { BOTTOM_SHEET } from "@/components/finance/extrato/ExtratoFilters";
```

with:

```ts
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
```

**3c. `components/finance/RepeatSection.tsx`** — Replace:

```ts
function InstallmentPreview({ repeat, amount }: { repeat: SeriesRepeat; amount: number }) {
```

with:

```ts
/** The parcelas with their vencimentos and values; Parcelar shows the same list. */
export function InstallmentPreview({ repeat, amount }: { repeat: SeriesRepeat; amount: number }) {
```

**3d. Delete the old Extrato:**

Run: `rm components/finance/extrato/ExtratoFilters.tsx components/finance/extrato/ExtratoList.tsx components/finance/extrato/ExtratoPage.tsx components/finance/extrato/ExtratoSummary.tsx components/finance/extrato/ExtratoTable.tsx components/finance/extrato/RowActions.tsx && rmdir components/finance/extrato`

**3e. Create `components/finance/lancamentos/pills.tsx`:**

```tsx
/** Where a ledger row stands, on the rows of Lançamentos and the phone's sheet. */
import type { LedgerStatus } from "@/lib/domain/ledger";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<LedgerStatus, { label: string; className: string }> = {
  paid: { label: "pago", className: "bg-healthy-soft text-healthy" },
  received: { label: "recebido", className: "bg-healthy-soft text-healthy" },
  payable: { label: "a pagar", className: "bg-attention-soft text-attention" },
  receivable: { label: "a receber", className: "bg-scheduled-soft text-scheduled" },
  overdue: { label: "vencida", className: "bg-overdue-soft text-overdue" },
};

export function LedgerStatusPill({ status }: { status: LedgerStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        pill.className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {pill.label}
    </span>
  );
}
```

**3f. Create `components/finance/lancamentos/SplitDialog.tsx`:**

```tsx
"use client";

/**
 * "Parcelar": a pending lançamento that is not part of a série becomes 2 to 48
 * parcelas. Its value is the total, split as a new parcelamento is (the last
 * parcela takes the centavos); the first parcela keeps the lançamento and its
 * anexos.
 */
import { useState, type FormEvent } from "react";
import { Split } from "lucide-react";
import type { Expense, SeriesFrequency } from "@/lib/types";
import { formatCurrency } from "@/lib/domain/format";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "@/lib/domain/series";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import {
  InstallmentPreview,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SplitDialog({
  expense,
  onOpenChange,
  onDone,
}: {
  expense: Expense;
  onOpenChange(open: boolean): void;
  /** After the parcelas were written. */
  onDone?(): void;
}) {
  const splitExpense = useHerdStore((s) => s.splitExpense);
  const { addToast } = useToast();
  // Primeira parcela vence on the lançamento's own vencimento unless changed.
  const [fields, setFields] = useState<RepeatFields>(() => ({
    ...initialRepeat(expense.date),
    choice: "installments",
    firstDue: effectiveDueDate(expense),
  }));
  const [busy, setBusy] = useState(false);
  const patch = (change: Partial<RepeatFields>) => setFields((prev) => ({ ...prev, ...change }));
  // The rules of Parcelado in Novo lançamento: 2–48, never due before the lançamento's date.
  const repeat = repeatFromFields(fields, expense.date);
  const valid = repeat !== null && typeof repeat !== "string" ? repeat : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid?.count) return;
    setBusy(true);
    try {
      await splitExpense(expense.id, { count: valid.count, frequency: valid.frequency, startsOn: valid.startsOn });
      addToast({ messageType: "success", text: `Lançamento dividido em ${valid.count} parcelas` });
      onOpenChange(false);
      onDone?.();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parcelar lançamento</DialogTitle>
          <DialogDescription>
            {formatCurrency(expense.amountBrl)} vira parcelas. A primeira fica com este lançamento e com os anexos dele.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="split-count">Parcelas</Label>
              <Input
                id="split-count"
                type="number"
                inputMode="numeric"
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                value={fields.count}
                onChange={(e) => patch({ count: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="split-first">Primeira parcela vence</Label>
              <Input
                id="split-first"
                type="date"
                value={fields.firstDue}
                onChange={(e) => patch({ firstDue: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="split-interval">Intervalo</Label>
              <Select value={fields.frequency} onValueChange={(v) => patch({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="split-interval" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mensal</SelectItem>
                  <SelectItem value="weekly">semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valid ? <InstallmentPreview repeat={valid} amount={expense.amountBrl} /> : null}
          {typeof repeat === "string" ? <p className="text-xs text-ink-soft">{repeat}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy || !valid}>
              <Split aria-hidden />
              {valid ? `Parcelar em ${valid.count}` : "Parcelar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**3g. Create `components/finance/lancamentos/useEntryActions.tsx`:**

```tsx
"use client";

/**
 * What the toolbar and the phone's row sheet do to the lançamento picked, and
 * which of it applies: Novo (on the nó), Editar, Excluir (a série asks how
 * far, a transferência goes whole), Marcar como pago / recebido, Parcelar,
 * Duplicar, Ver anexos and, on a venda or compra of the manejos, only its
 * Conta. Writes need Financeiro at edit; Ver anexos needs only view. The
 * caller renders `dialogs`.
 */
import { useState, type ReactNode } from "react";
import {
  CircleCheck,
  Copy,
  Landmark,
  Paperclip,
  Pencil,
  Plus,
  Split,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { BankAccount, SeriesScope } from "@/lib/types";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { entryInitialFor, type PaneRow, type PlanNode } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsDialog } from "@/components/finance/attachments/AttachmentsDialog";
import { MovementAccountDialog } from "@/components/finance/contas/MovementAccountDialog";
import { useMarkPaid } from "@/components/finance/contas/useMarkPaid";
import { SplitDialog } from "@/components/finance/lancamentos/SplitDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type EntryActionKey =
  | "new"
  | "edit"
  | "remove"
  | "markPaid"
  | "split"
  | "duplicate"
  | "attachments"
  | "account";

export interface EntryAction {
  label: string;
  icon: LucideIcon;
  /** Applies to the row picked and the user may do it. */
  enabled: boolean;
  run(): void;
}

/** Which actions apply to `row` (null: none picked) for a user with or without Financeiro edit. */
export function applicableActions(
  row: PaneRow | null,
  canEdit: boolean,
  bankAccounts: BankAccount[]
): Record<EntryActionKey, boolean> {
  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const pending = expense !== null && !expense.paidAt;
  return {
    new: canEdit,
    // TransferDialog only creates: a transferência is removed, never edited, here.
    edit: canEdit && expense !== null,
    remove: canEdit && (expense !== null || (row?.transfer ?? null) !== null),
    markPaid: canEdit && pending,
    split: canEdit && pending && !expense.seriesId && expense.kind !== "yield",
    duplicate: canEdit && expense !== null,
    attachments: (expense?.attachmentCount ?? 0) > 0,
    // A venda or compra keeps its value but takes the conta its money went through, when one can take it.
    account:
      canEdit &&
      (ledger?.kind === "sale" || ledger?.kind === "purchase") &&
      (payingAccounts(bankAccounts, "revenue").length > 0 || ledger.bankAccountId !== null),
  };
}

export function useEntryActions(
  row: PaneRow | null,
  node: PlanNode,
  /** After a change that may have removed or replaced the row. */
  onDone?: () => void
): { actions: Record<EntryActionKey, EntryAction>; dialogs: ReactNode } {
  const canEdit = useCan("finance", "edit");
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const removeTransfer = useHerdStore((s) => s.removeTransfer);
  const markPaid = useMarkPaid(onDone);
  const { addToast } = useToast();
  const [open, setOpen] = useState<EntryActionKey | null>(null);
  const [busy, setBusy] = useState(false);

  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const transfer = row?.transfer ?? null;
  const can = applicableActions(row, canEdit, bankAccounts);
  const close = () => setOpen(null);
  const show = (key: EntryActionKey) => () => setOpen(key);

  const onMarkPaid = async () => {
    if (!expense) return;
    setBusy(true);
    try {
      // With two or more contas it opens "Pago por"; the hook marks, toasts and calls onDone.
      await markPaid.request(expense);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope: SeriesScope = "one") => {
    setBusy(true);
    try {
      if (transfer) await removeTransfer(transfer.id);
      else if (expense) await removeExpense(expense.id, scope);
      addToast({ messageType: "success", text: transfer ? "Transferência excluída" : "Lançamento excluído" });
      setOpen(null);
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const actions: Record<EntryActionKey, EntryAction> = {
    new: { label: "Novo", icon: Plus, enabled: can.new, run: show("new") },
    edit: { label: "Editar", icon: Pencil, enabled: can.edit, run: show("edit") },
    remove: { label: "Excluir", icon: Trash2, enabled: can.remove, run: show("remove") },
    markPaid: {
      label: ledger?.inflow ? "Marcar como recebido" : "Marcar como pago",
      icon: CircleCheck,
      enabled: can.markPaid && !busy,
      run: () => void onMarkPaid(),
    },
    split: { label: "Parcelar", icon: Split, enabled: can.split, run: show("split") },
    duplicate: { label: "Duplicar", icon: Copy, enabled: can.duplicate, run: show("duplicate") },
    attachments: { label: "Ver anexos", icon: Paperclip, enabled: can.attachments, run: show("attachments") },
    account: { label: "Conta", icon: Landmark, enabled: can.account, run: show("account") },
  };

  // A row of a série asks how far the removal goes; anything else asks once.
  const confirming = open === "remove" && (transfer !== null || (expense !== null && !expense.seriesId));

  const dialogs = (
    <>
      {/* Mounted only while open, so each form starts from the row. */}
      {open === "new" ? (
        <EntryDialog open onOpenChange={close} initial={entryInitialFor(node, accounts, bankAccounts)} />
      ) : null}
      {open === "edit" && expense ? <EntryDialog open onOpenChange={close} expense={expense} /> : null}
      {open === "duplicate" && expense ? <EntryDialog open onOpenChange={close} template={expense} /> : null}
      {open === "split" && expense ? <SplitDialog expense={expense} onOpenChange={close} onDone={onDone} /> : null}
      {open === "attachments" && expense ? <AttachmentsDialog expense={expense} onOpenChange={close} /> : null}
      {open === "account" && ledger ? (
        <MovementAccountDialog row={ledger} onOpenChange={close} onDone={onDone} />
      ) : null}
      {markPaid.dialog}

      {open === "remove" && expense?.seriesId ? (
        <SeriesScopeDialog
          open
          onOpenChange={(next) => {
            if (!next && !busy) close();
          }}
          expense={expense}
          action="remove"
          busy={busy}
          onConfirm={(scope) => void remove(scope)}
        />
      ) : null}

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transfer ? "Excluir transferência?" : "Excluir lançamento?"}</DialogTitle>
            <DialogDescription>
              {transfer
                ? "O dinheiro volta para a conta de onde saiu."
                : "Ele sai do extrato, dos saldos e dos indicadores."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={busy} onClick={close}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { actions, dialogs };
}
```

**3h. Create `components/finance/lancamentos/RowSheet.tsx`:**

```tsx
"use client";

/**
 * The phone's sheet of one lançamento: what it is, when and how much, and the
 * toolbar's actions that apply to it, Imprimir printing this one line. A row
 * the manejos wrote takes only its conta bancária and says so.
 */
import { Lock, Printer, type LucideIcon } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { installmentLabel } from "@/lib/domain/series";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { useExportContext } from "@/components/export/useExportContext";
import { LedgerStatusPill } from "@/components/finance/lancamentos/pills";
import { useEntryActions, type EntryActionKey } from "@/components/finance/lancamentos/useEntryActions";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The sheet's order, as the canvas; Imprimir and Excluir close it. */
const ORDER: readonly EntryActionKey[] = ["markPaid", "edit", "split", "duplicate", "attachments", "account"];

function SheetButton({
  label,
  icon: Icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 px-1 text-left text-[15px]",
          danger ? "text-overdue" : "text-ink"
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", danger ? "text-overdue" : "text-ink-soft")} aria-hidden />
        {label}
      </button>
    </li>
  );
}

interface RowSheetProps {
  /** The row tapped; null keeps the sheet closed. */
  row: PaneRow | null;
  node: PlanNode;
  onOpenChange(open: boolean): void;
}

export function RowSheet({ row, node, onOpenChange }: RowSheetProps) {
  const { actions, dialogs } = useEntryActions(row, node, () => onOpenChange(false));
  const print = usePrintStore((s) => s.print);
  const exportContext = useExportContext();
  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const parcela = expense ? installmentLabel(expense) : null;

  return (
    <>
      <Dialog open={row !== null} onOpenChange={onOpenChange}>
        <DialogContent className={BOTTOM_SHEET}>
          {row ? (
            <>
              <DialogHeader>
                <DialogTitle>{parcela ? `${row.history} · parcela ${parcela}` : row.history}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span>
                    {expense && ledger?.paidAt === null ? `vence ${formatDate(ledger.dueDate)}` : formatDate(row.date)}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="font-mono text-ink">{formatCurrency(Math.abs(row.amountBrl))}</span>
                  {ledger ? <LedgerStatusPill status={ledger.status} /> : null}
                </DialogDescription>
              </DialogHeader>
              <ul className="border-t border-hairline">
                {ORDER.map((key) => actions[key])
                  .filter((action) => action.enabled)
                  .map((action) => (
                    <SheetButton key={action.label} label={action.label} icon={action.icon} onClick={action.run} />
                  ))}
                <SheetButton
                  label="Imprimir"
                  icon={Printer}
                  onClick={() =>
                    print({
                      title: row.history,
                      tables: [paneExportTable([row], row.history)],
                      context: exportContext(),
                    })
                  }
                />
                {actions.remove.enabled ? (
                  <SheetButton label="Excluir" icon={actions.remove.icon} danger onClick={actions.remove.run} />
                ) : null}
              </ul>
              {ledger?.locked ? (
                <p className="flex items-center gap-2 text-sm text-ink-soft">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Vendas, compras e tratamentos vêm dos manejos.
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {dialogs}
    </>
  );
}
```

**3i. Create `components/finance/lancamentos/PaneRows.tsx`** — both views put `row.detail` under the history as task 6 builds it (observação · documento · parcela; `history` is already the pago para), so the md+ table shows no parcela chip; the phone list, which has no detail line, keeps it. Each radio is named by history, detail and date, so the parcelas of one compra read apart. The table scrolls sideways inside a pane narrower than 640 px:

```tsx
"use client";

/**
 * The lançamentos of the nó picked, newest first. md+: a table of 50 rows a
 * page with a radio per row that picks the lançamento the toolbar acts on;
 * "Extrato" shows the contra partida and the saldo (or the status),
 * "Detalhado" the vencimento, lote and conta bancária. Phone: a list that
 * grows by 50, a tap opening the row's sheet.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ELLIPSIS, pageWindow, paginate } from "@/components/herd/pagination";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { LedgerStatusPill } from "@/components/finance/lancamentos/pills";
import { RowSheet } from "@/components/finance/lancamentos/RowSheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const HEAD = "h-9 px-2 text-left text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";
const CELL = "px-2 py-2 align-middle";

/** "84.312,40", "−3.700,00"; "+148.320,00" when signed. */
const money = (value: number, signed: boolean): string =>
  `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${formatNumber(Math.abs(value), 2)}`;
const dayMonth = (iso: string): string => formatDate(iso).slice(0, 5);
/** "Trator MF 4275, NF 2.871 · parcela 6/6, 10/02/2026": tells the parcelas of one compra apart. */
const rowName = (row: PaneRow): string => [row.history, row.detail, formatDate(row.date)].filter(Boolean).join(", ");

/** Money in is "+" and healthy. */
function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-mono whitespace-nowrap tabular-nums", value > 0 ? "text-healthy" : "text-ink", className)}>
      {money(value, true)}
    </span>
  );
}

function Dash() {
  return <span className="text-ink-soft">—</span>;
}

function LockMark() {
  return (
    <span title="do manejo, automático" className="inline-flex shrink-0 text-ink-soft">
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">do manejo, automático</span>
    </span>
  );
}

/** Who or what, over the observação, documento and parcela (the detail already names the parcela). */
function HistoryCell({ row }: { row: PaneRow }) {
  const expense = row.ledger?.expense ?? null;
  return (
    <td className={CELL}>
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
        <span className="truncate">{row.history}</span>
        <AttachmentCount expense={expense} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft empty:hidden">
        {row.detail ? <span className="truncate">{row.detail}</span> : null}
        <RecurrenceTag expense={expense} />
      </span>
    </td>
  );
}

function ExtratoCells({ row, saldo }: { row: PaneRow; saldo: boolean }) {
  return (
    <>
      <td className={cn(CELL, "font-mono text-xs text-ink")}>{formatDate(row.date)}</td>
      <HistoryCell row={row} />
      <td className={CELL}>
        {row.contra ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
              <span className="truncate">{row.contra}</span>
              {row.ledger?.locked ? <LockMark /> : null}
            </span>
            {row.contraGroup ? <span className="block truncate text-xs text-ink-soft">{row.contraGroup}</span> : null}
          </>
        ) : (
          <Dash />
        )}
      </td>
      <td className={cn(CELL, "text-right")}>
        <Amount value={row.amountBrl} />
      </td>
      {/* A pending line of a financiamento has no saldo devedor yet: its status stands there. */}
      <td className={cn(CELL, "pr-4", saldo && "text-right")}>
        {row.balance !== null ? (
          <span className="font-mono font-medium whitespace-nowrap text-ink tabular-nums">{money(row.balance, false)}</span>
        ) : row.ledger ? (
          <LedgerStatusPill status={row.ledger.status} />
        ) : (
          <Dash />
        )}
      </td>
    </>
  );
}

function DetalhadoCells({ row, bank }: { row: PaneRow; bank: string | null }) {
  const ledger = row.ledger;
  return (
    <>
      <td className={CELL}>
        <span className="block font-mono text-xs text-ink">{formatDate(row.date)}</span>
        {ledger?.expense ? (
          <span
            className={cn(
              "block text-[11px] whitespace-nowrap",
              ledger.paidAt === null ? "text-attention" : "text-ink-soft"
            )}
          >
            vence {dayMonth(ledger.dueDate)}
          </span>
        ) : null}
      </td>
      <HistoryCell row={row} />
      <td className={cn(CELL, "truncate")}>
        {ledger ? (ledger.lotName ?? <span className="text-xs text-ink-soft">fazenda</span>) : <Dash />}
      </td>
      <td className={cn(CELL, "truncate")}>{bank ?? <Dash />}</td>
      <td className={cn(CELL, "text-right")}>
        <Amount value={row.amountBrl} />
      </td>
      <td className={cn(CELL, "pr-4")}>{ledger ? <LedgerStatusPill status={ledger.status} /> : <Dash />}</td>
    </>
  );
}

interface PaneRowsProps {
  node: PlanNode;
  rows: PaneRow[];
  view: "extrato" | "detalhado";
  selectedId: string | null;
  onSelect(id: string | null): void;
  page: number;
  onPageChange(page: number): void;
}

export function PaneRows({ node, rows, view, selectedId, onSelect, page: pageNumber, onPageChange }: PaneRowsProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up on every render: a removed row closes its sheet.
  const open = openId === null ? null : (rows.find((row) => row.id === openId) ?? null);
  const page = paginate(rows, pageNumber, PAGE_SIZE);
  const bankName = (id: string | null) =>
    id === null ? null : (bankAccounts.find((a) => a.id === id)?.name ?? null);

  // The Extrato's last column: the saldo after each line on a conta bancária, the saldo devedor on a financiamento.
  const accountId = node.type === "account" ? node.id : null;
  const last =
    node.type === "bank"
      ? "Saldo (R$)"
      : accounts.find((a) => a.id === accountId)?.group === "financing"
        ? "Saldo devedor"
        : "Status";
  const saldo = last !== "Status";
  const heads: [string, string][] =
    view === "extrato"
      ? [
          ["Data", "w-24"],
          ["Histórico", ""],
          ["Contra partida", "w-44"],
          ["Valor (R$)", "w-28 text-right"],
          [last, cn("w-28 pr-4", saldo && "text-right")],
        ]
      : [
          ["Data", "w-24"],
          ["Histórico", ""],
          ["Lote", "w-28"],
          ["Pago por", "w-32"],
          ["Valor (R$)", "w-28 text-right"],
          ["Status", "w-24 pr-4"],
        ];

  return (
    <>
      <div className="hidden md:block">
        {/* A narrow pane scrolls the table sideways rather than crushing the Histórico. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse">
            <caption className="sr-only">Lançamentos da conta escolhida</caption>
            <thead>
              <tr className="bg-surface">
                <th scope="col" className={cn(HEAD, "w-10 pl-4")}>
                  <span className="sr-only">Selecionar</span>
                </th>
                {heads.map(([label, className]) => (
                  <th key={label} scope="col" className={cn(HEAD, className)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    aria-selected={selected || undefined}
                    onClick={() => onSelect(row.id)}
                    className={cn(
                      "cursor-pointer border-t border-hairline text-sm transition-colors",
                      selected ? "bg-brand-soft" : "hover:bg-surface/60"
                    )}
                  >
                    <td className="py-2 pl-4 align-middle">
                      <input
                        type="radio"
                        name="lancamento"
                        checked={selected}
                        onChange={() => onSelect(row.id)}
                        aria-label={`Selecionar ${rowName(row)}`}
                        className="block size-4 accent-brand"
                      />
                    </td>
                    {view === "extrato" ? (
                      <ExtratoCells row={row} saldo={saldo} />
                    ) : (
                      <DetalhadoCells row={row} bank={bankName(row.ledger?.bankAccountId ?? null)} />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 text-xs text-ink-soft"
        >
          <span aria-live="polite">
            Mostrando {formatNumber(page.from)}–{formatNumber(page.to)} de {formatNumber(page.total)} · mais recentes
            primeiro
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
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-panel">
          {rows.slice(0, shown).map((row) => {
            const expense = row.ledger?.expense ?? null;
            const sub = [
              expense && row.ledger ? `vence ${dayMonth(row.ledger.dueDate)}` : null,
              row.contra,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="grid min-h-11 w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="font-mono text-xs text-ink-soft">{dayMonth(row.date)}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-ink">
                    <span className="truncate">{row.history}</span>
                    <InstallmentChip expense={expense} />
                  </span>
                  <Amount value={row.amountBrl} className="text-sm" />
                  <span className="col-start-2 truncate text-xs text-ink-soft">{sub}</span>
                  <span className="justify-self-end">
                    {row.ledger ? <LedgerStatusPill status={row.ledger.status} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {rows.length > shown ? (
          <Button variant="outline" className="min-h-11" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Carregar mais
          </Button>
        ) : null}
        <RowSheet
          row={open}
          node={node}
          onOpenChange={(next) => {
            if (!next) setOpenId(null);
          }}
        />
      </div>
    </>
  );
}
```

**3j. Create `components/finance/lancamentos/LancamentosToolbar.tsx`:**

```tsx
"use client";

/**
 * The bar over the plano de contas and the pane (md+). Novo starts a
 * lançamento on the nó picked; the rest acts on the lançamento picked with its
 * radio, and a button that does not apply to it is disabled. Imprimir prints
 * the rows on screen. Without Financeiro edit only Ver anexos and Imprimir stay.
 */
import { Plus, Printer } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatCurrency } from "@/lib/domain/format";
import { installmentLabel } from "@/lib/domain/series";
import { useCan } from "@/lib/store/usePermissions";
import { useEntryActions, type EntryAction } from "@/components/finance/lancamentos/useEntryActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Separator() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-hairline" />;
}

function ToolButton({ action, danger = false }: { action: EntryAction; danger?: boolean }) {
  const Icon = action.icon;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!action.enabled}
      onClick={action.run}
      className={cn(
        "text-[13px] disabled:opacity-45",
        danger ? "text-overdue hover:text-overdue [&_svg]:text-overdue" : "text-ink [&_svg]:text-ink-soft"
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {action.label}
    </Button>
  );
}

interface LancamentosToolbarProps {
  node: PlanNode;
  row: PaneRow | null;
  onPrint(): void;
  /** After a change that may have removed or replaced the picked row. */
  onDone(): void;
}

export function LancamentosToolbar({ node, row, onPrint, onDone }: LancamentosToolbarProps) {
  const canEdit = useCan("finance", "edit");
  const { actions, dialogs } = useEntryActions(row, node, onDone);
  const expense = row?.ledger?.expense ?? null;
  const parcela = expense ? installmentLabel(expense) : null;
  const picked = row
    ? [row.history, parcela ? `parcela ${parcela}` : null, formatCurrency(Math.abs(row.amountBrl))]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div
      role="toolbar"
      aria-label="Ações do lançamento"
      className="hidden flex-wrap items-center gap-0.5 rounded-lg border border-hairline bg-panel py-1.5 pr-3 pl-1.5 md:flex"
    >
      {canEdit ? (
        <>
          <Button type="button" onClick={actions.new.run}>
            <Plus aria-hidden />
            Novo
          </Button>
          <Separator />
          <ToolButton action={actions.edit} />
          <ToolButton action={actions.remove} danger />
          <Separator />
          <ToolButton action={actions.markPaid} />
          <ToolButton action={actions.split} />
          <ToolButton action={actions.duplicate} />
          <Separator />
        </>
      ) : null}
      {/* Shown only on a row they apply to: a venda or compra of the manejos, a lançamento with anexos. */}
      {actions.account.enabled ? <ToolButton action={actions.account} /> : null}
      {actions.attachments.enabled ? <ToolButton action={actions.attachments} /> : null}
      <Button
        type="button"
        variant="ghost"
        onClick={onPrint}
        className="text-[13px] text-ink [&_svg]:text-ink-soft"
      >
        <Printer aria-hidden className="size-3.5" />
        Imprimir
      </Button>
      <span className="ml-auto min-w-0 truncate pl-3 text-xs text-ink-soft">
        {picked ? (
          <>
            Selecionado: <span className="text-ink">{picked}</span>
          </>
        ) : canEdit ? (
          "Escolha um lançamento na lista para editar"
        ) : (
          "Escolha um lançamento na lista"
        )}
      </span>
      {dialogs}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run components/finance/lancamentos/__tests__/entryActions.test.ts components/finance/__tests__/repeatFields.test.ts components/offline/__tests__/syncSheet.test.ts`
Expected: PASS

- [ ] **Step 5: Types and lint**

Run: `pnpm exec tsc --noEmit` and `pnpm exec eslint components/finance/lancamentos/pills.tsx components/finance/lancamentos/useEntryActions.tsx components/finance/lancamentos/SplitDialog.tsx components/finance/lancamentos/RowSheet.tsx components/finance/lancamentos/PaneRows.tsx components/finance/lancamentos/LancamentosToolbar.tsx components/finance/lancamentos/__tests__/entryActions.test.ts components/ui/bottom-sheet.ts components/offline/SyncSheet.tsx components/finance/RepeatSection.tsx`
Expected: lint clean; with tasks 1–10 in, tsc is clean (no error left).

- [ ] **Step 6: Nothing reads the old Extrato**

Run: `grep -rn "finance/extrato" app components lib`
Expected: only the two links task 12 repoints — `components/finance/CostBreakdownCard.tsx` (`extratoHref`) and `components/finance/RecentEntriesCard.tsx` (`href`). After task 12 the grep prints nothing.


### Task 12: Painel — "Capital, dívidas e sócios", and the Painel's cards by direction

**Files:**
- Create: `components/finance/CapitalStrip.tsx`
- Modify: `app/(app)/finance/page.tsx`
- Modify: `components/finance/CashStrip.tsx`
- Modify: `components/finance/BillsCard.tsx`
- Modify: `components/finance/RecentEntriesCard.tsx`
- Modify: `components/finance/CostBreakdownCard.tsx` (the "Ver extrato" link only; task 3 already changed its cost filter)
- Modify: `components/finance/SeriesScopeDialog.tsx`
- Modify: `components/finance/contas/ConciliarPage.tsx`
- Modify: `components/finance/contas/AccountMovements.tsx`
- Test: none (UI task: checked by tsc, lint and the task 13 smoke; no pure helper is extracted)

**Interfaces:**
- Consumes:
  - `@/lib/domain/planTree` (task 6): `capitalSummary(inputs: PlanInputs, period: Period, todayIso: string): CapitalSummary`, `interface CapitalSummary { invested; investedAssets; investedCattle; applications; yieldInPeriod; debt; debtAccounts; nextInstallment: { dueDate: string; amountBrl: number } | null; withdrawn }`, `type PlanNode`, `nodeParam(node: PlanNode): string` (`investimentos`, `bancos`, `financiamentos`, `socios`, `despesas`, `grupo:<category>`).
  - `@/lib/domain/entries` (task 1): `entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null`, `ENTRY_KIND_LABEL: Record<EntryKind, string>` (`.yield` = "Rendimento").
  - `@/lib/domain/accounts` (task 1): `ACCOUNT_GROUP_LABEL` with `investment` = "Investimentos", `financing`, `partners`.
  - `@/lib/domain/ledger` (task 2): `cashSummary`, `pendingBills` (same signatures, by direction, every kind), `LedgerRow.inflow: boolean`.
  - Store (unchanged fields): `bankAccounts: BankAccount[]`, `transfers: Transfer[]`.
- Produces: `CapitalStrip({ summary: CapitalSummary, period: Period, resultBrl: number })` from `components/finance/CapitalStrip.tsx`. Nothing later imports it.

This task adds no route and changes no page export: `app/(app)/finance/page.tsx` stays the same client page, so no Next.js API is touched. `next/link` is used as its neighbours use it (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` has no deprecation for this usage).

The canvas is `~/.cache/meubov-canvas/lancamentos/out/shot-L-Painel.png` (`painel()` in `boards.mjs`): the card sits between the caixa strip and the Placar, a `SectionCard` whose body is four hairline-gapped cells, each a link with a soft icon tile, an 11 px uppercase label, the mono value, an 11 px sub and a chevron.

- [ ] **Step 1: Create `components/finance/CapitalStrip.tsx`**

```tsx
import Link from "next/link";
import { ChevronRight, HandCoins, PiggyBank, Tractor, Users, type LucideIcon } from "lucide-react";
import { nodeParam, type CapitalSummary, type PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { periodSearch, type Period } from "@/lib/domain/period";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Cell {
  label: string;
  value: number;
  sub: string;
  /** The nó the figure opens in Lançamentos. */
  node: PlanNode;
  icon: LucideIcon;
  tile: string;
}

interface CapitalStripProps {
  summary: CapitalSummary;
  period: Period;
  /** Resultado of the window: the retiradas read as a share of it while it is positive. */
  resultBrl: number;
}

/**
 * "Capital, dívidas e sócios": what moved outside the custo and the resultado,
 * each figure opening its nó in Lançamentos. Nothing while all four are zero.
 */
export function CapitalStrip({ summary, period, resultBrl }: CapitalStripProps) {
  const s = summary;
  if (s.invested === 0 && s.applications === 0 && s.debt === 0 && s.withdrawn === 0) return null;

  const search = periodSearch(period);
  const next = s.nextInstallment;
  const cells: Cell[] = [
    {
      label: "Investido no período",
      value: s.invested,
      sub: `imobilizado ${formatNumber(s.investedAssets)} · gado ${formatNumber(s.investedCattle)}`,
      node: { type: "group", group: "investment" },
      icon: Tractor,
      tile: "bg-scheduled-soft text-scheduled",
    },
    {
      label: "Aplicações",
      value: s.applications,
      sub: `rendeu ${formatCurrency(s.yieldInPeriod)} no período`,
      node: { type: "banks" },
      icon: PiggyBank,
      tile: "bg-healthy-soft text-healthy",
    },
    {
      label: "Saldo devedor",
      value: s.debt,
      sub: [
        s.debtAccounts > 0 ? plural(s.debtAccounts, "conta", "contas") : null,
        next ? `próxima parcela ${formatDate(next.dueDate).slice(0, 5)}` : "sem parcela a pagar",
      ]
        .filter(Boolean)
        .join(" · "),
      node: { type: "group", group: "financing" },
      icon: HandCoins,
      tile: "bg-fmd-soft text-fmd",
    },
    {
      label: "Retirado pelos sócios",
      value: s.withdrawn,
      sub:
        resultBrl > 0
          ? `${formatNumber((s.withdrawn / resultBrl) * 100)} % do resultado do período`
          : "no período",
      node: { type: "group", group: "partners" },
      icon: Users,
      tile: "bg-surface text-ink-soft",
    },
  ];

  return (
    <SectionCard
      title="Capital, dívidas e sócios"
      subtitle="fora do custo e do resultado · cada número abre a conta em Lançamentos"
      className="overflow-hidden"
      bodyClassName="p-0"
      action={
        <Link
          href={`/finance/lancamentos?${search}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lançamentos
        </Link>
      }
    >
      {/* Hairline-gapped cells as the caixa strip draws them; the tile and the chevron only where there is room. */}
      <ul className="grid grid-cols-2 gap-px bg-hairline lg:grid-cols-4">
        {cells.map(({ label, value, sub, node, icon: Icon, tile }) => (
          <li key={label} className="flex min-w-0">
            <Link
              href={`/finance/lancamentos?${search}&conta=${nodeParam(node)}`}
              className="flex min-w-0 flex-1 items-start gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-surface"
            >
              <span
                aria-hidden
                className={cn("hidden size-8 shrink-0 items-center justify-center rounded-[9px] xl:flex", tile)}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block", LABEL)}>{label}</span>
                <span className="mt-0.5 block truncate font-mono text-lg font-medium text-ink">
                  {formatCurrency(value)}
                </span>
                <span className="block text-[11px] leading-4 text-ink-soft">{sub}</span>
              </span>
              <ChevronRight aria-hidden className="mt-2 hidden size-4 shrink-0 text-ink-soft xl:block" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
```

Notes for the implementer: the whole cell is the link (its accessible name reads label, value and sub); it is taller than 44 px on the phone. Below `xl` (two columns on the phone, four of ~180 px at `lg` beside the sidebar) the tile and the chevron are hidden so "R$ 282.400,00" fits; both come back on `xl`, where the four columns have room for them.

- [ ] **Step 2: Mount it on the Painel — `app/(app)/finance/page.tsx`**

Replace:
```tsx
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * the eight indicators against their references and the year before, receita
 * × custo, mercado, composição, contas, custo por lote and the newest
 * lançamentos. Every figure follows the window.
```
with:
```tsx
 * Financeiro: the owner's cockpit for the window in the URL (?de&ate) — caixa,
 * capital, dívidas e sócios, the eight indicators against their references and
 * the year before, receita × custo, mercado, composição, contas, custo por
 * lote and the newest lançamentos. Every figure follows the window.
```

Replace:
```tsx
import { lotEconomics } from "@/lib/domain/lotEconomics";
```
with:
```tsx
import { lotEconomics } from "@/lib/domain/lotEconomics";
import { capitalSummary } from "@/lib/domain/planTree";
```

Replace:
```tsx
import { CashStrip } from "@/components/finance/CashStrip";
```
with:
```tsx
import { CashStrip } from "@/components/finance/CashStrip";
import { CapitalStrip } from "@/components/finance/CapitalStrip";
```

Replace:
```tsx
  const accounts = useHerdStore((s) => s.accounts);
```
with:
```tsx
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
```

Replace:
```tsx
  const bills = useMemo(() => pendingBills(expenses, today), [expenses, today]);
```
with:
```tsx
  const bills = useMemo(() => pendingBills(expenses, today), [expenses, today]);
  const capital = useMemo(
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers }, period, today),
    [inputs, accounts, bankAccounts, transfers, period, today]
  );
```

Replace:
```tsx
      <CashStrip cash={cash} />
```
with:
```tsx
      <CashStrip cash={cash} />

      <CapitalStrip summary={capital} period={period} resultBrl={ind.result} />
```

- [ ] **Step 3: The caixa's sub-lines — `components/finance/CashStrip.tsx`**

The caixa now carries every kind (liberações, aportes, rendimentos in; compras de bens, pagamentos, retiradas out), so "vendas e outras receitas" and "despesas, tratamentos e compras" stopped being true.

Replace:
```tsx
/** "Caixa do período": what came in and went out by payment date, and what is still open. */
```
with:
```tsx
/** "Caixa do período": what came in and went out by payment date, of every kind, and what is still open. */
```

Replace:
```tsx
    { label: "Recebido", value: cash.received, sub: "vendas e outras receitas", ink: "text-ink" },
```
with:
```tsx
    { label: "Recebido", value: cash.received, sub: "tudo o que entrou", ink: "text-ink" },
```

Replace:
```tsx
    { label: "Pago", value: cash.paid, sub: "despesas, tratamentos e compras", ink: "text-ink" },
```
with:
```tsx
    { label: "Pago", value: cash.paid, sub: "tudo o que saiu", ink: "text-ink" },
```

- [ ] **Step 4: Contas a pagar / a receber name a capital row by its grupo — `components/finance/BillsCard.tsx`**

`pendingBills` (task 2) now puts a pending financiamento pagamento, a compra de bem or a retirada under A pagar and a pending liberação or aporte under A receber. Their title comes from `entryGroup`, so a capital row reads "Financiamentos › Custeio Sicredi".

Replace:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
```
with:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```

Replace:
```tsx
  /** Pending despesas, oldest vencimento first. */
  payables: Expense[];
  /** Pending receitas, oldest vencimento first. */
  receivables: Expense[];
```
with:
```tsx
  /** Pending lançamentos that take money out, oldest vencimento first. */
  payables: Expense[];
  /** Pending lançamentos that bring money in, oldest vencimento first. */
  receivables: Expense[];
```

Replace:
```tsx
              ? "Nenhuma despesa esperando pagamento."
              : "Nenhuma receita esperando recebimento."
```
with:
```tsx
              ? "Nenhum pagamento pendente."
              : "Nenhum recebimento pendente."
```

Replace:
```tsx
              const group = entry.kind === "revenue" ? "revenue" : entry.category;
              const conta = accountName(entry.accountId, accounts);
              const title = conta
                ? `${ACCOUNT_GROUP_LABEL[group]} › ${conta}`
                : ACCOUNT_GROUP_LABEL[group];
```
with:
```tsx
              const group = entryGroup(entry);
              const groupLabel = group ? ACCOUNT_GROUP_LABEL[group] : ENTRY_KIND_LABEL.yield;
              const conta = accountName(entry.accountId, accounts);
              const title = conta ? `${groupLabel} › ${conta}` : groupLabel;
```

(The "A pagar" / "A receber" tab already decides "pago" / "recebido" in the checkbox label, and `useMarkPaid` — task 8 — words its toast by direction.)

- [ ] **Step 5: Últimos lançamentos by direction — `components/finance/RecentEntriesCard.tsx`**

It does not import the pills of `extrato/ExtratoTable` (it has its own `STATUS` map), so nothing to repoint.

Replace:
```tsx
/** The five newest Extrato rows of the window. */
```
with:
```tsx
/** The five newest lançamentos of the window, the manejos' rows included. */
```

Replace:
```tsx
      subtitle={`${rows.length} no período · despesas, receitas, vendas e compras`}
```
with:
```tsx
      subtitle={`${rows.length} no período · mais recentes primeiro`}
```

Replace:
```tsx
          href={`/finance/extrato?${periodSearch(period)}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver extrato
```
with:
```tsx
          href={`/finance/lancamentos?${periodSearch(period)}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lançamentos
```

Replace:
```tsx
            const income = row.kind === "revenue" || row.kind === "sale";
```
with:
```tsx
            const income = row.inflow;
```

- [ ] **Step 6: Composição opens its grupo in Lançamentos — `components/finance/CostBreakdownCard.tsx`**

Task 3 already replaced the `expense.kind === "revenue"` test in `accountTotals`; leave that line as task 3 left it. These anchors are untouched by task 3.

Replace:
```tsx
import { inPeriod, periodSearch, type Period } from "@/lib/domain/period";
```
with:
```tsx
import { inPeriod, periodSearch, type Period } from "@/lib/domain/period";
import { nodeParam } from "@/lib/domain/planTree";
```

Replace:
```tsx
  const extratoHref = `/finance/extrato?${periodSearch(period)}${open ? `&grupo=${open}` : ""}`;
```
with:
```tsx
  // The open grupo's nó, or the whole COE ("despesas") when every grupo is closed.
  const lancamentosHref = `/finance/lancamentos?${periodSearch(period)}&conta=${nodeParam({
    type: "group",
    group: open ?? "expenses",
  })}`;
```

Replace:
```tsx
          href={extratoHref}
```
with:
```tsx
          href={lancamentosHref}
```

Replace:
```tsx
          Ver extrato
```
with:
```tsx
          Ver lançamentos
```

- [ ] **Step 7: The grupo of a lançamento in the série dialog, the conciliação and the movimentação**

`components/finance/SeriesScopeDialog.tsx` — Replace:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
```
with:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```

Replace:
```tsx
  const group = expense.kind === "revenue" ? "revenue" : expense.category;
  const name = [accountName(expense.accountId, accounts) ?? ACCOUNT_GROUP_LABEL[group], expense.counterparty]
```
with:
```tsx
  const group = entryGroup(expense);
  const groupLabel = group ? ACCOUNT_GROUP_LABEL[group] : ENTRY_KIND_LABEL.yield;
  const name = [accountName(expense.accountId, accounts) ?? groupLabel, expense.counterparty]
```

(Its copy — "parcela", "conta recorrente", "as pagas" — never words by receita, so nothing reads `isInflow` here.)

`components/finance/contas/ConciliarPage.tsx` — Replace:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
```
with:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```

Replace:
```tsx
      const group = ACCOUNT_GROUP_LABEL[e.kind === "revenue" ? "revenue" : e.category];
      const plan = accountName(e.accountId, accounts);
```
with:
```tsx
      const groupKey = entryGroup(e);
      const group = groupKey ? ACCOUNT_GROUP_LABEL[groupKey] : ENTRY_KIND_LABEL.yield;
      const plan = accountName(e.accountId, accounts);
```

(The candidate's side is task 2's `entryFlow` in `match.ts`; the page itself signs nothing by kind.)

`components/finance/contas/AccountMovements.tsx` — Replace:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
```
with:
```tsx
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```

Replace:
```tsx
        const group = ACCOUNT_GROUP_LABEL[e.kind === "revenue" ? "revenue" : e.category];
```
with:
```tsx
        const groupKey = entryGroup(e);
        const group = groupKey ? ACCOUNT_GROUP_LABEL[groupKey] : ENTRY_KIND_LABEL.yield;
```

Replace (a compra de gado sits under Investimentos, as the ledger's `groupLabel` now says):
```tsx
          group: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
```
with:
```tsx
          group: ACCOUNT_GROUP_LABEL[sale ? "revenue" : "investment"],
```

(Entrada and Saída columns already go by the sign `accountMovements` gives each line — task 2 signs it by direction.)

- [ ] **Step 8: Grep for what is left**

Run:
```bash
cd /home/luketa/meubov
grep -rn 'kind === "revenue"\|kind === "expense"\|finance/extrato' app components
```
Expected: no `finance/extrato` hit at all, and no hit in this task's nine files. With tasks 1–11 in, exactly three hits remain and they stay: `components/finance/EntryDialog.tsx` (two: the grupo of a despesa or receita, and the receita-only fields) and `components/finance/entryFields.ts` (a despesa keeps its category) — task 8 reads the kind there on purpose. A hit in any other file is unowned: report it, do not fix it here.

When this plan was drafted the grep over `app/`, `components/` and `lib/` found nothing outside the contract's file lists. Two `lib/` call sites stay as they are on purpose: `lib/api/domains/bankAccounts/useCases/SetMovementBankAccount.useCase.ts` checks a venda's or a compra's conta with `isPayingAccount(..., "revenue")`, which under `mayPayFrom` still keeps cartões and aplicações out (right for both); `lib/api/domains/statements/useCases/ResolveLine.useCase.ts` (`target.kind === "expense"`) still creates only a despesa or a receita from a linha do extrato (the spec puts the new kinds out of scope there).

- [ ] **Step 9: Types and lint**

Run: `pnpm exec tsc --noEmit`
Expected: clean. (Run alone, before task 11, it also shows the four errors task 10 leaves until task 11 lands (`PaneRows`, `LancamentosToolbar`, the old `ExtratoPage`); none is in this task's files.)

Run:
```bash
pnpm exec eslint components/finance/CapitalStrip.tsx 'app/(app)/finance/page.tsx' components/finance/CashStrip.tsx components/finance/BillsCard.tsx components/finance/RecentEntriesCard.tsx components/finance/CostBreakdownCard.tsx components/finance/SeriesScopeDialog.tsx components/finance/contas/ConciliarPage.tsx components/finance/contas/AccountMovements.tsx
```
Expected: clean.

- [ ] **Step 10: The finance tests still pass**

Run: `pnpm exec vitest run --exclude '**/worktrees/**' components/finance lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/planTree.test.ts`
Expected: PASS (no test reads the copy changed here; this guards the domain the Painel now calls). The `--exclude` keeps the path filters from also collecting the copies under `.claude/worktrees/*`.


### Task 13: Whole-change review and smoke

**Files:**
- Create (outside the repo, never committed): `~/.cache/meubov-plan-2026-10-01/smoke.mjs`
- Create (outside the repo): `~/.cache/meubov-plan-2026-10-01/shots/*.png`, `~/.cache/meubov-plan-2026-10-01/server.log`
- Repo: nothing. A defect found here is fixed in the file of the task that owns it (contract, "Tasks, waves and files"), then Steps 2 and 5 run again.

**Interfaces:**
- Consumes: everything tasks 1–12 produce.
- Produces: nothing in the repo; a review verdict, the gates' output, the smoke's `N/N checks passed` and the screenshots.

The controller runs this last, after wave 4 is in. Environment pitfalls from earlier smokes on this machine (memory note "MeuBov smoke-test setup"): `127.0.0.1:5433` answers as another project's Postgres, so the smoke uses its own tmpfs container; other sessions may hold ports, so check `docker ps` and `ss -ltnp` first and move to the next free pair (5447/3017…) if 5446/3016 are taken, passing `BASE` and `DB` to the script; `next start` is not blocked by another `next dev` in the directory; Better Auth answers 429 after a handful of sign-ins a minute (the script signs in three times, minutes apart); the dev log line `[exact-mirror] TypeBox's TypeCompiler is required to use Union` is old and harmless; kill the server by the pid `ss -ltnp` shows, never `pkill -f` with the command text (it kills the tool's own shell); never pass a quoted `.claude/**` glob (the harness refuses it) — `--exclude '**/worktrees/**'` keeps vitest out of `.claude/worktrees/*`.

- [ ] **Step 1: Whole-change review**

Dispatch one reviewer (a fresh agent, model "opus", read-only) with this brief, verbatim:

````text
Review the uncommitted change in /home/luketa/meubov (branch main) against
docs/superpowers/specs/2026-10-01-financeiro-lancamentos-investimentos-design.md
and ~/.cache/meubov-plan-2026-10-01/00-contract.md. The change is
`git diff HEAD` plus the untracked files of `git status --short`. Read the spec
first, then every changed file in full. Do not edit anything. Report each
finding as `path:line — severity (blocker / should-fix / nit) — what is wrong —
what the spec or contract says`, then a one-line verdict. Check:

Scope
[ ] Every changed file is in the contract's task list (or is a listed compile fix);
    package.json and pnpm-lock.yaml are unchanged (no new dependency).
[ ] components/finance/extrato/* is gone except what moved (pills.tsx,
    components/ui/bottom-sheet.ts); nothing imports from it; no href,
    router call or import in app/ components/ lib/ points at /finance/extrato
    except the redirect page itself (comments and legacyNode tests may name it).
[ ] Out of scope stays out: no cadastro de bens, no depreciação, no contract
    behind an empréstimo (taxa, juros), no new kind created from a linha do
    extrato, no orçamento, nothing offline.

Data
[ ] entry_kind + investment, financing, partners, yield; account_group +
    investment, financing, partners; bank_account_kind + investment; new enum
    entry_flow (in, out); expenses.flow and expense_series.flow nullable;
    accounts.opening_balance_brl numeric and accounts.opening_date date, nullable.
[ ] The migration (drizzle/0024_*) has no CHECK, default or index that names a new
    enum value (Postgres refuses a value inside the transaction that adds it);
    no backfill; meta/_journal.json updated.
[ ] Types and mappers carry EntryKind, EntryFlow, AccountGroup, Expense.flow,
    Account.openingBalanceBrl/openingDate, BankAccountKind "investment".
[ ] A row of a new kind stores category = 'other' and no lot; a yield stores
    flow = null, account_id = null, due_date = null, paid_at = date and its
    aplicação in bank_account_id.

Rules
[ ] Direction: entryFlow is "in" for receita and rendimento, "out" for despesa,
    e.flow for the three capital kinds, "out" when a capital row has no flow.
[ ] Everything that follows money reads the direction and takes every kind:
    saldo of a conta bancária, caixa do período (cashSummary), contas a pagar e a
    receber (pendingBills), "Marcar como pago / recebido" and its toast, the status
    words, the conciliação's candidate side and ResolveLine's side check.
    grep -rn 'kind === "revenue"\|kind === "expense"\|kind !== "revenue"' app components lib
    — every remaining hit decides by the kind itself (the Receita form, the COE),
    never a direction.
[ ] Resultado: the COE counts only kind = expense (isCost), the receita only
    kind = revenue (isRevenue) — indicators, composição, custo por lote, receita ×
    custo (monthly series), the Despesas export and the reports; nothing reads
    "not a receita".
[ ] What a lançamento needs: a capital kind needs a conta do plano of its own
    group and farm, and a movimento, and has no grupo or lote; a rendimento needs
    an aplicação of this farm as its conta bancária, paidAt = date, no conta, no
    vencimento, no repetição; a despesa/receita may not take a conta of a capital
    group. Refusals: invalid_account, invalid_bank_account; invalid_opening for a
    saldo inicial without its date (or the reverse) or outside Financiamentos.
[ ] Pago por: a cartão pays a despesa or the compra of an investimento, nothing
    else; an aplicação never appears in "Pago por" (mayPayFrom, payingAccounts,
    isPayingAccount agree).
[ ] Saldo em contas counts contas correntes, caixas and aplicações; cartões out.
[ ] Saldo devedor on a day = saldo inicial (0 when none) + liberações received −
    pagamentos paid, each by its payment day, after opening_date and up to the
    day; the group's = sum of its contas not archived.
[ ] Tree figures: conta bancária = saldo today (cartão: owed, negative); Bancos e
    caixa = saldo em contas; Investimentos conta = compras − vendas do bem by date,
    Compra de gado = the manejos' compras, group = sum; Financiamentos = saldo
    devedor today; Sócios = retiradas − aportes by date; Despesas grupo/conta =
    despesas by date with treatments under Sanidade, "Despesas" = COE; Receitas
    conta = receitas by date, Venda de gado = vendas, group = sum. Zero shows "—".
    An archived conta appears only while it has a line in the window.
[ ] Rows of a nó: a conta bancária = its movimentação by payment day with the
    saldo after each line; any other nó = its lançamentos and automatic rows by
    date in the window, newest first; a financiamento shows the saldo devedor
    after each paid line.
[ ] Parcelar: only a pending lançamento outside a série and not a rendimento;
    2–48; split as a new parcelamento (installmentPlan, the last absorbs the
    centavos); the first parcela keeps its id and anexos.
[ ] Duplicar: "Novo lançamento" filled from the picked row, dated today, pending,
    no anexos, no repetição.
[ ] Access: reads Financeiro view, writes Financeiro edit (including
    "POST /api/herd/expenses/:id/split": edit("finance")), every query filtered by
    farm; without Financeiro the load carries no lançamento of any kind and no
    saldo inicial (redactHerdMoney strips openingBalanceBrl/openingDate).

UI
[ ] Sub-navigation Painel · Lançamentos · Contas bancárias. /finance/extrato
    redirects to /finance/lancamentos keeping de, ate, q, lote, status and turning
    conta, grupo, tipo into the nó (legacyNode).
[ ] /finance/lancamentos md+: header with period and Exportar; the toolbar; the
    tree (search, Todos os lançamentos, the six groups with their tags and
    figures, "+" Nova conta, the gear to Configurações › Plano de contas, the nó
    in ?conta, groups open and close in place); the pane (crumb, name with kind
    pills, its own actions — Transferir and Importar extrato on a conta bancária,
    Lançar rendimento on an aplicação —, four figures per kind of nó as the spec
    lists them plus the "% quitado" bar on a financiamento, Extrato | Detalhado,
    lote filter, Só pendentes, search); Extrato and Detalhado columns as the spec
    lists; 50 rows a page.
[ ] Toolbar: Novo · Editar · Excluir · Marcar como pago · Parcelar · Duplicar ·
    Imprimir; a row picked by its radio; what does not apply is disabled; a row of
    the manejos takes only its conta bancária; Novo starts on the picked nó
    (entryInitialFor); Imprimir prints the rows shown.
[ ] Phone: no nó = the tree; a nó opens its pane with "Plano de contas" to go back;
    a row opens the sheet with the same actions; "Lançar" floats over the tab bar.
    Targets ≥ 44 px; real buttons, links, labels; aria-label on icon buttons.
[ ] Novo lançamento: Despesa · Receita · Investimento · Financiamento · Sócios; the
    three new ones show the "fora do custo e do resultado" line, Conta (required,
    "+ nova conta") and Movimento, and hide Grupo and Lote. Lançar rendimento:
    data, valor, observação.
[ ] Nova conta: "Onde ela fica no plano" — Banco ou caixa (continues in the conta
    bancária form, now with Aplicação), Investimento, Financiamento (Saldo devedor
    inicial + Em), Sócios, Despesa (asks the grupo), Receita.
[ ] Configurações › Plano de contas: the three groups under "Fora do resultado"; a
    financiamento shows and edits its saldo inicial; "Sugerir contas padrão" also
    offers Benfeitorias, Máquinas e implementos, Equipamentos, Distribuição de lucro.
[ ] Contas bancárias: Aplicação as a kind in the cards and in the saldo.
[ ] Painel: "Capital, dívidas e sócios" under the caixa — Investido no período,
    Aplicações (saldo and rendimento), Saldo devedor, Retirado pelos sócios — each
    opening its nó, hidden while all four are zero; the caixa and Contas a pagar /
    a receber carry every kind.

Review Focus (each needs a test where named)
[ ] 1. A nó in the URL that no longer exists or is malformed (conta:<deleted>,
       banco:, grupo:nope) does not crash: parseNode → null or nodeSummary → null,
       and the page falls back to "todos" (tests in tasks 6 and 10).
[ ] 2. Saldo devedor ignores a liberação still pending and every line paid on or
       before the conta's opening date (test in task 6).
[ ] 3. Old links keep working: legacyNode for grupo=capital, tipo=treatment,
       conta=<account id>, status=overdue and unknown values (tasks 6 and 10).
[ ] 4. Parcelar: a total whose centavos do not divide, more parcelas than
       centavos, a paid row, a row of a série, a rendimento (task 4).
[ ] 5. A capital lançamento with no flow, an inflow sent to a cartão, and a PATCH
       that changes the kind while the conta still belongs to the old group (task 4).

Did not move
[ ] The Placar (resultado, COE, desembolso), the composição de custos and the
    custo por lote read exactly what they read before: economics.ts,
    lotEconomics.ts and CostBreakdownCard's accountTotals use isCost/isRevenue,
    and their existing tests pass unchanged apart from added cases.
````

Expected: a verdict with no blocker. Fix every blocker and should-fix in the owning task's files (the contract says which), then go on. Nits are listed in the final report, not fixed here.

- [ ] **Step 2: Gates**

Run, in `/home/luketa/meubov`:
```bash
pnpm exec tsc --noEmit
pnpm exec eslint $( { git diff --name-only --diff-filter=d HEAD -- app components lib; git ls-files --others --exclude-standard -- app components lib; } | grep -E '\.(ts|tsx|mjs)$' | sort -u )
pnpm exec vitest run --exclude '**/worktrees/**' lib components
pnpm build
git diff --stat HEAD -- package.json pnpm-lock.yaml
ls components/finance/extrato 2>/dev/null; grep -rn 'finance/extrato' app components lib
```
Expected: tsc prints nothing; eslint prints nothing; vitest reports every file passed (the two route snapshots included); the build exits 0 and its route list shows `/finance/lancamentos` and `/finance/extrato`; the `git diff --stat` line is empty; `ls` prints nothing (the folder is gone) and no `href`, router call or import found by the grep points at `/finance/extrato` — what remains is the redirect page itself, comments, and tests of `legacyNode`.

- [ ] **Step 3: Throwaway database, server, owner, seed**

Check the ports first:
```bash
docker ps --format '{{.Names}} {{.Ports}}'
ss -ltnp | grep -E ':(5446|3016) '
```
Expected: no `meubov-lancamentos-db`, nothing on 5446 or 3016 (otherwise take the next free pair, e.g. 5447/3017, and use it below and in `BASE`/`DB`).

Database, migrated from zero:
```bash
docker run --rm -d --name meubov-lancamentos-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov \
  -p 127.0.0.1:5446:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
until docker exec meubov-lancamentos-db pg_isready -U meubov >/dev/null 2>&1; do sleep 1; done; sleep 2
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:migrate
docker exec meubov-lancamentos-db psql -U meubov -tA -c "select enum_range(null::entry_kind), enum_range(null::entry_flow), enum_range(null::bank_account_kind)"
```
Expected: `migrations applied successfully!` (0000 → 0024), then `{expense,revenue,investment,financing,partners,yield}|{in,out}|{checking,cash,card,investment}`.

Server on the build from Step 2 (`pnpm build`; it reads `.env.local` of the main checkout — never edit it, the overrides go on the command line). Start it in the background (the Bash tool's `run_in_background`):
```bash
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov BETTER_AUTH_URL=http://localhost:3016 \
  pnpm exec next start -p 3016 > ~/.cache/meubov-plan-2026-10-01/server.log 2>&1
```
Then wait for it, create the owner and seed the farm:
```bash
until curl -s -o /dev/null -w '%{http_code}' http://localhost:3016/api/auth/ok | grep -q 200; do sleep 1; done
curl -s -X POST http://localhost:3016/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3016' \
  -d '{"name":"Teste Lançamentos","email":"teste.lancamentos@meubov.local","password":"Lancamentos2026!"}'
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:seed --email teste.lancamentos@meubov.local
```
Expected: `Seeded farm "Fazenda Boa Vista" (id 1) for teste.lancamentos@meubov.local: 41 animals, … 29 accounts, 52 expenses.` (Sign-up answers 200 even for an e-mail that exists; the script's sign-in is the real check.) The seed already holds Benfeitorias, Equipamentos, Máquinas e implementos (Investimentos) and Distribuição de lucro (Sócios); the script creates its own contas under other names.

- [ ] **Step 4: The smoke script**

Save this as `~/.cache/meubov-plan-2026-10-01/smoke.mjs` (headless Playwright from the npx cache, chromium 1243). It was run against the finished change (a sandbox clone with tasks 1–12) and passes 269/269; its locators are the real ones (toolbar `role="toolbar"` "Ações do lançamento"; tree rows are links under `section[aria-labelledby="plan-tree-title"]` whose text is label + tag + figure, `aria-current="true"` on the picked one; chevrons "Abrir X"/"Fechar X"; "+" = "Nova conta"; row radios "Selecionar <history>, <detail>, dd/mm/aaaa"; radiogroup "Visão"; "Filtrar por lote", "Só pendentes", "Buscar no histórico"; the quitado bar is `role="meter"`). Desktop runs at 1440 (the two columns start at xl), the phone at 390.

What it covers, in order: the Painel before anything (Placar, caixa, no capital strip); Sicredi (principal), Caixa and a Cartão by API and an Aplicação through Contas bancárias › Nova conta (and the refusal of an aplicação as principal); one conta in each new group through the tree's "+" (Consórcio trator with saldo devedor inicial 50.000, Implementos agrícolas, Acertos de partilha) and the `invalid_opening` refusals; the compra parcelada (3 × 10.000, first paid) through Novo on the conta's nó, with "Pago por" offering the cartão and never the aplicação; by API a liberação (30.000), two pagamentos (2 × 5.000, first paid), a retirada recorrente (4.000/mês on Distribuição de lucro), an aporte (5.000 into the caixa, on Acertos de partilha), a pending compra (1.000 on Benfeitorias) and a transferência of 20.000 into the aplicação, plus every refusal of the spec's use-case list and Review Focus 5; a rendimento of 250 through the aplicação's "Lançar rendimento" in Lançamentos and one of 100 through Contas bancárias; the tree (every figure, tags, picked nó, open/close, search with accents); each pane's strip and rows (todos, Sicredi with contra partida and running saldo, aplicação, financiamento with saldo devedor and the meter, investimento Extrato/Detalhado with the filters, the four top groups); the broken nós (`conta:nope`, `banco:`, `grupo:nope`, `banco:nope`); the Painel strip (values, subs, links, one row, under the caixa), the caixa deltas and Contas a pagar against the database; phone 390 (Painel, tree, conta, row sheet and one of its actions); the toolbar's seven actions and what each disables (a paid row, a parcela of a série, a venda of the manejos); the Painel again with the Placar, composição, por lote and receita × custo byte-for-byte unchanged; the old Extrato links; Configurações › Plano de contas; a consultor (Financeiro view: values, toolbar with Imprimir only, no "Nova conta", 403 on write and on Parcelar) and a vaqueiro (no Financeiro: empty money and no saldo inicial in `/api/herd`, Porteira fechada, 403 on Parcelar); no page or console error from the app. Every page also checks that nothing scrolls sideways, that no figure is clipped and that no strip or conta text is cut.

```js
// Smoke of "Lançamentos pelo plano de contas e investimentos" against `next start` on a throwaway database.
// Usage: BASE=http://localhost:3016 DB=meubov-lancamentos-db node ~/.cache/meubov-plan-2026-10-01/smoke.mjs
// Needs a fresh database (migrated from zero, owner signed up, farm seeded): every run writes its own
// lançamentos, so a second run on the same database doubles them and the figures stop matching.
// Do not start it a few minutes before midnight: "today" must not change during the run.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const require = createRequire(`${homedir()}/.npm/_npx/705bc6b22212b352/node_modules/`);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3016";
const DB = process.env.DB ?? "meubov-lancamentos-db";
const OUT = process.env.OUT ?? `${homedir()}/.cache/meubov-plan-2026-10-01/shots`;
mkdirSync(OUT, { recursive: true });

const OWNER = { email: "teste.lancamentos@meubov.local", password: "Lancamentos2026!" };
const VIEWER = { name: "Teste Consultor", email: "teste.lancamentos.consultor@meubov.local", password: "Consultor2026!" };
const HAND = { name: "Teste Vaqueiro", email: "teste.lancamentos.vaqueiro@meubov.local", password: "Vaqueiro2026!" };
// PRESETS of lib/domain/permissions.ts: the consultor sees Financeiro, the vaqueiro does not.
const CONSULTOR = { herd: "view", manejo: "view", reproduction: "view", sanitary: "view", lots: "view", finance: "view", farm: "view", team: "none" };
const VAQUEIRO = { herd: "edit", manejo: "edit", reproduction: "edit", sanitary: "edit", lots: "edit", finance: "none", farm: "view", team: "none" };
const DESK = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

// ---- dates, numbers, SQL ---------------------------------------------------
const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
const day = (offset) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return iso(d);
};
// After the seed's last compra de gado (Mar/2026), so "gado" is 0 and the Painel strip starts hidden.
const DE = day(-180);
const ATE = TODAY;
const PERIOD = `de=${DE}&ate=${ATE}`;
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ddmmyyyy = (d) => `${ddmm(d)}/${d.slice(0, 4)}`;
const norm = (s) => String(s).replace(/[  ]/g, " ");
const money = (n) => norm(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n));
const whole = (n) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "R$ 1.234,56", "-R$ 10,00", "−3.240" → number. */
const parseBR = (s) => Number(norm(s).replace(/R\$\s?/, "").replace("−", "-").replace(/\./g, "").replace(",", "."));
const sql = (q) =>
  execSync(`docker exec -i ${DB} psql -U meubov -d meubov -tA -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

// ---- checks ----------------------------------------------------------------
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const eq = (want) => Object.assign((got) => got === want, { want });
const near = (want) => Object.assign((got) => typeof got === "number" && Math.abs(got - want) < 1, { want });
const like = (re) => Object.assign((got) => re.test(String(got)), { want: re });
/** Polls `probe` until `ok` holds or 10 s pass: the store hydrates after the page paints. */
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

// ---- browser, sessions -----------------------------------------------------
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
  // No live arroba quote: every @-priced figure reads "—" in both Placar snapshots.
  await context.route("**/api/market/quote", (route) => route.abort());
  await context.addInitScript((farm) => {
    try {
      localStorage.setItem("meubov.activeFarmId", String(farm));
    } catch {}
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
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

// ---- page helpers ----------------------------------------------------------
const dialog = () => page.getByRole("dialog").last();
const toast = (text) =>
  page
    .locator("[data-sonner-toast]", { hasText: text })
    .first()
    .waitFor({ timeout: 10000 })
    .then(() => true, () => false);
const toolbar = (pg = page) => pg.getByRole("toolbar", { name: "Ações do lançamento" });
const treeSection = (pg = page) => pg.locator('section[aria-labelledby="plan-tree-title"]');
const tableRows = (pg = page) => pg.locator("main table tbody tr").locator("visible=true");
/** Picks a row by its radio: "Selecionar <history>, <detail>, dd/mm/aaaa". */
const pickRow = (name) =>
  page.getByRole("radio", { name: typeof name === "string" ? new RegExp(`^Selecionar ${esc(name)},`) : name }).first().check();
async function goLanc(conta = "", extra = "") {
  await page.goto(`${BASE}/finance/lancamentos?${PERIOD}${conta ? `&conta=${conta}` : ""}${extra}`);
  await page.getByRole("heading", { name: "Lançamentos", exact: true }).first().waitFor();
}
const scrollWidth = (pg = page) => pg.evaluate(() => document.documentElement.scrollWidth);
const mainText = async (pg = page) => norm(await pg.locator("main").innerText());
const shot = (name, pg = page, fullPage = true) => pg.screenshot({ path: `${OUT}/${name}.png`, fullPage });

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
/** Text of the strips (pane, caixa, capital) and of the Plano de contas rows that a truncate cuts. */
const STRIPS = 'main dl dt, main dl dd, section[aria-label="Caixa do período"] p, main li > a span.block, main li > span';
const cutText = (pg = page) =>
  pg.evaluate(
    (sel) => [...document.querySelectorAll(sel)].filter((el) => el.checkVisibility() && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim()),
    STRIPS
  );
async function layoutOk(name, width, pg = page) {
  const sw = await scrollWidth(pg);
  check(`${name}: nothing scrolls sideways at ${width}`, sw <= width + 1, String(sw));
  const cut = await clippedFigures(pg);
  check(`${name}: no figure clipped at ${width}`, cut.length === 0, cut.join(" | "));
  const words = await cutText(pg);
  check(`${name}: no strip or conta text cut at ${width}`, words.length === 0, words.join(" | "));
}

/** A strip figure: the first visible label whose next line is money, with that value and the line under it. */
const figure = (label, pg = page) =>
  pg.evaluate((label) => {
    const clean = (s) => s.replace(/[  ]/g, " ");
    for (const el of document.querySelectorAll("main *")) {
      if (el.childElementCount > 0 || clean(el.textContent).trim() !== label || !el.checkVisibility()) continue;
      const lines = clean(el.parentElement.innerText).split("\n").map((l) => l.trim()).filter(Boolean);
      const at = lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
      if (at >= 0 && /^-?R\$/.test(lines[at + 1] ?? "")) return { value: lines[at + 1], sub: lines[at + 2] ?? null };
    }
    return null;
  }, label);
const value = async (label, pg) => (await figure(label, pg))?.value ?? null;
const sub = async (label, pg) => (await figure(label, pg))?.sub ?? null;

/** A tree row's figure: the visible link of the plano de contas whose first line is the label; 0 for "—", null when not shown. */
const treeAmount = (label, pg = page) =>
  pg.evaluate((label) => {
    for (const el of document.querySelectorAll('section[aria-labelledby="plan-tree-title"] a')) {
      if (!el.checkVisibility()) continue;
      const lines = el.innerText.replace(/[  ]/g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines[0] !== label || lines.length < 2) continue;
      const last = lines[lines.length - 1];
      if (last === "—") return 0;
      if (/^[−-]?[\d.]+(,\d+)?$/.test(last)) return Number(last.replace("−", "-").replace(/\./g, "").replace(",", "."));
    }
    return null;
  }, label);

/** What must not move: the Placar's resultado and desembolso cards, composição, por lote, receita × custo. */
const placar = () =>
  page.evaluate(() => {
    const clean = (s) => s.replace(/[  ]/g, " ");
    const card = (label) => {
      const p = [...document.querySelectorAll("main p")].find((x) => x.textContent.trim() === label);
      return p ? clean(p.parentElement.innerText) : null;
    };
    const section = (title) => {
      const h = [...document.querySelectorAll("main h2")].find((x) => x.textContent.trim() === title);
      return h ? clean(h.closest("section").innerText) : null;
    };
    return {
      resultado: card("Resultado do período"),
      desembolso: card("Desembolso por cabeça"),
      composicao: section("Composição de custos"),
      porLote: section("Por lote"),
      receitaCusto: section("Receita × Custo"),
    };
  });

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
const bank = (name) => sql(`select id from bank_accounts where farm_id = ${FARM} and name = '${name}'`);
const plan = (name) => sql(`select id from accounts where farm_id = ${FARM} and name = '${name}'`);
const entryId = (where) =>
  sql(`select id from expenses where farm_id = ${FARM} and ${where} order by series_index nulls first limit 1`);

let before = null;
let cashBefore = null;
let capitalBefore = 0;
// Contas bancárias, contas do plano (INV, CONSORCIO, PARTILHA through the UI; BENF and DIST from the seed), lançamentos.
let SICREDI, CAIXA, CARTAO, APL, CONSORCIO, INV, PARTILHA, BENF, DIST, REFORMA, LIBERACAO, APORTE, YIELD, PARCELA;
let RETIRADAS = 0;
let NEXT_DUE = "";
let CATTLE = 0;
let COE = "";
let RECEITA = "";
let RESULT = 0;

// ---- 1. The Painel before any capital lançamento ---------------------------
await step("Painel before", async () => {
  await page.goto(`${BASE}/finance?${PERIOD}`);
  await eventually(
    "Painel loaded (COE > 0)",
    async () => parseBR((await placar()).resultado?.match(/COE (-?R\$ [\d.,]+)/)?.[1] ?? "0"),
    (n) => n > 0
  );
  before = await placar();
  COE = before.resultado?.match(/COE (-?R\$ [\d.,]+)/)?.[1] ?? "";
  RECEITA = before.resultado?.match(/receita (-?R\$ [\d.,]+)/)?.[1] ?? "";
  RESULT = parseBR(before.resultado?.match(/-?R\$ [\d.,]+/)?.[0] ?? "0");
  cashBefore = { received: parseBR(await value("Recebido")), paid: parseBR(await value("Pago")) };
  capitalBefore = await page.getByRole("heading", { name: "Capital, dívidas e sócios" }).count();
  const text = await mainText();
  check("caixa sub-lines say every kind", text.includes("tudo o que entrou") && text.includes("tudo o que saiu"));
});

// ---- 2. Contas bancárias: three by API, the aplicação through Nova conta ----
await step("contas bancárias", async () => {
  await postOk("/bank-accounts", { kind: "checking", name: "Sicredi", openingBalanceBrl: 100000, openingDate: day(-90), isMain: true }, "conta corrente Sicredi (principal)");
  await postOk("/bank-accounts", { kind: "cash", name: "Caixa da fazenda", openingBalanceBrl: 0, openingDate: day(-90) }, "caixa");
  SICREDI = bank("Sicredi");
  CAIXA = bank("Caixa da fazenda");
  await postOk("/bank-accounts", { kind: "card", name: "Cartão Sicredi", openingDate: day(-90), closingDay: 25, dueDay: 5, paysFromId: SICREDI }, "cartão");
  CARTAO = bank("Cartão Sicredi");

  await page.goto(`${BASE}/finance/contas`);
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  await dialog().waitFor();
  await dialog().getByRole("radio", { name: "Aplicação", exact: true }).click();
  await dialog().locator("#bank-name").fill("Aplicação RDC");
  await dialog().locator("#bank-opening").fill("0");
  await dialog().locator("#bank-opening-date").fill(day(-90));
  await dialog().getByRole("button", { name: "Criar conta" }).click();
  check("aplicação created through Contas bancárias › Nova conta", await toast('Conta "Aplicação RDC" criada'));
  APL = bank("Aplicação RDC");
  check("the aplicação is a conta bancária of kind investment, never principal", sql(`select kind || '/' || is_main from bank_accounts where id = '${APL}'`) === "investment/false");
  await refused("an aplicação cannot be the conta principal", "/bank-accounts", { kind: "investment", name: "Aplicação 2", openingBalanceBrl: 0, openingDate: day(-1), isMain: true }, 400, "investment_cannot_be_main");
});

// ---- 3. Contas do plano: one in each new group through the tree's "+" ---------
await step("contas do plano", async () => {
  BENF = plan("Benfeitorias");
  DIST = plan("Distribuição de lucro");
  check("the seed brings Benfeitorias and Distribuição de lucro", BENF !== "" && DIST !== "");
  await goLanc();
  async function newPlanAccount(place, name, opening) {
    await treeSection().getByRole("button", { name: "Nova conta", exact: true }).click();
    await dialog().getByText("Onde ela fica no plano").waitFor();
    await dialog().getByText(place, { exact: true }).first().click();
    await dialog().getByLabel("Nome", { exact: true }).fill(name);
    if (opening) {
      await dialog().getByLabel("Saldo devedor inicial (R$)").fill(opening.amount);
      await dialog().getByLabel("Em", { exact: true }).fill(opening.on);
      await page.waitForTimeout(400); // the place cards' colour transition
      await shot("desk-nova-conta", page, false);
    }
    await dialog().getByRole("button", { name: "Criar conta" }).click();
    await dialog().waitFor({ state: "hidden" });
  }
  await newPlanAccount("Financiamento", "Consórcio trator", { amount: "50.000,00", on: day(-90) });
  await newPlanAccount("Investimento", "Implementos agrícolas");
  await newPlanAccount("Sócios", "Acertos de partilha");
  CONSORCIO = plan("Consórcio trator");
  INV = plan("Implementos agrícolas");
  PARTILHA = plan("Acertos de partilha");
  check(
    "financiamento conta keeps its saldo devedor inicial",
    sql(`select "group" || '/' || opening_balance_brl::float8 || '/' || opening_date from accounts where id = '${CONSORCIO}'`) ===
      `financing/50000/${day(-90)}`
  );
  check("investimento conta", sql(`select "group" from accounts where id = '${INV}'`) === "investment");
  check("sócios conta", sql(`select "group" || '/' || coalesce(opening_balance_brl::text, 'null') from accounts where id = '${PARTILHA}'`) === "partners/null");
  await eventually("the tree shows the three new contas", async () => [await treeAmount("Consórcio trator"), await treeAmount("Implementos agrícolas"), await treeAmount("Acertos de partilha")].join("/"), eq("50000/0/0"));
  await refused("a saldo inicial outside Financiamentos is refused", "/accounts", { group: "partners", name: "Outra partilha", openingBalanceBrl: 10, openingDate: day(-1) }, 400, "invalid_opening");
  await refused("a saldo inicial without its date is refused", "/accounts", { group: "financing", name: "Custeio", openingBalanceBrl: 10 }, 400, "invalid_opening");
});

// ---- 4. The compra parcelada through Novo on the conta's nó ----------------
await step("compra parcelada", async () => {
  await goLanc(`conta:${INV}`);
  await page.getByRole("heading", { name: "Implementos agrícolas" }).first().waitFor();
  await toolbar().getByRole("button", { name: "Novo", exact: true }).click();
  await dialog().getByRole("heading", { name: "Novo lançamento" }).waitFor();
  const kinds = await dialog().getByRole("radiogroup", { name: "Tipo de lançamento" }).getByRole("radio").allTextContents();
  check("Novo lançamento: Despesa · Receita · Investimento · Financiamento · Sócios", kinds.join(" · ") === "Despesa · Receita · Investimento · Financiamento · Sócios", kinds.join(" · "));
  check("Novo on a conta starts as Investimento", (await dialog().getByRole("radio", { name: "Investimento", exact: true }).getAttribute("aria-checked")) === "true");
  check("… movimento Compra", (await dialog().getByRole("radio", { name: "Compra", exact: true }).getAttribute("aria-checked")) === "true");
  check("… on the picked conta", (await dialog().locator("#entry-account").innerText()).includes("Implementos agrícolas"));
  check("… says it stays out of the custo", await dialog().getByText(/fora do custo \(COE\) e do resultado/).first().isVisible());
  check("… without Grupo and Lote", (await dialog().locator("#entry-category, #entry-lot").count()) === 0);
  await dialog().locator("#entry-date").fill(day(-15));
  await dialog().locator("#entry-amount").fill("30.000,00");
  await dialog().getByRole("radio", { name: "Parcelado", exact: true }).click();
  await dialog().locator("#repeat-count").fill("3");
  await dialog().locator("#repeat-first").fill(day(-15));
  await dialog().getByRole("checkbox", { name: /^Já pago/ }).check();
  await dialog().getByLabel("Data do pagamento").fill(day(-15));
  check("Pago por starts on the conta principal", (await dialog().locator("#entry-paid-by").innerText()).includes("Sicredi"));
  await dialog().locator("#entry-paid-by").click();
  const payers = await page.getByRole("option").allTextContents();
  await page.keyboard.press("Escape");
  check("Pago por never offers the aplicação", payers.length > 0 && !payers.some((o) => o.includes("Aplicação RDC")), payers.join(" | "));
  check("a compra de bem may go on the cartão", payers.some((o) => o.includes("Cartão Sicredi")), payers.join(" | "));
  await dialog().locator("#entry-counterparty").fill("Agro Máquinas");
  check("the preview splits 30.000 in three", norm(await dialog().getByRole("list", { name: "Parcelas" }).innerText()).split(money(10000)).length === 4, norm(await dialog().getByRole("list", { name: "Parcelas" }).innerText()));
  await dialog().evaluate((el) => el.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot("desk-novo-lancamento", page, false);
  await layoutOk("Novo lançamento", 1440);
  await dialog().getByRole("button", { name: "Lançar 3 parcelas" }).click();
  check("compra parcelada lançada", await toast("Parcelas lançadas"));
  check(
    "three parcelas of the conta, out, no grupo, no lote, the first paid",
    sql(`select count(*) || '/' || sum(amount_brl)::float8 || '/' || count(paid_at) || '/' ||
         count(*) filter (where flow = 'out' and category = 'other' and lot_id is null and account_id = '${INV}')
         from expenses where kind = 'investment' and counterparty = 'Agro Máquinas'`) === "3/30000/1/3"
  );
  check(
    "… paid from the conta principal",
    sql(`select bank_account_id from expenses where kind = 'investment' and counterparty = 'Agro Máquinas' and paid_at is not null`) === SICREDI
  );
});

// ---- 5. The rest by API, and what the API refuses -------------------------
await step("lançamentos by API", async () => {
  const entry = (body, label) => postOk("/expenses", { category: "other", ...body }, label);
  await entry({ kind: "financing", flow: "in", accountId: CONSORCIO, date: day(-30), amountBrl: 30000, paidAt: day(-30), bankAccountId: SICREDI, counterparty: "Liberação do consórcio" }, "liberação");
  await entry({ kind: "financing", flow: "out", accountId: CONSORCIO, date: day(-5), amountBrl: 10000, paidAt: day(-5), bankAccountId: SICREDI, counterparty: "Consórcio Sicredi", repeat: { mode: "installments", count: 2, frequency: "monthly", startsOn: day(-5) } }, "two pagamentos, the first paid");
  await entry({ kind: "partners", flow: "out", accountId: DIST, date: day(-45), amountBrl: 4000, paidAt: day(-45), bankAccountId: SICREDI, counterparty: "Retirada mensal", repeat: { mode: "recurring", frequency: "monthly", startsOn: day(-45) } }, "retirada recorrente");
  await entry({ kind: "partners", flow: "in", accountId: PARTILHA, date: day(-10), amountBrl: 5000, paidAt: day(-10), bankAccountId: CAIXA, counterparty: "Aporte do sócio" }, "aporte");
  await entry({ kind: "investment", flow: "out", accountId: BENF, date: day(-3), dueDate: day(30), amountBrl: 1000, counterparty: "Reforma do curral" }, "a pending compra (parcelada later)");
  await postOk("/transfers", { fromId: SICREDI, toId: APL, date: day(-25), amountBrl: 20000, notes: "Aplicação" }, "transferência para a aplicação");
  LIBERACAO = entryId("counterparty = 'Liberação do consórcio'");
  APORTE = entryId("counterparty = 'Aporte do sócio'");
  REFORMA = entryId("counterparty = 'Reforma do curral'");
  PARCELA = entryId("counterparty = 'Agro Máquinas' and paid_at is null"); // pending, but in a série
  check("pagamentos: 2 × 5.000, the first paid", sql(`select count(*) || '/' || max(amount_brl)::float8 || '/' || count(paid_at) from expenses where counterparty = 'Consórcio Sicredi'`) === "2/5000/1");

  await refused("an investimento without conta is refused", "/expenses", { kind: "investment", flow: "out", category: "other", date: day(-1), amountBrl: 10 }, 400, "invalid_account");
  await refused("a despesa on a conta of Investimentos is refused", "/expenses", { kind: "expense", category: "nutrition", accountId: INV, date: day(-1), amountBrl: 10 }, 400, "invalid_account");
  await refused("a financiamento on a conta of Sócios is refused", "/expenses", { kind: "financing", flow: "in", category: "other", accountId: DIST, date: day(-1), amountBrl: 10 }, 400, "invalid_account");
  await refused("a cartão refuses a retirada", "/expenses", { kind: "partners", flow: "out", category: "other", accountId: DIST, date: day(-1), amountBrl: 10, paidAt: day(-1), bankAccountId: CARTAO }, 400, "invalid_bank_account");
  await refused("an entrada never goes to a cartão", "/expenses", { kind: "investment", flow: "in", category: "other", accountId: INV, date: day(-1), amountBrl: 10, paidAt: day(-1), bankAccountId: CARTAO }, 400, "invalid_bank_account");
  await refused("the aplicação never pays a compra", "/expenses", { kind: "investment", flow: "out", category: "other", accountId: INV, date: day(-1), amountBrl: 10, paidAt: day(-1), bankAccountId: APL }, 400, "invalid_bank_account");
  await refused("a rendimento outside an aplicação is refused", "/expenses", { kind: "yield", category: "other", date: day(-1), amountBrl: 10, paidAt: day(-1), bankAccountId: SICREDI }, 400, "invalid_bank_account");
  await refused("a new kind while the conta stays in the old grupo is refused", `/expenses/${APORTE}`, { kind: "investment" }, 400, "invalid_account", "PATCH");
  const noFlow = await api("POST", "/expenses", { kind: "partners", category: "other", accountId: DIST, date: day(-1), amountBrl: 1, counterparty: "Sem movimento" });
  const noFlowId = entryId("counterparty = 'Sem movimento'");
  check("a capital lançamento without movimento is a saída", noFlow.ok() && sql(`select flow from expenses where id = '${noFlowId}'`) === "out");
  await api("DELETE", `/expenses/${noFlowId}`);
  check("… and is removed again", sql(`select count(*) from expenses where counterparty = 'Sem movimento'`) === "0");
});

// ---- 6. Rendimentos: from the aplicação's pane and from Contas bancárias ---
await step("rendimento from Lançamentos", async () => {
  await goLanc(`banco:${APL}`);
  await page.getByRole("button", { name: "Lançar rendimento" }).click();
  await dialog().getByRole("heading", { name: "Lançar rendimento" }).waitFor();
  await dialog().locator("#yield-date").fill(day(-1));
  await dialog().locator("#yield-amount").fill("250,00");
  await dialog().locator("#yield-notes").fill("Rendimento de setembro");
  await dialog().getByRole("button", { name: "Lançar", exact: true }).click();
  check("rendimento lançado", await toast("Rendimento lançado"));
  await eventually(
    "rendimento on the aplicação: paid that day, no conta, no vencimento, no movimento",
    async () =>
      sql(`select count(*) from expenses where kind = 'yield' and bank_account_id = '${APL}' and date = '${day(-1)}'
           and paid_at = date and account_id is null and due_date is null and flow is null and amount_brl = 250`),
    eq("1")
  );
  YIELD = entryId("kind = 'yield'");
});

await step("rendimento from Contas bancárias", async () => {
  await page.goto(`${BASE}/finance/contas`);
  await page.getByRole("group", { name: "Contas" }).getByRole("button", { name: /Aplicação RDC/ }).click();
  await page.getByRole("button", { name: "Lançar rendimento" }).click();
  await dialog().locator("#yield-date").fill(day(-2));
  await dialog().locator("#yield-amount").fill("100,00");
  await dialog().getByRole("button", { name: "Lançar", exact: true }).click();
  check("rendimento lançado from Contas bancárias", await toast("Rendimento lançado"));
  await eventually("… on the aplicação", async () => sql(`select count(*) || '/' || sum(amount_brl)::float8 from expenses where kind = 'yield' and bank_account_id = '${APL}'`), eq("2/350"));
  await eventually("Contas bancárias: Saldo em contas takes the aplicação", async () => (await mainText()).match(/Saldo em contas\s*(R\$ [\d.,]+)/i)?.[1] ?? null, eq(money(91000 + 5000 + 20350)));
  check("Contas bancárias: 2 contas e 1 aplicação", (await mainText()).includes("2 contas e 1 aplicação"));
  await shot("desk-contas-bancarias");
  await layoutOk("Contas bancárias", 1440);
});

// ---- expected figures, from what was written ------------------------------
await step("expectations", async () => {
  RETIRADAS = Number(sql(`select count(*) from expenses where kind = 'partners' and flow = 'out' and date between '${DE}' and '${ATE}'`));
  NEXT_DUE = sql(`select coalesce(due_date, date) from expenses where kind = 'financing' and flow = 'out' and paid_at is null order by 1 limit 1`);
  CATTLE = Number(
    sql(`select coalesce((select sum(total_amount_brl) from manejo_sessions where farm_id = ${FARM} and kind = 'entry'
           and status = 'closed' and deleted_at is null and date between '${DE}' and '${ATE}'), 0)
         + coalesce((select sum(amount_brl) from movements where farm_id = ${FARM} and type = 'purchase'
           and date between '${DE}' and '${ATE}'), 0)`)
  );
  check("expectations read", RETIRADAS >= 1 && NEXT_DUE !== "", `${RETIRADAS} retiradas, next due ${NEXT_DUE}, gado ${CATTLE}`);
});
// Sicredi 100.000 + 30.000 liberação − 10.000 compra − 5.000 pagamento − 4.000 retirada − 20.000 aplicação.
const SICREDI_TODAY = 91000;
const APL_TODAY = 20350; // 20.000 transferidos + 250 + 100 de rendimento
const BANKS_TODAY = SICREDI_TODAY + 5000 + APL_TODAY; // + caixa (aporte) + aplicação; the cartão stays out
const DEBT = 50000 + 30000 - 5000; // saldo inicial + liberação − first pagamento
const INVESTED = 31000; // 3 × 10.000 parcelas + the pending 1.000 reforma
const retirado = () => 4000 * RETIRADAS;
const withdrawn = () => 4000 * RETIRADAS - 5000; // retiradas − the aporte

// ---- 7. The tree -----------------------------------------------------------
await step("tree", async () => {
  await goLanc();
  await eventually("tree: Bancos e caixa (saldo hoje)", () => treeAmount("Bancos e caixa"), near(BANKS_TODAY));
  await eventually("tree: Investimentos (no período)", () => treeAmount("Investimentos"), near(INVESTED + CATTLE));
  await eventually("tree: Financiamentos (devedor)", () => treeAmount("Financiamentos"), near(DEBT));
  await eventually("tree: Sócios (retiradas − aportes)", () => treeAmount("Sócios"), near(withdrawn()));
  await eventually("tree: Despesas is the Placar's COE", () => treeAmount("Despesas"), near(parseBR(COE)));
  await eventually("tree: Receitas is the Placar's receita", () => treeAmount("Receitas"), near(parseBR(RECEITA)));
  for (const [label, want] of [
    ["Sicredi", SICREDI_TODAY],
    ["Caixa da fazenda", 5000],
    ["Aplicação RDC", APL_TODAY],
    ["Cartão Sicredi", 0],
    ["Implementos agrícolas", 30000],
    ["Benfeitorias", 1000],
    ["Equipamentos", 0],
    ["Compra de gado", CATTLE],
    ["Consórcio trator", DEBT],
    ["Distribuição de lucro", retirado()],
    ["Acertos de partilha", -5000],
  ]) {
    check(`tree: ${label}`, near(want)(await treeAmount(label)), `${await treeAmount(label)} want ${want}`);
  }
  const tags = await treeSection().locator("li > div > a").evaluateAll((links) =>
    links.map((a) => a.innerText.split("\n").map((l) => l.trim()).filter(Boolean)).filter((l) => l.length === 3).map((l) => `${l[0]}:${l[1].toLowerCase()}`)
  );
  check("tree: each top group says what its figure is", ["Bancos e caixa:saldo", "Investimentos:no período", "Financiamentos:devedor", "Sócios:retirado", "Despesas:custo (coe)", "Receitas:no período"].every((t) => tags.includes(t)), tags.join(" | "));
  check("tree: Todos os lançamentos is picked", (await treeSection().locator('a[aria-current="true"]').innerText()).startsWith("Todos os lançamentos"));

  // Groups open and close in place; the grupos of Despesas start closed.
  await treeSection().getByRole("button", { name: "Fechar Investimentos" }).click();
  check("tree: Fechar Investimentos hides its contas", (await treeAmount("Implementos agrícolas")) === null);
  await treeSection().getByRole("button", { name: "Abrir Investimentos" }).click();
  check("tree: Abrir Investimentos shows them again", (await treeAmount("Implementos agrícolas")) === 30000);
  const nutricao = sql(`select count(*) from accounts where farm_id = ${FARM} and "group" = 'nutrition' and archived_at is null`);
  await treeSection().getByRole("button", { name: "Abrir Nutrição" }).click();
  check("tree: Abrir Nutrição lists its contas", (await treeSection().getByRole("button", { name: "Fechar Nutrição" }).locator("xpath=../..").locator("ul a").count()) === Number(nutricao), nutricao);

  await treeSection().getByPlaceholder("Buscar conta").fill("Consórcio");
  await eventually("tree search keeps Consórcio trator", () => treeAmount("Consórcio trator"), near(DEBT));
  check("tree search hides Distribuição de lucro", (await treeAmount("Distribuição de lucro")) === null);
  await treeSection().getByPlaceholder("Buscar conta").fill("socios");
  await eventually("tree search folds accents (socios → Sócios)", () => treeAmount("Distribuição de lucro"), near(retirado()));
});

// ---- 8. The panes ----------------------------------------------------------
await step("pane: todos", async () => {
  await goLanc();
  await eventually("todos: Despesas (COE) is the Placar's", () => value("Despesas (COE)"), eq(COE));
  check("todos: Receitas is the Placar's", (await value("Receitas")) === RECEITA, await value("Receitas"));
  const result = await value("Resultado");
  check("todos: Resultado = receitas − COE", result !== null && Math.abs(parseBR(result) - (parseBR(RECEITA) - parseBR(COE))) < 0.01, result);
  // Capital, rendimento and compra rows in the window: −31.000 + 30.000 − 10.000 − retiradas + 5.000 + 350 − gado.
  const fora = -31000 + 30000 - 10000 - retirado() + 5000 + 350 - CATTLE;
  check("todos: Fora do resultado = entradas − saídas of capital", (await value("Fora do resultado")) === money(fora), `${await value("Fora do resultado")} want ${money(fora)}`);
  await shot("desk-todos");
  await layoutOk("todos", 1440);
});

await step("pane: Sicredi", async () => {
  await goLanc(`banco:${SICREDI}`);
  await eventually("Sicredi: saldo hoje", () => value("Saldo hoje"), eq(money(SICREDI_TODAY)));
  check("Sicredi: entradas no período", (await value("Entradas no período")) === money(30000), await value("Entradas no período"));
  check("Sicredi: saídas no período", (await value("Saídas no período")) === money(39000), await value("Saídas no período"));
  check("Sicredi: pills conta corrente · principal", (await page.locator("#node-pane-title").locator("xpath=..").innerText()).includes("principal"));
  check("Sicredi: Transferir and Importar extrato", (await page.getByRole("button", { name: "Transferir" }).isVisible()) && (await page.getByRole("button", { name: "Importar extrato" }).isVisible()));
  await eventually("Sicredi: the newest line carries the saldo", async () => norm(await tableRows().first().innerText()), like(/91\.000,00/));
  const heads = (await page.locator("main table thead th").allInnerTexts()).map((h) => h.trim().toLowerCase()).filter((h) => h && h !== "selecionar");
  check("Sicredi: Data · Histórico · Contra partida · Valor · Saldo", heads.join("|") === "data|histórico|contra partida|valor (r$)|saldo (r$)", heads.join("|"));
  const text = norm(await page.locator("main table").locator("visible=true").first().innerText());
  for (const [conta, grupo] of [
    ["Consórcio trator", "Financiamentos"],
    ["Distribuição de lucro", "Sócios"],
    ["Implementos agrícolas", "Investimentos"],
    ["Aplicação RDC", "transferência"],
  ]) {
    check(`Sicredi: contra partida ${conta} · ${grupo}`, text.includes(`${conta}\n${grupo}`) || (text.includes(conta) && text.includes(grupo)));
  }
  // Running saldo, newest first: each line's saldo = the next (older) line's saldo + its value.
  const lines = await tableRows().evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/[  ]/g, " ").trim()))
  );
  const num = (s) => Number(s.replace("−", "-").replace("+", "").replace(/\./g, "").replace(",", "."));
  const running = lines.every((cells, i) => i === lines.length - 1 || Math.abs(num(cells[5]) - (num(lines[i + 1][5]) + num(cells[4]))) < 0.01);
  check("Sicredi: the saldo follows each line", running && lines.length === 5, JSON.stringify(lines.map((c) => [c[4], c[5]])));
  await shot("desk-banco");
  await layoutOk("Sicredi", 1440);
});

await step("pane: aplicação", async () => {
  await goLanc(`banco:${APL}`);
  await eventually("aplicação: saldo hoje", () => value("Saldo hoje"), eq(money(APL_TODAY)));
  const yields = await figure("Rendimento no período");
  check("aplicação: rendimento no período", yields?.value === money(350) && yields?.sub === "2 rendimentos", JSON.stringify(yields));
  check("aplicação: Lançar rendimento, no Importar extrato", (await page.getByRole("button", { name: "Lançar rendimento" }).isVisible()) && (await page.getByRole("button", { name: "Importar extrato" }).count()) === 0);
});

await step("pane: financiamento", async () => {
  await goLanc(`conta:${CONSORCIO}`);
  await eventually("financiamento: saldo devedor", () => value("Saldo devedor"), eq(money(DEBT)));
  check("financiamento: liberado", (await value("Liberado")) === money(30000), await value("Liberado"));
  check("financiamento: pago", (await value("Pago")) === money(5000), await value("Pago"));
  const next = await figure("Próxima parcela");
  check("financiamento: próxima parcela", next?.value === money(5000) && next?.sub === `vence ${ddmmyyyy(NEXT_DUE)}`, JSON.stringify(next));
  const meter = page.getByRole("meter");
  check("financiamento: % quitado meter (5.000 of 80.000)", (await meter.getAttribute("aria-valuenow")) === "6" && (await meter.getAttribute("aria-label")) === "6% quitado", `${await meter.getAttribute("aria-valuenow")} ${await meter.getAttribute("aria-label")}`);
  const heads = (await page.locator("main table thead th").allInnerTexts()).map((h) => h.trim().toLowerCase()).filter(Boolean);
  check("financiamento: the last column is Saldo devedor", heads.at(-1) === "saldo devedor", heads.join("|"));
  const text = norm(await page.locator("main table").locator("visible=true").first().innerText());
  check("financiamento: saldo devedor after each paid line (80.000 then 75.000)", text.includes("80.000,00") && text.includes("75.000,00"), text.slice(0, 400));
  check("tree: Consórcio trator is picked", (await treeSection().locator('a[aria-current="true"]').innerText()).startsWith("Consórcio trator"));
  await shot("desk-financiamento");
  await layoutOk("financiamento", 1440);
});

await step("pane: investimento", async () => {
  await goLanc(`conta:${INV}`);
  await eventually("investimento: investido no período", () => value("Investido no período"), eq(money(30000)));
  check("investimento: pago", (await value("Pago")) === money(10000), await value("Pago"));
  check("investimento: a pagar", (await value("A pagar")) === money(20000), await value("A pagar"));
  check("investimento: desde o início", (await value("Desde o início")) === money(30000), await value("Desde o início"));
  check("investimento: pills investimento · fora do custo (COE)", /investimento[\s\S]*fora do custo \(COE\)/.test(await page.locator("#node-pane-title").locator("xpath=..").innerText()));
  await eventually("investimento: three lines", () => tableRows().count(), eq(3));
  await page.getByRole("radiogroup", { name: "Visão" }).getByRole("radio", { name: "Detalhado" }).click();
  await page.waitForURL(/visao=detalhado/);
  await eventually("Detalhado: the Pago por column", () => page.getByRole("columnheader", { name: /Pago por/i }).first().isVisible(), eq(true));
  const paidBy = await tableRows().filter({ hasText: "pago" }).first().innerText();
  check("Detalhado: the paid parcela names Sicredi and its vencimento", paidBy.includes("Sicredi") && paidBy.includes(`vence ${ddmm(day(-15))}`), paidBy);
  await shot("desk-investimento");
  await layoutOk("investimento Detalhado", 1440);
  // The filters live in the URL: the box ticks once the navigation lands.
  await page.getByRole("checkbox", { name: "Só pendentes" }).click();
  await eventually("Só pendentes: two lines", () => tableRows().count(), eq(2));
  check("Só pendentes is in the URL", new URL(page.url()).searchParams.get("status") === "pendentes");
  await page.getByRole("checkbox", { name: "Só pendentes" }).click();
  await eventually("Só pendentes off: three lines", () => tableRows().count(), eq(3));
  check("the lote filter is there", await page.getByRole("combobox", { name: "Filtrar por lote" }).isVisible());
  await page.getByPlaceholder("Buscar no histórico").fill("Sicredi");
  await eventually("Buscar no histórico finds the contra partida", () => tableRows().count(), eq(1));
  await page.getByPlaceholder("Buscar no histórico").fill("nada disso");
  await eventually("… and nothing else", () => page.getByText("Nada com esses filtros").isVisible(), eq(true));
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await eventually("Limpar filtros brings the three back", () => tableRows().count(), eq(3));
});

await step("pane: groups", async () => {
  await goLanc("socios");
  await eventually("Sócios: retirado", () => value("Retirado"), eq(money(retirado())));
  check("Sócios: aportado", (await value("Aportado")) === money(5000), await value("Aportado"));
  check("Sócios: líquido", (await value("Líquido")) === money(withdrawn()), await value("Líquido"));
  await goLanc("investimentos");
  await eventually("Investimentos: investido no período", () => value("Investido no período"), eq(money(INVESTED + CATTLE)));
  await goLanc("financiamentos");
  await eventually("Financiamentos: saldo devedor", () => value("Saldo devedor"), eq(money(DEBT)));
  await goLanc("bancos");
  await eventually("Bancos e caixa: saldo em contas", () => value("Saldo em contas"), eq(money(BANKS_TODAY)));
  // Both sides of the transferência net to zero in the group.
  await eventually("Bancos e caixa: the transferência shows on both sides", () => tableRows().filter({ hasText: "Aplicação" }).filter({ hasText: "transferência" }).count(), eq(2));
});

await step("broken nós", async () => {
  for (const bad of ["conta:nope", "banco:", "grupo:nope", "banco:nope"]) {
    await goLanc(bad);
    await eventually(`a broken nó (${bad}) falls back to todos`, () => value("Despesas (COE)"), eq(COE));
  }
  check("… with Todos os lançamentos picked", (await treeSection().locator('a[aria-current="true"]').innerText()).startsWith("Todos os lançamentos"));
});

// ---- 9. The Painel with the capital lançamentos ---------------------------
const capitalCard = () =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Capital, dívidas e sócios" }) });
const CELLS = ["Investido no período", "Aplicações", "Saldo devedor", "Retirado pelos sócios"];
const cellLink = (label) => capitalCard().getByRole("link", { name: new RegExp(`^${label}`, "i") });
const billCount = (title) => page.getByRole("checkbox", { name: `Marcar ${title} como pago`, exact: true }).count();
const pendingOf = (id) => Number(sql(`select count(*) from expenses where account_id = '${id}' and paid_at is null`));

await step("Painel with capital", async () => {
  await page.goto(`${BASE}/finance?${PERIOD}`);
  await eventually("Painel: Saldo devedor", () => value("Saldo devedor"), eq(money(DEBT)));
  check("Painel: the strip stayed hidden while all four were zero", capitalBefore === 0 || CATTLE > 0, `${capitalBefore}`);
  const invested = await figure("Investido no período");
  check(
    "Painel: Investido no período",
    invested?.value === money(INVESTED + CATTLE) && invested?.sub === `imobilizado ${whole(INVESTED)} · gado ${whole(CATTLE)}`,
    JSON.stringify(invested)
  );
  const applications = await figure("Aplicações");
  check("Painel: Aplicações", applications?.value === money(APL_TODAY) && applications?.sub === `rendeu ${money(350)} no período`, JSON.stringify(applications));
  check("Painel: 1 conta · próxima parcela", (await sub("Saldo devedor")) === `1 conta · próxima parcela ${ddmm(NEXT_DUE)}`, await sub("Saldo devedor"));
  const out = await figure("Retirado pelos sócios");
  const share = RESULT > 0 ? `${whole((withdrawn() / RESULT) * 100)} % do resultado do período` : "no período";
  check("Painel: Retirado pelos sócios", out?.value === money(withdrawn()) && out?.sub === share, `${JSON.stringify(out)} want ${share}`);
  const hrefs = await capitalCard().getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  for (const node of ["investimentos", "bancos", "financiamentos", "socios"]) {
    check(`Painel: a cell opens ${node}`, hrefs.includes(`/finance/lancamentos?${PERIOD}&conta=${node}`), hrefs.join(" "));
  }
  const boxes = await Promise.all(CELLS.map((label) => cellLink(label).boundingBox()));
  check("Painel: four cells in one row on desktop", boxes.every((b) => b && Math.abs(b.y - boxes[0].y) < 2), JSON.stringify(boxes));
  const cashTop = (await page.getByRole("region", { name: "Caixa do período" }).boundingBox())?.y ?? Infinity;
  check("Painel: the strip sits under the caixa", boxes[0] && boxes[0].y > cashTop, `${cashTop} ${boxes[0]?.y}`);

  const received = parseBR(await value("Recebido"));
  const paid = parseBR(await value("Pago"));
  check("caixa: + liberação, aporte and two rendimentos", Math.abs(received - cashBefore.received - 35350) < 0.01, `${cashBefore.received} → ${received}`);
  check("caixa: + compra, pagamento and retirada", Math.abs(paid - cashBefore.paid - 19000) < 0.01, `${cashBefore.paid} → ${paid}`);
  check("Contas a pagar: the pagamento to come", (await billCount("Financiamentos › Consórcio trator")) === pendingOf(CONSORCIO) && pendingOf(CONSORCIO) === 1, `${await billCount("Financiamentos › Consórcio trator")}`);
  check("Contas a pagar: the two parcelas of the compra", (await billCount("Investimentos › Implementos agrícolas")) === 2, `${await billCount("Investimentos › Implementos agrícolas")}`);
  check("Contas a pagar: the reforma", (await billCount("Investimentos › Benfeitorias")) === 1);
  check("Contas a pagar: the retiradas to come", (await billCount("Sócios › Distribuição de lucro")) === pendingOf(DIST) && pendingOf(DIST) >= 1, `${await billCount("Sócios › Distribuição de lucro")} vs ${pendingOf(DIST)}`);
  const ver = await page.getByRole("link", { name: /^Ver lançamentos/ }).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  check("every 'Ver lançamentos' opens Lançamentos", ver.length >= 3 && ver.every((h) => h.startsWith("/finance/lancamentos?")), ver.join(" "));
  check("composição opens its grupo or the COE", ver.some((h) => /conta=(grupo:[a-z]+|despesas)$/.test(h)), ver.join(" "));
  check("no link left to /finance/extrato", (await page.locator('main a[href^="/finance/extrato"]').count()) === 0);
  await shot("desk-painel");
  await layoutOk("Painel", 1440);

  await cellLink("Saldo devedor").click();
  await page.waitForURL(/conta=financiamentos/);
  await eventually("the Saldo devedor cell opens Financiamentos", () => value("Saldo devedor"), eq(money(DEBT)));
});

// ---- 10. Phone, 390 px -----------------------------------------------------
await step("phone", async () => {
  await page.setViewportSize(PHONE);
  await page.goto(`${BASE}/finance?${PERIOD}`);
  await eventually("phone Painel: the strip", () => value("Saldo devedor"), eq(money(DEBT)));
  const [a, b, c] = await Promise.all(CELLS.slice(0, 3).map((label) => cellLink(label).boundingBox()));
  check("phone Painel: two columns", a && b && c && Math.abs(a.y - b.y) < 2 && c.y > a.y + 10, JSON.stringify([a, b, c]));
  await layoutOk("phone Painel", 390);
  await shot("phone-painel");

  await goLanc();
  await eventually("phone: without a nó the page is the tree", () => treeAmount("Financiamentos"), near(DEBT));
  check("phone: no pane without a nó", (await figure("Despesas (COE)")) === null);
  check("phone: no toolbar", !(await toolbar().isVisible()));
  check("phone: Lançar floats", (await page.getByRole("button", { name: "Lançar", exact: true }).locator("visible=true").count()) === 1);
  const rowHeights = await treeSection().locator("a").locator("visible=true").evaluateAll((links) => links.map((l) => l.getBoundingClientRect().height));
  check("phone: tree rows are 44 px targets", rowHeights.length > 10 && rowHeights.every((h) => h >= 44), rowHeights.join(","));
  await layoutOk("phone tree", 390);
  await shot("phone-arvore");

  await treeSection().getByRole("link", { name: /^Implementos agrícolas/ }).click();
  await page.waitForURL(new RegExp(`conta=conta(%3A|:)${INV}`));
  await page.locator("main").getByRole("link", { name: "Plano de contas" }).waitFor();
  check("phone: the conta opens its pane with Plano de contas to go back", true);
  check("phone: the tree is gone", !(await treeSection().isVisible()));
  await eventually("phone: the pane's strip", () => value("Investido no período"), eq(money(30000)));
  await layoutOk("phone conta", 390);
  await shot("phone-conta");

  await page.locator("main li button").filter({ hasText: "Agro Máquinas" }).filter({ hasText: "a pagar" }).first().click();
  await dialog().waitFor();
  const actions = (await dialog().getByRole("button").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  check(
    "phone: the sheet of a pending parcela: Marcar como pago, Editar, Duplicar, Imprimir, Excluir (no Parcelar in a série)",
    ["Marcar como pago", "Editar", "Duplicar", "Imprimir", "Excluir"].every((x) => actions.includes(x)) && !actions.includes("Parcelar"),
    actions.join(", ")
  );
  check("phone: the sheet names the parcela", /Agro Máquinas · parcela \d\/3/.test(await dialog().getByRole("heading").first().innerText()));
  await layoutOk("phone sheet", 390);
  await page.waitForTimeout(800); // the sheet's fade and the backdrop blur
  await shot("phone-sheet", page, false);
  await dialog().getByRole("button", { name: "Duplicar" }).click();
  await page.getByRole("heading", { name: "Novo lançamento" }).waitFor();
  check("phone: an action of the sheet opens its dialog", true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  await page.locator("main").getByRole("link", { name: "Plano de contas" }).click();
  await eventually("phone: Plano de contas goes back to the tree", () => treeAmount("Financiamentos"), near(DEBT));
  await page.setViewportSize(DESK);
});

// ---- 11. The toolbar's seven actions (Novo ran in 4) ------------------------
const ACTIONS = { Novo: "Novo", Editar: "Editar", Excluir: "Excluir", "Marcar como pago": /^Marcar como (pago|recebido)$/, Parcelar: "Parcelar", Duplicar: "Duplicar", Imprimir: "Imprimir" };
const toolbarState = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(ACTIONS).map(async ([key, name]) => [key, await toolbar().getByRole("button", { name, exact: typeof name === "string" }).isEnabled()])
    )
  );

await step("toolbar: what applies", async () => {
  await goLanc(`conta:${CONSORCIO}`);
  await eventually("financiamento rows loaded", () => tableRows().count(), (n) => n >= 3);
  const idle = await toolbarState();
  check("nothing picked: only Novo and Imprimir", idle.Novo && idle.Imprimir && !idle.Editar && !idle.Excluir && !idle["Marcar como pago"] && !idle.Parcelar && !idle.Duplicar, JSON.stringify(idle));
  check("nothing picked: the toolbar says so", await toolbar().getByText("Escolha um lançamento na lista para editar").isVisible());
  await pickRow("Liberação do consórcio");
  const paidRow = await toolbarState();
  check("a paid row: Editar, Excluir, Duplicar, but no Marcar and no Parcelar", paidRow.Editar && paidRow.Excluir && paidRow.Duplicar && !paidRow["Marcar como pago"] && !paidRow.Parcelar, JSON.stringify(paidRow));
  check("an entrada reads Marcar como recebido", (await toolbar().getByRole("button", { name: "Marcar como recebido" }).count()) === 1);
  check("the toolbar names the picked line", norm(await toolbar().innerText()).includes(`Selecionado: Liberação do consórcio · ${money(30000)}`), await toolbar().innerText());
  check("the picked row is highlighted", (await page.locator('main tr[aria-selected="true"]').count()) === 1);
  await pickRow(/^Selecionar Consórcio Sicredi, parcela 2\/2,/);
  const series = await toolbarState();
  check("a pending parcela of a série: Marcar, but no Parcelar", series["Marcar como pago"] && !series.Parcelar, JSON.stringify(series));

  const sales = Number(
    sql(`select (select count(*) from manejo_sessions where farm_id = ${FARM} and kind = 'sale' and status = 'closed'
           and deleted_at is null and total_amount_brl is not null and date between '${DE}' and '${ATE}')
         + (select count(*) from movements where farm_id = ${FARM} and type = 'sale' and amount_brl is not null
           and date between '${DE}' and '${ATE}')`)
  );
  check("the window has vendas of the manejos", sales > 0, String(sales));
  await goLanc("venda-de-gado");
  await eventually("venda de gado rows loaded", () => tableRows().count(), eq(sales));
  await tableRows().first().getByRole("radio").check();
  const locked = await toolbarState();
  check("a manejo row is neither edited, removed, split nor duplicated", !locked.Editar && !locked.Excluir && !locked.Parcelar && !locked.Duplicar, JSON.stringify(locked));
  check("… and takes its conta bancária", await toolbar().getByRole("button", { name: "Conta", exact: true }).isEnabled());
});

await step("toolbar: Marcar como pago", async () => {
  await goLanc(`conta:${CONSORCIO}`);
  await pickRow(/^Selecionar Consórcio Sicredi, parcela 2\/2,/);
  await toolbar().getByRole("button", { name: "Marcar como pago", exact: true }).click();
  await dialog().getByText("De que conta o dinheiro saiu?").waitFor();
  await dialog().getByRole("button", { name: "Marcar pago" }).click();
  check("Marcado como pago", await toast("Marcado como pago"));
  await eventually(
    "Marcar como pago: paid today from the conta principal",
    async () => sql(`select paid_at || '/' || bank_account_id from expenses where kind = 'financing' and flow = 'out' and series_index = 2`),
    eq(`${TODAY}/${SICREDI}`)
  );
  await eventually("the saldo devedor drops", () => value("Saldo devedor"), eq(money(DEBT - 5000)));
  await eventually("the % quitado grows (10.000 of 80.000)", () => page.getByRole("meter").getAttribute("aria-valuenow"), eq("13"));
});

await step("toolbar: Parcelar", async () => {
  await goLanc(`conta:${BENF}`);
  await pickRow("Reforma do curral");
  await toolbar().getByRole("button", { name: "Parcelar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Parcelar lançamento" }).waitFor();
  await dialog().locator("#split-count").fill("3");
  await dialog().getByRole("button", { name: "Parcelar em 3" }).waitFor();
  await page.waitForTimeout(300);
  await shot("desk-parcelar", page, false);
  await dialog().getByRole("button", { name: "Parcelar em 3" }).click();
  check("Parcelar toasts", await toast("Lançamento dividido em 3 parcelas"));
  await eventually(
    "Parcelar: three parcelas that add up to the total, the last with the centavos",
    async () =>
      sql(`select count(*) || '/' || sum(amount_brl)::numeric(12,2) || '/' || min(amount_brl)::numeric(12,2) || '/' || max(amount_brl)::numeric(12,2)
           from expenses where counterparty = 'Reforma do curral'`),
    eq("3/1000.00/333.33/333.34")
  );
  check("Parcelar: the first parcela keeps the id", sql(`select id from expenses where counterparty = 'Reforma do curral' and series_index = 1`) === REFORMA);
  check("Parcelar: the last parcela takes the centavos", sql(`select amount_brl::numeric(12,2) from expenses where counterparty = 'Reforma do curral' and series_index = 3`) === "333.34");
  await eventually("Parcelar: the pane lists the three", () => tableRows().count(), eq(3));
  const split = { count: 2, frequency: "monthly", startsOn: TODAY };
  await refused("Parcelar refuses a paid row", `/expenses/${LIBERACAO}/split`, split, 400, "not_splittable");
  await refused("Parcelar refuses a row of a série", `/expenses/${PARCELA}/split`, split, 400, "not_splittable");
  await refused("Parcelar refuses a rendimento", `/expenses/${YIELD}/split`, split, 400, "not_splittable");
});

await step("toolbar: Editar, Duplicar, Excluir, Imprimir", async () => {
  await goLanc(`conta:${PARTILHA}`);
  await pickRow("Aporte do sócio");
  await toolbar().getByRole("button", { name: "Editar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Editar lançamento" }).waitFor();
  await dialog().locator("#entry-counterparty").fill("Aporte do sócio Lucas");
  await dialog().getByRole("button", { name: "Salvar", exact: true }).click();
  await eventually("Editar saved", async () => sql(`select count(*) from expenses where counterparty = 'Aporte do sócio Lucas'`), eq("1"));

  await pickRow("Aporte do sócio Lucas");
  await toolbar().getByRole("button", { name: "Duplicar", exact: true }).click();
  await dialog().getByRole("heading", { name: "Novo lançamento" }).waitFor();
  check("Duplicar: dated today", (await dialog().locator("#entry-date").inputValue()) === TODAY);
  check("Duplicar: the same valor", parseBR(await dialog().locator("#entry-amount").inputValue()) === 5000);
  check("Duplicar: the same conta and movimento", (await dialog().locator("#entry-account").innerText()).includes("Acertos de partilha") && (await dialog().getByRole("radio", { name: "Aporte", exact: true }).getAttribute("aria-checked")) === "true");
  check("Duplicar: pending", !(await dialog().getByRole("checkbox", { name: /^Já (pago|recebido)/ }).isChecked()));
  check("Duplicar: no repetição", (await dialog().getByRole("radio", { name: "Uma vez", exact: true }).getAttribute("aria-checked")) === "true");
  await dialog().getByRole("button", { name: "Lançar", exact: true }).click();
  await eventually(
    "Duplicar: a pending aporte of today",
    async () => sql(`select count(*) from expenses where counterparty = 'Aporte do sócio Lucas' and kind = 'partners' and flow = 'in' and paid_at is null and date = '${TODAY}'`),
    eq("1")
  );

  await goLanc(`conta:${PARTILHA}`);
  await pickRow("Aporte do sócio Lucas"); // newest first: today's copy
  await toolbar().getByRole("button", { name: "Excluir", exact: true }).click();
  await dialog().getByRole("button", { name: "Excluir", exact: true }).click();
  await eventually("Excluir removed the copy", async () => sql(`select count(*) || '/' || count(paid_at) from expenses where counterparty = 'Aporte do sócio Lucas'`), eq("1/1"));

  await toolbar().getByRole("button", { name: "Imprimir", exact: true }).click();
  await eventually("Imprimir prints", () => page.evaluate(() => window.__printed), (n) => n >= 1);
});

// ---- 12. The Painel after everything; the Placar did not move -------------
await step("Painel after", async () => {
  await page.goto(`${BASE}/finance?${PERIOD}`);
  await eventually("Painel: Saldo devedor after the pagamento", () => value("Saldo devedor"), eq(money(DEBT - 5000)));
  check("Painel: no parcela left to pay", (await sub("Saldo devedor")) === "1 conta · sem parcela a pagar", await sub("Saldo devedor"));
  const paid = parseBR(await value("Pago"));
  check("caixa: + the pagamento marked today", Math.abs(paid - cashBefore.paid - 24000) < 0.01, `${cashBefore.paid} → ${paid}`);
  const after = await placar();
  for (const key of Object.keys(before)) {
    check(`the Placar did not move: ${key}`, before[key] !== null && before[key] === after[key], `${before[key]?.slice(0, 160)} ≠ ${after[key]?.slice(0, 160)}`);
  }
});

// ---- 13. Old Extrato links -------------------------------------------------
await step("redirects", async () => {
  await page.goto(`${BASE}/finance/extrato?grupo=capital&${PERIOD}&q=Agro`);
  await page.waitForURL(/\/finance\/lancamentos/);
  let url = new URL(page.url());
  check(
    "extrato?grupo=capital&de&ate → the Compra de gado nó, keeping de, ate and q",
    url.searchParams.get("conta") === "compra-de-gado" && url.searchParams.get("de") === DE && url.searchParams.get("ate") === ATE && url.searchParams.get("q") === "Agro",
    page.url()
  );
  await page.locator("#node-pane-title").filter({ hasText: "Compra de gado" }).waitFor();
  check("… showing the Compra de gado pane", true);
  await page.goto(`${BASE}/finance/extrato?conta=${INV}&status=overdue`);
  await page.waitForURL(/\/finance\/lancamentos/);
  url = new URL(page.url());
  check("extrato?conta=<account id>&status=overdue → conta:<id>, Só pendentes", url.searchParams.get("conta") === `conta:${INV}` && url.searchParams.get("status") === "pendentes", page.url());
  await page.goto(`${BASE}/finance/extrato?tipo=treatment`);
  await page.waitForURL(/\/finance\/lancamentos/);
  check("extrato?tipo=treatment → Sanidade", new URL(page.url()).searchParams.get("conta") === "grupo:health", page.url());
  await page.goto(`${BASE}/finance/extrato?grupo=nope`);
  await page.waitForURL(/\/finance\/lancamentos/);
  url = new URL(page.url());
  check("extrato with an unknown grupo → todos", [null, "todos"].includes(url.searchParams.get("conta")), page.url());
  const nav = await page.getByRole("navigation", { name: "Seções do Financeiro" }).getByRole("link").allTextContents();
  check("sub-navigation: Painel · Lançamentos · Contas bancárias", ["Painel", "Lançamentos", "Contas bancárias"].every((l) => nav.includes(l)) && !nav.includes("Extrato"), nav.join(" · "));
});

// ---- 14. Configurações › Plano de contas -----------------------------------
await step("plano de contas", async () => {
  await page.goto(`${BASE}/settings/plano-de-contas`);
  await page.getByRole("heading", { name: "Fora do resultado" }).waitFor();
  const text = await mainText();
  check("plano: the three new groups under Fora do resultado", ["Investimentos", "Financiamentos", "Sócios", "Implementos agrícolas", "Consórcio trator", "Acertos de partilha"].every((t) => text.includes(t)));
  check("plano: the financiamento shows its saldo inicial", text.includes("50.000,00"), text.slice(0, 300));
  await shot("desk-plano-de-contas");
  await layoutOk("Plano de contas", 1440);
});

// ---- 15. Members -----------------------------------------------------------
await step("members", async () => {
  const viewer = await openSession(VIEWER);
  await viewer.page.goto(`${BASE}/finance/lancamentos?${PERIOD}&conta=conta:${CONSORCIO}`);
  await eventually("consultor sees the saldo devedor", () => value("Saldo devedor", viewer.page), eq(money(DEBT - 5000)));
  const buttons = (await toolbar(viewer.page).getByRole("button").allInnerTexts()).map((t) => t.trim());
  check("consultor: the toolbar has Imprimir only", buttons.join("|") === "Imprimir", buttons.join("|"));
  check("consultor: no Nova conta", (await viewer.page.locator("main").getByRole("button", { name: "Nova conta", exact: true }).count()) === 0);
  check("consultor: Somente leitura", (await mainText(viewer.page)).toLowerCase().includes("leitura"));
  const write = await apiOf(viewer.context)("POST", "/expenses", { kind: "partners", flow: "out", category: "other", accountId: DIST, date: TODAY, amountBrl: 1 });
  check("consultor cannot lançar", write.status() === 403, String(write.status()));
  const split = await apiOf(viewer.context)("POST", `/expenses/${REFORMA}/split`, { count: 2, frequency: "monthly", startsOn: TODAY });
  check("consultor cannot parcelar", split.status() === 403, String(split.status()));

  const hand = await openSession(HAND);
  const load = await hand.context.request.get(`${BASE}/api/herd`, { headers: { "x-farm-id": String(FARM) } });
  const herd = await load.json().catch(() => null);
  check("vaqueiro: the herd loads", load.ok(), String(load.status()));
  check(
    "vaqueiro: no lançamento of any kind, no conta bancária, no transferência",
    herd?.expenses?.length === 0 && herd?.bankAccounts?.length === 0 && herd?.transfers?.length === 0,
    JSON.stringify({ e: herd?.expenses?.length, b: herd?.bankAccounts?.length, t: herd?.transfers?.length })
  );
  check(
    "vaqueiro: no saldo inicial of a conta",
    (herd?.accounts ?? []).length > 0 && herd.accounts.every((a) => a.openingBalanceBrl === undefined && a.openingDate === undefined)
  );
  await hand.page.goto(`${BASE}/finance/lancamentos?${PERIOD}`);
  check("vaqueiro: Lançamentos is closed", await hand.page.getByText("Porteira fechada").first().waitFor({ timeout: 15000 }).then(() => true, () => false));
  const handSplit = await apiOf(hand.context)("POST", `/expenses/${REFORMA}/split`, { count: 2, frequency: "monthly", startsOn: TODAY });
  check("vaqueiro cannot parcelar", handSplit.status() === 403, String(handSplit.status()));
});

check("no page or console errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) console.log(`failed: ${failed.map((r) => r.name).join("; ")}`);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Step 5: Run it**

Run: `BASE=http://localhost:3016 DB=meubov-lancamentos-db node ~/.cache/meubov-plan-2026-10-01/smoke.mjs`
Expected: only PASS lines, then `269/269 checks passed`, exit 0. It takes about two minutes. Do not start it just before midnight: "today" must not change during the run.

A FAIL is either a locator (fix the script) or a defect (fix the owning task's file, contract "Tasks, waves and files", then Step 2 again). Every run writes its lançamentos, so before running again tear down (Step 7) and redo Step 3 — a second run on the same database doubles every figure; the server goes down with the database too (its pool points at the old container). `fail-*.png` in the shots folder shows the page when a section threw; `server.log` has the API side, where `[exact-mirror] TypeBox's TypeCompiler is required to use Union` is old and harmless.

Things the script already handles: the pane's filters and the Visão live in the URL, so a click lands one navigation later (click, then poll; never Playwright's `.check()`); dialogs and the row sheet animate, so their screenshots wait 300–800 ms; money strings carry a narrow no-break space (`norm`).

- [ ] **Step 6: Look at the screenshots against the canvas**

Read each image in `~/.cache/meubov-plan-2026-10-01/shots/` beside its board in `~/.cache/meubov-canvas/lancamentos/out/`:
- `desk-banco.png` ↔ `shot-Main.png` (tree, toolbar, Sicredi pane with contra partida and running saldo)
- `desk-investimento.png` ↔ `shot-L-Investimento.png` (Detalhado: vencimento, Lote, Pago por, Status)
- `desk-financiamento.png` ↔ `shot-L-Financiamento.png` (Saldo devedor column, "% quitado" bar)
- `desk-todos.png` (Todos os lançamentos: Receitas · Despesas (COE) · Resultado · Fora do resultado)
- `desk-novo-lancamento.png` ↔ `shot-L-Dialog-Lancamento.png` (Investimento, Parcelado, the capital notice)
- `desk-nova-conta.png` ↔ `shot-L-Dialog-Conta.png` (Financiamento with Saldo devedor inicial and Em)
- `desk-parcelar.png` (Parcelar em 3, the last parcela with the centavos)
- `desk-painel.png` ↔ `shot-L-Painel.png` ("Capital, dívidas e sócios" under the caixa, four cells, tiles and chevrons)
- `desk-plano-de-contas.png` (Configurações: "Fora do resultado" with the three groups, the saldo inicial under Consórcio trator)
- `desk-contas-bancarias.png` (the Aplicação card, "2 contas e 1 aplicação", the rendimentos in its movimentação)
- `phone-arvore.png` ↔ `shot-L-Phone-Arvore.png`, `phone-conta.png` and `phone-sheet.png` ↔ `shot-L-Phone-Conta.png`, `phone-painel.png`

Small differences from the canvas that follow the app's components are fine (the native date inputs, the toast, "SALDO" as the banks' tag). Report what differs beyond the data (the smoke's figures are its own).

- [ ] **Step 7: Tear down**

```bash
kill $(ss -ltnp | grep ':3016 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
docker rm -f meubov-lancamentos-db
ss -ltnp | grep -E ':(5446|3016) '; docker ps --format '{{.Names}}' | grep meubov-lancamentos
```
Expected: the last two commands print nothing. The repo is as the tasks left it: `git status --short` lists only the plan's files (the smoke wrote nothing inside the repo). Nothing to commit here; the controller makes the single commit afterwards.

---

## Amendments after the whole-change review

The plan above was executed literally in a sandbox clone and its result brought to `main`. A fresh reviewer then read the whole change; these fixes came out of that review, each test-first, and are part of the change though no task section above shows them.

- `lib/domain/planTree.ts` — "Bancos e caixa" is built from each conta's movimentação by payment day (it used ledger rows by competência, so the group disagreed with its own contas). Its Entradas and Saídas leave out a cartão's lines and the transferências between two contas; paying a fatura counts as a saída. A rendimento now shows in the group too.
- `lib/domain/planTree.ts` — the saldo devedor of a financiamento's line is a running saldo in payment order (lines paid on one day no longer share a value) and a line paid on or before the opening date has none. The strip's Liberado and Pago count since the saldo inicial, whatever the window. `capitalSummary().nextInstallment` ignores archived financiamentos.
- `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts` — a scoped edit ("Esta e as próximas", "Todas") never changes the kind: `kind` is dropped from the patch, so a despesa série sent a conta of Investimentos is refused with `invalid_account` instead of leaving its siblings in both the COE and the investimento.
- `components/finance/lancamentos/LancamentosPage.tsx` — the picked row is dropped when the page changes, so the toolbar never acts on a row that is off screen.
- Dead code the old Extrato left behind is gone: `filterLedger`, `LedgerFilter`, `EMPTY_FILTER`, `ledgerSummary`, `LedgerSummary`, `matchesStatusChoice` (`lib/domain/ledger.ts`), `ledgerExportTable`, `LEDGER_KIND_LABEL` (`lib/export/datasets/finance.ts`), with their tests; `fold` lives once, in `lib/domain/planTree.ts`.

Left as they are, by decision:

- A capital lançamento sent without `flow` is stored as a saída rather than refused (the form always sends it).
- The "todos" strip's "Fora do resultado" counts pending lines, as its Receitas and Despesas do (competência).
- On the phone the period is changed from the tree, not from an open pane.
