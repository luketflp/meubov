# Animais por raça na ficha do lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ficha do lote's Animais card by raça. Each raça gets one comparison row (cabeças, pesadas, peso médio) that opens to show the animals of that raça.

**Architecture:** A new pure selector, `animalsByBreed`, groups the lote's `AnimalWithDerived` rows by raça and computes each group's numbers. It is unit-tested like `lotSummary`. `components/lots/lot-animals.tsx` is rewritten to render those groups:
- desktop: a raça table with the animals nested under each open raça
- mobile: raça buttons over today's stacked cards

The card also owns the open/closed and search state. The ficha page only adds a `key`.

**Tech Stack:** Next.js 16 app router (client components), React 19, Zustand store (`useHerdStore`), Tailwind 4 with the app's tokens, shadcn `Table` primitives, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-animais-por-raca-design.md`

## Global Constraints

- Copy is pt-BR and verbatim from the spec: "Raça", "Cabeças", "Pesadas", "Peso médio", "7 de 8", "7 de 8 pesadas", "8 cabeças" / "1 cabeça", "média", "sem pesagem", "Buscar brinco", "Nenhum brinco corresponde à busca.".
- Figures in `font-mono`.
- Use tokens only (`text-ink`, `text-ink-soft`, `bg-surface`, `border-hairline`, `divide-hairline`, `text-attention`), never a loose hex.
- Touch targets on mobile are at least 44px. The raça button is `min-h-14`.
- Up to 3 raças start open (`OPEN_BY_DEFAULT_MAX = 3`); 4 or more start closed.
- Peso médio counts only weighed animals and is `null` when nobody in the raça was weighed.
- This Next.js version differs from training data. This plan touches no routing API; it only adds a `key` prop in an existing page.
- TDD applies to `animalsByBreed` only: failing test first. Component files have no test harness.
- **No commits from implementation agents.** The orchestrator commits once at the end, after the user picks "commit". Tasks end at "checks pass".
- Commands:
  - one test file: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
  - whole suite: `pnpm test`
  - lint: `pnpm lint`
  - typecheck: `pnpm exec tsc --noEmit`

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/store/selectors.ts` | + `BreedGroup`, `animalsByBreed()` |
| `lib/store/__tests__/selectors.test.ts` | tests for the selector |
| `components/lots/lot-animals.tsx` | Animais card rebuilt around the raça: groups, open/closed state, search |
| `app/(app)/lots/[id]/page.tsx` | `key={lot.id}` on `LotAnimalsCard` |

---

### Task 1: `animalsByBreed` selector

**Files:**
- Modify: `lib/store/selectors.ts`. Add the interface and function right after `lotSummary` ends, before the `/** The /lots index read by pasture` doc comment of `lotsByInvernada`.
- Test: `lib/store/__tests__/selectors.test.ts`

**Interfaces:**
- Consumes: `AnimalWithDerived` (already in `lib/store/selectors.ts`: `{ animal, status, reason, currentWeightKg, arrobas, adg }`), `withStatus(animals, treatments, todayIso)` for building test rows.
- Produces:
  ```ts
  export interface BreedGroup {
    breed: string;
    items: AnimalWithDerived[];
    heads: number;
    weighedHeads: number;
    avgWeightKg: number | null;
  }
  export function animalsByBreed(items: AnimalWithDerived[]): BreedGroup[];
  ```

- [ ] **Step 1: Write the failing tests**

In `lib/store/__tests__/selectors.test.ts`, add `animalsByBreed` and `withStatus` to the import from `@/lib/store/selectors`. Keep the list alphabetical: `animalById, animalsByBreed, canDeleteLot, …, treatmentBatchSize, withStatus`. Then append this block after the `describe("lotSummary", …)` block:

```ts
describe("animalsByBreed", () => {
  const today = "2026-09-12";
  const derived = (animals: Animal[]) => withStatus(animals, [], today);
  const weighedAt = (weightKg: number) => [{ date: "2026-08-28", weightKg }];

  it("returns no groups for a lote with no animals", () => {
    expect(animalsByBreed([])).toEqual([]);
  });

  it("puts the raça with the most heads first, then orders by name", () => {
    const groups = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Tabapuã" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore" }),
        makeAnimal({ id: "a3", earTag: "03", breed: "Guzerá" }),
        makeAnimal({ id: "a4", earTag: "04", breed: "Nelore" }),
        makeAnimal({ id: "a5", earTag: "05", breed: "Angus" }),
      ])
    );

    expect(groups.map((group) => [group.breed, group.heads])).toEqual([
      ["Nelore", 2],
      ["Angus", 1],
      ["Guzerá", 1],
      ["Tabapuã", 1],
    ]);
  });

  it("keeps each raça's animals in the order they came in", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({ id: "a3", earTag: "03", breed: "Nelore" }),
        makeAnimal({ id: "a1", earTag: "01", breed: "Nelore" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore" }),
      ])
    );

    expect(nelore.items.map((item) => item.animal.id)).toEqual(["a3", "a1", "a2"]);
  });

  it("averages the weight over the weighed animals only", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Nelore", weighings: weighedAt(300) }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Nelore", weighings: weighedAt(360) }),
        makeAnimal({ id: "a3", earTag: "03", breed: "Nelore", weighings: [] }),
      ])
    );

    expect(nelore).toMatchObject({ heads: 3, weighedHeads: 2, avgWeightKg: 330 });
  });

  it("uses the newest weighing of each animal", () => {
    const [nelore] = animalsByBreed(
      derived([
        makeAnimal({
          id: "a1",
          earTag: "01",
          breed: "Nelore",
          weighings: [
            { date: "2026-05-15", weightKg: 280 },
            { date: "2026-08-28", weightKg: 340 },
          ],
        }),
      ])
    );

    expect(nelore.avgWeightKg).toBe(340);
  });

  it("has no average when nobody in the raça was weighed", () => {
    const [senepol] = animalsByBreed(
      derived([
        makeAnimal({ id: "a1", earTag: "01", breed: "Senepol" }),
        makeAnimal({ id: "a2", earTag: "02", breed: "Senepol" }),
      ])
    );

    expect(senepol).toMatchObject({ heads: 2, weighedHeads: 0, avgWeightKg: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: FAIL. The new `animalsByBreed` tests error with `animalsByBreed is not a function` (or a TypeScript import error). The existing tests still pass.

- [ ] **Step 3: Implement the selector**

In `lib/store/selectors.ts`, after the closing `}` of `lotSummary`:

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

/**
 * The lote's animals split by raça: most heads first, then the name, each
 * group keeping the order the animals came in. The peso médio counts only the
 * animals with a weighing, the same rule as lotSummary's avgWeightKg.
 */
export function animalsByBreed(items: AnimalWithDerived[]): BreedGroup[] {
  const itemsByBreed = new Map<string, AnimalWithDerived[]>();
  for (const item of items) {
    const group = itemsByBreed.get(item.animal.breed);
    if (group) group.push(item);
    else itemsByBreed.set(item.animal.breed, [item]);
  }

  return [...itemsByBreed]
    .map(([breed, groupItems]) => {
      const weights = groupItems.flatMap((item) =>
        item.currentWeightKg === null ? [] : [item.currentWeightKg]
      );
      return {
        breed,
        items: groupItems,
        heads: groupItems.length,
        weighedHeads: weights.length,
        avgWeightKg:
          weights.length === 0 ? null : weights.reduce((sum, kg) => sum + kg, 0) / weights.length,
      };
    })
    .sort((a, b) => b.heads - a.heads || a.breed.localeCompare(b.breed, "pt-BR"));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: PASS, including the six `animalsByBreed` tests.

---

### Task 2: Animais card grouped by raça

**Files:**
- Modify: `components/lots/lot-animals.tsx` (full rewrite, shown below)
- Modify: `app/(app)/lots/[id]/page.tsx:115`

**Interfaces:**
- Consumes: `animalsByBreed(items: AnimalWithDerived[]): BreedGroup[]` and `type BreedGroup` from Task 1, plus the existing `formatFullWeight`, `SEX_LABEL`, `animalCategoryName`, `formatAge`, `formatDate`, `formatNumber` and `cn` from `@/lib/utils`.
- Produces: `LotAnimalsCard({ items }: { items: AnimalWithDerived[] })`. The export name and props are unchanged.

Notes the implementer needs:
- `TableRow` (`components/ui/table.tsx`) already carries `has-aria-expanded:bg-muted/50`, so a row holding an open raça button gets a light tint by itself. The raça row overrides it with `has-aria-expanded:bg-surface`, which `cn` (tailwind-merge) resolves in favor of the later class.
- `TableBody` carries `[&_tr:last-child]:border-0`, and that selector also reaches the nested table's header row. So the nested header draws its line on the cells (`[&>th]:border-b`), not only on the row.
- Desktop (table) and mobile (list) are both rendered and hidden with CSS. `aria-controls` ids get a `tabela` or `cards` segment so they never collide.

- [ ] **Step 1: Rewrite `components/lots/lot-animals.tsx`**

Replace the whole file with:

```tsx
"use client";

/**
 * The active animals of a lote, split by raça: one row per raça with its
 * cabeças, pesadas and peso médio, opening to the animals of that raça. Up to
 * three raças start open, more start closed. Ear tags open the ficha.
 * Desktop nests each raça's table under its row; mobile stacks the Rebanho
 * cards under a tappable raça row.
 */
import { Fragment, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Fence, Search } from "lucide-react";
import { animalsByBreed, type AnimalWithDerived, type BreedGroup } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatAge, formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { animalCategoryName } from "@/lib/domain/labels";
import { SEX_LABEL, formatFullWeight } from "@/components/herd/filters";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A lote with at most this many raças opens all of them; more start closed. */
const OPEN_BY_DEFAULT_MAX = 3;

interface LotAnimalsCardProps {
  /** Active animals of the lot, already sorted by ear tag. */
  items: AnimalWithDerived[];
}

/** A raça and the animals of it the search keeps. */
interface VisibleGroup {
  group: BreedGroup;
  rows: AnimalWithDerived[];
}

/** Rows whose ear tag contains the term (case-insensitive); everything when the term is blank. */
function visibleAnimals(items: AnimalWithDerived[], search: string): AnimalWithDerived[] {
  const term = search.trim().toLowerCase();
  if (term === "") return items;
  return items.filter((item) => item.animal.earTag.toLowerCase().includes(term));
}

/** Each raça with the animals the search keeps; a raça left with none drops out. */
function visibleGroups(groups: BreedGroup[], search: string): VisibleGroup[] {
  return groups
    .map((group) => ({ group, rows: visibleAnimals(group.items, search) }))
    .filter((item) => item.rows.length > 0);
}

function adgLabel(adg: number | null): string {
  return adg === null ? "—" : `${formatNumber(adg, 2)} kg/dia`;
}

function headsLabel(heads: number): string {
  return `${heads} ${heads === 1 ? "cabeça" : "cabeças"}`;
}

function weighedLabel(group: BreedGroup): string {
  return `${group.weighedHeads} de ${group.heads}`;
}

function avgWeightLabel(group: BreedGroup): string {
  return group.avgWeightKg === null ? "sem pesagem" : formatFullWeight(group.avgWeightKg);
}

/** Someone in the raça has no weighing, so its peso médio covers fewer heads. */
function missingWeighings(group: BreedGroup): boolean {
  return group.weighedHeads < group.heads;
}

export function LotAnimalsCard({ items }: LotAnimalsCardProps) {
  const customCategories = useHerdStore((s) => s.customCategories);
  const idPrefix = useId();
  const [search, setSearch] = useState("");
  /** Raças the farmer opened or closed, over the default. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  /** Raças closed during the current search; forgotten whenever the search text changes. */
  const [closedInSearch, setClosedInSearch] = useState<ReadonlySet<string>>(() => new Set());

  const groups = useMemo(() => animalsByBreed(items), [items]);
  const visible = useMemo(() => visibleGroups(groups, search), [groups, search]);
  const searching = search.trim() !== "";
  const openByDefault = groups.length <= OPEN_BY_DEFAULT_MAX;

  function isOpen(breed: string): boolean {
    if (searching) return !closedInSearch.has(breed);
    return toggled[breed] ?? openByDefault;
  }

  function toggle(breed: string) {
    if (searching) {
      setClosedInSearch((previous) => {
        const next = new Set(previous);
        if (next.has(breed)) next.delete(breed);
        else next.add(breed);
        return next;
      });
      return;
    }
    setToggled((previous) => ({ ...previous, [breed]: !(previous[breed] ?? openByDefault) }));
  }

  function changeSearch(value: string) {
    setSearch(value);
    setClosedInSearch(new Set());
  }

  return (
    <SectionCard
      title={`Animais (${items.length})`}
      action={
        items.length > 0 ? (
          <div className="relative w-48 sm:w-60">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Buscar brinco"
              aria-label="Buscar animal do lote por brinco"
              className="min-h-11 pl-9 font-mono md:min-h-9"
            />
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhum animal neste lote"
          description="Os animais que passaram por aqui continuam com o nome do lote na ficha e no histórico de manejo."
        />
      ) : visible.length === 0 ? (
        <p className="py-1 text-xs text-ink-soft">Nenhum brinco corresponde à busca.</p>
      ) : (
        <>
          {/* Desktop: one row per raça, its animals nested under it when open */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raça</TableHead>
                  <TableHead className="text-right">Cabeças</TableHead>
                  <TableHead className="text-right">Pesadas</TableHead>
                  <TableHead className="text-right">Peso médio</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Abrir raça</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ group, rows }, index) => {
                  const open = isOpen(group.breed);
                  const panelId = `${idPrefix}-tabela-${index}`;
                  const Chevron = open ? ChevronDown : ChevronRight;
                  return (
                    <Fragment key={group.breed}>
                      <TableRow
                        onClick={() => toggle(group.breed)}
                        className="cursor-pointer has-aria-expanded:bg-surface"
                      >
                        <TableCell className="py-3">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(group.breed);
                            }}
                            className="inline-flex items-center gap-2 font-semibold text-ink"
                          >
                            <Chevron className="size-4 text-ink-soft" aria-hidden />
                            {group.breed}
                          </button>
                        </TableCell>
                        <TableCell className="text-right font-mono">{group.heads}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            missingWeighings(group) ? "text-attention" : "text-ink"
                          )}
                        >
                          {weighedLabel(group)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-ink">
                          {avgWeightLabel(group)}
                        </TableCell>
                        <TableCell />
                      </TableRow>

                      {open ? (
                        <TableRow id={panelId} className="hover:bg-transparent">
                          <TableCell colSpan={5} className="p-0 pb-2">
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent [&>th]:border-b">
                                  <TableHead className="pl-6 text-xs text-ink-soft">Brinco</TableHead>
                                  <TableHead className="text-xs text-ink-soft">Categoria</TableHead>
                                  <TableHead className="text-xs text-ink-soft">Sexo</TableHead>
                                  <TableHead className="text-xs text-ink-soft">Nascimento</TableHead>
                                  <TableHead className="text-right text-xs text-ink-soft">
                                    Peso
                                  </TableHead>
                                  <TableHead className="text-right text-xs text-ink-soft">
                                    GMD
                                  </TableHead>
                                  <TableHead className="text-xs text-ink-soft">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rows.map(({ animal, status, currentWeightKg, adg }) => (
                                  <TableRow key={animal.id}>
                                    <TableCell className="pl-6">
                                      <Link
                                        href={`/herd/${animal.id}`}
                                        className="font-mono font-medium text-ink underline-offset-2 hover:underline"
                                      >
                                        {animal.earTag}
                                      </Link>
                                    </TableCell>
                                    <TableCell>
                                      {animalCategoryName(animal, customCategories)}
                                    </TableCell>
                                    <TableCell>{SEX_LABEL[animal.sex]}</TableCell>
                                    <TableCell>
                                      {formatDate(animal.birthDate)}{" "}
                                      <span className="text-ink-soft">
                                        {formatAge(animal.birthDate)}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-ink">
                                      {formatFullWeight(currentWeightKg)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-ink">
                                      {adgLabel(adg)}
                                    </TableCell>
                                    <TableCell>
                                      <StatusPill status={status} withDot />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a tappable row per raça over the stacked cards; each card opens the ficha */}
          <div className="-my-2 divide-y divide-hairline md:hidden">
            {visible.map(({ group, rows }, index) => {
              const open = isOpen(group.breed);
              const panelId = `${idPrefix}-cards-${index}`;
              const Chevron = open ? ChevronDown : ChevronRight;
              return (
                <div key={group.breed}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => toggle(group.breed)}
                    className="flex min-h-14 w-full items-center gap-2.5 py-2 text-left"
                  >
                    <Chevron className="size-4 shrink-0 text-ink-soft" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{group.breed}</span>
                      <span className="block text-xs text-ink-soft">
                        {headsLabel(group.heads)} ·{" "}
                        <span className={cn(missingWeighings(group) && "text-attention")}>
                          {weighedLabel(group)} pesadas
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs text-ink-soft">média</span>
                      <span className="block font-mono text-sm font-medium text-ink">
                        {avgWeightLabel(group)}
                      </span>
                    </span>
                  </button>

                  {open ? (
                    <ul id={panelId} className="space-y-3 pt-1 pb-4">
                      {rows.map(({ animal, status, currentWeightKg, adg }) => (
                        <li key={animal.id}>
                          <Link
                            href={`/herd/${animal.id}`}
                            aria-label={`Abrir ficha do animal ${animal.earTag}`}
                            className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-hairline bg-panel p-4 transition-colors active:bg-surface"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-lg leading-none font-semibold text-ink">
                                {animal.earTag}
                              </span>
                              <StatusPill status={status} withDot />
                            </div>
                            <p className="text-sm text-ink-soft">
                              {animalCategoryName(animal, customCategories)} ·{" "}
                              {formatAge(animal.birthDate)}
                            </p>
                            <p className="font-mono text-sm text-ink">
                              {currentWeightKg === null
                                ? "sem pesagem"
                                : formatFullWeight(currentWeightKg)}
                              {adg !== null ? ` · GMD ${formatNumber(adg, 2)} kg/dia` : ""}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 2: Key the card by lote in the ficha**

In `app/(app)/lots/[id]/page.tsx`, change:

```tsx
      <LotAnimalsCard items={rows} />
```

to:

```tsx
      <LotAnimalsCard key={lot.id} items={rows} />
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. If `react-hooks` or `react-compiler` lint rules flag `isOpen`/`toggle` as plain functions in render, keep them as plain functions, since they read state each render. Only change them if the rule reports an actual error, and quote the error in the task report.

---

### Task 3: Verify

**Files:** none changed. Screenshots and scripts go to the session scratchpad.

- [ ] **Step 1: Whole suite, lint, typecheck, build**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: all pass. The build output lists `/lots/[id]`.

- [ ] **Step 2: Prepare a lote that mixes raças**

Follow the smoke-test setup:
- Use a throwaway `teste.racas@meubov.local` user, created with `POST /api/auth/sign-up/email` and seeded with `pnpm db:seed --email teste.racas@meubov.local`.
- Reach the database through the socat bridge on `127.0.0.1:5440`.

Find that farm's lots and the raças of their active animals with `docker exec meubov psql -U meubov -d meubov`. The query joins animals to lots for the farm and groups by lot id and breed.

If no lote holds at least 2 raças, update `breed` on a few active animals of one lote of **this teste farm only**:
- one lote ends with 3 raças and at least one animal with no weighing
- a second lote ends with 4 raças

- [ ] **Step 3: Drive the ficha headlessly**

Start the production build: `DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5440/meubov BETTER_AUTH_URL=http://localhost:3010 pnpm exec next start -p 3010`. Then use a Playwright script (`createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/")`, chromium at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`) that signs in through `POST /api/auth/sign-in/email` and checks the following. Scope locators with `.locator("visible=true")`.

On the 3-raça lote at 1440×900:
1. Every raça row is open (`aria-expanded="true"`). The raças are ordered by head count, and Pesadas shows "N de M".
2. Clicking a raça row closes it, and its nested rows disappear.
3. Typing a brinco fragment that matches only one raça leaves only that raça's row, open, with just the matches.
4. Clearing the search brings back the closed raça from step 2, still closed, next to the open ones.
5. A screenshot of the Animais card.

On the 4-raça lote: every raça row is closed at load, and there is a screenshot.

At 390×844 on the 3-raça lote:
- The raça buttons show "cabeças · N de M pesadas" and "média".
- Tapping one closes its cards.
- A full-page screenshot.

Read the screenshots and compare them with the canvas (Main, Busca, MuitasRacas, Celular artboards).

- [ ] **Step 4: Clean up**

Stop the `next start` process by pid (`ss -ltnp | grep 3010`) and run `docker rm -f meubov-bridge`.

---

## Finish

After Task 3, report the results to the user and ask whether to commit. On "commit", make one commit on `main` that includes the spec and this plan:

```bash
git add lib/store/selectors.ts lib/store/__tests__/selectors.test.ts components/lots/lot-animals.tsx "app/(app)/lots/[id]/page.tsx" docs/superpowers/specs/2026-09-12-animais-por-raca-design.md docs/superpowers/plans/2026-09-12-animais-por-raca.md
git commit
```

Message: `feat(lots): group the ficha's animals by raça`, followed by a prose body in the repo's voice. No attribution trailers.
