# Grupos livres no plano de contas, Financeiro desacoplado dos manejos

## Why

Two things the owner asked for on 2026-10-09.

1. **The Financeiro should hold only what the farmer types there.** Today a
   purchase of sêmen writes a Reprodução expense in the same transaction, and
   a done manejo sanitário with a cost shows up as a locked "Sanidade" line in
   the Extrato, the Painel, the Orçamento and the reports. The farmer wants
   the cost of doses controlled in Touros only, and the cost of a tratamento
   in Sanidade only.
2. **Every grupo of the plano de contas belongs to the farm.** The seven
   grupos de despesa, Receitas, Investimentos, Financiamentos and Sócios are
   fixed keys the farmer cannot rename, hide or delete, while the grupos the
   farm creates have Renomear, Arquivar and Excluir. The farmer wants the
   same control over all of them.

## Decisions

- **A purchase of sêmen is not a lançamento.** `semen_purchases` keeps date,
  doses, total and fornecedor; nothing is written in `expenses`. The
  lançamentos that purchases already wrote stay as ordinary lançamentos (the
  link column is dropped, the rows are not).
- **A tratamento's cost stays on the tratamento.** `Treatment.costBrl` is
  still recorded and shown in Sanidade, in the manejo detail and in the
  tratamentos export. It no longer becomes a ledger row, no longer counts in
  the COE (Painel, Ficha do lote, R$/@, Orçamento realizado, relatório por
  grupo) and no longer appears as "Tratamentos (manejos)" in the cost by
  grupo.
- **Tipos stay fixed; grupos are rows.** A lançamento's `kind` (despesa,
  receita, investimento, financiamento, sócios, rendimento) carries the
  meaning of the money and does not change. Every grupo of the plano, of any
  tipo, is a row of the farm in `plan_groups` (today's `expense_groups` with
  a `kind`). A farm starts with eleven: Receitas; Nutrição, Pastagem, Mão de
  obra, Sanidade, Reprodução, Administrativo, Outros; Investimentos,
  Financiamentos, Sócios. All of them can be renamed, archived, deleted while
  unused, and more can be added under any tipo.
- **No special grupo anywhere.** `BuiltinCategory`, `BUILTIN_CATEGORIES`,
  `BUILTIN_CATEGORY_LABEL`, `isBuiltinCategory`, `TOP_GROUP_LABEL`,
  `isDespesaGroup`, `despesaGroups`, `clashesWithFixedGroup` and the "Outros
  last" ordering are removed. Grupos sort alphabetically (pt-BR) inside their
  tipo. Treatment costs and sêmen purchases no longer write into any grupo,
  so nothing in the app depends on a grupo existing.
- **Every lançamento but a rendimento carries its grupo.** `expenses.category`
  holds a `plan_groups` id for despesas, receitas and the three capital kinds
  (today receitas and capital rows write the sentinel "other"). A rendimento
  writes null. The conta of a lançamento must sit in that grupo.
- **A tipo with one grupo reads flat.** In the Lançamentos tree and in the
  relatório por grupo, a tipo that has a single grupo lists that grupo's
  contas directly, so a farm that keeps the defaults does not read
  "Receitas › Receitas". "Has" counts the tipo's active grupos plus any
  archived or removed grupo with a line in the window, so a grupo header
  never disappears while another grupo of the tipo exists: the reader must
  still be able to tell which grupo a conta belongs to. The Plano de contas
  page always shows the grupo, because its header carries the actions.
- **Permissions.** Buying and deleting doses ask Reprodução edit only.
  Members without Financeiro view still do not see totals and R$/dose
  (`redactSemenBull` stays). Plan-group routes ask Financeiro edit, as the
  expense-group routes do today.

## Data

Migration `0030_grupos-livres.sql`, written by hand after `drizzle-kit
generate` and applied in one transaction:

```
create type plan_group_kind as enum ('revenue','expense','investment','financing','partners');
alter table expense_groups rename to plan_groups;
alter index expense_groups_farm_name_idx rename to plan_groups_farm_name_idx;
alter table plan_groups rename constraint expense_groups_farm_id_farm_id_fk to plan_groups_farm_id_farm_id_fk;
alter table plan_groups add column kind plan_group_kind not null default 'expense';
alter table plan_groups alter column kind drop default;
alter table plan_groups add column legacy_key text;

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
) as k(key, kind, name);

update accounts a set "group" = g.id
  from plan_groups g where g.farm_id = a.farm_id and g.legacy_key = a."group";
update expenses e set category = g.id
  from plan_groups g where g.farm_id = e.farm_id and e.kind <> 'yield'
  and g.legacy_key = case when e.kind = 'expense' then e.category else e.kind::text end;
update expense_series s set category = g.id
  from plan_groups g where g.farm_id = s.farm_id
  and g.legacy_key = case when s.kind = 'expense' then s.category else s.kind::text end;
update budgets b set category = g.id
  from plan_groups g where g.farm_id = b.farm_id and g.legacy_key = b.category;

alter table expenses alter column category drop not null;
update expenses set category = null where kind = 'yield';
alter table plan_groups drop column legacy_key;
alter table semen_purchases drop column expense_id;
```

Notes:

- No farm grupo can clash with a seeded name: `clashesWithFixedGroup`
  refused those names until now.
- The `(farm_id, group, lower(name))` unique index on `accounts` and the
  budgets line index keep working: the remap is one-to-one per farm.
- Still no foreign key from the four text columns to `plan_groups`; the API
  checks the grupo, as today.
- `expense_series.category` stays not null (a série is never a rendimento).

Schema (`lib/db/schema.ts`): `planGroups` table with `kind:
planGroupKindEnum`; `expenses.category` nullable; `semenPurchases` without
`expenseId`. Row types `PlanGroupRow`.

Every farm insert seeds the eleven defaults: `seedPlanGroups(tx, farmId)` in
`lib/api/domains/planGroups/seed.ts`, called by `Create.useCase` and
`EnsureForUser.useCase`. When a farm is created copying another one,
`copySetup` copies the source farm's non-archived grupos (kind and name)
instead of the defaults.

`Load.useCase` returns `planGroups` (every grupo, archived included, by
name) in place of `expenseGroups`.

## Types and domain

- `lib/types.ts`:
  - `GroupKind = Exclude<EntryKind, "yield">`.
  - `PlanGroup { id; kind: GroupKind; name; archivedAt?; createdAt }`
    replaces `ExpenseGroup`.
  - `AccountGroup` and `ExpenseCategory` stay `string` and now always mean
    a `PlanGroup.id`. `BuiltinCategory` and `CapitalGroup`-as-grupo are
    gone (`CapitalGroup` stays as the three capital kinds).
  - `Expense.category?: ExpenseCategory` — absent on a rendimento only.
  - `HerdData.planGroups?: PlanGroup[]` replaces `expenseGroups`; an old
    snapshot without it reads as `[]`.
  - `SemenPurchase` loses `expenseId`.
- `lib/domain/groups.ts`:
  - `GROUP_KIND_LABEL: Record<GroupKind, string>`: Receitas, Despesas,
    Investimentos, Financiamentos, Sócios.
  - `DEFAULT_GROUPS: readonly { kind: GroupKind; name: string }[]`: the
    eleven, in the order above.
  - `groupsOf(groups, kind, { archived?, keep? })`: the grupos of a tipo by
    name (pt-BR); archived ones only with `archived: true` or when their id
    is `keep`.
  - `groupLabel(id, groups)`: the name, or "Grupo removido".
  - `groupKind(id, groups)`: the kind, or null.
  - `GROUP_NAME_MAX` stays 40.
- `lib/domain/labels.ts` loses `BUILTIN_CATEGORY_LABEL`.
- `lib/domain/entries.ts`: `entryGroup(e)` returns `e.category ?? null`.
  `CAPITAL_GROUPS`, `isCapitalKind`, `entryFlow`, `mayPayFrom` unchanged.
- `lib/domain/accounts.ts`:
  - `DEFAULT_ACCOUNTS` is keyed by the default grupo's *name* (`{ group:
    "Nutrição", name: "Sal mineral" }`).
  - `accountsByGroup` returns `Record<string, Account[]>` with no
    pre-filled keys; callers read `byGroup[id] ?? []`.
  - `missingDefaults` is deleted (only its test used it).
- `lib/domain/semen.ts` loses `purchaseExpenseNotes`.
- `lib/domain/economics.ts`: `coe(expenses, period)`,
  `costBreakdownBetween(expenses, start, end)`, `costBreakdown(expenses,
  ref, months)` and `monthlyRevenueCost` drop their `treatments` input;
  `isCostedTreatment` goes. `EconomicsInputs` loses `treatments`: the COE
  was its only reader.
- `lib/domain/lotEconomics.ts`: the lote's cost is its despesas only.
- `lib/domain/budget.ts`: realizado from despesas only; `BudgetInputs`
  loses `treatments`.
- `lib/domain/ledger.ts`: no treatment rows; `LedgerKind` loses
  `"treatment"`; `LedgerInputs` loses `treatments` and renames
  `expenseGroups` to `planGroups`. A row's `group` is `entryGroup(e)`, with
  "capital" for a rendimento and a compra de gado, as today.
- `lib/domain/planTree.ts`:
  - `PlanNode` gains `{ type: "kind"; kind: GroupKind }` and its `group`
    variant becomes `{ type: "group"; id: string }`. `nodeParam`: a kind is
    `receitas | despesas | investimentos | financiamentos | socios`, a
    grupo is `grupo:<id>`. `parseNode` mirrors it. `legacyNode` keeps the
    `?tipo` map without `treatment` and drops `?grupo` (old keys no longer
    name anything).
  - The tree: Bancos e caixa, then the kinds in today's order (investment,
    financing, partners, expense, revenue) with today's labels, tags and
    figures. A kind's children are its grupos by name (an archived one only
    while it has a line in the window; an id that names no grupo, while its
    lines are there, as "Grupo removido"), each opening into its contas.
    Compra de gado stays the last child of Investimentos and Venda de gado
    the first of Receitas. **When a kind has exactly one grupo to show, the
    kind lists that grupo's contas (and its auto line) directly and the
    grupo item is not listed**; the kind's pane shows the same rows.
  - `belongs`: a kind takes the ledger kinds it took today (`expenses`:
    `expense` only); a grupo takes rows with `r.group === id`.
  - `EntryInitial` from a grupo nó is `{ kind: group.kind, category:
    group.id }`; from a kind nó, `{ kind }`.
  - `NodeSummary.crumb` for a conta is "<Tipo> › <Grupo>" or "<Tipo>" when
    the grupo is collapsed.
- `lib/reports/groups.ts`: `revenues` becomes `GroupLine[]` built like
  `expenses` (grupo, then contas), Venda de gado as a locked line of its
  own before the grupos; `TREATMENTS` and the treatment rows go.
  `GroupLine.custom` goes. The sheet (`app/(app)/relatorios/grupos`) hides
  the grupo header when a tipo has a single grupo.
- `lib/export/datasets/*`: `expensesExportTable` takes `planGroups`; the
  manejo and tratamentos exports keep `costBrl`.
- `lib/data/seed.ts` and `cli/seedCli.ts`: `SEED_GROUPS` with fixed ids
  (`grp-receitas`, `grp-nutricao`, …) written to `plan_groups`; accounts,
  expenses, séries and budgets of the seed point at them; receita and
  capital seed rows carry their grupo id.

## Rules (server)

- **Valid grupo.** `farmGroup(repo, farmId, id): PlanGroupRow | null`
  (`lib/api/domains/planGroups/farmGroup.ts`, replacing `isFarmCategory`)
  reads the grupo of this farm, archived or not.
  - `normaliseEntry`: a rendimento takes no category and no conta, as
    today. Any other kind must send `category` naming a grupo of the farm
    whose `kind` equals the lançamento's kind, else 400 `invalid_category`.
    A conta sent must have `account.group === category`, else 400
    `invalid_account`. The capital kinds no longer write "other".
  - `AddAccount`: `group` must name a grupo of the farm (any kind). The
    opening balance is allowed only when that grupo's kind is `financing`
    (`validOpening` takes the kind).
  - `PutBudgetLine`: the grupo must be of kind `expense`.
  - `ResolveLine` ("Criar lançamento" from a linha do extrato) sends the
    form's category for both directions.
- **Plan groups.**
  - Add: `{ kind, name }`. Name 1–40 characters with a non-space, unique per
    farm regardless of case across every kind; else 409 `duplicate_name`.
  - Update: `{ name?, archived? }`; the kind never changes.
  - Delete: today's `in_use` rule for any kind (a lançamento with the grupo
    as category or pointing at one of its contas, or a série that still has
    lançamentos), then budgets lines, emptied séries, contas and the grupo
    in one transaction under the row lock.
  - Archiving stays a UI concept: the server accepts an archived grupo so an
    old lançamento can be edited in place.
- **Sugerir contas padrão** (`SeedDefaults`): matches each default's grupo
  name against the farm's non-archived grupos (case-insensitive) and creates
  the contas that are missing; a default whose grupo is missing is skipped.
- **Sêmen.**
  - `writeSemenPurchase` inserts the purchase only; `AddPurchase` answers
    `{ purchase }`, `AddBull` answers `{ bull }`.
  - `DeletePurchase` answers `{ id }`; `DeleteBull` answers `{ id }` and
    loses `canRemoveExpenses` and `finance_forbidden`. The attachment
    cleanup that belonged to the expenses goes with them.
  - The semen controller drops both Financeiro edit checks;
    `ROUTE_REQUIREMENTS` sets the two purchase routes to
    `edit("reproduction")`.

## API

| Route | Body | Answers |
|---|---|---|
| `POST /api/herd/plan-groups` | `{ kind, name }` | `PlanGroup`; 409 `duplicate_name` |
| `PATCH /api/herd/plan-groups/:id` | `{ name?, archived? }` | `PlanGroup`; 404 `not_found`; 409 `duplicate_name` |
| `DELETE /api/herd/plan-groups/:id` | — | `{ id }`; 404 `not_found`; 409 `in_use` |
| `POST /api/herd/semen-bulls` | unchanged | `{ bull }`; 409 `duplicate_name` |
| `POST /api/herd/semen-bulls/:id/purchases` | unchanged | `{ purchase }`; 404 |
| `DELETE /api/herd/semen-bulls/:id/purchases/:purchaseId` | — | `{ id }`; 404; 409 `stock_negative` |
| `DELETE /api/herd/semen-bulls/:id` | — | `{ id }`; 404; 409 `doses_used` / `open_insemination` |

The `/expense-groups` routes are removed. Lançamento bodies: `category` is
optional in the schema and required by `normaliseEntry` for every kind but
`yield`.

## Store

`planGroups` replaces `expenseGroups` in the herd data and snapshot;
`addPlanGroup({ kind, name })`, `updatePlanGroup`, `removePlanGroup` replace
the expense-group actions with the same return shapes. The sêmen actions
stop merging or removing `expenses`.

## UI

- **Plano de contas** (`AccountsPage`):
  - Subtitle: "As contas de cada grupo. Todos os grupos são da fazenda:
    renomeie, arquive ou exclua os que não usa."
  - Receitas card: the Venda de gado automatic line, then one
    `GroupSection` per grupo of kind `revenue` with the full header
    (Renomear, Arquivar, Excluir while unused, "+ Conta"); "+ Grupo" in the
    card header creates a receita grupo.
  - Fora do resultado card: the Compra de gado automatic line, then every
    grupo of the three capital kinds, flat, by name; each header shows a
    kind pill ("investimento", "financiamento", "sócios") and a financiamento
    grupo shows the saldo devedor as today. "+ Grupo" asks the tipo (three
    radios) and the name.
  - Despesas (COE) card: as today, every grupo with the full header; the
    "da fazenda" tag goes.
  - "Grupos arquivados (n)" closes each card that has any.
  - `GroupHeader` takes a `PlanGroup`; `NewGroupDialog` takes the kind (or
    the three-radio picker).
- **NewAccountDialog**: after a non-bank place, a Grupo select lists
  `groupsOf(planGroups, kind)` and is preselected when opened from a
  grupo's "+ Conta". The place labels stay.
- **EntryDialog**: the Grupo select shows for every kind but rendimento, in
  the slot the despesa form has today, listing `groupsOf(planGroups,
  fields.kind, { keep })`. Changing the tipo moves the category to the
  first grupo of the new tipo and clears the conta. With no active grupo
  of that tipo the select shows "Nenhum grupo — crie um no Plano de contas"
  and saving is refused with "Escolha o grupo." The dialog must still fit
  576 px on the laptop frame (`~/.cache/meubov-canvas/novo-lancamento/
  measure-dlg.mjs`).
- **Lançamentos pelo plano** (`PlanTreeNav`, `NodePane`, `PaneRows`,
  `LancamentosToolbar`, `useEntryActions`, `CapitalStrip`): kind and grupo
  nós as above; "Novo" on a grupo starts in it.
- **Painel**: `CostBreakdownCard` lists despesas by grupo with
  `groupLabel`, no treatment line.
- **Orçamento**: `groupsOf(planGroups, "expense")`; "Orçar um grupo"
  starts at the first one without an orçado.
- **Relatórios › Receitas e despesas por grupo**: receitas by grupo and
  conta like despesas; no "Tratamentos do calendário" line.
- **Touros** (`semen-bulls-list`, `semen-bull-page`, `semen-bull-dialog`,
  `semen-purchase-dialog`, `use-delete-semen-bull`): "Registrar compra" and
  the purchase's delete need Reprodução edit; the "Vira despesa de
  Reprodução no Financeiro" hints go; the delete confirm reads "Excluir o
  touro X?" with "As compras dele saem junto." when it has purchases; cost
  columns still need Financeiro view.
- **Sanidade / manejo**: no change.

## Testing

- `groups.ts`: `groupsOf` order, archived and keep, `groupLabel`,
  `groupKind`.
- `planTree`: kind and grupo nós, the single-grupo collapse, archived
  grupo with lines, "Grupo removido", no treatment rows.
- `ledger`, `economics`, `lotEconomics`, `budget`: treatments no longer
  counted.
- `reports/groups`: receitas by grupo, collapse flag, no treatments.
- `accounts.ts`: `accountsByGroup` without prefill; `DEFAULT_ACCOUNTS` by
  name.
- Use cases: plan-groups add (kind, duplicate across kinds), update, delete
  (any kind, in use); `farmGroup`; `normaliseEntry` (receita without
  category, grupo of another kind, conta/grupo mismatch, rendimento);
  `AddAccount` (opening balance only on a financing grupo);
  `PutBudgetLine` (receita grupo refused); `SeedDefaults` (renamed and
  missing grupos); `Create`/`EnsureForUser` seed the eleven; sêmen add,
  delete purchase and delete bull without expenses.
- Route requirements and both route snapshots.
- **Migration test** on a tmpfs database: apply up to 0029, insert a farm
  with contas, lançamentos of every kind, a série, a budget line and a
  sêmen purchase with its expense using the old keys, apply 0030, and
  assert every row points at the farm's new grupo of the right kind, the
  rendimento has a null category, the sêmen expense still exists as a
  lançamento and the purchase lost its link.
- Smoke on a tmpfs database and a dev server: rename and archive
  Receitas, add a second receita grupo and record a receita in it, delete
  an unused capital grupo, record a tratamento with cost and check the
  Painel and the Extrato do not count it, buy doses as a member with
  Reprodução edit only and check the Financeiro is untouched. Desktop and
  390 px.

## Out of scope

- Moving a conta between grupos; reordering grupos.
- Orçamento for receitas or capital grupos.
- Foreign keys from the grupo columns to `plan_groups`.
- Copying contas when a farm is created from another.
- Deleting the lançamentos that sêmen purchases wrote before this change.
- Any finance figure derived from tratamentos.
