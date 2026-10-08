# Relatórios financeiros: por grupo e extrato de conta bancária

Two new documents in Relatórios, modelled on the farm's ADM Rural papers ("Relatório de Grupos de Receitas e
Despesas" and "Extrato de Conta"). Canvas: https://claude.ai/artifact/E2xUf1zKVABzr19nVXeowq (direction approved).

## Decisions

- Both live in Relatórios as two more document cards, on the ReportScreen frame every document uses (Parâmetros
  card, live A4 preview, Baixar planilha, Imprimir ou salvar PDF). Both carry values in R$: Financeiro view only.
- The period defaults to last month. The ‹ › arrows of PeriodPicker move a whole-month window by whole months
  (01/09–30/09 back to 01/08–31/08), fixed in `shiftPeriodByMonths` itself, so every picker gains it.
- **Receitas e despesas por grupo** (`/relatorios/grupos`):
  - Regime: Competência (by the lançamento's date, paid or not; the default) or Caixa (only what was paid or
    received, by payment day). Vendas and compras de gado count on the manejo's date, treatment costs on the
    application day, under Sanidade, in both.
  - Receitas by conta (Receitas is one grupo), alphabetical, "Sem conta" last; % of the receita.
  - Despesas by grupo in `despesaGroups` order (alphabetical, Outros last; a removed grupo last), only grupos with
    lines; % of the despesas and % of the receita. "Contas de cada grupo" opens each grupo into its contas
    (alphabetical; treatments as "Tratamentos do calendário", lines without conta as "Sem conta", both last).
  - Saldo = receitas − despesas, in a box under Despesas and in the figures row (with Despesas / receita).
  - "Fora do resultado" adds Investimentos (compra de gado included), Financiamentos, Sócios and Rendimentos with
    entradas, saídas and líquido per grupo and conta; it never enters the saldo.
- **Extrato de conta bancária** (`/relatorios/extrato`):
  - Conta: all, or one. Always by payment day: a conta bancária only sees paid money, so there is no regime.
  - All contas: a Resumo (saldo anterior, entradas, saídas, saldo final per conta; total row over the contas that
    are not cartões, as "Saldo em contas"), then one section per conta, ordered as Contas bancárias orders them.
    Archived contas show only when they moved in the window.
  - A section: lines oldest first with Pagto, Emissão (competência), Vencto, Documento, Pago para / recebido de,
    Histórico with the conta do plano under it, Valor (signed) and Saldo after the line; then Saldo anterior
    (saldo at the end of the day before the window), Entradas, Saídas, Saldo final. Transferências show both
    sides, "Transferência" as their conta. A cartão's saldo is negative: what is owed.
  - Dates on paper read dd/mm, with the year (dd/mm/aa) when it is not the window's.
- Planilha: Grupos writes Receitas, Despesas (Grupo, Conta when opened) and Fora do resultado when on. Extrato
  writes Resumo and one Extrato sheet with a Conta column.

## Units

- `lib/reports/groups.ts` — `groupsReport(inputs: LedgerInputs, period, regime, todayIso)`: pure, from `ledgerRows`.
- `lib/reports/bankStatement.ts` — `bankStatement(inputs: PlanInputs, bankId | "all", period, todayIso)`: pure,
  from `accountMovements`, `accountBalance` and `ledgerRows`.
- `components/reports/tables.ts` — the export tables of both.
- `components/reports/GroupsSheet.tsx`, `BankStatementSheet.tsx` — the A4 sheets.
- `app/(app)/relatorios/grupos/page.tsx`, `extrato/page.tsx` — the screens; two DocCards on `/relatorios`.
- `PrintTable` gains `subRows` (indented, soft) for the opened contas.

## Tests

Vitest for both selectors (competência vs caixa, grupo order, contas, capital, saldo anterior across the opening
date, transferências, cartão, archived conta) and for the whole-month shift. Smoke in the real app on a tmpfs DB.
