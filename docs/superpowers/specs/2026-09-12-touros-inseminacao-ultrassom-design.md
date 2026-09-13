# Touros, inseminação e ultrassom — design

Date: 2026-09-12. Status: approved, ready for the implementation plan.

Design canvas: https://claude.ai/code/artifact/e500f7fe-d4e5-4571-a427-3aaf9023b6e1

## Goal

The Reprodução page lists coberturas one at a time. A farm that works with IATF
buys semen by the dose, inseminates a whole lote in one morning at the brete and
comes back a month later with the ultrassom. None of that has a place today: the
bull is a free-text code on each cobertura, nobody knows how many doses are left
or what they cost, the inseminação is typed cow by cow from a dialog and the
diagnosis is one more dialog per row.

Three things change:

1. **Touros**: the farm registers the bulls it buys semen from, and every purchase
   of doses with its value. The stock is the doses bought minus the doses used.
2. **Inseminação** becomes a manejo, like pesagem and venda: pick the lote and the
   main bull, then pass the cows one by one at the brete, each taking one dose.
3. **Ultrassom**: one list of every cobertura awaiting diagnosis, with Prenhe and
   Vazia buttons that save on tap.

## Decisions

- A "touro" here is **semen**. Herd bulls for monta natural stay what they are
  today (animals with category `bull`).
- A bull is registered once. **Each purchase is its own line** (data, doses,
  valor total, fornecedor). Stock and average cost per dose derive from the
  purchases and the coberturas; nothing is stored as a counter.
- **A purchase creates an expense** in Financeiro, category `breeding`
  ("Reprodução"), with the total value and the note `Sêmen — <touro>, <N> doses`.
  Deleting the purchase deletes that expense.
- **Inseminação is a real manejo** (`kind: "insemination"`): it shows in the
  manejo history, has a details page once closed, and deleting it puts the
  doses back.
- **Only IATF.** An inseminação records coberturas of type `timedAI`; no new
  "IA no cio" type.
- **Ultrassom is a list, not a manejo.** It writes the existing pregnancy
  diagnosis, one row at a time.
- **A single cobertura typed as IATF also takes a dose** when the farmer picks a
  registered bull. "Outro" keeps today's free text and takes nothing.

## Data model

New tables (`drizzle/0014_*.sql`, generated with `pnpm migration:create`):

```ts
semen_bulls {
  id: text pk,
  farmId: integer → farm.id (cascade),
  name: text not null,
  code: text,          // registro or central code, e.g. "NEL-4471"
  breed: text,         // raça, free text picked from the farm's raças
  central: text,       // central de sêmen
  unique (farmId, lower(name))   // "tufão da serra" duplicates "Tufão da Serra"
}
semen_purchases {
  id: text pk,
  bullId: text → semen_bulls.id (cascade),
  date: date not null,
  doses: integer not null (check doses > 0),
  totalBrl: numeric not null,
  seller: text,
  expenseId: text → expenses.id (set null),
}
```

Changed:

- `manejo_kind` enum gains `insemination`.
- `breedings.semenBullId`: text → `semen_bulls.id` (restrict), nullable, indexed
  (every stock count filters on it). Set when the cobertura used a dose of a
  registered bull.
- `manejo_sessions.semenBullId`: text → `semen_bulls.id` (restrict), nullable. The
  touro principal of an inseminação.
- `manejo_session_animals.breedingId`: text → `breedings.id` (set null), nullable.
  The cobertura a pass wrote, for undo and delete.

Domain types (`lib/types.ts`):

```ts
export interface SemenPurchase {
  id: string; date: string; doses: number; totalBrl: number;
  seller?: string; expenseId?: string;
}
export interface SemenBull {
  id: string; name: string; code?: string; breed?: string; central?: string;
  purchases: SemenPurchase[]; // date asc
}
Breeding.semenBullId?: string
ManejoKind adds "insemination"
ManejoSession.semenBullId?: string
ManejoSessionAnimal.breedingId?: string
HerdData.semenBulls: SemenBull[]
```

The snapshot (`GET /api/herd`) sends `semenBulls` with their purchases.

## Rules (pure, tested)

`lib/domain/semen.ts`:

- **Doses used** by a bull: every breeding on the farm with its `semenBullId`,
  active dam or not.
- **Stock**: `bought` (sum of purchase doses), `used`, `left = bought − used`,
  `totalBrl` (sum of purchase totals), `avgCostPerDose = totalBrl / bought`
  (null with no purchase), `lastPurchase` (latest date or null).
- **A purchase can be deleted** only when `bought − purchase.doses ≥ used`.
- **Pregnancy rate** of a bull: over its breedings that have a diagnosis
  `pregnant` or `open`: `pregnant / diagnosed`, null when none is diagnosed.
- **Inseminations of a bull**: its breedings, newest first, with dam, the dam's
  current lot and the diagnosis result.
- **Doses per bull in a session**: done passes with a `breedingId`, counted by the
  breeding's `semenBullId`.
- **Semen cost of a session**: per bull, doses × that bull's current
  `avgCostPerDose`; total; per cow (total ÷ inseminated cows). A bull with no
  purchase costs nothing and is left out of the money column.
- **Expense note** of a purchase: `Sêmen — Tufão da Serra, 30 doses` (`1 dose`
  in the singular).

`lib/domain/reproduction.ts`:

- **Pregnant now**: the latest breeding has a `pregnant` diagnosis and no calving
  was recorded on or after its date.

`lib/domain/manejo.ts`:

- An insemination pass produces a **breeding effect**:
  `{ date: session.date, type: "timedAI", semenBullId }`. The bull comes from the
  pass data, falling back to the session's touro principal.
- The default session name of the kind is `Inseminação`.

`lib/domain/manejoRevert.ts`:

- A done insemination pass whose cobertura already has a diagnosis blocks the
  delete with reason **`has_diagnosis`**. Otherwise the plan lists the
  `breedingIds` to remove.

`lib/domain/ultrasound.ts`:

- A cobertura **awaits diagnosis** when it is the latest breeding of an active
  female, has no diagnosis and no calving was recorded on or after its date.
- Coberturas are **grouped by the inseminação** whose pass wrote them (a session
  entry's `breedingId`). Everything else falls into **Coberturas avulsas**, last.
- An inseminação group shows while it has at least one cobertura awaiting
  diagnosis, and lists every cobertura of that session: awaiting first, then the
  diagnosed ones, each group of rows by ear tag. Coberturas avulsas lists only
  the awaiting ones.
- Groups sort by session date, oldest first. Each carries: the session, its
  date, the predominant **current lot** of its cows, days since the
  inseminação, and counts `pending`, `pregnant`, `open`.
- The total at the top is every cobertura awaiting diagnosis.

`lib/domain/manejoDetail.ts`: `passedLabel` for the kind is `inseminadas`.

Eligible cows for an inseminação: active females of category `cow` or
`heifer`. A cow **pregnant now** is listed unchecked, muted, with a "Já prenhe"
pill.

## API

New domain `lib/api/domains/semen/` mounted in `lib/api/app.ts`:

| route | body | result | errors |
| --- | --- | --- | --- |
| `POST /semen-bulls` | `{ name, code?, breed?, central?, firstPurchase? }` | `{ bull, expense? }` | 409 `duplicate_name` |
| `PATCH /semen-bulls/:id` | `{ name?, code?, breed?, central? }` | `SemenBull` | 404 `not_found`, 409 `duplicate_name` |
| `POST /semen-bulls/:id/purchases` | `{ date, doses, totalBrl, seller? }` | `{ purchase, expense }` | 404 `not_found` |
| `DELETE /semen-bulls/:id/purchases/:purchaseId` | — | `{ id, expenseId }` | 404 `not_found`, 409 `stock_negative` |

`firstPurchase` has the purchase body's shape. `doses` is an integer ≥ 1,
`totalBrl` > 0. Empty optional strings are stored as null. A purchase and its
expense are written in one transaction.

Stock checks lock the bull row (`FOR UPDATE`) and count inside the transaction,
through one shared helper `lib/api/domains/semen/_shared/stock.ts`.

Reproduction:

- `POST /animals/:id/breedings` accepts `semenBullId?`. With it: the type must be
  `timedAI` (422 `semen_requires_timed_ai`), the bull must belong to the farm
  (404 `bull_not_found`) and have a dose left (409 `out_of_stock`). The stored
  `bullEarTag` becomes the bull's `code`, or its name when it has none.
- `DELETE /animals/:id/diagnoses/:breedingId` removes a diagnosis (the undo of a
  tap on the Ultrassom list). 404 `breeding_not_found`.

Manejo:

- `ManejoKindModel` gains `insemination`. `POST /manejo` accepts `semenBullId?`
  and requires it for an inseminação (422 `semen_bull_required`); the bull must
  belong to the farm (404 `bull_not_found`) and every animal must be female
  (422 `not_female`).
- `POST /manejo/:id/animals/:animalId/complete` accepts `semenBullId?`. On an
  inseminação it records the breeding (date of the session, `timedAI`, bull ear
  tag as above), stores its id on the entry and returns it as `breeding`.
  409 `out_of_stock` when the bull has no dose left.
- `.../reopen` of an inseminação pass deletes its breeding, and answers 409
  `has_diagnosis` when that breeding already has a diagnosis.
- `DELETE /manejo/:id` of an inseminação deletes its breedings (the doses come
  back by derivation) and returns them as `removedBreedings: { earTag,
  breedingId }[]`. It is refused with `has_diagnosis` as above; each blocked
  cow carries its `breedingId` so the client can clear that diagnosis. The
  reopen refusal carries it too.
- A discarded session (`deletedAt` set) accepts no pass, skip, undo or close,
  and the delete locks the session row so it waits for a pass in flight. Undo
  and delete lock the breedings before reading their diagnoses.

The route table snapshot is updated.

## Store

`useHerdStore` gains `semenBulls` and:

```ts
addSemenBull(input: NewSemenBull): Promise<SemenBull | "duplicate">
updateSemenBull(id: string, patch: SemenBullPatch): Promise<boolean> // false on duplicate
addSemenPurchase(bullId: string, input: NewSemenPurchase): Promise<void>
removeSemenPurchase(bullId: string, purchaseId: string): Promise<boolean> // false on stock_negative
clearDiagnosis(earTag: string, breedingId: string): Promise<void>
```

Purchases merge their expense into `expenses` and remove it on delete.
`recordBreeding` sends `semenBullId`; on 409 `out_of_stock` it shows the toast
"Esse touro não tem mais doses.", reloads the snapshot and returns false.
`completeManejoAnimal`'s pass data gains `semenBullId`; the returned breeding is
merged into the dam's reproduction; on `out_of_stock` the same toast and reload,
and it returns false so the brete keeps the cow and the note.
`removeSemenPurchase` reloads on `stock_negative` too. `reopenManejoAnimal`
removes the breeding; on `has_diagnosis` it shows "Essa vaca já tem
diagnóstico." with the action "Limpar diagnóstico", which clears it and retries
the undo. `deleteManejoSession` removes the returned breedings.

## Screens

Copy is pt-BR, verbatim.

### Reprodução page

`/nascimentos/reproducao?tab=coberturas|touros|ultrassom` (default
`coberturas`), tabs with the Calendário page's anatomy: **Coberturas**, **Touros**,
**Ultrassom**. Subtitle: "Coberturas das matrizes, o sêmen em estoque e o
diagnóstico de prenhez". Header actions: "Registrar cobertura" (outline) and
"Iniciar inseminação" (primary).

**Coberturas** is today's list. The Touro column shows a registered bull's name,
linked to its page; other bulls keep today's rendering.

### Touros tab

Card "Touros" with action "Novo touro". Table: Touro (name, code beside it in
small mono), Raça, Central, Em estoque (pill: "Sem doses" overdue at 0,
"N doses" attention at ≤ 10, healthy above), Usadas / compradas ("41 de 60"),
Custo médio por dose, Última compra, row action "Registrar compra". Phone:
cards. Empty: "Nenhum touro cadastrado" / "Cadastre os touros de que você compra
sêmen para controlar o estoque de doses." with "Novo touro".

**Novo touro** dialog: Nome, Código ou registro, Raça (select of the farm's
raças), Central; section "Primeira compra (opcional)": Data, Doses, Valor total
(R$), Fornecedor; hint "Vira despesa de Reprodução no Financeiro". Footer
"Cancelar" / "Cadastrar touro". Errors: "Informe o nome do touro.", "Já existe
um touro com esse nome.", and for a partly filled purchase "Informe as doses."
/ "Informe o valor total.".

### Página do touro

`/nascimentos/reproducao/touros/[id]`. Back link "Reprodução" (to the Touros
tab). Header: name, code beside it, subtitle "raça · central"; actions "Editar"
and "Registrar compra".

- **Resumo**: lead "N inseminações · N com diagnóstico · N aguardando ultrassom".
  Column "Estoque": Em estoque, Compradas ("60 doses", "2 compras"), Usadas.
  Column "Custo e prenhez": Custo médio por dose, Total comprado, Taxa de
  prenhez ("68%", "23 de 34 diagnosticadas"; "—" with none).
- **Compras**: Data, Doses, Valor total, Por dose, Fornecedor, delete button.
  A refused delete shows "Não dá para excluir: as doses dessa compra já foram
  usadas.".
- **Inseminações**: Data, Matriz (link to the ficha), Lote, Diagnóstico.
  Empty: "Nenhuma inseminação com esse touro ainda.".
- Unknown id: "Touro não encontrado" with the way back.

**Registrar compra** dialog: the bull fixed on top ("19 doses em estoque"),
Data, Doses, Valor total, Fornecedor, live line "R$ 40,00 por dose · estoque
passa a 49 doses", hint "Vira despesa de Reprodução no Financeiro". Footer
"Cancelar" / "Registrar compra". **Editar** dialog: the bull fields only, footer
"Cancelar" / "Salvar".

### Iniciar inseminação

Opened by "Iniciar inseminação" on Reprodução and by picking "Inseminação" in
Manejo's "Tipo de manejo" (listed after Pesagem). The register-manejo dialog in
insemination mode, titled "Iniciar inseminação":

- Data, **Lote** (the lot filter, moved to the top), **Touro principal** (select
  "Tufão da Serra · 19 doses", bulls without doses disabled), hint "Já vem
  marcado em cada vaca no brete; dá para trocar ali.".
- Animals: the eligible cows of the lote, search by brinco, "Selecionar todos os
  listados (N)" (only cows not pregnant now), pregnant cows unchecked with "Já
  prenhe". Counter "N vacas selecionadas".
- When the touro principal has fewer doses than selected cows, the attention
  notice "Tufão da Serra tem 19 doses para 32 vacas. No brete, troque de touro
  quando acabar.".
- Errors: "Selecione o touro principal.", "Selecione ao menos uma vaca.".
- Footer "Cancelar" / "Iniciar inseminação". Submit opens `/manejo/[id]`.

With no registered bull the Touro principal field shows "Cadastre um touro na
aba Touros da Reprodução." and submit stays disabled.

### Brete (open inseminação)

The session runner, as for pesagem, with:

- Title `Inseminação · <lote predominante>`, subtitle "Manejo de dd/mm/aaaa ·
  touro principal <touro>".
- In Andamento, under the progress bar: "Doses usadas hoje" and each bull with
  its count.
- The chute card replaces the weight input with **Touro**: one chip per
  registered bull, "Tufão da Serra · 8 doses" (count amber at ≤ 10), selected
  chip in brand. The selection starts on the touro principal and stays across
  cows until changed. A bull with no dose left is disabled and reads "sem
  doses". When the selected bull runs out the selection clears and the notice
  "Tufão da Serra acabou. Escolha outro touro para continuar." shows. The
  "Observação (opcional)" field stays.
- Buttons "Inseminar" (disabled without a bull) and "Pular (não passou)".
- Lists "Pendentes", "Inseminadas" (brinco, bull name, Desfazer), "Puladas".

### Details (closed inseminação)

`InseminationDetail` on the shared shell. Title as the brete, pill
"Inseminação", subtitle "dd/mm/aaaa · 31 de 32 vacas inseminadas".

- **Resumo da inseminação**: lead "31 vacas inseminadas com 2 touros. 1
  pulada.". Column "Doses": each bull, Total. Column "Custo do sêmen": each bull
  (with "R$ 38,00/dose"), Total, Por vaca.
- **Animais**: Brinco, Categoria, Touro, Diagnóstico, Observação; skipped cows
  as "pulada · <nota>".

The delete dialog says "N coberturas IATF são apagadas e as doses voltam ao
estoque.". The block reason `has_diagnosis` reads "já tem diagnóstico de
prenhez". A refusal with `has_diagnosis` lists those cows with their result pill
and a "Limpar diagnóstico" button each, under "Limpe o diagnóstico destas vacas
para excluir a inseminação."; once all are cleared, "Excluir manejo" is offered
again. The Ultrassom list cannot do this on its own: a group leaves the list
when nothing in it awaits diagnosis.

On the dam's ficha a cobertura with a registered bull shows the bull's name,
linked to its page, instead of the code.

History: pill "Inseminação" in the scheduled tone; value column empty.

### Ultrassom tab

- Toolbar: "Data do exame" (today by default), hint "Vale para todos os toques
  desta tela", search "Buscar brinco", and "N aguardando diagnóstico".
- One card per group: title "Inseminação de dd/mm/aaaa" + "<lote> · N dias", or
  "Coberturas avulsas"; counts "N pendentes · N prenhes · N vazias" (zero counts
  hidden).
- Rows: Matriz (link), Touro (bull name, or the herd bull's ear tag in mono),
  Tipo (BreedingPill), Dias; buttons "Prenhe" and "Vazia". A diagnosed row shows
  its ResultPill and "Alterar", which brings the buttons back for that row.
- A tap saves right away with the exam date and shows the toast "Diagnóstico
  salvo" with the action "Desfazer" (removes the diagnosis).
- Phone: cards with the two buttons side by side.
- Empty: "Nenhuma cobertura aguardando diagnóstico" / "Depois de uma inseminação
  ou monta natural, as vacas aparecem aqui para o ultrassom." with "Iniciar
  inseminação".

### Registrar cobertura (single cow)

In `BreedingForm`, type IATF turns the Touro field into a select: each bull
"Nome · CÓDIGO · N doses" (disabled "sem doses"), a separator, "Outro (digitar
código)", which shows today's text input. Hint under the select "Usa 1 dose do
estoque do touro.". Monta natural keeps today's behavior. With no registered
bull the field stays the text input.

## Code layout

```
lib/types.ts, lib/db/schema.ts, drizzle/0014_*.sql, lib/api/mappers.ts
lib/api/domains/herd/useCases/Load.useCase.ts
lib/domain/semen.ts, lib/domain/ultrasound.ts (+ __tests__)
lib/domain/reproduction.ts, manejo.ts, manejoRevert.ts, manejoDetail.ts (+ tests)
lib/api/domains/semen/{semen.controller.ts, schemas/semen.schema.ts, _shared/stock.ts,
  useCases/{AddBull,UpdateBull,AddPurchase,DeletePurchase}.useCase.ts (+ __tests__)}
lib/api/domains/reproduction/* (semenBullId, delete diagnosis)
lib/api/domains/manejo/* (insemination)
lib/api/app.ts, lib/api/__tests__/__snapshots__/*
lib/store/useHerdStore.ts, lib/store/selectors.ts, lib/data/seed.ts
components/manejo/helpers.ts (+ test), manejo-type-pill.tsx, register-manejo-dialog.tsx,
  session-runner.tsx, insemination-chute-form.tsx, insemination-detail.tsx,
  manejo-screen.tsx, delete-manejo-dialog.tsx
components/semen/{semen-bulls-list, semen-bull-dialog, semen-purchase-dialog,
  semen-bull-page, stock-pill}.tsx
components/breedings/{reproduction-tabs, ultrasound-list, start-insemination-button,
  breedings-list}.tsx
components/animal/breeding-form.tsx
app/(app)/nascimentos/reproducao/page.tsx, touros/[id]/page.tsx
```

## Testing

Test-first for the pure modules (`semen`, `ultrasound`, `reproduction`,
`manejo`, `manejoRevert`, `manejoDetail`, `components/manejo/helpers`,
`recentBreedings`) and for the semen use cases and the insemination branches of
the manejo use cases (existing db stub pattern). Components are checked in the
running app: register a bull with a first purchase, add a purchase, run an
inseminação that exhausts one bull and switches to another, undo a pass, close
it, open its details, diagnose on Ultrassom, undo a tap, delete a purchase that
is in use, delete the inseminação with and without a diagnosis, register a
single IATF with a registered bull, check the expense in Financeiro. Desktop and
phone.

## Out of scope

IA no cio, IATF protocols (D0/D8/D10), deleting a bull, editing a purchase,
stock alerts on Painel, semen stored per botijão, pregnancy rate per session,
changing the bull of a pass after it is done (undo and redo it).
