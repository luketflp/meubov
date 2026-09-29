# Financeiro — recorrência, parcelamento e anexos — design

Date: 2026-09-28 · Canvas: "Financeiro — gestão completa", row A
(`Main.dc.html` = the dialog in Parcelado, `A-Dialog-Phone.dc.html` = the
sheet in Recorrente, `A-Bills.dc.html` = Contas and Extrato markers with the
"Editar recorrência" choice). First of six cycles (then contas bancárias,
orçamento, estoque, patrimônio, indexadores); the Financeiro sub-navigation
drawn on every screen ships here.

## Goal

A lançamento can be split into parcelas or repeat every month or week, so
"A pagar" and "A receber" show what is coming without typing each bill, and a
photo or PDF of the NF or recibo stays attached to it.

Out of scope here: bank accounts (next cycle), offline anexos (they need
signal), OCR of the NF.

## Words

- **Série**: the rule that produced several lançamentos — a **parcelamento**
  (N parcelas of one purchase or sale) or a **recorrência** (the same bill
  every week or month, with or without an end).
- **Parcela**: one lançamento of a parcelamento, shown as "2/3".
- **Ocorrência**: one lançamento of a recorrência.
- **Anexo**: a photo or PDF attached to a lançamento.

## Data

New table `expense_series`: `id`, `farm_id` (cascade), `mode`
(`installments` | `recurring`), `frequency` (`monthly` | `weekly`),
`day_of_month` (1–31, monthly only; a shorter month uses its last day),
`starts_on` (first vencimento), `ends_on` (nullable; recurring only),
`count` (installments only), and the template of every generated lançamento:
`kind`, `category`, `amount_brl` (per occurrence for a recorrência, the total
for a parcelamento), `account_id`, `lot_id`, `counterparty`, `document`,
`notes`, `created_at`.

`expenses` gains `series_id` (→ expense_series, set null), `series_index`
(1-based) and a unique index on `(series_id, series_index)`. `Expense`
gains `seriesId?`, `seriesIndex?`, `seriesCount?` (parcelas only, from the
series) and `attachmentCount` (0 when none).

New table `attachments`: `id`, `farm_id` (cascade), `expense_id`
(→ expenses, cascade), `pathname` (blob path, unique), `file_name`,
`content_type`, `size_bytes`, `created_at`, `created_by` (user id).

## Rules

- **Parcelamento** (count 2–48): creates all parcelas at once. Each parcela
  keeps the purchase's `date` (competência — the cost belongs to the month it
  was incurred) and its own `due_date` = starts_on + (i−1) intervals. Value =
  floor(total ÷ count to the centavo); the last parcela takes the remainder.
  "Já pago" applies to the first parcela only.
- **Recorrência**: generates ocorrências from `starts_on` up to
  min(`ends_on`, today + 12 months). Each ocorrência's `date` and `due_date`
  are its own vencimento (a salário belongs to its month). The herd load tops
  up every open-ended series to today + 12 months (idempotent through the
  unique index). "Já pago" applies to the first ocorrência only.
- **Editing a lançamento of a série** asks "Só esta" · "Esta e as próximas" ·
  "Todas". Só esta edits the row only. "Esta e as próximas" edits the series
  template, and rewrites every row with index ≥ this one that is not paid
  (value, conta, lote, counterparty, document, notes; for a recorrência also
  the day/frequency, deleting and regenerating those unpaid rows). "Todas"
  does the same for every unpaid row. Paid rows never change.
- **Removing** asks the same: só esta; esta e as próximas (a recorrência's
  `ends_on` becomes the previous vencimento; unpaid rows after it go); todas
  as não pagas. Paid rows stay.
- The value of a parcelamento's parcela is edited per parcela (só esta); the
  total is not re-split.
- COE, caixa, Extrato and exports treat each generated row as an ordinary
  lançamento; future ocorrências fall outside a window that ends today, so
  the indicators do not move until they happen.
- **Anexos**: images (jpeg, png, webp, heic) and PDF, at most 5 MB after the
  phone compresses images (longest side 1600 px, JPEG 0.8). Up to 10 per
  lançamento. Stored in Vercel Blob, private, under
  `farms/<farmId>/expenses/<expenseId>/<uuid>-<name>`. Upload goes from the
  browser straight to Blob with a token our API issues after checking the
  session, the farm and Financeiro edit (Vercel functions refuse bodies over
  4.5 MB, so the file never passes through our function); the client then
  registers the anexo, and the server checks the pathname prefix and the
  blob's size and type (`head`) before inserting. Download goes through
  `GET /api/herd/attachments/:id`, which checks the farm and Financeiro view
  and streams the blob. Removing a lançamento or an anexo deletes the blob
  (errors logged, never blocking). Without `BLOB_READ_WRITE_TOKEN` the anexos
  block shows "Anexos indisponíveis neste ambiente" and hides the button.
- Offline: the brete's queue does not cover Financeiro; the dialog already
  needs signal. The anexos button says "precisa de sinal" offline.

## UI

- **Financeiro sub-navigation** under the PageHeader of `/finance`,
  `/finance/extrato` and every later Financeiro page: Painel · Extrato
  (the later tabs appear with their cycles). Desktop: tab row with
  `aria-current`; phone: scrollable pill row.
- **EntryDialog**: a "Repetir" section after Data/Valor with the segmented
  Uma vez · Parcelado · Recorrente.
  - Parcelado: "Valor" reads "Valor total"; Parcelas (2–48), "Primeira
    parcela vence", Intervalo (mensal · semanal); Vencimento is disabled
    with "segue a 1ª parcela, abaixo"; a preview list "1/3 · 10/10 ·
    R$ 4.000,00" … with the total and "a última parcela absorve os centavos".
  - Recorrente: "Repete a cada" (mês · semana), "no dia" (monthly), "até"
    date or "sem fim", preview "próximas: 05/10 · 05/11 · 05/12".
  - Editing a lançamento of a série hides "Repetir" and shows "Parcela 2/3"
    or "Recorrente · todo dia 20"; saving opens the scope choice.
  - "Anexos" block after Documento/Lote: thumbnails (image preview, PDF
    icon with name and size) with remove buttons, "Adicionar foto ou PDF"
    (on the phone "Tirar foto" first, then "Escolher arquivo"), helper
    "até 5 MB · fotos são reduzidas no celular". On a new lançamento the
    files upload after it is created; the dialog shows progress per file.
- **Contas card and Extrato**: a "2/3" chip on parcelas, a repeat icon with
  "todo dia 20" on ocorrências, a paperclip with the count on rows with
  anexos; the Extrato row actions gain "Ver anexos". Removing or editing a
  row of a série opens the scope choice dialog ("Só esta" · "Esta e as
  próximas" · "Todas").

## Code

- Schema + migration `financeiro-series-e-anexos`; `lib/types.ts`.
- `lib/domain/series.ts` (pure, tested): `installmentPlan(total, count,
  startsOn, frequency)`, `recurringDates(series, from, until)`,
  `nextDueDates(series, n)`, `scopeRows(rows, index, scope)`.
- API: `POST /expenses` accepts `repeat?: { mode, count?, frequency,
  dayOfMonth?, startsOn, endsOn? }` and returns every created row;
  `PATCH /expenses/:id` and `DELETE /expenses/:id` accept `scope?:
  "one" | "following" | "all"`; the herd load tops up series;
  `POST /attachments/upload-token` (Blob client token),
  `POST /expenses/:id/attachments` (register), `GET
  /expenses/:id/attachments` (list), `GET /attachments/:id` (stream),
  `DELETE /attachments/:id`. All finance-gated (edit to write, view to read).
- `@vercel/blob` added (the only new dependency).
- Store: `addExpense` returns the created rows; `updateExpense`/`removeExpense`
  take a scope; attachment actions.
- UI: `components/finance/FinanceSubnav.tsx`, `EntryDialog` sections,
  `components/finance/attachments/*`, `SeriesScopeDialog`, markers in
  `BillsCard`, `RecentEntriesCard` and the Extrato.

## Tests

Pure: installment split and remainder, month-end days, weekly dates,
recurring window top-up, scope selection with paid rows. Use cases:
parcelado creates N rows with the same date and stepped due dates;
recurring generation and idempotent top-up; scoped edit/remove leave paid
rows alone; upload token refused without Financeiro edit; register refuses a
pathname outside the farm's prefix or over 5 MB; stream refuses another
farm's anexo. Smoke on a throwaway database with a Blob token from the
environment (or skipped with a note when absent): create a parcelado, a
recorrente, attach a photo, open it, edit "esta e as próximas", remove.
