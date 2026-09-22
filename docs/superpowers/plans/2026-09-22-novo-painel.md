# Novo Painel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` as the Rotina Painel: an agenda of pending work grouped by lote, then herd, reprodução, pastos, desempenho, mercado and financeiro cards.

**Architecture:** One new pure module, `lib/store/dashboard.ts`, derives the agenda, the herd's 12-month flow, the season's reproduction and the calvings ahead from store data. Presentational cards in `components/dashboard/` take those results as props, and the page wires store → selectors → cards with `useMemo`. No API or schema change.

**Tech Stack:** Next.js 16 (App Router, client page), React 19, Zustand store, Tailwind v4 tokens from `app/globals.css`, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-novo-painel-design.md`

## Global Constraints

- Colors only through the palette tokens (`bg-brand`, `text-ink-soft`, …); no loose hex.
- pt-BR copy; the product's words: lote, invernada, manejo, parto, diagnóstico, matriz, UA/ha, @.
- Money (Mercado, Financeiro) renders only with `useCan("finance", "view")`; "Concluir" only with `useCan("sanitary", "edit")`; "Iniciar manejo" only with `useCan("manejo", "edit")`.
- Touch targets at least 44px on the phone (`min-h-11 md:min-h-0` on small actions).
- Run tests with `pnpm exec vitest run`, types with `pnpm exec tsc --noEmit`, lint with `pnpm lint`.
- No commits until the user picks one at the end; the work lands as one `feat(dashboard): …` commit.

---

### Task 1: Painel selectors

**Files:**
- Create: `lib/store/dashboard.ts`
- Test: `lib/store/__tests__/dashboard.test.ts`

**Interfaces:**
- Consumes: `activeAnimals`, `currentPlacementForLot` (`lib/store/selectors.ts`); `currentDiagnosis`, `expectedCalvingDate`, `hasCalvedSince`, `isDiagnosed`, `isPregnantNow` (`lib/domain/reproduction.ts`); `awaitsDiagnosis` (`lib/domain/ultrasound.ts`); `deriveTreatmentStatus` (`lib/domain/status.ts`); `compareEarTags` (`lib/domain/earTags.ts`).
- Produces: `farmAgenda(input: AgendaInput, todayIso: string): AgendaLot[]`, `herdFlow(animals, movements, todayIso): HerdFlow`, `seasonReproduction(animals, todayIso): SeasonReproduction`, `calvingCalendar(animals, todayIso, before?, after?): CalvingMonth[]`, `nextCalvings(animals, todayIso, limit?): ExpectedCalving[]`, `adgChange(series: MonthlyAdgPoint[]): number | null`, and the types `AgendaItem`, `AgendaTreatment`, `AgendaDams`, `AgendaUrgency`, `AgendaLot`, `HerdFlow`, `SeasonReproduction`, `CalvingMonth`, `ExpectedCalving`.

- [ ] **Step 1: Write the failing tests**

#### `lib/store/__tests__/dashboard.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type {
  Animal,
  Invernada,
  Lot,
  LotPlacement,
  Movement,
  ReproductionRecord,
} from "@/lib/types";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { addDays } from "@/lib/domain/dates";
import { GESTATION_DAYS } from "@/lib/domain/reproduction";
import {
  adgChange,
  calvingCalendar,
  farmAgenda,
  herdFlow,
  nextCalvings,
  seasonReproduction,
  type AgendaInput,
} from "@/lib/store/dashboard";

const TODAY = "2026-09-22";

const lots: Lot[] = [
  { id: "lot-cria", name: "Matrizes com cria" },
  { id: "lot-garrotes", name: "Garrotes" },
  { id: "lot-novilhas", name: "Novilhas" },
];
const invernadas: Invernada[] = [
  { id: "inv-1", code: "01", name: "Baixada", grass: "Brachiaria", hectares: 105 },
];
const lotPlacements: LotPlacement[] = [
  { id: "p-1", lotId: "lot-cria", invernadaId: "inv-1", startedOn: "2026-01-10" },
];

const input = (partial: Partial<AgendaInput>): AgendaInput => ({
  animals: [],
  treatments: [],
  lots,
  invernadas,
  lotPlacements,
  ...partial,
});

/** The cobertura date whose calving is expected on `expected`. */
const bredFor = (expected: string): string => addDays(expected, -GESTATION_DAYS);

const bred = (date: string): ReproductionRecord => ({
  breedings: [{ id: `b-${date}`, date, type: "timedAI", bullEarTag: "T-1" }],
  diagnoses: [],
  calvings: [],
});

const pregnant = (date: string): ReproductionRecord => ({
  ...bred(date),
  diagnoses: [{ breedingId: `b-${date}`, result: "pregnant", date: addDays(date, 40) }],
});

const cow = (
  earTag: string,
  lotId: string,
  reproduction?: ReproductionRecord,
  overrides: Partial<Animal> = {}
): Animal =>
  makeAnimal({
    id: `cow-${earTag}`,
    earTag,
    category: "cow",
    sex: "female",
    lotId,
    reproduction,
    ...overrides,
  });

const steer = (earTag: string, lotId: string, overrides: Partial<Animal> = {}): Animal =>
  makeAnimal({ id: `steer-${earTag}`, earTag, lotId, ...overrides });

describe("farmAgenda", () => {
  it("groups a lote's pending treatments by date, type and name, up to 7 days ahead", () => {
    const animals = [steer("G1", "lot-garrotes"), steer("G2", "lot-garrotes")];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t2", animalEarTag: "G2", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t3", animalEarTag: "G1", name: "Raiva", date: "2026-09-29" }),
      makeTreatment({ id: "t4", animalEarTag: "G1", name: "Carrapaticida", date: "2026-09-30" }),
      makeTreatment({ id: "t5", animalEarTag: "G2", name: "Brucelose", date: "2026-09-10", status: "done" }),
    ];

    const [garrotes] = farmAgenda(input({ animals, treatments }), TODAY);

    expect(garrotes.items).toEqual([
      expect.objectContaining({
        kind: "treatment",
        name: "Clostridiose",
        urgency: 0,
        date: "2026-09-20",
        treatmentIds: ["t1", "t2"],
        earTags: ["G1", "G2"],
      }),
      expect.objectContaining({ kind: "treatment", name: "Raiva", urgency: 2, date: "2026-09-29" }),
    ]);
  });

  it("puts each animal's treatment in the lote it stands in today", () => {
    const animals = [steer("G1", "lot-garrotes"), steer("N1", "lot-novilhas")];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", name: "Raiva", date: TODAY }),
      makeTreatment({ id: "t2", animalEarTag: "N1", name: "Raiva", date: TODAY }),
    ];

    const agenda = farmAgenda(input({ animals, treatments }), TODAY);

    expect(agenda.map((group) => [group.name, group.items[0].urgency, group.items[0].earTags])).toEqual([
      ["Garrotes", 1, ["G1"]],
      ["Novilhas", 1, ["N1"]],
    ]);
  });

  it("leaves out the treatments of animals that left the herd or do not resolve", () => {
    const animals = [steer("G1", "lot-garrotes", { active: false, inactiveReason: "sale" })];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "G1", date: "2026-09-20" }),
      makeTreatment({ id: "t2", animalEarTag: "XX", date: "2026-09-20" }),
    ];

    expect(farmAgenda(input({ animals, treatments }), TODAY)).toEqual([]);
  });

  it("lists calvings due without a parto, calvings in the next days and diagnoses waiting 30 days", () => {
    const animals = [
      cow("4471", "lot-cria", pregnant(bredFor("2026-09-19"))),
      cow("3982", "lot-cria", pregnant(bredFor("2026-09-15"))),
      cow("2087", "lot-cria", pregnant(bredFor("2026-09-23"))),
      cow("9001", "lot-cria", pregnant(bredFor("2026-10-30"))),
      cow("5120", "lot-cria", bred("2026-08-10")),
      cow("5121", "lot-cria", bred("2026-09-10")),
      cow("5122", "lot-cria", {
        ...pregnant(bredFor("2026-09-01")),
        calvings: [{ date: "2026-09-02", calfEarTag: "B-1" }],
      }),
    ];

    const [cria] = farmAgenda(input({ animals }), TODAY);

    expect(cria.items).toEqual([
      {
        kind: "overdueCalvings",
        key: "lot-cria|overdueCalvings",
        urgency: 0,
        date: "2026-09-15",
        until: "2026-09-19",
        earTags: ["3982", "4471"],
      },
      {
        kind: "pendingDiagnosis",
        key: "lot-cria|pendingDiagnosis",
        urgency: 1,
        date: "2026-08-10",
        until: "2026-08-10",
        earTags: ["5120"],
      },
      {
        kind: "upcomingCalvings",
        key: "lot-cria|upcomingCalvings",
        urgency: 2,
        date: "2026-09-23",
        until: "2026-09-23",
        earTags: ["2087"],
      },
    ]);
  });

  it("orders the lotes by their most urgent item and describes each lote", () => {
    const animals = [
      cow("C1", "lot-cria"),
      cow("C2", "lot-cria"),
      steer("G1", "lot-garrotes"),
      steer("N1", "lot-novilhas"),
      steer("X1", "lot-gone"),
    ];
    const treatments = [
      makeTreatment({ id: "t1", animalEarTag: "N1", name: "Vermífugo", date: TODAY }),
      makeTreatment({ id: "t2", animalEarTag: "G1", name: "Clostridiose", date: "2026-09-20" }),
      makeTreatment({ id: "t3", animalEarTag: "C1", name: "Brucelose", date: "2026-09-16" }),
      makeTreatment({ id: "t4", animalEarTag: "X1", name: "Raiva", date: "2026-09-12" }),
    ];

    const agenda = farmAgenda(input({ animals, treatments }), TODAY);

    expect(agenda.map((group) => group.name)).toEqual([
      "Matrizes com cria",
      "Garrotes",
      "Novilhas",
      null,
    ]);
    expect(agenda[0]).toMatchObject({ lotId: "lot-cria", heads: 2, invernada: invernadas[0] });
    expect(agenda[1].invernada).toBeNull();
    expect(agenda[3]).toMatchObject({ lotId: null, name: null, heads: 1 });
  });
});

describe("herdFlow", () => {
  it("walks from the herd 12 months ago to today through births, purchases and exits", () => {
    const animals = [
      cow("C1", "lot-cria", {
        breedings: [],
        diagnoses: [],
        calvings: [
          { date: "2026-08-10", calfEarTag: "B1" },
          { date: "2025-09-20", calfEarTag: "B0" },
        ],
      }),
      makeAnimal({ id: "b1", earTag: "B1", category: "calf" }),
      makeAnimal({ id: "p1", earTag: "P1" }),
      makeAnimal({ id: "p2", earTag: "P2" }),
      makeAnimal({ id: "s1", earTag: "S1", active: false, inactiveReason: "sale", inactiveDate: "2026-05-02" }),
      makeAnimal({ id: "s0", earTag: "S0", active: false, inactiveReason: "sale", inactiveDate: "2025-09-30" }),
      makeAnimal({ id: "d1", earTag: "D1", active: false, inactiveReason: "death", inactiveDate: "2026-01-15" }),
      makeAnimal({ id: "l1", earTag: "L1", active: false, inactiveReason: "loss", inactiveDate: "2026-02-15" }),
      makeAnimal({ id: "o1", earTag: "O1", active: false, inactiveReason: "other", inactiveDate: "2026-03-15" }),
    ];
    const movements: Movement[] = [
      { id: "m1", type: "purchase", date: "2026-04-01", quantity: 2, origin: "Leilão", destination: "Garrotes", amountBrl: 9000 },
      { id: "m2", type: "purchase", date: "2025-08-01", quantity: 5, origin: "Leilão", destination: "Garrotes" },
      { id: "m3", type: "sale", date: "2026-05-02", quantity: 1, origin: "Garrotes", destination: "Frigorífico" },
    ];

    expect(herdFlow(animals, movements, TODAY)).toEqual({
      since: "2025-10-01",
      start: 5,
      births: 1,
      purchases: 2,
      sales: 1,
      deaths: 2,
      others: 1,
      end: 4,
    });
  });

  it("never starts below zero", () => {
    const movements: Movement[] = [
      { id: "m1", type: "purchase", date: "2026-04-01", quantity: 3, origin: "Leilão", destination: "Garrotes" },
    ];

    expect(herdFlow([makeAnimal()], movements, TODAY).start).toBe(0);
  });
});

describe("seasonReproduction", () => {
  it("counts the season's coberturas, a calving standing for a pregnancy", () => {
    const animals = [
      cow("A", "lot-cria", pregnant("2026-01-10")),
      cow("B", "lot-cria", {
        ...bred("2026-01-12"),
        diagnoses: [{ breedingId: "b-2026-01-12", result: "open", date: "2026-03-01" }],
      }),
      cow("C", "lot-cria", { ...bred("2025-11-20"), calvings: [{ date: "2026-08-30", calfEarTag: "BC" }] }),
      cow("D", "lot-cria", bred("2026-08-01")),
      cow("E", "lot-cria", pregnant("2025-06-01")),
      cow("F", "lot-cria", pregnant("2026-02-01"), { active: false, inactiveReason: "sale" }),
    ];

    expect(seasonReproduction(animals, TODAY)).toEqual({
      exposed: 4,
      diagnosed: 3,
      pregnant: 2,
      calved: 1,
      awaiting: 1,
      ratePct: (2 / 3) * 100,
    });
  });

  it("has no rate before the first diagnosis", () => {
    expect(seasonReproduction([cow("D", "lot-cria", bred("2026-08-01"))], TODAY)).toMatchObject({
      exposed: 1,
      diagnosed: 0,
      ratePct: null,
    });
  });
});

describe("calvingCalendar", () => {
  it("counts the calvings recorded and the ones still expected, two months back to three ahead", () => {
    const animals = [
      cow("A", "lot-cria", {
        breedings: [],
        diagnoses: [],
        calvings: [
          { date: "2026-07-05", calfEarTag: "x" },
          { date: "2026-09-02", calfEarTag: "y" },
          { date: "2026-03-01", calfEarTag: "z" },
        ],
      }),
      cow("B", "lot-cria", pregnant(bredFor("2026-09-30"))),
      cow("C", "lot-cria", pregnant(bredFor("2026-12-05"))),
      cow("D", "lot-cria", pregnant(bredFor("2026-09-10"))),
      cow("E", "lot-cria", pregnant(bredFor("2027-02-01"))),
    ];

    expect(calvingCalendar(animals, TODAY)).toEqual([
      { date: "2026-07-01", born: 1, due: 0 },
      { date: "2026-08-01", born: 0, due: 0 },
      { date: "2026-09-01", born: 1, due: 1 },
      { date: "2026-10-01", born: 0, due: 0 },
      { date: "2026-11-01", born: 0, due: 0 },
      { date: "2026-12-01", born: 0, due: 1 },
    ]);
  });
});

describe("nextCalvings", () => {
  it("lists the calvings still ahead, nearest first, up to the limit", () => {
    const animals = [
      cow("X30", "lot-cria", pregnant(bredFor("2026-10-02"))),
      cow("X25", "lot-cria", pregnant(bredFor("2026-09-25"))),
      cow("X22", "lot-cria", pregnant(bredFor(TODAY))),
      cow("X10", "lot-cria", pregnant(bredFor("2026-09-10"))),
      cow("X26", "lot-cria", pregnant(bredFor("2026-09-25")), { active: false }),
    ];

    expect(nextCalvings(animals, TODAY, 2).map((c) => [c.dam.earTag, c.date])).toEqual([
      ["X22", TODAY],
      ["X25", "2026-09-25"],
    ]);
  });
});

describe("adgChange", () => {
  it("is the last month's GMD minus the month before", () => {
    expect(
      adgChange([
        { month: "ago/26", averageAdg: 0.46 },
        { month: "set/26", averageAdg: 0.58 },
      ])
    ).toBeCloseTo(0.12);
  });

  it("is null without two months to compare", () => {
    expect(adgChange([{ month: "set/26", averageAdg: 0.58 }])).toBeNull();
    expect(
      adgChange([
        { month: "ago/26", averageAdg: 0.46 },
        { month: "set/26", averageAdg: null },
      ])
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run lib/store/__tests__/dashboard.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/store/dashboard"`.

- [ ] **Step 3: Write the module**

#### `lib/store/dashboard.ts`

```ts
/**
 * The Painel's derived views: what needs a hand, lote by lote; the herd's flow
 * over 12 months; the breeding season in numbers; and the calvings ahead.
 * Pure functions of the store's data and today's date.
 */
import type {
  Animal,
  Invernada,
  Lot,
  LotPlacement,
  Movement,
  Treatment,
  TreatmentType,
} from "@/lib/types";
import type { MonthlyAdgPoint } from "@/lib/domain/adg";
import { addDays, daysBetween, parseISODate, toISO } from "@/lib/domain/dates";
import { compareEarTags } from "@/lib/domain/earTags";
import {
  currentDiagnosis,
  expectedCalvingDate,
  hasCalvedSince,
  isDiagnosed,
  isPregnantNow,
} from "@/lib/domain/reproduction";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { awaitsDiagnosis } from "@/lib/domain/ultrasound";
import { activeAnimals, currentPlacementForLot } from "@/lib/store/selectors";

/** Days ahead the agenda looks for scheduled work. */
export const AGENDA_DAYS_AHEAD = 7;

/** Days after a cobertura when the ultrassom can tell. */
export const DIAGNOSIS_AFTER_DAYS = 30;

/** Days back the reproduction card looks for coberturas. */
export const SEASON_DAYS = 365;

/** How soon an item asks for a hand: 0 overdue, 1 today, 2 coming up. */
export type AgendaUrgency = 0 | 1 | 2;

/** The treatments of one date, type and name in one lote. */
export interface AgendaTreatment {
  kind: "treatment";
  key: string;
  urgency: AgendaUrgency;
  date: string;
  type: TreatmentType;
  name: string;
  treatmentIds: string[];
  earTags: string[];
}

/** The dams of one lote with a calving, or a diagnosis, to see to. */
export interface AgendaDams {
  kind: "overdueCalvings" | "upcomingCalvings" | "pendingDiagnosis";
  key: string;
  urgency: AgendaUrgency;
  /** The earliest date of the group: the expected calving, or the cobertura. */
  date: string;
  /** The latest of those dates. */
  until: string;
  earTags: string[];
}

export type AgendaItem = AgendaTreatment | AgendaDams;

/** One lote of the agenda with what it asks for, most urgent first. */
export interface AgendaLot {
  /** null gathers the animals whose lote no longer resolves ("Sem lote"). */
  lotId: string | null;
  name: string | null;
  /** The invernada the lote stands on today. */
  invernada: Invernada | null;
  /** Active animals in the lote today. */
  heads: number;
  items: AgendaItem[];
}

export interface AgendaInput {
  animals: Animal[];
  treatments: Treatment[];
  lots: Lot[];
  invernadas: Invernada[];
  lotPlacements: LotPlacement[];
}

const DAM_URGENCY: Record<AgendaDams["kind"], AgendaUrgency> = {
  overdueCalvings: 0,
  pendingDiagnosis: 1,
  upcomingCalvings: 2,
};

const compareDates = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const compareItems = (a: AgendaItem, b: AgendaItem): number =>
  a.urgency - b.urgency || compareDates(a.date, b.date);

/**
 * What needs a hand, lote by lote: the treatments not done that are overdue,
 * due today or due within {@link AGENDA_DAYS_AHEAD} days, grouped like the
 * Manejo activities; the calvings expected before today with no parto
 * recorded; the calvings expected in the next days; and the coberturas that
 * wait for the ultrassom {@link DIAGNOSIS_AFTER_DAYS} days on. Each item sits
 * in the lote its animals stand in today, so one activity spread over two
 * lotes shows in both. Inactive animals and ear tags that resolve to none drop
 * out. Lotes run by their most urgent item (the oldest date first at the same
 * urgency), then by name; "Sem lote" comes last.
 */
export function farmAgenda(input: AgendaInput, todayIso: string): AgendaLot[] {
  const active = activeAnimals(input.animals);
  const byEarTag = new Map(active.map((animal) => [animal.earTag, animal]));
  const lotById = new Map(input.lots.map((lot) => [lot.id, lot]));
  const invernadaById = new Map(input.invernadas.map((item) => [item.id, item]));
  const horizon = addDays(todayIso, AGENDA_DAYS_AHEAD);
  const lotKey = (lotId: string): string | null => (lotById.has(lotId) ? lotId : null);

  const heads = new Map<string | null, number>();
  for (const animal of active) {
    const key = lotKey(animal.lotId);
    heads.set(key, (heads.get(key) ?? 0) + 1);
  }

  const groups = new Map<string | null, AgendaLot>();
  const groupOf = (key: string | null): AgendaLot => {
    let group = groups.get(key);
    if (!group) {
      const placement = key === null ? null : currentPlacementForLot(key, input.lotPlacements);
      group = {
        lotId: key,
        name: key === null ? null : (lotById.get(key)?.name ?? null),
        invernada: placement ? (invernadaById.get(placement.invernadaId) ?? null) : null,
        heads: heads.get(key) ?? 0,
        items: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  const activities = new Map<string, AgendaTreatment>();
  for (const treatment of input.treatments) {
    if (deriveTreatmentStatus(treatment, todayIso) === "done" || treatment.date > horizon) continue;
    const animal = byEarTag.get(treatment.animalEarTag);
    if (!animal) continue;
    const group = groupOf(lotKey(animal.lotId));
    const key = `${group.lotId ?? ""}|${treatment.date}|${treatment.type}|${treatment.name}`;
    let activity = activities.get(key);
    if (!activity) {
      activity = {
        kind: "treatment",
        key,
        urgency: treatment.date < todayIso ? 0 : treatment.date === todayIso ? 1 : 2,
        date: treatment.date,
        type: treatment.type,
        name: treatment.name,
        treatmentIds: [],
        earTags: [],
      };
      activities.set(key, activity);
      group.items.push(activity);
    }
    activity.treatmentIds.push(treatment.id);
    activity.earTags.push(treatment.animalEarTag);
  }

  const dams = new Map<
    string,
    { kind: AgendaDams["kind"]; lot: string | null; dated: { earTag: string; date: string }[] }
  >();
  const addDam = (kind: AgendaDams["kind"], animal: Animal, date: string) => {
    const lot = lotKey(animal.lotId);
    const key = `${lot ?? ""}|${kind}`;
    const entry = dams.get(key) ?? { kind, lot, dated: [] };
    entry.dated.push({ earTag: animal.earTag, date });
    dams.set(key, entry);
  };
  for (const animal of active) {
    const record = animal.reproduction;
    const current = record ? currentDiagnosis(record) : null;
    if (!record || !current) continue;
    if (isPregnantNow(record)) {
      const expected = expectedCalvingDate(current.breeding.date);
      if (expected < todayIso) addDam("overdueCalvings", animal, expected);
      else if (expected <= horizon) addDam("upcomingCalvings", animal, expected);
    } else if (
      awaitsDiagnosis(record, current.breeding, true) &&
      daysBetween(current.breeding.date, todayIso) >= DIAGNOSIS_AFTER_DAYS
    ) {
      addDam("pendingDiagnosis", animal, current.breeding.date);
    }
  }
  for (const [key, entry] of dams) {
    const dated = entry.dated.sort(
      (a, b) => compareDates(a.date, b.date) || compareEarTags(a.earTag, b.earTag)
    );
    groupOf(entry.lot).items.push({
      kind: entry.kind,
      key,
      urgency: DAM_URGENCY[entry.kind],
      date: dated[0].date,
      until: dated[dated.length - 1].date,
      earTags: dated.map((item) => item.earTag),
    });
  }

  const agenda = [...groups.values()];
  for (const group of agenda) group.items.sort(compareItems);
  return agenda.sort((a, b) => {
    if (a.lotId === null) return 1;
    if (b.lotId === null) return -1;
    return (
      compareItems(a.items[0], b.items[0]) ||
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { numeric: true })
    );
  });
}

/** The herd's flow over the 12-month window, from its start to today. */
export interface HerdFlow {
  /** First day of the window: the first of the month 11 months before today's. */
  since: string;
  /** Today's herd with the window's movements undone, floored at 0. */
  start: number;
  births: number;
  purchases: number;
  sales: number;
  /** Mortes and perdas. */
  deaths: number;
  /** Animals that left for any other reason. */
  others: number;
  /** Active animals today. */
  end: number;
}

/**
 * How the herd got from the start of the window to today: calvings recorded,
 * head bought (purchase movements, the entradas included), and animals that
 * left by reason. The start is derived, so an animal registered by hand with no
 * entrada counts as already there.
 */
export function herdFlow(animals: Animal[], movements: Movement[], todayIso: string): HerdFlow {
  const today = parseISODate(todayIso);
  const since = toISO(new Date(today.getFullYear(), today.getMonth() - 11, 1));
  const inWindow = (iso: string | undefined): boolean =>
    iso !== undefined && iso >= since && iso <= todayIso;

  let births = 0;
  let sales = 0;
  let deaths = 0;
  let others = 0;
  for (const animal of animals) {
    births += (animal.reproduction?.calvings ?? []).filter((c) => inWindow(c.date)).length;
    if (animal.active || !inWindow(animal.inactiveDate)) continue;
    if (animal.inactiveReason === "sale") sales += 1;
    else if (animal.inactiveReason === "death" || animal.inactiveReason === "loss") deaths += 1;
    else others += 1;
  }
  const purchases = movements
    .filter((movement) => movement.type === "purchase" && inWindow(movement.date))
    .reduce((sum, movement) => sum + (movement.quantity ?? 0), 0);
  const end = activeAnimals(animals).length;
  const start = Math.max(0, end - births - purchases + sales + deaths + others);
  return { since, start, births, purchases, sales, deaths, others, end };
}

/** The breeding season in numbers, over the active females. */
export interface SeasonReproduction {
  /** Females whose latest cobertura falls in the last {@link SEASON_DAYS} days. */
  exposed: number;
  /** Of those, diagnosed pregnant or open, or already calved. */
  diagnosed: number;
  /** Diagnosed pregnant, or calved since the cobertura. */
  pregnant: number;
  /** Calved since the cobertura. */
  calved: number;
  /** Still waiting for the ultrassom. */
  awaiting: number;
  /** pregnant / diagnosed in %, or null before the first diagnosis. */
  ratePct: number | null;
}

/**
 * The season of the last {@link SEASON_DAYS} days: each active female's latest
 * cobertura in the window counts once. A calving recorded since the cobertura
 * proves the pregnancy, diagnosed or not.
 */
export function seasonReproduction(animals: Animal[], todayIso: string): SeasonReproduction {
  const since = addDays(todayIso, -SEASON_DAYS);
  const totals = { exposed: 0, diagnosed: 0, pregnant: 0, calved: 0, awaiting: 0 };
  for (const animal of activeAnimals(animals)) {
    const record = animal.reproduction;
    const current = record ? currentDiagnosis(record) : null;
    if (!record || !current) continue;
    const date = current.breeding.date;
    if (date < since || date > todayIso) continue;
    const calved = hasCalvedSince(record, date);
    totals.exposed += 1;
    if (calved) totals.calved += 1;
    if (calved || isDiagnosed(current.result)) totals.diagnosed += 1;
    if (calved || current.result === "pregnant") totals.pregnant += 1;
    if (awaitsDiagnosis(record, current.breeding, true)) totals.awaiting += 1;
  }
  return {
    ...totals,
    ratePct: totals.diagnosed === 0 ? null : (totals.pregnant / totals.diagnosed) * 100,
  };
}

/** One month of the parição chart. */
export interface CalvingMonth {
  /** First day of the month. */
  date: string;
  /** Calvings recorded in the month. */
  born: number;
  /** Calvings expected from today on in the month. */
  due: number;
}

/** A calving the herd still expects: an active dam pregnant now. */
export interface ExpectedCalving {
  dam: Animal;
  date: string;
}

function expectedCalvings(animals: Animal[]): ExpectedCalving[] {
  return activeAnimals(animals).flatMap((dam) => {
    const current = dam.reproduction ? currentDiagnosis(dam.reproduction) : null;
    return current && isPregnantNow(dam.reproduction)
      ? [{ dam, date: expectedCalvingDate(current.breeding.date) }]
      : [];
  });
}

/**
 * The parição month by month, `before` months back to `after` ahead of
 * today's: the calvings recorded, and the ones still expected from today on.
 * An expected date already past is the agenda's "sem registro", not a month's.
 */
export function calvingCalendar(
  animals: Animal[],
  todayIso: string,
  before = 2,
  after = 3
): CalvingMonth[] {
  const today = parseISODate(todayIso);
  const months: CalvingMonth[] = [];
  for (let offset = -before; offset <= after; offset += 1) {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    months.push({ date: toISO(first), born: 0, due: 0 });
  }
  const byMonth = new Map(months.map((month) => [month.date.slice(0, 7), month]));
  for (const animal of animals) {
    for (const calving of animal.reproduction?.calvings ?? []) {
      const month = byMonth.get(calving.date.slice(0, 7));
      if (month) month.born += 1;
    }
  }
  for (const { date } of expectedCalvings(animals)) {
    if (date < todayIso) continue;
    const month = byMonth.get(date.slice(0, 7));
    if (month) month.due += 1;
  }
  return months;
}

/** The next calvings from today on, nearest first. */
export function nextCalvings(animals: Animal[], todayIso: string, limit = 4): ExpectedCalving[] {
  return expectedCalvings(animals)
    .filter((calving) => calving.date >= todayIso)
    .sort((a, b) => compareDates(a.date, b.date) || compareEarTags(a.dam.earTag, b.dam.earTag))
    .slice(0, limit);
}

/** The last month's GMD minus the month before's, or null without both. */
export function adgChange(series: MonthlyAdgPoint[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].averageAdg;
  const previous = series[series.length - 2].averageAdg;
  return last === null || previous === null ? null : last - previous;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run lib/store/__tests__/dashboard.test.ts`
Expected: PASS, 13 tests.

### Task 2: Presentation helpers

**Files:**
- Modify: `lib/domain/dates.ts` (export `MONTH_ABBREV`)
- Modify: `components/dashboard/helpers.ts`
- Test: `components/dashboard/__tests__/helpers.test.ts`

**Interfaces:**
- Produces: `longDateLabel(iso): string`, `dayMonth(iso): string`, `treatmentDueText(date, type, todayIso): string`, `earTagList(earTags, max?): string`, `fromDayText(date, todayIso): string`, `invernadaLabel(invernada): string`; `MONTH_ABBREV` from `lib/domain/dates.ts`.

- [ ] **Step 1: Write the failing tests**

#### `components/dashboard/__tests__/helpers.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  dayMonth,
  earTagList,
  fromDayText,
  invernadaLabel,
  longDateLabel,
  treatmentDueText,
} from "@/components/dashboard/helpers";

const TODAY = "2026-09-22";

describe("longDateLabel", () => {
  it("reads the weekday, the day and the month", () => {
    expect(longDateLabel(TODAY)).toBe("Terça, 22 de setembro");
    expect(longDateLabel("2026-03-01")).toBe("Domingo, 1 de março");
  });
});

describe("dayMonth", () => {
  it("keeps the day and the month", () => {
    expect(dayMonth("2026-09-05")).toBe("05/09");
  });
});

describe("treatmentDueText", () => {
  it("counts the days late, an exame in the masculine", () => {
    expect(treatmentDueText("2026-09-16", "vaccine", TODAY)).toBe("Atrasada há 6 dias");
    expect(treatmentDueText("2026-09-21", "exam", TODAY)).toBe("Atrasado há 1 dia");
  });

  it("says today, or the date and the days ahead", () => {
    expect(treatmentDueText(TODAY, "deworming", TODAY)).toBe("Hoje");
    expect(treatmentDueText("2026-09-23", "vaccine", TODAY)).toBe("23/09 · em 1 dia");
    expect(treatmentDueText("2026-09-25", "vaccine", TODAY)).toBe("25/09 · em 3 dias");
  });
});

describe("earTagList", () => {
  it("joins a few ear tags as a sentence", () => {
    expect(earTagList([])).toBe("");
    expect(earTagList(["4471"])).toBe("4471");
    expect(earTagList(["4471", "3982"])).toBe("4471 e 3982");
    expect(earTagList(["4471", "3982", "5120"])).toBe("4471, 3982 e 5120");
  });

  it("counts the rest past the limit", () => {
    expect(earTagList(["1", "2", "3", "4", "5"])).toBe("1, 2, 3 e mais 2");
  });
});

describe("fromDayText", () => {
  it("says from when a run of calvings starts", () => {
    expect(fromDayText(TODAY, TODAY)).toBe("a partir de hoje");
    expect(fromDayText("2026-09-23", TODAY)).toBe("a partir de amanhã");
    expect(fromDayText("2026-09-26", TODAY)).toBe("a partir de 26/09");
  });
});

describe("invernadaLabel", () => {
  it("abbreviates the invernada with its code and name", () => {
    expect(invernadaLabel({ code: "01", name: "Baixada" })).toBe("Inv. 01 Baixada");
    expect(invernadaLabel({ code: "03" })).toBe("Inv. 03");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run components/dashboard/__tests__/helpers.test.ts`
Expected: FAIL, the new helpers are not exported.

- [ ] **Step 3: Export `MONTH_ABBREV` and add the helpers**

In `lib/domain/dates.ts`, change `const MONTH_ABBREV = [` to `export const MONTH_ABBREV = [` and give it the doc comment `/** Lowercase three-letter month names, January first: "jan", "fev", … */`.

Replace `components/dashboard/helpers.ts` with:

#### `components/dashboard/helpers.ts`

```ts
/**
 * LOCAL pure helpers of the Dashboard: composition/presentation specific to
 * this screen. No new business rule — the shared functions (isFootAndMouth,
 * scheduledTreatmentsInWindow, herdAverageAdg) live in lib/domain.
 */
import type { Category, Invernada, TreatmentType } from "@/lib/types";
import { CATEGORY_LABEL, pluralCategory } from "@/lib/domain/labels";
import { daysBetween, parseISODate } from "@/lib/domain/dates";

/** Category label with initial capital, e.g.: "Novilha". */
export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category];
}

/**
 * Mini-summary by category, sorted by descending count and omitting zeros,
 * e.g.: "13 vacas · 9 bois · 8 bezerros".
 */
export function summaryByCategory(count: Record<Category, number>): string {
  return (Object.entries(count) as [Category, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${n} ${pluralCategory(category, n)}`)
    .join(" · ");
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** The day as the Painel's header reads it, e.g.: "Terça, 22 de setembro". */
export function longDateLabel(iso: string): string {
  const date = parseISODate(iso);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

/** Day and month of an ISO date, e.g.: "05/09". */
export function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

const inDays = (days: number): string => (days === 1 ? "1 dia" : `${days} dias`);

/**
 * When a treatment batch is due, as its pill reads: "Atrasada há 6 dias",
 * "Hoje" or "25/09 · em 3 dias". An exame is masculine ("Atrasado").
 */
export function treatmentDueText(date: string, type: TreatmentType, todayIso: string): string {
  const late = daysBetween(date, todayIso);
  if (late > 0) return `${type === "exam" ? "Atrasado" : "Atrasada"} há ${inDays(late)}`;
  if (late === 0) return "Hoje";
  return `${dayMonth(date)} · em ${inDays(-late)}`;
}

/** Ear tags as a sentence, "4471, 3982 e 5120"; past `max`, "… e mais N". */
export function earTagList(earTags: string[], max = 3): string {
  if (earTags.length > max) {
    return `${earTags.slice(0, max).join(", ")} e mais ${earTags.length - max}`;
  }
  if (earTags.length <= 1) return earTags[0] ?? "";
  return `${earTags.slice(0, -1).join(", ")} e ${earTags[earTags.length - 1]}`;
}

/** Where a run of calvings starts: "a partir de hoje", "de amanhã" or "de 26/09". */
export function fromDayText(date: string, todayIso: string): string {
  const ahead = daysBetween(todayIso, date);
  if (ahead === 0) return "a partir de hoje";
  if (ahead === 1) return "a partir de amanhã";
  return `a partir de ${dayMonth(date)}`;
}

/** An invernada in few words, e.g.: "Inv. 01 Baixada". */
export function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return invernada.name ? `Inv. ${invernada.code} ${invernada.name}` : `Inv. ${invernada.code}`;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run components/dashboard/__tests__/helpers.test.ts`
Expected: PASS, 8 tests.

### Task 3: Shared pieces the cards draw with

**Files:**
- Modify: `components/ui/section-card.tsx` (optional `subtitle`)
- Modify: `components/lots/stocking-bar.tsx` (optional `compact`)
- Create: `components/charts/sparkline.tsx`
- Create: `components/dashboard/tone.tsx`

**Interfaces:**
- Produces: `SectionCard` prop `subtitle?: string`; `StockingBar` prop `compact?: boolean`; `Sparkline({ values, width?, height?, className? })`; `Tone`, `DOT`, `TonePill({ tone, children, className? })`, `ToneTile({ tone, icon })`.

- [ ] **Step 1: Add `subtitle` to `SectionCard`**

In `components/ui/section-card.tsx`, add to `SectionCardProps`:

```ts
  /** Line under the title: a count, a window, what the card covers. */
  subtitle?: string;
```

take `subtitle` in the parameters, and replace the header's heading line with:

```tsx
        <div className="min-w-0">
          <Heading className="font-heading text-base font-semibold text-ink">{title}</Heading>
          {subtitle ? <p className="text-xs text-ink-soft">{subtitle}</p> : null}
        </div>
```

- [ ] **Step 2: Add `compact` to `StockingBar`**

In `components/lots/stocking-bar.tsx`, add to `StockingBarProps`:

```ts
  /** Value and bar only: the row around it already says the faixa. */
  compact?: boolean;
```

take `compact = false` in the parameters and render the label only when not compact:

```tsx
        {compact ? null : (
          <span className="text-[11px] text-ink-soft">{STOCKING_LABEL[classification]}</span>
        )}
```

- [ ] **Step 3: Write the sparkline**

#### `components/charts/sparkline.tsx`

```tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Text color class the line takes (currentColor). */
  className?: string;
}

/** A small trend line with a soft area and the last point marked. No axes. */
export function Sparkline({ values, width = 150, height = 48, className }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const x = (index: number) => 2 + (index / (values.length - 1)) * (width - 4);
  const y = (value: number) => 3 + (1 - (value - low) / span) * (height - 6);
  const line = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(" ");
  const last = values.length - 1;
  const area = `${line} L ${x(last).toFixed(1)} ${height} L 2 ${height} Z`;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block shrink-0 overflow-visible text-brand", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: Write the tone pieces**

#### `components/dashboard/tone.tsx`

```tsx
/**
 * The Painel's urgency tones, the status colors the pills already use, with
 * the small pill and the icon tile the agenda draws in them.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "overdue" | "attention" | "scheduled" | "healthy" | "brand" | "neutral";

const SOFT: Record<Tone, string> = {
  overdue: "bg-overdue-soft text-overdue",
  attention: "bg-attention-soft text-attention",
  scheduled: "bg-scheduled-soft text-scheduled",
  healthy: "bg-healthy-soft text-healthy",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface text-ink-soft ring-1 ring-hairline ring-inset",
};

/** Solid dot of each tone. */
export const DOT: Record<Tone, string> = {
  overdue: "bg-overdue",
  attention: "bg-attention",
  scheduled: "bg-scheduled",
  healthy: "bg-healthy",
  brand: "bg-brand",
  neutral: "bg-ink-soft",
};

export function TonePill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        SOFT[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function ToneTile({ tone, icon: Icon }: { tone: Tone; icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", SOFT[tone])}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

### Task 4: Agenda da fazenda

**Files:**
- Create: `components/dashboard/FarmAgenda.tsx`

**Interfaces:**
- Consumes: `AgendaLot`, `AgendaItem`, `AgendaUrgency` (Task 1); `dayMonth`, `earTagList`, `fromDayText`, `invernadaLabel`, `summaryByCategory`, `treatmentDueText` (Task 2); `TonePill`, `ToneTile`, `DOT`, `Tone` (Task 3); `SectionCard` `subtitle` (Task 3).
- Produces: `FarmAgenda({ lots, animalsByEarTag, todayIso, onComplete? })`.

- [ ] **Step 1: Write the component**

#### `components/dashboard/FarmAgenda.tsx`

```tsx
"use client";

/**
 * "Agenda da fazenda": what needs a hand, lote by lote (farmAgenda). A
 * treatment batch closes with "Concluir", as on the Manejo activity panel —
 * a manejo session writes its own treatment and would leave the scheduled one
 * pending. Calvings and diagnoses open the screen where they are recorded.
 */
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  ChevronRight,
  CircleCheck,
  Dna,
  Fence,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import type { Animal } from "@/lib/types";
import type { AgendaItem, AgendaLot, AgendaUrgency } from "@/lib/store/dashboard";
import { countByCategory } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DOT, TonePill, ToneTile, type Tone } from "@/components/dashboard/tone";
import {
  dayMonth,
  earTagList,
  fromDayText,
  invernadaLabel,
  summaryByCategory,
  treatmentDueText,
} from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

const URGENCY_TONE: Record<AgendaUrgency, Tone> = { 0: "overdue", 1: "attention", 2: "scheduled" };

interface FarmAgendaProps {
  lots: AgendaLot[];
  /** Active animals by ear tag, to say who an item is about ("22 bezerros"). */
  animalsByEarTag: Map<string, Animal>;
  todayIso: string;
  /** Absent without Sanitário edit: the treatment rows get no "Concluir". */
  onComplete?: (treatmentIds: string[]) => void;
}

/** What a row says and, for a calving or a diagnosis, where it leads. */
interface RowView {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  pill: string;
  pillTone: Tone;
  link?: { href: string; text: string };
}

function herdOf(earTags: string[], byEarTag: Map<string, Animal>): string {
  const animals = earTags.flatMap((earTag) => byEarTag.get(earTag) ?? []);
  return summaryByCategory(countByCategory(animals));
}

function rowView(item: AgendaItem, byEarTag: Map<string, Animal>, todayIso: string): RowView {
  const count = item.earTags.length;
  const one = count === 1;
  switch (item.kind) {
    case "treatment":
      return {
        icon: Syringe,
        tone: URGENCY_TONE[item.urgency],
        title: item.name,
        meta: herdOf(item.earTags, byEarTag),
        pill: treatmentDueText(item.date, item.type, todayIso),
        pillTone: URGENCY_TONE[item.urgency],
      };
    case "overdueCalvings":
      return {
        icon: Baby,
        tone: "attention",
        title: one ? "Parto previsto sem registro" : `${count} partos previstos sem registro`,
        meta: `${one ? "Vaca" : "Vacas"} ${earTagList(item.earTags)} · ${one ? "previsto para" : "previstos até"} ${dayMonth(item.until)}`,
        pill: "Conferir",
        pillTone: "attention",
        link: { href: "/nascimentos", text: "Registrar parto" },
      };
    case "upcomingCalvings":
      return {
        icon: Baby,
        tone: "brand",
        title: one ? "Parto previsto" : `${count} partos previstos`,
        meta: `${one ? "Vaca" : "Vacas"} ${earTagList(item.earTags)} · ${item.date === item.until ? dayMonth(item.date) : `${dayMonth(item.date)} a ${dayMonth(item.until)}`}`,
        pill: fromDayText(item.date, todayIso),
        pillTone: "scheduled",
        link: { href: "/reproducao", text: "Ver matrizes" },
      };
    case "pendingDiagnosis":
      return {
        icon: Dna,
        tone: "scheduled",
        title: "Diagnóstico de gestação pendente",
        meta: `${one ? "Matriz" : "Matrizes"} ${earTagList(item.earTags)} · ${one ? "coberta" : "cobertas"} desde ${dayMonth(item.date)}`,
        pill: "Pendente",
        pillTone: "attention",
        link: { href: "/reproducao?tab=ultrassom", text: "Abrir ultrassom" },
      };
  }
}

function AgendaRow({
  item,
  view,
  lotName,
  onComplete,
}: {
  item: AgendaItem;
  view: RowView;
  lotName: string;
  onComplete?: (treatmentIds: string[]) => void;
}) {
  const body = (
    <>
      <ToneTile tone={view.tone} icon={view.icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{view.title}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{view.meta}</span>
        <TonePill tone={view.pillTone} className="mt-1 sm:hidden">
          {view.pill}
        </TonePill>
      </span>
      <TonePill tone={view.pillTone} className="hidden sm:inline-flex">
        {view.pill}
      </TonePill>
    </>
  );

  if (view.link) {
    return (
      <li>
        <Link
          href={view.link.href}
          className="flex min-h-[60px] items-center gap-3 py-2.5 transition-colors hover:bg-surface"
        >
          {body}
          <span className="hidden w-32 shrink-0 justify-end text-sm font-medium text-brand sm:flex">
            {view.link.text}
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-soft sm:hidden" aria-hidden />
        </Link>
      </li>
    );
  }

  return (
    <li className="flex min-h-[60px] items-center gap-3 py-2.5">
      {body}
      <span className="flex shrink-0 justify-end sm:w-32">
        {onComplete && item.kind === "treatment" ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-brand md:min-h-0"
            onClick={() => onComplete(item.treatmentIds)}
            aria-label={`Concluir ${item.name} em ${lotName}`}
          >
            Concluir
          </Button>
        ) : null}
      </span>
    </li>
  );
}

function LotGroup({
  group,
  first,
  animalsByEarTag,
  todayIso,
  onComplete,
}: {
  group: AgendaLot;
  first: boolean;
} & Omit<FarmAgendaProps, "lots">) {
  const name = group.name ?? "Sem lote";
  const place = [
    group.invernada ? invernadaLabel(group.invernada) : null,
    `${formatNumber(group.heads)} cab`,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <section aria-label={name} className={cn(!first && "border-t border-hairline")}>
      <header className="flex items-center gap-2 pt-3.5 pb-1.5">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", DOT[URGENCY_TONE[group.items[0].urgency]])}
        />
        <Fence className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
        <h3 className="font-sans text-sm font-semibold whitespace-nowrap text-ink">{name}</h3>
        <span className="min-w-0 truncate text-xs text-ink-soft">{place}</span>
        {group.lotId ? (
          <Link
            href={`/lots/${group.lotId}`}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            Ver lote
          </Link>
        ) : null}
      </header>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {group.items.map((item) => (
          <AgendaRow
            key={item.key}
            item={item}
            view={rowView(item, animalsByEarTag, todayIso)}
            lotName={name}
            onComplete={onComplete}
          />
        ))}
      </ul>
    </section>
  );
}

export function FarmAgenda({ lots, animalsByEarTag, todayIso, onComplete }: FarmAgendaProps) {
  const items = lots.flatMap((group) => group.items);
  const overdue = items.filter((item) => item.urgency === 0).length;
  const subtitle =
    items.length === 0
      ? undefined
      : `${items.length} ${items.length === 1 ? "pendência" : "pendências"} em ${lots.length} ${lots.length === 1 ? "lote" : "lotes"}${overdue > 0 ? ` · ${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}` : ""}`;

  return (
    <SectionCard
      title="Agenda da fazenda"
      subtitle={subtitle}
      action={
        <Link
          href="/calendar"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver calendário
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nada pendente"
          description="Vacinas atrasadas, partos previstos e diagnósticos de gestação aparecem aqui, lote a lote."
        />
      ) : (
        <div className="-mt-4 -mb-1.5">
          {lots.map((group, index) => (
            <LotGroup
              key={group.lotId ?? "sem-lote"}
              group={group}
              first={index === 0}
              animalsByEarTag={animalsByEarTag}
              todayIso={todayIso}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

### Task 5: Right-hand stack — open sessions, Rebanho, Evolução

**Files:**
- Create: `components/dashboard/OpenSessionsStack.tsx`
- Create: `components/dashboard/HerdCard.tsx`
- Create: `components/dashboard/HerdFlowCard.tsx`

**Interfaces:**
- Consumes: `HerdFlow` (Task 1); `SectionCard` `subtitle` (Task 3).
- Produces: `OpenSessionsStack({ className? })`, `HerdCard(props: HerdCardProps)`, `HerdFlowCard({ flow })`.

- [ ] **Step 1: Open sessions**

#### `components/dashboard/OpenSessionsStack.tsx`

```tsx
"use client";

/**
 * The manejos still open, one card each, a tap away from the chute screen.
 * Renders nothing when every session is closed.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { ManejoProgressBar } from "@/components/manejo/progress-bar";
import { manejoDetailHref, sessionProgress } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

export function OpenSessionsStack({ className }: { className?: string }) {
  const sessions = useHerdStore((s) => s.manejoSessions);
  const open = sessions.filter((session) => session.status === "open");
  if (open.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {open.map((session) => (
        <Link
          key={session.id}
          href={manejoDetailHref(session.id)}
          className="block rounded-lg border border-brand bg-panel p-4 transition-colors hover:bg-surface"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full bg-brand ring-4 ring-brand-soft" />
              <span className="text-[11px] font-semibold tracking-wider text-brand uppercase">
                Manejo em andamento
              </span>
            </span>
            <span className="font-mono text-xs text-ink-soft">{formatDate(session.date)}</span>
          </span>
          <span className="mt-2 mb-2.5 block truncate text-sm font-medium text-ink">
            {session.name}
          </span>
          <ManejoProgressBar progress={sessionProgress(session)} />
          <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-brand">
            Continuar no brete
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rebanho**

#### `components/dashboard/HerdCard.tsx`

```tsx
/**
 * "Rebanho": the active head count and how it changed in 12 months, the herd
 * by category as one bar, and three figures — GMD, lotação and peso vivo.
 */
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Category, StockingRateClass } from "@/lib/types";
import { pluralCategory } from "@/lib/domain/labels";
import { formatKg, formatNumber } from "@/lib/domain/format";
import { STOCKING_LABEL } from "@/components/lots/stocking-bar";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const SWATCH: Record<Category, string> = {
  cow: "bg-brand",
  steer: "bg-scheduled",
  calf: "bg-healthy-soft ring-1 ring-healthy ring-inset",
  heifer: "bg-attention",
  bull: "bg-fmd",
};

const STOCKING_INK: Record<StockingRateClass, string> = {
  light: "text-scheduled",
  good: "text-healthy",
  high: "text-overdue",
};

interface HerdCardProps {
  headCount: number;
  /** Heads gained, or lost, over the flow's 12 months. */
  change12m: number;
  byCategory: Record<Category, number>;
  /** Herd GMD (kg/dia), or null without two weighings. */
  averageAdg: number | null;
  /** Last month's GMD minus the month before's. */
  adgChange: number | null;
  stockingRate: number;
  stockingClass: StockingRateClass;
  totalKg: number;
  totalArrobas: number;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({
  label,
  value,
  unit,
  sub,
  subClass = "text-ink-soft",
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="min-w-0 border-l border-hairline px-3 py-3 first:border-l-0 sm:px-4">
      <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-base font-medium whitespace-nowrap text-ink sm:text-lg">
        {value}
        <span className="text-xs text-ink-soft"> {unit}</span>
      </dd>
      <dd className={cn("mt-0.5 truncate text-[11px]", subClass)}>{sub}</dd>
    </div>
  );
}

export function HerdCard({
  headCount,
  change12m,
  byCategory,
  averageAdg,
  adgChange,
  stockingRate,
  stockingClass,
  totalKg,
  totalArrobas,
}: HerdCardProps) {
  const categories = (Object.entries(byCategory) as [Category, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <SectionCard
      title="Rebanho"
      action={
        <Link
          href="/herd"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver rebanho
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-3xl font-medium text-ink">
          {formatNumber(headCount)}
          <span className="text-sm text-ink-soft"> {headCount === 1 ? "cabeça" : "cabeças"}</span>
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            change12m > 0 ? "text-healthy" : change12m < 0 ? "text-overdue" : "text-ink-soft"
          )}
        >
          {change12m > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : null}
          {change12m < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
          {change12m === 0
            ? "estável em 12 meses"
            : `${change12m > 0 ? "+" : "−"}${formatNumber(Math.abs(change12m))} em 12 meses`}
        </span>
      </div>

      {categories.length > 0 ? (
        <>
          <div aria-hidden className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {categories.map(([category, count]) => (
              <span key={category} className={SWATCH[category]} style={{ flexGrow: count }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {categories.map(([category, count]) => (
              <li key={category} className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", SWATCH[category])} />
                {capitalized(pluralCategory(category, 2))}
                <span className="ml-auto font-mono font-medium text-ink">{formatNumber(count)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <dl className="-mx-4 mt-4 -mb-4 grid grid-cols-3 border-t border-hairline">
        <Stat
          label="GMD"
          value={averageAdg === null ? "—" : formatNumber(averageAdg, 2)}
          unit="kg/dia"
          sub={
            adgChange === null
              ? "últimos 120 dias"
              : `${adgChange >= 0 ? "↑" : "↓"} ${formatNumber(Math.abs(adgChange), 2)} no mês`
          }
          subClass={
            adgChange === null ? undefined : adgChange >= 0 ? "text-healthy" : "text-overdue"
          }
        />
        <Stat
          label="Lotação"
          value={formatNumber(stockingRate, 2)}
          unit="UA/ha"
          sub={STOCKING_LABEL[stockingClass]}
          subClass={STOCKING_INK[stockingClass]}
        />
        <Stat
          label="Peso vivo"
          value={formatNumber(totalArrobas)}
          unit="@"
          sub={formatKg(totalKg)}
        />
      </dl>
    </SectionCard>
  );
}
```

- [ ] **Step 3: Evolução do rebanho**

#### `components/dashboard/HerdFlowCard.tsx`

```tsx
/**
 * "Evolução do rebanho": the herd at the start of the 12 months, what came in
 * and what left, and the herd today — a floating-bar waterfall (herdFlow).
 */
import type { HerdFlow } from "@/lib/store/dashboard";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

type StepKind = "start" | "in" | "out" | "end";

const BAR: Record<StepKind, string> = {
  start: "bg-ink-soft",
  in: "bg-healthy",
  out: "bg-fmd",
  end: "bg-brand",
};

const VALUE: Record<StepKind, string> = {
  start: "text-ink",
  in: "text-healthy",
  out: "text-fmd",
  end: "text-ink",
};

export function HerdFlowCard({ flow }: { flow: HerdFlow }) {
  const steps: { label: string; value: number; kind: StepKind }[] = [
    { label: `Em ${formatDate(flow.since)}`, value: flow.start, kind: "start" },
    { label: "Nascimentos", value: flow.births, kind: "in" },
    { label: "Compras", value: flow.purchases, kind: "in" },
    { label: "Vendas", value: flow.sales, kind: "out" },
    { label: "Mortes", value: flow.deaths, kind: "out" },
    ...(flow.others > 0 ? [{ label: "Outras saídas", value: flow.others, kind: "out" as const }] : []),
    { label: "Rebanho hoje", value: flow.end, kind: "end" },
  ];
  const peak = Math.max(1, flow.start + flow.births + flow.purchases, flow.end);

  let level = 0;
  const rows = steps.map((step) => {
    let from = 0;
    let to = step.value;
    if (step.kind === "start") level = step.value;
    if (step.kind === "in") {
      from = level;
      to = level + step.value;
      level = to;
    }
    if (step.kind === "out") {
      to = level;
      from = Math.max(0, level - step.value);
      level = from;
    }
    return { ...step, from, to };
  });

  return (
    <SectionCard title="Evolução do rebanho" subtitle="últimos 12 meses">
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const strong = row.kind === "start" || row.kind === "end";
          return (
            <li
              key={row.label}
              className={cn(
                "grid min-h-7 grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-x-3",
                row.kind === "end" && "mt-1 border-t border-hairline pt-2"
              )}
            >
              <span className={cn("text-[13px]", strong ? "font-medium text-ink" : "text-ink-soft")}>
                {row.label}
              </span>
              <span aria-hidden className="relative h-3">
                <span
                  className={cn("absolute inset-y-0 rounded-[3px]", BAR[row.kind])}
                  style={{
                    left: `${(row.from / peak) * 100}%`,
                    width: `${((row.to - row.from) / peak) * 100}%`,
                  }}
                />
              </span>
              <span className={cn("text-right font-mono text-[13px] font-medium", VALUE[row.kind])}>
                {row.value === 0 ? "" : row.kind === "in" ? "+" : row.kind === "out" ? "−" : ""}
                {formatNumber(row.value)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-soft">
        Nascimentos, compras, vendas e mortes lançados desde {formatDate(flow.since)}. Animais
        cadastrados sem entrada contam desde o início.
      </p>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

### Task 6: Reprodução and Lotação

**Files:**
- Create: `components/dashboard/CalvingBars.tsx`
- Create: `components/dashboard/ReproductionCard.tsx`
- Create: `components/dashboard/PaddocksCard.tsx`

**Interfaces:**
- Consumes: `SeasonReproduction`, `CalvingMonth`, `ExpectedCalving` (Task 1); `dayMonth`, `invernadaLabel` (Task 2); `MONTH_ABBREV` (Task 2); `StockingBar` `compact`, `TonePill` (Task 3); `InvernadaWithSummary` (`lib/store/selectors.ts`).
- Produces: `CalvingBars({ months })`, `ReproductionCard({ season, months, next, todayIso })`, `PaddocksCard({ rows, herdRate })`.

- [ ] **Step 1: Calving bars**

#### `components/dashboard/CalvingBars.tsx`

```tsx
/**
 * Parição by month: the calvings recorded as solid brand bars, the ones still
 * expected stacked on top as a dashed outline, the month's total above.
 */
import type { CalvingMonth } from "@/lib/store/dashboard";
import { MONTH_ABBREV, parseISODate } from "@/lib/domain/dates";

const WIDTH = 320;
const HEIGHT = 150;
const TOP = 22;
const BOTTOM = 24;
const SIDE = 8;

export function CalvingBars({ months }: { months: CalvingMonth[] }) {
  const peak = Math.max(1, ...months.map((month) => month.born + month.due));
  const inner = HEIGHT - TOP - BOTTOM;
  const base = TOP + inner;
  const slot = (WIDTH - SIDE * 2) / months.length;
  const barWidth = Math.min(40, slot * 0.55);
  const size = (value: number) => (value / peak) * inner;
  const label = (month: CalvingMonth) => MONTH_ABBREV[parseISODate(month.date).getMonth()];
  const summary = months
    .map((month) => `${label(month)}: ${month.born} nascidos, ${month.due} previstos`)
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`Partos por mês — ${summary}`}
      className="block"
    >
      <line x1={SIDE} x2={WIDTH - SIDE} y1={base} y2={base} strokeWidth={1} className="stroke-hairline" />
      {months.map((month, index) => {
        const center = SIDE + slot * index + slot / 2;
        const x = center - barWidth / 2;
        const bornHeight = size(month.born);
        const dueHeight = size(month.due);
        const total = month.born + month.due;
        return (
          <g key={month.date}>
            {month.born > 0 ? (
              <rect
                x={x}
                y={base - bornHeight}
                width={barWidth}
                height={bornHeight}
                rx={3}
                className="fill-brand"
              />
            ) : null}
            {month.due > 0 ? (
              <rect
                x={x + 0.5}
                y={base - bornHeight - dueHeight + 0.5}
                width={barWidth - 1}
                height={Math.max(dueHeight - 1, 0)}
                rx={3}
                strokeDasharray="3 2"
                className="fill-brand-soft stroke-brand"
              />
            ) : null}
            {total > 0 ? (
              <text
                x={center}
                y={base - bornHeight - dueHeight - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                className="fill-ink font-mono"
              >
                {total}
              </text>
            ) : null}
            <text x={center} y={HEIGHT - 8} textAnchor="middle" fontSize={10} className="fill-ink-soft">
              {label(month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Reprodução**

#### `components/dashboard/ReproductionCard.tsx`

```tsx
/**
 * "Reprodução": the season's pregnancy rate and funnel, the parição month by
 * month, and the next calvings, each one opening its dam's ficha.
 */
import Link from "next/link";
import { ArrowRight, Dna } from "lucide-react";
import type { CalvingMonth, ExpectedCalving, SeasonReproduction } from "@/lib/store/dashboard";
import { daysToCalving, daysToCalvingText } from "@/lib/domain/reproduction";
import { formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { CalvingBars } from "@/components/dashboard/CalvingBars";
import { dayMonth } from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

interface ReproductionCardProps {
  season: SeasonReproduction;
  months: CalvingMonth[];
  next: ExpectedCalving[];
  todayIso: string;
}

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

export function ReproductionCard({ season, months, next, todayIso }: ReproductionCardProps) {
  const empty = season.exposed === 0 && months.every((month) => month.born + month.due === 0);
  const funnel = [
    { label: "Expostas", value: season.exposed, bar: "bg-ink-soft" },
    { label: "Diagnosticadas", value: season.diagnosed, bar: "bg-scheduled" },
    { label: "Prenhes", value: season.pregnant, bar: "bg-brand" },
    { label: "Paridas", value: season.calved, bar: "bg-healthy" },
  ];

  return (
    <SectionCard
      title="Reprodução"
      subtitle="coberturas dos últimos 12 meses"
      action={
        <Link
          href="/reproducao"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Abrir Reprodução
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {empty ? (
        <EmptyState
          icon={Dna}
          title="Sem coberturas no último ano"
          description="Registre coberturas e inseminações em Reprodução para acompanhar a prenhez e a parição."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div className="space-y-4">
              <div>
                <p className={LABEL}>Taxa de prenhez</p>
                <p className="mt-1 font-mono text-3xl font-medium text-healthy">
                  {season.ratePct === null ? "—" : `${formatNumber(season.ratePct)}%`}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {formatNumber(season.pregnant)} prenhes de {formatNumber(season.diagnosed)}{" "}
                  diagnosticadas
                  {season.awaiting > 0 ? ` · ${formatNumber(season.awaiting)} sem DG` : ""}
                </p>
              </div>
              <ul className="space-y-2">
                {funnel.map((step) => (
                  <li
                    key={step.label}
                    className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-2.5"
                  >
                    <span className="text-[13px] text-ink-soft">{step.label}</span>
                    <span
                      aria-hidden
                      className="h-2 overflow-hidden rounded-full border border-hairline bg-surface"
                    >
                      <span
                        className={cn("block h-full", step.bar)}
                        style={{
                          width: `${season.exposed === 0 ? 0 : (step.value / season.exposed) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-[13px] font-medium text-ink">
                      {formatNumber(step.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={LABEL}>Parição</p>
                <span className="flex gap-3 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-brand" />
                    Nascidos
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px] border border-dashed border-brand bg-brand-soft"
                    />
                    Previstos
                  </span>
                </span>
              </div>
              <div className="mt-1.5">
                <CalvingBars months={months} />
              </div>
            </div>
          </div>

          {next.length > 0 ? (
            <div className="-mx-4 mt-4 -mb-4 border-t border-hairline px-4 py-3">
              <p className={cn(LABEL, "mb-2")}>Próximos partos</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {next.map((calving) => (
                  <li key={calving.dam.id}>
                    <Link
                      href={`/herd/${calving.dam.id}`}
                      className="block rounded-md border border-hairline bg-surface px-2.5 py-2 transition-colors hover:border-brand"
                    >
                      <span className="block font-mono text-sm font-medium text-ink">
                        {calving.dam.earTag}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {dayMonth(calving.date)} ·{" "}
                        {daysToCalvingText(daysToCalving(calving.date, todayIso))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 3: Lotação por invernada**

#### `components/dashboard/PaddocksCard.tsx`

```tsx
/**
 * "Lotação por invernada": each pasture with its lotes, head count and
 * pressure, the most loaded first; the empty ones last, "Em descanso".
 */
import Link from "next/link";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { InvernadaWithSummary } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { STOCKING_LABEL, StockingBar } from "@/components/lots/stocking-bar";
import { TonePill } from "@/components/dashboard/tone";

interface PaddocksCardProps {
  rows: InvernadaWithSummary[];
  /** The herd's UA/ha over every invernada. */
  herdRate: number;
}

export function PaddocksCard({ rows, herdRate }: PaddocksCardProps) {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.headCount > 0) - Number(a.headCount > 0) ||
      b.auPerHa - a.auPerHa ||
      a.invernada.code.localeCompare(b.invernada.code, "pt-BR", { numeric: true })
  );
  const hectares = rows.reduce((sum, row) => sum + row.invernada.hectares, 0);

  return (
    <SectionCard
      title="Lotação por invernada"
      subtitle={
        rows.length === 0
          ? undefined
          : `${rows.length} ${rows.length === 1 ? "invernada" : "invernadas"} · ${formatNumber(hectares)} ha · ${formatNumber(herdRate, 2)} UA/ha no rebanho`
      }
      action={
        <Link
          href="/lots"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lotes
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="Nenhuma invernada"
          description="Cadastre as invernadas no Mapa para acompanhar a lotação de cada pasto."
        />
      ) : (
        <ul className="-my-2.5 divide-y divide-hairline">
          {sorted.map(({ invernada, lots, headCount, auPerHa, classification }) => (
            <li key={invernada.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {invernada.name ? (
                    <>
                      <span className="font-mono font-normal text-ink-soft">{invernada.code}</span>{" "}
                      {invernada.name}
                    </>
                  ) : (
                    `Invernada ${invernada.code}`
                  )}
                </p>
                <p className="mt-px truncate text-xs text-ink-soft">
                  {headCount > 0
                    ? `${lots.map((lot) => lot.name).join(", ")} · ${formatNumber(headCount)} cab · ${STOCKING_LABEL[classification]}`
                    : lots.length > 0
                      ? `${lots.map((lot) => lot.name).join(", ")} · sem animais`
                      : `Sem lote · ${formatNumber(invernada.hectares)} ha`}
                </p>
              </div>
              {headCount > 0 ? (
                <StockingBar
                  auPerHa={auPerHa}
                  classification={classification}
                  compact
                  className="w-28 shrink-0 sm:w-32"
                />
              ) : (
                <TonePill tone="neutral">Em descanso</TonePill>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

### Task 7: GMD, Mercado and Financeiro

**Files:**
- Modify: `components/dashboard/AdgChart.tsx`
- Create: `components/dashboard/MarketCard.tsx`
- Create: `components/dashboard/FinanceCard.tsx`

**Interfaces:**
- Consumes: `Sparkline`, `TonePill`, `SectionCard` `subtitle` (Task 3); `ArrobaQuoteView` (`lib/data/useArrobaQuote.ts`); `PeriodResult` (`lib/domain/finance.ts`); `CostBreakdownSlice`, `MonthlyRevenueCost` (`lib/domain/economics.ts`); `BarChart` (`components/charts/bar-chart.tsx`).
- Produces: `AdgChart({ series, change? })`, `MarketCard({ quote, totalArrobas })`, `FinanceCard({ result, breakdown, months })`.

- [ ] **Step 1: GMD with its monthly change**

Replace `components/dashboard/AdgChart.tsx` with:

#### `components/dashboard/AdgChart.tsx`

```tsx
"use client";

import { TrendingUp } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart } from "@/components/charts/line-chart";
import { TonePill } from "@/components/dashboard/tone";
import { formatNumber } from "@/lib/domain/format";
import type { MonthlyAdgPoint } from "@/lib/domain/adg";

interface AdgChartProps {
  series: MonthlyAdgPoint[];
  /** Last month's GMD minus the month before's, shown as a pill. */
  change?: number | null;
}

/** Monthly evolution of the herd's average ADG (kg/day) over the last 6 months. */
export function AdgChart({ series, change = null }: AdgChartProps) {
  const points = series.flatMap((p) =>
    p.averageAdg === null ? [] : [{ label: p.month, value: p.averageAdg }]
  );

  return (
    <SectionCard
      title="GMD do rebanho"
      subtitle="kg/dia · últimos 6 meses"
      action={
        change === null ? undefined : (
          <TonePill tone={change >= 0 ? "healthy" : "overdue"}>
            {change >= 0 ? "↑" : "↓"} {formatNumber(Math.abs(change), 2)} no mês
          </TonePill>
        )
      }
    >
      {points.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Sem dados de GMD"
          description="Registre ao menos duas pesagens por animal para acompanhar o ganho médio diário."
        />
      ) : (
        <>
          <LineChart
            points={points}
            area
            highlightLast
            formatValue={(value) => formatNumber(value, 2)}
          />
          <p className="mt-2 text-xs text-ink-soft">
            Média mensal do ganho diário (kg/dia) dos animais ativos.
          </p>
        </>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 2: Mercado**

#### `components/dashboard/MarketCard.tsx`

```tsx
"use client";

/**
 * "Mercado": the arroba of the boi gordo with its monthly change and its last
 * 12 months, and what the herd is worth at that price. "—" when the quote is
 * unavailable: the app never shows a made-up price.
 */
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import type { ArrobaQuoteView } from "@/lib/data/useArrobaQuote";
import { herdValue } from "@/lib/domain/finance";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { Sparkline } from "@/components/charts/sparkline";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

export function MarketCard({ quote, totalArrobas }: { quote: ArrobaQuoteView; totalArrobas: number }) {
  const price = quote.price;
  const value = price === null ? null : herdValue(totalArrobas, price);
  const rising = (quote.changePct ?? 0) >= 0;

  return (
    <SectionCard title="Mercado" subtitle="arroba e valor do rebanho">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>Arroba do boi gordo</p>
          <p className="mt-1 font-mono text-2xl font-medium whitespace-nowrap text-ink">
            {price === null ? (
              "—"
            ) : (
              <>
                {formatNumber(price, 2)}
                <span className="text-sm text-ink-soft"> R$/@</span>
              </>
            )}
          </p>
          {quote.changePct !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                rising ? "text-healthy" : "text-overdue"
              )}
            >
              {rising ? (
                <ArrowUpRight className="size-3.5" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden />
              )}
              {formatNumber(Math.abs(quote.changePct), 1)}% no mês
            </span>
          ) : null}
        </div>
        <Sparkline values={quote.series.slice(-12).map((point) => point.value)} />
      </div>

      <div className="-mx-4 mt-4 border-t border-hairline px-4 pt-3">
        <p className={LABEL}>Valor do rebanho</p>
        <p className="mt-1 font-mono text-2xl font-medium text-ink">
          {value === null ? "—" : formatCompactCurrency(value)}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {value === null || price === null
            ? "cotação indisponível"
            : `${formatNumber(totalArrobas)} @ × R$ ${formatNumber(price, 2)} · ${formatCurrency(value)}`}
        </p>
      </div>

      {quote.sourceLabel ? (
        <p className="mt-3 flex gap-1.5 text-[11px] text-ink-soft">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {quote.sourceLabel}
        </p>
      ) : null}
    </SectionCard>
  );
}
```

- [ ] **Step 3: Financeiro do período**

#### `components/dashboard/FinanceCard.tsx`

```tsx
"use client";

/**
 * "Financeiro do período": receita, custo, resultado and margem of the picked
 * window, where the cost went by category, and receita × custo month by month.
 */
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import type { CostBreakdownSlice, MonthlyRevenueCost } from "@/lib/domain/economics";
import type { PeriodResult } from "@/lib/domain/finance";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { formatCompactCurrency } from "@/components/finance/format";
import { BarChart, type BarGroup } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** Slice colors in breakdown order, as the old Despesas card painted them. */
const SLICE_COLORS = ["bg-brand", "bg-scheduled", "bg-attention", "bg-fmd", "bg-healthy", "bg-ink-soft"];

interface FinanceCardProps {
  result: PeriodResult;
  breakdown: CostBreakdownSlice[];
  months: MonthlyRevenueCost[];
}

export function FinanceCard({ result, breakdown, months }: FinanceCardProps) {
  const empty = result.totalRevenue === 0 && result.totalCost === 0;
  const positive = result.result >= 0;
  const groups: BarGroup[] = months.map((month) => ({
    label: month.month,
    bars: [
      { key: "Receita", value: month.revenue, colorClass: "text-brand" },
      { key: "Custo", value: month.cost, colorClass: "text-fmd" },
    ],
  }));

  return (
    <SectionCard
      title="Financeiro do período"
      subtitle="receita e custo por mês"
      action={
        <Link
          href="/finance"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver financeiro
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {empty ? (
        <EmptyState
          icon={Coins}
          title="Sem lançamentos no período"
          description="Ajuste o período para incluir meses com receita ou custo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-8">
          <div>
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-soft">Receita</dt>
                <dd className="font-mono text-lg font-medium text-ink">
                  {formatCurrency(result.totalRevenue)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-soft">Custo</dt>
                <dd className="font-mono text-lg font-medium text-ink">
                  {formatCurrency(result.totalCost)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-hairline pt-3">
                <dt className="text-sm font-medium text-ink">Resultado</dt>
                <dd
                  className={cn(
                    "font-mono text-2xl font-semibold",
                    positive ? "text-healthy" : "text-overdue"
                  )}
                >
                  {formatCurrency(result.result)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-ink-soft">Margem líquida</dt>
                <dd
                  className={cn(
                    "font-mono text-sm font-medium",
                    positive ? "text-healthy" : "text-overdue"
                  )}
                >
                  {formatNumber(result.netMarginPct, 1)}%
                </dd>
              </div>
            </dl>

            {breakdown.length > 0 ? (
              <div className="mt-4 border-t border-hairline pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                    Para onde foi o custo
                  </p>
                  <span className="font-mono text-xs text-ink-soft">
                    {formatCompactCurrency(result.totalCost)}
                  </span>
                </div>
                <div aria-hidden className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                  {breakdown.map((slice, index) => (
                    <span
                      key={slice.category}
                      className={SLICE_COLORS[index % SLICE_COLORS.length]}
                      style={{ flexGrow: slice.amountBrl }}
                    />
                  ))}
                </div>
                <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {breakdown.map((slice, index) => (
                    <li key={slice.category} className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 rounded-full", SLICE_COLORS[index % SLICE_COLORS.length])}
                      />
                      {EXPENSE_CATEGORY_LABEL[slice.category]}
                      <span className="ml-auto font-mono text-ink">{formatNumber(slice.pct)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <BarChart groups={groups} height={240} legend formatValue={formatCompactCurrency} />
        </div>
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

### Task 8: The page, and the old cards out

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Delete: `components/dashboard/DashboardKpisRow.tsx`, `components/dashboard/AnimalsNeedingAttention.tsx`, `components/dashboard/UpcomingTreatments.tsx`, `components/dashboard/PeriodResultCard.tsx`, `components/dashboard/ExpensesCard.tsx`

**Interfaces:**
- Consumes: every card above; `farmAgenda`, `herdFlow`, `seasonReproduction`, `calvingCalendar`, `nextCalvings`, `adgChange` (Task 1); `longDateLabel` (Task 2).

- [ ] **Step 1: Rewrite the page**

#### `app/(app)/dashboard/page.tsx`

```tsx
"use client";

/**
 * Painel: what needs a hand today, lote by lote, then the farm's standing
 * questions — the herd and how it changed, the breeding season, the pastures,
 * the gain, the arroba and the period's money. Money needs Financeiro.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { useCan } from "@/lib/store/usePermissions";
import {
  activeAnimals,
  countByCategory,
  herdStockingRateAuPerHa,
  invernadasWithSummary,
} from "@/lib/store/selectors";
import {
  adgChange,
  calvingCalendar,
  farmAgenda,
  herdFlow,
  nextCalvings,
  seasonReproduction,
} from "@/lib/store/dashboard";
import { todayISO } from "@/lib/domain/dates";
import { herdAverageAdg, monthlyAdg } from "@/lib/domain/adg";
import { kgToArroba, totalWeightKg } from "@/lib/domain/weights";
import { classifyStockingRate } from "@/lib/domain/stocking";
import { filterMonthlyByPeriod, periodResult, type Period } from "@/lib/domain/finance";
import { costBreakdownBetween, monthlyRevenueCost } from "@/lib/domain/economics";
import { useArrobaQuote } from "@/lib/data/useArrobaQuote";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { PendingInviteBanner } from "@/components/invites/PendingInviteBanner";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";
import { FirstStepsBanner } from "@/components/dashboard/FirstStepsBanner";
import { FarmAgenda } from "@/components/dashboard/FarmAgenda";
import { OpenSessionsStack } from "@/components/dashboard/OpenSessionsStack";
import { HerdCard } from "@/components/dashboard/HerdCard";
import { HerdFlowCard } from "@/components/dashboard/HerdFlowCard";
import { ReproductionCard } from "@/components/dashboard/ReproductionCard";
import { PaddocksCard } from "@/components/dashboard/PaddocksCard";
import { AdgChart } from "@/components/dashboard/AdgChart";
import { MarketCard } from "@/components/dashboard/MarketCard";
import { FinanceCard } from "@/components/dashboard/FinanceCard";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { defaultPeriod } from "@/components/dashboard/period";
import { longDateLabel } from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

const ADG_CHART_MONTHS = 6;

/**
 * Thin section divider with an uppercase heading, as in the herd screens. On
 * the phone its action (the period picker) takes a line of its own.
 */
function SectionDivider({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
      <span className="font-heading text-sm font-semibold tracking-wide text-ink-soft uppercase">
        {title}
      </span>
      <span className="h-px min-w-8 flex-1 bg-hairline" aria-hidden />
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const treatments = useHerdStore((s) => s.treatments);
  const movements = useHerdStore((s) => s.movements);
  const expenses = useHerdStore((s) => s.expenses);
  const farm = useHerdStore((s) => s.farm);
  const completeTreatments = useHerdStore((s) => s.completeTreatments);
  // Without Financeiro the server sends no values: the money cards go instead of showing zeros.
  const seeMoney = useCan("finance", "view");
  const canCompleteTreatments = useCan("sanitary", "edit");
  const canStartManejo = useCan("manejo", "edit");
  const { addToast } = useToast();
  const today = todayISO();

  /** Closes one lote's batch; a failure already told the user through the store. */
  async function onComplete(treatmentIds: string[]) {
    try {
      await completeTreatments(treatmentIds);
      addToast({
        messageType: "success",
        text:
          treatmentIds.length === 1
            ? "Tratamento concluído"
            : `${treatmentIds.length} tratamentos concluídos`,
      });
    } catch {
      // apiFail has shown the error toast.
    }
  }

  const [period, setPeriod] = useState<Period>(() => defaultPeriod(today));
  const quote = useArrobaQuote();

  const active = useMemo(() => activeAnimals(animals), [animals]);
  const animalsByEarTag = useMemo(
    () => new Map(active.map((animal) => [animal.earTag, animal])),
    [active]
  );
  const agenda = useMemo(
    () => farmAgenda({ animals, treatments, lots, invernadas, lotPlacements }, today),
    [animals, treatments, lots, invernadas, lotPlacements, today]
  );

  const flow = useMemo(() => herdFlow(animals, movements, today), [animals, movements, today]);
  const byCategory = useMemo(() => countByCategory(active), [active]);
  const adgSeries = useMemo(() => monthlyAdg(active, ADG_CHART_MONTHS), [active]);
  const averageAdg = useMemo(() => herdAverageAdg(active, today), [active, today]);
  const stockingRate = useMemo(
    () => herdStockingRateAuPerHa(animals, invernadas),
    [animals, invernadas]
  );
  const totalKg = useMemo(() => totalWeightKg(active), [active]);

  const season = useMemo(() => seasonReproduction(animals, today), [animals, today]);
  const calvingMonths = useMemo(() => calvingCalendar(animals, today), [animals, today]);
  const upcomingCalvings = useMemo(() => nextCalvings(animals, today), [animals, today]);
  const paddocks = useMemo(
    () => invernadasWithSummary(invernadas, lots, lotPlacements, animals),
    [invernadas, lots, lotPlacements, animals]
  );

  const monthsInPeriod = useMemo(
    () =>
      filterMonthlyByPeriod(monthlyRevenueCost(movements, treatments, expenses, 12, today), period),
    [movements, treatments, expenses, today, period]
  );
  const financials = useMemo(
    () =>
      periodResult(
        monthsInPeriod.map((month) => month.revenue),
        monthsInPeriod.map((month) => month.cost)
      ),
    [monthsInPeriod]
  );
  const costSlices = useMemo(
    () => costBreakdownBetween(expenses, treatments, period.start, period.end),
    [expenses, treatments, period]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Painel"
        subtitle={[farm.name, farm.municipality, longDateLabel(today)]
          .filter((part) => part.trim() !== "")
          .join(" · ")}
        actions={
          <>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/calendar">
                <CalendarDays aria-hidden />
                Calendário sanitário
              </Link>
            </Button>
            {canStartManejo ? <RegisterManejoDialog /> : null}
          </>
        }
      />

      <PendingInviteBanner />

      <FirstStepsBanner />

      {/* Below lg the right stack dissolves into the column (display: contents),
          so the open sessions can come before the agenda on the phone. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <FarmAgenda
            lots={agenda}
            animalsByEarTag={animalsByEarTag}
            todayIso={today}
            onComplete={canCompleteTreatments ? onComplete : undefined}
          />
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-4">
          <OpenSessionsStack className="order-first lg:order-none" />
          <HerdCard
            headCount={active.length}
            change12m={flow.end - flow.start}
            byCategory={byCategory}
            averageAdg={averageAdg}
            adgChange={adgChange(adgSeries)}
            stockingRate={stockingRate}
            stockingClass={classifyStockingRate(stockingRate)}
            totalKg={totalKg}
            totalArrobas={kgToArroba(totalKg)}
          />
          <HerdFlowCard flow={flow} />
        </div>
      </div>

      <SectionDivider title="Reprodução e pastos" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ReproductionCard
            season={season}
            months={calvingMonths}
            next={upcomingCalvings}
            todayIso={today}
          />
        </div>
        <div className="lg:col-span-5">
          <PaddocksCard rows={paddocks} herdRate={stockingRate} />
        </div>
      </div>

      <SectionDivider title={seeMoney ? "Desempenho e mercado" : "Desempenho"} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className={cn(seeMoney ? "lg:col-span-7" : "lg:col-span-12")}>
          <AdgChart series={adgSeries} change={adgChange(adgSeries)} />
        </div>
        {seeMoney ? (
          <div className="lg:col-span-5">
            <MarketCard quote={quote} totalArrobas={kgToArroba(totalKg)} />
          </div>
        ) : null}
      </div>

      {seeMoney ? (
        <>
          <SectionDivider
            title="Financeiro"
            action={<PeriodPicker value={period} onChange={setPeriod} />}
          />
          <FinanceCard result={financials} breakdown={costSlices} months={monthsInPeriod} />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old cards**

```bash
git rm components/dashboard/DashboardKpisRow.tsx components/dashboard/AnimalsNeedingAttention.tsx components/dashboard/UpcomingTreatments.tsx components/dashboard/PeriodResultCard.tsx components/dashboard/ExpensesCard.tsx
```

`categoryLabel` in `helpers.ts` was only used by `AnimalsNeedingAttention`; remove it too if `grep -rn "categoryLabel" components app lib` finds no other caller.

- [ ] **Step 2b: Say one animal in Portuguese**

The agenda's "1 boi" goes through `pluralCategory`, which returned the enum key for one animal ("1 steer", also on the lote ficha). In `lib/domain/__tests__/labels.test.ts` expect `pluralCategory("steer", 1)` to be `"boi"`, `("cow", 1)` `"vaca"` and `("calf", 1)` `"bezerro"`, see it fail, then in `lib/domain/labels.ts` return `CATEGORY_LABEL[category].toLowerCase()` for `n === 1`.

- [ ] **Step 3: Full check**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run`
Expected: no type errors, no lint errors, every test passing.

- [ ] **Step 4: Smoke test**

With a throwaway database (see the smoke-test notes): migrate, sign up a `teste.painel@meubov.local` user, seed, `pnpm build`, `next start -p 3011`. Open `/dashboard` at 1440×900 and 390×844. Check that the agenda lists the seed's overdue treatments by lote, that "Concluir" removes a row with a toast, that every card renders, and that no console errors appear. Then make the user a member without Financeiro and check that Mercado and Financeiro are gone.

- [ ] **Step 5: Commit (when the user picks it)**

```bash
git add -A
git commit -m "feat(dashboard): open the Painel on the agenda of each lote"
```
