# Financeiro — lançamentos pelo plano de contas e investimentos — design

Date: 2026-10-01 · Canvas: "Financeiro — lançamentos e investimentos"
(`Main.dc.html` = a bank picked, `L-Investimento.dc.html`,
`L-Financiamento.dc.html`, `L-Dialog-Lancamento.dc.html`,
`L-Dialog-Conta.dc.html`, `L-Phone-Arvore.dc.html`, `L-Phone-Conta.dc.html`,
`L-Painel.dc.html`). Generator: `~/.cache/meubov-canvas/lancamentos/`. Comes
before the orçamento cycle, whose spec (2026-09-30) stays as written except
that its sub-navigation reads "Lançamentos" where it says "Extrato".

## Goal

The farm keeps in MeuBov the money that is neither custo nor receita —
benfeitorias and máquinas, aplicações, consórcios and empréstimos, retiradas
dos sócios — and finds every lançamento the way ADM Rural shows it: the plano
de contas as a tree on the left, the saldo and the extrato of the picked conta
on the right, and one toolbar that acts on the picked lançamento.

Out of scope: a cadastro de bens and depreciação (the patrimônio cycle), a
contract behind an empréstimo (taxa, tabela de juros, juros apart from
amortização), creating one of the new kinds from a linha do extrato in the
conciliação (an existing one is still matched), orçamento, offline use.

## Words

- **Fora do resultado**: money that moves without being custo (COE) or
  receita. Four kinds of it:
  - **Investimento**: buying something that stays (benfeitorias, máquinas e
    implementos, equipamentos). Compras de gado already are capital and show
    here too, written by the manejos.
  - **Financiamento**: an empréstimo, financiamento or consórcio. It has a
    **saldo devedor**.
  - **Sócios**: retiradas, distribuição de lucro, acertos de partilha, aportes.
  - **Rendimento**: what an aplicação earned. It raises the saldo of the
    aplicação and is not a receita.
- **Aplicação**: a fourth kind of conta bancária, beside conta corrente,
  caixa and cartão. Aportes and resgates are transferências.
- **Movimento**: the direction of a lançamento fora do resultado. Investimento:
  Compra (saída) or Venda do bem (entrada). Financiamento: Pagamento (saída) or
  Liberação (entrada). Sócios: Retirada (saída) or Aporte (entrada).
- **Nó**: a row of the tree. "Todos os lançamentos", the six top groups, the
  seven grupos of Despesas, each conta do plano, each conta bancária, and the
  two automatic lines (Compra de gado, Venda de gado).
- **Contra partida**: the other side of a line. In a conta bancária it is the
  conta do plano (or the other conta of a transferência); in a conta do plano
  it is the conta bancária that paid or received.

## Data

Enums gain values: `entry_kind` + `investment`, `financing`, `partners`,
`yield`; `account_group` + `investment`, `financing`, `partners`;
`bank_account_kind` + `investment`. New enum `entry_flow` (`in`, `out`).

`expenses` and `expense_series` gain `flow` (`entry_flow`, nullable): set on
investment, financing and partners rows, null on the others.

`accounts` gains `opening_balance_brl` (numeric, nullable) and `opening_date`
(date, nullable): the saldo devedor of a financiamento at the end of that
day. Both or neither; only on the `financing` group.

Types: `EntryKind` and `AccountGroup` with the new values, `EntryFlow`,
`Expense.flow?`, `Account.openingBalanceBrl?` and `openingDate?`,
`BankAccountKind` with `"investment"`. A row of the new kinds writes
`category = "other"` and no `lotId`, like a receita writes its category today.

No backfill: existing rows are despesas and receitas.

## Rules

- **Direction**: `entryFlow(e)` is `in` for a receita and a rendimento, `out`
  for a despesa, and `e.flow` for the other three. Everything that follows
  money (saldo of a conta bancária, caixa do período, contas a pagar e a
  receber, "Marcar como pago / recebido", the status words, the conciliação
  match and its side check) reads the direction and takes every kind.
- **Resultado**: the COE counts only `kind = expense`, the receita only
  `kind = revenue`. Indicators, composição, custo por lote, receita × custo,
  the Despesas export and the reports read the kind, never "not a receita".
- **What a lançamento needs**:
  - investimento, financiamento, sócios: a conta do plano of the same group,
    of this farm, and a movimento. No grupo, no lote.
  - rendimento: an aplicação of this farm as its conta bancária, `paidAt` =
    its date, no conta do plano, no vencimento, no repetition.
  - despesa and receita: as today.
  A request that breaks one of these is refused (`invalid_account`,
  `invalid_bank_account`).
- **Pago por**: a cartão pays a despesa or the compra of an investimento,
  nothing else. An aplicação never appears in "Pago por"; money reaches it
  and leaves it by transferência, and it earns by rendimento.
- **Saldo em contas** counts contas correntes, caixas and aplicações;
  cartões stay out, as today.
- **Saldo devedor** of a financiamento on a day = its saldo inicial (0 when
  none) + the liberações received − the pagamentos paid, each counted by its
  payment day, after the conta's `opening_date` and up to that day. The
  group's saldo devedor is the sum of its contas that are not archived.
- **Parcelas of a financiamento** are ordinary parcelas: a pagamento lançado
  "Parcelado" or "Recorrente" is the list of what is still to pay. Juros are
  not split: to have them in the custo, the farm types them as a despesa.
- **Figures of the tree**, for the window of the page unless said:
  - a conta bancária: its saldo today (a cartão: what is owed, negative);
    "Bancos e caixa": saldo em contas today.
  - a conta of Investimentos: compras − vendas do bem by `date`; "Compra de
    gado": the compras of the manejos; the group: their sum.
  - a conta of Financiamentos and the group: saldo devedor today.
  - a conta of Sócios and the group: retiradas − aportes by `date`.
  - a grupo and a conta of Despesas: despesas by `date`, with the treatment
    costs under Sanidade; "Despesas": the COE.
  - a conta of Receitas: receitas by `date`; "Venda de gado": the vendas of
    the manejos; "Receitas": their sum.
  A zero shows "—". An archived conta appears only while it has a line in
  the window.
- **Rows of a nó**:
  - a conta bancária: its movimentação in the window (paid lançamentos,
    vendas, compras and transferências by payment day), each with the saldo
    after it, newest first — what Contas bancárias shows today.
    "Bancos e caixa" is the movimentação of every conta together, both
    sides of a transferência, without saldo; its Entradas and Saídas are
    what crossed the edge of the saldo em contas (a cartão's lines and the
    transferências between two contas stay out, paying a fatura is a saída).
  - any other nó: the lançamentos and the automatic rows that belong to it
    by `date` in the window, newest first. A financiamento also shows the
    saldo devedor after each line that moved it, in payment order; its
    Liberado and Pago count since the saldo inicial, whatever the window,
    so the strip adds up to the saldo devedor.
- **Parcelar** turns one pending lançamento that is not part of a série into
  N parcelas (2–48): its value is the total, split as a new parcelamento is,
  the first parcela keeps its id and its anexos. Not for a rendimento.
- **Duplicar** opens "Novo lançamento" filled from the picked one, dated
  today, pending, without anexos and without repetition.
- **Access**: unchanged. Reads need Financeiro view, writes Financeiro edit,
  every query filters by farm. Members without Financeiro receive no
  lançamento of any kind and no saldo inicial of a conta.

## UI

- **Sub-navigation**: Painel · Lançamentos · Contas bancárias.
  `/finance/extrato` redirects to `/finance/lancamentos`, keeping `de`, `ate`,
  `q`, `lote`, `status` and turning `conta`, `grupo` and `tipo` into the nó.
- **/finance/lancamentos** (xl and up; a narrower screen behaves as the
  phone does, tree first and then the pane): header with the period and
  Exportar; the toolbar; then two columns.
  - **Plano de contas** (left): search, "Todos os lançamentos", then the six
    groups — Bancos e caixa (saldo), Investimentos (no período),
    Financiamentos (devedor), Sócios (retirado), Despesas (custo, with the
    seven grupos that open to their contas), Receitas — each row with its
    figure. "+" opens Nova conta, the gear goes to Configurações › Plano de
    contas. The picked nó lives in the URL (`conta`), groups open and close
    in place.
  - **The pane** (right): where the nó sits, its name with its kind pills
    ("investimento", "fora do custo (COE)"), its own actions (a conta
    bancária: Transferir, Importar extrato; an aplicação: Lançar rendimento),
    a strip of four figures, then "Extrato | Detalhado", the lote filter,
    "Só pendentes" and a search. The strips:
    - todos: Receitas · Despesas (COE) · Resultado · Fora do resultado
    - despesa: No período · Pago · A pagar · % do COE
    - receita: No período · Recebido · A receber · % da receita
    - conta bancária: Saldo hoje · Entradas · Saídas · Conciliação (a
      cartão: fatura aberta; an aplicação: rendimento no período)
    - investimento: Investido no período · Pago · A pagar · Desde o início
    - financiamento: Saldo devedor · Liberado · Pago · Próxima parcela, and
      the "% quitado" bar
    - sócios: Retirado · Aportado · Líquido · A pagar
  - **Extrato**: Data, Histórico (who or what, with documento and parcela
    under it), Contra partida, Valor signed, and Saldo (conta bancária),
    Saldo devedor (financiamento) or Status. **Detalhado**: Data with the
    vencimento under it, Histórico with pago para and documento, Lote, Pago
    por, Valor, Status. 50 rows a page.
  - **Toolbar**: Novo · Editar · Excluir · Marcar como pago · Parcelar ·
    Duplicar · Imprimir. A row is picked with its radio; the buttons that do
    not apply to it are disabled (a row of the manejos takes only its conta
    bancária, as today). Novo starts on the picked nó. Imprimir prints the
    rows shown. A member who only views Financeiro keeps Imprimir and Ver
    anexos. Renaming a conta stays in Configurações › Plano de contas.
- **Phone**: without a nó the page is the tree; a nó opens its pane with
  "Plano de contas" to go back. Tapping a row opens the sheet with the same
  actions; "Lançar" floats over the tab bar.
- **Novo lançamento**: the type becomes Despesa · Receita · Investimento ·
  Financiamento · Sócios. The three new ones show a line saying they stay
  out of the custo and the resultado, Conta (required, "+ nova conta") and
  Movimento, and hide Grupo and Lote; the rest (vencimento, já pago, pago
  por, repetir, pago para, documento, anexos, observação) is the same.
- **Lançar rendimento** (from an aplicação): data, valor, observação.
- **Nova conta**: "Onde ela fica no plano" — Banco ou caixa (continues in the
  conta bancária form, now with Aplicação), Investimento, Financiamento
  (asks "Saldo devedor inicial" and "Em"), Sócios, Despesa (asks the grupo),
  Receita — then the name.
- **Configurações › Plano de contas** gains the three groups under "Fora do
  resultado"; a financiamento shows and edits its saldo inicial. "Sugerir
  contas padrão" also offers Benfeitorias, Máquinas e implementos,
  Equipamentos and Distribuição de lucro.
- **Contas bancárias**: Aplicação as a kind, in the cards and in the saldo.
- **Painel**: under the caixa, "Capital, dívidas e sócios" with Investido no
  período, Aplicações (saldo and rendimento), Saldo devedor and Retirado
  pelos sócios, each opening its nó; hidden while all four are zero. The
  caixa and Contas a pagar / a receber now carry every kind.

## Code

- Schema + migration `financeiro-investimentos`; `lib/types.ts`; mappers.
- `lib/domain/entries.ts` (pure, tested): `entryFlow`, `isCost`,
  `isRevenue`, the labels of kind and movimento, `entryGroup(e)`.
- `lib/domain/planTree.ts` (pure, tested): `planTree(inputs, period, today)`
  → the nós with their figures; `parseNode` / `nodeParam`; `nodeRows(node,
  inputs, period, today)` → the pane's rows with contra partida and running
  saldo; `nodeFigures` → the numbers of each strip; `debtBalance`.
- `lib/domain/ledger.ts`, `bankAccounts.ts`, `economics.ts`,
  `lotEconomics.ts`, `statements/match.ts`, `accounts.ts`,
  `moneyRedaction.ts`, the finance export dataset: read the direction or
  the kind as the rules say.
- API: `POST/PATCH /expenses` accept the kinds and `flow` and validate them;
  `POST /expenses/:id/split`; `/accounts` accept the groups and the saldo
  inicial; `/bank-accounts` accept `investment`; `isPayingAccount` by
  direction and kind. Route requirements and snapshots.
- Store: `splitExpense`; the account actions carry the saldo inicial.
- UI: `app/(app)/finance/lancamentos/page.tsx`,
  `components/finance/lancamentos/*` (page, tree, pane, tables, toolbar,
  phone list), the redirect at `/finance/extrato`, `EntryDialog`,
  `YieldDialog`, `NewAccountDialog`, `AccountsPage`, `BankAccountDialog`,
  `FinanceSubnav`, `CapitalStrip` on the Painel. The old
  `components/finance/extrato/*` goes, except what the new pages reuse.
- No new dependency.

## Tests

Pure: direction of each kind; COE and receita ignore the new kinds
(indicators, composição, por lote, monthly series); caixa and contas a pagar
take them by direction; saldo of a conta bancária with a liberação, a
pagamento, a retirada and a rendimento; saldo devedor with and without saldo
inicial, before and after its date; the tree's figures per kind of nó and an
archived conta; the rows of each kind of nó, with contra partida and running
saldo; the redirect's mapping of the old filters. Use cases: an investimento
without conta or with a conta of another group or farm is refused; a cartão
refuses a retirada; a rendimento outside an aplicação is refused; split
keeps the first id, sums to the total and refuses a paid row or a row of a
série; a member without Financeiro gets none of it. Smoke on a throwaway
database: create one conta of each new group and an aplicação, lançar a
compra parcelada, a liberação and two pagamentos, a retirada recorrente, an
aporte and a rendimento, then check the tree, each pane, the toolbar's seven
actions, the Painel strip, that the Placar did not move, and the phone
widths.
