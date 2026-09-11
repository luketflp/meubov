# Ficha do lote (/lots/[id]) — design

Date: 2026-09-10. Status: approved layout (design canvas, direction A), ready to
implement. Canvas: https://claude.ai/code/artifact/69c289d9-47d7-442c-824f-2a1a51dfdbb8

## Goal

Open a lote and read it the way the venda record reads: a header with the
lot's name and where it is, a "Resumo do lote" card with the numbers that
matter (herd and weight, per-head averages, invernada and stocking, health),
and the active animals of the lot below. Today `/lots` only lists cards with
edit/move/archive/delete; there is no way to open one.

Nothing changes in the data model, the API or the store actions. Every number
comes from a pure selector over the store snapshot.

## Route and navigation

- Route: `app/(app)/lots/[id]/page.tsx` ("use client"), reads the id with
  `useParams<{ id: string }>()` like `app/(app)/manejo/venda/[id]/page.tsx`.
  The id is the lot's stable `Lot.id`.
- `lib/nav.ts` unchanged: `isActiveRoute("/lots/abc", "/lots")` already keeps
  the Lotes item highlighted on the sidebar and "Mais" on the tab bar.
- `/lots` card (`components/lots/lots-paddocks.tsx`, `LotCard`): the name
  becomes a `next/link` to `/lots/{lot.id}`, `inline-flex items-center gap-1
  font-heading text-base font-semibold text-ink underline-offset-2
  hover:underline`, followed by `ChevronRight` (`size-4 text-ink-soft`,
  aria-hidden), `aria-label="Abrir lote {name}"`. Everything else on the card
  stays as it is.

## Page

`app/(app)/lots/[id]/page.tsx`, container `mx-auto max-w-6xl space-y-6 px-4
py-6 md:px-8`:

1. Row `flex flex-wrap items-center justify-between gap-3`: back link to
   `/lots` (same markup as the ficha's back link in `app/(app)/herd/[id]/page.tsx`,
   `ArrowLeft`, label "Lotes", `min-h-11 md:min-h-0`) and `<LotActions>`.
2. `PageHeader` with `title={lot.name}`, `badges`, and subtitle:
   - placed lot: `Invernada {code}{ · name} · desde {formatDate(startedOn)}`;
   - placed but the invernada no longer resolves: `Invernada não encontrada`;
   - closed lot (no open placement): `Lote encerrado` plus
     ` · última invernada {code}{ · name}` when a past placement resolves.
   Badges (same as the card): `needsReview` → `<Badge variant="outline">Revisar
   cadastro</Badge>`; no open placement → `<Badge variant="secondary">Encerrado</Badge>`.
3. `<LotSummaryCard summary={summary} />`.
4. `<LotAnimalsCard items={rows} />`.

Not found (unknown id, or `deletedAt` set): the ficha's not-found block — back
link, then `rounded-lg border border-hairline bg-panel pb-8` with `EmptyState`
(icon `SearchX`, title "Lote não encontrado", description "Este lote não existe
ou foi excluído. Volte à lista e tente novamente.") and the centered primary
link "Voltar aos lotes" to `/lots`.

`PageHeader` (`components/layout/PageHeader.tsx`) gains an optional
`badges?: ReactNode`; when given, the h1 and the badges share a `flex flex-wrap
items-center gap-x-3 gap-y-2` row. Existing callers are unaffected.

Data wiring on the page:

```ts
const today = todayISO();
const summary = useMemo(
  () => lotSummary(params.id, { lots, animals, treatments, invernadas, lotPlacements }, today),
  [params.id, lots, animals, treatments, invernadas, lotPlacements, today]
);
const rows = useMemo(
  () => (summary ? sortHerd(withStatus(summary.animals, treatments, today), DEFAULT_SORT, new Map()) : []),
  [summary, treatments, today]
);
```

`sortHerd` with `DEFAULT_SORT` (ear tag asc, pt-BR numeric collator) comes from
`components/herd/filters.ts`; the lot-name map is irrelevant for that column.

## Actions

New `components/lots/lot-actions.tsx`, `LotActions({ summary })`, a `flex
flex-wrap items-center gap-2` row, in this order:

1. `<EditLotDialog lot={lot} trigger="button" />`.
2. `<ArchiveLotDialog lot currentPlacement />` — only when
   `currentPlacement && heads === 0` (same guard as the card).
3. `<DeleteLotButton lot onDeleted={() => router.replace("/lots")} />` — only
   when `canDeleteLot(lot.id, animals, manejoSessions)`.
4. `<MoveLotDialog lot currentInvernada />` — the existing trigger already
   reads "Ver histórico" for a closed lot.

Extractions (behavior-preserving):

- `EditLotDialog` gains `trigger?: "icon" | "button"` (default `"icon"`, today's
  ghost pencil). `"button"` renders `<Button variant="outline" size="sm"
  className="min-h-11 md:min-h-9"><Pencil aria-hidden />Editar</Button>`.
- `components/lots/delete-lot-button.tsx` exports `DeleteLotButton({ lot,
  onDeleted? })`: the `window.confirm` text, `removeLot` call, `removing` state
  and the failure message move here from `LotCard` unchanged. It renders the
  ghost `Trash2` button ("Excluir lote" / "Excluindo…") and, on failure, a
  `<p className="basis-full text-right text-xs text-overdue">` right after it,
  so inside the card's `flex-wrap justify-end` actions row the message wraps to
  its own line as before. `LotCard` uses it and drops its local delete state.

## Domain and selector

`lib/domain/adg.ts` gains `herdAdgSamples(animals, todayIso, days =
ADG_WINDOW_DAYS): number[]` — the per-animal ADGs of the ACTIVE animals with
two or more weighings inside the window. `herdAverageAdg` becomes the mean of
that list (null when empty); its tests keep passing.

`lib/domain/dates.ts` gains `formatMonths(months: number): string` ("8m", "3a",
"2a 4m"); `formatAge` calls it with `ageInMonths(...)`. Tests for both.

`lib/store/selectors.ts` gains:

```ts
export interface LotPlacementRow {
  placement: LotPlacement;
  invernada: Invernada | null;
  /** Days the lot spent there: (endedOn ?? today) − startedOn. */
  days: number;
}

export interface LotNextActivity {
  date: string;
  type: TreatmentType;
  name: string;
  /** Animals of the lot booked on that same date/type/name. */
  heads: number;
}

export interface LotStocking {
  /** Density of the current invernada with every lot on it (invernadasWithSummary). */
  auPerHa: number;
  classification: StockingRateClass;
  /** The other active lots sharing the invernada right now. */
  otherLots: Lot[];
}

export interface LotSummary {
  lot: Lot;
  /** Active animals of the lot. */
  animals: Animal[];
  heads: number;
  byCategory: Record<Category, number>;
  /** Active animals with at least one weighing. */
  weighedHeads: number;
  totalWeightKg: number;
  totalArrobas: number;
  totalAu: number;
  /** Newest weighing date across the active animals, or null. */
  lastWeighingDate: string | null;
  /** totalWeightKg / weighedHeads, or null when nobody was weighed. */
  avgWeightKg: number | null;
  avgLiveArrobas: number | null;
  /** Mean age in complete months, floored; null with no animals. */
  avgAgeMonths: number | null;
  /** herdAverageAdg over the lot's animals (120-day window). */
  adg: number | null;
  /** How many animals that mean covers (herdAdgSamples length). */
  adgHeads: number;
  currentPlacement: LotPlacement | null;
  currentInvernada: Invernada | null;
  /** Days since the open placement started, or null when closed. */
  daysInInvernada: number | null;
  stocking: LotStocking | null;
  /** Every placement of the lot, newest first (startedOn desc, then id). */
  placements: LotPlacementRow[];
  health: { healthy: number; attention: number; overdue: number };
  /** Earliest scheduled (not overdue, not done) treatment among the lot's animals. */
  nextActivity: LotNextActivity | null;
}

export function lotSummary(
  lotId: string,
  state: Pick<HerdData, "lots" | "animals" | "treatments" | "invernadas" | "lotPlacements">,
  todayIso: string
): LotSummary | null;
```

Rules:

- `null` when the lot is unknown or has `deletedAt`.
- `animals` = `activeAnimals(state.animals)` with `lotId`; `byCategory` =
  `countByCategory(animals)`; weight/AU via `totalWeightKg`, `kgToArroba`,
  `totalAu`; `weighedHeads` counts `currentWeight(a) !== null`.
- `avgAgeMonths` = floor of the mean of `ageInMonths(birthDate, todayIso)`.
- `stocking` = the entry of `invernadasWithSummary(...)` for the current
  invernada (`otherLots` = its `lots` minus this one); `null` for a closed lot
  or when the invernada no longer resolves.
- `health` = counts of `withStatus(animals, treatments, todayIso)` by status.
- `nextActivity`: over the treatments of the lot's animals with
  `deriveTreatmentStatus === "scheduled"`, the earliest date; `heads` = how
  many of those share that date, type and name (ties on date broken by type
  then name, so the grouping is deterministic). Overdue ones are already in
  `health.overdue`.

Pure, no React, unit-tested in `lib/store/__tests__/selectors.test.ts`:
unknown/deleted lot → null; inactive animals ignored; averages null without
weighings; ADG mean and coverage; placements newest first with days; stocking
uses the whole invernada and lists the other lot; closed lot → no invernada, no
stocking, `daysInInvernada` null; health counts; next activity picks the
earliest scheduled one, groups its heads, ignores overdue/done and other lots.

## Components

New in `components/lots/`:

- `lot-summary.tsx` — `LotSummaryCard({ summary })`, `SectionCard` titled
  "Resumo do lote". Intro line `mb-3 text-sm text-ink-soft`:
  `"{heads} cabeças · {summaryByCategory(byCategory)}"` ("1 cabeça" singular;
  `summaryByCategory` from `components/dashboard/helpers.ts`), or "Nenhum animal
  ativo" when empty. Then `grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4`
  with four `<dl className="space-y-1.5">`, each opened by the eyebrow
  `text-xs font-medium uppercase tracking-wide text-ink-soft` and made of
  `SummaryRow`s. A missing value renders "—". Soft suffixes are
  `text-xs text-ink-soft` after the mono value.
  - **Rebanho**: Cabeças; Pesadas `"{weighedHeads} de {heads}"`; Peso total
    `formatKg`; @ totais `formatArroba`; UA totais `"{formatNumber(totalAu, 1)} UA"`;
    Última pesagem `formatDate`.
  - **Média por cabeça**: Peso vivo `formatKg`; @ viva (÷30) `formatArroba`;
    Idade `formatMonths`; GMD (120 dias) `"{formatNumber(adg, 2)} kg/dia"`;
    Com GMD `"{adgHeads} de {heads}"`.
  - **Invernada**: Atual `"{code}{ · name}"`; Desde `formatDate(startedOn)` +
    suffix `"· {days} dias"`; Área `"{formatNumber(hectares)} ha"` + suffix
    grass; Lotação `"{formatNumber(auPerHa, 2)} UA/ha"` followed by
    `<StatusPill status={classification} />` and, when `otherLots` is not empty,
    the suffix `"· com {names joined by ", "}"`. A closed lot shows Atual "—"
    and a row "Encerrado em" with the newest placement's `endedOn`. When there
    are past placements: a divider `mt-1.5 border-t border-hairline pt-2`, the
    label "Antes" (`text-xs text-ink-soft`) and up to three rows, `dt` mono
    `text-ink` `"{code} · {name}"` (or "Invernada não encontrada"), `dd`
    `text-xs text-ink-soft` `"{formatDate(startedOn)} a {formatDate(endedOn)}"`.
    More than three: a last line `"+{n} anteriores no histórico"` (the Mover
    dialog lists them all).
  - **Sanidade**: Saudáveis / Em atenção / Atrasados, each value preceded by
    `<StatusDot status />`; Próximo manejo `formatDate(date)` + suffix
    `"{TREATMENT_TYPE_LABEL[type]} · {heads} {animal|animais}"`, or "—".
- `lot-animals.tsx` — `LotAnimalsCard({ items: AnimalWithDerived[] })`,
  `SectionCard` titled `Animais ({items.length})`. Header action, only when
  there are animals: search `Input` with the `Search` icon exactly like the
  venda record (`type="search"`, placeholder "Buscar brinco", aria-label
  "Buscar animal do lote por brinco", `min-h-11 pl-9 font-mono md:min-h-9`).
  Filter: ear tag lowercased includes the trimmed lowercased term. Empty lot:
  `EmptyState` (icon `Fence`, title "Nenhum animal neste lote", description
  "Os animais que passaram por aqui continuam com o nome do lote na ficha e no
  histórico de manejo."). No match: `<p className="py-1 text-xs text-ink-soft">
  Nenhum brinco corresponde à busca.</p>`.
  - Desktop table (`hidden md:block`, the `Table` primitives as in the venda
    record): Brinco (`Link` to `/herd/{id}`, `font-mono font-medium text-ink
    underline-offset-2 hover:underline`), Categoria (`animalCategoryName`),
    Raça, Sexo (`SEX_LABEL_SHORT`), Nascimento (`formatDate` + `text-ink-soft`
    `formatAge`), Peso (mono, `formatFullWeight`), GMD (mono
    `formatNumber(adg, 2)` + soft " kg/dia", or "—"), Status (`StatusPill
    withDot`). No column sorting.
  - Mobile (`md:hidden`): `<ul className="space-y-3">`, each item a whole-card
    `Link` to the ficha like `components/herd/AnimalCard.tsx` (`flex min-h-11
    flex-col gap-1.5 rounded-xl border border-hairline bg-panel p-4`): row 1
    ear tag `font-mono text-lg leading-none font-semibold` + `StatusPill
    withDot`; row 2 `text-sm text-ink-soft` `"{categoria} · {raça} · {idade}"`;
    row 3 mono `text-sm` `"{formatFullWeight} · GMD {adg} kg/dia"` (GMD part
    only when computable; "sem pesagem" without a weight).
- `lot-actions.tsx`, `delete-lot-button.tsx` — see Actions.

Extraction in `components/ui/`:

- `summary-row.tsx` exports `SummaryRow({ label, value, suffix? })`: the `Row`
  now local to `components/manejo/sale-summary.tsx` (`flex items-baseline
  justify-between gap-3`, `dt text-xs text-ink-soft`, `dd font-mono text-sm
  text-ink`), `value` widened to `ReactNode` so a pill can follow the number.
  `sale-summary.tsx` imports it back; its output is unchanged.

## Conventions

- pt-BR copy, ear tags, dates and figures in `font-mono`, 44px touch targets on
  mobile (`min-h-11`, desktop may drop to `md:min-h-0` / `md:min-h-9`).
- Tokens only (`text-ink`, `bg-panel`, ...). Never loose hex.
- Read `node_modules/next/dist/docs/` before touching routing; this Next.js
  version differs from training data. The venda record is the reference for a
  client-side dynamic route.
- TDD for `lotSummary`, `herdAdgSamples`, `formatMonths`: failing test first.
  Component files have no test harness (node env only).
- No commits from implementation agents. The working tree is shared.

## Out of scope

The KPI alternative (direction B), manejo history of the lot, column sorting
or category/status filters on the animal list, a herd value in R$ for the lot,
editing or deleting placements, changes to the API or the database, the
animal ficha's layout.
