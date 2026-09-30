# Financeiro — contas bancárias e conciliação — design

Date: 2026-09-29 · Canvas: "Financeiro — gestão completa", row B
(`B-Contas-Desktop.dc.html` = the accounts page with the movimentação of
one account, `B-Contas-Phone.dc.html` = the cards on the phone with the
Transferir sheet, `B-Conciliar-Desktop.dc.html` = the reconciliation of one
imported extrato). Second of six cycles (after recorrência, parcelamento e
anexos; then orçamento, estoque, patrimônio, indexadores).

## Goal

The farm sees how much money it has in each account today, and an extrato
imported from the bank (OFX or CSV) confirms, line by line, that MeuBov
holds the same payments and receipts as the bank.

Out of scope here: Open Finance or any direct bank connection, one bank line
matched to several lançamentos (or the reverse), parcelas inside a card
fatura, undoing or editing a whole import, offline use of these screens.

## Words

- **Conta**: a place money sits. Three kinds: **conta corrente** (a bank
  account; takes extrato imports), **caixa** (cash; no extrato), **cartão**
  (a credit card; its money is what is owed on it). Not to be confused with a
  **conta do plano** (the plano de contas of cycle 0), which the UI always
  calls "conta do plano".
- **Conta principal**: the one conta that "Pago por" defaults to. Always a
  conta corrente or caixa.
- **Saldo**: money in a conta on a day.
- **Transferência**: money moving between two contas of the farm (saque,
  aplicação, pagamento de fatura). Never in the resultado.
- **Extrato**: a bank file (OFX or CSV) imported into a conta corrente.
- **Linha do extrato**: one line of it (date, description, signed value).
- **Conciliar**: pair a linha do extrato with the MeuBov record it confirms.
- **Fatura**: the card purchases between two closing days, due on the due
  day.

## Data

New table `bank_accounts`: `id`, `farm_id` (cascade), `kind` (`checking` |
`cash` | `card`), `name` ("Sicredi"), `label` (free text, "c/c 12.345-6",
"final 4471"; nullable), `opening_balance_brl` (numeric; for a card, what
was owed on it that day, negative),
`opening_date` (date the opening saldo is true at the end of),
`is_main` (boolean; a partial unique index keeps one per farm),
`closing_day` and `due_day` (1–31, card only), `pays_from_id`
(→ bank_accounts, set null; card only: the conta corrente that pays the
fatura), `csv_mapping` (jsonb, nullable: `{ delimiter, dateColumn,
descriptionColumn, amountColumn | (inColumn, outColumn), dateFormat,
decimal, skipRows }`), `archived_at` (nullable), `created_at`.

`expenses` gains `bank_account_id` (→ bank_accounts, set null). `movements`
gains `bank_account_id` (→ bank_accounts, set null) for vendas and compras.

New table `transfers`: `id`, `farm_id` (cascade), `from_id`, `to_id`
(→ bank_accounts, restrict; different), `date`, `amount_brl` (> 0),
`notes`, `created_at`, `created_by`.

New table `statement_imports`: `id`, `farm_id` (cascade), `bank_account_id`
(cascade), `file_name`, `format` (`ofx` | `csv`), `period_from`,
`period_to`, `bank_balance_brl` (nullable; OFX LEDGERBAL), `bank_balance_date`
(nullable), `line_count`, `skipped_count` (lines already seen), `created_at`,
`created_by`.

New table `statement_lines`: `id`, `farm_id` (cascade), `bank_account_id`
(cascade), `import_id` (→ statement_imports, cascade), `date`,
`description`, `amount_brl` (signed: + entrada, − saída), `external_id`
(OFX FITID; for CSV a hash of date, description, value and the occurrence
count of that triple in the file), unique on `(bank_account_id,
external_id)`, `status` (`pending` | `matched` | `created` | `transfer` |
`ignored`), one of `expense_id` (→ expenses, set null), `movement_id`
(→ movements, set null), `transfer_id` (→ transfers, set null) when not
pending or ignored, `ignore_reason` (text; ignored only), `resolved_at`,
`resolved_by`. A lançamento or venda pairs with one line at most (unique on
`expense_id`, on `movement_id`); a transferência has two sides and pairs once
per conta (unique on `(transfer_id, bank_account_id)`). Indexes on
`(farm_id, status)` and on every `bank_account_id` column that points here.

Types: `BankAccount`, `Transfer`, `StatementImport`, `StatementLine`;
`Expense.bankAccountId?`, `Movement.bankAccountId?`. The herd load carries
`bankAccounts` and `transfers` (small); statement lines load per import on
the Conciliar page, never in the herd load.

## Rules

- **Saldo** of a conta corrente or caixa on day D = `opening_balance` +
  receitas received − despesas paid (paid/received date in
  (`opening_date`, D], `bank_account_id` = this conta) + vendas − compras
  with that conta and date in the same window + transferências in − out in
  the same window. Anything dated on or before `opening_date` is already in
  the opening saldo and never counted again.
- **Saldo em contas** (the page total) = the sum of every non-archived conta
  corrente and caixa. Cartões stay out.
- **Cartão**: a purchase on the card is a despesa with `bank_account_id` =
  the card and `paid_at` = the purchase date (it counts in the resultado on
  its own competência as always). It belongs to the fatura whose closing day
  is the first one on or after the purchase date; the fatura is due on the
  next `due_day` after that closing day (a short month uses its last day).
  The card takes a saldo inicial on `opening_date`: the valor em aberto that
  day, stored negative. Its saldo is computed like any conta's (purchases
  out, payments in), so the card's number is **A pagar no cartão** =
  −saldo of the card today: the saldo inicial owed plus every purchase
  minus every payment after `opening_date` (a fatura is paid after it
  closes, so no window-based subtraction). The footer keeps "vence dd/mm"
  of the fatura still open. Paying a fatura is a transferência from
  `pays_from_id` (or any conta corrente) to the card; it leaves the conta
  corrente, never the resultado. Money never leaves a cartão by
  transferência: a cartão is never De (`card_from`), only Para.
- **Pago por**: marking a lançamento paid or received — "Já pago" in the
  EntryDialog, "Marcar como pago/recebido", the payment of a parcela or
  ocorrência — asks for the conta, defaulting to the conta principal (a
  cartão is allowed for despesas only). Unpaying clears it. Pending
  lançamentos have no conta. A venda or compra registered by a manejo gets
  the conta principal on its date; the Extrato row action "Conta" changes
  it. Treatment costs never have a conta.
- **Before the contas**: existing paid lançamentos, vendas and compras keep
  `bank_account_id` null and count in no saldo. Creating the first conta
  makes it the conta principal.
- **Archiving** a conta hides it and removes it from "Pago por"; its rows
  keep pointing at it. A conta with no rows, transferências or extratos may
  be deleted instead. The conta principal cannot be archived until another
  one is principal.
- **Import**: a file ≤ 2 MB into a conta corrente. OFX (1.x SGML and 2.x
  XML) is read with our own parser: STMTTRN (DTPOSTED, TRNAMT, FITID, MEMO
  or NAME) and LEDGERBAL. CSV asks once for the mapping and stores it on the
  conta; later imports reuse it and show the first lines to confirm. Dates
  dd/mm/yyyy or yyyy-mm-dd; values "1.234,56", "-1234.56" or split in
  entrada/saída columns. Lines already seen (same `external_id` in the
  conta) are skipped and counted. A file with zero new lines is refused with
  "Nada novo neste extrato". Lines dated on or before the conta's
  `opening_date` are imported as `ignored` with reason "antes do saldo
  inicial".
- **Suggestions** (pure): for each pending line, candidates on the same side
  (saída ↔ despesa, compra, transferência out; entrada ↔ receita, venda,
  transferência in) with value equal to the centavo and not yet paired with
  another line, whose conta is this one or none: pending lançamentos by
  `due_date`, paid ones by `paid_at`, vendas/compras and transferências by
  `date`, each within ±5 days of the line. Confidence **alta** when the date
  is within 2 days and a word of 4+ letters of the counterparty (accents
  and case folded) appears in the description, or when exactly one
  candidate exists within 2 days; **média** otherwise. Several candidates:
  the closest date first, then alta before média. A candidate already
  suggested with alta to another line is offered to the others as média.
- **Confirming a pair**: the line becomes `matched` and points at the
  record. A pending lançamento becomes paid on the line's date from this
  conta, at the line's value when it differs (the dialog says "valor
  ajustado para R$ X"); a paid one with no conta gets this conta; a paid one
  with another conta is refused ("pago por outra conta"). A paid lançamento,
  a venda/compra or a transferência worth another value than the line is
  refused (`amount_differs`: "ajuste o valor antes de conciliar") — the
  saldo must equal the bank's. A venda or compra with no conta gets this
  one. "Confirmar as N de confiança alta" confirms every alta at once.
- **Without a pair**: "Criar lançamento" opens the EntryDialog prefilled
  (Despesa or Receita by sign, value, date, paid on that date by this conta,
  description as observação; only the conta do plano is left; the server
  pins the value to |line| and the payment to the line's date) and the line
  becomes `created`. "É transferência" asks the other conta (never a cartão
  for an entrada) and creates the transferência (direction by sign); the
  line becomes `transfer`. "Ignorar"
  asks a reason (tarifa já lançada, duplicada, outro) and the line becomes
  `ignored`.
- **Undo one line**: "Desfazer" on a resolved line returns it to `pending`.
  It does not unpay the lançamento, remove the created lançamento or the
  transferência; those stay and can be edited as usual.
- **Removing** a lançamento, a venda or a transferência that a line points
  at returns that line to `pending` (the FK sets it null and the status
  follows in the same transaction).
- **Editing** a paired record so it no longer agrees with its line —
  unpaying the lançamento, another conta, another value or kind; a venda's
  conta; a transferência's De, Para or value — unpairs that line in the same
  transaction (it goes back to `pending`); the store re-reads the herd. One
  more click to conciliate again.
- **Conferência**: when the import has `bank_balance_brl`, the Conciliar
  page shows "Banco: R$ X em dd/mm · MeuBov: R$ Y" and a difference in
  attention colour when they differ.
- Every read needs Financeiro view; every write needs Financeiro edit. All
  queries filter by `farm_id`; ids from the client are checked against it.

## UI

- **Sub-navigation**: Painel · Extrato · Contas bancárias.
- **/finance/contas**: header "Contas bancárias" with Transferir and Nova
  conta; "Saldo em contas" total; the account cards (name, label, Saldo or
  A pagar no cartão, footer: "conciliado até dd/mm" (a link to the last
  import, so its Desfazer stays reachable), "N a conciliar" pill, or
  "sem extrato" for caixa, "vence dd/mm" for cartão). Picking a card shows
  "Movimentação · <conta>": Período filter, table Data · Descrição · Conta
  do plano · Entrada · Saída · Saldo · Conciliação (conciliado / a
  conciliar), newest first, 10 per page, "Importar extrato (OFX/CSV)" on
  contas correntes. Phone: stacked cards, the list below as cards. Empty
  state: "Cadastre a primeira conta" with Nova conta.
- **Nova conta / Editar conta** dialog: Tipo (Conta corrente · Caixa ·
  Cartão), Nome, Identificação, Saldo inicial and "em" (date; for a cartão
  the "valor em aberto no cartão nessa data"; with extratos imported, "Mudar
  esta data não refaz extratos já importados"), Fechamento and Vencimento
  days and "Paga pela conta" (cartão), "Conta principal".
  Arquivar / Excluir in edit.
- **Transferir** sheet: De (never a cartão), Para, Valor, Data, Observação,
  the line "Sicredi fica com R$ … · o saldo em contas não muda" (or "O
  cartão fica com R$ … a pagar · o saldo em contas baixa R$ …" when Para is
  a cartão).
- **Importar extrato** dialog: file picker (OFX, CSV); for a CSV without a
  mapping, a step showing the first 5 lines as a table with a select per
  role (Data, Descrição, Valor or Entrada + Saída), delimiter and "pular N
  linhas"; result "38 linhas novas · 4 já importadas" and "Conciliar agora".
- **/finance/contas/[id]/conciliar/[importId]**: header with conta and file;
  progress bar "31 de 42 resolvidas"; Conferência line; filter Todas ·
  Sugestões · Sem par · Conciliadas with counts; "Confirmar as N de
  confiança alta"; each linha do banco (date, description in mono, value)
  beside its match: conciliado (with Desfazer), a suggestion (confidence
  pill, the reason "mesmo valor, mesma data, mesmo favorecido", Confirmar /
  Outro lançamento), or "Sem lançamento correspondente" with Criar
  lançamento · É transferência · Ignorar. "Outro lançamento" lists every
  candidate of the line's side and value ±5 days, then a search by value.
  Phone: one line per card, actions as full-width buttons.
- **EntryDialog**: "Pago por" select under "Já pago" when checked (and in
  the mark-paid action as a small dialog when the farm has 2+ contas;
  with one conta it is used silently). Extrato gains a Conta column on
  desktop (hidden on phone) and the row action "Conta" for vendas/compras.

## Code

- Schema + migration `financeiro-contas-bancarias`; `lib/types.ts`.
- `lib/domain/bankAccounts.ts` (pure, tested): `accountBalance(account,
  inputs, day)` (a cartão's is negative: −saldo is "A pagar no cartão"),
  `faturaOf(card, date)`,
  `bankTotal(accounts, inputs, day)`, `accountMovements(account, inputs,
  period)` with the running saldo.
- `lib/domain/statements/ofx.ts`, `csv.ts` (pure, tested): parse to
  `{ lines: { date, description, amountBrl, externalId }[], bankBalance?,
  period }`; errors as codes (`not_ofx`, `no_lines`, `bad_date:<row>`,
  `bad_amount:<row>`).
- `lib/domain/statements/match.ts` (pure, tested): `suggestMatches(lines,
  candidates)`.
- API (domain `bankAccounts`): `POST/PATCH/DELETE /bank-accounts`,
  `POST /bank-accounts/:id/archive`, `POST/PATCH/DELETE /transfers`,
  `POST /bank-accounts/:id/imports` (file text in the body; parse, dedupe,
  store), `GET /imports/:id` (import + lines + candidates), `POST
  /statement-lines/:id/match`, `/create` (with the lançamento body),
  `/transfer`, `/ignore`, `/undo`, `POST /imports/:id/confirm-high`,
  `PATCH /movements/:id/bank-account`; `PATCH /expenses/:id` and `POST
  /expenses` accept `bankAccountId`. Route requirements and snapshot.
- Store: bank accounts, transfers, import and line actions; `markExpensePaid`
  takes the conta.
- UI: `app/(app)/finance/contas/page.tsx`,
  `app/(app)/finance/contas/[id]/conciliar/[importId]/page.tsx`,
  `components/finance/contas/*`, "Pago por" in `EntryDialog` and the
  mark-paid action, Conta column in the Extrato.
- No new dependency.

## Tests

Pure: saldo with opening date cut-off, transferências and vendas; card
fatura by closing day across month ends (day 31, February) and the payment
transfer; OFX 1.x SGML and 2.x XML samples (Sicredi-like, BB-like), CSV with
`;` and pt-BR decimals, split entrada/saída, the dedupe hash with two
identical lines; suggestions (exact value, ±5 days, alta by name, alta by
single candidate, one candidate for two lines). Use cases: import dedupe
and "Nada novo"; confirming a pending lançamento pays it with the conta;
refusal on "pago por outra conta"; create / transfer / ignore / undo;
deleting a paired lançamento returns the line to pending; another farm's
conta, line or import is 404; view-only member cannot write. Smoke on a
throwaway database: create Sicredi (principal), Caixa and a Cartão, pay a
bill by Sicredi, a card purchase, a transfer, import an OFX, confirm the
alta suggestions, create one lançamento from a line, mark a saque as
transferência, ignore a tarifa, check the saldos and the fatura, phone
width of the Contas page and the Conciliar page.
