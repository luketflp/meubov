# Ficha do lote (/lots/[id]) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a lote from `/lots` on its own page with a "Resumo do lote" card (herd and weight, per-head averages, invernada and stocking, health) and the list of its active animals.

**Architecture:** A pure selector `lotSummary` in `lib/store/selectors.ts` derives every number from the store snapshot (tested with vitest, node env). Three new client components in `components/lots/` render it (`LotSummaryCard`, `LotAnimalsCard`, `LotActions`), and a new client route `app/(app)/lots/[id]/page.tsx` wires them, mirroring the venda record at `app/(app)/manejo/venda/[id]/page.tsx`. Two tiny helpers (`formatMonths`, `herdAdgSamples`) and three behavior-preserving extractions (`SummaryRow`, `DeleteLotButton`, `EditLotDialog` trigger prop) support it.

**Tech Stack:** Next.js 16 app router (client components, `useParams`), React 19, Zustand store (`useHerdStore`), Tailwind 4 with the app's tokens, shadcn primitives in `components/ui`, lucide-react icons, vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-lote-detail-page-design.md`

## Global Constraints

- pt-BR copy. Ear tags, dates and figures in `font-mono`.
- 44px touch targets on mobile: `min-h-11`; desktop may drop to `md:min-h-0` / `md:min-h-9`.
- Tokens only (`text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `border-hairline`, `text-brand`, `text-overdue`...). Never loose hex.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md` before touching the route; this Next.js version differs from training data. The venda record (`app/(app)/manejo/venda/[id]/page.tsx`) is the reference for a client-side dynamic route.
- TDD for `formatMonths`, `herdAdgSamples`, `lotSummary`: failing test first. Component files have no test harness.
- **No commits from implementation agents.** The working tree is shared; the orchestrator commits once at the end. Tasks therefore end at "tests pass" / "lint and typecheck pass".
- Commands: tests `pnpm exec vitest run <file>`; whole suite `pnpm test`; lint `pnpm lint`; typecheck `pnpm exec tsc --noEmit`.
- Today's date in examples is 2026-09-10; tests always pass an explicit `todayIso`, never call `todayISO()`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/domain/dates.ts` | + `formatMonths(months)`; `formatAge` delegates to it |
| `lib/domain/adg.ts` | + `herdAdgSamples(animals, todayIso, days)`; `herdAverageAdg` becomes its mean |
| `lib/store/selectors.ts` | + `LotSummary`, `LotPlacementRow`, `LotNextActivity`, `LotStocking`, `lotSummary()` |
| `lib/domain/__tests__/dates.test.ts`, `adg.test.ts`, `lib/store/__tests__/selectors.test.ts` | tests |
| `components/ui/summary-row.tsx` | `SummaryRow` (extracted from `sale-summary.tsx`) |
| `components/layout/PageHeader.tsx` | + optional `badges` |
| `components/lots/edit-lot-dialog.tsx` | + `trigger?: "icon" \| "button"` |
| `components/lots/delete-lot-button.tsx` | `DeleteLotButton` (extracted from `lots-paddocks.tsx`) |
| `components/lots/lots-paddocks.tsx` | name → link, uses `DeleteLotButton` |
| `components/lots/lot-summary.tsx` | `LotSummaryCard` |
| `components/lots/lot-animals.tsx` | `LotAnimalsCard` |
| `components/lots/lot-actions.tsx` | `LotActions` |
| `app/(app)/lots/[id]/page.tsx` | the route |

---

### Task 1: `formatMonths` in `lib/domain/dates.ts`

**Files:**
- Modify: `lib/domain/dates.ts:86-98` (`formatAge`)
- Test: `lib/domain/__tests__/dates.test.ts`

**Interfaces:**
- Produces: `formatMonths(months: number): string` — `"8m"`, `"3a"`, `"2a 4m"`. Task 6 uses it for the average age.

- [ ] **Step 1: Write the failing test**

Add `formatMonths` to the import list at the top of `lib/domain/__tests__/dates.test.ts`, then append:

```ts
describe("formatMonths", () => {
  it("formats a number of months like formatAge does", () => {
    expect(formatMonths(0)).toBe("0m");
    expect(formatMonths(8)).toBe("8m");
    expect(formatMonths(36)).toBe("3a");
    expect(formatMonths(28)).toBe("2a 4m");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/dates.test.ts`
Expected: FAIL — `formatMonths` is not exported.

- [ ] **Step 3: Write the implementation**

In `lib/domain/dates.ts`, replace the body of `formatAge` and add `formatMonths` right above it:

```ts
/** Formats a count of months as "2a 4m", "8m" or "3a". */
export function formatMonths(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}m`;
  if (rest === 0) return `${years}a`;
  return `${years}a ${rest}m`;
}

/**
 * Formats the animal age as "2a 4m", "8m" or "3a" from the birth date
 * (against refIso, default today).
 */
export function formatAge(birthIso: string, refIso: string = todayISO()): string {
  return formatMonths(ageInMonths(birthIso, refIso));
}
```

- [ ] **Step 4: Run the dates tests**

Run: `pnpm exec vitest run lib/domain/__tests__/dates.test.ts`
Expected: PASS, including the existing `formatAge` tests.

---

### Task 2: `herdAdgSamples` in `lib/domain/adg.ts`

**Files:**
- Modify: `lib/domain/adg.ts:87-105` (`herdAverageAdg`)
- Test: `lib/domain/__tests__/adg.test.ts`

**Interfaces:**
- Produces: `herdAdgSamples(animals: Animal[], todayIso: string, days = ADG_WINDOW_DAYS): number[]` — one ADG per ACTIVE animal with 2+ weighings inside the window, in the animals' order. `herdAverageAdg` keeps its signature and result. Task 3 uses both.

- [ ] **Step 1: Write the failing test**

Change the import in `lib/domain/__tests__/adg.test.ts` to
`import { calculateAdg, herdAdgSamples, herdAverageAdg, monthlyAdg } from "@/lib/domain/adg";`
and append:

```ts
describe("herdAdgSamples / herdAverageAdg", () => {
  const today = "2026-09-10";
  const animals = [
    makeAnimal({
      id: "a1",
      weighings: [
        { date: "2026-05-15", weightKg: 300 },
        { date: "2026-08-28", weightKg: 360 },
      ],
    }),
    makeAnimal({
      id: "a2",
      weighings: [
        { date: "2026-06-01", weightKg: 200 },
        { date: "2026-07-01", weightKg: 230 },
      ],
    }),
    makeAnimal({ id: "a3", weighings: [{ date: "2026-08-01", weightKg: 250 }] }),
    makeAnimal({
      id: "a4",
      active: false,
      weighings: [
        { date: "2026-06-01", weightKg: 200 },
        { date: "2026-07-01", weightKg: 300 },
      ],
    }),
    makeAnimal({
      id: "a5",
      weighings: [
        { date: "2026-01-01", weightKg: 200 },
        { date: "2026-08-01", weightKg: 300 },
      ],
    }),
  ];

  it("lists one ADG per active animal with two weighings inside the window", () => {
    const samples = herdAdgSamples(animals, today);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toBeCloseTo(60 / 105, 6);
    expect(samples[1]).toBe(1);
  });

  it("is what herdAverageAdg averages", () => {
    expect(herdAverageAdg(animals, today)).toBeCloseTo((60 / 105 + 1) / 2, 6);
    expect(herdAverageAdg([animals[2]], today)).toBeNull();
    expect(herdAdgSamples([animals[2]], today)).toEqual([]);
  });
});
```

(`a5` has only one weighing inside the 120-day window, so it contributes nothing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/adg.test.ts`
Expected: FAIL — `herdAdgSamples` is not exported.

- [ ] **Step 3: Write the implementation**

Replace `herdAverageAdg` in `lib/domain/adg.ts` with:

```ts
/**
 * ADG (kg/day) of every ACTIVE animal with 2+ weighings within the window of
 * `days` (120 by default) up to todayIso, in the animals' order. Animals
 * without a computable ADG are left out, so the length is the sample size.
 */
export function herdAdgSamples(
  animals: Animal[],
  todayIso: string,
  days: number = ADG_WINDOW_DAYS
): number[] {
  const adgs: number[] = [];
  for (const animal of animals) {
    if (!animal.active) continue;
    const inWindow = animal.weighings.filter(
      (w) => w.date <= todayIso && daysBetween(w.date, todayIso) <= days
    );
    const adg = calculateAdg(inWindow);
    if (adg !== null) adgs.push(adg);
  }
  return adgs;
}

/**
 * Herd average ADG (kg/day) in the lookback window ending today: the mean of
 * herdAdgSamples, or null if no animal has a computable ADG.
 */
export function herdAverageAdg(
  animals: Animal[],
  todayIso: string,
  days: number = ADG_WINDOW_DAYS
): number | null {
  const adgs = herdAdgSamples(animals, todayIso, days);
  if (adgs.length === 0) return null;
  return adgs.reduce((sum, g) => sum + g, 0) / adgs.length;
}
```

- [ ] **Step 4: Run the ADG tests and the dashboard consumers' tests**

Run: `pnpm exec vitest run lib/domain/__tests__/adg.test.ts`
Expected: PASS.

---

### Task 3: `lotSummary` selector

**Files:**
- Modify: `lib/store/selectors.ts` (imports at top; new types after `InvernadaWithSummary`; new function after `invernadasWithSummary`)
- Test: `lib/store/__tests__/selectors.test.ts`

**Interfaces:**
- Consumes: `formatMonths` is NOT used here (Task 6 formats); `herdAdgSamples`, `herdAverageAdg` from Task 2; existing `activeAnimals`, `countByCategory`, `withStatus`, `currentPlacementForLot`, `invernadasWithSummary`, `currentWeight`, `totalWeightKg`, `kgToArroba`, `totalAu`, `deriveTreatmentStatus`, `ageInMonths`, `daysBetween`.
- Produces (verbatim, Tasks 6–8 depend on every name):

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

- [ ] **Step 1: Write the failing tests**

In `lib/store/__tests__/selectors.test.ts`, add `Treatment` to the `@/lib/types` import, `makeTreatment` to the fixtures import (`import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";`), `lotSummary` to the selectors import, and append at the end of the file:

```ts
describe("lotSummary", () => {
  const today = "2026-09-10";
  const summaryInvernadas: Invernada[] = [
    { id: "inv-a", code: "03", name: "Fundo", grass: "Braquiária", hectares: 30 },
    { id: "inv-b", code: "01", name: "Baixada", grass: "Mombaça", hectares: 10 },
  ];
  const summaryLots: Lot[] = [
    { id: "lot-a", name: "Recria 2025" },
    { id: "lot-b", name: "Matrizes" },
    { id: "lot-gone", name: "Antigo", deletedAt: "2026-08-01T00:00:00.000Z" },
    { id: "lot-closed", name: "Engorda 2024" },
  ];
  const summaryPlacements: LotPlacement[] = [
    {
      id: "p-a-old",
      lotId: "lot-a",
      invernadaId: "inv-b",
      startedOn: "2026-02-02",
      endedOn: "2026-06-12",
    },
    { id: "p-a-now", lotId: "lot-a", invernadaId: "inv-a", startedOn: "2026-06-12" },
    { id: "p-b-now", lotId: "lot-b", invernadaId: "inv-a", startedOn: "2026-01-01" },
    {
      id: "p-closed",
      lotId: "lot-closed",
      invernadaId: "inv-b",
      startedOn: "2025-09-01",
      endedOn: "2026-07-22",
    },
  ];
  const summaryAnimals = [
    makeAnimal({
      id: "a1",
      earTag: "0417",
      lotId: "lot-a",
      category: "heifer",
      sex: "female",
      birthDate: "2024-11-12",
      weighings: [
        { date: "2026-05-15", weightKg: 300 },
        { date: "2026-08-28", weightKg: 360 },
      ],
    }),
    makeAnimal({
      id: "a2",
      earTag: "0418",
      lotId: "lot-a",
      category: "heifer",
      sex: "female",
      birthDate: "2025-02-20",
      weighings: [{ date: "2026-08-28", weightKg: 300 }],
    }),
    makeAnimal({
      id: "a3",
      earTag: "0433",
      lotId: "lot-a",
      category: "calf",
      birthDate: "2026-02-14",
      weighings: [],
    }),
    makeAnimal({
      id: "a4",
      earTag: "0999",
      lotId: "lot-a",
      active: false,
      weighings: [{ date: "2026-08-28", weightKg: 500 }],
    }),
    makeAnimal({
      id: "b1",
      earTag: "0100",
      lotId: "lot-b",
      category: "cow",
      sex: "female",
      birthDate: "2020-01-01",
      weighings: [{ date: "2026-08-01", weightKg: 450 }],
    }),
  ];
  const summaryTreatments: Treatment[] = [
    makeTreatment({ id: "t1", animalEarTag: "0417", type: "deworming", name: "Vermífugo", date: "2026-09-15" }),
    makeTreatment({ id: "t2", animalEarTag: "0418", type: "deworming", name: "Vermífugo", date: "2026-09-15" }),
    makeTreatment({ id: "t3", animalEarTag: "0433", type: "vaccine", name: "Aftosa", date: "2026-09-30" }),
    makeTreatment({ id: "t4", animalEarTag: "0417", type: "vaccine", name: "Clostridiose", date: "2026-09-01" }),
    makeTreatment({ id: "t5", animalEarTag: "0100", type: "deworming", name: "Vermífugo", date: "2026-09-12" }),
    makeTreatment({ id: "t6", animalEarTag: "0418", type: "exam", name: "Brucelose", date: "2026-09-11", status: "done" }),
  ];
  const state = {
    lots: summaryLots,
    animals: summaryAnimals,
    treatments: [] as Treatment[],
    invernadas: summaryInvernadas,
    lotPlacements: summaryPlacements,
  };

  it("is null for an unknown or a deleted lot", () => {
    expect(lotSummary("nope", state, today)).toBeNull();
    expect(lotSummary("lot-gone", state, today)).toBeNull();
  });

  it("counts only the active animals of the lot, by category, with weight and AU", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.lot.name).toBe("Recria 2025");
    expect(summary.animals.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(summary.heads).toBe(3);
    expect(summary.byCategory).toEqual({ calf: 1, heifer: 2, steer: 0, cow: 0, bull: 0 });
    expect(summary.weighedHeads).toBe(2);
    expect(summary.totalWeightKg).toBe(660);
    expect(summary.totalArrobas).toBe(22);
    expect(summary.totalAu).toBeCloseTo(660 / 450, 6);
    expect(summary.lastWeighingDate).toBe("2026-08-28");
  });

  it("averages weight over the weighed heads and age over every head", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.avgWeightKg).toBe(330);
    expect(summary.avgLiveArrobas).toBe(11);
    // 21 + 18 + 6 complete months, floored mean.
    expect(summary.avgAgeMonths).toBe(15);
  });

  it("has null averages without weighings and null age without animals", () => {
    const summary = lotSummary("lot-closed", state, today)!;
    expect(summary.heads).toBe(0);
    expect(summary.avgWeightKg).toBeNull();
    expect(summary.avgLiveArrobas).toBeNull();
    expect(summary.avgAgeMonths).toBeNull();
    expect(summary.lastWeighingDate).toBeNull();
  });

  it("reports the 120-day ADG and how many animals it covers", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.adg).toBeCloseTo(60 / 105, 6);
    expect(summary.adgHeads).toBe(1);
  });

  it("resolves the current invernada, the days there and the whole-invernada stocking", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.currentPlacement?.id).toBe("p-a-now");
    expect(summary.currentInvernada?.code).toBe("03");
    expect(summary.daysInInvernada).toBe(90);
    // Lote a (660 kg) and lote b (450 kg) share the 30 ha.
    expect(summary.stocking?.auPerHa).toBeCloseTo(1110 / 450 / 30, 6);
    expect(summary.stocking?.classification).toBe("light");
    expect(summary.stocking?.otherLots.map((lot) => lot.id)).toEqual(["lot-b"]);
  });

  it("lists every placement newest first with the days spent", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.placements.map((row) => row.placement.id)).toEqual(["p-a-now", "p-a-old"]);
    expect(summary.placements[0].days).toBe(90);
    expect(summary.placements[0].invernada?.code).toBe("03");
    expect(summary.placements[1].days).toBe(130);
    expect(summary.placements[1].invernada?.code).toBe("01");
  });

  it("has no invernada, no stocking and no days for a closed lot", () => {
    const summary = lotSummary("lot-closed", state, today)!;
    expect(summary.currentPlacement).toBeNull();
    expect(summary.currentInvernada).toBeNull();
    expect(summary.daysInInvernada).toBeNull();
    expect(summary.stocking).toBeNull();
    expect(summary.placements.map((row) => row.placement.id)).toEqual(["p-closed"]);
  });

  it("counts every head as healthy without treatments and has no next activity", () => {
    const summary = lotSummary("lot-a", state, today)!;
    expect(summary.health).toEqual({ healthy: 3, attention: 0, overdue: 0 });
    expect(summary.nextActivity).toBeNull();
  });

  it("counts health by derived status and picks the earliest scheduled activity of the lot", () => {
    const summary = lotSummary("lot-a", { ...state, treatments: summaryTreatments }, today)!;
    // 0417 has an overdue vaccine; 0418 and 0433 have a treatment within 30 days.
    expect(summary.health).toEqual({ healthy: 0, attention: 2, overdue: 1 });
    // The overdue one and the other lot's 12/09 deworming are ignored; two heads share 15/09.
    expect(summary.nextActivity).toEqual({
      date: "2026-09-15",
      type: "deworming",
      name: "Vermífugo",
      heads: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: FAIL — `lotSummary` is not exported (the other describes still pass).

- [ ] **Step 3: Write the implementation**

In `lib/store/selectors.ts`:

1. Extend the type import to include `HerdData` and `TreatmentType`:

```ts
import type {
  Animal,
  Breeding,
  Category,
  HerdData,
  Invernada,
  StockingRateClass,
  Lot,
  LotPlacement,
  AnimalStatus,
  ManejoSession,
  Treatment,
  TreatmentType,
} from "@/lib/types";
```

2. Extend the helper imports:

```ts
import {
  deriveAnimalStatus,
  deriveTreatmentStatus,
  attentionReason,
} from "@/lib/domain/status";
import { calculateAdg, herdAdgSamples } from "@/lib/domain/adg";
import { ageInMonths, daysBetween } from "@/lib/domain/dates";
```

(`deriveTreatmentStatus` is already imported; keep the existing `kgToArroba, currentWeight, totalWeightKg` and `classifyStockingRate, stockingRateAuPerHa, totalAu` imports.)

3. After the `InvernadaWithSummary` interface, add the four types from the Interfaces block above, verbatim.

4. After `invernadasWithSummary`, add:

```ts
/**
 * Everything the ficha of a lote shows, derived from the snapshot: only the
 * ACTIVE animals count, the stocking is the whole invernada's (every lot on
 * it), and the health calendar is read the way the ficha of an animal reads
 * it. Null for a lot that does not exist or was deleted — the page shows
 * "não encontrado" instead of a ghost group.
 */
export function lotSummary(
  lotId: string,
  state: Pick<HerdData, "lots" | "animals" | "treatments" | "invernadas" | "lotPlacements">,
  todayIso: string
): LotSummary | null {
  const lot = state.lots.find((item) => item.id === lotId);
  if (!lot || lot.deletedAt != null) return null;

  const animals = activeAnimals(state.animals).filter((animal) => animal.lotId === lotId);
  const heads = animals.length;
  const weighedHeads = animals.filter((animal) => currentWeight(animal) !== null).length;
  const totalKg = totalWeightKg(animals);
  let lastWeighingDate: string | null = null;
  for (const animal of animals) {
    for (const weighing of animal.weighings) {
      if (lastWeighingDate === null || compareDate(lastWeighingDate, weighing.date) < 0) {
        lastWeighingDate = weighing.date;
      }
    }
  }
  const avgWeightKg = weighedHeads > 0 ? totalKg / weighedHeads : null;
  const avgAgeMonths =
    heads === 0
      ? null
      : Math.floor(
          animals.reduce((sum, animal) => sum + ageInMonths(animal.birthDate, todayIso), 0) /
            heads
        );
  const adgSamples = herdAdgSamples(animals, todayIso);
  const adg =
    adgSamples.length === 0
      ? null
      : adgSamples.reduce((sum, value) => sum + value, 0) / adgSamples.length;

  const invernadaById = new Map(state.invernadas.map((invernada) => [invernada.id, invernada]));
  const currentPlacement = currentPlacementForLot(lotId, state.lotPlacements);
  const currentInvernada = currentPlacement
    ? (invernadaById.get(currentPlacement.invernadaId) ?? null)
    : null;

  let stocking: LotStocking | null = null;
  if (currentInvernada) {
    const occupancy = invernadasWithSummary(
      state.invernadas,
      state.lots,
      state.lotPlacements,
      state.animals
    ).find((item) => item.invernada.id === currentInvernada.id);
    if (occupancy) {
      stocking = {
        auPerHa: occupancy.auPerHa,
        classification: occupancy.classification,
        otherLots: occupancy.lots.filter((item) => item.id !== lotId),
      };
    }
  }

  const placements: LotPlacementRow[] = state.lotPlacements
    .filter((placement) => placement.lotId === lotId)
    .sort(
      (a, b) => compareDate(b.startedOn, a.startedOn) || a.id.localeCompare(b.id)
    )
    .map((placement) => ({
      placement,
      invernada: invernadaById.get(placement.invernadaId) ?? null,
      days: daysBetween(placement.startedOn, placement.endedOn ?? todayIso),
    }));

  const health = { healthy: 0, attention: 0, overdue: 0 };
  for (const item of withStatus(animals, state.treatments, todayIso)) {
    health[item.status] += 1;
  }

  const earTags = new Set(animals.map((animal) => animal.earTag));
  const scheduled = state.treatments
    .filter(
      (treatment) =>
        earTags.has(treatment.animalEarTag) &&
        deriveTreatmentStatus(treatment, todayIso) === "scheduled"
    )
    .sort(
      (a, b) =>
        compareDate(a.date, b.date) ||
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name)
    );
  const first = scheduled[0];
  const nextActivity: LotNextActivity | null = first
    ? {
        date: first.date,
        type: first.type,
        name: first.name,
        heads: scheduled.filter(
          (treatment) =>
            treatment.date === first.date &&
            treatment.type === first.type &&
            treatment.name === first.name
        ).length,
      }
    : null;

  return {
    lot,
    animals,
    heads,
    byCategory: countByCategory(animals),
    weighedHeads,
    totalWeightKg: totalKg,
    totalArrobas: kgToArroba(totalKg),
    totalAu: totalAu(animals),
    lastWeighingDate,
    avgWeightKg,
    avgLiveArrobas: avgWeightKg === null ? null : kgToArroba(avgWeightKg),
    avgAgeMonths,
    adg,
    adgHeads: adgSamples.length,
    currentPlacement,
    currentInvernada,
    daysInInvernada: currentPlacement ? daysBetween(currentPlacement.startedOn, todayIso) : null,
    stocking,
    placements,
    health,
    nextActivity,
  };
}
```

`compareDate` is the module-private helper already defined near the top of the file.

- [ ] **Step 4: Run the selector tests**

Run: `pnpm exec vitest run lib/store/__tests__/selectors.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

---

### Task 4: `SummaryRow` extraction and `PageHeader.badges`

**Files:**
- Create: `components/ui/summary-row.tsx`
- Modify: `components/manejo/sale-summary.tsx:25-32` (local `Row`) and its usages
- Modify: `components/layout/PageHeader.tsx`

**Interfaces:**
- Produces: `SummaryRow({ label: string; value: ReactNode; suffix?: string })` and `PageHeader({ title, subtitle?, badges?, actions? })`. Tasks 6 and 8 use them.

- [ ] **Step 1: Create `components/ui/summary-row.tsx`**

```tsx
import type { ReactNode } from "react";

interface SummaryRowProps {
  label: string;
  value: ReactNode;
  /** Small soft note after the value, e.g. "· 90 dias". */
  suffix?: string;
}

/** One label/value line of a summary card: the venda's romaneio, the lote's resumo. */
export function SummaryRow({ label, value, suffix }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-mono text-sm text-ink">
        {value}
        {suffix ? <span className="ml-1 font-sans text-xs text-ink-soft">{suffix}</span> : null}
      </dd>
    </div>
  );
}
```

- [ ] **Step 2: Use it in `components/manejo/sale-summary.tsx`**

Delete the local `Row` function (lines 25–32), add `import { SummaryRow } from "@/components/ui/summary-row";`, and replace every `<Row label=... value=... />` with `<SummaryRow label=... value=... />` (eleven occurrences, props unchanged). Output is identical.

- [ ] **Step 3: Add `badges` to `components/layout/PageHeader.tsx`**

Replace the file with:

```tsx
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Pills shown next to the title (e.g. "Encerrado"). */
  badges?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, badges, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {badges ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
            <div className="flex items-center gap-1">{badges}</div>
          </div>
        ) : (
          <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
        )}
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
```

- [ ] **Step 4: Lint and typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 5: `DeleteLotButton`, `EditLotDialog` trigger prop, name link on the `/lots` card

**Files:**
- Create: `components/lots/delete-lot-button.tsx`
- Modify: `components/lots/edit-lot-dialog.tsx:25` (props) and `:75-85` (trigger)
- Modify: `components/lots/lots-paddocks.tsx` (`LotCard`)

**Interfaces:**
- Produces: `DeleteLotButton({ lot: Lot; onDeleted?: () => void })`, `EditLotDialog({ lot: Lot; trigger?: "icon" | "button" })`. Task 8 uses both.

- [ ] **Step 1: Create `components/lots/delete-lot-button.tsx`**

```tsx
"use client";

/**
 * "Excluir lote": the confirm, the API call and the refusal message, shared
 * by the /lots card and the ficha of the lote. The failure line wraps to its
 * own row inside a flex-wrap actions row (basis-full).
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Lot } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";

interface DeleteLotButtonProps {
  lot: Lot;
  /** Called after the server accepted the deletion. */
  onDeleted?: () => void;
}

export function DeleteLotButton({ lot, onDeleted }: DeleteLotButtonProps) {
  const removeLot = useHerdStore((state) => state.removeLot);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove() {
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
      if (await removeLot(lot.id)) {
        onDeleted?.();
      } else {
        setError("Este lote ainda tem animais ou um manejo em aberto e não pode ser excluído.");
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={removing}
        onClick={onRemove}
        className="min-h-9 text-ink-soft hover:text-overdue"
      >
        <Trash2 aria-hidden />
        {removing ? "Excluindo…" : "Excluir lote"}
      </Button>
      {error ? <p className="basis-full text-right text-xs text-overdue">{error}</p> : null}
    </>
  );
}
```

- [ ] **Step 2: Add the `trigger` prop to `components/lots/edit-lot-dialog.tsx`**

Change the signature to:

```tsx
interface EditLotDialogProps {
  lot: Lot;
  /** "icon" (the card's pencil) or "button" (outline "Editar" on the ficha). */
  trigger?: "icon" | "button";
}

export function EditLotDialog({ lot, trigger = "icon" }: EditLotDialogProps) {
```

and replace the `<DialogTrigger asChild>…</DialogTrigger>` block with:

```tsx
      <DialogTrigger asChild>
        {trigger === "button" ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-9">
            <Pencil aria-hidden />
            Editar
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar lote ${lot.name}`}
            className="min-h-11 min-w-11 text-ink-soft hover:text-ink md:min-h-7 md:min-w-7"
          >
            <Pencil aria-hidden />
          </Button>
        )}
      </DialogTrigger>
```

- [ ] **Step 3: Update `LotCard` in `components/lots/lots-paddocks.tsx`**

- Imports: add `import Link from "next/link";`, change the lucide import to `import { ChevronRight, Fence } from "lucide-react";`, remove `useState` and `Button` imports if nothing else uses them, add `import { DeleteLotButton } from "@/components/lots/delete-lot-button";`.
- Remove `removeLot`, `removing`, `removeError`, `setRemoving`, `setRemoveError` and the `onRemove` function from `LotCard`. Keep `deletable`.
- Replace the `<h3 …>{lot.name}</h3>` with:

```tsx
          <Link
            href={`/lots/${lot.id}`}
            aria-label={`Abrir lote ${lot.name}`}
            className="inline-flex items-center gap-1 font-heading text-base font-semibold text-ink underline-offset-2 hover:underline"
          >
            {lot.name}
            <ChevronRight className="size-4 text-ink-soft" aria-hidden />
          </Link>
```

- In the actions row, replace the whole `{deletable ? (<Button …>…</Button>) : null}` block with `{deletable ? <DeleteLotButton lot={lot} /> : null}` and delete the trailing `{removeError ? <p …>…</p> : null}` line after the row.

- [ ] **Step 4: Lint and typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean (no unused imports left in `lots-paddocks.tsx`).

---

### Task 6: `LotSummaryCard`

**Files:**
- Create: `components/lots/lot-summary.tsx`

**Interfaces:**
- Consumes: `LotSummary` (Task 3), `SummaryRow` (Task 4), `formatMonths` (Task 1), `summaryByCategory` from `components/dashboard/helpers.ts`, `TREATMENT_TYPE_LABEL` from `lib/domain/labels.ts`, `StatusDot`, `StatusPill`, `SectionCard`.
- Produces: `LotSummaryCard({ summary: LotSummary })`. Task 8 uses it.

- [ ] **Step 1: Create `components/lots/lot-summary.tsx`**

```tsx
"use client";

/**
 * Resumo do lote: the numbers of a logical group as the farmer reads them at
 * the gate — herd and weight, per-head averages, where the lot stands and how
 * loaded the pasture is, and what the health calendar owes it. Mirrors the
 * venda's SaleSummaryCard: one SectionCard, dl columns, mono values.
 */
import type { ReactNode } from "react";
import type { Invernada } from "@/lib/types";
import type { LotSummary } from "@/lib/store/selectors";
import { formatDate, formatMonths } from "@/lib/domain/dates";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { summaryByCategory } from "@/components/dashboard/helpers";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { SummaryRow } from "@/components/ui/summary-row";

const NONE = "—";
/** Past placements listed inline; the Mover dialog shows the whole history. */
const PREVIOUS_SHOWN = 3;

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{children}</p>;
}

function invernadaLabel(invernada: Invernada | null): string {
  if (!invernada) return "Invernada não encontrada";
  return `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`;
}

function Count({ status, value }: { status: "healthy" | "attention" | "overdue"; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      {value}
    </span>
  );
}

export function LotSummaryCard({ summary }: { summary: LotSummary }) {
  const { heads, stocking, currentInvernada, currentPlacement, nextActivity } = summary;
  const intro =
    heads === 0
      ? "Nenhum animal ativo"
      : `${heads} ${heads === 1 ? "cabeça" : "cabeças"} · ${summaryByCategory(summary.byCategory)}`;
  // A closed lot has no current row: every placement is history, newest first.
  const previous = summary.placements.filter((row) => row.placement.endedOn != null);
  const newest = summary.placements[0];

  return (
    <SectionCard title="Resumo do lote">
      <p className="mb-3 text-sm text-ink-soft">{intro}</p>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <dl className="space-y-1.5">
          <Eyebrow>Rebanho</Eyebrow>
          <SummaryRow label="Cabeças" value={heads} />
          <SummaryRow label="Pesadas" value={`${summary.weighedHeads} de ${heads}`} />
          <SummaryRow label="Peso total" value={formatKg(summary.totalWeightKg)} />
          <SummaryRow label="@ totais" value={formatArroba(summary.totalArrobas)} />
          <SummaryRow label="UA totais" value={`${formatNumber(summary.totalAu, 1)} UA`} />
          <SummaryRow
            label="Última pesagem"
            value={summary.lastWeighingDate ? formatDate(summary.lastWeighingDate) : NONE}
          />
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Média por cabeça</Eyebrow>
          <SummaryRow
            label="Peso vivo"
            value={summary.avgWeightKg === null ? NONE : formatKg(summary.avgWeightKg)}
          />
          <SummaryRow
            label="@ viva (÷30)"
            value={summary.avgLiveArrobas === null ? NONE : formatArroba(summary.avgLiveArrobas)}
          />
          <SummaryRow
            label="Idade"
            value={summary.avgAgeMonths === null ? NONE : formatMonths(summary.avgAgeMonths)}
          />
          <SummaryRow
            label="GMD (120 dias)"
            value={summary.adg === null ? NONE : `${formatNumber(summary.adg, 2)} kg/dia`}
          />
          <SummaryRow label="Com GMD" value={`${summary.adgHeads} de ${heads}`} />
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Invernada</Eyebrow>
          <SummaryRow
            label="Atual"
            value={currentPlacement ? invernadaLabel(currentInvernada) : NONE}
          />
          {currentPlacement ? (
            <SummaryRow
              label="Desde"
              value={formatDate(currentPlacement.startedOn)}
              suffix={
                summary.daysInInvernada === null
                  ? undefined
                  : `· ${summary.daysInInvernada} ${summary.daysInInvernada === 1 ? "dia" : "dias"}`
              }
            />
          ) : (
            <SummaryRow
              label="Encerrado em"
              value={newest?.placement.endedOn ? formatDate(newest.placement.endedOn) : NONE}
            />
          )}
          {currentInvernada ? (
            <SummaryRow
              label="Área"
              value={`${formatNumber(currentInvernada.hectares)} ha`}
              suffix={currentInvernada.grass}
            />
          ) : null}
          {stocking ? (
            <SummaryRow
              label="Lotação"
              value={
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {`${formatNumber(stocking.auPerHa, 2)} UA/ha`}
                  <StatusPill status={stocking.classification} />
                </span>
              }
              suffix={
                stocking.otherLots.length === 0
                  ? undefined
                  : `· com ${stocking.otherLots.map((lot) => lot.name).join(", ")}`
              }
            />
          ) : null}
          {previous.length > 0 ? (
            <div className="mt-1.5 space-y-1.5 border-t border-hairline pt-2">
              <p className="text-xs text-ink-soft">Antes</p>
              {previous.slice(0, PREVIOUS_SHOWN).map((row) => (
                <div
                  key={row.placement.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="font-mono text-sm text-ink">{invernadaLabel(row.invernada)}</dt>
                  <dd className="text-xs text-ink-soft">
                    {formatDate(row.placement.startedOn)} a{" "}
                    {formatDate(row.placement.endedOn as string)}
                  </dd>
                </div>
              ))}
              {previous.length > PREVIOUS_SHOWN ? (
                <p className="text-xs text-ink-soft">
                  +{previous.length - PREVIOUS_SHOWN} anteriores no histórico
                </p>
              ) : null}
            </div>
          ) : null}
        </dl>

        <dl className="space-y-1.5">
          <Eyebrow>Sanidade</Eyebrow>
          <SummaryRow label="Saudáveis" value={<Count status="healthy" value={summary.health.healthy} />} />
          <SummaryRow label="Em atenção" value={<Count status="attention" value={summary.health.attention} />} />
          <SummaryRow label="Atrasados" value={<Count status="overdue" value={summary.health.overdue} />} />
          <SummaryRow
            label="Próximo manejo"
            value={nextActivity ? formatDate(nextActivity.date) : NONE}
            suffix={
              nextActivity
                ? `${TREATMENT_TYPE_LABEL[nextActivity.type]} · ${nextActivity.heads} ${
                    nextActivity.heads === 1 ? "animal" : "animais"
                  }`
                : undefined
            }
          />
        </dl>
      </div>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 7: `LotAnimalsCard`

**Files:**
- Create: `components/lots/lot-animals.tsx`

**Interfaces:**
- Consumes: `AnimalWithDerived` from `lib/store/selectors.ts`, `formatFullWeight` and `SEX_LABEL` from `components/herd/filters.ts`, `animalCategoryName` from `lib/domain/labels.ts`, `formatDate`/`formatAge` from `lib/domain/dates.ts`, `formatNumber`, `StatusPill`, `EmptyState`, `Input`, `SectionCard`, `Table*`.
- Produces: `LotAnimalsCard({ items: AnimalWithDerived[] })`. Task 8 uses it.

- [ ] **Step 1: Create `components/lots/lot-animals.tsx`**

```tsx
"use client";

/**
 * The active animals of a lote: one line per head with the weight on the
 * scale, the 120-day GMD and the derived status. Ear tags open the ficha.
 * Desktop is a table like the venda record; mobile stacks cards like Rebanho.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Fence, Search } from "lucide-react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
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

interface LotAnimalsCardProps {
  /** Active animals of the lot, already sorted by ear tag. */
  items: AnimalWithDerived[];
}

/** Rows whose ear tag contains the term (case-insensitive); everything when the term is blank. */
function visibleAnimals(items: AnimalWithDerived[], search: string): AnimalWithDerived[] {
  const term = search.trim().toLowerCase();
  if (term === "") return items;
  return items.filter((item) => item.animal.earTag.toLowerCase().includes(term));
}

function adgLabel(adg: number | null): string {
  return adg === null ? "—" : `${formatNumber(adg, 2)} kg/dia`;
}

export function LotAnimalsCard({ items }: LotAnimalsCardProps) {
  const customCategories = useHerdStore((s) => s.customCategories);
  const [search, setSearch] = useState("");
  const visible = useMemo(() => visibleAnimals(items, search), [items, search]);

  return (
    <SectionCard
      title={`Animais (${items.length})`}
      action={
        items.length > 0 ? (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brinco</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Raça</TableHead>
                  <TableHead>Sexo</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">GMD</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ animal, status, currentWeightKg, adg }) => (
                  <TableRow key={animal.id}>
                    <TableCell>
                      <Link
                        href={`/herd/${animal.id}`}
                        className="font-mono font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {animal.earTag}
                      </Link>
                    </TableCell>
                    <TableCell>{animalCategoryName(animal, customCategories)}</TableCell>
                    <TableCell>{animal.breed}</TableCell>
                    <TableCell>{SEX_LABEL[animal.sex]}</TableCell>
                    <TableCell>
                      {formatDate(animal.birthDate)}{" "}
                      <span className="text-ink-soft">{formatAge(animal.birthDate)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatFullWeight(currentWeightKg)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">{adgLabel(adg)}</TableCell>
                    <TableCell>
                      <StatusPill status={status} withDot />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards, the whole card opens the ficha */}
          <ul className="space-y-3 md:hidden">
            {visible.map(({ animal, status, currentWeightKg, adg }) => (
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
                    {animalCategoryName(animal, customCategories)} · {animal.breed} ·{" "}
                    {formatAge(animal.birthDate)}
                  </p>
                  <p className="font-mono text-sm text-ink">
                    {currentWeightKg === null ? "sem pesagem" : formatFullWeight(currentWeightKg)}
                    {adg !== null ? ` · GMD ${formatNumber(adg, 2)} kg/dia` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 2: Lint and typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

---

### Task 8: `LotActions` and the route `app/(app)/lots/[id]/page.tsx`

**Files:**
- Create: `components/lots/lot-actions.tsx`
- Create: `app/(app)/lots/[id]/page.tsx`

**Interfaces:**
- Consumes: `lotSummary`, `LotSummary`, `withStatus`, `canDeleteLot` (`lib/store/selectors.ts`); `sortHerd`, `DEFAULT_SORT` (`components/herd/filters.ts`); `LotSummaryCard` (Task 6); `LotAnimalsCard` (Task 7); `EditLotDialog` with `trigger="button"`, `DeleteLotButton` (Task 5); `ArchiveLotDialog`, `MoveLotDialog` (existing); `PageHeader` with `badges` (Task 4); `Badge`, `EmptyState`.

- [ ] **Step 1: Read the routing docs**

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md`. The page is a Client Component reading `useParams<{ id: string }>()`, exactly like `app/(app)/manejo/venda/[id]/page.tsx`.

- [ ] **Step 2: Create `components/lots/lot-actions.tsx`**

```tsx
"use client";

/**
 * The actions of a lote on its ficha: the same dialogs the /lots card offers
 * (editar, encerrar, excluir, mover), guarded the same way. Deleting sends
 * the farmer back to the list, since the page has nothing left to show.
 */
import { useRouter } from "next/navigation";
import type { LotSummary } from "@/lib/store/selectors";
import { canDeleteLot } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ArchiveLotDialog } from "@/components/lots/archive-lot-dialog";
import { DeleteLotButton } from "@/components/lots/delete-lot-button";
import { EditLotDialog } from "@/components/lots/edit-lot-dialog";
import { MoveLotDialog } from "@/components/lots/move-lot-dialog";

export function LotActions({ summary }: { summary: LotSummary }) {
  const router = useRouter();
  const animals = useHerdStore((state) => state.animals);
  const manejoSessions = useHerdStore((state) => state.manejoSessions);
  const { lot, heads, currentPlacement, currentInvernada } = summary;
  const deletable = canDeleteLot(lot.id, animals, manejoSessions);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EditLotDialog lot={lot} trigger="button" />
      {currentPlacement && heads === 0 ? (
        <ArchiveLotDialog lot={lot} currentPlacement={currentPlacement} />
      ) : null}
      {deletable ? <DeleteLotButton lot={lot} onDeleted={() => router.replace("/lots")} /> : null}
      <MoveLotDialog lot={lot} currentInvernada={currentInvernada} />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(app)/lots/[id]/page.tsx`**

```tsx
"use client";

/**
 * Ficha do lote (/lots/[id]): where the group stands, the resumo of its
 * numbers and the animals in it. Opened from the lot's name on /lots.
 */
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { todayISO } from "@/lib/domain/dates";
import { formatDate } from "@/lib/domain/dates";
import { lotSummary, withStatus } from "@/lib/store/selectors";
import { DEFAULT_SORT, sortHerd } from "@/components/herd/filters";
import { PageHeader } from "@/components/layout/PageHeader";
import { LotActions } from "@/components/lots/lot-actions";
import { LotAnimalsCard } from "@/components/lots/lot-animals";
import { LotSummaryCard } from "@/components/lots/lot-summary";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

function BackLink() {
  return (
    <Link
      href="/lots"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Lotes
    </Link>
  );
}

export default function LotRecordPage() {
  const params = useParams<{ id: string }>();

  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);

  const today = todayISO();
  const summary = useMemo(
    () => lotSummary(params.id, { lots, animals, treatments, invernadas, lotPlacements }, today),
    [params.id, lots, animals, treatments, invernadas, lotPlacements, today]
  );
  const rows = useMemo(
    () =>
      summary
        ? sortHerd(withStatus(summary.animals, treatments, today), DEFAULT_SORT, new Map())
        : [],
    [summary, treatments, today]
  );

  if (!summary) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <BackLink />
        <div className="rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Lote não encontrado"
            description="Este lote não existe ou foi excluído. Volte à lista e tente novamente."
          />
          <div className="flex justify-center">
            <Link
              href="/lots"
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-panel transition-colors hover:bg-brand/90"
            >
              Voltar aos lotes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { lot, currentPlacement, currentInvernada } = summary;
  const lastInvernada = summary.placements[0]?.invernada ?? null;
  const invernadaLabel = (code: string, name?: string) => `${code}${name ? ` · ${name}` : ""}`;
  const subtitle = currentPlacement
    ? currentInvernada
      ? `Invernada ${invernadaLabel(currentInvernada.code, currentInvernada.name)} · desde ${formatDate(currentPlacement.startedOn)}`
      : "Invernada não encontrada"
    : `Lote encerrado${
        lastInvernada
          ? ` · última invernada ${invernadaLabel(lastInvernada.code, lastInvernada.name)}`
          : ""
      }`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <LotActions summary={summary} />
      </div>

      <PageHeader
        title={lot.name}
        subtitle={subtitle}
        badges={
          lot.needsReview || !currentPlacement ? (
            <>
              {lot.needsReview ? <Badge variant="outline">Revisar cadastro</Badge> : null}
              {!currentPlacement ? <Badge variant="secondary">Encerrado</Badge> : null}
            </>
          ) : undefined
        }
      />

      <LotSummaryCard summary={summary} />

      <LotAnimalsCard items={rows} />
    </div>
  );
}
```

(Merge the two `@/lib/domain/dates` imports into one line: `import { formatDate, todayISO } from "@/lib/domain/dates";`.)

- [ ] **Step 4: Lint, typecheck, full test suite**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`
Expected: all clean and green.

- [ ] **Step 5: Smoke-check in the browser**

Run `pnpm dev`, open `/lots`, click a lot name: the ficha opens with the resumo and the animals; the ear tag opens the ficha of the animal; "Lotes" goes back. Open `/lots/nope`: the not-found block. Narrow the window under 768px: the animal cards replace the table, the search and the buttons are 44px tall. Stop the dev server afterwards.

---

## Self-review

- **Spec coverage:** route + not found (T8); `/lots` name link (T5); header with subtitle rules and badges (T4, T8); actions and their guards, `DeleteLotButton`, `EditLotDialog` trigger (T5, T8); `herdAdgSamples` (T2); `formatMonths` (T1); `lotSummary` with every field and rule, tests listed in the spec (T3); `SummaryRow` extraction (T4); `LotSummaryCard` groups, rows, suffixes, closed-lot rows, "Antes" list with the +N line (T6); `LotAnimalsCard` search, empty states, table columns, mobile cards (T7); data wiring with `sortHerd(…, DEFAULT_SORT, new Map())` (T8).
- **Placeholders:** none; every step carries its code.
- **Type consistency:** `LotSummary` field names in T6/T8 match T3 (`heads`, `weighedHeads`, `totalArrobas`, `totalAu`, `lastWeighingDate`, `avgWeightKg`, `avgLiveArrobas`, `avgAgeMonths`, `adg`, `adgHeads`, `currentPlacement`, `currentInvernada`, `daysInInvernada`, `stocking.{auPerHa,classification,otherLots}`, `placements[].{placement,invernada,days}`, `health`, `nextActivity.{date,type,name,heads}`); `SummaryRow` props `label/value/suffix` (T4 ↔ T6); `EditLotDialog trigger="button"` and `DeleteLotButton onDeleted` (T5 ↔ T8); `PageHeader badges` (T4 ↔ T8).
