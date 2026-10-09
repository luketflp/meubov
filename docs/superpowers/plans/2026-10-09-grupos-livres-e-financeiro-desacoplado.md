# Grupos livres no plano de contas, Financeiro desacoplado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every grupo of the plano de contas belongs to the farm (rename, archive, delete, add under any tipo); a purchase of sêmen and a tratamento's cost stay in Touros and Sanidade instead of feeding the Financeiro.

**Architecture:** `expense_groups` becomes `plan_groups` with a `kind`; the four grupo columns hold a grupo id for every kind (a rendimento's category is null); a migration seeds eleven grupos per farm and remaps every row. `lib/domain/groups.ts` lists grupos per tipo; the ledger, the tree, the orçamento and the reports read them, drop the treatment rows and the health bucket; `normaliseEntry` checks the grupo's kind; the Plano de contas gives every grupo the header farm grupos already had; the sêmen use cases stop writing expenses.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/` first), React, Tailwind, Zustand, Elysia + Eden, Drizzle + Postgres, vitest, Playwright for the smoke.

**Spec:** `docs/superpowers/specs/2026-10-09-grupos-livres-e-financeiro-desacoplado-design.md`

## Global Constraints

- Work on `main` in place, one commit at the very end by the controller; never `git add -A`, never stash, never touch a file outside the task's list.
- This Next.js has breaking changes: read the guide in `node_modules/next/dist/docs/` before writing a page or a route.
- No new dependency.
- Copy in pt-BR; code, names and comments in English in the voice of the surrounding files. No emoji.
- Tipos are fixed (`GroupKind`); grupos are rows of the farm, alphabetical inside their tipo; no grupo is special anywhere in the code.
- A grupo name is 1–40 characters with a non-space, unique per farm in any case across every tipo.
- Every query filters by `farm_id`; grupo writes need Financeiro edit; sêmen purchases need Reprodução edit.
- Phone targets ≥ 44 px (`min-h-11`), compact on md+; real `<button>`, `<label>`, `<input>`; `aria-label` on icon-only buttons.
- Tests: `./node_modules/.bin/vitest run <explicit paths> --exclude '**/worktrees/**'`. Types: `./node_modules/.bin/tsc --noEmit`. Lint: `./node_modules/.bin/eslint <files>`. The two route snapshots update with `-u` LAST on their two explicit paths only. In a sandbox clone never run `pnpm`.
- Waves run in order: 1 · 2–3–4–5 · 6–7 · 8. Tasks of one wave touch disjoint files. `tsc` is clean only after wave 3.

---

## Binding changes found while drafting, verifying and reviewing


1. Wave 2 execution order (binding for the verifier): task 2 steps 1–8 (move `expenseGroups/` → `planGroups/` file by
   file because task 1's `seed.ts` already created the folder; `farmGroup.ts`; use cases; store actions), then task 3
   (it imports `farmGroup`; it rewires `entryRules.ts`, accounts `Add.useCase.ts`, `PutBudgetLine.useCase.ts` off the
   moved `farmCategory`), then task 2 from step 9 (route requirements test, route table test and both snapshots import
   `@/lib/api/app`, which only loads once task 3 is in), then task 4 (its `permissions.test.ts` imports the app and
   needs task 2's `edit("reproduction")` on the two purchase routes), then task 5.
2. Task 2's plan-group routes test mounts `planGroupsController` alone under `/api/herd` (the farm macro still applies
   `ROUTE_REQUIREMENTS`) so it can run before task 3.
3. After task 2, `NewGroupDialog.tsx`, `GroupHeader.tsx` and `AccountsPage.tsx` stay red until task 7 renames
   `addExpenseGroup`/`updateExpenseGroup`/`removeExpenseGroup` to `addPlanGroup(kind, name)`/`updatePlanGroup`/`removePlanGroup`.
4. (task 6 drafter, binding for task 5) `entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[],
   planGroups: readonly PlanGroup[]): EntryInitial` — a grupo nó and a conta nó need `groupKind` for their tipo.
   `cashSummary(input: Pick<LedgerInputs, "expenses" | "movements">, period, todayIso)` — no treatments. Task 6 calls both this way.
5. (task 4) `POST /semen-bulls/:id/purchases` redacts `totalBrl` from `{ purchase }` for a member without Financeiro view
   (a vaqueiro can buy now). `AddPurchase` runs without a transaction (one select, one insert). The "Primeira compra"
   section of Novo touro shows to anyone with Reprodução edit. `UpdateBull.test.ts` is fixed by task 4.
6. Task 2 also rewrites the comment at the top of `lib/api/permissions/routeRequirements.ts` that says the semen
   controller has checks that depend on the body: it no longer has any.
7. Task 1 must fix `lib/domain/__tests__/moneyRedaction.test.ts` (line ~179 still puts `expenseId` on a `SemenPurchase`);
   it is the one `tsc` error task 4's scratch run saw outside its own files.
8. (task 7) `archiveGroupText(kind, contas, entries)` so a receita/capital grupo's confirm does not mention Orçamento or
   custo; `components/finance/plano/__tests__/groupHeader.test.ts` belongs to task 7. `NewAccountDialog` takes
   `defaultGroup?: string` (nothing outside task 7 passes it). EntryDialog keeps five rows in the "O quê" column: for a
   capital kind Grupo and Conta share one row. `initialFields` keeps a template's/initial's conta only when its grupo is
   active and of the right tipo, so task 6's `entryInitialFor` for a conta nó passes `category: account.group`.
   Verifier: `NewGroupDialog.onCreated` has no caller — drop the prop while executing task 7.
9. (task 1) The migration's last statement has no trailing `--> statement-breakpoint` (drizzle's format). `fixtures.ts`
   gains `makePlanGroup()` for later tests. `EnsureForUser.test.ts` is new; `lib/data/__tests__/seed.test.ts` is task 1's.
   The renamed table keeps its primary key named `expense_groups_pkey` (task 8 must not assert on that name).
   Task 5: `planTree.ts` declares a local `GROUP_KINDS`; rename it before importing `GROUP_KINDS` from `groups.ts`.
   After task 1 about 10 API test files fail at run time because `isFarmCategory` calls the deleted `isBuiltinCategory`;
   they recover with task 3's `farmGroup`. `useHerdStore.ts` stays red until tasks 2 and 3 both land.
10. (task 3) `UpdateAccount` calls `farmGroup` when the saldo inicial is in the patch (`validOpening` takes a kind).
    `Split` refuses a row whose `category === null`; `AddSeries` writes `shape.category!`; `LineEntry.category` is
    optional; `ResolveLine` lets the form's category through. `CopyBudgets.test.ts` runs the real `copyPlan` and only
    passes once task 5's `BudgetInputs.planGroups` is in. `accountsByGroup` pre-fills nothing: until task 7 rewrites
    it, `AccountsPage.tsx` reads `byGroup.financing`/`byGroup.revenue` without `?? []` (runtime only, tsc is silent).
11. (task 5) `costBreakdown(expenses, refIso, months)` — argument order as the contract (swapped from today's). A venda
    row's `LedgerRow.group` stays `"revenue"` (no grupo); a grupo nó picks rows by `r.expense?.category === id`.
    `expensesExportTable(expenses, title, planGroups)`: `title` lost its default. `ReportLine.locked` stays (false on
    every typed line). No change in `lib/reports/bankStatement.ts`, `lib/store/dashboard.ts` or its test. Tasks 6 and 7:
    `PaneRows.tsx` and `AccountsPage.tsx` must test `groupKind(account.group, planGroups) === "financing"`, never
    `account.group === "financing"`.
12. (task 1, verified in the sandbox) Baseline after task 1: `tsc` 98 errors in exactly the 42 files Step 26 lists
    (per-file counts there); full vitest 26 failing files / 73 failing tests, exactly Step 26's runtime list. To list
    tsc files use `grep -E '^\S.*: error TS' | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort | uniq -c`: the old
    `grep -o '^[^(]*'` cuts `app/(app)/...` down to `app/`. The drizzle-kit no-TTY recipe works as written (Enter picks
    "create table"); after the hand SQL the second generate prints "No schema changes, nothing to migrate".
13. (tasks 2+3, verified in the sandbox) Baseline after both: `tsc` 75 errors in exactly the 31 files task 2's Step 13
    lists (per-file counts there). Against task 1's Step 26: tasks 2–3's files are clean; `NewGroupDialog.tsx` [1] is
    newly red and `AccountsPage.tsx` 7→8, `GroupHeader.tsx` 1→3 (item 3, task 7); `CopyBudgets.useCase.ts` 2→1 (task
    5's `BudgetInputs.planGroups`). Full vitest: 13 failing files / 21 tests: `CopyBudgets.test.ts` (task 5), task 4's
    three semen tests plus `lib/api/__tests__/permissions.test.ts` ("refuses a vaqueiro a semen purchase, naming
    Financeiro" now answers 500: the route no longer asks Financeiro; task 4 rewrites that case), task 5's six, task
    6's `legacySearch.test.ts`, task 7's `entryFields.test.ts`.
14. (sandbox commits in this wave) Task 2's `git mv`s sit in the index, so commit each task with `git commit -m … --
    <its paths>` (pathspec), never a bare `git commit` after `git add` (it would sweep the other task's staged
    renames in). `git add lib/api/domains/expenseGroups` is fatal once the folder is gone ("did not match any
    files"); leave it out of `git add` and pass it to `git commit --` only, which records the deletions.
15. (task 8) In the sandbox `next dev` must run with `--webpack` (Turbopack refuses the symlinked node_modules). The
    host is short on memory: the tmpfs Postgres and Chromium were killed mid-smoke twice; rerun `reset.sh` + the smoke
    when that happens. Task 7 keeps today's GroupHeader/NewGroupDialog aria-labels, dialog titles and toasts where the
    smoke locates elements by them (list in 08-smoke.md Interfaces); where task 7 changed copy, the smoke adapts, not the UI.
16. (tasks 4+5, verified in the sandbox) Baseline after tasks 1–5: `tsc` 68 errors in exactly the 24 files task 5's
    Step 22 lists (per-file counts there), every one task 6's or task 7's; against item 13 the semen use cases, the
    task 5 readers and `CopyBudgets.useCase.ts` are clean, and task 6's `dashboard/page.tsx`, `CapitalStrip.tsx`,
    `EntryDetailDialog.tsx`, `useEntryActions.tsx`, `legacySearch.test.ts`, `reports/__tests__/tables.test.ts` are newly
    red (they read task 5's new shapes: `PlanNode` kind/group nós, `entryInitialFor(…, planGroups)`, no `treatments`).
    Full vitest: 3 files / 11 tests red: `legacySearch.test.ts` and `components/reports/__tests__/datasets.test.ts`
    (task 6: `datasets.ts` must pass `planGroups` to `expensesExportTable`), `entryFields.test.ts` (task 7).
    `CopyBudgets.test.ts` and `permissions.test.ts` pass.
17. (applier) Sections 04 and 05 head their blocks with "**Replace the whole file** `X` with:", "**Replace** in `X`:"
    and "`X` — **Replace**"; `apply2.py` leaves the path unset for the first two and the mode unset for the third.
    `~/.cache/meubov-plan-2026-10-09/apply3.py` (same arguments) reads all of them; use it for 04–05 and any section
    written that way. The farm domain keeps its own `finance_forbidden` (início da safra); only the sêmen one goes.
18. (task 6, verified in the sandbox) `components/finance/lancamentos/EntryDetailDialog.tsx` is task 6's: its
    `KIND_ICON`/`KIND_LABEL` still mapped `treatment` (gone from `LedgerKind` in task 5); Step 6 now drops the key and
    the `Syringe` import. After task 6 `tsc` is red only in task 7's six files (26 errors).
19. (task 7) `NewGroupDialog` has no `onCreated` prop (and no `PlanGroup` import). `groupHeader.test.ts` lives at
    `components/finance/__tests__/groupHeader.test.ts` (item 8's `plano/__tests__` path is wrong). `AccountsPage`
    meets item 11 through the grupo it lists the contas under: `group.kind === "financing"` on a `PlanGroup`
    (no per-conta lookup exists there; nothing compares `account.group` with a kind).
20. (applier) Sections 06–07 head blocks with "Replace in `X`:", "Replace the whole file `X` with:", "`X`, in order"
    + "**Replace N** — find:"; `~/.cache/meubov-plan-2026-10-09/apply4.py` (same arguments as apply3) reads all of them.
21. (end of wave 3, verified in the sandbox at e8db266) `tsc` 0 errors; eslint clean on the 144 `.ts/.tsx` files changed
    since 5235a3e; full vitest 197 files / 1926 tests green; `next build --webpack` succeeds with the sandbox's `.env`
    (no `.env.local` needed). Leftover grep (outside `docs/` and `drizzle/`): only `queueOrSend.test.ts` keeps
    `expenseGroups` (the old-snapshot case, on purpose); `finance_forbidden` only in the farm domain (item 17);
    `"nutrition"`/`"health"`/`"breeding"` as grupo appear only in tests as opaque ids or as old keys asserted to be
    refused; production code uses `"health"` only as a `ManejoKind`.
22. (review + smoke, fixed on main after the sandbox apply) EntryDialog's Grupo `onValueChange` ignores `""` (Radix's
    hidden native select reports it once on a tipo change, before the new options render). `GroupsReport.flat`
    (`{ revenue, expense }`, true when the tipo shows a single grupo: the active ones plus those with lines, archived or
    removed — the tree's rule; the smoke on main caught the first version, "one active grupo", hiding the headers of an
    archived grupo with lines) drives the table flattening in `tables.ts`. `UpdateSeries.sharedFields` shares the edited row's
    conta (or null) whenever `category` is sent. `planTree.shownGroups` takes a `keep` set: an archived financiamento
    grupo stays listed while a live conta of it still owes (`owingGroups`), so the tipo's devedor equals its children.
    `CostBreakdownCard` links to the Despesas tipo when the farm has a single despesa grupo. "Orçar um grupo" is
    disabled without a despesa grupo. `costBreakdown` (no caller) and the `AddAccountButton` export are gone; copy in
    `EntryDetailDialog` and `README.md` no longer mentions tratamentos. Migration 0030 also renames the primary key
    to `plan_groups_pkey`. Accepted, not fixed: the production migration runs before `next build` while the old
    deployment serves (true of every migration here: deploy in a quiet window); old `?conta=grupo:<old key>` URLs open
    "Grupo removido"; the "Todas as contas padrão já existem" toast also shows when defaults were skipped.

---

### Task 1: Foundation

Types, the `plan_groups` table and migration 0030, the grupo helpers, the load, the eleven default grupos on every new farm, the seed, and the store field. Later tasks compile against what this task produces; `tsc` stays red in their files until wave 3 (Step 26 lists them).

**Files:**
- Create: `lib/api/domains/planGroups/seed.ts`
- Create: `drizzle/0030_grupos-livres.sql`, `drizzle/meta/0030_snapshot.json` (drizzle-kit)
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`
- Modify: `drizzle/meta/_journal.json` (drizzle-kit)
- Modify: `lib/domain/groups.ts` (replaced whole)
- Modify: `lib/domain/labels.ts`
- Modify: `lib/domain/entries.ts`
- Modify: `lib/api/mappers.ts`
- Modify: `lib/api/domains/herd/useCases/Load.useCase.ts`
- Modify: `lib/api/domains/farm/useCases/Create.useCase.ts`
- Modify: `lib/api/domains/farm/useCases/EnsureForUser.useCase.ts`
- Modify: `lib/data/seed.ts`
- Modify: `cli/seedCli.ts`
- Modify: `lib/store/useHerdStore.ts` (state field `planGroups` only)
- Modify: `lib/domain/__tests__/fixtures.ts`
- Test: `lib/domain/__tests__/groups.test.ts` (replaced whole), `lib/domain/__tests__/entries.test.ts`, `lib/domain/__tests__/moneyRedaction.test.ts`, `lib/api/__tests__/mappers.test.ts`, `lib/api/domains/herd/useCases/__tests__/Load.test.ts` (replaced whole), `lib/api/domains/farm/useCases/__tests__/Create.test.ts` (replaced whole), `lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts` (new), `lib/data/__tests__/seed.test.ts`, `lib/store/__tests__/queueOrSend.test.ts`

`lib/domain/moneyRedaction.ts` itself needs no change (`redactHerdMoney` spreads `planGroups` through like any other field); only its test loses the purchase's `expenseId`. `lib/domain/__tests__/labels.test.ts` never tested `BUILTIN_CATEGORY_LABEL` and stays as it is.

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `lib/types.ts`: `GroupKind = Exclude<EntryKind, "yield">`; `PlanGroup { id; kind: GroupKind; name; archivedAt?; createdAt }`; `ExpenseCategory = string` and `AccountGroup = string` (a `PlanGroup` id); `Expense.category?: ExpenseCategory`; `HerdData.planGroups?: PlanGroup[]`; `SemenPurchase` without `expenseId`. Deleted: `BuiltinCategory`, `ExpenseGroup`. Kept: `CapitalGroup`, `EntryKind`, `EntryFlow`.
  - `lib/domain/groups.ts`: `GROUP_KINDS`, `GROUP_KIND_LABEL`, `DEFAULT_GROUPS`, `GROUP_NAME_MAX`, `byGroupName`, `groupsOf(groups, kind, opts?)`, `groupLabel(id, groups)`, `groupKind(id, groups)`. Deleted: `BUILTIN_CATEGORIES`, `TOP_GROUP_LABEL`, `isBuiltinCategory`, `isDespesaGroup`, `despesaGroups`, `DespesaGroup`, `clashesWithFixedGroup`; `BUILTIN_CATEGORY_LABEL` from `labels.ts`.
  - `lib/domain/entries.ts`: `entryGroup(e: { kind: EntryKind; category?: ExpenseCategory }): AccountGroup | null` → `e.category ?? null`.
  - `lib/domain/__tests__/fixtures.ts`: `makePlanGroup(overrides?: Partial<PlanGroup>): PlanGroup` (default `{ id: "g-1", kind: "expense", name: "Nutrição", createdAt: "2026-10-01T12:00:00.000Z" }`).
  - `lib/db/schema.ts`: `planGroupKindEnum`, `planGroups`, `PlanGroupRow`; `expenses.category` nullable; `semenPurchases` without `expenseId`. Deleted: `expenseGroups`, `ExpenseGroupRow`.
  - `lib/api/mappers.ts`: `toPlanGroup(row: PlanGroupRow): PlanGroup` (replaces `toExpenseGroup`); `toExpense` maps a null `category` to absent; `toSemenPurchase` without `expenseId`.
  - `LoadHerdUseCase` answers `planGroups` (every grupo of the farm, archived included, `orderBy(asc(planGroups.name))`).
  - `lib/api/domains/planGroups/seed.ts`: `seedPlanGroups(repo: RepositoryType, farmId: number, groups = DEFAULT_GROUPS): Promise<PlanGroupRow[]>`.
  - `lib/data/seed.ts`: `SEED_GROUPS: readonly PlanGroup[]` (`grp-receitas`, `grp-nutricao`, `grp-pastagem`, `grp-mao-de-obra`, `grp-sanidade`, `grp-reproducao`, `grp-administrativo`, `grp-outros`, `grp-investimentos`, `grp-financiamentos`, `grp-socios`); `generateInitialData().planGroups`.
  - Store: state `planGroups: PlanGroup[]`; the three actions keep their names (`addExpenseGroup`, `updateExpenseGroup`, `removeExpenseGroup`) and `api["expense-groups"]` until task 2.

---

#### Grupos: types and domain helpers

- [ ] **Step 1: Write the failing tests**

`lib/domain/__tests__/fixtures.ts` — **Replace**

```ts
import type { Animal, ManejoSession, SemenBull, Treatment } from "@/lib/types";
```

with

```ts
import type { Animal, ManejoSession, PlanGroup, SemenBull, Treatment } from "@/lib/types";
```

and append at the end of the file:

```ts

/** Creates a default grupo (Despesas › Nutrição) for tests, with partial overrides. */
export function makePlanGroup(overrides: Partial<PlanGroup> = {}): PlanGroup {
  return {
    id: "g-1",
    kind: "expense",
    name: "Nutrição",
    createdAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}
```

`lib/domain/__tests__/groups.test.ts` — **Replace the whole file with:**

```ts
import { describe, expect, it } from "vitest";
import {
  byGroupName,
  DEFAULT_GROUPS,
  GROUP_KIND_LABEL,
  GROUP_KINDS,
  groupKind,
  groupLabel,
  groupsOf,
} from "@/lib/domain/groups";
import { makePlanGroup as group } from "@/lib/domain/__tests__/fixtures";

const NUTRICAO = group({ id: "g-nut", name: "Nutrição" });
const MAO_DE_OBRA = group({ id: "g-mao", name: "Mão de obra" });
const MAQUINAS = group({ id: "g-maq", name: "Máquinas e veículos" });
const ARRENDAMENTO = group({ id: "g-arr", name: "Arrendamento" });
const FRETE = group({ id: "g-fre", name: "Frete", archivedAt: "2026-10-03T12:00:00.000Z" });
const RECEITAS = group({ id: "g-rec", kind: "revenue", name: "Receitas" });
const PRONAF = group({ id: "g-pro", kind: "financing", name: "Pronaf" });

describe("GROUP_KINDS and GROUP_KIND_LABEL", () => {
  it("lists the five tipos in screen order, each with its label", () => {
    expect(GROUP_KINDS.map((kind) => GROUP_KIND_LABEL[kind])).toEqual([
      "Receitas",
      "Despesas",
      "Investimentos",
      "Financiamentos",
      "Sócios",
    ]);
  });
});

describe("DEFAULT_GROUPS", () => {
  it("is the eleven a farm starts with, every tipo covered, no name twice in any case", () => {
    expect(DEFAULT_GROUPS).toHaveLength(11);
    expect(DEFAULT_GROUPS.filter((g) => g.kind === "expense").map((g) => g.name)).toEqual([
      "Nutrição",
      "Pastagem",
      "Mão de obra",
      "Sanidade",
      "Reprodução",
      "Administrativo",
      "Outros",
    ]);
    expect(new Set(DEFAULT_GROUPS.map((g) => g.kind))).toEqual(new Set(GROUP_KINDS));
    expect(new Set(DEFAULT_GROUPS.map((g) => g.name.toLowerCase())).size).toBe(11);
  });
});

describe("groupsOf", () => {
  const ALL = [NUTRICAO, MAQUINAS, RECEITAS, FRETE, MAO_DE_OBRA, PRONAF, ARRENDAMENTO];

  it("lists the active grupos of one tipo in pt-BR alphabetical order, no grupo special", () => {
    expect(groupsOf(ALL, "expense").map((g) => g.name)).toEqual([
      "Arrendamento",
      "Mão de obra",
      "Máquinas e veículos",
      "Nutrição",
    ]);
    expect(groupsOf(ALL, "revenue")).toEqual([RECEITAS]);
    expect(groupsOf(ALL, "partners")).toEqual([]);
  });

  it("brings the archived ones back when asked", () => {
    expect(groupsOf(ALL, "expense", { archived: true }).map((g) => g.id)).toEqual([
      "g-arr",
      "g-fre",
      "g-mao",
      "g-maq",
      "g-nut",
    ]);
  });

  it("keeps the archived grupo a row already sits in, and no other", () => {
    const cercas = group({ id: "g-cer", name: "Cercas", archivedAt: "2026-10-04T12:00:00.000Z" });
    expect(groupsOf([FRETE, cercas], "expense", { keep: "g-fre" }).map((g) => g.id)).toEqual(["g-fre"]);
    expect(groupsOf([FRETE], "revenue", { keep: "g-fre" })).toEqual([]);
  });

  it("leaves the input order alone", () => {
    const input = [NUTRICAO, ARRENDAMENTO];
    groupsOf(input, "expense");
    expect(input).toEqual([NUTRICAO, ARRENDAMENTO]);
  });
});

describe("byGroupName", () => {
  it("sorts accented names where a pt-BR reader expects them", () => {
    expect([MAQUINAS, NUTRICAO, MAO_DE_OBRA].sort(byGroupName).map((g) => g.name)).toEqual([
      "Mão de obra",
      "Máquinas e veículos",
      "Nutrição",
    ]);
  });
});

describe("groupLabel and groupKind", () => {
  it("name a grupo and its tipo, archived too", () => {
    expect(groupLabel("g-fre", [NUTRICAO, FRETE])).toBe("Frete");
    expect(groupLabel("g-rec", [RECEITAS])).toBe("Receitas");
    expect(groupKind("g-pro", [PRONAF])).toBe("financing");
    expect(groupKind("g-fre", [FRETE])).toBe("expense");
  });

  it("read Grupo removido and null when the id names nothing, an old key included", () => {
    expect(groupLabel("g-9", [NUTRICAO])).toBe("Grupo removido");
    expect(groupLabel("nutrition", [NUTRICAO])).toBe("Grupo removido");
    expect(groupKind("g-9", [NUTRICAO])).toBeNull();
    expect(groupKind("g-nut", [])).toBeNull();
  });
});
```

`lib/domain/__tests__/entries.test.ts` — **Replace**

```ts
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
```

with

```ts
describe("entryGroup", () => {
  it("puts every kind but a rendimento in the grupo it carries", () => {
    expect(entryGroup({ kind: "expense", category: "g-nut" })).toBe("g-nut");
    expect(entryGroup({ kind: "revenue", category: "g-rec" })).toBe("g-rec");
    expect(entryGroup({ kind: "financing", category: "g-pro" })).toBe("g-pro");
  });

  it("gives a rendimento no grupo", () => {
    expect(entryGroup({ kind: "yield" })).toBeNull();
  });
});
```

`lib/domain/__tests__/moneyRedaction.test.ts` — **Replace**

```ts
    { id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520, seller: "Central", expenseId: "e-2" },
```

with

```ts
    { id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520, seller: "Central" },
```

and **Replace**

```ts
      purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, seller: "Central", expenseId: "e-2" }],
```

with

```ts
      purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, seller: "Central" }],
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts lib/domain/__tests__/entries.test.ts --exclude '**/worktrees/**'`
Expected: FAIL (10 tests) — `groups.test.ts`: `groupsOf`/`groupKind` are not functions, `DEFAULT_GROUPS`/`GROUP_KINDS` are undefined and today's `byGroupName` sorts "Máquinas e veículos" first; `entries.test.ts`: `entryGroup({ kind: "revenue", category: "g-rec" })` answers `"revenue"`.

- [ ] **Step 3: Implement the types and the helpers**

`lib/types.ts` — **Replace**

```ts
/** One purchase of semen doses of a bull; it also became a farm expense. */
export interface SemenPurchase {
  id: string;
  date: string;
  doses: number;
  /** Absent when the server stripped it for a member without Financeiro. */
  totalBrl?: number;
  seller?: string;
  /** Expense this purchase wrote in Financeiro; absent once that expense is gone. */
  expenseId?: string;
}
```

with

```ts
/** One purchase of semen doses of a bull. */
export interface SemenPurchase {
  id: string;
  date: string;
  doses: number;
  /** Absent when the server stripped it for a member without Financeiro. */
  totalBrl?: number;
  seller?: string;
}
```

**Replace**

```ts
/** One of the seven grupos de despesa the app ships with; they never change. */
export type BuiltinCategory = "nutrition" | "pasture" | "labor" | "health" | "breeding" | "admin" | "other";

/** Grupo of a despesa: a BuiltinCategory key or the id of one of the farm's ExpenseGroup. */
export type ExpenseCategory = string;

/** A grupo de despesa the farm created ("Máquinas e veículos"); it counts in the COE like the seven. */
export interface ExpenseGroup {
  id: string;
  name: string;
  /** ISO timestamp; an archived grupo leaves the forms and keeps its history. */
  archivedAt?: string;
  createdAt: string;
}
```

with

```ts
/** Tipo of a grupo do plano: what the money of its lançamentos is. A rendimento has no grupo. */
export type GroupKind = Exclude<EntryKind, "yield">;

/** A grupo of the plano de contas ("Nutrição", "Receitas", "Financiamentos"); every one belongs to the farm. */
export interface PlanGroup {
  id: string;
  kind: GroupKind;
  name: string;
  /** ISO timestamp; an archived grupo leaves the forms and keeps its history. */
  archivedAt?: string;
  createdAt: string;
}

/** Grupo of a lançamento: a PlanGroup id. */
export type ExpenseCategory = string;
```

**Replace**

```ts
/** The three groups outside the resultado that hold contas do plano. */
export type CapitalGroup
```

with

```ts
/** The three kinds outside the resultado. */
export type CapitalGroup
```

**Replace**

```ts
 * money outside the resultado. The table stays `expenses`; vendas, compras and
 * treatment costs are not lançamentos, they derive from the manejos.
```

with

```ts
 * money outside the resultado. The table stays `expenses`; vendas and compras
 * are not lançamentos, they derive from the manejos.
```

**Replace**

```ts
  /** Grupo of a despesa; the other kinds write "other" and nothing reads it. */
  category: ExpenseCategory;
```

with

```ts
  /** Grupo of the lançamento; absent on a rendimento only. */
  category?: ExpenseCategory;
```

**Replace**

```ts
/** Grupo of a conta: "revenue", a CapitalGroup or a despesa grupo (ExpenseCategory). */
export type AccountGroup = string;
```

with

```ts
/** Grupo of a conta: a PlanGroup id. */
export type AccountGroup = string;
```

**Replace**

```ts
  /** Grupos de despesa the farm created, archived ones included; absent in an old snapshot. */
  expenseGroups?: ExpenseGroup[];
```

with

```ts
  /** Every grupo of the plano, archived ones included; absent in an old snapshot. */
  planGroups?: PlanGroup[];
```

`lib/domain/groups.ts` — **Replace the whole file with:**

```ts
/**
 * Grupos of the plano de contas: rows of the farm, each under one fixed tipo
 * (GroupKind), named, archived and deleted by the farmer. Every column that
 * holds a grupo holds its id. Pure.
 */
import type { GroupKind, PlanGroup } from "@/lib/types";

/** Every tipo, in the order the Plano de contas and the tree show them. */
export const GROUP_KINDS: readonly GroupKind[] = ["revenue", "expense", "investment", "financing", "partners"];

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  revenue: "Receitas",
  expense: "Despesas",
  investment: "Investimentos",
  financing: "Financiamentos",
  partners: "Sócios",
};

/** The eleven grupos a farm starts with. */
export const DEFAULT_GROUPS: readonly { kind: GroupKind; name: string }[] = [
  { kind: "revenue", name: "Receitas" },
  { kind: "expense", name: "Nutrição" },
  { kind: "expense", name: "Pastagem" },
  { kind: "expense", name: "Mão de obra" },
  { kind: "expense", name: "Sanidade" },
  { kind: "expense", name: "Reprodução" },
  { kind: "expense", name: "Administrativo" },
  { kind: "expense", name: "Outros" },
  { kind: "investment", name: "Investimentos" },
  { kind: "financing", name: "Financiamentos" },
  { kind: "partners", name: "Sócios" },
];

/** Max length of a grupo name. */
export const GROUP_NAME_MAX = 40;

/** Alphabetical, pt-BR. */
export const byGroupName = (a: PlanGroup, b: PlanGroup): number => a.name.localeCompare(b.name, "pt-BR");

/** The grupos of a tipo by name. Archived ones only with `archived: true`, or the one whose id is `keep` (a row already in it). */
export function groupsOf(
  groups: readonly PlanGroup[],
  kind: GroupKind,
  opts: { archived?: boolean; keep?: string } = {}
): PlanGroup[] {
  return groups
    .filter((g) => g.kind === kind && (opts.archived || g.archivedAt === undefined || g.id === opts.keep))
    .sort(byGroupName);
}

/** Name of a grupo; "Grupo removido" when the id names nothing. */
export function groupLabel(id: string, groups: readonly PlanGroup[]): string {
  return groups.find((g) => g.id === id)?.name ?? "Grupo removido";
}

/** Tipo of a grupo; null when the id names nothing. */
export function groupKind(id: string, groups: readonly PlanGroup[]): GroupKind | null {
  return groups.find((g) => g.id === id)?.kind ?? null;
}
```

`lib/domain/labels.ts` — **Replace**

```ts
import type {
  BuiltinCategory,
  Category,
```

with

```ts
import type {
  Category,
```

and **Replace** (the end of the file)

```ts
  return CATEGORY_LABEL[animal.category];
}

/** Label of each built-in grupo de despesa, e.g.: "Nutrição"; a farm grupo's is its name (lib/domain/groups.ts). */
export const BUILTIN_CATEGORY_LABEL: Record<BuiltinCategory, string> = {
  nutrition: "Nutrição",
  pasture: "Pastagem",
  labor: "Mão de obra",
  health: "Sanidade",
  breeding: "Reprodução",
  admin: "Administrativo",
  other: "Outros",
};
```

with

```ts
  return CATEGORY_LABEL[animal.category];
}
```

`lib/domain/entries.ts` — **Replace**

```ts
/** The three groups outside the resultado that hold contas do plano, in screen order. */
```

with

```ts
/** The three kinds outside the resultado, in screen order. */
```

**Replace**

```ts
/** Investimento, financiamento or sócios: a conta of its own group and a movimento. */
```

with

```ts
/** Investimento, financiamento or sócios: a movimento, with a `flow`. */
```

**Replace**

```ts
/** Grupo of the plano a lançamento sits in; null for a rendimento. */
export function entryGroup(e: { kind: EntryKind; category: ExpenseCategory }): AccountGroup | null {
  if (e.kind === "expense") return e.category;
  if (e.kind === "yield") return null;
  return e.kind;
}
```

with

```ts
/** Grupo of the plano a lançamento sits in; null for a rendimento, which has none. */
export function entryGroup(e: { kind: EntryKind; category?: ExpenseCategory }): AccountGroup | null {
  return e.category ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts lib/domain/__tests__/entries.test.ts lib/domain/__tests__/labels.test.ts lib/domain/__tests__/moneyRedaction.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Schema and migration 0030

- [ ] **Step 5: Change the schema**

`lib/db/schema.ts` — **Replace**

```ts
/** Movimento of an investment, financing or partners lançamento. */
export const entryFlowEnum = pgEnum("entry_flow", ["in", "out"]);
```

with

```ts
/** Movimento of an investment, financing or partners lançamento. */
export const entryFlowEnum = pgEnum("entry_flow", ["in", "out"]);

/** Tipo of a grupo of the plano de contas (lib/types.ts GroupKind): every entry kind but yield. */
export const planGroupKindEnum = pgEnum("plan_group_kind", [
  "revenue",
  "expense",
  "investment",
  "financing",
  "partners",
]);
```

**Replace**

```ts
/** One purchase of semen doses of a bull, written together with its expense. */
```

with

```ts
/** One purchase of semen doses of a bull: stock for Touros, not a lançamento. */
```

**Replace**

```ts
    /** Fornecedor, free text: they are outside the farm. */
    seller: text("seller"),
    /** Expense the purchase wrote in Financeiro; nulls out if that row goes. */
    expenseId: text("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
  },
```

with

```ts
    /** Fornecedor, free text: they are outside the farm. */
    seller: text("seller"),
  },
```

**Replace**

```ts
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
```

with

```ts
/**
 * A grupo of the plano de contas. Every grupo is the farm's; `kind` says what
 * its lançamentos are. The columns that hold a grupo (`accounts.group`,
 * `expenses.category`, `expense_series.category`, `budgets.category`) are text
 * ids with no FK: the API checks the grupo.
 */
export const planGroups = pgTable(
  "plan_groups",
  {
    id: text("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    kind: planGroupKindEnum("kind").notNull(),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Names are unique per farm ignoring case, across every tipo.
  (t) => [uniqueIndex("plan_groups_farm_name_idx").on(t.farmId, sql`lower(${t.name})`)]
);
```

**Replace**

```ts
    /** "revenue", a capital grupo, a built-in despesa key or an expense_groups id. */
    group: text("group").$type<AccountGroup>().notNull(),
```

with

```ts
    /** A plan_groups id, of any tipo. */
    group: text("group").$type<AccountGroup>().notNull(),
```

**Replace** (in `expenseSeries`)

```ts
    flow: entryFlowEnum("flow"),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
```

with

```ts
    flow: entryFlowEnum("flow"),
    /** A plan_groups id of the série's kind (a série is never a rendimento). */
    category: text("category").$type<ExpenseCategory>().notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
```

**Replace**

```ts
/**
 * A lançamento: one line of money the farm typed, a despesa or a receita
 * (costs outside the sanitary treatments, revenue outside the vendas).
 */
```

with

```ts
/**
 * A lançamento: one line of money the farm typed. Vendas and compras of gado
 * derive from the manejos; a tratamento's cost stays on the tratamento.
 */
```

**Replace**

```ts
    /** Grupo of a despesa (a built-in key or an expense_groups id); the other kinds write "other" and nothing reads it. */
    category: text("category").$type<ExpenseCategory>().notNull(),
```

with

```ts
    /** Grupo of the lançamento, a plan_groups id of its kind; null on a rendimento. */
    category: text("category").$type<ExpenseCategory>(),
```

**Replace** (in `budgets`)

```ts
    category: text("category").$type<ExpenseCategory>().notNull(),
    /** Null = the grupo's own line; removing the conta removes its lines. */
```

with

```ts
    /** A plan_groups id of kind expense. */
    category: text("category").$type<ExpenseCategory>().notNull(),
    /** Null = the grupo's own line; removing the conta removes its lines. */
```

**Replace**

```ts
export type ExpenseGroupRow = typeof expenseGroups.$inferSelect;
```

with

```ts
export type PlanGroupRow = typeof planGroups.$inferSelect;
```

Check: `grep -n "expense_groups\|expenseGroups\|ExpenseGroupRow" lib/db/schema.ts` prints nothing.

- [ ] **Step 6: Generate the migration**

The journal ends at `"idx": 29, "tag": "0029_drop-health-protocols"`; the next entry must be idx 30. There is no TTY in the sandbox and drizzle-kit asks "Is plan_groups table created or renamed from another table?"; feed it an Enter through `script` (it picks the first option, "create table", which is fine: the SQL body is replaced by hand in Step 7, and the snapshot only describes the end state). It needs no `DATABASE_URL`.

Run: `(sleep 6; printf '\r') | timeout 90 script -qfec "./node_modules/.bin/drizzle-kit generate --name grupos-livres" /dev/null`
Expected: lists `plan_groups 6 columns 1 indexes 1 fks` and `semen_purchases 6 columns 1 indexes 1 fks`, and ends with `Your SQL migration file ➜ drizzle/0030_grupos-livres.sql`.

Check: `git status --short drizzle/` shows exactly `M drizzle/meta/_journal.json`, `?? drizzle/0030_grupos-livres.sql`, `?? drizzle/meta/0030_snapshot.json`; and `grep -n '"tag"' drizzle/meta/_journal.json | tail -1` prints `"tag": "0030_grupos-livres",` with `"idx": 30` two lines above it. If any other file was created, delete it and its journal entry. The generated SQL creates `plan_groups` and drops `expense_groups` (it would lose every farm grupo): it must not survive Step 7.

- [ ] **Step 7: Replace the generated SQL with the hand-written one**

The statements are exactly the spec's Data section, in its order; each is followed by `--> statement-breakpoint` except the last (drizzle's own format: a trailing marker would hand the migrator an empty statement). `drizzle-kit migrate` runs the whole migration in one transaction. Dropping `semen_purchases.expense_id` drops its FK with it. Replace the whole content of `drizzle/0030_grupos-livres.sql` with:

```sql
create type plan_group_kind as enum ('revenue','expense','investment','financing','partners');--> statement-breakpoint
alter table expense_groups rename to plan_groups;--> statement-breakpoint
alter index expense_groups_farm_name_idx rename to plan_groups_farm_name_idx;--> statement-breakpoint
alter table plan_groups rename constraint expense_groups_farm_id_farm_id_fk to plan_groups_farm_id_farm_id_fk;--> statement-breakpoint
alter table plan_groups add column kind plan_group_kind not null default 'expense';--> statement-breakpoint
alter table plan_groups alter column kind drop default;--> statement-breakpoint
alter table plan_groups add column legacy_key text;--> statement-breakpoint
insert into plan_groups (id, farm_id, kind, name, legacy_key)
select gen_random_uuid()::text, f.id, k.kind::plan_group_kind, k.name, k.key
from farm f cross join (values
  ('revenue','revenue','Receitas'),
  ('nutrition','expense','Nutrição'), ('pasture','expense','Pastagem'),
  ('labor','expense','Mão de obra'), ('health','expense','Sanidade'),
  ('breeding','expense','Reprodução'), ('admin','expense','Administrativo'),
  ('other','expense','Outros'),
  ('investment','investment','Investimentos'),
  ('financing','financing','Financiamentos'),
  ('partners','partners','Sócios')
) as k(key, kind, name);--> statement-breakpoint
update accounts a set "group" = g.id
  from plan_groups g where g.farm_id = a.farm_id and g.legacy_key = a."group";--> statement-breakpoint
update expenses e set category = g.id
  from plan_groups g where g.farm_id = e.farm_id and e.kind <> 'yield'
  and g.legacy_key = case when e.kind = 'expense' then e.category else e.kind::text end;--> statement-breakpoint
update expense_series s set category = g.id
  from plan_groups g where g.farm_id = s.farm_id
  and g.legacy_key = case when s.kind = 'expense' then s.category else s.kind::text end;--> statement-breakpoint
update budgets b set category = g.id
  from plan_groups g where g.farm_id = b.farm_id and g.legacy_key = b.category;--> statement-breakpoint
alter table expenses alter column category drop not null;--> statement-breakpoint
update expenses set category = null where kind = 'yield';--> statement-breakpoint
alter table plan_groups drop column legacy_key;--> statement-breakpoint
alter table semen_purchases drop column expense_id;
```

Check: `grep -c "statement-breakpoint" drizzle/0030_grupos-livres.sql` prints `15` (16 statements). Leave `drizzle/meta/0030_snapshot.json` and `_journal.json` as generated.

- [ ] **Step 8: Confirm the schema and the snapshot agree**

Run: `(sleep 6; printf '\r') | timeout 90 script -qfec "./node_modules/.bin/drizzle-kit generate --name should-be-empty" /dev/null`
Expected: `No schema changes, nothing to migrate`, and `git status --short drizzle/` unchanged from Step 6 (delete anything it made). The renamed table keeps its primary key constraint name `expense_groups_pkey`; drizzle's snapshot does not track it, so this is expected and harmless. Task 8 applies the migration to a real database.

---

#### Mappers and the load

- [ ] **Step 9: Write the failing tests**

`lib/api/__tests__/mappers.test.ts` — **Replace**

```ts
 * toExpenseGroup: a farm grupo with its dates in ISO, archivedAt only once archived.
```

with

```ts
 * toPlanGroup: a grupo with its tipo and its dates in ISO, archivedAt only once archived.
```

**Replace**

```ts
import { toAccount, toBankAccount, toBudget, toExpense, toExpenseGroup, toFarmData } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseGroupRow,
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
  FarmRow,
} from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
  date: "2026-09-27",
  category: "nutrition",
```

with

```ts
import { toAccount, toBankAccount, toBudget, toExpense, toFarmData, toPlanGroup } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
  FarmRow,
  PlanGroupRow,
} from "@/lib/db/schema";

const ROW: ExpenseRow = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
  date: "2026-09-27",
  category: "g-nut",
```

**Replace**

```ts
    expect(toExpense({ ...ROW, kind: "financing", flow: "in" })).toMatchObject({ kind: "financing", flow: "in" });
    expect(toExpense(ROW).flow).toBeUndefined();
  });
});
```

with

```ts
    expect(toExpense({ ...ROW, kind: "financing", flow: "in" })).toMatchObject({ kind: "financing", flow: "in" });
    expect(toExpense(ROW).flow).toBeUndefined();
  });

  it("carries the grupo, and none on a rendimento", () => {
    expect(toExpense(ROW).category).toBe("g-nut");
    const rendimento = toExpense({ ...ROW, kind: "yield", category: null });
    expect(rendimento).toMatchObject({ kind: "yield", amountBrl: 4000 });
    expect(rendimento.category).toBeUndefined();
  });
});
```

**Replace**

```ts
describe("toExpenseGroup", () => {
  it("dates the grupo in ISO and leaves archivedAt out while it is active", () => {
    const row: ExpenseGroupRow = {
      id: "g-1",
      farmId: 7,
      name: "Máquinas e veículos",
      archivedAt: null,
      createdAt: new Date("2026-10-01T12:00:00Z"),
    };
    expect(toExpenseGroup(row)).toEqual({
      id: "g-1",
      name: "Máquinas e veículos",
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    expect(toExpenseGroup({ ...row, archivedAt: new Date("2026-10-03T09:00:00Z") }).archivedAt).toBe(
```

with

```ts
describe("toPlanGroup", () => {
  it("carries the tipo, dates the grupo in ISO and leaves archivedAt out while it is active", () => {
    const row: PlanGroupRow = {
      id: "g-1",
      farmId: 7,
      kind: "financing",
      name: "Pronaf",
      archivedAt: null,
      createdAt: new Date("2026-10-01T12:00:00Z"),
    };
    expect(toPlanGroup(row)).toEqual({
      id: "g-1",
      kind: "financing",
      name: "Pronaf",
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    expect(toPlanGroup({ ...row, archivedAt: new Date("2026-10-03T09:00:00Z") }).archivedAt).toBe(
```

`lib/api/domains/herd/useCases/__tests__/Load.test.ts` — **Replace the whole file with:**

```ts
/**
 * loadHerd: every grupo of the plano travels with the herd, archived ones
 * included, by name; the contas come by name (the client groups them).
 *
 * A db stub keyed by table: every select resolves to the rows queued for the
 * table it reads `from`, and records its `orderBy`. The recorrências top-up is
 * stubbed out.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { accounts, planGroups } from "@/lib/db/schema";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows a select resolves to, by the table it reads from. */
    rows: new Map<unknown, unknown[]>(),
    /** The orderBy of the select on each table. */
    orderBys: new Map<unknown, SQL[]>(),
  },
}));

function selectBuilder() {
  let table: unknown;
  const builder = {
    from: (from: unknown) => {
      table = from;
      return builder;
    },
    innerJoin: () => builder,
    where: () => builder,
    groupBy: () => builder,
    orderBy: (...columns: SQL[]) => {
      state.orderBys.set(table, columns);
      return builder;
    },
    then: (resolve: (rows: unknown[]) => unknown) => resolve(state.rows.get(table) ?? []),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder } }));
vi.mock("@/lib/api/domains/expenses/useCases/TopUpSeries.useCase", () => ({
  TopUpSeriesUseCase: class {
    run = () => Promise.resolve();
  },
}));

import { LoadHerdUseCase } from "../Load.useCase";

const orderOf = (table: unknown) => (state.orderBys.get(table) ?? []).map((column) => renderSql(column).sql);

beforeEach(() => {
  state.rows.clear();
  state.orderBys.clear();
});

describe("loadHerd", () => {
  it("returns every grupo of the farm with its tipo, archived ones included, by name", async () => {
    state.rows.set(planGroups, [
      {
        id: "g-1",
        farmId: 7,
        kind: "expense",
        name: "Frete",
        archivedAt: new Date("2026-10-03T12:00:00Z"),
        createdAt: new Date("2026-10-01T12:00:00Z"),
      },
      { id: "g-2", farmId: 7, kind: "revenue", name: "Receitas", archivedAt: null, createdAt: new Date("2026-09-15T12:00:00Z") },
    ]);

    const data = await new LoadHerdUseCase().run({ farmId: 7 });

    expect(data.planGroups).toEqual([
      {
        id: "g-1",
        kind: "expense",
        name: "Frete",
        archivedAt: "2026-10-03T12:00:00.000Z",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      { id: "g-2", kind: "revenue", name: "Receitas", createdAt: "2026-09-15T12:00:00.000Z" },
    ]);
    expect(orderOf(planGroups)).toEqual(['"plan_groups"."name" asc']);
  });

  it("is no grupos for a farm that has none", async () => {
    expect((await new LoadHerdUseCase().run({ farmId: 7 })).planGroups).toEqual([]);
  });

  it("lists the contas by name: a grupo key no longer sorts them", async () => {
    await new LoadHerdUseCase().run({ farmId: 7 });

    expect(orderOf(accounts)).toEqual(['"accounts"."name" asc']);
  });
});
```

- [ ] **Step 10: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `toPlanGroup is not a function`; `toExpense` answers `category: null` for the rendimento; the three `Load.test.ts` cases throw `Cannot read properties of undefined (reading 'farmId')` (the load still selects from `expenseGroups`, which the schema no longer exports).

- [ ] **Step 11: Implement**

`lib/api/mappers.ts` — **Replace**

```ts
  Expense,
  ExpenseGroup,
  FarmData,
```

with

```ts
  Expense,
  FarmData,
```

**Replace**

```ts
  ManejoTreatmentPlan,
  Movement,
  PregnancyDiagnosis,
```

with

```ts
  ManejoTreatmentPlan,
  Movement,
  PlanGroup,
  PregnancyDiagnosis,
```

**Replace**

```ts
  CustomCategoryRow,
  ExpenseGroupRow,
  ExpenseRow,
```

with

```ts
  CustomCategoryRow,
  ExpenseRow,
```

**Replace**

```ts
  MovementRow,
  PregnancyDiagnosisRow,
```

with

```ts
  MovementRow,
  PlanGroupRow,
  PregnancyDiagnosisRow,
```

**Replace**

```ts
    seller: orNothing(row.seller),
    expenseId: orNothing(row.expenseId),
```

with

```ts
    seller: orNothing(row.seller),
```

**Replace** (in `toExpense`)

```ts
    date: row.date,
    category: row.category,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
    dueDate: orNothing(row.dueDate),
```

with

```ts
    date: row.date,
    category: orNothing(row.category),
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
    dueDate: orNothing(row.dueDate),
```

**Replace**

```ts
export function toExpenseGroup(row: ExpenseGroupRow): ExpenseGroup {
  return {
    id: row.id,
    name: row.name,
```

with

```ts
export function toPlanGroup(row: PlanGroupRow): PlanGroup {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
```

`lib/api/domains/herd/useCases/Load.useCase.ts` — **Replace**

```ts
  customCategories,
  expenseGroups,
  expenseSeries,
```

with

```ts
  customCategories,
  expenseSeries,
```

**Replace**

```ts
  movements,
  pregnancyDiagnoses,
  semenBulls,
```

with

```ts
  movements,
  planGroups,
  pregnancyDiagnoses,
  semenBulls,
```

**Replace**

```ts
  toExpense,
  toExpenseGroup,
  toFarmData,
```

with

```ts
  toExpense,
  toFarmData,
```

**Replace**

```ts
  toMovement,
  toSemenBull,
```

with

```ts
  toMovement,
  toPlanGroup,
  toSemenBull,
```

**Replace**

```ts
      reconciledRows,
      expenseGroupRows,
    ] = await Promise.all([
```

with

```ts
      reconciledRows,
      planGroupRows,
    ] = await Promise.all([
```

**Replace**

```ts
      this.repository
        .select()
        .from(expenseGroups)
        .where(eq(expenseGroups.farmId, farmId))
        .orderBy(asc(expenseGroups.createdAt), asc(expenseGroups.name)),
```

with

```ts
      this.repository
        .select()
        .from(planGroups)
        .where(eq(planGroups.farmId, farmId))
        .orderBy(asc(planGroups.name)),
```

**Replace**

```ts
      expenseGroups: expenseGroupRows.map(toExpenseGroup),
```

with

```ts
      planGroups: planGroupRows.map(toPlanGroup),
```

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### The eleven grupos of a new farm

- [ ] **Step 13: Write the failing tests**

`lib/api/domains/farm/useCases/__tests__/Create.test.ts` — **Replace the whole file with:**

```ts
/** createFarm: a farm the caller owns with the default grupos, optionally started from a farm they belong to. */
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
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import { CreateFarmUseCase } from "../Create.useCase";

const input = { userId: "u-lucas", name: " Fazenda Boa Vista ", municipality: "Sorriso - MT " };

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
  state.wheres = [];
});

describe("createFarm", () => {
  it("refuses an invalid farm before touching the database", async () => {
    const result = await new CreateFarmUseCase().run({ ...input, name: "  " });
    expect(result).toEqual({ invalid: "name_required" });
    expect(state.inserts).toEqual([]);
  });

  it("creates the farm with trimmed fields, the caller as Dono and the eleven default grupos", async () => {
    state.returning = [[{ id: 42 }]];
    const result = await new CreateFarmUseCase().run(input);
    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts).toEqual([
      { name: "Fazenda Boa Vista", municipality: "Sorriso - MT", stateRegistration: "", manager: "" },
      { farmId: 42, userId: "u-lucas", role: "owner" },
      DEFAULT_GROUPS.map(({ kind, name }) => ({ id: expect.any(String), farmId: 42, kind, name })),
    ]);
  });

  it("refuses a source farm the caller does not belong to", async () => {
    state.selectResults = [[]];
    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(result).toBe("not_a_member");
    expect(state.inserts).toEqual([]);
    const source = renderSql(state.wheres[0] as SQL);
    expect(source.sql).toContain('"farm"."deleted_at" is null');
    expect(source.params).toEqual(expect.arrayContaining([7, "u-lucas"]));
  });

  it("copies raças, categorias and the active grupos with fresh ids, instead of the defaults", async () => {
    state.selectResults = [
      [{ farmId: 7 }],
      [{ name: "Nelore" }, { name: "Angus" }],
      [{ name: "Matriz", baseCategory: "cow" }],
      [
        { kind: "expense", name: "Alimentação" },
        { kind: "revenue", name: "Receitas" },
      ],
    ];
    state.returning = [[{ id: 42 }]];

    const result = await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });

    expect(result).toEqual({ farmId: 42 });
    expect(state.inserts.slice(2)).toEqual([
      [
        { farmId: 42, name: "Nelore" },
        { farmId: 42, name: "Angus" },
      ],
      [{ id: expect.any(String), farmId: 42, name: "Matriz", baseCategory: "cow" }],
      [
        { id: expect.any(String), farmId: 42, kind: "expense", name: "Alimentação" },
        { id: expect.any(String), farmId: 42, kind: "revenue", name: "Receitas" },
      ],
    ]);
    // Only the source farm's grupos that are not archived.
    const grupos = renderSql(state.wheres.at(-1) as SQL);
    expect(grupos.sql).toContain('"plan_groups"."archived_at" is null');
    expect(grupos.params).toEqual([7]);
  });

  it("skips a kind the source does not have", async () => {
    state.selectResults = [[{ farmId: 7 }], [{ name: "Nelore" }], [], []];
    state.returning = [[{ id: 42 }]];
    await new CreateFarmUseCase().run({ ...input, copyFromFarmId: 7 });
    expect(state.inserts).toHaveLength(3);
  });
});
```

`lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts` — new file:

```ts
/** ensureFarmForUser: a user's first access creates their farm with the eleven default grupos, once. */
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

import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import { EnsureFarmForUserUseCase } from "../EnsureForUser.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.returning = [];
});

describe("ensureFarmForUser", () => {
  it("creates an empty farm with the caller as Dono and the eleven default grupos", async () => {
    state.selectResults = [[]];
    state.returning = [[{ id: 42 }]];

    expect(await new EnsureFarmForUserUseCase().run({ userId: "u-lucas" })).toBe(42);

    expect(state.inserts).toEqual([
      { name: "", municipality: "", stateRegistration: "", manager: "" },
      { farmId: 42, userId: "u-lucas", role: "owner" },
      DEFAULT_GROUPS.map(({ kind, name }) => ({ id: expect.any(String), farmId: 42, kind, name })),
    ]);
  });

  it("answers the farm the user already has and writes nothing", async () => {
    state.selectResults = [[{ farmId: 7 }]];

    expect(await new EnsureFarmForUserUseCase().run({ userId: "u-lucas" })).toBe(7);
    expect(state.inserts).toEqual([]);
  });
});
```

- [ ] **Step 14: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/farm/useCases/__tests__/Create.test.ts lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the inserts stop after the `farmUsers` row (no grupos written), in both files.

- [ ] **Step 15: Implement**

`lib/api/domains/planGroups/seed.ts` — new file (the rest of the folder arrives in task 2):

```ts
import { randomUUID } from "node:crypto";

import { planGroups, type PlanGroupRow } from "@/lib/db/schema";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import type { GroupKind } from "@/lib/types";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/** Writes a farm's starting grupos: the eleven defaults, or the list given (a farm copied from another). */
export async function seedPlanGroups(
  repo: RepositoryType,
  farmId: number,
  groups: readonly { kind: GroupKind; name: string }[] = DEFAULT_GROUPS
): Promise<PlanGroupRow[]> {
  if (groups.length === 0) return [];
  return repo
    .insert(planGroups)
    .values(groups.map(({ kind, name }) => ({ id: randomUUID(), farmId, kind, name })))
    .returning();
}
```

`lib/api/domains/farm/useCases/Create.useCase.ts` — **Replace**

```ts
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { breeds, customCategories, farm, farmUsers } from "@/lib/db/schema";
import { validateNewFarm, type NewFarmProblem } from "@/lib/domain/farms";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

with

```ts
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { breeds, customCategories, farm, farmUsers, planGroups } from "@/lib/db/schema";
import { validateNewFarm, type NewFarmProblem } from "@/lib/domain/farms";
import { seedPlanGroups } from "@/lib/api/domains/planGroups/seed";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

**Replace**

```ts
  /** The open farm whose raças and categorias the new farm starts with. */
```

with

```ts
  /** The open farm whose raças, categorias and grupos the new farm starts with. */
```

**Replace**

```ts
/**
 * A new farm owned by the caller, named at creation. With a source farm it
 * starts with that farm's raças and categorias under fresh ids — never its animals, lotes, invernadas, touros or equipe. The
```

with

```ts
/**
 * A new farm owned by the caller, named at creation, with the eleven default
 * grupos of the plano. With a source farm it starts instead with that farm's
 * raças, categorias and active grupos under fresh ids — never its animals,
 * lotes, invernadas, touros, contas or equipe. The
```

**Replace**

```ts
      if (copyFromFarmId !== undefined) await copySetup(tx, copyFromFarmId, created.id);
      return { farmId: created.id };
```

with

```ts
      if (copyFromFarmId !== undefined) await copySetup(tx, copyFromFarmId, created.id);
      else await seedPlanGroups(tx, created.id);
      return { farmId: created.id };
```

**Replace** (the end of `copySetup`, the end of the file)

```ts
      .values(categoryRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }
}
```

with

```ts
      .values(categoryRows.map((row) => ({ id: randomUUID(), farmId: to, ...row })));
  }

  const groupRows = await tx
    .select({ kind: planGroups.kind, name: planGroups.name })
    .from(planGroups)
    .where(and(eq(planGroups.farmId, from), isNull(planGroups.archivedAt)))
    .orderBy(asc(planGroups.name));
  await seedPlanGroups(tx, to, groupRows);
}
```

`lib/api/domains/farm/useCases/EnsureForUser.useCase.ts` — **Replace**

```ts
import { farm, farmUsers } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

with

```ts
import { farm, farmUsers } from "@/lib/db/schema";
import { seedPlanGroups } from "@/lib/api/domains/planGroups/seed";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

**Replace**

```ts
 * Returns the id of the user's first live farm, creating an empty farm (with the
 * user as owner) when none exists. Field defaults mirror the empty FarmData
 * the store starts with.
```

with

```ts
 * Returns the id of the user's first live farm, creating an empty farm (with the
 * user as owner and the eleven default grupos) when none exists. Field
 * defaults mirror the empty FarmData the store starts with.
```

**Replace**

```ts
      await tx
        .insert(farmUsers)
        .values({ farmId: created.id, userId, role: "owner" });
      return created.id;
```

with

```ts
      await tx
        .insert(farmUsers)
        .values({ farmId: created.id, userId, role: "owner" });
      await seedPlanGroups(tx, created.id);
      return created.id;
```

- [ ] **Step 16: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/farm/useCases/__tests__/Create.test.ts lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts --exclude '**/worktrees/**'`
Expected: PASS (5 + 2 tests)

---

#### Seed data and the seed CLI

- [ ] **Step 17: Write the failing test**

`lib/data/__tests__/seed.test.ts` — **Replace**

```ts
import { generateInitialData, SEED_TODAY_ISO as TODAY_ISO } from "@/lib/data/seed";
```

with

```ts
import { generateInitialData, SEED_GROUPS, SEED_TODAY_ISO as TODAY_ISO } from "@/lib/data/seed";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
```

**Replace**

```ts
    for (const category of [
      "nutrition", "pasture", "labor", "health", "breeding", "admin", "other",
    ]) {
```

with

```ts
    for (const category of [
      "grp-nutricao", "grp-pastagem", "grp-mao-de-obra", "grp-sanidade", "grp-reproducao", "grp-administrativo", "grp-outros",
    ]) {
```

**Replace**

```ts
  it("points every lançamento at a conta of its own grupo and at a seeded lote", () => {
```

with

```ts
  it("seeds the eleven default grupos and points every conta and lançamento at one of its kind", () => {
    expect(data.planGroups?.map(({ kind, name }) => ({ kind, name }))).toEqual(DEFAULT_GROUPS);
    const kindOf = new Map(SEED_GROUPS.map((g) => [g.id, g.kind]));
    for (const a of data.accounts) expect(kindOf.has(a.group)).toBe(true);
    for (const e of data.expenses) {
      if (e.kind === "yield") expect(e.category).toBeUndefined();
      else expect(kindOf.get(e.category ?? "")).toBe(e.kind);
    }
  });

  it("points every lançamento at a conta of its own grupo and at a seeded lote", () => {
```

**Replace**

```ts
        expect(groupOf.get(e.accountId)).toBe(e.kind === "revenue" ? "revenue" : e.category);
```

with

```ts
        expect(groupOf.get(e.accountId)).toBe(e.category);
```

- [ ] **Step 18: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/data/__tests__/seed.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `SEED_GROUPS` is undefined, `data.planGroups` is undefined, and the expense book has no `grp-*` category.

- [ ] **Step 19: Implement**

`lib/data/seed.ts` — **Replace**

```ts
  ManejoSession,
  Movement,
  Weighing,
```

with

```ts
  ManejoSession,
  Movement,
  PlanGroup,
  Weighing,
```

**Replace**

```ts
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
  { id: "acc-investment-benfeitorias", group: "investment", name: "Benfeitorias" },
  { id: "acc-investment-maquinas-e-implementos", group: "investment", name: "Máquinas e implementos" },
  { id: "acc-investment-equipamentos", group: "investment", name: "Equipamentos" },
  { id: "acc-partners-distribuicao-de-lucro", group: "partners", name: "Distribuição de lucro" },
];
```

with

```ts
/** The eleven default grupos (DEFAULT_GROUPS in lib/domain/groups.ts), with fixed ids the seed points at. */
export const SEED_GROUPS: readonly PlanGroup[] = [
  { id: "grp-receitas", kind: "revenue", name: "Receitas", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-nutricao", kind: "expense", name: "Nutrição", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-pastagem", kind: "expense", name: "Pastagem", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-mao-de-obra", kind: "expense", name: "Mão de obra", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-sanidade", kind: "expense", name: "Sanidade", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-reproducao", kind: "expense", name: "Reprodução", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-administrativo", kind: "expense", name: "Administrativo", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-outros", kind: "expense", name: "Outros", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-investimentos", kind: "investment", name: "Investimentos", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-financiamentos", kind: "financing", name: "Financiamentos", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-socios", kind: "partners", name: "Sócios", createdAt: "2025-07-01T12:00:00.000Z" },
];

/**
 * The farm's plano de contas: the standard list, with fixed ids so the seed
 * expenses can point at them. Mirrors DEFAULT_ACCOUNTS in lib/domain/accounts.ts.
 */
const SEED_ACCOUNTS: readonly Account[] = [
  { id: "acc-revenue-aluguel-de-pasto", group: "grp-receitas", name: "Aluguel de pasto" },
  { id: "acc-revenue-venda-de-esterco", group: "grp-receitas", name: "Venda de esterco" },
  { id: "acc-revenue-outras-receitas", group: "grp-receitas", name: "Outras receitas" },
  { id: "acc-nutrition-sal-mineral", group: "grp-nutricao", name: "Sal mineral" },
  { id: "acc-nutrition-racao-e-suplemento", group: "grp-nutricao", name: "Ração e suplemento" },
  { id: "acc-nutrition-silagem", group: "grp-nutricao", name: "Silagem" },
  { id: "acc-pasture-adubo", group: "grp-pastagem", name: "Adubo" },
  { id: "acc-pasture-sementes", group: "grp-pastagem", name: "Sementes" },
  { id: "acc-pasture-herbicida", group: "grp-pastagem", name: "Herbicida" },
  { id: "acc-pasture-rocada", group: "grp-pastagem", name: "Roçada" },
  { id: "acc-labor-salarios", group: "grp-mao-de-obra", name: "Salários" },
  { id: "acc-labor-encargos", group: "grp-mao-de-obra", name: "Encargos" },
  { id: "acc-labor-diarias", group: "grp-mao-de-obra", name: "Diárias" },
  { id: "acc-health-vacinas", group: "grp-sanidade", name: "Vacinas" },
  { id: "acc-health-vermifugos", group: "grp-sanidade", name: "Vermífugos" },
  { id: "acc-health-medicamentos", group: "grp-sanidade", name: "Medicamentos" },
  { id: "acc-health-veterinario", group: "grp-sanidade", name: "Veterinário" },
  { id: "acc-breeding-semen", group: "grp-reproducao", name: "Sêmen" },
  { id: "acc-breeding-iatf-e-hormonios", group: "grp-reproducao", name: "IATF e hormônios" },
  { id: "acc-breeding-touros", group: "grp-reproducao", name: "Touros" },
  { id: "acc-admin-energia", group: "grp-administrativo", name: "Energia" },
  { id: "acc-admin-combustivel", group: "grp-administrativo", name: "Combustível" },
  { id: "acc-admin-manutencao", group: "grp-administrativo", name: "Manutenção" },
  { id: "acc-admin-impostos-e-taxas", group: "grp-administrativo", name: "Impostos e taxas" },
  { id: "acc-admin-contabilidade", group: "grp-administrativo", name: "Contabilidade" },
  { id: "acc-investment-benfeitorias", group: "grp-investimentos", name: "Benfeitorias" },
  { id: "acc-investment-maquinas-e-implementos", group: "grp-investimentos", name: "Máquinas e implementos" },
  { id: "acc-investment-equipamentos", group: "grp-investimentos", name: "Equipamentos" },
  { id: "acc-partners-distribuicao-de-lucro", group: "grp-socios", name: "Distribuição de lucro" },
];
```

**Replace**

```ts
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
```

with

```ts
  { date: "2025-09-15", category: "grp-pastagem", amountBrl: 2900, notes: "Adubação das pastagens", accountId: "acc-pasture-adubo" },
  { date: "2026-01-20", category: "grp-pastagem", amountBrl: 1400, notes: "Sementes de braquiária", accountId: "acc-pasture-sementes" },
  { date: "2026-03-18", category: "grp-pastagem", amountBrl: 1650, notes: "Roçada e reparo de cercas", accountId: "acc-pasture-rocada" },
  { date: "2026-06-10", category: "grp-pastagem", amountBrl: 900 },
  { date: "2025-11-05", category: "grp-reproducao", amountBrl: 2100, notes: "Protocolo IATF", accountId: "acc-breeding-iatf-e-hormonios", lotId: "lot-1" },
  { date: "2026-01-15", category: "grp-reproducao", amountBrl: 1300, notes: "Doses de sêmen", accountId: "acc-breeding-semen", lotId: "lot-1" },
  { date: "2025-10-12", category: "grp-sanidade", amountBrl: 850, notes: "Consulta veterinária", accountId: "acc-health-veterinario", lotId: "lot-3" },
  { date: "2026-02-08", category: "grp-sanidade", amountBrl: 620 },
  { date: "2026-05-11", category: "grp-sanidade", amountBrl: 1200, notes: "Campanha de aftosa", accountId: "acc-health-vacinas" },
  { date: "2025-12-18", category: "grp-outros", amountBrl: 700, notes: "Combustível" },
  { date: "2026-04-22", category: "grp-outros", amountBrl: 540 },
```

**Replace**

```ts
    kind: "revenue", date: "2026-08-12", category: "other", amountBrl: 1800,
```

with

```ts
    kind: "revenue", date: "2026-08-12", category: "grp-receitas", amountBrl: 1800,
```

**Replace**

```ts
    kind: "revenue", date: "2026-09-05", category: "other", amountBrl: 6400,
```

with

```ts
    kind: "revenue", date: "2026-09-05", category: "grp-receitas", amountBrl: 6400,
```

**Replace**

```ts
    kind: "expense", date: "2026-09-10", dueDate: "2026-09-30", category: "labor",
```

with

```ts
    kind: "expense", date: "2026-09-10", dueDate: "2026-09-30", category: "grp-mao-de-obra",
```

**Replace**

```ts
    kind: "expense", date: "2026-09-18", dueDate: "2026-09-18", category: "nutrition",
```

with

```ts
    kind: "expense", date: "2026-09-18", dueDate: "2026-09-18", category: "grp-nutricao",
```

**Replace**

```ts
    kind: "expense", date: "2026-09-20", dueDate: "2026-09-28", category: "admin",
```

with

```ts
    kind: "expense", date: "2026-09-20", dueDate: "2026-09-28", category: "grp-administrativo",
```

**Replace** (in `buildExpenses`)

```ts
      date: `${month}-05`,
      category: "nutrition",
```

with

```ts
      date: `${month}-05`,
      category: "grp-nutricao",
```

**Replace**

```ts
      date: `${month}-01`,
      category: "labor",
```

with

```ts
      date: `${month}-01`,
      category: "grp-mao-de-obra",
```

**Replace**

```ts
    rows.push({ date: `${month}-10`, category: "admin", amountBrl: ADMIN_MONTHLY });
```

with

```ts
    rows.push({ date: `${month}-10`, category: "grp-administrativo", amountBrl: ADMIN_MONTHLY });
```

**Replace**

```ts
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
```

with

```ts
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
    planGroups: SEED_GROUPS.map((group) => ({ ...group })),
```

Check: `grep -nE '(group|category): "(revenue|nutrition|pasture|labor|health|breeding|admin|other|investment|financing|partners)"' lib/data/seed.ts` prints nothing.

`cli/seedCli.ts` (every seed id is remapped to a fresh uuid; the grupos too, before the contas that point at them) — **Replace**

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
```

with

```ts
      const groups = data.planGroups ?? [];
      const groupIdMap = new Map(groups.map((g) => [g.id, randomUUID()]));
      if (groups.length > 0) {
        await tx.insert(schema.planGroups).values(
          groups.map((g) => ({ id: groupIdMap.get(g.id)!, farmId, kind: g.kind, name: g.name }))
        );
      }

      const accountIdMap = new Map(data.accounts.map((a) => [a.id, randomUUID()]));
      if (data.accounts.length > 0) {
        await tx.insert(schema.accounts).values(
          data.accounts.map((a) => ({
            id: accountIdMap.get(a.id)!,
            farmId,
            group: groupIdMap.get(a.group)!,
            name: a.name,
          }))
        );
      }
```

**Replace**

```ts
            date: e.date,
            category: e.category,
            amountBrl: e.amountBrl,
```

with

```ts
            date: e.date,
            category: e.category === undefined ? undefined : groupIdMap.get(e.category)!,
            amountBrl: e.amountBrl,
```

**Replace**

```ts
          `${data.accounts.length} accounts, ` +
```

with

```ts
          `${groups.length} grupos, ${data.accounts.length} accounts, ` +
```

- [ ] **Step 20: Run the test**

Run: `./node_modules/.bin/vitest run lib/data/__tests__/seed.test.ts --exclude '**/worktrees/**'`
Expected: PASS (20 tests)

---

#### Store: the `planGroups` field (Review Focus 6, store half)

- [ ] **Step 21: Write the failing test**

An old offline snapshot carries `expenseGroups` and no `planGroups`; it must boot with `planGroups: []`.

`lib/store/__tests__/queueOrSend.test.ts` — **Replace**

```ts
import type { Animal, ExpenseGroup, ManejoSession } from "@/lib/types";
```

with

```ts
import type { Animal, ManejoSession, PlanGroup } from "@/lib/types";
```

**Replace**

```ts
/** Boots offline from u0's snapshot of farm 1; the hooks the store handed the wiring. */
async function bootOffline(): Promise<OfflineHooks> {
  await openStore<string>("meta").put("lastUser", "u0");
  await openStore<Snapshot>("snapshot").put("u0:1", {
    data: { animals: [animal], manejoSessions: [session] } as never,
```

with

```ts
/** Boots offline from u0's snapshot of farm 1, with `data` on top of it; the hooks the store handed the wiring. */
async function bootOffline(data: Record<string, unknown> = {}): Promise<OfflineHooks> {
  await openStore<string>("meta").put("lastUser", "u0");
  await openStore<Snapshot>("snapshot").put("u0:1", {
    data: { animals: [animal], manejoSessions: [session], ...data } as never,
```

**Replace**

```ts
  it("reads an old snapshot without grupos de despesa as none, and the next save carries them", async () => {
    const maquinas: ExpenseGroup = { id: "g-1", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" };
    useHerdStore.setState({ expenseGroups: [maquinas] });
    await bootOffline();
    expect(useHerdStore.getState().expenseGroups).toEqual([]);

    useHerdStore.setState({ expenseGroups: [maquinas] });
    await persistSnapshot(useHerdStore.getState);
    expect((await openStore<Snapshot>("snapshot").get("u0:1"))?.data.expenseGroups).toEqual([maquinas]);
  });
```

with

```ts
  it("reads an old snapshot with grupos de despesa and no planGroups as no grupos, and the next save carries them", async () => {
    const maquinas: PlanGroup = {
      id: "g-1",
      kind: "expense",
      name: "Máquinas e veículos",
      createdAt: "2026-10-01T12:00:00.000Z",
    };
    useHerdStore.setState({ planGroups: [maquinas] });
    await bootOffline({ expenseGroups: [{ id: "g-1", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" }] });
    expect(useHerdStore.getState().planGroups).toEqual([]);

    useHerdStore.setState({ planGroups: [maquinas] });
    await persistSnapshot(useHerdStore.getState);
    expect((await openStore<Snapshot>("snapshot").get("u0:1"))?.data.planGroups).toEqual([maquinas]);
  });
```

- [ ] **Step 22: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/queueOrSend.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `planGroups` is undefined after the offline boot, and the saved snapshot has no `planGroups`.

- [ ] **Step 23: Implement**

`lib/store/useHerdStore.ts` — **Replace**

```ts
  ExpenseCategory,
  ExpenseGroup,
  FarmData,
```

with

```ts
  ExpenseCategory,
  FarmData,
```

**Replace**

```ts
  ManejoTreatmentPlan,
  PregnancyDiagnosis,
  ScheduleTreatmentsInput,
```

with

```ts
  ManejoTreatmentPlan,
  PlanGroup,
  PregnancyDiagnosis,
  ScheduleTreatmentsInput,
```

**Replace**

```ts
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  expenseGroups: ExpenseGroup[];
```

with

```ts
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  planGroups: PlanGroup[];
```

**Replace**

```ts
  addExpenseGroup: (name: string) => Promise<ExpenseGroup | null>;
```

with

```ts
  addExpenseGroup: (name: string) => Promise<PlanGroup | null>;
```

**Replace** (in `herdDataOf`)

```ts
    expenseGroups: s.expenseGroups,
```

with

```ts
    planGroups: s.planGroups,
```

**Replace** (the initial state)

```ts
  accounts: [],
  expenseGroups: [],
```

with

```ts
  accounts: [],
  planGroups: [],
```

**Replace** (the offline boot)

```ts
        expenseGroups: snap.data.expenseGroups ?? [],
```

with

```ts
        planGroups: snap.data.planGroups ?? [],
```

**Replace** (in `addExpenseGroup`)

```ts
    const group = data as ExpenseGroup;
    set((s) => ({ expenseGroups: [...s.expenseGroups, group] }));
```

with

```ts
    const group = data as PlanGroup;
    set((s) => ({ planGroups: [...s.planGroups, group] }));
```

**Replace** (in `updateExpenseGroup`)

```ts
    const group = data as ExpenseGroup;
    set((s) => ({ expenseGroups: s.expenseGroups.map((g) => (g.id === id ? group : g)) }));
```

with

```ts
    const group = data as PlanGroup;
    set((s) => ({ planGroups: s.planGroups.map((g) => (g.id === id ? group : g)) }));
```

**Replace** (in `removeExpenseGroup`)

```ts
        expenseGroups: s.expenseGroups.filter((g) => g.id !== id),
```

with

```ts
        planGroups: s.planGroups.filter((g) => g.id !== id),
```

Check: `grep -nw "expenseGroups\|ExpenseGroup" lib/store/useHerdStore.ts` prints nothing (`addExpenseGroup`/`updateExpenseGroup`/`removeExpenseGroup` and `api["expense-groups"]` stay until task 2).

- [ ] **Step 24: Run the tests**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/queueOrSend.test.ts --exclude '**/worktrees/**'`
Expected: PASS (15 tests)

---

#### Wrap-up

- [ ] **Step 25: Every test of this task**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts lib/domain/__tests__/entries.test.ts lib/domain/__tests__/labels.test.ts lib/domain/__tests__/moneyRedaction.test.ts lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts lib/api/domains/farm/useCases/__tests__/Create.test.ts lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts lib/data/__tests__/seed.test.ts lib/store/__tests__/queueOrSend.test.ts --exclude '**/worktrees/**'`
Expected: PASS (10 files)

- [ ] **Step 26: Types and lint**

Run: `./node_modules/.bin/eslint lib/types.ts lib/db/schema.ts lib/api/mappers.ts lib/api/__tests__/mappers.test.ts lib/domain/groups.ts lib/domain/__tests__/groups.test.ts lib/domain/labels.ts lib/domain/entries.ts lib/domain/__tests__/entries.test.ts lib/domain/__tests__/moneyRedaction.test.ts lib/domain/__tests__/fixtures.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts lib/api/domains/planGroups/seed.ts lib/api/domains/farm/useCases/Create.useCase.ts lib/api/domains/farm/useCases/EnsureForUser.useCase.ts lib/api/domains/farm/useCases/__tests__/Create.test.ts lib/api/domains/farm/useCases/__tests__/EnsureForUser.test.ts lib/data/seed.ts lib/data/__tests__/seed.test.ts cli/seedCli.ts lib/store/useHerdStore.ts lib/store/__tests__/queueOrSend.test.ts`
Expected: clean.

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E '^\S.*: error TS' | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort | uniq -c`
Expected: 98 errors in exactly these 42 files (error count in brackets), and no file of this task's list other than `lib/store/useHerdStore.ts`. Each is left red on purpose for the task named:

- Task 2 (plan-groups API + store actions): `lib/api/domains/expenseGroups/farmCategory.ts` [2], `lib/api/domains/expenseGroups/useCases/Add.useCase.ts` [4], `lib/api/domains/expenseGroups/useCases/Delete.useCase.ts` [1], `lib/api/domains/expenseGroups/useCases/Update.useCase.ts` [4], `lib/store/__tests__/expenseGroups.test.ts` [5], and `lib/store/useHerdStore.ts` [4 in all: 2] at `addExpenseGroup`/`updateExpenseGroup` (the `api["expense-groups"]` error type is lost while that controller does not compile).
- Task 3 (validation): `lib/api/domains/expenses/useCases/Add.useCase.ts` [1], `Split.useCase.ts` [1], `Update.useCase.ts` [1], `UpdateSeries.useCase.ts` [1], `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts` [2], `lib/domain/accounts.ts` [1], `lib/domain/__tests__/accounts.test.ts` [1], and `lib/store/useHerdStore.ts` [2] at `addExpense` and `resolveStatementLine` (the bodies still require `category` until task 3 makes it optional in `expense.schema.ts`/the statements schema).
- Task 4 (sêmen): `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` [1], `DeleteBull.useCase.ts` [1], `DeletePurchase.useCase.ts` [1].
- Task 5 (domain readers): `lib/domain/budget.ts` [4], `lib/domain/economics.ts` [1], `lib/domain/ledger.ts` [3], `lib/domain/planTree.ts` [8], `lib/reports/groups.ts` [5], `lib/export/datasets/finance.ts` [2], `lib/domain/__tests__/budget.test.ts` [1], `lib/domain/__tests__/ledger.test.ts` [1], `lib/domain/__tests__/planTree.test.ts` [4].
- Task 6 (finance screens): `app/(app)/finance/page.tsx` [1], `components/dashboard/FinanceCard.tsx` [1], `components/finance/BillsCard.tsx` [1], `components/finance/CostBreakdownCard.tsx` [1], `components/finance/SeriesScopeDialog.tsx` [1], `components/finance/contas/AccountMovements.tsx` [2], `components/finance/contas/ConciliarPage.tsx` [1], `components/finance/lancamentos/LancamentosPage.tsx` [1], `components/finance/orcamento/BudgetEditDialog.tsx` [2], `components/finance/orcamento/OrcamentoPage.tsx` [3], `components/reports/datasets.ts` [1], `components/reports/useReportData.ts` [1].
- Task 7 (plano + forms): `components/finance/EntryDialog.tsx` [7], `components/finance/entryFields.ts` [4], `components/finance/plano/AccountsPage.tsx` [7], `components/finance/plano/GroupHeader.tsx` [1], `components/finance/plano/NewAccountDialog.tsx` [3].

Tests that compile but fail at run time after this task (26 files, 73 tests in the full run), also left for their owners: task 2 — `lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts`, `lib/api/domains/expenseGroups/useCases/__tests__/{Add,Update,Delete}.test.ts`, `lib/store/__tests__/expenseGroups.test.ts`; task 3 — `lib/api/domains/expenses/useCases/__tests__/{Add,AddSeries,PaidBy,Update,UpdateSeries}.test.ts`, `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`, `lib/api/domains/budgets/useCases/__tests__/{CopyBudgets,PutBudgetLine}.test.ts`, `lib/api/domains/statements/useCases/__tests__/statements.test.ts` (all through `isFarmCategory` calling the deleted `isBuiltinCategory`), `lib/domain/__tests__/accounts.test.ts`; task 4 — `lib/api/domains/semen/useCases/__tests__/{AddBull,AddPurchase,UpdateBull}.test.ts` (purchases no longer carry `expenseId`); task 5 — `lib/domain/__tests__/{budget,ledger,planTree}.test.ts`, `lib/export/__tests__/finance.test.ts`, `lib/reports/__tests__/{bankStatement,groups}.test.ts`; task 6 — `components/finance/lancamentos/__tests__/legacySearch.test.ts`; task 7 — `components/finance/__tests__/entryFields.test.ts`.

---

### Task 2: Plan-groups API + store actions

**Files:**
- Move (`git mv`, then rewrite): `lib/api/domains/expenseGroups/**` → `lib/api/domains/planGroups/**` (task 1's `lib/api/domains/planGroups/seed.ts` is already there; do not touch it)
  - `expenseGroups.controller.ts` → `planGroups.controller.ts`
  - `farmCategory.ts` → `farmGroup.ts`
  - `schemas/expenseGroup.schema.ts` → `schemas/planGroup.schema.ts`
  - `useCases/Add.useCase.ts`, `useCases/Update.useCase.ts`, `useCases/Delete.useCase.ts` (same names)
  - `__tests__/expenseGroups.routes.test.ts` → `__tests__/planGroups.routes.test.ts`
  - `__tests__/farmCategory.test.ts` → `__tests__/farmGroup.test.ts`
  - `useCases/__tests__/Add.test.ts`, `Update.test.ts`, `Delete.test.ts` (same names)
- Move: `lib/store/__tests__/expenseGroups.test.ts` → `lib/store/__tests__/planGroups.test.ts`
- Modify: `lib/api/app.ts`
- Modify: `lib/api/permissions/routeRequirements.ts`
- Modify: `lib/store/useHerdStore.ts` (grupo actions and the four sêmen actions)
- Test: `lib/api/__tests__/routeRequirements.test.ts`
- Test: `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap`, `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` (regenerated with `-u`)

**Interfaces:**
- Consumes (task 1):
  - `planGroups`, `type PlanGroupRow` from `@/lib/db/schema` (table `plan_groups`, unique index `plan_groups_farm_name_idx` on `(farm_id, lower(name))`)
  - `toPlanGroup(row: PlanGroupRow): PlanGroup` from `@/lib/api/mappers`
  - `type GroupKind`, `type PlanGroup` from `@/lib/types`
  - `GROUP_NAME_MAX` from `@/lib/domain/groups`
  - store state `planGroups: PlanGroup[]` in `useHerdStore`, `PlanGroup` already in its `@/lib/types` import, and the wave-1 actions `addExpenseGroup` / `updateExpenseGroup` / `removeExpenseGroup` (renamed here)
- Consumes (task 4, same wave; the store only casts the answers): `POST /semen-bulls` → `{ bull }`, `POST /semen-bulls/:id/purchases` → `{ purchase }`, `DELETE /semen-bulls/:id/purchases/:purchaseId` → `{ id }`, `DELETE /semen-bulls/:id` → `{ id }`
- Produces:
  - `lib/api/domains/planGroups/farmGroup.ts`: `farmGroup(repo: RepositoryType, farmId: number, id: string): Promise<PlanGroupRow | null>` (task 3 imports it)
  - `lib/api/domains/planGroups/schemas/planGroup.schema.ts`: `GroupKindModel`, `NewPlanGroupBody`, `UpdatePlanGroupBody`
  - `AddPlanGroupUseCase.run({ farmId, kind, name }): Promise<PlanGroup | "duplicate">`
  - `UpdatePlanGroupUseCase.run({ farmId, id, patch }): Promise<PlanGroup | "duplicate" | null>`, `type PlanGroupPatchInput`
  - `DeletePlanGroupUseCase.run({ farmId, id }): Promise<"deleted" | "not_found" | "in_use">`
  - `planGroupsController` (prefix `/plan-groups`), mounted in `herdApi`; Eden `api["plan-groups"]`
  - store: `addPlanGroup(kind: GroupKind, name: string): Promise<PlanGroup | null>`, `updatePlanGroup(id, patch): Promise<boolean>`, `removePlanGroup(id): Promise<"deleted" | "in_use">` (task 7's `NewGroupDialog`, `GroupHeader`, `AccountsPage` call these)
  - `ROUTE_REQUIREMENTS`: `/api/herd/plan-groups` routes at `edit("finance")`; both sêmen purchase routes at `edit("reproduction")`

---

- [ ] **Step 1: Move the folder and write the failing API tests**

`lib/api/domains/planGroups/` already exists (task 1's `seed.ts`), so a plain `git mv` of the folder would nest it. Move file by file:

```bash
cd lib/api/domains
mkdir -p planGroups/schemas planGroups/useCases/__tests__ planGroups/__tests__
git mv expenseGroups/expenseGroups.controller.ts planGroups/planGroups.controller.ts
git mv expenseGroups/farmCategory.ts planGroups/farmGroup.ts
git mv expenseGroups/schemas/expenseGroup.schema.ts planGroups/schemas/planGroup.schema.ts
git mv expenseGroups/useCases/Add.useCase.ts planGroups/useCases/Add.useCase.ts
git mv expenseGroups/useCases/Update.useCase.ts planGroups/useCases/Update.useCase.ts
git mv expenseGroups/useCases/Delete.useCase.ts planGroups/useCases/Delete.useCase.ts
git mv expenseGroups/useCases/__tests__/Add.test.ts planGroups/useCases/__tests__/Add.test.ts
git mv expenseGroups/useCases/__tests__/Update.test.ts planGroups/useCases/__tests__/Update.test.ts
git mv expenseGroups/useCases/__tests__/Delete.test.ts planGroups/useCases/__tests__/Delete.test.ts
git mv expenseGroups/__tests__/expenseGroups.routes.test.ts planGroups/__tests__/planGroups.routes.test.ts
git mv expenseGroups/__tests__/farmCategory.test.ts planGroups/__tests__/farmGroup.test.ts
cd ../../..
test ! -e lib/api/domains/expenseGroups || find lib/api/domains/expenseGroups -type d -empty -delete
git mv lib/store/__tests__/expenseGroups.test.ts lib/store/__tests__/planGroups.test.ts
```

Check: `ls lib/api/domains/expenseGroups` fails with "No such file or directory".

Replace the whole of `lib/api/domains/planGroups/__tests__/farmGroup.test.ts` with:

```ts
/**
 * farmGroup: the grupo of this farm by id, with its tipo, archived ones
 * included; null for another farm's grupo or an id that names nothing.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { farmGroup } from "../farmGroup";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

const RECEITAS = {
  id: "g-rec",
  farmId: 7,
  kind: "revenue",
  name: "Receitas",
  archivedAt: new Date("2026-10-05T12:00:00Z"),
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("farmGroup", () => {
  it("answers the farm's grupo with its tipo, archived ones too", async () => {
    state.selectResults = [[RECEITAS]];

    expect(await farmGroup(repo, 7, "g-rec")).toEqual(RECEITAS);

    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"plan_groups"."farm_id" = $1');
    expect(params).toEqual([7, "g-rec"]);
    // An old lançamento in an archived grupo still saves: no archived_at filter.
    expect(sql).not.toContain("archived_at");
  });

  it("answers null for another farm's grupo and for an old built-in key", async () => {
    // The farm filter finds no grupo by that id.
    for (const id of ["g-of-another-farm", "nutrition", "revenue"]) {
      state.selectResults = [[]];
      expect(await farmGroup(repo, 7, id)).toBeNull();
    }
  });
});
```

Replace the whole of `lib/api/domains/planGroups/useCases/__tests__/Add.test.ts` with:

```ts
/**
 * addPlanGroup: creates a grupo of the plano under a tipo, trimmed. No name is
 * reserved any more: only another grupo of the same farm, of any tipo, can
 * hold it, through the unique index on (farm_id, lower(name)), so another
 * farm's grupo never clashes.
 */
import type { SQL } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
    insertErrors: [] as unknown[],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { planGroups } from "@/lib/db/schema";
import type { GroupKind } from "@/lib/types";

import { AddPlanGroupUseCase } from "../Add.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  kind: "investment",
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-05T12:00:00Z"),
};

const add = (name: string, kind: GroupKind = "investment", farmId = 7) =>
  new AddPlanGroupUseCase().run({ farmId, kind, name });

beforeEach(() => {
  state.inserts = [];
  state.returning = [];
  state.insertErrors = [];
});

describe("addPlanGroup", () => {
  it("trims the name and creates the grupo under its tipo", async () => {
    state.returning = [[ROW]];

    const result = await add("  Máquinas e veículos ");

    expect(state.inserts).toEqual([
      { id: expect.any(String), farmId: 7, kind: "investment", name: "Máquinas e veículos" },
    ]);
    expect(result).toMatchObject({
      id: "g-maq",
      kind: "investment",
      name: "Máquinas e veículos",
      createdAt: "2026-10-05T12:00:00.000Z",
    });
  });

  it("takes a default grupo's name: no name is reserved, only the farm's own grupos clash", async () => {
    state.returning = [[{ ...ROW, kind: "expense", name: "Nutrição" }]];

    expect(await add("Nutrição", "expense")).toMatchObject({ kind: "expense", name: "Nutrição" });
    expect(state.inserts).toEqual([{ id: expect.any(String), farmId: 7, kind: "expense", name: "Nutrição" }]);
  });

  it("answers duplicate when the farm already has the name in any case, whatever its tipo", async () => {
    state.insertErrors = [Object.assign(new Error("duplicate key"), { cause: { code: "23505" } })];

    // "Nutrição" is a despesa grupo of the farm; a receita grupo cannot take it.
    expect(await add("NUTRIÇÃO", "revenue")).toBe("duplicate");
  });

  it("keeps one name per farm across every tipo: the unique index leaves the kind out", () => {
    const [index] = getTableConfig(planGroups).indexes;

    expect(index.config.unique).toBe(true);
    expect(index.config.columns.map((c) => ("name" in c ? c.name : renderSql(c as SQL).sql))).toEqual([
      "farm_id",
      'lower("plan_groups"."name")',
    ]);
  });

  it("takes a name another farm has: nothing but this farm's unique index can refuse it", async () => {
    state.returning = [[{ ...ROW, farmId: 8 }]];

    expect(await add("Máquinas e veículos", "investment", 8)).toMatchObject({ name: "Máquinas e veículos" });
    expect(state.inserts[0]).toMatchObject({ farmId: 8 });
  });
});
```

Replace the whole of `lib/api/domains/planGroups/useCases/__tests__/Update.test.ts` with:

```ts
/**
 * updatePlanGroup: renames a grupo of any tipo (refused like a new name,
 * except that its own name in another case is fine) or archives and restores
 * it. The tipo is not part of the patch.
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

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { UpdatePlanGroupUseCase, type PlanGroupPatchInput } from "../Update.useCase";

const ROW = {
  id: "g-rec",
  farmId: 7,
  kind: "revenue",
  name: "Receitas",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const update = (patch: PlanGroupPatchInput, repo?: RepositoryType) =>
  new UpdatePlanGroupUseCase(repo).run({ farmId: 7, id: "g-rec", patch });

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
});

describe("updatePlanGroup", () => {
  it("renames a default grupo, trimmed, and keeps its tipo", async () => {
    state.returning = [[{ ...ROW, name: "Vendas" }]];

    expect(await update({ name: " Vendas " })).toMatchObject({ id: "g-rec", kind: "revenue", name: "Vendas" });
    expect(state.updates).toEqual([{ name: "Vendas" }]);
  });

  it("renames a grupo to its own name in another case", async () => {
    state.returning = [[{ ...ROW, name: "RECEITAS" }]];

    expect(await update({ name: "RECEITAS" })).toMatchObject({ name: "RECEITAS" });
    expect(state.updates).toEqual([{ name: "RECEITAS" }]);
  });

  it("answers duplicate when another grupo of the farm, of any tipo, has the name", async () => {
    const unique = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });
    const taken = {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.reject(unique) }) }) }),
    } as unknown as RepositoryType;

    expect(await update({ name: "Nutrição" }, taken)).toBe("duplicate");
  });

  it("archives and restores", async () => {
    state.returning = [[{ ...ROW, archivedAt: new Date("2026-10-05T12:00:00Z") }], [ROW]];

    expect(await update({ archived: true })).toMatchObject({ archivedAt: "2026-10-05T12:00:00.000Z" });
    await update({ archived: false });

    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(state.updates[1]).toEqual({ archivedAt: null });
  });

  it("answers null for a grupo of another farm", async () => {
    state.returning = [[]];

    expect(await update({ archived: true })).toBeNull();
  });
});
```

Replace the whole of `lib/api/domains/planGroups/useCases/__tests__/Delete.test.ts` with:

```ts
/**
 * deletePlanGroup: only a grupo nothing uses is deleted, of any tipo, with its
 * contas and its orçamento lines; a used one is archived instead. A
 * recorrência keeps it, and so does a lançamento of one of its contas whatever
 * category it carries.
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

import { DeletePlanGroupUseCase } from "../Delete.useCase";

const row = (kind: string) => ({
  id: "g-1",
  farmId: 7,
  kind,
  name: "Grupo",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
});

const remove = (farmId = 7) => new DeletePlanGroupUseCase().run({ farmId, id: "g-1" });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deletePlanGroup", () => {
  it("is not_found off the farm", async () => {
    state.selectResults = [[]];

    expect(await remove(8)).toBe("not_found");
    expect(state.deletes).toBe(0);
    expect(renderSql(state.wheres[0] as SQL).params).toEqual([8, "g-1"]);
  });

  it("is in_use for a grupo of any tipo while a lançamento or recorrência has it, or points at one of its contas", async () => {
    for (const kind of ["revenue", "expense", "investment", "financing", "partners"]) {
      state.selectResults = [[row(kind)], [{ id: "g-1" }]];
      state.wheres = [];

      expect(await remove()).toBe("in_use");
      expect(state.deletes).toBe(0);
      const usage = renderSql(state.wheres[1] as SQL);
      // The same rule for every tipo: nothing asks the grupo's kind.
      expect(usage.sql).not.toContain('"kind"');
      const ofItsContas = '"account_id" in (select "accounts"."id" from "accounts" where "accounts"."farm_id" = $';
      // A recorrência alone keeps the grupo.
      expect(usage.sql).toContain('exists (select 1 from "expense_series" where "expense_series"."farm_id" = $');
      expect(usage.sql).toContain('"expense_series"."category" = $');
      expect(usage.sql).toContain(`"expense_series".${ofItsContas}`);
      // …but only while it still has lançamentos: "Excluir todas" leaves the série row behind, empty.
      expect(usage.sql).toContain('exists (select 1 from "expenses" "e" where "e"."series_id" = "expense_series"."id")');
      // A lançamento of one of its contas keeps it too, filed under another grupo or not: either one is enough.
      expect(usage.sql).toMatch(/"expenses"\."category" = \$\d+ or "expenses"\."account_id" in \(select/);
      expect(usage.sql).toContain(`"expenses".${ofItsContas}`);
      expect(usage.sql).toContain('"accounts"."group" = $');
      expect(new Set(usage.params)).toEqual(new Set([7, "g-1"]));
    }
  });

  it("deletes an unused financiamento grupo: its orçamento lines, its emptied séries, its contas with their saldo inicial, then the grupo, and nothing else", async () => {
    state.selectResults = [[row("financing")], []];

    expect(await remove()).toBe("deleted");
    expect(state.deletes).toBe(4);
    const [lines, series, contas, grupo] = state.wheres.slice(2).map((where) => renderSql(where as SQL));
    expect(lines.sql).toContain('"budgets"."category" = $2');
    expect(series.sql).toContain('"expense_series"."category" = $');
    expect(series.sql).toContain('"expense_series"."account_id" in (select');
    expect(contas.sql).toContain('"accounts"."group" = $2');
    // A conta with a saldo devedor inicial goes like any other.
    expect(contas.sql).not.toContain("opening");
    expect(grupo.sql).toContain('"plan_groups"."id" = $2');
    for (const query of [lines, contas, grupo]) expect(query.params).toEqual([7, "g-1"]);
    expect(new Set(series.params)).toEqual(new Set([7, "g-1"]));
  });
});
```

Replace the whole of `lib/api/domains/planGroups/__tests__/planGroups.routes.test.ts` with:

```ts
/**
 * The plan-group routes behind the farm macro, auth and db mocked: a member
 * who only sees Financeiro writes nothing, a body the schema refuses never
 * reaches the use case, a PATCH never carries the tipo, and each refusal of a
 * use case answers its status.
 */
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, add, update, remove } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
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
vi.mock("@/lib/api/domains/planGroups/useCases/Add.useCase", () => ({
  AddPlanGroupUseCase: class {
    run = add;
  },
}));
vi.mock("@/lib/api/domains/planGroups/useCases/Update.useCase", () => ({
  UpdatePlanGroupUseCase: class {
    run = update;
  },
}));
vi.mock("@/lib/api/domains/planGroups/useCases/Delete.useCase", () => ({
  DeletePlanGroupUseCase: class {
    run = remove;
  },
}));

import { planGroupsController } from "@/lib/api/domains/planGroups/planGroups.controller";

// The controller alone under the herd API's prefix: the farm macro reads the same ROUTE_REQUIREMENTS keys.
const api = new Elysia({ prefix: "/api/herd" }).use(planGroupsController);

const request = (method: string, path: string, body?: unknown) =>
  api.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers: { "x-farm-id": "7", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const ARRENDAMENTO = {
  id: "g-arr",
  kind: "revenue",
  name: "Arrendamento de pasto",
  createdAt: "2026-10-09T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
  state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
});

describe("plan-group routes", () => {
  it("refuse every write to a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    for (const response of [
      await request("POST", "/plan-groups", { kind: "expense", name: "Máquinas e veículos" }),
      await request("PATCH", "/plan-groups/g-maq", { archived: true }),
      await request("DELETE", "/plan-groups/g-maq"),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuse a blank name, one over 40 characters, a missing tipo and a rendimento before the use case", async () => {
    for (const body of [
      { kind: "expense", name: "   " },
      { kind: "expense", name: "x".repeat(41) },
      { name: "Arrendamento" },
      { kind: "yield", name: "Rendimentos" },
    ]) {
      expect((await request("POST", "/plan-groups", body)).status).toBe(422);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("create a grupo under the tipo sent, and never pass a tipo on a patch", async () => {
    add.mockResolvedValue(ARRENDAMENTO);
    update.mockResolvedValue({ ...ARRENDAMENTO, name: "Vendas" });

    const created = await request("POST", "/plan-groups", { kind: "revenue", name: "Arrendamento de pasto" });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual(ARRENDAMENTO);
    expect(add).toHaveBeenCalledWith({ farmId: 7, kind: "revenue", name: "Arrendamento de pasto" });

    const renamed = await request("PATCH", "/plan-groups/g-arr", { name: "Vendas", kind: "expense" });
    expect(renamed.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ farmId: 7, id: "g-arr", patch: { name: "Vendas" } });
  });

  it("answer 409 duplicate_name for a taken name, 404 off the farm and 409 in_use for a grupo in use", async () => {
    add.mockResolvedValue("duplicate");
    update.mockResolvedValue(null);
    remove.mockResolvedValue("in_use");

    const created = await request("POST", "/plan-groups", { kind: "revenue", name: "Nutrição" });
    expect(created.status).toBe(409);
    expect(await created.json()).toEqual({ error: "duplicate_name" });

    const renamed = await request("PATCH", "/plan-groups/g-9", { name: "Arrendamento" });
    expect(renamed.status).toBe(404);
    expect(await renamed.json()).toEqual({ error: "not_found" });

    const removed = await request("DELETE", "/plan-groups/g-maq");
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "in_use" });
  });

  it("answer the id of a deleted grupo", async () => {
    remove.mockResolvedValue("deleted");

    const response = await request("DELETE", "/plan-groups/g-maq");
    expect(await response.json()).toEqual({ id: "g-maq" });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, id: "g-maq" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/planGroups --exclude '**/worktrees/**'`
Expected: FAIL — `farmGroup is not a function` (the moved file still exports `isFarmCategory`), `AddPlanGroupUseCase` / `UpdatePlanGroupUseCase` / `DeletePlanGroupUseCase` are not constructors, and the routes test cannot import `planGroupsController`. (A `seed.ts` test from task 1, if one sits in this folder, passes.)

- [ ] **Step 3: Implement the API**

Replace the whole of `lib/api/domains/planGroups/farmGroup.ts` with:

```ts
/**
 * The grupo a lançamento, a conta or an orçamento line names. normaliseEntry
 * (lançamentos, séries, "Criar lançamento" from a linha do extrato), AddAccount
 * and PutBudgetLine ask here before a grupo id is stored: the columns are
 * text, so nothing in the database checks them. The caller compares the kind.
 */
import { and, eq } from "drizzle-orm";

import { planGroups, type PlanGroupRow } from "@/lib/db/schema";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/**
 * The grupo of this farm by id, archived or not (an old lançamento in an
 * archived grupo still saves; the forms just stop offering it); null when it
 * is not the farm's. Takes the pooled client or a transaction.
 */
export async function farmGroup(repo: RepositoryType, farmId: number, id: string): Promise<PlanGroupRow | null> {
  const [row] = await repo
    .select()
    .from(planGroups)
    .where(and(eq(planGroups.farmId, farmId), eq(planGroups.id, id)))
    .limit(1);
  return row ?? null;
}
```

Replace the whole of `lib/api/domains/planGroups/schemas/planGroup.schema.ts` with:

```ts
/** Request schemas for the grupos of the plano de contas. */

import { t } from "elysia";

import { GROUP_NAME_MAX } from "@/lib/domain/groups";

const GroupName = t.String({ minLength: 1, maxLength: GROUP_NAME_MAX, pattern: "\\S" });

/** Tipo of a grupo: every kind of lançamento but a rendimento, which has no grupo. */
export const GroupKindModel = t.Union([
  t.Literal("revenue"),
  t.Literal("expense"),
  t.Literal("investment"),
  t.Literal("financing"),
  t.Literal("partners"),
]);

/** Body of POST /plan-groups. */
export const NewPlanGroupBody = t.Object({ kind: GroupKindModel, name: GroupName });

/** Body of PATCH /plan-groups/:id. `archived` true archives, false restores. The tipo never changes. */
export const UpdatePlanGroupBody = t.Object({
  name: t.Optional(GroupName),
  archived: t.Optional(t.Boolean()),
});
```

Replace the whole of `lib/api/domains/planGroups/useCases/Add.useCase.ts` with:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { planGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toPlanGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { GroupKind, PlanGroup } from "@/lib/types";

interface AddPlanGroupUseCaseProps {
  farmId: number;
  kind: GroupKind;
  name: string;
}

/** `duplicate`: another grupo of the farm, of any tipo and archived ones included, has the name in any case. */
type AddPlanGroupUseCaseResponse = PlanGroup | "duplicate";

type CurrUseCase = _UseCase<AddPlanGroupUseCaseProps, AddPlanGroupUseCaseResponse>;

/**
 * Creates a grupo of the plano under a tipo. The unique index on
 * (farm_id, lower(name)) is the only check against the farm's other grupos,
 * whatever their tipo, so a concurrent insert of the same name is caught the
 * same way.
 */
export class AddPlanGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddPlanGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, kind, name }) => {
    try {
      const [row] = await this.repository
        .insert(planGroups)
        .values({ id: randomUUID(), farmId, kind, name: name.trim() })
        .returning();
      return toPlanGroup(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

Replace the whole of `lib/api/domains/planGroups/useCases/Update.useCase.ts` with:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { planGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toPlanGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { PlanGroup } from "@/lib/types";

/** Absent leaves a field as it is. The tipo is not here: it never changes. */
export interface PlanGroupPatchInput {
  name?: string;
  /** True archives the grupo, false restores it. */
  archived?: boolean;
}

interface UpdatePlanGroupUseCaseProps {
  farmId: number;
  id: string;
  patch: PlanGroupPatchInput;
}

/** null: the grupo is not on this farm. `duplicate`: as in AddPlanGroup. */
type UpdatePlanGroupUseCaseResponse = PlanGroup | "duplicate" | null;

type CurrUseCase = _UseCase<UpdatePlanGroupUseCaseProps, UpdatePlanGroupUseCaseResponse>;

/**
 * Renames a grupo (its contas, lançamentos and orçamento lines hold its id, so
 * they follow), archives or restores it. Its own name in another case is no
 * clash: the unique index only compares it with the farm's other grupos.
 */
export class UpdatePlanGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdatePlanGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    const scope = and(eq(planGroups.farmId, farmId), eq(planGroups.id, id));
    const set: Partial<typeof planGroups.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) {
      const [current] = await this.repository.select().from(planGroups).where(scope).limit(1);
      return current ? toPlanGroup(current) : null;
    }

    try {
      const [row] = await this.repository.update(planGroups).set(set).where(scope).returning();
      return row ? toPlanGroup(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

Replace the whole of `lib/api/domains/planGroups/useCases/Delete.useCase.ts` with:

```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets, expenseSeries, expenses, planGroups } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeletePlanGroupUseCaseProps {
  farmId: number;
  id: string;
}

/**
 * `not_found` off this farm; `in_use` when a lançamento, or a série that still
 * has lançamentos, has the grupo as its category or points at one of its
 * contas, whatever category it carries (archive it instead).
 */
type DeletePlanGroupUseCaseResponse = "deleted" | "not_found" | "in_use";

type CurrUseCase = _UseCase<DeletePlanGroupUseCaseProps, DeletePlanGroupUseCaseResponse>;

/**
 * Deletes a grupo nothing uses, of any tipo (one created by mistake, a default
 * the farm has no use for), with its contas (a financiamento's saldo inicial
 * lives on its conta and goes with it), its orçamento lines and the séries
 * left empty by "Excluir todas".
 */
export class DeletePlanGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeletePlanGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id }) =>
    // The row lock makes a second delete or a rename of the grupo wait.
    // ponytail: a lançamento saved into the grupo meanwhile is not held off (a grupo id has no FK)
    // and then reads "Grupo removido"; have its writers read the grupo `for share` if that shows up.
    this.repository.transaction(async (tx) => {
      const scope = and(eq(planGroups.farmId, farmId), eq(planGroups.id, id));
      const [current] = await tx.select().from(planGroups).where(scope).limit(1).for("update");
      if (!current) return "not_found";
      const contas = sql`(select ${accounts.id} from ${accounts} where ${accounts.farmId} = ${farmId} and ${accounts.group} = ${id})`;
      const ofGroup = sql`${expenseSeries.farmId} = ${farmId} and (${expenseSeries.category} = ${id} or ${expenseSeries.accountId} in ${contas})`;
      // A row back means a lançamento or a recorrência still uses the grupo.
      const [used] = await tx
        .select({ id: planGroups.id })
        .from(planGroups)
        .where(
          and(
            scope,
            sql`(exists (select 1 from ${expenses} where ${expenses.farmId} = ${farmId} and (${expenses.category} = ${id} or ${expenses.accountId} in ${contas}))
              or exists (select 1 from ${expenseSeries} where ${ofGroup}
                and exists (select 1 from ${expenses} "e" where "e"."series_id" = ${expenseSeries.id})))`
          )
        )
        .limit(1);
      if (used) return "in_use";
      // Every orçamento line of the grupo, its own and its contas' (theirs would cascade with the conta anyway).
      await tx.delete(budgets).where(and(eq(budgets.farmId, farmId), eq(budgets.category, id)));
      // What is left of its séries has no lançamento any more.
      await tx.delete(expenseSeries).where(ofGroup);
      await tx.delete(accounts).where(and(eq(accounts.farmId, farmId), eq(accounts.group, id)));
      await tx.delete(planGroups).where(scope);
      return "deleted";
    });
}
```

Replace the whole of `lib/api/domains/planGroups/planGroups.controller.ts` with:

```ts
/**
 * The grupos of the plano de contas, of every tipo. Every one is the farm's:
 * it is renamed, archived (the forms stop offering it, its history stays) or,
 * while nothing uses it, deleted with its contas and orçamento lines. Its tipo
 * is set when it is created and never changes.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddPlanGroupUseCase } from "./useCases/Add.useCase";
import { DeletePlanGroupUseCase } from "./useCases/Delete.useCase";
import { UpdatePlanGroupUseCase } from "./useCases/Update.useCase";
import { NewPlanGroupBody, UpdatePlanGroupBody } from "./schemas/planGroup.schema";

export const planGroupsController = new Elysia({ prefix: "/plan-groups" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddPlanGroupUseCase().run({ farmId, kind: body.kind, name: body.name });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: NewPlanGroupBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdatePlanGroupUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: UpdatePlanGroupBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeletePlanGroupUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  );
```

In `lib/api/app.ts`:

**Replace**
```ts
import { expenseGroupsController } from "@/lib/api/domains/expenseGroups/expenseGroups.controller";
```
**with**
```ts
import { planGroupsController } from "@/lib/api/domains/planGroups/planGroups.controller";
```

**Replace**
```ts
  .use(expenseGroupsController)
```
**with**
```ts
  .use(planGroupsController)
```

In `lib/api/permissions/routeRequirements.ts` (the routes must exist in the table, or the farm macro refuses them):

**Replace**
```ts
  "POST /api/herd/expense-groups": edit("finance"),
  "PATCH /api/herd/expense-groups/:id": edit("finance"),
  "DELETE /api/herd/expense-groups/:id": edit("finance"),
```
**with**
```ts
  "POST /api/herd/plan-groups": edit("finance"),
  "PATCH /api/herd/plan-groups/:id": edit("finance"),
  "DELETE /api/herd/plan-groups/:id": edit("finance"),
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/planGroups --exclude '**/worktrees/**'`
Expected: PASS (farmGroup 2, Add 5, Update 5, Delete 3, routes 5).

---

- [ ] **Step 5: Write the failing store test**

Replace the whole of `lib/store/__tests__/planGroups.test.ts` (moved in Step 1) with:

```ts
/**
 * Grupos of the plano in the store: a new grupo is sent with its tipo and
 * joins the list; a deleted grupo, of any tipo, takes its contas and every
 * cached orçamento row of the grupo or of those contas with it, as the server
 * does; a 409 changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Budget, PlanGroup } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { groupPost, groupDelete } = vi.hoisted(() => ({ groupPost: vi.fn(), groupDelete: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { "plan-groups": Object.assign(() => ({ delete: groupDelete }), { post: groupPost }) },
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({
  ApiHerdRepository: class {
    load = vi.fn();
  },
}));
vi.mock("@/lib/store/offlineWiring", () => ({
  getOutbox: vi.fn(),
  getEngine: vi.fn(),
  wireOffline: vi.fn(),
  setSyncUser: vi.fn(),
  getSyncUser: vi.fn(),
}));

import { useHerdStore } from "@/lib/store/useHerdStore";

const GROUPS: PlanGroup[] = [
  { id: "g-maq", kind: "expense", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-arr", kind: "expense", name: "Arrendamento", createdAt: "2026-10-02T12:00:00.000Z" },
  { id: "g-nut", kind: "expense", name: "Nutrição", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-fin", kind: "financing", name: "Financiamentos", createdAt: "2026-10-01T12:00:00.000Z" },
];

const ACCOUNTS: Account[] = [
  { id: "trator", group: "g-maq", name: "Trator" },
  { id: "pasto", group: "g-arr", name: "Pasto do vizinho" },
  { id: "sal", group: "g-nut", name: "Sal mineral" },
  { id: "custeio", group: "g-fin", name: "Custeio", openingBalanceBrl: 80000, openingDate: "2026-01-31" },
];

const row = (id: string, category: string, accountId?: string): Budget => ({
  id,
  category,
  accountId,
  month: "2025-10-01",
  amountBrl: 100,
  distribution: "equal",
});

beforeEach(() => {
  vi.clearAllMocks();
  useHerdStore.setState({
    planGroups: GROUPS,
    accounts: ACCOUNTS,
    budgets: {
      2025: [
        row("maq", "g-maq"),
        row("trator", "g-maq", "trator"),
        // A legacy row of the trator filed under another grupo: the conta's delete cascades it all the same.
        row("trator-legado", "g-nut", "trator"),
        row("arr", "g-arr"),
        row("sal", "g-nut", "sal"),
      ],
    },
  });
});

describe("addPlanGroup", () => {
  it("sends the tipo with the name and adds the grupo", async () => {
    const socios: PlanGroup = { id: "g-soc", kind: "partners", name: "Sócios", createdAt: "2026-10-09T12:00:00.000Z" };
    groupPost.mockResolvedValue({ data: socios, error: null });

    expect(await useHerdStore.getState().addPlanGroup("partners", "Sócios")).toEqual(socios);

    expect(groupPost).toHaveBeenCalledWith({ kind: "partners", name: "Sócios" });
    expect(useHerdStore.getState().planGroups).toEqual([...GROUPS, socios]);
  });

  it("answers null on a 409 and adds nothing", async () => {
    groupPost.mockResolvedValue({ data: null, error: { status: 409, value: { error: "duplicate_name" } } });

    expect(await useHerdStore.getState().addPlanGroup("revenue", "Nutrição")).toBeNull();
    expect(useHerdStore.getState().planGroups).toEqual(GROUPS);
  });
});

describe("removePlanGroup", () => {
  it("drops the grupo, its contas and their orçamento rows, and keeps the rest", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-maq" }, error: null });

    expect(await useHerdStore.getState().removePlanGroup("g-maq")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.planGroups.map((g) => g.id)).toEqual(["g-arr", "g-nut", "g-fin"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["pasto", "sal", "custeio"]);
    expect(s.budgets[2025].map((b) => b.id)).toEqual(["arr", "sal"]);
  });

  it("drops a financiamento grupo with its conta and the saldo inicial on it", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-fin" }, error: null });

    expect(await useHerdStore.getState().removePlanGroup("g-fin")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.planGroups.map((g) => g.id)).toEqual(["g-maq", "g-arr", "g-nut"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["trator", "pasto", "sal"]);
    expect(s.budgets[2025]).toHaveLength(5);
  });

  it("answers in_use on a 409 and changes nothing", async () => {
    groupDelete.mockResolvedValue({ data: null, error: { status: 409, value: { error: "in_use" } } });

    expect(await useHerdStore.getState().removePlanGroup("g-maq")).toBe("in_use");

    const s = useHerdStore.getState();
    expect(s.planGroups).toEqual(GROUPS);
    expect(s.accounts).toEqual(ACCOUNTS);
    expect(s.budgets[2025]).toHaveLength(5);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/planGroups.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `addPlanGroup` / `removePlanGroup` are not functions (the store still has `addExpenseGroup` / `removeExpenseGroup` from wave 1).

- [ ] **Step 7: Implement the store actions**

All in `lib/store/useHerdStore.ts`.

In the `import type { … } from "@/lib/types";` list at the top, add a line `  GroupKind,` right after the line `  FarmData,` (task 1 already replaced `ExpenseGroup` with `PlanGroup` in that list; check with `grep -n "^  PlanGroup,$" lib/store/useHerdStore.ts`).

**Replace** the doc comment and declarations of the three grupo actions: everything strictly between the line
```ts
  removeAccount: (id: string) => Promise<"deleted" | "in_use">;
```
and the line
```ts
  /** Creates the standard contas the farm lacks; resolves how many were created. */
```
(both lines stay) **with**
```ts
  /** Creates a grupo of the plano under a tipo; null when the farm already has the name, in any tipo (409). */
  addPlanGroup: (kind: GroupKind, name: string) => Promise<PlanGroup | null>;
  /** Renames, archives or restores a grupo (its tipo never changes); false when the name is taken (409). */
  updatePlanGroup: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Deletes a grupo nothing uses, with its contas and orçamento lines; "in_use" on 409. */
  removePlanGroup: (id: string) => Promise<"deleted" | "in_use">;
```

**Replace** the three implementations: everything from the line starting `  addExpenseGroup: async` up to, not including, the line `  seedDefaultAccounts: async () => {` **with**
```ts
  addPlanGroup: async (kind, name) => {
    const { data, error } = await api["plan-groups"].post({ kind, name });
    if (error) {
      if (error.status === CONFLICT) return null;
      apiFail("criar o grupo", error);
    }
    const group = data as PlanGroup;
    set((s) => ({ planGroups: [...s.planGroups, group] }));
    return group;
  },

  updatePlanGroup: async (id, patch) => {
    const { data, error } = await api["plan-groups"]({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar o grupo", error);
    }
    const group = data as PlanGroup;
    set((s) => ({ planGroups: s.planGroups.map((g) => (g.id === id ? group : g)) }));
    return true;
  },

  removePlanGroup: async (id) => {
    const { error } = await api["plan-groups"]({ id }).delete();
    if (error) {
      if (error.status === CONFLICT) return "in_use";
      apiFail("excluir o grupo", error);
    }
    set((s) => {
      // Its contas go with it, and so do their orçamento lines, whatever grupo a line was filed under.
      const contas = new Set(s.accounts.filter((a) => a.group === id).map((a) => a.id));
      return {
        planGroups: s.planGroups.filter((g) => g.id !== id),
        accounts: s.accounts.filter((a) => !contas.has(a.id)),
        budgets: Object.fromEntries(
          Object.entries(s.budgets).map(([safra, rows]) => [
            safra,
            rows.filter((b) => b.category !== id && !(b.accountId && contas.has(b.accountId))),
          ])
        ),
      };
    });
    return "deleted";
  },

```

Now the sêmen actions (Review Focus 5's client side: nothing in the store touches `expenses` any more).

**Replace**
```ts
/** Purchase of semen doses to record; it also becomes a Reprodução expense. */
```
**with**
```ts
/** Purchase of semen doses to record: stock of the bull, not a lançamento. */
```

**Replace**
```ts
  /**
   * Registers a semen bull; its first purchase, when sent, also lands in
   * Financeiro as an expense. "duplicate" when the farm already has that name.
   */
  addSemenBull: (input: NewSemenBull) => Promise<SemenBull | "duplicate">;
  /** Edits a semen bull's registration; false when the new name is already in use. */
  updateSemenBull: (id: string, patch: SemenBullPatch) => Promise<boolean>;
  /** Records a purchase of doses of a bull, and merges the expense it wrote. */
  addSemenPurchase: (bullId: string, input: NewSemenPurchase) => Promise<void>;
  /**
   * Deletes a purchase and its expense. False when the other purchases would
   * not cover the doses already used (409 stock_negative); the herd is then
   * reloaded, since the store's count was behind the server's.
   */
  removeSemenPurchase: (bullId: string, purchaseId: string) => Promise<boolean>;
  /**
   * Deletes a bull with its purchases and their expenses. Null once it is
   * gone; otherwise what the server found holding it (409), after which the
   * herd is reloaded, since the store's picture was behind the server's.
   */
```
**with**
```ts
  /** Registers a semen bull, with its first purchase when sent. "duplicate" when the farm already has that name. */
  addSemenBull: (input: NewSemenBull) => Promise<SemenBull | "duplicate">;
  /** Edits a semen bull's registration; false when the new name is already in use. */
  updateSemenBull: (id: string, patch: SemenBullPatch) => Promise<boolean>;
  /** Records a purchase of doses of a bull. */
  addSemenPurchase: (bullId: string, input: NewSemenPurchase) => Promise<void>;
  /**
   * Deletes a purchase. False when the other purchases would not cover the
   * doses already used (409 stock_negative); the herd is then reloaded, since
   * the store's count was behind the server's.
   */
  removeSemenPurchase: (bullId: string, purchaseId: string) => Promise<boolean>;
  /**
   * Deletes a bull with its purchases. Null once it is gone; otherwise what
   * the server found holding it (409), after which the herd is reloaded,
   * since the store's picture was behind the server's.
   */
```

**Replace**
```ts
    const result = data as { bull: SemenBull; expense?: Expense };
    const expense = result.expense;
    set((s) => ({
      semenBulls: [...s.semenBulls, result.bull].sort(compareByName),
      ...(expense ? { expenses: [...s.expenses, expense] } : {}),
    }));
    return result.bull;
```
**with**
```ts
    const { bull } = data as { bull: SemenBull };
    set((s) => ({ semenBulls: [...s.semenBulls, bull].sort(compareByName) }));
    return bull;
```

**Replace**
```ts
    const { purchase, expense } = data as { purchase: SemenPurchase; expense: Expense };
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        [...purchases, purchase].sort(compareByDate)
      ),
      expenses: [...s.expenses, expense],
    }));
```
**with**
```ts
    const { purchase } = data as { purchase: SemenPurchase };
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        [...purchases, purchase].sort(compareByDate)
      ),
    }));
```

**Replace**
```ts
    const { data, error } = await api["semen-bulls"]({ id: bullId })
      .purchases({ purchaseId })
      .delete();
```
**with**
```ts
    const { error } = await api["semen-bulls"]({ id: bullId })
      .purchases({ purchaseId })
      .delete();
```

**Replace**
```ts
    // The purchase's expense went with it, unless it had been removed before.
    const { expenseId } = data as { id: string; expenseId: string | null };
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        purchases.filter((p) => p.id !== purchaseId)
      ),
      ...(expenseId !== null
        ? { expenses: s.expenses.filter((e) => e.id !== expenseId) }
        : {}),
    }));
```
**with**
```ts
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        purchases.filter((p) => p.id !== purchaseId)
      ),
    }));
```

**Replace**
```ts
    const { data, error } = await api["semen-bulls"]({ id }).delete();
```
**with**
```ts
    const { error } = await api["semen-bulls"]({ id }).delete();
```

**Replace**
```ts
    const { expenseIds } = data as { id: string; expenseIds: string[] };
    set((s) => ({
      semenBulls: s.semenBulls.filter((b) => b.id !== id),
      expenses: s.expenses.filter((e) => !expenseIds.includes(e.id)),
    }));
```
**with**
```ts
    set((s) => ({ semenBulls: s.semenBulls.filter((b) => b.id !== id) }));
```

Check: `grep -n 'expense-groups\|ExpenseGroup\|expenseIds\|{ expenseId }' lib/store/useHerdStore.ts` prints nothing (the attachment actions' `{ id: expenseId }` is not a match).

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/planGroups.test.ts lib/store/__tests__/queueOrSend.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

- [ ] **Step 9: Write the failing route-requirement tests**

This cycle imports `@/lib/api/app`, which loads `lib/api/domains/expenses/entryRules.ts`, `lib/api/domains/accounts/useCases/Add.useCase.ts` and `lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`. Until task 3 points those three at `@/lib/api/domains/planGroups/farmGroup`, they import the moved `expenseGroups/farmCategory` and the app cannot load. **Precondition:** `grep -rn "expenseGroups/farmCategory" lib` prints nothing. If it prints, run task 3 first and come back to this step.

In `lib/api/__tests__/routeRequirements.test.ts`:

**Replace**
```ts
  it("asks Financeiro for what writes a semen purchase, and Reprodução for the bull", () => {
    expect(ROUTE_REQUIREMENTS["POST /api/herd/semen-bulls"]).toEqual({ edit: ["reproduction"] });
    expect(ROUTE_REQUIREMENTS["POST /api/herd/semen-bulls/:id/purchases"]).toEqual({
      edit: ["reproduction", "finance"],
    });
    expect(
      ROUTE_REQUIREMENTS["DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId"]
    ).toEqual({ edit: ["reproduction", "finance"] });
  });
```
**with**
```ts
  it("asks Reprodução alone for a bull and its purchases: a purchase is stock, not money in the Financeiro", () => {
    for (const key of [
      "POST /api/herd/semen-bulls",
      "DELETE /api/herd/semen-bulls/:id",
      "POST /api/herd/semen-bulls/:id/purchases",
      "DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId",
    ]) {
      expect(ROUTE_REQUIREMENTS[key]).toEqual({ edit: ["reproduction"] });
    }
  });
```

**Replace**
```ts
      "POST /api/herd/expense-groups",
      "PATCH /api/herd/expense-groups/:id",
      "DELETE /api/herd/expense-groups/:id",
```
**with**
```ts
      "POST /api/herd/plan-groups",
      "PATCH /api/herd/plan-groups/:id",
      "DELETE /api/herd/plan-groups/:id",
```

- [ ] **Step 10: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the sêmen test (the purchase routes still ask `["reproduction", "finance"]`), and the two snapshots ("is pinned", "exposes exactly the documented routes") still list `expense-groups`. "names a requirement for every farm-scoped route" already passes (Step 3 renamed the three entries).

- [ ] **Step 11: Implement the route requirements**

In `lib/api/permissions/routeRequirements.ts`:

**Replace**
```ts
 * parto inserts the calf, a chute pass inserts the treatment). Money rules that
 * depend on the body live in the manejo and semen controllers.
```
**with**
```ts
 * parto inserts the calf, a chute pass inserts the treatment). Money rules that
 * depend on the body live in the manejo controller.
```

**Replace**
```ts
  // A new bull may bring its first purchase; the controller asks Financeiro for that.
  "POST /api/herd/semen-bulls": edit("reproduction"),
  "PATCH /api/herd/semen-bulls/:id": edit("reproduction"),
  // Deleting a bull takes its purchases along; the controller asks Financeiro for their expenses.
  "DELETE /api/herd/semen-bulls/:id": edit("reproduction"),
  // A purchase is a Reprodução expense: writing or deleting one moves money.
  "POST /api/herd/semen-bulls/:id/purchases": edit("reproduction", "finance"),
  "DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId": edit("reproduction", "finance"),
```
**with**
```ts
  // A new bull may bring its first purchase, and deleting one takes its purchases along.
  "POST /api/herd/semen-bulls": edit("reproduction"),
  "PATCH /api/herd/semen-bulls/:id": edit("reproduction"),
  "DELETE /api/herd/semen-bulls/:id": edit("reproduction"),
  // A purchase is stock, not money in the Financeiro.
  "POST /api/herd/semen-bulls/:id/purchases": edit("reproduction"),
  "DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId": edit("reproduction"),
```

Then update the two snapshots, `-u` last, on the two explicit paths only:

Run: `./node_modules/.bin/vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**' -u`

Check: `git status --short lib/api/__tests__/__snapshots__` lists exactly `routeRequirements.test.ts.snap` and `routeTable.test.ts.snap`, and `git diff lib/api/__tests__/__snapshots__` shows only: the three `expense-groups` keys replaced by the three `plan-groups` keys (in both files), and `"finance"` dropped from the two `semen-bulls/:id/purchases` entries of `routeRequirements.test.ts.snap`. Anything else in that diff (a route gone, a new one) is a wrong mount in `app.ts`: fix it and update again.

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/planGroups lib/store/__tests__/planGroups.test.ts lib/store/__tests__/queueOrSend.test.ts lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts lib/api/__tests__/farmPlugin.test.ts lib/api/__tests__/errorScope.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 13: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "lib/api/domains/planGroups/|lib/api/app\.ts|lib/api/permissions/|lib/api/__tests__/routeRequirements|lib/store/useHerdStore\.ts|lib/store/__tests__/planGroups"`
Expected: no output. `tsc --noEmit` as a whole stays red until wave 3, in files of other tasks only. With task 3 in
(CONTRACT-CHANGES item 1), `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E '^\S.*: error TS' | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort | uniq -c`
prints 75 errors in exactly these 31 files:
- task 4: `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` [1], `DeleteBull.useCase.ts` [1], `DeletePurchase.useCase.ts` [1];
- task 5: `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts` [1] (`planGroups` is not yet a `BudgetInputs` key), `lib/domain/budget.ts` [4], `lib/domain/economics.ts` [1], `lib/domain/ledger.ts` [3], `lib/domain/planTree.ts` [8], `lib/reports/groups.ts` [5], `lib/export/datasets/finance.ts` [2], `lib/domain/__tests__/budget.test.ts` [1], `lib/domain/__tests__/ledger.test.ts` [1], `lib/domain/__tests__/planTree.test.ts` [4];
- task 6: `app/(app)/finance/page.tsx` [1], `components/dashboard/FinanceCard.tsx` [1], `components/finance/BillsCard.tsx` [1], `components/finance/CostBreakdownCard.tsx` [1], `components/finance/SeriesScopeDialog.tsx` [1], `components/finance/contas/AccountMovements.tsx` [2], `components/finance/contas/ConciliarPage.tsx` [1], `components/finance/lancamentos/LancamentosPage.tsx` [1], `components/finance/orcamento/BudgetEditDialog.tsx` [2], `components/finance/orcamento/OrcamentoPage.tsx` [3], `components/reports/datasets.ts` [1], `components/reports/useReportData.ts` [1];
- task 7: `components/finance/EntryDialog.tsx` [7], `components/finance/entryFields.ts` [4], `components/finance/plano/AccountsPage.tsx` [8], `components/finance/plano/GroupHeader.tsx` [3], `components/finance/plano/NewAccountDialog.tsx` [3], `components/finance/plano/NewGroupDialog.tsx` [1] (`AccountsPage`, `GroupHeader` and `NewGroupDialog` call `addExpenseGroup` / `updateExpenseGroup` / `removeExpenseGroup`, now `addPlanGroup(kind, name)` / `updatePlanGroup` / `removePlanGroup`).

Run: `./node_modules/.bin/eslint lib/api/domains/planGroups lib/api/app.ts lib/api/permissions/routeRequirements.ts lib/api/__tests__/routeRequirements.test.ts lib/store/useHerdStore.ts lib/store/__tests__/planGroups.test.ts`
Expected: clean.

---

### Task 3: Validation

Every lançamento but a rendimento now names a grupo (`plan_groups` id) of its own kind, and the server checks it.
The API stops writing `"other"`, the contas and the orçamento validate against `plan_groups`, and "Sugerir contas
padrão" finds its grupos by name. Four TDD cycles: the pure `lib/domain/accounts.ts`, the lançamentos
(`normaliseEntry` and everything that writes `category`), the contas, the orçamento.

Run this task after tasks 1 and 2 are in (`farmGroup` must exist). Cycle 4's `CopyBudgets.test.ts` also needs task
5's `BudgetInputs.planGroups` in `lib/domain/budget.ts` (same wave): if task 5 has not landed yet, that one file
stays red until it does; nothing in it is yours to change.

**Files:**
- Modify: `lib/domain/accounts.ts`
- Modify: `lib/api/domains/expenses/entryRules.ts`
- Modify: `lib/api/domains/expenses/schemas/expense.schema.ts`
- Modify: `lib/api/domains/expenses/expenses.controller.ts`
- Modify: `lib/api/domains/expenses/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/Update.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/Split.useCase.ts`
- Modify: `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`
- Modify: `lib/api/domains/accounts/schemas/account.schema.ts`
- Modify: `lib/api/domains/accounts/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/accounts/useCases/Update.useCase.ts`
- Modify: `lib/api/domains/accounts/useCases/SeedDefaults.useCase.ts`
- Modify: `lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`
- Modify: `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`
- Test: `lib/domain/__tests__/accounts.test.ts`
- Create: `lib/api/domains/expenses/__tests__/entryRules.test.ts`
- Test: `lib/api/domains/expenses/__tests__/expenses.routes.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Add.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Update.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Split.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts`
- Test: `lib/api/domains/expenses/useCases/__tests__/Get.test.ts`
- Test: `lib/api/domains/statements/useCases/__tests__/statements.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/Update.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/Delete.test.ts`
- Test: `lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts`
- Test: `lib/api/domains/budgets/__tests__/budgets.routes.test.ts`

**Interfaces:**
- Consumes:
  - `farmGroup(repo: RepositoryType, farmId: number, id: string): Promise<PlanGroupRow | null>` from
    `@/lib/api/domains/planGroups/farmGroup` (task 2): the grupo of this farm by id, archived or not.
  - `planGroups`, `PlanGroupRow` (`lib/db/schema.ts`), `toPlanGroup` (`lib/api/mappers.ts`), `GroupKind`,
    `PlanGroup`, `Expense.category?: ExpenseCategory` (`lib/types.ts`), nullable `expenses.category`, and
    `DEFAULT_GROUPS` (`lib/domain/groups.ts`, used by a test only): task 1.
  - `BudgetInputs { budgets; expenses; accounts; planGroups: readonly PlanGroup[] }` and `copyPlan` with its
    unchanged signature (`lib/domain/budget.ts`): task 5.
- Produces:
  - `EntryInput.category?: ExpenseCategory`; `NormalisedEntry.category: ExpenseCategory | null` (null on a
    rendimento only); `normaliseEntry` answers `invalid_category` for a missing grupo, an unknown or other farm's
    grupo, or a grupo of another kind, and `invalid_account` for a conta outside the grupo sent.
  - `NewExpenseBody.category` (and so `CreateFromLineBody.category`) is `t.Optional`; `LineEntry.category?:
    ExpenseCategory`; `ResolveLine` "create" writes the category the form sent for both directions.
  - `validOpening(kind: GroupKind, balance: number | null, date: string | null): boolean` (true with neither
    set, or with both on `financing`); `AddAccount` takes a grupo of the farm of any kind.
  - `PutBudgetLine` takes only a grupo of kind `expense`; `CopyBudgets` passes `planGroups` to `copyPlan` and no
    longer reads treatments.
  - `DEFAULT_ACCOUNTS: readonly { group: string; name: string }[]` keyed by the default grupo's NAME;
    `accountsByGroup(accounts, includeArchived?)` with no pre-filled keys (callers read `byGroup[id] ?? []`);
    `missingDefaults` deleted.

#### Cycle 1 — `lib/domain/accounts.ts`

- [ ] **Step 1: Write the failing test**

`lib/domain/__tests__/accounts.test.ts` — replace the whole file with:

```ts
import { describe, expect, it } from "vitest";
import { accountName, accountsByGroup, counterpartySuggestions, DEFAULT_ACCOUNTS } from "@/lib/domain/accounts";
import { DEFAULT_GROUPS } from "@/lib/domain/groups";
import type { Account, Expense } from "@/lib/types";

const account = (overrides: Partial<Account>): Account => ({
  id: "acc-1",
  group: "grp-nutricao",
  name: "Sal mineral",
  ...overrides,
});

const expense = (overrides: Partial<Expense>): Expense => ({
  id: "e-1",
  kind: "expense",
  date: "2026-09-01",
  category: "grp-nutricao",
  amountBrl: 100,
  ...overrides,
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is the standard plano de contas, by the default grupo's name", () => {
    const names = (group: string) =>
      DEFAULT_ACCOUNTS.filter((a) => a.group === group).map((a) => a.name);
    expect(names("Receitas")).toEqual(["Aluguel de pasto", "Venda de esterco", "Outras receitas"]);
    expect(names("Nutrição")).toEqual(["Sal mineral", "Ração e suplemento", "Silagem"]);
    expect(names("Pastagem")).toEqual(["Adubo", "Sementes", "Herbicida", "Roçada"]);
    expect(names("Mão de obra")).toEqual(["Salários", "Encargos", "Diárias"]);
    expect(names("Sanidade")).toEqual(["Vacinas", "Vermífugos", "Medicamentos", "Veterinário"]);
    expect(names("Reprodução")).toEqual(["Sêmen", "IATF e hormônios", "Touros"]);
    expect(names("Administrativo")).toEqual([
      "Energia",
      "Combustível",
      "Manutenção",
      "Impostos e taxas",
      "Contabilidade",
    ]);
    expect(names("Outros")).toEqual([]);
    expect(names("Investimentos")).toEqual(["Benfeitorias", "Máquinas e implementos", "Equipamentos"]);
    expect(names("Financiamentos")).toEqual([]);
    expect(names("Sócios")).toEqual(["Distribuição de lucro"]);
    expect(DEFAULT_ACCOUNTS).toHaveLength(29);
  });

  it("names only default grupos", () => {
    const defaults = new Set(DEFAULT_GROUPS.map((g) => g.name));
    expect(DEFAULT_ACCOUNTS.filter((a) => !defaults.has(a.group))).toEqual([]);
  });
});

describe("accountsByGroup", () => {
  const accounts = [
    account({ id: "a-1", name: "Sal mineral" }),
    account({ id: "a-2", name: "Água" }),
    account({ id: "a-3", name: "Ração e suplemento" }),
    account({ id: "a-4", name: "Silagem", archivedAt: "2026-05-01T00:00:00.000Z" }),
    account({ id: "a-5", group: "grp-receitas", name: "Aluguel de pasto" }),
  ];

  it("groups the active contas by grupo id, sorted by name the Portuguese way", () => {
    const byGroup = accountsByGroup(accounts);
    expect(byGroup["grp-nutricao"].map((a) => a.id)).toEqual(["a-2", "a-3", "a-1"]);
    expect(byGroup["grp-receitas"].map((a) => a.id)).toEqual(["a-5"]);
  });

  it("lists a grupo only once it has a conta to show: no pre-filled keys", () => {
    const farm = [
      ...accounts,
      account({ id: "a-6", group: "grp-maq", name: "Pneus", archivedAt: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(Object.keys(accountsByGroup(farm)).sort()).toEqual(["grp-nutricao", "grp-receitas"]);
    expect(accountsByGroup(farm, true)["grp-maq"].map((a) => a.id)).toEqual(["a-6"]);
    expect(accountsByGroup([])).toEqual({});
  });

  it("includes archived contas when asked", () => {
    expect(accountsByGroup(accounts, true)["grp-nutricao"].map((a) => a.id)).toEqual([
      "a-2",
      "a-3",
      "a-1",
      "a-4",
    ]);
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

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `DEFAULT_ACCOUNTS` is still keyed by `"nutrition"`… (`names("Receitas")` is `[]`), and
`accountsByGroup` pre-fills `revenue`, the built-in keys and the capital keys.

- [ ] **Step 3: Implement**

`lib/domain/accounts.ts` — replace the whole file with:

```ts
/**
 * Plano de contas: the farm's contas inside its grupos (lib/domain/groups.ts
 * lists the grupos). Pure.
 */
import type { Account, AccountGroup, Expense } from "@/lib/types";

/** What "Sugerir contas padrão" creates: `group` is the default grupo's NAME (lib/domain/groups.ts DEFAULT_GROUPS). */
export const DEFAULT_ACCOUNTS: readonly { group: string; name: string }[] = [
  { group: "Receitas", name: "Aluguel de pasto" },
  { group: "Receitas", name: "Venda de esterco" },
  { group: "Receitas", name: "Outras receitas" },
  { group: "Nutrição", name: "Sal mineral" },
  { group: "Nutrição", name: "Ração e suplemento" },
  { group: "Nutrição", name: "Silagem" },
  { group: "Pastagem", name: "Adubo" },
  { group: "Pastagem", name: "Sementes" },
  { group: "Pastagem", name: "Herbicida" },
  { group: "Pastagem", name: "Roçada" },
  { group: "Mão de obra", name: "Salários" },
  { group: "Mão de obra", name: "Encargos" },
  { group: "Mão de obra", name: "Diárias" },
  { group: "Sanidade", name: "Vacinas" },
  { group: "Sanidade", name: "Vermífugos" },
  { group: "Sanidade", name: "Medicamentos" },
  { group: "Sanidade", name: "Veterinário" },
  { group: "Reprodução", name: "Sêmen" },
  { group: "Reprodução", name: "IATF e hormônios" },
  { group: "Reprodução", name: "Touros" },
  { group: "Administrativo", name: "Energia" },
  { group: "Administrativo", name: "Combustível" },
  { group: "Administrativo", name: "Manutenção" },
  { group: "Administrativo", name: "Impostos e taxas" },
  { group: "Administrativo", name: "Contabilidade" },
  { group: "Investimentos", name: "Benfeitorias" },
  { group: "Investimentos", name: "Máquinas e implementos" },
  { group: "Investimentos", name: "Equipamentos" },
  { group: "Sócios", name: "Distribuição de lucro" },
];

/** Contas per grupo id, sorted by name; archived ones only when asked. No pre-filled keys: read `byGroup[id] ?? []`. */
export function accountsByGroup(
  accounts: Account[],
  includeArchived = false
): Record<AccountGroup, Account[]> {
  const byGroup: Record<AccountGroup, Account[]> = {};
  for (const a of accounts) {
    if (includeArchived || a.archivedAt === undefined) (byGroup[a.group] ??= []).push(a);
  }
  for (const list of Object.values(byGroup)) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return byGroup;
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

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts --exclude '**/worktrees/**'`
Expected: PASS

#### Cycle 2 — lançamentos: `normaliseEntry` and every use case that writes `category`

The new `entryRules.test.ts` covers Review Focus 2 for the lançamentos: a receita or capital lançamento without
`category`, with a grupo of another kind, of another farm or an unknown id → `invalid_category`; a conta in another
grupo → `invalid_account`; an archived grupo still saves; a rendimento sent with a category is stored with null.
The existing use-case tests change because every lançamento but a rendimento now reads its grupo first (one
`plan_groups` select before the conta), and their categories become grupo ids.

- [ ] **Step 1: Write the failing tests**

Create `lib/api/domains/expenses/__tests__/entryRules.test.ts`:

```ts
/**
 * normaliseEntry: every lançamento but a rendimento names a grupo of this
 * farm of its own kind, and a conta sent sits in that grupo. A rendimento
 * stores no grupo whatever it sends.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue (the grupo, then the conta do plano) and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { normaliseEntry, type EntryInput } from "../entryRules";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

/** A plan_groups row of farm 7 as farmGroup reads it. */
const grupo = (id: string, kind: string, archivedAt: Date | null = null) => ({
  id,
  farmId: 7,
  kind,
  name: id,
  archivedAt,
  createdAt: new Date(0),
});

const RECEITA: EntryInput = { kind: "revenue", date: "2026-09-10", category: "grp-receitas" };
const normalise = (entry: Partial<EntryInput>) => normaliseEntry(repo, 7, { ...RECEITA, ...entry });

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("normaliseEntry — grupo", () => {
  it("stores the grupo a receita sends, read on this farm, with a conta of that grupo", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], [{ group: "grp-receitas" }]];

    expect(await normalise({ accountId: "acc-aluguel" })).toEqual({
      kind: "revenue",
      flow: null,
      category: "grp-receitas",
      dueDate: null,
      paidAt: null,
      accountId: "acc-aluguel",
      lotId: null,
    });
    // The grupo is read on this farm (farmGroup).
    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"plan_groups"."farm_id"');
    expect(params).toEqual(expect.arrayContaining([7, "grp-receitas"]));
  });

  it("refuses a receita or a capital lançamento sent without grupo, before reading anything", async () => {
    expect(await normalise({ category: undefined })).toBe("invalid_category");
    expect(await normalise({ kind: "financing", category: undefined, accountId: "acc-pronaf" })).toBe(
      "invalid_category"
    );
    expect(state.wheres).toEqual([]);
  });

  it("refuses a grupo of another kind, another farm's grupo and an unknown id", async () => {
    // A despesa grupo sent with a receita.
    state.selectResults = [[grupo("grp-nutricao", "expense")]];
    expect(await normalise({ category: "grp-nutricao" })).toBe("invalid_category");
    // A receita grupo sent with an investimento.
    state.selectResults = [[grupo("grp-receitas", "revenue")]];
    expect(await normalise({ kind: "investment", accountId: "acc-benf" })).toBe("invalid_category");
    // The farm filter finds no grupo by that id; the conta queued after it is never read.
    state.selectResults = [[], [{ group: "grp-x" }]];
    expect(await normalise({ category: "grp-of-another-farm", accountId: "acc-1" })).toBe("invalid_category");
    expect(state.selectResults).toEqual([[{ group: "grp-x" }]]);
    state.selectResults = [[]];
    expect(await normalise({ category: "nutrition" })).toBe("invalid_category");
  });

  it("refuses a conta of another grupo or another farm", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], [{ group: "grp-nutricao" }]];
    expect(await normalise({ accountId: "acc-sal" })).toBe("invalid_account");
    state.selectResults = [[grupo("grp-receitas", "revenue")], []];
    expect(await normalise({ accountId: "acc-of-another-farm" })).toBe("invalid_account");
  });

  it("saves a lançamento in an archived grupo: archiving only takes the grupo out of the forms", async () => {
    state.selectResults = [[grupo("grp-arrend", "expense", new Date("2026-08-01T00:00:00Z"))]];

    expect(await normalise({ kind: "expense", category: "grp-arrend", lotId: "lot-1" })).toMatchObject({
      kind: "expense",
      category: "grp-arrend",
      lotId: "lot-1",
    });
  });
});

describe("normaliseEntry — fora do resultado", () => {
  it("stores a capital lançamento in its grupo, a saída when no movimento is sent, without lote", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }]];

    const retirada = { kind: "partners" as const, category: "grp-socios", accountId: "acc-retiradas", lotId: "lot-1" };
    expect(await normalise(retirada)).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "grp-socios",
      accountId: "acc-retiradas",
      lotId: null,
    });
  });

  it("still asks a conta of a capital lançamento", async () => {
    state.selectResults = [[grupo("grp-financiamentos", "financing")]];
    expect(await normalise({ kind: "financing", category: "grp-financiamentos" })).toBe("invalid_account");
  });

  it("stores a rendimento without grupo, whatever it sends, and reads nothing", async () => {
    expect(await normalise({ kind: "yield", category: "grp-receitas", bankAccountId: "cdb" })).toMatchObject({
      kind: "yield",
      category: null,
      accountId: null,
      paidAt: "2026-09-10",
    });
    expect(await normalise({ kind: "yield", category: undefined, bankAccountId: "cdb" })).toMatchObject({
      category: null,
    });
    expect(state.wheres).toEqual([]);
  });
});
```

In `lib/api/domains/expenses/__tests__/expenses.routes.test.ts`:

Replace:

```ts
 *
 * POST /expenses takes a farm grupo's id as its category (not just one of the
 * seven built-in keys) and answers 400 naming `invalid_category`.
 */
```

with:

```ts
 *
 * POST /expenses takes a grupo id as its category, or none (a rendimento),
 * and answers 400 naming `invalid_category`: the use case judges the grupo.
 */
```

Replace:

```ts
    expect(await response.json()).toEqual({ error: "invalid_category" });
  });
});
```

with:

```ts
    expect(await response.json()).toEqual({ error: "invalid_category" });
  });

  it("takes a body without category: a rendimento sends none", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    add.mockResolvedValueOnce({ id: "e-1" });
    const entry = { date: "2026-09-10", kind: "yield", amountBrl: 812.4, bankAccountId: "cdb" };

    const response = await herdApi.handle(
      new Request("http://localhost/api/herd/expenses", {
        method: "POST",
        headers: { "x-farm-id": "7", "content-type": "application/json" },
        body: JSON.stringify(entry),
      })
    );

    expect(response.status).toBe(200);
    expect(add).toHaveBeenCalledWith({ farmId: 7, ...entry });
  });
});
```

`lib/api/domains/expenses/useCases/__tests__/Add.test.ts` — replace the whole file with:

```ts
/**
 * addExpense: registers a lançamento with its vencimento, pagamento, conta and
 * lote. A despesa by default; a vencimento before the data is refused. The
 * kinds fora do resultado take a conta do plano of their group and a
 * movimento; a rendimento takes its aplicação and is paid on its data.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupo, the conta do plano, then "Pago por"),
 * inserts record the row and echo it. The grupo rules themselves are
 * entryRules.test.ts's.
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

const ENTRY = { farmId: 7, date: "2026-09-10", category: "grp-nutricao", amountBrl: 500 };
/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const add = (input: Parameters<AddExpenseUseCase["run"]>[0]) => new AddExpenseUseCase().run(input);

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addExpense", () => {
  it("writes every new column, a despesa by default", async () => {
    state.selectResults = [[NUTRICAO], [{ group: "grp-nutricao" }]];

    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "grp-nutricao",
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
      category: "grp-nutricao",
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

  it("writes a receita in its grupo, absent optionals as null", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")]];

    await new AddExpenseUseCase().run({
      farmId: 7,
      kind: "revenue",
      date: "2026-09-10",
      category: "grp-receitas",
      amountBrl: 800,
    });

    expect(state.inserts[0]).toMatchObject({
      kind: "revenue",
      category: "grp-receitas",
      dueDate: null,
      paidAt: null,
      counterparty: null,
      document: null,
      accountId: null,
      lotId: null,
    });
  });

  it("refuses a receita sent without grupo and inserts nothing", async () => {
    expect(await add({ ...ENTRY, kind: "revenue", category: undefined })).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });

  it("refuses a vencimento before the data and inserts nothing", async () => {
    state.selectResults = [[NUTRICAO]];

    const result = await new AddExpenseUseCase().run({
      farmId: 7,
      date: "2026-09-10",
      category: "grp-nutricao",
      amountBrl: 500,
      dueDate: "2026-09-01",
    });

    expect(result).toBe("due_before_date");
    expect(state.inserts).toEqual([]);
  });
});

describe("addExpense — fora do resultado", () => {
  const INVESTIMENTOS = grupo("grp-investimentos", "investment");
  const compra = { ...ENTRY, kind: "investment" as const, category: "grp-investimentos", amountBrl: 38000 };

  it("refuses an investimento without conta, or with a conta of another grupo or farm", async () => {
    state.selectResults = [[INVESTIMENTOS]];
    expect(await add(compra)).toBe("invalid_account");
    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-financiamentos" }]];
    expect(await add({ ...compra, accountId: "acc-pronaf" })).toBe("invalid_account");
    state.selectResults = [[INVESTIMENTOS], []];
    expect(await add({ ...compra, accountId: "acc-of-another-farm" })).toBe("invalid_account");
    expect(state.inserts).toEqual([]);
  });

  it("stores a capital lançamento sent without movimento as a saída, in its grupo, without lote", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }]];

    await add({ ...ENTRY, kind: "partners", category: "grp-socios", accountId: "acc-retiradas", lotId: "lot-1" });

    expect(state.inserts[0]).toMatchObject({
      kind: "partners",
      flow: "out",
      category: "grp-socios",
      lotId: null,
      accountId: "acc-retiradas",
    });
  });

  it("lets a cartão pay a compra, never a retirada or a venda do bem", async () => {
    const paidByCard = { paidAt: "2026-09-10", bankAccountId: "cartao" };
    const card = [{ kind: "card", archivedAt: null }];
    const retirada = { ...ENTRY, kind: "partners" as const, category: "grp-socios", accountId: "acc-retiradas" };
    state.selectResults = [[grupo("grp-socios", "partners")], [{ group: "grp-socios" }], card];
    expect(await add({ ...retirada, ...paidByCard })).toBe("invalid_bank_account");
    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-investimentos" }], card];
    expect(await add({ ...compra, flow: "in", accountId: "acc-maquinas", ...paidByCard })).toBe(
      "invalid_bank_account"
    );
    expect(state.inserts).toEqual([]);

    state.selectResults = [[INVESTIMENTOS], [{ group: "grp-investimentos" }], card];
    expect(await add({ ...compra, accountId: "acc-maquinas", ...paidByCard })).toMatchObject({
      kind: "investment",
      flow: "out",
      bankAccountId: "cartao",
    });
  });

  it("keeps a rendimento in its aplicação, paid on its data, without grupo, and refuses it anywhere else", async () => {
    const rendimento = { ...ENTRY, kind: "yield" as const, amountBrl: 812.4 };
    // Only "Pago por" is read: a rendimento asks no grupo, even when the form sends one.
    state.selectResults = [[{ kind: "investment", archivedAt: null }]];
    await add({ ...rendimento, dueDate: "2026-09-30", lotId: "lot-1", bankAccountId: "cdb" });
    expect(state.inserts[0]).toMatchObject({
      kind: "yield",
      flow: null,
      category: null,
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

In `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`:

Replace:

```ts
  state: {
    /** Rows each `select()` resolves to, in call order: the conta do plano, then "Pago por". */
    selectResults: [] as Record<string, unknown>[][],
```

with:

```ts
  state: {
    /** Rows each `select()` resolves to, in call order: the grupo, the conta do plano, then "Pago por". */
    selectResults: [] as Record<string, unknown>[][],
```

Replace:

```ts
  date: "2026-09-27",
  category: "nutrition" as const,
  counterparty: "Nutron",
```

with:

```ts
  date: "2026-09-27",
  category: "grp-nutricao",
  counterparty: "Nutron",
```

Replace:

```ts

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
```

with:

```ts

/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });

beforeEach(() => {
  // Every despesa here is in Nutrição unless a test says otherwise: the grupo check reads it first.
  state.selectResults = [[grupo("grp-nutricao", "expense")]];
  state.inserts = [];
```

Replace:

```ts
  it("writes each ocorrência on its own date up to today + 12 months", async () => {
    await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "labor",
      amountBrl: 6480,
```

with:

```ts
  it("writes each ocorrência on its own date up to today + 12 months", async () => {
    state.selectResults = [[grupo("grp-mao-de-obra", "expense")]];
    await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "grp-mao-de-obra",
      amountBrl: 6480,
```

Replace:

```ts
describe("addSeries — fora do resultado", () => {
  it("writes a financiamento's movimento on the série and every parcela, without grupo or lote", async () => {
    state.selectResults = [[{ group: "financing" }]];

```

with:

```ts
describe("addSeries — fora do resultado", () => {
  it("writes a financiamento's grupo and movimento on the série and every parcela, without lote", async () => {
    state.selectResults = [[grupo("grp-financiamentos", "financing")], [{ group: "grp-financiamentos" }]];

```

Replace:

```ts
      kind: "financing",
      accountId: "acc-pronaf",
```

with:

```ts
      kind: "financing",
      category: "grp-financiamentos",
      accountId: "acc-pronaf",
```

Replace:

```ts
      flow: "out",
      category: "other",
      accountId: "acc-pronaf",
```

with:

```ts
      flow: "out",
      category: "grp-financiamentos",
      accountId: "acc-pronaf",
```

Replace:

```ts
    });
    expect(rows.every((row) => row.flow === "out" && row.category === "other" && row.lotId === null)).toBe(true);
  });

  it("refuses a série of sócios without a conta of its group", async () => {
    const result = await new AddSeriesUseCase().run({
```

with:

```ts
    });
    expect(
      rows.every((row) => row.flow === "out" && row.category === "grp-financiamentos" && row.lotId === null)
    ).toBe(true);
  });

  it("refuses a série of sócios without a conta", async () => {
    state.selectResults = [[grupo("grp-socios", "partners")]];
    const result = await new AddSeriesUseCase().run({
```

Replace:

```ts
      kind: "partners",
      amountBrl: 5000,
```

with:

```ts
      kind: "partners",
      category: "grp-socios",
      amountBrl: 5000,
```

`lib/api/domains/expenses/useCases/__tests__/Update.test.ts` — replace the whole file with:

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
    for: () => builder,
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

vi.mock("@/lib/db", () => {
  const db = {
    select: selectBuilder,
    update: updateBuilder,
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run(db)),
  };
  return { db };
});

import type { Expense } from "@/lib/types";

import { UpdateExpenseUseCase, type ExpensePatchInput } from "../Update.useCase";

const ROW = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  flow: null,
  date: "2026-09-10",
  category: "grp-nutricao",
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

/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });

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

  it("never forwards an undeclared column such as farmId", async () => {
    state.selectResults = [[ROW]];
    state.updateResults = [[{ ...ROW, paidAt: "2026-09-24" }]];

    await new UpdateExpenseUseCase().run({
      farmId: 7,
      id: "e-1",
      patch: { paidAt: "2026-09-24", farmId: 999 } as ExpensePatchInput,
    });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).not.toHaveProperty("farmId");
    expect(state.updates[0]).toEqual({ paidAt: "2026-09-24" });
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

describe("updateExpense — what the kind needs", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("refuses a new kind while the grupo or the conta is still the old one", async () => {
    // The row, then its grupo: a despesa grupo cannot hold an investimento.
    state.selectResults = [[ROW], [grupo("grp-nutricao", "expense")]];
    expect(await run({ kind: "investment" })).toBe("invalid_category");

    const benfeitoria = { ...ROW, kind: "investment", flow: "out", category: "grp-investimentos" };
    // The row, the grupo sent, then the conta it keeps: still of Investimentos.
    state.selectResults = [[benfeitoria], [grupo("grp-nutricao", "expense")], [{ group: "grp-investimentos" }]];
    expect(await run({ kind: "expense", category: "grp-nutricao" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("turns a despesa into an investimento: its grupo and conta, no lote, a saída", async () => {
    const investimento = { kind: "investment", flow: "out", category: "grp-investimentos", accountId: "acc-benf" };
    state.selectResults = [
      [{ ...ROW, lotId: "lot-1" }],
      [grupo("grp-investimentos", "investment")],
      [{ group: "grp-investimentos" }],
    ];
    state.updateResults = [[{ ...ROW, ...investimento }]];

    const result = await run({ kind: "investment", accountId: "acc-benf", category: "grp-investimentos", lotId: "lot-1" });

    expect(state.updates[0]).toMatchObject({
      kind: "investment",
      flow: "out",
      category: "grp-investimentos",
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
      category: "grp-socios",
      accountId: "acc-socios",
      paidAt: "2026-09-12",
      bankAccountId: "cartao",
    };
    state.selectResults = [
      [retirada],
      [grupo("grp-socios", "partners")],
      [{ group: "grp-socios" }],
      [{ kind: "card", archivedAt: null }],
    ];

    expect(await run({ flow: "in" })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
  });

  it("keeps a rendimento paid on its data, without grupo", async () => {
    const rendimento = {
      ...ROW,
      kind: "yield",
      category: null,
      dueDate: null,
      paidAt: "2026-09-10",
      accountId: null,
      bankAccountId: "cdb",
    };
    state.selectResults = [[rendimento]];
    state.updateResults = [[{ ...rendimento, date: "2026-09-30", paidAt: "2026-09-30" }]];

    const result = await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({
      date: "2026-09-30",
      paidAt: "2026-09-30",
      dueDate: null,
      category: null,
    });
    expect(result).toMatchObject({ kind: "yield" });
    expect((result as Expense).category).toBeUndefined();
  });
});

describe("updateExpense — grupo", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("checks a grupo sent alone: not one of the farm's, or not the conta's", async () => {
    // The row, then the grupo sent: no grupo of this farm by that id.
    state.selectResults = [[ROW], []];
    expect(await run({ category: "grp-of-another-farm" })).toBe("invalid_category");
    // The row, the grupo sent, then its conta: still a conta of Nutrição.
    state.selectResults = [[ROW], [grupo("grp-administrativo", "expense")], [{ group: "grp-nutricao" }]];
    expect(await run({ category: "grp-administrativo" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("saves the edit of an old lançamento whose grupo is archived", async () => {
    const old = { ...ROW, category: "grp-arrend", accountId: "acc-pasto-vizinho" };
    // The row, its grupo (found whatever archived_at says), its conta.
    state.selectResults = [
      [old],
      [{ ...grupo("grp-arrend", "expense"), archivedAt: new Date("2026-08-01T00:00:00Z") }],
      [{ group: "grp-arrend" }],
    ];
    state.updateResults = [[{ ...old, notes: "Parcela de setembro" }]];

    // The form sends every field back, grupo and conta included.
    const result = await run({ category: "grp-arrend", accountId: "acc-pasto-vizinho", notes: "Parcela de setembro" });

    expect(state.updates[0]).toMatchObject({
      category: "grp-arrend",
      accountId: "acc-pasto-vizinho",
      notes: "Parcela de setembro",
    });
    expect(result).toMatchObject({ category: "grp-arrend", notes: "Parcela de setembro" });
  });
});
```

In `lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts`:

Replace:

```ts
  date: dueDate,
  category: "admin",
  amountBrl: 1280,
```

with:

```ts
  date: dueDate,
  category: "grp-administrativo",
  amountBrl: 1280,
```

Replace:

```ts
      flow: "out",
      category: "other",
      accountId: "acc-socios",
```

with:

```ts
      flow: "out",
      category: "grp-socios",
      accountId: "acc-socios",
```

Replace:

```ts
    const rows = ROWS.map(aporte);
    // The row, the série, the row again (its own update), its conta do plano, its linhas (none), the siblings.
    state.selectResults = [[rows[1]], [SERIES], [rows[1]], [{ group: "partners" }], [], rows];
    state.returning = [[{ ...rows[1], flow: "in" }]];
```

with:

```ts
    const rows = ROWS.map(aporte);
    // The row, the série, the row again (its own update), its grupo, its conta do plano, its linhas (none), the siblings.
    const socios = { id: "grp-socios", farmId: 7, kind: "partners", name: "Sócios", archivedAt: null, createdAt: new Date(0) };
    state.selectResults = [[rows[1]], [SERIES], [rows[1]], [socios], [{ group: "grp-socios" }], [], rows];
    state.returning = [[{ ...rows[1], flow: "in" }]];
```

Replace:

```ts

    expect(state.updates[0]).toMatchObject({ kind: "partners", flow: "in", category: "other" });
    // The série template, then row 4 (rows 1 and 3 are paid).
```

with:

```ts

    expect(state.updates[0]).toMatchObject({ kind: "partners", flow: "in", category: "grp-socios" });
    // The série template, then row 4 (rows 1 and 3 are paid).
```

Replace:

```ts
  it("never changes the kind of a série: the edit is judged as the kind the rows have", async () => {
    // The row, the série, the row again (its own update), the conta do plano sent: an investimento's.
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], [{ group: "investment" }]];

```

with:

```ts
  it("never changes the kind of a série: the edit is judged as the kind the rows have", async () => {
    // The row, the série, the row again (its own update), its grupo, the conta do plano sent: an investimento's.
    const administrativo = {
      id: "grp-administrativo",
      farmId: 7,
      kind: "expense",
      name: "Administrativo",
      archivedAt: null,
      createdAt: new Date(0),
    };
    state.selectResults = [[ROWS[1]], [SERIES], [ROWS[1]], [administrativo], [{ group: "grp-investimentos" }]];

```

In `lib/api/domains/expenses/useCases/__tests__/Split.test.ts`:

Replace:

```ts
  date: "2026-09-27",
  category: "other",
  amountBrl: 1000,
```

with:

```ts
  date: "2026-09-27",
  category: "grp-investimentos",
  amountBrl: 1000,
```

Replace:

```ts
      flow: "out",
      accountId: "acc-maquinas",
```

with:

```ts
      flow: "out",
      category: "grp-investimentos",
      accountId: "acc-maquinas",
```

Replace:

```ts
      "a rendimento",
      { kind: "yield", flow: null, accountId: null, dueDate: null, paidAt: "2026-09-27", bankAccountId: "cdb" },
    ],
```

with:

```ts
      "a rendimento",
      { kind: "yield", flow: null, category: null, accountId: null, dueDate: null, paidAt: "2026-09-27", bankAccountId: "cdb" },
    ],
```

In `lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts`:

Replace:

```ts
  kind: "expense",
  category: "labor",
  amountBrl: 6480,
```

with:

```ts
  kind: "expense",
  category: "grp-mao-de-obra",
  amountBrl: 6480,
```

Replace:

```ts
  it("writes the série's kind and movimento on each new row", async () => {
    const pronaf = { ...SALARIO, kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" };
    state.selectResults = [[pronaf], [pronaf]];
```

with:

```ts
  it("writes the série's kind and movimento on each new row", async () => {
    const pronaf = { ...SALARIO, kind: "financing", flow: "out", category: "grp-financiamentos", accountId: "acc-pronaf" };
    state.selectResults = [[pronaf], [pronaf]];
```

Replace:

```ts
    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ kind: "financing", flow: "out", category: "other", accountId: "acc-pronaf" });
  });
```

with:

```ts
    const rows = state.inserts[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      kind: "financing",
      flow: "out",
      category: "grp-financiamentos",
      accountId: "acc-pronaf",
    });
  });
```

In `lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts`:

Replace:

```ts
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 4850,
```

with:

```ts
  date: "2026-09-10",
  category: "grp-nutricao",
  amountBrl: 4850,
```

Replace:

```ts

const entry = { farmId: 7, date: "2026-09-18", category: "nutrition" as const, amountBrl: 4850 };

```

with:

```ts

const entry = { farmId: 7, date: "2026-09-18", category: "grp-nutricao", amountBrl: 4850 };
/** A plan_groups row of the farm, as the grupo check reads it before "Pago por". */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const RECEITAS = grupo("grp-receitas", "revenue");

```

Replace:

```ts
  it("keeps the conta of a paid lançamento", async () => {
    state.selectResults = [[{ kind: "checking", archivedAt: null }]];
    state.returning = [[ROW]];
```

with:

```ts
  it("keeps the conta of a paid lançamento", async () => {
    state.selectResults = [[NUTRICAO], [{ kind: "checking", archivedAt: null }]];
    state.returning = [[ROW]];
```

Replace:

```ts
  it("drops the conta of a pending lançamento without asking", async () => {
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
```

with:

```ts
  it("drops the conta of a pending lançamento without asking", async () => {
    state.selectResults = [[NUTRICAO]];
    state.returning = [[{ ...ROW, paidAt: null, bankAccountId: null }]];
```

Replace:

```ts
  it("refuses a conta of another farm and a cartão for a receita", async () => {
    state.selectResults = [[]];
    expect(await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "other" })).toBe(
```

with:

```ts
  it("refuses a conta of another farm and a cartão for a receita", async () => {
    state.selectResults = [[NUTRICAO], []];
    expect(await new AddExpenseUseCase().run({ ...entry, paidAt: "2026-09-18", bankAccountId: "other" })).toBe(
```

Replace:

```ts
    );
    state.selectResults = [[{ kind: "card", archivedAt: null }]];
    expect(
      await new AddExpenseUseCase().run({ ...entry, kind: "revenue", paidAt: "2026-09-18", bankAccountId: "card" })
    ).toBe("invalid_bank_account");
    expect(state.inserts).toEqual([]);
```

with:

```ts
    );
    state.selectResults = [[RECEITAS], [{ kind: "card", archivedAt: null }]];
    const receita = { ...entry, kind: "revenue" as const, category: "grp-receitas" };
    expect(await new AddExpenseUseCase().run({ ...receita, paidAt: "2026-09-18", bankAccountId: "card" })).toBe(
      "invalid_bank_account"
    );
    expect(state.inserts).toEqual([]);
```

Replace:

```ts
  it("checks the conta the row keeps when the kind changes: no receita on a cartão", async () => {
    state.selectResults = [[{ ...ROW, bankAccountId: "card" }], [{ kind: "card", archivedAt: "2026-09-01" }]];
    expect(await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch: { kind: "revenue" } })).toBe(
      "invalid_bank_account"
    );
    expect(state.updates).toEqual([]);
```

with:

```ts
  it("checks the conta the row keeps when the kind changes: no receita on a cartão", async () => {
    // The row, the receita grupo sent with the new kind, then the cartão it keeps.
    state.selectResults = [[{ ...ROW, bankAccountId: "card" }], [RECEITAS], [{ kind: "card", archivedAt: "2026-09-01" }]];
    const patch = { kind: "revenue" as const, category: "grp-receitas" };
    expect(await new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch })).toBe("invalid_bank_account");
    expect(state.updates).toEqual([]);
```

In `lib/api/domains/expenses/useCases/__tests__/Get.test.ts`:

Replace:

```ts
  date: "2026-09-27",
  category: "nutrition",
  amountBrl: 333.33,
```

with:

```ts
  date: "2026-09-27",
  category: "grp-nutricao",
  amountBrl: 333.33,
```

In `lib/api/domains/statements/useCases/__tests__/statements.test.ts`:

Replace:

```ts
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 4850,
```

with:

```ts
  date: "2026-09-10",
  category: "grp-nutricao",
  amountBrl: 4850,
```

Replace:

```ts
  bankAccountId: null,
};

beforeEach(() => {
```

with:

```ts
  bankAccountId: null,
};

/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });

beforeEach(() => {
```

Replace:

```ts
    const entrada = { ...LINE, amountBrl: 4850 };
    const liberacao = { ...EXPENSE, kind: "financing", flow: "in", category: "other", accountId: "acc-pronaf" };
    state.selectResults = [[entrada], [liberacao]];
```

with:

```ts
    const entrada = { ...LINE, amountBrl: 4850 };
    const liberacao = { ...EXPENSE, kind: "financing", flow: "in", category: "grp-financiamentos", accountId: "acc-pronaf" };
    state.selectResults = [[entrada], [liberacao]];
```

Replace:

```ts
  it("creates the lançamento paid on the line's date by its conta", async () => {
    state.selectResults = [[LINE], [{ kind: "checking", archivedAt: null }]];
    state.returning = [
```

with:

```ts
  it("creates the lançamento paid on the line's date by its conta", async () => {
    // The line, the grupo sent, then the line's conta as "Pago por".
    state.selectResults = [[LINE], [grupo("grp-sanidade", "expense")], [{ kind: "checking", archivedAt: null }]];
    state.returning = [
```

Replace:

```ts
      // Value and payment day the form sent are pinned to the line's.
      entry: { date: "2026-09-18", category: "health", amountBrl: 1, paidAt: "2026-09-01", notes: "PIX ENVIADO AGROPECUARIA SERTAO" },
    });
```

with:

```ts
      // Value and payment day the form sent are pinned to the line's.
      entry: {
        date: "2026-09-18",
        category: "grp-sanidade",
        amountBrl: 1,
        paidAt: "2026-09-01",
        notes: "PIX ENVIADO AGROPECUARIA SERTAO",
      },
    });
```

Replace:

```ts
      kind: "expense",
      category: "health",
      amountBrl: 4850,
```

with:

```ts
      kind: "expense",
      category: "grp-sanidade",
      amountBrl: 4850,
```

Replace:

```ts
    expect(result).toMatchObject({ line: { status: "created", expenseId: "e-1" } });
  });
```

with:

```ts
    expect(result).toMatchObject({ line: { status: "created", expenseId: "e-1" } });
  });

  it("creates a receita from an entrada in the grupo the form sent", async () => {
    const entrada = { ...LINE, amountBrl: 3000, description: "PIX RECEBIDO ALUGUEL PASTO" };
    state.selectResults = [[entrada], [grupo("grp-arrendamentos", "revenue")], [{ kind: "checking", archivedAt: null }]];
    state.returning = [
      [{ ...EXPENSE, kind: "revenue", category: "grp-arrendamentos", amountBrl: 3000, paidAt: "2026-09-18" }],
      [{ ...entrada, status: "created", expenseId: "e-1" }],
    ];
    await resolveRun({ type: "create", entry: { date: "2026-09-18", category: "grp-arrendamentos", amountBrl: 1 } });
    expect(state.inserts[0]).toMatchObject({ kind: "revenue", category: "grp-arrendamentos", amountBrl: 3000 });

    // A despesa grupo sent with an entrada is refused.
    state.inserts = [];
    state.selectResults = [[entrada], [grupo("grp-nutricao", "expense")]];
    expect(
      await resolveRun({ type: "create", entry: { date: "2026-09-18", category: "grp-nutricao", amountBrl: 1 } })
    ).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenses/__tests__/entryRules.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/expenses/useCases/__tests__/Get.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `entryRules.ts` still imports `isFarmCategory` from `@/lib/api/domains/expenseGroups/farmCategory`
(gone after tasks 1–2; if it still resolves, the assertions fail instead: a rendimento stores `"other"`, a capital
lançamento stores `"other"`, a receita created from an entrada is written with `"other"`, and `POST /expenses`
refuses a body without `category` at validation). `Get.test.ts`, `Split.test.ts` and `TopUpSeries.test.ts` only
change their keys and may already pass.

- [ ] **Step 3: Implement**

`lib/api/domains/expenses/entryRules.ts` — replace the whole file with:

```ts
/**
 * What a lançamento needs and what it stores, by kind. Add, AddSeries and
 * Update all ask here.
 *
 * - yield: its aplicação as conta bancária (isPayingAccount says which one
 *   may receive it), paid on its data. No grupo, no conta do plano, no
 *   vencimento, no lote, no movimento.
 * - every other kind: a grupo of this farm of the same kind (farmGroup;
 *   archived ones count). A conta, when given, is of this farm and sits in
 *   that grupo.
 * - investment, financing, partners: a conta is required, and a movimento
 *   (a saída when none is sent). No lote.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";
import { isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

/** A lançamento as sent, or a row as it will be after a patch. */
export interface EntryInput {
  kind: EntryKind;
  flow?: EntryFlow | null;
  date: string;
  /** Required for every kind but a rendimento. */
  category?: ExpenseCategory;
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
  /** Null on a rendimento only. */
  category: ExpenseCategory | null;
  dueDate: string | null;
  paidAt: string | null;
  accountId: string | null;
  lotId: string | null;
}

/**
 * The row as it will be stored, or why not.
 *
 * `invalid_category`: a lançamento other than a rendimento without a grupo,
 * or whose grupo is not one of this farm's of its kind (archived ones count).
 *
 * `invalid_account`: a capital lançamento without a conta; a conta outside
 * the grupo sent or of another farm; a rendimento with a conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select for the grupo, and one for the conta do plano when it is sent.
 */
export async function normaliseEntry(
  repo: RepositoryType,
  farmId: number,
  entry: EntryInput
): Promise<NormalisedEntry | "invalid_category" | "invalid_account" | "invalid_bank_account"> {
  const accountId = entry.accountId ?? null;
  if (entry.kind === "yield") {
    if (accountId !== null) return "invalid_account";
    if (!entry.bankAccountId) return "invalid_bank_account";
    return {
      kind: "yield",
      flow: null,
      category: null,
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  if (!entry.category) return "invalid_category";
  const group = await farmGroup(repo, farmId, entry.category);
  if (group?.kind !== entry.kind) return "invalid_category";
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    if (account?.group !== entry.category) return "invalid_account";
  }
  const common = {
    kind: entry.kind,
    category: entry.category,
    dueDate: entry.dueDate ?? null,
    paidAt: entry.paidAt ?? null,
    accountId,
  };
  return capital
    ? { ...common, flow: entry.flow ?? "out", lotId: null }
    : { ...common, flow: null, lotId: entry.lotId ?? null };
}
```

In `lib/api/domains/expenses/schemas/expense.schema.ts`:

Replace:

```ts

/** A built-in grupo key or a farm grupo id; the use cases check it belongs to the farm. */
export const ExpenseCategoryModel = t.String({ minLength: 1, maxLength: 64 });
```

with:

```ts

/** A grupo id; the use cases check it is a grupo of the farm of the lançamento's kind. */
export const ExpenseCategoryModel = t.String({ minLength: 1, maxLength: 64 });
```

Replace:

```ts
 *
 * A receita and the kinds fora do resultado send `category: "other"`.
 * investment, financing and partners send a conta of their group and `flow`
 * (absent is a saída). A yield sends its aplicação as `bankAccountId` and no
```

with:

```ts
 *
 * `category` (the grupo) is required for every kind but a rendimento, which
 * sends none. investment, financing and partners send a conta of their grupo and `flow`
 * (absent is a saída). A yield sends its aplicação as `bankAccountId` and no
```

Replace:

```ts
  date: DateString,
  category: ExpenseCategoryModel,
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
```

with:

```ts
  date: DateString,
  category: t.Optional(ExpenseCategoryModel),
  amountBrl: t.Number({ exclusiveMinimum: 0 }),
```

In `lib/api/domains/expenses/expenses.controller.ts`:

Replace:

```ts
 * Farm lançamentos, with their vencimento, pagamento, conta and lote:
 * - the despesas that do not arrive through a sanitary treatment;
 * - the receitas that do not come from a venda;
```

with:

```ts
 * Farm lançamentos, with their vencimento, pagamento, conta and lote:
 * - the despesas;
 * - the receitas that do not come from a venda;
```

In `lib/api/domains/expenses/useCases/Add.useCase.ts`:

Replace:

```ts
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_category`: the grupo is neither a built-in one nor one of this farm's.
 * - `invalid_account`: the conta do plano does not fit the kind or the grupo (see normaliseEntry).
```

with:

```ts
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_category`: no grupo, or not one of this farm's of the lançamento's kind (a rendimento sends none).
 * - `invalid_account`: the conta do plano does not fit the kind or the grupo (see normaliseEntry).
```

In `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`:

Replace:

```ts
  date: string;
  category: ExpenseCategory;
  /** Total of a parcelamento; value of each ocorrência of a recorrência. */
```

with:

```ts
  date: string;
  category?: ExpenseCategory;
  /** Total of a parcelamento; value of each ocorrência of a recorrência. */
```

Replace:

```ts
      flow: shape.flow,
      category: shape.category,
      notes: entry.notes ?? null,
```

with:

```ts
      flow: shape.flow,
      // Set: a rendimento never repeats (refused above), and every other kind carries its grupo.
      category: shape.category!,
      notes: entry.notes ?? null,
```

In `lib/api/domains/expenses/useCases/Update.useCase.ts`:

Replace:

```ts
        date,
        category: patch.category ?? current.category,
        dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
```

with:

```ts
        date,
        category: patch.category ?? current.category ?? undefined,
        dueDate: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
```

In `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`:

Replace:

```ts
  Pick<
    typeof expenses.$inferInsert,
    "category" | "flow" | "accountId" | "lotId" | "history" | "counterparty" | "document" | "notes" | "amountBrl"
```

with:

```ts
  Pick<
    typeof expenseSeries.$inferInsert,
    "category" | "flow" | "accountId" | "lotId" | "history" | "counterparty" | "document" | "notes" | "amountBrl"
```

In `lib/api/domains/expenses/useCases/Split.useCase.ts`:

Replace:

```ts
      if (!row) return null;
      if (row.paidAt !== null || row.seriesId !== null || row.kind === "yield") return "not_splittable";
      if (!Number.isInteger(parcelas) || parcelas < MIN_INSTALLMENTS || parcelas > MAX_INSTALLMENTS) {
```

with:

```ts
      if (!row) return null;
      // A rendimento is the one row without a grupo.
      if (row.paidAt !== null || row.seriesId !== null || row.category === null) return "not_splittable";
      if (!Number.isInteger(parcelas) || parcelas < MIN_INSTALLMENTS || parcelas > MAX_INSTALLMENTS) {
```

In `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`:

Replace:

```ts
import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, StatementLine, Transfer } from "@/lib/types";
import type { MatchTarget } from "@/lib/domain/statements/match";
```

with:

```ts
import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Expense, ExpenseCategory, StatementLine, Transfer } from "@/lib/types";
import type { MatchTarget } from "@/lib/domain/statements/match";
```

Replace:

```ts
  date: string;
  category: Expense["category"];
  amountBrl: number;
```

with:

```ts
  date: string;
  /** The grupo: of kind despesa for a saída, receita for an entrada (normaliseEntry checks it). */
  category?: ExpenseCategory;
  amountBrl: number;
```

Replace:

```ts
      kind: outflow ? "expense" : "revenue",
      category: outflow ? action.entry.category : "other",
      // The line is the payment: its value and date, whatever the form sent.
```

with:

```ts
      kind: outflow ? "expense" : "revenue",
      // The line is the payment: its value and date, whatever the form sent.
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenses/__tests__/entryRules.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/expenses/useCases/__tests__/Get.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts --exclude '**/worktrees/**'`
Expected: PASS, but for `expenses.routes.test.ts`: it imports `@/lib/api/app`, which still loads the accounts `Add.useCase.ts` and the budgets `PutBudgetLine.useCase.ts` that import the moved `expenseGroups/farmCategory` ("Cannot find package"). It passes once cycles 3 and 4 rewire them (Step 5 of cycle 4 runs it again).

#### Cycle 3 — contas: `AddAccount`, `UpdateAccount`, "Sugerir contas padrão"

`SeedDefaults.test.ts` covers Review Focus 8: a farm that renamed "Nutrição" to "Alimentação" gets every default but
the Nutrição ones, and a second run creates nothing.

- [ ] **Step 1: Write the failing tests**

`lib/api/domains/accounts/useCases/__tests__/Add.test.ts` — replace the whole file with:

```ts
/**
 * addAccount: creates a conta inside a grupo. The name is trimmed and unique
 * per farm and grupo regardless of case, archived contas included.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupo, then the name clash) and record their
 * condition, inserts record the row and echo it, or reject with a queued error.
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

/** A plan_groups row of farm 7, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");
const FINANCIAMENTOS = grupo("grp-pronaf", "financing");

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
  state.insertError = null;
});

describe("addAccount", () => {
  it("trims the name and creates the conta", async () => {
    state.selectResults = [[NUTRICAO], []];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-nutricao",
      name: "  Sal mineral ",
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ farmId: 7, group: "grp-nutricao", name: "Sal mineral" });
    expect(result).toMatchObject({ id: state.inserts[0].id, group: "grp-nutricao", name: "Sal mineral" });
  });

  it("answers duplicate when the grupo has the name in another case", async () => {
    state.selectResults = [[NUTRICAO], [{ id: "acc-1" }]];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-nutricao",
      name: " SAL MINERAL ",
    });

    expect(result).toBe("duplicate");
    expect(state.inserts).toEqual([]);
    const query = new PgDialect().sqlToQuery(state.wheres[1] as SQL);
    expect(query.sql).toContain('lower("accounts"."name") = lower(');
    expect(query.params).toContain("SAL MINERAL");
  });

  it("answers duplicate when a concurrent insert wins the unique index", async () => {
    state.selectResults = [[grupo("grp-receitas", "revenue")], []];
    state.insertError = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-receitas",
      name: "Aluguel de pasto",
    });

    expect(result).toBe("duplicate");
  });

  it("takes the saldo devedor inicial of a conta in a grupo of financiamentos, whatever its name", async () => {
    state.selectResults = [[FINANCIAMENTOS], []];

    const result = await new AddAccountUseCase().run({
      farmId: 7,
      group: "grp-pronaf",
      name: "Pronaf Investimento",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });

    expect(state.inserts[0]).toMatchObject({
      group: "grp-pronaf",
      openingBalanceBrl: 180000,
      openingDate: "2026-06-30",
    });
    expect(result).toMatchObject({ group: "grp-pronaf", openingBalanceBrl: 180000, openingDate: "2026-06-30" });
  });

  it("refuses a saldo inicial without its date, a date alone, or one outside financiamentos", async () => {
    const conta = { farmId: 7, name: "Pronaf" };
    state.selectResults = [[FINANCIAMENTOS]];
    expect(await new AddAccountUseCase().run({ ...conta, group: "grp-pronaf", openingBalanceBrl: 1000 })).toBe(
      "invalid_opening"
    );
    state.selectResults = [[FINANCIAMENTOS]];
    expect(await new AddAccountUseCase().run({ ...conta, group: "grp-pronaf", openingDate: "2026-06-30" })).toBe(
      "invalid_opening"
    );
    // A grupo of sócios named "Financiamentos" is still not one of financiamentos.
    state.selectResults = [[{ ...grupo("grp-socios", "partners"), name: "Financiamentos" }]];
    expect(
      await new AddAccountUseCase().run({
        ...conta,
        group: "grp-socios",
        openingBalanceBrl: 1000,
        openingDate: "2026-06-30",
      })
    ).toBe("invalid_opening");
    expect(state.inserts).toEqual([]);
  });

  it("creates a conta in a grupo of the farm of any kind, and refuses a grupo that is not this farm's", async () => {
    // The grupo (one of this farm's), then the name clash (none).
    state.selectResults = [[grupo("grp-maq", "investment")], []];

    const result = await new AddAccountUseCase().run({ farmId: 7, group: "grp-maq", name: "Trator" });

    const read = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(read.sql).toContain('"plan_groups"."farm_id"');
    expect(read.params).toEqual(expect.arrayContaining([7, "grp-maq"]));
    expect(result).toMatchObject({ group: "grp-maq", name: "Trator" });

    // Another farm's grupo, an old built-in key, the tree's Despesas node: no grupo of this farm by that id.
    for (const group of ["grp-of-another-farm", "nutrition", "despesas"]) {
      state.selectResults = [[]];
      expect(await new AddAccountUseCase().run({ farmId: 7, group, name: "Trator" })).toBe("invalid_category");
    }
    expect(state.inserts).toHaveLength(1);
  });
});
```

In `lib/api/domains/accounts/useCases/__tests__/Update.test.ts`:

Replace:

```ts
  farmId: 7,
  group: "nutrition",
  name: "Sal mineral",
```

with:

```ts
  farmId: 7,
  group: "grp-nutricao",
  name: "Sal mineral",
```

Replace:

```ts
describe("updateAccount — saldo devedor inicial", () => {
  const PRONAF = { ...ACCOUNT, id: "acc-2", group: "financing", name: "Pronaf" };
  const run = (patch: Parameters<UpdateAccountUseCase["run"]>[0]["patch"]) =>
```

with:

```ts
describe("updateAccount — saldo devedor inicial", () => {
  const PRONAF = { ...ACCOUNT, id: "acc-2", group: "grp-financiamentos", name: "Pronaf" };
  /** The conta's grupo, read only when the saldo inicial is in the patch. */
  const grupo = (id: string, kind: string) =>
    ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
  const FINANCIAMENTOS = grupo("grp-financiamentos", "financing");
  const run = (patch: Parameters<UpdateAccountUseCase["run"]>[0]["patch"]) =>
```

Replace:

```ts
  it("sets and clears it on a conta de financiamento", async () => {
    state.selectResults = [[PRONAF]];
    state.updateResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
```

with:

```ts
  it("sets and clears it on a conta de financiamento", async () => {
    state.selectResults = [[PRONAF], [FINANCIAMENTOS]];
    state.updateResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
```

Replace:

```ts

    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
    state.updateResults = [[PRONAF]];
```

with:

```ts

    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], [FINANCIAMENTOS]];
    state.updateResults = [[PRONAF]];
```

Replace:

```ts
  it("refuses half of it, and any of it outside financiamento", async () => {
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }]];
    expect(await run({ openingDate: null })).toBe("invalid_opening");
    state.selectResults = [[ACCOUNT]];
    expect(await run({ openingBalanceBrl: 500, openingDate: "2026-06-30" })).toBe("invalid_opening");
    expect(state.updates).toEqual([]);
  });
});
```

with:

```ts
  it("refuses half of it, and any of it outside financiamento", async () => {
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], [FINANCIAMENTOS]];
    expect(await run({ openingDate: null })).toBe("invalid_opening");
    state.selectResults = [[ACCOUNT], [grupo("grp-nutricao", "expense")]];
    expect(await run({ openingBalanceBrl: 500, openingDate: "2026-06-30" })).toBe("invalid_opening");
    expect(state.updates).toEqual([]);
  });

  it("renames a conta de financiamento without reading its grupo", async () => {
    // The conta, then the name clash (none): no grupo read.
    state.selectResults = [[{ ...PRONAF, openingBalanceBrl: 180000, openingDate: "2026-06-30" }], []];
    state.updateResults = [[{ ...PRONAF, name: "Pronaf Mais Alimentos" }]];

    expect(await run({ name: "Pronaf Mais Alimentos" })).toMatchObject({ name: "Pronaf Mais Alimentos" });
    expect(state.updates).toEqual([{ name: "Pronaf Mais Alimentos" }]);
  });
});
```

In `lib/api/domains/accounts/useCases/__tests__/Delete.test.ts`:

Replace:

```ts

const ROW = { id: "racao", farmId: 7, group: "feed", name: "Ração", archivedAt: null };

```

with:

```ts

const ROW = { id: "racao", farmId: 7, group: "grp-nutricao", name: "Ração", archivedAt: null };

```

`lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts` — replace the whole file with:

```ts
/**
 * seedDefaultAccounts ("Sugerir contas padrão"): finds each default's grupo by
 * name among the farm's active grupos, ignoring case, and creates the contas
 * that grupo does not have yet, comparing names regardless of case. A default
 * whose grupo is gone (renamed, archived, deleted) is skipped.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the grupos, then the contas) and record their
 * condition, inserts record the rows and echo them.
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
    /** Rows of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[][],
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
import { DEFAULT_GROUPS } from "@/lib/domain/groups";

import { SeedDefaultAccountsUseCase } from "../SeedDefaults.useCase";

/** The farm's eleven starting grupos, as the select reads them: id "g-<name>". */
const GROUPS = DEFAULT_GROUPS.map(({ name }) => ({ id: `g-${name}`, name }));
const seed = () => new SeedDefaultAccountsUseCase().run({ farmId: 7 });
const created = () => state.inserts[0].map((row) => `${row.group}:${row.name}`);

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
  state.inserts = [];
});

describe("seedDefaultAccounts", () => {
  it("creates every default in its grupo, read among the farm's active grupos", async () => {
    state.selectResults = [GROUPS, []];

    const result = await seed();

    expect(created()).toHaveLength(DEFAULT_ACCOUNTS.length);
    expect(created()).toContain("g-Nutrição:Sal mineral");
    expect(created()).toContain("g-Receitas:Aluguel de pasto");
    expect(created()).toContain("g-Sócios:Distribuição de lucro");
    expect(state.inserts[0].every((row) => row.farmId === 7)).toBe(true);
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length);
    const grupos = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(grupos.sql).toContain('"plan_groups"."farm_id" = $1');
    expect(grupos.sql).toContain('"plan_groups"."archived_at" is null');
    expect(grupos.params).toEqual([7]);
  });

  it("skips the names the grupo already has, case-insensitively", async () => {
    state.selectResults = [
      GROUPS,
      [
        { group: "g-Nutrição", name: "SAL MINERAL" },
        { group: "g-Receitas", name: "aluguel de pasto" },
        // Same name in another grupo does not count.
        { group: "g-Administrativo", name: "Sêmen" },
      ],
    ];

    const result = await seed();

    expect(created()).not.toContain("g-Nutrição:Sal mineral");
    expect(created()).not.toContain("g-Receitas:Aluguel de pasto");
    expect(created()).toContain("g-Reprodução:Sêmen");
    expect(result.created).toHaveLength(DEFAULT_ACCOUNTS.length - 2);
  });

  it("finds a grupo whatever its case, and skips the defaults of a renamed or missing grupo", async () => {
    // "Nutrição" became "Alimentação", "Pastagem" is in capitals, and "Sócios" is gone
    // (deleted, or archived: the select leaves it out).
    const groups = GROUPS.filter((g) => g.name !== "Sócios").map((g) =>
      g.name === "Nutrição" ? { ...g, name: "Alimentação" } : g.name === "Pastagem" ? { ...g, name: "PASTAGEM" } : g
    );
    state.selectResults = [groups, []];

    await seed();

    const nutricao = DEFAULT_ACCOUNTS.filter((d) => d.group === "Nutrição").length;
    const socios = DEFAULT_ACCOUNTS.filter((d) => d.group === "Sócios").length;
    expect(created()).toHaveLength(DEFAULT_ACCOUNTS.length - nutricao - socios);
    expect(created().some((row) => row.startsWith("g-Nutrição:"))).toBe(false);
    expect(created()).toContain("g-Pastagem:Adubo");
  });

  it("creates nothing the second time", async () => {
    state.selectResults = [GROUPS, []];
    await seed();
    const first = state.inserts[0];

    state.inserts = [];
    state.selectResults = [GROUPS, first];
    const result = await seed();

    expect(state.inserts).toEqual([]);
    expect(result).toEqual({ created: [] });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/accounts/useCases/__tests__/Update.test.ts lib/api/domains/accounts/useCases/__tests__/Delete.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Add.test.ts` and `Update.test.ts` cannot load ("Cannot find package
'@/lib/api/domains/expenseGroups/farmCategory'": `Add.useCase.ts`, which `Update.useCase.ts` imports for
`validOpening`, still imports the moved file; were it there, `AddAccount` would still take the old keys and check
the saldo inicial on the key, and `UpdateAccount` would never read the conta's grupo); `SeedDefaults`
never reads `plan_groups` and inserts the defaults under their names. `Delete.test.ts` only changes its key and
already passes.

- [ ] **Step 3: Implement**

In `lib/api/domains/accounts/schemas/account.schema.ts`:

Replace:

```ts
/**
 * Grupo of a conta: "revenue" (Receitas), one of the three fora do resultado,
 * or a despesa grupo (a built-in key or the id of one of the farm's grupos).
 * AddAccount answers 400 `invalid_category` for anything else.
```

with:

```ts
/**
 * Grupo of a conta: the id of one of the farm's grupos, of any kind.
 * AddAccount answers 400 `invalid_category` for anything else.
```

In `lib/api/domains/accounts/useCases/Add.useCase.ts`:

Replace:

```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account, AccountGroup } from "@/lib/types";

```

with:

```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Account, AccountGroup, GroupKind } from "@/lib/types";

```

Replace:

```ts
 * - `invalid_opening`: a saldo inicial comes without its date (or the
 *   reverse), or on a grupo that is not financiamento.
 * - `invalid_category`: the grupo is not Receitas, one fora do resultado, a
 *   built-in despesa grupo or one of this farm's.
 */
```

with:

```ts
 * - `invalid_opening`: a saldo inicial comes without its date (or the
 *   reverse), or in a grupo that is not of financiamentos.
 * - `invalid_category`: the grupo is not one of this farm's (archived ones count).
 */
```

Replace:

```ts

/** A saldo inicial comes with its date, and only on a conta de financiamento. */
export function validOpening(group: AccountGroup, balance: number | null, date: string | null): boolean {
  return balance === null ? date === null : date !== null && group === "financing";
}
```

with:

```ts

/** A saldo inicial comes with its date, and only on a conta of a grupo of financiamentos. */
export function validOpening(kind: GroupKind, balance: number | null, date: string | null): boolean {
  return balance === null ? date === null : date !== null && kind === "financing";
}
```

Replace:

```ts
  public run: CurrUseCase["run"] = async ({ farmId, group, name, openingBalanceBrl = null, openingDate = null }) => {
    if (!validOpening(group, openingBalanceBrl, openingDate)) return "invalid_opening";
    // Receitas and the three fora do resultado are fixed keys; any other grupo is a despesa grupo of this farm.
    const fixed = group === "revenue" || (CAPITAL_GROUPS as readonly string[]).includes(group);
    if (!fixed && !(await isFarmCategory(this.repository, farmId, group))) return "invalid_category";
    const trimmed = name.trim();
```

with:

```ts
  public run: CurrUseCase["run"] = async ({ farmId, group, name, openingBalanceBrl = null, openingDate = null }) => {
    const found = await farmGroup(this.repository, farmId, group);
    if (!found) return "invalid_category";
    if (!validOpening(found.kind, openingBalanceBrl, openingDate)) return "invalid_opening";
    const trimmed = name.trim();
```

In `lib/api/domains/accounts/useCases/Update.useCase.ts`:

Replace:

```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

```

with:

```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";

```

Replace:

```ts
    if (!current) return null;
    const balance = patch.openingBalanceBrl === undefined ? current.openingBalanceBrl : patch.openingBalanceBrl;
    const date = patch.openingDate === undefined ? current.openingDate : patch.openingDate;
    if (!validOpening(current.group, balance, date)) return "invalid_opening";

```

with:

```ts
    if (!current) return null;
    if (patch.openingBalanceBrl !== undefined || patch.openingDate !== undefined) {
      const balance = patch.openingBalanceBrl === undefined ? current.openingBalanceBrl : patch.openingBalanceBrl;
      const date = patch.openingDate === undefined ? current.openingDate : patch.openingDate;
      // The conta's grupo says whether it may carry one: financiamentos only.
      const group = await farmGroup(this.repository, farmId, current.group);
      if (!group || !validOpening(group.kind, balance, date)) return "invalid_opening";
    }

```

`lib/api/domains/accounts/useCases/SeedDefaults.useCase.ts` — replace the whole file with:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, planGroups } from "@/lib/db/schema";
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
 * "Sugerir contas padrão": creates the standard contas whose name their grupo
 * does not have yet (case-insensitive, archived contas included). A default's
 * grupo is found by name among the farm's active grupos, ignoring case; a
 * default whose grupo was renamed, archived or deleted is skipped. Running it
 * twice creates nothing the second time.
 */
export class SeedDefaultAccountsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SeedDefaultAccountsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId }) => {
    const groups = await this.repository
      .select({ id: planGroups.id, name: planGroups.name })
      .from(planGroups)
      .where(and(eq(planGroups.farmId, farmId), isNull(planGroups.archivedAt)));
    const groupId = new Map(groups.map((group) => [group.name.toLowerCase(), group.id]));
    const existing = await this.repository
      .select({ group: accounts.group, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.farmId, farmId));
    const key = (group: string, name: string) => `${group}:${name.toLowerCase()}`;
    const taken = new Set(existing.map((account) => key(account.group, account.name)));
    const missing = DEFAULT_ACCOUNTS.flatMap(({ group, name }) => {
      const id = groupId.get(group.toLowerCase());
      return id === undefined || taken.has(key(id, name)) ? [] : [{ group: id, name }];
    });
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

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/accounts/useCases/__tests__/Update.test.ts lib/api/domains/accounts/useCases/__tests__/Delete.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts --exclude '**/worktrees/**'`
Expected: PASS

#### Cycle 4 — orçamento: `PutBudgetLine`, `CopyBudgets`

- [ ] **Step 1: Write the failing tests**

`lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts` — replace the whole file with:

```ts
/**
 * putBudgetLine: saves one line of a safra's orçamento whole — its twelve
 * calendar months replace the ones it had in that safra. A conta must be of
 * this farm and of the grupo, and anything but twelve months is refused. The
 * months are stored as sent: that they add up to the total typed is the
 * dialog's check (the body carries no total).
 *
 * Shared db stub: selects answer from the queue (the grupo, the conta, then
 * the farm's start month), the delete and the select record their condition,
 * the insert records its rows and answers the queued `returning`.
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
    startMonth: 10,
    category: "grp-nutricao",
    months: EVEN,
    distribution: "equal",
    ...input,
  });
const inserted = () => state.inserts[0] as Record<string, unknown>[];
/** A plan_groups row of the farm, as the grupo check reads it. */
const grupo = (id: string, kind: string) =>
  ({ id, farmId: 7, kind, name: id, archivedAt: null, createdAt: new Date(0) });
const NUTRICAO = grupo("grp-nutricao", "expense");

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
  state.wheres = [];
});

describe("putBudgetLine", () => {
  it("replaces the grupo's own line with twelve rows, safra month by safra month", async () => {
    state.selectResults = [[NUTRICAO], [{ startMonth: 10 }]];
    state.returning = [
      EVEN.map((amountBrl, i) => ({
        id: `b-${i}`,
        farmId: 7,
        category: "grp-nutricao",
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
    const removed = renderSql(state.wheres[2] as SQL);
    expect(removed.sql).toContain('"budgets"."month" between $2 and $3');
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "grp-nutricao"]);
    // Out/25 first: the i-th amount on the i-th calendar month from outubro.
    expect(inserted().map((row) => row.month)).toEqual(OCT_TO_SEP);
    expect(inserted().map((row) => row.amountBrl)).toEqual(EVEN);
    for (const row of inserted()) {
      expect(row).toMatchObject({
        farmId: 7,
        category: "grp-nutricao",
        accountId: null,
        distribution: "equal",
        updatedBy: "user-1",
      });
    }
    expect(result).toHaveLength(12);
    expect((result as { month: string }[])[0]).toMatchObject({ month: "2025-10-01", amountBrl: 8.33 });
  });

  it("saves a conta's line, of this farm and grupo, with the months as typed", async () => {
    state.selectResults = [[NUTRICAO], [{ group: "grp-nutricao" }], [{ startMonth: 1 }]];
    // Manual: whatever the months are, they go as sent.
    const typed = [1200, 0, 0, 450.5, 0, 0, 0, 0, 0, 0, 0, 99.99];

    await put({ startMonth: 1, accountId: "acc-sal", months: typed, distribution: "manual" });

    const conta = renderSql(state.wheres[1] as SQL);
    expect(conta.sql).toContain('"accounts"."farm_id" = $1');
    expect(conta.params).toEqual([7, "acc-sal"]);
    // Starting in janeiro, safra 2025 is the calendar year.
    expect(renderSql(state.wheres[3] as SQL).params).toEqual([7, "2025-01-01", "2025-12-31", "grp-nutricao", "acc-sal"]);
    expect(inserted().map((row) => row.month)).toEqual([
      "2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01",
      "2025-07-01", "2025-08-01", "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01",
    ]);
    expect(inserted().map((row) => row.amountBrl)).toEqual(typed);
    expect(inserted()[0]).toMatchObject({ accountId: "acc-sal", distribution: "manual" });
  });

  it("stores each month to the centavo", async () => {
    state.selectResults = [[NUTRICAO], [{ startMonth: 10 }]];

    await put({ months: [8.333, 8.337, ...EVEN.slice(2)], distribution: "manual" });

    expect(inserted().map((row) => row.amountBrl).slice(0, 2)).toEqual([8.33, 8.34]);
  });

  it("refuses with start_month_changed when the farm's início moved in another session, and writes nothing", async () => {
    // The client still reads safras from outubro; the farm now starts in janeiro.
    state.selectResults = [[NUTRICAO], [{ startMonth: 1 }]];

    expect(await put({ startMonth: 10 })).toBe("start_month_changed");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("refuses a conta of another farm or of another grupo, and writes nothing", async () => {
    // Another farm's conta: the farm filter finds nothing.
    state.selectResults = [[NUTRICAO], []];
    expect(await put({ accountId: "acc-of-another-farm" })).toBe("invalid_account");
    state.selectResults = [[NUTRICAO], [{ group: "grp-administrativo" }]];
    expect(await put({ accountId: "acc-escritorio" })).toBe("invalid_account");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("saves a line of a despesa grupo of the farm and refuses any other grupo", async () => {
    // The grupo (one of this farm's), then the farm's start month.
    state.selectResults = [[grupo("grp-maq", "expense")], [{ startMonth: 10 }]];
    await put({ category: "grp-maq" });
    const read = renderSql(state.wheres[0] as SQL);
    expect(read.sql).toContain('"plan_groups"."farm_id"');
    expect(read.params).toEqual(expect.arrayContaining([7, "grp-maq"]));
    expect(inserted()[0]).toMatchObject({ category: "grp-maq", accountId: null });

    state.inserts = [];
    state.deletes = 0;
    // No grupo of this farm by that id.
    state.selectResults = [[]];
    expect(await put({ category: "grp-of-another-farm" })).toBe("invalid_category");
    // Only despesas are orçadas: a receita or capital grupo is refused.
    for (const kind of ["revenue", "investment", "financing", "partners"]) {
      state.selectResults = [[grupo("grp-x", kind)]];
      expect(await put({ category: "grp-x" })).toBe("invalid_category");
    }
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

`lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts` — replace the whole file with:

```ts
/**
 * copyBudgets ("Copiar da safra anterior"): fills only the lines the target
 * safra lacks, from the source's orçado or its realizado, with the % applied
 * and each month rounded to the centavo; the realizado becomes grupo lines
 * only. Runs the real copyPlan of lib/domain/budget.ts.
 *
 * Shared db stub. Selects answer in call order: the farm's start month, the
 * budgets of both safras, the lançamentos, the contas, the grupos, and, after
 * the insert, the target safra as it ends up.
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
  category: "grp-nutricao",
  accountId: null,
  ...fields,
});

/** A plan_groups row of farm 7. */
const grupo = (id: string, kind: string, archivedAt: Date | null = null) => ({
  id,
  farmId: 7,
  kind,
  name: id,
  archivedAt,
  createdAt: new Date(0),
});
/** Nutrição, Administrativo and Pastagem, the despesa grupos the lines below use, and Receitas. */
const GROUPS = [
  grupo("grp-nutricao", "expense"),
  grupo("grp-administrativo", "expense"),
  grupo("grp-pastagem", "expense"),
  grupo("grp-receitas", "revenue"),
];

const run = (input: { source: "budgeted" | "realized"; adjustPct: number; startMonth?: number }) =>
  new CopyBudgetsUseCase().run({
    farmId: 7,
    userId: "user-1",
    from: 2025,
    to: 2026,
    startMonth: 10,
    todayIso: "2026-10-02",
    ...input,
  });
/** A copy that went through. */
const copy = async (input: { source: "budgeted" | "realized"; adjustPct: number }) => {
  const result = await run(input);
  if (typeof result === "string") throw new Error(result);
  return result;
};

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
    const final = line(2026, "grp-nutricao", null, 900);
    state.selectResults = [
      [{ startMonth: 10 }],
      [
        ...line(2025, "grp-nutricao", null, 1000),
        ...line(2025, "grp-administrativo", null, 33.33),
        ...line(2025, "grp-pastagem", "acc-cerca", 8.37),
        // Nutrição already has its own line in 2026: it is not touched.
        ...final,
      ],
      [],
      // A conta's line is read only when the conta is the farm's.
      [{ id: "acc-cerca", group: "grp-pastagem", name: "Cerca", archivedAt: null }],
      GROUPS,
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
    expect(rowsOf("grp-nutricao:null")).toEqual([]);
    // 33,33 × 1,05 = 34,9965 → 35,00; 8,37 × 1,05 = 8,7885 → 8,79.
    expect(rowsOf("grp-administrativo:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(35));
    expect(rowsOf("grp-pastagem:acc-cerca").map((row) => row.amountBrl)).toEqual(Array(12).fill(8.79));
    expect(rowsOf("grp-administrativo:null").map((row) => row.month)).toEqual(monthsOf(2026));
    for (const row of inserted()) {
      expect(row).toMatchObject({ farmId: 7, distribution: "manual", updatedBy: "user-1" });
    }
  });

  it("copies the realizado as grupo lines only, despesas only, never a receita", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [],
      [
        expense({ date: "2025-10-15", amountBrl: 300, accountId: "acc-sal" }),
        expense({ date: "2026-01-10", amountBrl: 200 }),
        expense({ date: "2025-11-01", amountBrl: 5000, kind: "revenue", category: "grp-receitas" }),
      ],
      [{ id: "acc-sal", group: "grp-nutricao", name: "Sal mineral", archivedAt: null }],
      GROUPS,
      [],
    ];

    const result = await copy({ source: "realized", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(inserted().every((row) => row.accountId === null)).toBe(true);
    // Safra order: out/25 is index 0, jan/26 index 3.
    expect(rowsOf("grp-nutricao:null").map((row) => row.amountBrl)).toEqual([300, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(rowsOf("grp-receitas:null")).toEqual([]);
  });

  it("refuses with start_month_changed when the farm's início moved in another session, and reads nothing else", async () => {
    state.selectResults = [[{ startMonth: 1 }]];

    expect(await run({ source: "budgeted", adjustPct: 0, startMonth: 10 })).toBe("start_month_changed");
    expect(state.wheres).toHaveLength(1);
    expect(state.inserts).toEqual([]);
  });

  it("writes nothing when every line already has a budget, and answers the target as it is", async () => {
    const final = line(2026, "grp-administrativo", null, 100);
    const budgets = [...line(2025, "grp-administrativo", null, 90), ...final];
    state.selectResults = [[{ startMonth: 10 }], budgets, [], [], GROUPS, final];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 0, skipped: 1 });
    expect(result.budgets).toHaveLength(12);
    expect(state.inserts).toEqual([]);
  });

  it("copies an active grupo's line and leaves an archived grupo's behind", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [...line(2025, "g-maq", null, 100), ...line(2025, "g-arr", null, 500)],
      [],
      [],
      [grupo("g-maq", "expense"), grupo("g-arr", "expense", new Date("2026-01-05T00:00:00Z"))],
      [],
    ];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(rowsOf("g-maq:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(100));
    expect(rowsOf("g-arr:null")).toEqual([]);
    // The grupos read are this farm's.
    const grupos = renderSql(state.wheres[4] as SQL);
    expect(grupos.sql).toContain('"plan_groups"."farm_id" = $1');
    expect(grupos.params).toEqual([7]);
  });
});
```

In `lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts`:

Replace:

```ts
          farmId: 7,
          category: "admin",
          accountId: null,
```

with:

```ts
          farmId: 7,
          category: "grp-administrativo",
          accountId: null,
```

Replace:

```ts
    expect(result).toEqual([
      { id: "b-1", category: "admin", month: "2025-10-01", amountBrl: 1500, distribution: "equal" },
    ]);
```

with:

```ts
    expect(result).toEqual([
      { id: "b-1", category: "grp-administrativo", month: "2025-10-01", amountBrl: 1500, distribution: "equal" },
    ]);
```

In `lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts`:

Replace:

```ts
const remove = (accountId?: string) =>
  new DeleteBudgetLineUseCase().run({ farmId: 7, safra: 2025, startMonth: 10, category: "admin", accountId });

```

with:

```ts
const remove = (accountId?: string) =>
  new DeleteBudgetLineUseCase().run({ farmId: 7, safra: 2025, startMonth: 10, category: "grp-administrativo", accountId });

```

Replace:

```ts
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "admin"]);
  });
```

with:

```ts
    expect(removed.sql).toContain('"budgets"."account_id" is null');
    expect(removed.params).toEqual([7, "2025-10-01", "2026-09-30", "grp-administrativo"]);
  });
```

Replace:

```ts
    expect(await remove("acc-escritorio")).toBe(0);
    expect(renderSql(state.wheres[1] as SQL).params).toEqual([7, "2025-10-01", "2026-09-30", "admin", "acc-escritorio"]);
  });
```

with:

```ts
    expect(await remove("acc-escritorio")).toBe(0);
    expect(renderSql(state.wheres[1] as SQL).params).toEqual([
      7,
      "2025-10-01",
      "2026-09-30",
      "grp-administrativo",
      "acc-escritorio",
    ]);
  });
```

In `lib/api/domains/budgets/__tests__/budgets.routes.test.ts`:

Replace:

```ts

const LINE = { safra: 2025, startMonth: 10, category: "nutrition", months: Array(11).fill(100), distribution: "manual" };
const COPY = { from: 2024, to: 2025, startMonth: 10, source: "budgeted", adjustPct: 0 };
```

with:

```ts

const LINE = { safra: 2025, startMonth: 10, category: "grp-nutricao", months: Array(11).fill(100), distribution: "manual" };
const COPY = { from: 2024, to: 2025, startMonth: 10, source: "budgeted", adjustPct: 0 };
```

Replace:

```ts
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=nutrition"),
      await request("POST", "/budgets/copy", COPY),
```

with:

```ts
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=grp-nutricao"),
      await request("POST", "/budgets/copy", COPY),
```

Replace:

```ts

    const response = await request("DELETE", "/budgets?safra=2025&startMonth=10&category=admin", {});

```

with:

```ts

    const response = await request("DELETE", "/budgets?safra=2025&startMonth=10&category=grp-administrativo", {});

```

Replace:

```ts
    expect(await response.json()).toEqual({ removed: 12 });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, safra: 2025, startMonth: 10, category: "admin" });
  });
```

with:

```ts
    expect(await response.json()).toEqual({ removed: 12 });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, safra: 2025, startMonth: 10, category: "grp-administrativo" });
  });
```

Replace:

```ts
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=admin", {}),
      await request("POST", "/budgets/copy", COPY),
```

with:

```ts
      await request("PUT", "/budgets", LINE),
      await request("DELETE", "/budgets?safra=2025&startMonth=10&category=grp-administrativo", {}),
      await request("POST", "/budgets/copy", COPY),
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/__tests__/budgets.routes.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `PutBudgetLine.test.ts` cannot load (`PutBudgetLine.useCase.ts` still imports the moved
`expenseGroups/farmCategory`; were it there, it would save a line in a receita or capital grupo), and `CopyBudgets`
still reads the treatments (its select queue is one longer: "Cannot read properties of undefined (reading
'farmId')") and passes `expenseGroups` to `copyPlan`. `ListBudgets.test.ts`,
`DeleteBudgetLine.test.ts` and `budgets.routes.test.ts` only change their keys and already pass.

- [ ] **Step 3: Implement**

In `lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`:

Replace:

```ts
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";

```

with:

```ts
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";
import { farmGroup } from "@/lib/api/domains/planGroups/farmGroup";

```

Replace:

```ts
 * - `months_mismatch`: not twelve months.
 * - `invalid_category`: the grupo is neither a built-in one nor one of this farm's.
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
```

with:

```ts
 * - `months_mismatch`: not twelve months.
 * - `invalid_category`: the grupo is not one of this farm's grupos de despesa (only despesas are orçadas).
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
```

Replace:

```ts
    if (months.length !== 12) return "months_mismatch";
    if (!(await isFarmCategory(this.repository, farmId, key.category))) return "invalid_category";
    if (key.accountId !== undefined) {
```

with:

```ts
    if (months.length !== 12) return "months_mismatch";
    if ((await farmGroup(this.repository, farmId, key.category))?.kind !== "expense") return "invalid_category";
    if (key.accountId !== undefined) {
```

In `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:

Replace:

```ts
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, animals, budgets, expenseGroups, expenses, treatments } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toExpenseGroup, toTreatment } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

with:

```ts
import { eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets, expenses, planGroups } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toPlanGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
```

Replace:

```ts
    if ((await safraStartMonth(this.repository, farmId)) !== startMonth) return "start_month_changed";
    const [budgetRows, expenseRows, treatmentRows, accountRows, groupRows] = await Promise.all([
      this.repository
```

with:

```ts
    if ((await safraStartMonth(this.repository, farmId)) !== startMonth) return "start_month_changed";
    const [budgetRows, expenseRows, accountRows, groupRows] = await Promise.all([
      this.repository
```

Replace:

```ts
      this.repository.select().from(expenses).where(eq(expenses.farmId, farmId)),
      this.repository
        .select({ row: treatments, earTag: animals.earTag })
        .from(treatments)
        .innerJoin(animals, eq(treatments.animalId, animals.id))
        .where(and(eq(animals.farmId, farmId), isNull(treatments.deletedAt))),
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
      // Every grupo of the farm: a farm grupo's lines copy, an archived one's stay behind.
      this.repository.select().from(expenseGroups).where(eq(expenseGroups.farmId, farmId)),
    ]);
```

with:

```ts
      this.repository.select().from(expenses).where(eq(expenses.farmId, farmId)),
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
      // Every grupo of the farm: an active grupo's lines copy, an archived one's stay behind.
      this.repository.select().from(planGroups).where(eq(planGroups.farmId, farmId)),
    ]);
```

Replace:

```ts
        expenses: expenseRows.map((row) => toExpense(row)),
        treatments: treatmentRows.map(({ row, earTag }) => toTreatment(row, earTag)),
        accounts: accountRows.map(toAccount),
        expenseGroups: groupRows.map(toExpenseGroup),
      },
```

with:

```ts
        expenses: expenseRows.map((row) => toExpense(row)),
        accounts: accountRows.map(toAccount),
        planGroups: groupRows.map(toPlanGroup),
      },
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/__tests__/budgets.routes.test.ts --exclude '**/worktrees/**'`
Expected: PASS (`CopyBudgets.test.ts` only once task 5's `lib/domain/budget.ts` is in: it runs the real
`copyPlan`, which must read `planGroups` and no treatments).

#### Wrap-up

- [ ] **Step 5: Every test of the task, types and lint**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts lib/api/domains/expenses/__tests__/entryRules.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/expenses/useCases/__tests__/Get.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/accounts/useCases/__tests__/Update.test.ts lib/api/domains/accounts/useCases/__tests__/Delete.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/__tests__/budgets.routes.test.ts --exclude '**/worktrees/**'`
Expected: PASS (same note on `CopyBudgets.test.ts`).

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "lib/api/domains/(expenses|statements|accounts|budgets)/|lib/domain/accounts"`
Expected: no output (before task 5 lands, `CopyBudgets.useCase.ts` is red on `planGroups` not being a
`BudgetInputs` key: task 5's). The rest of `tsc` stays red for tasks 5–7 (`lib/domain/*`, `components/**`, `app/**`).

Run: `./node_modules/.bin/eslint lib/domain/accounts.ts lib/api/domains/expenses/entryRules.ts lib/api/domains/expenses/schemas/expense.schema.ts lib/api/domains/expenses/expenses.controller.ts lib/api/domains/expenses/useCases/Add.useCase.ts lib/api/domains/expenses/useCases/AddSeries.useCase.ts lib/api/domains/expenses/useCases/Update.useCase.ts lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts lib/api/domains/expenses/useCases/Split.useCase.ts lib/api/domains/statements/useCases/ResolveLine.useCase.ts lib/api/domains/accounts/schemas/account.schema.ts lib/api/domains/accounts/useCases/Add.useCase.ts lib/api/domains/accounts/useCases/Update.useCase.ts lib/api/domains/accounts/useCases/SeedDefaults.useCase.ts lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts lib/domain/__tests__/accounts.test.ts lib/api/domains/expenses/__tests__/entryRules.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/UpdateSeries.test.ts lib/api/domains/expenses/useCases/__tests__/Split.test.ts lib/api/domains/expenses/useCases/__tests__/TopUpSeries.test.ts lib/api/domains/expenses/useCases/__tests__/PaidBy.test.ts lib/api/domains/expenses/useCases/__tests__/Get.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/accounts/useCases/__tests__/Update.test.ts lib/api/domains/accounts/useCases/__tests__/Delete.test.ts lib/api/domains/accounts/useCases/__tests__/SeedDefaults.test.ts lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/ListBudgets.test.ts lib/api/domains/budgets/useCases/__tests__/DeleteBudgetLine.test.ts lib/api/domains/budgets/__tests__/budgets.routes.test.ts`
Expected: clean.

Runtime note for later tasks (not a `tsc` error): `accountsByGroup` no longer pre-fills keys, so any caller that
reads `byGroup.financing`, `byGroup.revenue` or `byGroup[key]` without `?? []` breaks at runtime —
`components/finance/plano/AccountsPage.tsx` does today (task 7); `lib/domain/planTree.ts` and `lib/domain/budget.ts`
already use `?? []` (task 5 keeps it).

---

### Task 4: Sêmen

A purchase of sêmen is stock, not money in the Financeiro: the use cases stop writing (and deleting) expenses, the controller stops asking Financeiro edit, the Touros screens stop gating on it. Totals and R$/dose still hide from a member without Financeiro view.

**Files:**
- Modify: `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` (whole file)
- Modify: `lib/api/domains/semen/useCases/AddBull.useCase.ts` (whole file)
- Modify: `lib/api/domains/semen/useCases/DeletePurchase.useCase.ts` (whole file)
- Modify: `lib/api/domains/semen/useCases/DeleteBull.useCase.ts` (whole file)
- Modify: `lib/api/domains/semen/semen.controller.ts` (whole file)
- Modify: `lib/api/domains/semen/schemas/semen.schema.ts`
- Modify: `lib/domain/semen.ts` (delete `purchaseExpenseNotes`)
- Modify: `components/semen/semen-bulls-list.tsx`
- Modify: `components/semen/semen-bull-page.tsx`
- Modify: `components/semen/semen-bull-dialog.tsx`
- Modify: `components/semen/semen-purchase-dialog.tsx`
- Modify: `components/semen/use-delete-semen-bull.ts`
- Test: `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` (whole file)
- Test: `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`
- Test: `lib/api/domains/semen/useCases/__tests__/DeletePurchase.test.ts` (whole file)
- Test: `lib/api/domains/semen/useCases/__tests__/DeleteBull.test.ts` (whole file)
- Test: `lib/api/domains/semen/useCases/__tests__/UpdateBull.test.ts` (drop `expenseId`, red since task 1's mapper)
- Test: `lib/api/__tests__/permissions.test.ts` (whole file)
- Test: `lib/domain/__tests__/semen.test.ts`

**Interfaces:**
- Consumes: task 1 — `SemenPurchase` without `expenseId`, `semenPurchases` without `expenseId`, `toSemenPurchase(row)` without `expenseId`; `redactSemenBull(bull: SemenBull): SemenBull` (unchanged, `lib/domain/moneyRedaction.ts`). Task 2 (runs before this task in wave 2) — `ROUTE_REQUIREMENTS["POST /api/herd/semen-bulls/:id/purchases"]` and `["DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId"]` are `edit("reproduction")`; the store's sêmen actions read `{ bull }`, `{ purchase }`, `{ id }`.
- Produces:
  - `writeSemenPurchase(repository: RepositoryType, bullId: string, input: NewSemenPurchaseInput): Promise<SemenPurchase>`
  - `AddPurchaseUseCase.run({ farmId, bullId, input }): Promise<{ purchase: SemenPurchase } | "not_found">`
  - `AddBullUseCase.run({ farmId, input }): Promise<{ bull: SemenBull } | "duplicate_name">`
  - `DeletePurchaseUseCase` (constructor `(repo = db)`, no blob store): `run({ farmId, bullId, purchaseId }): Promise<{ id: string } | "not_found" | "stock_negative">`
  - `DeleteBullUseCase` (constructor `(repo = db)`, no blob store): `run({ farmId, id }): Promise<{ id: string } | "not_found" | "doses_used" | "open_insemination">`
  - HTTP: `POST /semen-bulls` → `{ bull }` (redacted without Financeiro view); `POST /semen-bulls/:id/purchases` → `{ purchase }` (its `totalBrl` dropped without Financeiro view); `DELETE /semen-bulls/:id` → `{ id }`; `DELETE /semen-bulls/:id/purchases/:purchaseId` → `{ id }`. No route here answers 403 `finance` any more.
  - DELETED: `WrittenSemenPurchase`, `purchaseExpenseNotes`, `canRemoveExpenses`, `"finance_forbidden"`, the `totalHint` prop of `PurchaseInputs`.

---

#### Cycle 1 — buying writes the purchase only

- [ ] **Step 1: Write the failing tests**

**Replace the whole file** `lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts` with:

```ts
/**
 * addSemenPurchase: registers a purchase of doses of a bull of the farm. A
 * purchase is stock: nothing is written in the Financeiro.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the table and the row and echo it.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every `insert().values()` call, in order. */
    inserts: [] as { table: string; row: Record<string, unknown> }[],
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

function insertBuilder(table: Table) {
  return {
    values: (row: Record<string, unknown>) => {
      state.inserts.push({ table: getTableName(table), row });
      return { returning: () => Promise.resolve([row]) };
    },
  };
}

vi.mock("@/lib/db", () => ({ db: { select: selectBuilder, insert: insertBuilder } }));

import { AddPurchaseUseCase } from "../AddPurchase.useCase";

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addSemenPurchase", () => {
  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    const result = await new AddPurchaseUseCase().run({
      farmId: 7,
      bullId: "bull-of-another-farm",
      input: { date: "2026-08-20", doses: 20, totalBrl: 800 },
    });

    expect(result).toBe("not_found");
    expect(state.inserts).toEqual([]);
  });

  it("writes the purchase only, and answers it", async () => {
    state.selectResults = [[{ id: "bull-1" }]];

    const result = await new AddPurchaseUseCase().run({
      farmId: 7,
      bullId: "bull-1",
      input: { date: "2026-08-20", doses: 1, totalBrl: 42.5, seller: "   " },
    });

    expect(state.inserts.map((insert) => insert.table)).toEqual(["semen_purchases"]);
    const [purchase] = state.inserts.map((insert) => insert.row);
    expect(purchase).toEqual({
      id: expect.any(String),
      bullId: "bull-1",
      date: "2026-08-20",
      doses: 1,
      totalBrl: 42.5,
      seller: null,
    });
    expect(result).toEqual({
      purchase: { id: purchase.id, date: "2026-08-20", doses: 1, totalBrl: 42.5 },
    });
    expect(result).not.toHaveProperty("expense");
  });
});
```

**Replace** in `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`:

```ts
 * farm; blank optional texts are stored as null; a first purchase is written
 * with its Reprodução expense in the same transaction.
```

with:

```ts
 * farm; blank optional texts are stored as null; a first purchase is written
 * in the same transaction, and nothing lands in the Financeiro.
```

**Replace** in `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`:

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

with:

```ts
vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) => Promise.resolve(run({ insert: insertBuilder })),
  },
}));
```

**Replace** in `lib/api/domains/semen/useCases/__tests__/AddBull.test.ts`:

```ts
  it("writes the first purchase and its expense, linked", async () => {
    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: {
        name: "Tufão da Serra",
        firstPurchase: {
          date: "2026-08-01",
          doses: 30,
          totalBrl: 1140,
          seller: " Central Bela Vista ",
        },
      },
    });

    expect(state.inserts.map((insert) => insert.table)).toEqual([
      "semen_bulls",
      "expenses",
      "semen_purchases",
    ]);
    const [bull, expense, purchase] = state.inserts.map((insert) => insert.row);
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
    expect(purchase).toMatchObject({
      bullId: bull.id,
      date: "2026-08-01",
      doses: 30,
      totalBrl: 1140,
      seller: "Central Bela Vista",
      expenseId: expense.id,
    });
    expect(result).toEqual({
      bull: {
        id: bull.id,
        name: "Tufão da Serra",
        purchases: [
          {
            id: purchase.id,
            date: "2026-08-01",
            doses: 30,
            totalBrl: 1140,
            seller: "Central Bela Vista",
            expenseId: expense.id,
          },
        ],
      },
      expense: {
        id: expense.id,
        kind: "expense",
        date: "2026-08-01",
        paidAt: "2026-08-01",
        category: "breeding",
        amountBrl: 1140,
        notes: "Sêmen — Tufão da Serra, 30 doses",
        attachmentCount: 0,
      },
    });
  });
```

with:

```ts
  it("writes the first purchase with the bull, and no expense", async () => {
    const result = await new AddBullUseCase().run({
      farmId: 7,
      input: {
        name: "Tufão da Serra",
        firstPurchase: {
          date: "2026-08-01",
          doses: 30,
          totalBrl: 1140,
          seller: " Central Bela Vista ",
        },
      },
    });

    expect(state.inserts.map((insert) => insert.table)).toEqual(["semen_bulls", "semen_purchases"]);
    const [bull, purchase] = state.inserts.map((insert) => insert.row);
    expect(purchase).toEqual({
      id: expect.any(String),
      bullId: bull.id,
      date: "2026-08-01",
      doses: 30,
      totalBrl: 1140,
      seller: "Central Bela Vista",
    });
    expect(result).toEqual({
      bull: {
        id: bull.id,
        name: "Tufão da Serra",
        purchases: [
          {
            id: purchase.id,
            date: "2026-08-01",
            doses: 30,
            totalBrl: 1140,
            seller: "Central Bela Vista",
          },
        ],
      },
    });
    expect(result).not.toHaveProperty("expense");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts lib/api/domains/semen/useCases/__tests__/AddBull.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — 3 tests: `AddPurchase` still opens a transaction (the stub no longer offers one), looks up the "Sêmen" conta and writes an `expenses` row; `AddBull` still looks up the "Sêmen" conta for the expense ("repository.select is not a function": the stub no longer offers `select`).

- [ ] **Step 3: Implement**

**Replace the whole file** `lib/api/domains/semen/useCases/AddPurchase.useCase.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { semenBulls, semenPurchases } from "@/lib/db/schema";
import { toSemenPurchase } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { textOrNull } from "../_shared/text";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SemenPurchase } from "@/lib/types";

/** A purchase of doses as the client sends it. */
export interface NewSemenPurchaseInput {
  date: string;
  doses: number;
  totalBrl: number;
  seller?: string;
}

/**
 * Writes one purchase of doses of a bull. A purchase is stock, not money in the
 * Financeiro: nothing else is written.
 */
export async function writeSemenPurchase(
  repository: RepositoryType,
  bullId: string,
  input: NewSemenPurchaseInput
): Promise<SemenPurchase> {
  const [row] = await repository
    .insert(semenPurchases)
    .values({
      id: randomUUID(),
      bullId,
      date: input.date,
      doses: input.doses,
      totalBrl: input.totalBrl,
      seller: textOrNull(input.seller),
    })
    .returning();
  return toSemenPurchase(row);
}

interface AddPurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  input: NewSemenPurchaseInput;
}

type AddPurchaseUseCaseResponse = { purchase: SemenPurchase } | "not_found";

type CurrUseCase = _UseCase<AddPurchaseUseCaseProps, AddPurchaseUseCaseResponse>;

/**
 * Registers a purchase of doses of a bull of the farm. Buying only adds stock,
 * so no row lock is needed here.
 */
export class AddPurchaseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddPurchaseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, bullId, input }) => {
    const [bull] = await this.repository
      .select({ id: semenBulls.id })
      .from(semenBulls)
      .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, bullId)))
      .limit(1);
    if (!bull) return "not_found";

    return { purchase: await writeSemenPurchase(this.repository, bull.id, input) };
  };
}
```

**Replace the whole file** `lib/api/domains/semen/useCases/AddBull.useCase.ts` with:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { semenBulls } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toSemenBull } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { textOrNull } from "../_shared/text";
import {
  writeSemenPurchase,
  type NewSemenPurchaseInput,
} from "./AddPurchase.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { SemenBullRow } from "@/lib/db/schema";
import type { SemenBull } from "@/lib/types";

/** A new bull as the client sends it ("Novo touro"). */
export interface NewSemenBullInput {
  name: string;
  code?: string;
  breed?: string;
  central?: string;
  /** "Primeira compra (opcional)": becomes the bull's first purchase. */
  firstPurchase?: NewSemenPurchaseInput;
}

interface AddBullUseCaseProps {
  farmId: number;
  input: NewSemenBullInput;
}

type AddBullUseCaseResponse = { bull: SemenBull } | "duplicate_name";

type CurrUseCase = _UseCase<AddBullUseCaseProps, AddBullUseCaseResponse>;

/**
 * Registers a bull the farm buys semen from. The name is unique per farm
 * (`duplicate_name`); blank optional texts are stored as null. A first purchase
 * is written in the same transaction as the bull.
 */
export class AddBullUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddBullUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, input }) => {
    return this.repository.transaction(async (tx) => {
      let row: SemenBullRow;
      try {
        [row] = await tx
          .insert(semenBulls)
          .values({
            id: randomUUID(),
            farmId,
            name: input.name.trim(),
            code: textOrNull(input.code),
            breed: textOrNull(input.breed),
            central: textOrNull(input.central),
          })
          .returning();
      } catch (error) {
        // The first write failed, so nothing is lost with the aborted transaction.
        if (isUniqueViolation(error)) return "duplicate_name";
        throw error;
      }

      if (!input.firstPurchase) return { bull: toSemenBull(row, []) };

      const purchase = await writeSemenPurchase(tx, row.id, input.firstPurchase);
      return { bull: toSemenBull(row, [purchase]) };
    });
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/semen/useCases/__tests__/AddPurchase.test.ts lib/api/domains/semen/useCases/__tests__/AddBull.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle 2 — deleting touches no expense

- [ ] **Step 1: Write the failing tests**

**Replace the whole file** `lib/api/domains/semen/useCases/__tests__/DeletePurchase.test.ts` with:

```ts
/**
 * deleteSemenPurchase: removes a purchase under the bull's row lock, and
 * refuses when the doses left would not cover the ones already used. Nothing
 * in the Financeiro goes with it.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, deletes record the table they hit.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Table of every `delete()` issued, in order. */
    deletes: [] as string[],
    /** Whether any select took a row lock. */
    locked: false,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: (strength: string) => {
      if (strength === "update") state.locked = true;
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          delete: (table: Table) => ({
            where: () => {
              state.deletes.push(getTableName(table));
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { DeletePurchaseUseCase } from "../DeletePurchase.useCase";

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: null,
  central: null,
};

/** The bull lock and its counts: 60 doses bought over two purchases. */
const stockSelects = (used: number) => [[BULL_ROW], [{ bought: 60 }], [{ used }]];

const PURCHASE_ROW = { id: "p-2", doses: 30 };

const run = (purchaseId = "p-2") =>
  new DeletePurchaseUseCase().run({ farmId: 7, bullId: "bull-1", purchaseId });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = [];
  state.locked = false;
});

describe("deleteSemenPurchase", () => {
  it("deletes the purchase only, and answers its id", async () => {
    state.selectResults = [...stockSelects(30), [PURCHASE_ROW]];

    expect(await run()).toEqual({ id: "p-2" });
    expect(state.locked).toBe(true);
    expect(state.deletes).toEqual(["semen_purchases"]);
  });

  it("refuses with stock_negative when the rest does not cover the used doses", async () => {
    // 60 − 30 = 30 left to cover 31 used doses.
    state.selectResults = [...stockSelects(31), [PURCHASE_ROW]];

    expect(await run()).toBe("stock_negative");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    expect(await run()).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a purchase that is not of this bull", async () => {
    state.selectResults = [...stockSelects(0), []];

    expect(await run("p-9")).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });
});
```

**Replace the whole file** `lib/api/domains/semen/useCases/__tests__/DeleteBull.test.ts` with:

```ts
/**
 * deleteSemenBull: removes a bull with its purchases (cascade) under the bull's
 * row lock, and refuses while a cobertura used one of its doses or an open
 * inseminação still offers it. Nothing in the Financeiro goes with it, so the
 * caller's permissions play no part here.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, deletes record the table they hit.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Table of every `delete()` issued, in order. */
    deletes: [] as string[],
    /** Whether any select took a row lock. */
    locked: false,
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: (strength: string) => {
      if (strength === "update") state.locked = true;
      return builder;
    },
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          delete: (table: Table) => ({
            where: () => {
              state.deletes.push(getTableName(table));
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { DeleteBullUseCase } from "../DeleteBull.useCase";

const BULL_ROW = {
  id: "bull-1",
  farmId: 7,
  name: "Tufão da Serra",
  code: "NEL-4471",
  breed: null,
  central: null,
};

/** The bull lock and its counts (60 doses bought), then the open inseminações that list it. */
const stockSelects = (used: number, openSessions: Record<string, unknown>[] = []) => [
  [BULL_ROW],
  [{ bought: 60 }],
  [{ used }],
  openSessions,
];

const run = () => new DeleteBullUseCase().run({ farmId: 7, id: "bull-1" });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = [];
  state.locked = false;
});

describe("deleteSemenBull", () => {
  it("deletes a bull that has purchases, and only the bull row, answering its id", async () => {
    state.selectResults = stockSelects(0);

    expect(await run()).toEqual({ id: "bull-1" });
    expect(state.locked).toBe(true);
    expect(state.deletes).toEqual(["semen_bulls"]);
    // Nothing else was read: no purchase or expense lookup after the checks.
    expect(state.selectResults).toEqual([]);
  });

  it("refuses with doses_used once a cobertura took a dose", async () => {
    state.selectResults = stockSelects(1);

    expect(await run()).toBe("doses_used");
    expect(state.deletes).toEqual([]);
  });

  it("refuses with open_insemination while an open inseminação lists it", async () => {
    state.selectResults = stockSelects(0, [{ id: "s-1" }]);

    expect(await run()).toBe("open_insemination");
    expect(state.deletes).toEqual([]);
  });

  it("answers not_found for a bull that is not on the farm", async () => {
    state.selectResults = [[]];

    expect(await run()).toBe("not_found");
    expect(state.deletes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/semen/useCases/__tests__/DeletePurchase.test.ts lib/api/domains/semen/useCases/__tests__/DeleteBull.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — 2 tests: `DeletePurchase` also deletes from `expenses` (`[ 'semen_purchases', 'expenses' ]`); `DeleteBull` answers `{ id, expenseIds: [] }` after selecting the purchases.

- [ ] **Step 3: Implement**

**Replace the whole file** `lib/api/domains/semen/useCases/DeletePurchase.useCase.ts` with:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { semenPurchases } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeletePurchaseUseCaseProps {
  farmId: number;
  bullId: string;
  purchaseId: string;
}

type DeletePurchaseUseCaseResponse = { id: string } | "not_found" | "stock_negative";

type CurrUseCase = _UseCase<DeletePurchaseUseCaseProps, DeletePurchaseUseCaseResponse>;

/**
 * Removes a purchase of a bull. Refused with `stock_negative` when the other
 * purchases would not cover the doses already used; the count runs under the
 * bull's row lock, so a dose taken concurrently is either counted here or waits
 * for this delete.
 */
export class DeletePurchaseUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeletePurchaseUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, bullId, purchaseId }) => {
    return this.repository.transaction(async (tx) => {
      const stock = await lockBullStock(tx, farmId, bullId);
      if (!stock) return "not_found";

      const [purchase] = await tx
        .select({ id: semenPurchases.id, doses: semenPurchases.doses })
        .from(semenPurchases)
        .where(and(eq(semenPurchases.id, purchaseId), eq(semenPurchases.bullId, stock.bull.id)))
        .limit(1);
      if (!purchase) return "not_found";
      if (stock.bought - purchase.doses < stock.used) return "stock_negative";

      await tx.delete(semenPurchases).where(eq(semenPurchases.id, purchase.id));
      return { id: purchase.id };
    });
  };
}
```

**Replace the whole file** `lib/api/domains/semen/useCases/DeleteBull.useCase.ts` with:

```ts
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessions, semenBulls } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { lockBullStock } from "../_shared/stock";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteBullUseCaseProps {
  farmId: number;
  id: string;
}

type DeleteBullUseCaseResponse =
  | { id: string }
  | "not_found"
  | "doses_used"
  | "open_insemination";

type CurrUseCase = _UseCase<DeleteBullUseCaseProps, DeleteBullUseCaseResponse>;

/**
 * Removes a bull with its purchases (cascade). Refused with `doses_used` once a
 * cobertura took one of its doses — the record must keep naming the bull, and
 * the foreign key would refuse it anyway — and with `open_insemination` while
 * an open inseminação still offers it at the brete. The counts run under the
 * bull's row lock, so a dose taken concurrently is either counted here or waits
 * for this delete.
 */
export class DeleteBullUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteBullUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id }) => {
    return this.repository.transaction(async (tx) => {
      const stock = await lockBullStock(tx, farmId, id);
      if (!stock) return "not_found";
      if (stock.used > 0) return "doses_used";

      const [offered] = await tx
        .select({ id: manejoSessions.id })
        .from(manejoSessions)
        .where(
          and(
            eq(manejoSessions.farmId, farmId),
            eq(manejoSessions.status, "open"),
            isNull(manejoSessions.deletedAt),
            sql`${manejoSessions.semenBullIds} @> ${JSON.stringify([stock.bull.id])}::jsonb`
          )
        )
        .limit(1);
      if (offered) return "open_insemination";

      await tx
        .delete(semenBulls)
        .where(and(eq(semenBulls.farmId, farmId), eq(semenBulls.id, stock.bull.id)));
      return { id: stock.bull.id };
    });
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/semen/useCases/__tests__/DeletePurchase.test.ts lib/api/domains/semen/useCases/__tests__/DeleteBull.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle 3 — the controller asks Reprodução only and still hides the totals (Review Focus 5)

- [ ] **Step 1: Write the failing test**

**Replace the whole file** `lib/api/__tests__/permissions.test.ts` with:

```ts
/**
 * Real routes of herdApi behind the farm macro, with auth and the db mocked:
 * proves the macro's route pattern matches the table's keys at runtime, the
 * money rules on POST /manejo, the semen writes that ask Reprodução only, and
 * the redaction of GET /api/herd and of what a semen write returns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, deleteBull, HERD } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  /** DeleteBullUseCase.run: answers the id it was asked to delete. */
  deleteBull: vi.fn((props: { farmId: number; id: string }) => Promise.resolve({ id: props.id })),
  HERD: {
    animals: [],
    treatments: [
      { id: "t-1", animalEarTag: "BR-1", type: "vaccine", name: "Aftosa", date: "2026-09-01", status: "done", withdrawalDays: 0, costBrl: 4.5 },
    ],
    lots: [],
    accounts: [
      { id: "acc-1", group: "grp-financiamentos", name: "Pronaf", openingBalanceBrl: 120000, openingDate: "2026-06-30" },
    ],
    invernadas: [],
    lotPlacements: [],
    movements: [],
    breeds: [],
    manejoSessions: [],
    expenses: [{ id: "e-1", kind: "expense", date: "2026-09-01", category: "grp-mao-de-obra", amountBrl: 1200 }],
    planGroups: [],
    semenBulls: [
      {
        id: "bull-1",
        name: "Tufão da Serra",
        purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520 }],
      },
    ],
    farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(state.membership),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/api/domains/herd/useCases/Load.useCase", () => ({
  LoadHerdUseCase: class {
    run = () => Promise.resolve(structuredClone(HERD));
  },
}));
vi.mock("@/lib/api/domains/manejo/useCases/Start.useCase", () => ({
  StartSessionUseCase: class {
    run = () =>
      Promise.resolve({
        id: "m-1",
        name: "Sessão de Saúde",
        date: "2026-09-12",
        status: "open",
        kind: "health",
        weighing: false,
        treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0, costBrl: 12 },
        animals: [],
        pricePerArroba: 300,
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/UpdateBull.useCase", () => ({
  UpdateBullUseCase: class {
    run = () =>
      Promise.resolve({
        id: "bull-1",
        name: "Tufão",
        purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520 }],
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/AddBull.useCase", () => ({
  AddBullUseCase: class {
    run = () =>
      Promise.resolve({
        bull: {
          id: "bull-2",
          name: "Bravo",
          purchases: [{ id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 }],
        },
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/AddPurchase.useCase", () => ({
  AddPurchaseUseCase: class {
    run = () =>
      Promise.resolve({ purchase: { id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 } });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/DeleteBull.useCase", () => ({
  DeleteBullUseCase: class {
    run = deleteBull;
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/DeletePurchase.useCase", () => ({
  DeletePurchaseUseCase: class {
    run = () => Promise.resolve({ id: "p-1" });
  },
}));
vi.mock("@/lib/api/domains/manejo/useCases/CompleteAnimal.useCase", () => ({
  CompleteAnimalUseCase: class {
    run = () =>
      Promise.resolve({
        entry: { earTag: "BR-1", outcome: "done", amountBrl: 500 },
        treatments: [
          { id: "t-2", animalEarTag: "BR-1", type: "vaccine", name: "Aftosa", date: "2026-09-01", status: "done", withdrawalDays: 0, costBrl: 9 },
        ],
      });
  },
}));

import { herdApi } from "@/lib/api/app";

const headers = { "x-farm-id": "7", "content-type": "application/json" };
const request = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

function asMember(permissions: typeof FULL_PERMISSIONS) {
  state.membership = [{ role: "member", preset: null, permissions }];
}

/** 10 doses for R$ 380. */
const PURCHASE_BODY = { date: "2026-09-12", doses: 10, totalBrl: 380 };

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
});

describe("permissions on the mounted API", () => {
  it("lets a consultor read", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "/health");
    expect(response.status).toBe(200);
  });

  it("refuses a consultor a manejo write, naming the area", async () => {
    asMember(PRESETS.consultor);
    const response = await request("POST", "/manejo/abc/close");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "manejo" });
  });

  it("refuses a vaqueiro a venda, naming Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo", {
      date: "2026-09-12",
      kind: "sale",
      earTags: ["BR-1"],
      weighing: true,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
  });

  it("strips money from the herd for a member without Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toEqual([]);
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
    expect(data.accounts).toEqual([{ id: "acc-1", group: "grp-financiamentos", name: "Pronaf" }]);
  });

  it("keeps money for a member who sees Financeiro", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toHaveLength(1);
    expect(data.treatments[0].costBrl).toBe(4.5);
  });

  it("strips the semen purchase totals from the herd for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.semenBulls[0].purchases[0]).not.toHaveProperty("totalBrl");
    expect(data.semenBulls[0].purchases[0].doses).toBe(40);
  });

  it("lets a vaqueiro (Reprodução edit, finance none) buy doses, without the total in the answer", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purchase: { id: "p-2", date: "2026-09-12", doses: 10 },
    });
  });

  it("answers the purchase with its total to a member who sees Financeiro", async () => {
    asMember(FULL_PERMISSIONS);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purchase: { id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 },
    });
  });

  it("refuses a consultor a semen purchase, naming Reprodução", async () => {
    asMember(PRESETS.consultor);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "reproduction" });
  });

  it("lets a vaqueiro register a bull with its first purchase, without the totals", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/semen-bulls", {
      name: "Bravo",
      firstPurchase: PURCHASE_BODY,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bull: {
        id: "bull-2",
        name: "Bravo",
        purchases: [{ id: "p-2", date: "2026-09-12", doses: 10 }],
      },
    });
  });

  it("lets a vaqueiro delete a bull with purchases, asking nothing of Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("DELETE", "/semen-bulls/bull-1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "bull-1" });
    expect(deleteBull).toHaveBeenCalledWith({ farmId: 7, id: "bull-1" });
  });

  it("lets a vaqueiro delete a purchase", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("DELETE", "/semen-bulls/bull-1/purchases/p-1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "p-1" });
  });

  it("strips the purchase totals from an edited bull for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("PATCH", "/semen-bulls/bull-1", { name: "Tufão" });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.purchases[0]).toEqual({ id: "p-1", date: "2026-03-01", doses: 40 });
  });

  it("strips money from a started session for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo", {
      date: "2026-09-12",
      kind: "health",
      earTags: ["BR-1"],
      weighing: false,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.treatment).not.toHaveProperty("costBrl");
    expect(data).not.toHaveProperty("pricePerArroba");
  });

  it("strips money from a completed chute pass for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo/m-1/animals/a-1/complete", {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entry).not.toHaveProperty("amountBrl");
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/permissions.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — 3 tests: the new bull with a first purchase answers 403 `finance`; the purchase answer to the vaqueiro still carries `totalBrl`; `DeleteBullUseCase.run` is called with `canRemoveExpenses`. (If the purchase tests answer 403 `finance` instead, task 2's `ROUTE_REQUIREMENTS` change is not in yet: stop and report.)

- [ ] **Step 3: Implement**

**Replace the whole file** `lib/api/domains/semen/semen.controller.ts` with:

```ts
/**
 * Semen bulls — the bulls a farm buys semen from, and each purchase of doses.
 *
 * Stock is not a column: it derives from the purchases and the coberturas that
 * used a dose, so there is no route to set it. A purchase is stock, not money
 * in the Financeiro: every route here asks Reprodução edit in the route table
 * and nothing more. A member who does not see Financeiro still gets the bull
 * and the purchase back without their totals.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";
import { redactSemenBull } from "@/lib/domain/moneyRedaction";
import { can } from "@/lib/domain/permissions";

import { AddBullUseCase } from "./useCases/AddBull.useCase";
import { AddPurchaseUseCase } from "./useCases/AddPurchase.useCase";
import { DeleteBullUseCase } from "./useCases/DeleteBull.useCase";
import { DeletePurchaseUseCase } from "./useCases/DeletePurchase.useCase";
import { UpdateBullUseCase } from "./useCases/UpdateBull.useCase";
import {
  NewSemenBullBody,
  SemenBullPatchBody,
  SemenPurchaseBody,
} from "./schemas/semen.schema";

export const semenController = new Elysia({ prefix: "/semen-bulls" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, permissions, body, status }) => {
      const result = await new AddBullUseCase().run({ farmId, input: body });
      if (result === "duplicate_name") return status(409, { error: result });
      return can(permissions, "finance", "view")
        ? result
        : { bull: redactSemenBull(result.bull) };
    },
    { farm: true, body: NewSemenBullBody }
  )
  .patch(
    "/:id",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new UpdateBullUseCase().run({
        farmId,
        id: params.id,
        patch: body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "duplicate_name") return status(409, { error: result });
      return can(permissions, "finance", "view") ? result : redactSemenBull(result);
    },
    { farm: true, body: SemenBullPatchBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteBullUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "doses_used" || result === "open_insemination") {
        return status(409, { error: result });
      }
      return result;
    },
    { farm: true }
  )
  .post(
    "/:id/purchases",
    async ({ farmId, permissions, params, body, status }) => {
      const result = await new AddPurchaseUseCase().run({
        farmId,
        bullId: params.id,
        input: body,
      });
      if (result === "not_found") return status(404, { error: result });
      if (can(permissions, "finance", "view")) return result;
      // The member typed the total, but it stays out of their store as on load.
      const purchase = { ...result.purchase };
      delete purchase.totalBrl;
      return { purchase };
    },
    { farm: true, body: SemenPurchaseBody }
  )
  .delete(
    "/:id/purchases/:purchaseId",
    async ({ farmId, params, status }) => {
      const result = await new DeletePurchaseUseCase().run({
        farmId,
        bullId: params.id,
        purchaseId: params.purchaseId,
      });
      if (result === "not_found") return status(404, { error: result });
      if (result === "stock_negative") return status(409, { error: result });
      return result;
    },
    { farm: true }
  );
```

**Replace** in `lib/api/domains/semen/schemas/semen.schema.ts`:

```ts
/**
 * Body of POST /semen-bulls/:id/purchases, and the optional first purchase of a
 * new bull. Every purchase also becomes a Reprodução expense of `totalBrl`.
 */
```

with:

```ts
/** Body of POST /semen-bulls/:id/purchases, and the optional first purchase of a new bull. */
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/permissions.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle 4 — dead helper and the stale fixture

- [ ] **Step 1: Delete `purchaseExpenseNotes` and its test**

**Replace** in `lib/domain/semen.ts`:

```ts
/**
 * Note of the expense a purchase writes in Financeiro:
 * "Sêmen — Tufão da Serra, 30 doses" ("1 dose" in the singular).
 */
export function purchaseExpenseNotes(bullName: string, doses: number): string {
  return `Sêmen — ${bullName}, ${doses} ${doses === 1 ? "dose" : "doses"}`;
}

/** A cow an inseminação can take: an active female, vaca or novilha. */
```

with:

```ts
/** A cow an inseminação can take: an active female, vaca or novilha. */
```

**Replace** in `lib/domain/__tests__/semen.test.ts`:

```ts
  predominantLotId,
  purchaseExpenseNotes,
  sessionDosesByBull,
```

with:

```ts
  predominantLotId,
  sessionDosesByBull,
```

**Replace** in `lib/domain/__tests__/semen.test.ts`:

```ts
describe("purchaseExpenseNotes", () => {
  it("names the bull and the doses bought", () => {
    expect(purchaseExpenseNotes("Tufão da Serra", 30)).toBe("Sêmen — Tufão da Serra, 30 doses");
    expect(purchaseExpenseNotes("Tufão da Serra", 1)).toBe("Sêmen — Tufão da Serra, 1 dose");
  });
});

describe("eligibleForInsemination", () => {
```

with:

```ts
describe("eligibleForInsemination", () => {
```

- [ ] **Step 2: Drop `expenseId` from the UpdateBull fixture** (task 1's mapper no longer returns it, so this test is red until now)

**Replace** in `lib/api/domains/semen/useCases/__tests__/UpdateBull.test.ts`:

```ts
  seller: null,
  expenseId: "e-1",
};
```

with:

```ts
  seller: null,
};
```

**Replace** in `lib/api/domains/semen/useCases/__tests__/UpdateBull.test.ts`:

```ts
        { id: "p-1", date: "2026-08-01", doses: 30, totalBrl: 1140, expenseId: "e-1" },
```

with:

```ts
        { id: "p-1", date: "2026-08-01", doses: 30, totalBrl: 1140 },
```

- [ ] **Step 3: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/semen.test.ts lib/api/domains/semen components/semen --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 4: Nothing else names the deleted code**

Run: `grep -rnE "purchaseExpenseNotes|WrittenSemenPurchase|canRemoveExpenses" lib components app cli; grep -rn "finance_forbidden" lib/api/domains/semen components/semen`
Expected: no output (the farm domain's own `finance_forbidden`, for the início da safra, stays: it is not the sêmen one).

---

#### Cycle 5 — Touros screens: Reprodução edit buys and deletes

No component tests (UI task): implement → tsc → lint. Money columns keep `useCan("finance", "view")`.

- [ ] **Step 1: Implement**

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
 * "Novo touro" needs Reprodução edit; "Registrar compra" writes an expense, so
 * it needs Financeiro edit on top, and the cost per dose shows only to whoever
 * sees Financeiro. Excluir takes the bull's purchases and their expenses
 * along, so with a purchase it asks Financeiro edit as well.
 */
```

with:

```tsx
 * "Novo touro", "Registrar compra" and Excluir need Reprodução edit: a
 * purchase is stock, not money in the Financeiro, and a deleted bull takes its
 * purchases along. The cost per dose shows only to whoever sees Financeiro.
 */
```

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
import type { SemenBull } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
import { useHerdStore } from "@/lib/store/useHerdStore";
```

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
  const canEditFinance = useCan("finance", "edit");
  const seeMoney = useCan("finance", "view");
  const canBuy = canEdit && canEditFinance;
  const canDelete = (bull: SemenBull) =>
    canEdit && (bull.purchases.length === 0 || canEditFinance);
```

with:

```tsx
  const seeMoney = useCan("finance", "view");
```

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
                          {canBuy ? <SemenPurchaseDialog bull={bull} variant="row" /> : null}
                          {canDelete(bull) ? (
                            <DeleteSemenBullButton bull={bull} variant="row" />
                          ) : null}
```

with:

```tsx
                          <SemenPurchaseDialog bull={bull} variant="row" />
                          <DeleteSemenBullButton bull={bull} variant="row" />
```

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
                      {canDelete(bull) ? <DeleteSemenBullButton bull={bull} variant="card" /> : null}
```

with:

```tsx
                      {canEdit ? <DeleteSemenBullButton bull={bull} variant="card" /> : null}
```

**Replace** in `components/semen/semen-bulls-list.tsx`:

```tsx
                  {canBuy ? <SemenPurchaseDialog bull={bull} variant="card" /> : null}
```

with:

```tsx
                  {canEdit ? <SemenPurchaseDialog bull={bull} variant="card" /> : null}
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
 * Editing the bull needs Reprodução edit; a purchase is an expense, so buying
 * and deleting one need Financeiro edit on top, as does deleting the bull once
 * it has a purchase — its purchases and their expenses go with it, and the
 * farmer lands back on the Touros tab. Every R$ — cost per dose, the valor
 * total of each purchase and of all of them — shows only to whoever sees
 * Financeiro.
 */
```

with:

```tsx
 * Editing the bull, buying and deleting a purchase and deleting the bull need
 * Reprodução edit: a purchase is stock, not money in the Financeiro. A deleted
 * bull takes its purchases along and the farmer lands back on the Touros tab.
 * Every R$ — cost per dose, the valor total of each purchase and of all of
 * them — shows only to whoever sees Financeiro.
 */
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
  /** Reprodução and Financeiro edit: each purchase has its delete. */
```

with:

```tsx
  /** Reprodução edit: each purchase has its delete. */
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
  /** Deletes the purchase and its expense, unless its doses were already used. */
```

with:

```tsx
  /** Deletes the purchase, unless its doses were already used. */
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
  const canEditFinance = useCan("finance", "edit");
  const seeMoney = useCan("finance", "view");
  const canBuy = canEdit && canEditFinance;
  const canDelete = canEdit && (bull.purchases.length === 0 || canEditFinance);
```

with:

```tsx
  const seeMoney = useCan("finance", "view");
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
                {canBuy ? <SemenPurchaseDialog bull={bull} variant="header" /> : null}
                {canDelete ? (
                  <DeleteSemenBullButton
                    bull={bull}
                    variant="header"
                    onDeleted={() => router.replace(TOUROS_TAB)}
                  />
                ) : null}
```

with:

```tsx
                <SemenPurchaseDialog bull={bull} variant="header" />
                <DeleteSemenBullButton
                  bull={bull}
                  variant="header"
                  onDeleted={() => router.replace(TOUROS_TAB)}
                />
```

**Replace** in `components/semen/semen-bull-page.tsx`:

```tsx
      <BullPurchases bull={bull} animals={animals} seeMoney={seeMoney} canRemove={canBuy} />
```

with:

```tsx
      <BullPurchases bull={bull} animals={animals} seeMoney={seeMoney} canRemove={canEdit} />
```

**Replace** in `components/semen/use-delete-semen-bull.ts`:

```ts
    const money =
      bull.purchases.length > 0
        ? " As compras dele e as despesas que elas geraram saem do Financeiro."
        : "";
    if (!window.confirm(`Excluir o touro ${bull.name}?${money}`)) return;
```

with:

```ts
    const purchases = bull.purchases.length > 0 ? " As compras dele saem junto." : "";
    if (!window.confirm(`Excluir o touro ${bull.name}?${purchases}`)) return;
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
 * the name conflict the server answers shown under the fields. The first
 * purchase writes an expense, so it is offered only with Financeiro edit.
 */
```

with:

```tsx
 * the name conflict the server answers shown under the fields.
 */
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
} from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
```

with:

```tsx
} from "@/lib/store/useHerdStore";
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
  const updateSemenBull = useHerdStore((s) => s.updateSemenBull);
  const canBuy = useCan("finance", "edit");
```

with:

```tsx
  const updateSemenBull = useHerdStore((s) => s.updateSemenBull);
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
    if (canBuy && purchaseStarted(fields.purchase)) {
```

with:

```tsx
    if (purchaseStarted(fields.purchase)) {
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
          {editing || !canBuy ? null : (
```

with:

```tsx
          {editing ? null : (
```

**Replace** in `components/semen/semen-bull-dialog.tsx`:

```tsx
                  setFields((f) => ({ ...f, purchase: { ...f.purchase, ...patch } }))
                }
                totalHint="Vira despesa de Reprodução no Financeiro"
              />
```

with:

```tsx
                  setFields((f) => ({ ...f, purchase: { ...f.purchase, ...patch } }))
                }
              />
```

**Replace** in `components/semen/semen-purchase-dialog.tsx`:

```tsx
 * says what each dose costs and where the stock goes once the purchase is in.
 * The purchase also lands in Financeiro as a Reprodução expense of its total.
```

with:

```tsx
 * says what each dose costs and where the stock goes once the purchase is in.
 * A purchase is stock: nothing of it lands in the Financeiro.
```

**Replace** in `components/semen/semen-purchase-dialog.tsx`:

```tsx
import { useState, type FormEvent, type ReactNode } from "react";
```

with:

```tsx
import { useState, type FormEvent } from "react";
```

**Replace** in `components/semen/semen-purchase-dialog.tsx`:

```tsx
  onChange: (patch: Partial<PurchaseFields>) => void;
  /** Note under the Valor total input. */
  totalHint?: ReactNode;
}

/** Data, Doses, Valor total (R$) and Fornecedor, two by two. */
export function PurchaseInputs({ idPrefix, fields, onChange, totalHint }: PurchaseInputsProps) {
```

with:

```tsx
  onChange: (patch: Partial<PurchaseFields>) => void;
}

/** Data, Doses, Valor total (R$) and Fornecedor, two by two. */
export function PurchaseInputs({ idPrefix, fields, onChange }: PurchaseInputsProps) {
```

**Replace** in `components/semen/semen-purchase-dialog.tsx`:

```tsx
        {totalHint ? <p className="text-xs text-ink-soft">{totalHint}</p> : null}
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-seller`}>Fornecedor</Label>
```

with:

```tsx
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-seller`}>Fornecedor</Label>
```

**Replace** in `components/semen/semen-purchase-dialog.tsx`:

```tsx
      <div className="grid gap-1">
        {doses !== null ? (
          <p className="text-sm text-ink-soft">
            {total !== null ? (
              <>
                <span className="font-mono text-ink">{formatCurrency(total / doses)}</span> por
                dose ·{" "}
              </>
            ) : null}
            estoque passa a <MonoDoses doses={left + doses} className="text-ink" />
          </p>
        ) : null}
        <p className="text-xs text-ink-soft">Vira despesa de Reprodução no Financeiro</p>
      </div>
```

with:

```tsx
      {doses !== null ? (
        <p className="text-sm text-ink-soft">
          {total !== null ? (
            <>
              <span className="font-mono text-ink">{formatCurrency(total / doses)}</span> por
              dose ·{" "}
            </>
          ) : null}
          estoque passa a <MonoDoses doses={left + doses} className="text-ink" />
        </p>
      ) : null}
```

- [ ] **Step 2: No hint or Financeiro gate left in Touros**

Run: `grep -rnE "Vira despesa|totalHint|\"finance\", \"edit\"|canEditFinance|canBuy" components/semen`
Expected: no output.

---

- [ ] **Step 5: Types and lint**

Run: `./node_modules/.bin/vitest run lib/api/domains/semen lib/api/__tests__/permissions.test.ts lib/domain/__tests__/semen.test.ts components/semen --exclude '**/worktrees/**'`
Expected: PASS

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "lib/api/domains/semen|lib/domain/semen|components/semen|lib/api/__tests__/permissions"`
Expected: no output. (The whole-project `tsc` still shows errors in other tasks' files until wave 3; none of them is this task's. Verified: after tasks 1–4 it is 72 errors in 28 files, task 2's Step 13 list minus `AddPurchase.useCase.ts`, `DeleteBull.useCase.ts`, `DeletePurchase.useCase.ts`.)

Run: `./node_modules/.bin/eslint lib/api/domains/semen lib/domain/semen.ts lib/domain/__tests__/semen.test.ts lib/api/__tests__/permissions.test.ts components/semen`
Expected: clean.

---

### Task 5: Domain readers

**Files:**
- Modify: `lib/domain/economics.ts`
- Modify: `lib/domain/lotEconomics.ts`
- Modify: `lib/domain/ledger.ts`
- Modify: `lib/domain/budget.ts`
- Modify: `lib/domain/planTree.ts` (replaced whole)
- Modify: `lib/reports/groups.ts` (replaced whole)
- Modify: `lib/export/datasets/finance.ts`
- Test: `lib/domain/__tests__/economics.test.ts`, `lib/domain/__tests__/lotEconomics.test.ts`, `lib/domain/__tests__/ledger.test.ts`, `lib/domain/__tests__/budget.test.ts`, `lib/domain/__tests__/planTree.test.ts` (replaced whole), `lib/reports/__tests__/groups.test.ts` (replaced whole), `lib/reports/__tests__/bankStatement.test.ts`, `lib/export/__tests__/finance.test.ts`
- No change: `lib/reports/bankStatement.ts` (it reads `PlanInputs` and `LedgerRow.groupLabel` only; the rename reaches it through `LedgerInputs`), `lib/store/dashboard.ts` and `lib/store/__tests__/dashboard.test.ts` (the Painel's agenda/herd helpers build no `EconomicsInputs`/`LedgerInputs`; the dashboard page does, in task 6).

**Interfaces:**
- Consumes (task 1): `GroupKind`, `PlanGroup`, `Expense.category?: ExpenseCategory`, `GROUP_KINDS`, `GROUP_KIND_LABEL`, `groupsOf(groups, kind, { archived?, keep? })`, `groupLabel(id, groups)`, `groupKind(id, groups)` from `@/lib/domain/groups`; `entryGroup(e)` returning `e.category ?? null`; `isCapitalKind`, `ENTRY_KIND_LABEL` from `@/lib/domain/entries`. (task 3) `accountsByGroup(accounts, includeArchived)` with no pre-filled keys — wave 2 runs task 3 before this task.
- Produces (task 6 codes against these exactly):
  - `economics.ts`: `EconomicsInputs { animals; manejoSessions; movements; expenses; invernadas; lots }`; `monthlyRevenueCost(movements, expenses, months, refIso)`; `costBreakdownBetween(expenses, startIso, endIso)`; `costBreakdown(expenses, refIso, months)` (note the order); `coe(expenses, period)`; `isCostedTreatment` gone. `CostBreakdownSlice.category` is a grupo id.
  - `lotEconomics(input: EconomicsInputs, period, quote, todayIso)` unchanged signature; the cost is the despesas only.
  - `ledger.ts`: `LedgerKind = EntryKind | "sale" | "purchase"`; `LedgerInputs { expenses; accounts; movements; manejoSessions; animals; lots; planGroups: readonly PlanGroup[] }`; `cashSummary(input: Pick<LedgerInputs, "expenses" | "movements">, period, todayIso)`; `LedgerRow.group` a grupo id, `"capital"` for a rendimento and a compra de gado, `"revenue"` (no grupo) for a venda de gado; a venda's `groupLabel` is `GROUP_KIND_LABEL.revenue`, a compra's `GROUP_KIND_LABEL.investment`, a rendimento's `"Rendimento"`.
  - `budget.ts`: `BudgetInputs { budgets; expenses; accounts; planGroups: readonly PlanGroup[] }`; `budgetView`, `previousShape`, `copyPlan` keep their signatures.
  - `planTree.ts`: `PlanNode` with `{ type: "kind"; kind: GroupKind }` and `{ type: "group"; id: string }` as pinned; `nodeParam`, `parseNode`, `legacyNode({ tipo, grupo, conta })` (grupo ignored); `planTree`, `nodeRows`, `nodeSummary`, `capitalSummary`, `filterPaneRows`, `debtBalance`, `fold` keep their signatures; `entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[], planGroups: readonly PlanGroup[]): EntryInitial` (kind nó → `{ kind }`, plus `flow: "out"` on a capital kind; grupo nó → `{ kind, category }`; conta nó → `{ kind, category, accountId }`; `{}` when the grupo or conta is gone). `PlanInputs extends LedgerInputs` so it carries `planGroups`.
  - `reports/groups.ts`: `GroupLine { key; label; amountBrl; accounts: ReportLine[]; locked?: boolean }` (no `custom`); `GroupsReport { revenues: GroupLine[]; revenueTotal; expenses: GroupLine[]; expenseTotal; balance; capital: CapitalLine[] }`; `revenues[0]` is `{ key: "venda-de-gado", label: "Venda de gado", locked: true, accounts: [] }` when the sales are not 0. `TREATMENTS` gone; `ReportLine` unchanged (its `locked` is now false on every receita/despesa line).
  - `export/datasets/finance.ts`: `expensesExportTable(expenses: readonly Expense[], title: string, planGroups: readonly PlanGroup[])` (title no longer defaulted).

- [ ] **Step 1: Write the failing test (economics, lotEconomics)**

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  Treatment,
} from "@/lib/types";
import { makeAnimal, makeManejoSession } from "./fixtures";
```

with

```ts
} from "@/lib/types";
import { makeAnimal, makeManejoSession, makeTreatment } from "./fixtures";
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
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
```

with

```ts
  amountBrl: 500,
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
];

const treatments: Treatment[] = [
  treatment({ animalEarTag: "A", date: "2026-03-01", costBrl: 50 }),
  treatment({ id: "t-2", status: "scheduled", date: "2026-03-01", costBrl: 30 }),
```

with

```ts
  // A vacina typed by hand in Sanidade: the only way its cost reaches the COE.
  expense({ id: "e-5", date: "2026-03-01", category: "health", amountBrl: 50 }),
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  movements,
  treatments,
```

with

```ts
  movements,
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  movements: [],
  treatments: [],
```

with

```ts
  movements: [],
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  it("buckets priced sales, expenses and done treatment costs by month", () => {
```

with

```ts
  it("buckets priced sales and despesas by month", () => {
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
      ],
      [treatment({ date: "2026-06-15", costBrl: 100 })],
```

with

```ts
      ],
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 8000, cost: 600 });
```

with

```ts
    expect(series[1]).toMatchObject({ date: "2026-06-01", revenue: 8000, cost: 500 });
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    const series = monthlyRevenueCost([movement({ amountBrl: undefined })], [], [], 3, REF);
```

with

```ts
    const series = monthlyRevenueCost([movement({ amountBrl: undefined })], [], 3, REF);
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    const series = monthlyRevenueCost(
      [],
```

with

```ts
    const series = monthlyRevenueCost(
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  it("splits by category, folding done treatments into health", () => {
```

with

```ts
  it("splits the despesas by grupo", () => {
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
      ],
      [treatment({ costBrl: 100 })],
      12,
      REF
```

with

```ts
        expense({ id: "e-3", category: "health", amountBrl: 100 }),
      ],
      REF,
      12
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    expect(costBreakdown([], [treatment({ status: "scheduled" })], 12, REF)).toEqual([]);
```

with

```ts
    expect(costBreakdown([], REF, 12)).toEqual([]);
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
        [],
        12,
        REF
```

with

```ts
        REF,
        12
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
  it("sums despesas by date (paid or not) and done treatment costs, never receitas", () => {
    expect(coe(expenses, treatments, P)).toBe(4050);
    expect(coe([], [], P)).toBe(0);
```

with

```ts
  it("sums despesas by date (paid or not), never receitas", () => {
    expect(coe(expenses, P)).toBe(4050);
    expect(coe([], P)).toBe(0);
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    expect(coe(withOutside, treatments, P)).toBe(4050);
```

with

```ts
    expect(coe(withOutside, P)).toBe(4050);
```

`lib/domain/__tests__/economics.test.ts` — **Replace**

```ts
    expect(monthlyRevenueCost(movements, treatments, withOutside, 6, REF)).toEqual(
      monthlyRevenueCost(movements, treatments, expenses, 6, REF)
    );
    expect(costBreakdown(withOutside, treatments, 12, REF)).toEqual(costBreakdown(expenses, treatments, 12, REF));
```

with

```ts
    expect(monthlyRevenueCost(movements, withOutside, 6, REF)).toEqual(monthlyRevenueCost(movements, expenses, 6, REF));
    expect(costBreakdown(withOutside, REF, 12)).toEqual(costBreakdown(expenses, REF, 12));
  });
});

describe("a tratamento with cost", () => {
  it("stays out of the COE and the Placar, even when the farm's data carries it", () => {
    // The store's data has the tratamentos; handed in whole, they still count for nothing.
    const withTreatments = {
      ...input,
      treatments: [makeTreatment({ animalEarTag: "A", date: "2026-03-01", status: "done", costBrl: 999 })],
    };
    expect(indicators(withTreatments, P, 300, TODAY)).toEqual(indicators(input, P, 300, TODAY));
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
import type { Animal, Expense, ManejoSession, ManejoSessionAnimal, Treatment } from "@/lib/types";
```

with

```ts
import type { Animal, Expense, ManejoSession, ManejoSessionAnimal } from "@/lib/types";
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
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
```

with

```ts
});
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
];

const treatments: Treatment[] = [
  cost("A1", 40),
  cost("B1", 60),
  cost("B2", 99, { id: "t-B2-scheduled", status: "scheduled" }),
```

with

```ts
  // Vacinas typed in Sanidade with the lote.
  expense({ id: "e-vac-a", lotId: "lot-a", category: "health", date: "2026-03-01", amountBrl: 40 }),
  expense({ id: "e-vac-b", lotId: "lot-b", category: "health", date: "2026-03-01", amountBrl: 60 }),
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
  movements: [],
  treatments,
```

with

```ts
  movements: [],
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
    // A: 1000 + A1's 40; B: B1's 60; C: 300. Shared pool 2000 → 3/5 and 2/5.
```

with

```ts
    // A: 1000 + its vacina 40; B: its vacina 60; C: 300. Shared pool 2000 → 3/5 and 2/5.
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
    const total = coe(expenses, treatments, P);
```

with

```ts
    const total = coe(expenses, P);
```

`lib/domain/__tests__/lotEconomics.test.ts` — **Replace**

```ts
    const noHerd = lotEconomics({ ...input, animals: [], treatments: [] }, P, QUOTE, TODAY);
    expect(noHerd.lots.map((l) => [l.name, l.sharedBrl])).toEqual([
      ["Lote A", 0],
      ["Lote C", 0],
    ]);
    expect(noHerd.farm).toMatchObject({ heads: 0, totalBrl: 3300, perHeadDay: null });
```

with

```ts
    const noHerd = lotEconomics({ ...input, animals: [] }, P, QUOTE, TODAY);
    expect(noHerd.lots.map((l) => [l.name, l.sharedBrl])).toEqual([
      ["Lote A", 0],
      ["Lote B", 0],
      ["Lote C", 0],
    ]);
    expect(noHerd.farm).toMatchObject({ heads: 0, totalBrl: 3400, perHeadDay: null });
  });

  it("leaves a tratamento's cost out of its lote and of the Fazenda row", () => {
    // The store's data has the tratamentos; handed in whole, they still count for nothing.
    const withTreatments = {
      ...input,
      treatments: [makeTreatment({ animalEarTag: "A1", date: "2026-03-01", status: "done", costBrl: 999 })],
    };
    expect(lotEconomics(withTreatments, P, QUOTE, TODAY)).toEqual(lotEconomics(input, P, QUOTE, TODAY));
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `coe`, `costBreakdown` and `monthlyRevenueCost` still take `treatments` (TypeError: not iterable / wrong totals), and `lotEconomics` iterates the missing `input.treatments`.

- [ ] **Step 3: Implement**

`lib/domain/economics.ts` — **Replace**

```ts
 * - COE = despesas (`isCost`, paid or not) + DONE treatments' `costBrl`.
```

with

```ts
 * - COE = despesas (`isCost`, paid or not). A tratamento's cost stays in
 *   Sanidade and never reaches it.
```

`lib/domain/economics.ts` — **Replace**

```ts
  Movement,
  Treatment,
```

with

```ts
  Movement,
```

`lib/domain/economics.ts` — **Replace**

```ts
/** One slice of the cost breakdown. */
```

with

```ts
/** One slice of the cost breakdown: a grupo de despesa. */
```

`lib/domain/economics.ts` — **Replace**

```ts
  movements: Movement[];
  treatments: Treatment[];
```

with

```ts
  movements: Movement[];
```

`lib/domain/economics.ts` — **Replace**

```ts

/** A done treatment with a recorded cost (the "health" cost rows). */
const isCostedTreatment = (t: Treatment): t is Treatment & { costBrl: number } =>
  t.status === "done" && t.costBrl !== undefined;

/**
```

with

```ts

/**
```

`lib/domain/economics.ts` — **Replace**

```ts
  movements: Movement[],
  treatments: Treatment[],
```

with

```ts
  movements: Movement[],
```

`lib/domain/economics.ts` — **Replace**

```ts
  }
  for (const t of treatments) {
    if (!isCostedTreatment(t)) continue;
    const bucket = buckets.get(t.date.slice(0, 7));
    if (bucket) bucket.cost += t.costBrl;
  }
```

with

```ts
  }
```

`lib/domain/economics.ts` — **Replace**

```ts
 * Cost split by category between two ISO dates (both inclusive): the
 * despesas, and the done treatments' costs in the "health" bucket. Zero
 * slices are dropped; empty array when there is no cost at all.
 */
export function costBreakdownBetween(
  expenses: Expense[],
  treatments: Treatment[],
```

with

```ts
 * Cost split by grupo between two ISO dates (both inclusive): the despesas.
 * Zero slices are dropped; empty array when there is no cost at all.
 */
export function costBreakdownBetween(
  expenses: Expense[],
```

`lib/domain/economics.ts` — **Replace**

```ts
    if (isCost(e) && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && t.date >= startIso && t.date <= endIso) {
      add("health", t.costBrl);
    }
```

with

```ts
    // A despesa always has its grupo; the check only narrows the type.
    if (isCost(e) && e.category !== undefined && e.date >= startIso && e.date <= endIso) add(e.category, e.amountBrl);
```

`lib/domain/economics.ts` — **Replace**

```ts
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
    if (isCost(e) && inPeriod(e.date, period)) total += e.amountBrl;
  }
  for (const t of treatments) {
    if (isCostedTreatment(t) && inPeriod(t.date, period)) total += t.costBrl;
```

with

```ts
export function costBreakdown(expenses: Expense[], refIso: string, months: number): CostBreakdownSlice[] {
  return costBreakdownBetween(expenses, monthStart(refIso, months - 1), refIso);
}

/** COE of the window: despesas by `date`, paid or pending. */
export function coe(expenses: Expense[], period: Period): number {
  let total = 0;
  for (const e of expenses) {
    if (isCost(e) && inPeriod(e.date, period)) total += e.amountBrl;
```

`lib/domain/economics.ts` — **Replace**

```ts
  const { animals, manejoSessions, movements, treatments, expenses, invernadas } = input;
```

with

```ts
  const { animals, manejoSessions, movements, expenses, invernadas } = input;
```

`lib/domain/economics.ts` — **Replace**

```ts
  const cost = coe(expenses, treatments, period);
```

with

```ts
  const cost = coe(expenses, period);
```

`lib/domain/lotEconomics.ts` — **Replace**

```ts
  /** Despesas with the lote + treatments of its animals. */
```

with

```ts
  /** Despesas with the lote. */
```

`lib/domain/lotEconomics.ts` — **Replace**

```ts
  const { animals, manejoSessions, expenses, treatments } = input;
  const days = periodDays(period);

  const direct = new Map<string, number>();
  const addDirect = (lotId: string | undefined, amount: number): void => {
    if (lotId !== undefined) direct.set(lotId, (direct.get(lotId) ?? 0) + amount);
  };
  for (const e of expenses) {
    if (isCost(e) && inPeriod(e.date, period)) addDirect(e.lotId, e.amountBrl);
  }
  const lotOf = new Map(animals.map((a) => [a.earTag, a.lotId]));
  for (const t of treatments) {
    if (t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)) {
      addDirect(lotOf.get(t.animalEarTag), t.costBrl);
```

with

```ts
  const { animals, manejoSessions, expenses } = input;
  const days = periodDays(period);

  const direct = new Map<string, number>();
  for (const e of expenses) {
    if (isCost(e) && e.lotId !== undefined && inPeriod(e.date, period)) {
      direct.set(e.lotId, (direct.get(e.lotId) ?? 0) + e.amountBrl);
```

`lib/domain/lotEconomics.ts` — **Replace**

```ts
  const totalCost = coe(expenses, treatments, period);
```

with

```ts
  const totalCost = coe(expenses, period);
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 5: Write the failing test (ledger)**

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
import type { Account, Expense, ExpenseGroup, Lot, Movement } from "@/lib/types";
```

with

```ts
import type { Account, Expense, GroupKind, Lot, Movement, PlanGroup } from "@/lib/types";
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
const TREATMENT_ID = "treatment:2026-09-08:Vacina aftosa";
```

with

```ts

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...(archivedAt && { archivedAt }),
});

const planGroups: PlanGroup[] = [
  group("receitas", "revenue", "Receitas"),
  group("nutrition", "expense", "Nutrição"),
  group("pasture", "expense", "Pastagem"),
  group("labor", "expense", "Mão de obra"),
  group("admin", "expense", "Administrativo"),
  group("other", "expense", "Outros"),
  group("investimentos", "investment", "Investimentos"),
  group("financiamentos", "financing", "Financiamentos"),
  group("socios", "partners", "Sócios"),
];
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  { id: "acc-aluguel", group: "revenue", name: "Aluguel de pasto" },
```

with

```ts
  { id: "acc-aluguel", group: "receitas", name: "Aluguel de pasto" },
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
    kind: "revenue",
    date: "2026-09-12",
```

with

```ts
    kind: "revenue",
    category: "receitas",
    date: "2026-09-12",
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
    kind: "revenue",
    date: "2026-09-18",
```

with

```ts
    kind: "revenue",
    category: "receitas",
    date: "2026-09-18",
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts

const treatments = [
  makeTreatment({ id: "t-1", animalEarTag: "BR-101", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-2", animalEarTag: "BR-102", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-3", animalEarTag: "BR-201", date: "2026-09-08", status: "done", costBrl: 5 }),
  makeTreatment({ id: "t-4", animalEarTag: "BR-202", date: "2026-09-08", status: "done" }),
  makeTreatment({ id: "t-5", animalEarTag: "BR-101", date: "2026-09-28", status: "scheduled", costBrl: 5 }),
];

const input: LedgerInputs = {
```

with

```ts

const input: LedgerInputs = {
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  treatments,
  lots,
  expenseGroups: [],
```

with

```ts
  lots,
  planGroups,
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  it("lists the window's lançamentos, vendas, compras and treatment days, newest first", () => {
```

with

```ts
  it("lists the window's lançamentos, vendas and compras, newest first", () => {
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
      "e-paid-lot",
      TREATMENT_ID,
```

with

```ts
      "e-paid-lot",
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  it("leaves out entries dated outside the window, unpriced movements, transfers and treatments without cost", () => {
```

with

```ts
  it("leaves out entries dated outside the window, unpriced movements and transfers", () => {
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
      "e-paid-lot": "paid",
      [TREATMENT_ID]: "paid",
```

with

```ts
      "e-paid-lot": "paid",
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
      kind: "revenue",
      group: "revenue",
```

with

```ts
      kind: "revenue",
      group: "receitas",
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
        expenses: [],
        treatments: [],
```

with

```ts
        expenses: [],
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  it("sums a day's done treatments with cost into one Sanidade row", () => {
    expect(row(TREATMENT_ID)).toEqual({
      id: TREATMENT_ID,
      kind: "treatment",
      inflow: false,
      date: "2026-09-08",
      dueDate: "2026-09-08",
      paidAt: "2026-09-08",
      status: "paid",
      group: "health",
      groupLabel: "Sanidade",
      account: null,
      bankAccountId: null,
      history: null,
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
```

with

```ts
  it("writes no row for a tratamento with cost: it stays in Sanidade", () => {
    // The store's data has the tratamentos; handed in whole, they still make no line.
    const withTreatments = {
      ...input,
      treatments: [makeTreatment({ animalEarTag: "BR-101", date: "2026-09-08", status: "done", costBrl: 5 })],
    };
    expect(ledgerRows(withTreatments, PERIOD, TODAY)).toEqual(rows);
    expect(cashSummary(withTreatments, PERIOD, TODAY)).toEqual(cashSummary(input, PERIOD, TODAY));
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
  it("names a farm grupo, archived or not, and reads Grupo removido for a grupo that is gone", () => {
    const groups: ExpenseGroup[] = [
      { id: "g-maq", name: "Máquinas e veículos", archivedAt: "2026-09-15T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z" },
    ];
    const farmRows = ledgerRows(
      {
        ...input,
        expenseGroups: groups,
```

with

```ts
  it("names a grupo, archived or not, and reads Grupo removido for a grupo that is gone", () => {
    const farmRows = ledgerRows(
      {
        ...input,
        planGroups: [...planGroups, group("g-maq", "expense", "Máquinas e veículos", "2026-09-15T00:00:00.000Z")],
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
      paid: 12615, // 1.200 + 3.000 + 400 (dated June, paid July) + treatments 15 + compra 8.000
      payable: 1300,
      payableCount: 2,
      overdueCount: 1,
      balance: 5265,
```

with

```ts
      paid: 12600, // 1.200 + 3.000 + 400 (dated June, paid July) + compra 8.000
      payable: 1300,
      payableCount: 2,
      overdueCount: 1,
      balance: 5280,
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
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
```

with

```ts
    { id: "acc-maq", group: "investimentos", name: "Máquinas e implementos" },
    { id: "acc-pronaf", group: "financiamentos", name: "Pronaf custeio" },
    { id: "acc-lucro", group: "socios", name: "Distribuição de lucro" },
  ];
  const investment = { kind: "investment", category: "investimentos", accountId: "acc-maq" } as const;
  const financing = { kind: "financing", category: "financiamentos", accountId: "acc-pronaf" } as const;
  const partners = { kind: "partners", category: "socios", accountId: "acc-lucro" } as const;
  const capital: Expense[] = [
    expense({ id: "c-trator", ...investment, flow: "out", date: "2026-09-10", amountBrl: 50000, paidAt: "2026-09-10" }),
    expense({ id: "c-sucata", ...investment, flow: "in", date: "2026-09-11", amountBrl: 2000, paidAt: "2026-09-11" }),
    // Pending, due after today: a receber.
    expense({ id: "c-liberacao", ...financing, flow: "in", date: "2026-09-20", dueDate: "2026-10-05", amountBrl: 80000 }),
    // Pending, past due: vencida.
    expense({ id: "c-parcela", ...financing, flow: "out", date: "2026-09-05", dueDate: "2026-09-15", amountBrl: 4000 }),
    expense({ id: "c-retirada", ...partners, flow: "out", date: "2026-09-12", amountBrl: 6000, paidAt: "2026-09-12" }),
    expense({ id: "c-aporte", ...partners, flow: "in", date: "2026-09-13", amountBrl: 10000, paidAt: "2026-09-13" }),
    // No flow: a compra (money out), pending and past its date.
    expense({ id: "c-sem-flow", ...investment, date: "2026-09-14", amountBrl: 700 }),
    // A rendimento as the API maps it: no grupo at all.
    { id: "c-rendimento", kind: "yield", date: "2026-09-22", amountBrl: 312.5, paidAt: "2026-09-22", bankAccountId: "aplic" },
  ];
  const capitalInput: LedgerInputs = { ...input, expenses: capital, accounts: capitalAccounts, movements: [] };
```

`lib/domain/__tests__/ledger.test.ts` — **Replace**

```ts
      ["c-liberacao", "financing", true, "financing", "Financiamentos", "Pronaf custeio", "receivable"],
      ["c-sem-flow", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "overdue"],
      ["c-aporte", "partners", true, "partners", "Sócios", "Distribuição de lucro", "received"],
      ["c-retirada", "partners", false, "partners", "Sócios", "Distribuição de lucro", "paid"],
      ["c-sucata", "investment", true, "investment", "Investimentos", "Máquinas e implementos", "received"],
      ["c-trator", "investment", false, "investment", "Investimentos", "Máquinas e implementos", "paid"],
      ["c-parcela", "financing", false, "financing", "Financiamentos", "Pronaf custeio", "overdue"],
```

with

```ts
      ["c-liberacao", "financing", true, "financiamentos", "Financiamentos", "Pronaf custeio", "receivable"],
      ["c-sem-flow", "investment", false, "investimentos", "Investimentos", "Máquinas e implementos", "overdue"],
      ["c-aporte", "partners", true, "socios", "Sócios", "Distribuição de lucro", "received"],
      ["c-retirada", "partners", false, "socios", "Sócios", "Distribuição de lucro", "paid"],
      ["c-sucata", "investment", true, "investimentos", "Investimentos", "Máquinas e implementos", "received"],
      ["c-trator", "investment", false, "investimentos", "Investimentos", "Máquinas e implementos", "paid"],
      ["c-parcela", "financing", false, "financiamentos", "Financiamentos", "Pronaf custeio", "overdue"],
```

- [ ] **Step 6: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/ledger.test.ts --exclude '**/worktrees/**'`
Expected: FAIL at load ("no tests"): `TypeError: Cannot read properties of undefined (reading 'find')` in `groupLabel` — `ledger.ts` still reads `input.expenseGroups` (the test passes `planGroups`); it also still imports `TOP_GROUP_LABEL` and `BUILTIN_CATEGORY_LABEL`, which task 1 deleted (undefined at run time), and iterates `input.treatments`.

- [ ] **Step 7: Implement**

`lib/domain/ledger.ts` — **Replace**

```ts
 * typed by hand plus the rows derived from the manejos (vendas, compras) and
 * from the treatments with cost, which are locked — with the caixa and the
 * pending bills. Pure.
```

with

```ts
 * typed by hand plus the rows derived from the manejos (vendas, compras),
 * which are locked — with the caixa and the pending bills. A tratamento's cost
 * stays in Sanidade and is no line here. Pure.
```

`lib/domain/ledger.ts` — **Replace**

```ts
  Expense,
  ExpenseGroup,
```

with

```ts
  Expense,
```

`lib/domain/ledger.ts` — **Replace**

```ts
  Treatment,
} from "@/lib/types";
import { inPeriod, type Period } from "@/lib/domain/period";
import { accountName } from "@/lib/domain/accounts";
import { TOP_GROUP_LABEL, groupLabel } from "@/lib/domain/groups";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
```

with

```ts
  PlanGroup,
} from "@/lib/types";
import { inPeriod, type Period } from "@/lib/domain/period";
import { accountName } from "@/lib/domain/accounts";
import { GROUP_KIND_LABEL, groupLabel } from "@/lib/domain/groups";
```

`lib/domain/ledger.ts` — **Replace**

```ts
export type LedgerKind = EntryKind | "sale" | "purchase" | "treatment";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";

export interface LedgerRow {
  /** Expense id | movement id | `treatment:${date}:${name}`. */
```

with

```ts
export type LedgerKind = EntryKind | "sale" | "purchase";
export type LedgerStatus = "paid" | "received" | "payable" | "receivable" | "overdue";

export interface LedgerRow {
  /** Expense id | movement id. */
```

`lib/domain/ledger.ts` — **Replace**

```ts
  /** The grupo of the plano; "capital" for what has none: compras de gado and rendimentos. */
```

with

```ts
  /** The grupo of the plano (a PlanGroup id); "capital" for what has none: compras de gado and rendimentos. A venda de gado reads "revenue". */
```

`lib/domain/ledger.ts` — **Replace**

```ts
  /** The lançamento's histórico; null on manejo and treatment rows. */
```

with

```ts
  /** The lançamento's histórico; null on manejo rows. */
```

`lib/domain/ledger.ts` — **Replace**

```ts
  /** The lançamento's observação; the treatment's name on a treatment row. */
  notes: string | null;
  /** Derived from a manejo or a treatment: not editable here. */
```

with

```ts
  /** The lançamento's observação. */
  notes: string | null;
  /** Derived from a manejo: not editable here. */
```

`lib/domain/ledger.ts` — **Replace**

```ts
  treatments: Treatment[];
  lots: Lot[];
  /** The farm's grupos de despesa, archived ones included: they name the rows. */
  expenseGroups: readonly ExpenseGroup[];
```

with

```ts
  lots: Lot[];
  /** Every grupo of the plano, archived ones included: they name the rows. */
  planGroups: readonly PlanGroup[];
```

`lib/domain/ledger.ts` — **Replace**

```ts
  purchase: 7,
  treatment: 8,
```

with

```ts
  purchase: 7,
```

`lib/domain/ledger.ts` — **Replace**

```ts
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, input.expenseGroups),
```

with

```ts
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, input.planGroups),
```

`lib/domain/ledger.ts` — **Replace**

```ts
      groupLabel: sale ? TOP_GROUP_LABEL.revenue : TOP_GROUP_LABEL.investment,
```

with

```ts
      groupLabel: sale ? GROUP_KIND_LABEL.revenue : GROUP_KIND_LABEL.investment,
```

`lib/domain/ledger.ts` — **Replace**

```ts
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
      inflow: false,
      date: day.date,
      dueDate: day.date,
      paidAt: day.date,
      status: "paid",
      group: "health",
      groupLabel: BUILTIN_CATEGORY_LABEL.health,
      account: null,
      bankAccountId: null,
      history: null,
      counterparty: null,
      document: null,
      lotId: null,
      lotName: null,
      amountBrl: day.amount,
      notes: day.name,
      locked: true,
      headCount: day.heads,
```

with

```ts
      headCount: session ? done.length : (m.quantity ?? null),
```

`lib/domain/ledger.ts` — **Replace**

```ts
 * vendas, compras de gado and treatment costs by their date); a receber / a
 * pagar are the pending lançamentos of any date. Every kind counts by its
```

with

```ts
 * vendas and compras de gado by their date); a receber / a pagar are the
 * pending lançamentos of any date. Every kind counts by its
```

`lib/domain/ledger.ts` — **Replace**

```ts
  input: Pick<LedgerInputs, "expenses" | "movements" | "treatments">,
```

with

```ts
  input: Pick<LedgerInputs, "expenses" | "movements">,
```

`lib/domain/ledger.ts` — **Replace**

```ts
  }
  for (const t of input.treatments) {
    if (t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)) {
      s.paid += t.costBrl;
    }
  }
```

with

```ts
  }
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/ledger.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 9: Write the failing test (budget)**

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
import type { Account, Budget, Expense, ExpenseCategory, ExpenseGroup } from "@/lib/types";
```

with

```ts
import type { Account, Budget, Expense, ExpenseCategory, GroupKind, PlanGroup } from "@/lib/types";
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
import { makeTreatment } from "./fixtures";
```

with

```ts
import { makeTreatment } from "./fixtures";

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2025-01-01T00:00:00.000Z",
  ...(archivedAt && { archivedAt }),
});

/** The farm's grupos de despesa, and one of receita that the Orçamento never lists. */
const GROUPS: PlanGroup[] = [
  group("nutrition", "expense", "Nutrição"),
  group("pasture", "expense", "Pastagem"),
  group("labor", "expense", "Mão de obra"),
  group("health", "expense", "Sanidade"),
  group("breeding", "expense", "Reprodução"),
  group("admin", "expense", "Administrativo"),
  group("other", "expense", "Outros"),
  group("receitas", "revenue", "Receitas"),
];
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
// Administrativo on the grupo only; Sanidade has a treatment cost and no orçado.
```

with

```ts
// Administrativo on the grupo only; Sanidade has a despesa and no orçado.
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    expense("aluguel", { kind: "revenue", category: "other", date: "2026-01-10", amountBrl: 8000 }),
  ],
  treatments: [
    makeTreatment({ id: "vac", date: "2025-11-20", status: "done", costBrl: 150 }),
    makeTreatment({ id: "agendada", date: "2026-01-05", status: "scheduled", costBrl: 80 }),
    makeTreatment({ id: "sem-custo", date: "2025-12-01", status: "done" }),
  ],
  expenseGroups: [],
};

const view = budgetView(INPUTS, 2025, 10, TODAY);
const group = (category: ExpenseCategory) => view.groups.find((g) => g.category === category)!;
const nutrition = group("nutrition");
```

with

```ts
    expense("aluguel", { kind: "revenue", category: "receitas", date: "2026-01-10", amountBrl: 8000 }),
    expense("vac", { category: "health", date: "2025-11-20", amountBrl: 150 }),
  ],
  planGroups: GROUPS,
};

const view = budgetView(INPUTS, 2025, 10, TODAY);
const budgetGroup = (category: ExpenseCategory) => view.groups.find((g) => g.category === category)!;
const nutrition = budgetGroup("nutrition");
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
  it("puts done treatment costs under Sanidade, without orçado", () => {
    const health = group("health");
```

with

```ts
  it("lists a grupo with despesas and no orçado", () => {
    const health = budgetGroup("health");
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
  it("never counts an investimento or a receita", () => {
```

with

```ts
  it("never counts a tratamento's cost, even when the farm's data carries it", () => {
    // The store's data has the tratamentos; handed in whole, they still count for nothing.
    const withTreatments = { ...INPUTS, treatments: [makeTreatment({ date: "2025-12-01", status: "done", costBrl: 999 })] };
    expect(budgetView(withTreatments, 2025, 10, TODAY)).toEqual(view);
  });

  it("never counts an investimento or a receita, nor lists a grupo of receita", () => {
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    expect(group("admin").accountsSum).toBeNull();
```

with

```ts
    expect(budgetGroup("admin").accountsSum).toBeNull();
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
      { budgets: [row("pasture", "2025-10", 700), row("pasture", "2026-09", 300)], expenses: [], treatments: [], accounts: [], expenseGroups: [] },
```

with

```ts
      { budgets: [row("pasture", "2025-10", 700), row("pasture", "2026-09", 300)], expenses: [], accounts: [], planGroups: GROUPS },
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    const inputs: BudgetInputs = { budgets: budgetLine("admin", 500), expenses: [], treatments: [], accounts: [], expenseGroups: [] };
```

with

```ts
    const inputs: BudgetInputs = { budgets: budgetLine("admin", 500), expenses: [], accounts: [], planGroups: GROUPS };
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    expect(group("admin").forecast).toBe(2000 + 1000 + 7 * 500);
```

with

```ts
    expect(budgetGroup("admin").forecast).toBe(2000 + 1000 + 7 * 500);
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
        expenses: [expense("p", { category: "pasture", date: "2025-10-01", amountBrl: spent })],
        treatments: [],
        accounts: [],
        expenseGroups: [],
```

with

```ts
        expenses: [expense("p", { category: "pasture", date: "2025-10-01", amountBrl: spent })],
        accounts: [],
        planGroups: GROUPS,
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    // Pastagem and Administrativo budgeted 100 each; Sanidade's treatments have no orçado.
```

with

```ts
    // Pastagem and Administrativo budgeted 100 each; Sanidade has no orçado.
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
        ],
        treatments: [makeTreatment({ id: "vac", date: "2025-10-05", status: "done", costBrl: 500 })],
        accounts: [],
        expenseGroups: [],
```

with

```ts
          expense("vac", { category: "health", date: "2025-10-05", amountBrl: 500 }),
        ],
        accounts: [],
        planGroups: GROUPS,
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
        expenses: spent.map(([category, amountBrl]) => expense(category, { category, amountBrl })),
        treatments: [],
        accounts: [],
        expenseGroups: [],
```

with

```ts
        expenses: spent.map(([category, amountBrl]) => expense(category, { category, amountBrl })),
        accounts: [],
        planGroups: GROUPS,
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
describe("budgetView with the farm's grupos", () => {
  const groups: ExpenseGroup[] = [
    { id: "g-maq", name: "Máquinas e veículos", createdAt: "2025-08-01T00:00:00.000Z" },
    { id: "g-arr", name: "Arrendamento", archivedAt: "2026-01-05T00:00:00.000Z", createdAt: "2025-07-01T00:00:00.000Z" },
    { id: "g-old", name: "Grupo velho", archivedAt: "2025-06-01T00:00:00.000Z", createdAt: "2025-01-01T00:00:00.000Z" },
```

with

```ts
describe("budgetView with archived grupos", () => {
  const groups: PlanGroup[] = [
    group("g-maq", "expense", "Máquinas e veículos"),
    group("g-arr", "expense", "Arrendamento", "2026-01-05T00:00:00.000Z"),
    group("g-old", "expense", "Grupo velho", "2025-06-01T00:00:00.000Z"),
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    treatments: [],
    accounts: [{ id: "maq-diesel", group: "g-maq", name: "Diesel" }],
    expenseGroups: groups,
  };

  it("lists them among the seven alphabetically, an archived one while it has orçado or despesas in the safra", () => {
```

with

```ts
    accounts: [{ id: "maq-diesel", group: "g-maq", name: "Diesel" }],
    planGroups: groups,
  };

  it("lists them by name, an archived one while it has orçado or despesas in the safra", () => {
```

`lib/domain/__tests__/budget.test.ts` — **Replace**

```ts
    const inputs: BudgetInputs = { budgets: budgetLine("pasture", distribute(100, "equal")), expenses: [], treatments: [], accounts: [], expenseGroups: [] };
```

with

```ts
    const inputs: BudgetInputs = { budgets: budgetLine("pasture", distribute(100, "equal")), expenses: [], accounts: [], planGroups: GROUPS };
```

- [ ] **Step 10: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/budget.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `budget.ts` still imports `despesaGroups` (deleted by task 1) and iterates `inputs.treatments`.

- [ ] **Step 11: Implement**

`lib/domain/budget.ts` — **Replace**

```ts
import type {
  Account,
  Budget,
  BudgetDistribution,
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  Treatment,
} from "@/lib/types";
```

with

```ts
import type { Account, Budget, BudgetDistribution, Expense, ExpenseCategory, PlanGroup } from "@/lib/types";
```

`lib/domain/budget.ts` — **Replace**

```ts
import { despesaGroups } from "@/lib/domain/groups";
```

with

```ts
import { groupsOf } from "@/lib/domain/groups";
```

`lib/domain/budget.ts` — **Replace**

```ts
  /** despesaGroups order, archived farm grupos too; grupos with neither orçado nor despesas in the safra left out. */
```

with

```ts
  /** The grupos de despesa by name, archived ones too; grupos with neither orçado nor despesas in the safra left out. */
```

`lib/domain/budget.ts` — **Replace**

```ts
  treatments: Treatment[];
  accounts: Account[];
  /** The farm's grupos de despesa, archived ones included. */
  expenseGroups: readonly ExpenseGroup[];
```

with

```ts
  accounts: Account[];
  /** Every grupo of the plano, archived ones included; only the despesa ones are budgeted. */
  planGroups: readonly PlanGroup[];
```

`lib/domain/budget.ts` — **Replace**

```ts
 * the conta too. Done treatments' costs go under Sanidade, as in the COE.
```

with

```ts
 * the conta too.
```

`lib/domain/budget.ts` — **Replace**

```ts
    if (!isCost(e)) continue;
    add(lineKey(e.category), e.date, e.amountBrl);
    if (e.accountId) add(lineKey(e.category, e.accountId), e.date, e.amountBrl);
  }
  for (const t of inputs.treatments) {
    if (t.status === "done" && t.costBrl !== undefined) add(lineKey("health"), t.date, t.costBrl);
```

with

```ts
    // A despesa always has its grupo; the check only narrows the type.
    if (!isCost(e) || e.category === undefined) continue;
    add(lineKey(e.category), e.date, e.amountBrl);
    if (e.accountId) add(lineKey(e.category, e.accountId), e.date, e.amountBrl);
```

`lib/domain/budget.ts` — **Replace**

```ts
  for (const { key: category, label } of despesaGroups(inputs.expenseGroups, { archived: true })) {
```

with

```ts
  for (const { id: category, name: label } of groupsOf(inputs.planGroups, "expense", { archived: true })) {
```

`lib/domain/budget.ts` — **Replace**

```ts
 * farm grupo is not carried into `to` at all, nor are its contas' lines. Both
```

with

```ts
 * grupo is not carried into `to` at all, nor are its contas' lines. Both
```

`lib/domain/budget.ts` — **Replace**

```ts
  const archived = new Set(inputs.expenseGroups.filter((g) => g.archivedAt !== undefined).map((g) => g.id));
```

with

```ts
  const archived = new Set(inputs.planGroups.filter((g) => g.archivedAt !== undefined).map((g) => g.id));
```

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/budget.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 13: Write the failing test (planTree)**

`lib/domain/__tests__/planTree.test.ts` — **Replace the whole file with:**

```ts
import { describe, expect, it } from "vitest";
import type { Account, BankAccount, Expense, GroupKind, Movement, PlanGroup, Transfer } from "@/lib/types";
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
// archived caixa; the eleven grupos a farm starts with, contas in every tipo;
// lançamentos of every kind.
const TODAY = "2026-09-24";
const PERIOD = { start: "2026-07-01", end: "2026-09-30" };

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...(archivedAt && { archivedAt }),
});
const planGroups: PlanGroup[] = [
  group("receitas", "revenue", "Receitas"),
  group("nutrition", "expense", "Nutrição"),
  group("pasture", "expense", "Pastagem"),
  group("labor", "expense", "Mão de obra"),
  group("health", "expense", "Sanidade"),
  group("breeding", "expense", "Reprodução"),
  group("admin", "expense", "Administrativo"),
  group("other", "expense", "Outros"),
  group("investimentos", "investment", "Investimentos"),
  group("financiamentos", "financing", "Financiamentos"),
  group("socios", "partners", "Sócios"),
];

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
  { id: "inv-maq", group: "investimentos", name: "Máquinas e implementos" },
  { id: "inv-benf", group: "investimentos", name: "Benfeitorias" },
  { id: "fin-custeio", group: "financiamentos", name: "Custeio Sicredi" },
  { id: "fin-consorcio", group: "financiamentos", name: "Consórcio trator", openingBalanceBrl: 100000, openingDate: "2026-07-31" },
  { id: "soc-lucro", group: "socios", name: "Distribuição de lucro" },
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "hea-vac", group: "health", name: "Vacinas" },
  { id: "adm-tel", group: "admin", name: "Telefone", archivedAt: "2026-09-01T00:00:00.000Z" },
  { id: "rev-aluguel", group: "receitas", name: "Aluguel de pasto" },
  { id: "rev-esterco", group: "receitas", name: "Venda de esterco", archivedAt: "2026-09-01T00:00:00.000Z" },
];
const account = (id: string): Account => accounts.find((a) => a.id === id)!;

const entry = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  // The grupo of its conta, as the form writes it.
  category: accounts.find((a) => a.id === patch.accountId)?.group ?? "other",
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
  entry("y-1", { kind: "yield", category: undefined, date: "2026-09-01", amountBrl: 250, paidAt: "2026-09-01", bankAccountId: "rdc" }),
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
  lots: [{ id: "lot-1", name: "Lote do Rio" }],
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
  planGroups,
};

describe("nodeParam and parseNode", () => {
  const nodes: PlanNode[] = [
    { type: "all" },
    { type: "banks" },
    { type: "bank", id: "sicredi" },
    { type: "kind", kind: "investment" },
    { type: "kind", kind: "financing" },
    { type: "kind", kind: "partners" },
    { type: "kind", kind: "expense" },
    { type: "kind", kind: "revenue" },
    { type: "group", id: "nutrition" },
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

  it("reads back every nó, every grupo of every tipo included", () => {
    const grupos: PlanNode[] = planGroups.map((g) => ({ type: "group", id: g.id }));
    for (const node of [...nodes, ...grupos]) expect(parseNode(nodeParam(node))).toEqual(node);
  });

  it("reads an absent, empty, unknown or malformed value as null", () => {
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "expense"]) {
      expect(parseNode(value)).toBeNull();
    }
  });

  it("still reads a conta or a grupo that was deleted; nodeSummary is what finds it gone", () => {
    expect(parseNode("conta:deleted")).toEqual({ type: "account", id: "deleted" });
    expect(parseNode("grupo:grupo-apagado")).toEqual({ type: "group", id: "grupo-apagado" });
  });
});

describe("legacyNode", () => {
  it("turns the old Extrato filters into a nó", () => {
    expect(legacyNode({ conta: "nut-sal" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ tipo: "expense" })).toEqual({ type: "kind", kind: "expense" });
    expect(legacyNode({ tipo: "revenue" })).toEqual({ type: "kind", kind: "revenue" });
    expect(legacyNode({ tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    expect(legacyNode({ tipo: "purchase" })).toEqual({ type: "auto", which: "purchases" });
  });

  it("prefers conta over tipo, and ignores the old grupo keys, which name nothing now", () => {
    expect(legacyNode({ conta: "nut-sal", grupo: "admin", tipo: "sale" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "admin", tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    for (const grupo of ["nutrition", "revenue", "capital"]) expect(legacyNode({ grupo })).toBeNull();
  });

  it("is null when no old filter was set or the values are unknown, a tratamento's tipo included", () => {
    expect(legacyNode({})).toBeNull();
    expect(legacyNode({ tipo: null, grupo: null, conta: null })).toBeNull();
    expect(legacyNode({ conta: "", grupo: "nope", tipo: "toString" })).toBeNull();
    expect(legacyNode({ tipo: "treatment" })).toBeNull();
  });
});

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

describe("planTree", () => {
  const tree = planTree(inputs, PERIOD, TODAY);
  const top = (key: string): TreeItem => tree.find((i) => i.key === key)!;
  const figures = (items: TreeItem[] = []) => items.map((i) => [i.label, i.amountBrl]);

  it("lists Bancos e caixa and the five tipos in order, each saying what its figure is", () => {
    expect(tree.map((i) => [i.key, i.label, i.tag, i.amountBrl])).toEqual([
      ["bancos", "Bancos e caixa", "saldo", 57650],
      ["investimentos", "Investimentos", "no período", 35500],
      ["financiamentos", "Financiamentos", "devedor", 105000],
      ["socios", "Sócios", "retirado", 5000],
      ["despesas", "Despesas", "custo (COE)", 1590],
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

  it("lists a tipo with a single grupo flat: its contas, with Compra de gado locked last", () => {
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

  it("opens Despesas into its seven grupos, alphabetical, no tratamento under Sanidade", () => {
    const grupos = top("despesas").children ?? [];
    expect(grupos.map((i) => i.key)).toEqual(
      ["admin", "labor", "nutrition", "other", "pasture", "breeding", "health"].map((c) => `grupo:${c}`)
    );
    const grupo = (c: string) => grupos.find((i) => i.key === `grupo:${c}`)!;
    expect(["nutrition", "health", "admin", "pasture"].map((c) => grupo(c).amountBrl)).toEqual([1200, 300, 90, 0]);
    expect(figures(grupo("health").children)).toEqual([["Vacinas", 300]]);
    expect(grupo("pasture").children).toEqual([]);
  });

  it("opens Receitas, a single grupo, with Venda de gado locked first and then its contas", () => {
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

  it("puts the histórico (or who) over pago para, observação, documento and the manejo's line, never repeating it", () => {
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
        entry("i-historico", {
          kind: "investment",
          flow: "out",
          accountId: "inv-maq",
          date: "2026-09-04",
          history: "Carreta agrícola 4 t",
          counterparty: "Agropecuária Sertão",
          notes: "entrega na sede",
          document: "NF 11.640",
        }),
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
    expect(["i-historico", "i-trator", "e-diesel", "m-sale"].map((id) => [line(id).history, line(id).detail])).toEqual([
      ["Carreta agrícola 4 t", "Agropecuária Sertão · entrega na sede · NF 11.640"],
      ["Agro Máquinas Uberaba", "Trator MF 4275 · NF 2.871"],
      ["Diesel do trator", "NF 77"],
      ["Frigorífico Minerva", "manejo · 1 animal"],
    ]);
  });

  it("takes a line paid in the window even when its competência is older", () => {
    expect(rows({ type: "bank", id: "caixa" }).map((r) => [r.id, r.date, r.balance])).toEqual([
      ["p-aporte", "2026-08-01", 1100],
      ["e-old", "2026-07-02", 100],
    ]);
    expect(ids(rows({ type: "account", id: "nut-sal" }))).toEqual(["e-sal"]);
  });

  it("puts a rendimento in its aplicação, in Bancos e caixa and in todos only", () => {
    expect(rows({ type: "bank", id: "rdc" }).map((r) => [r.id, r.history, r.contra, r.contraGroup, r.amountBrl, r.balance])).toEqual([
      ["t-apl", "Transferência de Sicredi", "Sicredi", "transferência", 10000, 10250],
      ["y-1", "Rendimento", "Rendimento", null, 250, 250],
    ]);
    expect(ids(rows({ type: "all" }))).toContain("y-1");
    expect(ids(rows({ type: "banks" }))).toContain("y-1");
    const others: PlanNode[] = [{ type: "kind", kind: "investment" }, { type: "kind", kind: "revenue" }];
    for (const node of others) expect(ids(rows(node))).not.toContain("y-1");
  });

  it("shows a financiamento by competência, the latest vencimento first, with the saldo devedor after each paid line", () => {
    expect(rows({ type: "account", id: "fin-custeio" }).map((r) => [r.id, r.date, r.amountBrl, r.balance, r.contra])).toEqual([
      ["f-p3", "2026-07-15", -10000, null, null],
      ["f-p2", "2026-07-15", -10000, 10000, "Sicredi"],
      ["f-p1", "2026-07-15", -10000, 20000, "Sicredi"],
      ["f-lib", "2026-07-15", 30000, 30000, "Sicredi"],
    ]);
    const kind = rows({ type: "kind", kind: "financing" });
    expect(ids(kind)).toEqual(["f-lib-pend", "f-c1", "f-old", "f-p3", "f-p2", "f-p1", "f-lib"]);
    expect(kind.every((r) => r.balance === null)).toBe(true);
    expect(rows({ type: "group", id: "financiamentos" })).toEqual(kind);
  });

  it("leaves a line inside the saldo inicial without saldo devedor and runs the saldo through lines paid on one day", () => {
    expect(rows({ type: "account", id: "fin-consorcio" }).map((r) => [r.id, r.balance])).toEqual([
      ["f-lib-pend", null],
      ["f-c1", 95000],
      ["f-old", null],
    ]);
    const sameDay = [
      entry("d-1", { kind: "financing", flow: "out", accountId: "fin-custeio", date: "2026-09-02", amountBrl: 300, paidAt: "2026-09-02" }),
      entry("d-2", { kind: "financing", flow: "out", accountId: "fin-custeio", date: "2026-09-02", amountBrl: 200, paidAt: "2026-09-02" }),
    ];
    const custeio = nodeRows({ type: "account", id: "fin-custeio" }, { ...inputs, expenses: [...expenses, ...sameDay] }, PERIOD, TODAY);
    const after = new Map(custeio.map((r) => [r.id, r.balance]));
    expect([after.get("d-1"), after.get("d-2"), after.get("f-p2")]).toEqual([19700, 19500, 9500]);
  });

  it("gives every other nó its rows by competência, newest first, signed, with the conta bancária as contra partida", () => {
    expect(rows({ type: "kind", kind: "investment" }).map((r) => [r.id, r.amountBrl, r.contra, r.contraGroup])).toEqual([
      ["i-cerca", -2000, null, null],
      ["i-rocadeira", -18500, "Sicredi", "Bancos e caixa"],
      ["i-venda", 5000, "Banco do Brasil", "Bancos e caixa"],
      ["m-buy", -20000, "Banco do Brasil", "Bancos e caixa"],
    ]);
    expect(ids(rows({ type: "kind", kind: "expense" }))).toEqual(["e-vac", "e-sal", "e-tel"]);
    expect(ids(rows({ type: "group", id: "health" }))).toEqual(["e-vac"]);
    expect(ids(rows({ type: "kind", kind: "revenue" }))).toEqual(["m-sale", "r-aluguel"]);
    expect(ids(rows({ type: "group", id: "receitas" }))).toEqual(["r-aluguel"]);
    expect(ids(rows({ type: "kind", kind: "partners" }))).toEqual(["p-ret", "p-aporte"]);
    expect(ids(rows({ type: "auto", which: "sales" }))).toEqual(["m-sale"]);
    expect(ids(rows({ type: "auto", which: "purchases" }))).toEqual(["m-buy"]);
    expect(ids(rows({ type: "account", id: "inv-maq" }))).toEqual(["i-rocadeira", "i-venda"]);
  });

  it("puts no rendimento and no line of the manejos in a grupo, whatever its id", () => {
    for (const id of ["capital", "revenue"]) expect(rows({ type: "group", id })).toEqual([]);
  });

  it("shows in Bancos e caixa the movimentação of every conta by payment day, both sides of each transferência", () => {
    const banks = rows({ type: "banks" });
    expect(ids(banks)).toEqual([
      "t-apl:sicredi",
      "t-apl:rdc",
      "m-sale",
      "i-rocadeira",
      "f-p2",
      "r-aluguel",
      "e-sal",
      "p-ret",
      "y-1",
      "f-c1",
      "i-venda",
      "f-p1",
      "m-buy",
      "e-tel",
      "p-aporte",
      "f-lib",
      "e-old",
    ]);
    // Competência in June, paid in July: the conta shows it on the payment day, as its own nó does.
    expect(banks.find((r) => r.id === "e-old")).toMatchObject({ date: "2026-07-02", contra: "Caixa da fazenda", balance: null });
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
    const financing = nodeRows({ type: "kind", kind: "financing" }, inputs, PERIOD, TODAY);
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
      ["Despesas (COE)", 1590, "despesas lançadas", "ink"],
      ["Resultado", 50410, "receitas − custo", "healthy"],
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

  it("adds the contas up on Bancos e caixa by payment day, leaving out the cartões and the transferências between contas", () => {
    expect(strip({ type: "banks" })).toEqual([
      ["Saldo em contas", 57650, "hoje · sem os cartões", "ink"],
      ["Entradas no período", 88250, "6 recebimentos", "healthy"],
      ["Saídas no período", 71100, "8 pagamentos", "ink"],
      ["Cartões", 90, "a pagar · fora do saldo", "attention"],
    ]);
  });

  it("counts the payment of a fatura as a saída of the contas", () => {
    const fatura: Transfer = { id: "t-fat", fromId: "sicredi", toId: "cartao", date: "2026-09-10", amountBrl: 90 };
    const figures = nodeSummary({ type: "banks" }, { ...inputs, transfers: [T_APL, fatura] }, PERIOD, TODAY)?.figures;
    expect([figures?.[2].amountBrl, figures?.[2].sub]).toEqual([71190, "9 pagamentos"]);
  });

  it("shows an investimento's compras, what was paid, what is still to pay and the total since the start", () => {
    expect(summary({ type: "kind", kind: "investment" })).toMatchObject({
      crumb: null,
      title: "Investimentos",
      pills: [
        { text: "investimento", tone: "scheduled" },
        { text: "fora do custo (COE)", tone: "muted" },
      ],
    });
    expect(strip({ type: "kind", kind: "investment" })).toEqual([
      ["Investido no período", 35500, "3 compras · pela data da compra", "ink"],
      ["Pago", 38500, "saiu do caixa", "ink"],
      ["A pagar", 2000, "1 lançamento · próxima 10/10", "attention"],
      ["Desde o início", 42500, "tudo o que entrou no grupo", "ink"],
    ]);
    // Investimentos has a single grupo: the crumb names the tipo only.
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
    // Liberado and Pago are what moved the saldo devedor: since the saldo inicial, whatever the window.
    expect(strip({ type: "account", id: "fin-consorcio" })?.slice(0, 3)).toEqual([
      ["Saldo devedor", 95000, "nenhuma parcela a pagar", "ink"],
      ["Liberado", 0, "0 liberações", "scheduled"],
      ["Pago", 5000, "1 parcela", "ink"],
    ]);
    expect(nodeSummary({ type: "account", id: "fin-custeio" }, inputs, { start: "2026-09-01", end: "2026-09-30" }, TODAY)?.figures[2].amountBrl).toBe(20000);
    expect(summary({ type: "account", id: "fin-consorcio" })?.paidShare).toBeCloseTo(0.05);
    expect(summary({ type: "kind", kind: "financing" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "kind", kind: "financing" })?.paidShare).toBeCloseTo(25000 / 130000);
    expect(summary({ type: "group", id: "financiamentos" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "kind", kind: "investment" })?.paidShare).toBeUndefined();
  });

  it("shows what the sócios took out, put in and the net", () => {
    expect(strip({ type: "kind", kind: "partners" })).toEqual([
      ["Retirado", 6000, "1 retirada", "ink"],
      ["Aportado", 1000, "1 aporte", "healthy"],
      ["Líquido", 5000, "retirado − aportado", "ink"],
      ["A pagar", 0, "nada a pagar", "ink"],
    ]);
  });

  it("shows a grupo de despesa with its share of the COE", () => {
    expect(summary({ type: "group", id: "health" })).toMatchObject({
      crumb: "Despesas",
      title: "Sanidade",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(strip({ type: "group", id: "health" })).toEqual([
      ["No período", 300, "1 lançamento", "ink"],
      ["Pago", 0, "saiu do caixa", "ink"],
      ["A pagar", 300, "1 lançamento · próxima 15/10", "attention"],
      ["% do COE", "19 %", `de ${formatCurrency(1590)}`, "ink"],
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

describe("entryInitialFor", () => {
  const initial = (node: PlanNode) => entryInitialFor(node, accounts, inputs.bankAccounts, planGroups);

  it("starts Novo with nothing on todos, Bancos e caixa and the lines of the manejos", () => {
    expect(initial({ type: "all" })).toEqual({});
    expect(initial({ type: "banks" })).toEqual({});
    expect(initial({ type: "auto", which: "sales" })).toEqual({});
  });

  it("starts on the picked conta bancária, a rendimento on an aplicação", () => {
    expect(initial({ type: "bank", id: "sicredi" })).toEqual({ bankAccountId: "sicredi" });
    expect(initial({ type: "bank", id: "rdc" })).toEqual({ kind: "yield", bankAccountId: "rdc" });
  });

  it("starts with the tipo, the grupo and the conta", () => {
    expect(initial({ type: "kind", kind: "financing" })).toEqual({ kind: "financing", flow: "out" });
    expect(initial({ type: "kind", kind: "expense" })).toEqual({ kind: "expense" });
    expect(initial({ type: "kind", kind: "revenue" })).toEqual({ kind: "revenue" });
    expect(initial({ type: "group", id: "breeding" })).toEqual({ kind: "expense", category: "breeding" });
    expect(initial({ type: "group", id: "socios" })).toEqual({ kind: "partners", category: "socios" });
    expect(initial({ type: "account", id: "nut-sal" })).toEqual({ kind: "expense", category: "nutrition", accountId: "nut-sal" });
    expect(initial({ type: "account", id: "rev-aluguel" })).toEqual({ kind: "revenue", category: "receitas", accountId: "rev-aluguel" });
    expect(initial({ type: "account", id: "soc-lucro" })).toEqual({ kind: "partners", category: "socios", accountId: "soc-lucro" });
  });

  it("starts with nothing on a conta or grupo that is gone", () => {
    expect(initial({ type: "account", id: "gone" })).toEqual({});
    expect(initial({ type: "group", id: "grupo-apagado" })).toEqual({});
  });
});

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
      { id: "fin-old", group: "financiamentos", name: "Antigo", openingBalanceBrl: 5000, openingDate: "2026-01-01", archivedAt: "2026-02-01T00:00:00.000Z" },
      { id: "fin-zero", group: "financiamentos", name: "Quitado" },
    ];
    const parcelaOld = entry("f-old-p", { kind: "financing", flow: "out", accountId: "fin-old", date: "2026-09-01", dueDate: "2026-10-01", amountBrl: 700 });
    expect(capitalSummary({ ...inputs, accounts: more, expenses: [...expenses, parcelaOld] }, PERIOD, TODAY)).toMatchObject({
      debt: 105000,
      debtAccounts: 2,
      nextInstallment: { dueDate: "2026-10-15", amountBrl: 10000 },
    });
  });
});


describe("grupos of every tipo", () => {
  const ARRENDAMENTOS = "6f1c2b8e-4a3d-4e5f-9b7a-1c2d3e4f5a6b";
  const ARRENDAMENTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const VELHO = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
  const PRONAF = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
  const farm: PlanInputs = {
    ...inputs,
    planGroups: [
      ...planGroups,
      group(ARRENDAMENTOS, "revenue", "Arrendamentos"),
      group(ARRENDAMENTO, "expense", "Arrendamento", "2026-09-20T00:00:00.000Z"),
      group(VELHO, "expense", "Grupo velho", "2026-05-01T00:00:00.000Z"),
      group(PRONAF, "financing", "Pronaf"),
    ],
    accounts: [...accounts, { id: "arr-vizinho", group: ARRENDAMENTOS, name: "Pasto do vizinho" }],
    expenses: [
      ...expenses,
      entry("r-vizinho", { kind: "revenue", category: ARRENDAMENTOS, accountId: "arr-vizinho", date: "2026-09-02", amountBrl: 700, paidAt: "2026-09-02", bankAccountId: "caixa" }),
      entry("g-arrend", { category: ARRENDAMENTO, date: "2026-08-10", amountBrl: 3000 }),
      // Its grupo is gone (an old snapshot): it still reads, as "Grupo removido".
      entry("g-gone", { category: "grupo-apagado", date: "2026-09-03", amountBrl: 50 }),
    ],
  };
  const top = (key: string, period = PERIOD) => planTree(farm, period, TODAY).find((i) => i.key === key)!;
  const summary = (node: PlanNode) => nodeSummary(node, farm, PERIOD, TODAY);

  it("lists the grupo items once a tipo has two, each opening into its contas", () => {
    const receitas = top("receitas");
    expect(receitas.children?.map((i) => [i.key, i.label, i.amountBrl])).toEqual([
      ["venda-de-gado", "Venda de gado", 50000],
      [`grupo:${ARRENDAMENTOS}`, "Arrendamentos", 700],
      ["grupo:receitas", "Receitas", 2000],
    ]);
    expect(receitas.children?.[1].children?.map((i) => [i.key, i.amountBrl])).toEqual([["conta:arr-vizinho", 700]]);
    expect(receitas.amountBrl).toBe(52700);
    // The tipo's pane holds the same rows however the tree draws it.
    expect(nodeRows({ type: "kind", kind: "revenue" }, farm, PERIOD, TODAY).map((r) => r.id)).toEqual(["m-sale", "r-aluguel", "r-vizinho"]);
  });

  it("gives a financiamento grupo the saldo devedor of its contas", () => {
    expect(top("financiamentos").children?.map((i) => [i.label, i.amountBrl, i.children?.length])).toEqual([
      ["Financiamentos", 105000, 2],
      ["Pronaf", 0, 0],
    ]);
  });

  it("lists an archived grupo only while it has a line in the window, a removed one last", () => {
    expect(top("despesas").children?.map((i) => [i.label, i.amountBrl, i.archived])).toEqual([
      ["Administrativo", 90, false],
      ["Arrendamento", 3000, true],
      ["Mão de obra", 0, false],
      ["Nutrição", 1200, false],
      ["Outros", 0, false],
      ["Pastagem", 0, false],
      ["Reprodução", 0, false],
      ["Sanidade", 300, false],
      ["Grupo removido", 50, false],
    ]);
    expect(top("despesas").children?.reduce((sum, i) => sum + i.amountBrl, 0)).toBe(top("despesas").amountBrl);
    // In September Arrendamento has no line: it leaves the tree. Grupo velho never shows.
    const september = top("despesas", { start: "2026-09-01", end: "2026-09-30" }).children?.map((i) => i.label);
    expect(september).not.toContain("Arrendamento");
    expect(JSON.stringify(planTree(farm, PERIOD, TODAY))).not.toContain(VELHO);
  });

  it("names the grupo in a conta's crumb only when the tipo shows more than one", () => {
    expect(summary({ type: "account", id: "rev-aluguel" })).toMatchObject({ crumb: "Receitas › Receitas", title: "Aluguel de pasto" });
    expect(nodeSummary({ type: "account", id: "rev-aluguel" }, inputs, PERIOD, TODAY)?.crumb).toBe("Receitas");
    expect(summary({ type: "account", id: "arr-vizinho" })?.crumb).toBe("Receitas › Arrendamentos");
  });

  it("titles a grupo by its name under its tipo, a removed one Grupo removido", () => {
    expect(summary({ type: "group", id: ARRENDAMENTOS })).toMatchObject({
      crumb: "Receitas",
      title: "Arrendamentos",
      pills: [{ text: "receita", tone: "muted" }],
    });
    expect(summary({ type: "group", id: "grupo-apagado" })).toMatchObject({ crumb: "Despesas", title: "Grupo removido" });
    expect(nodeRows({ type: "group", id: "grupo-apagado" }, farm, PERIOD, TODAY).map((r) => [r.id, r.history])).toEqual([
      ["g-gone", "Grupo removido"],
    ]);
    // An id no line ever had: an empty pane, still titled.
    expect(nodeRows({ type: "group", id: "nunca" }, farm, PERIOD, TODAY)).toEqual([]);
    expect(summary({ type: "group", id: "nunca" })?.title).toBe("Grupo removido");
  });

  it("starts Novo in the grupo, with its tipo", () => {
    expect(entryInitialFor({ type: "group", id: ARRENDAMENTOS }, farm.accounts, [], farm.planGroups)).toEqual({
      kind: "revenue",
      category: ARRENDAMENTOS,
    });
    expect(entryInitialFor({ type: "account", id: "arr-vizinho" }, farm.accounts, [], farm.planGroups)).toEqual({
      kind: "revenue",
      category: ARRENDAMENTOS,
      accountId: "arr-vizinho",
    });
  });
});

describe("a tratamento with cost", () => {
  // The store's data has the tratamentos; handed in whole, they still make no line and no cost.
  const withTreatments = {
    ...inputs,
    treatments: [makeTreatment({ animalEarTag: "BR-001", date: "2026-09-08", status: "done", costBrl: 5 })],
  };

  it("makes no line in any nó and leaves the COE to the despesas alone", () => {
    expect(planTree(withTreatments, PERIOD, TODAY)).toEqual(planTree(inputs, PERIOD, TODAY));
    expect(nodeRows({ type: "all" }, withTreatments, PERIOD, TODAY)).toEqual(nodeRows({ type: "all" }, inputs, PERIOD, TODAY));
    const despesas = expenses.filter((e) => e.kind === "expense" && e.date >= PERIOD.start).reduce((sum, e) => sum + e.amountBrl, 0);
    expect(nodeSummary({ type: "all" }, withTreatments, PERIOD, TODAY)?.figures[1].amountBrl).toBe(despesas);
  });
});
```

- [ ] **Step 14: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/planTree.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `planTree.ts` still imports `TOP_GROUP_LABEL`, `despesaGroups`, `isBuiltinCategory`, `isDespesaGroup` (deleted by task 1); no `kind` nó exists.

- [ ] **Step 15: Implement**

`lib/domain/planTree.ts` — **Replace the whole file with:**

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
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  GroupKind,
  PlanGroup,
  Transfer,
} from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
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
import { isCapitalKind, isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { GROUP_KINDS, GROUP_KIND_LABEL, groupKind, groupLabel, groupsOf } from "@/lib/domain/groups";
import {
  effectiveDueDate,
  ledgerRows,
  type LedgerInputs,
  type LedgerKind,
  type LedgerRow,
  type LedgerStatus,
} from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import { installmentLabel } from "@/lib/domain/series";

/** A row of the tree. A tipo opens into its grupos, a grupo into its contas. */
export type PlanNode =
  | { type: "all" }
  | { type: "banks" }
  | { type: "bank"; id: string }
  /** A tipo: Receitas, Despesas (the whole COE), Investimentos, Financiamentos, Sócios. */
  | { type: "kind"; kind: GroupKind }
  /** A grupo of the plano. */
  | { type: "group"; id: string }
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
  /** What the figure is, on Bancos e caixa and the five tipos: "saldo", "no período", "devedor", "retirado", "custo (COE)". */
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
  /** "Bancos e caixa", "Despesas › Nutrição"; null on a tipo and on "todos". */
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

const KIND_PARAM: Record<GroupKind, string> = {
  investment: "investimentos",
  financing: "financiamentos",
  partners: "socios",
  expense: "despesas",
  revenue: "receitas",
};

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<id> · conta:<id> · compra-de-gado · venda-de-gado. */
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
    case "kind":
      return KIND_PARAM[node.kind];
    case "group":
      return `grupo:${node.id}`;
  }
}

/**
 * The nó of a `conta` value; null when absent, unknown or malformed. Any grupo
 * id reads: one that names no grupo opens as "Grupo removido".
 */
export function parseNode(param: string | null | undefined): PlanNode | null {
  if (!param) return null;
  if (param === "todos") return { type: "all" };
  if (param === "bancos") return { type: "banks" };
  if (param === "compra-de-gado") return { type: "auto", which: "purchases" };
  if (param === "venda-de-gado") return { type: "auto", which: "sales" };
  const kind = GROUP_KINDS.find((k) => KIND_PARAM[k] === param);
  if (kind) return { type: "kind", kind };
  const match = /^(banco|conta|grupo):(.+)$/.exec(param);
  if (!match) return null;
  const [, prefix, value] = match;
  if (prefix === "banco") return { type: "bank", id: value };
  if (prefix === "conta") return { type: "account", id: value };
  return { type: "group", id: value };
}

/** The old Extrato's `tipo` values. */
const LEGACY_KIND = new Map<string, PlanNode>([
  ["expense", { type: "kind", kind: "expense" }],
  ["revenue", { type: "kind", kind: "revenue" }],
  ["sale", { type: "auto", which: "sales" }],
  ["purchase", { type: "auto", which: "purchases" }],
]);

/**
 * The old Extrato filters (?tipo, ?conta=<account id>) as a nó; null when none
 * was set. Its ?grupo held keys that name no grupo any more: it is ignored.
 */
export function legacyNode(params: {
  tipo?: string | null;
  grupo?: string | null;
  conta?: string | null;
}): PlanNode | null {
  const { tipo, conta } = params;
  if (conta) return { type: "account", id: conta };
  return LEGACY_KIND.get(tipo ?? "") ?? null;
}

/** The paid lines that move a financiamento's saldo devedor, in payment order. */
function debtMoves(account: Account, expenses: Expense[]): (Expense & { paidAt: string })[] {
  return expenses
    .filter(
      (e): e is Expense & { paidAt: string } =>
        e.accountId === account.id &&
        e.paidAt !== undefined &&
        // On or before the opening date it is already inside the saldo inicial.
        !(account.openingDate !== undefined && e.paidAt <= account.openingDate)
    )
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id));
}

interface DebtParts {
  /** Saldo inicial + liberações. */
  owed: number;
  paid: number;
  releases: Expense[];
  payments: Expense[];
}

/** What a financiamento owed and paid by the end of `day`. */
function debtParts(account: Account, expenses: Expense[], day: string): DebtParts {
  const moves = debtMoves(account, expenses).filter((e) => e.paidAt <= day);
  const releases = moves.filter(isInflow);
  const payments = moves.filter((e) => !isInflow(e));
  const total = (list: Expense[]) => list.reduce((sum, e) => sum + e.amountBrl, 0);
  return { owed: (account.openingBalanceBrl ?? 0) + total(releases), paid: total(payments), releases, payments };
}

/** Saldo devedor of a conta de financiamento at the end of `day`. Pending lines never count. */
export function debtBalance(account: Account, expenses: Expense[], day: string): number {
  const { owed, paid } = debtParts(account, expenses, day);
  return cents(owed - paid);
}

const BANKS = "Bancos e caixa";
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

/** As Contas bancárias lists them: the conta principal first, cartões last. */
const byBankOrder = (a: BankAccount, b: BankAccount): number =>
  Number(b.isMain) - Number(a.isMain) || Number(a.kind === "card") - Number(b.kind === "card");

/** The contas of financiamento whose saldo devedor counts in the tipo's. */
const liveFinancing = (inputs: Pick<PlanInputs, "accounts" | "planGroups">): Account[] =>
  inputs.accounts.filter((a) => a.archivedAt === undefined && groupKind(a.group, inputs.planGroups) === "financing");

/** Ledger kinds of each tipo. */
const LEDGER_KINDS: Record<GroupKind, readonly LedgerKind[]> = {
  investment: ["investment", "purchase"],
  financing: ["financing"],
  partners: ["partners"],
  expense: ["expense"],
  revenue: ["revenue", "sale"],
};

interface ShownGroup {
  id: string;
  label: string;
  archived: boolean;
}

/**
 * The grupos a tipo lists in the window, by name: an archived one only while
 * it has a line in the window, like an archived conta; an id that names no
 * grupo (a removed one) while its lines are there, as "Grupo removido", last.
 */
function shownGroups(kind: GroupKind, rows: LedgerRow[], groups: readonly PlanGroup[]): ShownGroup[] {
  const inWindow = new Set(rows.filter((r) => r.kind === kind).map((r) => r.group));
  const known = groupsOf(groups, kind, { archived: true })
    .filter((g) => g.archivedAt === undefined || inWindow.has(g.id))
    .map((g) => ({ id: g.id, label: g.name, archived: g.archivedAt !== undefined }));
  const removed = [...inWindow]
    .filter((id) => groupKind(id, groups) === null)
    .map((id) => ({ id, label: groupLabel(id, groups), archived: false }));
  return [...known, ...removed];
}

/** A row of the tree, keyed by its URL value. */
const item = (node: PlanNode, label: string, amountBrl: number, extra: Partial<TreeItem> = {}): TreeItem => ({
  node,
  key: nodeParam(node),
  label,
  amountBrl,
  ...extra,
});

/** Bancos e caixa, then the five tipos in order: investment, financing, partners, expense, revenue. */
export function planTree(inputs: PlanInputs, period: Period, todayIso: string): TreeItem[] {
  const rows = ledgerRows(inputs, period, todayIso);
  const withLines = new Set(rows.map((r) => r.expense?.accountId));
  const byGroup = accountsByGroup(inputs.accounts, true);
  const of = (id: string) => (r: LedgerRow) => r.expense?.accountId === id;
  /** The grupo's contas by name; an archived one only while it has a line in the window. */
  const contas = (group: AccountGroup, amount: (a: Account) => number): TreeItem[] =>
    (byGroup[group] ?? [])
      .filter((a) => a.archivedAt === undefined || withLines.has(a.id))
      .map((a) => item({ type: "account", id: a.id }, a.name, amount(a), { archived: a.archivedAt !== undefined }));
  const debt = (a: Account) => debtBalance(a, inputs.expenses, todayIso);
  const live = liveFinancing(inputs);
  const banks = [...inputs.bankAccounts]
    .sort(byBankOrder)
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);
  /** A grupo's or a conta's figure, by the tipo's rule: what was spent, earned, or (financiamento) still owed. */
  const figure = (kind: GroupKind, pick: (r: LedgerRow) => boolean, owing: Account[]): number =>
    kind === "financing" ? sum(owing, debt) : kind === "revenue" ? earned(rows, pick) : spent(rows, pick);
  /** A tipo's grupos, each opening into its contas; a tipo with a single grupo lists that grupo's contas itself. */
  const grupos = (kind: GroupKind): TreeItem[] => {
    const shown = shownGroups(kind, rows, inputs.planGroups);
    const contasOf = (id: string) => contas(id, (a) => figure(kind, of(a.id), [a]));
    if (shown.length === 1) return contasOf(shown[0].id);
    return shown.map((g) =>
      item({ type: "group", id: g.id }, g.label, figure(kind, (r) => r.kind === kind && r.group === g.id, live.filter((a) => a.group === g.id)), {
        archived: g.archived,
        children: contasOf(g.id),
      })
    );
  };

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
      { type: "kind", kind: "investment" },
      GROUP_KIND_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
      {
        tag: "no período",
        children: [
          ...grupos("investment"),
          item({ type: "auto", which: "purchases" }, PURCHASES, spent(rows, isKind("purchase")), { locked: true }),
        ],
      }
    ),
    item({ type: "kind", kind: "financing" }, GROUP_KIND_LABEL.financing, sum(live, debt), {
      tag: "devedor",
      children: grupos("financing"),
    }),
    item({ type: "kind", kind: "partners" }, GROUP_KIND_LABEL.partners, spent(rows, isKind("partners")), {
      tag: "retirado",
      children: grupos("partners"),
    }),
    item({ type: "kind", kind: "expense" }, GROUP_KIND_LABEL.expense, cents(coe(inputs.expenses, period)), {
      tag: "custo (COE)",
      children: grupos("expense"),
    }),
    item(
      { type: "kind", kind: "revenue" },
      GROUP_KIND_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
      {
        tag: "no período",
        children: [
          item({ type: "auto", which: "sales" }, SALES, earned(rows, isKind("sale")), { locked: true }),
          ...grupos("revenue"),
        ],
      }
    ),
  ];
}

/** Every day there is: a conta bancária looks its lançamentos up whatever their competência. */
const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

function belongs(node: Exclude<PlanNode, { type: "bank" | "banks" }>, r: LedgerRow): boolean {
  switch (node.type) {
    case "all":
      return true;
    case "account":
      return r.expense?.accountId === node.id;
    case "auto":
      return r.kind === (node.which === "purchases" ? "purchase" : "sale");
    case "kind":
      return LEDGER_KINDS[node.kind].includes(r.kind);
    case "group":
      // A lançamento of the grupo: a rendimento and the manejos' rows sit in none.
      return r.expense?.category === node.id;
  }
}

/** "Agro Máquinas Uberaba · NF 2.871 · parcela 2/10": pago para, observação, documento and parcela, without what the history already says. */
function detailOf(r: LedgerRow, history: string): string | null {
  const parcela = r.expense ? installmentLabel(r.expense) : null;
  return (
    [r.counterparty, r.notes, r.document, parcela && `parcela ${parcela}`]
      .filter((t) => t && t !== history)
      .join(" · ") || null
  );
}

const bankName = (banks: BankAccount[], id: string | null): string | null =>
  banks.find((b) => b.id === id)?.name ?? null;

/** A ledger row as every nó but a conta bancária shows it: the contra partida is the conta bancária. */
function ledgerLine(r: LedgerRow, banks: BankAccount[]): PaneRow {
  const contra = bankName(banks, r.bankAccountId);
  // Rows typed before the Histórico existed fall back to who, then what.
  const history = r.history ?? r.counterparty ?? r.notes ?? r.account ?? r.groupLabel;
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
  if (node.type === "banks") {
    // The movimentação of every conta by payment day, as each conta's own nó shows it: both sides of a
    // transferência, keyed as the conciliação keys them. The contra partida is the conta the line sits in.
    const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
    return banks
      .flatMap((bank) =>
        accountMovements(bank, inputs, period).map((move) =>
          move.transfer
            ? transferLine(move.transfer, bank.id, banks, null, `${move.transfer.id}:${bank.id}`)
            : { ...ledgerLine(byId.get(move.id)!, banks), date: move.date, amountBrl: move.amountBrl }
        )
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  if (node.type === "bank") {
    const bank = banks.find((b) => b.id === node.id);
    if (!bank) return [];
    const byId = new Map(ledgerRows(inputs, ALL_TIME, todayIso).map((r) => [r.id, r]));
    return accountMovements(bank, inputs, period).map((move) => {
      if (move.transfer) return transferLine(move.transfer, bank.id, banks, move.balance);
      const r = byId.get(move.id)!;
      // A despesa sits in a grupo de despesa.
      const group = r.kind === "expense" ? `${GROUP_KIND_LABEL.expense} › ${r.groupLabel}` : r.groupLabel;
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
  const financing =
    node.type === "account"
      ? inputs.accounts.find((a) => a.id === node.id && groupKind(a.group, inputs.planGroups) === "financing")
      : undefined;
  if (financing) {
    // The saldo devedor after each line that moved it; a pending line or one inside the saldo inicial has none.
    let balance = financing.openingBalanceBrl ?? 0;
    const after = new Map<string, number>();
    for (const e of debtMoves(financing, inputs.expenses)) {
      balance = cents(balance + (isInflow(e) ? e.amountBrl : -e.amountBrl));
      after.set(e.id, balance);
    }
    for (const row of rows) row.balance = after.get(row.id) ?? null;
  }
  const due = (r: PaneRow) => r.ledger?.dueDate ?? r.date;
  // Parcelas share their competência: the latest vencimento first.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || due(b).localeCompare(due(a)));
}

const PENDING: readonly LedgerStatus[] = ["payable", "receivable", "overdue"];

/** Lower case without accents, so "socios" finds "Sócios": the searches of Lançamentos. */
export function fold(text: string): string {
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

type Pill = NodeSummary["pills"][number];

/** Which strip a nó shows: a tipo's, or one of the two that are not. */
type Strip = "all" | "banks" | GroupKind;

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
const RESULT_KINDS: readonly LedgerKind[] = [...LEDGER_KINDS.expense, ...LEDGER_KINDS.revenue];

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

/**
 * Where a nó sits and which strip it shows. A conta's crumb names its grupo
 * unless the tree lists the tipo flat (a single grupo). A grupo or conta whose
 * grupo is gone reads as a despesa's, as before grupos had a tipo.
 */
function placeOf(
  node: PlanNode,
  account: Account | undefined,
  inputs: PlanInputs,
  period: Period,
  todayIso: string
): { strip: Strip; crumb: string | null; title: string } {
  const groups = inputs.planGroups;
  if (account) {
    const kind = groupKind(account.group, groups) ?? "expense";
    const shown = shownGroups(kind, ledgerRows(inputs, period, todayIso), groups);
    const flat = shown.length === 1 && shown[0].id === account.group;
    const crumb = flat ? GROUP_KIND_LABEL[kind] : `${GROUP_KIND_LABEL[kind]} › ${groupLabel(account.group, groups)}`;
    return { strip: kind, crumb, title: account.name };
  }
  if (node.type === "banks") return { strip: "banks", crumb: null, title: BANKS };
  if (node.type === "auto") {
    return node.which === "purchases"
      ? { strip: "investment", crumb: GROUP_KIND_LABEL.investment, title: PURCHASES }
      : { strip: "revenue", crumb: GROUP_KIND_LABEL.revenue, title: SALES };
  }
  if (node.type === "kind") return { strip: node.kind, crumb: null, title: GROUP_KIND_LABEL[node.kind] };
  if (node.type === "group") {
    const kind = groupKind(node.id, groups) ?? "expense";
    return { strip: kind, crumb: GROUP_KIND_LABEL[kind], title: groupLabel(node.id, groups) };
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

  const { strip, crumb, title } = placeOf(node, account, inputs, period, todayIso);
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
      const cost = cents(coe(inputs.expenses, period));
      const result = cents(revenue - cost);
      return summary([
        fig("Receitas", revenue, "vendas e outras receitas", "healthy"),
        fig("Despesas (COE)", cost, "despesas lançadas"),
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
      const card = new Set(inputs.bankAccounts.filter((b) => b.kind === "card").map((b) => b.id));
      // What crossed the edge of the saldo em contas: a cartão's own lines and the transferências
      // between two contas stay out; paying a fatura is a saída.
      const crossed = nodeRows(node, inputs, period, todayIso).filter((r) => {
        if (!r.transfer) return !card.has(r.ledger?.bankAccountId ?? "");
        const [side, other] = r.amountBrl < 0 ? [r.transfer.fromId, r.transfer.toId] : [r.transfer.toId, r.transfer.fromId];
        return !card.has(side) && card.has(other);
      });
      const entered = crossed.filter((r) => r.amountBrl > 0);
      const left = crossed.filter((r) => r.amountBrl < 0);
      return summary([
        fig("Saldo em contas", bankTotal(inputs.bankAccounts, inputs, todayIso), "hoje · sem os cartões"),
        fig(
          "Entradas no período",
          sum(entered, (r) => r.amountBrl),
          count(entered.length, "recebimento", "recebimentos"),
          "healthy"
        ),
        fig("Saídas no período", sum(left, (r) => -r.amountBrl), count(left.length, "pagamento", "pagamentos")),
        fig("Cartões", owed, "a pagar · fora do saldo", owed > 0 ? "attention" : "ink"),
      ]);
    }
    case "expense": {
      const cost = cents(coe(inputs.expenses, period));
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
          node.type === "kind" || node.type === "group" ? "tudo o que entrou no grupo" : "tudo o que entrou nesta conta"
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
      const contas = account
        ? [account]
        : liveFinancing(inputs).filter((a) => node.type !== "group" || a.group === node.id);
      const ids = new Set(contas.map((a) => a.id));
      const parts = contas.map((a) => debtParts(a, inputs.expenses, todayIso));
      const owed = sum(parts, (p) => p.owed);
      const paid = sum(parts, (p) => p.paid);
      const due = toPay(inputs.expenses, (e) => e.accountId !== undefined && ids.has(e.accountId));
      // What moved the saldo devedor since the saldo inicial, whatever the window: the strip adds up.
      const released = parts.flatMap((p) => p.releases);
      const payments = parts.flatMap((p) => p.payments);
      return summary(
        [
          fig(
            "Saldo devedor",
            cents(owed - paid),
            due.length === 0 ? "nenhuma parcela a pagar" : `${count(due.length, "parcela", "parcelas")} a pagar`
          ),
          fig("Liberado", sum(released, (e) => e.amountBrl), count(released.length, "liberação", "liberações"), "scheduled"),
          fig("Pago", cents(paid), count(payments.length, "parcela", "parcelas")),
          due.length > 0
            ? fig("Próxima parcela", due[0].amountBrl, `vence ${formatDate(effectiveDueDate(due[0]))}`, "attention")
            : fig("Próxima parcela", "—", "nenhuma parcela a pagar"),
        ],
        owed > 0 ? Math.min(1, paid / owed) : 0
      );
    }
  }
}

/** What "Novo" starts with on a nó: an aplicação starts a rendimento, a grupo or conta its tipo and grupo. */
export function entryInitialFor(
  node: PlanNode,
  accounts: Account[],
  bankAccounts: BankAccount[],
  planGroups: readonly PlanGroup[]
): EntryInitial {
  switch (node.type) {
    case "bank":
      return bankAccounts.find((b) => b.id === node.id)?.kind === "investment"
        ? { kind: "yield", bankAccountId: node.id }
        : { bankAccountId: node.id };
    case "kind":
      return isCapitalKind(node.kind) ? { kind: node.kind, flow: "out" } : { kind: node.kind };
    case "group": {
      const kind = groupKind(node.id, planGroups);
      return kind === null ? {} : { kind, category: node.id };
    }
    case "account": {
      const account = accounts.find((a) => a.id === node.id);
      const kind = account ? groupKind(account.group, planGroups) : null;
      return account && kind ? { kind, category: account.group, accountId: account.id } : {};
    }
    default:
      return {};
  }
}

/** The Painel's "Capital, dívidas e sócios". */
export function capitalSummary(inputs: PlanInputs, period: Period, todayIso: string): CapitalSummary {
  const rows = ledgerRows(inputs, period, todayIso);
  const investedAssets = spent(rows, isKind("investment"));
  const investedCattle = spent(rows, isKind("purchase"));
  const live = liveFinancing(inputs);
  const liveIds = new Set(live.map((a) => a.id));
  const debts = live.map((a) => debtBalance(a, inputs.expenses, todayIso));
  const next = toPay(inputs.expenses, (e) => e.accountId !== undefined && liveIds.has(e.accountId))[0];
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

- [ ] **Step 16: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/planTree.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 17: Write the failing test (relatório por grupo, extrato bancário, despesas export)**

`lib/reports/__tests__/groups.test.ts` — **Replace the whole file with:**

```ts
import { describe, expect, it } from "vitest";
import { groupsReport } from "@/lib/reports/groups";
import type { LedgerInputs } from "@/lib/domain/ledger";
import type { Period } from "@/lib/domain/period";
import type { Expense, GroupKind, Movement, PlanGroup } from "@/lib/types";
import { makeTreatment } from "@/lib/domain/__tests__/fixtures";

const TODAY = "2026-10-07";
const SEPTEMBER: Period = { start: "2026-09-01", end: "2026-09-30" };

const group = (id: string, kind: GroupKind, name: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const expense = (id: string, overrides: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-10",
  category: "other",
  amountBrl: 100,
  ...overrides,
});

const sale = (overrides: Partial<Movement>): Movement => ({
  id: "venda",
  type: "sale",
  date: "2026-09-18",
  origin: "Fazenda",
  destination: "Frigorífico",
  amountBrl: 138420,
  ...overrides,
});

const INPUTS: LedgerInputs = {
  expenses: [
    expense("aluguel", { kind: "revenue", category: "receitas", amountBrl: 9600, accountId: "acc-aluguel", paidAt: "2026-09-25" }),
    expense("receita-sem-conta", { kind: "revenue", category: "receitas", amountBrl: 50 }),
    expense("pasto", { kind: "revenue", category: "g-arr", amountBrl: 1200, accountId: "acc-pasto", paidAt: "2026-09-26" }),
    expense("sal", { category: "nutrition", amountBrl: 5940, accountId: "acc-sal", paidAt: "2026-09-01" }),
    expense("racao", { category: "nutrition", amountBrl: 2536.4, accountId: "acc-racao" }),
    expense("energia", { category: "admin", amountBrl: 1783.98, accountId: "acc-energia", paidAt: "2026-09-10" }),
    expense("diesel", { category: "g-maq", amountBrl: 11820, accountId: "acc-diesel", paidAt: "2026-09-12" }),
    expense("outros", { category: "other", amountBrl: 187.83 }),
    // Its grupo was removed: last, as "Grupo removido".
    expense("sumiu", { category: "g-gone", amountBrl: 10 }),
    // Dated in August, paid in September: caixa only.
    expense("encargos", { category: "labor", date: "2026-08-31", amountBrl: 6091.17, paidAt: "2026-09-15" }),
    // Dated in September, paid in October: competência only.
    expense("adubo", { category: "pasture", date: "2026-09-20", amountBrl: 3000, paidAt: "2026-10-02" }),
    expense("trator", { kind: "investment", category: "investimentos", flow: "out", amountBrl: 18900, accountId: "acc-maquinas", paidAt: "2026-09-10" }),
    expense("custeio", { kind: "financing", category: "financiamentos", flow: "in", amountBrl: 60000, accountId: "acc-custeio", paidAt: "2026-09-12" }),
    expense("parcela", { kind: "financing", category: "financiamentos", flow: "out", amountBrl: 3480.79, accountId: "acc-consorcio", paidAt: "2026-09-20" }),
    expense("lucro", { kind: "partners", category: "socios", flow: "out", amountBrl: 10000, paidAt: "2026-09-30" }),
    { id: "rendimento", kind: "yield", date: "2026-09-10", amountBrl: 312.5, paidAt: "2026-09-30" },
  ],
  accounts: [
    { id: "acc-aluguel", group: "receitas", name: "Aluguel de pasto" },
    { id: "acc-pasto", group: "g-arr", name: "Pasto do vizinho" },
    { id: "acc-sal", group: "nutrition", name: "Sal mineral" },
    { id: "acc-racao", group: "nutrition", name: "Ração e suplemento" },
    { id: "acc-energia", group: "admin", name: "Energia" },
    { id: "acc-diesel", group: "g-maq", name: "Diesel" },
    { id: "acc-maquinas", group: "investimentos", name: "Máquinas e implementos" },
    { id: "acc-custeio", group: "financiamentos", name: "Custeio Sicredi" },
    { id: "acc-consorcio", group: "financiamentos", name: "Consórcio trator" },
  ],
  movements: [
    sale({}),
    sale({ id: "compra", type: "purchase", date: "2026-09-20", amountBrl: 42600, origin: "Leilão", destination: "Fazenda" }),
  ],
  manejoSessions: [],
  animals: [],
  lots: [],
  planGroups: [
    group("receitas", "revenue", "Receitas"),
    group("g-arr", "revenue", "Arrendamentos"),
    group("nutrition", "expense", "Nutrição"),
    group("pasture", "expense", "Pastagem"),
    group("labor", "expense", "Mão de obra"),
    group("health", "expense", "Sanidade"),
    group("admin", "expense", "Administrativo"),
    group("other", "expense", "Outros"),
    group("g-maq", "expense", "Máquinas e veículos"),
    group("investimentos", "investment", "Investimentos"),
    group("financiamentos", "financing", "Financiamentos"),
    group("socios", "partners", "Sócios"),
  ],
};

const accrual = groupsReport(INPUTS, SEPTEMBER, "accrual", TODAY);
const cash = groupsReport(INPUTS, SEPTEMBER, "cash", TODAY);
const lines = (xs: { label: string; amountBrl: number }[]) => xs.map((x) => [x.label, x.amountBrl]);

describe("groupsReport: receitas", () => {
  it("puts Venda de gado first as a locked line, then the receitas by grupo, by name", () => {
    expect(accrual.revenues.map((g) => [g.key, g.label, g.amountBrl, g.locked ?? false])).toEqual([
      ["venda-de-gado", "Venda de gado", 138420, true],
      ["g-arr", "Arrendamentos", 1200, false],
      ["receitas", "Receitas", 9650, false],
    ]);
    expect(accrual.revenues[0].accounts).toEqual([]);
    expect(accrual.revenueTotal).toBe(149270);
  });

  it("opens each grupo of receita into its contas, lines without conta last", () => {
    expect(lines(accrual.revenues[2].accounts)).toEqual([
      ["Aluguel de pasto", 9600],
      ["Sem conta", 50],
    ]);
  });

  it("leaves Venda de gado out when nothing was sold", () => {
    const noSale = groupsReport({ ...INPUTS, movements: [] }, SEPTEMBER, "accrual", TODAY);
    expect(noSale.revenues.map((g) => g.key)).toEqual(["g-arr", "receitas"]);
  });
});

describe("groupsReport: despesas", () => {
  it("lists only the grupos with lines, by name, a removed one last", () => {
    expect(accrual.expenses.map((g) => [g.label, g.amountBrl])).toEqual([
      ["Administrativo", 1783.98],
      ["Máquinas e veículos", 11820],
      ["Nutrição", 8476.4],
      ["Outros", 187.83],
      ["Pastagem", 3000],
      ["Grupo removido", 10],
    ]);
    expect(accrual.expenseTotal).toBe(25278.21);
  });

  it("opens each grupo into its contas, lines without conta last", () => {
    const group = (label: string) => accrual.expenses.find((g) => g.label === label)!;
    expect(lines(group("Nutrição").accounts)).toEqual([
      ["Ração e suplemento", 2536.4],
      ["Sal mineral", 5940],
    ]);
    expect(lines(group("Outros").accounts)).toEqual([["Sem conta", 187.83]]);
  });

  it("is the receitas minus the despesas, the capital rows left out", () => {
    expect(accrual.balance).toBe(123991.79);
  });

  it("counts no tratamento, even when the farm's data carries it", () => {
    // The store's data has the tratamentos; handed in whole, they still make no line.
    const withTreatments = {
      ...INPUTS,
      treatments: [makeTreatment({ name: "Vacina aftosa", date: "2026-09-08", status: "done", costBrl: 434 })],
    };
    expect(groupsReport(withTreatments, SEPTEMBER, "accrual", TODAY)).toEqual(accrual);
  });
});

describe("groupsReport: caixa", () => {
  it("takes only what was paid or received in the window, by payment day", () => {
    expect(lines(cash.revenues)).toEqual([
      ["Venda de gado", 138420],
      ["Arrendamentos", 1200],
      ["Receitas", 9600],
    ]);
    // Ração and Outros are pending, Adubo was paid in October, Encargos (August) in September.
    expect(cash.expenses.map((g) => [g.label, g.amountBrl])).toEqual([
      ["Administrativo", 1783.98],
      ["Mão de obra", 6091.17],
      ["Máquinas e veículos", 11820],
      ["Nutrição", 5940],
    ]);
    expect(cash.balance).toBe(123584.85);
  });
});

describe("groupsReport: fora do resultado", () => {
  it("adds entradas and saídas per tipo and conta, compra de gado locked, rendimentos last", () => {
    expect(accrual.capital.map((g) => [g.label, g.inBrl, g.outBrl])).toEqual([
      ["Investimentos", 0, 61500],
      ["Financiamentos", 60000, 3480.79],
      ["Sócios", 0, 10000],
      ["Rendimentos", 312.5, 0],
    ]);
    expect(accrual.capital[0].accounts).toEqual([
      { label: "Compra de gado", inBrl: 0, outBrl: 42600, locked: true },
      { label: "Máquinas e implementos", inBrl: 0, outBrl: 18900, locked: false },
    ]);
    expect(accrual.capital[1].accounts.map((a) => a.label)).toEqual(["Consórcio trator", "Custeio Sicredi"]);
    expect(accrual.capital[2].accounts.map((a) => a.label)).toEqual(["Sem conta"]);
  });

  it("is empty for a window without lines", () => {
    expect(groupsReport(INPUTS, { start: "2026-07-01", end: "2026-07-31" }, "accrual", TODAY)).toMatchObject({
      revenues: [],
      expenses: [],
      capital: [],
      revenueTotal: 0,
      expenseTotal: 0,
      balance: 0,
    });
  });
});
```

`lib/reports/__tests__/bankStatement.test.ts` — **Replace**

```ts
  treatments: [],
  lots: [],
  expenseGroups: [],
```

with

```ts
  lots: [],
  planGroups: [
    { id: "nutrition", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "admin", kind: "expense", name: "Administrativo", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
import type { Expense } from "@/lib/types";
```

with

```ts
import type { Expense, PlanGroup } from "@/lib/types";

const GROUPS: PlanGroup[] = [
  { id: "nutrition", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "labor", kind: "expense", name: "Mão de obra", createdAt: "2026-01-01T00:00:00.000Z" },
];
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
    const table = expensesExportTable(expenses);
```

with

```ts
    const table = expensesExportTable(expenses, "Despesas", GROUPS);
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
    const table = expensesExportTable([
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
      { id: "r1", kind: "revenue", date: "2026-02-05", category: "other", amountBrl: 900 },
    ]);
```

with

```ts
    const table = expensesExportTable(
      [
        { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
        { id: "r1", kind: "revenue", date: "2026-02-05", category: "receitas", amountBrl: 900 },
      ],
      "Despesas",
      GROUPS
    );
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
  it("leaves investimentos and rendimentos out of the Despesas sheet", () => {
    const table = expensesExportTable([
      { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
      { id: "i1", kind: "investment", flow: "out", date: "2026-02-05", category: "other", amountBrl: 50000 },
      { id: "y1", kind: "yield", date: "2026-02-06", category: "other", amountBrl: 312.5, paidAt: "2026-02-06" },
    ]);
```

with

```ts
  it("leaves investimentos and rendimentos (no grupo) out of the Despesas sheet", () => {
    const table = expensesExportTable(
      [
        { id: "e1", kind: "expense", date: "2026-01-05", category: "nutrition", amountBrl: 100 },
        { id: "i1", kind: "investment", flow: "out", date: "2026-02-05", category: "investimentos", amountBrl: 50000 },
        { id: "y1", kind: "yield", date: "2026-02-06", amountBrl: 312.5, paidAt: "2026-02-06" },
      ],
      "Despesas",
      GROUPS
    );
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
  it("names a farm grupo and writes Grupo removido for one that is gone", () => {
```

with

```ts
  it("names a grupo, archived or not, and writes Grupo removido for one that is gone", () => {
```

`lib/export/__tests__/finance.test.ts` — **Replace**

```ts
      [{ id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-01-01T00:00:00.000Z" }]
```

with

```ts
      [{ id: "g-maq", kind: "expense", name: "Máquinas e veículos", archivedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }]
```

- [ ] **Step 18: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/reports/__tests__/groups.test.ts lib/reports/__tests__/bankStatement.test.ts lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `groups.test.ts` fails: `reports/groups.ts` imports `TOP_GROUP_LABEL`/`despesaGroups` (deleted by task 1) and has no receita grupos. `bankStatement.test.ts` already passes (step 7 fixed the ledger it reads) and `finance.test.ts` may pass too (it only changes the call shape); both are here for the new inputs.

- [ ] **Step 19: Implement**

`lib/reports/groups.ts` — **Replace the whole file with:**

```ts
/**
 * Receitas e despesas por grupo: the window's receitas and despesas by grupo
 * (each opening into its contas, Venda de gado a line of its own), the saldo
 * between them, and what moved outside the resultado. Competência takes the
 * lines dated in the window, paid or not; caixa the ones paid or received in
 * it, by payment day. Pure.
 */
import type { CapitalGroup, GroupKind, PlanGroup } from "@/lib/types";
import { ledgerRows, type LedgerInputs, type LedgerKind, type LedgerRow } from "@/lib/domain/ledger";
import { inPeriod, type Period } from "@/lib/domain/period";
import { GROUP_KIND_LABEL, groupLabel, groupsOf } from "@/lib/domain/groups";
import { cents } from "@/lib/domain/bankAccounts";

export type Regime = "accrual" | "cash";

export const REGIME_LABEL: Record<Regime, string> = { accrual: "competência", cash: "caixa" };

/** What a line without a conta of the plano reads. */
export const NO_ACCOUNT = "Sem conta";

export interface ReportLine {
  label: string;
  amountBrl: number;
  /** Written by the manejos, not typed. */
  locked: boolean;
}

export interface GroupLine {
  key: string;
  label: string;
  amountBrl: number;
  accounts: ReportLine[];
  /** Venda de gado: a single line, no contas. */
  locked?: boolean;
}

export interface CapitalLine {
  key: CapitalGroup | "yield";
  label: string;
  inBrl: number;
  outBrl: number;
  accounts: { label: string; inBrl: number; outBrl: number; locked: boolean }[];
}

export interface GroupsReport {
  /** Venda de gado first when it is not 0, then by grupo like `expenses`. */
  revenues: GroupLine[];
  revenueTotal: number;
  /** By grupo, by name, a removed one last; only grupos with lines. */
  expenses: GroupLine[];
  expenseTotal: number;
  /** Receitas − despesas. */
  balance: number;
  /** Investimentos (compras de gado too), financiamentos, sócios and rendimentos; never in the balance. */
  capital: CapitalLine[];
}

const ALL_TIME: Period = { start: "0000-01-01", end: "9999-12-31" };

const CAPITAL_KEY: Partial<Record<LedgerKind, CapitalLine["key"]>> = {
  investment: "investment",
  purchase: "investment",
  financing: "financing",
  partners: "partners",
  yield: "yield",
};
const CAPITAL_ORDER: CapitalLine["key"][] = ["investment", "financing", "partners", "yield"];
const CAPITAL_LABEL: Record<CapitalLine["key"], string> = {
  investment: GROUP_KIND_LABEL.investment,
  financing: GROUP_KIND_LABEL.financing,
  partners: GROUP_KIND_LABEL.partners,
  yield: "Rendimentos",
};

const accountLabel = (r: LedgerRow): string => r.account ?? NO_ACCOUNT;

/** Alphabetical, the lines without conta last. */
const byLabel = (a: { label: string }, b: { label: string }): number =>
  Number(a.label === NO_ACCOUNT) - Number(b.label === NO_ACCOUNT) || a.label.localeCompare(b.label, "pt-BR");

/** Sums the rows by conta, sorted by byLabel. */
function byAccount(rows: LedgerRow[]): ReportLine[] {
  const lines = new Map<string, ReportLine>();
  for (const r of rows) {
    const label = accountLabel(r);
    const line = lines.get(label) ?? { label, amountBrl: 0, locked: r.locked };
    line.amountBrl = cents(line.amountBrl + r.amountBrl);
    lines.set(label, line);
  }
  return [...lines.values()].sort(byLabel);
}

const total = (lines: { amountBrl: number }[]): number => cents(lines.reduce((sum, l) => sum + l.amountBrl, 0));

/** The lançamentos of a tipo by grupo, in groupsOf order; an id that names no grupo any more comes last. */
function byGroup(rows: LedgerRow[], kind: GroupKind, groups: readonly PlanGroup[]): GroupLine[] {
  const ofKind = rows.filter((r) => r.kind === kind);
  const known = groupsOf(groups, kind, { archived: true });
  const rank = (id: string): number => {
    const i = known.findIndex((g) => g.id === id);
    return i === -1 ? known.length : i;
  };
  return [...new Set(ofKind.map((r) => r.group))]
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => {
      const accounts = byAccount(ofKind.filter((r) => r.group === key));
      return { key, label: groupLabel(key, groups), amountBrl: total(accounts), accounts };
    });
}

export function groupsReport(inputs: LedgerInputs, period: Period, regime: Regime, todayIso: string): GroupsReport {
  const rows =
    regime === "accrual"
      ? ledgerRows(inputs, period, todayIso)
      : ledgerRows(inputs, ALL_TIME, todayIso).filter((r) => r.paidAt !== null && inPeriod(r.paidAt, period));

  const sales = total(rows.filter((r) => r.kind === "sale"));
  const revenues: GroupLine[] = [
    ...(sales !== 0 ? [{ key: "venda-de-gado", label: "Venda de gado", amountBrl: sales, accounts: [], locked: true }] : []),
    ...byGroup(rows, "revenue", inputs.planGroups),
  ];
  const expenses = byGroup(rows, "expense", inputs.planGroups);

  const capital = CAPITAL_ORDER.flatMap((key): CapitalLine[] => {
    const inGroup = rows.filter((r) => CAPITAL_KEY[r.kind] === key);
    if (inGroup.length === 0) return [];
    const accounts = new Map<string, CapitalLine["accounts"][number]>();
    for (const r of inGroup) {
      const label = accountLabel(r);
      const line = accounts.get(label) ?? { label, inBrl: 0, outBrl: 0, locked: r.locked };
      if (r.inflow) line.inBrl = cents(line.inBrl + r.amountBrl);
      else line.outBrl = cents(line.outBrl + r.amountBrl);
      accounts.set(label, line);
    }
    const lines = [...accounts.values()].sort(byLabel);
    return [
      {
        key,
        label: CAPITAL_LABEL[key],
        inBrl: cents(lines.reduce((sum, l) => sum + l.inBrl, 0)),
        outBrl: cents(lines.reduce((sum, l) => sum + l.outBrl, 0)),
        accounts: lines,
      },
    ];
  });

  const revenueTotal = total(revenues);
  const expenseTotal = total(expenses);
  return { revenues, revenueTotal, expenses, expenseTotal, balance: cents(revenueTotal - expenseTotal), capital };
}
```

`lib/export/datasets/finance.ts` — **Replace**

```ts
import type { Category, Expense, ExpenseGroup } from "@/lib/types";
```

with

```ts
import type { Category, Expense, PlanGroup } from "@/lib/types";
```

`lib/export/datasets/finance.ts` — **Replace**

```ts
import { benchmark, type BenchmarkKey } from "@/lib/domain/benchmarks";
```

with

```ts
import { benchmark, type BenchmarkKey } from "@/lib/domain/benchmarks";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```

`lib/export/datasets/finance.ts` — **Replace**

```ts
 * are left out. `expenseGroups` names the farm's grupos.
 */
export function expensesExportTable(
  expenses: readonly Expense[],
  title = "Despesas",
  expenseGroups: readonly ExpenseGroup[] = []
): ExportTable {
```

with

```ts
 * are left out. `planGroups` names the grupos.
 */
export function expensesExportTable(
  expenses: readonly Expense[],
  title: string,
  planGroups: readonly PlanGroup[]
): ExportTable {
  const label = (e: Expense): string => {
    const group = entryGroup(e);
    // Only a rendimento has no grupo: it reads as the ledger reads it.
    return group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, planGroups);
  };
```

`lib/export/datasets/finance.ts` — **Replace**

```ts
      { header: "Categoria", value: (e) => groupLabel(e.category, expenseGroups) },
```

with

```ts
      { header: "Categoria", value: label },
```

- [ ] **Step 20: Run the tests**

Run: `./node_modules/.bin/vitest run lib/reports/__tests__/groups.test.ts lib/reports/__tests__/bankStatement.test.ts lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 21: Run every reader's tests together**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/budget.test.ts lib/domain/__tests__/planTree.test.ts lib/reports/__tests__ lib/export/__tests__ lib/store/__tests__/dashboard.test.ts --exclude '**/worktrees/**'`
Expected: PASS (25 files).

- [ ] **Step 22: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint lib/domain/economics.ts lib/domain/lotEconomics.ts lib/domain/ledger.ts lib/domain/budget.ts lib/domain/planTree.ts lib/reports/groups.ts lib/export/datasets/finance.ts lib/domain/__tests__/economics.test.ts lib/domain/__tests__/lotEconomics.test.ts lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/budget.test.ts lib/domain/__tests__/planTree.test.ts lib/reports/__tests__/groups.test.ts lib/reports/__tests__/bankStatement.test.ts lib/export/__tests__/finance.test.ts`
Expected: eslint clean. `tsc` reports nothing in this task's files. Verified after tasks 1–5: 68 errors in exactly these 24 files, all task 6's or task 7's (per-file counts): task 6 — `app/(app)/dashboard/page.tsx` 2, `app/(app)/finance/page.tsx` 7, `components/dashboard/FinanceCard.tsx` 1, `components/finance/BillsCard.tsx` 1, `components/finance/CapitalStrip.tsx` 3, `components/finance/CostBreakdownCard.tsx` 2, `components/finance/SeriesScopeDialog.tsx` 1, `components/finance/contas/AccountMovements.tsx` 2, `components/finance/contas/ConciliarPage.tsx` 1, `components/finance/lancamentos/EntryDetailDialog.tsx` 2, `components/finance/lancamentos/LancamentosPage.tsx` 3, `components/finance/lancamentos/__tests__/legacySearch.test.ts` 1, `components/finance/lancamentos/useEntryActions.tsx` 1, `components/finance/orcamento/BudgetEditDialog.tsx` 5, `components/finance/orcamento/OrcamentoPage.tsx` 4, `components/reports/__tests__/tables.test.ts` 3, `components/reports/datasets.ts` 1, `components/reports/useReportData.ts` 2; task 7 — `components/finance/EntryDialog.tsx` 7, `components/finance/entryFields.ts` 4, `components/finance/plano/AccountsPage.tsx` 8, `components/finance/plano/GroupHeader.tsx` 3, `components/finance/plano/NewAccountDialog.tsx` 3, `components/finance/plano/NewGroupDialog.tsx` 1. (`app/(app)/relatorios/**` and `entryActions.test.ts` compile.) Full vitest after tasks 1–5: 3 files / 11 tests red — task 6's `legacySearch.test.ts` (4) and `components/reports/__tests__/datasets.test.ts` (3: `datasets.ts` still calls `expensesExportTable` without `planGroups`), task 7's `components/finance/__tests__/entryFields.test.ts` (4); `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts` passes now.

---

### Task 6: Finance screens

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/finance/page.tsx`
- Modify: `app/(app)/relatorios/grupos/page.tsx`
- Modify: `components/dashboard/FinanceCard.tsx`
- Modify: `components/finance/BillsCard.tsx`
- Modify: `components/finance/CapitalStrip.tsx`
- Modify: `components/finance/CostBreakdownCard.tsx` (whole file)
- Modify: `components/finance/SeriesScopeDialog.tsx`
- Modify: `components/finance/YieldDialog.tsx`
- Modify: `components/finance/contas/AccountMovements.tsx`
- Modify: `components/finance/contas/ConciliarPage.tsx`
- Modify: `components/finance/lancamentos/EntryDetailDialog.tsx` (drop the `treatment` icon and label)
- Modify: `components/finance/lancamentos/LancamentosPage.tsx`
- Modify: `components/finance/lancamentos/PaneRows.tsx`
- Modify: `components/finance/lancamentos/PlanTreeNav.tsx` (header comment only)
- Modify: `components/finance/lancamentos/useEntryActions.tsx`
- Modify: `components/finance/orcamento/OrcamentoPage.tsx`
- Modify: `components/finance/orcamento/BudgetEditDialog.tsx`
- Modify: `components/finance/orcamento/CopyDialog.tsx` (comment only)
- Modify: `components/reports/GroupsSheet.tsx`
- Modify: `components/reports/datasets.ts`
- Modify: `components/reports/tables.ts`
- Modify: `components/reports/useReportData.ts` (whole file)
- Test: `components/reports/__tests__/tables.test.ts`
- Test: `components/reports/__tests__/datasets.test.ts`
- Test: `components/finance/lancamentos/__tests__/legacySearch.test.ts` (whole file)
- Test: `components/finance/lancamentos/__tests__/entryActions.test.ts` (fixture keys only)

Not touched, they compile as they are: `legacySearch.ts`, `NodePane.tsx`, `LancamentosToolbar.tsx` (they pass a `PlanNode` along or read `LedgerRow.groupLabel`), `app/(app)/relatorios/page.tsx` and the other report pages (they read `usePlanInputs()`), `components/lots/**`, `components/animal/**` (none of them reads a finance input).

**Interfaces:**
- Consumes:
  - task 1, `@/lib/types`: `PlanGroup { id; kind: GroupKind; name; archivedAt?; createdAt }`, `Expense.category?: string`, `HerdData.planGroups?: PlanGroup[]`.
  - task 1, `@/lib/domain/groups`: `GROUP_KIND_LABEL: Record<GroupKind, string>`, `groupsOf(groups, kind, opts?: { archived?: boolean; keep?: string }): PlanGroup[]`, `groupLabel(id: string, groups: readonly PlanGroup[]): string`, `groupKind(id: string, groups: readonly PlanGroup[]): GroupKind | null`.
  - task 1, store state: `useHerdStore((s) => s.planGroups): PlanGroup[]`; `addExpense(e: Omit<Expense, "id">, repeat?)` (with `category` optional).
  - task 5, `@/lib/domain/economics`: `EconomicsInputs { animals; manejoSessions; movements; expenses; invernadas; lots }`, `monthlyRevenueCost(movements, expenses, months, refIso)`, `costBreakdownBetween(expenses, startIso, endIso): CostBreakdownSlice[]` (`slice.category` is a grupo id).
  - task 5, `@/lib/domain/ledger`: `LedgerInputs { expenses; accounts; movements; manejoSessions; animals; lots; planGroups }`, `ledgerRows`, `cashSummary(input: Pick<LedgerInputs, "expenses" | "movements">, period, todayIso)`.
  - task 5, `@/lib/domain/budget`: `BudgetInputs { budgets; expenses; accounts; planGroups }`, `budgetView`, `copyPlan`.
  - task 5, `@/lib/domain/planTree`: `PlanNode` with `{ type: "kind"; kind: GroupKind }` and `{ type: "group"; id: string }`, `nodeParam`, `parseNode`, `legacyNode`, `nodeSummary`, `planTree` (collapse rule), `capitalSummary`, `PlanInputs = LedgerInputs & { bankAccounts; transfers }`, and `entryInitialFor(node: PlanNode, accounts: Account[], bankAccounts: BankAccount[], planGroups: readonly PlanGroup[]): EntryInitial` (the fourth argument is what makes "Novo" on a grupo or a conta start in its grupo's tipo).
  - task 5, `@/lib/reports/groups`: `GroupLine { key; label; amountBrl; accounts: ReportLine[]; locked?: boolean }`, `GroupsReport.revenues: GroupLine[]` (Venda de gado first, `locked: true`, `accounts: []`).
  - task 5, `@/lib/export/datasets/finance`: `expensesExportTable(expenses, title, planGroups: readonly PlanGroup[])`.
- Produces:
  - `groupsRevenueTable(report: GroupsReport, withAccounts: boolean): TotaledTable` and `groupsExpenseTable(report: GroupsReport, withAccounts: boolean): TotaledTable` (`components/reports/tables.ts`): with `withAccounts` and at most one grupo besides the locked line, the grupo's header row goes and its contas are top-level rows (no `subRows`).
  - `useReportData()` now carries `planGroups` in its `HerdData`.

- [ ] **Step 1: Write the failing tests**

Replace in `components/reports/__tests__/tables.test.ts`:

```ts
const GROUPS: GroupsReport = {
  revenues: [{ label: "Venda de gado", amountBrl: 1000, locked: true }],
  revenueTotal: 1000,
  expenses: [
    {
      key: "nutrition",
      label: "Nutrição",
      custom: false,
      amountBrl: 300,
      accounts: [
        { label: "Ração e suplemento", amountBrl: 100, locked: false },
        { label: "Sal mineral", amountBrl: 200, locked: false },
      ],
    },
    { key: "other", label: "Outros", custom: false, amountBrl: 100, accounts: [{ label: "Sem conta", amountBrl: 100, locked: false }] },
  ],
  expenseTotal: 400,
  balance: 600,
```

with:

```ts
const GROUPS: GroupsReport = {
  revenues: [
    { key: "venda-de-gado", label: "Venda de gado", amountBrl: 1000, accounts: [], locked: true },
    {
      key: "grp-receitas",
      label: "Receitas",
      amountBrl: 250,
      accounts: [
        { label: "Arrendamento", amountBrl: 200, locked: false },
        { label: "Sem conta", amountBrl: 50, locked: false },
      ],
    },
  ],
  revenueTotal: 1250,
  expenses: [
    {
      key: "grp-nutricao",
      label: "Nutrição",
      amountBrl: 300,
      accounts: [
        { label: "Ração e suplemento", amountBrl: 100, locked: false },
        { label: "Sal mineral", amountBrl: 200, locked: false },
      ],
    },
    { key: "grp-outros", label: "Outros", amountBrl: 100, accounts: [{ label: "Sem conta", amountBrl: 100, locked: false }] },
  ],
  expenseTotal: 400,
  balance: 850,
```

Replace in `components/reports/__tests__/tables.test.ts`:

```ts
describe("groups tables", () => {
  it("gives each receita its share of the receita", () => {
    const { table, totals } = groupsRevenueTable(GROUPS);
    expect(table.rows).toEqual([["Venda de gado", 1000, 100]]);
    expect(totals).toEqual(["Total de receitas", 1000, 100]);
  });

  it("lists the grupos with their share of the despesas and of the receita", () => {
    const { table, totals, subRows } = groupsExpenseTable(GROUPS, false);
    expect(table.rows).toEqual([
      ["Nutrição", 300, 75, 30],
      ["Outros", 100, 25, 10],
    ]);
    expect(totals).toEqual(["Total de despesas", 400, 100, 40]);
    expect(subRows).toBeUndefined();
  });

  it("opens each grupo into its contas, marking them as sub-rows", () => {
    const { table, subRows } = groupsExpenseTable(GROUPS, true);
    expect(table.columns[0].header).toBe("Grupo / conta");
    expect(table.rows.map((r) => r[0])).toEqual(["Nutrição", "Ração e suplemento", "Sal mineral", "Outros", "Sem conta"]);
    expect([...(subRows ?? [])]).toEqual([1, 2, 4]);
  });
```

with:

```ts
describe("groups tables", () => {
  it("gives Venda de gado and each receita grupo its share of the receita", () => {
    const { table, totals, subRows } = groupsRevenueTable(GROUPS, false);
    expect(table.columns[0].header).toBe("Grupo");
    expect(table.rows).toEqual([
      ["Venda de gado", 1000, 80],
      ["Receitas", 250, 20],
    ]);
    expect(totals).toEqual(["Total de receitas", 1250, 100]);
    expect(subRows).toBeUndefined();
  });

  it("lists the contas of the only receita grupo without its header, Venda de gado on its own", () => {
    const { table, subRows } = groupsRevenueTable(GROUPS, true);
    expect(table.columns[0].header).toBe("Grupo / conta");
    expect(table.rows).toEqual([
      ["Venda de gado", 1000, 80],
      ["Arrendamento", 200, 16],
      ["Sem conta", 50, 4],
    ]);
    expect([...(subRows ?? [])]).toEqual([]);
  });

  it("opens each receita grupo under its header when there are two", () => {
    const servicos = {
      key: "grp-servicos",
      label: "Serviços",
      amountBrl: 250,
      accounts: [{ label: "Sem conta", amountBrl: 250, locked: false }],
    };
    const report = { ...GROUPS, revenues: [...GROUPS.revenues, servicos], revenueTotal: 1500 };
    const { table, subRows } = groupsRevenueTable(report, true);
    expect(table.rows.map((r) => r[0])).toEqual(["Venda de gado", "Receitas", "Arrendamento", "Sem conta", "Serviços", "Sem conta"]);
    expect([...(subRows ?? [])]).toEqual([2, 3, 5]);
  });

  it("lists the grupos with their share of the despesas and of the receita", () => {
    const { table, totals, subRows } = groupsExpenseTable(GROUPS, false);
    expect(table.rows).toEqual([
      ["Nutrição", 300, 75, 24],
      ["Outros", 100, 25, 8],
    ]);
    expect(totals).toEqual(["Total de despesas", 400, 100, 32]);
    expect(subRows).toBeUndefined();
  });

  it("opens each grupo into its contas, marking them as sub-rows", () => {
    const { table, subRows } = groupsExpenseTable(GROUPS, true);
    expect(table.columns[0].header).toBe("Grupo / conta");
    expect(table.rows.map((r) => r[0])).toEqual(["Nutrição", "Ração e suplemento", "Sal mineral", "Outros", "Sem conta"]);
    expect([...(subRows ?? [])]).toEqual([1, 2, 4]);
  });

  it("lists the contas of the only despesa grupo without its header", () => {
    const report = { ...GROUPS, expenses: [GROUPS.expenses[0]], expenseTotal: 300 };
    const { table, subRows } = groupsExpenseTable(report, true);
    expect(table.rows.map((r) => r[0])).toEqual(["Ração e suplemento", "Sal mineral"]);
    expect([...(subRows ?? [])]).toEqual([]);
  });
```

Replace in `components/reports/__tests__/datasets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { datasetRows, reportDatasets } from "@/components/reports/datasets";
```

with:

```ts
import { describe, expect, it } from "vitest";
import type { PlanGroup } from "@/lib/types";
import { datasetRows, reportDatasets } from "@/components/reports/datasets";
```

Replace in `components/reports/__tests__/datasets.test.ts`:

```ts
const TODAY = "2026-09-22";
```

with:

```ts
const TODAY = "2026-09-22";

const NUTRICAO: PlanGroup = { id: "grp-nutricao", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" };
```

Replace in `components/reports/__tests__/datasets.test.ts`:

```ts
  expenses: [{ id: "e1", kind: "expense", date: "2026-02-01", category: "nutrition", amountBrl: 500 }],
});
```

with:

```ts
  expenses: [{ id: "e1", kind: "expense", date: "2026-02-01", category: NUTRICAO.id, amountBrl: 500 }],
  planGroups: [NUTRICAO],
});
```

Replace in `components/reports/__tests__/datasets.test.ts`:

```ts
  it("offers Touros e sêmen as xlsx only, with two tables", () => {
```

with:

```ts
  it("names each despesa's grupo from the farm's grupos", () => {
    const despesas = reportDatasets(data, TODAY, true).find((d) => d.key === "expenses")!;
    expect(despesas.tables[0].rows[0]).toContain("Nutrição");
  });

  it("offers Touros e sêmen as xlsx only, with two tables", () => {
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run components/reports/__tests__/tables.test.ts components/reports/__tests__/datasets.test.ts --exclude '**/worktrees/**'`
Expected: FAIL, 8 tests — four in `tables.test.ts` (`groupsRevenueTable` heads the column "Conta" and lists the revenues without their contas; a single despesa grupo keeps its header) and every `reportDatasets` case in `datasets.test.ts` with `TypeError: Cannot read properties of undefined (reading 'find')`: `reportDatasets` passes `data.expenseGroups`, which no longer exists, to `groupLabel`.

- [ ] **Step 3: Implement the report tables, the planilha and the report inputs**

Replace in `components/reports/tables.ts`:

```ts
import type { GroupsReport } from "@/lib/reports/groups";
```

with:

```ts
import type { GroupLine, GroupsReport } from "@/lib/reports/groups";
```

Replace in `components/reports/tables.ts`:

```ts
/** The receitas by conta, with their share of the receita. */
export function groupsRevenueTable(report: GroupsReport): TotaledTable {
  const table = buildTable<GroupsReport["revenues"][number]>(
    "Receitas",
    [
      { header: "Conta", value: (r) => r.label },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "%", kind: "number", decimals: 2, value: (r) => sharePct(r.amountBrl, report.revenueTotal) },
    ],
    report.revenues
  );
  return { table, totals: ["Total de receitas", report.revenueTotal, sharePct(report.revenueTotal, report.revenueTotal)] };
}

/** The despesas by grupo with their share of the despesas and of the receita; `withAccounts` opens each grupo into its contas. */
export function groupsExpenseTable(report: GroupsReport, withAccounts: boolean): TotaledTable {
  const lines: { label: string; amountBrl: number }[] = [];
  const subRows = new Set<number>();
  for (const group of report.expenses) {
    lines.push(group);
    if (!withAccounts) continue;
    for (const account of group.accounts) {
      subRows.add(lines.length);
      lines.push(account);
    }
  }
  const table = buildTable<{ label: string; amountBrl: number }>(
    "Despesas",
    [
      { header: withAccounts ? "Grupo / conta" : "Grupo", value: (r) => r.label },
```

with:

```ts
interface AmountLine {
  label: string;
  amountBrl: number;
}

/**
 * A tipo's grupos as table lines: each grupo, then its contas when `withAccounts`, which open it (sub-rows).
 * A locked line (Venda de gado) has no contas. With at most one grupo besides it the grupo's header goes and
 * its contas stand on their own, so a farm that keeps the defaults does not read "Receitas › Receitas".
 */
function groupLines(groups: readonly GroupLine[], withAccounts: boolean): { lines: AmountLine[]; subRows?: Set<number> } {
  if (!withAccounts) return { lines: [...groups] };
  const flat = groups.filter((g) => !g.locked).length <= 1;
  const lines: AmountLine[] = [];
  const subRows = new Set<number>();
  for (const group of groups) {
    if (group.locked || !flat) lines.push(group);
    for (const account of group.accounts) {
      if (!flat) subRows.add(lines.length);
      lines.push(account);
    }
  }
  return { lines, subRows };
}

/** The receitas by grupo, Venda de gado on its own line, with their share of the receita; `withAccounts` opens each grupo into its contas. */
export function groupsRevenueTable(report: GroupsReport, withAccounts: boolean): TotaledTable {
  const { lines, subRows } = groupLines(report.revenues, withAccounts);
  const table = buildTable<AmountLine>(
    "Receitas",
    [
      { header: withAccounts ? "Grupo / conta" : "Grupo", value: (r) => r.label },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "%", kind: "number", decimals: 2, value: (r) => sharePct(r.amountBrl, report.revenueTotal) },
    ],
    lines
  );
  return {
    table,
    totals: ["Total de receitas", report.revenueTotal, sharePct(report.revenueTotal, report.revenueTotal)],
    subRows,
  };
}

/** The despesas by grupo with their share of the despesas and of the receita; `withAccounts` opens each grupo into its contas. */
export function groupsExpenseTable(report: GroupsReport, withAccounts: boolean): TotaledTable {
  const { lines, subRows } = groupLines(report.expenses, withAccounts);
  const table = buildTable<AmountLine>(
    "Despesas",
    [
      { header: withAccounts ? "Grupo / conta" : "Grupo", value: (r) => r.label },
```

Replace in `components/reports/tables.ts`:

```ts
      sharePct(report.expenseTotal, report.revenueTotal),
    ],
    subRows: withAccounts ? subRows : undefined,
  };
}
```

with:

```ts
      sharePct(report.expenseTotal, report.revenueTotal),
    ],
    subRows,
  };
}
```

Replace in `components/reports/datasets.ts`:

```ts
      ...one("expenses", "Despesas", expensesExportTable(data.expenses, "Despesas", data.expenseGroups)),
```

with:

```ts
      ...one("expenses", "Despesas", expensesExportTable(data.expenses, "Despesas", data.planGroups ?? [])),
```

Replace the whole file `components/reports/useReportData.ts` with:

```ts
"use client";

/**
 * The farm's data as one HerdData, for the report selectors, rebuilt only
 * when a part of it changes; and the financial reports' inputs the same way.
 */
import { useMemo } from "react";
import type { HerdData } from "@/lib/types";
import type { PlanInputs } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";

export function useReportData(): HerdData {
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const movements = useHerdStore((s) => s.movements);
  const breeds = useHerdStore((s) => s.breeds);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
  const customCategories = useHerdStore((s) => s.customCategories);
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const farm = useHerdStore((s) => s.farm);
  return useMemo(
    () => ({
      animals,
      treatments,
      lots,
      invernadas,
      lotPlacements,
      movements,
      breeds,
      manejoSessions,
      expenses,
      accounts,
      planGroups,
      customCategories,
      semenBulls,
      farm,
    }),
    [
      animals,
      treatments,
      lots,
      invernadas,
      lotPlacements,
      movements,
      breeds,
      manejoSessions,
      expenses,
      accounts,
      planGroups,
      customCategories,
      semenBulls,
      farm,
    ]
  );
}

/** The ledger's inputs plus the contas bancárias and transferências: what the financial reports read. */
export function usePlanInputs(): PlanInputs {
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const planGroups = useHerdStore((s) => s.planGroups);
  return useMemo(
    () => ({ expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups }),
    [expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups]
  );
}
```

Replace in `components/reports/GroupsSheet.tsx`:

```tsx
/**
 * Receitas e despesas por grupo on A4: the figures, the receitas by conta, the
 * despesas by grupo (or grupo and conta), the saldo, and optionally what moved
 * outside the resultado, with a note on what the regime takes.
 */
```

with:

```tsx
/**
 * Receitas e despesas por grupo on A4: the figures, the receitas and the
 * despesas by grupo (or grupo and conta; a tipo with a single grupo lists its
 * contas without the grupo), the saldo, and optionally what moved outside the
 * resultado, with a note on what the regime takes.
 */
```

Replace in `components/reports/GroupsSheet.tsx`:

```tsx
  const revenues = groupsRevenueTable(report);
```

with:

```tsx
  const revenues = groupsRevenueTable(report, options.accounts);
```

Replace in `components/reports/GroupsSheet.tsx`:

```tsx
      <PrintSection title="Receitas" note="por conta">
        {report.revenues.length > 0 ? (
          <PrintTable table={revenues.table} totals={revenues.totals} />
```

with:

```tsx
      <PrintSection title="Receitas" note={options.accounts ? "por grupo e conta" : "por grupo"}>
        {report.revenues.length > 0 ? (
          <PrintTable table={revenues.table} totals={revenues.totals} subRows={revenues.subRows} />
```

Replace in `components/reports/GroupsSheet.tsx`:

```tsx
        {REGIME_NOTE[regime]} Vendas e compras de gado entram pela data do manejo; tratamentos com custo, pela data da
        aplicação, em Sanidade.
```

with:

```tsx
        {REGIME_NOTE[regime]} Vendas e compras de gado entram pela data do manejo.
```

Replace in `app/(app)/relatorios/grupos/page.tsx`:

```tsx
 * Receitas e despesas por grupo (/relatorios/grupos): the window's receitas by
 * conta and despesas by grupo with the saldo, by competência or caixa, for the
 * contador and the sócios. Needs Financeiro view.
```

with:

```tsx
 * Receitas e despesas por grupo (/relatorios/grupos): the window's receitas and
 * despesas by grupo with the saldo, by competência or caixa, for the contador
 * and the sócios. Needs Financeiro view.
```

Replace in `app/(app)/relatorios/grupos/page.tsx`:

```tsx
    const tables = [withTotalsRow(groupsRevenueTable(report)), withTotalsRow(groupsExpenseTable(report, options.accounts))];
```

with:

```tsx
    const tables = [
      withTotalsRow(groupsRevenueTable(report, options.accounts)),
      withTotalsRow(groupsExpenseTable(report, options.accounts)),
    ];
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run components/reports/__tests__/tables.test.ts components/reports/__tests__/datasets.test.ts --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 5: Update the Lançamentos tests**

`legacySearch.ts` itself does not change: `legacyNode`, `nodeParam` and `nodeSummary` (task 5) now give the kind and grupo nós, and the test follows them.

Replace the whole file `components/finance/lancamentos/__tests__/legacySearch.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { Account, PlanGroup } from "@/lib/types";
import type { PlanInputs } from "@/lib/domain/planTree";
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

  it("turns an old tipo into its tipo or automatic line", () => {
    expect(query({ tipo: "expense" })).toEqual({ conta: "despesas" });
    expect(query({ tipo: "revenue" })).toEqual({ conta: "receitas" });
    expect(query({ tipo: "sale" })).toEqual({ conta: "venda-de-gado" });
    expect(query({ tipo: "purchase" })).toEqual({ conta: "compra-de-gado" });
  });

  it("drops the old grupo keys and tipo=treatment: they name nothing now", () => {
    for (const old of [{ grupo: "capital" }, { grupo: "nutrition" }, { grupo: "revenue" }, { tipo: "treatment" }]) {
      expect(query(old)).toEqual({});
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

const NUTRICAO: PlanGroup = { id: "grp-nutricao", kind: "expense", name: "Nutrição", createdAt: "2026-01-01T00:00:00.000Z" };
const sal: Account = { id: "acc-1", group: NUTRICAO.id, name: "Sal mineral" };
const inputs: PlanInputs = {
  expenses: [],
  accounts: [sal],
  movements: [],
  manejoSessions: [],
  animals: [],
  lots: [],
  bankAccounts: [],
  transfers: [],
  planGroups: [NUTRICAO],
};
const period = { start: "2025-10-01", end: "2026-09-30" };
const TODAY = "2026-09-30";

describe("resolveNode", () => {
  it("falls back to todos when conta is absent, malformed or gone", () => {
    for (const param of [null, "", "nope", "banco:", "grupo:", "conta:deleted"]) {
      const resolved = resolveNode(param, inputs, period, TODAY);
      expect(resolved.picked).toBeNull();
      expect(resolved.node).toEqual({ type: "all" });
      expect(resolved.summary.figures).toHaveLength(4);
    }
  });

  it("picks a tipo, a grupo and a conta that exist", () => {
    expect(resolveNode("despesas", inputs, period, TODAY).picked).toEqual({ type: "kind", kind: "expense" });
    const grupo = resolveNode(`grupo:${NUTRICAO.id}`, inputs, period, TODAY);
    expect(grupo.picked).toEqual({ type: "group", id: NUTRICAO.id });
    expect(grupo.summary).toMatchObject({ crumb: "Despesas", title: "Nutrição" });
    const conta = resolveNode("conta:acc-1", inputs, period, TODAY);
    expect(conta.picked).toEqual({ type: "account", id: "acc-1" });
    expect(conta.node).toEqual({ type: "account", id: "acc-1" });
    expect(conta.summary.title).toBe("Sal mineral");
  });

  it("opens a grupo id that names no grupo as an empty Grupo removido", () => {
    const gone = resolveNode("grupo:nope", inputs, period, TODAY);
    expect(gone.picked).toEqual({ type: "group", id: "nope" });
    expect(gone.summary.title).toBe("Grupo removido");
  });
});
```

Replace in `components/finance/lancamentos/__tests__/entryActions.test.ts`:

```ts
const carreta: Expense = { id: "e1", kind: "investment", flow: "out", date: "2026-09-05", category: "other", amountBrl: 19500 };
```

with:

```ts
const carreta: Expense = {
  id: "e1",
  kind: "investment",
  flow: "out",
  date: "2026-09-05",
  category: "grp-investimentos",
  amountBrl: 19500,
};
```

Replace in `components/finance/lancamentos/__tests__/entryActions.test.ts`:

```ts
    group: "investment",
```

with:

```ts
    group: "grp-investimentos",
```

Run: `./node_modules/.bin/vitest run components/finance/lancamentos/__tests__ --exclude '**/worktrees/**'`
Expected: PASS (the behaviour comes from task 5's `planTree.ts`; nothing in `legacySearch.ts` changes).

- [ ] **Step 6: Lançamentos screens**

Replace in `components/finance/lancamentos/LancamentosPage.tsx`:

```tsx
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const inputs = useMemo<PlanInputs>(
    () => ({
      expenses,
      accounts,
      movements,
      manejoSessions,
      animals,
      treatments,
      lots,
      bankAccounts,
      transfers,
      expenseGroups,
    }),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers, expenseGroups]
  );
```

with:

```tsx
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const planGroups = useHerdStore((s) => s.planGroups);
  const inputs = useMemo<PlanInputs>(
    () => ({ expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups }),
    [expenses, accounts, movements, manejoSessions, animals, lots, bankAccounts, transfers, planGroups]
  );
```

Replace in `components/finance/lancamentos/LancamentosPage.tsx`:

```tsx
            <EntryDialog open onOpenChange={setEntering} initial={entryInitialFor(node, accounts, bankAccounts)} />
```

with:

```tsx
            <EntryDialog
              open
              onOpenChange={setEntering}
              initial={entryInitialFor(node, accounts, bankAccounts, planGroups)}
            />
```

`EntryDetailDialog.tsx` still maps the ledger kind `"treatment"` that task 5 removed from `LedgerKind`.

Replace in `components/finance/lancamentos/EntryDetailDialog.tsx`:

```tsx
  Receipt,
  Syringe,
  Tractor,
```

with:

```tsx
  Receipt,
  Tractor,
```

Replace in `components/finance/lancamentos/EntryDetailDialog.tsx`:

```tsx
  purchase: Beef,
  treatment: Syringe,
};
```

with:

```tsx
  purchase: Beef,
};
```

Replace in `components/finance/lancamentos/EntryDetailDialog.tsx`:

```tsx
  purchase: "Compra de gado",
  treatment: "Sanidade",
};
```

with:

```tsx
  purchase: "Compra de gado",
};
```

Replace in `components/finance/lancamentos/useEntryActions.tsx`:

```tsx
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
```

with:

```tsx
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/lancamentos/useEntryActions.tsx`:

```tsx
        <EntryDialog open onOpenChange={close} initial={entryInitialFor(node, accounts, bankAccounts)} />
```

with:

```tsx
        <EntryDialog open onOpenChange={close} initial={entryInitialFor(node, accounts, bankAccounts, planGroups)} />
```

Replace in `components/finance/lancamentos/PaneRows.tsx`:

```tsx
import { formatNumber } from "@/lib/domain/format";
```

with:

```tsx
import { formatNumber } from "@/lib/domain/format";
import { groupKind } from "@/lib/domain/groups";
```

Replace in `components/finance/lancamentos/PaneRows.tsx`:

```tsx
  const accounts = useHerdStore((s) => s.accounts);
```

with:

```tsx
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/lancamentos/PaneRows.tsx`:

```tsx
  const accountId = node.type === "account" ? node.id : null;
  const last =
    node.type === "bank"
      ? "Saldo (R$)"
      : accounts.find((a) => a.id === accountId)?.group === "financing"
        ? "Saldo devedor"
        : "Status";
```

with:

```tsx
  const accountGroup = node.type === "account" ? accounts.find((a) => a.id === node.id)?.group : undefined;
  const last =
    node.type === "bank"
      ? "Saldo (R$)"
      : accountGroup !== undefined && groupKind(accountGroup, planGroups) === "financing"
        ? "Saldo devedor"
        : "Status";
```

Replace in `components/finance/lancamentos/PlanTreeNav.tsx`:

```tsx
 * The plano de contas, the left column of Lançamentos: a search by name,
 * "Todos os lançamentos" and the six groups with their figure for the window.
 * Each row is a link that picks its nó (the URL's `conta`); the groups and the
 * grupos of Despesas open and close in place, the path to the picked nó
 * starting open. "+" opens Nova conta and the gear goes to Configurações.
```

with:

```tsx
 * The plano de contas, the left column of Lançamentos: a search by name,
 * "Todos os lançamentos", Bancos e caixa and the five tipos with their figure
 * for the window. Each row is a link that picks its nó (the URL's `conta`); a
 * tipo opens into its grupos and a grupo into its contas (a tipo with a single
 * grupo lists the contas itself), in place, the path to the picked nó
 * starting open. "+" opens Nova conta and the gear goes to Configurações.
```

Replace in `components/finance/CapitalStrip.tsx`:

```tsx
      node: { type: "group", group: "investment" },
```

with:

```tsx
      node: { type: "kind", kind: "investment" },
```

Replace in `components/finance/CapitalStrip.tsx`:

```tsx
      node: { type: "group", group: "financing" },
```

with:

```tsx
      node: { type: "kind", kind: "financing" },
```

Replace in `components/finance/CapitalStrip.tsx`:

```tsx
      node: { type: "group", group: "partners" },
```

with:

```tsx
      node: { type: "kind", kind: "partners" },
```

- [ ] **Step 7: Painel, Financeiro and the cards**

Replace in `app/(app)/dashboard/page.tsx`:

```tsx
      filterMonthlyByPeriod(monthlyRevenueCost(movements, treatments, expenses, 12, today), period),
    [movements, treatments, expenses, today, period]
```

with:

```tsx
      filterMonthlyByPeriod(monthlyRevenueCost(movements, expenses, 12, today), period),
    [movements, expenses, today, period]
```

Replace in `app/(app)/dashboard/page.tsx`:

```tsx
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
```

with:

```tsx
    () => costBreakdownBetween(expenses, period.start, period.end),
    [expenses, period]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
  const treatments = useHerdStore((s) => s.treatments);
  const expenses = useHerdStore((s) => s.expenses);
```

with:

```tsx
  const expenses = useHerdStore((s) => s.expenses);
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
    () => ({ animals, manejoSessions, movements, treatments, expenses, invernadas, lots }),
    [animals, manejoSessions, movements, treatments, expenses, invernadas, lots]
```

with:

```tsx
    () => ({ animals, manejoSessions, movements, expenses, invernadas, lots }),
    [animals, manejoSessions, movements, expenses, invernadas, lots]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
    () => cashSummary({ expenses, movements, treatments }, period, today),
    [expenses, movements, treatments, period, today]
  );
  const rows = useMemo(
    () => ledgerRows({ ...inputs, accounts, expenseGroups }, period, today),
    [inputs, accounts, expenseGroups, period, today]
```

with:

```tsx
    () => cashSummary({ expenses, movements }, period, today),
    [expenses, movements, period, today]
  );
  const rows = useMemo(
    () => ledgerRows({ ...inputs, accounts, planGroups }, period, today),
    [inputs, accounts, planGroups, period, today]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
        movements.filter((m) => inPeriod(m.date, period)),
        treatments.filter((t) => inPeriod(t.date, period)),
        expenses.filter((e) => inPeriod(e.date, period)),
        monthsSpanned(period),
        period.end
      ),
    [movements, treatments, expenses, period]
  );
  const breakdown = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
```

with:

```tsx
        movements.filter((m) => inPeriod(m.date, period)),
        expenses.filter((e) => inPeriod(e.date, period)),
        monthsSpanned(period),
        period.end
      ),
    [movements, expenses, period]
  );
  const breakdown = useMemo(
    () => costBreakdownBetween(expenses, period.start, period.end),
    [expenses, period]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers, expenseGroups }, period, today),
    [inputs, accounts, bankAccounts, transfers, expenseGroups, period, today]
```

with:

```tsx
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers, planGroups }, period, today),
    [inputs, accounts, bankAccounts, transfers, planGroups, period, today]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
        ? budgetView({ budgets, expenses, treatments, accounts, expenseGroups }, safra, safraStartMonth, today)
        : null,
    [budgets, expenses, treatments, accounts, expenseGroups, safra, safraStartMonth, today]
```

with:

```tsx
        ? budgetView({ budgets, expenses, accounts, planGroups }, safra, safraStartMonth, today)
        : null,
    [budgets, expenses, accounts, planGroups, safra, safraStartMonth, today]
```

Replace in `app/(app)/finance/page.tsx`:

```tsx
            expenses={expenses}
            treatments={treatments}
            accounts={accounts}
```

with:

```tsx
            expenses={expenses}
            accounts={accounts}
```

Replace the whole file `components/finance/CostBreakdownCard.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import type { Account, Expense, ExpenseCategory } from "@/lib/types";
import type { CostBreakdownSlice } from "@/lib/domain/economics";
import { accountName } from "@/lib/domain/accounts";
import { isCost } from "@/lib/domain/entries";
import { inPeriod, periodSearch, type Period } from "@/lib/domain/period";
import { nodeParam } from "@/lib/domain/planTree";
import { groupLabel } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
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
  accounts: Account[];
  period: Period;
}

/** The grupo's despesas in the window by conta ("Sem conta" when none). */
function accountTotals(
  category: ExpenseCategory,
  expenses: Expense[],
  accounts: Account[],
  period: Period
): { label: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (!isCost(expense) || expense.category !== category) continue;
    if (!inPeriod(expense.date, period)) continue;
    const label = accountName(expense.accountId, accounts) ?? "Sem conta";
    totals.set(label, (totals.get(label) ?? 0) + expense.amountBrl);
  }
  return [...totals]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** COE by grupo; a grupo opens to its contas, the largest open by default. */
export function CostBreakdownCard({ breakdown, expenses, accounts, period }: CostBreakdownCardProps) {
  const planGroups = useHerdStore((s) => s.planGroups);
  // null = the default (largest open); "none" = the user closed every grupo.
  const [picked, setPicked] = useState<ExpenseCategory | "none" | null>(null);
  // A picked grupo with no cost in this window falls back to the largest.
  const openSlice =
    picked === "none"
      ? null
      : (breakdown.find((slice) => slice.category === picked) ?? breakdown[0] ?? null);
  const open = openSlice?.category ?? null;
  const total = breakdown.reduce((sum, slice) => sum + slice.amountBrl, 0);
  const largest = Math.max(1, ...breakdown.map((slice) => slice.amountBrl));
  const byAccount = openSlice ? accountTotals(openSlice.category, expenses, accounts, period) : [];

  // The open grupo's nó, or the whole COE (Despesas) when every grupo is closed.
  const lancamentosHref = `/finance/lancamentos?${periodSearch(period)}&conta=${nodeParam(
    open ? { type: "group", id: open } : { type: "kind", kind: "expense" }
  )}`;

  return (
    <SectionCard
      title="Composição de custos"
      subtitle={`COE ${formatCurrency(total)} · toque num grupo para abrir as contas`}
      action={
        <Link
          href={lancamentosHref}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lançamentos
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {breakdown.length === 0 ? (
        <EmptyState icon={Wallet} title="Sem custos no período" description="Lance despesas para ver a composição." />
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
                        {groupLabel(slice.category, planGroups)}
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
                  {groupLabel(openSlice.category, planGroups)} por conta
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

Replace in `components/dashboard/FinanceCard.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/dashboard/FinanceCard.tsx`:

```tsx
                      {groupLabel(slice.category, expenseGroups)}
```

with:

```tsx
                      {groupLabel(slice.category, planGroups)}
```

Replace in `components/finance/BillsCard.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/BillsCard.tsx`:

```tsx
              const grupo = group ? groupLabel(group, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

with:

```tsx
              const grupo = group ? groupLabel(group, planGroups) : ENTRY_KIND_LABEL.yield;
```

Replace in `components/finance/SeriesScopeDialog.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/SeriesScopeDialog.tsx`:

```tsx
  const grupo = group ? groupLabel(group, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

with:

```tsx
  const grupo = group ? groupLabel(group, planGroups) : ENTRY_KIND_LABEL.yield;
```

A rendimento has no grupo: the dialog sends no `category`.

Replace in `components/finance/YieldDialog.tsx`:

```tsx
          amountBrl,
          category: "other",
          paidAt: date,
```

with:

```tsx
          amountBrl,
          paidAt: date,
```

- [ ] **Step 8: Contas bancárias and Conciliar**

Replace in `components/finance/contas/AccountMovements.tsx`:

```tsx
import { TOP_GROUP_LABEL, groupLabel } from "@/lib/domain/groups";
```

with:

```tsx
import { GROUP_KIND_LABEL, groupLabel } from "@/lib/domain/groups";
```

Replace in `components/finance/contas/AccountMovements.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/contas/AccountMovements.tsx`:

```tsx
        const group = groupKey ? groupLabel(groupKey, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

with:

```tsx
        const group = groupKey ? groupLabel(groupKey, planGroups) : ENTRY_KIND_LABEL.yield;
```

Replace in `components/finance/contas/AccountMovements.tsx`:

```tsx
          group: TOP_GROUP_LABEL[sale ? "revenue" : "investment"],
```

with:

```tsx
          group: GROUP_KIND_LABEL[sale ? "revenue" : "investment"],
```

Replace in `components/finance/contas/AccountMovements.tsx`:

```tsx
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts, expenseGroups]);
```

with:

```tsx
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts, planGroups]);
```

Replace in `components/finance/contas/ConciliarPage.tsx`:

```tsx
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/contas/ConciliarPage.tsx`:

```tsx
      const group = groupKey ? groupLabel(groupKey, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

with:

```tsx
      const group = groupKey ? groupLabel(groupKey, planGroups) : ENTRY_KIND_LABEL.yield;
```

- [ ] **Step 9: Orçamento**

Replace in `components/finance/orcamento/OrcamentoPage.tsx`:

```tsx
import { despesaGroups } from "@/lib/domain/groups";
```

with:

```tsx
import { groupsOf } from "@/lib/domain/groups";
```

Replace in `components/finance/orcamento/OrcamentoPage.tsx`:

```tsx
  const expenses = useHerdStore((s) => s.expenses);
  const treatments = useHerdStore((s) => s.treatments);
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

with:

```tsx
  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
```

Replace in `components/finance/orcamento/OrcamentoPage.tsx`:

```tsx
    () => ({ budgets: budgets ?? [], expenses, treatments, accounts, expenseGroups }),
    [budgets, expenses, treatments, accounts, expenseGroups]
```

with:

```tsx
    () => ({ budgets: budgets ?? [], expenses, accounts, planGroups }),
    [budgets, expenses, accounts, planGroups]
```

Replace in `components/finance/orcamento/OrcamentoPage.tsx`:

```tsx
  /** "Orçar um grupo": the first active grupo without an orçado, Nutrição on an empty safra. */
  const orcar = () =>
    setEditing({
      category:
        despesaGroups(expenseGroups).find(
          ({ key }) => !view?.groups.some((g) => g.category === key && g.hasBudget)
        )?.key ?? "nutrition",
      pick: true,
    });
```

with:

```tsx
  /** "Orçar um grupo": the first active grupo without an orçado, else the first one; nothing without any. */
  const orcar = () => {
    const groups = groupsOf(planGroups, "expense");
    const next =
      groups.find(({ id }) => !view?.groups.some((g) => g.category === id && g.hasBudget)) ?? groups[0];
    if (next) setEditing({ category: next.id, pick: true });
  };
```

Replace in `components/finance/orcamento/BudgetEditDialog.tsx`:

```tsx
import { despesaGroups, groupLabel } from "@/lib/domain/groups";
```

with:

```tsx
import { groupLabel, groupsOf } from "@/lib/domain/groups";
```

Replace in `components/finance/orcamento/BudgetEditDialog.tsx`:

```tsx
  /** This safra's budgets and the farm's lançamentos, treatments and contas. */
```

with:

```tsx
  /** This safra's budgets and the farm's lançamentos, contas and grupos. */
```

Replace in `components/finance/orcamento/BudgetEditDialog.tsx`:

```tsx
            Orçamento · {groupLabel(category, inputs.expenseGroups)}
```

with:

```tsx
            Orçamento · {groupLabel(category, inputs.planGroups)}
```

Replace in `components/finance/orcamento/BudgetEditDialog.tsx`:

```tsx
                {despesaGroups(inputs.expenseGroups).map((group) => (
                  <SelectItem key={group.key} value={group.key}>
                    {group.label}
                  </SelectItem>
                ))}
```

with:

```tsx
                {groupsOf(inputs.planGroups, "expense").map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
```

Replace in `components/finance/orcamento/BudgetEditDialog.tsx`:

```tsx
  const label = groupLabel(category, inputs.expenseGroups);
```

with:

```tsx
  const label = groupLabel(category, inputs.planGroups);
```

Replace in `components/finance/orcamento/CopyDialog.tsx`:

```tsx
  /** This safra's budgets and the farm's lançamentos, treatments and contas. */
```

with:

```tsx
  /** This safra's budgets and the farm's lançamentos, contas and grupos. */
```

- [ ] **Step 10: Run the tests**

Run: `./node_modules/.bin/vitest run components/reports/__tests__ components/finance/lancamentos/__tests__ --exclude '**/worktrees/**'`
Expected: PASS

- [ ] **Step 11: Types and lint**

Check nothing this task owns still names a removed key:

Run: `grep -rnE 'expenseGroups|TOP_GROUP_LABEL|despesaGroups|isDespesaGroup|BUILTIN_CATEGOR|"nutrition"|"health"|category: "other"|type: "group", group:' 'app/(app)/dashboard' 'app/(app)/finance/page.tsx' 'app/(app)/relatorios' components/dashboard/FinanceCard.tsx components/finance/BillsCard.tsx components/finance/CapitalStrip.tsx components/finance/CostBreakdownCard.tsx components/finance/SeriesScopeDialog.tsx components/finance/YieldDialog.tsx components/finance/contas components/finance/lancamentos components/finance/orcamento components/reports`
Expected: one line only, `components/finance/lancamentos/__tests__/legacySearch.test.ts` (the old keys `grupo: "nutrition"` and `tipo: "treatment"` it checks are dropped).

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean once task 7 has run too; before it, only task 7's files stay red: 26 errors in `EntryDialog.tsx` [7], `entryFields.ts` [4], `plano/AccountsPage.tsx` [8], `plano/GroupHeader.tsx` [3], `plano/NewAccountDialog.tsx` [3], `plano/NewGroupDialog.tsx` [1]. If tsc names a file under `components/lots/**` or `components/animal/**`, it is this task's: rename `expenseGroups` → `planGroups` and drop `treatments` from the finance inputs there, as above.

Run: `./node_modules/.bin/eslint 'app/(app)/dashboard/page.tsx' 'app/(app)/finance/page.tsx' 'app/(app)/relatorios/grupos/page.tsx' components/dashboard/FinanceCard.tsx components/finance/BillsCard.tsx components/finance/CapitalStrip.tsx components/finance/CostBreakdownCard.tsx components/finance/SeriesScopeDialog.tsx components/finance/YieldDialog.tsx components/finance/contas/AccountMovements.tsx components/finance/contas/ConciliarPage.tsx components/finance/lancamentos components/finance/orcamento components/reports`
Expected: clean.

---

### Task 7: Plano de contas + forms

**Files:**
- Modify: `components/finance/entryFields.ts`
- Modify: `components/finance/EntryDialog.tsx`
- Modify: `components/finance/plano/GroupHeader.tsx`
- Modify: `components/finance/plano/NewAccountDialog.tsx`
- Modify (whole file): `components/finance/plano/NewGroupDialog.tsx`
- Modify (whole file): `components/finance/plano/AccountsPage.tsx`
- Test (whole file): `components/finance/__tests__/entryFields.test.ts`
- Test (whole file): `components/finance/__tests__/groupHeader.test.ts`

**Interfaces:**
- Consumes:
  - task 1 `lib/types.ts`: `GroupKind`, `PlanGroup { id; kind; name; archivedAt?; createdAt }`, `Expense.category?: string`.
  - task 1 `lib/domain/groups.ts`: `groupsOf(groups, kind, { archived?, keep? }): PlanGroup[]` (by name, pt-BR), `byGroupName`, `GROUP_NAME_MAX`.
  - task 1 store state `planGroups: PlanGroup[]` read as `useHerdStore((s) => s.planGroups)`.
  - task 2 store actions `addPlanGroup(kind: GroupKind, name: string): Promise<PlanGroup | null>`, `updatePlanGroup(id, { name?, archived? }): Promise<boolean>`, `removePlanGroup(id): Promise<"deleted" | "in_use">`.
  - task 3 `accountsByGroup(accounts, includeArchived?)` with no pre-filled keys (read `byGroup[id] ?? []`); store `addAccount({ group, name, openingBalanceBrl?, openingDate? })` with `group` a PlanGroup id.
  - task 5 `debtBalance(account, expenses, day)` (still exported by `lib/domain/planTree.ts`), `EntryInitial` (`{ kind?, flow?, category?, accountId?, bankAccountId? }`).
  - unchanged: `ENTRY_KIND_LABEL`, `CAPITAL_GROUPS`, `isCapitalKind` (`lib/domain/entries.ts`).
- Produces:
  - `initialFields(source: EntrySource, bankAccounts: BankAccount[], today: string, planGroups: readonly PlanGroup[]): EntryFields`
  - `withKind(fields, kind: EntryKind, flow: EntryFlow, bankAccounts: BankAccount[], planGroups: readonly PlanGroup[]): EntryFields`
  - `entryValues(fields, repeating): EntryValues | string` — `"Escolha o grupo."` when `fields.category === ""`; `category: fields.category` for every kind.
  - `entrySummary` names `"<grupo> › <conta>"` for every kind.
  - `archiveGroupText(kind: GroupKind, contas: number, entries: number): string`; `groupEntryCount` unchanged.
  - `GroupHeader({ group: PlanGroup, contas, entries, onAdd? })`.
  - `NewGroupDialog({ kinds: readonly GroupKind[], open, onOpenChange })` (no `onCreated`: nothing would pass it).
  - `AccountPlace = "bank" | GroupKind`; `NewAccountDialog({ open, onOpenChange, defaultPlace?, defaultGroup? })` (`defaultCategory` is gone; `PlanTreeNav` passes neither, so it keeps compiling).
  - `EntryDialog` props unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `components/finance/__tests__/entryFields.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, GroupKind, PlanGroup, StatementLine } from "@/lib/types";
import { groupsOf } from "@/lib/domain/groups";
import { NONE, entrySummary, entryValues, initialFields, withKind, type EntryFields } from "@/components/finance/entryFields";

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

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T12:00:00Z",
  ...(archivedAt ? { archivedAt } : {}),
});
/** By name the despesas are Leilões (archived), Máquinas e veículos, Nutrição; Financiamentos has only an archived grupo. */
const GROUPS: PlanGroup[] = [
  group("g-nut", "expense", "Nutrição"),
  group("g-maq", "expense", "Máquinas e veículos"),
  group("g-old", "expense", "Leilões", "2026-09-20T12:00:00Z"),
  group("g-rec", "revenue", "Receitas"),
  group("g-inv", "investment", "Investimentos"),
  group("g-ben", "investment", "Benfeitorias"),
  group("g-pronaf", "financing", "Pronaf", "2026-09-20T12:00:00Z"),
  group("g-soc", "partners", "Sócios"),
];

/** A new despesa of R$ 1.500,00 in Máquinas e veículos, paid today from the Sicredi. */
const form = (patch: Partial<EntryFields> = {}): EntryFields => ({
  ...initialFields({ defaultKind: "expense" }, BANKS, TODAY, GROUPS),
  amount: "1.500,00",
  ...patch,
});

describe("initialFields", () => {
  it("starts a new lançamento in the first active grupo of its tipo, or in none", () => {
    const start = (defaultKind: Expense["kind"]) => initialFields({ defaultKind }, BANKS, TODAY, GROUPS).category;
    expect(start("expense")).toBe("g-maq");
    expect(start("revenue")).toBe("g-rec");
    expect(start("investment")).toBe("g-ben");
    // No active grupo de financiamento: saving asks for one.
    expect(start("financing")).toBe("");
  });

  it("starts in the picked grupo only while it is active and of the tipo", () => {
    const start = (kind: Expense["kind"], category: string) =>
      initialFields({ defaultKind: "expense", initial: { kind, category, accountId: "diesel" } }, BANKS, TODAY, GROUPS);
    expect(start("expense", "g-nut")).toMatchObject({ category: "g-nut", accountId: "diesel" });
    // An archived grupo, one deleted meanwhile or one of another tipo is no new choice: the first one, without its conta.
    expect(start("expense", "g-old")).toMatchObject({ category: "g-maq", accountId: NONE });
    expect(start("expense", "g-gone")).toMatchObject({ category: "g-maq", accountId: NONE });
    expect(start("revenue", "g-nut")).toMatchObject({ category: "g-rec", accountId: NONE });
  });

  it("duplicates a lançamento of an archived grupo into the first active one, and edits it where it is", () => {
    const row = { id: "e1", kind: "expense", date: "2026-05-01", category: "g-old", amountBrl: 100, accountId: "leiloeiro", createdAt: "2026-05-01T12:00:00Z" } as Expense;
    expect(initialFields({ defaultKind: "expense", template: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "g-maq",
      accountId: NONE,
    });
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "g-old",
      accountId: "leiloeiro",
    });
    // The Grupo picker of that edit still lists it.
    expect(groupsOf(GROUPS, "expense", { keep: row.category }).map((g) => g.id)).toEqual(["g-old", "g-maq", "g-nut"]);
  });

  it("starts a new despesa paid today from the conta principal", () => {
    expect(initialFields({ defaultKind: "expense" }, BANKS, TODAY, GROUPS)).toMatchObject({
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
    const initial = { kind: "partners", flow: "in", category: "g-soc", accountId: "aporte", bankAccountId: "caixa" } as const;
    expect(initialFields({ defaultKind: "expense", initial }, BANKS, TODAY, GROUPS)).toMatchObject({
      kind: "partners",
      flow: "in",
      category: "g-soc",
      accountId: "aporte",
      bankAccountId: "caixa",
    });
    expect(initialFields({ defaultKind: "expense", initial: { category: "g-nut" } }, BANKS, TODAY, GROUPS).category).toBe(
      "g-nut"
    );
  });

  it("starts a linha do extrato as a despesa or a receita in the first grupo of that tipo", () => {
    const line: StatementLine = {
      id: "l1",
      importId: "i1",
      bankAccountId: "caixa",
      date: "2026-09-12",
      description: "PIX AGROPECUARIA",
      amountBrl: -320,
      status: "pending",
    };
    expect(initialFields({ defaultKind: "expense", fromLine: line }, BANKS, TODAY, GROUPS)).toMatchObject({
      kind: "expense",
      category: "g-maq",
      amount: "320",
    });
    expect(
      initialFields({ defaultKind: "expense", fromLine: { ...line, amountBrl: 500 } }, BANKS, TODAY, GROUPS)
    ).toMatchObject({ kind: "revenue", category: "g-rec" });
  });

  it("Duplicar keeps what the lançamento is and starts it today, pending, outside any série", () => {
    const template: Expense = {
      id: "trator-6",
      kind: "investment",
      flow: "out",
      date: "2026-02-10",
      category: "g-inv",
      amountBrl: 9000.5,
      dueDate: "2026-10-10",
      paidAt: "2026-10-10",
      bankAccountId: "card",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      accountId: "maquinas",
      history: "Trator MF 4275",
      notes: "entrega na sede",
      seriesId: "s1",
      seriesIndex: 6,
      seriesCount: 6,
      attachmentCount: 2,
    };
    expect(initialFields({ defaultKind: "expense", template }, BANKS, TODAY, GROUPS)).toEqual({
      kind: "investment",
      flow: "out",
      date: TODAY,
      amount: "9000,5",
      category: "g-inv",
      accountId: "maquinas",
      dueDate: TODAY,
      dueTouched: false,
      paid: false,
      paidAt: TODAY,
      bankAccountId: "sicredi",
      history: "Trator MF 4275",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      lotId: NONE,
      notes: "entrega na sede",
    });
  });

  it("edits a capital row with its movimento; one stored without it is a saída", () => {
    const row: Expense = {
      id: "l1",
      kind: "financing",
      flow: "in",
      date: "2025-11-15",
      category: "g-pronaf",
      amountBrl: 150000,
      accountId: "custeio",
    };
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY, GROUPS).flow).toBe("in");
    expect(
      initialFields({ defaultKind: "expense", expense: { ...row, flow: undefined } }, BANKS, TODAY, GROUPS).flow
    ).toBe("out");
  });
});

describe("withKind", () => {
  it("moves Pago por off a cartão when the new direction cannot use it", () => {
    const onCard = form({ bankAccountId: "card" });
    expect(withKind(onCard, "revenue", "out", BANKS, GROUPS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "investment", "out", BANKS, GROUPS).bankAccountId).toBe("card");
    expect(withKind(onCard, "investment", "in", BANKS, GROUPS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "partners", "out", BANKS, GROUPS).bankAccountId).toBe("sicredi");
  });

  it("moves a new tipo to its first grupo without conta, and keeps both when only the movimento changes", () => {
    const compra = form({ kind: "investment", category: "g-inv", accountId: "maquinas" });
    expect(withKind(compra, "investment", "in", BANKS, GROUPS)).toMatchObject({ category: "g-inv", accountId: "maquinas" });
    expect(withKind(compra, "partners", "out", BANKS, GROUPS)).toMatchObject({ category: "g-soc", accountId: NONE });
    expect(withKind(compra, "revenue", "out", BANKS, GROUPS)).toMatchObject({ category: "g-rec", accountId: NONE });
    expect(withKind(compra, "financing", "out", BANKS, GROUPS)).toMatchObject({ category: "", accountId: NONE });
  });
});

describe("entryValues", () => {
  it("refuses a capital kind without conta", () => {
    expect(entryValues(form({ kind: "partners", category: "g-soc" }), false)).toBe("Escolha a conta do plano.");
  });

  it("refuses a lançamento without grupo, whatever its tipo", () => {
    expect(entryValues(form({ category: "" }), false)).toBe("Escolha o grupo.");
    expect(entryValues(form({ kind: "revenue", category: "" }), false)).toBe("Escolha o grupo.");
    expect(entryValues(form({ kind: "financing", category: "", accountId: "custeio" }), false)).toBe("Escolha o grupo.");
  });

  it("writes an investimento with its movimento, grupo and conta and no lote", () => {
    const values = entryValues(
      form({ kind: "investment", flow: "in", category: "g-inv", accountId: "maquinas", lotId: "engorda" }),
      false
    );
    expect(values).toMatchObject({ flow: "in", category: "g-inv", accountId: "maquinas", lotId: null, amountBrl: 1500 });
  });

  it("writes a despesa with its grupo and lote and no movimento", () => {
    const values = entryValues(form({ category: "g-nut", lotId: "engorda", flow: "in" }), false);
    expect(values).toMatchObject({ category: "g-nut", lotId: "engorda" });
    expect(values).not.toHaveProperty("flow");
  });

  it("writes a receita in its grupo, with no movimento", () => {
    const values = entryValues(form({ kind: "revenue", category: "g-rec" }), false);
    expect(values).toMatchObject({ category: "g-rec" });
    expect(values).not.toHaveProperty("flow");
  });

  it("leaves a pending lançamento without payment day or conta bancária", () => {
    expect(entryValues(form({ paid: false }), false)).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("asks the day of the recebimento on an aporte and of the pagamento on a retirada", () => {
    const aporte = form({ kind: "partners", flow: "in", category: "g-soc", accountId: "socio", paidAt: "" });
    expect(entryValues(aporte, false)).toBe("Informe a data do recebimento.");
    expect(entryValues({ ...aporte, flow: "out" }, false)).toBe("Informe a data do pagamento.");
  });

  it("reads Vencimento only when Repetir does not set it", () => {
    expect(entryValues(form({ dueDate: "" }), false)).toBe("Informe o vencimento.");
    expect(entryValues(form({ dueDate: "" }), true)).not.toBeTypeOf("string");
  });
});

describe("entrySummary", () => {
  const NAMES = { group: "Máquinas e veículos", account: "Diesel", bank: "Sicredi" };
  const brl = (text: string) => text.replace(" ", " ");

  it("says what, how much, where and that it was paid today, by which conta", () => {
    expect(entrySummary(form(), null, NAMES, TODAY)).toEqual({
      lead: "Despesa de",
      value: brl("R$ 1.500,00"),
      rest: "em Máquinas e veículos › Diesel · pago hoje · Sicredi",
    });
  });

  it("names the grupo of a receita", () => {
    const receita = form({ kind: "revenue", category: "g-rec" });
    expect(entrySummary(receita, null, { group: "Receitas", bank: "Sicredi" }, TODAY)).toEqual({
      lead: "Receita de",
      value: brl("R$ 1.500,00"),
      rest: "em Receitas · recebido hoje · Sicredi",
    });
  });

  it("gives the vencimento of a pending lançamento and the movimento of a capital one", () => {
    const compra = form({ kind: "investment", category: "g-inv", paid: false, dueDate: "2026-10-15", accountId: "maq" });
    expect(entrySummary(compra, null, { group: "Investimentos", account: "Máquinas e implementos" }, TODAY)).toEqual({
      lead: "Compra de",
      value: brl("R$ 1.500,00"),
      rest: "em Investimentos › Máquinas e implementos · fora do custo · vence 15/10",
    });
  });

  it("counts the parcelas and gives the first one's value and vencimento", () => {
    const rule = { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-11-05" } as const;
    expect(entrySummary(form({ amount: "100,00", paid: false }), rule, NAMES, TODAY)).toEqual({
      lead: "3 parcelas de",
      value: brl("R$ 33,33"),
      rest: "em Máquinas e veículos › Diesel · a 1ª vence 05/11",
    });
  });

  it("says nothing while the form would not save", () => {
    expect(entrySummary(form({ amount: "" }), null, NAMES, TODAY)).toBeNull();
    expect(entrySummary(form({ kind: "partners", category: "g-soc", accountId: NONE }), null, {}, TODAY)).toBeNull();
    expect(entrySummary(form({ category: "" }), null, NAMES, TODAY)).toBeNull();
  });
});
```

Replace the whole of `components/finance/__tests__/groupHeader.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { Account, Expense } from "@/lib/types";
import { archiveGroupText, groupEntryCount } from "@/components/finance/plano/GroupHeader";

/** The ids of the grupos "Máquinas e veículos" and "Nutrição". */
const MAQUINAS = "g-maquinas";
const NUTRICAO = "g-nutricao";
const diesel: Account = { id: "a-diesel", group: MAQUINAS, name: "Diesel" };
const sal: Account = { id: "a-sal", group: NUTRICAO, name: "Sal mineral" };

/** A despesa of R$ 100,00 in Nutrição on 2026-09-05; `patch` moves it. */
const despesa = (id: string, patch: Partial<Expense> = {}): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-05",
  category: NUTRICAO,
  amountBrl: 100,
  ...patch,
});

describe("groupEntryCount", () => {
  it("counts the lançamentos in the grupo or in one of its contas, however old", () => {
    const expenses = [
      despesa("e1", { category: MAQUINAS }),
      despesa("e2", { category: MAQUINAS, accountId: diesel.id, date: "2019-01-10" }),
      despesa("e3", { accountId: sal.id }),
      despesa("e4"),
    ];
    expect(groupEntryCount(MAQUINAS, expenses, [diesel, sal])).toBe(2);
  });

  it("counts a lançamento of one of its contas that carries another grupo", () => {
    // Before the server tied a despesa to its conta's grupo, the two could disagree.
    expect(groupEntryCount(MAQUINAS, [despesa("e1", { category: "g-admin", accountId: diesel.id })], [diesel])).toBe(1);
  });

  it("is zero for a grupo nothing was ever lançado in, contas or not", () => {
    const vazio: Account = { id: "a-baia", group: "g-confinamento", name: "Baias" };
    expect(groupEntryCount("g-confinamento", [despesa("e1", { accountId: sal.id })], [diesel, sal, vazio])).toBe(0);
  });
});

describe("archiveGroupText", () => {
  it("names the contas that leave the forms and the lançamentos that stay", () => {
    expect(archiveGroupText("expense", 3, 22)).toBe(
      "O grupo e as 3 contas dele saem do formulário de lançamento e do Orçamento da próxima safra. Os 22 lançamentos continuam no Painel, em Lançamentos e no custo dos meses em que foram feitos."
    );
  });

  it("says one conta and one lançamento in the singular", () => {
    expect(archiveGroupText("expense", 1, 1)).toBe(
      "O grupo e a conta dele saem do formulário de lançamento e do Orçamento da próxima safra. O lançamento continua no Painel, em Lançamentos e no custo do mês em que foi feito."
    );
  });

  it("leaves out what the grupo does not have", () => {
    expect(archiveGroupText("expense", 0, 0)).toBe("O grupo sai do formulário de lançamento e do Orçamento da próxima safra.");
  });

  it("names no Orçamento nor custo for a grupo of another tipo", () => {
    expect(archiveGroupText("revenue", 2, 5)).toBe(
      "O grupo e as 2 contas dele saem do formulário de lançamento. Os 5 lançamentos continuam em Lançamentos e nos relatórios."
    );
    expect(archiveGroupText("financing", 0, 1)).toBe(
      "O grupo sai do formulário de lançamento. O lançamento continua em Lançamentos e nos relatórios."
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run components/finance/__tests__/entryFields.test.ts components/finance/__tests__/groupHeader.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `entryFields.ts` still calls `despesaGroups` (deleted by task 1: "is not a function") and starts in `"nutrition"`, `withKind` keeps the category, `entryValues` writes `"other"` and never answers "Escolha o grupo."; `archiveGroupText` still takes `(contas, entries)`, so the texts come out wrong.

- [ ] **Step 3: Implement `entryFields.ts` and `GroupHeader.tsx`**

`components/finance/entryFields.ts`, in order:

**Replace 1** — find:

```ts
 * where the form starts (the lançamento edited or duplicated, the nó picked,
 * a linha do extrato), `withKind` keeps it sound when the type or the
 * movimento changes, and `entryValues` turns it into the row the API takes: a
 * receita and the capital kinds write category "other"; the capital kinds
 * need a conta and a movimento and take no lote. `entrySummary` is the line
 * at the foot of the dialog that says what will be lançado. Pure.
```

with:

```ts
 * where the form starts (the lançamento edited or duplicated, the nó picked,
 * a linha do extrato), `withKind` keeps it sound when the type or the
 * movimento changes, and `entryValues` turns it into the row the API takes:
 * every kind carries its grupo (a PlanGroup of its tipo); the capital kinds
 * need a conta and a movimento and take no lote. `entrySummary` is the line
 * at the foot of the dialog that says what will be lançado. Pure.
```

**Replace 2** — find:

```ts
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  SeriesRepeat,
  StatementLine,
```

with:

```ts
  Expense,
  ExpenseCategory,
  PlanGroup,
  SeriesRepeat,
  StatementLine,
```

**Replace 3** — find:

```ts
import { formatCurrency } from "@/lib/domain/format";
import { installmentPlan } from "@/lib/domain/series";
import { despesaGroups } from "@/lib/domain/groups";
import type { EntryInitial } from "@/lib/domain/planTree";
import { parseAmount } from "@/components/finance/parseAmount";
```

with:

```ts
import { formatCurrency } from "@/lib/domain/format";
import { installmentPlan } from "@/lib/domain/series";
import { groupsOf } from "@/lib/domain/groups";
import type { EntryInitial } from "@/lib/domain/planTree";
import { parseAmount } from "@/components/finance/parseAmount";
```

**Replace 4** — find:

```ts
  date: string;
  amount: string;
  category: ExpenseCategory;
  accountId: string;
```

with:

```ts
  date: string;
  amount: string;
  /** A PlanGroup id of the tipo; "" when the tipo has no active grupo. */
  category: ExpenseCategory;
  accountId: string;
```

**Replace 5** — find:

```ts
const amountText = (amountBrl: number) => String(amountBrl).replace(".", ",");

/** `groups`: the farm's grupos de despesa; a new lançamento only starts in one it may still pick. */
export function initialFields(
  source: EntrySource,
  bankAccounts: BankAccount[],
  today: string,
  groups: readonly ExpenseGroup[] = []
): EntryFields {
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
```

with:

```ts
const amountText = (amountBrl: number) => String(amountBrl).replace(".", ",");

/** The grupo a tipo starts in: its first active one by name, "" when it has none. */
const firstGroup = (planGroups: readonly PlanGroup[], kind: EntryKind): ExpenseCategory =>
  kind === "yield" ? "" : (groupsOf(planGroups, kind)[0]?.id ?? "");

/** `planGroups`: every grupo of the farm; a new lançamento only starts in one it may still pick. */
export function initialFields(
  source: EntrySource,
  bankAccounts: BankAccount[],
  today: string,
  planGroups: readonly PlanGroup[]
): EntryFields {
  const { expense, template, initial, fromLine } = source;
  if (fromLine) {
    const kind = fromLine.amountBrl < 0 ? "expense" : "revenue";
    return {
      kind,
      flow: "out",
      date: fromLine.date,
      amount: amountText(Math.abs(fromLine.amountBrl)),
      category: firstGroup(planGroups, kind),
      accountId: NONE,
      dueDate: fromLine.date,
```

**Replace 6** — find:

```ts
      date: expense.date,
      amount: amountText(expense.amountBrl),
      category: expense.category,
      accountId: expense.accountId ?? NONE,
      dueDate: expense.dueDate ?? expense.date,
```

with:

```ts
      date: expense.date,
      amount: amountText(expense.amountBrl),
      // Its own grupo, archived or not: the picker keeps it for this row.
      category: expense.category ?? "",
      accountId: expense.accountId ?? NONE,
      dueDate: expense.dueDate ?? expense.date,
```

**Replace 7** — find:

```ts
  const kind = template?.kind ?? initial?.kind ?? source.defaultKind;
  const flow = template?.flow ?? initial?.flow ?? "out";
  // An archived grupo, or one deleted meanwhile, falls back to Nutrição, without its conta.
  const picked = template?.category ?? initial?.category;
  const live = picked === undefined || despesaGroups(groups).some((g) => g.key === picked);
  return {
    kind,
```

with:

```ts
  const kind = template?.kind ?? initial?.kind ?? source.defaultKind;
  const flow = template?.flow ?? initial?.flow ?? "out";
  // An archived grupo, one deleted meanwhile or one of another tipo falls back to the tipo's first, without its conta.
  const picked = template?.category ?? initial?.category;
  const live = kind !== "yield" && groupsOf(planGroups, kind).some((g) => g.id === picked);
  return {
    kind,
```

**Replace 8** — find:

```ts
    date: today,
    amount: template ? amountText(template.amountBrl) : "",
    category: live ? (picked ?? "nutrition") : "nutrition",
    accountId: live ? (template?.accountId ?? initial?.accountId ?? NONE) : NONE,
    dueDate: today,
```

with:

```ts
    date: today,
    amount: template ? amountText(template.amountBrl) : "",
    category: live && picked ? picked : firstGroup(planGroups, kind),
    accountId: live ? (template?.accountId ?? initial?.accountId ?? NONE) : NONE,
    dueDate: today,
```

**Replace 9** — find:

```ts
/**
 * The type or the movimento changed: another kind starts without conta (its
 * grupo changed), and "Pago por" leaves a conta that may not take the new
 * direction (a cartão never receives).
 */
```

with:

```ts
/**
 * The type or the movimento changed: another kind starts in its first grupo
 * without conta, and "Pago por" leaves a conta that may not take the new
 * direction (a cartão never receives).
 */
```

**Replace 10** — find:

```ts
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
```

with:

```ts
  kind: EntryKind,
  flow: EntryFlow,
  bankAccounts: BankAccount[],
  planGroups: readonly PlanGroup[]
): EntryFields {
  const current = bankAccounts.find((a) => a.id === fields.bankAccountId);
  const same = kind === fields.kind;
  return {
    ...fields,
    kind,
    flow,
    category: same ? fields.category : firstGroup(planGroups, kind),
    accountId: same ? fields.accountId : NONE,
    bankAccountId:
      current && mayPayFrom(current.kind, kind, flow) ? current.id : defaultPaidBy(bankAccounts, kind, flow),
```

**Replace 11** — find:

```ts
  const amountBrl = parseAmount(fields.amount);
  if (!Number.isFinite(amountBrl) || amountBrl <= 0) return "Informe o valor (maior que zero).";
  const capital = isCapitalKind(fields.kind);
  if (capital && fields.accountId === NONE) return "Escolha a conta do plano.";
```

with:

```ts
  const amountBrl = parseAmount(fields.amount);
  if (!Number.isFinite(amountBrl) || amountBrl <= 0) return "Informe o valor (maior que zero).";
  if (fields.category === "") return "Escolha o grupo.";
  const capital = isCapitalKind(fields.kind);
  if (capital && fields.accountId === NONE) return "Escolha a conta do plano.";
```

**Replace 12** — find:

```ts
    ...(capital ? { flow: fields.flow } : {}),
    date: fields.date,
    category: fields.kind === "expense" ? fields.category : "other",
    amountBrl,
    dueDate: fields.dueDate,
```

with:

```ts
    ...(capital ? { flow: fields.flow } : {}),
    date: fields.date,
    category: fields.category,
    amountBrl,
    dueDate: fields.dueDate,
```

**Replace 13** — find:

```ts
  const capital = isCapitalKind(fields.kind);
  const what = isCapitalKind(fields.kind) ? FLOW_LABEL[fields.kind][fields.flow] : ENTRY_KIND_LABEL[fields.kind];
  const where =
    fields.kind === "expense"
      ? [names.group, names.account].filter(Boolean).join(" › ")
      : (names.account ?? (fields.kind === "revenue" ? "Receitas" : ""));
  const day = (iso: string) => (iso === today ? "hoje" : formatDate(iso).slice(0, 5));
  const inflow = isInflow(fields);
```

with:

```ts
  const capital = isCapitalKind(fields.kind);
  const what = isCapitalKind(fields.kind) ? FLOW_LABEL[fields.kind][fields.flow] : ENTRY_KIND_LABEL[fields.kind];
  const where = [names.group, names.account].filter(Boolean).join(" › ");
  const day = (iso: string) => (iso === today ? "hoje" : formatDate(iso).slice(0, 5));
  const inflow = isInflow(fields);
```

`components/finance/plano/GroupHeader.tsx`, in order (the "da fazenda" tag goes; a grupo outside the resultado shows its tipo, `ENTRY_KIND_LABEL` lowercased: "investimento", "financiamento", "sócios"):

**Replace 1** — find:

```tsx
/**
 * The header of a grupo the farm created, on the Despesas (COE) card of the
 * Plano de contas: its name with the "da fazenda" tag, Renomear (inline, like
 * a conta), Arquivar (confirmed, naming what leaves the forms and what stays),
 * Excluir while no lançamento was ever made in it (confirmed; the server still
 * refuses one a recorrência keeps) and "+ Conta".
 */
import { useState, type KeyboardEvent } from "react";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import type { Account, Expense, ExpenseCategory } from "@/lib/types";
import { GROUP_NAME_MAX, type DespesaGroup } from "@/lib/domain/groups";
import { formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

with:

```tsx
/**
 * The header of a grupo on the Plano de contas, any tipo: its name (with the
 * tipo on a grupo outside the resultado), Renomear (inline, like a conta),
 * Arquivar (confirmed, naming what leaves the forms and what stays), Excluir
 * while no lançamento was ever made in it (confirmed; the server still refuses
 * one a recorrência keeps) and "+ Conta".
 */
import { useState, type KeyboardEvent } from "react";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import type { Account, Expense, ExpenseCategory, GroupKind, PlanGroup } from "@/lib/types";
import { ENTRY_KIND_LABEL, isCapitalKind } from "@/lib/domain/entries";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
import { formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

**Replace 2** — find:

```tsx
}

/** What "Arquivar <nome>?" says: the contas that leave the forms, the lançamentos that stay. */
export function archiveGroupText(contas: number, entries: number): string {
  const leaving =
    contas === 0
```

with:

```tsx
}

/**
 * What "Arquivar <nome>?" says: the contas that leave the forms, the
 * lançamentos that stay. Only a grupo de despesa has an Orçamento and a custo.
 */
export function archiveGroupText(kind: GroupKind, contas: number, entries: number): string {
  const leaving =
    contas === 0
```

**Replace 3** — find:

```tsx
        ? "O grupo e a conta dele saem"
        : `O grupo e as ${formatNumber(contas)} contas dele saem`;
  const staying =
    entries === 0
```

with:

```tsx
        ? "O grupo e a conta dele saem"
        : `O grupo e as ${formatNumber(contas)} contas dele saem`;
  if (kind !== "expense") {
    const kept =
      entries === 0
        ? ""
        : entries === 1
          ? " O lançamento continua em Lançamentos e nos relatórios."
          : ` Os ${formatNumber(entries)} lançamentos continuam em Lançamentos e nos relatórios.`;
    return `${leaving} do formulário de lançamento.${kept}`;
  }
  const staying =
    entries === 0
```

**Replace 4** — find:

```tsx
  onAdd,
}: {
  /** A farm grupo, not archived. */
  group: DespesaGroup;
  /** Its contas that are not archived. */
  contas: number;
```

with:

```tsx
  onAdd,
}: {
  /** Not archived. */
  group: PlanGroup;
  /** Its contas that are not archived. */
  contas: number;
```

**Replace 5** — find:

```tsx
  onAdd?: () => void;
}) {
  const updateExpenseGroup = useHerdStore((s) => s.updateExpenseGroup);
  const removeExpenseGroup = useHerdStore((s) => s.removeExpenseGroup);
  const { addToast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
```

with:

```tsx
  onAdd?: () => void;
}) {
  const updatePlanGroup = useHerdStore((s) => s.updatePlanGroup);
  const removePlanGroup = useHerdStore((s) => s.removePlanGroup);
  const { addToast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
```

**Replace 6** — find:

```tsx
    if (draft === null) return;
    const clean = draft.trim();
    if (clean === "" || clean === group.label) {
      setDraft(null);
      return;
    }
    try {
      if (!(await updateExpenseGroup(group.key, { name: clean }))) {
        addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
        return;
```

with:

```tsx
    if (draft === null) return;
    const clean = draft.trim();
    if (clean === "" || clean === group.name) {
      setDraft(null);
      return;
    }
    try {
      if (!(await updatePlanGroup(group.id, { name: clean }))) {
        addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
        return;
```

**Replace 7** — find:

```tsx
    setBusy(true);
    try {
      await updateExpenseGroup(group.key, { archived: true });
      addToast({ messageType: "success", text: "Grupo arquivado" });
    } catch {
```

with:

```tsx
    setBusy(true);
    try {
      await updatePlanGroup(group.id, { archived: true });
      addToast({ messageType: "success", text: "Grupo arquivado" });
    } catch {
```

**Replace 8** — find:

```tsx
    setBusy(true);
    try {
      if ((await removeExpenseGroup(group.key)) === "in_use") {
        addToast({ messageType: "error", text: "Grupo com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
```

with:

```tsx
    setBusy(true);
    try {
      if ((await removePlanGroup(group.id)) === "in_use") {
        addToast({ messageType: "error", text: "Grupo com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
```

**Replace 9** — find:

```tsx
        <Input
          autoFocus
          aria-label={`Novo nome de ${group.label}`}
          value={draft}
          maxLength={GROUP_NAME_MAX}
```

with:

```tsx
        <Input
          autoFocus
          aria-label={`Novo nome de ${group.name}`}
          value={draft}
          maxLength={GROUP_NAME_MAX}
```

**Replace 10** — find:

```tsx
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold break-words text-ink">{group.label}</h3>
        <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink-soft">
          da fazenda
        </span>
      </div>
      {onAdd ? (
```

with:

```tsx
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold break-words text-ink">{group.name}</h3>
        {isCapitalKind(group.kind) ? (
          <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink-soft">
            {ENTRY_KIND_LABEL[group.kind].toLowerCase()}
          </span>
        ) : null}
      </div>
      {onAdd ? (
```

**Replace 11** — find:

```tsx
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Renomear o grupo ${group.label}`}
            title="Renomear grupo"
            onClick={() => setDraft(group.label)}
          >
            <Pencil aria-hidden />
```

with:

```tsx
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Renomear o grupo ${group.name}`}
            title="Renomear grupo"
            onClick={() => setDraft(group.name)}
          >
            <Pencil aria-hidden />
```

**Replace 12** — find:

```tsx
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Arquivar o grupo ${group.label}`}
            title="Arquivar grupo"
            onClick={() => confirm("archive")}
```

with:

```tsx
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Arquivar o grupo ${group.name}`}
            title="Arquivar grupo"
            onClick={() => confirm("archive")}
```

**Replace 13** — find:

```tsx
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir o grupo ${group.label}`}
              title="Excluir grupo"
              onClick={() => confirm("delete")}
```

with:

```tsx
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir o grupo ${group.name}`}
              title="Excluir grupo"
              onClick={() => confirm("delete")}
```

**Replace 14** — find:

```tsx
          <DialogHeader>
            <DialogTitle>
              {action === "delete" ? "Excluir" : "Arquivar"} {group.label}?
            </DialogTitle>
            <DialogDescription>
              {action === "delete"
                ? "O grupo ainda não tem lançamentos. Ele sai do plano de contas e do orçamento, com as contas que tiver."
                : archiveGroupText(contas, entries)}
            </DialogDescription>
          </DialogHeader>
```

with:

```tsx
          <DialogHeader>
            <DialogTitle>
              {action === "delete" ? "Excluir" : "Arquivar"} {group.name}?
            </DialogTitle>
            <DialogDescription>
              {action === "delete"
                ? "O grupo ainda não tem lançamentos. Ele sai do plano de contas e do orçamento, com as contas que tiver."
                : archiveGroupText(group.kind, contas, entries)}
            </DialogDescription>
          </DialogHeader>
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run components/finance/__tests__/entryFields.test.ts components/finance/__tests__/groupHeader.test.ts --exclude '**/worktrees/**'`
Expected: PASS (entryFields 23 tests, groupHeader 7).

- [ ] **Step 5: Implement `EntryDialog.tsx`**

The Grupo select now shows for every kind the dialog handles (it never holds a rendimento: that opens `YieldDialog`), options `groupsOf(planGroups, fields.kind, { keep: source.expense?.category })`, no "da fazenda" separator, no static "Receitas" box, contas from `accountsByGroup(accounts)[fields.category] ?? []`. With no active grupo of the tipo the select is disabled and reads "Nenhum grupo — crie um no Plano de contas", and "+ nova conta" hides. **Fit:** the O quê column keeps five rows for every kind, as today (despesa and receita: Valor · Histórico · Data|Vencimento · Grupo · Conta do plano; a capital kind: Valor · Histórico · Data|Vencimento · Grupo|Conta side by side · Movimento — the capital kind's Grupo and Conta share one row through a wrapper that is `contents` for the other kinds; the label reads "Conta" there so it and "+ nova conta" fit half a column). Pagamento and Detalhes do not change. (`~/.cache/meubov-canvas/novo-lancamento/measure-dlg.mjs` measures the canvas's static HTML, not a dev server, so it cannot measure this dialog; the row count is the check.)

`components/finance/EntryDialog.tsx`, in order:

**Replace 1** — find:

```tsx
 * and the conta bancária it was paid by ("Pago por"), conta do plano, pago
 * para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. A capital kind needs a conta of its grupo and a
 * Movimento (Compra / Venda do bem, Pagamento / Liberação, Retirada / Aporte)
 * and takes no grupo or lote; the words about paying follow the direction.
 * The Grupo picker lists the seven of the system, then the farm's under "da
 * fazenda"; an archived grupo shows only while the lançamento sits in it.
 * `initial` starts it on the nó picked in Lançamentos; `template` fills it
 * from a lançamento (Duplicar: today, pending, no anexos, no repetition).
```

with:

```tsx
 * and the conta bancária it was paid by ("Pago por"), conta do plano, pago
 * para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. Every kind sits in a grupo of its tipo; a capital
 * kind needs a conta of that grupo and a Movimento (Compra / Venda do bem,
 * Pagamento / Liberação, Retirada / Aporte) and takes no lote, and the words
 * about paying follow the direction. The Grupo picker lists the tipo's grupos
 * by name; an archived one shows only while the lançamento sits in it.
 * `initial` starts it on the nó picked in Lançamentos; `template` fills it
 * from a lançamento (Duplicar: today, pending, no anexos, no repetition).
```

**Replace 2** — find:

```tsx
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
```

with:

```tsx
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { CapitalGroup, EntryFlow, EntryKind, Expense, SeriesScope, StatementLine } from "@/lib/types";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
```

**Replace 3** — find:

```tsx
import type { EntryInitial } from "@/lib/domain/planTree";
import { todayISO } from "@/lib/domain/dates";
import { despesaGroups } from "@/lib/domain/groups";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
```

with:

```tsx
import type { EntryInitial } from "@/lib/domain/planTree";
import { todayISO } from "@/lib/domain/dates";
import { groupsOf } from "@/lib/domain/groups";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
```

**Replace 4** — find:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
```

with:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
```

**Replace 5** — find:

```tsx
  const { expense, fromLine } = source;
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
```

with:

```tsx
  const { expense, fromLine } = source;
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
```

**Replace 6** — find:

```tsx
  const fixed = fromLine !== undefined;

  const [fields, setFields] = useState<EntryFields>(() => initialFields(source, bankAccounts, todayISO(), expenseGroups));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
```

with:

```tsx
  const fixed = fromLine !== undefined;

  const [fields, setFields] = useState<EntryFields>(() => initialFields(source, bankAccounts, todayISO(), planGroups));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
```

**Replace 7** — find:

```tsx
  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  /** Investimento, financiamento or sócios: conta required, Movimento, no grupo or lote. */
  const capitalKind = isCapitalKind(fields.kind) ? fields.kind : null;
  const inflow = isInflow(fields);
  const group: AccountGroup = capitalKind ?? (fields.kind === "revenue" ? "revenue" : fields.category);
  // A farm grupo without contas has no entry in accountsByGroup.
  const groupAccounts = accountsByGroup(accounts)[group] ?? [];
  // Only the row being edited keeps its archived grupo, whatever the farmer picks meanwhile.
  const groupOptions = despesaGroups(expenseGroups, { keep: source.expense?.category });
  const farmGroups = groupOptions.filter((g) => g.custom);
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === group && !groupAccounts.some((a) => a.id === currentAccount.id)
      ? [...groupAccounts, currentAccount]
      : groupAccounts;
```

with:

```tsx
  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  /** Investimento, financiamento or sócios: conta required, Movimento, no lote. */
  const capitalKind = isCapitalKind(fields.kind) ? fields.kind : null;
  const inflow = isInflow(fields);
  // A grupo without contas has no entry in accountsByGroup.
  const groupAccounts = accountsByGroup(accounts)[fields.category] ?? [];
  // Only the row being edited keeps its archived grupo, whatever the farmer picks meanwhile. The dialog never
  // holds a rendimento, so the tipo is a grupo's.
  const groupOptions =
    fields.kind === "yield" ? [] : groupsOf(planGroups, fields.kind, { keep: source.expense?.category });
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === fields.category && !groupAccounts.some((a) => a.id === currentAccount.id)
      ? [...groupAccounts, currentAccount]
      : groupAccounts;
```

**Replace 8** — find:

```tsx
    try {
      // A financiamento created here has no saldo inicial: Configurações › Plano de contas sets it.
      created = await addAccount({ group, name });
    } catch {
      return; // apiFail already toasted
```

with:

```tsx
    try {
      // A financiamento created here has no saldo inicial: Configurações › Plano de contas sets it.
      created = await addAccount({ group: fields.category, name });
    } catch {
      return; // apiFail already toasted
```

**Replace 9** — find:

```tsx
          rule,
          {
            group: groupOptions.find((g) => g.key === fields.category)?.label,
            account: currentAccount?.name,
            bank: bankAccounts.find((a) => a.id === fields.bankAccountId)?.name,
```

with:

```tsx
          rule,
          {
            group: groupOptions.find((g) => g.id === fields.category)?.name,
            account: currentAccount?.name,
            bank: bankAccounts.find((a) => a.id === fields.bankAccountId)?.name,
```

**Replace 10** — find:

```tsx
                aria-checked={selected}
                onClick={() => {
                  setFields((f) => withKind(f, kind, f.flow, bankAccounts));
                  setNewAccountName(null);
                }}
```

with:

```tsx
                aria-checked={selected}
                onClick={() => {
                  setFields((f) => withKind(f, kind, f.flow, bankAccounts, planGroups));
                  setNewAccountName(null);
                }}
```

**Replace 11** — find:

```tsx
            </div>
          </div>
          {capitalKind ? null : (
            <div className="grid gap-1.5">
              {fields.kind === "revenue" ? (
                <>
                  <span className={FIELD_LABEL}>Grupo</span>
                  <p className="flex min-h-11 items-center rounded-lg border border-input bg-surface px-2.5 text-sm text-ink-soft md:min-h-9">
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
                    <SelectTrigger id="entry-category" className="min-h-11 w-full md:min-h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {groupOptions
                        .filter((g) => !g.custom)
                        .map((g) => (
                          <SelectItem key={g.key} value={g.key}>
                            {g.label}
                          </SelectItem>
                        ))}
                      {farmGroups.length > 0 ? (
                        <>
                          <SelectSeparator />
                          <SelectGroup className="p-0">
                            <SelectLabel className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                              da fazenda
                            </SelectLabel>
                            {farmGroups.map((g) => (
                              <SelectItem key={g.key} value={g.key}>
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      ) : null}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}
          <div className="grid gap-1.5">
            <span className="flex items-center justify-between gap-2">
              <Label htmlFor="entry-account">Conta do plano</Label>
              {newAccountName === null ? (
                <button
                  type="button"
                  onClick={() => setNewAccountName("")}
                  className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-brand hover:underline md:my-0 md:min-h-0"
                >
                  + nova conta
                </button>
              ) : null}
            </span>
            {newAccountName === null ? (
              <>
                {/* A capital kind has no "Sem conta": "" shows the placeholder until one is picked. */}
                <Select
                  value={capitalKind && fields.accountId === NONE ? "" : fields.accountId}
                  onValueChange={(accountId) => set({ accountId })}
                >
                  <SelectTrigger
                    id="entry-account"
                    className="min-h-11 w-full md:min-h-9"
                    aria-required={capitalKind ? true : undefined}
                  >
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
                  className="min-h-11 md:min-h-9"
                />
                <Button
                  type="button"
                  className="min-h-11 md:min-h-9"
                  disabled={creatingAccount}
                  onClick={() => void onCreateAccount()}
                >
                  Criar
                </Button>
              </div>
            )}
          </div>
          {capitalKind ? (
```

with:

```tsx
            </div>
          </div>
          {/* A capital kind's Movimento takes a row of its own: there Grupo and Conta share one, so the column
              keeps the five rows that fit the notebook. */}
          <div className={capitalKind ? "grid grid-cols-2 gap-3" : "contents"}>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-category">Grupo</Label>
              <Select
                value={fields.category}
                disabled={groupOptions.length === 0}
                onValueChange={(category) => {
                  set({ category, accountId: NONE });
                  setNewAccountName(null);
                }}
              >
                <SelectTrigger id="entry-category" className="min-h-11 w-full md:min-h-9">
                  <SelectValue
                    placeholder={groupOptions.length === 0 ? "Nenhum grupo — crie um no Plano de contas" : "Escolha o grupo"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-1.5">
              <span className="flex items-center justify-between gap-2">
                <Label htmlFor="entry-account">{capitalKind ? "Conta" : "Conta do plano"}</Label>
                {newAccountName === null && fields.category !== "" ? (
                  <button
                    type="button"
                    onClick={() => setNewAccountName("")}
                    className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium whitespace-nowrap text-brand hover:underline md:my-0 md:min-h-0"
                  >
                    + nova conta
                  </button>
                ) : null}
              </span>
              {newAccountName === null ? (
                <>
                  {/* A capital kind has no "Sem conta": "" shows the placeholder until one is picked. */}
                  <Select
                    value={capitalKind && fields.accountId === NONE ? "" : fields.accountId}
                    onValueChange={(accountId) => set({ accountId })}
                  >
                    <SelectTrigger
                      id="entry-account"
                      className="min-h-11 w-full md:min-h-9"
                      aria-required={capitalKind ? true : undefined}
                    >
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
                    className="min-h-11 min-w-0 md:min-h-9"
                  />
                  <Button
                    type="button"
                    className="min-h-11 md:min-h-9"
                    disabled={creatingAccount}
                    onClick={() => void onCreateAccount()}
                  >
                    Criar
                  </Button>
                </div>
              )}
            </div>
          </div>
          {capitalKind ? (
```

**Replace 12** — find:

```tsx
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setFields((f) => withKind(f, f.kind, flow, bankAccounts))}
                      className={segmentClass(selected, "flex-1")}
                    >
```

with:

```tsx
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setFields((f) => withKind(f, f.kind, flow, bankAccounts, planGroups))}
                      className={segmentClass(selected, "flex-1")}
                    >
```

- [ ] **Step 6: Implement `NewAccountDialog.tsx`**

After any non-bank place, a "Grupo" select of `groupsOf(planGroups, place)` (the place is the tipo). It starts on `defaultGroup` when that grupo is of the place, else on the place's first grupo; switching place falls back the same way (derived, no effect). With no active grupo of the tipo it is disabled, reads "Nenhum grupo — crie um no Plano de contas", and "Criar conta" is disabled.

`components/finance/plano/NewAccountDialog.tsx`, in order:

**Replace 1** — find:

```tsx
/**
 * "Nova conta": where it sits in the plano — Banco ou caixa, Investimento,
 * Financiamento, Sócios, Despesa (with its grupo: one of the system's or the
 * farm's, archived ones left out) or Receita — then its name.
 * A financiamento may take the saldo devedor it had on a day. "Banco ou
 * caixa" hands over to the conta bancária form (BankAccountDialog), rendered
```

with:

```tsx
/**
 * "Nova conta": where it sits in the plano — Banco ou caixa, or a tipo
 * (Investimento, Financiamento, Sócios, Despesa, Receita) and one of its
 * grupos, archived ones left out — then its name.
 * A financiamento may take the saldo devedor it had on a day. "Banco ou
 * caixa" hands over to the conta bancária form (BankAccountDialog), rendered
```

**Replace 2** — find:

```tsx
import { useState, type FormEvent } from "react";
import { Banknote, HandCoins, Landmark, Receipt, Tractor, Users, type LucideIcon } from "lucide-react";
import type { AccountGroup, CapitalGroup, ExpenseCategory } from "@/lib/types";
import { despesaGroups } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
```

with:

```tsx
import { useState, type FormEvent } from "react";
import { Banknote, HandCoins, Landmark, Receipt, Tractor, Users, type LucideIcon } from "lucide-react";
import type { GroupKind } from "@/lib/types";
import { groupsOf } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
```

**Replace 3** — find:

```tsx
import { cn } from "@/lib/utils";

export type AccountPlace = "bank" | CapitalGroup | "expense" | "revenue";

const PLACES: readonly { place: AccountPlace; label: string; hint: string; Icon: LucideIcon }[] = [
```

with:

```tsx
import { cn } from "@/lib/utils";

/** Banco ou caixa, or the tipo of the grupo the conta goes in. */
export type AccountPlace = "bank" | GroupKind;

const PLACES: readonly { place: AccountPlace; label: string; hint: string; Icon: LucideIcon }[] = [
```

**Replace 4** — find:

```tsx
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
```

with:

```tsx
  onOpenChange,
  defaultPlace = "expense",
  defaultGroup,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultPlace?: AccountPlace;
  /** The grupo picked first, a PlanGroup id of `defaultPlace` ("+ Conta" of a grupo). */
  defaultGroup?: string;
}) {
  /** "Banco ou caixa" was confirmed: the conta bancária form takes over. */
```

**Replace 5** — find:

```tsx
          <NewAccountForm
            defaultPlace={defaultPlace}
            defaultCategory={defaultCategory}
            onBank={() => setBank(true)}
            onDone={close}
```

with:

```tsx
          <NewAccountForm
            defaultPlace={defaultPlace}
            defaultGroup={defaultGroup}
            onBank={() => setBank(true)}
            onDone={close}
```

**Replace 6** — find:

```tsx
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
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
```

with:

```tsx
function NewAccountForm({
  defaultPlace,
  defaultGroup,
  onBank,
  onDone,
}: {
  defaultPlace: AccountPlace;
  defaultGroup?: string;
  onBank(): void;
  onDone(): void;
}) {
  const addAccount = useHerdStore((s) => s.addAccount);
  const planGroups = useHerdStore((s) => s.planGroups);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
  const [picked, setPicked] = useState(defaultGroup ?? "");
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
```

**Replace 7** — find:

```tsx
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
```

with:

```tsx
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groupOptions = place === "bank" ? [] : groupsOf(planGroups, place);
  // Another place drops a grupo that is not of its tipo for the tipo's first.
  const group = groupOptions.some((g) => g.id === picked) ? picked : (groupOptions[0]?.id ?? "");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (place === "bank") return onBank();
    if (group === "") return;
    const clean = name.trim();
    if (clean === "") return setError("Informe o nome da conta.");
    const start = place === "financing" ? openingFromFields(opening, openingDate) : null;
    if (typeof start === "string") return setError(start);
    setError(null);
    setBusy(true);
```

**Replace 8** — find:

```tsx
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
                  {despesaGroups(expenseGroups).map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="new-account-name">Nome</Label>
```

with:

```tsx
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="new-account-group">Grupo</Label>
            <Select value={group} onValueChange={setPicked} disabled={groupOptions.length === 0}>
              <SelectTrigger id="new-account-group" className="min-h-11 w-full">
                <SelectValue placeholder="Nenhum grupo — crie um no Plano de contas" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-account-name">Nome</Label>
```

**Replace 9** — find:

```tsx
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={busy}>
          {place === "bank" ? "Continuar" : "Criar conta"}
        </Button>
```

with:

```tsx
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={busy || (place !== "bank" && group === "")}>
          {place === "bank" ? "Continuar" : "Criar conta"}
        </Button>
```

- [ ] **Step 7: Replace `NewGroupDialog.tsx`**

One tipo: fixed, title "Novo grupo de <tipo no singular>" ("Novo grupo de receita", "Novo grupo de despesa"). Several (the Fora do resultado card): a Tipo switch of three radios, title "Novo grupo fora do resultado". 409 → toast "Já existe um grupo com esse nome".

Replace the whole of `components/finance/plano/NewGroupDialog.tsx` with:

```tsx
"use client";

/**
 * "+ Grupo" of a Plano de contas card: a grupo of the farm, by name, under the
 * card's tipo, or under the tipo picked when the card holds several (Fora do
 * resultado: investimento, financiamento, sócios). Its contas come after, from
 * its own "+ Conta". A name any grupo of the farm already has is refused (409).
 */
import { useState, type FormEvent } from "react";
import type { GroupKind } from "@/lib/types";
import { ENTRY_KIND_LABEL } from "@/lib/domain/entries";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
import { cn } from "@/lib/utils";
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

const OUTSIDE = "Fica fora do custo (COE) e do resultado: aparece em Lançamentos e no formulário de lançamento.";

/** Where a grupo of each tipo shows up. */
const DESCRIPTION: Record<GroupKind, string> = {
  revenue: "Entra no resultado: aparece em Lançamentos, nos relatórios e no formulário de lançamento.",
  expense: "Entra no custo (COE): aparece no Painel, no Orçamento, em Lançamentos e no formulário de lançamento.",
  investment: OUTSIDE,
  financing: OUTSIDE,
  partners: OUTSIDE,
};

const PLACEHOLDER: Record<GroupKind, string> = {
  revenue: "Ex.: Serviços",
  expense: "Ex.: Máquinas e veículos",
  investment: "Ex.: Benfeitorias",
  financing: "Ex.: Pronaf",
  partners: "Ex.: Aportes",
};

export function NewGroupDialog({
  kinds,
  open,
  onOpenChange,
}: {
  /** The tipos offered: one is fixed, several are picked with a switch. */
  kinds: readonly GroupKind[];
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const addPlanGroup = useHerdStore((s) => s.addPlanGroup);
  const { addToast } = useToast();
  const [kind, setKind] = useState<GroupKind>(kinds[0]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName("");
    setError(null);
    onOpenChange(false);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") return setError("Informe o nome do grupo.");
    setError(null);
    setBusy(true);
    let created;
    try {
      created = await addPlanGroup(kind, clean);
    } catch {
      return; // apiFail already toasted
    } finally {
      setBusy(false);
    }
    if (!created) {
      addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: `Grupo "${clean}" criado` });
    close();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kinds.length === 1 ? `Novo grupo de ${ENTRY_KIND_LABEL[kind].toLowerCase()}` : "Novo grupo fora do resultado"}
          </DialogTitle>
          <DialogDescription>{DESCRIPTION[kind]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {kinds.length > 1 ? (
            <div className="grid gap-1.5">
              <span id="new-group-kind" className="text-sm leading-none font-medium">
                Tipo
              </span>
              <div
                role="radiogroup"
                aria-labelledby="new-group-kind"
                className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
              >
                {kinds.map((value) => {
                  const selected = kind === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setKind(value)}
                      className={cn(
                        "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
                        selected
                          ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      {ENTRY_KIND_LABEL[value]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-name">Nome</Label>
            <Input
              id="new-group-name"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={PLACEHOLDER[kind]}
              className="min-h-11 md:min-h-0"
            />
            <p className="text-xs text-ink-soft">Depois crie as contas dele com + Conta.</p>
          </div>
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
              Criar grupo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Replace `AccountsPage.tsx`**

Three cards. Receitas: "Venda de gado" automática, then a block per grupo of `groupsOf(planGroups, "revenue", { archived: true })` with its `GroupHeader`, "+ Grupo" in the card header (`NewGroupDialog` with `kinds: ["revenue"]`). Fora do resultado: "Compra de gado" automática, then every grupo of the three capital kinds flat by name (`byGroupName`), each header with its tipo pill; a financiamento's contas show the saldo devedor of today (`debtBalance`) as before; "+ Grupo" opens `NewGroupDialog` with `kinds: CAPITAL_GROUPS` (three radios). Despesas (COE): every grupo de despesa with the same header, no "da fazenda" tag, no built-in/farm split. Each card closes with "Grupos arquivados (n)" when it has any, and says "Nenhum grupo ativo." when it has none active. The old `GROUP_HINT` lines go (they named fixed keys, and Sanidade/Reprodução no longer fill by themselves). `AccountRow` takes `financing` from its grupo's kind instead of `account.group === "financing"`. `NewGroupDialog` mounts only while open, so its tipo and name start fresh each time.

Replace the whole of `components/finance/plano/AccountsPage.tsx` with:

```tsx
"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside their grupos, every
 * grupo the farm's, each with its GroupHeader (Renomear, Arquivar, Excluir
 * while unused, "+ Conta"). Receitas (Venda de gado is automatic, from the
 * manejos, then the grupos de receita) and Fora do resultado (Compra de gado,
 * then the grupos de investimento, financiamento and sócios by name, each
 * naming its tipo) on the left, Despesas (COE) on the right; each card has its
 * "+ Grupo" and closes with its "Grupos arquivados". A conta shows its last 12
 * months and lançamento count; a financiamento shows its saldo devedor today
 * instead, its saldo inicial under the name, and edits the saldo inicial
 * beside the name. A conta or grupo with lançamentos is archived, which hides
 * it from the forms and keeps history; one without them may be deleted.
 */
import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, Info, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Account, GroupKind, PlanGroup } from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, isCapitalKind, isInflow } from "@/lib/domain/entries";
import { byGroupName, groupsOf } from "@/lib/domain/groups";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  NewAccountDialog,
  openingFromFields,
  type AccountPlace,
} from "@/components/finance/plano/NewAccountDialog";
import { NewGroupDialog } from "@/components/finance/plano/NewGroupDialog";
import { GroupHeader, groupEntryCount } from "@/components/finance/plano/GroupHeader";

interface AccountStats {
  /** Last 12 months, a venda do bem or an aporte taken off; a financiamento's saldo devedor today. */
  amount: number;
  count: number;
}

export function AccountsPage() {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const planGroups = useHerdStore((s) => s.planGroups);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<{ place: AccountPlace; group?: string } | null>(null);
  /** The tipos the open "+ Grupo" offers: its card's. */
  const [addingGroup, setAddingGroup] = useState<readonly GroupKind[] | null>(null);

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
  // Any lançamento ever, not only the 12 months above, keeps a conta from being deleted.
  const used = new Set(expenses.map((e) => e.accountId));
  const byGroup = accountsByGroup(accounts, true);
  const entriesIn = (id: string) => groupEntryCount(id, expenses, accounts);
  const capitalGroups = CAPITAL_GROUPS.flatMap((kind) => groupsOf(planGroups, kind, { archived: true })).sort(
    byGroupName
  );
  // A financiamento shows what is still owed today instead of its 12 months.
  for (const group of capitalGroups.filter((g) => g.kind === "financing")) {
    for (const account of byGroup[group.id] ?? []) {
      stats.set(account.id, {
        amount: debtBalance(account, expenses, today),
        count: stats.get(account.id)?.count ?? 0,
      });
    }
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

  /** A card's grupos, each with its header and contas, then "Grupos arquivados". */
  const groupBlocks = (groups: PlanGroup[]) => {
    const active = groups.filter((g) => !g.archivedAt);
    const archived = groups.filter((g) => g.archivedAt);
    return (
      <>
        {active.length === 0 ? <p className="py-4 text-xs text-ink-soft">Nenhum grupo ativo.</p> : null}
        {active.map((group) => {
          const contas = byGroup[group.id] ?? [];
          return (
            <section key={group.id} className="py-4">
              <GroupHeader
                group={group}
                contas={contas.filter((a) => !a.archivedAt).length}
                entries={entriesIn(group.id)}
                onAdd={canEdit ? () => setAdding({ place: group.kind, group: group.id }) : undefined}
              />
              <AccountList
                accounts={contas}
                stats={stats}
                used={used}
                canEdit={canEdit}
                financing={group.kind === "financing"}
                empty={isCapitalKind(group.kind) ? "Sem contas — crie uma para lançar aqui" : undefined}
              />
            </section>
          );
        })}
        {archived.length > 0 ? <ArchivedGroups groups={archived} entriesIn={entriesIn} canEdit={canEdit} /> : null}
      </>
    );
  };

  const addGroup = (kinds: readonly GroupKind[]) =>
    canEdit ? (
      <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setAddingGroup(kinds)}>
        <Plus data-icon="inline-start" aria-hidden />
        Grupo
      </Button>
    ) : null;

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
          subtitle="As contas de cada grupo. Todos os grupos são da fazenda: renomeie, arquive ou exclua os que não usa."
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
            <SectionCard title="Receitas" subtitle="Entradas de dinheiro além das vendas" action={addGroup(["revenue"])}>
              <div className="-my-4 divide-y divide-hairline">
                <ul>
                  <AutomaticLine name="Venda de gado" />
                </ul>
                {groupBlocks(groupsOf(planGroups, "revenue", { archived: true }))}
              </div>
            </SectionCard>

            <SectionCard
              title="Fora do resultado"
              subtitle="Fora do custo (COE) · financiamentos mostram o saldo devedor de hoje"
              action={addGroup(CAPITAL_GROUPS)}
            >
              <div className="-my-4 divide-y divide-hairline">
                <ul>
                  <AutomaticLine name="Compra de gado" />
                </ul>
                {groupBlocks(capitalGroups)}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Despesas (COE)"
            subtitle="Valores dos últimos 12 meses"
            action={addGroup(["expense"])}
            className="lg:col-span-3"
          >
            <div className="-my-4 divide-y divide-hairline">
              {groupBlocks(groupsOf(planGroups, "expense", { archived: true }))}
            </div>
          </SectionCard>
        </div>

        <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention-soft p-4 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-attention" aria-hidden />
          <p>
            Conta ou grupo com lançamentos não se apaga: arquive para tirá-lo do formulário e manter o histórico; sem
            lançamentos pode ser excluído. Renomear renomeia também os lançamentos antigos. Despesa ou receita sem conta
            fica só no grupo; investimento, financiamento e sócios sempre levam uma conta.
          </p>
        </div>
      </div>

      <NewAccountDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        defaultPlace={adding?.place}
        defaultGroup={adding?.group}
      />
      {addingGroup ? (
        <NewGroupDialog
          open
          kinds={addingGroup}
          onOpenChange={(open) => {
            if (!open) setAddingGroup(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** A line the manejos write by themselves (Venda de gado, Compra de gado). */
function AutomaticLine({ name }: { name: string }) {
  return (
    <li className="flex min-h-11 items-center gap-2 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
      <span className="inline-flex items-center rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
        automática
      </span>
    </li>
  );
}

/** "Grupos arquivados": out of the forms, their lançamentos kept; Restaurar brings one back. */
function ArchivedGroups({
  groups,
  entriesIn,
  canEdit,
}: {
  groups: PlanGroup[];
  /** Lançamentos ever made in a grupo. */
  entriesIn(id: string): number;
  canEdit: boolean;
}) {
  const updatePlanGroup = useHerdStore((s) => s.updatePlanGroup);
  const { addToast } = useToast();

  async function onRestore(group: PlanGroup) {
    try {
      await updatePlanGroup(group.id, { archived: false });
      addToast({ messageType: "success", text: "Grupo restaurado" });
    } catch {
      // apiFail already told the user.
    }
  }

  return (
    <details className="group py-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink md:min-h-0">
        <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
        Grupos arquivados ({groups.length})
      </summary>
      <ul className="mt-1 divide-y divide-hairline">
        {groups.map((group) => {
          const count = entriesIn(group.id);
          return (
            <li key={group.id} className="flex min-h-11 items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm break-words text-ink-soft">
                {group.name}
                <span className="block text-xs">
                  {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
                </span>
              </span>
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 md:size-8"
                  aria-label={`Restaurar o grupo ${group.name}`}
                  title="Restaurar grupo"
                  onClick={() => void onRestore(group)}
                >
                  <ArchiveRestore aria-hidden />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** A grupo's contas: the active ones, then the archived under a disclosure. */
function AccountList({
  accounts,
  stats,
  used,
  canEdit,
  financing,
  empty = "Sem contas — lançamentos ficam só no grupo",
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  /** Contas some lançamento points at. */
  used: ReadonlySet<string | undefined>;
  canEdit: boolean;
  /** A grupo de financiamento: its contas carry a saldo devedor. */
  financing: boolean;
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
            <AccountRow
              key={account.id}
              account={account}
              stats={stats.get(account.id)}
              deletable={!used.has(account.id)}
              canEdit={canEdit}
              financing={financing}
            />
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
                <AccountRow
                key={account.id}
                account={account}
                stats={stats.get(account.id)}
                deletable={!used.has(account.id)}
                canEdit={canEdit}
                financing={financing}
              />
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
  deletable,
  canEdit,
  financing,
}: {
  account: Account;
  stats: AccountStats | undefined;
  /** No lançamento points at it; the server still refuses one a recorrência keeps. */
  deletable: boolean;
  canEdit: boolean;
  /** A conta de financiamento: it edits its saldo devedor inicial too. */
  financing: boolean;
}) {
  const updateAccount = useHerdStore((s) => s.updateAccount);
  const removeAccount = useHerdStore((s) => s.removeAccount);
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Renaming; a financiamento also edits its saldo devedor inicial and its day. */
  const [draft, setDraft] = useState<{ name: string; opening: string; openingDate: string } | null>(null);
  const archived = Boolean(account.archivedAt);
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

  async function onRemove() {
    setBusy(true);
    try {
      if ((await removeAccount(account.id)) === "in_use") {
        addToast({ messageType: "error", text: "Conta com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
        return;
      }
      addToast({ messageType: "success", text: "Conta excluída" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
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
          {deletable ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir ${account.name}`}
              title="Excluir"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : (
            // Keeps the figures lined up with the rows that can be deleted; a phone row wraps anyway.
            <span className="hidden md:block md:size-8" aria-hidden />
          )}
        </span>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta?</DialogTitle>
            <DialogDescription>{account.name} sai do plano de contas e do orçamento.</DialogDescription>
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
              onClick={() => void onRemove()}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
```

- [ ] **Step 9: Run the tests again**

Run: `./node_modules/.bin/vitest run components/finance/__tests__/ --exclude '**/worktrees/**'`
Expected: PASS (every file of the folder; `editFields`, `parseAmount` and `repeatFields` are untouched).

- [ ] **Step 10: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint components/finance/plano components/finance/EntryDialog.tsx components/finance/entryFields.ts components/finance/__tests__/entryFields.test.ts components/finance/__tests__/groupHeader.test.ts`
Expected: eslint clean. `tsc` reports nothing in this task's files; with task 6 done (same wave) it is clean (0 errors). `AccountsPage` reads a financiamento through the `kind` of the `PlanGroup` its contas are listed under (`group.kind === "financing"`), never `account.group === "financing"`. Check for leftovers: `grep -rn "despesaGroups\|expenseGroups\|defaultCategory\|da fazenda" components/finance/plano components/finance/EntryDialog.tsx components/finance/entryFields.ts` prints only the page subtitle ("Todos os grupos são da fazenda…").


---

### Task 8: Migration check + smoke

**Files (outside the repo, already written next to this section; recreate them from the blocks below if missing):**
- Create: `~/.cache/meubov-plan-2026-10-09/migrate-check.sh`
- Create: `~/.cache/meubov-plan-2026-10-09/reset.sh`
- Create: `~/.cache/meubov-plan-2026-10-09/smoke.mjs`
- Output: `~/.cache/meubov-plan-2026-10-09/shots/smoke-*.png`

**Interfaces:**
- Consumes: `drizzle/0030_grupos-livres.sql` + journal idx 30 (task 1); `seedPlanGroups` via `cli/seedCli.ts` (task 1); `POST/PATCH/DELETE /api/herd/plan-groups` and the sêmen route shapes `{ bull }`, `{ purchase }`, `{ id }` (tasks 2 and 4); `400 invalid_category` from `normaliseEntry` (task 3); the tree's `?conta=` values `receitas | despesas | financiamentos | grupo:<id> | conta:<id> | venda-de-gado | todos` (task 5); the Plano de contas, EntryDialog, NewGroupDialog and NewAccountDialog copy (task 7) and the relatório por grupo (task 6).
- Produces: nothing other tasks read. The smoke's locators pin this UI copy, all of which exists today and must survive tasks 6–7: card titles `Receitas`, `Fora do resultado`, `Despesas (COE)` (h2) with each grupo an h3 inside its own `<section>`; header buttons `Renomear o grupo X`, `Arquivar o grupo X`, `Excluir o grupo X`, the inline input `Novo nome de X`, the confirm titles `Arquivar X?` / `Excluir X?` and their buttons `Arquivar` / `Excluir`; `+ Grupo` button named `Grupo`, `+ Conta` named `Conta`; dialog titles starting with `Novo grupo`, a `Nome` field, `Criar grupo`; `Grupos arquivados (n)`; toasts `Grupo renomeado`, `Grupo arquivado`, `Grupo excluído`, `Grupo "X" criado`, `Já existe um grupo com esse nome`, `Conta "X" criada`, `Receita lançada`, `Compra registrada`, `Tratamento concluído`; the EntryDialog's `Tipo de lançamento` radios, `Grupo` and `Conta do plano` comboboxes, `Valor (R$)`, `Data`, `A receber`, `Recebido de`, `Lançar`; the purchase dialog's `Registrar compra de <touro>`, `Data`, `Doses`, `Valor total (R$)`, `Fornecedor`; the Painel's `Composição de custos` card with "COE R$ …" in its subtitle; the relatório's `Contas de cada grupo` toggle. New copy the smoke expects from the spec/contract: the subtitle containing "Todos os grupos são da fazenda", a kind pill reading "investimento" in the Investimentos header, no radio in the Receitas card's Novo grupo dialog and three radios in the Fora do resultado one, the Nova conta `Grupo` select preselected from a grupo's `+ Conta`.

Notes before running:
- `REPO` is the checkout under test: the sandbox clone for a verifier (`REPO=~/.cache/meubov-plan-2026-10-09/sandbox`), `/home/luketa/meubov` (the default) for the controller. Never run `pnpm` in the sandbox: every command below calls `./node_modules/.bin/*` or `node` directly.
- `next dev` must run with `--webpack` in the sandbox: Turbopack refuses its `node_modules` symlink ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"). It works the same on main, so the step always passes it.
- No `.env.local` is needed: `DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` go on the command line (they win over `.env.local` where it exists).
- Run `docker ps` and `ss -ltnp` first: port 5454, port 3021 and the container `meubov-livres-db` must be free.
- The host has 16 GB and other sessions keep `next-server`s up; in a dry run against the base commit the tmpfs Postgres and once Chromium were killed mid-smoke under memory pressure (symptom: `No such container: meubov-livres-db` or `Target page, context or browser has been closed` from one step on). Stop any idle dev server of your own first; on that symptom run `reset.sh` and the smoke again.
- Dry run against the base commit (before this change): `migrate-check.sh` passed 28/28 on a copy with the spec's 0030 and failed 2 checks on a copy whose remap ignored the kind; the smoke's steps 1, 7, 8 and 9 ran their locators and caught the old behaviour (COE moved by the tratamento's R$ 3.456,78, the ledger grew by one row, the relatório showed the cost, the first sêmen purchase answered with an `expense`).

- [ ] **Step 1: Write the three files**

If they are not already in `~/.cache/meubov-plan-2026-10-09/`, write them from the blocks below and `chmod +x ~/.cache/meubov-plan-2026-10-09/*.sh`.

`~/.cache/meubov-plan-2026-10-09/migrate-check.sh`:

```bash
#!/bin/bash
# Migration 0030 (grupos livres) on a real Postgres: migrate a tmpfs database to 0029, write two farms of
# old-key rows, apply 0030 the way `pnpm db:migrate` does, and assert every remapped column with psql.
# Usage: REPO=/path/to/meubov bash ~/.cache/meubov-plan-2026-10-09/migrate-check.sh   (REPO defaults to the main checkout)
# Exits non-zero on the first broken step or when any check fails. Leaves the container running for a look;
# `docker rm -f meubov-livres-db` afterwards (reset.sh recreates it anyway).
set -euo pipefail
REPO=${REPO:-/home/luketa/meubov}
DB=meubov-livres-db
URL=postgresql://meubov:meubov@127.0.0.1:5454/meubov
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

test -f "$REPO/drizzle/0030_grupos-livres.sql" || { echo "no $REPO/drizzle/0030_grupos-livres.sql"; exit 1; }
node -e 'const j = require(process.argv[1]); const e = j.entries.at(-1);
  if (e.idx !== 30 || e.tag !== "0030_grupos-livres") { console.error("journal ends at", e.idx, e.tag); process.exit(1); }' \
  "$REPO/drizzle/meta/_journal.json"

docker rm -f $DB >/dev/null 2>&1 || true
docker run --rm -d --name $DB -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov \
  -p 127.0.0.1:5454:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine >/dev/null
until docker exec $DB pg_isready -U meubov -h 127.0.0.1 >/dev/null 2>&1; do sleep 1; done; sleep 2

psql() { docker exec -i $DB psql -U meubov -d meubov -tA -v ON_ERROR_STOP=1 "$@"; }

# 0000–0029: drizzle's own migrator on a copy of drizzle/ whose journal stops at idx 29.
cp -r "$REPO/drizzle" "$TMP/drizzle"
node -e 'const fs = require("fs"); const f = process.argv[1]; const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.entries = j.entries.filter((e) => e.idx <= 29); fs.writeFileSync(f, JSON.stringify(j, null, 2));' \
  "$TMP/drizzle/meta/_journal.json"
(cd "$REPO" && URL=$URL node --input-type=module -e '
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const pool = new pg.Pool({ connectionString: process.env.URL });
await migrate(drizzle(pool), { migrationsFolder: process.argv[1] });
await pool.end();' "$TMP/drizzle")
test "$(psql -c 'select count(*) from drizzle.__drizzle_migrations')" = 30 || { echo "0000–0029 not applied"; exit 1; }
test "$(psql -c "select count(*) from information_schema.tables where table_name = 'expense_groups'")" = 1

# Two farms with the old keys: a conta in every grupo, a lançamento of every kind (the capital ones and the
# receita with the "other" sentinel, a rendimento too), a série of each branch, budget lines, a sêmen purchase
# with its expense. Farm 101 also has a farm grupo (Máquinas) with a conta, a despesa and a budget line.
psql >/dev/null <<'SQL'
insert into farm (id, name, municipality, state_registration, manager) values
  (101, 'Fazenda A', 'Cuiabá', '1', 'Ana'), (202, 'Fazenda B', 'Goiânia', '2', 'Bia');
insert into expense_groups (id, farm_id, name) values ('eg-a-maq', 101, 'Máquinas');

insert into accounts (id, farm_id, "group", name, opening_balance_brl, opening_date)
select 'acc-' || s || '-' || k, f, k, 'Conta ' || k,
       case when k = 'financing' then 50000 end, case when k = 'financing' then date '2026-01-01' end
from (values (101, 'a'), (202, 'b')) farms(f, s)
cross join unnest(array['revenue','nutrition','pasture','labor','health','breeding','admin','other',
                        'investment','financing','partners']) k;
insert into accounts (id, farm_id, "group", name) values ('acc-a-maq', 101, 'eg-a-maq', 'Trator');

-- despesas in the seven built-in keys
insert into expenses (id, farm_id, kind, date, category, amount_brl, account_id)
select 'exp-' || s || '-' || k, f, 'expense', date '2026-09-10', k, 100, 'acc-' || s || '-' || k
from (values (101, 'a'), (202, 'b')) farms(f, s)
cross join unnest(array['nutrition','pasture','labor','health','breeding','admin','other']) k;
-- receita, the three capital kinds and a rendimento: all with the "other" sentinel
insert into expenses (id, farm_id, kind, flow, date, category, amount_brl, account_id)
select 'exp-' || s || '-' || k, f, k::entry_kind,
       case when k in ('investment','partners') then 'out' when k = 'financing' then 'in' end::entry_flow,
       date '2026-09-11', 'other', 200, case when k <> 'yield' then 'acc-' || s || '-' || k end
from (values (101, 'a'), (202, 'b')) farms(f, s)
cross join unnest(array['revenue','investment','financing','partners','yield']) k;
insert into expenses (id, farm_id, kind, date, category, amount_brl, account_id) values
  ('exp-a-maq', 101, 'expense', '2026-09-12', 'eg-a-maq', 300, 'acc-a-maq');
-- the sêmen purchases' expenses
insert into expenses (id, farm_id, kind, date, category, amount_brl, account_id, notes)
select 'exp-' || s || '-semen', f, 'expense', date '2026-09-13', 'breeding', 800, 'acc-' || s || '-breeding', 'Sêmen Tufão'
from (values (101, 'a'), (202, 'b')) farms(f, s);

insert into expense_series (id, farm_id, mode, frequency, day_of_month, starts_on, count, kind, flow, category, amount_brl, account_id)
select 'ser-' || s || '-labor', f, 'recurring'::series_mode, 'monthly'::series_frequency, 5, date '2026-09-05', null::int,
       'expense'::entry_kind, null::entry_flow, 'labor', 2500, 'acc-' || s || '-labor'
from (values (101, 'a'), (202, 'b')) farms(f, s)
union all
select 'ser-' || s || '-fin', f, 'installments', 'monthly', 20, date '2026-09-20', 3, 'financing', 'out', 'other', 9000, 'acc-' || s || '-financing'
from (values (101, 'a'), (202, 'b')) farms(f, s);

insert into budgets (id, farm_id, category, account_id, month, amount_brl, distribution, updated_by)
select 'bud-' || s || '-' || n, f, 'nutrition', case when n = 2 then 'acc-' || s || '-nutrition' end,
       date '2026-10-01', 1000, 'equal', 'u'
from (values (101, 'a'), (202, 'b')) farms(f, s) cross join generate_series(1, 2) n;
insert into budgets (id, farm_id, category, month, amount_brl, distribution, updated_by) values
  ('bud-a-maq', 101, 'eg-a-maq', '2026-10-01', 500, 'equal', 'u');

insert into semen_bulls (id, farm_id, name) values ('bull-a', 101, 'Tufão'), ('bull-b', 202, 'Tufão');
insert into semen_purchases (id, bull_id, date, doses, total_brl, expense_id) values
  ('pur-a', 'bull-a', '2026-09-13', 10, 800, 'exp-a-semen'), ('pur-b', 'bull-b', '2026-09-13', 10, 800, 'exp-b-semen');

-- What every row held before 0030, and what each old key turns into.
create schema chk;
create table chk.before as
  select 'accounts'::text t, id, farm_id, null::text kind, "group" old from accounts
  union all select 'expenses', id, farm_id, kind::text, category from expenses
  union all select 'expense_series', id, farm_id, kind::text, category from expense_series
  union all select 'budgets', id, farm_id, null, category from budgets;
create table chk.legacy (key text, kind text, name text);
insert into chk.legacy values
  ('revenue','revenue','Receitas'),
  ('nutrition','expense','Nutrição'), ('pasture','expense','Pastagem'),
  ('labor','expense','Mão de obra'), ('health','expense','Sanidade'),
  ('breeding','expense','Reprodução'), ('admin','expense','Administrativo'),
  ('other','expense','Outros'),
  ('investment','investment','Investimentos'),
  ('financing','financing','Financiamentos'),
  ('partners','partners','Sócios');
SQL

# 0030 the way `pnpm db:migrate` and the Vercel build apply it: drizzle-kit on the real drizzle/ folder.
(cd "$REPO" && DATABASE_URL=$URL ./node_modules/.bin/drizzle-kit migrate >"$TMP/migrate.log" 2>&1) || { cat "$TMP/migrate.log"; exit 1; }

# ---- checks -----------------------------------------------------------------------------------------
fails=0
total=0
expect() { # name, sql, wanted output
  local got
  total=$((total + 1))
  got=$(psql -c "$2" 2>&1) || true
  if [ "$got" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 — got '$got', want '$3'"; fails=$((fails + 1)); fi
}
refused() { # name, sql that must fail
  total=$((total + 1))
  if psql -c "$2" >/dev/null 2>&1; then echo "FAIL $1 — the statement was accepted"; fails=$((fails + 1)); else echo "ok   $1"; fi
}
# Rows of table $1 whose grupo column $2 does not point at their own farm's grupo of the right kind and name.
# $3: the old key the row maps by (expenses and séries: their kind unless a despesa).
wrong() {
  echo "select count(*) from chk.before b join $1 r on r.id = b.id
        left join chk.legacy l on l.key = $3
        left join plan_groups g on g.id = r.$2
        where b.t = '$1' and coalesce(b.kind, '') <> 'yield' and (
          g.id is null or g.farm_id <> b.farm_id
          or (l.key is not null and (g.kind::text <> l.kind or g.name <> l.name))
          or (l.key is null and (r.$2 <> b.old or g.kind <> 'expense')))"
}
BY_KIND="case when b.kind = 'expense' then b.old else b.kind end"

expect "0030 is the 31st applied migration" "select count(*) from drizzle.__drizzle_migrations" "31"
expect "expense_groups is gone, plan_groups is there" \
  "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_name in ('expense_groups','plan_groups')" "plan_groups"
expect "plan_groups.kind is a not-null plan_group_kind with no default" \
  "select udt_name || '|' || is_nullable || '|' || coalesce(column_default, '-') from information_schema.columns where table_name = 'plan_groups' and column_name = 'kind'" \
  "plan_group_kind|NO|-"
expect "plan_groups.legacy_key is gone" \
  "select count(*) from information_schema.columns where table_name = 'plan_groups' and column_name = 'legacy_key'" "0"
expect "each farm got the eleven grupos, farm 101 keeps Máquinas" \
  "select string_agg(farm_id || ':' || n, ',' order by farm_id) from (select farm_id, count(*) n from plan_groups group by farm_id) x" \
  "101:12,202:11"
expect "every farm has each default once, with its kind and name" \
  "select count(*) from (values (101), (202)) f(id) cross join chk.legacy l
   where (select count(*) from plan_groups g where g.farm_id = f.id and g.kind::text = l.kind and g.name = l.name) <> 1" "0"
expect "Máquinas became an expense grupo, same id" \
  "select kind || '|' || name from plan_groups where id = 'eg-a-maq'" "expense|Máquinas"
expect "accounts.group: its farm's grupo of the right kind and name" "$(wrong accounts '"group"' b.old)" "0"
expect "expenses.category (all but yield): its farm's grupo of the right kind" "$(wrong expenses category "$BY_KIND")" "0"
expect "expense_series.category: its farm's grupo of the right kind" "$(wrong expense_series category "$BY_KIND")" "0"
expect "budgets.category: its farm's grupo" "$(wrong budgets category b.old)" "0"
expect "a receita points at Receitas of its own farm" \
  "select string_agg(e.id || '>' || g.farm_id || ' ' || g.name, ',' order by e.id) from expenses e join plan_groups g on g.id = e.category where e.kind = 'revenue'" \
  "exp-a-revenue>101 Receitas,exp-b-revenue>202 Receitas"
expect "the financing série points at Financiamentos" \
  "select string_agg(g.kind || ' ' || g.name, ',') from expense_series s join plan_groups g on g.id = s.category where s.id = 'ser-b-fin'" \
  "financing Financiamentos"
expect "a rendimento has a null category" \
  "select string_agg(id || '=' || coalesce(category, 'null'), ',' order by id) from expenses where kind = 'yield'" \
  "exp-a-yield=null,exp-b-yield=null"
expect "no lançamento but a rendimento has a null category" \
  "select count(*) from expenses where category is null and kind <> 'yield'" "0"
expect "expenses.category is nullable; séries, budgets and accounts stay not null" \
  "select string_agg(table_name || '.' || column_name || '=' || is_nullable, ',' order by table_name)
   from information_schema.columns where (table_name, column_name) in
   (('expenses','category'), ('expense_series','category'), ('budgets','category'), ('accounts','group'))" \
  "accounts.group=NO,budgets.category=NO,expense_series.category=NO,expenses.category=YES"
expect "no row was lost" \
  "select (select count(*) from chk.before) = (select count(*) from accounts) + (select count(*) from expenses)
          + (select count(*) from expense_series) + (select count(*) from budgets)" "t"
expect "the sêmen expenses stay as plain despesas in Reprodução" \
  "select string_agg(e.id || ' ' || e.kind || ' ' || g.name || ' ' || e.amount_brl::int, ',' order by e.id)
   from expenses e join plan_groups g on g.id = e.category and g.farm_id = e.farm_id where e.id like '%-semen'" \
  "exp-a-semen expense Reprodução 800,exp-b-semen expense Reprodução 800"
expect "semen_purchases.expense_id is gone" \
  "select count(*) from information_schema.columns where table_name = 'semen_purchases' and column_name = 'expense_id'" "0"
expect "the purchases stay" "select count(*) from semen_purchases" "2"
expect "indexes and FK kept their places" \
  "select string_agg(indexname, ',' order by indexname) from pg_indexes
   where indexname in ('plan_groups_farm_name_idx', 'accounts_farm_id_group_name_idx', 'budgets_line_month_idx')" \
  "accounts_farm_id_group_name_idx,budgets_line_month_idx,plan_groups_farm_name_idx"
expect "plan_groups_farm_name_idx is on plan_groups" \
  "select tablename from pg_indexes where indexname = 'plan_groups_farm_name_idx'" "plan_groups"
expect "the FK is renamed" \
  "select conrelid::regclass::text from pg_constraint where conname = 'plan_groups_farm_id_farm_id_fk'" "plan_groups"
expect "no budget line or conta collides after the remap" \
  "select (select count(*) from (select 1 from budgets group by farm_id, category, coalesce(account_id, ''), month having count(*) > 1) x)
        + (select count(*) from (select 1 from accounts group by farm_id, \"group\", lower(name) having count(*) > 1) y)" "0"
refused "a grupo name is unique per farm across kinds (any case)" \
  "insert into plan_groups (id, farm_id, kind, name) values ('dup', 101, 'partners', 'OUTROS')"
expect "the same name on another farm is fine" \
  "with i as (insert into plan_groups (id, farm_id, kind, name) values ('ok-b', 202, 'partners', 'Máquinas') returning kind) select kind from i" "partners"
refused "a conta name stays unique inside its grupo" \
  "insert into accounts (id, farm_id, \"group\", name) select 'dup', farm_id, \"group\", upper(name) from accounts where id = 'acc-a-labor'"
refused "a budget line stays unique per month" \
  "insert into budgets (id, farm_id, category, month, amount_brl, distribution, updated_by)
   select 'dup', farm_id, category, month, 1, 'equal', 'u' from budgets where id = 'bud-a-1'"

echo
if [ $fails -gt 0 ]; then echo "migration 0030: $fails of $total checks FAILED"; exit 1; fi
echo "migration 0030: all $total checks ok"
```

`~/.cache/meubov-plan-2026-10-09/reset.sh`:

```bash
#!/bin/bash
# Fresh database for a smoke (re)run: recreate the tmpfs container, migrate from zero, sign up the owner and the
# Reprodução member, seed the owner's farm (farm 1) and add the member to it with Reprodução edit and no Financeiro.
# The dev server must already be up on 3021 (it signs the users up); it survives the database swap.
# Usage: REPO=/path/to/meubov bash ~/.cache/meubov-plan-2026-10-09/reset.sh   (REPO defaults to the main checkout)
set -euo pipefail
REPO=${REPO:-/home/luketa/meubov}
B=http://localhost:3021
DB=meubov-livres-db
URL=postgresql://meubov:meubov@127.0.0.1:5454/meubov
docker rm -f $DB >/dev/null 2>&1 || true
docker run --rm -d --name $DB -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov \
  -p 127.0.0.1:5454:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine >/dev/null
until docker exec $DB pg_isready -U meubov -h 127.0.0.1 >/dev/null 2>&1; do sleep 1; done; sleep 2
cd "$REPO"
DATABASE_URL=$URL ./node_modules/.bin/drizzle-kit migrate >/dev/null
signup() {
  curl -sf -X POST $B/api/auth/sign-up/email -H 'content-type: application/json' -H "origin: $B" -d "$1" >/dev/null
}
signup '{"name":"Teste Livres","email":"teste.livres@meubov.local","password":"LivresFazenda2026!"}'
signup '{"name":"Teste Reprodução","email":"teste.livres.rep@meubov.local","password":"LivresRepro2026!"}'
DATABASE_URL=$URL ./node_modules/.bin/tsx cli/seedCli.ts --email teste.livres@meubov.local 2>&1 | tail -1
# The vaqueiro preset: Reprodução edit, Financeiro none (lib/domain/permissions.ts PRESETS.vaqueiro).
docker exec $DB psql -U meubov -d meubov -tAc "insert into farm_users (farm_id, user_id, role, preset, permissions)
  select 1, id, 'member', 'vaqueiro', '{\"herd\":\"edit\",\"manejo\":\"edit\",\"reproduction\":\"edit\",\"sanitary\":\"edit\",\"lots\":\"edit\",\"finance\":\"none\",\"farm\":\"view\",\"team\":\"none\"}'::jsonb
  from \"user\" where email = 'teste.livres.rep@meubov.local'" >/dev/null
echo "users $(docker exec $DB psql -U meubov -d meubov -tAc 'select count(*) from "user"') · farm 1 grupos $(docker exec $DB psql -U meubov -d meubov -tAc 'select count(*) from plan_groups where farm_id = 1') · members $(docker exec $DB psql -U meubov -d meubov -tAc 'select count(*) from farm_users where farm_id = 1')"
```

`~/.cache/meubov-plan-2026-10-09/smoke.mjs`:

```js
// Smoke of "Grupos livres no plano de contas, Financeiro desacoplado" against `next dev` on a throwaway database.
// Usage: node ~/.cache/meubov-plan-2026-10-09/smoke.mjs
// Needs a fresh database from reset.sh: owner teste.livres seeded (farm 1), member teste.livres.rep in farm 1 with
// Reprodução edit and Financeiro none. A second run on the same database fails: run reset.sh first.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3021";
const DB = process.env.DB ?? "meubov-livres-db";
const OUT = process.env.OUT ?? `${homedir()}/.cache/meubov-plan-2026-10-09/shots`;
mkdirSync(OUT, { recursive: true });

const OWNER = { email: "teste.livres@meubov.local", password: "LivresFazenda2026!" };
const MEMBER = { email: "teste.livres.rep@meubov.local", password: "LivresRepro2026!" };
const DESK = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };
const FARM = 1;
const DEFAULTS = [
  ["revenue", "Receitas"],
  ["expense", "Nutrição"], ["expense", "Pastagem"], ["expense", "Mão de obra"], ["expense", "Sanidade"],
  ["expense", "Reprodução"], ["expense", "Administrativo"], ["expense", "Outros"],
  ["investment", "Investimentos"], ["financing", "Financiamentos"], ["partners", "Sócios"],
];
const RENAMED = "Receitas diversas";
const NEWG = "Arrendamentos";
const CONTA = "Pasto arrendado";
const RECEBIDO = "Vizinho Smoke Livres";
const TRAT = "Vermífugo Smoke Livres";
const TRAT_COST = 3456.78;
const BULL = "Tufão Smoke Livres";
const SELLER = "Central Smoke Livres";

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const [TY, TM] = TODAY.split("-").map(Number);
/** The 15th of last month: inside the relatório's default window (last month) and the Painel's (12 months). */
const LAST15 = TM === 1 ? iso(TY - 1, 12, 15) : iso(TY, TM - 1, 15);
/** lib/domain/period defaultPeriod(today): the 12 months through the end of this one. */
const WINDOW = { start: iso(TM === 12 ? TY : TY - 1, (TM % 12) + 1, 1), end: iso(TY, TM, new Date(TY, TM, 0).getDate()) };

const sql = (q) => execSync(`docker exec -i ${DB} psql -U meubov -d meubov -tA -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const groupId = (name) => sql(`select id from plan_groups where farm_id = ${FARM} and name = '${name}'`);
const expenseCount = () => sql(`select count(*) from expenses where farm_id = ${FARM}`);
const norm = (s) => String(s).replace(/[  ]/g, " ");

// ---- checks ------------------------------------------------------------------
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
/** Polls until `ok(got)` or 15 s: next dev compiles a route on first hit. */
async function eventually(name, probe, ok, detail = (g) => JSON.stringify(g)) {
  let got;
  for (let i = 0; i < 60; i += 1) {
    got = await probe().catch((e) => `error: ${e.message.split("\n")[0]}`);
    if (ok(got)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  check(name, ok(got), detail(got));
  return got;
}

// ---- browser, sessions -------------------------------------------------------
const browser = await chromium.launch({ executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` });
const errors = [];
// 409s are the refused names and deletes the smoke provokes; the exact-mirror line is old dev-log noise.
const NOISE = /_vercel|vercel-scripts|\/api\/market\/quote|status of 409|exact-mirror/;
function watch(page, who) {
  page.setDefaultTimeout(20000);
  // next dev --webpack compiles a route on its first hit: a cold page takes well over 20 s.
  page.setDefaultNavigationTimeout(180000);
  page.on("pageerror", (e) => errors.push(`${who} pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location()?.url ?? "";
    if (NOISE.test(`${m.text()} ${where}`)) return;
    errors.push(`${who} console: ${m.text().slice(0, 200)} @ ${where}`);
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (/_vercel|vercel-scripts|\/api\/market\/quote/.test(url)) return;
    if (/_rsc/.test(url) && /ABORTED/.test(r.failure()?.errorText ?? "")) return;
    errors.push(`${who} requestfailed: ${url} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${who} ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}
async function openSession(user) {
  const context = await browser.newContext({ viewport: DESK, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  await context.route("**/api/market/quote**", (route) => route.abort());
  await context.addInitScript(() => {
    try {
      localStorage.setItem("meubov.activeFarmId", "1");
    } catch {}
  });
  const res = await context.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: user.email, password: user.password },
    headers: { origin: BASE },
  });
  check(`sign in ${user.email}`, res.ok(), String(res.status()));
  const page = await context.newPage();
  watch(page, user.email);
  return { context, page };
}
const apiOf = (context) => async (method, path, data) => {
  const res = await context.request.fetch(`${BASE}/api/herd${path}`, { method, data, headers: { origin: BASE, "x-farm-id": String(FARM) } });
  return { status: res.status(), json: await res.json().catch(() => null) };
};

const { context: ownerCtx, page } = await openSession(OWNER);
const api = apiOf(ownerCtx);
// Warm-up: compile every route the smoke opens before any step's 20 s locators run.
for (const path of ["/finance", "/finance/lancamentos", "/settings/plano-de-contas", "/relatorios/grupos", "/calendar", "/reproducao?tab=touros"]) {
  const t = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "load" }).catch((e) => console.log(`warm-up ${path}: ${e.message.split("\n")[0]}`));
  console.log(`warm-up ${path} ${Date.now() - t} ms`);
}
/** A phone page of the owner (390 px). */
async function phonePage(who = "owner@390", ctx = ownerCtx) {
  const pp = await ctx.newPage();
  watch(pp, who);
  await pp.setViewportSize(PHONE);
  return pp;
}
/** Novo lançamento must fit 576 px at 1366×640: no inner scroll, the dialog's height within the viewport. */
async function dialogFits(label, pg = page) {
  const r = await dialog(pg).evaluate((d) => {
    const body = [...d.querySelectorAll("div")].find((el) => getComputedStyle(el).overflowY === "auto");
    return { h: Math.round(d.getBoundingClientRect().height), sh: body?.scrollHeight ?? 0, ch: body?.clientHeight ?? 0 };
  });
  check(`1366×640: Novo lançamento (${label}) fits 576 px with no inner scroll`, r.h <= 576 && r.sh <= r.ch + 1, JSON.stringify(r));
}

// ---- page helpers ------------------------------------------------------------
const dialog = (pg = page) => pg.getByRole("dialog").last();
const visible = (loc) => loc.locator("visible=true");
const toastCount = (text, pg = page) => pg.locator("[data-sonner-toast]", { hasText: text }).count();
/** Clicks, then waits for one more toast with `text` than there was before. */
async function clickForToast(locator, text, pg = page) {
  const before = await toastCount(text, pg);
  await locator.click();
  for (let i = 0; i < 60; i += 1) {
    if ((await toastCount(text, pg)) > before) return true;
    await pg.waitForTimeout(250);
  }
  return false;
}
async function shot(name, pg = page, fullPage = true) {
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${OUT}/smoke-${name}.png`, fullPage });
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name} (threw)`, false, e.message.split("\n")[0]);
    await page.screenshot({ path: `${OUT}/smoke-fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }
}
async function noSideScroll(name, pg) {
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`390: ${name} has no horizontal scroll`, sw <= PHONE.width, `scrollWidth ${sw}`);
}

// Plano de contas: a card is the section of its h2; a grupo is the section of its h3 (archived grupos are no h3).
const card = (title, pg = page) =>
  pg.getByRole("heading", { name: title, level: 2, exact: true }).locator("xpath=ancestor::section[1]");
const groupSection = (cardTitle, name, pg = page) =>
  card(cardTitle, pg).getByRole("heading", { name, level: 3, exact: true }).locator("xpath=ancestor::section[1]");
async function goPlano(pg = page) {
  await pg.goto(`${BASE}/settings/plano-de-contas`);
  await card("Despesas (COE)", pg).getByRole("heading", { name: "Nutrição", level: 3, exact: true }).waitFor();
}
const archivedSummary = (cardTitle, pg = page) => card(cardTitle, pg).getByText(/^Grupos arquivados \(\d+\)$/);

// Painel
const composicao = (pg = page) =>
  pg.getByRole("heading", { name: "Composição de custos", exact: true }).locator("xpath=ancestor::section[1]");
async function goPainel(pg = page) {
  await pg.goto(`${BASE}/finance`);
  await pg.getByRole("heading", { name: "Composição de custos" }).waitFor();
}
/** "COE R$ 12.345,67" in the Composição de custos subtitle. */
async function painelCoe(pg = page) {
  const m = norm(await composicao(pg).innerText()).match(/COE (R\$ ?[\d.,]+)/);
  return m ? m[1] : null;
}
async function openLancar(pg = page) {
  await goPainel(pg);
  await visible(pg.locator("main").getByRole("button", { name: "Lançar", exact: true })).first().click();
  await dialog(pg).getByRole("heading", { name: "Novo lançamento" }).waitFor();
}
/** Opens a Select of the open dialog by its label and reads its options. */
async function selectOptions(label, pg = page) {
  await dialog(pg).getByRole("combobox", { name: label, exact: true }).click();
  const list = pg.getByRole("listbox");
  await list.waitFor();
  return list.getByRole("option").allTextContents();
}

// Lançamentos: the tree is the section titled "Plano de contas"; each row links ?conta=<nodeParam>.
const tree = (pg = page) => pg.locator("section[aria-labelledby=plan-tree-title]");
async function goLancamentos(query = "", pg = page) {
  await pg.goto(`${BASE}/finance/lancamentos${query}`);
  await tree(pg).getByText("Todos os lançamentos").waitFor();
}
/** The `conta` values of every link under the top item whose own link is `?conta=<param>`, its own first. */
async function kindParams(param, pg = page) {
  const top = tree(pg).locator("li", { has: pg.locator(`a[href*="conta=${param}"]`) }).first();
  const hrefs = await top.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.map((h) => new URL(h, "http://x").searchParams.get("conta"));
}
/** The figure beside "Todos os lançamentos": rows in the window. */
async function allCount(pg = page) {
  const text = await tree(pg).getByRole("link", { name: /^Todos os lançamentos/ }).innerText();
  return Number(norm(text).replace(/\D/g, ""));
}

let RECEITAS_ID = "";
let NEWG_ID = "";
let CONTA_ID = "";

// ---- 0. The seeded farm has the eleven grupos --------------------------------------
await step("0 seed", async () => {
  const rows = sql(`select kind || ':' || name from plan_groups where farm_id = ${FARM} order by kind, name`).split("\n");
  const want = DEFAULTS.map(([k, n]) => `${k}:${n}`).sort((a, b) => a.localeCompare(b));
  check("0. farm 1 has the eleven default grupos, each of its kind", JSON.stringify([...rows].sort((a, b) => a.localeCompare(b))) === JSON.stringify(want), rows.join(","));
  RECEITAS_ID = groupId("Receitas");
  check("0. every seeded receita points at the Receitas grupo", sql(`select count(*) from expenses where farm_id = ${FARM} and kind = 'revenue' and category is distinct from '${RECEITAS_ID}'`) === "0");
  check("0. no lançamento holds an old key", sql(`select count(*) from expenses where farm_id = ${FARM} and category in ('other','nutrition','revenue','investment','financing','partners')`) === "0");
  check("0. a rendimento has no grupo", sql(`select count(*) from expenses where farm_id = ${FARM} and kind = 'yield' and category is not null`) === "0");
});

// ---- 1. Lançamentos: a tipo with one grupo reads flat --------------------------------
await step("1 colapso", async () => {
  await goLancamentos();
  const receitas = await eventually("1. the tree lists Receitas", () => kindParams("receitas"), (p) => p.length > 1);
  check("1. Receitas (one grupo) lists no grupo item", !receitas.some((p) => p?.startsWith("grupo:")), JSON.stringify(receitas));
  check("1. Receitas lists Venda de gado and its contas directly", receitas.includes("venda-de-gado") && receitas.some((p) => p?.startsWith("conta:")), JSON.stringify(receitas));
  const despesas = await kindParams("despesas");
  check("1. Despesas (seven grupos) lists its seven grupo items", despesas.filter((p) => p?.startsWith("grupo:")).length === 7, JSON.stringify(despesas));
  const financ = await kindParams("financiamentos");
  check("1. Financiamentos (one grupo) lists no grupo item", !financ.some((p) => p?.startsWith("grupo:")), JSON.stringify(financ));
  await shot("1-lancamentos-colapso");
  const pp = await phonePage();
  await goLancamentos("", pp);
  await noSideScroll("Lançamentos (collapsed)", pp);
  await shot("1-390-lancamentos-colapso", pp);
  await pp.close();
});

// ---- 2. Plano de contas: every grupo has the actions; rename and archive Receitas ------
await step("2 receitas", async () => {
  await goPlano();
  const main = norm(await page.locator("main").innerText());
  check("2. the subtitle says every grupo is the farm's", main.includes("Todos os grupos são da fazenda"));
  check('2. no "da fazenda" tag is left', (await page.locator("main").getByText("da fazenda", { exact: true }).count()) === 0);
  for (const [, name] of DEFAULTS) {
    check(`2. ${name} has Renomear and Arquivar`, (await page.getByRole("button", { name: `Renomear o grupo ${name}`, exact: true }).count()) === 1 && (await page.getByRole("button", { name: `Arquivar o grupo ${name}`, exact: true }).count()) === 1);
  }
  check("2. Receitas sits in the Receitas card", (await groupSection("Receitas", "Receitas").count()) === 1);
  check("2. Investimentos shows its kind pill", norm(await groupSection("Fora do resultado", "Investimentos").innerText()).includes("investimento"));
  await shot("2-plano");

  await page.getByRole("button", { name: "Renomear o grupo Receitas", exact: true }).click();
  const input = page.getByLabel("Novo nome de Receitas", { exact: true });
  await input.fill("nutrição");
  const refused = await toastCount("Já existe um grupo com esse nome");
  await input.press("Enter");
  await eventually("2. a name of a despesa grupo is refused for a receita grupo", () => toastCount("Já existe um grupo com esse nome"), (n) => n > refused);
  await input.fill(RENAMED);
  const renamed = await toastCount("Grupo renomeado");
  await input.press("Enter");
  await eventually("2. toast Grupo renomeado", () => toastCount("Grupo renomeado"), (n) => n > renamed);
  check("2. the database holds the new name, same id", sql(`select name from plan_groups where id = '${RECEITAS_ID}'`) === RENAMED);
  await eventually("2. the card shows the new name", () => groupSection("Receitas", RENAMED).count(), (n) => n === 1);

  await page.getByRole("button", { name: `Arquivar o grupo ${RENAMED}`, exact: true }).click();
  await dialog().getByRole("heading", { name: `Arquivar ${RENAMED}?` }).waitFor();
  await shot("2-arquivar-dialogo", page, false);
  check("2. toast Grupo arquivado", await clickForToast(dialog().getByRole("button", { name: "Arquivar", exact: true }), "Grupo arquivado"));
  await eventually("2. Grupos arquivados (1) closes the Receitas card", () => card("Receitas").getByText("Grupos arquivados (1)", { exact: true }).count(), (n) => n === 1);
  check("2. archived_at is set", sql(`select archived_at is not null from plan_groups where id = '${RECEITAS_ID}'`) === "t");
  await archivedSummary("Receitas").click();
  await shot("2-receitas-arquivado");
});

// ---- 3. A second receita grupo with a conta ------------------------------------------
await step("3 novo grupo", async () => {
  await goPlano();
  await card("Receitas").getByRole("button", { name: "Grupo", exact: true }).click();
  await dialog().getByRole("heading", { name: /^Novo grupo/ }).waitFor();
  check("3. the Receitas card's + Grupo asks no tipo", (await dialog().getByRole("radio").count()) === 0);
  await dialog().getByLabel("Nome", { exact: true }).fill(NEWG);
  check(`3. toast Grupo "${NEWG}" criado`, await clickForToast(dialog().getByRole("button", { name: "Criar grupo" }), `Grupo "${NEWG}" criado`));
  await page.getByRole("dialog").waitFor({ state: "detached" });
  NEWG_ID = groupId(NEWG);
  check("3. it is a revenue grupo of the farm", sql(`select kind from plan_groups where id = '${NEWG_ID}'`) === "revenue", NEWG_ID);

  await eventually("3. it shows in the Receitas card", () => groupSection("Receitas", NEWG).count(), (n) => n === 1);
  await groupSection("Receitas", NEWG).getByRole("button", { name: "Conta", exact: true }).click();
  await dialog().getByRole("heading", { name: "Nova conta" }).waitFor();
  const trigger = dialog().getByRole("combobox", { name: "Grupo", exact: true });
  check("3. + Conta preselects the grupo", norm(await trigger.innerText()).trim() === NEWG, await trigger.innerText());
  await dialog().getByLabel("Nome", { exact: true }).fill(CONTA);
  await shot("3-nova-conta", page, false);
  check(`3. toast Conta "${CONTA}" criada`, await clickForToast(dialog().getByRole("button", { name: "Criar conta" }), `Conta "${CONTA}" criada`));
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const row = sql(`select id || '|' || "group" from accounts where farm_id = ${FARM} and name = '${CONTA}'`);
  CONTA_ID = row.split("|")[0];
  check("3. the conta sits in the new grupo", row.split("|")[1] === NEWG_ID, row);
});

// ---- 4. A receita in the new grupo ---------------------------------------------------
await step("4 receita", async () => {
  await openLancar();
  await dialog().getByRole("radiogroup", { name: "Tipo de lançamento" }).getByRole("radio", { name: "Receita", exact: true }).click();
  const trigger = dialog().getByRole("combobox", { name: "Grupo", exact: true });
  await eventually("4. Receita starts in the only active receita grupo", async () => norm(await trigger.innerText()).trim(), (t) => t === NEWG);
  const options = await selectOptions("Grupo");
  check("4. the archived grupo is not offered", JSON.stringify(options) === JSON.stringify([NEWG]), JSON.stringify(options));
  await page.getByRole("option", { name: NEWG, exact: true }).click();
  await dialog().getByRole("combobox", { name: "Conta do plano", exact: true }).click();
  await page.getByRole("option", { name: CONTA, exact: true }).click();
  await dialog().getByLabel("Valor (R$)", { exact: true }).fill("2750");
  await dialog().getByLabel("Data", { exact: true }).fill(LAST15);
  await dialog().getByRole("radio", { name: "A receber", exact: true }).click();
  await dialog().getByLabel("Recebido de", { exact: true }).fill(RECEBIDO);
  await shot("4-receita", page, false);
  await dialog().getByRole("combobox", { name: "Grupo", exact: true }).click();
  await page.getByRole("listbox").waitFor();
  await shot("4-receita-grupos", page, false);
  await page.keyboard.press("Escape");
  check("4. toast Receita lançada", await clickForToast(dialog().getByRole("button", { name: "Lançar", exact: true }), "Receita lançada"));
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const row = sql(`select kind || '|' || category || '|' || coalesce(account_id, '') || '|' || amount_brl::int from expenses where farm_id = ${FARM} and counterparty = '${RECEBIDO}'`);
  check("4. the receita carries the new grupo and its conta", row === `revenue|${NEWG_ID}|${CONTA_ID}|2750`, row);
});

// ---- 5. Lançamentos: Receitas now opens into its grupos --------------------------------
await step("5 arvore", async () => {
  const archivedRows = Number(sql(`select count(*) from expenses where category = '${RECEITAS_ID}' and date between '${WINDOW.start}' and '${WINDOW.end}'`));
  await goLancamentos();
  const receitas = await eventually("5. the tree lists Receitas", () => kindParams("receitas"), (p) => p.length > 1);
  if (archivedRows > 0) {
    check("5. two grupos to show: both grupo items are listed", receitas.includes(`grupo:${NEWG_ID}`) && receitas.includes(`grupo:${RECEITAS_ID}`), JSON.stringify(receitas));
  } else {
    check("5. the archived grupo has no row in the window: Receitas stays flat with the new conta", !receitas.some((p) => p?.startsWith("grupo:")) && receitas.includes(`conta:${CONTA_ID}`), JSON.stringify(receitas));
  }
  const target = archivedRows > 0 ? `grupo:${NEWG_ID}` : `conta:${CONTA_ID}`;
  await tree().locator(`a[href*="conta=${encodeURIComponent(target)}"]`).first().click();
  // The pane must be the grupo's (or the conta's), not "Todos os lançamentos", which lists the receita too.
  await eventually("5. the pane is the picked nó", () => page.locator("main h2").allInnerTexts(), (h) => h.includes(archivedRows > 0 ? NEWG : CONTA), (h) => `${JSON.stringify(h)} at ${page.url()}`);
  await eventually("5. its pane lists the receita", async () => norm(await page.locator("main").innerText()), (t) => t.includes(RECEBIDO));
  await shot("5-lancamentos-receitas");
});

// ---- 6. Excluir: an unused capital grupo goes; used grupos are refused -------------------
await step("6 excluir", async () => {
  const FIN_ID = groupId("Financiamentos");
  await goPlano();
  const excluir = page.getByRole("button", { name: "Excluir o grupo Financiamentos", exact: true });
  check("6. the unused Financiamentos shows Excluir", (await excluir.count()) === 1);
  await excluir.click();
  await dialog().getByRole("heading", { name: "Excluir Financiamentos?" }).waitFor();
  await shot("6-excluir-dialogo", page, false);
  check("6. toast Grupo excluído", await clickForToast(dialog().getByRole("button", { name: "Excluir", exact: true }), "Grupo excluído"));
  await eventually("6. Financiamentos left the card", () => groupSection("Fora do resultado", "Financiamentos").count(), (n) => n === 0);
  check("6. the row is gone", sql(`select count(*) from plan_groups where id = '${FIN_ID}'`) === "0");

  check("6. the used Nutrição has no Excluir", (await page.getByRole("button", { name: "Excluir o grupo Nutrição", exact: true }).count()) === 0);
  check(`6. the used ${NEWG} has no Excluir`, (await page.getByRole("button", { name: `Excluir o grupo ${NEWG}`, exact: true }).count()) === 0);
  const nutri = groupId("Nutrição");
  for (const [label, id] of [["Nutrição", nutri], [NEWG, NEWG_ID]]) {
    const del = await api("DELETE", `/plan-groups/${id}`);
    check(`6. DELETE of the used ${label}: 409 in_use`, del.status === 409 && del.json?.error === "in_use", JSON.stringify(del));
    check(`6. ${label} is still there`, sql(`select count(*) from plan_groups where id = '${id}'`) === "1");
  }
  const dup = await api("POST", "/plan-groups", { kind: "partners", name: "OUTROS" });
  check("6. a name taken by a grupo of another tipo: 409 duplicate_name", dup.status === 409 && dup.json?.error === "duplicate_name", JSON.stringify(dup));
  const before = expenseCount();
  const noCat = await api("POST", "/expenses", { kind: "revenue", date: TODAY, amountBrl: 10 });
  check("6. a receita without grupo: 400 invalid_category", noCat.status === 400 && noCat.json?.error === "invalid_category", JSON.stringify(noCat));
  const wrongKind = await api("POST", "/expenses", { kind: "revenue", date: TODAY, amountBrl: 10, category: nutri });
  check("6. a receita in a despesa grupo: 400 invalid_category", wrongKind.status === 400 && wrongKind.json?.error === "invalid_category", JSON.stringify(wrongKind));
  check("6. nothing was written", expenseCount() === before);
});

// ---- 7. Sanidade: a tratamento with cost stays out of the Financeiro ----------------------
await step("7 sanidade", async () => {
  await goPainel();
  const coeBefore = await eventually("7. Painel shows the COE", () => painelCoe(), (v) => typeof v === "string");
  await goLancamentos();
  const allBefore = await allCount();
  const expBefore = expenseCount();

  const animalId = sql(`select id from animals where farm_id = ${FARM} and active order by ear_tag limit 1`);
  const sched = await api("POST", "/treatments/schedule", {
    date: LAST15,
    animalIds: [animalId],
    source: { kind: "standalone", name: TRAT, type: "deworming", withdrawalDays: 0 },
  });
  check("7. the tratamento is scheduled", sched.status === 200, JSON.stringify(sched).slice(0, 200));
  // The calendar form has no cost; a manejo sets it. Written straight in so the done row carries one.
  sql(`update treatments set cost_brl = ${TRAT_COST} where name = '${TRAT}'`);

  await page.goto(`${BASE}/calendar`);
  const row = page.getByText(TRAT, { exact: true }).first().locator("xpath=ancestor::li[1]");
  await row.waitFor();
  check("7. toast Tratamento concluído", await clickForToast(row.getByRole("button", { name: "Marcar como feito" }), "Tratamento concluído"));
  await eventually("7. it is done with its cost", async () => sql(`select status || '|' || cost_brl from treatments where name = '${TRAT}'`), (r) => r === `done|${TRAT_COST}`);
  await shot("7-sanidade");

  await goPainel();
  await eventually("7. Painel: the COE did not move", () => painelCoe(), (v) => v === coeBefore, (v) => `${v} vs ${coeBefore}`);
  check("7. Painel: no Tratamentos line in Composição de custos", !/Tratamentos/.test(norm(await composicao().innerText())));
  await composicao().scrollIntoViewIfNeeded();
  await shot("7-painel");
  const pp = await phonePage();
  await goPainel(pp);
  await noSideScroll("Painel", pp);
  await shot("7-390-painel", pp);
  await pp.close();
  await goLancamentos();
  await eventually("7. Lançamentos: Todos os lançamentos did not grow", () => allCount(), (n) => n === allBefore, (n) => `${n} vs ${allBefore}`);
  await goLancamentos(`?conta=todos&q=${encodeURIComponent(TRAT)}`);
  await page.waitForTimeout(500);
  check("7. Lançamentos: no row for the tratamento", !norm(await page.locator("main").innerText()).includes(TRAT));
  check("7. no lançamento was written", expenseCount() === expBefore);
});

// ---- 8. Relatório por grupo ------------------------------------------------------------
await step("8 relatorio", async () => {
  await page.goto(`${BASE}/relatorios/grupos`);
  const sheet = page.locator("article").first();
  await sheet.locator("table").first().waitFor();
  const receitas = () => sheet.locator("table").first().innerText().then(norm);
  await eventually("8. Receitas has the new grupo's 2.750,00", receitas, (t) => (t.includes(NEWG) || t.includes(CONTA)) && t.includes("2.750,00"));
  const text = norm(await sheet.innerText());
  check("8. no Tratamentos line", !/Tratamentos do calendário|Tratamentos \(manejos\)/.test(text));
  check("8. the tratamento's cost is nowhere", !text.includes("3.456,78"));
  await shot("8-relatorio");
  await page.getByLabel("Contas de cada grupo").click();
  await eventually("8. with contas: Receitas lists the conta", receitas, (t) => t.includes(CONTA));
  await shot("8-relatorio-contas");
  // Grupo header rows: a body row whose first cell is not indented (a conta under a grupo is "pl-5").
  const receitaRows = () =>
    sheet.locator("table").first().locator("tbody tr").evaluateAll((trs) =>
      trs.map((tr) => ({ t: tr.cells[0]?.innerText.trim() ?? "", sub: tr.cells[0]?.className.includes("pl-5") ?? false }))
    );
  const isHeader = (rows, name) => rows.some((r) => r.t === name && !r.sub);
  // Last month shows two receita grupos (the archived one has its aluguel there): both headers, the conta nested.
  const monthGroups = (start, end) =>
    sql(`select distinct g.name from expenses e join plan_groups g on g.id = e.category where e.farm_id = ${FARM} and e.kind = 'revenue' and e.date between '${start}' and '${end}' order by 1`).split("\n").filter(Boolean);
  const [ly, lm] = LAST15.split("-").map(Number);
  const shown = monthGroups(iso(ly, lm, 1), iso(ly, lm, new Date(ly, lm, 0).getDate()));
  check("8. last month has receitas in two grupos", JSON.stringify(shown) === JSON.stringify([NEWG, RENAMED].sort((x, y) => x.localeCompare(y))), JSON.stringify(shown));
  await eventually(
    "8. with contas, two receita grupos: both grupo headers and the conta nested under them",
    receitaRows,
    (rows) => isHeader(rows, NEWG) && isHeader(rows, RENAMED) && rows.some((r) => r.t === CONTA && r.sub),
  );
  // Flat only when the tipo effectively has one grupo: exactly one active receita grupo (Arrendamentos) and no
  // other receita grupo with lines in the window. Find a month where the archived Receitas diversas has no line,
  // put a receita of Arrendamentos there, and look at it: no grupo header, the conta flat.
  let flat = null;
  for (let back = 1, y = ly, m = lm; back <= 11 && !flat; back += 1) {
    [y, m] = m === 1 ? [y - 1, 12] : [y, m - 1];
    const others = sql(`select count(*) from expenses where farm_id = ${FARM} and kind = 'revenue' and category is distinct from '${NEWG_ID}' and date between '${iso(y, m, 1)}' and '${iso(y, m, new Date(y, m, 0).getDate())}'`);
    if (others === "0") flat = { back, date: iso(y, m, 10) };
  }
  check("8. a month without lines of the archived receita grupo exists", Boolean(flat));
  if (flat) {
    const add = await api("POST", "/expenses", { kind: "revenue", date: flat.date, amountBrl: 123, category: NEWG_ID, accountId: CONTA_ID });
    check("8. a receita of Arrendamentos goes into that month", add.status === 200, JSON.stringify(add).slice(0, 200));
    await page.goto(`${BASE}/relatorios/grupos`);
    await sheet.locator("table").first().waitFor();
    await page.getByLabel("Contas de cada grupo").click();
    for (let k = 0; k < flat.back; k += 1) await page.getByRole("button", { name: "Recuar um mês" }).click();
    await eventually(
      `8. with contas, one active receita grupo and no other with lines (${flat.date}): no grupo header, the conta flat`,
      receitaRows,
      (rows) => rows.some((r) => r.t === CONTA) && !rows.some((r) => r.t === NEWG) && !rows.some((r) => r.sub),
    );
    await shot("8-relatorio-contas-um-grupo");
  }
});

// ---- 9. Touros: the Reprodução member buys doses; the Financeiro stays untouched -----------
let member;
await step("9 touros", async () => {
  const before = expenseCount();
  const add = await api("POST", "/semen-bulls", { name: BULL, firstPurchase: { date: TODAY, doses: 10, totalBrl: 800, seller: "Central do Dono" } });
  const bullId = add.json?.bull?.id;
  check("9. POST /semen-bulls answers { bull } with the first purchase", add.status === 200 && Boolean(bullId) && add.json.bull.purchases?.length === 1 && add.json.expense === undefined, JSON.stringify(add).slice(0, 300));
  check("9. the owner's first purchase wrote no lançamento", expenseCount() === before);

  member = await openSession(MEMBER);
  const mp = member.page;
  await mp.goto(`${BASE}/reproducao?tab=touros`);
  const buy = visible(mp.getByRole("button", { name: `Registrar compra de ${BULL}`, exact: true })).first();
  await buy.waitFor();
  check("9. member: no Custo médio por dose", (await mp.getByText("Custo médio por dose").count()) === 0);
  await buy.click();
  await dialog(mp).getByRole("heading", { name: "Registrar compra" }).waitFor();
  check("9. member: the dialog no longer says it becomes a despesa", !norm(await dialog(mp).innerText()).includes("Vira despesa"));
  await dialog(mp).getByLabel("Data", { exact: true }).fill(TODAY);
  await dialog(mp).getByLabel("Doses", { exact: true }).fill("20");
  await dialog(mp).getByLabel("Valor total (R$)", { exact: true }).fill("1500");
  await dialog(mp).getByLabel("Fornecedor", { exact: true }).fill(SELLER);
  await shot("9-membro-compra", mp, false);
  check("9. member: toast Compra registrada", await clickForToast(dialog(mp).getByRole("button", { name: "Registrar compra", exact: true }), "Compra registrada", mp));
  await eventually("9. the purchase is stored", async () => sql(`select count(*) from semen_purchases where bull_id = '${bullId}'`), (n) => n === "2");
  check("9. expenses unchanged after the member's purchase", expenseCount() === before);
  check("9. nothing in expenses names the seller", sql(`select count(*) from expenses where counterparty = '${SELLER}' or notes like '%${BULL}%'`) === "0");
  await shot("9-membro-touros", mp);

  const mApi = apiOf(member.context);
  const herd = await mApi("GET", "");
  const bull = herd.json?.semenBulls?.find((b) => b.id === bullId);
  check("9. member: the bull comes without totals", Boolean(bull) && bull.purchases.length === 2 && bull.purchases.every((p) => p.totalBrl === undefined), JSON.stringify(bull?.purchases));
  const viaApi = await mApi("POST", `/semen-bulls/${bullId}/purchases`, { date: TODAY, doses: 5, totalBrl: 300 });
  check("9. member: POST purchase answers { purchase }", viaApi.status === 200 && Boolean(viaApi.json?.purchase?.id) && viaApi.json.expense === undefined, JSON.stringify(viaApi).slice(0, 300));
  const del = await mApi("DELETE", `/semen-bulls/${bullId}/purchases/${viaApi.json?.purchase?.id}`);
  check("9. member: DELETE purchase answers { id }", del.status === 200 && del.json?.id === viaApi.json?.purchase?.id, JSON.stringify(del));
  check("9. expenses still unchanged", expenseCount() === before);
  await mp.goto(`${BASE}/reproducao/touros/${bullId}`);
  await eventually("9. member: the bull page lets the purchase be deleted", () => visible(mp.getByRole("button", { name: /^Excluir compra de / })).count(), (n) => n >= 1);
  const group = await mApi("POST", "/plan-groups", { kind: "expense", name: "Do vaqueiro" });
  check("9. member: POST /plan-groups is 403", group.status === 403, JSON.stringify(group));
});

// ---- 10. The phone at 390 ---------------------------------------------------------------
await step("10 phone", async () => {
  const pp = await ownerCtx.newPage();
  watch(pp, "owner@390");
  await pp.setViewportSize(PHONE);
  await goPlano(pp);
  await noSideScroll("Plano de contas", pp);
  await archivedSummary("Receitas", pp).click();
  await groupSection("Receitas", NEWG, pp).scrollIntoViewIfNeeded();
  await shot("10-390-plano", pp);
  await card("Fora do resultado", pp).getByRole("button", { name: "Grupo", exact: true }).click();
  await dialog(pp).getByRole("heading", { name: /^Novo grupo/ }).waitFor();
  check("10. 390: Fora do resultado's + Grupo asks the tipo (three radios)", (await dialog(pp).getByRole("radio").count()) === 3);
  await noSideScroll("Novo grupo with the three tipos", pp);
  await shot("10-390-novo-grupo-capital", pp, false);
  await dialog(pp).getByRole("button", { name: "Cancelar" }).click();
  await goLancamentos("", pp);
  await noSideScroll("Lançamentos", pp);
  await shot("10-390-lancamentos", pp);
  await pp.goto(`${BASE}/relatorios/grupos`);
  await pp.locator("article table").first().waitFor();
  await noSideScroll("Relatório por grupo", pp);
  await shot("10-390-relatorio", pp, false);
  await openLancar(pp);
  await dialog(pp).getByRole("radio", { name: "Receita", exact: true }).click();
  await noSideScroll("Novo lançamento (Receita)", pp);
  await shot("10-390-lancar-receita", pp, false);
  await dialog(pp).getByRole("combobox", { name: "Grupo", exact: true }).click();
  await pp.getByRole("listbox").waitFor();
  await shot("10-390-lancar-receita-grupos", pp, false);
  await pp.keyboard.press("Escape");
  await dialog(pp).getByRole("radio", { name: "Investimento", exact: true }).click();
  await noSideScroll("Novo lançamento (Investimento)", pp);
  await shot("10-390-lancar-investimento", pp, false);
  await pp.close();
  if (member) {
    const mp = await member.context.newPage();
    watch(mp, "member@390");
    await mp.setViewportSize(PHONE);
    await mp.goto(`${BASE}/reproducao?tab=touros`);
    await visible(mp.getByRole("button", { name: `Registrar compra de ${BULL}`, exact: true })).first().waitFor();
    await noSideScroll("Touros (member)", mp);
    await shot("10-390-membro-touros", mp);
    await mp.close();
  }
});

// ---- 11. Novo lançamento: a capital kind, and every kind fits 576 px at 1366×640 ------------------
await step("11 capital", async () => {
  await openLancar();
  await dialog().getByRole("radio", { name: "Investimento", exact: true }).click();
  const grupo = dialog().getByRole("combobox", { name: "Grupo", exact: true });
  await eventually("11. Investimento starts in Investimentos", async () => norm(await grupo.innerText()).trim(), (t) => t === "Investimentos");
  await shot("11-lancar-investimento", page, false);
  await dialog().getByRole("radio", { name: "Sócios", exact: true }).click();
  await eventually("11. Investimento → Sócios starts in Sócios", async () => norm(await grupo.innerText()).trim(), (t) => t === "Sócios");
  await dialog().getByRole("radio", { name: "Financiamento", exact: true }).click();
  await eventually("11. Financiamento (its grupo deleted in step 6) offers no grupo", async () => norm(await grupo.innerText()).trim(), (t) => t.startsWith("Nenhum grupo"));
  await shot("11-lancar-financiamento-sem-grupo", page, false);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1366, height: 640 });
  await openLancar();
  for (const kind of ["Despesa", "Receita", "Investimento", "Financiamento", "Sócios"]) {
    await dialog().getByRole("radiogroup", { name: "Tipo de lançamento" }).getByRole("radio", { name: kind, exact: true }).click();
    await page.waitForTimeout(200);
    await dialogFits(kind);
  }
  await shot("11-640-lancar-socios", page, false);
  await page.keyboard.press("Escape");
  await page.setViewportSize(DESK);
});

// ---- errors, summary ---------------------------------------------------------------------
check("no page errors", errors.length === 0, `\n  ${errors.join("\n  ")}`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok, ${failed.length} FAIL`);
for (const f of failed) console.log(`  FAIL ${f.name}`);
process.exit(failed.length > 0 ? 1 : 0);
```

- [ ] **Step 2: Migration check**

Run: `REPO=<checkout> bash ~/.cache/meubov-plan-2026-10-09/migrate-check.sh`
Expected: 28 lines starting `ok   `, then `migration 0030: all 28 checks ok`, exit 0. Any `FAIL <check> — got '…', want '…'` line names the column or index that 0030 left wrong; fix `drizzle/0030_grupos-livres.sql` (task 1's file) to the spec's Data section and rerun. A missing `0030_grupos-livres.sql` or a journal that does not end at idx 30 stops it before Docker starts.

- [ ] **Step 3: Dev server and fresh database**

Start the server in the background from the checkout (it keeps running across database swaps):

```bash
cd <checkout> && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5454/meubov BETTER_AUTH_URL=http://localhost:3021 \
  BETTER_AUTH_SECRET=smoke-livres-secret-0123456789abcdef ./node_modules/.bin/next dev --webpack -p 3021 > ~/.cache/meubov-plan-2026-10-09/smoke-server.log 2>&1
```

Wait until `curl -s http://localhost:3021/api/auth/ok` prints `{"ok":true}`, then run `REPO=<checkout> bash ~/.cache/meubov-plan-2026-10-09/reset.sh`.
Expected last lines: `Seeded farm "Fazenda Boa Vista" (id 1) for teste.livres@meubov.local: …` and `users 2 · farm 1 grupos 11 · members 2`.

- [ ] **Step 4: Headless smoke (desktop 1366×768 and phone 390)**

Run (`OUT=<dir>` moves the screenshots): `node ~/.cache/meubov-plan-2026-10-09/smoke.mjs | tee ~/.cache/meubov-plan-2026-10-09/smoke-run1.log`
It first warms up every route it opens (`next dev --webpack` compiles a page on its first hit; a cold page took over 20 s and threw steps 1 and 2 in the first run, so navigations get 180 s), then checks, failing loudly on any miss:
0. Farm 1 has the eleven grupos of the right kinds; seeded receitas point at Receitas, no row holds an old key, a rendimento has no grupo.
1. Lançamentos: Receitas and Financiamentos (one grupo each) list no grupo item, Receitas lists Venda de gado and its contas directly; Despesas lists its seven grupos; the collapsed tree at 390 has no horizontal scroll.
2. Plano de contas: the new subtitle, no "da fazenda" tag, Renomear and Arquivar on all eleven grupos, the Investimentos kind pill; renaming Receitas to "nutrição" is refused (a name of another tipo), "Receitas diversas" is saved under the same id; Arquivar moves it to "Grupos arquivados (1)".
3. "+ Grupo" on the Receitas card (no tipo radios) creates "Arrendamentos" of kind revenue; its "+ Conta" preselects it and creates "Pasto arrendado" in it.
4. Novo lançamento › Receita starts in Arrendamentos, the archived grupo is not offered; the receita (R$ 2.750, the 15th of last month, a receber) saves with that grupo and conta; a shot with the Grupo picker open.
5. Lançamentos: Receitas opens into its grupo items when the archived grupo has a line in the 12-month window (else stays flat with the new conta); clicking the item opens that nó's pane (its h2, not "Todos os lançamentos") and it lists the receita.
6. Excluir on the unused Financiamentos removes its row; Nutrição and Arrendamentos show no Excluir and `DELETE /plan-groups/:id` answers 409 `in_use`; a name of another tipo is 409 `duplicate_name`; a receita without grupo or in a despesa grupo is 400 `invalid_category`, nothing written.
7. Sanidade: a tratamento scheduled for the 15th of last month, given R$ 3.456,78, is marked done on the calendar; the Painel's COE, the count beside "Todos os lançamentos" and the expenses table do not move, and Lançamentos finds no row for it; the Painel at 390 has no horizontal scroll.
8. Relatório por grupo (last month): Receitas shows Arrendamentos / Pasto arrendado with 2.750,00, the tratamento's 3.456,78 is nowhere; with "Contas de cada grupo" the conta is listed; last month shows two receita grupos (Arrendamentos and the archived Receitas diversas), so both grupo header rows are there with the conta nested (first cell `pl-5`); then a receita of Arrendamentos goes into the latest month where the archived grupo has no line, and there (one active receita grupo, no other with lines) no grupo header row is there and the conta is flat. A header stays whenever another grupo of the tipo exists (active, or archived/removed with lines in the window).
9. Touros: the owner's new bull with a first purchase answers `{ bull }` and writes no lançamento; the member (Reprodução edit, Financeiro none) sees no cost column, buys 20 doses through the dialog (no "Vira despesa" hint), `expenses` stays the same; `GET /api/herd` gives the member the bull without totals; the member's `POST …/purchases` answers `{ purchase }` and `DELETE …/purchases/:id` answers `{ id }`; the bull page offers "Excluir compra"; the member's `POST /plan-groups` is 403.
10. 390 px: no horizontal scroll on Plano de contas, the capital Novo grupo dialog (three tipo radios), Lançamentos, the relatório, Novo lançamento (Receita, with its Grupo picker open, then Investimento) and the member's Touros.
11. Novo lançamento › Investimento starts in Investimentos, then Sócios starts in Sócios; Financiamento (its only grupo deleted in step 6) reads "Nenhum grupo…"; at 1366×640 every tipo (Despesa, Receita, Investimento, Financiamento, Sócios) fits 576 px with no inner scroll.
Then "no page errors" (no page error, console error, failed request or 5xx; 409s and the `exact-mirror` dev-log line are ignored).

Expected: every line `ok  `, the summary `N/N ok, 0 FAIL`, exit 0, and screenshots `smoke-1-lancamentos-colapso.png` … `smoke-11-640-lancar-socios.png` (desk and `-390-` frames) in `~/.cache/meubov-plan-2026-10-09/shots/` (a `smoke-fail-<step>.png` appears only for a step that threw). Look at the screenshots: the Receitas card with its archived grupo and Arrendamentos, the Fora do resultado card without Financiamentos, the tree, the relatório and the phone frames. A rerun needs Step 3's `reset.sh` first (the smoke creates rows with fixed names).

- [ ] **Step 5: Tear down**

Kill the server by pid from `ss -ltnp | grep 3021` (not `pkill -f`, which matches the tool's own shell), then `docker rm -f meubov-livres-db`.

---

