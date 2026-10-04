# Financeiro — orçamento — design

Date: 2026-09-30 · Canvas: "Financeiro — gestão completa", row B
(`B-Orcamento-Desktop.dc.html` = the page with Nutrição open,
`B-Orcamento-Edit.dc.html` = the edit dialog, `B-Orcamento-Phone.dc.html` =
the phone). Third of six cycles (after recorrência/parcelamento/anexos and
contas bancárias; then estoque, patrimônio, indexadores). Written before the
lançamentos cycle of 2026-10-01 landed; amended on 2026-10-02 for it: the
sub-navigation reads Lançamentos, and only `kind = expense` is realizado.

## Goal

The farm sets how much it plans to spend in each grupo of the plano de
contas over a safra, month by month, and sees at any day how much of it is
used, what is left, and where the safra is heading.

Out of scope: budgets for receitas (and a budgeted resultado), budgets per
lote or centro de custo, approval flows, e-mail alerts.

## Words

- **Safra**: twelve months starting in the farm's `safra_start_month`
  (October by default). "Safra 2025/26" = 01/10/2025–30/09/2026; with
  January as start it reads "Safra 2026" (01/01–31/12).
- **Grupo**: an expense category of the plano de contas (Nutrição,
  Pastagem, Mão de obra, Sanidade, Reprodução, Administrativo, Outros).
- **Conta**: a conta do plano inside a grupo ("Sal mineral").
- **Orçado**: what the farm planned for a month; **Realizado**: what was
  incurred; **Previsto até o fim**: where the safra is heading.

## Data

`farm` gains `safra_start_month` (1–12, default 10).

New table `budgets`: `id`, `farm_id` (cascade), `category` (expense
category), `account_id` (→ accounts, cascade; null = the grupo's own line),
`month` (date: the first day of a calendar month), `amount_brl` (numeric
≥ 0), `distribution` (`equal` | `previous` | `manual`; the mode last used
for that grupo/conta line, same on its twelve rows), `updated_at`,
`updated_by`. Unique on `(farm_id, category, coalesce(account_id, ''),
month)`. A row carries no safra: the safra it belongs to follows from the
farm's `safra_start_month` at read time, which is what lets a changed start
regroup saved months.

Types: `Budget` rows; `Farm.safraStartMonth`. Budgets load per safra on the
Orçamento page and for the Painel card (current safra only), never all
safras in the herd load.

## Rules

- **Months of a safra**: `safraMonths(safra, startMonth)` = the 12
  (year, month) pairs from startMonth of `safra` on. The current safra is
  the one containing today.
- **Orçado of a grupo in a month** = its own line when it has one for that
  safra; otherwise the sum of its contas' lines. A conta's orçado is its
  own line (none = no budget for that conta).
- **Realizado** (competência): every lançamento of `kind = expense` with
  `date` in the month counts, paid or not, under its category and conta;
  treatment costs count under Sanidade (no conta) on their date. Receitas,
  vendas, compras of animals, investimentos, financiamentos, sócios,
  rendimentos and transferências never count (`isCost` of
  `lib/domain/entries.ts`). A série's
  rows count by their own `date`. Up to today only; future-dated rows do
  not count as realizado.
- **Previsto até o fim** = realizado up to today + for each remaining month
  of the safra (including the rest of the current one): the larger of that
  month's orçado and the despesas already generated with a date in it
  (recorrências, parcelas, pendentes), the same rule for the current month
  and every later one, so a small recorrência never hides a month's orçado.
- **% usado** = realizado ÷ orçado of the same months up to today's month
  (orçado to date), shown as the bar; the table also shows the full-safra
  orçado. Tone: up to 90 % green (brand), 90–100 % attention, above 100 %
  overdue. A line with realizado and no orçado shows "sem orçamento".
- **Distribution** when a total is typed: `equal` = total ÷ 12 floored to
  the centavo, remainder on the last month; `previous` = proportional to
  the previous safra's realizado per month for that line (falls back to
  equal when that is zero), remainder on the last month; `manual` = the
  months as typed. Editing a month switches the mode to manual. The months
  always sum to the total; saving is refused otherwise.
- **Contas under a grupo**: optional. The dialog lets each conta get its
  own total and distribution. When a grupo has its own line and contas with
  lines, the page shows "as contas somam R$ X" in attention when they
  differ from the grupo total; nothing is blocked.
- **Copiar da safra anterior** ("Copiar"): source = previous safra's orçado
  or its realizado, optional adjustment in % (−50 to +100, default 0),
  rounding each month to the centavo. Copies only lines (grupo or conta)
  that have no budget yet in the target safra; reports "N linhas copiadas ·
  M já tinham orçamento". Copying the realizado creates grupo lines only.
- **Changing `safra_start_month`** changes which months form a safra; saved
  budgets keep their calendar months, so a changed start shows them spread
  over two safras. The setting's dialog warns about that when budgets
  exist.
- Removing a conta do plano removes its budget lines (cascade); removing a
  grupo's line keeps its contas' lines.
- Reads need Financeiro view; writes Financeiro edit; every query filters
  by `farm_id`; `account_id` checked against the farm and the category.
  Members without Financeiro never receive budgets (the page and the Painel
  card are behind the same check).

## UI

- **Sub-navigation**: Painel · Lançamentos · Contas bancárias · Orçamento.
- **/finance/orcamento**: header "Orçamento · safra 2025/26", sub "01/10/2025
  a 30/09/2026 · COE por grupo do plano de contas", Safra picker (previous,
  current, next), "Copiar". Strip: Orçado (safra inteira), Realizado até
  <mês> ("pago e a pagar até dd/mm"), Variação (% and R$ against the orçado
  to date, overdue colour when above), Previsto até o fim. Table "Por
  grupo": Grupo › Conta (expandable), Orçado, Realizado, % usado (bar +
  number), Previsto até o fim (overdue colour above orçado), Mês a mês
  (sparkline: bars = realizado, line = orçado), pencil "Editar orçamento de
  <grupo>"; a Total row; legend of the three tones. Grupos with neither
  orçado nor realizado are hidden. Empty safra: "Nenhum orçamento para esta
  safra" with "Copiar da safra anterior" and "Orçar um grupo".
- **Edit dialog** (per grupo): "Total do grupo (R$)", the previous safra's
  orçado and realizado as a hint, "Distribuir por mês" (Igual · Como a
  safra anterior · Manual, each with its preview line), "Meses da safra"
  (12 inputs labelled "out/25"…), the check "Soma dos meses confere com o
  total" (or the difference in overdue), and "Contas" collapsed: one row
  per conta of the grupo with its total and the same distribution choice.
  "Remover orçamento do grupo" when it has one.
- **Copiar dialog**: "Copiar de" (orçado · realizado) of safra X, "Ajuste
  (%)", preview of the total, "Copiar".
- **Phone**: strip in two columns; grupos as cards (name, bar, orçado /
  realizado / previsto) that open to their contas; the edit dialog as a
  sheet with months in 3 columns.
- **Painel card "Orçamento"**: a band under "Capital, dívidas e sócios":
  "Orçamento · safra 2025/26 · 58 % usado" with the bar, up to three grupos
  above 100 % ("Administrativo 134 %"), "Ver orçamento". Hidden when the
  current safra has no budget.
- **Configurações > Fazenda**: "Início da safra" (month select).

## Code

- Schema + migration `financeiro-orcamento`; `lib/types.ts`.
- `lib/domain/budget.ts` (pure, tested): `safraOf(date, startMonth)`,
  `safraMonths(safra, startMonth)`, `safraLabel`, `distribute(total, mode,
  previousShape?)`, `budgetView(budgets, expenses, treatments, accounts,
  safra, startMonth, today)` → per grupo and conta: orçado by month and
  total, orçado to date, realizado by month and to date, previsto, % and
  tone; plus totals.
- API (domain `budgets`): `GET /budgets?safra=`, `PUT /budgets` (one grupo
  or conta line: category, accountId?, safra, months[12], distribution),
  `DELETE /budgets` (same key), `POST /budgets/copy` (from, to, source,
  adjustPct); `PATCH /farm` accepts `safraStartMonth`. Route requirements
  and snapshots.
- Store: `loadBudgets(safra)`, `saveBudgetLine`, `removeBudgetLine`,
  `copyBudgets`; the current safra's budgets cached for the Painel card.
- UI: `app/(app)/finance/orcamento/page.tsx`, `components/finance/orcamento/*`,
  `BudgetCard` on the Painel, "Início da safra" in the farm settings.
- No new dependency.

## Tests

Pure: safra months for start 10 and 1, the label; distribution equal with
remainder, previous shape with a zero month and all-zero fallback;
realizado by competência (paid and unpaid, future rows excluded,
treatments under Sanidade, receitas and transferências excluded); grupo
orçado from its own line vs its contas; previsto with generated rows vs
orçado fallback; tones at 90 and 100 %. Use cases: save a line replaces its
12 rows; months not summing refused; conta of another farm or another
grupo refused; copy only fills empty lines and applies the %; view-only
member cannot write; another farm's budgets never returned. Smoke on a
throwaway database: set start month, budget two grupos (one with contas),
enter despesas across months, check the strip, the table, the sparkline
and the Painel card, copy to the next safra with +5 %, phone widths.
