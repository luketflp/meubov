# Financeiro — cockpit, extrato e plano de contas — design

Date: 2026-09-24 · Canvas: "Financeiro — cockpit", direction A (Placar) with
B's "custo × cotação" card; rows Extrato, Novo lançamento and Plano de contas.

## Goal

Financeiro opens on the owner's question — "estou ganhando dinheiro?" — and
answers it with the indicators the trade watches (Embrapa, Inttegra, Scot,
Rally da Pecuária), each next to a reference band and to the same window a year
earlier. Under the indicators sit the bookkeeping the farm asked for after
looking at ADM Rural: lançamentos with vencimento and pagamento, contas a pagar
e a receber, receitas lançadas à mão, a plano de contas with contas inside the
seven fixed grupos, and the lote as centro de custo. Every lançamento is
listed in an Extrato with filters and export.

Out of scope, kept for a follow-up: contas bancárias and conciliação,
orçamento, estoque de insumos, patrimônio and depreciação (COT), a bezerro
price feed, recorrência and parcelamento, anexos.

## Words

- **Lançamento**: one line of money the farm typed — a despesa or a receita.
  The table stays `expenses`; the domain type stays `Expense` and gains
  `kind`. Vendas, compras and tratamentos com custo are not lançamentos: they
  come from the manejos and appear in the Extrato as derived, locked rows.
- **Grupo**: one of the seven fixed `ExpenseCategory` values (Nutrição,
  Pastagem, Mão de obra, Sanidade, Reprodução, Administrativo, Outros) plus
  "Receitas" for receitas. Grupos are the COE composition and never change.
- **Conta**: a farm-defined name inside a grupo ("Sal mineral" in Nutrição,
  "Aluguel de pasto" in Receitas). Optional on a lançamento.
- **Centro de custo**: the lote a lançamento belongs to. Without one the
  lançamento is the farm's and is shared by head count.
- **COE** (custo operacional efetivo): despesas by competência (`date`) plus
  done treatments' `costBrl`. Compras de gado are capital, never cost.
- **@ produzidas**: carcass arrobas sold − arrobas bought + (herd arrobas at
  the end of the window − at its start). The industry's denominator for
  custo da @.
- **Caixa**: what was paid or received (`paidAt`), as opposed to competência.

## Data

`expenses` gains, all nullable unless said:

| column | meaning |
| --- | --- |
| `kind` (`entry_kind`: `expense` \| `revenue`, not null, default `expense`) | despesa or receita |
| `due_date` | vencimento; null means the `date` |
| `paid_at` | day it was paid/received; null means pendente |
| `counterparty` | "pago para / recebido de", free text like the manejo's comprador |
| `document` | "NF 4.812", free text |
| `account_id` → `accounts.id` (set null) | the conta |
| `lot_id` → `lots.id` (set null) | the centro de custo |

The migration backfills `paid_at = date` on every existing row: they were
typed as money already spent. A receita writes `category = 'other'`, which
nothing reads; its conta carries the meaning.

New per-farm table `accounts`: `id`, `farm_id` (cascade), `group`
(`account_group`: the seven categories plus `revenue`), `name`, `archived_at`.
Unique on `(farm_id, group, lower(name))`. No delete: a conta with lançamentos
is archived, which hides it from the form and keeps the history. Renaming
renames the history.

`HerdData.accounts: Account[]`; redaction keeps accounts (names only) and
still empties `expenses`.

A semen purchase keeps writing its `breeding` expense, now with `paidAt =
date`, `counterparty` = the bull's central when set, and `accountId` = the
farm's "Sêmen" conta in Reprodução when one exists (case-insensitive).

## Pages

### /finance — the cockpit

`RequireAccess area="finance" level="view"`. The window is the `PeriodPicker`
from the Painel, default the last 12 calendar months, kept in the URL as
`?de=YYYY-MM-DD&ate=YYYY-MM-DD` so "Ver extrato" carries it. Every figure on
the page follows the window; "ano anterior" is the same window shifted back by
its own length.

Desktop, `max-w-6xl`, gap 16:

1. `PageHeader` "Financeiro · Indicadores da pecuária de corte"; actions
   `PeriodPicker`, "Exportar" (`ExportMenu`, xlsx + print: the Placar's table
   and the Por lote table), "Lançar" (the `EntryDialog`, Financeiro edit only;
   the view level shows `ReadOnlyPill`).
2. **Caixa do período**, one card in five cells: Recebido (receitas received in
   the window, by `paidAt`, plus priced vendas by date), A receber (receitas
   with `paidAt` null, any date), Pago (despesas paid in the window plus
   treatment costs by date), A pagar (despesas with `paidAt` null; the sub says
   how many are vencidas), Saldo realizado (recebido − pago, healthy/overdue).
3. **Placar**, a 3-column grid of `IndicatorCard`s, the second cell spanning two
   columns:

   | card | value | sub / delta | band |
   | --- | --- | --- | --- |
   | Resultado do período | receita − COE | R$/ha (over the invernadas' hectares) · margem % · giro do capital (receita annualised ÷ valor do rebanho); delta vs ano anterior | custo ÷ receita against the system's teto |
   | Custo da @ produzida × cotação | three bars on one 0–max scale: custo da @ produzida, preço médio realizado (receita de vendas ÷ @ vendidas), cotação de hoje | margem na cotação (cotação − custo/@); "@ produzidas = vendidas − compradas + estoque = N"; delta of custo/@ vs ano anterior | Inttegra média / top written in the footnote |
   | @ produzidas | total, and @/ha/ano annualised | the three parts; delta | Brasil / Rally top |
   | Desembolso por cabeça | COE ÷ cabeças médias ÷ meses, R$/cab/mês | R$/cab/dia; delta | Inttegra teto |
   | GMD do rebanho | mean ADG of the animals weighed twice inside the window, ≥ 30 days apart | how many animals it covers; delta | Inttegra média / top |
   | Taxa de desfrute | cabeças vendidas ÷ cabeças médias, annualised, % | heads sold over heads; delta in pts | IBGE média / the system's meta |
   | Lotação | `herdStockingRateAuPerHa` today | cabeças and ha; delta | ABIEC média / 1,6 teto |
   | Relação de troca | 1 boi gordo ≈ N bezerros: (@ médias vendidas × cotação) ÷ preço médio do bezerro comprado in the window | "N @ por bezerro · pelas suas compras"; delta | none |

   Bands come from `lib/domain/benchmarks.ts`: value, source and safra, with
   `better: "low" | "high"`. The marker is healthy past the top, attention
   between top and média, overdue on the wrong side of média. A band whose
   meta depends on the production system (desfrute, custo ÷ receita,
   desembolso) uses `farmSystem`: cria when the window has calvings and the
   sold heads are mostly bezerros/garrotes; recria-engorda when it has no
   calvings and has compras; ciclo completo otherwise. The card names the
   system in the band's caption. Any figure without data shows "—" and the
   band is hidden; "ano anterior" without data hides the delta.
4. **Receita × Custo** (7 columns): the existing `BarChart`, now over the
   window's months, legend with the totals and the result. | **Mercado** (5):
   cotação and its monthly change with a `Sparkline`, then Relação de troca,
   Valor do rebanho (active arrobas × cotação, with the change of the herd's
   arrobas over the window valued at today's price) and Preço médio realizado;
   the source line replaces the old `MarketNotice` banner.
5. **Composição de custos** (6): one horizontal bar per grupo with R$ and %;
   a grupo opens (disclosure) to its contas, the largest grupo open by default;
   "Ver extrato" links with the window and the grupo. | **Contas** (6): tabs
   "A pagar · N" / "A receber · N", pending lançamentos oldest vencimento first
   with a checkbox that sets `paidAt` to today (edit only), value and
   "vence dd/mm" (overdue in red), total in the footer, "Lançar" in the header.
6. **Por lote**: a table with the active lotes: cabeças, custo direto
   (lançamentos with the lote + treatments of its animals), rateio (COE without
   lote × the lote's share of active heads), custo total, R$/cab/dia, GMD,
   @ produzidas (the lote's animals: sold from it − bought into it + their
   inventory change), custo/@, margem/@ at today's cotação; a "Fazenda" footer
   row. The footnote says how the rateio is split. Phone: one stacked block per
   lote with custo, R$/cab/dia and custo/@.
7. **Últimos lançamentos**: the five newest Extrato rows with status pill and
   "Ver extrato".

Phone: header stacked with `PeriodPicker` and "Lançar" on one line, then
Caixa as a 2-column grid (Saldo full width), the Placar in one column (the
bars card full width), then Receita × Custo, Composição, Contas, Últimos
lançamentos, Por lote, Mercado.

Removed: `FinanceKpis`, `LivestockIndicators`, `MarketNotice`, `QuoteChart`,
`CostBreakdownChart` (the donut), `CategorySalesTable` and its export,
`ExpensesList`, `RegisterExpenseDialog`. `DonutChart` goes if nothing else
uses it.

### /finance/extrato

Header with the way back to Financeiro, "Extrato · N lançamentos entre de e
até", actions "Exportar" (xlsx, csv, print of the filtered rows) and "Lançar".
Filters in one card: `PeriodPicker`, tipo (Tudo · Despesas · Receitas · Vendas ·
Compras · Tratamentos), grupo, conta, lote, status (pago/recebido, a pagar,
a receber, vencidas), and a text search over conta, counterparty, documento
and notes. Filters live in the URL.

Summary strip: Receitas, Despesas (COE), Vendas de gado, Compras de gado
("capital, fora do COE"), Resultado.

Rows, newest first, 50 per page: Data, Vencimento, Tipo pill, Conta over
grupo, Pago para / Recebido de, Documento, Lote ("fazenda" when none), Valor
(receitas and vendas with "+", healthy), Status pill, actions. A lançamento
has Editar (the `EntryDialog` filled in), Marcar como pago, Remover (the
existing remove flow). Derived rows show a lock and "do manejo": a venda or
compra is one row per manejo session (counterparty, "manejo · N animais ·
X @" as documento, the session's lote, `saleSummary().grossBrl` or
`totalAmountBrl`); treatments with cost are one row per day and name
("Sanidade · Vacina aftosa · 62 animais", the sum). Phone: the filters
collapse to the tipo tabs plus a "Filtros" sheet; rows become a list with
date, conta, "grupo · quem · lote", value and status; "Carregar mais"; a
floating "Lançar" button above the tab bar.

### Novo lançamento (`EntryDialog`)

Despesa | Receita segmented; Data and Valor; Grupo (the seven, or fixed
"Receitas") and Conta (the grupo's active contas, "Sem conta", and "+ nova
conta" which opens a small inline name field and creates it); Vencimento
(defaults to Data) and "Já pago" with the payment date (defaults on, today);
Pago para / Recebido de with suggestions from the farm's previous
counterparties; Documento; Lote (centro de custo) with "Fazenda toda" as the
default; Observação. Validation as today (date, value > 0); vencimento may not
be before the data. Editing shows the same dialog; a derived row cannot be
edited here and says so.

### /settings/plano-de-contas

A child of Configurações in the nav, `area: "finance"`, so it hides without
Financeiro. Header "Plano de contas" with "Sugerir contas padrão" and "Nova
conta". Left card **Receitas**: "Venda de gado" as a fixed automatic row, then
the farm's contas. Right card **Despesas (COE)**: one block per grupo with a
hint where the app writes there itself (Sanidade: tratamentos com custo;
Reprodução: compras de sêmen), the grupo's contas with the last 12 months'
total and lançamento count, and "+ Conta". Row actions: Renomear (inline),
Arquivar / Restaurar; archived contas sit under a "Arquivadas" disclosure.
"Sugerir contas padrão" creates the standard list below, skipping names the
farm already has:

- Receitas: Aluguel de pasto, Venda de esterco, Outras receitas.
- Nutrição: Sal mineral, Ração e suplemento, Silagem.
- Pastagem: Adubo, Sementes, Herbicida, Roçada.
- Mão de obra: Salários, Encargos, Diárias.
- Sanidade: Vacinas, Vermífugos, Medicamentos, Veterinário.
- Reprodução: Sêmen, IATF e hormônios, Touros.
- Administrativo: Energia, Combustível, Manutenção, Impostos e taxas,
  Contabilidade.

### Painel

`FinanceCard` keeps working: the monthly series adds receitas lançadas à mão
to revenue and skips them in cost; the composition skips them too.

## Rules of the figures

- Windows are inclusive ISO dates. Competência uses `date`; caixa uses
  `paidAt`. A pending despesa dated inside the window counts in COE and in
  A pagar at the same time.
- Arrobas sold: each sold animal's chute weight × its rendimento ÷ 15 (the
  `saleRows` figure); an animal sold without a chute weight uses its last
  weighing before the sale at the session's rendimento; without any weight it
  adds nothing and the card's footnote counts it.
- Arrobas bought: each entry animal's entry weight ÷ 30.
- Herd arrobas at a date: for each animal alive on that date (birth on or
  before it; active, or `inactiveDate` after it; not created by an entry
  manejo after it), its last weighing on or before the date ÷ 30, or, when it
  has none yet, its first weighing after the date. Animals never weighed add
  nothing.
- Cabeças médias: the mean of the head counts at the window's start and end.
- Annualising multiplies by 365 over the window's days.
- Per lote, "the lote's animals" are the animals in it today: the app has no
  animal-by-lote history. The rateio splits by today's active heads.
  `ponytail:` both by head count today; animal-days from the transfer history
  when a farm asks.
- Benchmarks (value · source · safra): custo da @ produzida média R$ 208, top
  R$ 165 (Inttegra 24/25); @/ha/ano Brasil 4,8, Rally top 12,9 (Athenagro
  2025); GMD média 429 g, top 654 g (Inttegra 24/25); desfrute Brasil 18,9 %
  (IBGE 2019), metas cria 35 %, ciclo completo 45 %, recria-engorda 55 %
  (Scot/Inttegra); lotação Brasil 0,93 UA/ha (ABIEC 2024), teto 1,6; custo ÷
  receita tetos cria 65 %, ciclo completo 70 %, recria-engorda 60 %
  (Inttegra); desembolso/cab/mês tetos cria R$ 34,70, ciclo completo R$ 52,40,
  recria-engorda R$ 57,83 (Inttegra 2018/19). Each band's caption names the
  source and year.

## Code

- Schema and migration `financeiro-lancamentos-e-plano-de-contas`: the enums,
  the new columns, the backfill, the `accounts` table.
- `lib/types.ts`: `Expense` fields, `Account`, `HerdData.accounts`.
- API: `expenses` gains `PATCH /expenses/:id`; new `accounts` domain with
  `POST /accounts`, `PATCH /accounts/:id`, `POST /accounts/defaults`; all
  `edit("finance")` in `routeRequirements.ts`. Load returns accounts.
  `AddPurchaseUseCase` fills the new fields.
- Store: `updateExpense`, `markExpensePaid`, `addAccount`, `updateAccount`,
  `seedDefaultAccounts`.
- Domain, pure and tested: `lib/domain/period.ts` (`Period` helpers moved from
  `components/dashboard/period.ts`, plus `priorPeriod`, `periodDays`,
  `annualise`); `lib/domain/ledger.ts` (`ledgerRows`, `filterLedger`,
  `cashSummary`, `ledgerSummary`); `lib/domain/economics.ts` rewritten around
  the window (`coe`, `revenue`, `arrobasSold`, `arrobasBought`,
  `herdArrobasAt`, `arrobasProduced`, `costPerArroba`, `outlayPerHeadMonth`,
  `periodAdg`, `offtakeRate`, `resultIndicators`, `exchangeRatio`,
  `farmSystem`, `lotEconomics`); `lib/domain/benchmarks.ts`;
  `lib/domain/accounts.ts` (`DEFAULT_ACCOUNTS`, `accountLabel`).
- `components/finance/`: `FinanceHeader`, `CashStrip`, `Placar`,
  `IndicatorCard`, `BenchmarkBand`, `CostVsPriceCard`, `MarketPanel`,
  `CostBreakdownCard`, `BillsCard`, `RecentEntriesCard`, `LotsEconomicsCard`,
  `EntryDialog`, `extrato/` (`ExtratoFilters`, `ExtratoTable`, `ExtratoList`),
  `plano/` (`AccountsPage`, `AccountDialog`).
- Pages: `app/(app)/finance/page.tsx`, `app/(app)/finance/extrato/page.tsx`,
  `app/(app)/settings/plano-de-contas/page.tsx`; `lib/nav.ts` child.
- Export: `lib/export/datasets/finance.ts` gains `ledgerExportTable`,
  `indicatorsExportTable`, `lotsEconomicsExportTable`; the old category sales
  table goes.
- Seed: default accounts, `accountId`/`lotId`/`paidAt` on the seed expenses,
  two receitas, three pending contas (one vencida).

## Tests

Unit tests for every function in `period.ts`, `ledger.ts`, `economics.ts`,
`benchmarks.ts` and `accounts.ts`, with fixtures covering: a sale without a
chute weight, an animal bought inside the window, an animal weighed for the
first time inside the window, a receita pending and a despesa vencida, a lote
with no animals. Use-case tests for `PATCH /expenses/:id` (mark paid, edit,
farm scoping), `accounts` (duplicate name → 409, archive/restore, defaults
idempotent). `routeRequirements` snapshot updated. xlsx export tests run with
`TZ=America/Sao_Paulo`. A smoke run of `/finance`, `/finance/extrato` and
`/settings/plano-de-contas` against a seeded throwaway database, desktop and
phone, with Financeiro at edit and at view.
