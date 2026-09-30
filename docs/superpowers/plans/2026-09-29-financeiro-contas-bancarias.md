# Financeiro — contas bancárias e conciliação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The farm sees how much money it has in each conta today (conta corrente, caixa, cartão), every paid lançamento, venda and compra says which conta it went through ("Pago por"), and an extrato imported from the bank (OFX or CSV) confirms, line by line, that MeuBov holds the same payments and receipts as the bank. Adds "Contas bancárias" to the Financeiro sub-navigation.

**Architecture:** Four new tables — `bank_accounts`, `transfers`, `statement_imports`, `statement_lines` — and a `bank_account_id` on `expenses`, `movements` (legacy vendas/compras) and `manejo_sessions` (the vendas/compras the manejos write, which the ledger projects into `Movement` rows with the session's id). All money rules are pure: `lib/domain/bankAccounts.ts` (saldo with the opening-date cut-off, fatura by closing day, running movimentação), `lib/domain/statements/{common,ofx,csv}.ts` (our own parsers, no dependency), `lib/domain/statements/match.ts` (candidates and alta/média suggestions). The herd load carries the contas (with their pending-line figures), the transferências and the ids already conciliados; one import's lines load on the Conciliar page only. The server decides each line in a transaction (`ResolveLine`); a record pairs with one line at most (unique indexes), and removing the record returns its line to pending (FK `set null` plus a trigger in migration 0023).

**Tech Stack:** Next.js 16 app router (read `AGENTS.md` and `node_modules/next/dist/docs/` before app-router code — this Next differs from training data; dynamic client pages read params with `useParams`, as `app/(app)/herd/[id]/page.tsx` does), Elysia + Eden treaty, drizzle-orm/Postgres, zustand, Tailwind v4, shadcn/ui on radix-ui, vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-29-financeiro-contas-bancarias-design.md` — binding; read it whole first. Canvas: https://claude.ai/artifact/CQpkoLkCw8FrATae492nwY — `project/B-Contas-Desktop.dc.html` (the page with the movimentação of one conta), `project/B-Conciliar-Desktop.dc.html` (the conciliação of one import), `project/B-Contas-Phone.dc.html` (cards on the phone and the Transferir sheet). Read them with the Artifact tool (action read, `path`) when a task needs exact copy or spacing.

**Verified:** every task below was applied verbatim, in order, to a clone of `main` at `e73f606`: whole vitest suite 165 files / 1 562 tests green, `pnpm tsc --noEmit` and eslint clean, `pnpm build` green, and the Task 11 smoke (32 checks, desktop 1440 and phone 390) passed against a tmpfs Postgres migrated from zero.

**Decisions beyond the spec's letter (all keep its behaviour):**
- Vendas and compras written by a manejo are `manejo_sessions` rows, not `movements` rows (the ledger projects them with the session id; `movements` holds legacy rows only). So `bank_account_id` goes on both tables, `PATCH /movements/:id/bank-account` updates the sale/entry session first and the legacy row otherwise, and `statement_lines.movement_id` has no FK (it names either). Removing a manejo (a soft delete) nulls the pointer itself.
- "Removing a record returns its line to pending": the FK sets the pointer null and a `BEFORE UPDATE` trigger on `statement_lines` (appended by hand to migration 0023) resets the status when no pointer is left. A stub-db use-case test cannot see a trigger; the Task 11 smoke checks it on Postgres.
- `GET /imports/:id` answers the import, its lines and `pairedIds` (every record some line already confirms). The page builds the candidates and suggestions from the herd it already holds (`candidatesFor` + `suggestMatches`, pure); "Confirmar as N de confiança alta" posts the pairs the page shows, and the server re-checks each one (side, conta, not paired) in its own transaction, counting the refused.
- The suggestions demand the same value to the centavo; a confirmed pair does not (the "Outro lançamento" search by value may pick a boleto paid with juros). The server checks side, farm, conta and pairing.
- A record pairs with one line at most: unique indexes on `statement_lines.expense_id`, `movement_id`, `transfer_id`.
- `BankAccount` carries `pendingLines`, `reconciledUntil` (the day before the oldest pending line; the last line when none waits) and `pendingImportId` (the import holding the oldest pending line — where "N a conciliar" links), computed by the load. `HerdData.reconciledIds` feeds the "Conciliação" column. The store adjusts `pendingLines` after each decision; the dates refresh on the next load.
- `HerdData.bankAccounts`, `transfers`, `reconciledIds` are optional (nine hand-written `HerdData` fixtures stay valid, older phone snapshots load); `HerdStore` declares them required and starts them empty. Money redaction empties all three.
- OFX: a FITID repeated inside one file gets `:2`, `:3` (some banks repeat them); a line without FITID uses the CSV hash. CSV: rows whose description starts with "Saldo"/"S A L D O" (the bank's own saldo rows) are left out; `dateFormat` and `decimal` are guessed from the file, the mapping step asks the roles, delimiter and lines to skip. The browser decodes the file (UTF-8, else Windows-1252) and posts its text.
- The conta principal can be neither archived nor deleted while the farm has other contas (409); a cartão is never principal and keeps a zero saldo inicial; "Paga pela conta" must be a conta corrente.
- The mark-paid dialog asks the day as well as "Pago por". A line without a suggestion also offers "Buscar lançamento" (the same search as "Outro lançamento"). After an import the store re-reads the herd.
- Wording: the EntryDialog's "Conta" becomes "Conta do plano" and the Extrato header "Grupo › Conta do plano", next to the new "Conta" column (the conta bancária). On the phone the "Importar extrato" button is icon-only (its `aria-label` keeps the name) so the card title stays readable.

## Global Constraints

- One task per commit, `feat(finance): …` (fixes `fix(finance): …`), committed **by pathspec** exactly as each task's commit step lists. No `Co-Authored-By`, no session URL, no generator footer, no assistant or tool name — check the message before every commit.
- Copy in pt-BR exactly as the spec and canvas write it: "Contas bancárias", "Saldo em contas", "Transferir", "Transferir entre contas", "Não entra no resultado: é dinheiro mudando de lugar.", "fica com R$ … · o saldo em contas não muda.", "A fatura baixa para R$ …", "Nova conta", "Editar conta", "Conta corrente", "Caixa", "Cartão", "Identificação", "Saldo inicial (R$)", "em", "Fechamento (dia)", "Vencimento (dia)", "Paga pela conta", "Conta principal", "Arquivar", "Excluir", "Saldo", "Fatura aberta", "fora do saldo", "vence dd/mm", "conciliado até dd/mm", "N a conciliar", "sem extrato", "Cadastre a primeira conta", "Movimentação · <conta>", "Período", "Data · Descrição · Conta do plano · Entrada · Saída · Saldo · Conciliação", "conciliado", "a conciliar", "Importar extrato (OFX/CSV)", "N linhas novas · N já importadas", "Conciliar agora", "Nada novo neste extrato", "antes do saldo inicial", "Conciliar · <conta> · N linhas", "N de N resolvidas", "Banco: R$ X em dd/mm · MeuBov: R$ Y", "Todas · Sugestões · Sem par · Conciliadas", "Confirmar as N de confiança alta", "confiança alta", "confiança média", "mesmo valor, mesma data, mesmo favorecido", "provável:", "Confirmar", "Outro lançamento", "Sem lançamento correspondente", "Criar lançamento", "É transferência", "Ignorar", "tarifa já lançada", "duplicada", "outro", "Desfazer", "Pago por", "Recebido em", "Conta do plano", "Conta". Code, comments and commit messages in English; no emoji.
- Every read of money needs Financeiro **view**, every write Financeiro **edit**: `useCan("finance", "edit")` in the UI, `lib/api/permissions/routeRequirements.ts` on the API. Its two snapshot tests (`routeRequirements.test.ts`, `routeTable.test.ts`) are updated with `-u` on those explicit paths only, in Tasks 5 and 6 — never a bare `vitest -u`.
- All queries filter by `farm_id`; an id from the client is looked up with the caller's farm (another farm's conta, import or line is a 404).
- Vitest always with explicit paths and `--exclude '**/worktrees/**'` (other worktrees under `.claude/worktrees/` break a plain run); eslint with `--ignore-pattern '.claude/**'`. `pnpm tsc --noEmit` and eslint clean at the end of every task.
- No new dependency. Dates are ISO `YYYY-MM-DD`; domain code never calls `new Date()` for "today" — it takes the day (`todayISO()` from `lib/domain/dates.ts` at the edge). Money is rounded to the centavo (`cents`).
- Use-case pattern as in the repo: class with `run`, `constructor(repo = db)`, `__throwOnBrowser`; tests with the chainable stub `lib/api/__tests__/dbStub.ts`.
- The React Compiler lint (`react-hooks/preserve-manual-memoization`) rejects `useMemo` over values it cannot prove stable: compute plain values in render when it complains.
- Touch targets ≥ 44 px on the phone (`min-h-11 md:min-h-…`), `aria-label` on icon-only controls, no horizontal page scroll at 390 px.

## Review Focus

1. The same extrato imported twice, or a new one overlapping the last: every line already seen is skipped and counted, and a file with nothing new is refused with "Nada novo neste extrato" — Task 6 `ImportStatementUseCase` tests ("skips the lines already imported…", "refuses a file with nothing new"), Task 11 smoke ("same file again").
2. Two real identical lines on one day (two R$ 12,50 tarifas): they stay two lines (hash with occurrence), and the one matching lançamento is alta for the first and only média for the second — Task 3 "keeps two identical lines apart", Task 4 "offers one candidate as alta to the first of two identical lines".
3. A cartão with closing day 31 in February and a purchase right after the closing day: the fatura closes on the 28th/29th and the purchase moves to the next fatura, due the month after when the due day is not after the closing day — Task 2 `faturaOf` tests.
4. Confirming a pending lançamento pays it on the line's date from the line's conta, and a lançamento already paid by another conta is refused, not silently re-pointed — Task 6 `ResolveLineUseCase` tests, Task 7 store test (the toast), Task 11 smoke.
5. A line dated on or before the conta's saldo inicial, and a payment on the opening day itself: the line arrives ignored "antes do saldo inicial", the payment is not counted twice in the saldo — Task 6 import test, Task 2 "adds what was paid … after the opening date only".

## Waves (who runs in parallel)

| Wave | Tasks | Needs | Notes |
| --- | --- | --- | --- |
| 0 | 1 | — | types, schema, migration 0023 (+ trigger), mappers, load, redaction |
| 1 | 2, 3, 4, 5 | 1 | pure saldo/fatura rules; OFX/CSV parsers + fixtures; suggestions; contas + transferências API (owns `app.ts`, `routeRequirements.ts` and its snapshots, the expenses and manejo use cases). Disjoint files |
| 2 | 6 | 3 · 4 · 5 | import + conciliação API (parsers from 3, `MatchTarget` from 4, `app.ts`/snapshots after 5, `AddExpenseUseCase` with `bankAccountId` from 5) |
| 3 | 7 | 6 | store actions typed against the mounted routes |
| 4 | 8, 9 | 2 · 7 | Contas page (cards, movimentação, Nova conta, Transferir); "Pago por" in EntryDialog/mark-paid and the Extrato's Conta. Disjoint files |
| 5 | 10 | 8 · 9 | Importar extrato + Conciliar page (edits `ContasPage` from 8, `EntryDialog`/`PaidByField` from 9) |
| 6 | 11 | all | throwaway Postgres + `next start`, headless smoke |

`lib/types.ts` and `lib/api/mappers.ts` change only in Task 1. `components/finance/EntryDialog.tsx` changes in Task 9 and Task 10 (different waves; Task 10's hunks apply on top of Task 9's).

## Shared interfaces

```ts
// lib/types.ts (Task 1)
export type BankAccountKind = "checking" | "cash" | "card";
export interface CsvMapping { delimiter: string; dateColumn: number; descriptionColumn: number; amountColumn?: number; inColumn?: number; outColumn?: number; dateFormat: "dmy" | "ymd"; decimal: "," | "."; skipRows: number }
export interface BankAccount { id; kind; name; label?; openingBalanceBrl; openingDate; isMain; closingDay?; dueDay?; paysFromId?; csvMapping?; archivedAt?; pendingLines: number; reconciledUntil?; pendingImportId? }
export interface Transfer { id; fromId; toId; date; amountBrl; notes? }
export interface StatementImport { id; bankAccountId; fileName; format: "ofx" | "csv"; periodFrom; periodTo; bankBalanceBrl?; bankBalanceDate?; lineCount; skippedCount; createdAt }
export type StatementLineStatus = "pending" | "matched" | "created" | "transfer" | "ignored";
export interface StatementLine { id; importId; bankAccountId; date; description; amountBrl /* signed */; status; expenseId?; movementId?; transferId?; ignoreReason? }
// Expense.bankAccountId?, Movement.bankAccountId?, ManejoSession.bankAccountId?; HerdData.bankAccounts?, transfers?, reconciledIds?

// lib/domain/bankAccounts.ts (Task 2)
export interface BankInputs { expenses: Expense[]; movements: Movement[]; transfers: Transfer[] }
export function accountBalance(account: BankAccount, inputs: BankInputs, day: string): number;
export function bankTotal(accounts: BankAccount[], inputs: BankInputs, day: string): number;
export function accountMovements(account: BankAccount, inputs: BankInputs, period: Period): BankMove[]; // newest first, with `balance`
export function faturaOf(card: Pick<BankAccount, "closingDay" | "dueDay">, date: string): Fatura; // { opensAfter, closing, due }
export function openFatura(card: BankAccount, inputs: BankInputs, today: string): Fatura & { amountBrl: number };
export function payingAccounts(accounts: BankAccount[], kind: EntryKind): BankAccount[];
export function bankAccountLabel(account: Pick<BankAccount, "name" | "label">): string; // "Sicredi · c/c 12.345-6"
export const BANK_ACCOUNT_KIND_LABEL; export function cents(value: number): number;

// lib/domain/statements (Tasks 3–4)
common.ts: ParsedLine, ParsedStatement, ParseResult ({ ok: true; statement } | { ok: false; error }), MAX_STATEMENT_BYTES, parseAmountText, lineHashes, decodeBankFile, statementFormat, statementErrorMessage
ofx.ts: parseOfx(text): ParseResult        csv.ts: csvRows(text, delimiter), parseCsv(text, mapping), guessCsvMapping(text)
match.ts: MatchTarget { kind: "expense" | "movement" | "transfer"; id }, Candidate, Suggestion, MATCH_WINDOW_DAYS,
  candidatesFor(accountId, { expenses, movements, transfers, bankAccounts }, pairedIds), suggestMatches(lines, candidates): Map<lineId, Suggestion[]>,
  candidatesByValue(line, candidates, amountBrl), suggestionReason(s)
```

API (Tasks 5–6), all under `/api/herd`, all Financeiro edit except `GET /imports/:id` (view):
- `POST /bank-accounts` → `BankAccount` (400 `card_days` | `invalid_pays_from` | `card_cannot_be_main`) · `PATCH /bank-accounts/:id` (404, 409 `main_required`, 400) · `POST /bank-accounts/:id/archive` `{ archived }` (404, 409 `is_main`) · `DELETE /bank-accounts/:id` → `{ id }` (404, 409 `in_use` | `is_main`).
- `POST /transfers` → `Transfer` (404 `account_not_found`, 400 `same_account`) · `PATCH /transfers/:id` · `DELETE /transfers/:id` → `{ id }`.
- `PATCH /movements/:id/bank-account` `{ bankAccountId | null }` → `{ id, bankAccountId }` (404, 400 `invalid_bank_account`).
- `POST /expenses` and `PATCH /expenses/:id` accept `bankAccountId` (kept only on a paid row; 400 `invalid_bank_account`).
- `POST /bank-accounts/:id/imports` `{ fileName, content, mapping? }` → `{ import, newLines, skipped }` (404, 409 `nothing_new`, 400 `not_checking` | `too_large` | `mapping_required` | parser code) · `GET /imports/:id` → `{ import, lines, pairedIds }` · `POST /imports/:id/confirm-high` `{ pairs: [{ lineId, kind, id }] }` → `{ resolved, refused }`.
- `POST /statement-lines/:id/match` `{ kind, id }` · `/create` (EntryDialog body without `kind`, `repeat`, `bankAccountId`) · `/transfer` `{ otherAccountId }` · `/ignore` `{ reason }` · `/undo` → `Resolved { line, expense?, movement?, transfer? }` (404 `not_found` | `target_not_found`, 409 `not_pending` | `paid_by_other` | `already_paired`, 400 `wrong_side` | `same_account` | `due_before_date` | `invalid_bank_account`).

Store (Task 7): `addBankAccount`, `updateBankAccount`, `archiveBankAccount → boolean`, `removeBankAccount → "deleted" | "in_use" | "is_main"`, `addTransfer`, `updateTransfer`, `removeTransfer`, `setMovementBankAccount`, `importStatement → ImportResult | { error }`, `loadImport → ImportView | null`, `resolveStatementLine(line, decision) → Resolved | null`, `confirmHighMatches(importId, pairs)`, `markExpensePaid(id, paidAt, bankAccountId?)`; types `NewBankAccount`, `BankAccountPatch`, `LineDecision`.

UI (Tasks 8–10): `FinanceSubnav` gains `"contas"`; `ContasPage`, `AccountCard`, `AccountMovements({ account, period, onPeriodChange, canEdit, onEdit, action? })`, `BankAccountDialog({ open, onOpenChange, account? })`, `TransferDialog({ open, onOpenChange, defaultFromId? })`, `PHONE_SHEET`; `PaidByField`, `defaultPaidBy`, `useMarkPaid(onDone?) → { request, dialog }`, `MovementAccountDialog`; `ImportDialog({ account, onOpenChange })`, `ConciliarPage({ accountId, importId })`, `OtherMatchDialog`, `TransferLineDialog`, `IgnoreLineDialog`; `EntryDialog` gains `fromLine?` and `onResolved?`.

---

### Task 1: Foundation — types, schema, migration 0023, mappers, load

**Files:**
- Modify: `lib/api/__tests__/mappers.test.ts`, `lib/api/domains/herd/useCases/Load.useCase.ts`, `lib/api/mappers.ts`, `lib/db/schema.ts`, `lib/domain/__tests__/moneyRedaction.test.ts`, `lib/domain/moneyRedaction.ts`, `lib/domain/movements.ts`, `lib/types.ts`
- Create (generated): `drizzle/0023_financeiro-contas-bancarias.sql` (plus the hand-appended trigger), `drizzle/meta/0023_snapshot.json`; Modify (generated): `drizzle/meta/_journal.json`
- Not affected (checked with tsc): every `HerdData` fixture (the new fields are optional), every `Expense`/`Movement` fixture.

**Interfaces:**
- Consumes: nothing new.
- Produces: the types in "Shared interfaces"; tables `bankAccounts`, `transfers`, `statementImports`, `statementLines` with row types `BankAccountRow`, `TransferRow`, `StatementImportRow`, `StatementLineRow`; enums `bankAccountKindEnum`, `statementFormatEnum`, `statementLineStatusEnum`; columns `expenses.bankAccountId`, `movements.bankAccountId`, `manejoSessions.bankAccountId`; mappers `toBankAccount(row, lines?: BankAccountLines)`, `toTransfer`, `toStatementImport`, `toStatementLine`, and `bankAccountId` in `toExpense`, `toMovement`, `toManejoSession`; `sessionToMovement` passes the session's `bankAccountId`. The load answers `bankAccounts`, `transfers`, `reconciledIds`; `redactHerdMoney` empties them.

- [ ] **Step 1: Tests first: the mapper's "conciliado até" and the redaction.**

In `lib/api/__tests__/mappers.test.ts`, replace:

```ts
/** toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20"). */
import { describe, expect, it } from "vitest";

import { toExpense } from "@/lib/api/mappers";
import type { ExpenseRow, ExpenseSeriesRow } from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
```

with:

```ts
/**
 * toExpense: the série a row belongs to decides its markers ("2/3", "todo dia 20").
 * toBankAccount: "conciliado até" and the pending count come from its linhas.
 */
import { describe, expect, it } from "vitest";

import { toBankAccount, toExpense } from "@/lib/api/mappers";
import type { BankAccountRow, ExpenseRow, ExpenseSeriesRow } from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
```

In `lib/api/__tests__/mappers.test.ts`, replace:

```ts
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
};

const SERIES: ExpenseSeriesRow = {
```

with:

```ts
  lotId: null,
  seriesId: "s-1",
  seriesIndex: 2,
  bankAccountId: null,
};

const SERIES: ExpenseSeriesRow = {
```

In `lib/api/__tests__/mappers.test.ts`, replace:

```ts
    expect(expense.attachmentCount).toBe(0);
  });
});
```

with:

```ts
    expect(expense.attachmentCount).toBe(0);
  });
});

const BANK: BankAccountRow = {
  id: "b-1",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  label: "c/c 12.345-6",
  openingBalanceBrl: 1000,
  openingDate: "2026-08-31",
  isMain: true,
  closingDay: null,
  dueDay: null,
  paysFromId: null,
  csvMapping: null,
  archivedAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

const LINES = {
  pending: 0,
  firstDate: "2026-09-01",
  firstPendingDate: null,
  lastDate: "2026-09-20",
  pendingImportId: null,
};

describe("toBankAccount", () => {
  it("is conciliado up to the last linha when nothing waits", () => {
    expect(toBankAccount(BANK, LINES)).toMatchObject({
      pendingLines: 0,
      reconciledUntil: "2026-09-20",
      label: "c/c 12.345-6",
      isMain: true,
    });
  });

  it("stops the day before the oldest pending linha and names its import", () => {
    const account = toBankAccount(BANK, {
      ...LINES,
      pending: 12,
      firstPendingDate: "2026-09-16",
      pendingImportId: "imp-1",
    });
    expect(account).toMatchObject({ pendingLines: 12, reconciledUntil: "2026-09-15", pendingImportId: "imp-1" });
  });

  it("says nothing when the very first linha still waits, or there is no extrato", () => {
    expect(toBankAccount(BANK, { ...LINES, pending: 3, firstPendingDate: "2026-09-01" }).reconciledUntil).toBeUndefined();
    expect(toBankAccount(BANK)).toMatchObject({ pendingLines: 0 });
    expect(toBankAccount(BANK).reconciledUntil).toBeUndefined();
  });
});
```

In `lib/domain/__tests__/moneyRedaction.test.ts`, replace:

```ts
    expect(redacted.farm).toEqual(herd.farm);
  });

  it("keeps the plano de contas: names carry no money", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.accounts).toEqual(herd.accounts);
```

with:

```ts
    expect(redacted.farm).toEqual(herd.farm);
  });

  it("drops the contas bancárias, transferências and conciliação", () => {
    const redacted = redactHerdMoney({
      ...herd,
      bankAccounts: [
        { id: "b-1", kind: "checking", name: "Sicredi", openingBalanceBrl: 5000, openingDate: "2026-08-31", isMain: true, pendingLines: 0 },
      ],
      transfers: [{ id: "t-1", fromId: "b-1", toId: "b-2", date: "2026-09-02", amountBrl: 300 }],
      reconciledIds: ["e-1"],
    });
    expect(redacted.bankAccounts).toEqual([]);
    expect(redacted.transfers).toEqual([]);
    expect(redacted.reconciledIds).toEqual([]);
  });

  it("keeps the plano de contas: names carry no money", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.accounts).toEqual(herd.accounts);
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts lib/domain/__tests__/moneyRedaction.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `toBankAccount` is not exported, `bankAccountId` is not a column of `ExpenseRow` (the typecheck of the fixture fails in tsc too).

- [ ] **Step 3: Types, schema, mappers, load, redaction, the session's conta on its movement.**

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
 * joining through `animals` (they carry no farm_id of their own). Weighings
 * come sorted asc from SQL, matching the domain invariant.
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  animals,
  attachments,
  breedings,
  breeds,
  calvings,
```

with:

```ts
 * joining through `animals` (they carry no farm_id of their own). Weighings
 * come sorted asc from SQL, matching the domain invariant.
 */
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  animals,
  attachments,
  bankAccounts,
  breedings,
  breeds,
  calvings,
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
  pregnancyDiagnoses,
  semenBulls,
  semenPurchases,
  treatments,
  weighings,
} from "@/lib/db/schema";
```

with:

```ts
  pregnancyDiagnoses,
  semenBulls,
  semenPurchases,
  statementLines,
  transfers,
  treatments,
  weighings,
} from "@/lib/db/schema";
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
import {
  toAccount,
  toAnimal,
  toBreeding,
  toCalving,
  toCustomCategory,
```

with:

```ts
import {
  toAccount,
  toAnimal,
  toBankAccount,
  toBreeding,
  toCalving,
  toCustomCategory,
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
  toProtocol,
  toSemenBull,
  toSemenPurchase,
  toTreatment,
  toWeighing,
} from "@/lib/api/mappers";
```

with:

```ts
  toProtocol,
  toSemenBull,
  toSemenPurchase,
  toTransfer,
  toTreatment,
  toWeighing,
} from "@/lib/api/mappers";
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
      accountRows,
      seriesRows,
      attachmentCountRows,
    ] = await Promise.all([
      this.repository.select().from(farm).where(eq(farm.id, farmId)),
      this.repository.select().from(animals).where(eq(animals.farmId, farmId)).orderBy(asc(animals.earTag)),
```

with:

```ts
      accountRows,
      seriesRows,
      attachmentCountRows,
      bankAccountRows,
      transferRows,
      lineSummaryRows,
      reconciledRows,
    ] = await Promise.all([
      this.repository.select().from(farm).where(eq(farm.id, farmId)),
      this.repository.select().from(animals).where(eq(animals.farmId, farmId)).orderBy(asc(animals.earTag)),
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
        .from(attachments)
        .where(eq(attachments.farmId, farmId))
        .groupBy(attachments.expenseId),
    ]);

    const weighingsByAnimal = new Map<string, Weighing[]>();
```

with:

```ts
        .from(attachments)
        .where(eq(attachments.farmId, farmId))
        .groupBy(attachments.expenseId),
      this.repository
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.farmId, farmId))
        .orderBy(asc(bankAccounts.createdAt), asc(bankAccounts.id)),
      this.repository
        .select()
        .from(transfers)
        .where(eq(transfers.farmId, farmId))
        .orderBy(asc(transfers.date), asc(transfers.id)),
      // Per conta: how many linhas wait, and the dates "conciliado até" comes from.
      this.repository
        .select({
          bankAccountId: statementLines.bankAccountId,
          pending: sql<number>`count(*) filter (where ${statementLines.status} = 'pending')`.mapWith(Number),
          firstDate: sql<string | null>`min(${statementLines.date})::text`,
          firstPendingDate: sql<string | null>`(min(${statementLines.date}) filter (where ${statementLines.status} = 'pending'))::text`,
          lastDate: sql<string | null>`max(${statementLines.date})::text`,
          pendingImportId: sql<string | null>`(array_agg(${statementLines.importId} order by ${statementLines.date}, ${statementLines.id}) filter (where ${statementLines.status} = 'pending'))[1]`,
        })
        .from(statementLines)
        .where(eq(statementLines.farmId, farmId))
        .groupBy(statementLines.bankAccountId),
      this.repository
        .select({
          expenseId: statementLines.expenseId,
          movementId: statementLines.movementId,
          transferId: statementLines.transferId,
        })
        .from(statementLines)
        .where(
          and(
            eq(statementLines.farmId, farmId),
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
    ]);

    const weighingsByAnimal = new Map<string, Weighing[]>();
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
    }

    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
    const attachmentsByExpense = new Map(
      attachmentCountRows.map((row) => [row.expenseId, row.total])
    );
```

with:

```ts
    }

    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
    const linesByAccount = new Map(lineSummaryRows.map((row) => [row.bankAccountId, row]));
    const attachmentsByExpense = new Map(
      attachmentCountRows.map((row) => [row.expenseId, row.total])
    );
```

In `lib/api/domains/herd/useCases/Load.useCase.ts`, replace:

```ts
        )
      ),
      accounts: accountRows.map(toAccount),
      customCategories: customCategoryRows.map(toCustomCategory),
      semenBulls: semenBullRows.map((row) => toSemenBull(row, purchasesByBull.get(row.id) ?? [])),
      farm: farmRows.length
```

with:

```ts
        )
      ),
      accounts: accountRows.map(toAccount),
      bankAccounts: bankAccountRows.map((row) => toBankAccount(row, linesByAccount.get(row.id))),
      transfers: transferRows.map(toTransfer),
      reconciledIds: reconciledRows.flatMap((row) =>
        [row.expenseId, row.movementId, row.transferId].filter((id): id is string => id !== null)
      ),
      customCategories: customCategoryRows.map(toCustomCategory),
      semenBulls: semenBullRows.map((row) => toSemenBull(row, purchasesByBull.get(row.id) ?? [])),
      farm: farmRows.length
```

In `lib/api/mappers.ts`, replace:

```ts
  Account,
  Animal,
  Attachment,
  Breeding,
  Calving,
  CustomCategory,
```

with:

```ts
  Account,
  Animal,
  Attachment,
  BankAccount,
  Breeding,
  Calving,
  CustomCategory,
```

In `lib/api/mappers.ts`, replace:

```ts
  ReproductionRecord,
  SemenBull,
  SemenPurchase,
  Treatment,
  Weighing,
} from "@/lib/types";
import type {
  AnimalRow,
  AttachmentRow,
  BreedingRow,
  CalvingRow,
  CustomCategoryRow,
```

with:

```ts
  ReproductionRecord,
  SemenBull,
  SemenPurchase,
  StatementImport,
  StatementLine,
  Transfer,
  Treatment,
  Weighing,
} from "@/lib/types";
import type {
  AnimalRow,
  AttachmentRow,
  BankAccountRow,
  BreedingRow,
  CalvingRow,
  CustomCategoryRow,
```

In `lib/api/mappers.ts`, replace:

```ts
  PregnancyDiagnosisRow,
  SemenBullRow,
  SemenPurchaseRow,
  TreatmentRow,
  WeighingRow,
} from "@/lib/db/schema";

const orNothing = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;
```

with:

```ts
  PregnancyDiagnosisRow,
  SemenBullRow,
  SemenPurchaseRow,
  StatementImportRow,
  StatementLineRow,
  TransferRow,
  TreatmentRow,
  WeighingRow,
} from "@/lib/db/schema";
import { addDays } from "@/lib/domain/dates";

const orNothing = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;
```

In `lib/api/mappers.ts`, replace:

```ts
    destination: row.destination,
    amountBrl: orNothing(row.amountBrl),
    notes: orNothing(row.notes),
  };
}

```

with:

```ts
    destination: row.destination,
    amountBrl: orNothing(row.amountBrl),
    notes: orNothing(row.notes),
    bankAccountId: orNothing(row.bankAccountId),
  };
}

```

In `lib/api/mappers.ts`, replace:

```ts
    document: orNothing(row.document),
    accountId: orNothing(row.accountId),
    lotId: orNothing(row.lotId),
    seriesId: orNothing(row.seriesId),
    seriesIndex: orNothing(row.seriesIndex),
    seriesCount: series?.mode === "installments" ? orNothing(series.count) : undefined,
```

with:

```ts
    document: orNothing(row.document),
    accountId: orNothing(row.accountId),
    lotId: orNothing(row.lotId),
    bankAccountId: orNothing(row.bankAccountId),
    seriesId: orNothing(row.seriesId),
    seriesIndex: orNothing(row.seriesIndex),
    seriesCount: series?.mode === "installments" ? orNothing(series.count) : undefined,
```

In `lib/api/mappers.ts`, replace:

```ts
  };
}

export function toProtocol(row: HealthProtocolRow): HealthProtocol {
  return {
    id: row.id,
```

with:

```ts
  };
}

/** Linhas do extrato of the conta, as the load counts them. */
export interface BankAccountLines {
  pending: number;
  firstDate: string | null;
  firstPendingDate: string | null;
  lastDate: string | null;
  pendingImportId: string | null;
}

/**
 * "Conciliado até": with nothing pending, the last linha; otherwise the day
 * before the oldest pending one (nothing when that is the very first linha).
 */
function reconciledUntil(lines: BankAccountLines | undefined): string | undefined {
  if (!lines || lines.lastDate === null) return undefined;
  if (lines.firstPendingDate === null) return lines.lastDate;
  if (lines.firstDate === null || lines.firstPendingDate <= lines.firstDate) return undefined;
  return addDays(lines.firstPendingDate, -1);
}

export function toBankAccount(row: BankAccountRow, lines?: BankAccountLines): BankAccount {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    label: orNothing(row.label),
    openingBalanceBrl: row.openingBalanceBrl,
    openingDate: row.openingDate,
    isMain: row.isMain,
    closingDay: orNothing(row.closingDay),
    dueDay: orNothing(row.dueDay),
    paysFromId: orNothing(row.paysFromId),
    csvMapping: orNothing(row.csvMapping),
    archivedAt: row.archivedAt?.toISOString(),
    pendingLines: lines?.pending ?? 0,
    reconciledUntil: reconciledUntil(lines),
    pendingImportId: orNothing(lines?.pendingImportId ?? null),
  };
}

export function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    date: row.date,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
  };
}

export function toStatementImport(row: StatementImportRow): StatementImport {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    fileName: row.fileName,
    format: row.format,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    bankBalanceBrl: orNothing(row.bankBalanceBrl),
    bankBalanceDate: orNothing(row.bankBalanceDate),
    lineCount: row.lineCount,
    skippedCount: row.skippedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStatementLine(row: StatementLineRow): StatementLine {
  return {
    id: row.id,
    importId: row.importId,
    bankAccountId: row.bankAccountId,
    date: row.date,
    description: row.description,
    amountBrl: row.amountBrl,
    status: row.status,
    expenseId: orNothing(row.expenseId),
    movementId: orNothing(row.movementId),
    transferId: orNothing(row.transferId),
    ignoreReason: orNothing(row.ignoreReason),
  };
}

export function toProtocol(row: HealthProtocolRow): HealthProtocol {
  return {
    id: row.id,
```

In `lib/api/mappers.ts`, replace:

```ts
    totalAmountBrl: orNothing(row.totalAmountBrl),
    semenBullIds: orNothing(row.semenBullIds),
    notes: orNothing(row.notes),
  };
}
```

with:

```ts
    totalAmountBrl: orNothing(row.totalAmountBrl),
    semenBullIds: orNothing(row.semenBullIds),
    notes: orNothing(row.notes),
    bankAccountId: orNothing(row.bankAccountId),
  };
}
```

In `lib/db/schema.ts`, replace:

```ts
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Permissions } from "@/lib/domain/permissions";

/* -------------------------------------------------------------------------- */
/* Enums (stored unions only)                                                 */
```

with:

```ts
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Permissions } from "@/lib/domain/permissions";
import type { CsvMapping } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Enums (stored unions only)                                                 */
```

In `lib/db/schema.ts`, replace:

```ts
/** Interval between two lançamentos of a série. */
export const seriesFrequencyEnum = pgEnum("series_frequency", ["monthly", "weekly"]);

/** Grupo of a conta: the seven expense categories plus receitas. */
export const accountGroupEnum = pgEnum("account_group", [
  "nutrition",
```

with:

```ts
/** Interval between two lançamentos of a série. */
export const seriesFrequencyEnum = pgEnum("series_frequency", ["monthly", "weekly"]);

/** Conta corrente, caixa or cartão de crédito. */
export const bankAccountKindEnum = pgEnum("bank_account_kind", ["checking", "cash", "card"]);

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

/** Grupo of a conta: the seven expense categories plus receitas. */
export const accountGroupEnum = pgEnum("account_group", [
  "nutrition",
```

In `lib/db/schema.ts`, replace:

```ts
  calfEarTag: text("calf_ear_tag").notNull(),
});

/**
 * Animal movement (purchase, sale or transfer) — LEGACY, read-only.
 *
```

with:

```ts
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
    /** Saldo at the end of `openingDate`; 0 for a card. */
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
```

In `lib/db/schema.ts`, replace:

```ts
  /** Total value in BRL; present for purchase/sale, null for transfer. */
  amountBrl: numeric("amount_brl", { mode: "number" }),
  notes: text("notes"),
});

/**
```

with:

```ts
  /** Total value in BRL; present for purchase/sale, null for transfer. */
  amountBrl: numeric("amount_brl", { mode: "number" }),
  notes: text("notes"),
  /** Conta bancária of a purchase/sale. */
  bankAccountId: text("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
});

/**
```

In `lib/db/schema.ts`, replace:

```ts
    seriesId: text("series_id").references(() => expenseSeries.id, { onDelete: "set null" }),
    /** 1-based position in the série. */
    seriesIndex: integer("series_index"),
  },
  (t) => [
    index("expenses_farm_id_date_idx").on(t.farmId, t.date),
```

with:

```ts
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
```

In `lib/db/schema.ts`, replace:

```ts
  (t) => [index("attachments_expense_id_idx").on(t.expenseId)]
);

/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
  id: text("id").primaryKey(),
```

with:

```ts
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
 * one line at most (unique indexes); removing it returns the line to pending
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
    uniqueIndex("statement_lines_expense_id_idx").on(t.expenseId),
    uniqueIndex("statement_lines_movement_id_idx").on(t.movementId),
    uniqueIndex("statement_lines_transfer_id_idx").on(t.transferId),
  ]
);

/** Recurring health protocol of the farm. */
export const healthProtocols = pgTable("health_protocols", {
  id: text("id").primaryKey(),
```

In `lib/db/schema.ts`, replace:

```ts
    planNotes: text("plan_notes"),
    /** Soft delete: the manejo leaves the history, the row stays for audit. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("manejo_sessions_farm_id_idx").on(t.farmId)]
);
```

with:

```ts
    planNotes: text("plan_notes"),
    /** Soft delete: the manejo leaves the history, the row stays for audit. */
    deletedAt: timestamp("deleted_at"),
    /** Venda or compra: the conta bancária its money went through. */
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("manejo_sessions_farm_id_idx").on(t.farmId)]
);
```

In `lib/db/schema.ts`, replace:

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
export type ExpenseSeriesRow = typeof expenseSeries.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
export type HealthProtocolRow = typeof healthProtocols.$inferSelect;
export type ManejoSessionRow = typeof manejoSessions.$inferSelect;
```

with:

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
export type ExpenseSeriesRow = typeof expenseSeries.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type TransferRow = typeof transfers.$inferSelect;
export type StatementImportRow = typeof statementImports.$inferSelect;
export type StatementLineRow = typeof statementLines.$inferSelect;
export type CustomCategoryRow = typeof customCategories.$inferSelect;
export type HealthProtocolRow = typeof healthProtocols.$inferSelect;
export type ManejoSessionRow = typeof manejoSessions.$inferSelect;
```

In `lib/domain/moneyRedaction.ts`, replace:

```ts
    movements: data.movements.map(redactMovement),
    semenBulls: data.semenBulls.map(redactSemenBull),
    expenses: [],
  };
}
```

with:

```ts
    movements: data.movements.map(redactMovement),
    semenBulls: data.semenBulls.map(redactSemenBull),
    expenses: [],
    bankAccounts: [],
    transfers: [],
    reconciledIds: [],
  };
}
```

In `lib/domain/movements.ts`, replace:

```ts
      session.kind === "sale" ? outside : lotName(session.destinationLotId, lotNames),
    amountBrl: session.kind === "transfer" ? undefined : amountBrl,
    notes: session.notes,
  };
}

```

with:

```ts
      session.kind === "sale" ? outside : lotName(session.destinationLotId, lotNames),
    amountBrl: session.kind === "transfer" ? undefined : amountBrl,
    notes: session.notes,
    bankAccountId: session.bankAccountId,
  };
}

```

In `lib/types.ts`, replace:

```ts
   * without Financeiro, so "no price" and "a price you may not see" differ.
   */
  valuesHidden?: boolean;
  /**
   * True for a manejo started on the phone without signal that the server has
   * not created yet. Client-only: never leaves the phone.
```

with:

```ts
   * without Financeiro, so "no price" and "a price you may not see" differ.
   */
  valuesHidden?: boolean;
  /** Venda or compra: the conta bancária its money went through. */
  bankAccountId?: string;
  /**
   * True for a manejo started on the phone without signal that the server has
   * not created yet. Client-only: never leaves the phone.
```

In `lib/types.ts`, replace:

```ts
   */
  amountBrl?: number;
  notes?: string;
}

/** Category of a farm expense. */
```

with:

```ts
   */
  amountBrl?: number;
  notes?: string;
  /** Conta bancária the money of a venda or compra went through. */
  bankAccountId?: string;
}

/** Category of a farm expense. */
```

In `lib/types.ts`, replace:

```ts
  accountId?: string;
  /** Centro de custo; absent means the whole farm. */
  lotId?: string;
  /** The série (parcelamento or recorrência) this row belongs to. */
  seriesId?: string;
  /** 1-based position in its série: the "2" of "2/3". */
```

with:

```ts
  accountId?: string;
  /** Centro de custo; absent means the whole farm. */
  lotId?: string;
  /** The conta bancária it was paid from or received into ("Pago por"); paid rows only. */
  bankAccountId?: string;
  /** The série (parcelamento or recorrência) this row belongs to. */
  seriesId?: string;
  /** 1-based position in its série: the "2" of "2/3". */
```

In `lib/types.ts`, replace:

```ts
  archivedAt?: string;
}

/** Recurring health protocol of the farm. */
export interface HealthProtocol {
  id: string;
```

with:

```ts
  archivedAt?: string;
}

/** Conta corrente (takes extratos), caixa (cash) or cartão de crédito. */
export type BankAccountKind = "checking" | "cash" | "card";

/** How the columns of a bank's CSV map to a linha do extrato; stored on the conta. */
export interface CsvMapping {
  delimiter: string;
  /** 0-based column indexes. */
  dateColumn: number;
  descriptionColumn: number;
  /** Signed value in one column, or `inColumn` + `outColumn`. */
  amountColumn?: number;
  inColumn?: number;
  outColumn?: number;
  dateFormat: "dmy" | "ymd";
  decimal: "," | ".";
  /** Lines before the data (header included). */
  skipRows: number;
}

/** A place money sits: a bank account, the farm's cash or a credit card. */
export interface BankAccount {
  id: string;
  kind: BankAccountKind;
  name: string;
  /** "c/c 12.345-6", "final 4471". */
  label?: string;
  /** Saldo at the end of `openingDate`; 0 for a card. */
  openingBalanceBrl: number;
  openingDate: string;
  /** The conta "Pago por" defaults to; one per farm, never a card. */
  isMain: boolean;
  /** Card only: 1–31, a short month uses its last day. */
  closingDay?: number;
  dueDay?: number;
  /** Card only: the conta corrente that pays the fatura. */
  paysFromId?: string;
  csvMapping?: CsvMapping;
  /** ISO timestamp; archived contas leave "Pago por" and keep their rows. */
  archivedAt?: string;
  /** Linhas do extrato still waiting for a decision. */
  pendingLines: number;
  /** Every linha dated on or before this day is resolved. */
  reconciledUntil?: string;
  /** The import holding the oldest pending linha. */
  pendingImportId?: string;
}

/** Money moving between two contas of the farm; never in the resultado. */
export interface Transfer {
  id: string;
  fromId: string;
  toId: string;
  date: string;
  amountBrl: number;
  notes?: string;
}

export type StatementFormat = "ofx" | "csv";

/** An extrato file imported into a conta corrente. */
export interface StatementImport {
  id: string;
  bankAccountId: string;
  fileName: string;
  format: StatementFormat;
  periodFrom: string;
  periodTo: string;
  /** OFX LEDGERBAL: the bank's saldo on `bankBalanceDate`. */
  bankBalanceBrl?: number;
  bankBalanceDate?: string;
  /** New lines stored by this import. */
  lineCount: number;
  /** Lines of the file already imported before. */
  skippedCount: number;
  /** ISO timestamp. */
  createdAt: string;
}

export type StatementLineStatus = "pending" | "matched" | "created" | "transfer" | "ignored";

/** One line of an extrato: + entrada, − saída. */
export interface StatementLine {
  id: string;
  importId: string;
  bankAccountId: string;
  date: string;
  description: string;
  amountBrl: number;
  status: StatementLineStatus;
  expenseId?: string;
  /** A venda or compra: a manejo session id, or a legacy movement row id. */
  movementId?: string;
  transferId?: string;
  ignoreReason?: string;
}

/** Recurring health protocol of the farm. */
export interface HealthProtocol {
  id: string;
```

In `lib/types.ts`, replace:

```ts
  expenses: Expense[];
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
  customCategories: CustomCategory[];
  semenBulls: SemenBull[];
  farm: FarmData;
```

with:

```ts
  expenses: Expense[];
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
  /** Contas bancárias, caixa and cartões, archived ones included. */
  bankAccounts?: BankAccount[];
  transfers?: Transfer[];
  /** Ids of the lançamentos, vendas/compras and transferências a linha do extrato confirms. */
  reconciledIds?: string[];
  customCategories: CustomCategory[];
  semenBulls: SemenBull[];
  farm: FarmData;
```

- [ ] **Step 4: Generate migration 0023.**

Run: `pnpm exec drizzle-kit generate --name financeiro-contas-bancarias`
Expected: `drizzle/0023_financeiro-contas-bancarias.sql` with three `CREATE TYPE`, four `CREATE TABLE`, three `ALTER TABLE … ADD COLUMN "bank_account_id"`, the foreign keys and the indexes (`bank_accounts_farm_id_main_idx … WHERE "bank_accounts"."is_main"`, the three unique `statement_lines_*_id_idx`). Only additions, so drizzle-kit asks nothing (no TTY needed). If it prompts anyway, answer the first option with `(sleep 6; printf '\r') | timeout 60 script -qfec "pnpm exec drizzle-kit generate --name financeiro-contas-bancarias" /dev/null`.

- [ ] **Step 5: Append the trigger to the generated SQL.**

The generated file ends with `…ON DELETE set null ON UPDATE no action;` and no newline. Append exactly this (it starts right after that `;`), and end the file with a newline:

```sql
--> statement-breakpoint
-- Removing the lançamento, venda or transferência a linha points at nulls the pointer
-- (ON DELETE SET NULL, or the manejo removal for a venda); the linha goes back to pending.
CREATE FUNCTION "statement_lines_back_to_pending"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IN ('matched', 'created', 'transfer')
    AND NEW."expense_id" IS NULL AND NEW."movement_id" IS NULL AND NEW."transfer_id" IS NULL THEN
    NEW."status" := 'pending';
    NEW."resolved_at" := NULL;
    NEW."resolved_by" := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "statement_lines_back_to_pending" BEFORE UPDATE ON "statement_lines"
  FOR EACH ROW EXECUTE FUNCTION "statement_lines_back_to_pending"();
```

- [ ] **Step 6: Run the tests.**

Run: `pnpm exec vitest run lib/api/__tests__/mappers.test.ts lib/domain/__tests__/moneyRedaction.test.ts --exclude '**/worktrees/**'`
Expected: PASS (both files).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/types.ts lib/db/schema.ts lib/api/mappers.ts lib/api/domains/herd lib/domain`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 7: Commit.**

```bash
git add lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/api/mappers.ts lib/db/schema.ts lib/domain/__tests__/moneyRedaction.test.ts lib/domain/moneyRedaction.ts lib/domain/movements.ts lib/types.ts drizzle/0023_financeiro-contas-bancarias.sql drizzle/meta/0023_snapshot.json drizzle/meta/_journal.json
git commit -m 'feat(finance): contas bancárias, transferências and extratos in the schema'
```


---

### Task 2: Pure saldo, fatura and movimentação (`lib/domain/bankAccounts.ts`)

**Files:**
- Create: `lib/domain/__tests__/bankAccounts.test.ts`, `lib/domain/bankAccounts.ts`

**Interfaces:**
- Consumes: `BankAccount`, `Expense`, `Movement`, `Transfer`, `EntryKind` (Task 1); `addDays`, `lastDayOfMonth` from `lib/domain/dates.ts`; `Period`.
- Produces: see "Shared interfaces" — `accountBalance`, `bankTotal`, `accountMovements` (`BankMove { id, kind: "expense" | "revenue" | "sale" | "purchase" | "transferIn" | "transferOut", date, amountBrl (signed), balance, expense?, movement?, transfer? }`), `faturaOf`, `openFatura`, `payingAccounts`, `bankAccountLabel`, `BANK_ACCOUNT_KIND_LABEL`, `cents`.

- [ ] **Step 1: The tests.**

Create `lib/domain/__tests__/bankAccounts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, Movement, Transfer } from "@/lib/types";
import {
  accountBalance,
  accountMovements,
  bankTotal,
  faturaOf,
  openFatura,
  payingAccounts,
  type BankInputs,
} from "@/lib/domain/bankAccounts";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 10000,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa", openingBalanceBrl: 500, isMain: false };
const CARD: BankAccount = {
  ...SICREDI,
  id: "card",
  kind: "card",
  name: "Cartão Sicredi",
  openingBalanceBrl: 0,
  isMain: false,
  closingDay: 31,
  dueDay: 10,
  paysFromId: "sicredi",
};

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "nutrition",
  amountBrl: 100,
  ...patch,
});

const EMPTY: BankInputs = { expenses: [], movements: [], transfers: [] };

describe("accountBalance", () => {
  it("adds what was paid and received by the conta after the opening date only", () => {
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        // On the opening day: already inside the saldo inicial.
        expense("old", { paidAt: "2026-08-31", bankAccountId: "sicredi", amountBrl: 999 }),
        expense("feed", { paidAt: "2026-09-05", bankAccountId: "sicredi", amountBrl: 1200 }),
        expense("rent", { kind: "revenue", category: "other", paidAt: "2026-09-06", bankAccountId: "sicredi", amountBrl: 300 }),
        // Pending, another conta, no conta: none of them count here.
        expense("pending", { bankAccountId: "sicredi" }),
        expense("cash", { paidAt: "2026-09-05", bankAccountId: "caixa" }),
        expense("before-contas", { paidAt: "2026-09-05" }),
      ],
    };
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(9100);
    expect(accountBalance(SICREDI, inputs, "2026-09-05")).toBe(8800);
    expect(accountBalance(SICREDI, inputs, "2026-08-31")).toBe(10000);
  });

  it("counts vendas, compras and transferências", () => {
    const movements: Movement[] = [
      { id: "m-sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Minerva", amountBrl: 148320, bankAccountId: "sicredi" },
      { id: "m-buy", type: "purchase", date: "2026-09-21", origin: "Leilão", destination: "Recria", amountBrl: 20000, bankAccountId: "sicredi" },
      { id: "m-move", type: "transfer", date: "2026-09-21", origin: "A", destination: "B", bankAccountId: "sicredi" },
    ];
    const transfers: Transfer[] = [{ id: "t-1", fromId: "sicredi", toId: "caixa", date: "2026-09-15", amountBrl: 2000 }];
    const inputs = { ...EMPTY, movements, transfers };
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(10000 + 148320 - 20000 - 2000);
    expect(accountBalance(CAIXA, inputs, "2026-09-30")).toBe(2500);
    // A transferência never changes the saldo em contas.
    expect(bankTotal([SICREDI, CAIXA], { ...EMPTY, transfers }, "2026-09-30")).toBe(10500);
  });

  it("keeps cartões and archived contas out of the saldo em contas", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    expect(bankTotal([SICREDI, CARD, archived], EMPTY, "2026-09-30")).toBe(10000);
  });
});

describe("accountMovements", () => {
  it("lists the window newest first with the saldo after each line", () => {
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        expense("a", { paidAt: "2026-09-02", bankAccountId: "sicredi", amountBrl: 100.1 }),
        expense("b", { paidAt: "2026-09-10", bankAccountId: "sicredi", amountBrl: 0.2 }),
        expense("c", { paidAt: "2026-10-02", bankAccountId: "sicredi", amountBrl: 50 }),
      ],
      transfers: [{ id: "t", fromId: "caixa", toId: "sicredi", date: "2026-09-05", amountBrl: 1000 }],
    };
    const rows = accountMovements(SICREDI, inputs, { start: "2026-09-03", end: "2026-09-30" });
    expect(rows.map((r) => [r.id, r.kind, r.amountBrl, r.balance])).toEqual([
      ["b", "expense", -0.2, 10899.7],
      ["t", "transferIn", 1000, 10899.9],
    ]);
  });
});

describe("faturaOf", () => {
  it("closes on day 31 at the end of each month, February included", () => {
    expect(faturaOf(CARD, "2026-09-15")).toEqual({ opensAfter: "2026-08-31", closing: "2026-09-30", due: "2026-10-10" });
    expect(faturaOf(CARD, "2027-02-28")).toEqual({ opensAfter: "2027-01-31", closing: "2027-02-28", due: "2027-03-10" });
    expect(faturaOf(CARD, "2028-02-29").closing).toBe("2028-02-29");
    expect(faturaOf(CARD, "2027-03-01")).toEqual({ opensAfter: "2027-02-28", closing: "2027-03-31", due: "2027-04-10" });
  });

  it("moves a purchase after the closing day to the next fatura, across the year", () => {
    const card = { closingDay: 5, dueDay: 15 };
    expect(faturaOf(card, "2026-12-05")).toEqual({ opensAfter: "2026-11-05", closing: "2026-12-05", due: "2026-12-15" });
    expect(faturaOf(card, "2026-12-06")).toEqual({ opensAfter: "2026-12-05", closing: "2027-01-05", due: "2027-01-15" });
  });

  it("falls due the month after when the due day is not after the closing day", () => {
    expect(faturaOf({ closingDay: 25, dueDay: 25 }, "2026-09-10").due).toBe("2026-10-25");
    expect(faturaOf({ closingDay: 25, dueDay: 31 }, "2027-01-26")).toMatchObject({ closing: "2027-02-25", due: "2027-02-28" });
  });
});

describe("openFatura", () => {
  it("sums the purchases of the open fatura minus the payments into the card", () => {
    const inputs: BankInputs = {
      ...EMPTY,
      expenses: [
        expense("closed", { paidAt: "2026-08-30", bankAccountId: "card", amountBrl: 700 }),
        expense("diesel", { paidAt: "2026-09-02", bankAccountId: "card", amountBrl: 3150 }),
        expense("vet", { paidAt: "2026-09-30", bankAccountId: "card", amountBrl: 90 }),
        expense("next", { paidAt: "2026-10-01", bankAccountId: "card", amountBrl: 45 }),
      ],
      transfers: [
        { id: "pay-aug", fromId: "sicredi", toId: "card", date: "2026-09-10", amountBrl: 700 },
      ],
    };
    expect(openFatura(CARD, inputs, "2026-09-27")).toEqual({
      opensAfter: "2026-08-31",
      closing: "2026-09-30",
      due: "2026-10-10",
      amountBrl: 3150 + 90 - 700,
    });
    // The payment leaves the conta corrente, never the resultado.
    expect(accountBalance(SICREDI, inputs, "2026-09-30")).toBe(9300);
  });
});

describe("payingAccounts", () => {
  it("offers the conta principal first, cartões for despesas only, no archived conta", () => {
    const archived = { ...CAIXA, id: "old", archivedAt: "2026-09-01T00:00:00.000Z" };
    const list = [CARD, CAIXA, archived, SICREDI];
    expect(payingAccounts(list, "expense").map((a) => a.id)).toEqual(["sicredi", "card", "caixa"]);
    expect(payingAccounts(list, "revenue").map((a) => a.id)).toEqual(["sicredi", "caixa"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/domain/__tests__/bankAccounts.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — cannot resolve `@/lib/domain/bankAccounts`.

- [ ] **Step 3: The module.**

Create `lib/domain/bankAccounts.ts`:

```ts
/**
 * Contas bancárias: saldo of a conta corrente or caixa, the fatura of a
 * cartão and the movimentação of one conta with its running saldo. Pure.
 *
 * What counts in a conta: the paid lançamentos and the vendas/compras whose
 * `bankAccountId` is it, and the transferências in and out, all dated after
 * `openingDate` (anything on or before it is already in the saldo inicial).
 */
import type { BankAccount, EntryKind, Expense, Movement, Transfer } from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { addDays, lastDayOfMonth } from "@/lib/domain/dates";

export interface BankInputs {
  expenses: Expense[];
  movements: Movement[];
  transfers: Transfer[];
}

export type BankMoveKind = "expense" | "revenue" | "sale" | "purchase" | "transferIn" | "transferOut";

/** One line of a conta's movimentação. */
export interface BankMove {
  /** The record's id (lançamento, movement or transferência). */
  id: string;
  kind: BankMoveKind;
  date: string;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
  /** Saldo of the conta after this line. */
  balance: number;
  expense?: Expense;
  movement?: Movement;
  transfer?: Transfer;
}

export const BANK_ACCOUNT_KIND_LABEL: Record<BankAccount["kind"], string> = {
  checking: "Conta corrente",
  cash: "Caixa",
  card: "Cartão",
};

/** Money rounded to the centavo, so running sums never show 0,30000000004. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every line of the conta after its opening date, oldest first, without saldo. */
function movesOf(account: BankAccount, inputs: BankInputs): Omit<BankMove, "balance">[] {
  const after = (date: string) => date > account.openingDate;
  const moves: Omit<BankMove, "balance">[] = [];
  for (const e of inputs.expenses) {
    if (e.bankAccountId !== account.id || e.paidAt === undefined || !after(e.paidAt)) continue;
    const revenue = e.kind === "revenue";
    moves.push({
      id: e.id,
      kind: revenue ? "revenue" : "expense",
      date: e.paidAt,
      amountBrl: revenue ? e.amountBrl : -e.amountBrl,
      expense: e,
    });
  }
  for (const m of inputs.movements) {
    if (m.bankAccountId !== account.id || m.amountBrl === undefined || !after(m.date)) continue;
    if (m.type === "transfer") continue;
    const sale = m.type === "sale";
    moves.push({
      id: m.id,
      kind: sale ? "sale" : "purchase",
      date: m.date,
      amountBrl: sale ? m.amountBrl : -m.amountBrl,
      movement: m,
    });
  }
  for (const t of inputs.transfers) {
    if (!after(t.date)) continue;
    if (t.toId === account.id) {
      moves.push({ id: t.id, kind: "transferIn", date: t.date, amountBrl: t.amountBrl, transfer: t });
    } else if (t.fromId === account.id) {
      moves.push({ id: t.id, kind: "transferOut", date: t.date, amountBrl: -t.amountBrl, transfer: t });
    }
  }
  return moves.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
}

/** Saldo of a conta at the end of `day`. */
export function accountBalance(account: BankAccount, inputs: BankInputs, day: string): number {
  let balance = account.openingBalanceBrl;
  for (const move of movesOf(account, inputs)) {
    if (move.date <= day) balance += move.amountBrl;
  }
  return cents(balance);
}

/** "Saldo em contas": every conta corrente and caixa that is not archived. Cartões stay out. */
export function bankTotal(accounts: BankAccount[], inputs: BankInputs, day: string): number {
  return cents(
    accounts
      .filter((a) => a.kind !== "card" && a.archivedAt === undefined)
      .reduce((sum, a) => sum + accountBalance(a, inputs, day), 0)
  );
}

/** The conta's lines inside the window, newest first, each with the saldo after it. */
export function accountMovements(account: BankAccount, inputs: BankInputs, period: Period): BankMove[] {
  let balance = account.openingBalanceBrl;
  const rows: BankMove[] = [];
  for (const move of movesOf(account, inputs)) {
    if (move.date > period.end) break;
    balance = cents(balance + move.amountBrl);
    if (move.date >= period.start) rows.push({ ...move, balance });
  }
  return rows.reverse();
}

/** Day `day` of the month of `iso`; a shorter month uses its last day. */
function dayOfMonth(iso: string, day: number): string {
  const last = lastDayOfMonth(iso);
  return Number(last.slice(8, 10)) < day ? last : `${iso.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** First day of the month after the month of `iso`. */
function nextMonth(iso: string): string {
  return addDays(lastDayOfMonth(iso), 1);
}

/** First day of the month before the month of `iso`. */
function previousMonth(iso: string): string {
  return `${addDays(`${iso.slice(0, 8)}01`, -1).slice(0, 8)}01`;
}

export interface Fatura {
  /** Purchases after this day belong to it. */
  opensAfter: string;
  /** Its closing day: the last purchase day it takes. */
  closing: string;
  due: string;
}

/**
 * The fatura a purchase on `date` belongs to: the first closing day on or
 * after it; due on the next due day after that closing day.
 */
export function faturaOf(card: Pick<BankAccount, "closingDay" | "dueDay">, date: string): Fatura {
  const closingDay = card.closingDay ?? 1;
  const dueDay = card.dueDay ?? 1;
  const thisMonth = dayOfMonth(date, closingDay);
  const closing = date <= thisMonth ? thisMonth : dayOfMonth(nextMonth(date), closingDay);
  const dueSameMonth = dayOfMonth(closing, dueDay);
  const due = dueSameMonth > closing ? dueSameMonth : dayOfMonth(nextMonth(closing), dueDay);
  return { opensAfter: dayOfMonth(previousMonth(closing), closingDay), closing, due };
}

/**
 * "Fatura aberta" of a card on `today`: its purchases in the fatura still
 * open, minus the transferências into the card dated inside it.
 */
export function openFatura(
  card: BankAccount,
  inputs: BankInputs,
  today: string
): Fatura & { amountBrl: number } {
  const fatura = faturaOf(card, today);
  const inside = (date: string) => date > fatura.opensAfter && date <= fatura.closing;
  let amount = 0;
  for (const e of inputs.expenses) {
    if (e.bankAccountId === card.id && e.kind === "expense" && e.paidAt && inside(e.paidAt)) {
      amount += e.amountBrl;
    }
  }
  for (const t of inputs.transfers) {
    if (t.toId === card.id && inside(t.date)) amount -= t.amountBrl;
  }
  return { ...fatura, amountBrl: cents(amount) };
}

/**
 * The contas "Pago por" offers: not archived, the conta principal first; a
 * cartão only for a despesa.
 */
export function payingAccounts(accounts: BankAccount[], kind: EntryKind): BankAccount[] {
  return accounts
    .filter((a) => a.archivedAt === undefined && (kind === "expense" || a.kind !== "card"))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
}

/** "Sicredi · c/c 12.345-6". */
export function bankAccountLabel(account: Pick<BankAccount, "name" | "label">): string {
  return account.label ? `${account.name} · ${account.label}` : account.name;
}
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm exec vitest run lib/domain/__tests__/bankAccounts.test.ts --exclude '**/worktrees/**'`
Expected: PASS (9 tests).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/domain/bankAccounts.ts lib/domain/__tests__/bankAccounts.test.ts`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 5: Commit.**

```bash
git add lib/domain/__tests__/bankAccounts.test.ts lib/domain/bankAccounts.ts
git commit -m 'feat(finance): saldo per conta, fatura of a cartão and the movimentação'
```


---

### Task 3: OFX and CSV parsers with sample extratos (`lib/domain/statements/`)

**Files:**
- Create: `lib/domain/statements/__tests__/fixtures/banco-ptbr.csv`, `lib/domain/statements/__tests__/fixtures/bb-2x.ofx`, `lib/domain/statements/__tests__/fixtures/sicredi-1x.ofx`, `lib/domain/statements/__tests__/fixtures/split-in-out.csv`, `lib/domain/statements/__tests__/statements.test.ts`, `lib/domain/statements/common.ts`, `lib/domain/statements/csv.ts`, `lib/domain/statements/ofx.ts`

**Interfaces:**
- Consumes: `CsvMapping`, `StatementFormat` (Task 1).
- Produces: `common.ts` — `ParsedLine { date, description, amountBrl, externalId }`, `ParsedStatement { lines, bankBalance?, period: { from, to } }`, `ParseResult`, `MAX_STATEMENT_BYTES` (2 MB), `isoDate`, `parseAmountText(text, decimal)`, `hashText`, `lineHashes(lines)` (`h:` + hash of date, description, value and occurrence), `linesPeriod`, `decodeBankFile(bytes)`, `statementFormat(fileName, text)`, `statementErrorMessage(code)`; `ofx.ts` — `parseOfx(text)` (`externalId` `f:<FITID>`); `csv.ts` — `csvRows`, `parseCsv`, `guessCsvMapping`. Error codes: `not_ofx`, `no_lines`, `bad_date:<row>`, `bad_amount:<row>` (OFX: the transaction's 1-based position; CSV: the file's line).

The four fixtures are real test inputs: a Sicredi-like OFX 1.x SGML (no closing tags on elements, CHARSET 1252, one line with NAME and no MEMO), a BB-like OFX 2.x XML (comma decimals, an `&amp;`, a FITID repeated), a pt-BR `;` CSV (title row, header, the bank's "Saldo anterior" row, a quoted `;`, two identical tarifas) and a CSV with entrada and saída split. Write them byte for byte: `banco-ptbr.csv` ends with an empty line.

- [ ] **Step 1: Fixtures and tests.**

Create `lib/domain/statements/__tests__/fixtures/banco-ptbr.csv`:

```text
Extrato conta corrente;;;
Data;Histórico;Documento;Valor (R$)
01/09/2026;Saldo anterior;;50.000,00
05/09/2026;"COOPERATIVA MISTA; DIESEL";4471;-3.150,00
10/09/2026;TARIFA DOC;;-12,50
10/09/2026;TARIFA DOC;;-12,50
12/09/2026;DEP DINHEIRO;;1.234,56

```

Create `lib/domain/statements/__tests__/fixtures/bb-2x.ofx`:

```text
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <DTSERVER>20260927</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>0</TRNUID>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKACCTFROM><BANKID>001</BANKID><ACCTID>98765-0</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260915</DTSTART>
          <DTEND>20260930</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260925</DTPOSTED>
            <TRNAMT>-912.35</TRNAMT>
            <FITID>20260925912</FITID>
            <NAME>DEB AUT CEMIG DISTRIB</NAME>
            <MEMO>Cemig &amp; Cia</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260926</DTPOSTED>
            <TRNAMT>-1280,00</TRNAMT>
            <FITID>20260926001</FITID>
            <NAME>PIX ENVIADO AGROVET UBERABA</NAME>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260926</DTPOSTED>
            <TRNAMT>-1280,00</TRNAMT>
            <FITID>20260926001</FITID>
            <NAME>PIX ENVIADO AGROVET UBERABA</NAME>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL><BALAMT>23108.15</BALAMT><DTASOF>20260930</DTASOF></LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
```

Create `lib/domain/statements/__tests__/fixtures/sicredi-1x.ofx`:

```text
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260927083015[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>748
<BRANCHID>0812
<ACCTID>123456
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260901000000[-3:BRT]
<DTEND>20260926235959[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260910120000[-3:BRT]
<TRNAMT>-18400.00
<FITID>202609100001
<CHECKNUM>100001
<MEMO>PAGTO FOLHA SALARIOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260918120000[-3:BRT]
<TRNAMT>-4850.00
<FITID>202609180002
<MEMO>PIX ENVIADO AGROPECUARIA SERTAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260920120000[-3:BRT]
<TRNAMT>148320.00
<FITID>202609200003
<MEMO>PIX RECEBIDO FRIGORIFICO MINERVA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260923120000[-3:BRT]
<TRNAMT>-64.90
<FITID>202609230004
<NAME>TARIFA PACOTE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260924120000[-3:BRT]
<TRNAMT>-1000.00
<FITID>202609240005
<MEMO>SAQUE CAIXA 24H AG 0812
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>84312.40
<DTASOF>20260926235959[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
```

Create `lib/domain/statements/__tests__/fixtures/split-in-out.csv`:

```text
date,description,in,out
2026-09-05,Leilao Nelore,"12,000.00",
2026-09-06,Vacinas Agrovet,,1280.00
```

Create `lib/domain/statements/__tests__/statements.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeBankFile,
  lineHashes,
  parseAmountText,
  statementErrorMessage,
  statementFormat,
} from "@/lib/domain/statements/common";
import { parseOfx } from "@/lib/domain/statements/ofx";
import { csvRows, guessCsvMapping, parseCsv } from "@/lib/domain/statements/csv";
import type { CsvMapping } from "@/lib/types";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseOfx", () => {
  it("reads a 1.x SGML extrato (Sicredi-like): lines, FITIDs, LEDGERBAL and the window", () => {
    const result = parseOfx(fixture("sicredi-1x.ofx"));
    if (!result.ok) throw new Error(result.error);
    const { lines, bankBalance, period } = result.statement;
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({
      date: "2026-09-10",
      description: "PAGTO FOLHA SALARIOS",
      amountBrl: -18400,
      externalId: "f:202609100001",
    });
    expect(lines[2]).toMatchObject({ amountBrl: 148320, description: "PIX RECEBIDO FRIGORIFICO MINERVA" });
    // No MEMO: the NAME describes it.
    expect(lines[3]).toMatchObject({ description: "TARIFA PACOTE SERVICOS", amountBrl: -64.9 });
    expect(bankBalance).toEqual({ amountBrl: 84312.4, date: "2026-09-26" });
    expect(period).toEqual({ from: "2026-09-01", to: "2026-09-26" });
  });

  it("reads a 2.x XML extrato (BB-like) with comma decimals, entities and a repeated FITID", () => {
    const result = parseOfx(fixture("bb-2x.ofx"));
    if (!result.ok) throw new Error(result.error);
    const { lines, bankBalance, period } = result.statement;
    expect(lines.map((l) => [l.date, l.description, l.amountBrl, l.externalId])).toEqual([
      ["2026-09-25", "Cemig & Cia", -912.35, "f:20260925912"],
      ["2026-09-26", "PIX ENVIADO AGROVET UBERABA", -1280, "f:20260926001"],
      ["2026-09-26", "PIX ENVIADO AGROVET UBERABA", -1280, "f:20260926001:2"],
    ]);
    expect(bankBalance).toEqual({ amountBrl: 23108.15, date: "2026-09-30" });
    expect(period).toEqual({ from: "2026-09-15", to: "2026-09-30" });
  });

  it("answers codes for what it cannot read", () => {
    expect(parseOfx("Data;Valor\n01/09/2026;10,00")).toEqual({ ok: false, error: "not_ofx" });
    expect(parseOfx("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>")).toEqual({ ok: false, error: "no_lines" });
    const twoLines = "<OFX><STMTTRN><DTPOSTED>20260901<TRNAMT>-1.00<FITID>1</STMTTRN><STMTTRN>";
    expect(parseOfx(`${twoLines}<DTPOSTED>20260231<TRNAMT>-1.00</STMTTRN></OFX>`)).toEqual({ ok: false, error: "bad_date:2" });
    expect(parseOfx(`${twoLines}<DTPOSTED>20260902<TRNAMT>abc</STMTTRN></OFX>`)).toEqual({ ok: false, error: "bad_amount:2" });
  });
});

const PTBR: CsvMapping = {
  delimiter: ";",
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 3,
  dateFormat: "dmy",
  decimal: ",",
  skipRows: 2,
};

describe("parseCsv", () => {
  it("reads ; with pt-BR decimals, a quoted delimiter, and leaves the saldo row out", () => {
    const result = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => [l.date, l.description, l.amountBrl])).toEqual([
      ["2026-09-05", "COOPERATIVA MISTA; DIESEL", -3150],
      ["2026-09-10", "TARIFA DOC", -12.5],
      ["2026-09-10", "TARIFA DOC", -12.5],
      ["2026-09-12", "DEP DINHEIRO", 1234.56],
    ]);
    expect(result.statement.period).toEqual({ from: "2026-09-05", to: "2026-09-12" });
  });

  it("keeps two identical lines apart and gives the same ids on a second read", () => {
    const first = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    const again = parseCsv(fixture("banco-ptbr.csv"), PTBR);
    if (!first.ok || !again.ok) throw new Error("unreadable");
    const ids = first.statement.lines.map((l) => l.externalId);
    expect(new Set(ids).size).toBe(4);
    expect(again.statement.lines.map((l) => l.externalId)).toEqual(ids);
  });

  it("reads entrada and saída split in two columns", () => {
    const result = parseCsv(fixture("split-in-out.csv"), {
      delimiter: ",",
      dateColumn: 0,
      descriptionColumn: 1,
      inColumn: 2,
      outColumn: 3,
      dateFormat: "ymd",
      decimal: ".",
      skipRows: 1,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.statement.lines.map((l) => [l.date, l.amountBrl])).toEqual([
      ["2026-09-05", 12000],
      ["2026-09-06", -1280],
    ]);
  });

  it("names the file row it cannot read", () => {
    expect(parseCsv("Data;Desc;Valor\n31/02/2026;X;1,00", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({
      ok: false,
      error: "bad_date:2",
    });
    expect(parseCsv("Data;Desc;Valor\n01/09/2026;X;1,00\n02/09/2026;Y;um real", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({
      ok: false,
      error: "bad_amount:3",
    });
    expect(parseCsv("Data;Desc;Valor\n", { ...PTBR, amountColumn: 2, skipRows: 1 })).toEqual({ ok: false, error: "no_lines" });
  });

  it("guesses the mapping of a pt-BR file", () => {
    expect(guessCsvMapping(fixture("banco-ptbr.csv"))).toEqual(PTBR);
  });
});

describe("statement helpers", () => {
  it("reads money the way banks write it", () => {
    expect(parseAmountText("1.234,56", ",")).toBe(1234.56);
    expect(parseAmountText("-1234.56", ".")).toBe(-1234.56);
    expect(parseAmountText("R$ 64,90-", ",")).toBe(-64.9);
    expect(parseAmountText("(10,00)", ",")).toBe(-10);
    expect(parseAmountText("12a", ",")).toBeNull();
  });

  it("hashes identical lines by their occurrence", () => {
    const line = { date: "2026-09-10", description: "TARIFA", amountBrl: -12.5 };
    const [a, b] = lineHashes([line, line]);
    expect(a).not.toBe(b);
    expect(lineHashes([line])[0]).toBe(a);
  });

  it("decodes Windows-1252 when the bytes are not UTF-8", () => {
    expect(decodeBankFile(new Uint8Array([0x48, 0x69, 0x73, 0x74, 0xf3, 0x72, 0x69, 0x63, 0x6f]))).toBe("Histórico");
    expect(decodeBankFile(new TextEncoder().encode("﻿Histórico"))).toBe("Histórico");
  });

  it("tells OFX from CSV and says what went wrong in pt-BR", () => {
    expect(statementFormat("extrato.OFX", "")).toBe("ofx");
    expect(statementFormat("extrato.csv", "<OFX>")).toBe("csv");
    expect(statementFormat("download", "<OFX>")).toBe("ofx");
    expect(statementErrorMessage("bad_date:12")).toBe("Data ilegível na linha 12");
    expect(csvRows('a;"b;c";"d ""e"""', ";")).toEqual([["a", "b;c", 'd "e"']]);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/statements.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — cannot resolve `@/lib/domain/statements/common`.

- [ ] **Step 3: The parsers.**

Create `lib/domain/statements/common.ts`:

```ts
/**
 * What an extrato parser answers, and the small helpers both parsers share:
 * the error codes, the amount and date readers, the CSV line hash and the
 * file's text decoding. Pure.
 */
import type { StatementFormat } from "@/lib/types";

export interface ParsedLine {
  date: string;
  description: string;
  /** Signed: + entrada, − saída. */
  amountBrl: number;
  /** OFX FITID, or a hash of the CSV line and its occurrence. */
  externalId: string;
}

export interface ParsedStatement {
  lines: ParsedLine[];
  /** OFX LEDGERBAL. */
  bankBalance?: { amountBrl: number; date: string };
  period: { from: string; to: string };
}

/** `not_ofx`, `no_lines`, `bad_date:<row>`, `bad_amount:<row>`. */
export type ParseResult = { ok: true; statement: ParsedStatement } | { ok: false; error: string };

/** Largest extrato file accepted, in bytes. */
export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" when the parts name a real day, else null. */
export function isoDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const match = ISO.exec(iso);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * A money text as a number: "1.234,56" with `decimal` ",", "-1234.56" with
 * ".", "R$ 64,90", "64,90-" or "(64,90)" for a negative. Null when unreadable.
 */
export function parseAmountText(text: string, decimal: "," | "."): number | null {
  let t = text.replace(/R\$|\s| /g, "");
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith("-")) {
    negative = true;
    t = t.slice(0, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  t = decimal === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const value = Math.round(Number(t) * 100) / 100;
  return negative ? -value : value;
}

/** cyrb53: a 53-bit string hash, stable across runs, as base 36. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The `externalId` of a line without a bank id: its date, description and
 * value, plus how many identical lines came before it in the same file, so
 * two real R$ 50 tarifas on one day stay two lines.
 */
export function lineHashes(lines: Omit<ParsedLine, "externalId">[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const key = `${line.date}|${line.description.trim().toLowerCase()}|${line.amountBrl.toFixed(2)}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return `h:${hashText(`${key}|${occurrence}`)}`;
  });
}

/** First and last date of the lines. */
export function linesPeriod(lines: { date: string }[]): { from: string; to: string } {
  const dates = lines.map((l) => l.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/**
 * The file's text: UTF-8 when it is valid UTF-8, else Windows-1252 (what
 * Brazilian banks write when they write Latin-1).
 */
export function decodeBankFile(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

/** OFX by extension (.ofx, .qfx) or by an <OFX> tag; anything else is CSV. */
export function statementFormat(fileName: string, text: string): StatementFormat {
  if (/\.(ofx|qfx)$/i.test(fileName)) return "ofx";
  if (/\.(csv|txt)$/i.test(fileName)) return "csv";
  return /<OFX>/i.test(text) ? "ofx" : "csv";
}

/** pt-BR message for a parser error code ("bad_date:12" → "Data ilegível na linha 12"). */
export function statementErrorMessage(code: string): string {
  const [kind, row] = code.split(":");
  if (kind === "not_ofx") return "O arquivo não é um extrato OFX";
  if (kind === "no_lines") return "O extrato não tem lançamentos";
  if (kind === "bad_date") return `Data ilegível na linha ${row}`;
  if (kind === "bad_amount") return `Valor ilegível na linha ${row}`;
  return "Não foi possível ler o extrato";
}
```

Create `lib/domain/statements/csv.ts`:

```ts
/**
 * CSV extratos: every bank writes its own columns, so the conta keeps a
 * mapping (which column is Data, Descrição, Valor or Entrada + Saída, the
 * delimiter, how many lines to skip). `guessCsvMapping` proposes one from the
 * first lines; `parseCsv` reads the file with it. Pure.
 */
import type { CsvMapping } from "@/lib/types";
import {
  isoDate,
  lineHashes,
  linesPeriod,
  parseAmountText,
  type ParseResult,
  type ParsedLine,
} from "@/lib/domain/statements/common";

/** The file's rows split into cells; quoted cells may hold the delimiter and "" for a quote. */
export function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quoted) {
        if (ch === '"' && raw[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

/** "23/09/2026", "23-09-26" (dmy) or "2026-09-23" (ymd). */
function csvDate(text: string, format: CsvMapping["dateFormat"]): string | null {
  const t = text.trim().slice(0, 10);
  if (format === "ymd") {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
    return m ? isoDate(m[1], m[2], m[3]) : null;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  return isoDate(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]);
}

/** Lower case without accents. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Reads the file with the mapping. Blank rows and the bank's own saldo rows
 * ("Saldo anterior", "S A L D O") are left out. Rows are counted from 1 as
 * in the file, header included.
 */
export function parseCsv(text: string, mapping: CsvMapping): ParseResult {
  const rows = csvRows(text, mapping.delimiter);
  const lines: Omit<ParsedLine, "externalId">[] = [];
  for (let i = mapping.skipRows; i < rows.length; i++) {
    const cells = rows[i];
    const row = i + 1;
    if (cells.every((c) => c === "")) continue;
    const description = cells[mapping.descriptionColumn] ?? "";
    if (/^s\s?a\s?l\s?d\s?o/.test(fold(description))) continue;
    const date = csvDate(cells[mapping.dateColumn] ?? "", mapping.dateFormat);
    if (date === null) return { ok: false, error: `bad_date:${row}` };
    let amountBrl: number | null;
    if (mapping.amountColumn !== undefined) {
      amountBrl = parseAmountText(cells[mapping.amountColumn] ?? "", mapping.decimal);
    } else {
      const read = (column: number | undefined) => {
        const cell = column === undefined ? "" : (cells[column] ?? "");
        return cell === "" ? 0 : parseAmountText(cell, mapping.decimal);
      };
      const entrada = read(mapping.inColumn);
      const saida = read(mapping.outColumn);
      amountBrl = entrada === null || saida === null ? null : Math.abs(entrada) - Math.abs(saida);
    }
    if (amountBrl === null) return { ok: false, error: `bad_amount:${row}` };
    lines.push({ date, description, amountBrl: Math.round(amountBrl * 100) / 100 });
  }
  if (lines.length === 0) return { ok: false, error: "no_lines" };
  const hashes = lineHashes(lines);
  const parsed = lines.map((line, i) => ({ ...line, externalId: hashes[i] }));
  return { ok: true, statement: { lines: parsed, period: linesPeriod(parsed) } };
}

/**
 * A first mapping from the file itself: the delimiter that splits the first
 * lines most evenly, the header rows before the first date, the date and value
 * columns by what they hold and the widest text as the description. The
 * mapping step shows it for the user to correct.
 */
export function guessCsvMapping(text: string): CsvMapping {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const delimiter =
    [";", ",", "\t"]
      .map((d) => ({ d, n: csvRows(sample, d).filter((r) => r.length > 2).length }))
      .sort((a, b) => b.n - a.n)[0].d;
  const rows = csvRows(text, delimiter).slice(0, 20);
  const dateFormat: CsvMapping["dateFormat"] = rows.some((r) => r.some((c) => csvDate(c, "ymd"))) ? "ymd" : "dmy";
  const skipRows = Math.max(
    0,
    rows.findIndex((r) => r.some((c) => csvDate(c, dateFormat) !== null))
  );
  const data = rows.slice(skipRows).filter((r) => r.some((c) => c !== ""));
  const width = Math.max(0, ...data.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => data.map((r) => r[i] ?? ""));
  const decimal: CsvMapping["decimal"] = columns.some((col) => col.some((c) => /\d,\d{2}$/.test(c))) ? "," : ".";
  const dateColumn = Math.max(0, columns.findIndex((col) => col.every((c) => csvDate(c, dateFormat) !== null)));
  // Money has centavos: a column of document numbers parses too, but never ends in ",50".
  const amountColumns = columns
    .map((col, i) => ({
      i,
      ok:
        col.every((c) => c === "" || parseAmountText(c, decimal) !== null) &&
        col.some((c) => /[.,]\d{2}\)?-?$/.test(c)),
    }))
    .filter((c) => c.ok && c.i !== dateColumn)
    .map((c) => c.i);
  const textColumns = columns
    .map((col, i) => ({ i, len: col.reduce((sum, c) => sum + c.length, 0) }))
    .filter((c) => c.i !== dateColumn && !amountColumns.includes(c.i))
    .sort((a, b) => b.len - a.len);
  return {
    delimiter,
    dateColumn,
    descriptionColumn: textColumns[0]?.i ?? 1,
    amountColumn: amountColumns[0] ?? 2,
    dateFormat,
    decimal,
    skipRows,
  };
}
```

Create `lib/domain/statements/ofx.ts`:

```ts
/**
 * OFX extratos, 1.x (SGML: `<TRNAMT>-64.90` with no closing tag) and 2.x
 * (XML). Reads each STMTTRN (DTPOSTED, TRNAMT, FITID, MEMO or NAME), the
 * LEDGERBAL and the BANKTRANLIST window. Pure; no dependency.
 */
import {
  isoDate,
  lineHashes,
  linesPeriod,
  parseAmountText,
  type ParseResult,
  type ParsedLine,
} from "@/lib/domain/statements/common";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** The text of the first `<TAG>` in `block`, closed or not; null when absent or empty. */
function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1].replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]).trim();
  return value ? value : null;
}

/** "20260923120000[-3:BRT]" → "2026-09-23". */
function ofxDate(text: string | null): string | null {
  const match = text ? /^(\d{4})(\d{2})(\d{2})/.exec(text) : null;
  return match ? isoDate(match[1], match[2], match[3]) : null;
}

/** OFX writes "." as decimal; a few Brazilian banks write "," instead. */
function ofxAmount(text: string | null): number | null {
  if (text === null) return null;
  return parseAmountText(text, text.includes(",") && !text.includes(".") ? "," : ".");
}

export function parseOfx(text: string): ParseResult {
  if (!/<OFX>/i.test(text)) return { ok: false, error: "not_ofx" };

  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map(
    (m) => m[1]
  );
  if (blocks.length === 0) return { ok: false, error: "no_lines" };

  const lines: Omit<ParsedLine, "externalId">[] = [];
  const fitIds: (string | null)[] = [];
  for (const [index, block] of blocks.entries()) {
    const row = index + 1;
    const date = ofxDate(tag(block, "DTPOSTED"));
    if (date === null) return { ok: false, error: `bad_date:${row}` };
    const amountBrl = ofxAmount(tag(block, "TRNAMT"));
    if (amountBrl === null) return { ok: false, error: `bad_amount:${row}` };
    const description = tag(block, "MEMO") ?? tag(block, "NAME") ?? "";
    lines.push({ date, description, amountBrl });
    fitIds.push(tag(block, "FITID"));
  }

  // A FITID seen twice in one file (some banks repeat them) gets its count; no FITID, the hash.
  const hashes = lineHashes(lines);
  const seen = new Map<string, number>();
  const parsed: ParsedLine[] = lines.map((line, i) => {
    const fitId = fitIds[i];
    if (fitId === null) return { ...line, externalId: hashes[i] };
    const n = (seen.get(fitId) ?? 0) + 1;
    seen.set(fitId, n);
    return { ...line, externalId: n === 1 ? `f:${fitId}` : `f:${fitId}:${n}` };
  });

  const ledger = /<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text)?.[1];
  const balanceAmount = ledger ? ofxAmount(tag(ledger, "BALAMT")) : null;
  const balanceDate = ledger ? ofxDate(tag(ledger, "DTASOF")) : null;

  const span = linesPeriod(parsed);
  const from = ofxDate(tag(text, "DTSTART"));
  const to = ofxDate(tag(text, "DTEND"));
  return {
    ok: true,
    statement: {
      lines: parsed,
      bankBalance:
        balanceAmount !== null && balanceDate !== null
          ? { amountBrl: balanceAmount, date: balanceDate }
          : undefined,
      period: {
        from: from !== null && from < span.from ? from : span.from,
        to: to !== null && to > span.to ? to : span.to,
      },
    },
  };
}
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/statements.test.ts --exclude '**/worktrees/**'`
Expected: PASS (12 tests).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/domain/statements`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 5: Commit.**

```bash
git add lib/domain/statements/__tests__/fixtures/banco-ptbr.csv lib/domain/statements/__tests__/fixtures/bb-2x.ofx lib/domain/statements/__tests__/fixtures/sicredi-1x.ofx lib/domain/statements/__tests__/fixtures/split-in-out.csv lib/domain/statements/__tests__/statements.test.ts lib/domain/statements/common.ts lib/domain/statements/csv.ts lib/domain/statements/ofx.ts
git commit -m 'feat(finance): read OFX and CSV extratos'
```


---

### Task 4: Conciliação suggestions (`lib/domain/statements/match.ts`)

**Files:**
- Create: `lib/domain/statements/__tests__/match.test.ts`, `lib/domain/statements/match.ts`

**Interfaces:**
- Consumes: `BankAccount`, `Expense`, `Movement`, `StatementLine`, `Transfer` (Task 1); `daysBetween`; `effectiveDueDate` from `lib/domain/ledger.ts`.
- Produces: `MatchTarget`, `Candidate { target, kind, date, amountBrl, name, pending, expense?, movement?, transfer? }`, `Suggestion { candidate, confidence: "high" | "medium", dayDiff, sameName }`, `MATCH_WINDOW_DAYS` (5), `sameSide`, `candidatesFor`, `suggestMatches`, `candidatesByValue`, `suggestionReason`. Tasks 6, 7 and 10 import `MatchTarget`.

- [ ] **Step 1: The tests.**

Create `lib/domain/statements/__tests__/match.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import {
  candidatesByValue,
  candidatesFor,
  suggestMatches,
  suggestionReason,
  type Candidate,
} from "@/lib/domain/statements/match";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa da fazenda", isMain: false };

const line = (id: string, date: string, description: string, amountBrl: number): StatementLine => ({
  id,
  importId: "imp",
  bankAccountId: "sicredi",
  date,
  description,
  amountBrl,
  status: "pending",
});

const expense = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "nutrition",
  amountBrl: 4850,
  ...patch,
});

function candidates(expenses: Expense[], movements: Movement[] = [], transfers: Transfer[] = [], paired: string[] = []) {
  return candidatesFor("sicredi", { expenses, movements, transfers, bankAccounts: [SICREDI, CAIXA] }, new Set(paired));
}

const best = (map: Map<string, { candidate: Candidate; confidence: string }[]>, id: string) => {
  const top = map.get(id)?.[0];
  return top ? [top.candidate.target.id, top.confidence] : null;
};

describe("candidatesFor", () => {
  it("takes records of this conta or of none, leaves out paired ones and other contas", () => {
    const list = candidates(
      [
        expense("mine", { paidAt: "2026-09-18", bankAccountId: "sicredi" }),
        expense("none", {}),
        expense("other", { paidAt: "2026-09-18", bankAccountId: "caixa" }),
        expense("paired", {}),
      ],
      [{ id: "sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Minerva", amountBrl: 1 }],
      [
        { id: "t-out", fromId: "sicredi", toId: "caixa", date: "2026-09-24", amountBrl: 1000 },
        { id: "t-else", fromId: "caixa", toId: "card", date: "2026-09-24", amountBrl: 1000 },
      ],
      ["paired"]
    );
    expect(list.map((c) => [c.target.id, c.kind, c.name])).toEqual([
      ["mine", "expense", null],
      ["none", "expense", null],
      ["sale", "sale", "Minerva"],
      ["t-out", "transferOut", "Caixa da fazenda"],
    ]);
  });

  it("compares a pending lançamento by vencimento and a paid one by payment day", () => {
    const [pending, paid] = candidates([
      expense("p", { date: "2026-09-01", dueDate: "2026-09-25" }),
      expense("q", { date: "2026-09-01", paidAt: "2026-09-18" }),
    ]);
    expect([pending.date, pending.pending, paid.date, paid.pending]).toEqual(["2026-09-25", true, "2026-09-18", false]);
  });
});

describe("suggestMatches", () => {
  it("matches the exact value on the same side within ±5 days only", () => {
    const list = candidates([
      expense("exact", { dueDate: "2026-09-22", amountBrl: 12640 }),
      expense("centavo", { dueDate: "2026-09-22", amountBrl: 12640.01 }),
      expense("far", { dueDate: "2026-09-28", amountBrl: 12640 }),
      expense("receita", { kind: "revenue", category: "other", dueDate: "2026-09-22", amountBrl: 12640 }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-22", "PAGTO BOLETO NUTRON", -12640)], list);
    expect(map.get("l1")?.map((s) => s.candidate.target.id)).toEqual(["exact"]);
  });

  it("is alta by name within 2 days, whatever else is near", () => {
    const list = candidates([
      expense("sertao", { paidAt: "2026-09-18", counterparty: "Agropecuária Sertão" }),
      expense("outro", { paidAt: "2026-09-19", counterparty: "Casa do Criador" }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-18", "PIX ENVIADO AGROPECUARIA SERTAO", -4850)], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence])).toEqual([
      ["sertao", "high"],
      ["outro", "medium"],
    ]);
  });

  it("is alta when it is the only candidate within 2 days, média beyond 2 days", () => {
    const list = candidates([
      expense("folha", { dueDate: "2026-09-10", amountBrl: 18400 }),
      expense("nutron", { dueDate: "2026-09-25", amountBrl: 12640, counterparty: "Nutron" }),
    ]);
    const map = suggestMatches(
      [line("l1", "2026-09-10", "PAGTO FOLHA SALARIOS", -18400), line("l2", "2026-09-22", "PAGTO BOLETO NUTRON", -12640)],
      list
    );
    expect(best(map, "l1")).toEqual(["folha", "high"]);
    expect(best(map, "l2")).toEqual(["nutron", "medium"]);
    expect(suggestionReason(map.get("l2")![0])).toBe("mesmo valor, pago 3 dias antes do vencimento, mesmo favorecido");
  });

  it("offers one candidate as alta to the first of two identical lines and média to the second", () => {
    const list = candidates([expense("tarifa", { paidAt: "2026-09-10", amountBrl: 12.5 })]);
    const map = suggestMatches(
      [line("b", "2026-09-10", "TARIFA DOC", -12.5), line("a", "2026-09-10", "TARIFA DOC", -12.5)],
      list
    );
    expect(best(map, "a")).toEqual(["tarifa", "high"]);
    expect(best(map, "b")).toEqual(["tarifa", "medium"]);
  });

  it("puts the closest date first, then alta before média", () => {
    const list = candidates([
      expense("two-days", { paidAt: "2026-09-12", counterparty: "Agrovet" }),
      expense("same-day", { paidAt: "2026-09-10" }),
    ]);
    const map = suggestMatches([line("l1", "2026-09-10", "PIX AGROVET", -4850)], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence, s.dayDiff])).toEqual([
      ["same-day", "medium", 0],
      ["two-days", "high", -2],
    ]);
  });

  it("pairs entradas with receitas, vendas and transferências in; skips resolved lines", () => {
    const list = candidates(
      [],
      [{ id: "sale", type: "sale", date: "2026-09-20", origin: "Engorda", destination: "Frigorífico Minerva", amountBrl: 148320 }],
      [{ id: "t-in", fromId: "caixa", toId: "sicredi", date: "2026-09-21", amountBrl: 148320 }]
    );
    const resolved = { ...line("done", "2026-09-20", "X", 148320), status: "matched" as const };
    const map = suggestMatches([line("l1", "2026-09-20", "PIX RECEBIDO FRIGORIFICO MINERVA", 148320), resolved], list);
    expect(map.get("l1")?.map((s) => [s.candidate.target.id, s.confidence])).toEqual([
      ["sale", "high"],
      ["t-in", "medium"],
    ]);
    expect(map.has("done")).toBe(false);
  });
});

describe("candidatesByValue", () => {
  it("finds records of the line's side and the typed value at any date", () => {
    const list = candidates([
      expense("late", { dueDate: "2026-08-01", amountBrl: 980 }),
      expense("revenue", { kind: "revenue", category: "other", dueDate: "2026-09-01", amountBrl: 980 }),
    ]);
    expect(candidatesByValue(line("l", "2026-09-22", "BOLETO", -1000), list, 980).map((c) => c.target.id)).toEqual(["late"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/match.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — cannot resolve `@/lib/domain/statements/match`.

- [ ] **Step 3: The module.**

Create `lib/domain/statements/match.ts`:

```ts
/**
 * Conciliação suggestions: which MeuBov record a linha do extrato confirms.
 * Same side (saída ↔ despesa, compra, transferência out; entrada ↔ receita,
 * venda, transferência in), value equal to the centavo, not yet paired, of
 * this conta or of none, within ±5 days. Pure.
 */
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { effectiveDueDate } from "@/lib/domain/ledger";

export type CandidateKind = "expense" | "revenue" | "sale" | "purchase" | "transferOut" | "transferIn";

/** What POST /statement-lines/:id/match pairs a line with. */
export interface MatchTarget {
  kind: "expense" | "movement" | "transfer";
  id: string;
}

export interface Candidate {
  target: MatchTarget;
  kind: CandidateKind;
  /** Vencimento of a pending lançamento, payment day of a paid one, date of the rest. */
  date: string;
  /** Always positive. */
  amountBrl: number;
  /** Counterparty, or the other conta of a transferência. */
  name: string | null;
  /** A lançamento still waiting for payment. */
  pending: boolean;
  expense?: Expense;
  movement?: Movement;
  transfer?: Transfer;
}

export type Confidence = "high" | "medium";

export interface Suggestion {
  candidate: Candidate;
  confidence: Confidence;
  /** Days from the candidate's date to the line's (line − candidate). */
  dayDiff: number;
  sameName: boolean;
}

/** Days a candidate may sit from the line. */
export const MATCH_WINDOW_DAYS = 5;
/** Days within which a candidate may be "alta". */
const HIGH_WINDOW_DAYS = 2;

const OUTFLOW: ReadonlySet<CandidateKind> = new Set(["expense", "purchase", "transferOut"]);

/** True when the candidate moves money the same way as the line. */
export function sameSide(line: Pick<StatementLine, "amountBrl">, kind: CandidateKind): boolean {
  return line.amountBrl < 0 === OUTFLOW.has(kind);
}

const toCents = (value: number) => Math.round(Math.abs(value) * 100);

/** Lower case, no accents, split into words. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A word of 4+ letters of the name appears in the description. */
function nameInDescription(name: string | null, description: string): boolean {
  if (!name) return false;
  const inLine = new Set(words(description));
  return words(name).some((w) => w.length >= 4 && /[a-z]/.test(w) && inLine.has(w));
}

/**
 * Every record a line of `accountId` may confirm: lançamentos of this conta
 * or of none, vendas/compras likewise, and transferências in or out of it —
 * minus those already paired with a line.
 */
export function candidatesFor(
  accountId: string,
  inputs: { expenses: Expense[]; movements: Movement[]; transfers: Transfer[]; bankAccounts: BankAccount[] },
  pairedIds: ReadonlySet<string>
): Candidate[] {
  const ours = (id: string | undefined) => id === undefined || id === accountId;
  const out: Candidate[] = [];
  for (const e of inputs.expenses) {
    if (pairedIds.has(e.id) || !ours(e.bankAccountId)) continue;
    out.push({
      target: { kind: "expense", id: e.id },
      kind: e.kind === "revenue" ? "revenue" : "expense",
      date: e.paidAt ?? effectiveDueDate(e),
      amountBrl: e.amountBrl,
      name: e.counterparty ?? null,
      pending: e.paidAt === undefined,
      expense: e,
    });
  }
  for (const m of inputs.movements) {
    if (pairedIds.has(m.id) || !ours(m.bankAccountId) || m.amountBrl === undefined || m.type === "transfer") continue;
    const sale = m.type === "sale";
    out.push({
      target: { kind: "movement", id: m.id },
      kind: sale ? "sale" : "purchase",
      date: m.date,
      amountBrl: m.amountBrl,
      name: sale ? m.destination : m.origin,
      pending: false,
      movement: m,
    });
  }
  const nameOf = (id: string) => inputs.bankAccounts.find((a) => a.id === id)?.name ?? null;
  for (const t of inputs.transfers) {
    if (pairedIds.has(t.id)) continue;
    if (t.fromId === accountId || t.toId === accountId) {
      const outgoing = t.fromId === accountId;
      out.push({
        target: { kind: "transfer", id: t.id },
        kind: outgoing ? "transferOut" : "transferIn",
        date: t.date,
        amountBrl: t.amountBrl,
        name: nameOf(outgoing ? t.toId : t.fromId),
        pending: false,
        transfer: t,
      });
    }
  }
  return out;
}

/**
 * Suggestions for each pending line, best first. Alta when the date is within
 * 2 days and a word of the counterparty is in the description, or when it is
 * the only candidate within 2 days; média otherwise. A candidate already alta
 * for an earlier line (by date) is only média for the next ones.
 */
export function suggestMatches(lines: StatementLine[], candidates: Candidate[]): Map<string, Suggestion[]> {
  const result = new Map<string, Suggestion[]>();
  const highGiven = new Set<string>();
  const pending = lines
    .filter((l) => l.status === "pending")
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const line of pending) {
    const pool = candidates
      .filter((c) => sameSide(line, c.kind) && toCents(c.amountBrl) === toCents(line.amountBrl))
      .map((c) => ({ c, dayDiff: daysBetween(c.date, line.date) }))
      .filter(({ dayDiff }) => Math.abs(dayDiff) <= MATCH_WINDOW_DAYS);
    const near = pool.filter(({ dayDiff }) => Math.abs(dayDiff) <= HIGH_WINDOW_DAYS).length;
    const suggestions = pool
      .map(({ c, dayDiff }): Suggestion => {
        const sameName = nameInDescription(c.name, line.description);
        const high =
          Math.abs(dayDiff) <= HIGH_WINDOW_DAYS && (sameName || near === 1) && !highGiven.has(c.target.id);
        return { candidate: c, confidence: high ? "high" : "medium", dayDiff, sameName };
      })
      .sort(
        (a, b) =>
          Math.abs(a.dayDiff) - Math.abs(b.dayDiff) ||
          (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1)
      );
    for (const s of suggestions) if (s.confidence === "high") highGiven.add(s.candidate.target.id);
    if (suggestions.length > 0) result.set(line.id, suggestions);
  }
  return result;
}

/**
 * "Outro lançamento" search: records of the line's side worth `amountBrl`,
 * any date, closest to the line first.
 */
export function candidatesByValue(line: StatementLine, candidates: Candidate[], amountBrl: number): Candidate[] {
  return candidates
    .filter((c) => sameSide(line, c.kind) && toCents(c.amountBrl) === toCents(amountBrl))
    .sort((a, b) => Math.abs(daysBetween(a.date, line.date)) - Math.abs(daysBetween(b.date, line.date)));
}

/** "mesmo valor, mesma data, mesmo favorecido" · "mesmo valor, 3 dias antes do vencimento". */
export function suggestionReason(s: Suggestion): string {
  const days = Math.abs(s.dayDiff);
  const when =
    days === 0
      ? "mesma data"
      : `${s.candidate.pending ? "pago " : ""}${days} ${days === 1 ? "dia" : "dias"} ${s.dayDiff < 0 ? "antes" : "depois"} ${s.candidate.pending ? "do vencimento" : "da data"}`;
  return ["mesmo valor", when, s.sameName ? "mesmo favorecido" : null].filter(Boolean).join(", ");
}
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm exec vitest run lib/domain/statements/__tests__/match.test.ts --exclude '**/worktrees/**'`
Expected: PASS (9 tests).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/domain/statements`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 5: Commit.**

```bash
git add lib/domain/statements/__tests__/match.test.ts lib/domain/statements/match.ts
git commit -m 'feat(finance): suggest which lançamento a linha do extrato confirms'
```


---

### Task 5: API — contas, transferências, "Pago por" and the conta of a venda

**Files:**
- Create: `lib/api/domains/bankAccounts/__tests__/bankAccounts.routes.test.ts`, `lib/api/domains/bankAccounts/bankAccounts.controller.ts`, `lib/api/domains/bankAccounts/payingAccount.ts`, `lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts`, `lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts`, `lib/api/domains/bankAccounts/useCases/AddTransfer.useCase.ts`, `lib/api/domains/bankAccounts/useCases/ArchiveBankAccount.useCase.ts`, `lib/api/domains/bankAccounts/useCases/DeleteBankAccount.useCase.ts`, `lib/api/domains/bankAccounts/useCases/DeleteTransfer.useCase.ts`, `lib/api/domains/bankAccounts/useCases/SetMovementBankAccount.useCase.ts`, `lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts`, `lib/api/domains/bankAccounts/useCases/UpdateTransfer.useCase.ts`, `lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`, `lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts`
- Modify: `lib/api/__tests__/routeRequirements.test.ts`, `lib/api/app.ts`, `lib/api/domains/expenses/expenses.controller.ts`, `lib/api/domains/expenses/schemas/expense.schema.ts`, `lib/api/domains/expenses/useCases/Add.useCase.ts`, `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, `lib/api/domains/expenses/useCases/Update.useCase.ts`, `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`, `lib/api/domains/manejo/useCases/Delete.useCase.ts`, `lib/api/domains/manejo/useCases/Start.useCase.ts`, `lib/api/domains/semen/useCases/AddPurchase.useCase.ts`, `lib/api/permissions/routeRequirements.ts`
- Modify (generated by `-u`): `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap`, `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap`

**Interfaces:**
- Consumes: Task 1's tables and mappers.
- Produces: `bankAccountsController` (mounted in `lib/api/app.ts`), the routes listed in "Shared interfaces" (contas, transferências, `PATCH /movements/:id/bank-account`), `isPayingAccount(repo, farmId, bankAccountId, kind)` in `lib/api/domains/bankAccounts/payingAccount.ts`, `bothOnFarm` in `AddTransfer.useCase.ts`. `AddExpenseUseCase` and `UpdateExpenseUseCase` take `bankAccountId` and may answer `"invalid_bank_account"` (Task 6's `ResolveLine` runs `AddExpenseUseCase` on its transaction). A venda or entrada manejo starts on the conta principal (a sub-select in the insert); removing a sale/entry manejo nulls `statement_lines.movement_id`.

- [ ] **Step 1: Tests first: the use cases, the routes behind the farm macro, the route table.**

In `lib/api/__tests__/routeRequirements.test.ts`, replace:

```ts
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
```

with:

```ts
    }
  });

  it("keeps contas bancárias, transferências and the conta of a venda behind Financeiro edit", () => {
    for (const key of [
      "POST /api/herd/bank-accounts",
      "PATCH /api/herd/bank-accounts/:id",
      "DELETE /api/herd/bank-accounts/:id",
      "POST /api/herd/bank-accounts/:id/archive",
      "POST /api/herd/transfers",
      "PATCH /api/herd/transfers/:id",
      "DELETE /api/herd/transfers/:id",
      "PATCH /api/herd/movements/:id/bank-account",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
```

Create `lib/api/domains/bankAccounts/__tests__/bankAccounts.routes.test.ts`:

```ts
/**
 * The contas bancárias routes behind the farm macro, auth and db mocked: a
 * member who only sees Financeiro writes nothing, and another farm's conta is
 * a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, archive } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  archive: vi.fn(),
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
vi.mock("@/lib/api/domains/bankAccounts/useCases/ArchiveBankAccount.useCase", () => ({
  ArchiveBankAccountUseCase: class {
    run = archive;
  },
}));

import { herdApi } from "@/lib/api/app";

const archiveRequest = () =>
  herdApi.handle(
    new Request("http://localhost/api/herd/bank-accounts/b-9/archive", {
      method: "POST",
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  archive.mockReset();
});

describe("contas bancárias routes", () => {
  it("refuse a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
    const response = await archiveRequest();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(archive).not.toHaveBeenCalled();
  });

  it("answer 404 for a conta of another farm", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    archive.mockResolvedValue(null);
    const response = await archiveRequest();
    expect(response.status).toBe(404);
    expect(archive).toHaveBeenCalledWith({ farmId: 7, id: "b-9", archived: true });
  });
});
```

Create `lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts`:

```ts
/**
 * Contas bancárias and transferências against the shared chainable db stub:
 * selects answer from a queue, writes are recorded.
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

import { AddBankAccountUseCase } from "../AddBankAccount.useCase";
import { UpdateBankAccountUseCase } from "../UpdateBankAccount.useCase";
import { ArchiveBankAccountUseCase } from "../ArchiveBankAccount.useCase";
import { DeleteBankAccountUseCase } from "../DeleteBankAccount.useCase";
import { AddTransferUseCase } from "../AddTransfer.useCase";
import { UpdateTransferUseCase } from "../UpdateTransfer.useCase";
import { SetMovementBankAccountUseCase } from "../SetMovementBankAccount.useCase";

const ROW = {
  id: "sicredi",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  label: null,
  openingBalanceBrl: 1000,
  openingDate: "2026-08-31",
  isMain: true,
  closingDay: null,
  dueDay: null,
  paysFromId: null,
  csvMapping: null,
  archivedAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
});

describe("AddBankAccountUseCase", () => {
  it("makes the farm's first conta the conta principal", async () => {
    state.selectResults = [[]]; // no conta principal yet
    state.returning = [[{ ...ROW }]];
    await new AddBankAccountUseCase().run({ farmId: 7, kind: "checking", name: " Sicredi ", openingDate: "2026-08-31", openingBalanceBrl: 1000 });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, name: "Sicredi", isMain: true, closingDay: null });
    expect(state.updates).toEqual([]);
  });

  it("takes the place of the current conta principal when marked", async () => {
    state.selectResults = [[{ id: "caixa" }]];
    state.returning = [[{ ...ROW }]];
    await new AddBankAccountUseCase().run({ farmId: 7, kind: "checking", name: "Sicredi", openingDate: "2026-08-31", isMain: true });
    expect(state.updates).toEqual([{ isMain: false }]);
    expect(state.inserts[0]).toMatchObject({ isMain: true });
  });

  it("keeps a cartão out of the saldo and never principal", async () => {
    state.selectResults = [[{ id: "sicredi" }], []];
    state.returning = [[{ ...ROW, kind: "card", isMain: false }]];
    await new AddBankAccountUseCase().run({
      farmId: 7,
      kind: "card",
      name: "Cartão",
      openingDate: "2026-08-31",
      openingBalanceBrl: 500,
      closingDay: 31,
      dueDay: 10,
      paysFromId: "sicredi",
    });
    expect(state.inserts[0]).toMatchObject({ isMain: false, openingBalanceBrl: 0, closingDay: 31, dueDay: 10, paysFromId: "sicredi" });
  });

  it("refuses a cartão without its days, marked principal, or paid by a conta not of the farm", async () => {
    const card = { farmId: 7, kind: "card" as const, name: "Cartão", openingDate: "2026-08-31" };
    expect(await new AddBankAccountUseCase().run({ ...card, dueDay: 10 })).toBe("card_days");
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, isMain: true })).toBe("card_cannot_be_main");
    state.selectResults = [[]];
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, paysFromId: "other-farm" })).toBe("invalid_pays_from");
    expect(state.inserts).toEqual([]);
  });
});

describe("UpdateBankAccountUseCase", () => {
  it("is null for another farm's conta", async () => {
    state.selectResults = [[]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 8, id: "sicredi", patch: { name: "X" } })).toBeNull();
  });

  it("keeps the conta principal until another one is marked", async () => {
    state.selectResults = [[ROW]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 7, id: "sicredi", patch: { isMain: false } })).toBe("main_required");
  });

  it("moves the conta principal in one transaction", async () => {
    state.selectResults = [[{ ...ROW, id: "caixa", kind: "cash", isMain: false }]];
    state.returning = [[{ ...ROW, id: "caixa", kind: "cash", isMain: true }]];
    const result = await new UpdateBankAccountUseCase().run({ farmId: 7, id: "caixa", patch: { isMain: true, label: " " } });
    expect(state.updates).toEqual([{ isMain: false }, { isMain: true, label: null }]);
    expect(result).toMatchObject({ id: "caixa", isMain: true });
  });
});

describe("ArchiveBankAccountUseCase", () => {
  it("refuses the conta principal and archives any other", async () => {
    state.selectResults = [[ROW]];
    expect(await new ArchiveBankAccountUseCase().run({ farmId: 7, id: "sicredi", archived: true })).toBe("is_main");
    state.selectResults = [[{ ...ROW, isMain: false }]];
    state.returning = [[{ ...ROW, isMain: false, archivedAt: new Date("2026-09-29T12:00:00Z") }]];
    const archived = await new ArchiveBankAccountUseCase().run({ farmId: 7, id: "sicredi", archived: true });
    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(archived).toMatchObject({ archivedAt: "2026-09-29T12:00:00.000Z" });
  });
});

describe("DeleteBankAccountUseCase", () => {
  it("is not_found off the farm, in_use with rows, and deletes an unused conta", async () => {
    state.selectResults = [[]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 8, id: "sicredi" })).toBe("not_found");
    state.selectResults = [[{ ...ROW, isMain: false }], [{ used: true }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("in_use");
    state.selectResults = [[ROW], [{ used: false }], [{ total: 2 }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("is_main");
    expect(state.deletes).toBe(0);
    state.selectResults = [[{ ...ROW, isMain: false }], [{ used: false }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("deleted");
    expect(state.deletes).toBe(1);
  });
});

describe("transferências", () => {
  const input = { farmId: 7, userId: "u-1", fromId: "sicredi", toId: "caixa", date: "2026-09-15", amountBrl: 2000 };

  it("records who moved the money", async () => {
    state.selectResults = [[{ id: "sicredi" }, { id: "caixa" }]];
    state.returning = [[{ id: "t-1", ...input, notes: null }]];
    const transfer = await new AddTransferUseCase().run({ ...input, notes: " Diárias " });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, createdBy: "u-1", notes: "Diárias" });
    expect(transfer).toMatchObject({ id: "t-1", fromId: "sicredi", toId: "caixa", amountBrl: 2000 });
  });

  it("refuses one conta on both ends and a conta of another farm", async () => {
    expect(await new AddTransferUseCase().run({ ...input, toId: "sicredi" })).toBe("same_account");
    state.selectResults = [[{ id: "sicredi" }]];
    expect(await new AddTransferUseCase().run({ ...input, toId: "other-farm" })).toBe("account_not_found");
    state.selectResults = [[]];
    expect(await new UpdateTransferUseCase().run({ farmId: 8, id: "t-1", patch: { amountBrl: 1 } })).toBeNull();
    expect(state.inserts).toEqual([]);
  });
});

describe("SetMovementBankAccountUseCase", () => {
  it("sets the conta of a venda session, else of a legacy row, else answers null", async () => {
    state.selectResults = [[{ kind: "checking", archivedAt: null }]];
    state.returning = [[{ id: "m-1" }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "sicredi" })).toEqual({
      id: "m-1",
      bankAccountId: "sicredi",
    });
    state.returning = [[], [{ id: "legacy" }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "legacy", bankAccountId: null })).toEqual({
      id: "legacy",
      bankAccountId: null,
    });
    state.returning = [[], []];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 8, id: "m-1", bankAccountId: null })).toBeNull();
  });

  it("refuses a cartão: a venda never goes through the card", async () => {
    state.selectResults = [[{ kind: "card", archivedAt: null }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "card" })).toBe(
      "invalid_bank_account"
    );
  });
});
```

Create `lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts`:

```ts
/**
 * "Pago por" on a lançamento: kept only while it is paid, checked against the
 * farm's contas, cleared when it is unpaid.
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

import { AddExpenseUseCase } from "../Add.useCase";
import { UpdateExpenseUseCase } from "../Update.useCase";

const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 4850,
  notes: null,
  dueDate: null,
  paidAt: "2026-09-18",
  counterparty: null,
  document: null,
  accountId: null,
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: "sicredi",
};

const entry = { farmId: 7, date: "2026-09-18", category: "nutrition" as const, amountBrl: 4850 };

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.returning = [];
});

describe("AddExpenseUseCase with Pago por", () => {
  it("keeps the conta of a paid lançamento", async () => {
    state.selectResults = [[{ kind: "checking", archivedAt: null }]];
    state.returning = [[ROW]];
    const created = await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(state.inserts[0]).toMatchObject({ paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(created).toMatchObject({ bankAccountId: "sicredi" });
  });

  it("drops the conta of a pending lançamento without asking", async () => {
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
    await new AddExpenseUseCase().run({ ...entry, bankAccountId: "sicredi" });
    expect(state.inserts[0]).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("refuses a conta of another farm and a cartão for a receita", async () => {
    state.selectResults = [[]];
    expect(await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "other" })).toBe(
      "invalid_bank_account"
    );
    state.selectResults = [[{ kind: "card", archivedAt: null }]];
    expect(
      await new AddExpenseUseCase().run({ ...entry, kind: "revenue", paidAt: "2026-09-18", bankAccountId: "card" })
    ).toBe("invalid_bank_account");
    expect(state.inserts).toEqual([]);
  });
});

describe("UpdateExpenseUseCase with Pago por", () => {
  it("clears the conta when the lançamento is unpaid", async () => {
    state.selectResults = [[ROW]];
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { paidAt: null } });
    expect(state.updates).toEqual([{ paidAt: null, bankAccountId: null }]);
  });

  it("marks paid with the conta chosen", async () => {
    state.selectResults = [[{ ...ROW, paidAt: null, bankAccountId: null }], [{ kind: "cash", archivedAt: null }]];
    state.returning = [[ROW]];
    await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { paidAt: "2026-09-29", bankAccountId: "caixa" } });
    expect(state.updates).toEqual([{ paidAt: "2026-09-29", bankAccountId: "caixa" }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/api/domains/bankAccounts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/__tests__/routeRequirements.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the bank-account use cases do not exist; `PaidBy.test.ts` fails on `bankAccountId`; the requirement test finds no entry for `POST /api/herd/bank-accounts`.

- [ ] **Step 3: The domain, the expenses' conta, the manejo hooks, the wiring.**

In `lib/api/app.ts`, replace:

```ts
import { categoriesController } from "@/lib/api/domains/categories/categories.controller";
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { attachmentsController } from "@/lib/api/domains/attachments/attachments.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
import { farmController } from "@/lib/api/domains/farm/farm.controller";
import { herdController } from "@/lib/api/domains/herd/herd.controller";
```

with:

```ts
import { categoriesController } from "@/lib/api/domains/categories/categories.controller";
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { attachmentsController } from "@/lib/api/domains/attachments/attachments.controller";
import { bankAccountsController } from "@/lib/api/domains/bankAccounts/bankAccounts.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
import { farmController } from "@/lib/api/domains/farm/farm.controller";
import { herdController } from "@/lib/api/domains/herd/herd.controller";
```

In `lib/api/app.ts`, replace:

```ts
  .use(attachmentsController)
  .use(accountsController)

  /* ---- Manejo sessions --------------------------------------------------- */
  .use(manejoController);

```

with:

```ts
  .use(attachmentsController)
  .use(accountsController)

  /* ---- Contas bancárias, transferências ---------------------------------- */
  .use(bankAccountsController)

  /* ---- Manejo sessions --------------------------------------------------- */
  .use(manejoController);

```

Create `lib/api/domains/bankAccounts/bankAccounts.controller.ts`:

```ts
/**
 * Contas bancárias — contas correntes, caixa and cartões with their saldo
 * inicial — the transferências between them, and the conta of a venda or
 * compra. Reading them is the herd load; every route here writes.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddBankAccountUseCase } from "./useCases/AddBankAccount.useCase";
import { AddTransferUseCase } from "./useCases/AddTransfer.useCase";
import { ArchiveBankAccountUseCase } from "./useCases/ArchiveBankAccount.useCase";
import { DeleteBankAccountUseCase } from "./useCases/DeleteBankAccount.useCase";
import { DeleteTransferUseCase } from "./useCases/DeleteTransfer.useCase";
import { SetMovementBankAccountUseCase } from "./useCases/SetMovementBankAccount.useCase";
import { UpdateBankAccountUseCase } from "./useCases/UpdateBankAccount.useCase";
import { UpdateTransferUseCase } from "./useCases/UpdateTransfer.useCase";
import {
  ArchiveBankAccountBody,
  MovementBankAccountBody,
  NewBankAccountBody,
  NewTransferBody,
  UpdateBankAccountBody,
  UpdateTransferBody,
} from "./schemas/bankAccount.schema";

export const bankAccountsController = new Elysia()
  .use(farmPlugin)
  .post(
    "/bank-accounts",
    async ({ farmId, body, status }) => {
      const result = await new AddBankAccountUseCase().run({ farmId, ...body });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewBankAccountBody }
  )
  .patch(
    "/bank-accounts/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateBankAccountUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "main_required") return status(409, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateBankAccountBody }
  )
  .post(
    "/bank-accounts/:id/archive",
    async ({ farmId, params, body, status }) => {
      const result = await new ArchiveBankAccountUseCase().run({ farmId, id: params.id, archived: body.archived });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "is_main") return status(409, { error: result });
      return result;
    },
    { farm: true, body: ArchiveBankAccountBody }
  )
  .delete(
    "/bank-accounts/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteBankAccountUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result !== "deleted") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  )
  .post(
    "/transfers",
    async ({ farmId, user, body, status }) => {
      const result = await new AddTransferUseCase().run({ farmId, userId: user.id, ...body });
      if (result === "account_not_found") return status(404, { error: result });
      if (result === "same_account") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewTransferBody }
  )
  .patch(
    "/transfers/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateTransferUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "account_not_found") return status(404, { error: result });
      if (result === "same_account") return status(400, { error: result });
      return result;
    },
    { farm: true, body: UpdateTransferBody }
  )
  .delete(
    "/transfers/:id",
    async ({ farmId, params, status }) => {
      const removed = await new DeleteTransferUseCase().run({ farmId, id: params.id });
      if (!removed) return status(404, { error: "not_found" });
      return { id: params.id };
    },
    { farm: true }
  )
  .patch(
    "/movements/:id/bank-account",
    async ({ farmId, params, body, status }) => {
      const result = await new SetMovementBankAccountUseCase().run({
        farmId,
        id: params.id,
        bankAccountId: body.bankAccountId,
      });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "invalid_bank_account") return status(400, { error: result });
      return result;
    },
    { farm: true, body: MovementBankAccountBody }
  );
```

Create `lib/api/domains/bankAccounts/payingAccount.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { bankAccounts } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind } from "@/lib/types";

/**
 * Whether a lançamento of `kind` may be paid from (or received into) the conta:
 * one of this farm, not archived, and a cartão only for a despesa. A venda or
 * compra passes "revenue", which keeps cartões out.
 */
export async function isPayingAccount(
  repo: RepositoryType,
  farmId: number,
  bankAccountId: string,
  kind: EntryKind
): Promise<boolean> {
  const [account] = await repo
    .select({ kind: bankAccounts.kind, archivedAt: bankAccounts.archivedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
    .limit(1);
  return account !== undefined && account.archivedAt === null && (kind === "expense" || account.kind !== "card");
}
```

Create `lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts`:

```ts
/** Request schemas of the contas bancárias and the transferências between them. */

import { t } from "elysia";

import { DateString, NonBlankString } from "@/lib/api/schemas/shared.schema";

const Day = t.Integer({ minimum: 1, maximum: 31 });
const Name = t.String({ minLength: 1, maxLength: 60, pattern: "\\S" });
const Label = t.String({ maxLength: 60 });

export const BankAccountKindModel = t.Union([t.Literal("checking"), t.Literal("cash"), t.Literal("card")]);

/** Body of POST /bank-accounts. A cartão takes closingDay and dueDay, and may name the conta that pays it. */
export const NewBankAccountBody = t.Object({
  kind: BankAccountKindModel,
  name: Name,
  label: t.Optional(Label),
  openingBalanceBrl: t.Optional(t.Number()),
  openingDate: DateString,
  isMain: t.Optional(t.Boolean()),
  closingDay: t.Optional(Day),
  dueDay: t.Optional(Day),
  paysFromId: t.Optional(t.String()),
});

/** Body of PATCH /bank-accounts/:id; the kind never changes, null clears. */
export const UpdateBankAccountBody = t.Object({
  name: t.Optional(Name),
  label: t.Optional(t.Nullable(Label)),
  openingBalanceBrl: t.Optional(t.Number()),
  openingDate: t.Optional(DateString),
  isMain: t.Optional(t.Boolean()),
  closingDay: t.Optional(Day),
  dueDay: t.Optional(Day),
  paysFromId: t.Optional(t.Nullable(t.String())),
});

export const ArchiveBankAccountBody = t.Object({ archived: t.Boolean() });

export const NewTransferBody = t.Object({
  fromId: NonBlankString,
  toId: NonBlankString,
  date: DateString,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
  notes: t.Optional(t.String({ maxLength: 200 })),
});

export const UpdateTransferBody = t.Object({
  fromId: t.Optional(NonBlankString),
  toId: t.Optional(NonBlankString),
  date: t.Optional(DateString),
  amountBrl: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
});

/** Body of PATCH /movements/:id/bank-account: the conta of a venda or compra, null for none. */
export const MovementBankAccountBody = t.Object({ bankAccountId: t.Nullable(t.String()) });
```

Create `lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount, BankAccountKind } from "@/lib/types";

interface AddBankAccountUseCaseProps {
  farmId: number;
  kind: BankAccountKind;
  name: string;
  label?: string;
  openingBalanceBrl?: number;
  openingDate: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string;
}

/**
 * `card_days` when a cartão lacks its fechamento or vencimento day;
 * `invalid_pays_from` when "Paga pela conta" is not a conta corrente of the
 * farm; `card_cannot_be_main` for a cartão marked principal.
 */
type AddBankAccountUseCaseResponse = BankAccount | "card_days" | "invalid_pays_from" | "card_cannot_be_main";

type CurrUseCase = _UseCase<AddBankAccountUseCaseProps, AddBankAccountUseCaseResponse>;

/**
 * Creates a conta. The farm's first conta corrente or caixa becomes the conta
 * principal; one marked principal takes the place of the current one.
 */
export class AddBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, kind, ...input }) => {
    const card = kind === "card";
    if (card && (input.closingDay === undefined || input.dueDay === undefined)) return "card_days";
    if (card && input.isMain) return "card_cannot_be_main";

    return this.repository.transaction(async (tx) => {
      if (card && input.paysFromId !== undefined) {
        const [payer] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.farmId, farmId),
              eq(bankAccounts.id, input.paysFromId),
              eq(bankAccounts.kind, "checking")
            )
          )
          .limit(1);
        if (!payer) return "invalid_pays_from";
      }
      const [main] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.isMain, true)))
        .limit(1)
        .for("update");
      const isMain = !card && (input.isMain === true || !main);
      if (isMain && main) {
        await tx.update(bankAccounts).set({ isMain: false }).where(eq(bankAccounts.id, main.id));
      }
      const [row] = await tx
        .insert(bankAccounts)
        .values({
          id: randomUUID(),
          farmId,
          kind,
          name: input.name.trim(),
          label: input.label?.trim() || null,
          openingBalanceBrl: card ? 0 : (input.openingBalanceBrl ?? 0),
          openingDate: input.openingDate,
          isMain,
          closingDay: card ? input.closingDay : null,
          dueDay: card ? input.dueDay : null,
          paysFromId: card ? (input.paysFromId ?? null) : null,
        })
        .returning();
      return toBankAccount(row);
    });
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/AddTransfer.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, transfers } from "@/lib/db/schema";
import { toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Transfer } from "@/lib/types";

interface AddTransferUseCaseProps {
  farmId: number;
  userId: string;
  fromId: string;
  toId: string;
  date: string;
  amountBrl: number;
  notes?: string;
}

/** `same_account` when De and Para are one conta; `account_not_found` when either is not the farm's. */
type AddTransferUseCaseResponse = Transfer | "same_account" | "account_not_found";

type CurrUseCase = _UseCase<AddTransferUseCaseProps, AddTransferUseCaseResponse>;

/** True when both contas belong to the farm. */
export async function bothOnFarm(repo: RepositoryType, farmId: number, ids: [string, string]): Promise<boolean> {
  const rows = await repo
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.farmId, farmId), inArray(bankAccounts.id, ids)));
  return rows.length === 2;
}

/** "Transferir": money moving between two contas; the saldo em contas does not change. */
export class AddTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, fromId, toId, date, amountBrl, notes }) => {
    if (fromId === toId) return "same_account";
    if (!(await bothOnFarm(this.repository, farmId, [fromId, toId]))) return "account_not_found";
    const [row] = await this.repository
      .insert(transfers)
      .values({
        id: randomUUID(),
        farmId,
        fromId,
        toId,
        date,
        amountBrl,
        notes: notes?.trim() || null,
        createdBy: userId,
      })
      .returning();
    return toTransfer(row);
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/ArchiveBankAccount.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount } from "@/lib/types";

interface ArchiveBankAccountUseCaseProps {
  farmId: number;
  id: string;
  /** True archives, false restores. */
  archived: boolean;
}

/** Null when the conta is not on this farm; `is_main` for the conta principal. */
type ArchiveBankAccountUseCaseResponse = BankAccount | "is_main" | null;

type CurrUseCase = _UseCase<ArchiveBankAccountUseCaseProps, ArchiveBankAccountUseCaseResponse>;

/**
 * Archives a conta: it leaves "Pago por" and the page, and its rows keep
 * pointing at it. The conta principal stays until another one is principal.
 */
export class ArchiveBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ArchiveBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, archived }) => {
    const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
    const [current] = await this.repository.select().from(bankAccounts).where(scope).limit(1);
    if (!current) return null;
    if (archived && current.isMain) return "is_main";
    const [row] = await this.repository
      .update(bankAccounts)
      .set({ archivedAt: archived ? new Date() : null })
      .where(scope)
      .returning();
    return row ? toBankAccount(row) : null;
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/DeleteBankAccount.useCase.ts`:

```ts
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  bankAccounts,
  expenses,
  manejoSessions,
  movements,
  statementImports,
  transfers,
} from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBankAccountUseCaseProps {
  farmId: number;
  id: string;
}

/**
 * `not_found` off this farm; `in_use` when a lançamento, venda, compra,
 * transferência or extrato points at it (archive it instead); `is_main` for the
 * conta principal while the farm has other contas.
 */
type DeleteBankAccountUseCaseResponse = "deleted" | "not_found" | "in_use" | "is_main";

type CurrUseCase = _UseCase<DeleteBankAccountUseCaseProps, DeleteBankAccountUseCaseResponse>;

/** Deletes a conta nothing points at — one created by mistake. */
export class DeleteBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
    const [current] = await this.repository.select().from(bankAccounts).where(scope).limit(1);
    if (!current) return "not_found";
    const [usage] = await this.repository
      .select({
        used: sql<boolean>`exists (select 1 from ${expenses} where ${expenses.bankAccountId} = ${id})
          or exists (select 1 from ${movements} where ${movements.bankAccountId} = ${id})
          or exists (select 1 from ${manejoSessions} where ${manejoSessions.bankAccountId} = ${id})
          or exists (select 1 from ${transfers} where ${transfers.fromId} = ${id} or ${transfers.toId} = ${id})
          or exists (select 1 from ${statementImports} where ${statementImports.bankAccountId} = ${id})`,
      })
      .from(bankAccounts)
      .where(scope);
    if (usage?.used) return "in_use";
    if (current.isMain) {
      const [others] = await this.repository
        .select({ total: count() })
        .from(bankAccounts)
        .where(eq(bankAccounts.farmId, farmId));
      if ((others?.total ?? 0) > 1) return "is_main";
    }
    await this.repository.delete(bankAccounts).where(scope);
    return "deleted";
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/DeleteTransfer.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { transfers } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteTransferUseCaseProps {
  farmId: number;
  id: string;
}

type CurrUseCase = _UseCase<DeleteTransferUseCaseProps, boolean>;

/**
 * Removes a transferência; false when it is not on this farm. A linha do
 * extrato that pointed at it goes back to pending (FK set null + trigger).
 */
export class DeleteTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const removed = await this.repository
      .delete(transfers)
      .where(and(eq(transfers.farmId, farmId), eq(transfers.id, id)))
      .returning({ id: transfers.id });
    return removed.length > 0;
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/SetMovementBankAccount.useCase.ts`:

```ts
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessions, movements } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { isPayingAccount } from "../payingAccount";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface SetMovementBankAccountUseCaseProps {
  farmId: number;
  /** A venda/compra manejo session id, or a legacy movement row id. */
  id: string;
  bankAccountId: string | null;
}

type SetMovementBankAccountUseCaseResponse =
  | { id: string; bankAccountId: string | null }
  | "invalid_bank_account"
  | null;

type CurrUseCase = _UseCase<SetMovementBankAccountUseCaseProps, SetMovementBankAccountUseCaseResponse>;

/**
 * The Extrato's "Conta" on a venda or compra. A derived one is its manejo
 * session (the ledger row carries the session id); a legacy one is its
 * movements row. Null when neither is on this farm.
 */
export class SetMovementBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetMovementBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, bankAccountId }) => {
    if (bankAccountId !== null && !(await isPayingAccount(this.repository, farmId, bankAccountId, "revenue"))) {
      return "invalid_bank_account";
    }
    const sessions = await this.repository
      .update(manejoSessions)
      .set({ bankAccountId })
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessions.id, id),
          inArray(manejoSessions.kind, ["sale", "entry"]),
          isNull(manejoSessions.deletedAt)
        )
      )
      .returning({ id: manejoSessions.id });
    if (sessions.length === 0) {
      const legacy = await this.repository
        .update(movements)
        .set({ bankAccountId })
        .where(
          and(eq(movements.farmId, farmId), eq(movements.id, id), inArray(movements.type, ["sale", "purchase"]))
        )
        .returning({ id: movements.id });
      if (legacy.length === 0) return null;
    }
    return { id, bankAccountId };
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts`:

```ts
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts } from "@/lib/db/schema";
import { toBankAccount } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { BankAccount } from "@/lib/types";

/** Absent leaves a field as it is; null clears it. */
export interface BankAccountPatchInput {
  name?: string;
  label?: string | null;
  openingBalanceBrl?: number;
  openingDate?: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string | null;
}

interface UpdateBankAccountUseCaseProps {
  farmId: number;
  id: string;
  patch: BankAccountPatchInput;
}

/**
 * Null when the conta is not on this farm; `main_required` when the conta
 * principal is unmarked (mark another one instead).
 */
type UpdateBankAccountUseCaseResponse =
  | BankAccount
  | "invalid_pays_from"
  | "card_cannot_be_main"
  | "main_required"
  | null;

type CurrUseCase = _UseCase<UpdateBankAccountUseCaseProps, UpdateBankAccountUseCaseResponse>;

/**
 * Edits a conta ("Editar conta"). The kind never changes. Marking it principal
 * unmarks the current one in the same transaction. A cartão keeps a zero saldo
 * inicial; the card fields are ignored on any other conta.
 */
export class UpdateBankAccountUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateBankAccountUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    return this.repository.transaction(async (tx) => {
      const scope = and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, id));
      const [current] = await tx.select().from(bankAccounts).where(scope).limit(1).for("update");
      if (!current) return null;
      const card = current.kind === "card";
      if (card && patch.isMain) return "card_cannot_be_main";
      if (current.isMain && patch.isMain === false) return "main_required";
      if (card && patch.paysFromId) {
        const [payer] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.farmId, farmId),
              eq(bankAccounts.id, patch.paysFromId),
              eq(bankAccounts.kind, "checking")
            )
          )
          .limit(1);
        if (!payer) return "invalid_pays_from";
      }
      if (patch.isMain && !current.isMain) {
        await tx
          .update(bankAccounts)
          .set({ isMain: false })
          .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.isMain, true), ne(bankAccounts.id, id)));
      }
      const declared = {
        name: patch.name?.trim(),
        label: patch.label === undefined ? undefined : patch.label?.trim() || null,
        openingBalanceBrl: card ? undefined : patch.openingBalanceBrl,
        openingDate: patch.openingDate,
        isMain: patch.isMain,
        closingDay: card ? patch.closingDay : undefined,
        dueDay: card ? patch.dueDay : undefined,
        paysFromId: card ? patch.paysFromId : undefined,
      };
      const set = Object.fromEntries(Object.entries(declared).filter(([, value]) => value !== undefined));
      if (Object.keys(set).length === 0) return toBankAccount(current);
      const [row] = await tx.update(bankAccounts).set(set).where(scope).returning();
      return row ? toBankAccount(row) : null;
    });
  };
}
```

Create `lib/api/domains/bankAccounts/useCases/UpdateTransfer.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { transfers } from "@/lib/db/schema";
import { toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { bothOnFarm } from "./AddTransfer.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Transfer } from "@/lib/types";

export interface TransferPatchInput {
  fromId?: string;
  toId?: string;
  date?: string;
  amountBrl?: number;
  notes?: string | null;
}

interface UpdateTransferUseCaseProps {
  farmId: number;
  id: string;
  patch: TransferPatchInput;
}

type UpdateTransferUseCaseResponse = Transfer | "same_account" | "account_not_found" | null;

type CurrUseCase = _UseCase<UpdateTransferUseCaseProps, UpdateTransferUseCaseResponse>;

/** Edits a transferência; null when it is not on this farm. */
export class UpdateTransferUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateTransferUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(transfers.farmId, farmId), eq(transfers.id, id));
    const [current] = await this.repository.select().from(transfers).where(scope).limit(1);
    if (!current) return null;
    const fromId = patch.fromId ?? current.fromId;
    const toId = patch.toId ?? current.toId;
    if (fromId === toId) return "same_account";
    if ((patch.fromId !== undefined || patch.toId !== undefined) && !(await bothOnFarm(this.repository, farmId, [fromId, toId]))) {
      return "account_not_found";
    }
    const [row] = await this.repository
      .update(transfers)
      .set({
        fromId,
        toId,
        date: patch.date ?? current.date,
        amountBrl: patch.amountBrl ?? current.amountBrl,
        notes: patch.notes === undefined ? current.notes : patch.notes?.trim() || null,
      })
      .where(scope)
      .returning();
    return row ? toTransfer(row) : null;
  };
}
```

In `lib/api/domains/expenses/expenses.controller.ts`, replace:

```ts
      const result = repeat
        ? await new AddSeriesUseCase().run({ farmId, todayIso: todayISO(), ...entry, repeat })
        : await new AddExpenseUseCase().run({ farmId, ...entry });
      if (result === "due_before_date" || result === "invalid_repeat" || result === "starts_too_old") {
        return status(400, { error: result });
      }
      return Array.isArray(result) ? result : [result];
    },
    { farm: true, body: NewExpenseBody }
```

with:

```ts
      const result = repeat
        ? await new AddSeriesUseCase().run({ farmId, todayIso: todayISO(), ...entry, repeat })
        : await new AddExpenseUseCase().run({ farmId, ...entry });
      if (typeof result === "string") return status(400, { error: result });
      return Array.isArray(result) ? result : [result];
    },
    { farm: true, body: NewExpenseBody }
```

In `lib/api/domains/expenses/expenses.controller.ts`, replace:

```ts
          ? await new UpdateExpenseUseCase().run({ farmId, id: params.id, patch })
          : await new UpdateSeriesUseCase().run({ farmId, id: params.id, patch, scope });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "due_before_date") return status(400, { error: result });
      // The row as the load shows it: its série's fields and its anexos' count.
      return (await new GetExpenseUseCase().run({ farmId, id: params.id })) ?? result;
    },
```

with:

```ts
          ? await new UpdateExpenseUseCase().run({ farmId, id: params.id, patch })
          : await new UpdateSeriesUseCase().run({ farmId, id: params.id, patch, scope });
      if (result === null) return status(404, { error: "not_found" });
      if (typeof result === "string") return status(400, { error: result });
      // The row as the load shows it: its série's fields and its anexos' count.
      return (await new GetExpenseUseCase().run({ farmId, id: params.id })) ?? result;
    },
```

In `lib/api/domains/expenses/schemas/expense.schema.ts`, replace:

```ts
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
  repeat: t.Optional(RepeatModel),
});

```

with:

```ts
  document: t.Optional(Document),
  accountId: t.Optional(t.String()),
  lotId: t.Optional(t.String()),
  /** "Pago por"; kept only with `paidAt`. */
  bankAccountId: t.Optional(t.String()),
  repeat: t.Optional(RepeatModel),
});

```

In `lib/api/domains/expenses/schemas/expense.schema.ts`, replace:

```ts
  document: t.Optional(t.Nullable(Document)),
  accountId: t.Optional(t.Nullable(t.String())),
  lotId: t.Optional(t.Nullable(t.String())),
  /** For a row of a série; absent = "one". */
  scope: t.Optional(SeriesScopeModel),
});
```

with:

```ts
  document: t.Optional(t.Nullable(Document)),
  accountId: t.Optional(t.Nullable(t.String())),
  lotId: t.Optional(t.Nullable(t.String())),
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId: t.Optional(t.Nullable(t.String())),
  /** For a row of a série; absent = "one". */
  scope: t.Optional(SeriesScopeModel),
});
```

In `lib/api/domains/expenses/useCases/Add.useCase.ts`, replace:

```ts
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";
```

with:

```ts
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense } from "@/lib/types";
```

In `lib/api/domains/expenses/useCases/Add.useCase.ts`, replace:

```ts
  kind?: EntryKind;
};

/** `due_before_date` when the vencimento is earlier than the data. */
type AddExpenseUseCaseResponse = Expense | "due_before_date";

type CurrUseCase = _UseCase<AddExpenseUseCaseProps, AddExpenseUseCaseResponse>;

```

with:

```ts
  kind?: EntryKind;
};

/**
 * `due_before_date` when the vencimento is earlier than the data;
 * `invalid_bank_account` when "Pago por" is not a conta of the farm that may
 * pay it (archived, or a cartão receiving a receita).
 */
type AddExpenseUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account";

type CurrUseCase = _UseCase<AddExpenseUseCaseProps, AddExpenseUseCaseResponse>;

```

In `lib/api/domains/expenses/useCases/Add.useCase.ts`, replace:

```ts
    document,
    accountId,
    lotId,
  }) => {
    if (dueDate !== undefined && dueDate < date) return "due_before_date";
    // ponytail: accountId/lotId are not checked against the farm; the FK only proves they exist.
    const [row] = await this.repository
      .insert(expenses)
```

with:

```ts
    document,
    accountId,
    lotId,
    bankAccountId,
  }) => {
    if (dueDate !== undefined && dueDate < date) return "due_before_date";
    // A pending lançamento has no conta.
    const payingAccountId = paidAt === undefined ? null : (bankAccountId ?? null);
    if (payingAccountId !== null && !(await isPayingAccount(this.repository, farmId, payingAccountId, kind))) {
      return "invalid_bank_account";
    }
    // ponytail: accountId/lotId are not checked against the farm; the FK only proves they exist.
    const [row] = await this.repository
      .insert(expenses)
```

In `lib/api/domains/expenses/useCases/Add.useCase.ts`, replace:

```ts
        document: document ?? null,
        accountId: accountId ?? null,
        lotId: lotId ?? null,
      })
      .returning();
    return toExpense(row);
```

with:

```ts
        document: document ?? null,
        accountId: accountId ?? null,
        lotId: lotId ?? null,
        bankAccountId: payingAccountId,
      })
      .returning();
    return toExpense(row);
```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, replace:

```ts
import { expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { parseISODate } from "@/lib/domain/dates";
import {
  addMonths,
```

with:

```ts
import { expenseSeries, expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";
import { parseISODate } from "@/lib/domain/dates";
import {
  addMonths,
```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, replace:

```ts
  document?: string;
  accountId?: string;
  lotId?: string;
  repeat: SeriesRepeat;
}

```

with:

```ts
  document?: string;
  accountId?: string;
  lotId?: string;
  /** "Pago por" of the first row, when it is paid. */
  bankAccountId?: string;
  repeat: SeriesRepeat;
}

```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, replace:

```ts
 * centavo each), a recorrência ends before it starts, or nothing falls in the
 * window; `starts_too_old` when a recorrência starts more than 12 months ago.
 */
type AddSeriesUseCaseResponse = Expense[] | "due_before_date" | "invalid_repeat" | "starts_too_old";

type CurrUseCase = _UseCase<AddSeriesUseCaseProps, AddSeriesUseCaseResponse>;

```

with:

```ts
 * centavo each), a recorrência ends before it starts, or nothing falls in the
 * window; `starts_too_old` when a recorrência starts more than 12 months ago.
 */
type AddSeriesUseCaseResponse =
  | Expense[]
  | "due_before_date"
  | "invalid_repeat"
  | "starts_too_old"
  | "invalid_bank_account";

type CurrUseCase = _UseCase<AddSeriesUseCaseProps, AddSeriesUseCaseResponse>;

```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, replace:

```ts
          seriesHorizon(todayIso)
        ).map(({ index, date }) => ({ index, date, dueDate: date, amountBrl: entry.amountBrl }));
    if (lines.length === 0) return "invalid_repeat";

    const template = {
      kind,
```

with:

```ts
          seriesHorizon(todayIso)
        ).map(({ index, date }) => ({ index, date, dueDate: date, amountBrl: entry.amountBrl }));
    if (lines.length === 0) return "invalid_repeat";
    const firstAccountId = entry.paidAt === undefined ? null : (entry.bankAccountId ?? null);
    if (firstAccountId !== null && !(await isPayingAccount(this.repository, farmId, firstAccountId, kind))) {
      return "invalid_bank_account";
    }

    const template = {
      kind,
```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`, replace:

```ts
            amountBrl: line.amountBrl,
            // "Já pago" belongs to the first row; the others are bills to come.
            paidAt: line.index === 1 ? (entry.paidAt ?? null) : null,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
```

with:

```ts
            amountBrl: line.amountBrl,
            // "Já pago" belongs to the first row; the others are bills to come.
            paidAt: line.index === 1 ? (entry.paidAt ?? null) : null,
            bankAccountId: line.index === 1 ? firstAccountId : null,
            seriesId: series.id,
            seriesIndex: line.index,
          }))
```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`, replace:

```ts
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense, ExpenseCategory } from "@/lib/types";
```

with:

```ts
import { expenses } from "@/lib/db/schema";
import { toExpense } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isPayingAccount } from "@/lib/api/domains/bankAccounts/payingAccount";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryKind, Expense, ExpenseCategory } from "@/lib/types";
```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`, replace:

```ts
  document?: string | null;
  accountId?: string | null;
  lotId?: string | null;
}

interface UpdateExpenseUseCaseProps {
```

with:

```ts
  document?: string | null;
  accountId?: string | null;
  lotId?: string | null;
  /** "Pago por"; cleared whenever the row ends up unpaid. */
  bankAccountId?: string | null;
}

interface UpdateExpenseUseCaseProps {
```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`, replace:

```ts
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse = Expense | "due_before_date" | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

```

with:

```ts
}

/** Null when the lançamento is not on this farm. */
type UpdateExpenseUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account" | null;

type CurrUseCase = _UseCase<UpdateExpenseUseCaseProps, UpdateExpenseUseCaseResponse>;

```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`, replace:

```ts
    const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
    if (dueDate !== null && dueDate < date) return "due_before_date";

    // Only the declared fields reach the update, never a stray column like farmId.
    const { kind, category, amountBrl, notes, paidAt, counterparty, document, accountId, lotId } =
      patch;
```

with:

```ts
    const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
    if (dueDate !== null && dueDate < date) return "due_before_date";

    // Unpaying clears the conta; a pending lançamento never holds one.
    const paid = (patch.paidAt === undefined ? current.paidAt : patch.paidAt) !== null;
    const bankAccountId = !paid ? (current.bankAccountId ? null : undefined) : patch.bankAccountId;
    if (
      bankAccountId &&
      !(await isPayingAccount(this.repository, farmId, bankAccountId, patch.kind ?? current.kind))
    ) {
      return "invalid_bank_account";
    }

    // Only the declared fields reach the update, never a stray column like farmId.
    const { kind, category, amountBrl, notes, paidAt, counterparty, document, accountId, lotId } =
      patch;
```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`, replace:

```ts
      document,
      accountId,
      lotId,
    };
    const set = Object.fromEntries(
      Object.entries(declared).filter(([, value]) => value !== undefined)
```

with:

```ts
      document,
      accountId,
      lotId,
      bankAccountId,
    };
    const set = Object.fromEntries(
      Object.entries(declared).filter(([, value]) => value !== undefined)
```

In `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`, replace:

```ts
}

/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse = Expense | "due_before_date" | null;

type CurrUseCase = _UseCase<UpdateSeriesUseCaseProps, UpdateSeriesUseCaseResponse>;

```

with:

```ts
}

/** Null when the lançamento is not on this farm. */
type UpdateSeriesUseCaseResponse = Expense | "due_before_date" | "invalid_bank_account" | null;

type CurrUseCase = _UseCase<UpdateSeriesUseCaseProps, UpdateSeriesUseCaseResponse>;

```

In `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`, replace:

```ts
        id,
        patch: moved ? { ...patch, date: dueDate } : patch,
      });
      if (updated === null || updated === "due_before_date") return updated;

      const shared = sharedFields(patch, recurring);
      const rule = moved ? ruleFromOccurrence(series.frequency, current.seriesIndex, dueDate) : null;
```

with:

```ts
        id,
        patch: moved ? { ...patch, date: dueDate } : patch,
      });
      if (updated === null || typeof updated === "string") return updated;

      const shared = sharedFields(patch, recurring);
      const rule = moved ? ruleFromOccurrence(series.frequency, current.seriesIndex, dueDate) : null;
```

In `lib/api/domains/manejo/useCases/Delete.useCase.ts`, replace:

```ts
  lots,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
```

with:

```ts
  lots,
  manejoSessionAnimals,
  manejoSessions,
  statementLines,
  treatments,
  weighings,
} from "@/lib/db/schema";
```

In `lib/api/domains/manejo/useCases/Delete.useCase.ts`, replace:

```ts
      }

      await tx.update(manejoSessions).set({ deletedAt: stamp }).where(eq(manejoSessions.id, id));

      return {
        id,
```

with:

```ts
      }

      await tx.update(manejoSessions).set({ deletedAt: stamp }).where(eq(manejoSessions.id, id));
      if (row.kind === "sale" || row.kind === "entry") {
        // The linha do extrato it confirmed goes back to pending (a trigger resets the status).
        await tx
          .update(statementLines)
          .set({ movementId: null })
          .where(and(eq(statementLines.farmId, farmId), eq(statementLines.movementId, id)));
      }

      return {
        id,
```

In `lib/api/domains/manejo/useCases/Start.useCase.ts`, replace:

```ts
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  manejoSessionAnimals,
  manejoSessions,
  semenBulls,
```

with:

```ts
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  bankAccounts,
  manejoSessionAnimals,
  manejoSessions,
  semenBulls,
```

In `lib/api/domains/manejo/useCases/Start.useCase.ts`, replace:

```ts
          planCostBrl: plan?.costBrl,
          planNextDate: plan?.nextDate,
          planNotes: plan?.notes,
        })
        .returning();

```

with:

```ts
          planCostBrl: plan?.costBrl,
          planNextDate: plan?.nextDate,
          planNotes: plan?.notes,
          // A venda or compra goes through the conta principal; "Conta" in the Extrato changes it.
          ...(input.kind === "sale" || input.kind === "entry"
            ? {
                bankAccountId: sql`(select ${bankAccounts.id} from ${bankAccounts} where ${bankAccounts.farmId} = ${farmId} and ${bankAccounts.isMain})`,
              }
            : {}),
        })
        .returning();

```

In `lib/api/domains/semen/useCases/AddPurchase.useCase.ts`, replace:

```ts
    accountId: account?.id,
    notes: purchaseExpenseNotes(bull.name, input.doses),
  });
  // No vencimento is sent, so Add's only refusal cannot happen here.
  if (expense === "due_before_date") throw new Error(expense);
  const [row] = await repository
    .insert(semenPurchases)
    .values({
```

with:

```ts
    accountId: account?.id,
    notes: purchaseExpenseNotes(bull.name, input.doses),
  });
  // No vencimento and no conta are sent, so Add's refusals cannot happen here.
  if (typeof expense === "string") throw new Error(expense);
  const [row] = await repository
    .insert(semenPurchases)
    .values({
```

In `lib/api/permissions/routeRequirements.ts`, replace:

```ts
  "DELETE /api/herd/attachments/:id": edit("finance"),
  "GET /api/herd/expenses/:id/attachments": { view: "finance" },
  "POST /api/herd/expenses/:id/attachments": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

```

with:

```ts
  "DELETE /api/herd/attachments/:id": edit("finance"),
  "GET /api/herd/expenses/:id/attachments": { view: "finance" },
  "POST /api/herd/expenses/:id/attachments": edit("finance"),
  // Contas bancárias: the herd load reads them; every write here moves money.
  "POST /api/herd/bank-accounts": edit("finance"),
  "PATCH /api/herd/bank-accounts/:id": edit("finance"),
  "DELETE /api/herd/bank-accounts/:id": edit("finance"),
  "POST /api/herd/bank-accounts/:id/archive": edit("finance"),
  "POST /api/herd/transfers": edit("finance"),
  "PATCH /api/herd/transfers/:id": edit("finance"),
  "DELETE /api/herd/transfers/:id": edit("finance"),
  "PATCH /api/herd/movements/:id/bank-account": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

```

- [ ] **Step 4: Pin the new routes in the two snapshots (explicit paths only).**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**' -u`
Expected: `Snapshots  2 updated`; the table gains the eight routes of this task.

- [ ] **Step 5: Run the tests.**

Run: `pnpm exec vitest run lib/api --exclude '**/worktrees/**'`
Expected: PASS (every file under `lib/api`, the new ones included).

Run: `pnpm exec vitest run lib/api/domains/manejo lib/api/domains/semen --exclude '**/worktrees/**'`
Expected: PASS (the Start, Delete and AddPurchase tests are untouched).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/api`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 6: Commit.**

```bash
git add lib/api/__tests__/routeRequirements.test.ts lib/api/app.ts lib/api/domains/bankAccounts/__tests__/bankAccounts.routes.test.ts lib/api/domains/bankAccounts/bankAccounts.controller.ts lib/api/domains/bankAccounts/payingAccount.ts lib/api/domains/bankAccounts/schemas/bankAccount.schema.ts lib/api/domains/bankAccounts/useCases/AddBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/AddTransfer.useCase.ts lib/api/domains/bankAccounts/useCases/ArchiveBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/DeleteBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/DeleteTransfer.useCase.ts lib/api/domains/bankAccounts/useCases/SetMovementBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/UpdateBankAccount.useCase.ts lib/api/domains/bankAccounts/useCases/UpdateTransfer.useCase.ts lib/api/domains/bankAccounts/useCases/__tests__/bankAccounts.test.ts lib/api/domains/expenses/expenses.controller.ts lib/api/domains/expenses/schemas/expense.schema.ts lib/api/domains/expenses/useCases/Add.useCase.ts lib/api/domains/expenses/useCases/AddSeries.useCase.ts lib/api/domains/expenses/useCases/Update.useCase.ts lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/manejo/useCases/Delete.useCase.ts lib/api/domains/manejo/useCases/Start.useCase.ts lib/api/domains/semen/useCases/AddPurchase.useCase.ts lib/api/permissions/routeRequirements.ts lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap lib/api/__tests__/__snapshots__/routeTable.test.ts.snap
git commit -m 'feat(finance): contas bancárias, transferências and "Pago por" in the API'
```


---

### Task 6: API — import an extrato and decide its lines

**Files:**
- Create: `lib/api/domains/statements/schemas/statement.schema.ts`, `lib/api/domains/statements/statements.controller.ts`, `lib/api/domains/statements/useCases/ConfirmHigh.useCase.ts`, `lib/api/domains/statements/useCases/GetImport.useCase.ts`, `lib/api/domains/statements/useCases/ImportStatement.useCase.ts`, `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`, `lib/api/domains/statements/useCases/__tests__/statements.routes.test.ts`, `lib/api/domains/statements/useCases/__tests__/statements.test.ts`
- Modify: `lib/api/__tests__/routeRequirements.test.ts`, `lib/api/app.ts`, `lib/api/permissions/routeRequirements.ts`
- Modify (generated by `-u`): `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap`, `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap`

**Interfaces:**
- Consumes: parsers (Task 3), `MatchTarget` (Task 4), `AddExpenseUseCase` with `bankAccountId` and `NewExpenseBody` (Task 5), mappers (Task 1).
- Produces: `statementsController` and its routes ("Shared interfaces"); exported types the store and the UI import with `import type`: `ImportResult` (`ImportStatement.useCase.ts`), `ImportView` (`GetImport.useCase.ts`), `LineEntry`, `LineAction`, `Resolved`, `ResolveRefusal` (`ResolveLine.useCase.ts`); `BEFORE_OPENING_REASON` = "antes do saldo inicial".

- [ ] **Step 1: Tests first.**

In `lib/api/__tests__/routeRequirements.test.ts`, replace:

```ts
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
```

with:

```ts
    }
  });

  it("lets Financeiro view read an extrato and keeps every decision on it behind Financeiro edit", () => {
    expect(ROUTE_REQUIREMENTS["GET /api/herd/imports/:id"]).toEqual({ view: "finance" });
    for (const key of [
      "POST /api/herd/bank-accounts/:id/imports",
      "POST /api/herd/imports/:id/confirm-high",
      "POST /api/herd/statement-lines/:id/match",
      "POST /api/herd/statement-lines/:id/create",
      "POST /api/herd/statement-lines/:id/transfer",
      "POST /api/herd/statement-lines/:id/ignore",
      "POST /api/herd/statement-lines/:id/undo",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["finance"] });
    }
  });

  it("lets Financeiro view read anexos and keeps their writes behind Financeiro edit", () => {
    for (const key of [
      "GET /api/herd/attachments/status",
```

Create `lib/api/domains/statements/useCases/__tests__/statements.routes.test.ts`:

```ts
/**
 * The conciliação routes behind the farm macro, auth and db mocked: a member
 * who only sees Financeiro may read an import but decides no line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "@/lib/domain/permissions";

const { state, getSession, resolveLine, getImport } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  resolveLine: vi.fn(),
  getImport: vi.fn(),
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
vi.mock("@/lib/api/domains/statements/useCases/ResolveLine.useCase", () => ({
  ResolveLineUseCase: class {
    run = resolveLine;
  },
}));
vi.mock("@/lib/api/domains/statements/useCases/GetImport.useCase", () => ({
  GetImportUseCase: class {
    run = getImport;
  },
}));

import { herdApi } from "@/lib/api/app";

const call = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];
  resolveLine.mockReset();
  getImport.mockReset();
});

describe("conciliação routes for a member with Financeiro view", () => {
  it("read an import, and a 404 for another farm's", async () => {
    getImport.mockResolvedValue(null);
    const response = await call("GET", "/imports/imp-9");
    expect(response.status).toBe(404);
    expect(getImport).toHaveBeenCalledWith({ farmId: 7, id: "imp-9" });
  });

  it("decide no line", async () => {
    const response = await call("POST", "/statement-lines/l-1/ignore", { reason: "duplicada" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    expect(resolveLine).not.toHaveBeenCalled();
  });
});
```

Create `lib/api/domains/statements/useCases/__tests__/statements.test.ts`:

```ts
/**
 * Extrato import and conciliação against the shared chainable db stub:
 * selects answer from a queue in call order, writes are recorded, and
 * `returning()` answers from its own queue.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

import { ImportStatementUseCase } from "../ImportStatement.useCase";
import { GetImportUseCase } from "../GetImport.useCase";
import { ResolveLineUseCase } from "../ResolveLine.useCase";
import { ConfirmHighUseCase } from "../ConfirmHigh.useCase";

const OFX = readFileSync(
  join(__dirname, "../../../../../domain/statements/__tests__/fixtures/sicredi-1x.ofx"),
  "utf8"
);

const ACCOUNT = {
  id: "sicredi",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 1000,
  openingDate: "2026-09-15",
  isMain: true,
  csvMapping: null,
  archivedAt: null,
};

const IMPORT_ROW = {
  id: "imp-1",
  farmId: 7,
  bankAccountId: "sicredi",
  fileName: "extrato.ofx",
  format: "ofx",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-26",
  bankBalanceBrl: 84312.4,
  bankBalanceDate: "2026-09-26",
  lineCount: 4,
  skippedCount: 1,
  createdAt: new Date("2026-09-29T12:00:00Z"),
  createdBy: "u-1",
};

const LINE = {
  id: "l-1",
  farmId: 7,
  bankAccountId: "sicredi",
  importId: "imp-1",
  date: "2026-09-18",
  description: "PIX ENVIADO AGROPECUARIA SERTAO",
  amountBrl: -4850,
  externalId: "f:202609180002",
  status: "pending",
  expenseId: null,
  movementId: null,
  transferId: null,
  ignoreReason: null,
  resolvedAt: null,
  resolvedBy: null,
};

const EXPENSE = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 4850,
  notes: null,
  dueDate: "2026-09-18",
  paidAt: null,
  counterparty: "Agropecuária Sertão",
  document: null,
  accountId: null,
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
});

const importRun = (patch: Partial<Parameters<ImportStatementUseCase["run"]>[0]> = {}) =>
  new ImportStatementUseCase().run({
    farmId: 7,
    userId: "u-1",
    bankAccountId: "sicredi",
    fileName: "extrato.ofx",
    content: OFX,
    ...patch,
  });

describe("ImportStatementUseCase", () => {
  it("skips the lines already imported and sets aside those before the saldo inicial", async () => {
    state.selectResults = [[ACCOUNT], [{ externalId: "f:202609200003" }]];
    state.returning = [[IMPORT_ROW]];
    const result = await importRun();
    expect(result).toMatchObject({ newLines: 4, skipped: 1, import: { id: "imp-1", bankBalanceBrl: 84312.4 } });
    expect(state.inserts[0]).toMatchObject({ lineCount: 4, skippedCount: 1, periodFrom: "2026-09-01", createdBy: "u-1" });
    const lines = state.inserts[1] as Record<string, unknown>[];
    expect(lines.map((l) => [l.date, l.status, l.ignoreReason])).toEqual([
      ["2026-09-10", "ignored", "antes do saldo inicial"],
      ["2026-09-18", "pending", null],
      ["2026-09-23", "pending", null],
      ["2026-09-24", "pending", null],
    ]);
  });

  it("refuses a file with nothing new", async () => {
    state.selectResults = [
      [ACCOUNT],
      ["f:202609100001", "f:202609180002", "f:202609200003", "f:202609230004", "f:202609240005"].map((externalId) => ({
        externalId,
      })),
    ];
    expect(await importRun()).toBe("nothing_new");
    expect(state.inserts).toEqual([]);
  });

  it("is not_found for another farm's conta and refuses a caixa", async () => {
    state.selectResults = [[]];
    expect(await importRun()).toBe("not_found");
    state.selectResults = [[{ ...ACCOUNT, kind: "cash" }]];
    expect(await importRun()).toBe("not_checking");
  });

  it("asks for the columns of a CSV once, then keeps them on the conta", async () => {
    const csv = "Data;Histórico;Valor\n20/09/2026;PIX RECEBIDO;1.500,00\n";
    state.selectResults = [[ACCOUNT]];
    expect(await importRun({ fileName: "extrato.csv", content: csv })).toBe("mapping_required");
    const mapping = {
      delimiter: ";",
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "dmy" as const,
      decimal: "," as const,
      skipRows: 1,
    };
    state.selectResults = [[ACCOUNT], []];
    state.returning = [[{ ...IMPORT_ROW, format: "csv" }]];
    expect(await importRun({ fileName: "extrato.csv", content: csv, mapping })).toMatchObject({ newLines: 1 });
    expect(state.updates).toEqual([{ csvMapping: mapping }]);
  });

  it("passes the parser's code along", async () => {
    state.selectResults = [[ACCOUNT]];
    expect(await importRun({ content: "<OFX><STMTTRN><DTPOSTED>2026<TRNAMT>1</STMTTRN></OFX>" })).toBe("bad_date:1");
  });
});

describe("GetImportUseCase", () => {
  it("is null for another farm's import", async () => {
    state.selectResults = [[]];
    expect(await new GetImportUseCase().run({ farmId: 8, id: "imp-1" })).toBeNull();
  });

  it("answers the lines and every record already paired", async () => {
    state.selectResults = [[IMPORT_ROW], [LINE], [{ expenseId: "e-9", movementId: null, transferId: "t-2" }]];
    const view = await new GetImportUseCase().run({ farmId: 7, id: "imp-1" });
    expect(view?.lines).toHaveLength(1);
    expect(view?.pairedIds).toEqual(["e-9", "t-2"]);
  });
});

const resolveRun = (action: Parameters<ResolveLineUseCase["run"]>[0]["action"], lineId = "l-1") =>
  new ResolveLineUseCase().run({ farmId: 7, userId: "u-1", lineId, action });

describe("ResolveLineUseCase", () => {
  it("pays a pending lançamento on the line's date from its conta", async () => {
    state.selectResults = [[LINE], [EXPENSE]];
    state.returning = [
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, status: "matched", expenseId: "e-1" }],
    ];
    const result = await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } });
    expect(state.updates[0]).toEqual({ paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(state.updates[1]).toMatchObject({ status: "matched", expenseId: "e-1", resolvedBy: "u-1" });
    expect(result).toMatchObject({ line: { status: "matched" }, expense: { paidAt: "2026-09-18", bankAccountId: "sicredi" } });
  });

  it("refuses a lançamento paid by another conta and one on the other side", async () => {
    state.selectResults = [[LINE], [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "caixa" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("paid_by_other");
    state.selectResults = [[LINE], [{ ...EXPENSE, kind: "revenue" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("wrong_side");
    expect(state.updates).toEqual([]);
  });

  it("gives a venda without conta the line's conta", async () => {
    const receipt = { ...LINE, amountBrl: 148320 };
    state.selectResults = [[receipt], [{ kind: "sale", bankAccountId: null }]];
    state.returning = [[{ ...receipt, status: "matched", movementId: "m-1" }]];
    const result = await resolveRun({ type: "match", target: { kind: "movement", id: "m-1" } });
    expect(state.updates[0]).toEqual({ bankAccountId: "sicredi" });
    expect(result).toMatchObject({ movement: { id: "m-1", bankAccountId: "sicredi" } });
  });

  it("creates the lançamento paid on the line's date by its conta", async () => {
    state.selectResults = [[LINE], [{ kind: "checking", archivedAt: null }]];
    state.returning = [
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, status: "created", expenseId: "e-1" }],
    ];
    const result = await resolveRun({
      type: "create",
      entry: { date: "2026-09-18", category: "health", amountBrl: 4850, notes: "PIX ENVIADO AGROPECUARIA SERTAO" },
    });
    expect(state.inserts[0]).toMatchObject({ kind: "expense", category: "health", paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(result).toMatchObject({ line: { status: "created", expenseId: "e-1" } });
  });

  it("turns a saque into a transferência to the other conta", async () => {
    const saque = { ...LINE, amountBrl: -1000, description: "SAQUE CAIXA 24H" };
    state.selectResults = [[saque], [{ id: "caixa" }]];
    state.returning = [
      [{ id: "t-1", farmId: 7, fromId: "sicredi", toId: "caixa", date: "2026-09-18", amountBrl: 1000, notes: "SAQUE CAIXA 24H" }],
      [{ ...saque, status: "transfer", transferId: "t-1" }],
    ];
    const result = await resolveRun({ type: "transfer", otherAccountId: "caixa" });
    expect(state.inserts[0]).toMatchObject({ fromId: "sicredi", toId: "caixa", amountBrl: 1000, date: "2026-09-18" });
    expect(result).toMatchObject({ line: { status: "transfer" }, transfer: { id: "t-1" } });
    state.selectResults = [[saque]];
    expect(await resolveRun({ type: "transfer", otherAccountId: "sicredi" })).toBe("same_account");
  });

  it("ignores with a reason, refuses a second decision, and undoes back to pending", async () => {
    state.selectResults = [[LINE]];
    state.returning = [[{ ...LINE, status: "ignored", ignoreReason: "tarifa já lançada" }]];
    await resolveRun({ type: "ignore", reason: " tarifa já lançada " });
    expect(state.updates[0]).toMatchObject({ status: "ignored", ignoreReason: "tarifa já lançada" });

    state.selectResults = [[{ ...LINE, status: "ignored" }]];
    expect(await resolveRun({ type: "ignore", reason: "duplicada" })).toBe("not_pending");

    state.selectResults = [[{ ...LINE, status: "matched", expenseId: "e-1" }]];
    state.returning = [[LINE]];
    const undone = await resolveRun({ type: "undo" });
    expect(state.updates[1]).toMatchObject({ status: "pending", expenseId: null, movementId: null, transferId: null });
    expect(undone).toMatchObject({ line: { status: "pending" } });
    // The lançamento stays paid: undo writes the line only.
    expect(state.updates).toHaveLength(2);
  });

  it("is not_found for another farm's line and target_not_found for another farm's record", async () => {
    state.selectResults = [[]];
    expect(await resolveRun({ type: "ignore", reason: "outro" })).toBe("not_found");
    state.selectResults = [[LINE], []];
    expect(await resolveRun({ type: "match", target: { kind: "transfer", id: "t-other" } })).toBe("target_not_found");
    expect(state.updates).toEqual([]);
  });
});

describe("ConfirmHighUseCase", () => {
  it("confirms each pair and counts the refused ones", async () => {
    state.selectResults = [
      [LINE],
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, id: "l-2" }],
      [{ ...EXPENSE, id: "e-2", paidAt: "2026-09-18", bankAccountId: "caixa" }],
    ];
    state.returning = [[{ ...LINE, status: "matched", expenseId: "e-1" }]];
    const result = await new ConfirmHighUseCase().run({
      farmId: 7,
      userId: "u-1",
      importId: "imp-1",
      pairs: [
        { lineId: "l-1", kind: "expense", id: "e-1" },
        { lineId: "l-2", kind: "expense", id: "e-2" },
      ],
    });
    expect(result.resolved.map((r) => r.line.id)).toEqual(["l-1"]);
    expect(result.refused).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/api/domains/statements lib/api/__tests__/routeRequirements.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the statement use cases do not exist; no requirement for `GET /api/herd/imports/:id`.

- [ ] **Step 3: Schemas, use cases, controller, wiring.**

In `lib/api/app.ts`, replace:

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { attachmentsController } from "@/lib/api/domains/attachments/attachments.controller";
import { bankAccountsController } from "@/lib/api/domains/bankAccounts/bankAccounts.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
import { farmController } from "@/lib/api/domains/farm/farm.controller";
import { herdController } from "@/lib/api/domains/herd/herd.controller";
```

with:

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { attachmentsController } from "@/lib/api/domains/attachments/attachments.controller";
import { bankAccountsController } from "@/lib/api/domains/bankAccounts/bankAccounts.controller";
import { statementsController } from "@/lib/api/domains/statements/statements.controller";
import { expensesController } from "@/lib/api/domains/expenses/expenses.controller";
import { farmController } from "@/lib/api/domains/farm/farm.controller";
import { herdController } from "@/lib/api/domains/herd/herd.controller";
```

In `lib/api/app.ts`, replace:

```ts
  .use(attachmentsController)
  .use(accountsController)

  /* ---- Contas bancárias, transferências ---------------------------------- */
  .use(bankAccountsController)

  /* ---- Manejo sessions --------------------------------------------------- */
  .use(manejoController);
```

with:

```ts
  .use(attachmentsController)
  .use(accountsController)

  /* ---- Contas bancárias, transferências, extratos e conciliação ---------- */
  .use(bankAccountsController)
  .use(statementsController)

  /* ---- Manejo sessions --------------------------------------------------- */
  .use(manejoController);
```

Create `lib/api/domains/statements/schemas/statement.schema.ts`:

```ts
/** Request schemas of the extrato imports and the conciliação of their lines. */

import { t } from "elysia";

import { NewExpenseBody } from "@/lib/api/domains/expenses/schemas/expense.schema";
import { MAX_STATEMENT_BYTES } from "@/lib/domain/statements/common";

const Column = t.Integer({ minimum: 0, maximum: 100 });

export const CsvMappingModel = t.Object({
  delimiter: t.String({ minLength: 1, maxLength: 1 }),
  dateColumn: Column,
  descriptionColumn: Column,
  amountColumn: t.Optional(Column),
  inColumn: t.Optional(Column),
  outColumn: t.Optional(Column),
  dateFormat: t.Union([t.Literal("dmy"), t.Literal("ymd")]),
  decimal: t.Union([t.Literal(","), t.Literal(".")]),
  skipRows: t.Integer({ minimum: 0, maximum: 50 }),
});

/** Body of POST /bank-accounts/:id/imports: the file's text, decoded by the browser. */
export const ImportStatementBody = t.Object({
  fileName: t.String({ minLength: 1, maxLength: 200 }),
  content: t.String({ minLength: 1, maxLength: MAX_STATEMENT_BYTES }),
  /** A CSV's columns; stored on the conta for the next imports. */
  mapping: t.Optional(CsvMappingModel),
});

export const MatchBody = t.Object({
  kind: t.Union([t.Literal("expense"), t.Literal("movement"), t.Literal("transfer")]),
  id: t.String({ minLength: 1 }),
});

/** "Criar lançamento": the EntryDialog's body; the line fixes the pagamento and the conta. */
export const CreateFromLineBody = t.Omit(NewExpenseBody, ["repeat", "bankAccountId", "kind"]);

export const TransferFromLineBody = t.Object({ otherAccountId: t.String({ minLength: 1 }) });

export const IgnoreLineBody = t.Object({ reason: t.String({ minLength: 1, maxLength: 120, pattern: "\\S" }) });

/** "Confirmar as N de confiança alta": the pairs the page shows as alta. */
export const ConfirmHighBody = t.Object({
  pairs: t.Array(t.Object({ lineId: t.String({ minLength: 1 }), kind: MatchBody.properties.kind, id: t.String({ minLength: 1 }) }), {
    maxItems: 500,
  }),
});
```

Create `lib/api/domains/statements/statements.controller.ts`:

```ts
/**
 * Extratos and conciliação: import an OFX or CSV into a conta corrente, read
 * one import with its lines, and decide each line — pair it, create the
 * lançamento, make it a transferência, ignore it, or undo.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { ConfirmHighUseCase } from "./useCases/ConfirmHigh.useCase";
import { GetImportUseCase } from "./useCases/GetImport.useCase";
import { ImportStatementUseCase } from "./useCases/ImportStatement.useCase";
import { ResolveLineUseCase, type LineAction, type ResolveRefusal } from "./useCases/ResolveLine.useCase";
import {
  ConfirmHighBody,
  CreateFromLineBody,
  IgnoreLineBody,
  ImportStatementBody,
  MatchBody,
  TransferFromLineBody,
} from "./schemas/statement.schema";

const REFUSAL_STATUS: Record<ResolveRefusal, 400 | 404 | 409> = {
  not_found: 404,
  target_not_found: 404,
  not_pending: 409,
  wrong_side: 400,
  paid_by_other: 409,
  already_paired: 409,
  same_account: 400,
  due_before_date: 400,
  invalid_bank_account: 400,
};

const resolveLine = (farmId: number, userId: string, lineId: string, action: LineAction) =>
  new ResolveLineUseCase().run({ farmId, userId, lineId, action });

export const statementsController = new Elysia()
  .use(farmPlugin)
  .post(
    "/bank-accounts/:id/imports",
    async ({ farmId, user, params, body, status }) => {
      const result = await new ImportStatementUseCase().run({
        farmId,
        userId: user.id,
        bankAccountId: params.id,
        ...body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "nothing_new") return status(409, { error: result });
      if (typeof result === "string") return status(400, { error: result });
      return result;
    },
    { farm: true, body: ImportStatementBody }
  )
  .get(
    "/imports/:id",
    async ({ farmId, params, status }) => {
      const view = await new GetImportUseCase().run({ farmId, id: params.id });
      if (!view) return status(404, { error: "not_found" });
      return view;
    },
    { farm: true }
  )
  .post(
    "/imports/:id/confirm-high",
    ({ farmId, user, params, body }) =>
      new ConfirmHighUseCase().run({ farmId, userId: user.id, importId: params.id, pairs: body.pairs }),
    { farm: true, body: ConfirmHighBody }
  )
  .post(
    "/statement-lines/:id/match",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "match", target: body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: MatchBody }
  )
  .post(
    "/statement-lines/:id/create",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "create", entry: body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: CreateFromLineBody }
  )
  .post(
    "/statement-lines/:id/transfer",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "transfer", ...body });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: TransferFromLineBody }
  )
  .post(
    "/statement-lines/:id/ignore",
    async ({ farmId, user, params, body, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "ignore", reason: body.reason });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true, body: IgnoreLineBody }
  )
  .post(
    "/statement-lines/:id/undo",
    async ({ farmId, user, params, status }) => {
      const result = await resolveLine(farmId, user.id, params.id, { type: "undo" });
      if (typeof result === "string") return status(REFUSAL_STATUS[result], { error: result });
      return result;
    },
    { farm: true }
  );
```

Create `lib/api/domains/statements/useCases/ConfirmHigh.useCase.ts`:

```ts
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { Refused, resolve, type Resolved } from "./ResolveLine.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { MatchTarget } from "@/lib/domain/statements/match";

interface ConfirmHighUseCaseProps {
  farmId: number;
  userId: string;
  importId: string;
  pairs: ({ lineId: string } & MatchTarget)[];
}

/** Each pair confirmed, and how many were refused (paid by another conta meanwhile, …). */
type CurrUseCase = _UseCase<ConfirmHighUseCaseProps, { resolved: Resolved[]; refused: number }>;

/**
 * "Confirmar as N de confiança alta": pairs every line the page showed as alta,
 * each in its own transaction, so one refusal leaves the others confirmed.
 * Lines of another import are refused.
 */
export class ConfirmHighUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ConfirmHighUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, importId, pairs }) => {
    const resolved: Resolved[] = [];
    let refused = 0;
    for (const { lineId, kind, id } of pairs) {
      try {
        const result = await this.repository.transaction((tx) =>
          resolve(tx, { farmId, userId, lineId, action: { type: "match", target: { kind, id } } }).then((r) => {
            if (r.line.importId !== importId) throw new Refused("not_found");
            return r;
          })
        );
        resolved.push(result);
      } catch (error) {
        if (!(error instanceof Refused) && !isUniqueViolation(error)) throw error;
        refused += 1;
      }
    }
    return { resolved, refused };
  };
}
```

Create `lib/api/domains/statements/useCases/GetImport.useCase.ts`:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { statementImports, statementLines } from "@/lib/db/schema";
import { toStatementImport, toStatementLine } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { StatementImport, StatementLine } from "@/lib/types";

interface GetImportUseCaseProps {
  farmId: number;
  id: string;
}

export interface ImportView {
  import: StatementImport;
  /** Oldest first. */
  lines: StatementLine[];
  /**
   * Every record some linha of the farm already confirms: never offered again.
   * The page builds the candidates from the herd it holds, minus these.
   */
  pairedIds: string[];
}

type CurrUseCase = _UseCase<GetImportUseCaseProps, ImportView | null>;

/** The Conciliar page's data; null when the import is not on this farm. */
export class GetImportUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("GetImportUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    const [row] = await this.repository
      .select()
      .from(statementImports)
      .where(and(eq(statementImports.farmId, farmId), eq(statementImports.id, id)))
      .limit(1);
    if (!row) return null;
    const [lines, paired] = await Promise.all([
      this.repository
        .select()
        .from(statementLines)
        .where(and(eq(statementLines.farmId, farmId), eq(statementLines.importId, id)))
        .orderBy(asc(statementLines.date), asc(statementLines.id)),
      this.repository
        .select({
          expenseId: statementLines.expenseId,
          movementId: statementLines.movementId,
          transferId: statementLines.transferId,
        })
        .from(statementLines)
        .where(
          and(
            eq(statementLines.farmId, farmId),
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
    ]);
    return {
      import: toStatementImport(row),
      lines: lines.map(toStatementLine),
      pairedIds: paired.flatMap((p) =>
        [p.expenseId, p.movementId, p.transferId].filter((x): x is string => x !== null)
      ),
    };
  };
}
```

Create `lib/api/domains/statements/useCases/ImportStatement.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, statementImports, statementLines } from "@/lib/db/schema";
import { toStatementImport } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { MAX_STATEMENT_BYTES, statementFormat } from "@/lib/domain/statements/common";
import { parseCsv } from "@/lib/domain/statements/csv";
import { parseOfx } from "@/lib/domain/statements/ofx";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { CsvMapping, StatementImport } from "@/lib/types";

/** Why a linha dated on or before the saldo inicial is set aside. */
export const BEFORE_OPENING_REASON = "antes do saldo inicial";

/** Rows per insert: Postgres takes at most 65 535 parameters in one statement. */
const CHUNK = 1000;

interface ImportStatementUseCaseProps {
  farmId: number;
  userId: string;
  bankAccountId: string;
  fileName: string;
  content: string;
  mapping?: CsvMapping;
}

export interface ImportResult {
  import: StatementImport;
  newLines: number;
  skipped: number;
}

/**
 * A refusal is a code: `not_found`, `not_checking`, `too_large`,
 * `mapping_required`, `nothing_new`, or the parser's (`not_ofx`, `no_lines`,
 * `bad_date:<row>`, `bad_amount:<row>`).
 */
type ImportStatementUseCaseResponse = ImportResult | string;

type CurrUseCase = _UseCase<ImportStatementUseCaseProps, ImportStatementUseCaseResponse>;

/**
 * Reads an extrato into a conta corrente. Lines already imported (same
 * `externalId` in the conta) are skipped and counted; a file with nothing new
 * is refused. Lines on or before the saldo inicial arrive ignored. A CSV uses
 * the mapping sent (and keeps it on the conta) or the one the conta holds.
 */
export class ImportStatementUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ImportStatementUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, userId, bankAccountId, fileName, content, mapping }) => {
    const [account] = await this.repository
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, bankAccountId)))
      .limit(1);
    if (!account) return "not_found";
    if (account.kind !== "checking") return "not_checking";
    if (content.length > MAX_STATEMENT_BYTES) return "too_large";

    const format = statementFormat(fileName, content);
    const csvMapping = mapping ?? account.csvMapping ?? null;
    if (format === "csv" && csvMapping === null) return "mapping_required";
    const parsed = format === "ofx" ? parseOfx(content) : parseCsv(content, csvMapping!);
    if (!parsed.ok) return parsed.error;
    const { lines, bankBalance, period } = parsed.statement;

    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i += CHUNK) {
      const ids = lines.slice(i, i + CHUNK).map((l) => l.externalId);
      const rows = await this.repository
        .select({ externalId: statementLines.externalId })
        .from(statementLines)
        .where(and(eq(statementLines.bankAccountId, bankAccountId), inArray(statementLines.externalId, ids)));
      for (const row of rows) seen.add(row.externalId);
    }
    const fresh = lines.filter((l) => !seen.has(l.externalId));
    if (fresh.length === 0) return "nothing_new";

    return this.repository.transaction(async (tx) => {
      const [row] = await tx
        .insert(statementImports)
        .values({
          id: randomUUID(),
          farmId,
          bankAccountId,
          fileName,
          format,
          periodFrom: period.from,
          periodTo: period.to,
          bankBalanceBrl: bankBalance?.amountBrl ?? null,
          bankBalanceDate: bankBalance?.date ?? null,
          lineCount: fresh.length,
          skippedCount: lines.length - fresh.length,
          createdBy: userId,
        })
        .returning();
      for (let i = 0; i < fresh.length; i += CHUNK) {
        await tx
          .insert(statementLines)
          .values(
            fresh.slice(i, i + CHUNK).map((line) => {
              const before = line.date <= account.openingDate;
              return {
                id: randomUUID(),
                farmId,
                bankAccountId,
                importId: row.id,
                date: line.date,
                description: line.description,
                amountBrl: line.amountBrl,
                externalId: line.externalId,
                status: before ? ("ignored" as const) : ("pending" as const),
                ignoreReason: before ? BEFORE_OPENING_REASON : null,
              };
            })
          )
          // Two imports of one file racing: the second one's copies are dropped.
          .onConflictDoNothing();
      }
      if (format === "csv" && mapping) {
        await tx.update(bankAccounts).set({ csvMapping: mapping }).where(eq(bankAccounts.id, bankAccountId));
      }
      return { import: toStatementImport(row), newLines: fresh.length, skipped: lines.length - fresh.length };
    });
  };
}
```

Create `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  bankAccounts,
  expenses,
  manejoSessions,
  movements,
  statementLines,
  transfers,
} from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpense, toStatementLine, toTransfer } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { AddExpenseUseCase } from "@/lib/api/domains/expenses/useCases/Add.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, StatementLine, Transfer } from "@/lib/types";
import type { MatchTarget } from "@/lib/domain/statements/match";

/** The EntryDialog's fields for "Criar lançamento"; kind, pagamento and conta come from the line. */
export interface LineEntry {
  date: string;
  category: Expense["category"];
  amountBrl: number;
  notes?: string;
  dueDate?: string;
  paidAt?: string;
  counterparty?: string;
  document?: string;
  accountId?: string;
  lotId?: string;
}

export type LineAction =
  | { type: "match"; target: MatchTarget }
  | { type: "create"; entry: LineEntry }
  | { type: "transfer"; otherAccountId: string }
  | { type: "ignore"; reason: string }
  | { type: "undo" };

/** The line after the decision, with what the store must merge. */
export interface Resolved {
  line: StatementLine;
  /** A lançamento paid, given the conta, or created. */
  expense?: Expense;
  /** A venda or compra that took the conta. */
  movement?: { id: string; bankAccountId: string };
  transfer?: Transfer;
}

/**
 * `not_found`: the line is not the farm's; `target_not_found`: the record is
 * not; `not_pending`: the line already has a decision; `wrong_side`: an
 * entrada paired with a saída or the reverse; `paid_by_other`: the record was
 * paid by another conta; `already_paired`: another line confirms it;
 * `same_account`: a transferência to the line's own conta; `due_before_date`
 * and `invalid_bank_account`: the lançamento "Criar lançamento" sent.
 */
export type ResolveRefusal =
  | "not_found"
  | "target_not_found"
  | "not_pending"
  | "wrong_side"
  | "paid_by_other"
  | "already_paired"
  | "same_account"
  | "due_before_date"
  | "invalid_bank_account";

interface ResolveLineUseCaseProps {
  farmId: number;
  userId: string;
  lineId: string;
  action: LineAction;
}

type CurrUseCase = _UseCase<ResolveLineUseCaseProps, Resolved | ResolveRefusal>;

class Refused extends Error {
  constructor(readonly code: ResolveRefusal) {
    super(code);
  }
}

/**
 * One decision on a linha do extrato: pair it with a record, create the
 * lançamento it is, turn it into a transferência, ignore it, or undo any of
 * these (the record stays as it is). Pairing a pending lançamento pays it on
 * the line's date from the line's conta; a paid one or a venda without a conta
 * takes this one; one paid by another conta is refused.
 */
export class ResolveLineUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ResolveLineUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async (props) => {
    try {
      return await this.repository.transaction((tx) => resolve(tx, props));
    } catch (error) {
      if (error instanceof Refused) return error.code;
      if (isUniqueViolation(error)) return "already_paired";
      throw error;
    }
  };
}

/** Runs one decision on `tx`; throws Refused to roll it back. ConfirmHigh reuses it. */
export async function resolve(
  tx: RepositoryType,
  { farmId, userId, lineId, action }: ResolveLineUseCaseProps
): Promise<Resolved> {
  const scope = and(eq(statementLines.farmId, farmId), eq(statementLines.id, lineId));
  const [line] = await tx.select().from(statementLines).where(scope).limit(1).for("update");
  if (!line) throw new Refused("not_found");

  const save = async (set: Partial<typeof statementLines.$inferInsert>) => {
    const [row] = await tx.update(statementLines).set(set).where(scope).returning();
    return toStatementLine(row);
  };
  const resolvedBy = { resolvedAt: new Date(), resolvedBy: userId };

  if (action.type === "undo") {
    if (line.status === "pending") return { line: toStatementLine(line) };
    return {
      line: await save({
        status: "pending",
        expenseId: null,
        movementId: null,
        transferId: null,
        ignoreReason: null,
        resolvedAt: null,
        resolvedBy: null,
      }),
    };
  }
  if (line.status !== "pending") throw new Refused("not_pending");
  const outflow = line.amountBrl < 0;

  if (action.type === "ignore") {
    return { line: await save({ status: "ignored", ignoreReason: action.reason.trim(), ...resolvedBy }) };
  }

  if (action.type === "create") {
    const expense = await new AddExpenseUseCase(tx).run({
      ...action.entry,
      farmId,
      kind: outflow ? "expense" : "revenue",
      category: outflow ? action.entry.category : "other",
      paidAt: action.entry.paidAt ?? line.date,
      bankAccountId: line.bankAccountId,
    });
    if (typeof expense === "string") throw new Refused(expense);
    return { line: await save({ status: "created", expenseId: expense.id, ...resolvedBy }), expense };
  }

  if (action.type === "transfer") {
    if (action.otherAccountId === line.bankAccountId) throw new Refused("same_account");
    const [other] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.farmId, farmId), eq(bankAccounts.id, action.otherAccountId)))
      .limit(1);
    if (!other) throw new Refused("target_not_found");
    const [row] = await tx
      .insert(transfers)
      .values({
        id: randomUUID(),
        farmId,
        fromId: outflow ? line.bankAccountId : other.id,
        toId: outflow ? other.id : line.bankAccountId,
        date: line.date,
        amountBrl: Math.abs(line.amountBrl),
        notes: line.description,
        createdBy: userId,
      })
      .returning();
    return { line: await save({ status: "transfer", transferId: row.id, ...resolvedBy }), transfer: toTransfer(row) };
  }

  const { target } = action;
  if (target.kind === "expense") {
    const where = and(eq(expenses.farmId, farmId), eq(expenses.id, target.id));
    const [expense] = await tx.select().from(expenses).where(where).limit(1).for("update");
    if (!expense) throw new Refused("target_not_found");
    if ((expense.kind === "expense") !== outflow) throw new Refused("wrong_side");
    if (expense.bankAccountId !== null && expense.bankAccountId !== line.bankAccountId) {
      throw new Refused("paid_by_other");
    }
    let updated = expense;
    if (expense.paidAt === null || expense.bankAccountId === null) {
      [updated] = await tx
        .update(expenses)
        .set({ paidAt: expense.paidAt ?? line.date, bankAccountId: line.bankAccountId })
        .where(where)
        .returning();
    }
    const saved = await save({ status: "matched", expenseId: expense.id, ...resolvedBy });
    return { line: saved, expense: toExpense(updated) };
  }

  if (target.kind === "movement") {
    const [session] = await tx
      .select({ kind: manejoSessions.kind, bankAccountId: manejoSessions.bankAccountId })
      .from(manejoSessions)
      .where(
        and(
          eq(manejoSessions.farmId, farmId),
          eq(manejoSessions.id, target.id),
          inArray(manejoSessions.kind, ["sale", "entry"]),
          isNull(manejoSessions.deletedAt)
        )
      )
      .limit(1);
    const [legacy] = session
      ? []
      : await tx
          .select({ type: movements.type, bankAccountId: movements.bankAccountId })
          .from(movements)
          .where(and(eq(movements.farmId, farmId), eq(movements.id, target.id), inArray(movements.type, ["sale", "purchase"])))
          .limit(1);
    if (!session && !legacy) throw new Refused("target_not_found");
    const sale = session ? session.kind === "sale" : legacy.type === "sale";
    if (sale === outflow) throw new Refused("wrong_side");
    const current = session ? session.bankAccountId : legacy.bankAccountId;
    if (current !== null && current !== line.bankAccountId) throw new Refused("paid_by_other");
    if (current === null) {
      if (session) {
        await tx
          .update(manejoSessions)
          .set({ bankAccountId: line.bankAccountId })
          .where(and(eq(manejoSessions.farmId, farmId), eq(manejoSessions.id, target.id)));
      } else {
        await tx
          .update(movements)
          .set({ bankAccountId: line.bankAccountId })
          .where(and(eq(movements.farmId, farmId), eq(movements.id, target.id)));
      }
    }
    const saved = await save({ status: "matched", movementId: target.id, ...resolvedBy });
    return { line: saved, movement: { id: target.id, bankAccountId: line.bankAccountId } };
  }

  const [transfer] = await tx
    .select()
    .from(transfers)
    .where(and(eq(transfers.farmId, farmId), eq(transfers.id, target.id)))
    .limit(1);
  if (!transfer) throw new Refused("target_not_found");
  const ours = outflow ? transfer.fromId : transfer.toId;
  if (ours !== line.bankAccountId) throw new Refused("wrong_side");
  return { line: await save({ status: "transfer", transferId: transfer.id, ...resolvedBy }), transfer: toTransfer(transfer) };
}

export { Refused };
```

In `lib/api/permissions/routeRequirements.ts`, replace:

```ts
  "PATCH /api/herd/transfers/:id": edit("finance"),
  "DELETE /api/herd/transfers/:id": edit("finance"),
  "PATCH /api/herd/movements/:id/bank-account": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

```

with:

```ts
  "PATCH /api/herd/transfers/:id": edit("finance"),
  "DELETE /api/herd/transfers/:id": edit("finance"),
  "PATCH /api/herd/movements/:id/bank-account": edit("finance"),
  // Extratos: reading one is seeing money, every decision on a line writes it.
  "GET /api/herd/imports/:id": { view: "finance" },
  "POST /api/herd/bank-accounts/:id/imports": edit("finance"),
  "POST /api/herd/imports/:id/confirm-high": edit("finance"),
  "POST /api/herd/statement-lines/:id/match": edit("finance"),
  "POST /api/herd/statement-lines/:id/create": edit("finance"),
  "POST /api/herd/statement-lines/:id/transfer": edit("finance"),
  "POST /api/herd/statement-lines/:id/ignore": edit("finance"),
  "POST /api/herd/statement-lines/:id/undo": edit("finance"),

  "PUT /api/herd/farm": edit("farm"),

```

- [ ] **Step 4: Pin the new routes in the two snapshots (explicit paths only).**

Run: `pnpm exec vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**' -u`
Expected: `Snapshots  2 updated`; the table gains the eight routes of this task.

- [ ] **Step 5: Run the tests.**

Run: `pnpm exec vitest run lib/api --exclude '**/worktrees/**'`
Expected: PASS.

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/api`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 6: Commit.**

```bash
git add lib/api/__tests__/routeRequirements.test.ts lib/api/app.ts lib/api/domains/statements/schemas/statement.schema.ts lib/api/domains/statements/statements.controller.ts lib/api/domains/statements/useCases/ConfirmHigh.useCase.ts lib/api/domains/statements/useCases/GetImport.useCase.ts lib/api/domains/statements/useCases/ImportStatement.useCase.ts lib/api/domains/statements/useCases/ResolveLine.useCase.ts lib/api/domains/statements/useCases/__tests__/statements.routes.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/permissions/routeRequirements.ts lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap lib/api/__tests__/__snapshots__/routeTable.test.ts.snap
git commit -m 'feat(finance): import OFX/CSV extratos and conciliate their lines'
```


---

### Task 7: Store — contas, transferências, extratos and line decisions

**Files:**
- Create: `lib/store/__tests__/bankAccounts.test.ts`
- Modify: `lib/store/useHerdStore.ts`

**Interfaces:**
- Consumes: the Eden client typed by Tasks 5–6 (`api["bank-accounts"]`, `api.transfers`, `api.movements({ id })["bank-account"]`, `api.imports`, `api["statement-lines"]`); `ImportResult`, `ImportView`, `LineEntry`, `Resolved`, `MatchTarget` (type-only).
- Produces: the store actions in "Shared interfaces"; `HerdStore.bankAccounts`, `transfers`, `reconciledIds` (required, start `[]`, part of the offline snapshot through `herdDataOf`); `markExpensePaid(id, paidAt, bankAccountId?)` sends the conta with a payment and `null` with an unpayment. Refusals the farmer can act on (`paid_by_other`, `already_paired`, `not_pending`, `wrong_side`, `target_not_found`, `due_before_date`) toast a sentence and resolve `null`.

- [ ] **Step 1: The store test.**

Create `lib/store/__tests__/bankAccounts.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, Expense, StatementLine } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { match, undo, bankPost, expensePatch } = vi.hoisted(() => ({
  match: vi.fn(),
  undo: vi.fn(),
  bankPost: vi.fn(),
  expensePatch: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: {
    "statement-lines": () => ({ match: { post: match }, undo: { post: undo } }),
    "bank-accounts": Object.assign(() => ({}), { post: bankPost }),
    expenses: () => ({ patch: expensePatch }),
  },
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({ ApiHerdRepository: class {} }));
vi.mock("@/lib/store/offlineWiring", () => ({
  getOutbox: vi.fn(),
  getEngine: vi.fn(),
  wireOffline: vi.fn(),
  setSyncUser: vi.fn(),
  getSyncUser: vi.fn(),
}));

import { toast } from "sonner";
import { useHerdStore } from "@/lib/store/useHerdStore";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 3,
};

const BILL: Expense = { id: "e-1", kind: "expense", date: "2026-09-10", category: "labor", amountBrl: 18400 };

const LINE: StatementLine = {
  id: "l-1",
  importId: "imp-1",
  bankAccountId: "sicredi",
  date: "2026-09-10",
  description: "PAGTO FOLHA",
  amountBrl: -18400,
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  useHerdStore.setState({ bankAccounts: [SICREDI], expenses: [BILL], reconciledIds: [], transfers: [] });
});

describe("resolveStatementLine", () => {
  it("merges the lançamento it paid, marks it conciliado and counts one line less", async () => {
    const paid = { ...BILL, paidAt: "2026-09-10", bankAccountId: "sicredi" };
    match.mockResolvedValue({ data: { line: { ...LINE, status: "matched", expenseId: "e-1" }, expense: paid } });
    await useHerdStore.getState().resolveStatementLine(LINE, { type: "match", target: { kind: "expense", id: "e-1" } });
    const s = useHerdStore.getState();
    expect(s.expenses).toEqual([paid]);
    expect(s.reconciledIds).toEqual(["e-1"]);
    expect(s.bankAccounts[0].pendingLines).toBe(2);
  });

  it("undoes: the record leaves conciliado, the lançamento stays paid, the line waits again", async () => {
    useHerdStore.setState({ reconciledIds: ["e-1"] });
    undo.mockResolvedValue({ data: { line: LINE } });
    await useHerdStore.getState().resolveStatementLine({ ...LINE, status: "matched", expenseId: "e-1" }, { type: "undo" });
    const s = useHerdStore.getState();
    expect(s.reconciledIds).toEqual([]);
    expect(s.expenses).toEqual([BILL]);
    expect(s.bankAccounts[0].pendingLines).toBe(4);
  });

  it("explains a lançamento paid by another conta and changes nothing", async () => {
    match.mockResolvedValue({ error: { status: 409, value: { error: "paid_by_other" } } });
    const result = await useHerdStore
      .getState()
      .resolveStatementLine(LINE, { type: "match", target: { kind: "expense", id: "e-1" } });
    expect(result).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Esse lançamento foi pago por outra conta.");
    expect(useHerdStore.getState().bankAccounts[0].pendingLines).toBe(3);
  });
});

describe("contas", () => {
  it("unmarks the old conta principal when a new one is created as principal", async () => {
    bankPost.mockResolvedValue({ data: { ...SICREDI, id: "bb", name: "BB", pendingLines: 0 } });
    await useHerdStore.getState().addBankAccount({ kind: "checking", name: "BB", openingDate: "2026-08-31", isMain: true });
    expect(useHerdStore.getState().bankAccounts.map((a) => [a.id, a.isMain])).toEqual([
      ["sicredi", false],
      ["bb", true],
    ]);
  });

  it("sends the conta with the payment and clears it with the unpayment", async () => {
    expensePatch.mockResolvedValue({ data: BILL });
    await useHerdStore.getState().markExpensePaid("e-1", "2026-09-29", "sicredi");
    await useHerdStore.getState().markExpensePaid("e-1", null, "sicredi");
    expect(expensePatch.mock.calls.map(([body]) => body)).toEqual([
      { paidAt: "2026-09-29", bankAccountId: "sicredi", scope: "one" },
      { paidAt: null, bankAccountId: null, scope: "one" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run lib/store/__tests__/bankAccounts.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `resolveStatementLine` is not a function.

- [ ] **Step 3: The actions.**

In `lib/store/useHerdStore.ts`, replace:

```ts
  AccountGroup,
  Animal,
  Attachment,
  Breeding,
  Calving,
  CustomCategory,
  Expense,
  FarmData,
```

with:

```ts
  AccountGroup,
  Animal,
  Attachment,
  BankAccount,
  BankAccountKind,
  Breeding,
  Calving,
  CsvMapping,
  CustomCategory,
  Expense,
  FarmData,
```

In `lib/store/useHerdStore.ts`, replace:

```ts
  SeriesRepeat,
  SeriesScope,
  Sex,
  Weighing,
  HealthProtocol,
  Treatment,
```

with:

```ts
  SeriesRepeat,
  SeriesScope,
  Sex,
  StatementLine,
  Transfer,
  Weighing,
  HealthProtocol,
  Treatment,
```

In `lib/store/useHerdStore.ts`, replace:

```ts
import type { ImportBirthPayload } from "@/lib/domain/birthImport";
import type { BlockedAnimal } from "@/lib/domain/manejoRevert";
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";
import {
  compareByDate,
  mergeBaixaResult,
```

with:

```ts
import type { ImportBirthPayload } from "@/lib/domain/birthImport";
import type { BlockedAnimal } from "@/lib/domain/manejoRevert";
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";
import type { ImportResult } from "@/lib/api/domains/statements/useCases/ImportStatement.useCase";
import type { ImportView } from "@/lib/api/domains/statements/useCases/GetImport.useCase";
import type { LineEntry, Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import type { MatchTarget } from "@/lib/domain/statements/match";
import {
  compareByDate,
  mergeBaixaResult,
```

In `lib/store/useHerdStore.ts`, replace:

```ts

/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
  [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId"]?:
    | string
    | null;
};

/**
 * Calving to record. The calf joins the herd in the same transaction, taking
 * the dam's breed and lot unless overridden here.
```

with:

```ts

/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
  [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId" | "bankAccountId"]?:
    | string
    | null;
};

/** A new conta ("Nova conta"); a cartão takes the fechamento and vencimento days. */
export interface NewBankAccount {
  kind: BankAccountKind;
  name: string;
  label?: string;
  openingBalanceBrl?: number;
  openingDate: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string;
}

/** Editable fields of a conta; the kind never changes, null clears. */
export type BankAccountPatch = Partial<
  Pick<NewBankAccount, "name" | "openingBalanceBrl" | "openingDate" | "isMain" | "closingDay" | "dueDay">
> & { label?: string | null; paysFromId?: string | null };

/** A decision on a linha do extrato (POST /statement-lines/:id/<type>). */
export type LineDecision =
  | { type: "match"; target: MatchTarget }
  | { type: "create"; entry: LineEntry }
  | { type: "transfer"; otherAccountId: string }
  | { type: "ignore"; reason: string }
  | { type: "undo" };

/**
 * Calving to record. The calf joins the herd in the same transaction, taking
 * the dam's breed and lot unless overridden here.
```

In `lib/store/useHerdStore.ts`, replace:

```ts
}

export interface HerdStore extends HerdData {
  loaded: boolean;
  /** True when the API was unreachable at boot and the store came from the phone's snapshot. */
  offline: boolean;
```

with:

```ts
}

export interface HerdStore extends HerdData {
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  bankAccounts: BankAccount[];
  transfers: Transfer[];
  reconciledIds: string[];
  loaded: boolean;
  /** True when the API was unreachable at boot and the store came from the phone's snapshot. */
  offline: boolean;
```

In `lib/store/useHerdStore.ts`, replace:

```ts
   * re-read.
   */
  updateExpense: (id: string, patch: ExpensePatch, scope?: SeriesScope) => Promise<void>;
  /** Marks a lançamento paid/received on `paidAt`, or pendente again with null. */
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
  /**
```

with:

```ts
   * re-read.
   */
  updateExpense: (id: string, patch: ExpensePatch, scope?: SeriesScope) => Promise<void>;
  /**
   * Marks a lançamento paid/received on `paidAt` from `bankAccountId` ("Pago
   * por"), or pendente again with null (which clears the conta).
   */
  markExpensePaid: (id: string, paidAt: string | null, bankAccountId?: string | null) => Promise<void>;
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
  /**
```

In `lib/store/useHerdStore.ts`, replace:

```ts
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Creates the standard contas the farm lacks; resolves how many were created. */
  seedDefaultAccounts: () => Promise<number>;
  /** Creates a custom category; false when the name is already in use. */
  addCustomCategory: (c: Omit<CustomCategory, "id">) => Promise<boolean>;
  /** Removes a custom category; false when an active animal still uses it. */
```

with:

```ts
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Creates the standard contas the farm lacks; resolves how many were created. */
  seedDefaultAccounts: () => Promise<number>;
  /** "Nova conta"; one marked principal (or the farm's first) takes the place of the current one. */
  addBankAccount: (input: NewBankAccount) => Promise<BankAccount>;
  updateBankAccount: (id: string, patch: BankAccountPatch) => Promise<BankAccount>;
  /** Archives or restores a conta; false when it is the conta principal (409). */
  archiveBankAccount: (id: string, archived: boolean) => Promise<boolean>;
  /** Deletes an unused conta; "in_use" or "is_main" when the server keeps it. */
  removeBankAccount: (id: string) => Promise<"deleted" | "in_use" | "is_main">;
  addTransfer: (input: Omit<Transfer, "id">) => Promise<Transfer>;
  updateTransfer: (id: string, patch: Partial<Omit<Transfer, "id" | "notes">> & { notes?: string | null }) => Promise<Transfer>;
  removeTransfer: (id: string) => Promise<void>;
  /** The Extrato's "Conta" on a venda or compra (its session id, or a legacy movement id). */
  setMovementBankAccount: (id: string, bankAccountId: string | null) => Promise<void>;
  /**
   * Imports an extrato into a conta corrente and re-reads the herd (the conta's
   * pending count). A refusal the dialog shows comes back as `{ error }`:
   * `nothing_new`, `mapping_required` or a parser code.
   */
  importStatement: (
    bankAccountId: string,
    file: { fileName: string; content: string; mapping?: CsvMapping }
  ) => Promise<ImportResult | { error: string }>;
  /** One import with its lines and the records already paired; null when it is not on this farm. */
  loadImport: (importId: string) => Promise<ImportView | null>;
  /**
   * Decides one line and merges what changed (the lançamento paid or created,
   * the venda's conta, the transferência). Null when the server refused with a
   * reason the toast explains (paid by another conta, already decided, …).
   */
  resolveStatementLine: (line: StatementLine, decision: LineDecision) => Promise<Resolved | null>;
  /** "Confirmar as N de confiança alta". */
  confirmHighMatches: (
    importId: string,
    pairs: ({ lineId: string } & MatchTarget)[]
  ) => Promise<{ resolved: Resolved[]; refused: number }>;
  /** Creates a custom category; false when the name is already in use. */
  addCustomCategory: (c: Omit<CustomCategory, "id">) => Promise<boolean>;
  /** Removes a custom category; false when an active animal still uses it. */
```

In `lib/store/useHerdStore.ts`, replace:

```ts
    manejoSessions: s.manejoSessions,
    expenses: s.expenses,
    accounts: s.accounts,
    customCategories: s.customCategories,
    semenBulls: s.semenBulls,
    farm: s.farm,
```

with:

```ts
    manejoSessions: s.manejoSessions,
    expenses: s.expenses,
    accounts: s.accounts,
    bankAccounts: s.bankAccounts,
    transfers: s.transfers,
    reconciledIds: s.reconciledIds,
    customCategories: s.customCategories,
    semenBulls: s.semenBulls,
    farm: s.farm,
```

In `lib/store/useHerdStore.ts`, replace:

```ts
const inactiveAnimalMessage = (earTag: string) =>
  `O animal ${earTag} teve baixa e não passa mais no brete.`;

/** Immutably updates one semen bull's purchases. */
function withPurchases(
  bulls: SemenBull[],
```

with:

```ts
const inactiveAnimalMessage = (earTag: string) =>
  `O animal ${earTag} teve baixa e não passa mais no brete.`;

/** A new conta principal unmarks the one before it. */
function withoutMain(accounts: BankAccount[], saved: BankAccount): BankAccount[] {
  return saved.isMain ? accounts.map((a) => (a.isMain && a.id !== saved.id ? { ...a, isMain: false } : a)) : accounts;
}

/** A write answers the conta without its linhas' figures; the store keeps the ones it has. */
function keepLines(current: BankAccount, saved: BankAccount): BankAccount {
  return {
    ...saved,
    pendingLines: current.pendingLines,
    reconciledUntil: current.reconciledUntil,
    pendingImportId: current.pendingImportId,
  };
}

/** Refusals of a decision on a linha do extrato the farmer can act on. */
const LINE_REFUSALS: Record<string, string> = {
  paid_by_other: "Esse lançamento foi pago por outra conta.",
  already_paired: "Esse lançamento já confere com outra linha do extrato.",
  not_pending: "Essa linha já foi resolvida. Recarregue a página.",
  wrong_side: "Uma entrada só confere com receita, venda ou transferência recebida (e a saída, com o contrário).",
  target_not_found: "Esse lançamento não existe mais. Recarregue a página.",
  due_before_date: "O vencimento não pode ser antes da data",
};

/**
 * Merges decided lines into the store: the lançamento paid or created, the
 * venda's conta, the new transferência, what is conciliado, and the conta's
 * pending count. `unpaired` is the record an undo released.
 */
function mergeResolved(
  s: HerdStore,
  resolved: Resolved[],
  unpaired: string | undefined,
  statusBefore: StatementLine["status"]
): Partial<HerdStore> {
  let expenses = s.expenses;
  let movements = s.movements;
  let manejoSessions = s.manejoSessions;
  let transfers = s.transfers;
  const reconciled = new Set(s.reconciledIds);
  if (unpaired) reconciled.delete(unpaired);
  const pendingDelta = new Map<string, number>();
  for (const r of resolved) {
    if (r.expense) {
      const e = r.expense;
      expenses = expenses.some((x) => x.id === e.id) ? expenses.map((x) => (x.id === e.id ? e : x)) : [...expenses, e];
    }
    if (r.movement) {
      const { id, bankAccountId } = r.movement;
      movements = movements.map((m) => (m.id === id ? { ...m, bankAccountId } : m));
      manejoSessions = manejoSessions.map((m) => (m.id === id ? { ...m, bankAccountId } : m));
    }
    const t = r.transfer;
    if (t && !transfers.some((x) => x.id === t.id)) transfers = [...transfers, t];
    const paired = r.line.expenseId ?? r.line.movementId ?? r.line.transferId;
    if (paired) reconciled.add(paired);
    const delta = Number(r.line.status === "pending") - Number(statusBefore === "pending");
    pendingDelta.set(r.line.bankAccountId, (pendingDelta.get(r.line.bankAccountId) ?? 0) + delta);
  }
  // ponytail: "conciliado até" and the pending import stay as loaded until the next load.
  const bankAccounts = s.bankAccounts.map((a) =>
    pendingDelta.has(a.id) ? { ...a, pendingLines: Math.max(0, a.pendingLines + pendingDelta.get(a.id)!) } : a
  );
  return { expenses, movements, manejoSessions, transfers, bankAccounts, reconciledIds: [...reconciled] };
}

/** Immutably updates one semen bull's purchases. */
function withPurchases(
  bulls: SemenBull[],
```

In `lib/store/useHerdStore.ts`, replace:

```ts
  manejoSessions: [],
  expenses: [],
  accounts: [],
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
```

with:

```ts
  manejoSessions: [],
  expenses: [],
  accounts: [],
  bankAccounts: [],
  transfers: [],
  reconciledIds: [],
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
```

In `lib/store/useHerdStore.ts`, replace:

```ts
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
  },

  markExpensePaid: (id, paidAt) => get().updateExpense(id, { paidAt }),

  removeExpense: async (id, scope = "one") => {
    const { error } = await api.expenses({ id }).delete(undefined, { query: { scope } });
```

with:

```ts
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
  },

  markExpensePaid: (id, paidAt, bankAccountId) =>
    get().updateExpense(id, { paidAt, bankAccountId: paidAt === null ? null : (bankAccountId ?? null) }),

  removeExpense: async (id, scope = "one") => {
    const { error } = await api.expenses({ id }).delete(undefined, { query: { scope } });
```

In `lib/store/useHerdStore.ts`, replace:

```ts
    return created.length;
  },

  addCustomCategory: async (c) => {
    const { data, error } = await api.categories.post(c);
    if (error) {
```

with:

```ts
    return created.length;
  },

  addBankAccount: async (input) => {
    const { data, error } = await api["bank-accounts"].post(input);
    if (error) apiFail("criar a conta", error);
    const account = data as BankAccount;
    set((s) => ({ bankAccounts: [...withoutMain(s.bankAccounts, account), account] }));
    return account;
  },

  updateBankAccount: async (id, patch) => {
    const { data, error } = await api["bank-accounts"]({ id }).patch(patch);
    if (error) apiFail("salvar a conta", error);
    const saved = data as BankAccount;
    set((s) => ({
      bankAccounts: withoutMain(s.bankAccounts, saved).map((a) => (a.id === id ? keepLines(a, saved) : a)),
    }));
    return saved;
  },

  archiveBankAccount: async (id, archived) => {
    const { data, error } = await api["bank-accounts"]({ id }).archive.post({ archived });
    if (error) {
      if (error.status === CONFLICT) {
        toast.error("Marque outra conta como principal antes de arquivar esta.");
        return false;
      }
      apiFail("arquivar a conta", error);
    }
    const saved = data as BankAccount;
    set((s) => ({ bankAccounts: s.bankAccounts.map((a) => (a.id === id ? keepLines(a, saved) : a)) }));
    return true;
  },

  removeBankAccount: async (id) => {
    const { error } = await api["bank-accounts"]({ id }).delete();
    if (error) {
      const code = (error.value as { error?: string } | null)?.error;
      if (error.status === CONFLICT && (code === "in_use" || code === "is_main")) return code;
      apiFail("excluir a conta", error);
    }
    set((s) => ({ bankAccounts: s.bankAccounts.filter((a) => a.id !== id) }));
    return "deleted";
  },

  addTransfer: async (input) => {
    const { data, error } = await api.transfers.post({ ...input, notes: input.notes || undefined });
    if (error) apiFail("registrar a transferência", error);
    const transfer = data as Transfer;
    set((s) => ({ transfers: [...s.transfers, transfer] }));
    return transfer;
  },

  updateTransfer: async (id, patch) => {
    const { data, error } = await api.transfers({ id }).patch(patch);
    if (error) apiFail("salvar a transferência", error);
    const transfer = data as Transfer;
    set((s) => ({ transfers: s.transfers.map((t) => (t.id === id ? transfer : t)) }));
    return transfer;
  },

  removeTransfer: async (id) => {
    const { error } = await api.transfers({ id }).delete();
    if (error) apiFail("remover a transferência", error);
    set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) }));
  },

  setMovementBankAccount: async (id, bankAccountId) => {
    const { error } = await api.movements({ id })["bank-account"].patch({ bankAccountId });
    if (error) apiFail("salvar a conta da venda", error);
    const conta = bankAccountId ?? undefined;
    set((s) => ({
      movements: s.movements.map((m) => (m.id === id ? { ...m, bankAccountId: conta } : m)),
      manejoSessions: s.manejoSessions.map((m) => (m.id === id ? { ...m, bankAccountId: conta } : m)),
    }));
  },

  importStatement: async (bankAccountId, file) => {
    const { data, error } = await api["bank-accounts"]({ id: bankAccountId }).imports.post(file);
    if (error) {
      const code = (error.value as { error?: string } | null)?.error;
      if ((error.status === 400 || error.status === CONFLICT) && code) return { error: code };
      apiFail("importar o extrato", error);
    }
    if (!(await reloadHerd(set))) toast.info("Extrato importado. Recarregue para ver as contas.");
    return data as ImportResult;
  },

  loadImport: async (importId) => {
    const { data, error } = await api.imports({ id: importId }).get();
    if (error) {
      if (error.status === 404) return null;
      apiFail("carregar o extrato", error);
    }
    return data as ImportView;
  },

  resolveStatementLine: async (line, decision) => {
    const lines = api["statement-lines"]({ id: line.id });
    const response =
      decision.type === "match"
        ? await lines.match.post(decision.target)
        : decision.type === "create"
          ? await lines.create.post(decision.entry)
          : decision.type === "transfer"
            ? await lines.transfer.post({ otherAccountId: decision.otherAccountId })
            : decision.type === "ignore"
              ? await lines.ignore.post({ reason: decision.reason })
              : await lines.undo.post();
    if (response.error) {
      const code = (response.error.value as { error?: string } | null)?.error ?? "";
      const message = LINE_REFUSALS[code];
      if (message) {
        toast.error(message);
        return null;
      }
      apiFail("conciliar a linha", response.error);
    }
    const resolved = response.data as Resolved;
    const pairedBefore = line.expenseId ?? line.movementId ?? line.transferId;
    set((s) => mergeResolved(s, [resolved], decision.type === "undo" ? pairedBefore : undefined, line.status));
    return resolved;
  },

  confirmHighMatches: async (importId, pairs) => {
    const { data, error } = await api.imports({ id: importId })["confirm-high"].post({ pairs });
    if (error) apiFail("confirmar as sugestões", error);
    const result = data as { resolved: Resolved[]; refused: number };
    set((s) => mergeResolved(s, result.resolved, undefined, "pending"));
    return result;
  },

  addCustomCategory: async (c) => {
    const { data, error } = await api.categories.post(c);
    if (error) {
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm exec vitest run lib/store --exclude '**/worktrees/**'`
Expected: PASS.

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' lib/store`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 5: Commit.**

```bash
git add lib/store/__tests__/bankAccounts.test.ts lib/store/useHerdStore.ts
git commit -m 'feat(finance): contas bancárias and conciliação in the store'
```


---

### Task 8: Contas bancárias page — cards, movimentação, Nova conta, Transferir

**Files:**
- Create: `app/(app)/finance/contas/page.tsx`, `components/finance/contas/AccountCard.tsx`, `components/finance/contas/AccountMovements.tsx`, `components/finance/contas/BankAccountDialog.tsx`, `components/finance/contas/ContasPage.tsx`, `components/finance/contas/TransferDialog.tsx`
- Modify: `components/finance/FinanceSubnav.tsx`

**Interfaces:**
- Consumes: `accountBalance`, `bankTotal`, `openFatura`, `accountMovements`, `bankAccountLabel`, `BANK_ACCOUNT_KIND_LABEL`, `cents` (Task 2); store actions (Task 7); `PeriodPicker`, `paginate`/`pageWindow`, `SectionCard`, `PageHeader`, `ReadOnlyPill`, `EmptyState`.
- Produces: `/finance/contas`; `FinanceSection` gains `"contas"`; `AccountMovements` takes an optional `action` (Task 10 passes "Importar extrato"); `PHONE_SHEET` (the Dialog as a bottom sheet under md).

UI only: no unit test (the pure rules it shows are Task 2's); Task 11's smoke drives it on desktop and phone.

- [ ] **Step 1: Sub-navigation, the page and its parts.**

Create `app/(app)/finance/contas/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ContasPage } from "@/components/finance/contas/ContasPage";

// The window lives in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function ContasRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <ContasPage />
      </Suspense>
    </RequireAccess>
  );
}
```

In `components/finance/FinanceSubnav.tsx`, replace:

```tsx
import { periodSearch, type Period } from "@/lib/domain/period";
import { cn } from "@/lib/utils";

export type FinanceSection = "painel" | "extrato";

/** The Financeiro pages; later cycles add Contas bancárias, Orçamento, Estoque, Patrimônio. */
const SECTIONS: readonly { key: FinanceSection; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/finance" },
  { key: "extrato", label: "Extrato", href: "/finance/extrato" },
];

/**
```

with:

```tsx
import { periodSearch, type Period } from "@/lib/domain/period";
import { cn } from "@/lib/utils";

export type FinanceSection = "painel" | "extrato" | "contas";

/** The Financeiro pages; later cycles add Orçamento, Estoque, Patrimônio. */
const SECTIONS: readonly { key: FinanceSection; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/finance" },
  { key: "extrato", label: "Extrato", href: "/finance/extrato" },
  { key: "contas", label: "Contas bancárias", href: "/finance/contas" },
];

/**
```

Create `components/finance/contas/AccountCard.tsx`:

```tsx
"use client";

/**
 * One conta on the Contas bancárias page: its name, identificação, the saldo
 * (or the fatura aberta of a cartão) and how its conciliação stands. The
 * card picks the conta whose movimentação shows below.
 */
import Link from "next/link";
import { CalendarDays, CircleCheck, CreditCard, Landmark, Wallet } from "lucide-react";
import type { BankAccount } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

const ICON = { checking: Landmark, cash: Wallet, card: CreditCard } as const;
const DEFAULT_LABEL = { checking: "conta corrente", cash: "dinheiro", card: "crédito" } as const;

const PILL = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

interface AccountCardProps {
  account: BankAccount;
  /** Saldo today, or the open fatura of a cartão (positive = owed). */
  value: number;
  /** Cartão: the due day of the open fatura. */
  due?: string;
  selected: boolean;
  onSelect(): void;
}

export function AccountCard({ account, value, due, selected, onSelect }: AccountCardProps) {
  const Icon = ICON[account.kind];
  const card = account.kind === "card";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border bg-panel px-4 py-3.5",
        selected ? "border-brand shadow-[0_0_0_1px_var(--color-brand)]" : "border-hairline"
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-h-11 flex-col gap-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              selected ? "bg-brand-soft text-brand" : "bg-surface text-ink-soft"
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{account.name}</span>
            <span className="block truncate text-xs text-ink-soft">
              {account.label ?? DEFAULT_LABEL[account.kind]}
            </span>
          </span>
        </span>
        <span>
          <span className="block text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            {card ? "Fatura aberta" : "Saldo"}
          </span>
          <span className="mt-0.5 block font-mono text-xl font-medium whitespace-nowrap text-ink md:text-[22px]">
            {formatCurrency(card ? -value : value)}
          </span>
        </span>
      </button>
      <div className="flex min-h-[22px] flex-wrap items-center gap-2 text-xs text-ink-soft">
        {card ? (
          <>
            <span>fora do saldo</span>
            {due ? (
              <span className={cn(PILL, "bg-scheduled-soft text-scheduled")}>
                <CalendarDays className="size-3" aria-hidden />
                vence {formatDate(due).slice(0, 5)}
              </span>
            ) : null}
          </>
        ) : account.kind === "cash" ? (
          <span>sem extrato</span>
        ) : account.pendingLines > 0 ? (
          <>
            {account.reconciledUntil ? <span>conciliado até {formatDate(account.reconciledUntil).slice(0, 5)}</span> : null}
            {account.pendingImportId ? (
              <Link
                href={`/finance/contas/${account.id}/conciliar/${account.pendingImportId}`}
                className={cn(PILL, "min-h-6 bg-attention-soft text-attention hover:underline")}
              >
                {formatNumber(account.pendingLines)} a conciliar
              </Link>
            ) : (
              <span className={cn(PILL, "bg-attention-soft text-attention")}>
                {formatNumber(account.pendingLines)} a conciliar
              </span>
            )}
          </>
        ) : account.reconciledUntil ? (
          <span className="inline-flex items-center gap-1.5 text-healthy">
            <CircleCheck className="size-3.5" aria-hidden />
            conciliado até {formatDate(account.reconciledUntil).slice(0, 5)}
          </span>
        ) : (
          <span>nenhum extrato importado</span>
        )}
      </div>
    </div>
  );
}
```

Create `components/finance/contas/AccountMovements.tsx`:

```tsx
"use client";

/**
 * "Movimentação · <conta>": the conta's lines in the window, newest first,
 * with the saldo after each one and whether an extrato line confirms it.
 * Ten per page; a table on md+, cards on the phone.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Pencil } from "lucide-react";
import type { BankAccount, Expense } from "@/lib/types";
import { accountMovements, type BankMove } from "@/lib/domain/bankAccounts";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { ELLIPSIS, pageWindow, paginate } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const HEAD = "px-2 py-2.5 text-left text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";

interface AccountMovementsProps {
  account: BankAccount;
  period: Period;
  onPeriodChange(period: Period): void;
  canEdit: boolean;
  onEdit(): void;
  /** Extra header action: "Importar extrato" on a conta corrente. */
  action?: ReactNode;
}

interface Row extends BankMove {
  description: string;
  plan: string | null;
  group: string | null;
}

export function AccountMovements({ account, period, onPeriodChange, canEdit, onEdit, action }: AccountMovementsProps) {
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const reconciledIds = useHerdStore((s) => s.reconciledIds);
  const [pageNumber, setPageNumber] = useState(1);

  const rows = useMemo<Row[]>(() => {
    const nameOf = (id: string) => bankAccounts.find((a) => a.id === id)?.name ?? "outra conta";
    const planOf = (e: Expense) => accountName(e.accountId, accounts);
    return accountMovements(account, { expenses, movements, transfers }, period).map((move) => {
      if (move.expense) {
        const e = move.expense;
        const group = ACCOUNT_GROUP_LABEL[e.kind === "revenue" ? "revenue" : e.category];
        return { ...move, description: e.counterparty ?? e.notes ?? group, plan: planOf(e) ?? group, group: planOf(e) ? group : null };
      }
      if (move.movement) {
        const m = move.movement;
        const sale = m.type === "sale";
        return {
          ...move,
          description: `${sale ? "Venda" : "Compra"} · ${sale ? m.destination : m.origin}`,
          plan: sale ? "Venda de gado" : "Compra de gado",
          group: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
        };
      }
      const t = move.transfer!;
      const other = move.kind === "transferIn" ? `de ${nameOf(t.fromId)}` : `para ${nameOf(t.toId)}`;
      return { ...move, description: t.notes ?? `Transferência ${other}`, plan: "Transferência", group: other };
    });
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts]);

  const reconciled = useMemo(() => new Set(reconciledIds), [reconciledIds]);
  const page = paginate(rows, pageNumber, PAGE_SIZE);
  const checking = account.kind === "checking";
  const pendingCount = checking ? rows.filter((r) => !reconciled.has(r.id)).length : 0;

  const status = (row: Row) =>
    !checking ? (
      <span className="text-xs text-ink-soft">—</span>
    ) : reconciled.has(row.id) ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-healthy">
        <CircleCheck className="size-4" aria-hidden />
        conciliado
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-attention">
        <span aria-hidden className="mx-[3px] size-2.5 rounded-full border-[1.5px] border-current" />a conciliar
      </span>
    );
  const amount = (value: number, sign: "+" | "−") => (
    <span className={cn("font-mono tabular-nums", sign === "+" ? "text-healthy" : "text-ink")}>
      {sign}
      {formatNumber(Math.abs(value), 2)}
    </span>
  );

  return (
    <SectionCard
      title={`Movimentação · ${account.name}${account.label ? ` ${account.label}` : ""}`}
      subtitle="mais recentes primeiro · o saldo acompanha cada linha"
      bodyClassName="p-0"
      action={
        <div className="flex items-center gap-1">
          {action}
          {canEdit ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Editar conta" title="Editar conta" onClick={onEdit}>
              <Pencil aria-hidden />
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
          <span className="text-sm text-ink-soft">Período</span>
          {/* PeriodPicker is inline-flex: full width on a phone. */}
          <div className="[&>div]:flex [&>div]:w-full [&_input]:flex-1 md:[&>div]:inline-flex md:[&>div]:w-auto md:[&_input]:flex-none">
            <PeriodPicker
              value={period}
              onChange={(next) => {
                setPageNumber(1);
                onPeriodChange(next);
              }}
            />
          </div>
        </div>
        {checking ? (
          <p className="text-xs text-ink-soft">
            {formatNumber(pendingCount)} a conciliar · {formatNumber(rows.length - pendingCount)} conciliados
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">Nenhuma movimentação no período.</p>
      ) : (
        <>
          <table className="hidden w-full border-collapse md:table">
            <caption className="sr-only">Movimentação da conta {account.name}</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(HEAD, "w-24 pl-4")}>Data</th>
                <th scope="col" className={HEAD}>Descrição</th>
                <th scope="col" className={cn(HEAD, "w-48")}>Conta do plano</th>
                <th scope="col" className={cn(HEAD, "w-28 text-right")}>Entrada</th>
                <th scope="col" className={cn(HEAD, "w-28 text-right")}>Saída</th>
                <th scope="col" className={cn(HEAD, "w-32 text-right")}>Saldo</th>
                <th scope="col" className={cn(HEAD, "w-32 pr-4")}>Conciliação</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t border-hairline text-sm", checking && !reconciled.has(row.id) && "bg-attention-soft/25")}
                >
                  <td className="px-2 py-2.5 pl-4 font-mono text-xs text-ink">{formatDate(row.date)}</td>
                  <td className="px-2 py-2.5 text-ink">{row.description}</td>
                  <td className="px-2 py-2.5">
                    {row.plan ? (
                      <>
                        <span className="block font-medium text-ink">{row.plan}</span>
                        {row.group ? <span className="block text-xs text-ink-soft">{row.group}</span> : null}
                      </>
                    ) : (
                      <span className="text-[13px] text-ink-soft">sem conta</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {row.amountBrl > 0 ? amount(row.amountBrl, "+") : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {row.amountBrl < 0 ? amount(row.amountBrl, "−") : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono font-medium text-ink tabular-nums">
                    {formatNumber(row.balance, 2)}
                  </td>
                  <td className="px-2 py-2.5 pr-4">{status(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-hairline md:hidden">
            {page.items.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{row.description}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {formatDate(row.date).slice(0, 5)} · {row.plan ?? "sem conta"}
                  </span>
                </span>
                <span className="text-right text-sm">
                  {row.amountBrl > 0 ? amount(row.amountBrl, "+") : amount(row.amountBrl, "−")}
                  <span className="block font-mono text-xs text-ink-soft">{formatCurrency(row.balance)}</span>
                </span>
                <span className="col-span-2">{status(row)}</span>
              </li>
            ))}
          </ul>

          <nav
            aria-label="Paginação da movimentação"
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
                  onClick={() => setPageNumber(page.page - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft aria-hidden />
                </Button>
                {pageWindow(page.page, page.pageCount).map((slot, index) =>
                  slot === ELLIPSIS ? (
                    <span key={`ellipsis-${index}`} aria-hidden className="hidden w-8 text-center sm:inline">
                      …
                    </span>
                  ) : (
                    <Button
                      key={slot}
                      variant={slot === page.page ? "outline" : "ghost"}
                      size="icon"
                      className={cn("hidden font-mono sm:inline-flex", slot === page.page && "pointer-events-none text-ink")}
                      aria-current={slot === page.page ? "page" : undefined}
                      aria-label={`Página ${slot}`}
                      onClick={() => setPageNumber(slot)}
                    >
                      {formatNumber(slot)}
                    </Button>
                  )
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={page.page === page.pageCount}
                  onClick={() => setPageNumber(page.page + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </nav>
        </>
      )}
    </SectionCard>
  );
}
```

Create `components/finance/contas/BankAccountDialog.tsx`:

```tsx
"use client";

/**
 * "Nova conta" / "Editar conta": a conta corrente, the farm's caixa or a
 * cartão. A cartão takes its fechamento and vencimento days and the conta
 * that pays it; the others take a saldo inicial on a date. Editing adds
 * Arquivar and Excluir (only a conta nothing points at).
 */
import { useState, type FormEvent } from "react";
import type { BankAccount, BankAccountKind } from "@/lib/types";
import { BANK_ACCOUNT_KIND_LABEL, bankAccountLabel } from "@/lib/domain/bankAccounts";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const KINDS: readonly BankAccountKind[] = ["checking", "cash", "card"];

/** Select value for "Nenhuma": Radix refuses "". */
const NONE = "none";

interface Fields {
  kind: BankAccountKind;
  name: string;
  label: string;
  opening: string;
  openingDate: string;
  closingDay: string;
  dueDay: string;
  paysFromId: string;
  isMain: boolean;
}

function initialFields(account: BankAccount | undefined, first: boolean): Fields {
  return {
    kind: account?.kind ?? "checking",
    name: account?.name ?? "",
    label: account?.label ?? "",
    opening: account ? String(account.openingBalanceBrl).replace(".", ",") : "",
    openingDate: account?.openingDate ?? todayISO(),
    closingDay: account?.closingDay ? String(account.closingDay) : "",
    dueDay: account?.dueDay ? String(account.dueDay) : "",
    paysFromId: account?.paysFromId ?? NONE,
    isMain: account?.isMain ?? first,
  };
}

/** A day of the month typed in a field, or null. */
function day(text: string): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export function BankAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  account?: BankAccount;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Onde o dinheiro da fazenda fica: conta no banco, caixa em dinheiro ou cartão de crédito.
          </DialogDescription>
        </DialogHeader>
        <BankAccountForm account={account} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BankAccountForm({ account, onDone }: { account?: BankAccount; onDone(): void }) {
  const accounts = useHerdStore((s) => s.bankAccounts);
  const addBankAccount = useHerdStore((s) => s.addBankAccount);
  const updateBankAccount = useHerdStore((s) => s.updateBankAccount);
  const archiveBankAccount = useHerdStore((s) => s.archiveBankAccount);
  const removeBankAccount = useHerdStore((s) => s.removeBankAccount);
  const { addToast } = useToast();
  const first = !accounts.some((a) => a.kind !== "card");
  const [fields, setFields] = useState<Fields>(() => initialFields(account, first));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));

  const card = fields.kind === "card";
  const payers = accounts.filter((a) => a.kind === "checking" && a.archivedAt === undefined && a.id !== account?.id);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fields.name.trim();
    if (name === "") return setError("Informe o nome da conta.");
    const opening = card || fields.opening.trim() === "" ? 0 : parseAmount(fields.opening);
    if (!Number.isFinite(opening)) return setError("Informe o saldo inicial.");
    if (!card && fields.openingDate === "") return setError("Informe a data do saldo inicial.");
    const closingDay = day(fields.closingDay);
    const dueDay = day(fields.dueDay);
    if (card && (closingDay === null || dueDay === null)) {
      return setError("Informe os dias de fechamento e de vencimento (1 a 31).");
    }
    setError(null);
    const common = {
      name,
      openingBalanceBrl: opening,
      openingDate: fields.openingDate || todayISO(),
      ...(card ? { closingDay: closingDay!, dueDay: dueDay! } : {}),
      ...(!card && fields.isMain ? { isMain: true } : {}),
    };
    await run(async () => {
      if (account) {
        await updateBankAccount(account.id, {
          ...common,
          label: fields.label.trim() || null,
          ...(card ? { paysFromId: fields.paysFromId === NONE ? null : fields.paysFromId } : {}),
        });
        addToast({ messageType: "success", text: "Conta salva" });
      } else {
        await addBankAccount({
          kind: fields.kind,
          ...common,
          label: fields.label.trim() || undefined,
          ...(card && fields.paysFromId !== NONE ? { paysFromId: fields.paysFromId } : {}),
        });
        addToast({ messageType: "success", text: `Conta "${name}" criada` });
      }
      onDone();
    });
  }

  async function onArchive() {
    if (!account) return;
    await run(async () => {
      const archived = account.archivedAt === undefined;
      if (await archiveBankAccount(account.id, archived)) {
        addToast({ messageType: "success", text: archived ? "Conta arquivada" : "Conta restaurada" });
        onDone();
      }
    });
  }

  async function onDelete() {
    if (!account) return;
    await run(async () => {
      const result = await removeBankAccount(account.id);
      if (result === "deleted") {
        addToast({ messageType: "success", text: "Conta excluída" });
        onDone();
      } else {
        setError(
          result === "in_use"
            ? "Essa conta já tem lançamentos, transferências ou extratos. Arquive em vez de excluir."
            : "Marque outra conta como principal antes de excluir esta."
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div role="radiogroup" aria-label="Tipo" className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
        {KINDS.map((kind) => {
          const selected = fields.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={account !== undefined && !selected}
              onClick={() => set({ kind, isMain: kind === "card" ? false : fields.isMain || first })}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors disabled:opacity-50 md:min-h-8",
                selected
                  ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              {BANK_ACCOUNT_KIND_LABEL[kind]}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="bank-name">Nome</Label>
          <Input
            id="bank-name"
            value={fields.name}
            placeholder={card ? "Cartão Sicredi" : fields.kind === "cash" ? "Caixa da fazenda" : "Sicredi"}
            onChange={(e) => set({ name: e.target.value })}
            className="min-h-11 md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bank-label">Identificação</Label>
          <Input
            id="bank-label"
            value={fields.label}
            placeholder={card ? "final 4471" : "c/c 12.345-6"}
            onChange={(e) => set({ label: e.target.value })}
            className="min-h-11 md:min-h-0"
          />
        </div>
      </div>

      {card ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bank-closing">Fechamento (dia)</Label>
              <Input
                id="bank-closing"
                inputMode="numeric"
                value={fields.closingDay}
                onChange={(e) => set({ closingDay: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bank-due">Vencimento (dia)</Label>
              <Input
                id="bank-due"
                inputMode="numeric"
                value={fields.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-pays-from">Paga pela conta</Label>
            <Select value={fields.paysFromId} onValueChange={(paysFromId) => set({ paysFromId })}>
              <SelectTrigger id="bank-pays-from" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {payers.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {bankAccountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bank-opening">Saldo inicial (R$)</Label>
              <Input
                id="bank-opening"
                inputMode="decimal"
                placeholder="0,00"
                value={fields.opening}
                onChange={(e) => set({ opening: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bank-opening-date">em</Label>
              <Input
                id="bank-opening-date"
                type="date"
                value={fields.openingDate}
                onChange={(e) => set({ openingDate: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-ink-soft">
            O saldo no fim desse dia. O que foi pago até ele já está no saldo inicial.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
            <input
              type="checkbox"
              checked={fields.isMain}
              disabled={account?.isMain}
              onChange={(e) => set({ isMain: e.target.checked })}
              className="size-4 shrink-0 accent-brand"
            />
            Conta principal
            <span className="text-xs text-ink-soft">· “Pago por” começa nela</span>
          </label>
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-between">
        {account ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={busy} onClick={onArchive}>
              {account.archivedAt === undefined ? "Arquivar" : "Restaurar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-overdue hover:text-overdue md:min-h-9"
              disabled={busy}
              onClick={onDelete}
            >
              Excluir
            </Button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy}>
            {account ? "Salvar" : "Criar conta"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
```

Create `components/finance/contas/ContasPage.tsx`:

```tsx
"use client";

/**
 * /finance/contas: how much money the farm has in each conta today, the
 * fatura aberta of each cartão, and the movimentação of the conta picked.
 * The window (?de&ate) follows the Financeiro sub-navigation.
 */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { accountBalance, bankTotal, openFatura } from "@/lib/domain/bankAccounts";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { periodFromSearch, periodSearch, type Period } from "@/lib/domain/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { AccountCard } from "@/components/finance/contas/AccountCard";
import { AccountMovements } from "@/components/finance/contas/AccountMovements";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function ContasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const setPeriod = (next: Period) => router.replace(`/finance/contas?${periodSearch(next)}`, { scroll: false });

  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | null>(null);

  const inputs = useMemo(() => ({ expenses, movements, transfers }), [expenses, movements, transfers]);
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
  const archived = bankAccounts.filter((a) => a.archivedAt !== undefined);
  const shown = [...active, ...(showArchived ? archived : [])].sort(
    (a, b) => Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card")
  );
  const selected = shown.find((a) => a.id === selectedId) ?? shown[0];
  const total = bankTotal(bankAccounts, inputs, today);
  const holding = active.filter((a) => a.kind !== "card").length;

  const header = (
    <PageHeader
      title="Contas bancárias"
      subtitle={`Saldos de hoje, ${formatDate(today)} · o extrato do banco confere os lançamentos`}
      badges={canEdit ? undefined : <ReadOnlyPill />}
      actions={
        canEdit ? (
          <>
            {active.length > 1 ? (
              <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setDialog("transfer")}>
                <ArrowLeftRight aria-hidden />
                Transferir
              </Button>
            ) : null}
            <Button className="min-h-11 md:min-h-9" onClick={() => setDialog("new")}>
              <Plus aria-hidden />
              Nova conta
            </Button>
          </>
        ) : null
      }
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      {header}
      <FinanceSubnav current="contas" period={period} />

      {bankAccounts.length === 0 ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={Landmark}
            title="Cadastre a primeira conta"
            description="A conta do banco, o caixa em dinheiro e o cartão: o saldo de cada uma aparece aqui e o extrato do banco confere os lançamentos."
            className="pb-4"
          />
          {canEdit ? (
            <Button className="min-h-11 md:min-h-9" onClick={() => setDialog("new")}>
              <Plus aria-hidden />
              Nova conta
            </Button>
          ) : null}
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface px-4 py-3 md:flex-row md:items-end md:justify-between md:border-0 md:bg-transparent md:p-0">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Saldo em contas</p>
                <p className="mt-0.5 font-mono text-[22px] font-medium text-ink md:text-2xl">{formatCurrency(total)}</p>
              </div>
              <p className="text-xs text-ink-soft">
                {formatNumber(holding)} {holding === 1 ? "conta" : "contas"} · a fatura do cartão fica fora do saldo até ser paga
              </p>
            </div>
            <div role="group" aria-label="Contas" className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-4">
              {shown.map((account) => {
                const fatura = account.kind === "card" ? openFatura(account, inputs, today) : null;
                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    value={fatura ? fatura.amountBrl : accountBalance(account, inputs, today)}
                    due={fatura?.due}
                    selected={account.id === selected?.id}
                    onSelect={() => setSelectedId(account.id)}
                  />
                );
              })}
            </div>
            {archived.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="inline-flex min-h-11 items-center self-start text-xs font-medium text-brand hover:underline md:min-h-0"
              >
                {showArchived ? "Esconder arquivadas" : `Ver arquivadas (${archived.length})`}
              </button>
            ) : null}
          </div>

          {selected ? (
            <AccountMovements
              key={selected.id}
              account={selected}
              period={period}
              onPeriodChange={setPeriod}
              canEdit={canEdit}
              onEdit={() => setDialog("edit")}
            />
          ) : null}
        </>
      )}

      {dialog === "new" ? <BankAccountDialog open onOpenChange={() => setDialog(null)} /> : null}
      {dialog === "edit" && selected ? (
        <BankAccountDialog open onOpenChange={() => setDialog(null)} account={selected} />
      ) : null}
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
    </div>
  );
}
```

Create `components/finance/contas/TransferDialog.tsx`:

```tsx
"use client";

/**
 * "Transferir entre contas": money moving from one conta to another — a
 * saque, an aplicação, the payment of a fatura. It never enters the
 * resultado. A sheet from the bottom on the phone.
 */
import { useState, type FormEvent } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { BankAccount } from "@/lib/types";
import { accountBalance, bankAccountLabel, cents, openFatura } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The Dialog pinned to the bottom of the screen on a phone, centred from md up. */
export const PHONE_SHEET =
  "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]";

export function TransferDialog({
  open,
  onOpenChange,
  defaultFromId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultFromId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90dvh] overflow-y-auto sm:max-w-md ${PHONE_SHEET}`}>
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>Não entra no resultado: é dinheiro mudando de lugar.</DialogDescription>
        </DialogHeader>
        <TransferForm defaultFromId={defaultFromId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({ defaultFromId, onDone }: { defaultFromId?: string; onDone(): void }) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const addTransfer = useHerdStore((s) => s.addTransfer);
  const { addToast } = useToast();
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
  const firstFrom = active.find((a) => a.id === defaultFromId) ?? active.find((a) => a.isMain) ?? active[0];
  const [fromId, setFromId] = useState(firstFrom?.id ?? "");
  const [toId, setToId] = useState(active.find((a) => a.id !== firstFrom?.id)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const value = parseAmount(amount);
  const from = active.find((a) => a.id === fromId);
  const to = active.find((a) => a.id === toId);
  const inputs = { expenses, movements, transfers };
  const ready = from !== undefined && to !== undefined && Number.isFinite(value) && value > 0 && date !== "";
  const preview = !ready
    ? null
    : to.kind === "card"
      ? `A fatura baixa para ${formatCurrency(cents(openFatura(to, inputs, date).amountBrl - value))}.`
      : `${from.name} fica com ${formatCurrency(cents(accountBalance(from, inputs, date) - value))} · o saldo em contas não muda.`;

  const option = (a: BankAccount) => (
    <SelectItem key={a.id} value={a.id}>
      {bankAccountLabel(a)}
    </SelectItem>
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) return setError("Escolha as duas contas.");
    if (from.id === to.id) return setError("Escolha contas diferentes.");
    if (!Number.isFinite(value) || value <= 0) return setError("Informe o valor (maior que zero).");
    if (date === "") return setError("Informe a data.");
    setError(null);
    setBusy(true);
    try {
      await addTransfer({ fromId: from.id, toId: to.id, date, amountBrl: value, notes: notes.trim() || undefined });
      addToast({ messageType: "success", text: "Transferência registrada" });
      onDone();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-from">De</Label>
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger id="transfer-from" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>{active.map(option)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-to">Para</Label>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger id="transfer-to" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>{active.filter((a) => a.id !== fromId).map(option)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-amount">Valor (R$)</Label>
          <Input
            id="transfer-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-date">Data</Label>
          <Input
            id="transfer-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 font-mono"
          />
        </div>
      </div>
      {preview ? <p className="-mt-1 text-xs text-ink-soft">{preview}</p> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-notes">Observação (opcional)</Label>
        <Input id="transfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-11" />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}
      <DialogFooter className="max-md:flex-col-reverse max-md:gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11 max-md:w-full md:min-h-9" disabled={busy}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11 max-md:w-full md:min-h-9" disabled={busy}>
          <ArrowLeftRight aria-hidden />
          {Number.isFinite(value) && value > 0 ? `Transferir ${formatCurrency(value)}` : "Transferir"}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 2: Check.**

Run: `pnpm exec vitest run lib components --exclude '**/worktrees/**'`
Expected: PASS (nothing here has a test; the suite stays green).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' components/finance "app/(app)/finance"`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 3: Commit.**

```bash
git add 'app/(app)/finance/contas/page.tsx' components/finance/FinanceSubnav.tsx components/finance/contas/AccountCard.tsx components/finance/contas/AccountMovements.tsx components/finance/contas/BankAccountDialog.tsx components/finance/contas/ContasPage.tsx components/finance/contas/TransferDialog.tsx
git commit -m 'feat(finance): Contas bancárias page with saldos, fatura and movimentação'
```


---

### Task 9: "Pago por" — EntryDialog, mark-paid, and the Extrato's Conta

**Files:**
- Create: `components/finance/contas/MovementAccountDialog.tsx`, `components/finance/contas/PaidByField.tsx`, `components/finance/contas/useMarkPaid.tsx`
- Modify: `components/finance/BillsCard.tsx`, `components/finance/EntryDialog.tsx`, `components/finance/extrato/ExtratoTable.tsx`, `components/finance/extrato/RowActions.tsx`, `lib/domain/__tests__/ledger.test.ts`, `lib/domain/ledger.ts`, `lib/export/__tests__/finance.test.ts`

**Interfaces:**
- Consumes: `payingAccounts`, `bankAccountLabel` (Task 2); `markExpensePaid(id, paidAt, bankAccountId)`, `setMovementBankAccount` (Task 7).
- Produces: `LedgerRow.bankAccountId: string | null`; `PaidByField({ id, accounts, kind, value, onChange })`, `defaultPaidBy(accounts, kind)`; `useMarkPaid(onDone?) → { request(expense), dialog }` (marks at once with one conta or none, asks "Pago por" and the day with two or more, toasts either way); `MovementAccountDialog({ row, onOpenChange, onDone? })`. `BillsCard` and `RowActions` mark through `useMarkPaid`.

- [ ] **Step 1: Tests first: the ledger row carries its conta (two existing fixtures only gain `bankAccountId: null`).**

In `lib/domain/__tests__/ledger.test.ts`, replace:

```ts
      group: "nutrition",
      groupLabel: "Nutrição",
      account: "Sal mineral",
      counterparty: "Agrovét Casa do Campo",
      document: "NF 4.812",
      lotId: "lot-1",
```

with:

```ts
      group: "nutrition",
      groupLabel: "Nutrição",
      account: "Sal mineral",
      bankAccountId: null,
      counterparty: "Agrovét Casa do Campo",
      document: "NF 4.812",
      lotId: "lot-1",
```

In `lib/domain/__tests__/ledger.test.ts`, replace:

```ts
    expect(row("e-paid")).toMatchObject({ account: null, notes: "Salário de agosto" });
  });

  it("builds a venda from its manejo session", () => {
    expect(row("s-sale")).toEqual({
      id: "s-sale",
```

with:

```ts
    expect(row("e-paid")).toMatchObject({ account: null, notes: "Salário de agosto" });
  });

  it("carries the conta bancária of a paid lançamento and of a venda", () => {
    const rows = ledgerRows(
      {
        ...input,
        expenses: [{ ...expenses[0], bankAccountId: "sicredi" }],
        movements: [{ id: "legacy-sale", type: "sale", date: "2026-09-12", origin: "A", destination: "B", amountBrl: 10, bankAccountId: "bb" }],
      },
      PERIOD,
      TODAY
    );
    expect(rows.find((r) => r.id === "e-paid-lot")?.bankAccountId).toBe("sicredi");
    expect(rows.find((r) => r.id === "legacy-sale")?.bankAccountId).toBe("bb");
  });

  it("builds a venda from its manejo session", () => {
    expect(row("s-sale")).toEqual({
      id: "s-sale",
```

In `lib/domain/__tests__/ledger.test.ts`, replace:

```ts
      group: "revenue",
      groupLabel: "Receitas",
      account: null,
      counterparty: "Frigorífico Boi Bom",
      document: "manejo · 2 animais · 32,9 @",
      lotId: "lot-1",
```

with:

```ts
      group: "revenue",
      groupLabel: "Receitas",
      account: null,
      bankAccountId: null,
      counterparty: "Frigorífico Boi Bom",
      document: "manejo · 2 animais · 32,9 @",
      lotId: "lot-1",
```

In `lib/domain/__tests__/ledger.test.ts`, replace:

```ts
      group: "health",
      groupLabel: "Sanidade",
      account: null,
      counterparty: null,
      document: null,
      lotId: null,
```

with:

```ts
      group: "health",
      groupLabel: "Sanidade",
      account: null,
      bankAccountId: null,
      counterparty: null,
      document: null,
      lotId: null,
```

In `lib/export/__tests__/finance.test.ts`, replace:

```ts
  group: "health",
  groupLabel: "Sanidade",
  account: "Vacinas",
  counterparty: "Agrovet Uberaba",
  document: "NF 4.812",
  lotId: "lot1",
```

with:

```ts
  group: "health",
  groupLabel: "Sanidade",
  account: "Vacinas",
  bankAccountId: null,
  counterparty: "Agrovet Uberaba",
  document: "NF 4.812",
  lotId: "lot1",
```

- [ ] **Step 2: Run them to see them fail.**

Run: `pnpm exec vitest run lib/domain/__tests__/ledger.test.ts lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — rows have no `bankAccountId`.

- [ ] **Step 3: Ledger, the field, the hook, the dialogs, the Extrato.**

In `components/finance/BillsCard.tsx`, replace:

```tsx
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { LancarButton } from "@/components/finance/LancarButton";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
```

with:

```tsx
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { LancarButton } from "@/components/finance/LancarButton";
import { useMarkPaid } from "@/components/finance/contas/useMarkPaid";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
```

In `components/finance/BillsCard.tsx`, replace:

```tsx
export function BillsCard({ payables, receivables, canEdit }: BillsCardProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const lots = useHerdStore((s) => s.lots);
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("payables");
  // Ids being marked; their checkbox stays disabled so a double tap can't fire twice.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
```

with:

```tsx
export function BillsCard({ payables, receivables, canEdit }: BillsCardProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const lots = useHerdStore((s) => s.lots);
  const markPaid = useMarkPaid();
  const [tab, setTab] = useState<Tab>("payables");
  // Ids being marked; their checkbox stays disabled so a double tap can't fire twice.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
```

In `components/finance/BillsCard.tsx`, replace:

```tsx
    if (pending.has(entry.id)) return;
    setPending((ids) => new Set(ids).add(entry.id));
    try {
      await markExpensePaid(entry.id, todayISO());
      addToast({ messageType: "success", text: `Marcado como ${verb}` });
    } catch {
      // apiFail has shown the error toast.
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
```

with:

```tsx
    if (pending.has(entry.id)) return;
    setPending((ids) => new Set(ids).add(entry.id));
    try {
      // With two or more contas it opens "Pago por"; the hook marks and toasts.
      await markPaid.request(entry);
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
```

In `components/finance/BillsCard.tsx`, replace:

```tsx
          </div>
        </>
      )}
    </SectionCard>
  );
}
```

with:

```tsx
          </div>
        </>
      )}
      {markPaid.dialog}
    </SectionCard>
  );
}
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento, conta,
 * pago para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
```

with:

```tsx
"use client";

/**
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento and
 * the conta bancária it was paid by ("Pago por"), conta do plano, pago para,
 * documento, lote (centro de custo), Repetir (uma vez, parcelado, recorrente)
 * and anexos. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, EntryKind, Expense, ExpenseCategory, SeriesScope } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```

with:

```tsx
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, BankAccount, EntryKind, Expense, ExpenseCategory, SeriesScope } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
```

with:

```tsx
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
import { PaidByField, defaultPaidBy } from "@/components/finance/contas/PaidByField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
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
```

with:

```tsx
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

function initialFields(
  expense: Expense | undefined,
  defaultKind: EntryKind,
  bankAccounts: BankAccount[]
): EntryFields {
  const today = todayISO();
  if (!expense) {
    return {
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
      dueTouched: false,
      paid: true,
      paidAt: today,
      counterparty: "",
      document: "",
      lotId: NONE,
```

with:

```tsx
      dueTouched: false,
      paid: true,
      paidAt: today,
      bankAccountId: defaultPaidBy(bankAccounts, defaultKind),
      counterparty: "",
      document: "",
      lotId: NONE,
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
    dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
    paid: expense.paidAt !== undefined,
    paidAt: expense.paidAt ?? today,
    counterparty: expense.counterparty ?? "",
    document: expense.document ?? "",
    lotId: expense.lotId ?? NONE,
```

with:

```tsx
    dueTouched: expense.dueDate !== undefined && expense.dueDate !== expense.date,
    paid: expense.paidAt !== undefined,
    paidAt: expense.paidAt ?? today,
    bankAccountId: expense.bankAccountId ?? defaultPaidBy(bankAccounts, expense.kind),
    counterparty: expense.counterparty ?? "",
    document: expense.document ?? "",
    lotId: expense.lotId ?? NONE,
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
  onDone(): void;
}) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
```

with:

```tsx
  onDone(): void;
}) {
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
```

with:

```tsx
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind, bankAccounts));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

```

with:

```tsx
    const counterparty = fields.counterparty.trim() || null;
    const docNumber = fields.document.trim() || null;
    const accountId = fields.accountId === NONE ? null : fields.accountId;
    const bankAccountId = fields.paid && fields.bankAccountId !== "" ? fields.bankAccountId : null;
    const lotId = fields.lotId === NONE ? null : fields.lotId;
    const notes = fields.notes.trim() || null;

```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
        counterparty,
        document: docNumber,
        accountId,
        lotId,
        notes,
      };
```

with:

```tsx
        counterparty,
        document: docNumber,
        accountId,
        bankAccountId,
        lotId,
        notes,
      };
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
          counterparty: counterparty ?? undefined,
          document: docNumber ?? undefined,
          accountId: accountId ?? undefined,
          lotId: lotId ?? undefined,
          notes: notes ?? undefined,
        },
```

with:

```tsx
          counterparty: counterparty ?? undefined,
          document: docNumber ?? undefined,
          accountId: accountId ?? undefined,
          bankAccountId: bankAccountId ?? undefined,
          lotId: lotId ?? undefined,
          notes: notes ?? undefined,
        },
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  set({ kind, accountId: NONE });
                  setNewAccountName(null);
                }}
                className={cn(
```

with:

```tsx
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  // A receita never goes into a cartão.
                  const card = bankAccounts.find((a) => a.id === fields.bankAccountId)?.kind === "card";
                  set({
                    kind,
                    accountId: NONE,
                    ...(kind === "revenue" && card ? { bankAccountId: defaultPaidBy(bankAccounts, kind) } : {}),
                  });
                  setNewAccountName(null);
                }}
                className={cn(
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta</Label>
          {newAccountName === null ? (
            <>
              <Select value={fields.accountId} onValueChange={(accountId) => set({ accountId })}>
```

with:

```tsx
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta do plano</Label>
          {newAccountName === null ? (
            <>
              <Select value={fields.accountId} onValueChange={(accountId) => set({ accountId })}>
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
            </p>
          ) : null}
        </div>
      </div>

      {expense ? (
```

with:

```tsx
            </p>
          ) : null}
        </div>
        {fields.paid ? (
          <div className="sm:col-start-2">
            <PaidByField
              id="entry-paid-by"
              accounts={bankAccounts}
              kind={fields.kind}
              value={fields.bankAccountId}
              onChange={(bankAccountId) => set({ bankAccountId })}
            />
          </div>
        ) : null}
      </div>

      {expense ? (
```

Create `components/finance/contas/MovementAccountDialog.tsx`:

```tsx
"use client";

/**
 * The Extrato's "Conta" on a venda or compra: which conta its money went
 * through. A manejo registers it on the conta principal; this changes it.
 */
import { useState } from "react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Select value for "Sem conta": Radix refuses "". */
const NONE = "none";

export function MovementAccountDialog({
  row,
  onOpenChange,
  onDone,
}: {
  row: LedgerRow;
  onOpenChange(open: boolean): void;
  onDone?: () => void;
}) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const setMovementBankAccount = useHerdStore((s) => s.setMovementBankAccount);
  const { addToast } = useToast();
  const [value, setValue] = useState(row.bankAccountId ?? NONE);
  const [busy, setBusy] = useState(false);
  const options = payingAccounts(bankAccounts, "revenue");
  const current = bankAccounts.find((a) => a.id === row.bankAccountId);
  const shown = current && !options.includes(current) ? [...options, current] : options;
  const sale = row.kind === "sale";

  async function save() {
    setBusy(true);
    try {
      await setMovementBankAccount(row.id, value === NONE ? null : value);
      addToast({ messageType: "success", text: "Conta salva" });
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{sale ? "Conta da venda" : "Conta da compra"}</DialogTitle>
          <DialogDescription>
            {sale ? "Em que conta o dinheiro da venda entrou?" : "De que conta saiu o dinheiro da compra?"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="movement-account">Conta</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="movement-account" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem conta</SelectItem>
              {shown.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {bankAccountLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" className="min-h-11 md:min-h-9" disabled={busy} onClick={() => void save()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Create `components/finance/contas/PaidByField.tsx`:

```tsx
"use client";

/**
 * "Pago por" / "Recebido em": the conta a lançamento was paid from or received
 * into. Offers the contas that are not archived, the conta principal first,
 * cartões for despesas only. Renders nothing while the farm has no conta.
 */
import type { BankAccount, EntryKind } from "@/lib/types";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The conta "Pago por" starts on: the conta principal, else the first one offered; "" with none. */
export function defaultPaidBy(accounts: BankAccount[], kind: EntryKind): string {
  return payingAccounts(accounts, kind)[0]?.id ?? "";
}

export function PaidByField({
  id,
  accounts,
  kind,
  value,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  value: string;
  onChange(value: string): void;
}) {
  const options = payingAccounts(accounts, kind);
  // A row paid by a conta archived since keeps showing it.
  const current = accounts.find((a) => a.id === value);
  const shown = current && !options.includes(current) ? [...options, current] : options;
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{kind === "revenue" ? "Recebido em" : "Pago por"}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
        <SelectContent>
          {shown.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {bankAccountLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

Create `components/finance/contas/useMarkPaid.tsx`:

```tsx
"use client";

/**
 * "Marcar como pago / recebido" with the conta. With one conta (or none) the
 * lançamento is marked at once from it; with two or more, a small dialog asks
 * "Pago por" and the day first. The hook toasts either way.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import type { Expense } from "@/lib/types";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
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
    addToast({ messageType: "success", text: expense.kind === "revenue" ? "Marcado como recebido" : "Marcado como pago" });
    onDone?.();
  };

  const request = async (expense: Expense) => {
    const options = payingAccounts(bankAccounts, expense.kind);
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
  const revenue = expense.kind === "revenue";
  const [paidAt, setPaidAt] = useState(todayISO());
  const [bankAccountId, setBankAccountId] = useState(() => defaultPaidBy(bankAccounts, expense.kind));
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
          <DialogTitle>{revenue ? "Marcar como recebido" : "Marcar como pago"}</DialogTitle>
          <DialogDescription>{revenue ? "Em que conta o dinheiro entrou?" : "De que conta o dinheiro saiu?"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <PaidByField
            id="mark-paid-account"
            accounts={bankAccounts}
            kind={expense.kind}
            value={bankAccountId}
            onChange={setBankAccountId}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="mark-paid-date">{revenue ? "Recebido em" : "Pago em"}</Label>
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
              {revenue ? "Marcar recebido" : "Marcar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

In `components/finance/extrato/ExtratoTable.tsx`, replace:

```tsx
import type { LedgerKind, LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { ELLIPSIS, pageWindow, type Page } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
```

with:

```tsx
import type { LedgerKind, LedgerRow, LedgerStatus } from "@/lib/domain/ledger";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ELLIPSIS, pageWindow, type Page } from "@/components/herd/pagination";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
```

In `components/finance/extrato/ExtratoTable.tsx`, replace:

```tsx
}

export function ExtratoTable({ page, onPageChange }: ExtratoTableProps) {
  return (
    <SectionCard
      title="Lançamentos"
```

with:

```tsx
}

export function ExtratoTable({ page, onPageChange }: ExtratoTableProps) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const bankName = (id: string | null) => (id === null ? null : (bankAccounts.find((a) => a.id === id)?.name ?? null));
  return (
    <SectionCard
      title="Lançamentos"
```

In `components/finance/extrato/ExtratoTable.tsx`, replace:

```tsx
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
```

with:

```tsx
            <TableHead className={cn(HEAD, "pl-4")}>Data</TableHead>
            <TableHead className={HEAD}>Vencimento</TableHead>
            <TableHead className={HEAD}>Tipo</TableHead>
            <TableHead className={cn(HEAD, "whitespace-normal")}>Grupo › Conta do plano</TableHead>
            <TableHead className={cn(HEAD, "whitespace-normal")}>Pago para / Recebido de</TableHead>
            <TableHead className={HEAD}>Documento</TableHead>
            <TableHead className={HEAD}>Lote</TableHead>
            <TableHead className={HEAD}>Conta</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Valor</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={cn(HEAD, "pr-4 text-right")}>Ações</TableHead>
```

In `components/finance/extrato/ExtratoTable.tsx`, replace:

```tsx
                  <span className="text-xs text-ink-soft">fazenda</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <LedgerAmount row={row} />
              </TableCell>
```

with:

```tsx
                  <span className="text-xs text-ink-soft">fazenda</span>
                )}
              </TableCell>
              <TableCell className="max-w-32 whitespace-normal">
                {bankName(row.bankAccountId) ?? <span className="text-xs text-ink-soft">—</span>}
              </TableCell>
              <TableCell className="text-right">
                <LedgerAmount row={row} />
              </TableCell>
```

In `components/finance/extrato/RowActions.tsx`, replace:

```tsx
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
```

with:

```tsx
/**
 * What a row of the Extrato lets you do. A lançamento: Ver anexos when it has
 * any (Financeiro at view is enough), Editar (the EntryDialog filled in),
 * Marcar como pago / recebido while pending (asking "Pago por" when the farm
 * has two or more contas), and Remover after a confirmation — for a row of a
 * série, the choice of "Só esta", "Esta e as próximas" or "Todas". A row the
 * manejos wrote is locked and says so; a venda or compra still takes its
 * "Conta". Editing needs Financeiro at edit.
 */
import { useState } from "react";
import { CheckCircle2, Landmark, Lock, Paperclip, Pencil, Trash2 } from "lucide-react";
import type { SeriesScope } from "@/lib/types";
import type { LedgerRow } from "@/lib/domain/ledger";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsDialog } from "@/components/finance/attachments/AttachmentsDialog";
import { MovementAccountDialog } from "@/components/finance/contas/MovementAccountDialog";
import { useMarkPaid } from "@/components/finance/contas/useMarkPaid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
```

In `components/finance/extrato/RowActions.tsx`, replace:

```tsx

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
```

with:

```tsx

export function RowActions({ row, labeled = false, onDone }: RowActionsProps) {
  const canEdit = useCan("finance", "edit");
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const markPaid = useMarkPaid(onDone);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [choosingAccount, setChoosingAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  if (row.locked) {
    // A venda or compra keeps its value locked but takes the conta its money went through.
    const takesAccount = canEdit && (row.kind === "sale" || row.kind === "purchase") && bankAccounts.length > 0;
    const accountButton = takesAccount ? (
      <Button
        type="button"
        variant={labeled ? "outline" : "ghost"}
        size={labeled ? "default" : "icon-sm"}
        className={labeled ? "min-h-11 w-full justify-start" : "text-ink-soft hover:text-ink"}
        aria-label={labeled ? undefined : "Conta"}
        title={labeled ? undefined : "Conta"}
        onClick={() => setChoosingAccount(true)}
      >
        <Landmark aria-hidden />
        {labeled ? "Conta" : null}
      </Button>
    ) : null;
    const accountDialog = choosingAccount ? (
      <MovementAccountDialog row={row} onOpenChange={setChoosingAccount} onDone={onDone} />
    ) : null;
    return labeled ? (
      <div className="flex flex-col gap-2">
        {accountButton}
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Lock className="size-4 shrink-0" aria-hidden />
          {LOCKED_HINT}.
        </p>
        {accountDialog}
      </div>
    ) : (
      <span className="inline-flex items-center justify-end gap-1">
        {accountButton}
        <span
          title={LOCKED_HINT}
          className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-soft"
        >
          <Lock className="size-3.5" aria-hidden />
          do manejo
        </span>
        {accountDialog}
      </span>
    );
  }
```

In `components/finance/extrato/RowActions.tsx`, replace:

```tsx
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
```

with:

```tsx
  const pending = row.paidAt === null;
  const markLabel = revenue ? "Marcar como recebido" : "Marcar como pago";

  const onMarkPaid = async () => {
    setBusy(true);
    try {
      // With two or more contas it opens "Pago por"; the hook marks, toasts and calls onDone.
      await markPaid.request(expense);
    } finally {
      setBusy(false);
    }
```

In `components/finance/extrato/RowActions.tsx`, replace:

```tsx
                aria-label={labeled ? undefined : markLabel}
                title={labeled ? undefined : markLabel}
                disabled={busy}
                onClick={markPaid}
              >
                <CheckCircle2 aria-hidden />
                {labeled ? markLabel : null}
```

with:

```tsx
                aria-label={labeled ? undefined : markLabel}
                title={labeled ? undefined : markLabel}
                disabled={busy}
                onClick={onMarkPaid}
              >
                <CheckCircle2 aria-hidden />
                {labeled ? markLabel : null}
```

In `components/finance/extrato/RowActions.tsx`, replace:

```tsx
      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}
      {viewing ? <AttachmentsDialog expense={expense} onOpenChange={setViewing} /> : null}

      {expense.seriesId && confirming ? (
        <SeriesScopeDialog
```

with:

```tsx
      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}
      {viewing ? <AttachmentsDialog expense={expense} onOpenChange={setViewing} /> : null}
      {markPaid.dialog}

      {expense.seriesId && confirming ? (
        <SeriesScopeDialog
```

In `lib/domain/ledger.ts`, replace:

```ts
  group: AccountGroup | "capital";
  groupLabel: string;
  account: string | null;
  counterparty: string | null;
  document: string | null;
  lotId: string | null;
```

with:

```ts
  group: AccountGroup | "capital";
  groupLabel: string;
  account: string | null;
  /** The conta bancária it went through ("Pago por", or a venda's conta); null for none. */
  bankAccountId: string | null;
  counterparty: string | null;
  document: string | null;
  lotId: string | null;
```

In `lib/domain/ledger.ts`, replace:

```ts
      group,
      groupLabel: ACCOUNT_GROUP_LABEL[group],
      account: accountName(e.accountId, input.accounts),
      counterparty: e.counterparty ?? null,
      document: e.document ?? null,
      lotId,
```

with:

```ts
      group,
      groupLabel: ACCOUNT_GROUP_LABEL[group],
      account: accountName(e.accountId, input.accounts),
      bankAccountId: e.bankAccountId ?? null,
      counterparty: e.counterparty ?? null,
      document: e.document ?? null,
      lotId,
```

In `lib/domain/ledger.ts`, replace:

```ts
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
      account: null,
      counterparty: session
        ? session.counterparty?.trim() || null
        : sale
```

with:

```ts
      group: sale ? "revenue" : "capital",
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : "Capital",
      account: null,
      bankAccountId: m.bankAccountId ?? null,
      counterparty: session
        ? session.counterparty?.trim() || null
        : sale
```

In `lib/domain/ledger.ts`, replace:

```ts
      group: "health",
      groupLabel: ACCOUNT_GROUP_LABEL.health,
      account: null,
      counterparty: null,
      document: null,
      lotId: null,
```

with:

```ts
      group: "health",
      groupLabel: ACCOUNT_GROUP_LABEL.health,
      account: null,
      bankAccountId: null,
      counterparty: null,
      document: null,
      lotId: null,
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm exec vitest run lib/domain/__tests__/ledger.test.ts lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: PASS.

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' components/finance lib/domain lib/export`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 5: Commit.**

```bash
git add components/finance/BillsCard.tsx components/finance/EntryDialog.tsx components/finance/contas/MovementAccountDialog.tsx components/finance/contas/PaidByField.tsx components/finance/contas/useMarkPaid.tsx components/finance/extrato/ExtratoTable.tsx components/finance/extrato/RowActions.tsx lib/domain/__tests__/ledger.test.ts lib/domain/ledger.ts lib/export/__tests__/finance.test.ts
git commit -m 'feat(finance): "Pago por" on every payment and the conta in the Extrato'
```


---

### Task 10: Importar extrato and the Conciliar page

**Files:**
- Create: `app/(app)/finance/contas/[id]/conciliar/[importId]/page.tsx`, `components/finance/contas/ConciliarPage.tsx`, `components/finance/contas/ImportDialog.tsx`, `components/finance/contas/LineDialogs.tsx`
- Modify: `components/finance/EntryDialog.tsx`, `components/finance/contas/ContasPage.tsx`, `components/finance/contas/PaidByField.tsx`

**Interfaces:**
- Consumes: parsers and `guessCsvMapping`, `decodeBankFile`, `statementFormat`, `statementErrorMessage` (Task 3); `candidatesFor`, `suggestMatches`, `candidatesByValue`, `suggestionReason`, `MATCH_WINDOW_DAYS` (Task 4); `importStatement`, `loadImport`, `resolveStatementLine`, `confirmHighMatches` (Task 7); `AccountMovements`'s `action` and `ContasPage` (Task 8); `EntryDialog`, `PaidByField` (Task 9).
- Produces: `/finance/contas/[id]/conciliar/[importId]`; `ImportDialog`; `ConciliarPage`; `OtherMatchDialog`, `TransferLineDialog`, `IgnoreLineDialog`, `IGNORE_REASONS`; `EntryDialog({ fromLine?, onResolved? })` — the line fixes the kind, the value and the payment, "Repetir" hides, the button says "Salvar e conciliar"; `PaidByField` gains `disabled?`.

UI only: the rules are Tasks 3, 4 and 6's; Task 11's smoke imports an OFX and decides every kind of line.

- [ ] **Step 1: The dialogs, the page, the route and the wiring.**

Create `app/(app)/finance/contas/[id]/conciliar/[importId]/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ConciliarPage } from "@/components/finance/contas/ConciliarPage";

export default function ConciliarRoute() {
  const params = useParams<{ id: string; importId: string }>();
  return (
    <RequireAccess area="finance" level="view">
      <ConciliarPage key={params.importId} accountId={params.id} importId={params.importId} />
    </RequireAccess>
  );
}
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento and
 * the conta bancária it was paid by ("Pago por"), conta do plano, pago para,
 * documento, lote (centro de custo), Repetir (uma vez, parcelado, recorrente)
 * and anexos. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
```

with:

```tsx
 * "Novo lançamento": a despesa or a receita with vencimento, pagamento and
 * the conta bancária it was paid by ("Pago por"), conta do plano, pago para,
 * documento, lote (centro de custo), Repetir (uma vez, parcelado, recorrente)
 * and anexos. With `fromLine` it is "Criar lançamento" of the conciliação: the
 * linha do extrato fixes the kind, the value and the payment (on its date, by
 * its conta) and the lançamento is saved paired with it. With `expense` it edits that lançamento: the
 * Despesa | Receita switch and Repetir are hidden, a row of a série says which
 * ("Parcela 2/3", "Recorrente · todo dia 20") and saving asks where the change
 * applies. Vendas and compras de gado come from the manejos, never from here.
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { AccountGroup, BankAccount, EntryKind, Expense, ExpenseCategory, SeriesScope } from "@/lib/types";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```

with:

```tsx
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type {
  AccountGroup,
  BankAccount,
  EntryKind,
  Expense,
  ExpenseCategory,
  SeriesScope,
  StatementLine,
} from "@/lib/types";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { todayISO } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
function initialFields(
  expense: Expense | undefined,
  defaultKind: EntryKind,
  bankAccounts: BankAccount[]
): EntryFields {
  const today = todayISO();
  if (!expense) {
    return {
      kind: defaultKind,
```

with:

```tsx
function initialFields(
  expense: Expense | undefined,
  defaultKind: EntryKind,
  bankAccounts: BankAccount[],
  fromLine?: StatementLine
): EntryFields {
  const today = todayISO();
  if (fromLine) {
    return {
      kind: fromLine.amountBrl < 0 ? "expense" : "revenue",
      date: fromLine.date,
      amount: String(Math.abs(fromLine.amountBrl)).replace(".", ","),
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
  if (!expense) {
    return {
      kind: defaultKind,
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
  onOpenChange,
  expense,
  defaultKind = "expense",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
}) {
  // While saving (and uploading) the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
```

with:

```tsx
  onOpenChange,
  expense,
  defaultKind = "expense",
  fromLine,
  onResolved,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
  /** "Criar lançamento" from a linha do extrato. */
  fromLine?: StatementLine;
  /** After the lançamento was created and paired with `fromLine`. */
  onResolved?(resolved: Resolved): void;
}) {
  // While saving (and uploading) the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Despesas e receitas da fazenda. Vendas e compras de gado entram sozinhas pelos
            manejos.
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          expense={expense}
          defaultKind={defaultKind}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
```

with:

```tsx
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : fromLine ? "Criar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            {fromLine
              ? "Preenchido pela linha do banco · confira a conta do plano."
              : "Despesas e receitas da fazenda. Vendas e compras de gado entram sozinhas pelos manejos."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          expense={expense}
          defaultKind={defaultKind}
          fromLine={fromLine}
          onResolved={onResolved}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
function EntryForm({
  expense,
  defaultKind,
  onBusyChange,
  onDone,
}: {
  expense?: Expense;
  defaultKind: EntryKind;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
```

with:

```tsx
function EntryForm({
  expense,
  defaultKind,
  fromLine,
  onResolved,
  onBusyChange,
  onDone,
}: {
  expense?: Expense;
  defaultKind: EntryKind;
  fromLine?: StatementLine;
  onResolved?(resolved: Resolved): void;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(() => initialFields(expense, defaultKind, bankAccounts));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
```

with:

```tsx
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const resolveStatementLine = useHerdStore((s) => s.resolveStatementLine);
  const { addToast } = useToast();
  /** The linha do extrato fixes the kind, the value and the payment. */
  const fixed = fromLine !== undefined;

  const [fields, setFields] = useState<EntryFields>(() =>
    initialFields(expense, defaultKind, bankAccounts, fromLine)
  );
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
  ];
  const suggestions = counterpartySuggestions(expenses);

  const repeating = !expense && repeatFields.choice !== "once";
  const seriesLine = expense
    ? installmentLabel(expense)
      ? `Parcela ${installmentLabel(expense)}`
```

with:

```tsx
  ];
  const suggestions = counterpartySuggestions(expenses);

  const repeating = !expense && !fixed && repeatFields.choice !== "once";
  const seriesLine = expense
    ? installmentLabel(expense)
      ? `Parcela ${installmentLabel(expense)}`
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
      setError("Informe o valor (maior que zero).");
      return;
    }
    const repeat = expense ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
```

with:

```tsx
      setError("Informe o valor (maior que zero).");
      return;
    }
    const repeat = expense || fixed ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
      return;
    }

    setSaving(true);
    let created: Expense[];
    try {
```

with:

```tsx
      return;
    }

    if (fromLine) {
      setSaving(true);
      const resolved = await resolveStatementLine(fromLine, {
        type: "create",
        entry: {
          date: fields.date,
          category,
          amountBrl,
          dueDate: fields.dueDate,
          counterparty: counterparty ?? undefined,
          document: docNumber ?? undefined,
          accountId: accountId ?? undefined,
          lotId: lotId ?? undefined,
          notes: notes ?? undefined,
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
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense ? null : (
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
```

with:

```tsx

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense || fixed ? null : (
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
```

with:

```tsx
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            readOnly={fixed}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
              <input
                type="checkbox"
                checked={fields.paid}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
```

with:

```tsx
              <input
                type="checkbox"
                checked={fields.paid}
                disabled={fixed}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
                type="date"
                aria-label={revenue ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
```

with:

```tsx
                type="date"
                aria-label={revenue ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                disabled={fixed}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
              accounts={bankAccounts}
              kind={fields.kind}
              value={fields.bankAccountId}
              onChange={(bankAccountId) => set({ bankAccountId })}
            />
          </div>
        ) : null}
      </div>

      {expense ? (
        seriesLine ? (
          <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-sm text-ink">
            <Repeat className="size-4 text-ink-soft" aria-hidden />
```

with:

```tsx
              accounts={bankAccounts}
              kind={fields.kind}
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
```

In `components/finance/EntryDialog.tsx`, replace:

```tsx
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense
            ? "Salvar"
            : repeatFields.choice === "installments"
              ? `Lançar ${countInRange(repeatFields.count) ? `${repeatFields.count} ` : ""}parcelas`
              : repeatFields.choice === "recurring"
                ? "Lançar recorrência"
                : "Lançar"}
        </Button>
      </DialogFooter>

```

with:

```tsx
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

```

Create `components/finance/contas/ConciliarPage.tsx`:

```tsx
"use client";

/**
 * /finance/contas/[id]/conciliar/[importId]: each linha of an imported
 * extrato beside the MeuBov record it confirms — conciliada (Desfazer), a
 * suggestion to confirm, or "Sem lançamento correspondente" with Criar
 * lançamento · É transferência · Ignorar. The suggestions are built here from
 * the herd the page holds; every decision goes to the server one line at a
 * time.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCheck, CircleCheck, CircleDashed, Plus, Sparkles } from "lucide-react";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import type { ImportView } from "@/lib/api/domains/statements/useCases/GetImport.useCase";
import type { StatementLine } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { accountBalance, bankAccountLabel } from "@/lib/domain/bankAccounts";
import { addDays, formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import {
  MATCH_WINDOW_DAYS,
  candidatesFor,
  suggestMatches,
  suggestionReason,
  type Candidate,
  type MatchTarget,
  type Suggestion,
} from "@/lib/domain/statements/match";
import { useHerdStore, type LineDecision } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { PageHeader } from "@/components/layout/PageHeader";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { IgnoreLineDialog, OtherMatchDialog, TransferLineDialog } from "@/components/finance/contas/LineDialogs";
import { Button } from "@/components/ui/button";
import { defaultPeriod } from "@/lib/domain/period";
import { todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

type Filter = "all" | "suggested" | "unmatched" | "resolved";
const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "suggested", label: "Sugestões" },
  { key: "unmatched", label: "Sem par" },
  { key: "resolved", label: "Conciliadas" },
];

const PILL = "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

/** The record a line points at, if any. */
const pairedId = (line: StatementLine) => line.expenseId ?? line.movementId ?? line.transferId;

export function ConciliarPage({ accountId, importId }: { accountId: string; importId: string }) {
  const canEdit = useCan("finance", "edit");
  const loadImport = useHerdStore((s) => s.loadImport);
  const resolveStatementLine = useHerdStore((s) => s.resolveStatementLine);
  const confirmHighMatches = useHerdStore((s) => s.confirmHighMatches);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const accounts = useHerdStore((s) => s.accounts);
  const { addToast } = useToast();

  const [view, setView] = useState<ImportView | null | "missing">(null);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [paired, setPaired] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ kind: "other" | "transfer" | "ignore" | "create"; line: StatementLine } | null>(null);

  useEffect(() => {
    let live = true;
    loadImport(importId)
      .then((loaded) => {
        if (!live) return;
        if (!loaded) return setView("missing");
        setView(loaded);
        setLines(loaded.lines);
        setPaired(new Set(loaded.pairedIds));
      })
      .catch(() => live && setView("missing"));
    return () => {
      live = false;
    };
  }, [importId, loadImport]);

  const account = bankAccounts.find((a) => a.id === accountId);
  const inputs = useMemo(
    () => ({ expenses, movements, transfers, bankAccounts }),
    [expenses, movements, transfers, bankAccounts]
  );
  const candidates = useMemo(() => candidatesFor(accountId, inputs, paired), [accountId, inputs, paired]);
  const suggestions = useMemo(() => suggestMatches(lines, candidates), [lines, candidates]);
  // Every record of this conta, paired or not, to name what a resolved line points at.
  const records = useMemo(
    () => new Map(candidatesFor(accountId, inputs, new Set()).map((c) => [c.target.id, c])),
    [accountId, inputs]
  );

  if (view === null) return <p className="px-4 py-10 text-center text-sm text-ink-soft">Carregando o extrato…</p>;
  if (view === "missing" || !account) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-ink">Esse extrato não existe nesta fazenda.</p>
        <Link href="/finance/contas" className="text-sm font-medium text-brand hover:underline">
          Contas bancárias
        </Link>
      </div>
    );
  }

  const describe = (c: Candidate): { title: string; detail: string } => {
    const when = `${c.pending ? "venc. " : ""}${formatDate(c.date).slice(0, 5)}`;
    if (c.expense) {
      const e = c.expense;
      const group = ACCOUNT_GROUP_LABEL[e.kind === "revenue" ? "revenue" : e.category];
      const plan = accountName(e.accountId, accounts);
      return {
        title: plan ? `${group} › ${plan}` : group,
        detail: [e.counterparty, formatCurrency(c.amountBrl), when].filter(Boolean).join(" · "),
      };
    }
    if (c.movement) {
      return {
        title: c.kind === "sale" ? "Venda de gado" : "Compra de gado",
        detail: [c.name, formatCurrency(c.amountBrl), when].filter(Boolean).join(" · "),
      };
    }
    return {
      title: `Transferência ${c.kind === "transferOut" ? "para" : "de"} ${c.name ?? "outra conta"}`,
      detail: [formatCurrency(c.amountBrl), when].join(" · "),
    };
  };

  const pendingLines = lines.filter((l) => l.status === "pending");
  const resolvedCount = lines.length - pendingLines.length;
  const suggestedCount = pendingLines.filter((l) => suggestions.has(l.id)).length;
  const counts: Record<Filter, number> = {
    all: lines.length,
    suggested: suggestedCount,
    unmatched: pendingLines.length - suggestedCount,
    resolved: resolvedCount,
  };
  const high = pendingLines
    .map((l) => ({ line: l, top: suggestions.get(l.id)?.[0] }))
    .filter((x): x is { line: StatementLine; top: Suggestion } => x.top?.confidence === "high");
  const shown = lines.filter((l) =>
    filter === "all"
      ? true
      : filter === "resolved"
        ? l.status !== "pending"
        : l.status === "pending" && suggestions.has(l.id) === (filter === "suggested")
  );

  const imp = view.import;
  const bankBalance = imp.bankBalanceBrl;
  const ourBalance =
    bankBalance !== undefined && imp.bankBalanceDate ? accountBalance(account, inputs, imp.bankBalanceDate) : null;
  const difference = ourBalance === null || bankBalance === undefined ? 0 : Math.round((bankBalance - ourBalance) * 100) / 100;

  /** Applies decided lines to the page: the line itself and what is paired now. */
  const apply = (before: StatementLine[], results: Resolved[]) => {
    setLines((current) => current.map((l) => results.find((r) => r.line.id === l.id)?.line ?? l));
    setPaired((current) => {
      const next = new Set(current);
      for (const line of before) {
        const id = pairedId(line);
        if (id) next.delete(id);
      }
      for (const r of results) {
        const id = pairedId(r.line);
        if (id) next.add(id);
      }
      return next;
    });
  };

  const decide = async (line: StatementLine, decision: LineDecision) => {
    setBusyId(line.id);
    try {
      const result = await resolveStatementLine(line, decision);
      if (result) {
        apply(decision.type === "undo" ? [line] : [], [result]);
        setAsking(null);
      }
    } catch {
      // apiFail already toasted
    } finally {
      setBusyId(null);
    }
  };

  const confirmHigh = async () => {
    setBusyId("high");
    try {
      const result = await confirmHighMatches(
        imp.id,
        high.map(({ line, top }) => ({ lineId: line.id, ...top.candidate.target }))
      );
      apply([], result.resolved);
      addToast({
        messageType: result.refused > 0 ? "warning" : "success",
        text:
          result.refused > 0
            ? `${result.resolved.length} confirmadas · ${result.refused} recusadas`
            : `${result.resolved.length} confirmadas`,
      });
    } catch {
      // apiFail already toasted
    } finally {
      setBusyId(null);
    }
  };

  const match = (line: StatementLine, target: MatchTarget) => decide(line, { type: "match", target });
  const lineBusy = (line: StatementLine) => busyId === line.id || busyId === "high";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <PageHeader
        title={`Conciliar · ${bankAccountLabel(account)} · ${formatNumber(lines.length)} ${lines.length === 1 ? "linha" : "linhas"}`}
        subtitle={`Extrato importado: ${imp.fileName} · ${formatDate(imp.periodFrom).slice(0, 5)} a ${formatDate(imp.periodTo)}`}
        actions={
          <Link
            href="/finance/contas"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Contas bancárias
          </Link>
        }
      />
      <FinanceSubnav current="contas" period={defaultPeriod(todayISO())} />

      <section aria-label="Andamento da conciliação" className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-panel px-4 py-3.5">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <p className="text-[15px] text-ink">
            <span className="font-mono font-medium">{formatNumber(resolvedCount)}</span> de{" "}
            <span className="font-mono font-medium">{formatNumber(lines.length)}</span> resolvidas ·{" "}
            <span className="font-mono font-medium text-scheduled">{formatNumber(suggestedCount)}</span> sugestões ·{" "}
            <span className="font-mono font-medium text-overdue">{formatNumber(counts.unmatched)}</span> sem par
          </p>
          {bankBalance !== undefined && imp.bankBalanceDate && ourBalance !== null ? (
            <p className="text-xs text-ink-soft">
              Banco: <span className="font-mono text-ink">{formatCurrency(bankBalance)}</span> em{" "}
              {formatDate(imp.bankBalanceDate).slice(0, 5)} · MeuBov:{" "}
              <span className="font-mono text-ink">{formatCurrency(ourBalance)}</span>
              {difference !== 0 ? (
                <>
                  {" "}
                  · diferença <span className="font-mono text-attention">{formatCurrency(Math.abs(difference))}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-label="Linhas resolvidas"
          aria-valuemin={0}
          aria-valuemax={lines.length}
          aria-valuenow={resolvedCount}
          className="flex h-2 overflow-hidden rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        >
          <div className="bg-brand" style={{ width: `${(resolvedCount / Math.max(1, lines.length)) * 100}%` }} />
          <div className="bg-scheduled opacity-55" style={{ width: `${(suggestedCount / Math.max(1, lines.length)) * 100}%` }} />
        </div>
      </section>

      <section className="rounded-lg border border-hairline bg-panel">
        <header className="border-b border-hairline px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-ink">Linhas do extrato</h2>
          <p className="text-xs text-ink-soft">cada linha do banco ao lado do lançamento que ela confirma</p>
        </header>
        <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Mostrar" className="flex gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[13px] whitespace-nowrap md:min-h-8",
                  filter === f.key
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {f.label}
                <span className="font-mono text-xs text-ink-soft">{formatNumber(counts[f.key])}</span>
              </button>
            ))}
          </div>
          {canEdit && high.length > 0 ? (
            <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={busyId !== null} onClick={() => void confirmHigh()}>
              <CheckCheck aria-hidden />
              Confirmar as {formatNumber(high.length)} de confiança alta
            </Button>
          ) : null}
        </div>

        <div className="hidden grid-cols-[minmax(0,440px)_24px_minmax(0,1fr)] gap-4 bg-surface px-4 py-2.5 md:grid">
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Linha do banco</span>
          <span />
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Lançamento no MeuBov</span>
        </div>
        <ul>
          {shown.map((line) => {
            const top = suggestions.get(line.id)?.[0];
            const record = pairedId(line) ? records.get(pairedId(line)!) : undefined;
            const outflow = line.amountBrl < 0;
            const fullButton = "max-md:min-h-11 max-md:w-full";
            let right: ReactNode;
            if (line.status !== "pending") {
              const described = record ? describe(record) : null;
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <CircleCheck className="mt-0.5 size-5 shrink-0 text-healthy" aria-label="conciliado" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {line.status === "ignored" ? "Ignorada" : (described?.title ?? "Conciliada")}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {line.status === "ignored" ? line.ignoreReason : (described?.detail ?? "")}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("text-ink-soft", fullButton)}
                      disabled={lineBusy(line)}
                      onClick={() => void decide(line, { type: "undo" })}
                    >
                      Desfazer
                    </Button>
                  ) : null}
                </div>
              );
            } else if (top) {
              const { title, detail } = describe(top.candidate);
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Sparkles className="mt-0.5 size-5 shrink-0 text-scheduled" aria-hidden />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            PILL,
                            top.confidence === "high" ? "bg-healthy-soft text-healthy" : "bg-attention-soft text-attention"
                          )}
                        >
                          confiança {top.confidence === "high" ? "alta" : "média"}
                        </span>
                        <span className="text-xs text-ink-soft">{suggestionReason(top)}</span>
                      </span>
                      <span className="mt-1 block text-sm text-ink">
                        <span className="text-ink-soft">provável: </span>
                        {title} · {detail}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <span className="flex flex-col gap-2 md:flex-row">
                      <Button size="sm" className={fullButton} disabled={lineBusy(line)} onClick={() => void match(line, top.candidate.target)}>
                        <Check aria-hidden />
                        Confirmar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "other", line })}
                      >
                        Outro lançamento
                      </Button>
                    </span>
                  ) : null}
                </div>
              );
            } else {
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <CircleDashed className="mt-0.5 size-5 shrink-0 text-overdue" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">Sem lançamento correspondente</span>
                      <span className="block text-xs text-ink-soft">
                        nenhum lançamento com esse valor entre {formatDate(addDays(line.date, -MATCH_WINDOW_DAYS)).slice(0, 5)} e{" "}
                        {formatDate(addDays(line.date, MATCH_WINDOW_DAYS)).slice(0, 5)}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <span className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "create", line })}
                      >
                        <Plus aria-hidden />
                        Criar lançamento
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "transfer", line })}
                      >
                        É transferência
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("text-ink-soft", fullButton)}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "ignore", line })}
                      >
                        Ignorar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("text-ink-soft", fullButton)}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "other", line })}
                      >
                        Buscar lançamento
                      </Button>
                    </span>
                  ) : null}
                </div>
              );
            }
            return (
              <li
                key={line.id}
                className="grid grid-cols-1 gap-3 border-t border-hairline px-4 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,440px)_24px_minmax(0,1fr)] md:items-start md:gap-4"
              >
                <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{formatDate(line.date).slice(0, 5)}</span>
                  <span className="truncate font-mono text-[13px] text-ink" title={line.description}>
                    {line.description}
                  </span>
                  <span className={cn("font-mono text-sm font-medium", outflow ? "text-ink" : "text-healthy")}>
                    {outflow ? "−" : "+"}
                    {formatNumber(Math.abs(line.amountBrl), 2)}
                  </span>
                </div>
                <ArrowRight className="hidden size-4 text-ink-soft opacity-50 md:block" aria-hidden />
                {right}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">
          Mostrando {formatNumber(shown.length)} de {formatNumber(lines.length)} linhas, por data
        </p>
      </section>

      {asking?.kind === "create" ? (
        <EntryDialog
          open
          onOpenChange={(open) => {
            if (!open) setAsking(null);
          }}
          fromLine={asking.line}
          onResolved={(result) => apply([], [result])}
        />
      ) : null}
      {asking?.kind === "other" ? (
        <OtherMatchDialog
          line={asking.line}
          suggestions={suggestions.get(asking.line.id) ?? []}
          candidates={candidates}
          describe={describe}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(target) => void match(asking.line, target)}
        />
      ) : null}
      {asking?.kind === "transfer" ? (
        <TransferLineDialog
          line={asking.line}
          accounts={bankAccounts}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(otherAccountId) => void decide(asking.line, { type: "transfer", otherAccountId })}
        />
      ) : null}
      {asking?.kind === "ignore" ? (
        <IgnoreLineDialog
          line={asking.line}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(reason) => void decide(asking.line, { type: "ignore", reason })}
        />
      ) : null}
    </div>
  );
}
```

In `components/finance/contas/ContasPage.tsx`, replace:

```tsx
 */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { accountBalance, bankTotal, openFatura } from "@/lib/domain/bankAccounts";
```

with:

```tsx
 */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Landmark, Plus, Upload } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { accountBalance, bankTotal, openFatura } from "@/lib/domain/bankAccounts";
```

In `components/finance/contas/ContasPage.tsx`, replace:

```tsx
import { AccountCard } from "@/components/finance/contas/AccountCard";
import { AccountMovements } from "@/components/finance/contas/AccountMovements";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
```

with:

```tsx
import { AccountCard } from "@/components/finance/contas/AccountCard";
import { AccountMovements } from "@/components/finance/contas/AccountMovements";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
import { ImportDialog } from "@/components/finance/contas/ImportDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
```

In `components/finance/contas/ContasPage.tsx`, replace:

```tsx

  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | null>(null);

  const inputs = useMemo(() => ({ expenses, movements, transfers }), [expenses, movements, transfers]);
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
```

with:

```tsx

  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | "transfer" | "import" | null>(null);

  const inputs = useMemo(() => ({ expenses, movements, transfers }), [expenses, movements, transfers]);
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
```

In `components/finance/contas/ContasPage.tsx`, replace:

```tsx
              onPeriodChange={setPeriod}
              canEdit={canEdit}
              onEdit={() => setDialog("edit")}
            />
          ) : null}
        </>
```

with:

```tsx
              onPeriodChange={setPeriod}
              canEdit={canEdit}
              onEdit={() => setDialog("edit")}
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
            />
          ) : null}
        </>
```

In `components/finance/contas/ContasPage.tsx`, replace:

```tsx
      {dialog === "edit" && selected ? (
        <BankAccountDialog open onOpenChange={() => setDialog(null)} account={selected} />
      ) : null}
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
```

with:

```tsx
      {dialog === "edit" && selected ? (
        <BankAccountDialog open onOpenChange={() => setDialog(null)} account={selected} />
      ) : null}
      {dialog === "import" && selected ? (
        <ImportDialog account={selected} onOpenChange={() => setDialog(null)} />
      ) : null}
      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={selected?.id} />
      ) : null}
```

Create `components/finance/contas/ImportDialog.tsx`:

```tsx
"use client";

/**
 * "Importar extrato": an OFX or CSV file from the bank into a conta corrente.
 * An OFX goes straight in. A CSV asks once which column is what (the first
 * five lines as a table, a select per role, the delimiter and how many lines
 * to skip) and the conta keeps the answer; later imports show the first lines
 * read with it to confirm. The result says how many lines are new and leads
 * to the conciliação.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import type { BankAccount, CsvMapping } from "@/lib/types";
import {
  MAX_STATEMENT_BYTES,
  decodeBankFile,
  statementErrorMessage,
  statementFormat,
} from "@/lib/domain/statements/common";
import { csvRows, guessCsvMapping, parseCsv } from "@/lib/domain/statements/csv";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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

const DELIMITERS: readonly { value: string; label: string }[] = [
  { value: ";", label: "ponto e vírgula ( ; )" },
  { value: ",", label: "vírgula ( , )" },
  { value: "\t", label: "tabulação" },
];

/** Select value for "nenhuma coluna": Radix refuses "". */
const NONE = "none";

type Step =
  | { kind: "file" }
  | { kind: "map"; fileName: string; text: string; mapping: CsvMapping }
  | { kind: "confirm"; fileName: string; text: string; mapping: CsvMapping }
  | { kind: "done"; importId: string; newLines: number; skipped: number };

export function ImportDialog({
  account,
  onOpenChange,
}: {
  account: BankAccount;
  onOpenChange(open: boolean): void;
}) {
  const router = useRouter();
  const importStatement = useHerdStore((s) => s.importStatement);
  const [step, setStep] = useState<Step>({ kind: "file" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(fileName: string, text: string, mapping?: CsvMapping) {
    setBusy(true);
    setError(null);
    try {
      const result = await importStatement(account.id, { fileName, content: text, mapping });
      if ("error" in result) {
        if (result.error === "mapping_required") {
          setStep({ kind: "map", fileName, text, mapping: guessCsvMapping(text) });
        } else {
          setError(result.error === "nothing_new" ? "Nada novo neste extrato" : statementErrorMessage(result.error));
        }
        return;
      }
      setStep({ kind: "done", importId: result.import.id, newLines: result.newLines, skipped: result.skipped });
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_STATEMENT_BYTES) {
      setError("O arquivo passa de 2 MB.");
      return;
    }
    const text = decodeBankFile(new Uint8Array(await file.arrayBuffer()));
    if (statementFormat(file.name, text) === "ofx") return send(file.name, text);
    setError(null);
    setStep(
      account.csvMapping
        ? { kind: "confirm", fileName: file.name, text, mapping: account.csvMapping }
        : { kind: "map", fileName: file.name, text, mapping: guessCsvMapping(text) }
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            {account.name}
            {account.label ? ` ${account.label}` : ""} · arquivo OFX ou CSV do banco, até 2 MB
          </DialogDescription>
        </DialogHeader>

        {step.kind === "file" ? (
          <label
            className={cn(
              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink",
              busy && "pointer-events-none opacity-60"
            )}
          >
            <Upload className="size-5 text-ink-soft" aria-hidden />
            <span className="font-medium">{busy ? "Importando…" : "Escolher arquivo (OFX, CSV)"}</span>
            <span className="text-xs text-ink-soft">o extrato baixado do internet banking</span>
            <input
              type="file"
              accept=".ofx,.qfx,.csv,.txt"
              className="sr-only"
              aria-label="Arquivo do extrato"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        ) : null}

        {step.kind === "map" ? (
          <MappingStep
            text={step.text}
            mapping={step.mapping}
            onChange={(mapping) => setStep({ ...step, mapping })}
          />
        ) : null}

        {step.kind === "confirm" ? <ConfirmStep text={step.text} mapping={step.mapping} /> : null}

        {step.kind === "done" ? (
          <p className="rounded-lg bg-healthy-soft px-3 py-2.5 text-sm text-healthy">
            {formatNumber(step.newLines)} {step.newLines === 1 ? "linha nova" : "linhas novas"} ·{" "}
            {formatNumber(step.skipped)} {step.skipped === 1 ? "já importada" : "já importadas"}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-overdue">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {step.kind === "done" ? (
            <>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                onClick={() => router.push(`/finance/contas/${account.id}/conciliar/${step.importId}`)}
              >
                Conciliar agora
              </Button>
            </>
          ) : step.kind === "file" ? (
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          ) : (
            <>
              {step.kind === "confirm" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 md:min-h-9"
                  disabled={busy}
                  onClick={() => setStep({ ...step, kind: "map" })}
                >
                  Mudar colunas
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => setStep({ kind: "file" })}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => {
                  const parsed = parseCsv(step.text, step.mapping);
                  if (!parsed.ok) return setError(statementErrorMessage(parsed.error));
                  void send(step.fileName, step.text, step.kind === "map" ? step.mapping : undefined);
                }}
              >
                {busy ? "Importando…" : "Importar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The CSV's first lines read with the mapping the conta keeps. */
function ConfirmStep({ text, mapping }: { text: string; mapping: CsvMapping }) {
  const parsed = parseCsv(text, mapping);
  if (!parsed.ok) {
    return <p className="text-sm text-overdue">{statementErrorMessage(parsed.error)} · confira as colunas.</p>;
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink-soft">Primeiras linhas lidas com as colunas desta conta:</p>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline">
        {parsed.statement.lines.slice(0, 5).map((line) => (
          <li key={line.externalId} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-ink-soft">{formatDate(line.date).slice(0, 5)}</span>
            <span className="truncate font-mono text-[13px]">{line.description}</span>
            <span className={cn("font-mono", line.amountBrl > 0 ? "text-healthy" : "text-ink")}>
              {formatCurrency(line.amountBrl)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Qual coluna é o quê": the first five lines after the skipped ones and a select per role. */
function MappingStep({
  text,
  mapping,
  onChange,
}: {
  text: string;
  mapping: CsvMapping;
  onChange(mapping: CsvMapping): void;
}) {
  const rows = csvRows(text, mapping.delimiter);
  const preview = rows.slice(mapping.skipRows, mapping.skipRows + 5);
  const width = Math.max(1, ...rows.slice(0, mapping.skipRows + 5).map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => i);
  const split = mapping.amountColumn === undefined;
  const set = (patch: Partial<CsvMapping>) => onChange({ ...mapping, ...patch });

  const columnSelect = (id: string, label: string, value: number | undefined, pick: (column: number) => void) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value === undefined ? NONE : String(value)} onValueChange={(v) => pick(Number(v))}>
        <SelectTrigger id={id} className="min-h-11 w-full md:min-h-9">
          <SelectValue placeholder="coluna" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={String(c)}>
              Coluna {c + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-soft">
        Diga uma vez qual coluna é o quê; a conta guarda para os próximos extratos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="csv-delimiter">Separador</Label>
          <Select value={mapping.delimiter} onValueChange={(delimiter) => set({ delimiter })}>
            <SelectTrigger id="csv-delimiter" className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIMITERS.map((d) => (
                <SelectItem key={d.label} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="csv-skip">Pular linhas do início</Label>
          <Input
            id="csv-skip"
            type="number"
            min={0}
            max={50}
            value={mapping.skipRows}
            onChange={(e) => set({ skipRows: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
            className="min-h-11 font-mono md:min-h-9"
          />
        </div>
        {columnSelect("csv-date", "Data", mapping.dateColumn, (dateColumn) => set({ dateColumn }))}
        {columnSelect("csv-description", "Descrição", mapping.descriptionColumn, (descriptionColumn) =>
          set({ descriptionColumn })
        )}
      </div>
      <div role="radiogroup" aria-label="Valor" className="flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            checked={!split}
            onChange={() => set({ amountColumn: mapping.inColumn ?? 0, inColumn: undefined, outColumn: undefined })}
            className="accent-brand"
          />
          Valor numa coluna (saída negativa)
        </label>
        <label className="flex min-h-11 items-center gap-2 md:min-h-0">
          <input
            type="radio"
            checked={split}
            onChange={() => set({ inColumn: mapping.amountColumn ?? 0, outColumn: undefined, amountColumn: undefined })}
            className="accent-brand"
          />
          Entrada e Saída separadas
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {split ? (
          <>
            {columnSelect("csv-in", "Entrada", mapping.inColumn, (inColumn) => set({ inColumn }))}
            {columnSelect("csv-out", "Saída", mapping.outColumn, (outColumn) => set({ outColumn }))}
          </>
        ) : (
          columnSelect("csv-amount", "Valor", mapping.amountColumn, (amountColumn) => set({ amountColumn }))
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">Primeiras linhas do arquivo</caption>
          <thead>
            <tr className="bg-surface">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap text-ink-soft">
                  Coluna {c + 1}
                  {c === mapping.dateColumn
                    ? " · Data"
                    : c === mapping.descriptionColumn
                      ? " · Descrição"
                      : c === mapping.amountColumn
                        ? " · Valor"
                        : c === mapping.inColumn
                          ? " · Entrada"
                          : c === mapping.outColumn
                            ? " · Saída"
                            : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-hairline">
                {columns.map((c) => (
                  <td key={c} className="max-w-48 truncate px-2 py-1.5 font-mono whitespace-nowrap">
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Create `components/finance/contas/LineDialogs.tsx`:

```tsx
"use client";

/**
 * The three questions a linha do extrato may ask: which other lançamento it
 * confirms ("Outro lançamento"), to which conta a transferência went ("É
 * transferência"), and why it is ignored ("Ignorar").
 */
import { useState, type ReactNode } from "react";
import type { BankAccount, StatementLine } from "@/lib/types";
import { bankAccountLabel } from "@/lib/domain/bankAccounts";
import { formatCurrency } from "@/lib/domain/format";
import { candidatesByValue, type Candidate, type MatchTarget, type Suggestion } from "@/lib/domain/statements/match";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Reasons offered by "Ignorar"; "outro" asks for the text. */
export const IGNORE_REASONS = ["tarifa já lançada", "duplicada", "outro"] as const;

function Shell({
  title,
  description,
  busy,
  onClose,
  onConfirm,
  confirmLabel,
  canConfirm,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose(): void;
  onConfirm(): void;
  confirmLabel: string;
  canConfirm: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" className="min-h-11 md:min-h-9" disabled={busy || !canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const lineText = (line: StatementLine) => `${line.description} · ${formatCurrency(line.amountBrl)}`;

/** "Outro lançamento": every candidate of the line's side and value ±5 days, then a search by value. */
export function OtherMatchDialog({
  line,
  suggestions,
  candidates,
  describe,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  suggestions: Suggestion[];
  candidates: Candidate[];
  describe(c: Candidate): { title: string; detail: string };
  busy: boolean;
  onClose(): void;
  onPick(target: MatchTarget): void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const value = parseAmount(search);
  const found = Number.isFinite(value) && value > 0 ? candidatesByValue(line, candidates, value) : [];
  const listed = [...suggestions.map((s) => s.candidate), ...found.filter((c) => !suggestions.some((s) => s.candidate === c))];
  const target = listed.find((c) => c.target.id === picked)?.target;

  return (
    <Shell
      title="Outro lançamento"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => target && onPick(target)}
      confirmLabel="Confirmar"
      canConfirm={target !== undefined}
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="other-search">Buscar por valor (R$)</Label>
          <Input
            id="other-search"
            inputMode="decimal"
            placeholder="0,00"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 font-mono md:min-h-9"
          />
        </div>
        {listed.length === 0 ? (
          <p className="text-sm text-ink-soft">Nenhum lançamento com esse valor.</p>
        ) : (
          <ul role="radiogroup" aria-label="Lançamentos" className="divide-y divide-hairline rounded-lg border border-hairline">
            {listed.map((c) => {
              const { title, detail } = describe(c);
              return (
                <li key={c.target.id}>
                  <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2", picked === c.target.id && "bg-brand-soft")}>
                    <input
                      type="radio"
                      name="other-match"
                      checked={picked === c.target.id}
                      onChange={() => setPicked(c.target.id)}
                      className="mt-1 accent-brand"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{title}</span>
                      <span className="block text-xs text-ink-soft">{detail}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}

/** "É transferência": the other conta; money leaves this one on a saída and enters it on an entrada. */
export function TransferLineDialog({
  line,
  accounts,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  accounts: BankAccount[];
  busy: boolean;
  onClose(): void;
  onPick(otherAccountId: string): void;
}) {
  const options = accounts.filter((a) => a.archivedAt === undefined && a.id !== line.bankAccountId);
  const [other, setOther] = useState(options.find((a) => a.kind === "cash")?.id ?? options[0]?.id ?? "");
  const outflow = line.amountBrl < 0;
  return (
    <Shell
      title="É transferência"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => onPick(other)}
      confirmLabel="Registrar transferência"
      canConfirm={other !== ""}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-line-other">{outflow ? "Para a conta" : "Da conta"}</Label>
        <Select value={other} onValueChange={setOther}>
          <SelectTrigger id="transfer-line-other" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {options.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {bankAccountLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-ink-soft">Não entra no resultado: é dinheiro mudando de lugar.</p>
      </div>
    </Shell>
  );
}

/** "Ignorar": tarifa já lançada, duplicada or another reason typed. */
export function IgnoreLineDialog({
  line,
  busy,
  onClose,
  onPick,
}: {
  line: StatementLine;
  busy: boolean;
  onClose(): void;
  onPick(reason: string): void;
}) {
  const [choice, setChoice] = useState<(typeof IGNORE_REASONS)[number]>("tarifa já lançada");
  const [other, setOther] = useState("");
  const reason = choice === "outro" ? other.trim() : choice;
  return (
    <Shell
      title="Ignorar linha"
      description={lineText(line)}
      busy={busy}
      onClose={onClose}
      onConfirm={() => onPick(reason)}
      confirmLabel="Ignorar"
      canConfirm={reason !== ""}
    >
      <div role="radiogroup" aria-label="Motivo" className="grid gap-1">
        {IGNORE_REASONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8">
            <input type="radio" name="ignore-reason" checked={choice === r} onChange={() => setChoice(r)} className="accent-brand" />
            {r}
          </label>
        ))}
        {choice === "outro" ? (
          <Input
            aria-label="Motivo"
            autoFocus
            value={other}
            maxLength={120}
            onChange={(e) => setOther(e.target.value)}
            className="min-h-11 md:min-h-9"
          />
        ) : null}
      </div>
    </Shell>
  );
}
```

In `components/finance/contas/PaidByField.tsx`, replace:

```tsx
  accounts,
  kind,
  value,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  value: string;
  onChange(value: string): void;
}) {
  const options = payingAccounts(accounts, kind);
```

with:

```tsx
  accounts,
  kind,
  value,
  disabled,
  onChange,
}: {
  id: string;
  accounts: BankAccount[];
  kind: EntryKind;
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const options = payingAccounts(accounts, kind);
```

In `components/finance/contas/PaidByField.tsx`, replace:

```tsx
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{kind === "revenue" ? "Recebido em" : "Pago por"}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
```

with:

```tsx
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{kind === "revenue" ? "Recebido em" : "Pago por"}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
```

- [ ] **Step 2: Check.**

Run: `pnpm exec vitest run lib components --exclude '**/worktrees/**'`
Expected: PASS.

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' components/finance "app/(app)/finance"`
Expected: no output from tsc, no eslint problems.

- [ ] **Step 3: Commit.**

```bash
git add 'app/(app)/finance/contas/[id]/conciliar/[importId]/page.tsx' components/finance/EntryDialog.tsx components/finance/contas/ConciliarPage.tsx components/finance/contas/ContasPage.tsx components/finance/contas/ImportDialog.tsx components/finance/contas/LineDialogs.tsx components/finance/contas/PaidByField.tsx
git commit -m 'feat(finance): import an extrato and conciliate it line by line'
```


---

### Task 11: Smoke on a throwaway database, then the whole-branch checks

**Files:**
- Create (outside the repo, never committed): `<scratchpad>/smoke.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in the repo.

Environment pitfalls (from earlier smokes on this machine): `127.0.0.1:5433` answers as another project's Postgres — use a fresh tmpfs container on a free port; other sessions may hold 5441–5445 and 3010–3015, so check `docker ps` and `ss -ltnp` first and rename the container/ports if taken; a plain `pnpm build` inside a `.claude/worktrees/*` worktree may fail on `next/font` (use `pnpm exec next build --webpack` there); Better Auth answers 429 after many sign-ins a minute (the script signs in once); kill the server by the pid `ss -ltnp` shows, never `pkill -f` with the command text.

- [ ] **Step 1: The whole suite, types, lint and build.**

Run: `pnpm exec vitest run --exclude '**/worktrees/**'`
Expected: every file passes (165 files / 1 562 tests when this plan was verified).

Run: `pnpm tsc --noEmit && pnpm exec eslint --ignore-pattern '.claude/**' .`
Expected: clean.

Run: `pnpm build`
Expected: exit 0; the route list shows `ƒ /finance/contas` and `ƒ /finance/contas/[id]/conciliar/[importId]`.

- [ ] **Step 2: A throwaway database, migrated from zero.**

```bash
docker run --rm -d --name meubov-contas-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov \
  -p 127.0.0.1:5446:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
until docker exec meubov-contas-db pg_isready -U meubov; do sleep 1; done; sleep 2
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:migrate
```
Expected: `migrations applied successfully!` (0000 → 0023, the trigger included).

- [ ] **Step 3: The server, a `teste.*` user and a seeded farm.**

Start in the background (it needs `.env.local`; a fresh clone or worktree copies it from the main checkout first):
```bash
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov BETTER_AUTH_URL=http://localhost:3012 pnpm exec next start -p 3012
```
Then:
```bash
curl -s -X POST http://localhost:3012/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3012' \
  -d '{"name":"Teste Contas","email":"teste.contas@meubov.local","password":"ContasBanco2026!"}'
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:seed --email teste.contas@meubov.local
```
Expected: the seed prints `Seeded farm "Fazenda Boa Vista" (id 1) … 52 expenses.` (sign-up answers 200 even for an existing e-mail; the script's sign-in is the real check).

- [ ] **Step 4: The smoke script.**

Create `<scratchpad>/smoke.mjs` (headless Playwright from the npx cache; chromium 1243). It builds a Sicredi-like OFX dated relative to today, so it runs on any day, and covers the spec's smoke list: Sicredi (principal), Caixa and a Cartão through "Nova conta"; a transferência through the sheet; a bill paid by Sicredi and a card purchase through the EntryDialog's "Pago por"; two pending bills by API; the import (7 new lines, then "Nada novo" on the same file); "Confirmar as 2 de confiança alta"; "Criar lançamento" from a line; a saque as transferência; a tarifa ignored, undone and ignored again; the progress, the conferência and a média suggestion; the saldos (Sicredi 22.470, Caixa 4.000, total 26.470), the fatura aberta and its due pill; phone width of both pages; the Extrato's Conta column, the mark-paid dialog, a venda's conta; and a removed lançamento sending its line back to pending.

```js
// Smoke of Contas bancárias e conciliação against `next start` on a throwaway database.
// Usage: BASE=http://localhost:3012 DB=<docker container> node smoke.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

const require = createRequire(`${homedir()}/.npm/_npx/705bc6b22212b352/node_modules/`);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3012";
const DB = process.env.DB ?? "meubov-contas-db";
const EMAIL = process.env.EMAIL ?? "teste.contas@meubov.local";
const PASSWORD = process.env.PASSWORD ?? "ContasBanco2026!";
const OUT = process.env.OUT ?? ".";

const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
const day = (offset) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return iso(d);
};
const ofxDate = (iso) => iso.replaceAll("-", "");
const sql = (q) => execSync(`docker exec ${DB} psql -U meubov -tA -c "${q}"`).toString().trim();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Sicredi-like OFX 1.x with the month the smoke builds.
const trn = (date, amount, fitid, memo) =>
  `<STMTTRN>\n<TRNTYPE>${amount < 0 ? "DEBIT" : "CREDIT"}\n<DTPOSTED>${ofxDate(date)}120000[-3:BRT]\n<TRNAMT>${amount.toFixed(2)}\n<FITID>${fitid}\n<MEMO>${memo}\n</STMTTRN>`;
const OFX = [
  "OFXHEADER:100",
  "DATA:OFXSGML",
  "VERSION:102",
  "CHARSET:1252",
  "",
  "<OFX>",
  "<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL",
  "<BANKTRANLIST>",
  `<DTSTART>${ofxDate(day(-20))}`,
  `<DTEND>${ofxDate(day(-2))}`,
  trn(day(-19), -18400, "S1", "PAGTO FOLHA SALARIOS"),
  trn(day(-11), -4850, "S2", "PIX ENVIADO AGROPECUARIA SERTAO"),
  trn(day(-9), 148320, "S3", "PIX RECEBIDO FRIGORIFICO MINERVA"),
  trn(day(-7), -12640, "S4", "PAGTO BOLETO NUTRON ALIMENTOS"),
  trn(day(-6), -64.9, "S5", "TARIFA PACOTE SERVICOS"),
  trn(day(-5), -1000, "S6", "SAQUE CAIXA 24H AG 0812"),
  trn(day(-3), -1280, "S7", "PIX ENVIADO AGROVET UBERABA"),
  "</BANKTRANLIST>",
  `<LEDGERBAL><BALAMT>123456.78<DTASOF>${ofxDate(day(-2))}</LEDGERBAL>`,
  "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
].join("\n");

const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
const signIn = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASSWORD },
  headers: { origin: BASE },
});
check("sign in", signIn.ok(), String(signIn.status()));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const api = (method, path, data) =>
  context.request.fetch(`${BASE}/api/herd${path}`, { method, data, headers: { origin: BASE } });
const dialog = () => page.getByRole("dialog");
const toast = (text) => page.locator("[data-sonner-toast]", { hasText: text }).first().waitFor();
async function pick(label, option) {
  await dialog().getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// ---- Contas: Sicredi (principal), Caixa, Cartão ----------------------------
await page.goto(`${BASE}/finance/contas`);
await page.getByText("Cadastre a primeira conta").waitFor();
check("empty state", true);

async function newAccount({ kind, name, label, opening, closing, due }) {
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  await dialog().getByRole("radio", { name: kind }).click();
  await dialog().getByLabel("Nome", { exact: true }).fill(name);
  if (label) await dialog().getByLabel("Identificação").fill(label);
  if (opening !== undefined) {
    await dialog().getByLabel("Saldo inicial (R$)").fill(opening);
    await dialog().getByLabel("em", { exact: true }).fill(day(-30));
  }
  if (closing) {
    await dialog().getByLabel("Fechamento (dia)").fill(closing);
    await dialog().getByLabel("Vencimento (dia)").fill(due);
    await pick("Paga pela conta", "Sicredi · c/c 12.345-6");
  }
  await dialog().getByRole("button", { name: "Criar conta" }).click();
  await toast(`Conta "${name}" criada`);
}
await newAccount({ kind: "Conta corrente", name: "Sicredi", label: "c/c 12.345-6", opening: "50.000,00" });
await newAccount({ kind: "Caixa", name: "Caixa da fazenda", opening: "1.000,00" });
await newAccount({ kind: "Cartão", name: "Cartão Sicredi", label: "final 4471", closing: "25", due: "5" });
const accounts = Object.fromEntries(
  sql("select name || '=' || id || '=' || is_main from bank_accounts")
    .split("\n")
    .map((r) => r.split("="))
    .map(([name, id, main]) => [name, { id, main: main === "true" }])
);
check("Sicredi is the conta principal", accounts["Sicredi"]?.main && !accounts["Caixa da fazenda"]?.main);
check("card days stored", sql(`select closing_day || '/' || due_day from bank_accounts where name = 'Cartão Sicredi'`) === "25/5");

// ---- Transferir 2.000 Sicredi -> Caixa ------------------------------------
await page.getByRole("button", { name: "Transferir" }).click();
await dialog().getByLabel("Valor (R$)").fill("2000");
await dialog().getByText("Sicredi fica com").waitFor();
await dialog().getByRole("button", { name: /^Transferir R\$/ }).click();
await toast("Transferência registrada");
check("transfer saved", sql("select count(*) from transfers") === "1");

// ---- Lançamentos: a bill paid by Sicredi, a card purchase, two pending bills ----
async function launch({ date, amount, counterparty, paidBy }) {
  await page.goto(`${BASE}/finance/extrato`);
  await page.getByRole("button", { name: "Lançar" }).first().click();
  await dialog().locator("#entry-date").fill(date);
  await dialog().locator("#entry-amount").fill(amount);
  await dialog().getByLabel("Data do pagamento").fill(date);
  await pick("Pago por", paidBy);
  await dialog().locator("#entry-counterparty").fill(counterparty);
  await dialog().getByRole("button", { name: "Lançar", exact: true }).click();
  await toast("Despesa lançada");
}
await launch({ date: day(-11), amount: "4.850,00", counterparty: "Agropecuária Sertão", paidBy: "Sicredi · c/c 12.345-6" });
check(
  "bill paid by Sicredi",
  sql(`select count(*) from expenses where amount_brl = 4850 and bank_account_id = '${accounts["Sicredi"].id}'`) === "1"
);
await launch({ date: TODAY, amount: "3.150,00", counterparty: "Cooperativa Mista", paidBy: "Cartão Sicredi · final 4471" });
check(
  "card purchase",
  sql(`select count(*) from expenses where amount_brl = 3150 and bank_account_id = '${accounts["Cartão Sicredi"].id}'`) === "1"
);
for (const bill of [
  { date: day(-25), dueDate: day(-19), category: "labor", amountBrl: 18400, counterparty: "Folha de pagamento" },
  { date: day(-20), dueDate: day(-4), category: "nutrition", amountBrl: 12640, counterparty: "Nutron" },
]) {
  const res = await api("POST", "/expenses", bill);
  check(`pending bill ${bill.amountBrl}`, res.ok(), String(res.status()));
}

// ---- Importar extrato ------------------------------------------------------
await page.goto(`${BASE}/finance/contas`);
await page.getByRole("button", { name: "Importar extrato (OFX/CSV)" }).click();
await dialog()
  .locator('input[type="file"]')
  .setInputFiles({ name: "extrato_sicredi.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(OFX, "latin1") });
await dialog().getByText("7 linhas novas · 0 já importadas").waitFor();
check("import: 7 new lines", true);
await dialog().getByRole("button", { name: "Conciliar agora" }).click();
await page.waitForURL(/\/conciliar\//);
await page.getByText("Linhas do extrato").waitFor();
check("conferência shows the bank's saldo", await page.getByText("Banco:").isVisible());

// A second import of the same file is refused.
const again = await api("POST", `/bank-accounts/${accounts["Sicredi"].id}/imports`, {
  fileName: "extrato_sicredi.ofx",
  content: OFX,
});
check("same file again: nothing new", again.status() === 409 && (await again.json()).error === "nothing_new");

await page.getByRole("button", { name: "Confirmar as 2 de confiança alta" }).click();
await toast("2 confirmadas");
check(
  "alta pairs confirmed and the pending folha is paid by Sicredi",
  sql(`select paid_at || '/' || bank_account_id from expenses where amount_brl = 18400`) ===
    `${day(-19)}/${accounts["Sicredi"].id}`
);

const row = (text) => page.locator("main li", { hasText: text });
await row("AGROVET").getByRole("button", { name: "Criar lançamento" }).click();
await dialog().getByText("Preenchido pela linha do banco").waitFor();
await pick("Grupo", "Sanidade");
await dialog().getByRole("button", { name: "Salvar e conciliar" }).click();
await toast("Lançamento criado e conciliado");
check(
  "created from the line",
  sql(`select category || '/' || paid_at from expenses where amount_brl = 1280 and bank_account_id = '${accounts["Sicredi"].id}'`) ===
    `health/${day(-3)}`
);

await row("SAQUE").getByRole("button", { name: "É transferência" }).click();
await dialog().getByRole("button", { name: "Registrar transferência" }).click();
await row("SAQUE").getByText("Transferência para Caixa da fazenda").waitFor();
check("saque became a transferência", sql("select count(*) from transfers") === "2");

await row("TARIFA").getByRole("button", { name: "Ignorar" }).click();
await dialog().getByRole("button", { name: "Ignorar" }).click();
await row("TARIFA").getByText("tarifa já lançada").waitFor();
await row("TARIFA").getByRole("button", { name: "Desfazer" }).click();
await row("TARIFA").getByRole("button", { name: "Ignorar" }).waitFor();
await row("TARIFA").getByRole("button", { name: "Ignorar" }).click();
await dialog().getByRole("button", { name: "Ignorar" }).click();
await row("TARIFA").getByText("tarifa já lançada").waitFor();
check("tarifa ignored (after an undo)", sql("select status from statement_lines where description like 'TARIFA%'") === "ignored");
await page.getByText("5 de 7 resolvidas").waitFor();
check("progress 5 de 7", true);
check("nutron stays a média suggestion", await row("NUTRON").getByText("confiança média").isVisible());

await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: `${OUT}/conciliar-phone.png`, fullPage: true });
check("conciliar fits the phone", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 391);
await page.setViewportSize({ width: 1440, height: 1000 });

// ---- Saldos and fatura -----------------------------------------------------
await page.goto(`${BASE}/finance/contas`);
const cards = page.getByRole("group", { name: "Contas" });
await cards.getByText("Sicredi", { exact: true }).waitFor();
const money = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
check("saldo em contas", await page.getByText(money(26470), { exact: true }).isVisible(), money(26470));
check("Sicredi saldo", await cards.getByText(money(22470), { exact: true }).isVisible());
check("Caixa saldo", await cards.getByText(money(4000), { exact: true }).isVisible());
check("fatura aberta", await cards.getByText(money(-3150), { exact: true }).isVisible());
check("card due pill", await cards.getByText(/^vence \d\d\/\d\d$/).isVisible());
check("2 a conciliar", await cards.getByText("2 a conciliar").isVisible());
check(
  "movimentação shows conciliado rows",
  (await page.getByRole("table", { name: /Movimentação/ }).getByText("conciliado").count()) >= 4
);
await page.screenshot({ path: `${OUT}/contas-desktop.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: `${OUT}/contas-phone.png`, fullPage: true });
check("contas fits the phone", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 391);
await page.getByRole("button", { name: "Transferir" }).click();
await page.screenshot({ path: `${OUT}/transfer-phone.png` });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1440, height: 1000 });

// ---- Extrato: Conta column, mark paid with "Pago por", a venda's conta ------
await page.goto(`${BASE}/finance/extrato`);
await page.getByRole("columnheader", { name: "Conta", exact: true }).waitFor();
check("Extrato has the Conta column", true);
await page.getByRole("button", { name: "Marcar como pago" }).first().click();
await dialog().getByText("De que conta o dinheiro saiu?").waitFor();
await pick("Pago por", "Caixa da fazenda");
await dialog().getByRole("button", { name: "Marcar pago" }).click();
await toast("Marcado como pago");
check(
  "mark paid asked Pago por",
  Number(sql(`select count(*) from expenses where bank_account_id = '${accounts["Caixa da fazenda"].id}'`)) === 1
);
const hasSale = sql("select count(*) from movements where type = 'sale'") !== "0" ||
  sql("select count(*) from manejo_sessions where kind = 'sale' and deleted_at is null") !== "0";
if (hasSale) {
  await page.goto(`${BASE}/finance/extrato?tipo=sale&de=${day(-365)}&ate=${TODAY}`);
  await page.getByRole("button", { name: "Conta", exact: true }).first().click();
  await pick("Conta", "Sicredi · c/c 12.345-6");
  await dialog().getByRole("button", { name: "Salvar" }).click();
  await toast("Conta salva");
  // The newest venda may be a legacy movement row or a manejo session.
  const taken = sql(
    `select (select count(*) from manejo_sessions where bank_account_id = '${accounts["Sicredi"].id}') + (select count(*) from movements where bank_account_id = '${accounts["Sicredi"].id}')`
  );
  check("a venda takes a conta", Number(taken) >= 1);
}

// ---- Removing the paired lançamento returns its line to pending -----------
const agrovet = sql("select expense_id from statement_lines where description like '%AGROVET%'");
const removed = await api("DELETE", `/expenses/${agrovet}`);
check(
  "removed lançamento: line back to pending",
  removed.ok() && sql("select status from statement_lines where description like '%AGROVET%'") === "pending"
);

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 5: Run it.**

Run: `BASE=http://localhost:3012 DB=meubov-contas-db OUT=<scratchpad> node <scratchpad>/smoke.mjs`
Expected: `32/32 checks passed`, exit 0. Look at `contas-desktop.png`, `contas-phone.png`, `transfer-phone.png` and `conciliar-phone.png` against the canvas boards.

- [ ] **Step 6: Clean up.**

```bash
kill $(ss -ltnp | grep ':3012 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
docker rm -f meubov-contas-db
```
Nothing to commit: the smoke leaves the repo as Task 10 left it.


---

## Self-review against the spec

- Words, Data, Rules and UI of the spec map to: schema and types (Task 1); saldo with the opening cut-off, saldo em contas without cartões, fatura by closing day, payment as a transferência (Task 2); OFX 1.x/2.x and CSV with mapping, pt-BR decimals, split columns, dedupe hash (Task 3); suggestions ±5 days, alta by name or single candidate, one alta per candidate (Task 4); contas CRUD with archive/delete rules and one principal, transferências, "Pago por" on POST/PATCH expenses, the conta principal on a manejo's venda/compra, `PATCH /movements/:id/bank-account` (Task 5); import ≤ 2 MB into a conta corrente, skipped/"Nada novo", lines before the saldo inicial ignored, GET import, match/create/transfer/ignore/undo, confirm-high, "pago por outra conta", removal → pending (trigger) (Tasks 1, 5, 6); store (Task 7); page, cards, movimentação 10 per page, Nova/Editar conta, Transferir sheet (Task 8); "Pago por" in the EntryDialog and the mark-paid dialog with 2+ contas, Conta column and row action (Task 9); Importar extrato with the CSV mapping step and the Conciliar page with progress, conferência, filters, confirm-high, Outro lançamento with search by value, Criar lançamento, É transferência, Ignorar, Desfazer, phone cards (Task 10); smoke list (Task 11).
- Tests the spec names: saldo cut-off, transferências, vendas; fatura day 31/February and the payment; OFX Sicredi-like 1.x and BB-like 2.x; CSV `;` pt-BR, split, identical lines; suggestions exact value, ±5 days, alta by name, alta by single candidate, one candidate for two lines; import dedupe and "Nada novo"; confirm pays with the conta; "pago por outra conta"; create/transfer/ignore/undo; another farm's conta, line and import 404; view-only member 403 — all in Tasks 2–7. "Deleting a paired lançamento returns the line to pending" is the trigger's, checked by the Task 11 smoke.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-29-financeiro-contas-bancarias.md`. The user's workflow is "implement on main, one commit at the end" (memory: feature-workflow-on-main) — the per-task commits here can be squashed into one `feat(finance): …` at the end, by pathspec, without any attribution line.
