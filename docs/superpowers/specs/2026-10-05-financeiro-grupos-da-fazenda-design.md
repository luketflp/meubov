# Grupos de despesa da fazenda

Canvas: https://claude.ai/artifact/CpJBqs1dHiej5uyrmcoDhg (direction A, "Grupo no cartão")

## Why

The plano de contas has seven fixed grupos of despesa (Nutrição, Pastagem, Mão
de obra, Sanidade, Reprodução, Administrativo, Outros). Some farms track costs
that do not fit them. "Máquinas e veículos" ends up as a conta under
Administrativo, and "Arrendamento" ends up under Outros. With this change a
farm can add its own **grupos de despesa** next to the seven. They count in the
COE exactly like the built-in ones, so they show in the Painel, the Orçamento,
Lançamentos and the lançamento form.

## Decisions

- **Despesas only.** A farm adds despesa grupos. Receitas and the three grupos
  outside the resultado (Investimentos, Financiamentos, Sócios) stay as they
  are.
- **The seven built-in grupos stay fixed.** They cannot be renamed, hidden or
  deleted, and they always come first, in today's order. The app writes into
  them by itself: treatment costs go to Sanidade and semen purchases to
  Reprodução.
- **A farm grupo is a row; a built-in grupo is a key.** The new table
  `expense_groups` holds the farm's grupos. The four columns that hold a
  grupo are `accounts.group`, `expenses.category`, `expense_series.category`
  and `budgets.category`. They change from Postgres enums to `text`. A
  built-in grupo keeps its key (`nutrition`, …), and a farm grupo is written
  as its row id. Existing rows need no backfill.
- **Management lives on the Despesas (COE) card of the Plano de contas
  (direction A).** "+ Grupo" sits in the card header. Each farm grupo carries
  a "da fazenda" tag and its own Renomear and Arquivar buttons, plus Excluir
  while nothing uses it. Archived grupos sit under "Grupos arquivados" at the
  end of the card.
- **A farm grupo looks the same as a built-in grupo everywhere else.** The
  "da fazenda" tag appears only on the Plano de contas page and in the
  lançamento form's grupo picker. That picker lists the seven built-ins, then
  the farm's grupos under a "da fazenda" divider.
- **Grupos come first and Estoque adapts.** The Estoque spec
  (`2026-10-05-financeiro-estoque-design.md`, in progress in another session)
  says an insumo's conta sits in "one of the seven" grupos. When this change
  lands, that rule becomes "a despesa grupo" (built-in or the farm's). Its
  Sanidade-first ordering in the brete stays keyed on `health`.

## Data

```
expense_groups
  id          text primary key (uuid)
  farm_id     integer not null references farm(id) on delete cascade
  name        text not null
  archived_at timestamp
  created_at  timestamp not null default now()
  unique (farm_id, lower(name))
```

The migration is written by hand after `drizzle-kit generate`:

1. `create table expense_groups …` and its unique index.
2. `alter table … alter column … set data type text using …::text` on
   `accounts.group`, `expenses.category`, `expense_series.category` and
   `budgets.category`. Drop and restore any column default around this step.
3. `drop type account_group; drop type expense_category;`

The unique indexes that include those columns, `(farm_id, group,
lower(name))` on accounts and the budgets line index, keep working on text.

The text columns get no foreign key, because a built-in key is not a row.
Validity is checked in the API instead (see Rules).

`Load.useCase` (the herd load) returns `expenseGroups`: every grupo of the
farm, archived ones included, ordered by `created_at`. Its contas order
changes from `asc(accounts.group)`, which relied on the enum's declaration
order, to the name. The client already groups contas.

## Types and domain

- `lib/types.ts`:
  - `BuiltinCategory` is the seven literals; it is the old `ExpenseCategory`.
  - `ExpenseCategory` becomes `string`: a built-in key or an
    `ExpenseGroup.id`. `AccountGroup` becomes `string` for the same reason.
    Its non-despesa values stay `"revenue"` and the three `CapitalGroup`
    values.
  - New: `ExpenseGroup { id; name; archivedAt?; createdAt }`.
  - New field: `HerdData.expenseGroups: ExpenseGroup[]`. An old offline
    snapshot without it reads as `[]`.
- `lib/domain/groups.ts` (new, pure) is the single source for grupo order and
  labels:
  - `BUILTIN_CATEGORIES`: the seven, in screen order.
  - `isBuiltinCategory(key)`.
  - `isDespesaGroup(key)`: true for anything other than `revenue`, a
    `CapitalGroup` or the tree's `expenses`.
  - `despesaGroups(groups, { archived? })`: the built-ins, then the farm's
    grupos by `createdAt`. Archived grupos are left out unless asked for.
    Returns `{ key, label, custom, archived }[]`.
  - `groupLabel(key, groups)`: the label of any grupo key, including
    `revenue` and the capital grupos. A key that resolves to nothing reads
    "Grupo removido".
- Constants that are removed so the compiler finds every reader:
  `EXPENSE_GROUPS`, `ACCOUNT_GROUP_LABEL` and `ACCOUNT_GROUPS`.
  - `EXPENSE_CATEGORY_LABEL` is renamed `BUILTIN_CATEGORY_LABEL` and keyed by
    `BuiltinCategory`.
  - `TOP_GROUP_LABEL` covers `revenue` and the capital grupos.
- Domain inputs that build labels gain `expenseGroups`: `LedgerInputs`
  (and so `PlanInputs`) and `BudgetInputs`.
  - `planTree` lists Despesas from `despesaGroups`.
  - A farm grupo that is archived shows in the tree only while it has a line
    in the window, the same rule as an archived conta.
  - `nodeParam` and `parseNode` accept any despesa key in `grupo:<key>`. An
    unknown key shows an empty pane titled "Grupo removido".
  - `budgetView` iterates `despesaGroups(…, { archived: true })` and keeps
    today's rule: a grupo with neither orçado nor despesas in the safra is
    left out.
- `accountsByGroup(accounts, includeArchived)` returns
  `Record<string, Account[]>`. The built-in and top grupos are pre-filled and
  a farm grupo appears when it has contas, so callers read `byGroup[key] ??
  []`.

## Rules (server)

- **Valid grupo key.** A despesa grupo key is valid when it is a built-in key
  or the id of an `expense_groups` row of the same farm.
  - It is checked by a shared `isFarmCategory(repo, farmId, key)` wherever a
    category or a conta grupo is written: `normaliseEntry` (lançamentos,
    séries, statement create-from-line), `AddAccount` and `PutBudgetLine`.
  - The Elysia schemas take `t.String({ minLength: 1, maxLength: 64 })` where
    they had the seven literals. An invalid key answers 400 `invalid_category`.
- **Archived grupos.** Archiving is a UI concept, like an archived conta. The
  server still accepts an archived grupo, so an old lançamento can be edited
  without moving it. The UI never offers an archived grupo as a new choice.
- **One source of truth.** A despesa with a conta must carry the conta's
  grupo (`account.group === category`), and a receita's conta must be in
  `revenue`. Anything else answers 400 `invalid_account`. This closes today's
  gap where `expenses.category` and `accounts.group` could disagree.
- **Grupo names.**
  - 1–40 characters, with at least one non-space.
  - Unique per farm regardless of case.
  - A name may not match a built-in label (also regardless of case), since
    two "Nutrição" grupos would be ambiguous.
  - A name that breaks any of these answers 409 `duplicate_name`.
- **Excluir grupo.**
  - Allowed only while no lançamento has the grupo as its category or points
    at one of its contas, and no série that still has lançamentos does.
    Otherwise it answers 409 `in_use`, and the UI suggests archiving. A série
    emptied by "Excluir todas" does not count.
  - The delete locks the grupo row (`for update`), then in one transaction
    deletes the grupo's own budget lines, its emptied séries, its contas
    (their budget lines cascade) and the grupo.

## API

All routes require `edit("finance")` and are added to `ROUTE_REQUIREMENTS`
and both route snapshots.

| Route | Body | Answers |
|---|---|---|
| `POST /api/herd/expense-groups` | `{ name }` | `ExpenseGroup`, or 409 `duplicate_name` |
| `PATCH /api/herd/expense-groups/:id` | `{ name?, archived? }` | `ExpenseGroup`; 404 `not_found`; 409 `duplicate_name` |
| `DELETE /api/herd/expense-groups/:id` | — | `{ id }`; 404 `not_found`; 409 `in_use` |

## UI

- **Plano de contas** (`AccountsPage`):
  - The Despesas (COE) card header gets "+ Grupo" (outline, sm), which opens
    `NewGroupDialog`. The dialog has a name field and the line "Entra no
    custo (COE) como os grupos do sistema…".
  - Each farm grupo section shows its name, the "da fazenda" tag, and
    Renomear (inline, like a conta), Arquivar (with a confirmation that names
    its contas and lançamentos) and Excluir (only when it has no lançamentos
    at all, with a confirmation), plus "+ Conta".
  - "Grupos arquivados (n)" closes the card. Each archived grupo has a
    Restaurar button.
  - The page subtitle and the info box mention grupos.
- **NewAccountDialog**: the Grupo select lists `despesaGroups(groups)`, the
  built-ins and then the farm's grupos without archived ones. A farm grupo
  opened through "+ Conta" preselects that grupo.
- **EntryDialog**: the Grupo select shows the same list under the "da fazenda"
  divider. Editing a lançamento whose grupo is archived keeps that grupo in
  the list.
- **Every other label** goes through `groupLabel`: CostBreakdownCard,
  FinanceCard, BillsCard, SeriesScopeDialog, ConciliarPage, AccountMovements,
  RecentEntriesCard, the Orçamento (page, edit dialog, cards, table, copy) and
  the finance export.
- **Store**: `expenseGroups` in the herd data and snapshot, plus
  `addExpenseGroup`, `updateExpenseGroup` and `removeExpenseGroup`.
  `removeExpenseGroup` returns `"deleted" | "in_use"`, drops the grupo, drops
  its contas from `accounts`, and drops its lines from the cached `budgets`.

## Testing

- Unit tests for `groups.ts`: order, labels, archived filtering and unknown
  keys.
- `planTree`, `budget` and `ledger` keep their tests, plus one case each with
  a farm grupo.
- Use-case tests with the db stub cover: expense-groups add (duplicate,
  built-in name), update (rename, archive), delete (in use, unused, cascades);
  `isFarmCategory`; `normaliseEntry` (unknown category, conta/grupo
  mismatch); AddAccount and PutBudgetLine with a farm grupo.
- Route requirements and the route table get new snapshot entries.
- The smoke test runs on a tmpfs database. It creates a grupo, adds a conta in
  it, records a despesa, an orçamento line and a Painel slice, then renames
  and archives the grupo (the form hides it, its history stays), deletes an
  empty grupo, and is refused when deleting a used one. It also checks the
  phone at 390 px.

## Out of scope

- Custom receita or capital grupos, and renaming or hiding the built-ins.
- Reordering grupos. Farm grupos keep their creation order.
- Moving contas between grupos. Renaming a conta still renames its history,
  and a conta stays in its grupo.
