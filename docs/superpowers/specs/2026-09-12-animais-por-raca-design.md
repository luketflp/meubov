# Animais por raça na ficha do lote (/lots/[id]) — design

Date: 2026-09-12. Status: direction C approved on the canvas, ready to implement.
Canvas: https://claude.ai/code/artifact/b1add67f-86a4-4bd3-9b9d-eda6628b9e57

## Goal

The "Animais" card on the ficha do lote lists every active animal in one flat
table, with the raça as a column. A lote often mixes raças (Nelore with a few
Guzerá, a pair of Tabapuã), and the farmer wants to see how each raça is doing
against the others, starting with weight. The card is rebuilt around the raça:
first a comparison row per raça (cabeças, pesadas, peso médio), and each row
opens to show the animals of that raça.

Only the Animais card changes. The Resumo do lote, the `/lots` index, the
dialogs, the API and the store stay as they are.

## The selector

New pure selector in `lib/store/selectors.ts`:

```ts
/** The animals of a lote split by raça, as the ficha's Animais card reads them. */
export interface BreedGroup {
  breed: string;
  /** The group's animals, in the order they came in (the page sorts by ear tag). */
  items: AnimalWithDerived[];
  heads: number;
  /** Animals with at least one weighing (currentWeightKg !== null). */
  weighedHeads: number;
  /** Mean currentWeightKg over the weighed animals; null when nobody was weighed. */
  avgWeightKg: number | null;
}

export function animalsByBreed(items: AnimalWithDerived[]): BreedGroup[];
```

- Groups by `animal.breed` exactly as stored. The API already refuses a blank
  raça, so there is no "sem raça" bucket.
- Order: most `heads` first, then `breed` with `localeCompare(…, "pt-BR")`.
- `avgWeightKg` follows the same rule as `lotSummary.avgWeightKg`: total weight
  of the weighed animals divided by `weighedHeads`.
- An empty input returns `[]`.

## Desktop (md and up)

The card keeps its title "Animais (N)", its search box ("Buscar brinco") and its
`EmptyState` for a lote with no animals.

The body is one `Table`:

- **Header**: Raça · Cabeças (right) · Pesadas (right) · Peso médio (right) · an
  empty `w-10` column.
- **One raça row per group**, in selector order:
  - Raça: a `<button type="button">` with `aria-expanded` and `aria-controls`,
    holding `ChevronRight` (closed) or `ChevronDown` (open), `size-4
    text-ink-soft`, then the name in `font-semibold text-ink`. Clicking
    anywhere on the row toggles it too.
  - Cabeças: `font-mono`.
  - Pesadas: `font-mono`, "7 de 8". Turns `text-attention` when `weighedHeads <
    heads`.
  - Peso médio: `font-mono font-medium`, `formatFullWeight(avgWeightKg)`
    ("320 kg · 10,7 @"), or "sem pesagem" when it is null.
  - An open row gets `bg-surface`.
- **Under an open raça row**, one row whose single cell (`colSpan={5}`, no
  padding except `pb-2`, no hover tint) holds the animals of that raça as a
  nested table:
  - Columns: Brinco · Categoria · Sexo · Nascimento · Peso (right) · GMD (right)
    · Status. That is today's table minus the Raça column. The headers are
    `text-xs font-medium text-ink-soft`.
  - The first column is indented `pl-6` in both the header and the rows.
  - The cells are exactly today's: the brinco links to `/herd/[id]`, the birth
    date is followed by the age, the weight uses `formatFullWeight`, the GMD
    reads "0,41 kg/dia" or "—", and the status is a `StatusPill` with a dot.

## Mobile (below md)

The same groups as a list with a `border-t border-hairline` between raças:

- **Raça row**: a full-width `<button>` (`min-h-14`, `aria-expanded`), with the
  chevron, then the name (`text-sm font-semibold`), then under it "8 cabeças ·
  7 de 8 pesadas" (`text-xs text-ink-soft`). The pesadas part turns
  `text-attention` when someone was not weighed. On the right sits "média"
  (`text-xs`) over the peso médio (`font-mono text-sm font-medium`).
- **Open**: today's stacked cards under the row (`space-y-3`, `pb-4`). The card
  subtitle drops the raça and reads "Novilha · 2a 11m".

## Open and closed

- **Default**: a lote with up to 3 raças starts with every raça open. A lote with
  4 or more starts with every raça closed.
- Each raça opens and closes on its own, and several can be open at once.
- The state lives in the card as per-raça overrides on top of the default
  (`Record<string, boolean>`). A raça that appears later, for example after an
  animal is moved in, follows the default.
- The ficha passes `key={lot.id}` to the card, so a different lote never
  inherits another lote's open raças.

## Search by brinco

- While the search has text, a raça with matching brincos shows only those
  animals and starts open. A raça with no match is hidden, both its row and its
  animals.
- The numbers on a raça row stay those of the whole raça: cabeças, pesadas and
  peso médio do not shrink to the matches.
- Clicking a raça row during a search still closes it. Those clicks are kept
  apart and forgotten whenever the search text changes.
- Clearing the search brings back the open and closed raças from before.
- When no brinco matches at all, the card shows today's line: "Nenhum brinco
  corresponde à busca."

## Testing

- TDD for `animalsByBreed` in `lib/store/__tests__/selectors.test.ts`. The
  cases:
  - grouping
  - order by heads, then by name, e.g. "Angus" before "Guzerá" at equal heads
  - items keep their incoming order
  - average over weighed animals only
  - `null` average when nobody was weighed
  - empty input
- `pnpm test`, `pnpm lint` and `pnpm build` pass.
- A smoke test in the real app with a teste.* user whose lote mixes raças:
  - desktop and phone screenshots
  - opening and closing a raça
  - a search that hides a raça, then clearing it
  - a lote with 4 raças starting closed

## Out of scope

- Per-raça numbers on the `/lots` cards or in the Resumo do lote.
- GMD or age per raça.
- Sorting the raça rows by column.
