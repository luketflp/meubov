# Venda: apartar boiada, refugo e dúvida — design

Date: 2026-09-23 · Canvas: "Venda: apartar boiada", direction A (Três porteiras).

## Goal

On a venda, the brete stops being "vendido or pulado". Each animal that passes is
sorted into one of three lists:

- **Boiada**: sold at the brete, as today. It leaves the active herd and is priced
  by its weight × its own rendimento × the R$/@.
- **Refugo**: rejected by the buyer or the farmer. It stays in the herd. The
  weight read on the scale is kept as a pesagem.
- **Dúvida**: set aside with its weight, to be decided before the venda closes.
  Deciding brings it back to the brete, where it goes to Boiada or Refugo.

The rendimento de carcaça becomes per animal. The modal that opens the chute
still asks for the venda's rendimento padrão, and each animal starts with it,
but the operator can change it at the brete for one animal.

"Pular (não passou)" stays for an animal that never reached the brete.

## Data

`lib/types.ts`

- `ManejoOutcome` gains `"rejected"` (refugo) and `"held"` (dúvida). Only a venda
  produces them.
- `ManejoSessionAnimal` gains `carcassYieldPct?: number`, the rendimento this
  boiada pass was priced at **when it differs from the venda's padrão**. Absent
  means "follows the padrão".

`lib/db/schema.ts` and migration `0019_venda-apartacao`

- `manejo_outcome` enum: `ADD VALUE 'rejected'`, `ADD VALUE 'held'`.
- `manejo_session_animals.carcass_yield_pct numeric` (nullable).
- `lib/api/mappers.ts` maps the new column.

Pricing of one boiada pass everywhere (`CompleteAnimal`, `SetCarcassYield`,
`EditWeighing`, `saleSummary`, `saleRows`, romaneio) uses one helper:

```ts
/** Rendimento a boiada pass is priced at: its own, else the venda's padrão, else 50%. */
export function passYieldPct(session: Pick<ManejoSession, "carcassYieldPct">, entry: Pick<ManejoSessionAnimal, "carcassYieldPct">): number
```

## API (`lib/api/domains/manejo`)

- `POST /:id/animals/:animalId/complete`: `ManejoPassBody` gains
  `carcassYieldPct?` (0 < x ≤ 100). It is accepted only on a venda per arroba and
  only with Financeiro edit (the rendimento reprices money; the controller strips
  it otherwise). It is stored on the entry only when it differs from the session
  padrão. `buildPassEffects` prices with it.
- **New** `POST /:id/animals/:animalId/set-aside`, use case `SetAsideAnimal`.
  Body `{ list: "rejected" | "held", weightKg?, notes? }`. Guards: session is a
  venda and open, entry pending, animal active. When the session weighs and a
  weight is given, it writes the weighing (same as a pass). It sets `outcome`,
  `weightKg`, `weighingId`, `notes`. No `amountBrl`, the animal stays active.
  Needs Manejo edit.
- `ReopenAnimal`: a `rejected` or `held` entry reopens like a `skipped` one plus
  its weighing soft-deleted. The venda's reactivation runs only for `done`
  (today it runs for every venda entry). The reset also clears
  `carcassYieldPct`.
- `SetCarcassYield` (the padrão modal): reprices only the `done` entries without
  their own `carcassYieldPct`.
- `EditWeighing` (animals domain): the manejo reprice uses `passYieldPct`.
- `Close`: a venda with any `held` entry answers 409 `held_pending`
  (new `ManejoConflict`).
- `Delete` / `manejoRevert`: `rejected` and `held` entries are handled — their
  weighing is soft-deleted — with no `not_sold` check and no reactivation.

## Domain

- `movements.ts` `saleSummary`: carcass kg and @ are summed per entry with
  `passYieldPct`. `carcassYieldPct` in the summary becomes the weighted average
  (total carcass kg ÷ total live kg), labelled "Rendimento médio" when entries
  differ. Adds `rejectedHeads` and `heldHeads`. `saleRows` uses `passYieldPct`
  and carries the entry's pct.
- `components/manejo/helpers.ts` `sessionProgress`: `ManejoProgress` gains
  `rejected` and `held`. `pending` counts only `pending`; `pct` counts every
  outcome except pending.
- Labels: `manejoDetail.outcomeNote`, `sale-detail.rowNote` and the export read
  "refugo" / "dúvida" for the new outcomes. `sessionWeighingLines` shows the
  weight of a refugo.

## Brete (session-runner, venda only)

Direction A, as drawn:

1. **Andamento**: the bar splits into boiada (brand), dúvida (attention) and
   refugo (fmd); the line under it reads "23/40 apartados · 18 boiada · 2 dúvida
   · 3 refugo · 17 pendentes".
2. **No brete agora** (2/3) beside **Pendentes** (1/3):
   - Peso na balança, Rendimento (%), Observação. Rendimento shows only on a
     venda per arroba and only with Financeiro edit; it starts at the padrão.
     Changed, the field turns attention with an "ajustado" pill and a
     "voltar ao padrão" link under it.
   - The value line: "19,66 @ de carcaça (rend. 54%) × R$ 320,00/@ = R$ 6.289,92".
   - Three buttons: **Boiada** (solid brand, wide, "Vende agora · R$ X"),
     **Dúvida** ("Aparta, decide depois"), **Refugo** ("Fica na fazenda").
     Enter submits Boiada. Weight is required for Boiada when the venda weighs,
     optional for the other two.
   - "Pular (não passou)" as a small link.
3. Three columns: **Boiada** (count, total kg and R$; rows: brinco, kg, rend.%
   in attention when adjusted, R$, desfazer; first 5 then "ver todos"),
   **Dúvida** (rows: brinco, kg, note, "Decidir"), **Refugo** (rows: brinco, kg,
   note, desfazer). A **Pulados** card appears under them when there are any.
4. **Decidir** reopens the entry, puts it in the brete and fills the weight and
   note it had.
5. **Resumo da venda**: only the boiada; "Refugo e dúvida ficam fora" in its
   header; "Rendimento médio" in the per-head column.
6. **Encerrar**: disabled while any dúvida is open, with "Decida as N dúvidas
   para encerrar a venda." beside it.

Phone: one column; the three lists become collapsible sections (Dúvida open,
then Boiada, Refugo, Pendentes); Boiada spans the full width above Dúvida and
Refugo side by side.

Other manejo kinds keep the current runner unchanged.

## Permissions

- Sorting (boiada/refugo/dúvida) needs Manejo edit, as a pass does.
- The Rendimento field and the R$ on the buttons and columns need Financeiro view
  (edit for the field); without it the vaqueiro sees kg only, like today.

## Out of scope

- Selling the refugo in a second venda.
- Editing the rendimento of a boiada pass after it passed (undo and pass again).

## Concurrency note

Another session is building a "Encerrar manejo" dialog that touches
`session-runner.tsx`, `helpers.ts` and `sale-detail.tsx`. This work lives in a
worktree and is rebased onto it once it lands; the dúvida block on Encerrar then
goes into that dialog's flow.

## Testing

- Unit (vitest, TDD): `passYieldPct`; `buildPassEffects` with an entry pct;
  `saleSummary`/`saleRows` with mixed yields and new outcomes; `sessionProgress`;
  `revertDecision` for rejected/held.
- Use cases with the db stub: `SetAsideAnimal`, `CompleteAnimal` storing the
  pct, `ReopenAnimal` for rejected/held (no reactivation), `SetCarcassYield`
  skipping own-pct entries, `Close` refusing a held entry.
- Controller: `set-aside` route; `carcassYieldPct` stripped without Financeiro
  edit.
- Smoke in the app: a venda per arroba, sort one of each, adjust one rendimento,
  decide a dúvida, try to close with a dúvida, close.
