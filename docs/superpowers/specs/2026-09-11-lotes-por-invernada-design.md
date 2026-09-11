# Lotes por invernada (/lots) — design

Date: 2026-09-11. Status: direction approved on the canvas, ready to implement.
Canvas: https://claude.ai/code/artifact/424ddf7b-6840-4cb8-92d6-b35086cb9070

## Goal

`/lots` today is one `SectionCard` holding every lote in a flat grid. Each card
repeats the invernada it stands on, only the name is a link (clicking the rest
of the card does nothing), and four action buttons take half the card's height.
The farmer reads the herd by pasture — "quem está no Retiro Velho, e o Retiro
aguenta?" — so the page is rebuilt around the invernada: one section per
occupied pasture with its grazing pressure, the lotes as cards inside it, the
free pastures as a strip at the end, and the closed lotes in their own section.

Nothing about the ficha (`/lots/[id]`), the dialogs or the store changes. This
is the index page, its selector and one new UI primitive.

## Page anatomy

Top to bottom, inside the existing `max-w-6xl px-4 py-6 md:px-8` column:

1. **`PageHeader`** — unchanged: "Lotes", "Grupos de animais e a invernada onde
   cada um está", `AddLotDialog` as the action.
2. **Totals strip** — four `KpiCard`s, `grid-cols-2 lg:grid-cols-4`:
   - "Lotes ativos" — count of lots with an open placement; sub "em N
     invernadas".
   - "Cabeças" — active animals in those lots; sub "N com pesagem".
   - "UA totais" — `totalAu` of the same animals, one decimal; sub "1 UA = 450 kg".
   - "Lotação média" — `herdStockingRateAuPerHa` over every invernada, two
     decimals, with a `StatusDot` of its `classifyStockingRate` class and the
     faixa label as the sub ("subutilizada" / "faixa de equilíbrio" / "pressão
     alta").
3. **One section per occupied invernada**, ordered by `code` (locale-aware,
   numeric): header with a `Fence` tile, "Invernada `code` · `name`", the
   "capim · ha" line, and on the right the invernada's cabeças and UA plus the
   **lotação bar**. Body: the lot cards in `grid gap-3 sm:grid-cols-2
   xl:grid-cols-3`.
4. **"Invernadas livres"** — one `SectionCard` of chips, one per invernada with
   no lot on it today: `code`, name, "ha · capim", and "livre há N d" from the
   newest `endedOn` among its placements ("nunca ocupada" when it never held
   one). Header action: the total free hectares. The whole section is absent
   when every invernada is occupied.
5. **"Lotes encerrados"** — lots with no open placement, newest closing first.
   Muted cards (`bg-surface`, `text-ink-soft`) with an "Encerrado" badge,
   "Encerrado em `dd/MM/yyyy`" and "Última invernada: `code` · `name`". Absent
   when there are none.

An invernada with a lot on it that holds zero active animals still gets its
section — the lot is there, it is just empty — and the section's rate is 0,00
UA/ha ("subutilizada").

When the farm has no lot at all, the page keeps today's `EmptyState` ("Nenhum
lote cadastrado") in place of items 3–5; the totals strip stays, showing zeros.

## The lot card

The whole card is a `<Link href={/lots/${lot.id}}>` — `block`, `min-h-11`, with
the hover state the canvas shows: border `border-brand/45`, a 1px shadow, the
name underlined. Inside:

- **Header row**: the name (`font-heading text-[15px] font-semibold`) with a
  `ChevronRight`, and the `•••` menu button on the right.
- **Head count**: `font-mono text-[28px] font-semibold` + "cabeças".
- **`dl`**, above a hairline: "Peso total" → `formatKg · formatArroba`;
  "GMD 120 d" → `TrendingUp` + `0,780 kg/dia`, or "—" when no animal has two
  weighings in the window.
- **Sanidade**, above a second hairline: `StatusDot` + count + label for each
  of healthy / attention / overdue. A zero count is dropped, except "saudáveis",
  which always shows (a lot with no animals reads "0 saudáveis").

The `needsReview` badge keeps its place next to the name.

### Actions

`Editar`, `Mover de invernada`, `Arquivar` and `Excluir` move off the card face
into a `•••` dropdown at its corner. The dropdown lives inside the card's link,
so its trigger stops propagation and prevents the default navigation; each item
opens the dialog it opens today. The items are exactly the ones the lot admits
right now, which is what the card renders today:

- `Editar` — always.
- `Mover de invernada` — only while the lot has an open placement; the closed
  card shows "Ver histórico" instead, linking to the ficha.
- `Arquivar` — only with an open placement and zero active animals.
- `Excluir` — only when `canDeleteLot`; rendered in `text-destructive`.

`components/ui/dropdown-menu.tsx` is new: a shadcn-shaped wrapper over
`radix-ui`'s `DropdownMenu` (already a dependency), written the way
`components/ui/select.tsx` is — `data-slot` attributes, `cn`, the app's tokens.

## The lotação bar

New `components/lots/stocking-bar.tsx`, used in the section headers (and
available to the ficha later):

- A 6px track (`bg-canvas`, `border-hairline`) with a fill whose width is
  `min(auPerHa / 2.4, 1) * 100%` and whose color is the `StatusVisual` of the
  classification (`light` → scheduled, `good` → healthy, `high` → overdue).
- Two 1px ticks at 0,9 and 1,6 UA/ha — the thresholds `classifyStockingRate`
  already uses — so the bar reads as a faixa, not a percentage.
- Above it: the rate in `font-mono` colored like the fill, and the faixa label
  in `text-ink-soft`.
- `aria-hidden` on the bar; the accessible text is the rate and label beside it.
- The scale ceiling (2,4 UA/ha) is a module constant, not a magic number.

## The selector

One new pure selector in `lib/store/selectors.ts`, unit-tested like
`lotSummary`:

```ts
/** One lote as the index card shows it. */
export interface LotCardRow {
  lot: Lot;
  heads: number;
  totalWeightKg: number;
  totalArrobas: number;
  /** herdAverageAdg over the lot's active animals (120-day window); null with no sample. */
  adg: number | null;
  health: { healthy: number; attention: number; overdue: number };
  /** Open placement of the lot, or null when it is closed. */
  placement: LotPlacement | null;
  canDelete: boolean;
}

/** One occupied invernada with the lotes standing on it. */
export interface InvernadaSection {
  invernada: Invernada;
  lots: LotCardRow[];
  headCount: number;
  totalWeightKg: number;
  totalAu: number;
  auPerHa: number;
  classification: StockingRateClass;
}

/** An invernada with no lote on it today. */
export interface FreeInvernada {
  invernada: Invernada;
  /** Days since the newest placement ended; null when it never held a lot. */
  freeForDays: number | null;
}

/** A closed lote, with where it last stood. */
export interface ClosedLotRow extends LotCardRow {
  /** endedOn of its newest placement, or null when it never had one. */
  closedOn: string | null;
  lastInvernada: Invernada | null;
}

export interface LotsByInvernada {
  sections: InvernadaSection[];
  free: FreeInvernada[];
  closed: ClosedLotRow[];
  totals: {
    activeLots: number;
    occupiedInvernadas: number;
    heads: number;
    weighedHeads: number;
    totalAu: number;
    herdAuPerHa: number;
    herdClassification: StockingRateClass;
  };
}

export function lotsByInvernada(
  state: Pick<HerdData, "lots" | "animals" | "treatments" | "invernadas" | "lotPlacements" | "manejoSessions">,
  todayIso: string
): LotsByInvernada;
```

Rules it encodes:

- Only `activeLots` (never a deleted lot) and only `activeAnimals` count.
- `sections` holds the invernadas with at least one lot placed today, ordered by
  `code` with `localeCompare(…, undefined, {numeric: true})`; the lots inside
  ordered by `name` the same way.
- Section aggregates cover every lot on the invernada, matching
  `invernadasWithSummary` (which it composes, so the section rate and the
  ficha's `stocking.auPerHa` can never disagree).
- `free` is every other invernada, same ordering; `freeForDays` is
  `daysBetween(newest endedOn, todayIso)`.
- `closed` is every active lot with no open placement, ordered by `closedOn`
  descending, nulls last, then by name.
- `totals.heads` / `weighedHeads` / `totalAu` cover the animals of the placed
  lots; `herdAuPerHa` is `herdStockingRateAuPerHa(activeAnimals, invernadas)` —
  the Painel's own number, hectares of every invernada included.
- Health counts come from `withStatus(animals, treatments, todayIso)`, the way
  `lotSummary` reads them, computed once per lot.

Cost: one pass over the animals to group them by lot, then per-lot work over
that lot's animals only. `invernadasWithSummary` is called once, not per lot.

## Components

| File | Responsibility |
| --- | --- |
| `components/lots/lots-paddocks.tsx` | rewritten: reads the selector, renders the strip, the sections, the free strip and the closed section |
| `components/lots/lot-card.tsx` | the clickable card (new) |
| `components/lots/lot-card-menu.tsx` | the `•••` dropdown wiring the four dialogs (new) |
| `components/lots/stocking-bar.tsx` | the lotação bar (new) |
| `components/lots/use-delete-lot.ts` | confirm + API call + refusal message, extracted from `DeleteLotButton` (new) |
| `components/ui/dropdown-menu.tsx` | shadcn-shaped primitive (new) |
| `lib/store/selectors.ts` | `lotsByInvernada` and its types |

`AddLotDialog`, `EditLotDialog`, `MoveLotDialog`, `ArchiveLotDialog` and
`DeleteLotButton` keep their behavior. The three lot dialogs each gain an
optional controlled mode (`open` / `onOpenChange`, plus `trigger: "none"`) so a
menu item can open them, and the delete flow moves into a `useDeleteLot` hook
that both `DeleteLotButton` and the menu call — the menu, having no room for an
inline failure line, reports a refusal through the app's toast.

## Copy (pt-BR, verbatim)

- Section header: `Invernada 03 · Retiro Velho`, `Brachiaria Marandu · 48,0 ha`.
- Faixa labels: `subutilizada`, `faixa de equilíbrio`, `pressão alta`.
- Card: `cabeças`, `Peso total`, `GMD 120 d`, `saudáveis`, `atenção`,
  `atrasados`.
- Menu: `Editar`, `Mover de invernada`, `Arquivar`, `Excluir`, `Ver histórico`.
- Free strip: `Invernadas livres`, `livre há 34 d`, `nunca ocupada`,
  `75,9 ha sem lote`.
- Closed: `Lotes encerrados`, `Encerrado`, `Encerrado em 12/06/2026`,
  `Última invernada: 01 · Sede`.
- KPIs: `Lotes ativos`, `Cabeças`, `UA totais`, `Lotação média`, subs
  `em 3 invernadas`, `284 com pesagem`, `1 UA = 450 kg`.

## Testing

- TDD on `lotsByInvernada` in `lib/store/__tests__/selectors.test.ts`: grouping
  and ordering, a lot with zero animals, a closed lot, an invernada that never
  held a lot, `freeForDays`, health counts, totals, and agreement with
  `invernadasWithSummary` on the rate.
- No component test harness exists; the page is verified in the running app
  (desktop and 390px) as the earlier screens were.

## Out of scope

Search/filter over lotes, a map thumbnail in the section header, changing the
ficha, drag-and-drop between invernadas, and any store or API change.
