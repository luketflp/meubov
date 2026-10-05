# Grupos de despesa da fazenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A farm adds its own grupos de despesa next to the seven built-in ones; they count in the COE like the others and show in the Painel, the Orçamento, Lançamentos and the lançamento form.

**Architecture:** A new `expense_groups` table holds the farm's grupos. The four grupo columns (`accounts.group`, `expenses.category`, `expense_series.category`, `budgets.category`) move from Postgres enums to text, so a built-in grupo stays a key and a farm grupo is its row id. A pure `lib/domain/groups.ts` gives the order and labels of every grupo. The domain inputs carry `expenseGroups`, the API validates grupo keys per farm and keeps a despesa's grupo equal to its conta's, and the Plano de contas manages the farm's grupos on the Despesas (COE) card.

**Tech Stack:** Next.js (this repo's version: read `node_modules/next/dist/docs/` first), React, Tailwind, Zustand, Elysia + Eden, Drizzle + Postgres, vitest, Playwright for the smoke.

**Spec:** `docs/superpowers/specs/2026-10-05-financeiro-grupos-da-fazenda-design.md`
**Canvas:** https://claude.ai/artifact/CpJBqs1dHiej5uyrmcoDhg (direction A)

## Global Constraints

- Work on `main` in place, one commit at the very end by the controller; never `git add -A`, never stash, never touch a file outside the task's list.
- This Next.js has breaking changes: read the guide in `node_modules/next/dist/docs/` before writing a page or a route.
- No new dependency.
- Copy in pt-BR; code, names and comments in English in the voice of the surrounding files. No emoji.
- The seven built-in grupos never change, keep their keys and always come first, in today's order; farm grupos follow by creation.
- A farm grupo name is 1–40 characters with a non-space, unique per farm in any case, and never equal to a built-in or top grupo label.
- Every query filters by `farm_id`; grupo writes need Financeiro edit.
- Phone targets ≥ 44 px (`min-h-11`), compact on md+; real `<button>`, `<label>`, `<input>`; `aria-label` on icon-only buttons.
- Tests: `./node_modules/.bin/vitest run <explicit paths> --exclude '**/worktrees/**'`. Types: `./node_modules/.bin/tsc --noEmit`. Lint: `./node_modules/.bin/eslint <files>`. The two route snapshots update with `-u` on their two explicit paths only. In a sandbox clone never run `pnpm`.
- Waves run in order: 1 · 2–3–4 · 5 · 6. Tasks of one wave touch disjoint files.

## Review Focus

1. A grupo name equal to a built-in or top label in another case or with spaces → refused; the same name on two farms is fine; renaming a grupo to its own name in another case is fine. Tests in tasks 1 and 2.
2. Deleting a grupo used only by a recorrência, or only through one of its contas by a lançamento carrying another category → `in_use`, nothing deleted. Tests in task 2.
3. A despesa with another farm's grupo id or an unknown key → 400 `invalid_category`; a despesa whose conta sits in another grupo, or a receita in a despesa conta → 400 `invalid_account`; editing an old lançamento in an archived grupo still saves. Tests in task 3.
4. An old offline snapshot without `expenseGroups` boots with `[]`; a grupo key that resolves to nothing reads "Grupo removido" in the ledger, the tree and the export. Tests in tasks 1 and 4.
5. An archived farm grupo: absent from new choices in the forms, kept when editing a lançamento already in it, still in the Lançamentos tree while it has rows in the window and in the Orçamento when it has orçado or realizado. Tests in tasks 4 and 5.

---

### Task 1: Foundation

Types, the `expense_groups` table and the enum→text migration, the pure grupo helpers, the mapper, the herd load and the store field. After this task nothing in the UI changes yet: every reader still compiles through the deprecated `EXPENSE_CATEGORY_LABEL` alias (task 4 migrates them).

**Files:**
- Create: `lib/domain/groups.ts`
- Create: `drizzle/0026_financeiro-grupos-da-fazenda.sql` (generated, then replaced by hand), `drizzle/meta/0026_snapshot.json` (generated)
- Modify: `drizzle/meta/_journal.json` (generated)
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`
- Modify: `lib/domain/labels.ts`
- Modify: `lib/api/mappers.ts`
- Modify: `lib/api/domains/herd/useCases/Load.useCase.ts`
- Modify: `lib/store/useHerdStore.ts` (field plumbing only)
- Modify (compile fix outside this task's files, see Step 15): `lib/api/domains/expenses/schemas/expense.schema.ts` (task 3's), `lib/domain/planTree.ts` (task 4's)
- Test: `lib/domain/__tests__/groups.test.ts` (new)
- Test: `lib/api/domains/herd/useCases/__tests__/Load.test.ts` (new)
- Test: `lib/api/__tests__/mappers.test.ts`
- Test: `lib/store/__tests__/queueOrSend.test.ts`

`lib/data/seed.ts` and `cli/seedCli.ts` need no change: they compile once the schema columns are text.

**Interfaces:**
- Consumes: nothing (wave 1).
- Produces:
  - `lib/types.ts`: `BuiltinCategory` (the seven literals), `ExpenseCategory = string`, `AccountGroup = string`, `interface ExpenseGroup { id: string; name: string; archivedAt?: string; createdAt: string }`, `HerdData.expenseGroups?: ExpenseGroup[]`.
  - `lib/domain/labels.ts`: `BUILTIN_CATEGORY_LABEL: Record<BuiltinCategory, string>`; temporary `/** @deprecated task 4 removes it */ EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string>` (same object).
  - `lib/domain/groups.ts`: `BUILTIN_CATEGORIES`, `TOP_GROUP_LABEL`, `GROUP_NAME_MAX = 40`, `isBuiltinCategory(key)`, `isDespesaGroup(key)`, `interface DespesaGroup { key; label; custom; archived }`, `despesaGroups(groups, opts?: { archived?; keep? })`, `groupLabel(key, groups)`, `clashesWithFixedGroup(name)` — signatures exactly as in the contract.
  - `lib/db/schema.ts`: `expenseGroups` table, `ExpenseGroupRow`; `accounts.group`, `expenses.category`, `expenseSeries.category`, `budgets.category` are `text(...).$type<…>()`; `expenseCategoryEnum` and `accountGroupEnum` no longer exist.
  - `lib/api/mappers.ts`: `toExpenseGroup(row: ExpenseGroupRow): ExpenseGroup`.
  - `LoadHerdUseCase.run` returns `expenseGroups: ExpenseGroup[]` (archived included, `created_at` then `name`); contas come ordered by name only.
  - `useHerdStore`: state `expenseGroups: ExpenseGroup[]` (initial `[]`), carried by the snapshot, `[]` from an old snapshot, reset with the initial state on sign-out.
  - `ExpenseCategoryModel` (expenses schema) is ALREADY `t.String({ minLength: 1, maxLength: 64 })` after this task (task 3 must not redo it; `AccountGroupModel` is still task 3's).

---

#### Cycle A — `lib/domain/groups.ts`

- [ ] **Step 1: Write the failing test**

`lib/domain/__tests__/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  clashesWithFixedGroup,
  despesaGroups,
  groupLabel,
  isBuiltinCategory,
  isDespesaGroup,
} from "@/lib/domain/groups";
import type { ExpenseGroup } from "@/lib/types";

const group = (overrides: Partial<ExpenseGroup>): ExpenseGroup => ({
  id: "g-1",
  name: "Máquinas e veículos",
  createdAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

const MAQUINAS = group({});
const ARRENDAMENTO = group({ id: "g-2", name: "Arrendamento", createdAt: "2026-09-15T12:00:00.000Z" });
const FRETE = group({
  id: "g-3",
  name: "Frete",
  createdAt: "2026-10-02T12:00:00.000Z",
  archivedAt: "2026-10-03T12:00:00.000Z",
});
const BENS = group({ id: "g-4", name: "Bens de terceiros" }); // same createdAt as MAQUINAS

const BUILTIN_LABELS = ["Nutrição", "Pastagem", "Mão de obra", "Sanidade", "Reprodução", "Administrativo", "Outros"];

describe("BUILTIN_CATEGORIES", () => {
  it("is the seven grupos the app ships with, in screen order", () => {
    expect(BUILTIN_CATEGORIES).toEqual(["nutrition", "pasture", "labor", "health", "breeding", "admin", "other"]);
  });
});

describe("isBuiltinCategory", () => {
  it("is true only for the seven keys", () => {
    expect(BUILTIN_CATEGORIES.every(isBuiltinCategory)).toBe(true);
    expect(isBuiltinCategory("revenue")).toBe(false);
    expect(isBuiltinCategory("g-1")).toBe(false);
  });
});

describe("isDespesaGroup", () => {
  it("takes a built-in key or a farm grupo id", () => {
    expect(isDespesaGroup("health")).toBe(true);
    expect(isDespesaGroup("g-1")).toBe(true);
  });

  it("leaves out Receitas, the three outside the resultado and the tree's Despesas", () => {
    for (const key of ["revenue", "investment", "financing", "partners", "expenses"]) {
      expect(isDespesaGroup(key)).toBe(false);
    }
  });
});

describe("despesaGroups", () => {
  it("lists the seven first, then the farm's by creation, ties by name, archived ones left out", () => {
    const list = despesaGroups([MAQUINAS, FRETE, BENS, ARRENDAMENTO]);
    expect(list.slice(0, 7)).toEqual(
      BUILTIN_CATEGORIES.map((key, i) => ({ key, label: BUILTIN_LABELS[i], custom: false, archived: false }))
    );
    expect(list.slice(7)).toEqual([
      { key: "g-2", label: "Arrendamento", custom: true, archived: false },
      { key: "g-4", label: "Bens de terceiros", custom: true, archived: false },
      { key: "g-1", label: "Máquinas e veículos", custom: true, archived: false },
    ]);
  });

  it("brings the archived ones back when asked", () => {
    expect(despesaGroups([FRETE, MAQUINAS], { archived: true }).slice(7)).toEqual([
      { key: "g-1", label: "Máquinas e veículos", custom: true, archived: false },
      { key: "g-3", label: "Frete", custom: true, archived: true },
    ]);
  });

  it("keeps the archived grupo a lançamento already sits in, and no other", () => {
    const archived = group({ id: "g-5", name: "Cercas", archivedAt: "2026-10-04T12:00:00.000Z" });
    expect(despesaGroups([FRETE, archived], { keep: "g-3" }).slice(7).map((g) => g.key)).toEqual(["g-3"]);
    expect(despesaGroups([FRETE], { keep: "nutrition" })).toHaveLength(7);
  });

  it("is only the seven for a farm without grupos, and leaves the input order alone", () => {
    expect(despesaGroups([])).toHaveLength(7);
    const input = [MAQUINAS, ARRENDAMENTO];
    despesaGroups(input);
    expect(input).toEqual([MAQUINAS, ARRENDAMENTO]);
  });
});

describe("groupLabel", () => {
  it("names a built-in, Receitas and the three outside the resultado", () => {
    expect(groupLabel("nutrition", [])).toBe("Nutrição");
    expect(groupLabel("other", [])).toBe("Outros");
    expect(groupLabel("revenue", [])).toBe("Receitas");
    expect(groupLabel("investment", [])).toBe("Investimentos");
    expect(groupLabel("financing", [])).toBe("Financiamentos");
    expect(groupLabel("partners", [])).toBe("Sócios");
  });

  it("names a farm grupo by its name, archived too", () => {
    expect(groupLabel("g-1", [MAQUINAS, FRETE])).toBe("Máquinas e veículos");
    expect(groupLabel("g-3", [MAQUINAS, FRETE])).toBe("Frete");
  });

  it("reads Grupo removido when the key resolves to nothing", () => {
    expect(groupLabel("g-9", [MAQUINAS])).toBe("Grupo removido");
    expect(groupLabel("g-1", [])).toBe("Grupo removido");
  });
});

describe("clashesWithFixedGroup", () => {
  it("refuses a built-in or top grupo label in any case, spaces around ignored", () => {
    expect(clashesWithFixedGroup("Nutrição")).toBe(true);
    expect(clashesWithFixedGroup("  nutrição ")).toBe(true);
    expect(clashesWithFixedGroup("MÃO DE OBRA")).toBe(true);
    expect(clashesWithFixedGroup("RECEITAS")).toBe(true);
    expect(clashesWithFixedGroup("investimentos")).toBe(true);
    expect(clashesWithFixedGroup("Sócios")).toBe(true);
  });

  it("takes any other name", () => {
    expect(clashesWithFixedGroup("Máquinas e veículos")).toBe(false);
    expect(clashesWithFixedGroup("Nutrição animal")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/domain/groups"` (no tests run).

- [ ] **Step 3: Implement (types, labels, groups.ts)**

`lib/types.ts` — **Replace**

```ts
/** Category of a farm expense. */
export type ExpenseCategory =
  | "nutrition"
  | "pasture"
  | "labor"
  | "health"
  | "breeding"
  | "admin"
  | "other";
```

with

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

`lib/types.ts` — **Replace**

```ts
/** Grupo of a conta: receitas, the seven expense categories and the three outside the resultado. */
export type AccountGroup = ExpenseCategory | "revenue" | CapitalGroup;
```

with

```ts
/** Grupo of a conta: "revenue", a CapitalGroup or a despesa grupo (ExpenseCategory). */
export type AccountGroup = string;
```

`lib/types.ts` — **Replace**

```ts
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
```

with

```ts
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
  /** Grupos de despesa the farm created, archived ones included; absent in an old snapshot. */
  expenseGroups?: ExpenseGroup[];
```

`lib/domain/labels.ts` — **Replace**

```ts
import type {
  Category,
  DiagnosisResult,
  ExpenseCategory,
```

with

```ts
import type {
  BuiltinCategory,
  Category,
  DiagnosisResult,
  ExpenseCategory,
```

`lib/domain/labels.ts` — **Replace**

```ts
/** Label of each expense category, e.g.: "Nutrição". */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
```

with

```ts
/** Label of each built-in grupo de despesa, e.g.: "Nutrição"; a farm grupo's is its name (lib/domain/groups.ts). */
export const BUILTIN_CATEGORY_LABEL: Record<BuiltinCategory, string> = {
```

`lib/domain/labels.ts` — **Replace** (the end of the file; `other: "Outros",` followed by `};` occurs once)

```ts
  other: "Outros",
};
```

with

```ts
  other: "Outros",
};

/** @deprecated task 4 removes it */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = BUILTIN_CATEGORY_LABEL;
```

(The alias is typed `Record<ExpenseCategory, string>` on purpose: its readers index it with `ExpenseCategory`, now `string`, and would not compile against `Record<BuiltinCategory, string>`.)

`lib/domain/groups.ts` (new, whole file):

```ts
/**
 * Grupos de despesa: the seven built-in ones, written as their key
 * ("nutrition"), and the farm's own, written as their ExpenseGroup id. The
 * single source of grupo order and labels, Receitas and the three outside the
 * resultado included. Pure.
 */
import type { AccountGroup, BuiltinCategory, CapitalGroup, ExpenseCategory, ExpenseGroup } from "@/lib/types";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

/** The seven built-in grupos, in screen order. */
export const BUILTIN_CATEGORIES: readonly BuiltinCategory[] = Object.keys(BUILTIN_CATEGORY_LABEL) as BuiltinCategory[];

/** Receitas and the three grupos outside the resultado. */
export const TOP_GROUP_LABEL: Record<"revenue" | CapitalGroup, string> = {
  revenue: "Receitas",
  investment: "Investimentos",
  financing: "Financiamentos",
  partners: "Sócios",
};

/** Max length of a farm grupo name. */
export const GROUP_NAME_MAX = 40;

/** Every fixed grupo's label by key. */
const FIXED_LABEL = new Map<string, string>([
  ...Object.entries(BUILTIN_CATEGORY_LABEL),
  ...Object.entries(TOP_GROUP_LABEL),
]);

/** The same labels, lowercased: no farm grupo may take one. */
const FIXED_NAMES = new Set([...FIXED_LABEL.values()].map((label) => label.toLowerCase()));

export function isBuiltinCategory(key: string): key is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(key);
}

/** A grupo of Despesas: anything but "revenue", a CapitalGroup or the tree's "expenses". */
export function isDespesaGroup(key: string): boolean {
  return key !== "revenue" && key !== "expenses" && !(CAPITAL_GROUPS as readonly string[]).includes(key);
}

export interface DespesaGroup {
  key: ExpenseCategory;
  label: string;
  /** The farm's own: it shows "da fazenda" on the Plano de contas and in the form's picker. */
  custom: boolean;
  archived: boolean;
}

/** The seven built-ins in screen order, then the farm's by createdAt (ties by name). Archived ones only with
 *  `archived: true`, or the one whose key is `keep` (a row already in it). */
export function despesaGroups(
  groups: readonly ExpenseGroup[],
  opts: { archived?: boolean; keep?: ExpenseCategory } = {}
): DespesaGroup[] {
  const farm = groups
    .filter((g) => opts.archived || g.archivedAt === undefined || g.id === opts.keep)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "pt-BR"))
    .map((g) => ({ key: g.id, label: g.name, custom: true, archived: g.archivedAt !== undefined }));
  return [
    ...BUILTIN_CATEGORIES.map((key) => ({ key, label: BUILTIN_CATEGORY_LABEL[key], custom: false, archived: false })),
    ...farm,
  ];
}

/** Label of any grupo key: a built-in, Receitas/capital, a farm grupo's name; "Grupo removido" when it resolves to nothing. */
export function groupLabel(key: AccountGroup, groups: readonly ExpenseGroup[]): string {
  return FIXED_LABEL.get(key) ?? groups.find((g) => g.id === key)?.name ?? "Grupo removido";
}

/** True when `name` (trimmed, any case) equals a built-in or top grupo label: such a name is refused. */
export function clashesWithFixedGroup(name: string): boolean {
  return FIXED_NAMES.has(name.trim().toLowerCase());
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts --exclude '**/worktrees/**'`
Expected: PASS (13 tests). Do not run `tsc` yet: `lib/types.ts` now widens `ExpenseCategory`/`AccountGroup` while the schema still holds the enums, so `tsc` reports errors in `cli/seedCli.ts` and the accounts use cases until Cycle B.

---

#### Cycle B — schema and `toExpenseGroup`

- [ ] **Step 5: Write the failing test**

`lib/api/__tests__/mappers.test.ts` — **Replace**

```ts
 * toAccount: a financiamento carries its saldo inicial.
```

with

```ts
 * toAccount: a financiamento carries its saldo inicial.
 * toExpenseGroup: a farm grupo with its dates in ISO, archivedAt only once archived.
```

`lib/api/__tests__/mappers.test.ts` — **Replace**

```ts
import { toAccount, toBankAccount, toBudget, toExpense, toFarmData } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseRow,
```

with

```ts
import { toAccount, toBankAccount, toBudget, toExpense, toExpenseGroup, toFarmData } from "@/lib/api/mappers";
import type {
  BankAccountRow,
  BudgetRow,
  ExpenseGroupRow,
  ExpenseRow,
```

`lib/api/__tests__/mappers.test.ts` — **Replace**

```ts
    expect(plain.openingDate).toBeUndefined();
  });
});
```

with

```ts
    expect(plain.openingDate).toBeUndefined();
  });
});

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
      "2026-10-03T09:00:00.000Z"
    );
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/mappers.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `TypeError: toExpenseGroup is not a function` (the other 11 tests pass).

- [ ] **Step 7: Implement (schema, mapper)**

`lib/db/schema.ts` — **Replace**

```ts
import type { CsvMapping } from "@/lib/types";
```

with

```ts
import type { AccountGroup, CsvMapping, ExpenseCategory } from "@/lib/types";
```

`lib/db/schema.ts` — **Replace** (delete the enum; the replacement is empty)

```ts
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

```

with nothing (the line after it, `/** What the money of a lançamento is (lib/types.ts EntryKind). */`, stays).

`lib/db/schema.ts` — **Replace** (delete the enum; the replacement is empty)

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

with nothing (the line after it, `/** How the twelve months of an orçamento line were filled. */`, stays).

`lib/db/schema.ts` — **Replace**

```ts
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
    group: accountGroupEnum("group").notNull(),
```

with

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
```

`lib/db/schema.ts` — **Replace** (expense_series)

```ts
    flow: entryFlowEnum("flow"),
    category: expenseCategoryEnum("category").notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
```

with

```ts
    flow: entryFlowEnum("flow"),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amountBrl: numeric("amount_brl", { mode: "number" }).notNull(),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
```

`lib/db/schema.ts` — **Replace** (expenses)

```ts
    /** Grupo of a despesa; the other kinds write "other" and nothing reads it. */
    category: expenseCategoryEnum("category").notNull(),
```

with

```ts
    /** Grupo of a despesa (a built-in key or an expense_groups id); the other kinds write "other" and nothing reads it. */
    category: text("category").$type<ExpenseCategory>().notNull(),
```

`lib/db/schema.ts` — **Replace** (budgets)

```ts
    category: expenseCategoryEnum("category").notNull(),
    /** Null = the grupo's own line; removing the conta removes its lines. */
```

with

```ts
    category: text("category").$type<ExpenseCategory>().notNull(),
    /** Null = the grupo's own line; removing the conta removes its lines. */
```

`lib/db/schema.ts` — **Replace**

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
```

with

```ts
export type FarmAccountRow = typeof accounts.$inferSelect;
export type ExpenseGroupRow = typeof expenseGroups.$inferSelect;
```

Check: `grep -n "expenseCategoryEnum\|accountGroupEnum" lib/db/schema.ts` prints nothing.

`lib/api/mappers.ts` — **Replace**

```ts
  Expense,
  FarmData,
  HealthProtocol,
```

with

```ts
  Expense,
  ExpenseGroup,
  FarmData,
  HealthProtocol,
```

`lib/api/mappers.ts` — **Replace**

```ts
  CustomCategoryRow,
  ExpenseRow,
```

with

```ts
  CustomCategoryRow,
  ExpenseGroupRow,
  ExpenseRow,
```

`lib/api/mappers.ts` — **Replace**

```ts
/** Linhas do extrato of the conta, as the load counts them. */
```

with

```ts
export function toExpenseGroup(row: ExpenseGroupRow): ExpenseGroup {
  return {
    id: row.id,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Linhas do extrato of the conta, as the load counts them. */
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/mappers.test.ts --exclude '**/worktrees/**'`
Expected: PASS (12 tests).

---

#### Cycle C — the herd load

- [ ] **Step 9: Write the failing test**

`lib/api/domains/herd/useCases/__tests__/Load.test.ts` (new; the folder does not exist yet):

```ts
/**
 * loadHerd: the farm's grupos de despesa travel with the herd, archived ones
 * included, oldest first; the contas come by name (the client groups them).
 *
 * A db stub keyed by table: every select resolves to the rows queued for the
 * table it reads `from`, and records its `orderBy`. The recorrências top-up is
 * stubbed out.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderSql } from "@/lib/api/__tests__/dbStub";
import { accounts, expenseGroups } from "@/lib/db/schema";

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
  it("returns the farm's grupos de despesa, archived ones included, oldest first", async () => {
    state.rows.set(expenseGroups, [
      { id: "g-1", farmId: 7, name: "Arrendamento", archivedAt: null, createdAt: new Date("2026-09-15T12:00:00Z") },
      {
        id: "g-2",
        farmId: 7,
        name: "Frete",
        archivedAt: new Date("2026-10-03T12:00:00Z"),
        createdAt: new Date("2026-10-01T12:00:00Z"),
      },
    ]);

    const data = await new LoadHerdUseCase().run({ farmId: 7 });

    expect(data.expenseGroups).toEqual([
      { id: "g-1", name: "Arrendamento", createdAt: "2026-09-15T12:00:00.000Z" },
      {
        id: "g-2",
        name: "Frete",
        archivedAt: "2026-10-03T12:00:00.000Z",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(orderOf(expenseGroups)).toEqual([
      '"expense_groups"."created_at" asc',
      '"expense_groups"."name" asc',
    ]);
  });

  it("is no grupos for a farm that has none", async () => {
    expect((await new LoadHerdUseCase().run({ farmId: 7 })).expenseGroups).toEqual([]);
  });

  it("lists the contas by name: a grupo key no longer sorts them", async () => {
    await new LoadHerdUseCase().run({ farmId: 7 });

    expect(orderOf(accounts)).toEqual(['"accounts"."name" asc']);
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/herd/useCases/__tests__/Load.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — 3 failed: `expected undefined to deeply equal [ { id: 'g-1', … } ]`, `expected undefined to deeply equal []`, and `expected [ '"accounts"."group" asc', … ] to deeply equal [ '"accounts"."name" asc' ]`.

- [ ] **Step 11: Implement**

`lib/api/domains/herd/useCases/Load.useCase.ts` — **Replace**

```ts
  customCategories,
  expenseSeries,
```

with

```ts
  customCategories,
  expenseGroups,
  expenseSeries,
```

**Replace**

```ts
  toExpense,
  toFarmData,
```

with

```ts
  toExpense,
  toExpenseGroup,
  toFarmData,
```

**Replace**

```ts
      lineSummaryRows,
      reconciledRows,
    ] = await Promise.all([
```

with

```ts
      lineSummaryRows,
      reconciledRows,
      expenseGroupRows,
    ] = await Promise.all([
```

**Replace**

```ts
        .where(eq(accounts.farmId, farmId))
        .orderBy(asc(accounts.group), asc(accounts.name)),
```

with

```ts
        .where(eq(accounts.farmId, farmId))
        .orderBy(asc(accounts.name)),
```

**Replace** (the last entry of the `Promise.all` array)

```ts
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
    ]);
```

with

```ts
            inArray(statementLines.status, ["matched", "created", "transfer"])
          )
        ),
      this.repository
        .select()
        .from(expenseGroups)
        .where(eq(expenseGroups.farmId, farmId))
        .orderBy(asc(expenseGroups.createdAt), asc(expenseGroups.name)),
    ]);
```

**Replace**

```ts
      accounts: accountRows.map(toAccount),
```

with

```ts
      accounts: accountRows.map(toAccount),
      expenseGroups: expenseGroupRows.map(toExpenseGroup),
```

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/herd/useCases/__tests__/Load.test.ts --exclude '**/worktrees/**'`
Expected: PASS (3 tests).

---

#### Cycle D — the store field

- [ ] **Step 13: Write the failing test**

`lib/store/__tests__/queueOrSend.test.ts` — **Replace**

```ts
import type { Animal, ManejoSession } from "@/lib/types";
```

with

```ts
import type { Animal, ExpenseGroup, ManejoSession } from "@/lib/types";
```

`lib/store/__tests__/queueOrSend.test.ts` — **Replace** (inside `describe("an offline boot")`, the new case goes right before the sign-out one, which resets the module state after it)

```ts
  it("sign-out resets the store and the next user's ops are theirs", async () => {
```

with

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

  it("sign-out resets the store and the next user's ops are theirs", async () => {
```

(`bootOffline()` boots from a snapshot whose `data` is `{ animals, manejoSessions }` only: an old snapshot.)

- [ ] **Step 14: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/queueOrSend.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — 1 failed, 14 passed: `expected [ { id: 'g-1', … } ] to deeply equal []` (the store keeps the grupos it had because the snapshot has no `expenseGroups` key).

- [ ] **Step 15: Implement (store, plus the two compile fixes outside this task's files)**

`lib/store/useHerdStore.ts` — **Replace**

```ts
  Expense,
  ExpenseCategory,
  FarmData,
```

with

```ts
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  FarmData,
```

**Replace**

```ts
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  bankAccounts: BankAccount[];
```

with

```ts
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  expenseGroups: ExpenseGroup[];
  bankAccounts: BankAccount[];
```

**Replace** (in `herdDataOf`, so the snapshot carries the grupos)

```ts
    accounts: s.accounts,
    bankAccounts: s.bankAccounts,
```

with

```ts
    accounts: s.accounts,
    expenseGroups: s.expenseGroups,
    bankAccounts: s.bankAccounts,
```

**Replace** (initial state; sign-out resets to it through `getInitialState()`, and every online load, farm switch, `refreshAccess`, `createFarm` and `reloadHerd` spread the server's `HerdData`, which always carries `expenseGroups`)

```ts
  accounts: [],
  bankAccounts: [],
```

with

```ts
  accounts: [],
  expenseGroups: [],
  bankAccounts: [],
```

**Replace** (the offline boot in `load`)

```ts
      set({
        ...snap.data,
        farms: snap.farms,
```

with

```ts
      set({
        ...snap.data,
        expenseGroups: snap.data.expenseGroups ?? [],
        farms: snap.farms,
```

Compile fix 1 — `lib/api/domains/expenses/schemas/expense.schema.ts` (task 3's file; this is the exact end state the contract gives task 3). With `ExpenseCategory` a `string`, the store's Eden calls (`api.expenses.post`, `api.expenses({id}).patch`, `api.accounts.post`, statements create, `api.budgets…put/delete`) no longer type against the seven-literal union. **Replace**

```ts
export const ExpenseCategoryModel = t.Union([
  t.Literal("nutrition"),
  t.Literal("pasture"),
  t.Literal("labor"),
  t.Literal("health"),
  t.Literal("breeding"),
  t.Literal("admin"),
  t.Literal("other"),
]);
```

with

```ts
/** A built-in grupo key or a farm grupo id; the use cases check it belongs to the farm. */
export const ExpenseCategoryModel = t.String({ minLength: 1, maxLength: 64 });
```

Compile fix 2 — `lib/domain/planTree.ts` (task 4's file). `isCategory`'s predicate `value is ExpenseCategory` is now `value is string`, so its false branch narrows `node.group` to `never`. One cast, in `belongs`. **Replace**

```ts
      return isCategory(node.group) ? inCoe(r) && r.group === node.group : GROUP_KINDS[node.group].includes(r.kind);
```

with

```ts
      return isCategory(node.group) ? inCoe(r) && r.group === node.group : GROUP_KINDS[node.group as TopGroup].includes(r.kind);
```

- [ ] **Step 16: Run the tests**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/queueOrSend.test.ts lib/domain/__tests__/groups.test.ts lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts --exclude '**/worktrees/**'`
Expected: PASS (15 + 13 + 12 + 3 tests).

---

#### Migration 0026

- [ ] **Step 17: Generate it**

The journal ends at `"idx": 25, "tag": "0025_financeiro-orcamento"`; the next entry must be idx 26. There is no TTY in the sandbox and `drizzle-kit generate` may ask "created or renamed?", so feed it an Enter through `script` (it needs no `DATABASE_URL`):

Run: `(sleep 6; printf '\r') | timeout 90 script -qfec "./node_modules/.bin/drizzle-kit generate --name financeiro-grupos-da-fazenda" /dev/null`
Expected: ends with `Your SQL migration file ➜ drizzle/0026_financeiro-grupos-da-fazenda.sql`, and lists `expense_groups 5 columns 1 indexes 1 fks`.

Check: `git status --short drizzle/` shows exactly `M drizzle/meta/_journal.json`, `?? drizzle/0026_financeiro-grupos-da-fazenda.sql`, `?? drizzle/meta/0026_snapshot.json`; and `grep -n '"tag"' drizzle/meta/_journal.json | tail -1` prints `"tag": "0026_financeiro-grupos-da-fazenda",` with `"idx": 26` two lines above it. If any other file was created (e.g. a `0027_*`), delete it and its journal entry: the schema has a drift this task did not intend.

- [ ] **Step 18: Replace the generated SQL with the hand-written one**

drizzle-kit writes `SET DATA TYPE text` without `USING`; make it explicit. None of the four columns has a default (0004, 0021, 0022, 0025 create them as `NOT NULL` only), so there is no default to drop and re-set. Replace the whole content of `drizzle/0026_financeiro-grupos-da-fazenda.sql` with:

```sql
CREATE TABLE "expense_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "group" SET DATA TYPE text USING "group"::text;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expense_series" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_groups_farm_name_idx" ON "expense_groups" USING btree ("farm_id",lower("name"));--> statement-breakpoint
DROP TYPE "public"."account_group";--> statement-breakpoint
DROP TYPE "public"."expense_category";
```

The tabs inside `CREATE TABLE` are real tab characters, as drizzle writes them. Leave `drizzle/meta/0026_snapshot.json` and `_journal.json` as generated.

Then confirm the schema and the snapshot agree: run `(sleep 6; printf '\r') | timeout 90 script -qfec "./node_modules/.bin/drizzle-kit generate --name should-be-empty" /dev/null`
Expected: `No schema changes, nothing to migrate`, and `git status --short drizzle/` unchanged from Step 17.

- [ ] **Step 19: Apply it to a throwaway Postgres**

```bash
docker run --rm -d --name grupos-mig-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5450:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
# -h 127.0.0.1: the image's init server listens on the socket only, so this waits for the real one
until docker exec grupos-mig-db pg_isready -h 127.0.0.1 -U meubov -d meubov >/dev/null 2>&1; do sleep 1; done
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5450/meubov ./node_modules/.bin/drizzle-kit migrate
```

Expected: `migrations applied successfully!`

```bash
docker exec -i grupos-mig-db psql -U meubov -d meubov -v ON_ERROR_STOP=1 <<'EOF'
\d expenses
SELECT attrelid::regclass AS tbl, attname, format_type(atttypid, atttypmod) AS type FROM pg_attribute
 WHERE attname IN ('category', 'group') AND attrelid::regclass::text IN ('accounts', 'expenses', 'expense_series', 'budgets') ORDER BY 1;
SELECT typname FROM pg_type WHERE typname IN ('account_group', 'expense_category');
\d expense_groups
INSERT INTO farm (name, municipality, state_registration, manager) VALUES ('F', 'M', '', '');
INSERT INTO expense_groups (id, farm_id, name) VALUES ('g-1', 1, 'Máquinas');
INSERT INTO accounts (id, farm_id, "group", name) VALUES ('a-1', 1, 'g-1', 'Trator');
EOF
docker exec grupos-mig-db psql -U meubov -d meubov -c "INSERT INTO expense_groups (id, farm_id, name) VALUES ('g-2', 1, 'MÁQUINAS')"
docker rm -f grupos-mig-db
```

Expected: `\d expenses` shows `category | text | | not null |`; the `pg_attribute` query lists four rows, all `text`; the `pg_type` query returns `(0 rows)`; `\d expense_groups` shows `"expense_groups_farm_name_idx" UNIQUE, btree (farm_id, lower(name))` and the FK to `farm(id) ON DELETE CASCADE`; the three inserts succeed; the last insert fails with `duplicate key value violates unique constraint "expense_groups_farm_name_idx"`. The container is gone after `docker rm -f`.

---

- [ ] **Step 20: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean (no other task runs in wave 1).

Run: `./node_modules/.bin/eslint lib/types.ts lib/db/schema.ts lib/domain/labels.ts lib/domain/groups.ts lib/domain/__tests__/groups.test.ts lib/api/mappers.ts lib/api/__tests__/mappers.test.ts lib/api/domains/herd/useCases/Load.useCase.ts lib/api/domains/herd/useCases/__tests__/Load.test.ts lib/store/useHerdStore.ts lib/store/__tests__/queueOrSend.test.ts lib/api/domains/expenses/schemas/expense.schema.ts lib/domain/planTree.ts`
Expected: clean.

- [ ] **Step 21: Whole suite**

Run: `./node_modules/.bin/vitest run --exclude '**/worktrees/**'`
Expected: every file passes (no existing test asserts the seven-literal validation or the old contas order).

### Task 2: Grupos API + store actions

**Files:**
- Create: `lib/api/domains/expenseGroups/schemas/expenseGroup.schema.ts`
- Create: `lib/api/domains/expenseGroups/useCases/Add.useCase.ts`
- Create: `lib/api/domains/expenseGroups/useCases/Update.useCase.ts`
- Create: `lib/api/domains/expenseGroups/useCases/Delete.useCase.ts`
- Create: `lib/api/domains/expenseGroups/expenseGroups.controller.ts`
- Modify: `lib/api/app.ts`
- Modify: `lib/api/permissions/routeRequirements.ts`
- Modify: `lib/store/useHerdStore.ts` (the three actions; the `ExpenseGroup` import only if task 1 left it out)
- Modify (via `-u`): `lib/api/__tests__/__snapshots__/routeRequirements.test.ts.snap`, `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap`
- Test: `lib/api/domains/expenseGroups/useCases/__tests__/Add.test.ts` (create)
- Test: `lib/api/domains/expenseGroups/useCases/__tests__/Update.test.ts` (create)
- Test: `lib/api/domains/expenseGroups/useCases/__tests__/Delete.test.ts` (create)
- Test: `lib/api/domains/expenseGroups/__tests__/expenseGroups.routes.test.ts` (create; the bankAccounts and budgets domains have one)
- Test: `lib/store/__tests__/expenseGroups.test.ts` (create)
- Test: `lib/api/__tests__/routeRequirements.test.ts` (modify)

Do NOT create `lib/api/domains/expenseGroups/farmCategory.ts`: it is task 3's file in the same folder.

**Interfaces:**
- Consumes (task 1):
  - `expenseGroups` table and `ExpenseGroupRow` from `@/lib/db/schema` (`id` text pk, `farmId`, `name`, `archivedAt` timestamp nullable, `createdAt` defaultNow; unique index on `(farm_id, lower(name))`); `accounts.group` and `budgets.category` are `text` columns typed `AccountGroup` / `ExpenseCategory` (both `string`).
  - `toExpenseGroup(row: ExpenseGroupRow): ExpenseGroup` from `@/lib/api/mappers`.
  - `ExpenseGroup { id; name; archivedAt?; createdAt }` from `@/lib/types`.
  - `clashesWithFixedGroup(name: string): boolean` (trims, any case) and `GROUP_NAME_MAX = 40` from `@/lib/domain/groups`.
  - Store state `expenseGroups: ExpenseGroup[]` on `HerdStore` (initial `[]`).
- Produces:
  - `AddExpenseGroupUseCase.run({ farmId, name }): Promise<ExpenseGroup | "duplicate">`
  - `UpdateExpenseGroupUseCase.run({ farmId, id, patch }): Promise<ExpenseGroup | "duplicate" | null>` and `export interface ExpenseGroupPatchInput { name?: string; archived?: boolean }`
  - `DeleteExpenseGroupUseCase.run({ farmId, id }): Promise<"deleted" | "not_found" | "in_use">`
  - `expenseGroupsController` (prefix `/expense-groups`), so the Eden client gets `api["expense-groups"].post({ name })`, `api["expense-groups"]({ id }).patch({ name?, archived? })`, `api["expense-groups"]({ id }).delete()`.
  - Routes: `POST /api/herd/expense-groups` (409 `duplicate_name`), `PATCH /api/herd/expense-groups/:id` (404 `not_found`, 409 `duplicate_name`), `DELETE /api/herd/expense-groups/:id` (404 `not_found`, 409 `in_use`, else `{ id }`), all `edit("finance")`.
  - Store actions (task 5 calls them):
    ```ts
    addExpenseGroup: (name: string) => Promise<ExpenseGroup | null>;               // null on 409
    updateExpenseGroup: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>; // false on 409
    removeExpenseGroup: (id: string) => Promise<"deleted" | "in_use">;
    ```
    The store shows no toast on a 409: the caller does ("Já existe um grupo com esse nome", "Grupo com lançamentos não se apaga. Arquive em vez de excluir."). Any other error goes through `apiFail` (toast + throw), like `addAccount`.

Design notes the executor must keep:
- No "is the name taken?" select: the unique index on `(farm_id, lower(name))` is the only check against the farm's other grupos, caught with `isUniqueViolation`. That is what makes the same name on another farm fine and a rename to its own name in another case fine (the index never clashes a row with itself).
- The delete's usage check sits in a `where` (a row back = in use) so the shared db stub records it and the test can assert the SQL covers recorrências and lançamentos of the grupo's contas under any category.

- [ ] **Step 1: Write the failing test for AddExpenseGroup**

`lib/api/domains/expenseGroups/useCases/__tests__/Add.test.ts`:

```ts
/**
 * addExpenseGroup: creates a grupo de despesa of the farm, trimmed. A built-in
 * or top grupo's label is refused in any case and with any spaces; a name
 * another grupo of the farm has is refused by the unique index on
 * (farm_id, lower(name)), so another farm's grupo never clashes.
 */
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

import { AddExpenseGroupUseCase } from "../Add.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-05T12:00:00Z"),
};

const add = (name: string, farmId = 7) => new AddExpenseGroupUseCase().run({ farmId, name });

beforeEach(() => {
  state.inserts = [];
  state.returning = [];
  state.insertErrors = [];
});

describe("addExpenseGroup", () => {
  it("trims the name and creates the grupo", async () => {
    state.returning = [[ROW]];

    const result = await add("  Máquinas e veículos ");

    expect(state.inserts).toEqual([{ id: expect.any(String), farmId: 7, name: "Máquinas e veículos" }]);
    expect(result).toMatchObject({ id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-10-05T12:00:00.000Z" });
  });

  it("refuses a built-in or top grupo label in any case or with spaces, writing nothing", async () => {
    for (const name of ["  nutrição ", "RECEITAS", "sócios"]) expect(await add(name)).toBe("duplicate");
    expect(state.inserts).toEqual([]);
  });

  it("answers duplicate when the farm already has the name in any case", async () => {
    state.insertErrors = [Object.assign(new Error("duplicate key"), { cause: { code: "23505" } })];

    expect(await add("MÁQUINAS E VEÍCULOS")).toBe("duplicate");
  });

  it("takes a name another farm has: nothing but this farm's unique index can refuse it", async () => {
    state.returning = [[{ ...ROW, farmId: 8 }]];

    expect(await add("Máquinas e veículos", 8)).toMatchObject({ name: "Máquinas e veículos" });
    expect(state.inserts[0]).toMatchObject({ farmId: 8 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Add.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `../Add.useCase` does not exist yet.

- [ ] **Step 3: Implement AddExpenseGroup**

`lib/api/domains/expenseGroups/useCases/Add.useCase.ts`:

```ts
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { expenseGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpenseGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { clashesWithFixedGroup } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseGroup } from "@/lib/types";

interface AddExpenseGroupUseCaseProps {
  farmId: number;
  name: string;
}

/**
 * `duplicate`: the name is a built-in or top grupo's label, or another grupo
 * of the farm has it (archived ones included), in any case.
 */
type AddExpenseGroupUseCaseResponse = ExpenseGroup | "duplicate";

type CurrUseCase = _UseCase<AddExpenseGroupUseCaseProps, AddExpenseGroupUseCaseResponse>;

/**
 * Creates a grupo de despesa of the farm. The unique index on
 * (farm_id, lower(name)) is the only check against the farm's other grupos,
 * so a concurrent insert of the same name is caught the same way.
 */
export class AddExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, name }) => {
    if (clashesWithFixedGroup(name)) return "duplicate";
    try {
      const [row] = await this.repository
        .insert(expenseGroups)
        .values({ id: randomUUID(), farmId, name: name.trim() })
        .returning();
      return toExpenseGroup(row);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Add.test.ts --exclude '**/worktrees/**'`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for UpdateExpenseGroup**

`lib/api/domains/expenseGroups/useCases/__tests__/Update.test.ts`:

```ts
/**
 * updateExpenseGroup: renames a grupo (refused like a new name, except that its
 * own name in another case is fine) or archives and restores it.
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

import { UpdateExpenseGroupUseCase, type ExpenseGroupPatchInput } from "../Update.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const update = (patch: ExpenseGroupPatchInput, repo?: RepositoryType) =>
  new UpdateExpenseGroupUseCase(repo).run({ farmId: 7, id: "g-maq", patch });

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.returning = [];
});

describe("updateExpenseGroup", () => {
  it("renames, trimmed", async () => {
    state.returning = [[{ ...ROW, name: "Máquinas" }]];

    expect(await update({ name: " Máquinas " })).toMatchObject({ id: "g-maq", name: "Máquinas" });
    expect(state.updates).toEqual([{ name: "Máquinas" }]);
  });

  it("renames a grupo to its own name in another case", async () => {
    state.returning = [[{ ...ROW, name: "MÁQUINAS E VEÍCULOS" }]];

    expect(await update({ name: "MÁQUINAS E VEÍCULOS" })).toMatchObject({ name: "MÁQUINAS E VEÍCULOS" });
    expect(state.updates).toEqual([{ name: "MÁQUINAS E VEÍCULOS" }]);
  });

  it("refuses a built-in or top grupo label in any case or with spaces, writing nothing", async () => {
    for (const name of ["  nutrição ", "RECEITAS"]) expect(await update({ name })).toBe("duplicate");
    expect(state.updates).toEqual([]);
  });

  it("answers duplicate when another grupo of the farm has the name", async () => {
    const unique = Object.assign(new Error("duplicate key"), { cause: { code: "23505" } });
    const taken = {
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.reject(unique) }) }) }),
    } as unknown as RepositoryType;

    expect(await update({ name: "Arrendamento" }, taken)).toBe("duplicate");
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

- [ ] **Step 6: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Update.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `../Update.useCase` does not exist yet.

- [ ] **Step 7: Implement UpdateExpenseGroup**

`lib/api/domains/expenseGroups/useCases/Update.useCase.ts`:

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { expenseGroups } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toExpenseGroup } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { clashesWithFixedGroup } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ExpenseGroup } from "@/lib/types";

/** Absent leaves a field as it is. */
export interface ExpenseGroupPatchInput {
  name?: string;
  /** True archives the grupo, false restores it. */
  archived?: boolean;
}

interface UpdateExpenseGroupUseCaseProps {
  farmId: number;
  id: string;
  patch: ExpenseGroupPatchInput;
}

/** null: the grupo is not on this farm. `duplicate`: as in AddExpenseGroup. */
type UpdateExpenseGroupUseCaseResponse = ExpenseGroup | "duplicate" | null;

type CurrUseCase = _UseCase<UpdateExpenseGroupUseCaseProps, UpdateExpenseGroupUseCaseResponse>;

/**
 * Renames a grupo (its contas, lançamentos and orçamento lines hold its id, so
 * they follow), archives or restores it. Its own name in another case is no
 * clash: the unique index only compares it with the farm's other grupos.
 */
export class UpdateExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("UpdateExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, id, patch }) => {
    if (patch.name !== undefined && clashesWithFixedGroup(patch.name)) return "duplicate";
    const scope = and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, id));
    const set: Partial<typeof expenseGroups.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name.trim();
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    if (Object.keys(set).length === 0) {
      const [current] = await this.repository.select().from(expenseGroups).where(scope).limit(1);
      return current ? toExpenseGroup(current) : null;
    }

    try {
      const [row] = await this.repository.update(expenseGroups).set(set).where(scope).returning();
      return row ? toExpenseGroup(row) : null;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  };
}
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Update.test.ts --exclude '**/worktrees/**'`
Expected: PASS (6 tests)

- [ ] **Step 9: Write the failing test for DeleteExpenseGroup (Review Focus 2)**

`lib/api/domains/expenseGroups/useCases/__tests__/Delete.test.ts`:

```ts
/**
 * deleteExpenseGroup: only a grupo nothing uses is deleted, with its contas and
 * its orçamento lines; a used one is archived instead. A recorrência keeps it,
 * and so does a lançamento of one of its contas whatever category it carries.
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

import { DeleteExpenseGroupUseCase } from "../Delete.useCase";

const ROW = {
  id: "g-maq",
  farmId: 7,
  name: "Máquinas e veículos",
  archivedAt: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

const remove = (farmId = 7) => new DeleteExpenseGroupUseCase().run({ farmId, id: "g-maq" });

beforeEach(() => {
  state.selectResults = [];
  state.deletes = 0;
  state.wheres = [];
});

describe("deleteExpenseGroup", () => {
  it("is not_found off the farm", async () => {
    state.selectResults = [[]];

    expect(await remove(8)).toBe("not_found");
    expect(state.deletes).toBe(0);
    expect(renderSql(state.wheres[0] as SQL).params).toEqual([8, "g-maq"]);
  });

  it("is in_use while a lançamento or recorrência has the grupo, or points at one of its contas under any category", async () => {
    state.selectResults = [[ROW], [{ id: "g-maq" }]];

    expect(await remove()).toBe("in_use");
    expect(state.deletes).toBe(0);
    const usage = renderSql(state.wheres[1] as SQL);
    const ofItsContas = '"account_id" in (select "accounts"."id" from "accounts" where "accounts"."farm_id" = $';
    // A recorrência alone keeps the grupo.
    expect(usage.sql).toContain('exists (select 1 from "expense_series" where "expense_series"."farm_id" = $');
    expect(usage.sql).toContain('"expense_series"."category" = $');
    expect(usage.sql).toContain(`"expense_series".${ofItsContas}`);
    // A lançamento of one of its contas keeps it too, filed under another grupo or not: either one is enough.
    expect(usage.sql).toMatch(/"expenses"\."category" = \$\d+ or "expenses"\."account_id" in \(select/);
    expect(usage.sql).toContain(`"expenses".${ofItsContas}`);
    expect(usage.sql).toContain('"accounts"."group" = $');
    expect(new Set(usage.params)).toEqual(new Set([7, "g-maq"]));
  });

  it("deletes an unused grupo: its orçamento lines, its contas, then the grupo, all on this farm", async () => {
    state.selectResults = [[ROW], []];

    expect(await remove()).toBe("deleted");
    expect(state.deletes).toBe(3);
    const [lines, contas, grupo] = state.wheres.slice(2).map((where) => renderSql(where as SQL));
    expect(lines.sql).toContain('"budgets"."category" = $2');
    expect(contas.sql).toContain('"accounts"."group" = $2');
    expect(grupo.sql).toContain('"expense_groups"."id" = $2');
    for (const query of [lines, contas, grupo]) expect(query.params).toEqual([7, "g-maq"]);
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Delete.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `../Delete.useCase` does not exist yet.

- [ ] **Step 11: Implement DeleteExpenseGroup**

`lib/api/domains/expenseGroups/useCases/Delete.useCase.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, budgets, expenseGroups, expenseSeries, expenses } from "@/lib/db/schema";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

interface DeleteExpenseGroupUseCaseProps {
  farmId: number;
  id: string;
}

/**
 * `not_found` off this farm; `in_use` when a lançamento or recorrência has the
 * grupo as its category or points at one of its contas, whatever category it
 * carries (archive it instead).
 */
type DeleteExpenseGroupUseCaseResponse = "deleted" | "not_found" | "in_use";

type CurrUseCase = _UseCase<DeleteExpenseGroupUseCaseProps, DeleteExpenseGroupUseCaseResponse>;

/** Deletes a grupo nothing uses — one created by mistake — with its contas and its orçamento lines. */
export class DeleteExpenseGroupUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("DeleteExpenseGroupUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, id }) =>
    // The row lock makes a second delete or a rename of the grupo wait.
    // ponytail: a lançamento saved into the grupo meanwhile is not held off (a grupo key has no FK)
    // and then reads "Grupo removido"; have its writers read the grupo `for share` if that shows up.
    this.repository.transaction(async (tx) => {
      const scope = and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, id));
      const [current] = await tx.select().from(expenseGroups).where(scope).limit(1).for("update");
      if (!current) return "not_found";
      const contas = sql`(select ${accounts.id} from ${accounts} where ${accounts.farmId} = ${farmId} and ${accounts.group} = ${id})`;
      // A row back means a lançamento or a recorrência still uses the grupo.
      const [used] = await tx
        .select({ id: expenseGroups.id })
        .from(expenseGroups)
        .where(
          and(
            scope,
            sql`(exists (select 1 from ${expenses} where ${expenses.farmId} = ${farmId} and (${expenses.category} = ${id} or ${expenses.accountId} in ${contas}))
              or exists (select 1 from ${expenseSeries} where ${expenseSeries.farmId} = ${farmId} and (${expenseSeries.category} = ${id} or ${expenseSeries.accountId} in ${contas})))`
          )
        )
        .limit(1);
      if (used) return "in_use";
      // Every orçamento line of the grupo, its own and its contas' (theirs would cascade with the conta anyway).
      await tx.delete(budgets).where(and(eq(budgets.farmId, farmId), eq(budgets.category, id)));
      await tx.delete(accounts).where(and(eq(accounts.farmId, farmId), eq(accounts.group, id)));
      await tx.delete(expenseGroups).where(scope);
      return "deleted";
    });
}
```

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Delete.test.ts --exclude '**/worktrees/**'`
Expected: PASS (3 tests)

- [ ] **Step 13: Write the failing route tests**

`lib/api/domains/expenseGroups/__tests__/expenseGroups.routes.test.ts`:

```ts
/**
 * The grupos de despesa routes behind the farm macro, auth and db mocked: a
 * member who only sees Financeiro writes nothing, a name the schema refuses
 * never reaches the use case, and each refusal of a use case answers its status.
 */
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
vi.mock("@/lib/api/domains/expenseGroups/useCases/Add.useCase", () => ({
  AddExpenseGroupUseCase: class {
    run = add;
  },
}));
vi.mock("@/lib/api/domains/expenseGroups/useCases/Update.useCase", () => ({
  UpdateExpenseGroupUseCase: class {
    run = update;
  },
}));
vi.mock("@/lib/api/domains/expenseGroups/useCases/Delete.useCase", () => ({
  DeleteExpenseGroupUseCase: class {
    run = remove;
  },
}));

import { herdApi } from "@/lib/api/app";

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
  state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
});

describe("grupos de despesa routes", () => {
  it("refuse every write to a member with Financeiro view only, naming Financeiro", async () => {
    state.membership = [{ role: "member", preset: null, permissions: PRESETS.consultor }];

    for (const response of [
      await request("POST", "/expense-groups", { name: "Máquinas e veículos" }),
      await request("PATCH", "/expense-groups/g-maq", { archived: true }),
      await request("DELETE", "/expense-groups/g-maq"),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
    }
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuse a blank name and one over 40 characters before the use case", async () => {
    for (const name of ["   ", "x".repeat(41)]) {
      expect((await request("POST", "/expense-groups", { name })).status).toBe(422);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("answer 409 duplicate_name for a taken name, 404 off the farm and 409 in_use for a grupo in use", async () => {
    add.mockResolvedValue("duplicate");
    update.mockResolvedValue(null);
    remove.mockResolvedValue("in_use");

    const created = await request("POST", "/expense-groups", { name: "Nutrição" });
    expect(created.status).toBe(409);
    expect(await created.json()).toEqual({ error: "duplicate_name" });
    expect(add).toHaveBeenCalledWith({ farmId: 7, name: "Nutrição" });

    const renamed = await request("PATCH", "/expense-groups/g-9", { name: "Arrendamento" });
    expect(renamed.status).toBe(404);
    expect(update).toHaveBeenCalledWith({ farmId: 7, id: "g-9", patch: { name: "Arrendamento" } });

    const removed = await request("DELETE", "/expense-groups/g-maq");
    expect(removed.status).toBe(409);
    expect(await removed.json()).toEqual({ error: "in_use" });
  });

  it("answer the id of a deleted grupo", async () => {
    remove.mockResolvedValue("deleted");

    const response = await request("DELETE", "/expense-groups/g-maq");
    expect(await response.json()).toEqual({ id: "g-maq" });
    expect(remove).toHaveBeenCalledWith({ farmId: 7, id: "g-maq" });
  });
});
```

In `lib/api/__tests__/routeRequirements.test.ts`, **Replace**:

```ts
      "POST /api/herd/accounts/defaults",
    ]) {
```

with:

```ts
      "POST /api/herd/accounts/defaults",
      "POST /api/herd/expense-groups",
      "PATCH /api/herd/expense-groups/:id",
      "DELETE /api/herd/expense-groups/:id",
    ]) {
```

- [ ] **Step 14: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/expenseGroups.routes.test.ts lib/api/__tests__/routeRequirements.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the routes answer 404 (nothing mounted at `/expense-groups`), and `ROUTE_REQUIREMENTS["POST /api/herd/expense-groups"]` is `undefined`.

- [ ] **Step 15: Implement the schemas, the controller, the mount and the requirements**

`lib/api/domains/expenseGroups/schemas/expenseGroup.schema.ts`:

```ts
/** Request schemas for the farm's own grupos de despesa. */

import { t } from "elysia";

import { GROUP_NAME_MAX } from "@/lib/domain/groups";

const GroupName = t.String({ minLength: 1, maxLength: GROUP_NAME_MAX, pattern: "\\S" });

/** Body of POST /expense-groups. */
export const NewExpenseGroupBody = t.Object({ name: GroupName });

/** Body of PATCH /expense-groups/:id. `archived` true archives, false restores. */
export const UpdateExpenseGroupBody = t.Object({
  name: t.Optional(GroupName),
  archived: t.Optional(t.Boolean()),
});
```

`lib/api/domains/expenseGroups/expenseGroups.controller.ts`:

```ts
/**
 * Grupos de despesa of the farm, next to the seven built-in ones: they count in
 * the COE the same way. A grupo with lançamentos is archived, so they keep it;
 * only an unused one is deleted, with its contas and orçamento lines.
 */
import { Elysia } from "elysia";

import { farmPlugin } from "@/lib/api/plugins/farm";

import { AddExpenseGroupUseCase } from "./useCases/Add.useCase";
import { DeleteExpenseGroupUseCase } from "./useCases/Delete.useCase";
import { UpdateExpenseGroupUseCase } from "./useCases/Update.useCase";
import { NewExpenseGroupBody, UpdateExpenseGroupBody } from "./schemas/expenseGroup.schema";

export const expenseGroupsController = new Elysia({ prefix: "/expense-groups" })
  .use(farmPlugin)
  .post(
    "/",
    async ({ farmId, body, status }) => {
      const result = await new AddExpenseGroupUseCase().run({ farmId, name: body.name });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: NewExpenseGroupBody }
  )
  .patch(
    "/:id",
    async ({ farmId, params, body, status }) => {
      const result = await new UpdateExpenseGroupUseCase().run({ farmId, id: params.id, patch: body });
      if (result === null) return status(404, { error: "not_found" });
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      return result;
    },
    { farm: true, body: UpdateExpenseGroupBody }
  )
  .delete(
    "/:id",
    async ({ farmId, params, status }) => {
      const result = await new DeleteExpenseGroupUseCase().run({ farmId, id: params.id });
      if (result === "not_found") return status(404, { error: result });
      if (result === "in_use") return status(409, { error: result });
      return { id: params.id };
    },
    { farm: true }
  );
```

In `lib/api/app.ts`, **Replace**:

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
```

with:

```ts
import { accountsController } from "@/lib/api/domains/accounts/accounts.controller";
import { expenseGroupsController } from "@/lib/api/domains/expenseGroups/expenseGroups.controller";
```

and **Replace**:

```ts
  .use(accountsController)
```

with:

```ts
  .use(accountsController)
  .use(expenseGroupsController)
```

In `lib/api/permissions/routeRequirements.ts`, **Replace**:

```ts
  "POST /api/herd/accounts/defaults": edit("finance"),
```

with:

```ts
  "POST /api/herd/accounts/defaults": edit("finance"),
  "POST /api/herd/expense-groups": edit("finance"),
  "PATCH /api/herd/expense-groups/:id": edit("finance"),
  "DELETE /api/herd/expense-groups/:id": edit("finance"),
```

- [ ] **Step 16: Update the two route snapshots**

Run: `./node_modules/.bin/vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**' -u`
Expected: `Snapshots 2 updated`, `Test Files 2 passed (2)`.

Keep `-u` LAST: vitest's `-u [type]` takes the next word as its value, so `vitest run -u <path>` drops the path, runs the whole suite and rewrites every snapshot in it.

Then `git diff lib/api/__tests__/__snapshots__/` must show only additions: in `routeTable.test.ts.snap` the three lines `"DELETE /api/herd/expense-groups/:id"`, `"PATCH /api/herd/expense-groups/:id"`, `"POST /api/herd/expense-groups"`; in `routeRequirements.test.ts.snap` the same three keys, each `{ "edit": [ "finance" ] }`. Anything else changed → stop and report.

- [ ] **Step 17: Run the route tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/expenseGroups.routes.test.ts lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**'`
Expected: PASS (4 + 15 + 1 tests)

- [ ] **Step 18: Write the failing store test**

`lib/store/__tests__/expenseGroups.test.ts`:

```ts
/**
 * Grupos de despesa in the store: a deleted grupo takes its contas and every
 * cached orçamento row of the grupo or of those contas with it, as the server
 * does; a 409 `in_use` changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Budget, ExpenseGroup } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { groupDelete } = vi.hoisted(() => ({ groupDelete: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { "expense-groups": () => ({ delete: groupDelete }) },
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

const GROUPS: ExpenseGroup[] = [
  { id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-arr", name: "Arrendamento", createdAt: "2026-10-02T12:00:00.000Z" },
];

const ACCOUNTS: Account[] = [
  { id: "trator", group: "g-maq", name: "Trator" },
  { id: "pasto", group: "g-arr", name: "Pasto do vizinho" },
  { id: "sal", group: "nutrition", name: "Sal mineral" },
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
    expenseGroups: GROUPS,
    accounts: ACCOUNTS,
    budgets: {
      2025: [
        row("maq", "g-maq"),
        row("trator", "g-maq", "trator"),
        // A legacy row of the trator filed under another grupo: the conta's delete cascades it all the same.
        row("trator-legado", "admin", "trator"),
        row("arr", "g-arr"),
        row("sal", "nutrition", "sal"),
      ],
    },
  });
});

describe("removeExpenseGroup", () => {
  it("drops the grupo, its contas and their orçamento rows, and keeps the rest", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-maq" }, error: null });

    expect(await useHerdStore.getState().removeExpenseGroup("g-maq")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.expenseGroups.map((g) => g.id)).toEqual(["g-arr"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["pasto", "sal"]);
    expect(s.budgets[2025].map((b) => b.id)).toEqual(["arr", "sal"]);
  });

  it("answers in_use on a 409 and changes nothing", async () => {
    groupDelete.mockResolvedValue({ data: null, error: { status: 409, value: { error: "in_use" } } });

    expect(await useHerdStore.getState().removeExpenseGroup("g-maq")).toBe("in_use");

    const s = useHerdStore.getState();
    expect(s.expenseGroups).toEqual(GROUPS);
    expect(s.accounts).toEqual(ACCOUNTS);
    expect(s.budgets[2025]).toHaveLength(5);
  });
});
```

- [ ] **Step 19: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/store/__tests__/expenseGroups.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `useHerdStore.getState(...).removeExpenseGroup is not a function`.

- [ ] **Step 20: Implement the store actions**

In `lib/store/useHerdStore.ts`:

1. Run `grep -n '^  ExpenseGroup,$' lib/store/useHerdStore.ts`. Task 1 normally imports the type with the `expenseGroups` field; only if it prints nothing, **Replace**:

```ts
  ExpenseCategory,
  FarmData,
```

with:

```ts
  ExpenseCategory,
  ExpenseGroup,
  FarmData,
```

2. **Replace**:

```ts
  removeAccount: (id: string) => Promise<"deleted" | "in_use">;
```

with:

```ts
  removeAccount: (id: string) => Promise<"deleted" | "in_use">;
  /** Creates a grupo de despesa of the farm; null when the name is taken or is a fixed grupo's (409). */
  addExpenseGroup: (name: string) => Promise<ExpenseGroup | null>;
  /** Renames, archives or restores a grupo of the farm; false when the name is taken (409). */
  updateExpenseGroup: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Deletes a grupo nothing uses, with its contas and orçamento lines; "in_use" on 409. */
  removeExpenseGroup: (id: string) => Promise<"deleted" | "in_use">;
```

3. **Replace**:

```ts
  seedDefaultAccounts: async () => {
```

with:

```ts
  addExpenseGroup: async (name) => {
    const { data, error } = await api["expense-groups"].post({ name });
    if (error) {
      if (error.status === CONFLICT) return null;
      apiFail("criar o grupo", error);
    }
    const group = data as ExpenseGroup;
    set((s) => ({ expenseGroups: [...s.expenseGroups, group] }));
    return group;
  },

  updateExpenseGroup: async (id, patch) => {
    const { data, error } = await api["expense-groups"]({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar o grupo", error);
    }
    const group = data as ExpenseGroup;
    set((s) => ({ expenseGroups: s.expenseGroups.map((g) => (g.id === id ? group : g)) }));
    return true;
  },

  removeExpenseGroup: async (id) => {
    const { error } = await api["expense-groups"]({ id }).delete();
    if (error) {
      if (error.status === CONFLICT) return "in_use";
      apiFail("excluir o grupo", error);
    }
    set((s) => {
      // Its contas go with it, and so do their orçamento lines, whatever grupo a line was filed under.
      const contas = new Set(s.accounts.filter((a) => a.group === id).map((a) => a.id));
      return {
        expenseGroups: s.expenseGroups.filter((g) => g.id !== id),
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

  seedDefaultAccounts: async () => {
```

- [ ] **Step 21: Run every test of the task**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/useCases/__tests__/Add.test.ts lib/api/domains/expenseGroups/useCases/__tests__/Update.test.ts lib/api/domains/expenseGroups/useCases/__tests__/Delete.test.ts lib/api/domains/expenseGroups/__tests__/expenseGroups.routes.test.ts lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts lib/store/__tests__/expenseGroups.test.ts --exclude '**/worktrees/**'`
Expected: PASS (7 files, 35 tests)

- [ ] **Step 22: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint lib/api/domains/expenseGroups/ lib/api/app.ts lib/api/permissions/routeRequirements.ts lib/api/__tests__/routeRequirements.test.ts lib/store/useHerdStore.ts lib/store/__tests__/expenseGroups.test.ts`
Expected: both clean. (Task 1 already widened `ExpenseCategoryModel` to a string, and `AccountGroupModel` is a union containing it, so the store's existing `api.accounts.post` / `api.expenses…` / `api.budgets.put` calls type-check whether or not task 3 has landed.) If `tsc` reports anything in task 4's files (planTree/ledger/budget/components) while task 4 runs in the same tree, that is task 4's; nothing may point at the new actions, at `lib/api/domains/expenseGroups/` or at `lib/api/app.ts`.

### Task 3: Validation

The server accepts a farm grupo's id wherever a grupo key is written, and refuses anything else with 400 `invalid_category`. A conta now dictates the grupo: a despesa's conta must sit in the despesa's grupo and a receita's conta in Receitas, else 400 `invalid_account`.

**Files:**
- Create: `lib/api/domains/expenseGroups/farmCategory.ts`
- No edit: `lib/api/domains/expenses/schemas/expense.schema.ts` (task 1 already made `ExpenseCategoryModel` a `t.String({ minLength: 1, maxLength: 64 })`)
- Modify: `lib/api/domains/expenses/entryRules.ts`
- Modify: `lib/api/domains/expenses/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/AddSeries.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/Update.useCase.ts`
- Modify: `lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`
- Modify: `lib/api/domains/statements/useCases/ResolveLine.useCase.ts`
- Modify: `lib/api/domains/statements/statements.controller.ts`
- Modify: `lib/api/domains/accounts/schemas/account.schema.ts`
- Modify: `lib/api/domains/accounts/useCases/Add.useCase.ts`
- Modify: `lib/api/domains/accounts/accounts.controller.ts`
- Modify: `lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`
- Test (create): `lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts`
- Test (modify): `lib/api/domains/expenses/useCases/__tests__/Add.test.ts`
- Test (modify): `lib/api/domains/expenses/useCases/__tests__/Update.test.ts`
- Test (modify): `lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`
- Test (modify): `lib/api/domains/expenses/__tests__/expenses.routes.test.ts`
- Test (modify): `lib/api/domains/statements/useCases/__tests__/statements.test.ts`
- Test (modify): `lib/api/domains/accounts/useCases/__tests__/Add.test.ts`
- Test (modify): `lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts`

These were checked and need **no edit**:
- `lib/api/domains/budgets/schemas/budget.schema.ts` imports `ExpenseCategoryModel` and picks up the new string model as it is.
- `lib/api/domains/statements/schemas/statement.schema.ts`: `CreateFromLineBody` is `t.Omit(NewExpenseBody, …)`, so it inherits the new model.
- `expenses.controller.ts` and `budgets.controller.ts` already answer every string result with `status(400, { error: result })`, so `invalid_category` becomes a 400 there with no change.
- Three use cases write a category without calling `normaliseEntry`. They all stay valid:
  - `Split.useCase.ts` copies `row.category` and `row.accountId` from a row that was already validated.
  - `TopUpSeries.useCase.ts` copies `series.category`, which AddSeries, Split or UpdateSeries wrote from a validated row.
  - `semen/useCases/AddPurchase.useCase.ts` goes through `AddExpenseUseCase` with the built-in `"breeding"` and the conta it finds with `eq(accounts.group, "breeding")`, so the grupo and the conta agree.
- `CopyBudgets` and `DeleteBudgetLine` need nothing here:
  - CopyBudgets copies keys that are already stored. Its `copyPlan` belongs to task 4.
  - DeleteBudgetLine only deletes by key, and an unknown key matches no rows.
- Accounts `Update` cannot change a conta's group, and `SeedDefaults` writes only fixed keys.

**Typing note:** `RepositoryType` is `NodePgDatabase<typeof schema>`, and a Drizzle transaction handle is assignable to it. Today `Update.useCase` already passes `tx` to `normaliseEntry(tx, …)` and `isPayingAccount(tx, …)`. So `isFarmCategory(repo: RepositoryType, …)` takes the pooled client or a `tx`, and no `Tx` overload is needed.

**Interfaces:**
- Consumes, all from task 1 (contract) unless marked:
  - `isBuiltinCategory(key: string): key is BuiltinCategory` from `@/lib/domain/groups`.
  - `expenseGroups` (pgTable `expense_groups`, columns `id`, `farmId` → `"farm_id"`, `name`, `archivedAt`, `createdAt`) from `@/lib/db/schema`.
  - `ExpenseCategory = string` and `AccountGroup = string` from `@/lib/types`.
  - `CAPITAL_GROUPS` and `isCapitalKind` from `@/lib/domain/entries` (existing).
- Produces:
  - `isFarmCategory(repo: RepositoryType, farmId: number, key: string): Promise<boolean>` in `@/lib/api/domains/expenseGroups/farmCategory`. Archived grupos count as valid, and a built-in key runs no query.
  - `normaliseEntry(repo, farmId, entry): Promise<NormalisedEntry | "invalid_category" | "invalid_account" | "invalid_bank_account">`.
  - `AccountGroupModel` becomes `t.String({ minLength: 1, maxLength: 64 })` (`ExpenseCategoryModel` already is, since task 1).
  - New results:
    - `AddExpenseUseCase`, `AddSeriesUseCase`, `UpdateExpenseUseCase` and `UpdateSeriesUseCase` can return `"invalid_category"`.
    - `ResolveRefusal` includes `"invalid_category"` (mapped to 400).
    - `AddAccountUseCase` can return `"invalid_category"`.
    - `PutBudgetLineUseCase` can return `"invalid_category"`.
  - HTTP: 400 `{ error: "invalid_category" }` from `POST /expenses`, `PATCH /expenses/:id`, `POST /statement-lines/:id/create`, `POST /accounts` and `PUT /budgets`.

---

#### Cycle 1: `isFarmCategory`

- [ ] **Step 1: Write the failing test**

`lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts` (new):

```ts
/**
 * isFarmCategory: a built-in key passes without a query; any other key must
 * be the id of one of the farm's own grupos, archived ones included.
 *
 * The shared chainable db stub, passed as the repository: selects answer from
 * the queue and record their condition.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDbStub, renderSql } from "@/lib/api/__tests__/dbStub";
import type { RepositoryType } from "@/lib/api/@types/repoTypes";

import { isFarmCategory } from "../farmCategory";

const state = {
  selectResults: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  returning: [] as unknown[][],
  wheres: [] as unknown[],
};
const repo = createDbStub(state) as unknown as RepositoryType;

beforeEach(() => {
  state.selectResults = [];
  state.wheres = [];
});

describe("isFarmCategory", () => {
  it("takes the seven built-in keys without asking the database", async () => {
    for (const key of ["nutrition", "pasture", "labor", "health", "breeding", "admin", "other"]) {
      expect(await isFarmCategory(repo, 7, key)).toBe(true);
    }
    expect(state.wheres).toEqual([]);
  });

  it("takes one of the farm's own grupos, archived ones too", async () => {
    state.selectResults = [[{ id: "grp-maq" }]];

    expect(await isFarmCategory(repo, 7, "grp-maq")).toBe(true);

    const { sql, params } = renderSql(state.wheres[0] as SQL);
    expect(sql).toContain('"expense_groups"."farm_id" = $1');
    expect(params).toEqual([7, "grp-maq"]);
    // An old lançamento in an archived grupo still saves: no archived_at filter.
    expect(sql).not.toContain("archived_at");
  });

  it("refuses another farm's grupo, an unknown key and the grupos outside Despesas", async () => {
    // The farm filter finds no grupo by that id.
    for (const key of ["grp-of-another-farm", "fuel", "revenue", "investment", "expenses"]) {
      state.selectResults = [[]];
      expect(await isFarmCategory(repo, 7, key)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts --exclude '**/worktrees/**'`
Expected: FAIL. The module `../farmCategory` does not exist yet ("Failed to resolve import").

- [ ] **Step 3: Implement**

`lib/api/domains/expenseGroups/farmCategory.ts` (new):

```ts
/**
 * Which despesa grupo keys a farm may write. normaliseEntry (lançamentos,
 * séries, "Criar lançamento" from a linha do extrato), AddAccount and
 * PutBudgetLine ask here before a category or a conta's grupo is stored: the
 * columns are text, so nothing in the database checks them.
 */
import { and, eq } from "drizzle-orm";

import { expenseGroups } from "@/lib/db/schema";
import { isBuiltinCategory } from "@/lib/domain/groups";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

/**
 * A despesa grupo key this farm may write: a built-in key, or the id of one of
 * its own expense_groups, archived ones too (an old lançamento in an archived
 * grupo still saves; the forms just stop offering it). A built-in key asks
 * nothing of the database. Takes the pooled client or a transaction.
 */
export async function isFarmCategory(repo: RepositoryType, farmId: number, key: string): Promise<boolean> {
  if (isBuiltinCategory(key)) return true;
  const [row] = await repo
    .select({ id: expenseGroups.id })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.farmId, farmId), eq(expenseGroups.id, key)))
    .limit(1);
  return row !== undefined;
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts --exclude '**/worktrees/**'`
Expected: PASS (3 tests).

---

#### Cycle 2: lançamentos (`normaliseEntry` and every caller)

- [ ] **Step 5: Write the failing tests**

**`lib/api/domains/expenses/useCases/__tests__/Add.test.ts`**

Replace:
```ts
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (the conta do plano, then "Pago por"), inserts record
 * the row and echo it.
```
with:
```ts
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows (a farm grupo when the category is not a built-in one,
 * the conta do plano, then "Pago por"), inserts record the row and echo it.
```

Replace (the end of the file):
```ts
    expect(await add({ ...rendimento, accountId: "acc-1", bankAccountId: "cdb" })).toBe("invalid_account");
    expect(state.inserts).toHaveLength(1);
  });
});
```
with:
```ts
    expect(await add({ ...rendimento, accountId: "acc-1", bankAccountId: "cdb" })).toBe("invalid_account");
    expect(state.inserts).toHaveLength(1);
  });
});

describe("addExpense — grupo", () => {
  it("takes a grupo of the farm with a conta of that grupo", async () => {
    // The grupo (one of this farm's), then the conta do plano.
    state.selectResults = [[{ id: "grp-maq" }], [{ group: "grp-maq" }]];

    await add({ ...ENTRY, category: "grp-maq", accountId: "acc-trator" });

    expect(state.inserts[0]).toMatchObject({ kind: "expense", category: "grp-maq", accountId: "acc-trator" });
  });

  it("refuses a grupo of another farm or an unknown key, before reading the conta", async () => {
    // The farm filter finds no grupo by that id; the conta queued after it is never read.
    state.selectResults = [[], [{ group: "grp-maq" }]];
    expect(await add({ ...ENTRY, category: "grp-of-another-farm", accountId: "acc-trator" })).toBe(
      "invalid_category"
    );
    expect(state.selectResults).toEqual([[{ group: "grp-maq" }]]);

    state.selectResults = [[]];
    expect(await add({ ...ENTRY, category: "fuel" })).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });

  it("keeps a despesa in a conta of its own grupo and a receita in a conta of Receitas", async () => {
    // A built-in grupo asks nothing: the only select is the conta.
    state.selectResults = [[{ group: "admin" }]];
    expect(await add({ ...ENTRY, accountId: "acc-escritorio" })).toBe("invalid_account");
    state.selectResults = [[{ id: "grp-maq" }], [{ group: "nutrition" }]];
    expect(await add({ ...ENTRY, category: "grp-maq", accountId: "acc-sal" })).toBe("invalid_account");
    state.selectResults = [[{ group: "nutrition" }]];
    expect(await add({ ...ENTRY, kind: "revenue", category: "other", accountId: "acc-sal" })).toBe(
      "invalid_account"
    );
    expect(state.inserts).toEqual([]);

    state.selectResults = [[{ group: "revenue" }]];
    await add({ ...ENTRY, kind: "revenue", category: "other", accountId: "acc-aluguel" });
    expect(state.inserts[0]).toMatchObject({ kind: "revenue", category: "other", accountId: "acc-aluguel" });
  });
});
```

**`lib/api/domains/expenses/useCases/__tests__/Update.test.ts`**

Replace (the end of the file):
```ts
    await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({ date: "2026-09-30", paidAt: "2026-09-30", dueDate: null });
  });
});
```
with:
```ts
    await run({ date: "2026-09-30", paidAt: null });

    expect(state.updates[0]).toMatchObject({ date: "2026-09-30", paidAt: "2026-09-30", dueDate: null });
  });
});

describe("updateExpense — grupo", () => {
  const run = (patch: ExpensePatchInput) => new UpdateExpenseUseCase().run({ farmId: 7, id: "e-1", patch });

  it("checks a grupo sent alone: not one of the farm's, or not the conta's", async () => {
    // The row, then the grupo sent: no grupo of this farm by that id.
    state.selectResults = [[ROW], []];
    expect(await run({ category: "grp-of-another-farm" })).toBe("invalid_category");
    // The row, then its conta (a built-in grupo asks nothing): a conta of Nutrição.
    state.selectResults = [[ROW], [{ group: "nutrition" }]];
    expect(await run({ category: "admin" })).toBe("invalid_account");
    expect(state.updates).toEqual([]);
  });

  it("saves the edit of an old lançamento whose farm grupo is archived", async () => {
    const old = { ...ROW, category: "grp-arrend", accountId: "acc-pasto-vizinho" };
    // The row, its grupo (found whatever archived_at says), its conta.
    state.selectResults = [[old], [{ id: "grp-arrend" }], [{ group: "grp-arrend" }]];
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

**`lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts`**

Replace:
```ts
  it("refuses a total smaller than one centavo per parcela", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 0.02,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
  });
```
with:
```ts
  it("refuses a total smaller than one centavo per parcela", async () => {
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      amountBrl: 0.02,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_repeat");
  });

  it("refuses a série in a grupo that is not the farm's, and writes nothing", async () => {
    // The farm filter finds no grupo by that id.
    state.selectResults = [[]];
    const result = await new AddSeriesUseCase().run({
      ...ENTRY,
      category: "grp-of-another-farm",
      amountBrl: 1000,
      repeat: { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-10-10" },
    });
    expect(result).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
  });
```

**`lib/api/domains/statements/useCases/__tests__/statements.test.ts`**

Replace:
```ts
  it("turns a saque into a transferência to the other conta", async () => {
```
with:
```ts
  it("refuses to create a lançamento in a grupo that is not the farm's, and leaves the line pending", async () => {
    // The line, then the grupo sent: no grupo of this farm by that id.
    state.selectResults = [[LINE], []];
    const result = await resolveRun({
      type: "create",
      entry: { date: "2026-09-18", category: "grp-of-another-farm", amountBrl: 1 },
    });
    expect(result).toBe("invalid_category");
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("turns a saque into a transferência to the other conta", async () => {
```

**`lib/api/domains/expenses/__tests__/expenses.routes.test.ts`**

Replace:
```ts
/**
 * POST /expenses/:id/split behind the farm macro, with auth and db mocked:
 * - a member who only sees Financeiro cannot parcelar;
 * - another farm's lançamento is a 404;
 * - a refusal is a 400 naming it.
 */
```
with:
```ts
/**
 * The lançamento routes behind the farm macro, with auth and db mocked.
 *
 * POST /expenses/:id/split:
 * - a member who only sees Financeiro cannot parcelar;
 * - another farm's lançamento is a 404;
 * - a refusal is a 400 naming it.
 *
 * POST /expenses takes a farm grupo's id as its category (not just one of the
 * seven built-in keys) and answers 400 naming `invalid_category`.
 */
```

Replace:
```ts
const { state, getSession, split } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  split: vi.fn(),
}));
```
with:
```ts
const { state, getSession, split, add } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  split: vi.fn(),
  add: vi.fn(),
}));
```

Replace:
```ts
vi.mock("@/lib/api/domains/expenses/useCases/Split.useCase", () => ({
  SplitExpenseUseCase: class {
    run = split;
  },
}));
```
with:
```ts
vi.mock("@/lib/api/domains/expenses/useCases/Split.useCase", () => ({
  SplitExpenseUseCase: class {
    run = split;
  },
}));
vi.mock("@/lib/api/domains/expenses/useCases/Add.useCase", () => ({
  AddExpenseUseCase: class {
    run = add;
  },
}));
```

Replace:
```ts
  split.mockReset();
});
```
with:
```ts
  split.mockReset();
  add.mockReset();
});
```

Replace (the end of the file):
```ts
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "not_splittable" });
  });
});
```
with:
```ts
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "not_splittable" });
  });
});

describe("POST /expenses", () => {
  it("takes a farm grupo's id as category and answers 400 naming invalid_category", async () => {
    state.membership = [{ role: "member", preset: null, permissions: FULL_PERMISSIONS }];
    add.mockResolvedValueOnce("invalid_category");
    const entry = { date: "2026-09-10", category: "3b1f8c2e-0d4a-4c1e-9a57-6c2d8e4f1a90", amountBrl: 500 };

    const response = await herdApi.handle(
      new Request("http://localhost/api/herd/expenses", {
        method: "POST",
        headers: { "x-farm-id": "7", "content-type": "application/json" },
        body: JSON.stringify(entry),
      })
    );

    // The body passed validation: the use case got the grupo id as sent.
    expect(add).toHaveBeenCalledWith({ farmId: 7, ...entry });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_category" });
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenses/useCases/__tests__/Add.test.ts lib/api/domains/expenses/useCases/__tests__/Update.test.ts lib/api/domains/expenses/useCases/__tests__/AddSeries.test.ts lib/api/domains/statements/useCases/__tests__/statements.test.ts lib/api/domains/expenses/__tests__/expenses.routes.test.ts --exclude '**/worktrees/**'`
Expected: FAIL, for these reasons:
- An unknown or foreign grupo is inserted where the test expects `"invalid_category"`.
- `{ category: "admin" }` alone is saved without checking the conta.
- A receita in a Nutrição conta is accepted.

Exactly 5 failed, 58 passed: Add "refuses a grupo of another farm…" (`'invalid_account'` for `'invalid_category'`) and "keeps a despesa in a conta of its own grupo…", Update "checks a grupo sent alone…" (`null`), AddSeries "refuses a série in a grupo…", statements "refuses to create a lançamento in a grupo…" (`'invalid_bank_account'`). The new `POST /expenses` route test already passes: task 1 widened `ExpenseCategoryModel`, so the body reaches the (mocked) use case and the controller already answers any string result with 400. The earlier tests in those files still pass.

- [ ] **Step 7: Implement**

`lib/api/domains/expenses/schemas/expense.schema.ts` needs nothing: task 1 already replaced the seven-literal `ExpenseCategoryModel` with `t.String({ minLength: 1, maxLength: 64 })`.

**`lib/api/domains/expenses/entryRules.ts`**: replace the whole file with:

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
 * - expense, revenue: as sent. The grupo is a built-in key or one of the
 *   farm's grupos (isFarmCategory). A conta, when given, is of this farm and
 *   agrees with the grupo: a despesa's conta sits in the despesa's grupo, a
 *   receita's in Receitas.
 */
import { and, eq } from "drizzle-orm";

import { accounts } from "@/lib/db/schema";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
import { isCapitalKind } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { EntryFlow, EntryKind, ExpenseCategory } from "@/lib/types";

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
 * `invalid_category`: a despesa or receita whose grupo is neither a built-in
 * one nor one of this farm's (archived ones count).
 *
 * `invalid_account`: a capital lançamento without a conta of its group on
 * this farm; a despesa in a conta of another grupo, a receita in a conta
 * outside Receitas, or either in a conta of another farm; a rendimento with a
 * conta do plano.
 *
 * `invalid_bank_account`: a rendimento without its aplicação.
 *
 * One select for a grupo of the farm (none for a built-in key), and one for
 * the conta do plano when it is sent.
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
      category: "other",
      dueDate: null,
      paidAt: entry.date,
      accountId: null,
      lotId: null,
    };
  }
  const capital = isCapitalKind(entry.kind);
  if (capital && accountId === null) return "invalid_account";
  // A capital lançamento stores "other"; a despesa or receita stores the grupo it sent.
  if (!capital && !(await isFarmCategory(repo, farmId, entry.category))) return "invalid_category";
  if (accountId !== null) {
    const [account] = await repo
      .select({ group: accounts.group })
      .from(accounts)
      .where(and(eq(accounts.farmId, farmId), eq(accounts.id, accountId)))
      .limit(1);
    // The conta's grupo is the lançamento's: its own group for a capital kind, Receitas for a receita, the grupo sent for a despesa.
    const group = capital ? entry.kind : entry.kind === "revenue" ? "revenue" : entry.category;
    if (account?.group !== group) return "invalid_account";
  }
  const common = { dueDate: entry.dueDate ?? null, paidAt: entry.paidAt ?? null, accountId };
  return capital
    ? { kind: entry.kind, flow: entry.flow ?? "out", category: "other", lotId: null, ...common }
    : { kind: entry.kind, flow: null, category: entry.category, lotId: entry.lotId ?? null, ...common };
}
```

**`lib/api/domains/expenses/useCases/Add.useCase.ts`**

Replace:
```ts
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_account`: the conta do plano does not fit the kind (see normaliseEntry).
```
with:
```ts
 * - `due_before_date`: the vencimento is earlier than the data.
 * - `invalid_category`: the grupo is neither a built-in one nor one of this farm's.
 * - `invalid_account`: the conta do plano does not fit the kind or the grupo (see normaliseEntry).
```

Replace:
```ts
type AddExpenseUseCaseResponse = Expense | "due_before_date" | "invalid_account" | "invalid_bank_account";
```
with:
```ts
type AddExpenseUseCaseResponse =
  | Expense
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account";
```

**`lib/api/domains/expenses/useCases/AddSeries.useCase.ts`**

Replace:
```ts
 * - `invalid_account` and `invalid_bank_account`: as for one lançamento
 *   (normaliseEntry, isPayingAccount).
```
with:
```ts
 * - `invalid_category`, `invalid_account` and `invalid_bank_account`: as for
 *   one lançamento (normaliseEntry, isPayingAccount).
```

Replace:
```ts
  | "starts_too_old"
  | "invalid_account"
```
with:
```ts
  | "starts_too_old"
  | "invalid_category"
  | "invalid_account"
```

**`lib/api/domains/expenses/useCases/Update.useCase.ts`**

Replace:
```ts
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account"
  | null;
```
with:
```ts
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account"
  | null;
```

Replace:
```ts
 * - what the kind needs and stores (normaliseEntry), when the kind, the
 *   movimento or the conta do plano changes, or when the row is fora do
 *   resultado;
```
with:
```ts
 * - what the kind needs and stores (normaliseEntry), when the kind, the
 *   movimento, the grupo or the conta do plano changes, or when the row is
 *   fora do resultado;
```

Replace:
```ts
      // A despesa or receita that keeps its kind and conta keeps its shape: no query for the conta.
      const reshaped =
        patch.kind !== undefined ||
        patch.flow !== undefined ||
        patch.accountId !== undefined ||
        (kind !== "expense" && kind !== "revenue");
```
with:
```ts
      // A despesa or receita that keeps its kind, grupo and conta keeps its shape: no query. So a row whose
      // conta disagrees with its grupo from before that rule still takes "Marcar como pago".
      const reshaped =
        patch.kind !== undefined ||
        patch.flow !== undefined ||
        patch.category !== undefined ||
        patch.accountId !== undefined ||
        (kind !== "expense" && kind !== "revenue");
```

**`lib/api/domains/expenses/useCases/UpdateSeries.useCase.ts`**

Replace:
```ts
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account"
  | null;
```
with:
```ts
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account"
  | null;
```

**`lib/api/domains/statements/useCases/ResolveLine.useCase.ts`**

Replace:
```ts
 * than the line; `due_before_date`, `invalid_account` and
 * `invalid_bank_account`: the lançamento "Criar lançamento" sent.
```
with:
```ts
 * than the line; `due_before_date`, `invalid_category`, `invalid_account`
 * and `invalid_bank_account`: the lançamento "Criar lançamento" sent.
```

Replace:
```ts
  | "due_before_date"
  | "invalid_account"
  | "invalid_bank_account";
```
with:
```ts
  | "due_before_date"
  | "invalid_category"
  | "invalid_account"
  | "invalid_bank_account";
```

**`lib/api/domains/statements/statements.controller.ts`**

Replace:
```ts
  invalid_bank_account: 400,
  invalid_account: 400,
};
```
with:
```ts
  invalid_bank_account: 400,
  invalid_account: 400,
  invalid_category: 400,
};
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts lib/api/domains/expenses lib/api/domains/statements --exclude '**/worktrees/**'`
Expected: PASS (13 files, 104 tests). That covers every expenses use-case test (Add, AddSeries, Delete, Get, PaidBy, Split, TopUpSeries, Update, UpdateSeries), the expenses routes test, and both statements tests.

The existing tests needed no change of fixture, which was checked case by case:
- Every despesa that has a conta already uses a conta of its own grupo (`Add.test` "writes every new column" queues `{ group: "nutrition" }` with `category: "nutrition"`).
- The other cases are capital kinds, have no conta, or already expect `invalid_account`.
- The built-in keys add no select, so every queued `selectResults` and `wheres` index stays where it was.

---

#### Cycle 3: conta and orçamento

- [ ] **Step 9: Write the failing tests**

**`lib/api/domains/accounts/useCases/__tests__/Add.test.ts`**

Replace (the end of the file):
```ts
    ).toBe("invalid_opening");
    expect(state.inserts).toEqual([]);
  });
});
```
with:
```ts
    ).toBe("invalid_opening");
    expect(state.inserts).toEqual([]);
  });

  it("creates a conta in a grupo of the farm, and refuses a grupo that is not this farm's", async () => {
    // The grupo (one of this farm's), then the name clash (none).
    state.selectResults = [[{ id: "grp-maq" }], []];

    const result = await new AddAccountUseCase().run({ farmId: 7, group: "grp-maq", name: "Trator" });

    expect(new PgDialect().sqlToQuery(state.wheres[0] as SQL).params).toEqual([7, "grp-maq"]);
    expect(result).toMatchObject({ group: "grp-maq", name: "Trator" });

    // Another farm's grupo, an unknown key, the tree's Despesas node: no grupo of this farm by that id.
    for (const group of ["grp-of-another-farm", "fuel", "expenses"]) {
      state.selectResults = [[]];
      expect(await new AddAccountUseCase().run({ farmId: 7, group, name: "Trator" })).toBe("invalid_category");
    }
    expect(state.inserts).toHaveLength(1);
  });
});
```

**`lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts`**

Replace:
```ts
  it("refuses 11 or 13 months before reading anything", async () => {
```
with:
```ts
  it("saves a farm grupo's line and refuses a grupo that is not this farm's", async () => {
    // The grupo (one of this farm's), then the farm's start month.
    state.selectResults = [[{ id: "grp-maq" }], [{ startMonth: 10 }]];
    await put({ category: "grp-maq" });
    expect(renderSql(state.wheres[0] as SQL).params).toEqual([7, "grp-maq"]);
    expect(inserted()[0]).toMatchObject({ category: "grp-maq", accountId: null });

    state.inserts = [];
    state.deletes = 0;
    // No grupo of this farm by that id.
    state.selectResults = [[]];
    expect(await put({ category: "grp-of-another-farm" })).toBe("invalid_category");
    expect(state.deletes).toBe(0);
    expect(state.inserts).toEqual([]);
  });

  it("refuses 11 or 13 months before reading anything", async () => {
```

- [ ] **Step 10: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run lib/api/domains/accounts/useCases/__tests__/Add.test.ts lib/api/domains/budgets/useCases/__tests__/PutBudgetLine.test.ts --exclude '**/worktrees/**'`
Expected: FAIL. `AddAccount` creates the conta in any grupo, and its first `where` is the name clash, not the grupo. `PutBudgetLine` saves `grp-of-another-farm` instead of answering `"invalid_category"`.

- [ ] **Step 11: Implement**

**`lib/api/domains/accounts/schemas/account.schema.ts`**

Replace:
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
```
with:
```ts
/** Request schemas for the plano de contas: farm-named contas inside its grupos. */

import { t } from "elysia";

import { DateString } from "@/lib/api/schemas/shared.schema";

/**
 * Grupo of a conta: "revenue" (Receitas), one of the three fora do resultado,
 * or a despesa grupo (a built-in key or the id of one of the farm's grupos).
 * AddAccount answers 400 `invalid_category` for anything else.
 */
export const AccountGroupModel = t.String({ minLength: 1, maxLength: 64 });
```

**`lib/api/domains/accounts/useCases/Add.useCase.ts`**

Replace:
```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
```
with:
```ts
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
```

Replace:
```ts
 *   reverse), or on a grupo that is not financiamento.
 */
type AddAccountUseCaseResponse = Account | "duplicate" | "invalid_opening";
```
with:
```ts
 *   reverse), or on a grupo that is not financiamento.
 * - `invalid_category`: the grupo is not Receitas, one fora do resultado, a
 *   built-in despesa grupo or one of this farm's.
 */
type AddAccountUseCaseResponse = Account | "duplicate" | "invalid_opening" | "invalid_category";
```

Replace:
```ts
    if (!validOpening(group, openingBalanceBrl, openingDate)) return "invalid_opening";
    const trimmed = name.trim();
```
with:
```ts
    if (!validOpening(group, openingBalanceBrl, openingDate)) return "invalid_opening";
    // Receitas and the three fora do resultado are fixed keys; any other grupo is a despesa grupo of this farm.
    const fixed = group === "revenue" || (CAPITAL_GROUPS as readonly string[]).includes(group);
    if (!fixed && !(await isFarmCategory(this.repository, farmId, group))) return "invalid_category";
    const trimmed = name.trim();
```

**`lib/api/domains/accounts/accounts.controller.ts`**

Replace:
```ts
 * Plano de contas: farm-named contas inside the fixed grupos — Receitas, the
 * seven despesa grupos, and the three fora do resultado (investimentos,
 * financiamentos, sócios).
```
with:
```ts
 * Plano de contas: farm-named contas inside the grupos — Receitas, the seven
 * despesa grupos and the farm's own, and the three fora do resultado
 * (investimentos, financiamentos, sócios).
```

Replace:
```ts
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      if (result === "invalid_opening") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewAccountBody }
```
with:
```ts
      if (result === "duplicate") return status(409, { error: "duplicate_name" });
      if (result === "invalid_opening" || result === "invalid_category") return status(400, { error: result });
      return result;
    },
    { farm: true, body: NewAccountBody }
```

**`lib/api/domains/budgets/useCases/PutBudgetLine.useCase.ts`**

Replace:
```ts
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";
```
with:
```ts
import { lineRows, lineWhere, safraStartMonth } from "@/lib/api/domains/budgets/budgetLine";
import { isFarmCategory } from "@/lib/api/domains/expenseGroups/farmCategory";
```

Replace:
```ts
 * - `months_mismatch`: not twelve months.
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
```
with:
```ts
 * - `months_mismatch`: not twelve months.
 * - `invalid_category`: the grupo is neither a built-in one nor one of this farm's.
 * - `invalid_account`: the conta is not of this farm, or not of this grupo.
```

Replace:
```ts
type PutBudgetLineUseCaseResponse = Budget[] | "months_mismatch" | "invalid_account" | "start_month_changed";
```
with:
```ts
type PutBudgetLineUseCaseResponse =
  | Budget[]
  | "months_mismatch"
  | "invalid_category"
  | "invalid_account"
  | "start_month_changed";
```

Replace:
```ts
    if (months.length !== 12) return "months_mismatch";
```
with:
```ts
    if (months.length !== 12) return "months_mismatch";
    if (!(await isFarmCategory(this.repository, farmId, key.category))) return "invalid_category";
```

The budgets controller already answers any string but `start_month_changed` with 400, so no edit is needed there.

- [ ] **Step 12: Run the tests**

Run: `./node_modules/.bin/vitest run lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts lib/api/domains/expenses lib/api/domains/statements lib/api/domains/accounts lib/api/domains/budgets lib/api/domains/semen --exclude '**/worktrees/**'`
Expected: PASS (27 files, 171 tests). `accounts/useCases/__tests__/{Add,Delete,SeedDefaults,Update}` and `budgets/**` pass. `semen` is included because AddPurchase goes through `AddExpenseUseCase`.

---

- [ ] **Step 13: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "lib/api/domains/(expenses|statements|accounts|budgets|semen)/|lib/api/domains/expenseGroups/(farmCategory|__tests__/farmCategory)"`
Expected: no output. This task's files are clean.

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean (task 1's deprecated `EXPENSE_CATEGORY_LABEL` alias keeps every reader compiling, and task 2 compiles on its own). If task 4 runs in the same tree at the same time, any error left is in a file task 4 owns (planTree/ledger/budget/components), never in this task's files.

Run: `./node_modules/.bin/eslint lib/api/domains/expenseGroups/farmCategory.ts lib/api/domains/expenseGroups/__tests__/farmCategory.test.ts lib/api/domains/expenses lib/api/domains/statements lib/api/domains/accounts lib/api/domains/budgets`
Expected: clean.

### Task 4: Domain + label readers

Every reader of a grupo now goes through `groups.ts` (task 1): labels through
`groupLabel(key, expenseGroups)`, despesa lists through `despesaGroups(...)`.
`EXPENSE_GROUPS`, `ACCOUNT_GROUP_LABEL`, `ACCOUNT_GROUPS` (accounts.ts) and the
deprecated `EXPENSE_CATEGORY_LABEL` alias (labels.ts) are deleted, so `tsc`
names any reader that was missed. `LedgerInputs` (so `PlanInputs`) and
`BudgetInputs` gain `expenseGroups`.

Order of the cycles matters: the three constants stay in accounts.ts until the
last cycle, so the domain tests of each cycle fail for the reason they name
rather than because a sibling module lost an import. `tsc` is only clean at
the end (Step 25).

**Files:**
- Modify: `lib/domain/groups.ts` (only `isDespesaGroup` also leaves out `"capital"`, Cycle B2)
- Modify: `lib/domain/accounts.ts`
- Modify: `lib/domain/ledger.ts`
- Modify: `lib/domain/planTree.ts`
- Modify: `lib/domain/budget.ts`
- Modify: `lib/domain/labels.ts` (only the deletion of the alias task 1 left)
- Modify: `lib/export/datasets/finance.ts`
- Modify: `components/reports/datasets.ts` (the one caller of `expensesExportTable`)
- Modify: `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts` (it builds `BudgetInputs`; see the note in Interfaces)
- Modify: `app/(app)/finance/page.tsx`
- Modify: `components/dashboard/FinanceCard.tsx`
- Modify: `components/finance/CostBreakdownCard.tsx`
- Modify: `components/finance/BillsCard.tsx`
- Modify: `components/finance/SeriesScopeDialog.tsx`
- Modify: `components/finance/contas/AccountMovements.tsx`
- Modify: `components/finance/contas/ConciliarPage.tsx`
- Modify: `components/finance/lancamentos/LancamentosPage.tsx`
- Modify: `components/finance/orcamento/OrcamentoPage.tsx`
- Modify: `components/finance/orcamento/BudgetEditDialog.tsx`
- Modify (smallest edit, task 5 reworks them): `components/finance/plano/AccountsPage.tsx`, `components/finance/plano/NewAccountDialog.tsx`, `components/finance/EntryDialog.tsx`
- Test: `lib/domain/__tests__/groups.test.ts` (one case, Cycle B2)
- Test: `lib/domain/__tests__/accounts.test.ts`
- Test: `lib/domain/__tests__/ledger.test.ts`
- Test: `lib/domain/__tests__/planTree.test.ts`
- Test: `components/finance/lancamentos/__tests__/legacySearch.test.ts`
- Test: `lib/domain/__tests__/budget.test.ts`
- Test: `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`
- Test: `lib/export/__tests__/finance.test.ts`
- No change needed (checked): `components/finance/RecentEntriesCard.tsx` (reads `row.groupLabel`), `components/finance/orcamento/BudgetCards.tsx` and `BudgetTable.tsx` (read `group.label`), `components/finance/orcamento/CopyDialog.tsx` (spreads the page's `inputs`), `components/finance/lancamentos/legacySearch.ts` (only types), `lib/domain/economics.ts`.

**Interfaces:**
- Consumes (task 1, exactly as the contract pins them):
  - `lib/domain/groups.ts`: `BUILTIN_CATEGORIES: readonly BuiltinCategory[]`, `TOP_GROUP_LABEL: Record<"revenue" | CapitalGroup, string>`, `isBuiltinCategory(key: string): key is BuiltinCategory`, `isDespesaGroup(key: string): boolean`, `DespesaGroup { key; label; custom; archived }`, `despesaGroups(groups, opts?: { archived?: boolean; keep?: ExpenseCategory }): DespesaGroup[]`, `groupLabel(key: AccountGroup, groups: readonly ExpenseGroup[]): string` ("Grupo removido" for a key that resolves to nothing).
  - `lib/domain/labels.ts`: `BUILTIN_CATEGORY_LABEL: Record<BuiltinCategory, string>` and the temporary `EXPENSE_CATEGORY_LABEL` alias (deleted here).
  - `lib/types.ts`: `ExpenseGroup { id; name; archivedAt?; createdAt }`, `ExpenseCategory = string`, `AccountGroup = string`, `HerdData.expenseGroups?: ExpenseGroup[]`.
  - Store: `useHerdStore((s) => s.expenseGroups)` (`ExpenseGroup[]`, `[]` by default). This task does not edit `useHerdStore.ts`.
  - `lib/db/schema.ts`: table `expenseGroups` (`farmId`, …); `lib/api/mappers.ts`: `toExpenseGroup(row: ExpenseGroupRow): ExpenseGroup`.
- Produces:
  - `LedgerInputs.expenseGroups: readonly ExpenseGroup[]` (so `PlanInputs` has it too); `BudgetInputs.expenseGroups: readonly ExpenseGroup[]`. Both required.
  - `accountsByGroup(accounts, includeArchived = false): Record<AccountGroup, Account[]>`: `"revenue"`, the seven built-ins and the three `CAPITAL_GROUPS` are always keys (maybe empty); a farm grupo is a key only once it has a conta to show. Callers read `byGroup[key] ?? []`.
  - `expensesExportTable(expenses, title = "Despesas", expenseGroups: readonly ExpenseGroup[] = [])`.
  - `nodeParam`/`parseNode`: `grupo:<key>` for any key `isDespesaGroup` accepts (a farm grupo's uuid included); `legacyNode` still takes only the seven built-in keys.
  - `planTree`: Despesas children = the seven, then the farm's (by `createdAt`), an archived farm grupo only while it has a line in the window (`archived: true` on its `TreeItem`), then a "Grupo removido" child per key with lines in the window that names no grupo. The children add up to the Despesas figure.
  - `nodeSummary` of a grupo key that names no grupo: crumb "Despesas", title "Grupo removido" (an empty pane when it has no lines).
  - `budgetView`: grupos in `despesaGroups(expenseGroups, { archived: true })` order, label from it, same "left out with neither orçado nor despesas" rule.
  - `copyPlan`: an archived farm grupo's lines (grupo and contas) are never copied into the next safra (the archive dialog says the grupo and its contas "saem … do Orçamento da próxima safra"); they do not count in `skipped`.
  - Removed: `EXPENSE_GROUPS`, `ACCOUNT_GROUP_LABEL`, `ACCOUNT_GROUPS` (accounts.ts), `EXPENSE_CATEGORY_LABEL` (labels.ts).
  - Ownership note: `CopyBudgets.useCase.ts` and its test sit under task 3's `lib/api/domains/budgets/**`, but they build `BudgetInputs` and break `tsc` the moment `expenseGroups` becomes required. Without loading the farm's grupos the server copy would silently drop every farm grupo's line, so this task edits them. Task 3's contract scope in budgets is `PutBudgetLine`; if task 3 edits these two files after all, move these blocks there.

---

#### Cycle A: `accountsByGroup` takes farm grupos

- [ ] **Step 1: Write the failing test**

`lib/domain/__tests__/accounts.test.ts` — the order and label tests of the deleted constants move to `groups.test.ts` (task 1).

**Replace** in `lib/domain/__tests__/accounts.test.ts`:
```ts
import {
  ACCOUNT_GROUP_LABEL,
  ACCOUNT_GROUPS,
  accountName,
  accountsByGroup,
  counterpartySuggestions,
  DEFAULT_ACCOUNTS,
  EXPENSE_GROUPS,
  missingDefaults,
} from "@/lib/domain/accounts";
import type { Account, Expense } from "@/lib/types";
```
with:
```ts
import {
  accountName,
  accountsByGroup,
  counterpartySuggestions,
  DEFAULT_ACCOUNTS,
  missingDefaults,
} from "@/lib/domain/accounts";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
import type { Account, Expense } from "@/lib/types";
```

**Replace** in `lib/domain/__tests__/accounts.test.ts` (the two describes of the deleted constants go):
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

describe("DEFAULT_ACCOUNTS", () => {
```
with:
```ts
describe("DEFAULT_ACCOUNTS", () => {
```

**Replace** in `lib/domain/__tests__/accounts.test.ts`:
```ts
  it("has every grupo, empty ones included", () => {
    const byGroup = accountsByGroup(accounts);
    expect(Object.keys(byGroup).sort()).toEqual([...ACCOUNT_GROUPS].sort());
    expect(byGroup.labor).toEqual([]);
    expect(byGroup.financing).toEqual([]);
  });
```
with:
```ts
  it("has Receitas, the seven built-in grupos and the three outside the resultado, empty ones included", () => {
    const byGroup = accountsByGroup(accounts);
    expect(Object.keys(byGroup).sort()).toEqual(["revenue", ...BUILTIN_CATEGORIES, ...CAPITAL_GROUPS].sort());
    expect(byGroup.labor).toEqual([]);
    expect(byGroup.financing).toEqual([]);
  });

  it("adds a farm grupo once it has a conta to show", () => {
    const farm = [
      ...accounts,
      account({ id: "a-6", group: "g-maq", name: "Pneus", archivedAt: "2026-05-01T00:00:00.000Z" }),
      account({ id: "a-7", group: "g-maq", name: "Diesel" }),
    ];
    expect(accountsByGroup(farm)["g-maq"].map((a) => a.id)).toEqual(["a-7"]);
    expect(accountsByGroup(farm, true)["g-maq"].map((a) => a.id)).toEqual(["a-7", "a-6"]);
    expect(accountsByGroup(accounts)["g-maq"]).toBeUndefined();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — "adds a farm grupo once it has a conta to show" throws `TypeError: Cannot read properties of undefined (reading 'push')` (the old `accountsByGroup` only knows the eleven fixed grupos).

- [ ] **Step 3: Implement**

The three constants stay for now (Cycle F deletes them).

**Replace** in `lib/domain/accounts.ts`:
```ts
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
```
with:
```ts
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
```

**Replace** in `lib/domain/accounts.ts`:
```ts
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
```
with:
```ts
/**
 * Contas per grupo, sorted by name; archived ones only when asked. Receitas,
 * the seven built-in grupos and the three outside the resultado are always
 * there (maybe empty); a farm grupo only once it has a conta, so read
 * `byGroup[key] ?? []`.
 */
export function accountsByGroup(
  accounts: Account[],
  includeArchived = false
): Record<AccountGroup, Account[]> {
  const byGroup: Record<AccountGroup, Account[]> = Object.fromEntries(
    ["revenue", ...BUILTIN_CATEGORIES, ...CAPITAL_GROUPS].map((g): [string, Account[]] => [g, []])
  );
  for (const a of accounts) {
    if (includeArchived || a.archivedAt === undefined) (byGroup[a.group] ??= []).push(a);
  }
  for (const list of Object.values(byGroup)) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return byGroup;
}
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle B: the ledger names a farm grupo

- [ ] **Step 5: Write the failing test**

**Replace** in `lib/domain/__tests__/ledger.test.ts`:
```ts
import type { Account, Expense, Lot, Movement } from "@/lib/types";
```
with:
```ts
import type { Account, Expense, ExpenseGroup, Lot, Movement } from "@/lib/types";
```

**Replace** in `lib/domain/__tests__/ledger.test.ts`:
```ts
  treatments,
  lots,
};

const rows = ledgerRows(input, PERIOD, TODAY);
```
with:
```ts
  treatments,
  lots,
  expenseGroups: [],
};

const rows = ledgerRows(input, PERIOD, TODAY);
```

**Replace** in `lib/domain/__tests__/ledger.test.ts`:
```ts
describe("cashSummary", () => {
```
with:
```ts
describe("ledgerRows with the farm's grupos", () => {
  it("names a farm grupo, archived or not, and reads Grupo removido for a grupo that is gone", () => {
    const groups: ExpenseGroup[] = [
      { id: "g-maq", name: "Máquinas e veículos", archivedAt: "2026-09-15T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z" },
    ];
    const farmRows = ledgerRows(
      {
        ...input,
        expenseGroups: groups,
        expenses: [expense({ id: "e-maq", category: "g-maq" }), expense({ id: "e-gone", category: "g-gone" })],
      },
      PERIOD,
      TODAY
    );
    expect(farmRows.filter((r) => r.kind === "expense").map((r) => [r.id, r.group, r.groupLabel])).toEqual([
      ["e-gone", "g-gone", "Grupo removido"],
      ["e-maq", "g-maq", "Máquinas e veículos"],
    ]);
  });
});

describe("cashSummary", () => {
```

- [ ] **Step 6: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/ledger.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — "names a farm grupo…": `groupLabel` is `undefined` for `g-maq` and `g-gone` (`ACCOUNT_GROUP_LABEL` only has the fixed keys).

- [ ] **Step 7: Implement**

**Replace** in `lib/domain/ledger.ts`:
```ts
  Expense,
  Lot,
  ManejoSession,
```
with:
```ts
  Expense,
  ExpenseGroup,
  Lot,
  ManejoSession,
```

**Replace** in `lib/domain/ledger.ts`:
```ts
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
```
with:
```ts
import { accountName } from "@/lib/domain/accounts";
import { TOP_GROUP_LABEL, groupLabel } from "@/lib/domain/groups";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
```

**Replace** in `lib/domain/ledger.ts`:
```ts
  treatments: Treatment[];
  lots: Lot[];
}
```
with:
```ts
  treatments: Treatment[];
  lots: Lot[];
  /** The farm's grupos de despesa, archived ones included: they name the rows. */
  expenseGroups: readonly ExpenseGroup[];
}
```

**Replace** in `lib/domain/ledger.ts`:
```ts
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : ACCOUNT_GROUP_LABEL[group],
```
with:
```ts
      groupLabel: group === null ? ENTRY_KIND_LABEL.yield : groupLabel(group, input.expenseGroups),
```

**Replace** in `lib/domain/ledger.ts`:
```ts
      groupLabel: sale ? ACCOUNT_GROUP_LABEL.revenue : ACCOUNT_GROUP_LABEL.investment,
```
with:
```ts
      groupLabel: sale ? TOP_GROUP_LABEL.revenue : TOP_GROUP_LABEL.investment,
```

**Replace** in `lib/domain/ledger.ts`:
```ts
      groupLabel: ACCOUNT_GROUP_LABEL.health,
```
with:
```ts
      groupLabel: BUILTIN_CATEGORY_LABEL.health,
```

- [ ] **Step 8: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/ledger.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle B2: `isDespesaGroup` leaves out the ledger's "capital"

A `LedgerRow.group` is `"capital"` for a compra de gado (and a rendimento);
`legacyNode` maps `grupo=capital` to Compras de gado. A farm grupo's key is a
uuid, so leaving `"capital"` out of the despesa grupos clashes with nothing.
`lib/domain/groups.ts` is task 1's file; this one-line change is this task's.

- [ ] **Step 9: Write the failing test**

**Replace** in `lib/domain/__tests__/groups.test.ts`:
```ts
  it("leaves out Receitas, the three outside the resultado and the tree's Despesas", () => {
    for (const key of ["revenue", "investment", "financing", "partners", "expenses"]) {
```
with:
```ts
  it("leaves out Receitas, the three outside the resultado, the tree's Despesas and the ledger's capital", () => {
    for (const key of ["revenue", "investment", "financing", "partners", "expenses", "capital"]) {
```

- [ ] **Step 10: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — "leaves out Receitas, …": `expected true to be false` for `"capital"`.

- [ ] **Step 11: Implement**

**Replace** in `lib/domain/groups.ts`:
```ts
/** A grupo of Despesas: anything but "revenue", a CapitalGroup or the tree's "expenses". */
export function isDespesaGroup(key: string): boolean {
  return key !== "revenue" && key !== "expenses" && !(CAPITAL_GROUPS as readonly string[]).includes(key);
}
```
with:
```ts
/**
 * A grupo of Despesas: anything but "revenue", a CapitalGroup, the tree's
 * "expenses" or the ledger's "capital" (a compra de gado). A farm grupo's key
 * is a uuid, so it never clashes with these.
 */
export function isDespesaGroup(key: string): boolean {
  return (
    key !== "revenue" && key !== "expenses" && key !== "capital" && !(CAPITAL_GROUPS as readonly string[]).includes(key)
  );
}
```

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/groups.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle C: Lançamentos (tree, nós, panes) with farm grupos

- [ ] **Step 12: Write the failing test**

**Replace** in `lib/domain/__tests__/planTree.test.ts`:
```ts
import type { Account, BankAccount, Expense, Movement, Transfer } from "@/lib/types";
import { EXPENSE_GROUPS } from "@/lib/domain/accounts";
import { formatCurrency } from "@/lib/domain/format";
```
with:
```ts
import type { Account, BankAccount, Expense, ExpenseGroup, Movement, Transfer } from "@/lib/types";
import { formatCurrency } from "@/lib/domain/format";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
```

**Replace** in `lib/domain/__tests__/planTree.test.ts`:
```ts
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
};
```
with:
```ts
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
  expenseGroups: [],
};
```

**Replace** in `lib/domain/__tests__/planTree.test.ts`:
```ts
    const grupos: PlanNode[] = EXPENSE_GROUPS.map((group) => ({ type: "group", group }));
```
with:
```ts
    const grupos: PlanNode[] = BUILTIN_CATEGORIES.map((group) => ({ type: "group", group }));
```

An unknown grupo key now parses (it opens "Grupo removido"), so `grupo:nope` leaves the null list; the top groups' own keys stay out of `grupo:`.

**Replace** in `lib/domain/__tests__/planTree.test.ts`:
```ts
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "grupo:nope", "grupo:revenue"]) {
```
with:
```ts
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "grupo:revenue", "grupo:expenses", "grupo:investment"]) {
```

**Replace** in `lib/domain/__tests__/planTree.test.ts`:
```ts
    expect(grupos.map((i) => i.key)).toEqual(EXPENSE_GROUPS.map((c) => `grupo:${c}`));
```
with:
```ts
    expect(grupos.map((i) => i.key)).toEqual(BUILTIN_CATEGORIES.map((c) => `grupo:${c}`));
```

**Append** to the end of `lib/domain/__tests__/planTree.test.ts`:
```ts

describe("the farm's grupos de despesa", () => {
  const MAQ = "6f1c2b8e-4a3d-4e5f-9b7a-1c2d3e4f5a6b";
  const ARRENDAMENTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const VELHO = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
  const groups: ExpenseGroup[] = [
    { id: MAQ, name: "Máquinas e veículos", createdAt: "2026-08-01T12:00:00.000Z" },
    { id: ARRENDAMENTO, name: "Arrendamento", archivedAt: "2026-09-20T00:00:00.000Z", createdAt: "2026-07-01T12:00:00.000Z" },
    { id: VELHO, name: "Grupo velho", archivedAt: "2026-05-01T00:00:00.000Z", createdAt: "2026-01-01T12:00:00.000Z" },
  ];
  const farm: PlanInputs = {
    ...inputs,
    expenseGroups: groups,
    accounts: [...accounts, { id: "maq-diesel", group: MAQ, name: "Diesel" }],
    expenses: [
      ...expenses,
      entry("g-diesel", { category: MAQ, accountId: "maq-diesel", date: "2026-09-02", amountBrl: 700, paidAt: "2026-09-02", bankAccountId: "caixa" }),
      entry("g-arrend", { category: ARRENDAMENTO, date: "2026-08-10", amountBrl: 3000 }),
      // Its grupo is gone (an old snapshot): it still reads, as "Grupo removido".
      entry("g-gone", { category: "grupo-apagado", date: "2026-09-03", amountBrl: 50 }),
    ],
  };
  const despesas = (period = PERIOD) => planTree(farm, period, TODAY).find((i) => i.key === "despesas")!;

  it("writes and reads a farm grupo by its id, and any other key as a grupo", () => {
    const node: PlanNode = { type: "group", group: MAQ };
    expect(nodeParam(node)).toBe(`grupo:${MAQ}`);
    expect(parseNode(`grupo:${MAQ}`)).toEqual(node);
    expect(parseNode("grupo:grupo-apagado")).toEqual({ type: "group", group: "grupo-apagado" });
    // The old Extrato only knew the seven.
    expect(legacyNode({ grupo: MAQ })).toBeNull();
  });

  it("lists them after the seven, an archived one only while it has a line in the window, a removed one last", () => {
    const tree = despesas();
    expect(tree.children?.slice(7).map((i) => [i.key, i.label, i.amountBrl, i.archived])).toEqual([
      [`grupo:${ARRENDAMENTO}`, "Arrendamento", 3000, true],
      [`grupo:${MAQ}`, "Máquinas e veículos", 700, false],
      ["grupo:grupo-apagado", "Grupo removido", 50, false],
    ]);
    expect(tree.children?.reduce((sum, i) => sum + i.amountBrl, 0)).toBe(tree.amountBrl);
    expect(tree.children?.find((i) => i.key === `grupo:${MAQ}`)?.children?.map((i) => [i.label, i.amountBrl])).toEqual([
      ["Diesel", 700],
    ]);
    // In September Arrendamento has no line: it leaves the tree.
    expect(despesas({ start: "2026-09-01", end: "2026-09-30" }).children?.slice(7).map((i) => i.label)).toEqual([
      "Máquinas e veículos",
      "Grupo removido",
    ]);
  });

  it("titles a farm grupo by its name, a removed one Grupo removido, and puts its contas under it", () => {
    const summary = (node: PlanNode) => nodeSummary(node, farm, PERIOD, TODAY);
    expect(summary({ type: "group", group: MAQ })).toMatchObject({
      crumb: "Despesas",
      title: "Máquinas e veículos",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(summary({ type: "account", id: "maq-diesel" })).toMatchObject({ crumb: "Despesas › Máquinas e veículos", title: "Diesel" });
    expect(summary({ type: "group", group: "grupo-apagado" })).toMatchObject({ crumb: "Despesas", title: "Grupo removido" });
    expect(nodeRows({ type: "group", group: "grupo-apagado" }, farm, PERIOD, TODAY).map((r) => [r.id, r.history])).toEqual([
      ["g-gone", "Grupo removido"],
    ]);
    // A key no line ever had: an empty pane, still titled.
    expect(nodeRows({ type: "group", group: "nunca" }, farm, PERIOD, TODAY)).toEqual([]);
    expect(summary({ type: "group", group: "nunca" })?.title).toBe("Grupo removido");
    expect(nodeRows({ type: "bank", id: "caixa" }, farm, PERIOD, TODAY).find((r) => r.id === "g-diesel")).toMatchObject({
      contra: "Diesel",
      contraGroup: "Despesas › Máquinas e veículos",
    });
  });

  it("starts Novo as a despesa of the farm grupo", () => {
    expect(entryInitialFor({ type: "group", group: MAQ }, farm.accounts)).toEqual({ kind: "expense", category: MAQ });
    expect(entryInitialFor({ type: "account", id: "maq-diesel" }, farm.accounts)).toEqual({
      kind: "expense",
      category: MAQ,
      accountId: "maq-diesel",
    });
  });
});
```

`components/finance/lancamentos/__tests__/legacySearch.test.ts`:

**Replace** in `components/finance/lancamentos/__tests__/legacySearch.test.ts`:
```ts
  bankAccounts: [],
  transfers: [],
};
```
with:
```ts
  bankAccounts: [],
  transfers: [],
  expenseGroups: [],
};
```

**Replace** in `components/finance/lancamentos/__tests__/legacySearch.test.ts`:
```ts
    for (const param of [null, "", "nope", "banco:", "grupo:nope", "conta:deleted"]) {
```
with:
```ts
    for (const param of [null, "", "nope", "banco:", "grupo:revenue", "conta:deleted"]) {
```

**Replace** in `components/finance/lancamentos/__tests__/legacySearch.test.ts`:
```ts
    expect(conta.summary.title).toBe("Sal mineral");
  });
```
with:
```ts
    expect(conta.summary.title).toBe("Sal mineral");
  });

  it("opens a grupo key that names no grupo as an empty Grupo removido", () => {
    const gone = resolveNode("grupo:nope", inputs, period, TODAY);
    expect(gone.picked).toEqual({ type: "group", group: "nope" });
    expect(gone.summary).toMatchObject({ crumb: "Despesas", title: "Grupo removido" });
  });
```

- [ ] **Step 13: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/planTree.test.ts components/finance/lancamentos/__tests__/legacySearch.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `parseNode("grupo:<uuid>")` is null, the Despesas children stop at the seven, and `resolveNode("grupo:nope")` falls back to todos.

- [ ] **Step 14: Implement**

Note: a `LedgerRow.group` is never fed to `isDespesaGroup` (a receita's conta grupo is "revenue", a rendimento's "capital"): a row sits in a grupo de despesa when it is `inCoe` (a despesa or a treatment).

**Replace** in `lib/domain/planTree.ts`:
```ts
  Expense,
  ExpenseCategory,
  Transfer,
} from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  Transfer,
} from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
```

**Replace** in `lib/domain/planTree.ts`:
```ts
import { isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
```
with:
```ts
import { isInflow } from "@/lib/domain/entries";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { TOP_GROUP_LABEL, despesaGroups, groupLabel, isBuiltinCategory, isDespesaGroup } from "@/lib/domain/groups";
```

**Replace** in `lib/domain/planTree.ts`:
```ts
const isCategory = (value: string): value is ExpenseCategory =>
  (EXPENSE_GROUPS as readonly string[]).includes(value);

/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<category> · conta:<id> · compra-de-gado · venda-de-gado. */
```
with:
```ts
/** URL value of `conta`: todos · bancos · banco:<id> · investimentos · financiamentos · socios ·
 *  despesas · receitas · grupo:<key> (a built-in grupo or the id of a farm's) · conta:<id> ·
 *  compra-de-gado · venda-de-gado. */
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      return isCategory(node.group) ? `grupo:${node.group}` : GROUP_PARAM[node.group];
```
with:
```ts
      return isDespesaGroup(node.group) ? `grupo:${node.group}` : GROUP_PARAM[node.group as TopGroup];
```

**Replace** in `lib/domain/planTree.ts`:
```ts
/** The nó of a `conta` value; null when absent, unknown or malformed. */
```
with:
```ts
/**
 * The nó of a `conta` value; null when absent, unknown or malformed. Any grupo
 * de despesa key reads: one that names no grupo opens as "Grupo removido".
 */
```

**Replace** in `lib/domain/planTree.ts`:
```ts
  return isCategory(value) ? { type: "group", group: value } : null;
```
with:
```ts
  return isDespesaGroup(value) ? { type: "group", group: value } : null;
```

**Replace** in `lib/domain/planTree.ts`:
```ts
  if (grupo && isCategory(grupo)) return { type: "group", group: grupo };
```
with:
```ts
  // The old Extrato only knew the seven built-in grupos.
  if (grupo && isBuiltinCategory(grupo)) return { type: "group", group: grupo };
```

**Replace** in `lib/domain/planTree.ts`:
```ts
  const contas = (group: AccountGroup, amount: (a: Account) => number): TreeItem[] =>
    byGroup[group]
      .filter((a) => a.archivedAt === undefined || withLines.has(a.id))
```
with:
```ts
  const contas = (group: AccountGroup, amount: (a: Account) => number): TreeItem[] =>
    (byGroup[group] ?? [])
      .filter((a) => a.archivedAt === undefined || withLines.has(a.id))
```

**Replace** in `lib/domain/planTree.ts`:
```ts
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);

```
with:
```ts
    .filter((b) => b.archivedAt === undefined || accountMovements(b, inputs, period).length > 0);
  // The grupos de despesa: an archived farm grupo only while it has a line in the window, like an
  // archived conta; a key that names no grupo (a removed one) while its lines are there, as "Grupo removido".
  const coeGroups = new Set(rows.filter(inCoe).map((r) => r.group));
  const grupos = despesaGroups(inputs.expenseGroups, { archived: true }).filter(
    (g) => !g.archived || coeGroups.has(g.key)
  );
  for (const key of coeGroups) {
    if (!grupos.some((g) => g.key === key)) {
      grupos.push({ key, label: groupLabel(key, inputs.expenseGroups), custom: true, archived: false });
    }
  }

```

**Replace** in `lib/domain/planTree.ts`:
```ts
      ACCOUNT_GROUP_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
```
with:
```ts
      TOP_GROUP_LABEL.investment,
      spent(rows, isKind("investment", "purchase")),
```

**Replace** in `lib/domain/planTree.ts`:
```ts
    item({ type: "group", group: "financing" }, ACCOUNT_GROUP_LABEL.financing, sum(live, debt), {
```
with:
```ts
    item({ type: "group", group: "financing" }, TOP_GROUP_LABEL.financing, sum(live, debt), {
```

**Replace** in `lib/domain/planTree.ts`:
```ts
    item({ type: "group", group: "partners" }, ACCOUNT_GROUP_LABEL.partners, spent(rows, isKind("partners")), {
```
with:
```ts
    item({ type: "group", group: "partners" }, TOP_GROUP_LABEL.partners, spent(rows, isKind("partners")), {
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      children: EXPENSE_GROUPS.map((c) =>
        item({ type: "group", group: c }, ACCOUNT_GROUP_LABEL[c], spent(rows, (r) => inCoe(r) && r.group === c), {
          children: contas(c, (a) => spent(rows, of(a.id))),
        })
      ),
```
with:
```ts
      children: grupos.map((g) =>
        item({ type: "group", group: g.key }, g.label, spent(rows, (r) => inCoe(r) && r.group === g.key), {
          archived: g.archived,
          children: contas(g.key, (a) => spent(rows, of(a.id))),
        })
      ),
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      ACCOUNT_GROUP_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
```
with:
```ts
      TOP_GROUP_LABEL.revenue,
      cents(periodRevenue(inputs.expenses, inputs.movements, period).total),
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      return isCategory(node.group) ? inCoe(r) && r.group === node.group : GROUP_KINDS[node.group as TopGroup].includes(r.kind);
```
with:
```ts
      return isDespesaGroup(node.group)
        ? inCoe(r) && r.group === node.group
        : GROUP_KINDS[node.group as TopGroup].includes(r.kind);
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      const group = isCategory(r.group) ? `${EXPENSES} › ${r.groupLabel}` : r.groupLabel;
```
with:
```ts
      // A despesa or a treatment sits in a grupo de despesa.
      const group = inCoe(r) ? `${EXPENSES} › ${r.groupLabel}` : r.groupLabel;
```

**Replace** in `lib/domain/planTree.ts`:
```ts
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
```
with:
```ts
/** Where a nó sits and which strip it shows. */
function placeOf(
  node: PlanNode,
  account: Account | undefined,
  groups: readonly ExpenseGroup[]
): { strip: Strip; crumb: string | null; title: string } {
  if (account) {
    const g = account.group;
    return isDespesaGroup(g)
      ? { strip: "expense", crumb: `${EXPENSES} › ${groupLabel(g, groups)}`, title: account.name }
      : { strip: g as Strip, crumb: groupLabel(g, groups), title: account.name };
  }
  if (node.type === "banks") return { strip: "banks", crumb: null, title: BANKS };
  if (node.type === "auto") {
    return node.which === "purchases"
      ? { strip: "investment", crumb: TOP_GROUP_LABEL.investment, title: PURCHASES }
      : { strip: "revenue", crumb: TOP_GROUP_LABEL.revenue, title: SALES };
  }
  if (node.type === "group") {
    if (node.group === "expenses") return { strip: "expense", crumb: null, title: EXPENSES };
    const title = groupLabel(node.group, groups);
    if (isDespesaGroup(node.group)) return { strip: "expense", crumb: EXPENSES, title };
    return { strip: node.group as Strip, crumb: null, title };
  }
```

**Replace** in `lib/domain/planTree.ts`:
```ts
  const { strip, crumb, title } = placeOf(node, account);
```
with:
```ts
  const { strip, crumb, title } = placeOf(node, account, inputs.expenseGroups);
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      if (isCategory(node.group)) return { kind: "expense", category: node.group };
      return { kind: node.group };
```
with:
```ts
      if (isDespesaGroup(node.group)) return { kind: "expense", category: node.group };
      return { kind: node.group as "revenue" | CapitalGroup };
```

**Replace** in `lib/domain/planTree.ts`:
```ts
      return isCategory(g)
        ? { kind: "expense", category: g, accountId: account.id }
        : { kind: g, accountId: account.id };
```
with:
```ts
      return isDespesaGroup(g)
        ? { kind: "expense", category: g, accountId: account.id }
        : { kind: g as "revenue" | CapitalGroup, accountId: account.id };
```

- [ ] **Step 15: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/planTree.test.ts components/finance/lancamentos/__tests__/legacySearch.test.ts lib/domain/__tests__/ledger.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle D: Orçamento with farm grupos (view, copy, server copy)

- [ ] **Step 16: Write the failing test**

`lib/domain/__tests__/budget.test.ts`:

**Replace** in `lib/domain/__tests__/budget.test.ts`:
```ts
import type { Account, Budget, Expense, ExpenseCategory } from "@/lib/types";
```
with:
```ts
import type { Account, Budget, Expense, ExpenseCategory, ExpenseGroup } from "@/lib/types";
```

**Replace** in `lib/domain/__tests__/budget.test.ts`:
```ts
    makeTreatment({ id: "sem-custo", date: "2025-12-01", status: "done" }),
  ],
};
```
with:
```ts
    makeTreatment({ id: "sem-custo", date: "2025-12-01", status: "done" }),
  ],
  expenseGroups: [],
};
```

Every inline `BudgetInputs` gets `expenseGroups: []` too. Three are on one line: replace each of the 3 occurrences of `treatments: [], accounts: [] }` with `treatments: [], accounts: [], expenseGroups: [] }` (a replace-all of that exact text; it occurs exactly 3 times, at the "places each row on its calendar month", "spreads saved months over two safras" and "rounds each month to the centavo" tests). Three are multi-line: replace each of the 3 occurrences of

```ts
        accounts: [],
      },
```
with:
```ts
        accounts: [],
        expenseGroups: [],
      },
```
(a replace-all of that exact text; it occurs exactly 3 times, in `pastureView`, "is not above the orçado for what grupos without one spent" and "lists at most three grupos over 100 %").

**Replace** in `lib/domain/__tests__/budget.test.ts`:
```ts
describe("previousShape", () => {
```
with:
```ts
describe("budgetView with the farm's grupos", () => {
  const groups: ExpenseGroup[] = [
    { id: "g-maq", name: "Máquinas e veículos", createdAt: "2025-08-01T00:00:00.000Z" },
    { id: "g-arr", name: "Arrendamento", archivedAt: "2026-01-05T00:00:00.000Z", createdAt: "2025-07-01T00:00:00.000Z" },
    { id: "g-old", name: "Grupo velho", archivedAt: "2025-06-01T00:00:00.000Z", createdAt: "2025-01-01T00:00:00.000Z" },
  ];
  const farm: BudgetInputs = {
    budgets: [...budgetLine("g-maq", 200), ...budgetLine("g-arr", 1000)],
    expenses: [
      expense("diesel", { category: "g-maq", accountId: "maq-diesel", amountBrl: 150 }),
      expense("renda", { category: "g-arr", amountBrl: 1000 }),
    ],
    treatments: [],
    accounts: [{ id: "maq-diesel", group: "g-maq", name: "Diesel" }],
    expenseGroups: groups,
  };

  it("lists them after the seven by creation, an archived one while it has orçado or despesas in the safra", () => {
    const farmView = budgetView(farm, 2025, 10, TODAY);
    expect(farmView.groups.map((g) => [g.key, g.label, g.budgetedTotal, g.realizedToDate])).toEqual([
      ["g-arr", "Arrendamento", 12000, 1000],
      ["g-maq", "Máquinas e veículos", 2400, 150],
    ]);
    expect(farmView.groups[1].accounts.map((a) => [a.label, a.realizedToDate])).toEqual([["Diesel", 150]]);
    expect(budgetView({ ...farm, budgets: [] }, 2025, 10, TODAY).groups.map((g) => g.key)).toEqual(["g-arr", "g-maq"]);
    expect(budgetView({ ...farm, budgets: [], expenses: [] }, 2025, 10, TODAY).groups).toEqual([]);
  });

  it("leaves an archived grupo out of the copy into the next safra", () => {
    expect(copyPlan(farm, 2025, 2026, "budgeted", 0, 10, TODAY)).toEqual({
      lines: [{ category: "g-maq", accountId: null, months: Array<number>(12).fill(200) }],
      skipped: 0,
    });
    expect(copyPlan(farm, 2025, 2026, "realized", 0, 10, TODAY).lines.map((l) => l.category)).toEqual(["g-maq"]);
  });
});

describe("previousShape", () => {
```

`lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts` — the use case now reads the farm's grupos right after the contas, so every queued answer list gets one more `[]` there:

**Replace** in `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:
```ts
 * Shared db stub. Selects answer in call order: the farm's start month, the
 * budgets of both safras, the lançamentos, the treatments, the contas, and,
 * after the insert, the target safra as it ends up.
```
with:
```ts
 * Shared db stub. Selects answer in call order: the farm's start month, the
 * budgets of both safras, the lançamentos, the treatments, the contas, the
 * grupos de despesa, and, after the insert, the target safra as it ends up.
```

**Replace** in `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:
```ts
      // A conta's line is read only when the conta is the farm's.
      [{ id: "acc-cerca", group: "pasture", name: "Cerca", archivedAt: null }],
      final,
    ];
```
with:
```ts
      // A conta's line is read only when the conta is the farm's.
      [{ id: "acc-cerca", group: "pasture", name: "Cerca", archivedAt: null }],
      [],
      final,
    ];
```

**Replace** in `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:
```ts
      [{ id: "acc-sal", group: "nutrition", name: "Sal mineral", archivedAt: null }],
      [],
    ];
```
with:
```ts
      [{ id: "acc-sal", group: "nutrition", name: "Sal mineral", archivedAt: null }],
      [],
      [],
    ];
```

**Replace** in `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:
```ts
    state.selectResults = [[{ startMonth: 10 }], [...line(2025, "admin", null, 90), ...final], [], [], [], final];
```
with:
```ts
    state.selectResults = [[{ startMonth: 10 }], [...line(2025, "admin", null, 90), ...final], [], [], [], [], final];
```

**Replace** in `lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts`:
```ts
    expect(result.budgets).toHaveLength(12);
    expect(state.inserts).toEqual([]);
  });
});
```
with:
```ts
    expect(result.budgets).toHaveLength(12);
    expect(state.inserts).toEqual([]);
  });

  it("copies a farm grupo's line and leaves an archived grupo's behind", async () => {
    state.selectResults = [
      [{ startMonth: 10 }],
      [...line(2025, "g-maq", null, 100), ...line(2025, "g-arr", null, 500)],
      [],
      [],
      [],
      [
        { id: "g-maq", farmId: 7, name: "Máquinas e veículos", archivedAt: null, createdAt: new Date("2025-08-01T00:00:00Z") },
        { id: "g-arr", farmId: 7, name: "Arrendamento", archivedAt: new Date("2026-01-05T00:00:00Z"), createdAt: new Date("2025-07-01T00:00:00Z") },
      ],
      [],
    ];

    const result = await copy({ source: "budgeted", adjustPct: 0 });

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(rowsOf("g-maq:null").map((row) => row.amountBrl)).toEqual(Array(12).fill(100));
    expect(rowsOf("g-arr:null")).toEqual([]);
    // The grupos read are this farm's.
    expect(renderSql(state.wheres[5] as SQL).params).toEqual([7]);
  });
});
```

- [ ] **Step 17: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/budget.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `budgetView` lists only the seven (the farm grupos' lines are dropped), `copyPlan` returns no line for `g-maq`; the CopyBudgets tests read the target safra one select too early (`result.budgets` has 0 rows instead of 12, nothing copied for `g-maq`).

- [ ] **Step 18: Implement**

**Replace** in `lib/domain/budget.ts`:
```ts
  Expense,
  ExpenseCategory,
  Treatment,
} from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
  Expense,
  ExpenseCategory,
  ExpenseGroup,
  Treatment,
} from "@/lib/types";
import type { Period } from "@/lib/domain/period";
import { accountsByGroup } from "@/lib/domain/accounts";
```

**Replace** in `lib/domain/budget.ts`:
```ts
import { isCost } from "@/lib/domain/entries";
```
with:
```ts
import { isCost } from "@/lib/domain/entries";
import { despesaGroups } from "@/lib/domain/groups";
```

**Replace** in `lib/domain/budget.ts`:
```ts
  /** EXPENSE_GROUPS order; grupos with neither orçado nor despesas in the safra left out. */
```
with:
```ts
  /** despesaGroups order, archived farm grupos too; grupos with neither orçado nor despesas in the safra left out. */
```

**Replace** in `lib/domain/budget.ts`:
```ts
  treatments: Treatment[];
  accounts: Account[];
}
```
with:
```ts
  treatments: Treatment[];
  accounts: Account[];
  /** The farm's grupos de despesa, archived ones included. */
  expenseGroups: readonly ExpenseGroup[];
}
```

**Replace** in `lib/domain/budget.ts`:
```ts
  for (const category of EXPENSE_GROUPS) {
    const accounts = contasByGroup[category]
      .map((a) => line(category, a.id, a.name))
      .filter((c) => c.ownRows || spent(c.key));
    const group = line(category, null, ACCOUNT_GROUP_LABEL[category], accounts);
```
with:
```ts
  for (const { key: category, label } of despesaGroups(inputs.expenseGroups, { archived: true })) {
    const accounts = (contasByGroup[category] ?? [])
      .map((a) => line(category, a.id, a.name))
      .filter((c) => c.ownRows || spent(c.key));
    const group = line(category, null, label, accounts);
```

**Replace** in `lib/domain/budget.ts`:
```ts
 * grupo whose contas have rows there: it is budgeted through them. Both safras
 * are read from the same `inputs.budgets`.
 */
```
with:
```ts
 * grupo whose contas have rows there: it is budgeted through them. An archived
 * farm grupo is not carried into `to` at all, nor are its contas' lines. Both
 * safras are read from the same `inputs.budgets`.
 */
```

**Replace** in `lib/domain/budget.ts`:
```ts
  const { groups } = budgetView(inputs, from, startMonth, todayIso);
  const sources =
    source === "budgeted"
      ? groups.flatMap((g) => [g, ...g.accounts]).filter((l) => l.ownRows)
      : groups.filter((g) => g.realizedToDate > 0);
```
with:
```ts
  const { groups } = budgetView(inputs, from, startMonth, todayIso);
  const archived = new Set(inputs.expenseGroups.filter((g) => g.archivedAt !== undefined).map((g) => g.id));
  const live = groups.filter((g) => !archived.has(g.category));
  const sources =
    source === "budgeted"
      ? live.flatMap((g) => [g, ...g.accounts]).filter((l) => l.ownRows)
      : live.filter((g) => g.realizedToDate > 0);
```

**Replace** in `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:
```ts
import { accounts, animals, budgets, expenses, treatments } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toTreatment } from "@/lib/api/mappers";
```
with:
```ts
import { accounts, animals, budgets, expenseGroups, expenses, treatments } from "@/lib/db/schema";
import { toAccount, toBudget, toExpense, toExpenseGroup, toTreatment } from "@/lib/api/mappers";
```

**Replace** in `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:
```ts
    const [budgetRows, expenseRows, treatmentRows, accountRows] = await Promise.all([
```
with:
```ts
    const [budgetRows, expenseRows, treatmentRows, accountRows, groupRows] = await Promise.all([
```

**Replace** in `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:
```ts
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
    ]);
```
with:
```ts
      this.repository.select().from(accounts).where(eq(accounts.farmId, farmId)),
      // Every grupo of the farm: a farm grupo's lines copy, an archived one's stay behind.
      this.repository.select().from(expenseGroups).where(eq(expenseGroups.farmId, farmId)),
    ]);
```

**Replace** in `lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts`:
```ts
        accounts: accountRows.map(toAccount),
      },
```
with:
```ts
        accounts: accountRows.map(toAccount),
        expenseGroups: groupRows.map(toExpenseGroup),
      },
```

- [ ] **Step 19: Run the tests**

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/budget.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle E: the finance export names a farm grupo

- [ ] **Step 20: Write the failing test**

**Replace** in `lib/export/__tests__/finance.test.ts`:
```ts
const period = { start: "2025-09-01", end: "2026-08-31" };
```
with:
```ts
describe("expensesExportTable with the farm's grupos", () => {
  it("names a farm grupo and writes Grupo removido for one that is gone", () => {
    const table = expensesExportTable(
      [
        { id: "e1", kind: "expense", date: "2026-01-05", category: "g-maq", amountBrl: 100 },
        { id: "e2", kind: "expense", date: "2026-01-04", category: "g-gone", amountBrl: 50 },
      ],
      "Despesas",
      [{ id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-01-01T00:00:00.000Z" }]
    );
    expect(table.rows).toEqual([
      ["2026-01-05", "Máquinas e veículos", null, 100],
      ["2026-01-04", "Grupo removido", null, 50],
    ]);
  });
});

const period = { start: "2025-09-01", end: "2026-08-31" };
```

- [ ] **Step 21: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — the Categoria cells come out without "Máquinas e veículos" / "Grupo removido" (`EXPENSE_CATEGORY_LABEL` has no `g-maq` / `g-gone`).

- [ ] **Step 22: Implement**

**Replace** in `lib/export/datasets/finance.ts`:
```ts
import type { Category, Expense } from "@/lib/types";
```
with:
```ts
import type { Category, Expense, ExpenseGroup } from "@/lib/types";
```

**Replace** in `lib/export/datasets/finance.ts`:
```ts
import { EXPENSE_CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";
```
with:
```ts
import { groupLabel } from "@/lib/domain/groups";
import { pluralCategory } from "@/lib/domain/labels";
```

**Replace** in `lib/export/datasets/finance.ts`:
```ts
/** Every despesa, newest first; receitas and the kinds outside the resultado are left out. */
export function expensesExportTable(expenses: readonly Expense[], title = "Despesas"): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (e) => e.date },
      { header: "Categoria", value: (e) => EXPENSE_CATEGORY_LABEL[e.category] },
```
with:
```ts
/**
 * Every despesa, newest first; receitas and the kinds outside the resultado
 * are left out. `expenseGroups` names the farm's grupos.
 */
export function expensesExportTable(
  expenses: readonly Expense[],
  title = "Despesas",
  expenseGroups: readonly ExpenseGroup[] = []
): ExportTable {
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (e) => e.date },
      { header: "Categoria", value: (e) => groupLabel(e.category, expenseGroups) },
```

The report's Despesas sheet passes the farm's grupos (`data` is the `HerdData`; an old snapshot's `undefined` takes the default `[]`).

**Replace** in `components/reports/datasets.ts`:
```ts
    datasets.push({ ...one("expenses", "Despesas", expensesExportTable(data.expenses)), finance: true });
```
with:
```ts
    datasets.push({
      ...one("expenses", "Despesas", expensesExportTable(data.expenses, "Despesas", data.expenseGroups)),
      finance: true,
    });
```

- [ ] **Step 23: Run the tests**

Run: `./node_modules/.bin/vitest run lib/export/__tests__/finance.test.ts --exclude '**/worktrees/**'`
Expected: PASS

---

#### Cycle F: delete the old constants and move every screen to `groupLabel`

No component tests (UI): implement, then `tsc` names anything missed.

- [ ] **Step 24: Implement**

**Replace** in `lib/domain/accounts.ts` (the header: doc comment, imports and the three constants):
```ts
/**
 * Plano de contas: the fixed grupos (Receitas, the seven cost categories and
 * the three outside the resultado) and the farm's contas inside them. Pure.
 */
import type { Account, AccountGroup, Expense, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";

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
with:
```ts
/**
 * Plano de contas: the grupos (Receitas, the seven built-in grupos of custo,
 * the farm's own grupos de despesa and the three outside the resultado) and
 * the farm's contas inside them. Pure. Order and labels of the grupos live in
 * groups.ts.
 */
import type { Account, AccountGroup, Expense } from "@/lib/types";
import { CAPITAL_GROUPS } from "@/lib/domain/entries";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
```

**Delete** in `lib/domain/labels.ts` the alias task 1 left at the end of the file, with the blank line above it (the file then ends with the closing `};` of `BUILTIN_CATEGORY_LABEL`):
```ts
/** @deprecated task 4 removes it */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = BUILTIN_CATEGORY_LABEL;
```

and its now unused type import:

**Replace** in `lib/domain/labels.ts`:
```ts
  DiagnosisResult,
  ExpenseCategory,
  InactiveReason,
```
with:
```ts
  DiagnosisResult,
  InactiveReason,
```

`app/(app)/finance/page.tsx`:

**Replace** in `app/(app)/finance/page.tsx`:
```ts
  const transfers = useHerdStore((s) => s.transfers);
  // An offline snapshot from before the orçamento has no início da safra.
```
with:
```ts
  const transfers = useHerdStore((s) => s.transfers);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  // An offline snapshot from before the orçamento has no início da safra.
```

**Replace** in `app/(app)/finance/page.tsx`:
```ts
    () => ledgerRows({ ...inputs, accounts }, period, today),
    [inputs, accounts, period, today]
```
with:
```ts
    () => ledgerRows({ ...inputs, accounts, expenseGroups }, period, today),
    [inputs, accounts, expenseGroups, period, today]
```

**Replace** in `app/(app)/finance/page.tsx`:
```ts
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers }, period, today),
    [inputs, accounts, bankAccounts, transfers, period, today]
```
with:
```ts
    () => capitalSummary({ ...inputs, accounts, bankAccounts, transfers, expenseGroups }, period, today),
    [inputs, accounts, bankAccounts, transfers, expenseGroups, period, today]
```

**Replace** in `app/(app)/finance/page.tsx`:
```ts
    () => (budgets ? budgetView({ budgets, expenses, treatments, accounts }, safra, safraStartMonth, today) : null),
    [budgets, expenses, treatments, accounts, safra, safraStartMonth, today]
```
with:
```ts
    () =>
      budgets
        ? budgetView({ budgets, expenses, treatments, accounts, expenseGroups }, safra, safraStartMonth, today)
        : null,
    [budgets, expenses, treatments, accounts, expenseGroups, safra, safraStartMonth, today]
```

`components/dashboard/FinanceCard.tsx` (the Painel's "Para onde foi o custo"):

**Replace** in `components/dashboard/FinanceCard.tsx`:
```ts
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
```
with:
```ts
import { groupLabel } from "@/lib/domain/groups";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

**Replace** in `components/dashboard/FinanceCard.tsx`:
```ts
export function FinanceCard({ result, breakdown, months }: FinanceCardProps) {
```
with:
```ts
export function FinanceCard({ result, breakdown, months }: FinanceCardProps) {
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

**Replace** in `components/dashboard/FinanceCard.tsx`:
```ts
                      {EXPENSE_CATEGORY_LABEL[slice.category]}
```
with:
```ts
                      {groupLabel(slice.category, expenseGroups)}
```

`components/finance/CostBreakdownCard.tsx`:

**Replace** in `components/finance/CostBreakdownCard.tsx`:
```ts
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```
with:
```ts
import { groupLabel } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
```

**Replace** in `components/finance/CostBreakdownCard.tsx`:
```ts
}: CostBreakdownCardProps) {
```
with:
```ts
}: CostBreakdownCardProps) {
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

**Replace** in `components/finance/CostBreakdownCard.tsx`:
```ts
                        {EXPENSE_CATEGORY_LABEL[slice.category]}
```
with:
```ts
                        {groupLabel(slice.category, expenseGroups)}
```

**Replace** in `components/finance/CostBreakdownCard.tsx`:
```ts
                  {EXPENSE_CATEGORY_LABEL[openSlice.category]} por conta
```
with:
```ts
                  {groupLabel(openSlice.category, expenseGroups)} por conta
```

`components/finance/BillsCard.tsx` (the local `groupLabel` becomes `grupo`, so it does not shadow the import):

**Replace** in `components/finance/BillsCard.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```
with:
```ts
import { accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/BillsCard.tsx`:
```ts
  const lots = useHerdStore((s) => s.lots);
  const markPaid = useMarkPaid();
```
with:
```ts
  const lots = useHerdStore((s) => s.lots);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const markPaid = useMarkPaid();
```

**Replace** in `components/finance/BillsCard.tsx`:
```ts
              const groupLabel = group ? ACCOUNT_GROUP_LABEL[group] : ENTRY_KIND_LABEL.yield;
              const conta = accountName(entry.accountId, accounts);
              const title = conta ? `${groupLabel} › ${conta}` : groupLabel;
```
with:
```ts
              const grupo = group ? groupLabel(group, expenseGroups) : ENTRY_KIND_LABEL.yield;
              const conta = accountName(entry.accountId, accounts);
              const title = conta ? `${grupo} › ${conta}` : grupo;
```

`components/finance/SeriesScopeDialog.tsx`:

**Replace** in `components/finance/SeriesScopeDialog.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```
with:
```ts
import { accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/SeriesScopeDialog.tsx`:
```ts
  const expenses = useHerdStore((s) => s.expenses);
  const [scope, setScope] = useState<SeriesScope>("following");
```
with:
```ts
  const expenses = useHerdStore((s) => s.expenses);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const [scope, setScope] = useState<SeriesScope>("following");
```

**Replace** in `components/finance/SeriesScopeDialog.tsx`:
```ts
  const groupLabel = group ? ACCOUNT_GROUP_LABEL[group] : ENTRY_KIND_LABEL.yield;
  const name = [accountName(expense.accountId, accounts) ?? groupLabel, expense.counterparty]
```
with:
```ts
  const grupo = group ? groupLabel(group, expenseGroups) : ENTRY_KIND_LABEL.yield;
  const name = [accountName(expense.accountId, accounts) ?? grupo, expense.counterparty]
```

`components/finance/contas/AccountMovements.tsx`:

**Replace** in `components/finance/contas/AccountMovements.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```
with:
```ts
import { accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { TOP_GROUP_LABEL, groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/contas/AccountMovements.tsx`:
```ts
  const reconciledIds = useHerdStore((s) => s.reconciledIds);
  const [pageNumber, setPageNumber] = useState(1);
```
with:
```ts
  const reconciledIds = useHerdStore((s) => s.reconciledIds);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const [pageNumber, setPageNumber] = useState(1);
```

**Replace** in `components/finance/contas/AccountMovements.tsx`:
```ts
        const group = groupKey ? ACCOUNT_GROUP_LABEL[groupKey] : ENTRY_KIND_LABEL.yield;
```
with:
```ts
        const group = groupKey ? groupLabel(groupKey, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

**Replace** in `components/finance/contas/AccountMovements.tsx`:
```ts
          group: ACCOUNT_GROUP_LABEL[sale ? "revenue" : "investment"],
```
with:
```ts
          group: TOP_GROUP_LABEL[sale ? "revenue" : "investment"],
```

**Replace** in `components/finance/contas/AccountMovements.tsx`:
```ts
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts]);
```
with:
```ts
  }, [account, expenses, movements, transfers, period, accounts, bankAccounts, expenseGroups]);
```

`components/finance/contas/ConciliarPage.tsx`:

**Replace** in `components/finance/contas/ConciliarPage.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
```
with:
```ts
import { accountName } from "@/lib/domain/accounts";
import { ENTRY_KIND_LABEL, entryGroup } from "@/lib/domain/entries";
import { groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/contas/ConciliarPage.tsx`:
```ts
  const accounts = useHerdStore((s) => s.accounts);
```
with:
```ts
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
```

**Replace** in `components/finance/contas/ConciliarPage.tsx`:
```ts
      const group = groupKey ? ACCOUNT_GROUP_LABEL[groupKey] : ENTRY_KIND_LABEL.yield;
```
with:
```ts
      const group = groupKey ? groupLabel(groupKey, expenseGroups) : ENTRY_KIND_LABEL.yield;
```

`components/finance/lancamentos/LancamentosPage.tsx`:

**Replace** in `components/finance/lancamentos/LancamentosPage.tsx`:
```ts
  const transfers = useHerdStore((s) => s.transfers);
  const inputs = useMemo<PlanInputs>(
    () => ({ expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers }),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers]
  );
```
with:
```ts
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

`components/finance/orcamento/OrcamentoPage.tsx` ("Orçar um grupo" picks among the active grupos; `CopyDialog` and `BudgetEditDialog` get `expenseGroups` through `inputs`):

**Replace** in `components/finance/orcamento/OrcamentoPage.tsx`:
```ts
import { EXPENSE_GROUPS } from "@/lib/domain/accounts";
```
with:
```ts
import { despesaGroups } from "@/lib/domain/groups";
```

**Replace** in `components/finance/orcamento/OrcamentoPage.tsx`:
```ts
  const accounts = useHerdStore((s) => s.accounts);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
```
with:
```ts
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
```

**Replace** in `components/finance/orcamento/OrcamentoPage.tsx`:
```ts
    () => ({ budgets: budgets ?? [], expenses, treatments, accounts }),
    [budgets, expenses, treatments, accounts]
```
with:
```ts
    () => ({ budgets: budgets ?? [], expenses, treatments, accounts, expenseGroups }),
    [budgets, expenses, treatments, accounts, expenseGroups]
```

**Replace** in `components/finance/orcamento/OrcamentoPage.tsx`:
```ts
  /** "Orçar um grupo": the first grupo without an orçado, Nutrição on an empty safra. */
  const orcar = () =>
    setEditing({
      category:
        EXPENSE_GROUPS.find((category) => !view?.groups.some((g) => g.category === category && g.hasBudget)) ??
        "nutrition",
      pick: true,
    });
```
with:
```ts
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

`components/finance/orcamento/BudgetEditDialog.tsx` (the Grupo picker lists the active grupos; an archived one is only edited from its own row):

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
import { EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
import { accountsByGroup } from "@/lib/domain/accounts";
```

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```
with:
```ts
import { despesaGroups, groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
            Orçamento · {EXPENSE_CATEGORY_LABEL[category]}
```
with:
```ts
            Orçamento · {groupLabel(category, inputs.expenseGroups)}
```

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
                {EXPENSE_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {EXPENSE_CATEGORY_LABEL[group]}
                  </SelectItem>
                ))}
```
with:
```ts
                {despesaGroups(inputs.expenseGroups).map((group) => (
                  <SelectItem key={group.key} value={group.key}>
                    {group.label}
                  </SelectItem>
                ))}
```

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
  const label = EXPENSE_CATEGORY_LABEL[category];
```
with:
```ts
  const label = groupLabel(category, inputs.expenseGroups);
```

**Replace** in `components/finance/orcamento/BudgetEditDialog.tsx`:
```ts
  const contas = accountsByGroup(accounts, true)[category].filter(
```
with:
```ts
  const contas = (accountsByGroup(accounts, true)[category] ?? []).filter(
```

The three files task 5 reworks get only the contract's swaps (`EXPENSE_GROUPS` → `BUILTIN_CATEGORIES`, `ACCOUNT_GROUP_LABEL[g]` → `groupLabel(g, expenseGroups)`, `EXPENSE_CATEGORY_LABEL` → `BUILTIN_CATEGORY_LABEL`), so they keep compiling and behave exactly as today. Nothing else in them changes.

`components/finance/plano/AccountsPage.tsx`:

**Replace** in `components/finance/plano/AccountsPage.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
```
with:
```ts
import { accountsByGroup } from "@/lib/domain/accounts";
import { BUILTIN_CATEGORIES, groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/plano/AccountsPage.tsx`:
```ts
              {EXPENSE_GROUPS.map((group) => (
```
with:
```ts
              {BUILTIN_CATEGORIES.map((group) => (
```

**Replace** in `components/finance/plano/AccountsPage.tsx`:
```ts
function GroupSection({ group, onAdd, children }: { group: AccountGroup; onAdd?: () => void; children: ReactNode }) {
  return (
```
with:
```ts
function GroupSection({ group, onAdd, children }: { group: AccountGroup; onAdd?: () => void; children: ReactNode }) {
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  return (
```

**Replace** in `components/finance/plano/AccountsPage.tsx`:
```ts
          <h3 className="text-sm font-semibold text-ink">{ACCOUNT_GROUP_LABEL[group]}</h3>
```
with:
```ts
          <h3 className="text-sm font-semibold text-ink">{groupLabel(group, expenseGroups)}</h3>
```

`components/finance/plano/NewAccountDialog.tsx`:

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```ts
import { ACCOUNT_GROUP_LABEL, EXPENSE_GROUPS } from "@/lib/domain/accounts";
```
with:
```ts
import { BUILTIN_CATEGORIES, groupLabel } from "@/lib/domain/groups";
```

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```ts
  const addAccount = useHerdStore((s) => s.addAccount);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
```
with:
```ts
  const addAccount = useHerdStore((s) => s.addAccount);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
```

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```ts
                  {EXPENSE_GROUPS.map((g) => (
```
with:
```ts
                  {BUILTIN_CATEGORIES.map((g) => (
```

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```ts
                      {ACCOUNT_GROUP_LABEL[g]}
```
with:
```ts
                      {groupLabel(g, expenseGroups)}
```

`components/finance/EntryDialog.tsx`:

**Replace** in `components/finance/EntryDialog.tsx`:
```ts
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
```
with:
```ts
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
```

**Replace** in `components/finance/EntryDialog.tsx`:
```ts
const CATEGORY_LIST = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
```
with:
```ts
const CATEGORY_LIST = BUILTIN_CATEGORIES;
```

**Replace** in `components/finance/EntryDialog.tsx`:
```ts
                        {EXPENSE_CATEGORY_LABEL[category]}
```
with:
```ts
                        {BUILTIN_CATEGORY_LABEL[category]}
```

- [ ] **Step 25: Types, lint and every touched test**

Run: `grep -rnE "EXPENSE_CATEGORY_LABEL|ACCOUNT_GROUP_LABEL|EXPENSE_GROUPS|ACCOUNT_GROUPS|isCategory" --include=*.ts --include=*.tsx app components lib cli`
Expected: no output.

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean. Tasks 2 and 3 of this wave only add files and validation; nothing here depends on them (the store field and `toExpenseGroup` are task 1's). If task 3's Elysia schemas have not landed yet, the only expected errors are in `lib/store/useHerdStore.ts` (the store passes `string` categories to the still-literal API bodies). Those belong to task 3, and no error comes from a file of this task.

Run: `./node_modules/.bin/eslint lib/domain/accounts.ts lib/domain/ledger.ts lib/domain/planTree.ts lib/domain/budget.ts lib/domain/labels.ts lib/export/datasets/finance.ts components/reports/datasets.ts lib/api/domains/budgets/useCases/CopyBudgets.useCase.ts "app/(app)/finance/page.tsx" components/dashboard/FinanceCard.tsx components/finance/CostBreakdownCard.tsx components/finance/BillsCard.tsx components/finance/SeriesScopeDialog.tsx components/finance/contas/AccountMovements.tsx components/finance/contas/ConciliarPage.tsx components/finance/lancamentos/LancamentosPage.tsx components/finance/orcamento/OrcamentoPage.tsx components/finance/orcamento/BudgetEditDialog.tsx components/finance/plano/AccountsPage.tsx components/finance/plano/NewAccountDialog.tsx components/finance/EntryDialog.tsx lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/planTree.test.ts lib/domain/__tests__/budget.test.ts lib/export/__tests__/finance.test.ts components/finance/lancamentos/__tests__/legacySearch.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/domain/groups.ts lib/domain/__tests__/groups.test.ts`
Expected: clean.

Run: `./node_modules/.bin/vitest run lib/domain/__tests__/accounts.test.ts lib/domain/__tests__/ledger.test.ts lib/domain/__tests__/planTree.test.ts lib/domain/__tests__/budget.test.ts lib/export/__tests__/finance.test.ts components/finance/lancamentos/__tests__/legacySearch.test.ts lib/api/domains/budgets/useCases/__tests__/CopyBudgets.test.ts lib/domain/__tests__/groups.test.ts --exclude '**/worktrees/**'`
Expected: PASS (8 files, 151 tests)

### Task 5: Plano de contas + pickers UI

**Files:**
- Create: `components/finance/plano/GroupHeader.tsx`
- Create: `components/finance/plano/NewGroupDialog.tsx`
- Modify: `components/finance/plano/AccountsPage.tsx` (whole file)
- Modify: `components/finance/plano/NewAccountDialog.tsx`
- Modify: `components/finance/EntryDialog.tsx`
- Test: `components/finance/__tests__/groupHeader.test.ts`

Not touched: `components/ui/select.tsx` already exports `SelectGroup`, `SelectLabel` and `SelectSeparator`; `components/finance/entryFields.ts` needs no change (a farm grupo id is just another `ExpenseCategory` string).

**Interfaces:**
- Consumes:
  - task 1, `@/lib/types`: `ExpenseGroup`, `ExpenseCategory = string`, `AccountGroup = string`.
  - task 1, `@/lib/domain/groups`: `despesaGroups(groups, opts?: { archived?: boolean; keep?: ExpenseCategory }): DespesaGroup[]`, `interface DespesaGroup { key; label; custom; archived }`, `TOP_GROUP_LABEL: Record<"revenue" | CapitalGroup, string>`, `GROUP_NAME_MAX = 40`.
  - task 1, store state: `useHerdStore((s) => s.expenseGroups): ExpenseGroup[]`.
  - task 2, store actions: `addExpenseGroup(name: string): Promise<ExpenseGroup | null>` (null on 409), `updateExpenseGroup(id: string, patch: { name?: string; archived?: boolean }): Promise<boolean>` (false on 409), `removeExpenseGroup(id: string): Promise<"deleted" | "in_use">`. Any other error goes through `apiFail`, which toasts and throws.
  - task 4: `accountsByGroup(accounts, includeArchived?): Record<AccountGroup, Account[]>`, with the built-in and top keys pre-filled and a farm grupo key present only when it has contas, so this task reads `byGroup[key] ?? []`. The constants `EXPENSE_GROUPS`, `ACCOUNT_GROUP_LABEL`, `ACCOUNT_GROUPS` and the `EXPENSE_CATEGORY_LABEL` alias are gone.
- Produces (from `components/finance/plano/GroupHeader.tsx`):
  - `groupEntryCount(key: ExpenseCategory, expenses: readonly Expense[], accounts: readonly Account[]): number`
  - `archiveGroupText(contas: number, entries: number): string`
  - `AddAccountButton({ onClick })`, which moved here from AccountsPage, and `GroupHeader({ group, contas, entries, onAdd? })`
  - `NewGroupDialog({ open, onOpenChange })` from `components/finance/plano/NewGroupDialog.tsx`.
  - Copy and accessible names for the smoke test (task 6):
    - the card button "Grupo" (with a Plus icon)
    - the dialog "Novo grupo de despesa": field label "Nome", buttons "Cancelar" and "Criar grupo"
    - on a farm grupo: the tag "da fazenda" and the icon buttons `aria-label` "Renomear o grupo <nome>", "Arquivar o grupo <nome>", "Excluir o grupo <nome>" (shown only with 0 lançamentos), then "+ Conta"
    - the rename input `aria-label` "Novo nome de <nome>"
    - the confirm dialogs "Arquivar <nome>?" (button "Arquivar") and "Excluir <nome>?" (button "Excluir")
    - the summary "Grupos arquivados (n)" and the icon button `aria-label` "Restaurar o grupo <nome>"
    - toasts: `Grupo "<nome>" criado`, "Já existe um grupo com esse nome", "Grupo renomeado", "Grupo arquivado", "Grupo excluído", "Grupo com lançamentos não se apaga. Arquive em vez de excluir.", "Grupo restaurado"
    - in the lançamento form, the Grupo select puts the farm's grupos after a separator, under the label "da fazenda" (rendered uppercase).

Copy follows `boards.mjs` (direction A) and the contract. There is one deliberate difference. The canvas note "…, ou mova contas de outro grupo renomeando-as lá" is dropped: the spec puts moving contas between grupos out of scope, so the note reads "Depois crie as contas dele com + Conta." as the contract says. The info box takes the canvas text and keeps today's last sentence after it ("Despesa ou receita sem conta fica só no grupo; investimento, financiamento e sócios sempre levam uma conta.").

- [ ] **Step 1: Write the failing test**

`components/finance/__tests__/groupHeader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Account, Expense } from "@/lib/types";
import { archiveGroupText, groupEntryCount } from "@/components/finance/plano/GroupHeader";

/** The id of the farm grupo "Máquinas e veículos". */
const MAQUINAS = "g-maquinas";
const diesel: Account = { id: "a-diesel", group: MAQUINAS, name: "Diesel" };
const sal: Account = { id: "a-sal", group: "nutrition", name: "Sal mineral" };

/** A despesa of R$ 100,00 in Nutrição on 2026-09-05; `patch` moves it. */
const despesa = (id: string, patch: Partial<Expense> = {}): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-05",
  category: "nutrition",
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
    expect(groupEntryCount(MAQUINAS, [despesa("e1", { category: "admin", accountId: diesel.id })], [diesel])).toBe(1);
  });

  it("is zero for a grupo nothing was ever lançado in, contas or not", () => {
    const vazio: Account = { id: "a-baia", group: "g-confinamento", name: "Baias" };
    expect(groupEntryCount("g-confinamento", [despesa("e1", { accountId: sal.id })], [diesel, sal, vazio])).toBe(0);
  });
});

describe("archiveGroupText", () => {
  it("names the contas that leave the forms and the lançamentos that stay", () => {
    expect(archiveGroupText(3, 22)).toBe(
      "O grupo e as 3 contas dele saem do formulário de lançamento e do Orçamento da próxima safra. Os 22 lançamentos continuam no Painel, em Lançamentos e no custo dos meses em que foram feitos."
    );
  });

  it("says one conta and one lançamento in the singular", () => {
    expect(archiveGroupText(1, 1)).toBe(
      "O grupo e a conta dele saem do formulário de lançamento e do Orçamento da próxima safra. O lançamento continua no Painel, em Lançamentos e no custo do mês em que foi feito."
    );
  });

  it("leaves out what the grupo does not have", () => {
    expect(archiveGroupText(0, 0)).toBe("O grupo sai do formulário de lançamento e do Orçamento da próxima safra.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run components/finance/__tests__/groupHeader.test.ts --exclude '**/worktrees/**'`
Expected: FAIL. Vite cannot resolve `@/components/finance/plano/GroupHeader` because the file does not exist yet.

- [ ] **Step 3: Implement**

**3a. Create `components/finance/plano/GroupHeader.tsx`.** It holds the header of a farm grupo and the two pure helpers that the test covers. `AddAccountButton` moves here from AccountsPage, so the page and this header share it without an import cycle.

```tsx
"use client";

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
import { useToast } from "@/components/providers/Toasts";
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

/** Lançamentos ever made in a grupo: carrying it as their grupo, or one of its contas. */
export function groupEntryCount(
  key: ExpenseCategory,
  expenses: readonly Expense[],
  accounts: readonly Account[]
): number {
  const contas = new Set(accounts.filter((a) => a.group === key).map((a) => a.id));
  return expenses.filter((e) => e.category === key || (e.accountId !== undefined && contas.has(e.accountId)))
    .length;
}

/** What "Arquivar <nome>?" says: the contas that leave the forms, the lançamentos that stay. */
export function archiveGroupText(contas: number, entries: number): string {
  const leaving =
    contas === 0
      ? "O grupo sai"
      : contas === 1
        ? "O grupo e a conta dele saem"
        : `O grupo e as ${formatNumber(contas)} contas dele saem`;
  const staying =
    entries === 0
      ? ""
      : entries === 1
        ? " O lançamento continua no Painel, em Lançamentos e no custo do mês em que foi feito."
        : ` Os ${formatNumber(entries)} lançamentos continuam no Painel, em Lançamentos e no custo dos meses em que foram feitos.`;
  return `${leaving} do formulário de lançamento e do Orçamento da próxima safra.${staying}`;
}

export function AddAccountButton({ onClick }: { onClick(): void }) {
  return (
    <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={onClick}>
      <Plus data-icon="inline-start" aria-hidden />
      Conta
    </Button>
  );
}

export function GroupHeader({
  group,
  contas,
  entries,
  onAdd,
}: {
  /** A farm grupo, not archived. */
  group: DespesaGroup;
  /** Its contas that are not archived. */
  contas: number;
  /** Lançamentos ever made in it (groupEntryCount). */
  entries: number;
  /** "+ Conta" in this grupo; absent for a reader, who gets no buttons. */
  onAdd?: () => void;
}) {
  const updateExpenseGroup = useHerdStore((s) => s.updateExpenseGroup);
  const removeExpenseGroup = useHerdStore((s) => s.removeExpenseGroup);
  const { addToast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  /** Which confirmation; kept while it closes so the title does not flip. */
  const [action, setAction] = useState<"archive" | "delete">("archive");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function confirm(next: "archive" | "delete") {
    setAction(next);
    setConfirming(true);
  }

  async function onRename() {
    if (draft === null) return;
    const clean = draft.trim();
    if (clean === "" || clean === group.label) {
      setDraft(null);
      return;
    }
    if (!(await updateExpenseGroup(group.key, { name: clean }))) {
      addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: "Grupo renomeado" });
    setDraft(null);
  }

  async function onArchive() {
    setBusy(true);
    try {
      await updateExpenseGroup(group.key, { archived: true });
      addToast({ messageType: "success", text: "Grupo arquivado" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      if ((await removeExpenseGroup(group.key)) === "in_use") {
        addToast({ messageType: "error", text: "Grupo com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
        return;
      }
      addToast({ messageType: "success", text: "Grupo excluído" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void onRename();
    if (e.key === "Escape") setDraft(null);
  };

  if (draft !== null) {
    return (
      <header className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${group.label}`}
          value={draft}
          maxLength={GROUP_NAME_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onRename()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setDraft(null)}>
          Cancelar
        </Button>
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold break-words text-ink">{group.label}</h3>
        <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink-soft">
          da fazenda
        </span>
      </div>
      {onAdd ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Renomear o grupo ${group.label}`}
            title="Renomear grupo"
            onClick={() => setDraft(group.label)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Arquivar o grupo ${group.label}`}
            title="Arquivar grupo"
            onClick={() => confirm("archive")}
          >
            <Archive aria-hidden />
          </Button>
          {entries === 0 ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir o grupo ${group.label}`}
              title="Excluir grupo"
              onClick={() => confirm("delete")}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
          <AddAccountButton onClick={onAdd} />
        </div>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            {action === "delete" ? (
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => void onRemove()}
              >
                {busy ? "Excluindo…" : "Excluir"}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => void onArchive()}
              >
                {busy ? "Arquivando…" : "Arquivar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
```

**3b. Create `components/finance/plano/NewGroupDialog.tsx`:**

```tsx
"use client";

/**
 * "+ Grupo" of the Despesas (COE) card: a grupo de despesa of the farm, by
 * name. It counts in the COE like the seven of the system; its contas come
 * after, from its own "+ Conta". A name taken by another grupo, or by one of
 * the system's, is refused (409).
 */
import { useState, type FormEvent } from "react";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
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

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const addExpenseGroup = useHerdStore((s) => s.addExpenseGroup);
  const { addToast } = useToast();
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
      created = await addExpenseGroup(clean);
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
          <DialogTitle>Novo grupo de despesa</DialogTitle>
          <DialogDescription>
            Entra no custo (COE) como os grupos do sistema: aparece no Painel, no Orçamento, em Lançamentos e no
            formulário de lançamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-name">Nome</Label>
            <Input
              id="new-group-name"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Máquinas e veículos"
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

**3c. `components/finance/plano/AccountsPage.tsx`. Replace the whole file with:**

```tsx
"use client";

/**
 * /settings/plano-de-contas: the farm's contas inside their grupos.
 * Receitas (Venda de gado is automatic, from the manejos) and Fora do
 * resultado (Investimentos with the automatic Compra de gado, Financiamentos,
 * Sócios) on the left, Despesas (COE) on the right, one block per grupo: the
 * seven of the system, then the farm's own ("+ Grupo", each with its
 * GroupHeader), then "Grupos arquivados". A conta shows its last 12 months
 * and lançamento count; a financiamento shows its saldo devedor today
 * instead, its saldo inicial under the name, and edits the saldo inicial
 * beside the name. A conta or grupo with lançamentos is archived, which hides
 * it from the forms and keeps history; one without them may be deleted.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, Info, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Account, AccountGroup, ExpenseCategory } from "@/lib/types";
import { accountsByGroup } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, isCapitalKind, isInflow } from "@/lib/domain/entries";
import { TOP_GROUP_LABEL, despesaGroups, type DespesaGroup } from "@/lib/domain/groups";
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
import { AddAccountButton, GroupHeader, groupEntryCount } from "@/components/finance/plano/GroupHeader";

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
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const seedDefaultAccounts = useHerdStore((s) => s.seedDefaultAccounts);
  const canEdit = useCan("finance", "edit");
  const { addToast } = useToast();
  const [adding, setAdding] = useState<{ place: AccountPlace; category?: ExpenseCategory } | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);

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
  const groups = despesaGroups(expenseGroups, { archived: true });
  const archivedGroups = groups.filter((group) => group.archived);
  const entriesIn = (key: string) => groupEntryCount(key, expenses, accounts);
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
          subtitle="As contas de cada grupo. Os sete grupos de despesa do sistema não mudam; a fazenda pode criar os seus, que entram no custo (COE) do mesmo jeito."
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
              <AccountList accounts={byGroup.revenue} stats={stats} used={used} canEdit={canEdit} />
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
                    label={TOP_GROUP_LABEL[group]}
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
                      used={used}
                      canEdit={canEdit}
                      empty="Sem contas — crie uma para lançar aqui"
                    />
                  </GroupSection>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Despesas (COE)"
            subtitle={
              canEdit ? "Valores dos últimos 12 meses · + Grupo cria um grupo da fazenda" : "Valores dos últimos 12 meses"
            }
            action={
              canEdit ? (
                <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setAddingGroup(true)}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Grupo
                </Button>
              ) : null
            }
            className="lg:col-span-3"
          >
            <div className="-my-4 divide-y divide-hairline">
              {groups
                .filter((group) => !group.archived)
                .map((group) => {
                  const contas = byGroup[group.key] ?? [];
                  const onAdd = canEdit ? () => setAdding({ place: "expense", category: group.key }) : undefined;
                  const list = <AccountList accounts={contas} stats={stats} used={used} canEdit={canEdit} />;
                  return group.custom ? (
                    <section key={group.key} className="py-4">
                      <GroupHeader
                        group={group}
                        contas={contas.filter((a) => !a.archivedAt).length}
                        entries={entriesIn(group.key)}
                        onAdd={onAdd}
                      />
                      {list}
                    </section>
                  ) : (
                    <GroupSection key={group.key} group={group.key} label={group.label} onAdd={onAdd}>
                      {list}
                    </GroupSection>
                  );
                })}
              {archivedGroups.length > 0 ? (
                <ArchivedGroups groups={archivedGroups} entriesIn={entriesIn} canEdit={canEdit} />
              ) : null}
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
        defaultCategory={adding?.category}
      />
      <NewGroupDialog open={addingGroup} onOpenChange={setAddingGroup} />
    </div>
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

/** One grupo of the system inside a card: its name, its hint, "+ Conta" and what follows. */
function GroupSection({
  group,
  label,
  onAdd,
  children,
}: {
  group: AccountGroup;
  label: string;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="py-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          {GROUP_HINT[group] ? <p className="text-xs text-ink-soft">{GROUP_HINT[group]}</p> : null}
        </div>
        {onAdd ? <AddAccountButton onClick={onAdd} /> : null}
      </header>
      {children}
    </section>
  );
}

/** "Grupos arquivados": out of the forms, their lançamentos kept; Restaurar brings one back. */
function ArchivedGroups({
  groups,
  entriesIn,
  canEdit,
}: {
  groups: DespesaGroup[];
  /** Lançamentos ever made in a grupo. */
  entriesIn(key: string): number;
  canEdit: boolean;
}) {
  const updateExpenseGroup = useHerdStore((s) => s.updateExpenseGroup);
  const { addToast } = useToast();

  async function onRestore(group: DespesaGroup) {
    await updateExpenseGroup(group.key, { archived: false });
    addToast({ messageType: "success", text: "Grupo restaurado" });
  }

  return (
    <details className="group py-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink md:min-h-0">
        <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" aria-hidden />
        Grupos arquivados ({groups.length})
      </summary>
      <ul className="mt-1 divide-y divide-hairline">
        {groups.map((group) => {
          const count = entriesIn(group.key);
          return (
            <li key={group.key} className="flex min-h-11 items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm break-words text-ink-soft">
                {group.label}
                <span className="block text-xs">
                  {formatNumber(count)} {count === 1 ? "lançamento" : "lançamentos"}
                </span>
              </span>
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 md:size-8"
                  aria-label={`Restaurar o grupo ${group.label}`}
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
  empty = "Sem contas — lançamentos ficam só no grupo",
}: {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  /** Contas some lançamento points at. */
  used: ReadonlySet<string | undefined>;
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
            <AccountRow
              key={account.id}
              account={account}
              stats={stats.get(account.id)}
              deletable={!used.has(account.id)}
              canEdit={canEdit}
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
}: {
  account: Account;
  stats: AccountStats | undefined;
  /** No lançamento points at it; the server still refuses one a recorrência keeps. */
  deletable: boolean;
  canEdit: boolean;
}) {
  const updateAccount = useHerdStore((s) => s.updateAccount);
  const removeAccount = useHerdStore((s) => s.removeAccount);
  const { addToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
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
            // Keeps the figures lined up with the rows that can be deleted.
            <span className="size-11 md:size-8" aria-hidden />
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

(It is a whole-file replacement of task 4's version, whose only edits — the `BUILTIN_CATEGORIES`/`groupLabel` import, `BUILTIN_CATEGORIES.map` and an `expenseGroups` line in `GroupSection` — are all superseded. `AccountRow` and `AccountList` are unchanged from the current file. A farm grupo without contas has no key in `accountsByGroup`, hence `byGroup[group.key] ?? []`; the other keys read here are always there.)

**3d. `components/finance/plano/NewAccountDialog.tsx`: three Replace blocks.**

Task 4 already swapped this file's removed constants for `BUILTIN_CATEGORIES`/`groupLabel` and added the `expenseGroups` store line; the blocks below find task 4's text. Afterwards the file imports only `despesaGroups` from `@/lib/domain/groups` and nothing from `@/lib/domain/accounts` or `@/lib/domain/labels`. `defaultCategory` is already an `ExpenseCategory` (a string), so a farm grupo's id preselects it.

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```tsx
 * "Nova conta": where it sits in the plano — Banco ou caixa, Investimento,
 * Financiamento, Sócios, Despesa (with its grupo) or Receita — then its name.
```
with:
```tsx
 * "Nova conta": where it sits in the plano — Banco ou caixa, Investimento,
 * Financiamento, Sócios, Despesa (with its grupo: one of the system's or the
 * farm's, archived ones left out) or Receita — then its name.
```

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```tsx
import { BUILTIN_CATEGORIES, groupLabel } from "@/lib/domain/groups";
```
with:
```tsx
import { despesaGroups } from "@/lib/domain/groups";
```

**Replace** in `components/finance/plano/NewAccountDialog.tsx`:
```tsx
                  {BUILTIN_CATEGORIES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {groupLabel(g, expenseGroups)}
                    </SelectItem>
                  ))}
```
with:
```tsx
                  {despesaGroups(expenseGroups).map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label}
                    </SelectItem>
                  ))}
```

**3e. `components/finance/EntryDialog.tsx`: seven Replace blocks.**

Task 4 swapped this file's `EXPENSE_CATEGORY_LABEL` for `BUILTIN_CATEGORIES` (groups) and `BUILTIN_CATEGORY_LABEL` (labels); blocks 2, 4 and 7 find task 4's text. Afterwards the file imports `despesaGroups` from `@/lib/domain/groups` once and neither `BUILTIN_CATEGORY_LABEL` nor `BUILTIN_CATEGORIES`. The `ExpenseCategory` type import stays: the Grupo `onValueChange` still casts `category as ExpenseCategory`.

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
 * and takes no grupo or lote; the words about paying follow the direction.
```
with:
```tsx
 * and takes no grupo or lote; the words about paying follow the direction.
 * The Grupo picker lists the seven of the system, then the farm's under "da
 * fazenda"; an archived grupo shows only while the lançamento sits in it.
```

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
import { BUILTIN_CATEGORY_LABEL } from "@/lib/domain/labels";
```
with:
```tsx
import { despesaGroups } from "@/lib/domain/groups";
```

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```
with:
```tsx
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
```

**Replace** in `components/finance/EntryDialog.tsx` (the constant and the blank line after it go):
```tsx
const CATEGORY_LIST = BUILTIN_CATEGORIES;

/** The type switch: despesa, receita, then the three kinds outside the resultado. */
```
with:
```tsx
/** The type switch: despesa, receita, then the three kinds outside the resultado. */
```

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
```
with:
```tsx
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
```

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
  const groupAccounts = accountsByGroup(accounts)[group];
```
with:
```tsx
  // A farm grupo without contas has no entry in accountsByGroup.
  const groupAccounts = accountsByGroup(accounts)[group] ?? [];
  const groupOptions = despesaGroups(expenseGroups, { keep: fields.category });
  const farmGroups = groupOptions.filter((g) => g.custom);
```

**Replace** in `components/finance/EntryDialog.tsx`:
```tsx
                  <SelectContent>
                    {CATEGORY_LIST.map((category) => (
                      <SelectItem key={category} value={category}>
                        {BUILTIN_CATEGORY_LABEL[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
```
with:
```tsx
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
```

`SelectGroup` carries `p-1` in `components/ui/select.tsx`; `className="p-0"` keeps the farm grupos and the "da fazenda" label aligned with the seven, as in the canvas (C-Lancamento). `keep: fields.category` is the UI half of Review Focus 5. It follows the lote picker, which keeps a deleted lote while the field holds it. Editing a lançamento whose grupo is archived still shows and saves that grupo under "da fazenda". A new lançamento, and NewAccountDialog (`despesaGroups(expenseGroups)` without `archived`), never offer an archived grupo. On the Plano de contas page an archived grupo leaves the Despesas list for "Grupos arquivados".

Check that no removed name is left:

Run: `grep -nE "EXPENSE_GROUPS|ACCOUNT_GROUP_LABEL|EXPENSE_CATEGORY_LABEL|BUILTIN_CATEGORY_LABEL|CATEGORY_LIST" components/finance/EntryDialog.tsx components/finance/plano/*.tsx`
Expected: no output.

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run components/finance/__tests__/groupHeader.test.ts components/finance/__tests__/entryFields.test.ts components/finance/lancamentos/__tests__/entryActions.test.ts --exclude '**/worktrees/**'`
Expected: PASS. `entryActions.test.ts` imports `useEntryActions.tsx`, which imports `EntryDialog`, so it also proves the edited dialog still loads.

- [ ] **Step 5: Types and lint**

Run: `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint components/finance/plano/AccountsPage.tsx components/finance/plano/GroupHeader.tsx components/finance/plano/NewGroupDialog.tsx components/finance/plano/NewAccountDialog.tsx components/finance/EntryDialog.tsx components/finance/__tests__/groupHeader.test.ts`
Expected: both clean. This is wave 3, so every earlier task has landed and no error from another task is expected. An `@typescript-eslint/no-unused-vars` warning on these files means task 4 left an import behind (see 3d and 3e): remove it.

### Task 6: Smoke

**Files:**
- Create: `~/.cache/meubov-plan-2026-10-05-grupos/smoke.mjs` (outside the repo)

**Interfaces:**
- Consumes: the running app (tasks 1–5), the API routes of task 2, the UI labels of task 5.

- [ ] **Step 1: Throwaway database and server**

Run `docker ps` and `ss -ltnp` first and pick free names/ports. Then:
`docker run --rm -d --name meubov-grupos-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5453:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine`,
`DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5453/meubov pnpm db:migrate`,
`DATABASE_URL=… BETTER_AUTH_URL=http://localhost:3020 ./node_modules/.bin/next dev -p 3020`,
sign up `teste.grupos@meubov.local` with `POST /api/auth/sign-up/email` (with an `origin` header) and `pnpm db:seed --email teste.grupos@meubov.local`.

- [ ] **Step 2: Headless checks (desktop 1440 and phone 390)**

`node ~/.cache/meubov-plan-2026-10-05-grupos/smoke.mjs` signs in and checks, failing loudly on any miss:
1. "+ Grupo" creates "Máquinas e veículos"; "nutrição" and an existing name in another case are refused with the toast.
2. "+ Conta" under the farm grupo preselects it; the conta "Diesel" is created in it.
3. Novo lançamento: the Grupo picker shows the seven, then "da fazenda" with the grupo; a despesa in it saves; the Painel's Composição de custos and the Lançamentos tree show the grupo; an Orçamento line for it saves and shows.
4. The API refuses a despesa with an unknown grupo key (400 `invalid_category`) and a despesa whose conta sits in another grupo (400 `invalid_account`).
5. Excluir is absent on the used grupo; `DELETE /api/herd/expense-groups/:id` answers 409 `in_use`; a fresh empty grupo is deleted through its dialog.
6. Renomear inline renames it everywhere; Arquivar moves it under "Grupos arquivados (1)" and out of the Novo lançamento picker, while editing the old lançamento still shows it; Restaurar brings it back.
7. A view-only member sees no grupo action; the phone at 390 has no horizontal scroll.

- [ ] **Step 3: Tear down**

Kill the server by pid from `ss -ltnp`, then `docker rm -f meubov-grupos-db`.
