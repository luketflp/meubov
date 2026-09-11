# Lotes por invernada (/lots) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/lots` around the pasture: one section per occupied invernada with its stocking bar, the lotes as cards whose whole surface opens the ficha, the actions behind a `•••` menu, free invernadas as a chip strip and closed lotes in their own section.

**Architecture:** One new pure selector, `lotsByInvernada`, derives the whole page from the store snapshot (sections, free invernadas, closed lots, totals) and is unit-tested like `lotSummary`. `components/lots/lots-paddocks.tsx` is rewritten to render it with three new components (`LotCard`, `LotCardMenu`, `StockingBar`) and one new primitive (`components/ui/dropdown-menu.tsx`). The four existing dialogs keep their behavior and gain a controlled mode so a menu item can open them.

**Tech Stack:** Next.js 16 app router (client components), React 19, Zustand store (`useHerdStore`), Tailwind 4 with the app's tokens, shadcn primitives over `radix-ui`, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-lotes-por-invernada-design.md`

## Global Constraints

- pt-BR copy, verbatim from the spec's "Copy" section. Figures and dates in `font-mono`.
- Tokens only (`text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `bg-canvas`, `border-hairline`, `text-brand`, `text-healthy`, `text-attention`, `text-overdue`, `text-scheduled`). Never a loose hex.
- 44px touch targets on mobile: `min-h-11`, desktop may relax with `md:min-h-9`.
- This Next.js version differs from training data: read `node_modules/next/dist/docs/` before touching anything routing-related. This plan touches no route file, only client components and a selector.
- TDD for `lotsByInvernada`: failing test first. Component files have no test harness.
- **No commits from implementation agents.** The orchestrator commits once at the end. Tasks end at "tests pass".
- Commands: one test file `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`; whole suite `pnpm test`; lint `pnpm lint`; typecheck `pnpm exec tsc --noEmit`.
- Today's date in examples is 2026-09-11; tests always pass an explicit `todayIso`, never call `todayISO()`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/store/selectors.ts` | + `LotCardRow`, `InvernadaSection`, `FreeInvernada`, `ClosedLotRow`, `LotsByInvernada`, `lotsByInvernada()` |
| `lib/store/__tests__/selectors.test.ts` | tests for the selector |
| `components/ui/dropdown-menu.tsx` | new shadcn-style wrapper over `radix-ui`'s `DropdownMenu` |
| `components/lots/stocking-bar.tsx` | the lotação bar with its two faixa ticks |
| `components/lots/lot-card.tsx` | the clickable lot card |
| `components/lots/lot-card-menu.tsx` | the `•••` menu wiring the four actions |
| `components/lots/edit-lot-dialog.tsx` | + controlled mode (`open`/`onOpenChange`, `trigger: "none"`) |
| `components/lots/move-lot-dialog.tsx` | same |
| `components/lots/archive-lot-dialog.tsx` | same |
| `components/lots/use-delete-lot.ts` | the confirm + API call + failure message, extracted from `DeleteLotButton` |
| `components/lots/delete-lot-button.tsx` | uses the hook, behavior unchanged |
| `components/lots/lots-paddocks.tsx` | rewritten: totals strip, invernada sections, free strip, closed section |

---

### Task 1: `lotsByInvernada` selector

**Files:**
- Modify: `lib/store/selectors.ts`
- Test: `lib/store/__tests__/selectors.test.ts`

**Interfaces:**
- Consumes: `activeLots`, `activeAnimals`, `currentPlacementForLot`, `invernadasWithSummary`, `withStatus`, `canDeleteLot`, `herdStockingRateAuPerHa`, `totalAu`, `classifyStockingRate`, `herdAdgSamples`, `totalWeightKg`, `kgToArroba`, `daysBetween`, `currentWeight`.
- Produces: the types and function in the spec's "The selector" section, imported by `lots-paddocks.tsx` and `lot-card.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `lib/store/__tests__/selectors.test.ts` (add `lotsByInvernada` to the import list at the top):

```ts
describe("lotsByInvernada", () => {
  const state = {
    lots,
    animals,
    treatments: [] as Treatment[],
    invernadas,
    lotPlacements: placements,
    manejoSessions: [] as ManejoSession[],
  };

  it("groups the placed lots under their invernada, ordered by code", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");

    expect(sections.map((section) => section.invernada.code)).toEqual(["01"]);
    expect(sections[0].lots.map((row) => row.lot.name)).toEqual(["Matrizes", "Recria"]);
    expect(sections[0].headCount).toBe(2);
    expect(sections[0].totalWeightKg).toBe(1350);
    expect(sections[0].auPerHa).toBeCloseTo(0.3);
    expect(sections[0].classification).toBe("light");
  });

  it("agrees with invernadasWithSummary on the stocking rate", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");
    const occupancy = invernadasWithSummary(invernadas, lots, placements, animals).find(
      (item) => item.invernada.id === "invernada-1"
    );

    expect(sections[0].auPerHa).toBe(occupancy?.auPerHa);
  });

  it("carries per-lot weight, arrobas and health onto the card row", () => {
    const { sections } = lotsByInvernada(state, "2026-09-11");
    const [matrizes] = sections[0].lots;

    expect(matrizes).toMatchObject({
      heads: 1,
      totalWeightKg: 450,
      health: { healthy: 1, attention: 0, overdue: 0 },
      canDelete: false,
    });
    expect(matrizes.totalArrobas).toBeCloseTo(15);
    expect(matrizes.adg).toBeNull();
  });

  it("lists the invernadas with no lot, with the days since the last one left", () => {
    const { free } = lotsByInvernada(state, "2026-09-11");

    expect(free.map((item) => item.invernada.code)).toEqual(["02", "03"]);
    expect(free[0].freeForDays).toBe(72);
    expect(free[1].freeForDays).toBeNull();
  });

  it("puts a lot with no open placement under closed, newest first", () => {
    const closedLot: Lot = { id: "lot-3", name: "Bezerros 2024" };
    const closedPlacement: LotPlacement = {
      id: "placement-closed",
      lotId: "lot-3",
      invernadaId: "invernada-3",
      startedOn: "2026-01-05",
      endedOn: "2026-02-28",
    };
    const { closed, sections } = lotsByInvernada(
      { ...state, lots: [...lots, closedLot], lotPlacements: [...placements, closedPlacement] },
      "2026-09-11"
    );

    expect(closed.map((row) => row.lot.name)).toEqual(["Bezerros 2024"]);
    expect(closed[0].closedOn).toBe("2026-02-28");
    expect(closed[0].lastInvernada?.code).toBe("03");
    expect(closed[0].canDelete).toBe(true);
    expect(sections.map((section) => section.invernada.code)).toEqual(["01"]);
  });

  it("leaves a deleted lot out of every group", () => {
    const deleted: Lot = { id: "lot-9", name: "Apagado", deletedAt: "2026-08-01T12:00:00.000Z" };
    const { sections, closed } = lotsByInvernada({ ...state, lots: [...lots, deleted] }, "2026-09-11");

    expect(sections.flatMap((section) => section.lots).map((row) => row.lot.id)).not.toContain("lot-9");
    expect(closed.map((row) => row.lot.id)).not.toContain("lot-9");
  });

  it("totals the placed lots and the whole-herd stocking rate", () => {
    const { totals } = lotsByInvernada(state, "2026-09-11");

    expect(totals).toMatchObject({
      activeLots: 2,
      occupiedInvernadas: 1,
      heads: 2,
      weighedHeads: 2,
    });
    expect(totals.totalAu).toBeCloseTo(3);
    expect(totals.herdAuPerHa).toBeCloseTo(0.05);
    expect(totals.herdClassification).toBe("light");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: FAIL — `lotsByInvernada is not a function` / the import does not resolve.

- [ ] **Step 3: Implement the selector**

Add to `lib/store/selectors.ts`, next to `lotSummary` (types beside the other exported interfaces at the top of the file):

```ts
/** One lote as the index card shows it. */
export interface LotCardRow {
  lot: Lot;
  heads: number;
  totalWeightKg: number;
  totalArrobas: number;
  /** Mean ADG over the lot's active animals (120-day window); null with no sample. */
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
  closedOn: string | null;
  lastInvernada: Invernada | null;
}

/** Everything the /lots index renders, derived from the snapshot. */
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

/** Codes and names sort the way a farmer reads them: "02" before "10". */
const compareLabel = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function lotsByInvernada(
  state: Pick<
    HerdData,
    "lots" | "animals" | "treatments" | "invernadas" | "lotPlacements" | "manejoSessions"
  >,
  todayIso: string
): LotsByInvernada {
  const lots = activeLots(state.lots);
  const animals = activeAnimals(state.animals);

  const animalsByLotId = new Map<string, Animal[]>();
  for (const animal of animals) {
    const group = animalsByLotId.get(animal.lotId);
    if (group) group.push(animal);
    else animalsByLotId.set(animal.lotId, [animal]);
  }

  const invernadaById = new Map(state.invernadas.map((invernada) => [invernada.id, invernada]));

  const row = (lot: Lot): LotCardRow => {
    const lotAnimals = animalsByLotId.get(lot.id) ?? [];
    const kg = totalWeightKg(lotAnimals);
    const samples = herdAdgSamples(lotAnimals, todayIso);
    const health = { healthy: 0, attention: 0, overdue: 0 };
    for (const item of withStatus(lotAnimals, state.treatments, todayIso)) {
      health[item.status] += 1;
    }
    return {
      lot,
      heads: lotAnimals.length,
      totalWeightKg: kg,
      totalArrobas: kgToArroba(kg),
      adg:
        samples.length === 0
          ? null
          : samples.reduce((sum, value) => sum + value, 0) / samples.length,
      health,
      placement: currentPlacementForLot(lot.id, state.lotPlacements),
      canDelete: canDeleteLot(lot.id, state.animals, state.manejoSessions),
    };
  };

  const rows = lots.map(row).sort((a, b) => compareLabel(a.lot.name, b.lot.name));

  const occupancyById = new Map(
    invernadasWithSummary(state.invernadas, state.lots, state.lotPlacements, state.animals).map(
      (item) => [item.invernada.id, item]
    )
  );

  const rowsByInvernadaId = new Map<string, LotCardRow[]>();
  const closedRows: LotCardRow[] = [];
  for (const item of rows) {
    if (!item.placement) {
      closedRows.push(item);
      continue;
    }
    const group = rowsByInvernadaId.get(item.placement.invernadaId);
    if (group) group.push(item);
    else rowsByInvernadaId.set(item.placement.invernadaId, [item]);
  }

  const sections: InvernadaSection[] = [];
  const free: FreeInvernada[] = [];
  for (const invernada of [...state.invernadas].sort((a, b) => compareLabel(a.code, b.code))) {
    const placed = rowsByInvernadaId.get(invernada.id);
    if (placed) {
      const occupancy = occupancyById.get(invernada.id);
      const kg = occupancy?.totalWeightKg ?? 0;
      sections.push({
        invernada,
        lots: placed,
        headCount: occupancy?.headCount ?? 0,
        totalWeightKg: kg,
        totalAu: kg / KG_PER_AU,
        auPerHa: occupancy?.auPerHa ?? 0,
        classification: occupancy?.classification ?? classifyStockingRate(0),
      });
      continue;
    }
    let lastEnd: string | null = null;
    for (const placement of state.lotPlacements) {
      if (placement.invernadaId !== invernada.id || !placement.endedOn) continue;
      if (lastEnd === null || compareDate(lastEnd, placement.endedOn) < 0) lastEnd = placement.endedOn;
    }
    free.push({
      invernada,
      freeForDays: lastEnd === null ? null : daysBetween(lastEnd, todayIso),
    });
  }

  const closed: ClosedLotRow[] = closedRows
    .map((item) => {
      const own = state.lotPlacements
        .filter((placement) => placement.lotId === item.lot.id && placement.endedOn)
        .sort((a, b) => compareDate(b.endedOn ?? "", a.endedOn ?? ""));
      const last = own[0];
      return {
        ...item,
        closedOn: last?.endedOn ?? null,
        lastInvernada: last ? (invernadaById.get(last.invernadaId) ?? null) : null,
      };
    })
    .sort(
      (a, b) =>
        compareDate(b.closedOn ?? "", a.closedOn ?? "") || compareLabel(a.lot.name, b.lot.name)
    );

  const placedAnimals = sections.flatMap((section) =>
    section.lots.flatMap((item) => animalsByLotId.get(item.lot.id) ?? [])
  );
  const herdAuPerHa = herdStockingRateAuPerHa(state.animals, state.invernadas);

  return {
    sections,
    free,
    closed,
    totals: {
      activeLots: sections.reduce((sum, section) => sum + section.lots.length, 0),
      occupiedInvernadas: sections.length,
      heads: placedAnimals.length,
      weighedHeads: placedAnimals.filter((animal) => currentWeight(animal) !== null).length,
      totalAu: totalAu(placedAnimals),
      herdAuPerHa,
      herdClassification: classifyStockingRate(herdAuPerHa),
    },
  };
}
```

Check the import block at the top of `selectors.ts` covers `KG_PER_AU`, `classifyStockingRate`, `totalAu` and `herdAdgSamples`; add what is missing.

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: PASS, existing cases included.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

---

### Task 2: `DropdownMenu` primitive

**Files:**
- Create: `components/ui/dropdown-menu.tsx`

**Interfaces:**
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` — used by `lot-card-menu.tsx`.

- [ ] **Step 1: Write the component**

Mirror `components/ui/select.tsx`: `"use client"`, `import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"`, `data-slot` attributes, `cn` for classes. Content and items carry the app's tokens:

```tsx
function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-lg border border-hairline bg-panel p-1 text-ink shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "flex min-h-9 cursor-default items-center gap-2.5 rounded-md px-2 text-sm outline-none select-none focus:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-overdue [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-soft data-[variant=destructive]:[&_svg]:text-overdue",
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

---

### Task 3: `StockingBar`

**Files:**
- Create: `components/lots/stocking-bar.tsx`

**Interfaces:**
- Produces: `StockingBar({ auPerHa, classification, className })` and `STOCKING_LABEL: Record<StockingRateClass, string>` — used by `lots-paddocks.tsx`.

- [ ] **Step 1: Write the component**

```tsx
import type { StockingRateClass } from "@/lib/types";
import { formatNumber } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

/** Top of the bar's scale, past the "high" threshold so a loaded pasture still reads. */
const SCALE_MAX_AU_PER_HA = 2.4;
/** The two limits classifyStockingRate() uses, drawn as ticks. */
const FAIXA_TICKS = [0.9, 1.6];

export const STOCKING_LABEL: Record<StockingRateClass, string> = {
  light: "subutilizada",
  good: "faixa de equilíbrio",
  high: "pressão alta",
};

const fill: Record<StockingRateClass, string> = {
  light: "bg-scheduled",
  good: "bg-healthy",
  high: "bg-overdue",
};

const ink: Record<StockingRateClass, string> = {
  light: "text-scheduled",
  good: "text-healthy",
  high: "text-overdue",
};

export function StockingBar({
  auPerHa,
  classification,
  className,
}: {
  auPerHa: number;
  classification: StockingRateClass;
  className?: string;
}) {
  const width = Math.min(auPerHa / SCALE_MAX_AU_PER_HA, 1) * 100;
  return (
    <div className={cn("w-33", className)}>
      <div className="flex items-baseline justify-between gap-1.5">
        <span className={cn("font-mono text-[13px] font-medium", ink[classification])}>
          {formatNumber(auPerHa, 2)} UA/ha
        </span>
        <span className="text-[11px] text-ink-soft">{STOCKING_LABEL[classification]}</span>
      </div>
      <div
        aria-hidden
        className="relative mt-1.5 h-1.5 rounded-full border border-hairline bg-canvas"
      >
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", fill[classification])}
          style={{ width: `${width}%` }}
        />
        {FAIXA_TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute -top-0.5 h-2.5 w-px bg-ink/20"
            style={{ left: `${(tick / SCALE_MAX_AU_PER_HA) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

---

### Task 4: Controlled mode on the dialogs and the delete hook

**Files:**
- Modify: `components/lots/edit-lot-dialog.tsx`, `components/lots/move-lot-dialog.tsx`, `components/lots/archive-lot-dialog.tsx`, `components/lots/delete-lot-button.tsx`
- Create: `components/lots/use-delete-lot.ts`

**Interfaces:**
- Produces:
  - `EditLotDialog({ lot, trigger?: "icon" | "button" | "none", open?: boolean, onOpenChange?: (open: boolean) => void })`
  - `MoveLotDialog({ lot, currentInvernada, trigger?: "button" | "none", open?, onOpenChange? })`
  - `ArchiveLotDialog({ lot, currentPlacement, trigger?: "button" | "none", open?, onOpenChange? })`
  - `useDeleteLot(lot, onDeleted?) => { remove: () => Promise<void>, removing: boolean, error: string | null }`

- [ ] **Step 1: Add the controlled props to each dialog**

Each dialog already owns `const [open, setOpen] = useState(false)` and an `onOpenChange(next)` that resets its fields. Keep both; make the rendered state fall back to the prop and notify the parent:

```tsx
const [internalOpen, setInternalOpen] = useState(false);
const open = controlledOpen ?? internalOpen;

function onOpenChange(next: boolean) {
  if (next) {
    // …the existing resets, untouched…
  }
  setInternalOpen(next);
  onOpenChangeProp?.(next);
}
```

and wrap the trigger so `trigger === "none"` renders none:

```tsx
{trigger === "none" ? null : (
  <DialogTrigger asChild>{/* …the existing trigger… */}</DialogTrigger>
)}
```

- [ ] **Step 2: Extract the delete flow into a hook**

`components/lots/use-delete-lot.ts` holds what `DeleteLotButton` does today — the `window.confirm` text, `removeLot`, the refusal message — and `DeleteLotButton` becomes its button. Copy is unchanged:

```ts
export function useDeleteLot(lot: Lot, onDeleted?: () => void) {
  const removeLot = useHerdStore((state) => state.removeLot);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Excluir o lote ${lot.name}? Ele sai das listas e libera a invernada. O histórico já registrado continua guardado.`
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      if (await removeLot(lot.id)) onDeleted?.();
      else setError("Este lote ainda tem animais ou um manejo em aberto e não pode ser excluído.");
    } finally {
      setRemoving(false);
    }
  }

  return { remove, removing, error };
}
```

- [ ] **Step 3: Check the ficha still compiles and behaves**

`app/(app)/lots/[id]/page.tsx` renders `EditLotDialog trigger="button"`, `MoveLotDialog`, `ArchiveLotDialog` and `DeleteLotButton` with no new props — every added prop is optional, so it must keep working untouched.

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

---

### Task 5: `LotCard` and `LotCardMenu`

**Files:**
- Create: `components/lots/lot-card.tsx`, `components/lots/lot-card-menu.tsx`

**Interfaces:**
- Consumes: `LotCardRow` (Task 1), `DropdownMenu*` (Task 2), the dialogs' controlled mode and `useDeleteLot` (Task 4).
- Produces: `LotCard({ row, invernada })` and `LotCardMenu({ row, invernada })` — used by `lots-paddocks.tsx`.

- [ ] **Step 1: Write `LotCardMenu`**

A `•••` trigger plus the four items; the item sets which dialog is open and the dialogs render with `trigger="none"`. The trigger stops the click from reaching the card link:

```tsx
type OpenDialog = "edit" | "move" | "archive" | null;

export function LotCardMenu({ row, invernada }: { row: LotCardRow; invernada: Invernada | null }) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { remove, removing } = useDeleteLot(row.lot);
  const { addToast } = useToast();

  return (
    <div onClick={(event) => event.preventDefault()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Ações do lote ${row.lot.name}`}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
          {row.placement ? (
            <DropdownMenuItem onSelect={() => setDialog("move")}>
              <ArrowRightLeft aria-hidden />
              Mover de invernada
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={`/lots/${row.lot.id}`}>
                <History aria-hidden />
                Ver histórico
              </Link>
            </DropdownMenuItem>
          )}
          {row.placement && row.heads === 0 ? (
            <DropdownMenuItem onSelect={() => setDialog("archive")}>
              <Archive aria-hidden />
              Arquivar
            </DropdownMenuItem>
          ) : null}
          {row.canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              disabled={removing}
              onSelect={() => {
                void remove();
              }}
            >
              <Trash2 aria-hidden />
              Excluir
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      …the three dialogs, trigger="none", open={dialog === "…"} onOpenChange={…}…
    </div>
  );
}
```

The delete failure has no inline row inside a menu, so surface it with the app's toast: `useToast().addToast({ messageType: "error", text: error })` in an effect on the hook's `error`.

- [ ] **Step 2: Write `LotCard`**

The whole card is the link; the menu sits inside it and swallows its own clicks:

```tsx
<article className="relative">
  <Link
    href={`/lots/${row.lot.id}`}
    className="block min-h-11 rounded-lg border border-hairline bg-panel p-3.5 transition-colors hover:border-brand/45 hover:shadow-sm"
  >
    …name + ChevronRight, head count, the dl, the health row…
  </Link>
  <div className="absolute top-2.5 right-2.5">
    <LotCardMenu row={row} invernada={invernada} />
  </div>
</article>
```

Health row: one `StatusDot` + count + label per state, `healthy` always rendered, the other two only when non-zero. GMD: `formatNumber(row.adg, 3)` + " kg/dia" with `TrendingUp`, or `—` when `row.adg === null`.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

---

### Task 6: Rewrite the page body

**Files:**
- Modify: `components/lots/lots-paddocks.tsx`

**Interfaces:**
- Consumes: `lotsByInvernada`, `LotCard`, `StockingBar`, `STOCKING_LABEL`, `KpiCard`, `SectionCard`, `StatusDot`, `EmptyState`, `Badge`.

- [ ] **Step 1: Rewrite the component**

Reads the snapshot slices it needs from the store, calls the selector with `todayISO()`, and renders, in order: the four `KpiCard`s (`grid-cols-2 lg:grid-cols-4`), one section per `sections` entry, the "Invernadas livres" `SectionCard` (only when `free.length > 0`), and the "Lotes encerrados" `SectionCard` (only when `closed.length > 0`). With no lot at all, the existing `EmptyState` stands in place of the three lists.

Section header, matching the canvas:

```tsx
<header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="flex min-w-0 items-center gap-2.5">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft">
      <Fence className="size-4 text-brand" aria-hidden />
    </span>
    <div className="min-w-0">
      <h2 className="font-heading text-base font-semibold text-ink">
        Invernada {section.invernada.code}
        {section.invernada.name ? ` · ${section.invernada.name}` : ""}
      </h2>
      <p className="truncate text-xs text-ink-soft">
        {section.invernada.grass} · {formatNumber(section.invernada.hectares, 1)} ha
      </p>
    </div>
  </div>
  <div className="flex shrink-0 items-center gap-5">
    <div className="text-right">
      <p className="font-mono text-sm text-ink">{section.headCount} cabeças</p>
      <p className="font-mono text-xs text-ink-soft">{formatNumber(section.totalAu, 1)} UA</p>
    </div>
    <StockingBar auPerHa={section.auPerHa} classification={section.classification} />
  </div>
</header>
```

Free chip: `code` in mono, the name, `formatNumber(hectares, 1)} ha · {grass}`, and `livre há {freeForDays} d` or `nunca ocupada`. The header action is the free hectares: `` `${formatNumber(sum, 1)} ha sem lote` ``.

Closed card: muted `bg-surface` article, the name + `ChevronRight` in `text-ink-soft`, a `Badge variant="secondary"` reading `Encerrado`, `Encerrado em {formatDate(closedOn)}` and `Última invernada: {code} · {name}` (omit the line when `lastInvernada` is null). The whole card links to the ficha; it keeps the `•••` menu (Editar, Ver histórico, Excluir when deletable).

- [ ] **Step 2: Typecheck, lint and the whole suite**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all pass.

---

### Task 7: See it in the running app

**Files:** none.

- [ ] **Step 1: Start the dev server and sign in as a throwaway teste.* user**

Follow `docs`-free house practice recorded for smoke tests: seed a farm with at least two occupied invernadas, one free invernada and one closed lot, then open `/lots`.

- [ ] **Step 2: Check both widths**

Desktop (1440) and phone (390): sections stack to one column, the `•••` menu opens without navigating, every menu action opens its dialog, and clicking anywhere else on a card lands on `/lots/[id]`.

- [ ] **Step 3: Report what the screenshots show**

No commit here — the orchestrator commits once, at the end, with the spec and this plan included.

---

## Self-review

- **Spec coverage:** totals strip (Task 6), sections + stocking bar (Tasks 1, 3, 6), lot card + menu (Tasks 2, 4, 5), free strip and closed section (Tasks 1, 6), selector and its tests (Task 1), copy (Tasks 5, 6), verification (Task 7).
- **Types:** `LotCardRow`, `InvernadaSection`, `FreeInvernada`, `ClosedLotRow`, `LotsByInvernada` and `lotsByInvernada` are spelled the same in Tasks 1, 5 and 6; `StockingBar` and `STOCKING_LABEL` in Tasks 3 and 6; `useDeleteLot` in Tasks 4 and 5.
- **Open risk:** the `•••` trigger sits inside the card's `<Link>`; the click handler on its wrapper (`event.preventDefault()`) is what keeps the menu from navigating. Task 7 checks it in the real app.
